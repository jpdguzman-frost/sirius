/**
 * refreshModel (T041/T042; block 8 T180/T181) — nightly per project.
 *
 * Two halves, run in this order (review A2-8/X4, 2026-09-10):
 *
 *  1. THROUGHPUT — for EVERY ongoing project. Derived locally from work-card
 *     completions (`computeThroughput`, unchanged) over the project's
 *     `model_window_months`; needs no Ares id, so a project whose code is not
 *     `rt-<n>` (staging `rt-test`) keeps its nightly throughput refresh.
 *
 *  2. THE ARES MODEL — only for `rt-<n>` codes. The DESIGN cells are READ
 *     from Ares's cycle-time model (`AresClient.cycleTimeModel`, one call per
 *     project per night), mapped 1:1 into GridCells (`cellsFromAresModel`),
 *     and passed through the sanity gate (`gateCells`, T182) at WRITE time —
 *     only passed cells reach `model_grid`, so the loader's absent-cell →
 *     snapshot fill is the fallback for everything else. The delta vs the
 *     previous run is recorded (§5.4), vanished cells included. Any other
 *     code skips this half whole: `model_grid` untouched, `stats.modelSkipped
 *     = 'non-rt-code'`, an `ok: true` row — a fact, not a nightly failure.
 *     The design grid reads Ares's DEFAULT window (12 months, cached per
 *     Manila day); `model_window_months` governs throughput only.
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
  type CellSource,
  type GridCell,
  type GridDelta,
} from '../src/services/model-refresh.ts';
import { DEFAULT_GATE, gateCells, type GateFailure } from '../src/services/model-gate.ts';
import { AresClient } from '../src/services/ares.ts';
import { validateEnv } from '../src/config/env.ts';
import { makeClient } from './syncAres.ts';
import { CardEvent, Deliverable, ModelGrid, Project, SyncRun, ThroughputGrid, WorkCard } from '../src/models/index.ts';
import type { Difficulty } from '../lib/model.ts';

/**
 * `sync_runs.stats` for source `model` — the frozen provenance shape (PLAN.md
 * block 8, amended 2026-09-10). The model-envelope fields are `null` on a
 * night the Ares half was skipped (`modelSkipped` says why); every key is
 * always present on the returned object. Persisted through a Mixed path, so
 * Mongoose's `minimize` drops an EMPTY object (`unmappedWorkTypes: {}`,
 * `droppedReasons: {}`, `laneSources: {}`) from the row — readers use `?? {}`.
 */
export interface RefreshStats {
  generatedAt: string | null;
  window: { from: string; to: string } | null;
  workingDayHours: number | null;
  historyUnverified: number | null;
  sampled: number | null;
  considered: number | null;
  droppedReasons: Record<string, number>;
  /** mapped = GridCells produced (= passed + failed); unmapped = Ares cells that reached no lane. */
  cells: { mapped: number; unmapped: number; passed: number; failed: number };
  /** Ares keys that mapped to no lane, with how many cells each carried. */
  unmappedWorkTypes: Record<string, number>;
  failures: GateFailure[];
  /** Per mapped lane (before the gate): `firm` if ANY tier fell back to the firm pool. */
  laneSources: Record<string, CellSource>;
  /** What Ares sent: `laneCells.length`, or null when the field was absent (or the half skipped). */
  laneCellCount: number | null;
  /** null = the Ares half ran; 'non-rt-code' = the project code carries no RT id, half skipped. */
  modelSkipped: string | null;
  throughputRows: number;
  alerts: GridDelta[];
}

/**
 * The bare integer the model endpoint wants, from the project code Sirius
 * mirrors from ARES (`rt-837` → 837). A code in another format (`rt-test`,
 * `runn-45`, a bare `837`) has no cycle-time model to read; null, and the
 * caller records `modelSkipped`.
 */
export function rtProjectIdOf(code: string): number | null {
  const m = /^rt-(\d+)$/.exec(code);
  return m ? Number(m[1]) : null;
}

/** Fresh per call — the returned stats must never share inner objects between nights. */
const modelHalfSkipped = (): Pick<
  RefreshStats,
  | 'generatedAt'
  | 'window'
  | 'workingDayHours'
  | 'historyUnverified'
  | 'sampled'
  | 'considered'
  | 'droppedReasons'
  | 'cells'
  | 'unmappedWorkTypes'
  | 'failures'
  | 'laneSources'
  | 'laneCellCount'
  | 'alerts'
