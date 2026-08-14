/**
 * Calendar sync (amendment 2026-08-15) — the ARES working-day calendar is
 * canonical (JP, 2026-08-15). The worker derives non-working weekdays from
 * ARES and persists them; both processes load the stored set into
 * lib/calendar's active holiday list at boot and on an interval, so forecast
 * workday math follows the same calendar ARES plans capacity with.
 *
 * `calendar_days` is system-reference data like `migrations` — deliberately
 * not project-scoped (the PH work calendar is global). Documented exception
 * to invariant 1, same class as the migrations ledger.
 */

import type { Connection } from 'mongoose';
import { HOLIDAYS, setHolidays } from '../../lib/calendar.ts';
import type { AresClient } from './ares.ts';

export const CALENDAR_DOC_ID = 'ph-workweek';
export const CALENDAR_COLLECTION = 'calendar_days';

export interface CalendarDoc {
  _id: string;
  /** Non-working weekdays (the holiday set) inside the synced window. */
  dates: string[];
  window: { from: string; to: string };
  source: string;
  synced_at: Date;
  /** Monday keys where the per-week cross-check disagreed with the derivation. */
  mismatches: string[];
}

const DAY = 86_400_000;

const utc = (s: string): number => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
};
const isoOf = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** All Mon–Fri date strings in [from, to], via UTC string math (TZ-proof). */
export function weekdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = utc(from); t <= utc(to); t += DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(isoOf(t));
  }
  return out;
}

/** Non-working weekdays = weekdays absent from ARES's working-day columns. */
export function deriveNonWorkingDays(workingCols: string[], from: string, to: string): string[] {
  const have = new Set(workingCols);
  return weekdaysBetween(from, to).filter((d) => !have.has(d));
}

/**
 * Cross-check the derivation against /api/portfolio/capacity's per-week
 * workingDays counts. Only weeks fully inside [from, to] are comparable
 * (edge weeks are truncated by the window). Returns mismatching Monday keys.
 */
export function crossCheck(
  derived: string[],
  perWeek: Array<{ monday: string; workingDays: number }>,
  from: string,
  to: string,
): string[] {
  const derivedSet = new Set(derived);
  const bad: string[] = [];
  for (const w of perWeek) {
    if (!w.monday) continue;
    const mon = utc(w.monday);
    const fri = mon + 4 * DAY;
    if (mon < utc(from) || fri > utc(to)) continue;
    let holidays = 0;
    for (let t = mon; t <= fri; t += DAY) if (derivedSet.has(isoOf(t))) holidays++;
    if (5 - holidays !== w.workingDays) bad.push(w.monday);
  }
  return bad;
}

/** Sync window around today (YYYY-MM-DD): 8 weeks back, 40 weeks forward. */
export function activeWindow(today: string): { from: string; to: string } {
  return { from: isoOf(utc(today) - 56 * DAY), to: isoOf(utc(today) + 280 * DAY) };
}

/** ARES dates win inside the synced window; the static seed survives outside it. */
export function mergeWithSeed(doc: Pick<CalendarDoc, 'dates' | 'window'>): string[] {
  const outside = HOLIDAYS.filter((d) => d < doc.window.from || d > doc.window.to);
  return [...new Set([...doc.dates, ...outside])].sort();
}

/** Load the stored calendar into lib/calendar's active set. False = seed kept. */
export async function loadCalendar(conn: Connection): Promise<boolean> {
  const db = conn.db;
  if (!db) return false;
  const doc = (await db
    .collection(CALENDAR_COLLECTION)
    .findOne({ _id: CALENDAR_DOC_ID as never })) as CalendarDoc | null;
  if (!doc || !Array.isArray(doc.dates) || !doc.window) return false;
  setHolidays(mergeWithSeed(doc));
  return true;
}

/**
 * Worker-side: fetch the ARES working-day columns, derive the holiday set,
 * cross-check, persist, and activate. Returns null (previous calendar kept,
 * nothing written) when the daily surface is unavailable.
 */
export async function syncCalendarFromAres(
  conn: Connection,
  ares: Pick<AresClient, 'workingDayColumns' | 'workingDaysPerWeek'>,
  today: string,
): Promise<{ dates: string[]; mismatches: string[] } | null> {
  const db = conn.db;
  if (!db) return null;
  const { from, to } = activeWindow(today);
  const cols = await ares.workingDayColumns(from, to);
  if (!cols) return null;
  const dates = deriveNonWorkingDays(cols, from, to);
  const perWeek = await ares.workingDaysPerWeek(from, to);
  const mismatches = perWeek ? crossCheck(dates, perWeek, from, to) : [];
  const doc: CalendarDoc = {
    _id: CALENDAR_DOC_ID,
    dates,
    window: { from, to },
    source: 'ares:/api/workload?mode=daily',
    synced_at: new Date(),
    mismatches,
  };
  await db
    .collection(CALENDAR_COLLECTION)
    .replaceOne({ _id: CALENDAR_DOC_ID as never }, doc, { upsert: true });
  setHolidays(mergeWithSeed(doc));
  return { dates, mismatches };
}
