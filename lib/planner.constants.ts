/**
 * Planner constants — VERBATIM from the validated prototype bundle
 * (invariant 5; BR-6b). Split out so forecast/planner share them without a
 * cycle; values byte-identical to the source.
 */

/** Difficulty weights, used ONLY for the hard-mix test (source: zu; BR-6b). */
export const WEIGHTS: Record<string, number> = { Easy: 1, Medium: 2, Hard: 4, '': 2 };

/** Hard-mix thresholds measured across 27 weeks on hLL7WW2V (source: Ke; BR-6b). */
export const HARD_MIX = { ideal: 0.083, ceiling: 0.129, observedMax: 0.204 };

/** Source: Uc. */
export const weightOf = (card: { difficulty?: string }): number =>
  WEIGHTS[card.difficulty ?? ''] ?? WEIGHTS['']!;

/** Source: Oc. */
export const CAPACITY_SOURCE = 'ARES · deliveryForecast.referenceWeeks';
