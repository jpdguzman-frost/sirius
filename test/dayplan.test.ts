/**
 * lib/dayplan.ts — day capacity by largest remainder (FR-12.4; AC-22).
 * Written FIRST (working style: tests precede lib/ implementations).
 *
 * The rule: a week's capacity spreads across its non-holiday weekdays so the
 * columns sum EXACTLY to the weekly capacity — per-day rounding drifts it
 * (22 over 4 days rounds to 24, not 22). Holidays take zero.
 *
 * These tests must pass in UTC and Asia/Manila alike: dayplan does date math
 * on date-only strings via UTC, deliberately avoiding calendar.ts's
 * isHoliday() quirk (which is preserved verbatim for the port — invariant 5).
 */

import { describe, expect, it } from 'vitest';
import { dayCapacities, isHolidayDate, weekDays } from '../lib/dayplan.ts';
import { HOLIDAYS } from '../lib/calendar.ts';

const caps = (mondayKey: string, capacity: number, holidays?: string[]) =>
  dayCapacities(mondayKey, capacity, holidays).map((d) => d.capacity);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('weekDays', () => {
  it('returns Mon–Fri date strings from a Monday key, timezone-proof', () => {
    expect(weekDays('2026-08-31')).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
  });

  it('crosses month and year boundaries', () => {
    expect(weekDays('2026-12-28')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
  });
});

describe('isHolidayDate', () => {
  it('is a plain string check against the PH holiday list', () => {
    expect(isHolidayDate('2026-08-31')).toBe(true); // National Heroes Day, a Monday
    expect(isHolidayDate('2026-09-01')).toBe(false);
  });

  it('matches the calendar-true day in EVERY timezone — no UTC/local shift', () => {
    // calendar.ts's isHoliday() shifts a day east of UTC (preserved quirk);
    // dayplan must not inherit it.
    expect(HOLIDAYS).toContain('2026-08-31');
    expect(isHolidayDate('2026-08-30')).toBe(false);
  });
});

describe('dayCapacities — largest remainder (FR-12.4)', () => {
  it('AC-22: a 4-day week still sums exactly — 22 over 4 open days is 6,6,5,5, not 24', () => {
    // Week of 2026-08-31: Monday is a holiday, Tue–Fri open.
    const got = dayCapacities('2026-08-31', 22);
    expect(got[0]).toMatchObject({ day: '2026-08-31', holiday: true, capacity: 0 });
    expect(got.slice(1).map((d) => d.capacity)).toEqual([6, 6, 5, 5]);
    expect(sum(got.map((d) => d.capacity))).toBe(22);
  });

  it('a clean week spreads with earliest-day tie-breaks and an exact sum', () => {
    // 22 / 5 = 4.4 → floors 4, two leftover units to the earliest days
    expect(caps('2026-09-07', 22)).toEqual([5, 5, 4, 4, 4]);
    expect(sum(caps('2026-09-07', 22))).toBe(22);
  });

  it('exact division needs no remainder handling', () => {
    expect(caps('2026-09-07', 20)).toEqual([4, 4, 4, 4, 4]);
  });

  it('two holidays (Apr 2–3, Thu+Fri) redistribute their share to the open days', () => {
    const got = dayCapacities('2026-03-30', 22);
    expect(got.map((d) => d.holiday)).toEqual([false, false, false, true, true]);
    expect(got.map((d) => d.capacity)).toEqual([8, 7, 7, 0, 0]);
    expect(sum(got.map((d) => d.capacity))).toBe(22);
  });

  it('capacity smaller than the open-day count still sums exactly', () => {
    expect(caps('2026-09-07', 1)).toEqual([1, 0, 0, 0, 0]);
    expect(caps('2026-09-07', 3)).toEqual([1, 1, 1, 0, 0]);
  });

  it('an all-holiday week takes zero everywhere and stays well-formed', () => {
    const week = weekDays('2026-09-07');
    const got = dayCapacities('2026-09-07', 22, week);
    expect(got.every((d) => d.holiday && d.capacity === 0)).toBe(true);
  });

  it('zero or negative capacity yields all-zero columns', () => {
    expect(caps('2026-09-07', 0)).toEqual([0, 0, 0, 0, 0]);
    expect(caps('2026-09-07', -5)).toEqual([0, 0, 0, 0, 0]);
  });

  it('reference-week extremes from BR-6a sum exactly at 1, 5, 20, 120 and 367', () => {
    for (const cap of [1, 5, 20, 120, 367]) {
      expect(sum(caps('2026-09-07', cap))).toBe(cap);
      expect(sum(caps('2026-08-31', cap))).toBe(cap); // 4 open days
    }
  });
});
