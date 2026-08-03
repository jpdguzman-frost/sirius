/**
 * T040/T041/T042 — model refresh: dwell derivation, percentile math,
 * BR-4 keying, throughput, delta alerts, per-project loader fallback and
 * the model read route (FR-7.6, FR-7.7; AC-11 data side).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import {
  computeModelGrid,
  computeThroughput,
  deriveSamples,
  gridDelta,
  percentile,
} from '../src/services/model-refresh.ts';
import { refreshProjectModel } from '../worker/refreshModel.ts';
import { loadProjectModel } from '../src/services/model-grid.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { CardEvent, Deliverable, ModelGrid, Project, ThroughputGrid, User, UserProject } from '../src/models/index.ts';
import { EMPIRICAL } from '../lib/model.ts';

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

const at = (h: number) => new Date(Date.UTC(2026, 6, 1, h)); // hours from July 1

describe('derivation (pure)', () => {
  it('derives design dwell from ongoing lists and review dwell from the review list', () => {
    const events = [
      { trello_card_id: 'c1', to_list: 'Design', occurred_at: at(0) },
      { trello_card_id: 'c1', to_list: 'Sent for Client Review', occurred_at: at(24) }, // 1d design
      { trello_card_id: 'c1', to_list: 'Done', occurred_at: at(24 + 48) }, // 2d review
    ];
    const samples = deriveSamples(events, [{ trello_card_id: 'c1', difficulty: 'Medium', lane: 'design' }]);
    expect(samples).toHaveLength(2);
    expect(samples.find((s) => s.metric === 'design')?.days).toBe(1);
    expect(samples.find((s) => s.metric === 'review')?.days).toBe(2);
  });

  it('excludes open intervals, pending lists, and cards without difficulty (BR-4 key)', () => {
    const events = [
      { trello_card_id: 'c1', to_list: 'Production Backlog', occurred_at: at(0) }, // pending → no sample
      { trello_card_id: 'c1', to_list: 'Design', occurred_at: at(10) }, // open interval → excluded
      { trello_card_id: 'c2', to_list: 'Design', occurred_at: at(0) },
      { trello_card_id: 'c2', to_list: 'Done', occurred_at: at(24) }, // no difficulty → excluded
    ];
    const samples = deriveSamples(events, [
      { trello_card_id: 'c1', difficulty: 'Easy', lane: 'design' },
      { trello_card_id: 'c2', difficulty: null, lane: 'design' },
    ]);
    expect(samples).toHaveLength(0);
  });

  it('percentile() interpolates linearly; grid cells carry sample_n (FR-7.7)', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10], 0.95)).toBe(10);

    const samples = Array.from({ length: 10 }, (_, i) => ({
      trello_card_id: `c${i}`,
      difficulty: 'Medium' as const,
      lane: 'design' as const,
      metric: 'design' as const,
      days: i + 1,
      completed_at: at(i),
    }));
    const grid = computeModelGrid(samples);
    const avg = grid.find((c) => c.confidence === 'Average')!;
    expect(avg.value).toBe(5.5);
    expect(avg.sample_n).toBe(10);
    expect(grid.find((c) => c.confidence === '0.7')?.value).toBe(7.3);
  });

  it('BR-4: Easy/assets and Easy/design land in separate cells', () => {
    const mk = (card: string, lane: 'design' | 'assets', days: number) => ({
      trello_card_id: card, difficulty: 'Easy' as const, lane, metric: 'design' as const, days, completed_at: at(0),
    });
    const grid = computeModelGrid([mk('a', 'design', 1), mk('b', 'assets', 10)]);
    const design = grid.find((c) => c.lane === 'design' && c.confidence === 'Average');
    const assets = grid.find((c) => c.lane === 'assets' && c.confidence === 'Average');
    expect(design?.value).toBe(1);
    expect(assets?.value).toBe(10);
  });

  it('throughput counts done-entries per week per difficulty', () => {
    const events = [
      { trello_card_id: 'c1', to_list: 'Done', occurred_at: new Date('2026-07-06T10:00:00Z') },
      { trello_card_id: 'c2', to_list: 'Done', occurred_at: new Date('2026-07-07T10:00:00Z') },
      { trello_card_id: 'c3', to_list: 'Done', occurred_at: new Date('2026-07-14T10:00:00Z') },
    ];
    const rows = computeThroughput(events, [
      { trello_card_id: 'c1', difficulty: 'Easy', lane: 'design' },
      { trello_card_id: 'c2', difficulty: 'Easy', lane: 'design' },
      { trello_card_id: 'c3', difficulty: 'Easy', lane: 'design' },
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
});

describe('refresh + loader (integration)', () => {
  async function seedProjectWithHistory() {
    const p = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120 });
    await Deliverable.create({
      project_id: p._id, mc_number: 'MC-1', display_id: 'MC-1', trello_card_id: 'c1',
      name: 'D1', difficulty: 'Medium', lane: 'design',
    });
    await CardEvent.insertMany([
      { project_id: p._id, trello_card_id: 'c1', source_event_id: 'e1', to_list: 'Design', occurred_at: at(0) },
      { project_id: p._id, trello_card_id: 'c1', source_event_id: 'e2', to_list: 'Sent for Client Review', occurred_at: at(36) },
      { project_id: p._id, trello_card_id: 'c1', source_event_id: 'e3', to_list: 'Done', occurred_at: at(36 + 60) },
    ]);
    return p;
  }

  it('writes model_grid + throughput_grid and records deltas on re-run', async () => {
    const p = await seedProjectWithHistory();
    const s1 = await refreshProjectModel(p._id);
    expect(s1.samples).toBe(2);
    expect(await ModelGrid.countDocuments({ project_id: p._id })).toBe(8); // design cell + global review cell × 4 confidences
    expect(await ThroughputGrid.countDocuments({ project_id: p._id })).toBe(1);
    const s2 = await refreshProjectModel(p._id);
    expect(s2.alerts).toHaveLength(0); // same inputs → no shift
  });

  it('loader assembles a per-project model; forecast consumes it; fallback is visible', async () => {
    const p = await seedProjectWithHistory();

    const before = await loadProjectModel(p._id);
    expect(before.provenance.fallback).toBe(true);
    expect(before.model).toEqual(EMPIRICAL);

    await refreshProjectModel(p._id);
    const after = await loadProjectModel(p._id);
    expect(after.provenance.fallback).toBe(false);
    expect(after.model.design.Medium?.design?.['0.7']).toBe(1.5); // 36h dwell
    expect(after.model.review['0.7']).toBe(2.5); // 60h dwell
    expect(after.provenance.sampleSizes['Medium/design/design']).toBe(1);
  });

  it('serves the model with provenance over HTTP (T043; AC-11 data side)', async () => {
    const p = await seedProjectWithHistory();
    await refreshProjectModel(p._id);
    const user = await User.create({ email: 'member@frostdesigngroup.com' });
    await UserProject.create({ user_id: user._id, project_id: p._id });

    const app = createApp({ env, redis: null, mongo: null });
    const agent = request.agent(app);
    await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
    const res = await agent.get(`/api/projects/${p._id}/model`).expect(200);
    expect(res.body.provenance.fallback).toBe(false);
    expect(res.body.provenance.sampleSizes).toBeDefined();
    expect(res.body.lastRefresh.ok).toBe(true);
    expect(res.body.model.review['0.7']).toBe(2.5);
  });
});
