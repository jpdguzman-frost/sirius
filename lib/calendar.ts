/**
 * lib/calendar.ts — ported VERBATIM from the validated prototype bundle
 * (invariant 5; port source per the approved STATE.md deviation).
 * Golden parity tests against test/golden/original.mjs prove the port.
 *
 * DO NOT refactor, rename, or "clean up" the logic. One quirk is
 * load-bearing and preserved deliberately:
 *  - toFriday(): Mon–Thu roll forward to that week's Friday; Fri/Sat/Sun
 *    roll to the NEXT MONDAY (8-a arithmetic in the source).
 *
 * AMENDED 2026-08-15 (approved by JP; supersedes the T026 keep-as-is call):
 *  - isHoliday() previously compared a LOCAL calendar date against
 *    toISOString() (UTC), so east of UTC (Asia/Manila — production) PH
 *    holidays never excluded. It now compares the LOCAL calendar date, and
 *    the active holiday set is injectable via setHolidays() — the ARES
 *    working-day calendar is canonical (JP 2026-08-15); HOLIDAYS below is
 *    only the offline seed.
 *  - buildWeeks()/monthWeeks() previously derived `key` via toISOString(),
 *    yielding the SUNDAY before east of UTC. Keys are now the local Monday.
 *  - Everything else is byte-identical to the port.
 */

/** PH holidays 2026 — as shipped in the prototype. SEED ONLY (see amendment). */
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

/** ISO date of a Date via the LOCAL calendar (amendment 2026-08-15). */
export const localIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Parse a YYYY-MM-DD string to a LOCAL-midnight Date (source: V). */
export const parseDate = (s: string): Date => new Date(s + 'T00:00:00');

let ACTIVE_HOLIDAYS: ReadonlySet<string> = new Set(HOLIDAYS);

/** Replace the active holiday calendar (ARES-canonical feed; amendment 2026-08-15). */
export function setHolidays(dates: string[]): void {
  ACTIVE_HOLIDAYS = new Set(dates);
}

/** The active holiday dates (seed until the ARES calendar loads). */
export function getHolidays(): string[] {
  return [...ACTIVE_HOLIDAYS].sort();
}

/** Holiday check (source: np) — local calendar date since the 2026-08-15 amendment. */
export const isHoliday = (d: Date): boolean => ACTIVE_HOLIDAYS.has(localIso(d));

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
      key: localIso(r),
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
      key: localIso(r),
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
