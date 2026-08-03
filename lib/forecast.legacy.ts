/**
 * lib/forecast.legacy.ts — the RETIRED workbook formula (BR-1), kept for
 * migration tests ONLY. Never imported by UI code (invariant 6, FR-7.2).
 * It overstates review waits 2.6–4.6× (BR-3); the empirical model in
 * lib/forecast.ts is the only forecast users see.
 *
 * Provenance: BRD v2.2 BR-1 spells the formulas; the prototype bundle
 * retired the executable spreadsheet mode and ships only the constants
 * (coef 1.28, constant 2.96 — displayed in its Model constants panel).
 * The workbook's full difficulty grids are pending JP's export
 * (TODO(workbook-export)); the two review values known from BR-3 are
 * seeded below. AC-10's golden set runs this implementation against real
 * workbook rows once the export lands.
 */

import { parseDate, toFriday, weekNum, workday } from './calendar.ts';
import { LEGACY_CYCLE } from './model.ts';

export interface LegacyGrid {
  /** Working-day design durations per difficulty, from the workbook. */
  design: Record<string, number>;
  /** Forecast review waits per difficulty, from the workbook (12.5/22 per BR-3 at p70). */
  review: Record<string, number>;
  /** Lead time before design starts, per the workbook. */
  lead: number;
}

/**
 * Seed values known from the BRD. TODO(workbook-export): replace with the
 * exported workbook grid before the T026/AC-10 gate is called.
 */
export const LEGACY_GRID_SEED: LegacyGrid = {
  design: { Easy: 1, Medium: 2, Hard: 4 },
  review: { Easy: 12.5, Medium: 12.5, Hard: 22 },
  lead: 0.5,
};

export interface LegacyCard {
  difficulty?: string;
  startDate: string;
}

export interface LegacyForecast {
  startWeek: number;
  design: number;
  review: number;
  sketchDelivery: Date;
  sketchApproved: Date;
  renderDelivery: Date;
  forecastedReviewTime: number;
  totalCycleTime: number;
}

/**
 * BR-1, verbatim from the BRD:
 *   Sketch Delivery  = WORKDAY(start, lead + design)
 *   Sketch Approved  = WORKDAY(sketch delivery, review)
 *   Render begins the FRIDAY of the sketch-approval week
 *   Total Cycle Time = 1.28 × forecast review time + 2.96
 */
export function legacyForecast(card: LegacyCard, grid: LegacyGrid = LEGACY_GRID_SEED): LegacyForecast {
  const design = grid.design[card.difficulty ?? 'Medium'] ?? grid.design.Medium!;
  const review = grid.review[card.difficulty ?? 'Medium'] ?? grid.review.Medium!;
  const start = parseDate(card.startDate);
  const sketchDelivery = workday(start, grid.lead + design);
  const sketchApproved = workday(sketchDelivery, review);
  const renderDelivery = workday(toFriday(sketchApproved), grid.lead + design);
  const forecastedReviewTime = review * 2;
  return {
    startWeek: weekNum(start),
    design,
    review,
    sketchDelivery,
    sketchApproved,
    renderDelivery,
    forecastedReviewTime,
    totalCycleTime: LEGACY_CYCLE.coef * forecastedReviewTime + LEGACY_CYCLE.constant,
  };
}
