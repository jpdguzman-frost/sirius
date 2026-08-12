/**
 * lib/dayplan.ts — day capacity for Deadlines daily plotting (FR-12.4).
 * NEW module, added 2026-08-12 (phase 12) — NOT part of the verbatim port.
 * calendar.ts and planner.ts stay untouched (invariant 5).
 *
 * Deliberate deviation from calendar.ts: isHoliday() there compares a
 * local-midnight Date against toISOString() and shifts a day east of UTC —
 * a quirk preserved for port fidelity. Day capacity needs the calendar-true
 * answer in every timezone, so this module works on date-only STRINGS and
 * never converts through a local Date.
 */

import { HOLIDAYS } from './calendar.ts';

/** Calendar-true holiday check on the date-only string. */
export const isHolidayDate = (day: string, holidays: string[] = HOLIDAYS): boolean =>
  holidays.includes(day);

/** Mon–Fri date strings of the week whose Monday key is given (UTC math — timezone-proof). */
export function weekDays(mondayKey: string): string[] {
  const [y, m, d] = mondayKey.split('-').map(Number);
  const base = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  return Array.from({ length: 5 }, (_, i) => new Date(base + i * 864e5).toISOString().slice(0, 10));
}

export interface DayCapacity {
  day: string;
  capacity: number;
  holiday: boolean;
}

/**
 * Distribute a week's capacity across its non-holiday weekdays by LARGEST
 * REMAINDER, so the columns sum exactly to the weekly capacity — per-day
 * rounding drifts it (22 over 4 days rounds to 24, not 22). Holidays take
 * zero and their share redistributes; an all-holiday week is all zero.
 * Ties in the fractional part break toward the earlier day.
 */
export function dayCapacities(
  mondayKey: string,
  weeklyCapacity: number,
  holidays: string[] = HOLIDAYS,
): DayCapacity[] {
  const days = weekDays(mondayKey);
  const out: DayCapacity[] = days.map((day) => ({
    day,
    capacity: 0,
    holiday: isHolidayDate(day, holidays),
  }));
  const open = out.filter((d) => !d.holiday);
  const total = Math.max(0, Math.round(weeklyCapacity));
  if (open.length === 0 || total === 0) return out;

  const floor = Math.floor(total / open.length);
  let leftover = total - floor * open.length;
  for (const d of open) d.capacity = floor;
  // Equal shares here, so "largest remainder" reduces to earliest-day order;
  // kept explicit so a future uneven-share rule inherits the exact-sum proof.
  for (const d of open) {
    if (leftover === 0) break;
    d.capacity += 1;
    leftover -= 1;
  }
  return out;
}
