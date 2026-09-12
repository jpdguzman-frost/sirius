/**
 * T040/T041/T042 + block 8 (T180/T181) — the model refresh: Ares cells →
 * GridCells, the gate at write time, throughput, delta alerts, the
 * per-project loader fallback and the model read route (FR-7.6, FR-7.7;
 * AC-11 data side).
 *
 * FIXTURE NOTE (2026-09-10, block 8). The design cells no longer come from
 * `card_events` dwell — they are READ from Ares's cycle-time model through an
 * injected `AresClient` (`refreshProjectModel(projectId, { ares })`). Every
 * grid assertion below is DERIVED from the fixture (test/CLAUDE.md rule 2):
 * the expected cell set is `gateCells(cellsFromAresModel(fixture))`, never a
 * second copy of the numbers. `card_events` still feed THROUGHPUT, so the
 * done-list fixtures stay (`Design Complete`, a real §7a Done list).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import {
  cellsFromAresModel,
  computeThroughput,
  gridDelta,
  percentile,
} from '../src/services/model-refresh.ts';
import { DEFAULT_GATE, gateCells } from '../src/services/model-gate.ts';
import { refreshProjectModel, rtProjectIdOf, runModelRefresh } from '../worker/refreshModel.ts';
import { loadProjectModel } from '../src/services/model-grid.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import type { AresClient, AresCycleTimeModel } from '../src/services/ares.ts';
import { CardEvent, Deliverable, ModelGrid, ModelSample, Project, SyncRun, ThroughputGrid, User, UserProject } from '../src/models/index.ts';
import { EMPIRICAL, type Difficulty, type Lane } from '../lib/model.ts';
import { forecast } from '../lib/forecast.ts';

const env = validateEnv({ NODE_ENV: 'test' });

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const at = (h: number) => new Date(Date.UTC(2026, 6, 1, h)); // hours from July 1

/* ------------------------------------------------------------------------ */
/* The model fixture: the live envelope shape (state log 2026-09-10) with   */
/* lane-pooled cells as asked in Sirius→Ares #15. Numbers sit where the live */
/* project cells sit (design M p70 0.7 working days — owl #15's example) and  */
/* are ordered so the whole set PASSES the gate: window 181 days, no          */
/* unverified sample, n ≥ 15, Easy ≤ Medium ≤ Hard on 0.85 and Average.       */
/* ------------------------------------------------------------------------ */

type LaneCell = NonNullable<AresCycleTimeModel['laneCells']>[number];
const laneCell = (
  laneKey: string,
  difficulty: Difficulty,
  [meanWorkingDays, p70, p85, p95]: [number, number, number, number],
  n = 40,
  source: 'project' | 'firm' = 'project',
): LaneCell => ({ laneKey, difficulty, source, n, meanWorkingDays, p70, p85, p95 });

const MODEL: AresCycleTimeModel = {
  rtProjectId: 837,
  generatedAt: '2026-07-01T16:00:03.000Z',
  window: { from: '2026-01-01', to: '2026-07-01' },
  floorMinutes: 15,
  overrideDays: 14,
  workingDayHours: 24,
  workTypeKeys: ['Asset: Icons', 'Build: Dev', 'Design: Refinement', 'Design: Screen', 'Ops: Board'],
  historyUnverified: 0,
  dropped: { considered: 120, sampled: 100, reasons: { noDifficulty: 15, noWorkTypeLabel: 5 } },
  cells: [
    { workType: 'Design: Refinement', difficulty: 'Medium', source: 'project', n: 33, meanWorkingDays: 0.9, p70: 0.7, p85: 1.4, p95: 2.8, meanCalendarHours: 21.5 },
    { workType: 'Design: Screen', difficulty: 'Easy', source: 'project', n: 20, meanWorkingDays: 0.5, p70: 0.4, p85: 0.9, p95: 1.6, meanCalendarHours: 12 },
    { workType: 'Asset: Icons', difficulty: 'Easy', source: 'firm', n: 47, meanWorkingDays: 0.2, p70: 0.14, p85: 0.5, p95: 1.1, meanCalendarHours: 4.8 },
    { workType: 'Ops: Board', difficulty: 'Easy', source: 'project', n: 30, meanWorkingDays: 0.7, p70: 0.6, p85: 1.0, p95: 1.2, meanCalendarHours: 16 },
    { workType: 'Build: Dev', difficulty: 'Hard', source: 'firm', n: 16, meanWorkingDays: 3.1, p70: 3.5, p85: 5.0, p95: 8.0, meanCalendarHours: 74 },
  ],
  laneCells: [
    laneCell('design', 'Easy', [0.9, 0.94, 2.0, 4.0], 40),
    laneCell('design', 'Medium', [1.1, 1.25, 2.2, 4.0], 60), // p70 ≠ the snapshot's 1.2 on purpose — the FREEZE proof needs the two to differ
    laneCell('design', 'Hard', [1.8, 2.1, 3.2, 5.8], 20),
    laneCell('ops', 'Easy', [0.7, 0.6, 1.0, 1.2], 30),
  ],
};

