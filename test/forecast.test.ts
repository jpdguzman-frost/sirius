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

/**
 * Amendment 2026-09-12 (block 12, JP's lane-structure rulings) — the SECOND
 * licensed divergence from the oracle in this file, handled exactly as the
 * 2026-08-15 one above was, and for the same stated reason. Root CLAUDE.md
 * invariant 5 records that precedent as *"Golden tests amended to a TZ-true
 * reference, oracle parity kept where the oracle is correct."*
 *
 * WHAT DIVERGED. `lib/model.ts` retired the snapshot's `assets` cell and, with
 * it, the `/asset|illustrat|render|icon/` branch of `laneOf`'s fallback. THE
 * ORACLE KEEPS BOTH, deliberately — it is the pre-ruling behaviour preserved
 * as the reference, not a broken file, and it is never edited. This matrix
 * enumerates list names (`Render Assets`, `Icon Clean Up`) that reach exactly
 * that branch, so parity on those cards is impossible by construction.
 *
 * `test/forecast.workbook.test.ts`, the FIXTURE golden, is untouched by any of
 * it: none of its 40 rows carries a `currentList` or `labels`, so every one
 * resolves to `design` on both sides. The validated engine's real outputs have
 * not moved.
 *
 * HOW IT IS PINNED (main-thread ruling, 2026-09-12). No card leaves the
 * matrix and parity is not weakened. Each card is sorted by whether the two
 * lane derivations agree, and BOTH halves are asserted:
 *  - agree  → byte-identical to the oracle, field for field, as before.
 *  - differ → the ONE ruled divergence and nothing else: the oracle answers
 *    its retired lane, we answer `design`, and every other output equals the
 *    ORACLE'S OWN answer for the same card sitting in a design-named list.
 *    That last comparison is the strong half — it says the engine's
 *    composition is untouched and only the classification moved, and it is
 *    computed from the oracle rather than typed out here.
 * An unexpected divergence therefore still fails loudly, on either side.
 */
const RETIRED_LANE: string = Object.keys(O.Xe.design.Easy as Record<string, unknown>).find(
  (k) => !(k in (EMPIRICAL.design.Easy ?? {})),
)!;
/** A list the oracle and the port both classify as `design` — the divergence's reference point. */
const DESIGN_LIST = 'Design';

