/**
 * lib/forecast.ts — the EMPIRICAL forecast, ported VERBATIM from the
 * validated prototype bundle (invariant 5; BR-2). This is the only forecast
 * users ever see (FR-7.2). Golden parity vs test/golden/original.mjs.
 *
 * Preserved source semantics, deliberately untouched:
 *  - default confidence is 0.7 (CONFIDENCE_LEVELS[1]) when the card's key
 *    is unknown;
 *  - sketch and render leads are 0.5 working days each;
 *  - a review SLA override (slaSketch/slaRender) replaces the modelled
 *    review time and cascades downstream (FR-7.5);
 *  - renderDelivery counts from the Friday of the sketch-approval week
 *    (BR-1), while renderApproved counts from sketchApproved directly —
 *    exactly as the source does.
 */

import { parseDate, toFriday, weekNum, workday } from './calendar.ts';
import {
  CONFIDENCE_LEVELS,
  EMPIRICAL,
  designCell,
  laneOf,
  type DesignCellCard,
  type EmpiricalModel,
  type Lane,
} from './model.ts';

export interface ForecastCard extends DesignCellCard {
  startDate: string;
  confidence?: string;
  slaSketch?: number | null;
  slaRender?: number | null;
}

export interface Forecast {
  cards: 1;
  startWeek: number;
  sketchLead: number;
  sketchDesign: number;
  sketchReview: number;
  renderLead: number;
  renderDesign: number;
  renderReview: number;
  sketchCycle: number;
  renderCycle: number;
  designDays: number;
  forecastedReviewTime: number;
  baselineReview: number;
  sketchDelivery: Date;
  sketchApproved: Date;
  renderDelivery: Date;
  renderApproved: Date;
  totalCycleTime: number;
  lane: Lane;
  sampleSize: number;
}

/** Source: fl/lg — verbatim. */
export function forecast(card: ForecastCard, model: EmpiricalModel = EMPIRICAL): Forecast {
  const t = (CONFIDENCE_LEVELS.find((L) => L.key === card.confidence) ?? CONFIDENCE_LEVELS[1]!).key;
  const a = designCell(card, model);
  const l = a[t] ?? a['0.7'];
  const o = model.review[t] ?? model.review['0.7'];
  const r = 0.5;
  const s = 0.5;
  const u = card.slaSketch ?? o;
  const d = card.slaRender ?? o;
  const c = u + d;
  const h = parseDate(card.startDate);
  const g = workday(h, r + l);
  const p = workday(g, u);
  const y = workday(toFriday(p), s + l);
  const v = workday(p, s + l + d);
  return {
    cards: 1,
    startWeek: weekNum(h),
    sketchLead: r,
    sketchDesign: l,
    sketchReview: o,
    renderLead: s,
    renderDesign: l,
    renderReview: o,
    sketchCycle: r + l + o,
    renderCycle: s + l + o,
    designDays: l * 2,
    forecastedReviewTime: c,
    baselineReview: o * 2,
    sketchDelivery: g,
    sketchApproved: p,
    renderDelivery: y,
    renderApproved: v,
    totalCycleTime: r + l + u + s + l + d,
    lane: laneOf(card),
    sampleSize: a.n,
  };
}
