/**
 * T024 — lib/forecast.ts (empirical, BR-2/BR-4, FR-7.3–7.5): golden parity
 * vs the verbatim oracle across a full input matrix, plus behavioral
 * expectations (AC-12 logic: SLA cascades).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error verbatim minified extract, untyped by design
import * as O from './golden/original.mjs';
import { HOLIDAYS, setHolidays } from '../lib/calendar.ts';
import { forecast, type ForecastCard } from '../lib/forecast.ts';

/**
 * Amendment 2026-08-15: the port now excludes the holiday's LOCAL date in
 * EVERY timezone. The oracle's quirk east of UTC (toISOString on a local
 * midnight) makes it exclude the day AFTER each holiday instead. To keep
 * the matrix a pure COMPOSITION parity, we feed the port the oracle's
 * effective set for the host TZ: shifted +1 day east of UTC, unchanged at
 * or west of UTC (where the oracle is correct). The amended calendar's own
 * correctness is proven in calendar.test.ts against a TZ-true reference.
 */
const OFFSET_MIN = new Date('2026-06-12T00:00:00').getTimezoneOffset();
const plusOne = (s: string): string => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
};
beforeAll(() => {
  if (OFFSET_MIN < 0) setHolidays(HOLIDAYS.map(plusOne)); // east of UTC
});
afterAll(() => setHolidays(HOLIDAYS));
import { CONFIDENCE_LEVELS, EMPIRICAL, designCell, laneOf } from '../lib/model.ts';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', undefined, 'Unknown'];
const LISTS = ['Design', 'Render Assets', 'Ops / Process', 'Sent for Client Review', '', 'Icon Clean Up'];
const CONFIDENCES = ['Average', '0.7', '0.85', '0.95', undefined, 'nonsense'];
const STARTS = ['2026-08-03', '2026-08-07', '2026-08-28', '2026-12-24'];
const SLAS: Array<{ slaSketch?: number; slaRender?: number }> = [
  {},
  { slaSketch: 2 },
  { slaRender: 1.5 },
  { slaSketch: 0, slaRender: 0 },
  { slaSketch: 12.5, slaRender: 22 },
];

function matrix(): ForecastCard[] {
  const cards: ForecastCard[] = [];
  for (const difficulty of DIFFICULTIES)
    for (const currentList of LISTS)
      for (const confidence of CONFIDENCES)
        for (const startDate of STARTS)
          for (const sla of SLAS)
            cards.push({ difficulty, currentList, labels: [], confidence, startDate, ...sla });
  return cards;
}

describe('golden parity with the validated bundle', () => {
  it(`forecast() matches the oracle on all ${matrix().length} matrix cards`, () => {
    for (const card of matrix()) {
      const ours = forecast(card);
      const theirs = O.fl(card);
      const label = JSON.stringify(card);
      expect(ours.sketchDesign, label).toBe(theirs.sketchDesign);
      expect(ours.sketchReview, label).toBe(theirs.sketchReview);
      expect(ours.sketchDelivery.getTime(), label).toBe(theirs.sketchDelivery.getTime());
      expect(ours.sketchApproved.getTime(), label).toBe(theirs.sketchApproved.getTime());
      expect(ours.renderDelivery.getTime(), label).toBe(theirs.renderDelivery.getTime());
      expect(ours.renderApproved.getTime(), label).toBe(theirs.renderApproved.getTime());
      expect(ours.totalCycleTime, label).toBe(theirs.totalCycleTime);
      expect(ours.forecastedReviewTime, label).toBe(theirs.forecastedReviewTime);
      expect(ours.designDays, label).toBe(theirs.designDays);
      expect(ours.startWeek, label).toBe(theirs.startWeek);
      expect(ours.lane, label).toBe(theirs.lane);
      expect(ours.sampleSize, label).toBe(theirs.sampleSize);
    }
  });

  it('laneOf() and designCell() match the oracle cell-for-cell', () => {
    for (const difficulty of DIFFICULTIES)
      for (const currentList of LISTS) {
        const card = { difficulty, currentList, labels: [] };
        expect(laneOf(card)).toBe(O.rp(card));
        expect(designCell(card)).toEqual(O.Xh(card));
      }
  });

  it('model snapshot and confidence levels are byte-identical to the shipped ones', () => {
    expect(JSON.parse(JSON.stringify(EMPIRICAL))).toEqual(JSON.parse(JSON.stringify(O.Xe)));
    expect(CONFIDENCE_LEVELS.map((c) => c.key)).toEqual(O.fn.map((c: { key: string }) => c.key));
  });
});

describe('behavioral expectations (FR-7.4, FR-7.5)', () => {
  const base: ForecastCard = {
    difficulty: 'Medium',
    currentList: 'Design',
    labels: [],
    startDate: '2026-08-03',
    confidence: '0.7',
  };

  it('defaults unknown confidence to the 70th percentile', () => {
    expect(forecast({ ...base, confidence: 'nonsense' }).sketchReview).toBe(
      forecast({ ...base, confidence: '0.7' }).sketchReview,
    );
  });

  it('a review SLA replaces modelled review time and cascades downstream (AC-12 logic)', () => {
    const modelled = forecast(base);
    const sla = forecast({ ...base, slaSketch: 1 });
    expect(sla.forecastedReviewTime).toBe(1 + modelled.sketchReview);
    expect(sla.sketchApproved.getTime()).toBeLessThan(modelled.sketchApproved.getTime());
    expect(sla.renderDelivery.getTime()).toBeLessThan(modelled.renderDelivery.getTime());
    expect(sla.totalCycleTime).toBeLessThan(modelled.totalCycleTime);
  });

  it('BR-4 lives in the lookup: Easy/assets is far slower than Easy/design', () => {
    const design = forecast({ ...base, difficulty: 'Easy' });
    const assets = forecast({ ...base, difficulty: 'Easy', currentList: 'Render Assets' });
    expect(design.sketchDesign).toBe(0.94);
    expect(assets.sketchDesign).toBe(13.88);
  });
});
