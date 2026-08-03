/**
 * lib/calendar.ts — ported VERBATIM from the validated prototype bundle
 * (invariant 5; port source per the approved STATE.md deviation).
 * Golden parity tests against test/golden/original.mjs prove the port.
 *
 * DO NOT refactor, rename, or "clean up" the logic. Two quirks are
 * load-bearing and preserved deliberately:
 *  - toFriday(): Mon–Thu roll forward to that week's Friday; Fri/Sat/Sun
 *    roll to the NEXT MONDAY (8-a arithmetic in the source).
 *  - isHoliday() compares a LOCAL calendar date against toISOString() (UTC).
 *    In any timezone ahead of UTC (Asia/Manila included) the comparison
 *    shifts a day, so PH holidays effectively do not exclude. This matches
 *    the validated artifact byte-for-byte; flagged to JP at the T026 gate.
 */

/** PH holidays 2026 — as shipped in the prototype. */
export const HOLIDAYS: string[] = [
  '2026-01-01',
  '2026-04-02',
  '2026-04-03',
  '2026-05-01',
  '2026-06-12',
  '2026-08-31',
  '2026-11-30',
  '2026-12-25',
  '2026-12-30',
];

/** ISO date of a Date via UTC (source: Qh). */
export const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** Parse a YYYY-MM-DD string to a LOCAL-midnight Date (source: V). */
export const parseDate = (s: string): Date => new Date(s + 'T00:00:00');

/** Holiday check (source: np) — carries the documented UTC/local quirk. */
export const isHoliday = (d: Date): boolean => HOLIDAYS.includes(iso(d));

/** WORKDAY(start, n) — add n working days, skipping weekends and holidays (source: on). */
export function workday(start: Date | string, days: number): Date {
  const a = new Date(start);
  let l = Math.round(days || 0);
  while (l > 0) {
    a.setDate(a.getDate() + 1);
    const o = a.getDay();
    if (o !== 0 && o !== 6 && !isHoliday(a)) l--;
  }
  return a;
}

/** Friday of the week for Mon–Thu; NEXT MONDAY for Fri/Sat/Sun (source: sp). */
export function toFriday(d: Date | string): Date {
  const t = new Date(d);
  const a = t.getDay() === 0 ? 7 : t.getDay();
  t.setDate(t.getDate() + (a < 5 ? 5 - a : 8 - a));
  return t;
}

/** WEEKNUM of a date (source: Zh). */
export function weekNum(d: Date): number {
  const t = new Date(d.getFullYear(), 0, 1);
  return Math.floor(((d.getTime() - t.getTime()) / 864e5 + t.getDay()) / 7) + 1;
}

/** Monday 00:00 of the week containing d (source: dp). */
export function toMonday(d: Date | string): Date {
  const t = new Date(d);
  const a = t.getDay() === 0 ? 7 : t.getDay();
  t.setDate(t.getDate() - (a - 1));
  t.setHours(0, 0, 0, 0);
  return t;
}

export interface Week {
  key: string;
  monday: Date;
  friday: Date;
  month?: string;
  label?: string;
  wk?: string;
  sub: string;
}

/** n consecutive weeks starting at the Monday of `from` (source: tg). */
export function buildWeeks(from: string, count: number): Week[] {
  const a: Week[] = [];
  const l = toMonday(parseDate(from));
  for (let o = 0; o < count; o++) {
    const r = new Date(l);
    r.setDate(r.getDate() + o * 7);
    const s = new Date(r);
    s.setDate(s.getDate() + 4);
    a.push({
      key: r.toISOString().slice(0, 10),
      monday: r,
      friday: s,
      month: r.toLocaleDateString('en-US', { month: 'long' }),
      wk: `wk${Math.floor(r.getDate() / 7) + 1}`,
      sub: `${r.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${s.getDate()}`,
    });
  }
  return a;
}

/** Weeks whose Friday falls inside the given month (source: ag). */
export function monthWeeks(year: number, month: number): Week[] {
  const a = new Date(year, month, 1);
  const l = new Date(year, month + 1, 0);
  const o: Week[] = [];
  let r = toMonday(a);
  while (r <= l) {
    const s = new Date(r);
    s.setDate(s.getDate() + 4);
    if (s < a) {
      r = new Date(r);
      r.setDate(r.getDate() + 7);
      continue;
    }
    o.push({
      key: r.toISOString().slice(0, 10),
      monday: new Date(r),
      friday: s,
      label: `Week ${o.length + 1}`,
      sub: `${r.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${s.toLocaleDateString('en-US', { day: 'numeric' })}`,
    });
    r = new Date(r);
    r.setDate(r.getDate() + 7);
  }
  return o;
}

/** Is the date within the Monday..Sunday span of the week (source: Hu). */
export function dateInWeek(d: Date, week: Week): boolean {
  const a = new Date(week.monday);
  a.setDate(a.getDate() + 6);
  return d >= week.monday && d <= a;
}

/** Working days strictly between two dates (source: rn). */
export function workdaysBetween(from: Date | null, to: Date | null): number {
  if (!from || !to || to <= from) return 0;
  let a = 0;
  const l = new Date(from);
  while (l < to) {
    l.setDate(l.getDate() + 1);
    const o = l.getDay();
    if (o !== 0 && o !== 6 && !isHoliday(l)) a++;
  }
  return a;
}
