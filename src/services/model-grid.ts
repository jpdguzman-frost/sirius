/**
 * Per-project empirical model loader (T043) — assembles an EmpiricalModel
 * (the shape lib/forecast consumes, FR-7.3) from the project's model_grid /
 * throughput_grid. Falls back to the shipped snapshot when a cell or the
 * whole grid is absent, so a young project still forecasts — with the
 * fallback visible in provenance (FR-7.7, AC-11).
 */

import type { Types } from 'mongoose';
import { EMPIRICAL, type DesignCell, type Difficulty, type EmpiricalModel, type Lane } from '../../lib/model.ts';
import { ModelGrid, ThroughputGrid } from '../models/index.ts';

export interface ModelProvenance {
  source: string;
  computed_at: Date | null;
  fallback: boolean;
  cells: number;
  sampleSizes: Record<string, number>;
}

export async function loadProjectModel(
  projectId: Types.ObjectId,
): Promise<{ model: EmpiricalModel; provenance: ModelProvenance }> {
  const cells = await ModelGrid.find({ project_id: projectId });
  if (cells.length === 0) {
    return {
      model: EMPIRICAL,
      provenance: {
        source: `${EMPIRICAL.source} (snapshot fallback — no refreshed grid yet)`,
        computed_at: null,
        fallback: true,
        cells: 0,
        sampleSizes: {},
      },
    };
  }

  const design: EmpiricalModel['design'] = {};
  const review: Record<string, number> = {};
  const reviewSamples: number[] = [];
  const sampleSizes: Record<string, number> = {};
  let computedAt: Date | null = null;

  for (const c of cells) {
    if (!computedAt || c.computed_at > computedAt) computedAt = c.computed_at;
    sampleSizes[`${c.difficulty}/${c.lane}/${c.metric}`] = c.sample_n;
    if (c.metric === 'design') {
      const d = c.difficulty as Difficulty;
      const l = c.lane as Lane;
      if (!design[d]) design[d] = {};
      if (!design[d]![l]) design[d]![l] = { Average: 0, '0.7': 0, '0.85': 0, '0.95': 0, n: c.sample_n } as DesignCell;
      (design[d]![l] as unknown as Record<string, number>)[c.confidence] = c.value;
      design[d]![l]!.n = c.sample_n;
    } else {
      // review is ONE global pool, stored as all/all cells
      review[c.confidence] = c.value;
      reviewSamples.push(c.sample_n);
    }
  }

  const throughputRows = await ThroughputGrid.find({ project_id: projectId });
  const throughput = { ...EMPIRICAL.throughput };
  for (const t of throughputRows) {
    throughput[t.difficulty as Difficulty] = { p25: t.p25 ?? 0, p50: t.p50 ?? 0, p70: t.p70 ?? 0 };
  }

  const model: EmpiricalModel = {
    source: `ARES · refreshed grid · computed ${computedAt?.toISOString().slice(0, 10) ?? 'n/a'}`,
    design: Object.keys(design).length > 0 ? design : EMPIRICAL.design,
    review: {
      Average: review.Average ?? EMPIRICAL.review.Average,
      '0.7': review['0.7'] ?? EMPIRICAL.review['0.7'],
      '0.85': review['0.85'] ?? EMPIRICAL.review['0.85'],
      '0.95': review['0.95'] ?? EMPIRICAL.review['0.95'],
      median: EMPIRICAL.review.median,
      n: reviewSamples[0] ?? EMPIRICAL.review.n,
    },
    throughput,
  };

  return {
    model,
    provenance: {
      source: model.source,
      computed_at: computedAt,
      fallback: false,
      cells: cells.length,
      sampleSizes,
    },
  };
}