describe('golden parity with the validated bundle', () => {
  it('the block-12 divergence is exactly one lane wide, and the oracle still carries what it retired', () => {
    // premises the partition below rests on, asserted rather than assumed
    expect(RETIRED_LANE, 'the oracle must keep a lane the shipped snapshot no longer has').toBeTruthy();
    expect(
      Object.keys(O.Xe.design.Easy as Record<string, unknown>).filter((k) => !(k in (EMPIRICAL.design.Easy ?? {}))),
    ).toEqual([RETIRED_LANE]);
    expect(O.rp({ currentList: DESIGN_LIST, labels: [] })).toBe('design');
    expect(laneOf({ currentList: DESIGN_LIST, labels: [] })).toBe('design');
  });

  it(`forecast() matches the oracle on all ${matrix().length} matrix cards, bar the one ruled divergence`, () => {
    let diverged = 0;
    for (const card of matrix()) {
      const ours = forecast(card);
      const label = JSON.stringify(card);
      const oracleLane = O.rp(card) as string;
      // the oracle's own answer for this card, in the list it agrees with us about
      const theirs = oracleLane === ours.lane ? O.fl(card) : O.fl({ ...card, currentList: DESIGN_LIST });
      if (oracleLane !== ours.lane) {
        diverged++;
        expect(oracleLane, label).toBe(RETIRED_LANE);
        expect(ours.lane, label).toBe('design');
      }
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
    // non-vacuity: the retired branch really is exercised by this matrix, so the
    // divergent half is a live assertion and not an unreachable arm
    expect(diverged, 'the matrix must still contain cards that reach the retired branch').toBeGreaterThan(0);
    expect(diverged).toBeLessThan(matrix().length);
  });

  it('laneOf() and designCell() match the oracle cell-for-cell, bar the one ruled divergence', () => {
    let diverged = 0;
    for (const difficulty of DIFFICULTIES)
      for (const currentList of LISTS) {
        const card = { difficulty, currentList, labels: [] };
        const label = JSON.stringify(card);
        const oracleLane = O.rp(card) as string;
        if (oracleLane === laneOf(card)) {
          expect(designCell(card), label).toEqual(O.Xh(card));
          continue;
        }
        diverged++;
        expect(oracleLane, label).toBe(RETIRED_LANE);
        expect(laneOf(card), label).toBe('design');
        // the cell we now answer is the oracle's OWN cell for a design-lane card
        expect(designCell(card), label).toEqual(O.Xh({ ...card, currentList: DESIGN_LIST }));
      }
    expect(diverged, 'the retired branch must still be reachable from LISTS').toBeGreaterThan(0);
  });

  it('the retired cell is ABSENT from the shipped snapshot, which is otherwise byte-identical to the oracle', () => {
    const oracle = JSON.parse(JSON.stringify(O.Xe)) as {
      design: Record<string, Record<string, unknown>>;
    };
    // the oracle keeps the retired cell on purpose; deleting it is what the
    // amendment did, so the rest of the snapshot must still match byte for byte
    expect(oracle.design.Easy![RETIRED_LANE], 'the oracle must still carry the retired cell').toBeDefined();
    delete oracle.design.Easy![RETIRED_LANE];
    expect(JSON.parse(JSON.stringify(EMPIRICAL))).toEqual(oracle);
    // and the retirement is total — no tier of the shipped snapshot carries the lane
    for (const [tier, cells] of Object.entries(EMPIRICAL.design))
      expect(Object.keys(cells ?? {}), tier).not.toContain(RETIRED_LANE);
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

  /**
   * BR-4 unchanged: design time is keyed on difficulty AND lane. What changed
   * on 2026-09-12 is WHICH lanes exist — the `assets` cell this case used to
   * price against was retired, so the case is rewritten around the ops lane,
   * which still carries a measured cell of its own. Both cell values are READ
   * from the shipped snapshot (rule 2), never typed.
   */
  it('BR-4 lives in the lookup: difficulty and lane both move the cell', () => {
    const easy = forecast({ ...base, difficulty: 'Easy' });
    const hard = forecast({ ...base, difficulty: 'Hard' });
    expect(easy.sketchDesign).toBe(EMPIRICAL.design.Easy!.design!['0.7']);
    expect(hard.sketchDesign).toBe(EMPIRICAL.design.Hard!.design!['0.7']);
    expect(hard.sketchDesign).toBeGreaterThan(easy.sketchDesign); // the difficulty axis

    const ops = forecast({ ...base, difficulty: 'Easy', currentList: 'Ops / Process' });
    expect(ops.lane).toBe('ops');
    expect(ops.sketchDesign).toBe(EMPIRICAL.design.Easy!.ops!['0.7']); // the lane axis
    expect(ops.sketchDesign).not.toBe(easy.sketchDesign);
  });

  it('BR-4 after the retirement: the card this case used to catch lands on design, at no retired figure', () => {
    const easy = forecast({ ...base, difficulty: 'Easy' });
    const wasAssets = forecast({ ...base, difficulty: 'Easy', currentList: 'Render Assets' });
    expect(wasAssets.lane).toBe('design');
    expect(wasAssets.sketchDesign).toBe(easy.sketchDesign);
    // the figures it used to price at, READ from the oracle's surviving cell
    const retired = Object.values(
      (O.Xe.design.Easy as Record<string, Record<string, number>>)[RETIRED_LANE]!,
    );
    expect(retired.length, 'the oracle must still carry the retired cell').toBeGreaterThan(0);
    for (const v of retired) expect(wasAssets.sketchDesign, String(v)).not.toBe(v);
  });
});
