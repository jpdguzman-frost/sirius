/**
 * T018 — lib/calendar.ts: unit expectations + golden parity vs the verbatim
 * oracle extracted from the validated bundle (invariant 5, invariant 11).
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error verbatim minified extract, untyped by design
import * as O from './golden/original.mjs';
import {
  HOLIDAYS,
  isHoliday,
  monthWeeks,
  parseDate,
  toFriday,
  toMonday,
  weekNum,
  workday,
  workdaysBetween,
} from '../lib/calendar.ts';

const DATES = [
  '2026-01-01',
  '2026-03-31',
  '2026-04-01',
  '2026-04-30',
  '2026-06-11',
  '2026-08-03',
  '2026-08-07',
  '2026-08-08',
  '2026-08-09',
  '2026-08-28',
  '2026-08-31',
  '2026-12-24',
  '2026-12-29',
];
const SPANS = [0, 0.5, 1, 1.2, 2.59, 4.8, 5.3, 9.87, 12.5, 19.64, 22];

describe('golden parity with the validated bundle', () => {
  it('workday() matches the oracle across the matrix', () => {
    for (const d of DATES) {
      for (const n of SPANS) {
        const ours = workday(parseDate(d), n);
        const theirs = O.on(O.V(d), n);
        expect(ours.getTime(), `workday(${d}, ${n})`).toBe(theirs.getTime());
      }
    }
  });

  it('toFriday() matches the oracle for every weekday', () => {
    for (const d of DATES) {
      expect(toFriday(parseDate(d)).getTime(), d).toBe(O.sp(O.V(d)).getTime());
    }
  });

  it('weekNum(), toMonday(), workdaysBetween() match the oracle', () => {
    for (const d of DATES) {
      expect(weekNum(parseDate(d))).toBe(O.Zh(O.V(d)));
      expect(toMonday(parseDate(d)).getTime()).toBe(O.dp(O.V(d)).getTime());
    }
    for (let i = 0; i < DATES.length - 1; i++) {
      const a = parseDate(DATES[i]!);
      const b = parseDate(DATES[i + 1]!);
      expect(workdaysBetween(a, b)).toBe(O.rn(O.V(DATES[i]!), O.V(DATES[i + 1]!)));
    }
  });

  it('holiday list is byte-identical to the shipped one', () => {
    expect(HOLIDAYS).toEqual(O.Kh);
  });
});

describe('documented quirks preserved verbatim', () => {
  it('toFriday rolls Mon–Thu to Friday but Fri/Sat/Sun to the NEXT MONDAY', () => {
    expect(toFriday(parseDate('2026-08-03')).getDay()).toBe(5); // Mon → Fri
    expect(toFriday(parseDate('2026-08-06')).getDay()).toBe(5); // Thu → Fri
    expect(toFriday(parseDate('2026-08-07')).getDay()).toBe(1); // Fri → next Mon
    expect(toFriday(parseDate('2026-08-08')).getDay()).toBe(1); // Sat → next Mon
    expect(toFriday(parseDate('2026-08-09')).getDay()).toBe(1); // Sun → next Mon
  });

  it('isHoliday compares local dates against UTC ISO — TZ-dependent, as shipped', () => {
    const holiday = parseDate('2026-06-12');
    const offsetMin = holiday.getTimezoneOffset();
    if (offsetMin === 0) {
      expect(isHoliday(holiday)).toBe(true); // UTC: local midnight IS the ISO date
    } else if (offsetMin < 0) {
      expect(isHoliday(holiday)).toBe(false); // ahead of UTC (Manila): shifted a day
    }
    expect(isHoliday(holiday)).toBe(O.np(O.V('2026-06-12'))); // parity either way
  });

  it('workday rounds fractional day counts (0.5 lead becomes one full day step at 1)', () => {
    const mon = parseDate('2026-08-03');
    expect(workday(mon, 0.5).getTime()).toBe(workday(mon, 1).getTime()); // round(0.5) = 1 (banker's no — JS rounds .5 up)
    expect(workday(mon, 0.4).getTime()).toBe(mon.getTime());
  });
});

describe('weeks helpers', () => {
  it('monthWeeks skips a leading week whose Friday precedes the month', () => {
    const weeks = monthWeeks(2026, 7); // August 2026; Aug 1 is a Saturday
    // TZ-neutral: keys come from toISOString and shift a day east of UTC
    // (shipped behavior); the local Monday is the stable fact.
    expect(weeks[0]?.monday.getDay()).toBe(1);
    expect(weeks[0]?.monday.getDate()).toBe(3);
    // Shipped behavior: a trailing week whose Monday is in-month is included
    // even though its Friday falls in September — 5 weeks for August 2026.
    expect(weeks.length).toBe(5);
    expect(weeks[4]?.monday.getDate()).toBe(31);
  });
});
