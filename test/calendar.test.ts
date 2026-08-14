/**
 * T018 — lib/calendar.ts: unit expectations + golden parity vs the verbatim
 * oracle extracted from the validated bundle (invariant 5, invariant 11).
 */

import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error verbatim minified extract, untyped by design
import * as O from './golden/original.mjs';
import {
  HOLIDAYS,
  buildWeeks,
  getHolidays,
  isHoliday,
  localIso,
  monthWeeks,
  parseDate,
  setHolidays,
  toFriday,
  toMonday,
  weekNum,
  workday,
  workdaysBetween,
} from '../lib/calendar.ts';

const IS_UTC = new Date('2026-06-12T00:00:00').getTimezoneOffset() === 0;

/**
 * TZ-true reference for WORKDAY math (amendment 2026-08-15): pure string/UTC
 * arithmetic over the active holiday list — correct in every host timezone.
 * The port must match this everywhere; it must also still match the oracle
 * under UTC, where the oracle is correct.
 */
function refWorkday(startIso: string, days: number): string {
  let l = Math.round(days || 0);
  const [y, m, d] = startIso.split('-').map(Number);
  let t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  while (l > 0) {
    t += 86_400_000;
    const dow = new Date(t).getUTCDay();
    const s = new Date(t).toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !HOLIDAYS.includes(s)) l--;
  }
  return new Date(t).toISOString().slice(0, 10);
}

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
  it('workday() matches the TZ-true reference in every timezone — and the oracle under UTC, where the oracle is correct (amendment 2026-08-15)', () => {
    for (const d of DATES) {
      for (const n of SPANS) {
        const ours = workday(parseDate(d), n);
        expect(localIso(ours), `workday(${d}, ${n})`).toBe(refWorkday(d, n));
        if (IS_UTC) {
          expect(ours.getTime(), `oracle workday(${d}, ${n})`).toBe(O.on(O.V(d), n).getTime());
        }
      }
    }
  });

  it('toFriday() matches the oracle for every weekday', () => {
    for (const d of DATES) {
      expect(toFriday(parseDate(d)).getTime(), d).toBe(O.sp(O.V(d)).getTime());
    }
  });

  it('weekNum(), toMonday() match the oracle; workdaysBetween() matches the TZ-true count (oracle under UTC)', () => {
    for (const d of DATES) {
      expect(weekNum(parseDate(d))).toBe(O.Zh(O.V(d)));
      expect(toMonday(parseDate(d)).getTime()).toBe(O.dp(O.V(d)).getTime());
    }
    const refBetween = (fromIso: string, toIso: string): number => {
      const u = (s: string) => {
        const [y, m, d] = s.split('-').map(Number);
        return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
      };
      let n = 0;
      for (let t = u(fromIso) + 86_400_000; t <= u(toIso); t += 86_400_000) {
        const dow = new Date(t).getUTCDay();
        if (dow !== 0 && dow !== 6 && !HOLIDAYS.includes(new Date(t).toISOString().slice(0, 10)))
          n++;
      }
      return n;
    };
    for (let i = 0; i < DATES.length - 1; i++) {
      const a = parseDate(DATES[i]!);
      const b = parseDate(DATES[i + 1]!);
      expect(workdaysBetween(a, b), `${DATES[i]}..${DATES[i + 1]}`).toBe(
        refBetween(DATES[i]!, DATES[i + 1]!),
      );
      if (IS_UTC) {
        expect(workdaysBetween(a, b)).toBe(O.rn(O.V(DATES[i]!), O.V(DATES[i + 1]!)));
      }
    }
  });

  it('holiday list is byte-identical to the shipped one', () => {
    expect(HOLIDAYS).toEqual(O.Kh);
  });
});

describe('documented quirks — toFriday preserved verbatim; isHoliday amended 2026-08-15', () => {
  it('toFriday rolls Mon–Thu to Friday but Fri/Sat/Sun to the NEXT MONDAY', () => {
    expect(toFriday(parseDate('2026-08-03')).getDay()).toBe(5); // Mon → Fri
    expect(toFriday(parseDate('2026-08-06')).getDay()).toBe(5); // Thu → Fri
    expect(toFriday(parseDate('2026-08-07')).getDay()).toBe(1); // Fri → next Mon
    expect(toFriday(parseDate('2026-08-08')).getDay()).toBe(1); // Sat → next Mon
    expect(toFriday(parseDate('2026-08-09')).getDay()).toBe(1); // Sun → next Mon
  });

  it('isHoliday matches the LOCAL calendar date in EVERY timezone (amendment 2026-08-15 — supersedes the shipped UTC quirk)', () => {
    expect(isHoliday(parseDate('2026-06-12'))).toBe(true); // true on Manila AND UTC hosts
    expect(isHoliday(parseDate('2026-06-11'))).toBe(false);
    expect(isHoliday(parseDate('2026-08-31'))).toBe(true);
    if (IS_UTC) {
      // The oracle is correct only under UTC — parity holds exactly there.
      expect(isHoliday(parseDate('2026-06-12'))).toBe(O.np(O.V('2026-06-12')));
    }
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
    expect(weeks[0]?.monday.getDay()).toBe(1);
    expect(weeks[0]?.monday.getDate()).toBe(3);
    // Shipped behavior: a trailing week whose Monday is in-month is included
    // even though its Friday falls in September — 5 weeks for August 2026.
    expect(weeks.length).toBe(5);
    expect(weeks[4]?.monday.getDate()).toBe(31);
  });

  it('week keys are the LOCAL Monday in every timezone (amendment 2026-08-15 — was toISOString, i.e. the Sunday before east of UTC)', () => {
    for (const from of ['2026-08-10', '2026-08-13', '2026-12-28', '2026-01-01']) {
      for (const w of buildWeeks(from, 6)) {
        expect(w.key, `buildWeeks(${from})`).toBe(localIso(w.monday));
        expect(w.monday.getDay(), w.key).toBe(1);
      }
    }
    for (const w of monthWeeks(2026, 7)) {
      expect(w.key).toBe(localIso(w.monday));
    }
    // The exact live failure this amendment fixes: Aug 10 2026 is a Monday
    // and must key as itself, not 2026-08-09.
    expect(buildWeeks('2026-08-10', 1)[0]?.key).toBe('2026-08-10');
  });
});

describe('setHolidays — ARES-canonical calendar injection (amendment 2026-08-15)', () => {
  afterEach(() => setHolidays(HOLIDAYS));

  it('workday() follows the injected calendar', () => {
    // Tue 2026-08-25 is a working day on the seed list…
    expect(localIso(workday(parseDate('2026-08-24'), 1))).toBe('2026-08-25');
    // …until ARES says otherwise.
    setHolidays(['2026-08-25']);
    expect(localIso(workday(parseDate('2026-08-24'), 1))).toBe('2026-08-26');
    expect(isHoliday(parseDate('2026-08-25'))).toBe(true);
    // And the seed entry is gone while the injected set is active.
    expect(isHoliday(parseDate('2026-08-31'))).toBe(false);
  });

  it('getHolidays() exposes the active set, seeded from HOLIDAYS', () => {
    expect(getHolidays()).toEqual([...HOLIDAYS].sort());
    setHolidays(['2026-02-25']);
    expect(getHolidays()).toEqual(['2026-02-25']);
  });
});