const withLaneCells = (laneCells: LaneCell[] | undefined): AresCycleTimeModel => ({ ...MODEL, laneCells });
const findLane = (m: AresCycleTimeModel, laneKey: string, difficulty: Difficulty) =>
  m.laneCells!.find((c) => c.laneKey === laneKey && c.difficulty === difficulty)!;

/** The injected reader: the sync-unmapped-lists pattern, one method wide. */
function aresWith(model: AresCycleTimeModel | null): { ares: AresClient; asked: number[] } {
  const asked: number[] = [];
  const ares = {
    cycleTimeModel: async (rtProjectId: number) => {
      asked.push(rtProjectId);
      return model;
    },
  } as unknown as AresClient;
  return { ares, asked };
}
const deps = (model: AresCycleTimeModel | null) => ({ ares: aresWith(model).ares });

/** What the worker must have written: derived from the fixture, never copied. */
const expectedGrid = (model: AresCycleTimeModel, projectId: string) =>
  gateCells(cellsFromAresModel(model, projectId).cells, model, DEFAULT_GATE);

describe('cellsFromAresModel (pure, T181)', () => {
  it('maps every lane cell to the four confidence cells, values copied from the fixture', () => {
    const { cells, unmapped, laneSources } = cellsFromAresModel(MODEL, 'p1');
    expect(cells).toHaveLength(MODEL.laneCells!.length * 4);
    expect(unmapped).toEqual({});
    // every fixture lane cell is the project's own pool
    expect(laneSources).toEqual(Object.fromEntries(MODEL.laneCells!.map((c) => [c.laneKey, 'project'])));
    for (const lc of MODEL.laneCells!) {
      const mine = cells.filter((c) => c.lane === lc.laneKey && c.difficulty === lc.difficulty);
      expect(mine.map((c) => c.metric)).toEqual(['design', 'design', 'design', 'design']);
      expect(Object.fromEntries(mine.map((c) => [c.confidence, c.value]))).toEqual({
        Average: lc.meanWorkingDays,
        '0.7': lc.p70,
        '0.85': lc.p85,
        '0.95': lc.p95,
      });
      expect(new Set(mine.map((c) => c.sample_n))).toEqual(new Set([lc.n]));
    }
  });

  it('writes no review cell — the client-review wait is a queue, not a cell (§7.1; JP via Ares)', () => {
    const { cells } = cellsFromAresModel(MODEL, 'p1');
    expect(cells.some((c) => c.metric === 'review' || c.lane === 'all' || c.difficulty === 'all')).toBe(false);
  });

  it('a laneKey outside the Lane union is COUNTED in unmapped, never guessed into a lane', () => {
    const m = withLaneCells([...MODEL.laneCells!, laneCell('ui', 'Medium', [0.5, 0.4, 0.8, 1.5]), laneCell('ui', 'Easy', [0.3, 0.2, 0.5, 1.0]), laneCell('others', 'Easy', [0.3, 0.2, 0.5, 1.0])]);
    const { cells, unmapped } = cellsFromAresModel(m, 'p1');
    expect(unmapped).toEqual({ ui: 2, others: 1 });
    expect(cells).toHaveLength(MODEL.laneCells!.length * 4);
    expect(cells.some((c) => (c.lane as string) === 'ui' || (c.lane as string) === 'others')).toBe(false);
  });

  /** The per-work-type cells summarised by prefix — what provenance must say when nothing pooled reached the grid. */
  const prefixSummary = (m: AresCycleTimeModel) => {
    const byPrefix: Record<string, number> = {};
    for (const c of m.cells) {
      const prefix = c.workType.slice(0, c.workType.indexOf(':'));
      byPrefix[prefix] = (byPrefix[prefix] ?? 0) + 1;
    }
    expect(Object.values(byPrefix).reduce((a, b) => a + b, 0)).toBe(m.cells.length); // the fixture has ≥1 prefix per cell
    return byPrefix;
  };

  it('laneCells ABSENT → no cells at all; the per-work-type cells are summarised by prefix (never pooled here)', () => {
    const { cells, unmapped, laneSources } = cellsFromAresModel(withLaneCells(undefined), 'p1');
    expect(cells).toEqual([]);
    expect(unmapped).toEqual(prefixSummary(MODEL));
    expect(laneSources).toEqual({});
  });

  it('laneCells PRESENT BUT EMPTY takes the same summarise branch — an empty pooled table is not "Ares sent nothing" (review A2-3)', () => {
    const { cells, unmapped } = cellsFromAresModel(withLaneCells([]), 'p1');
    expect(cells).toEqual([]);
    expect(MODEL.cells.length, 'the fixture must carry per-work-type cells or the summary is vacuous').toBeGreaterThan(0);
    expect(unmapped).toEqual(prefixSummary(MODEL));
  });

  it('a prototype-named laneKey is counted like any other — `unmapped` is data, not an object with methods (review A2-4)', () => {
    const keys = ['__proto__', 'constructor', 'hasOwnProperty'];
    const m = withLaneCells(keys.map((k) => laneCell(k, 'Easy', [1, 1, 1, 1], 1)));
    const { cells, unmapped } = cellsFromAresModel(m, 'p1');
    expect(cells).toEqual([]);
    expect(Object.entries(unmapped).sort()).toEqual(keys.map((k) => [k, 1]).sort());
    expect(Object.values(unmapped).reduce((a, b) => a + b, 0)).toBe(keys.length);
    for (const v of Object.values(unmapped)) expect(typeof v).toBe('number');
  });

  it('laneSources: a lane is `project` only when every chosen tier is the project\'s pool; one firm-backed tier marks it `firm` (review A2-1)', () => {
    const content = laneCell('content', 'Easy', [1, 1, 1, 1], 40, 'firm'); // the live case: content falls back to firm whole
    const m = withLaneCells([...MODEL.laneCells!, content, laneCell('ops', 'Hard', [2, 2, 2, 2], 40, 'firm')]);
    const { cells, laneSources } = cellsFromAresModel(m, 'p1');
    expect(laneSources).toEqual({ design: 'project', ops: 'firm', content: 'firm' });
    expect(cells.filter((c) => c.lane === 'content')).toHaveLength(4); // firm cells still map — the marker is the point
    // the project-over-firm pick still wins per tier: a firm duplicate of a project tier leaves the lane `project`
    const dup = withLaneCells([...MODEL.laneCells!, { ...findLane(MODEL, 'design', 'Medium'), source: 'firm', p70: 9 }]);
    expect(cellsFromAresModel(dup, 'p1').laneSources.design).toBe('project');
  });

  it('a key sent as BOTH project and firm takes the project cell (Ares\'s own override rule) — one value per grid key', () => {
    const firm = laneCell('design', 'Medium', [9, 9, 9, 9], 500, 'firm');
    const project = findLane(MODEL, 'design', 'Medium');
    for (const order of [[firm, project], [project, firm]]) {
      const { cells } = cellsFromAresModel(withLaneCells(order), 'p1');
      const medium = cells.filter((c) => c.lane === 'design' && c.difficulty === 'Medium');
      expect(medium).toHaveLength(4);
      expect(medium.find((c) => c.confidence === '0.7')?.value).toBe(project.p70);
      expect(medium[0]?.sample_n).toBe(project.n);
    }
  });

  it('UNIT: the mapped values are working days, the snapshot\'s unit — within an order of magnitude of EMPIRICAL (drift item 14)', () => {
    /* The fixture carries live-shaped numbers (design M p70 0.7 working days,
       owl #15). Copied as they are, they land within 10× of the snapshot's
       same cell; had Ares sent hours (×24) or minutes, this fails — which is
       the check the mapper deliberately does NOT perform in production. */
    const { cells } = cellsFromAresModel(MODEL, 'p1');
    let compared = 0;
    for (const c of cells.filter((x) => x.confidence === '0.7')) {
      const snapshot = EMPIRICAL.design[c.difficulty as Difficulty]?.[c.lane as Lane]?.['0.7'];
      if (snapshot === undefined) continue;
      const ratio = c.value / snapshot;
      expect(ratio, `${c.difficulty}/${c.lane}: ${c.value} vs snapshot ${snapshot}`).toBeGreaterThan(0.1);
      expect(ratio, `${c.difficulty}/${c.lane}: ${c.value} vs snapshot ${snapshot}`).toBeLessThan(10);
      compared++;
    }
    expect(compared, 'no cell shares a key with the snapshot — the check would pass vacuously').toBeGreaterThan(0);
  });
});