> => ({
  generatedAt: null,
  window: null,
  workingDayHours: null,
  historyUnverified: null,
  sampled: null,
  considered: null,
  droppedReasons: {},
  cells: { mapped: 0, unmapped: 0, passed: 0, failed: 0 },
  unmappedWorkTypes: {},
  failures: [],
  laneSources: {},
  laneCellCount: null,
  alerts: [],
});

/** Half 1 — throughput from local completions over the project window; writes `throughput_grid`. */
async function refreshThroughput(projectId: Types.ObjectId, windowMonths: number, now: Date): Promise<number> {
  const since = new Date(now);
  since.setMonth(since.getMonth() - windowMonths);
  const events = await CardEvent.find({ project_id: projectId, occurred_at: { $gte: since } });
  const deliverables = await Deliverable.find({ project_id: projectId }).select('trello_card_id difficulty');
  const workCards = await WorkCard.find({ project_id: projectId }).select('trello_card_id difficulty');
  const VALID = new Set(['Easy', 'Medium', 'Hard']);
  // Deliverables AND work cards carry difficulty labels.
  const cards = [
    ...deliverables.map((d) => ({ trello_card_id: d.trello_card_id, difficulty: (d.difficulty ?? null) as Difficulty | null })),
    ...workCards.map((w) => ({
      trello_card_id: w.trello_card_id,
      difficulty: (VALID.has(w.difficulty ?? '') ? w.difficulty : null) as Difficulty | null,
    })),
  ];
  const throughput = computeThroughput(
    events.map((e) => ({ trello_card_id: e.trello_card_id, to_list: e.to_list ?? null, occurred_at: e.occurred_at })),
    cards,
  );
  await ThroughputGrid.deleteMany({ project_id: projectId });
  for (const row of throughput) {
    await ThroughputGrid.updateOne(
      { project_id: projectId, difficulty: row.difficulty },
      { $set: { p25: row.p25, p50: row.p50, p70: row.p70, computed_at: now }, $setOnInsert: { project_id: projectId } },
      { upsert: true },
    );
  }
  return throughput.length;
}

/** Half 2 — read, map, gate, replace `model_grid` with the passed cells; the provenance of that. */
async function refreshAresModel(
  projectId: Types.ObjectId,
  code: string,
  rtProjectId: number,
  ares: AresClient,
  now: Date,
): Promise<Omit<RefreshStats, 'modelSkipped' | 'throughputRows'>> {
  const model = await ares.cycleTimeModel(rtProjectId);
  if (!model) {
    // Last good grid stays (FR-8.5): nothing below runs, the row records it.
    throw new Error(`[refreshModel] ${code}: ARES cycle-time model unavailable for rtProjectId ${rtProjectId}`);
  }

  const { cells: mapped, unmapped, laneSources } = cellsFromAresModel(model, String(projectId));
  const { passed, failed } = gateCells(mapped, model, DEFAULT_GATE);

  // Delta vs the previous run BEFORE overwriting (§5.4 step 5) — a cell that
  // was served last night and is absent tonight is an alert, not silence.
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

  // Replace, don't accumulate: a cell that failed tonight's gate, or a lane
  // Ares no longer reports, must not survive from an older run — it falls
  // back by absence (the loader's snapshot fill, invariant 7's design).
  await ModelGrid.deleteMany({ project_id: projectId });
  for (const cell of passed) {
    await ModelGrid.updateOne(
      { project_id: projectId, difficulty: cell.difficulty, lane: cell.lane, metric: cell.metric, confidence: cell.confidence },
      { $set: { value: cell.value, sample_n: cell.sample_n, computed_at: now }, $setOnInsert: { project_id: projectId } },
      { upsert: true },
    );
  }

  if (alerts.length > 0) {
    console.warn(
      `[refreshModel] ${code}: ${alerts.length} grid cells shifted >30% or vanished — someone should look`,
      alerts.slice(0, 5),
    );
  }

  return {
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
    laneSources,
    laneCellCount: model.laneCells?.length ?? null,
    alerts,
  };
}

export async function refreshProjectModel(
  projectId: Types.ObjectId,
  deps: { ares?: AresClient } = {},
): Promise<RefreshStats> {
  const project = await Project.findById(projectId).orFail();
  const now = new Date();

  const throughputRows = await refreshThroughput(projectId, project.model_window_months ?? 12, now);

  const rtProjectId = rtProjectIdOf(project.code);
  const half =
    rtProjectId === null
      ? { ...modelHalfSkipped(), modelSkipped: 'non-rt-code' }
      : {
          ...(await refreshAresModel(projectId, project.code, rtProjectId, deps.ares ?? makeClient(validateEnv(process.env)), now)),
          modelSkipped: null,
        };

  const stats: RefreshStats = { ...half, throughputRows };
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
