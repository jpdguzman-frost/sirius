/**
 * refreshModel (T041/T042; block 8 T180/T181) — nightly per project.
 *
 * Since block 8 (JP "read Ares", 2026-09-09) the DESIGN cells are READ from
 * Ares's cycle-time model (`AresClient.cycleTimeModel`, one call per project
 * per night), mapped 1:1 into GridCells (`cellsFromAresModel`), and passed
 * through the sanity gate (`gateCells`, T182) at WRITE time — only passed
 * cells reach `model_grid`, so the loader's absent-cell → snapshot fill is
 * the fallback for everything else. Throughput is still derived locally
 * from work-card completions (`computeThroughput`, unchanged), and the delta
 * vs the previous run is still recorded (§5.4).
 *
 * Provenance lives on the `sync_runs` row (source `model`), never in
 * `model_samples`: the endpoint is aggregate-only, so this path writes no
 * sample rows (drift item 8; the collection is kept, not dropped).
 *
 * `model_frozen` is never read for writing and never written here —
 * invariant 7; unfreeze is JP's, per project, by hand.
 */

import type { Types } from 'mongoose';
import {
  cellsFromAresModel,
  computeThroughput,
  gridDelta,
  type GridCell,
  type GridDelta,
} from '../src/services/model-refresh.ts';
import { DEFAULT_GATE, gateCells, type GateFailure } from '../src/services/model-gate.ts';
import { AresClient } from '../src/services/ares.ts';
import { validateEnv } from '../src/config/env.ts';
import { makeClient } from './syncAres.ts';
import { CardEvent, Deliverable, ModelGrid, Project, SyncRun, ThroughputGrid, WorkCard } from '../src/models/index.ts';
import type { Difficulty, Lane } from '../lib/model.ts';

/** `sync_runs.stats` for source `model` — the frozen provenance shape (PLAN.md block 8). */
export interface RefreshStats {
  generatedAt: string;
  window: { from: string; to: string };
  workingDayHours: number;
  historyUnverified: number;
  sampled: number;
  considered: number;
  droppedReasons: Record<string, number>;
  /** mapped = GridCells produced (= passed + failed); unmapped = Ares cells that reached no lane. */
  cells: { mapped: number; unmapped: number; passed: number; failed: number };
  /** Ares keys that mapped to no lane, with how many cells each carried. */
  unmappedWorkTypes: Record<string, number>;
  failures: GateFailure[];
  throughputRows: number;
  alerts: GridDelta[];
}

/**
 * The bare integer the model endpoint wants, from the project code Sirius
 * mirrors from ARES (`rt-837` → 837). A code in another format (`runn-45`)
 * has no cycle-time model to read; null, and the caller records why.
 */
export function rtProjectIdOf(code: string): number | null {
  const m = /^rt-(\d+)$/.exec(code);
  return m ? Number(m[1]) : null;
}

export async function refreshProjectModel(
  projectId: Types.ObjectId,
  deps: { ares?: AresClient } = {},
): Promise<RefreshStats> {
  const project = await Project.findById(projectId).orFail();

  const rtProjectId = rtProjectIdOf(project.code);
  if (rtProjectId === null) {
    throw new Error(`[refreshModel] ${project.code}: no numeric RT project id in the project code — no cycle-time model to read`);
  }
  const ares = deps.ares ?? makeClient(validateEnv(process.env));
  const model = await ares.cycleTimeModel(rtProjectId);
  if (!model) {
    // Last good grid stays (FR-8.5): nothing below runs, the row records it.
    throw new Error(`[refreshModel] ${project.code}: ARES cycle-time model unavailable for rtProjectId ${rtProjectId}`);
  }

  const { cells: mapped, unmapped } = cellsFromAresModel(model, String(projectId));
  const { passed, failed } = gateCells(mapped, model, DEFAULT_GATE);

  // Throughput: work-card completions per week, from card_events over the
  // window, as before. Deliverables AND work cards carry difficulty labels.
  const since = new Date();
  since.setMonth(since.getMonth() - (project.model_window_months ?? 12));
  const events = await CardEvent.find({ project_id: projectId, occurred_at: { $gte: since } });
  const deliverables = await Deliverable.find({ project_id: projectId }).select(
    'trello_card_id difficulty lane',
  );
  const workCards = await WorkCard.find({ project_id: projectId }).select('trello_card_id difficulty');
  const VALID = new Set(['Easy', 'Medium', 'Hard']);
  const cards = [
    ...deliverables.map((d) => ({
      trello_card_id: d.trello_card_id,
      difficulty: (d.difficulty ?? null) as Difficulty | null,
      lane: (d.lane ?? null) as Lane | null,
    })),
    ...workCards.map((w) => ({
      trello_card_id: w.trello_card_id,
      difficulty: (VALID.has(w.difficulty ?? '') ? w.difficulty : null) as Difficulty | null,
      lane: null as Lane | null,
    })),
  ];
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
  const alerts = gridDelta(previous, passed);

  const now = new Date();
  // Replace, don't accumulate: a cell that failed tonight's gate, or a lane
  // Ares no longer reports, must not survive from an older run.
  await ModelGrid.deleteMany({ project_id: projectId });
  await ThroughputGrid.deleteMany({ project_id: projectId });
  for (const cell of passed) {
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
    generatedAt: model.generatedAt,
    window: model.window,
    workingDayHours: model.workingDayHours,
    historyUnverified: model.historyUnverified,
    sampled: model.dropped.sampled,
    considered: model.dropped.considered,
    droppedReasons: model.dropped.reasons,
    cells: {
      mapped: mapped.length,
      unmapped: Object.values(unmapped).reduce((a, b) => a + b, 0),
      passed: passed.length,
      failed: failed.length,
    },
    unmappedWorkTypes: unmapped,
    failures: failed,
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