describe('derivation still in use (pure)', () => {
  it('percentile() interpolates linearly', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10], 0.95)).toBe(10);
  });

  it('throughput counts done-entries per week per difficulty', () => {
    const events = [
      { trello_card_id: 'c1', to_list: 'Design Complete', occurred_at: new Date('2026-07-06T10:00:00Z') },
      { trello_card_id: 'c2', to_list: 'Design Complete', occurred_at: new Date('2026-07-07T10:00:00Z') },
      { trello_card_id: 'c3', to_list: 'Design Complete', occurred_at: new Date('2026-07-14T10:00:00Z') },
    ];
    const rows = computeThroughput(events, [
      { trello_card_id: 'c1', difficulty: 'Easy' },
      { trello_card_id: 'c2', difficulty: 'Easy' },
      { trello_card_id: 'c3', difficulty: 'Easy' },
    ]);
    expect(rows[0]?.difficulty).toBe('Easy');
    expect(rows[0]?.weeks).toBe(2); // weeks with 2 and 1 completions
    expect(rows[0]?.p50).toBe(2); // median of [1,2] interpolated → 1.5 → rounded 2
  });

  it('gridDelta flags >30% shifts (§5.4 step 5)', () => {
    const cell = (value: number) => ({
      difficulty: 'Medium' as const, lane: 'design' as const, metric: 'design' as const,
      confidence: '0.7' as const, value, sample_n: 5,
    });
    expect(gridDelta([cell(1)], [cell(1.2)])).toHaveLength(0);
    const alerts = gridDelta([cell(1)], [cell(2)]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.ratio).toBe(1);
  });

  it('gridDelta reports a VANISHED cell — served before, absent after — regardless of threshold; a new cell is not a shift (review A2-2)', () => {
    const cell = (confidence: '0.7' | '0.85', value: number) => ({
      difficulty: 'Medium' as const, lane: 'design' as const, metric: 'design' as const, confidence, value, sample_n: 5,
    });
    const before = [cell('0.7', 1), cell('0.85', 2)];
    expect(gridDelta(before, [])).toEqual([
      { cell: 'Medium|design|design|0.7', before: 1, after: null, ratio: 1 },
      { cell: 'Medium|design|design|0.85', before: 2, after: null, ratio: 1 },
    ]);
    expect(gridDelta(before, [], 5)).toHaveLength(2); // louder than any threshold
    expect(gridDelta(before, [cell('0.7', 1)])).toEqual([{ cell: 'Medium|design|design|0.85', before: 2, after: null, ratio: 1 }]);
    expect(gridDelta([], before)).toEqual([]); // first night: nothing to vanish
  });

  it('rtProjectIdOf: the bare integer from `rt-<n>`, null for every other code format', () => {
    expect(rtProjectIdOf('rt-837')).toBe(837);
    expect(rtProjectIdOf('runn-45')).toBeNull();
    expect(rtProjectIdOf('837')).toBeNull();
    expect(rtProjectIdOf('rt-')).toBeNull();
    expect(rtProjectIdOf('rt-test')).toBeNull(); // staging: throughput only, the Ares half skipped
  });
});

