/**
 * refreshModel (T041/T042) — nightly per project over model_window_months
 * (default 12; OD-2 open): card_events → samples → model_grid +
 * throughput_grid, delta recorded vs the previous run (§5.4).
 */

import type { Types } from 'mongoose';
import {
  computeModelGrid,
  computeThroughput,
  deriveSamples,
  gridDelta,
  type GridCell,
} from '../src/services/model-refresh.ts';
import { CardEvent, Deliverable, ModelGrid, ModelSample, Project, SyncRun, ThroughputGrid } from '../src/models/index.ts';
import type { Difficulty, Lane } from '../lib/model.ts';

export interface RefreshStats {
  events: number;
  cards: number;
  samples: number;
  gridCells: number;
  throughputRows: number;
  alerts: Array<{ cell: string; before: number; after: number; ratio: number }>;
}

export async function refreshProjectModel(projectId: Types.ObjectId): Promise<RefreshStats> {
  const project = await Project.findById(projectId).orFail();
  const since = new Date();
  since.setMonth(since.getMonth() - (project.model_window_months ?? 12));

  const events = await CardEvent.find({ project_id: projectId, occurred_at: { $gte: since } });
  const deliverables = await Deliverable.find({ project_id: projectId }).select(
    'trello_card_id difficulty lane',
  );
  const cards = deliverables.map((d) => ({
    trello_card_id: d.trello_card_id,
    difficulty: (d.difficulty ?? null) as Difficulty | null,
    lane: (d.lane ?? null) as Lane | null,
  }));

  const samples = deriveSamples(
    events.map((e) => ({ trello_card_id: e.trello_card_id, to_list: e.to_list ?? null, occurred_at: e.occurred_at })),
    cards,
  );
  const grid = computeModelGrid(samples);
  const throughput = computeThroughput(
    events.map((e) => ({ trello_card_id: e.trello_card_id, to_list: e.to_list ?? null, occurred_at: e.occurred_at })),
    cards,
  );

  // Delta vs the previous run BEFORE overwriting (§5.4 step 5).
  const previous = (await ModelGrid.find({ project_id: projectId })).map(
    (c) =>
      ({
        difficulty: c.difficulty,
        lane: c.lane,
        metric: c.metric,
        confidence: c.confidence,
        value: c.value,
        sample_n: c.sample_n,
      }) as GridCell,
  );
  const alerts = gridDelta(previous, grid);

  const now = new Date();
  // Replace, don't accumulate: stale cells from an older methodology or a
  // shrunken window must not survive a refresh.
  await ModelGrid.deleteMany({ project_id: projectId });
  await ThroughputGrid.deleteMany({ project_id: projectId });
  // Keep raw samples for audit/inspection (FR-7.7 provenance).
  await ModelSample.deleteMany({ project_id: projectId });
  if (samples.length > 0) {
    await ModelSample.insertMany(
      samples.map((s) => ({
        project_id: projectId,
        trello_card_id: s.trello_card_id,
        difficulty: s.difficulty,
        lane: s.lane,
        metric: s.metric,
        days: s.days,
        completed_at: s.completed_at,
      })),
    );
  }
  for (const cell of grid) {
    await ModelGrid.updateOne(
      { project_id: projectId, difficulty: cell.difficulty, lane: cell.lane, metric: cell.metric, confidence: cell.confidence },
      { $set: { value: cell.value, sample_n: cell.sample_n, computed_at: now }, $setOnInsert: { project_id: projectId } },
      { upsert: true },
    );
  }
  for (const row of throughput) {
    await ThroughputGrid.updateOne(
      { project_id: projectId, difficulty: row.difficulty },
      { $set: { p25: row.p25, p50: row.p50, p70: row.p70, computed_at: now }, $setOnInsert: { project_id: projectId } },
      { upsert: true },
    );
  }

  const stats: RefreshStats = {
    events: events.length,
    cards: cards.length,
    samples: samples.length,
    gridCells: grid.length,
    throughputRows: throughput.length,
    alerts,
  };
  if (alerts.length > 0) {
    console.warn(`[refreshModel] ${project.code}: ${alerts.length} grid cells shifted >30% — someone should look`, alerts.slice(0, 5));
  }
  await SyncRun.create({ project_id: projectId, source: 'model', ok: true, stats });
  return stats;
}

export async function runModelRefresh(): Promise<void> {
  const projects = await Project.find({ status: 'ongoing' });
  for (const p of projects) {
    try {
      await refreshProjectModel(p._id);
    } catch (err) {
      await SyncRun.create({ project_id: p._id, source: 'model', ok: false, error: (err as Error).message });
    }
  }
}
