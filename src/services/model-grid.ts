/**
 * Per-project empirical model loader (T043) — assembles an EmpiricalModel
 * (the shape lib/forecast consumes, FR-7.3) from the project's model_grid /
 * throughput_grid. Falls back to the shipped snapshot per difficulty tier and
 * per lane (design), per percentile (review), per difficulty (throughput), or
 * for the whole grid when none of it exists, so a young project still
 * forecasts — with the fallback visible in provenance (FR-7.7, AC-11).
 */

import type { Types } from 'mongoose';
import { EMPIRICAL, type DesignCell, type Difficulty, type EmpiricalModel, type Lane } from '../../lib/model.ts';
import { ModelGrid, Project, ThroughputGrid } from '../models/index.ts';

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
  /* THE FREEZE (JP, 2026-08-27) — invariant 7's release gate, enforced.
     A frozen project forecasts off the shipped reference snapshot and ignores
     its refreshed grid entirely. The grid is still WRITTEN nightly; only the
     read is gated, so nothing measured is lost and unfreezing is one field.
     Why: see `model_frozen` on the project schema. */
  const project = await Project.findById(projectId).select({ model_frozen: 1 }).lean();
  if (project?.model_frozen !== false) {
    const waiting = await ModelGrid.countDocuments({ project_id: projectId });
    return {
      model: EMPIRICAL,
      provenance: {
        source: `${EMPIRICAL.source} · FROZEN — the refreshed grid is not in use${waiting ? ` (${waiting} measured cells held)` : ''}`,
        computed_at: null,
        fallback: true,
        cells: 0,
        sampleSizes: {},
      },
    };
  }

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

  // Snapshot fill for a sparse young grid, per difficulty tier AND per lane
  // inside a present tier. lib/model's verbatim designCell walks difficulty →
  // Medium → lane → 'design' → first-cell, with no guards: a missing tier
  // dereferences undefined (live 500 on rt-test, 2026-08-13), and a tier whose
  // only measured lane is 'assets' silently forecasts a design-lane card off
  // the assets cell. Filling the snapshot's own lanes restores the exact
  // fallback chain the shipped grid gives. Measured cells always win — only
  // absent ones are filled, and lanes the snapshot itself lacks are left to
  // designCell's t.design step.
  let tiersFilled = 0;
  let lanesFilled = 0;
  for (const d of Object.keys(EMPIRICAL.design) as Difficulty[]) {
    if (!design[d]) {
      design[d] = { ...EMPIRICAL.design[d] };
      tiersFilled++;
      continue;
    }
    for (const l of Object.keys(EMPIRICAL.design[d]!) as Lane[]) {
      if (!design[d]![l]) {
        design[d]![l] = EMPIRICAL.design[d]![l];
        lanesFilled++;
      }
    }
  }
  const gaps = [
    tiersFilled ? `${tiersFilled} difficulty tier${tiersFilled === 1 ? '' : 's'}` : '',
    lanesFilled ? `${lanesFilled} lane${lanesFilled === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const sparseNote = gaps.length ? ` · ${gaps.join(' + ')} from snapshot (sparse grid)` : '';

  const model: EmpiricalModel = {
    source: `ARES · refreshed grid · computed ${computedAt?.toISOString().slice(0, 10) ?? 'n/a'}${sparseNote}`,
    design,
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
