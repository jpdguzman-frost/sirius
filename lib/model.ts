/**
 * lib/model.ts — model grid lookup, ported VERBATIM from the validated
 * prototype bundle (invariant 5). The EMPIRICAL snapshot below is the
 * prototype's shipped grid (ARES · board hLL7WW2V · Jan–Jul 2026); the
 * phase-6 refresh replaces it per project from model_grid/throughput_grid
 * (FR-7.6) — the lookup semantics here stay identical.
 */

export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type Lane = 'design' | 'ops' | 'assets';
export type ConfidenceKey = 'Average' | '0.7' | '0.85' | '0.95';

export interface ConfidenceLevel {
  key: ConfidenceKey;
  idx: number;
  label: string;
}

/** Source: fn. Index 1 (0.7) is the default confidence. */
export const CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  { key: 'Average', idx: 0, label: 'Average' },
  { key: '0.7', idx: 1, label: '70th pct' },
  { key: '0.85', idx: 2, label: '85th pct' },
  { key: '0.95', idx: 3, label: '95th pct' },
];

/** Source: Tc — the retired workbook's cycle formula constants (BR-1). */
export const LEGACY_CYCLE = { coef: 1.28, constant: 2.96 };

export interface DesignCell {
  Average: number;
  '0.7': number;
  '0.85': number;
  '0.95': number;
  n: number;
}

export interface EmpiricalModel {
  source: string;
  design: Partial<Record<Difficulty, Partial<Record<Lane, DesignCell>>>>;
  review: { Average: number; '0.7': number; '0.85': number; '0.95': number; median: number; n: number };
  throughput: Record<Difficulty, { p25: number; p50: number; p70: number }>;
}

/** Source: Xe — shipped snapshot, superseded per-project by the nightly refresh. */
export const EMPIRICAL: EmpiricalModel = {
  source: 'ARES · board hLL7WW2V · Jan–Jul 2026',
  design: {
    Easy: {
      design: { Average: 0.97, '0.7': 0.94, '0.85': 2.67, '0.95': 4.2, n: 1126 },
      ops: { Average: 2.4, '0.7': 1.03, '0.85': 2.94, '0.95': 3.75, n: 311 },
      assets: { Average: 12.06, '0.7': 13.88, '0.85': 19.24, '0.95': 23.31, n: 353 },
    },
    Medium: {
      design: { Average: 1.13, '0.7': 1.2, '0.85': 2.21, '0.95': 4.02, n: 1508 },
      ops: { Average: 0.73, '0.7': 0.56, '0.85': 0.98, '0.95': 1.05, n: 385 },
    },
    Hard: {
      design: { Average: 1.79, '0.7': 2.09, '0.85': 3.24, '0.95': 5.85, n: 228 },
      ops: { Average: 2.05, '0.7': 1.02, '0.85': 2.94, '0.95': 4.91, n: 121 },
    },
  },
  review: { Average: 5.21, '0.7': 4.8, '0.85': 9.87, '0.95': 19.64, median: 2.68, n: 1184 },
  throughput: {
    Easy: { p25: 29, p50: 50, p70: 75 },
    Medium: { p25: 42, p50: 51, p70: 69 },
    Hard: { p25: 7, p50: 9, p70: 11 },
  },
};

export interface LaneCard {
  currentList?: string;
  labels?: string[];
}

/** Lane classification from list + labels (source: rp; BR-4 companion). */
export const laneOf = (card: LaneCard): Lane => {
  const t = `${card.currentList || ''} ${(card.labels || []).join(' ')}`.toLowerCase();
  return /asset|illustrat|render|icon/.test(t)
    ? 'assets'
    : /ops|process|board management/.test(t)
      ? 'ops'
      : 'design';
};

export interface DesignCellCard extends LaneCard {
  difficulty?: string;
}

/** Grid cell for a card: difficulty × lane, with the source's fallbacks (source: Xh). */
export function designCell(card: DesignCellCard, model: EmpiricalModel = EMPIRICAL): DesignCell {
  const t =
    model.design[card.difficulty as Difficulty] ?? (model.design.Medium as Record<string, DesignCell>);
  const a = laneOf(card);
  return (
    (t as Record<string, DesignCell>)[a] ??
    (t as Record<string, DesignCell>).design ??
    (Object.values(t)[0] as DesignCell)
  );
}