describe('refresh + loader (integration)', () => {
  async function seedProject(opts: { code?: string; model_frozen?: boolean } = {}) {
    const p = await Project.create({
      code: opts.code ?? 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120,
      model_frozen: opts.model_frozen ?? false,
    });
    // throughput still comes from local completions — one Medium card, done once
    await Deliverable.create({
      project_id: p._id, mc_number: 'MC-1', display_id: 'MC-1', trello_card_id: 'c1',
      name: 'D1', difficulty: 'Medium', lane: 'design',
    });
    await CardEvent.insertMany([
      { project_id: p._id, trello_card_id: 'c1', source_event_id: `${p.code}-e1`, to_list: 'Design', occurred_at: at(0) },
      { project_id: p._id, trello_card_id: 'c1', source_event_id: `${p.code}-e3`, to_list: 'Design Complete', occurred_at: at(96) },
    ]);
    return p;
  }

  it('reads the model for the project\'s bare RT id, writes ONLY the gated cells + throughput_grid, records deltas on re-run', async () => {
    const p = await seedProject();
    const { ares, asked } = aresWith(MODEL);
    const s1 = await refreshProjectModel(p._id, { ares });
    expect(asked).toEqual([837]);

    const expected = expectedGrid(MODEL, String(p._id));
    expect(expected.passed.length, 'the fixture must pass the gate or every assertion below is vacuous').toBeGreaterThan(0);
    expect(expected.failed).toEqual([]);
    expect(s1.cells).toEqual({ mapped: expected.passed.length, unmapped: 0, passed: expected.passed.length, failed: 0 });

    const written = await ModelGrid.find({ project_id: p._id }).lean();
    expect(written).toHaveLength(expected.passed.length);
    for (const cell of expected.passed) {
      const row = written.find((w) => w.difficulty === cell.difficulty && w.lane === cell.lane && w.metric === cell.metric && w.confidence === cell.confidence);
      expect(row, `${cell.difficulty}/${cell.lane}/${cell.confidence}`).toMatchObject({ value: cell.value, sample_n: cell.sample_n });
    }
    expect(await ThroughputGrid.countDocuments({ project_id: p._id })).toBe(1);

    const s2 = await refreshProjectModel(p._id, { ares });
    expect(s2.alerts).toHaveLength(0); // same model → no shift
    const shifted = withLaneCells(MODEL.laneCells!.map((c) => ({ ...c, p70: c.p70 * 2 })));
    const s3 = await refreshProjectModel(p._id, deps(shifted));
    expect(s3.alerts.length).toBe(MODEL.laneCells!.length); // every 0.7 cell doubled
  });

  it('provenance lives on sync_runs.stats for source:model — the frozen shape, straight from the model', async () => {
    const p = await seedProject();
    const stats = await refreshProjectModel(p._id, deps(MODEL));
    const run = await SyncRun.findOne({ project_id: p._id, source: 'model' }).lean();
    expect(run?.ok).toBe(true);
    const FROZEN_KEYS = ['alerts', 'cells', 'considered', 'droppedReasons', 'failures', 'generatedAt', 'historyUnverified', 'laneCellCount', 'laneSources', 'modelSkipped', 'sampled', 'throughputRows', 'unmappedWorkTypes', 'window', 'workingDayHours'];
    expect(Object.keys(stats).sort()).toEqual(FROZEN_KEYS);
    /* The RULE (test/CLAUDE.md rule 1): every frozen key reads back from the
       row as what the refresh returned, with an empty object tolerated as
       absence — the row goes through a Mixed path and readers use `?? {}`.
       Whether Mongoose persists `{}` or drops it is not law (review X10). */
    const persisted = run!.stats as Record<string, unknown>;
    for (const k of FROZEN_KEYS) {
      const value = stats[k as keyof typeof stats];
      const fromRow = typeof value === 'object' && value !== null && !Array.isArray(value) ? (persisted[k] ?? {}) : persisted[k];
      expect(fromRow, k).toEqual(value);
    }
    expect(persisted.unmappedWorkTypes ?? {}).toEqual({});
    expect(stats).toMatchObject({
      generatedAt: MODEL.generatedAt,
      window: MODEL.window,
      workingDayHours: MODEL.workingDayHours,
      historyUnverified: MODEL.historyUnverified,
      sampled: MODEL.dropped.sampled,
      considered: MODEL.dropped.considered,
      droppedReasons: MODEL.dropped.reasons,
      unmappedWorkTypes: {},
      failures: [],
      laneSources: { design: 'project', ops: 'project' },
      laneCellCount: MODEL.laneCells!.length,
      modelSkipped: null,
      throughputRows: 1,
    });
  });

  it('a firm-sourced lane is distinguishable from a measured one — `firm` is recorded in the persisted provenance (review A2-1)', async () => {
    const p = await seedProject();
    const m = withLaneCells([...MODEL.laneCells!, laneCell('content', 'Easy', [1, 1, 1, 1], 40, 'firm')]);
    const stats = await refreshProjectModel(p._id, deps(m));
    expect(stats.laneSources).toEqual({ design: 'project', ops: 'project', content: 'firm' });
    const row = await SyncRun.findOne({ project_id: p._id, source: 'model' }).lean();
    expect(JSON.stringify(row!.stats)).toContain('firm');
    expect((row!.stats as { laneSources: unknown }).laneSources).toEqual(stats.laneSources);
    expect(await ModelGrid.countDocuments({ project_id: p._id, lane: 'content' })).toBe(4); // written — only the marker says whose number it is
  });

  it('an all-fail night empties the grid LOUDLY: every served cell vanishes into alerts (review A2-2)', async () => {
    const p = await seedProject();
    const first = await refreshProjectModel(p._id, deps(MODEL));
    expect(first.alerts).toEqual([]);
    const served = await ModelGrid.countDocuments({ project_id: p._id });
    expect(served, 'nothing served — nothing can vanish').toBeGreaterThan(0);

    const tooFew = withLaneCells(MODEL.laneCells!.map((c) => ({ ...c, n: 3 })));
    const s = await refreshProjectModel(p._id, deps(tooFew));
    expect(s.cells.passed).toBe(0);
    expect(await ModelGrid.countDocuments({ project_id: p._id })).toBe(0); // replaced — a failed cell falls back by absence
    expect(s.alerts).toHaveLength(served);
    for (const a of s.alerts) expect(a).toMatchObject({ after: null, ratio: 1 });
    const row = await SyncRun.findOne({ project_id: p._id, source: 'model' }).sort({ at: -1 }).lean();
    expect((row!.stats as { alerts: unknown[] }).alerts).toHaveLength(served);
  });

  it('`laneCells: []` is recorded as what Ares sent (laneCellCount 0, prefixes in provenance) and still vanishes the grid loudly (review A2-3 / A2-2)', async () => {
    const p = await seedProject();
    await refreshProjectModel(p._id, deps(MODEL));
    const served = await ModelGrid.countDocuments({ project_id: p._id });
    expect(served).toBeGreaterThan(0);

    const empty = await refreshProjectModel(p._id, deps(withLaneCells([])));
    expect(empty.laneCellCount).toBe(0);
    expect(empty.cells).toEqual({ mapped: 0, unmapped: MODEL.cells.length, passed: 0, failed: 0 });
    expect(Object.keys(empty.unmappedWorkTypes).sort()).toEqual(['Asset', 'Build', 'Design', 'Ops']);
    expect(empty.alerts.filter((a) => a.after === null)).toHaveLength(served);
    const row = await SyncRun.findOne({ project_id: p._id, source: 'model' }).sort({ at: -1 }).lean();
    expect((row!.stats as { unmappedWorkTypes: unknown }).unmappedWorkTypes).toEqual(empty.unmappedWorkTypes); // persisted, non-empty
    expect((row!.stats as { laneCellCount: unknown }).laneCellCount).toBe(0);
    // and the three states are told apart by laneCellCount alone
    expect((await refreshProjectModel(p._id, deps(withLaneCells(undefined)))).laneCellCount).toBeNull();
    expect((await refreshProjectModel(p._id, deps(MODEL))).laneCellCount).toBe(MODEL.laneCells!.length);
  });

  it('writes NO model_samples — the source is aggregate-only; the collection is kept, not touched', async () => {
    const p = await seedProject();
    await ModelSample.create({ project_id: p._id, trello_card_id: 'old', difficulty: 'Easy', lane: 'design', metric: 'design', days: 1, completed_at: at(0) });
    await refreshProjectModel(p._id, deps(MODEL));
    expect(await ModelSample.countDocuments({ project_id: p._id })).toBe(1);
    expect(await ModelGrid.countDocuments({ project_id: p._id }), 'the grid was written, so the sample count is a real observation').toBeGreaterThan(0);
  });

  it('an unknown laneKey is counted in stats and reaches no cell', async () => {
    const p = await seedProject();
    const m = withLaneCells([...MODEL.laneCells!, laneCell('ui', 'Medium', [0.5, 0.4, 0.8, 1.5])]);
    const stats = await refreshProjectModel(p._id, deps(m));
    expect(stats.unmappedWorkTypes).toEqual({ ui: 1 });
    expect(stats.cells.unmapped).toBe(1);
    const run = await SyncRun.findOne({ project_id: p._id, source: 'model' }).lean();
    expect((run!.stats as { unmappedWorkTypes: unknown }).unmappedWorkTypes).toEqual({ ui: 1 }); // persisted when non-empty
    expect(await ModelGrid.countDocuments({ project_id: p._id, lane: 'ui' })).toBe(0);
    expect(await ModelGrid.countDocuments({ project_id: p._id })).toBe(expectedGrid(m, String(p._id)).passed.length);
  });

  it('laneCells absent (#15 not shipped) → an EMPTY grid, prefixes in provenance, and the loader serves the snapshot', async () => {
    const p = await seedProject();
    const stats = await refreshProjectModel(p._id, deps(withLaneCells(undefined)));
    expect(stats.cells).toEqual({ mapped: 0, unmapped: MODEL.cells.length, passed: 0, failed: 0 });
    expect(Object.keys(stats.unmappedWorkTypes).sort()).toEqual(['Asset', 'Build', 'Design', 'Ops']);
    expect(await ModelGrid.countDocuments({ project_id: p._id })).toBe(0);
    const { provenance } = await loadProjectModel(p._id);
    expect(provenance.fallback).toBe(true);
    expect(provenance.source).toContain('snapshot fallback');
  });

  it('the gate runs at WRITE time: 100% unverified samples fail every cell, the grid stays empty, failures carry the reason', async () => {
    const p = await seedProject();
    const unverified: AresCycleTimeModel = { ...MODEL, historyUnverified: MODEL.dropped.sampled };
    const stats = await refreshProjectModel(p._id, deps(unverified));
    const mapped = cellsFromAresModel(unverified, String(p._id)).cells.length;
    expect(mapped, 'nothing mapped — the gate had nothing to fail').toBeGreaterThan(0);
    expect(stats.cells).toEqual({ mapped, unmapped: 0, passed: 0, failed: mapped });
    expect(stats.failures).toHaveLength(mapped);
    for (const f of stats.failures) expect(f.reasons).toContain('unverified');
    expect(await ModelGrid.countDocuments({ project_id: p._id })).toBe(0);
  });

  it('a lane that fails ordering is dropped whole while the other lane is written — per-cell fallback via the loader\'s fill', async () => {
    const p = await seedProject();
    const misordered = withLaneCells(
      MODEL.laneCells!.map((c) => (c.laneKey === 'design' && c.difficulty === 'Easy' ? { ...c, p85: 9 } : c)),
    );
    const stats = await refreshProjectModel(p._id, deps(misordered));
    expect(stats.failures.length, 'the fixture did not trip the ordering rule').toBeGreaterThan(0);
    expect(await ModelGrid.countDocuments({ project_id: p._id, lane: 'design' })).toBe(0);
    expect(await ModelGrid.countDocuments({ project_id: p._id, lane: 'ops' })).toBe(4);
    const { model, provenance } = await loadProjectModel(p._id);
    expect(model.design.Easy?.ops?.['0.7']).toBe(findLane(MODEL, 'ops', 'Easy').p70);
    expect(model.design.Easy?.design).toEqual(EMPIRICAL.design.Easy!.design); // the failed lane is snapshot-filled
    expect(provenance.source).toContain('from snapshot');
  });

  it('a project code with no numeric RT id skips the Ares half — nothing read, the grid untouched, throughput still refreshed, an ok row (review A2-8 / X4)', async () => {
    const p = await seedProject({ code: 'rt-test' });
    await ModelGrid.create({ project_id: p._id, difficulty: 'Easy', lane: 'design', metric: 'design', confidence: '0.7', value: 1, sample_n: 20 });
    await ThroughputGrid.create({ project_id: p._id, difficulty: 'Easy', p25: 9, p50: 9, p70: 9 }); // stale: the fixture completes one Medium card, no Easy
    const { ares, asked } = aresWith(MODEL);
    const stats = await refreshProjectModel(p._id, { ares });
    expect(asked).toEqual([]);
    expect(stats.modelSkipped).toBe('non-rt-code');
    expect(stats).toMatchObject({ generatedAt: null, window: null, laneCellCount: null, cells: { mapped: 0, unmapped: 0, passed: 0, failed: 0 }, alerts: [], throughputRows: 1 });
    expect(await ModelGrid.countDocuments({ project_id: p._id })).toBe(1); // last good grid kept
    expect((await ThroughputGrid.find({ project_id: p._id }).lean()).map((r) => r.difficulty)).toEqual(['Medium']); // recomputed from local completions
    const run = await SyncRun.findOne({ project_id: p._id, source: 'model' }).lean();
    expect(run?.ok).toBe(true);
    expect((run!.stats as { modelSkipped: unknown }).modelSkipped).toBe('non-rt-code');
  });

  it('the nightly runner gives `rt-test` an ok row, not an error row — no client is built for a project with no model to read', async () => {
    const p = await seedProject({ code: 'rt-test' });
    await runModelRefresh(); // no injected client: an Ares call here would reach for env it does not have
    const runs = await SyncRun.find({ project_id: p._id, source: 'model' }).lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ ok: true });
    expect(runs[0]!.error).toBeUndefined();
    expect(await ThroughputGrid.countDocuments({ project_id: p._id })).toBe(1);
  });

  it('a model Ares cannot serve keeps last night\'s grid (FR-8.5) and surfaces as the thrown error the runner records', async () => {
    const p = await seedProject();
    await refreshProjectModel(p._id, deps(MODEL));
    const before = await ModelGrid.countDocuments({ project_id: p._id });
    expect(before).toBeGreaterThan(0);
    await expect(refreshProjectModel(p._id, deps(null))).rejects.toThrow(/model unavailable/);
    expect(await ModelGrid.countDocuments({ project_id: p._id })).toBe(before);
  });

  it('loader assembles a per-project model from the written cells; review stays the snapshot\'s; forecast consumes it', async () => {
    const p = await seedProject();

    const before = await loadProjectModel(p._id);
    expect(before.provenance.fallback).toBe(true);
    expect(before.model).toEqual(EMPIRICAL);

    await refreshProjectModel(p._id, deps(MODEL));
    const after = await loadProjectModel(p._id);
    expect(after.provenance.fallback).toBe(false);
    const medium = findLane(MODEL, 'design', 'Medium');
    expect(after.model.design.Medium?.design).toEqual({
      Average: medium.meanWorkingDays, '0.7': medium.p70, '0.85': medium.p85, '0.95': medium.p95, n: medium.n,
    });
    expect(after.model.review).toEqual(EMPIRICAL.review); // no review cell is ever written
    expect(after.provenance.sampleSizes['Medium/design/design']).toBe(medium.n);

    const f = forecast(
      { difficulty: 'Medium', currentList: 'Working on Design', labels: [], startDate: '2026-08-03', confidence: '0.7', slaSketch: null, slaRender: null },
      after.model,
    );
    expect(f.sketchDesign).toBe(medium.p70);
  });

  it('a sparse grid snapshot-fills missing difficulties — designCell must never dereference undefined (live 500, 2026-08-13)', async () => {
    // Ares reports ONE Easy/design lane cell → no Medium or Hard design cells;
    // lib/model's verbatim fallback walk (difficulty → Medium → lane →
    // 'design') assumes those keys exist
    const p = await seedProject();
    await refreshProjectModel(p._id, deps(withLaneCells([findLane(MODEL, 'design', 'Easy')])));
    expect(await ModelGrid.countDocuments({ project_id: p._id, metric: 'design', difficulty: 'Medium' })).toBe(0); // grid IS sparse
    expect(await ModelGrid.countDocuments({ project_id: p._id })).toBe(4);

    const { model, provenance } = await loadProjectModel(p._id);
    expect(provenance.fallback).toBe(false); // refreshed grid, not the whole-model fallback
    expect(model.design.Medium).toBeDefined(); // snapshot-filled
    expect(model.design.Hard).toBeDefined();
    expect(() =>
      forecast(
        { difficulty: 'Hard', currentList: 'Design', labels: [], startDate: '2026-08-13', confidence: '0.7', slaSketch: null, slaRender: null },
        model,
      ),
    ).not.toThrow();
  });

  it('a tier present but missing the design lane fills per LANE — a design-lane card must not forecast off the ops cell', async () => {
    // the only cell Ares reports is Easy/ops, so the grid carries design.Easy.ops
    // and nothing else. designCell's verbatim chain is lane → 'design' → FIRST
    // cell, so without the per-lane fill a 'Working on Design' card would be
    // forecast off the ops cell instead of the snapshot's 0.94.
    const p = await seedProject();
    const ops = findLane(MODEL, 'ops', 'Easy');
    await refreshProjectModel(p._id, deps(withLaneCells([ops])));

    const { model, provenance } = await loadProjectModel(p._id);
    expect(model.design.Easy?.ops?.['0.7']).toBe(ops.p70); // the MEASURED lane still wins
    expect(model.design.Easy?.design).toEqual(EMPIRICAL.design.Easy!.design); // the absent one is snapshot-filled
    /* FR-7.7 visibility. The count is DERIVED from the snapshot's own Easy tier
       (rule 2) — block 12 retired the assets cell, so that tier now has exactly
       one lane left for the fill to report, and the provenance string is
       correctly singular. Pinning the plural would break again the next time
       the snapshot's lane set changes. */
    const filled = Object.keys(EMPIRICAL.design.Easy!).filter((l) => l !== 'ops').length;
    expect(filled, 'the fixture must leave a lane for the fill to report').toBeGreaterThan(0);
    expect(provenance.source).toContain(`${filled} lane${filled === 1 ? '' : 's'} from snapshot`);

    const f = forecast(
      { difficulty: 'Easy', currentList: 'Working on Design', labels: [], startDate: '2026-08-03', confidence: '0.7', slaSketch: null, slaRender: null },
      model,
    );
    expect(f.lane).toBe('design');
    expect(f.sketchDesign).toBe(EMPIRICAL.design.Easy!.design!['0.7']); // 0.94, not the ops cell
  });

  /* ------------------------------------------------------------------ */
  /* THE FREEZE (JP, 2026-08-27) — invariant 7's release gate, enforced.  */
  /* ------------------------------------------------------------------ */

  it('a FROZEN project forecasts off the snapshot and ignores its own grid', async () => {
    const p = await seedProject();
    await refreshProjectModel(p._id, deps(MODEL));
    const measured = await ModelGrid.countDocuments({ project_id: p._id });
    expect(measured, 'no grid was written — the guard would pass vacuously').toBeGreaterThan(0);

    await Project.updateOne({ _id: p._id }, { $set: { model_frozen: true } });
    const { model, provenance } = await loadProjectModel(p._id);

    // the shipped reference figures, not the refreshed ones
    expect(model.design.Medium!.design!['0.7']).toBe(EMPIRICAL.design.Medium!.design!['0.7']);
    expect(model.design.Medium!.design!['0.7']).not.toBe(findLane(MODEL, 'design', 'Medium').p70);
    expect(provenance.fallback).toBe(true);
    expect(provenance.source).toContain('FROZEN');
    expect(provenance.source).toContain(`${measured} measured cells held`);
  });

  it('freezing gates the READ, never the collection — nothing measured is lost', async () => {
    const p = await seedProject({ model_frozen: true });

    /* The nightly refresh keeps running and keeps writing while frozen. The
       gated grid is the evidence JP unfreezes on, so a freeze that stopped it
       would cost exactly the thing the decision needs. */
    const stats = await refreshProjectModel(p._id, deps(MODEL));
    expect(stats.cells.passed).toBeGreaterThan(0);
    expect(await ModelGrid.countDocuments({ project_id: p._id })).toBeGreaterThan(0);
    // …and the read is still the snapshot
    expect((await loadProjectModel(p._id)).provenance.source).toContain('FROZEN');
  });

  it('the refresh NEVER writes model_frozen — frozen stays frozen, unfrozen stays unfrozen, and no project update is issued', async () => {
    /* Invariant 7: unfreeze is JP's, per project, by hand. Neither a green
       gate nor a red one may touch the field. Two projects, both polarities,
       plus a spy on every Project update path the worker could reach. */
    const spies = [
      vi.spyOn(Project, 'updateOne'),
      vi.spyOn(Project, 'updateMany'),
      vi.spyOn(Project, 'findOneAndUpdate'),
      vi.spyOn(Project, 'findByIdAndUpdate'),
      vi.spyOn(Project, 'replaceOne'),
    ];
    const frozen = await seedProject({ code: 'rt-1', model_frozen: true });
    const open = await seedProject({ code: 'rt-2', model_frozen: false });
    await refreshProjectModel(frozen._id, deps(MODEL)); // green gate
    await refreshProjectModel(open._id, deps({ ...MODEL, historyUnverified: MODEL.dropped.sampled })); // red gate
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect((await Project.findById(frozen._id).lean())?.model_frozen).toBe(true);
    expect((await Project.findById(open._id).lean())?.model_frozen).toBe(false);
  });

  it('defaults to FROZEN — a project passes the gate by decision, not by a job running', () => {
    /* Invariant 7 says the empirical model is a release GATE. A default of
       false would let any new project start forecasting off whatever its first
       nightly run happened to learn, which is how the live board ended up
       blending five bad cells into good ones. */
    const fresh = new Project({ code: 'rt-new', name: 'N', trello_board_id: 'b', weekly_capacity: 10 });
    expect(fresh.model_frozen).toBe(true);
  });

  it('serves the model with provenance over HTTP (T043; AC-11 data side)', async () => {
    const p = await seedProject();
    await refreshProjectModel(p._id, deps(MODEL));
    const user = await User.create({ email: 'member@frostdesigngroup.com' });
    await UserProject.create({ user_id: user._id, project_id: p._id });

    const app = createApp({ env, redis: null, mongo: null });
    const agent = request.agent(app);
    await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
    const res = await agent.get(`/api/projects/${p._id}/model`).expect(200);
    expect(res.body.provenance.fallback).toBe(false);
    expect(res.body.provenance.sampleSizes).toBeDefined();
    expect(res.body.lastRefresh.ok).toBe(true);
    expect(res.body.model.design.Medium.design['0.7']).toBe(findLane(MODEL, 'design', 'Medium').p70);
    expect(res.body.model.review['0.7']).toBe(EMPIRICAL.review['0.7']);
  });
});
