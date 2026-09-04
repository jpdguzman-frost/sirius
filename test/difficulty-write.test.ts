/**
 * T111 — W3 difficulty write (BRD-§9-A1, approved by JP 2026-08-12):
 * optimistic-with-rollback semantics, audit + sync_runs on success AND
 * failure, no-op guard, and the label-swap mechanics — add-first ordering,
 * stale-label removal, restore on partial failure
 * (contracts/trello-write.md W3; invariants 2, 8, 17).
 *
 * Re-pointed at the WORK CARD 2026-09-05 (product owl #78; contracts/
 * trello-write.md §W1/W3 scope clarification). The deliverable route is
 * DELETED (PLAN decision D2); the cross-kind cases guard its absence. The
 * main card's own difficulty label stays read-only and reconciled (D1) — it
 * still keys the Pipeline forecast, which is why the cross-kind case checks
 * the main card's value did not move.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { TrelloClient, type TrelloWriter } from '../lib/trello.ts';
import { AuditLog, Deliverable, Project, SyncRun, User, UserProject, WorkCard } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

class StubTrello implements TrelloWriter {
  calls: Array<{ cardId: string; boardId: string; difficulty: string }> = [];
  fail = false;
  async ensureUrgentLabel(): Promise<string> {
    return 'label-1';
  }
  async setUrgency(): Promise<void> {} // W1 lives in urgency.test.ts
  async setDue(): Promise<void> {} // W2 lives in deadline-write.test.ts
  async setDifficulty(cardId: string, boardId: string, difficulty: 'Easy' | 'Medium' | 'Hard'): Promise<void> {
    if (this.fail) throw new Error('Trello POST /cards failed: HTTP 500');
    this.calls.push({ cardId, boardId, difficulty });
  }
}

/**
 * One MC group: the main card `card1` (Medium, which W3 must NOT touch) and
 * the task card `task1` under it (Medium, which W3 writes).
 */
async function setup(envOver: Record<string, string> = {}, projectOver: Record<string, unknown> = {}, taskOver: Record<string, unknown> = {}) {
  const env = validateEnv({ NODE_ENV: 'test', ...envOver });
  const project = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'testBoardX', weekly_capacity: 3, ...projectOver });
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  await Deliverable.create({
    project_id: project._id, mc_number: 'MC-1', display_id: 'MC-1', trello_card_id: 'card1', name: 'D1', difficulty: 'Medium',
  });
  await WorkCard.create({
    project_id: project._id, mc_number: 'MC-1', trello_card_id: 'task1',
    name: 'Render Asset: MC-1 exports', current_list: 'Backlogs', difficulty: 'Medium', ...taskOver,
  });
  const trello = new StubTrello();
  const app = createApp({ env, redis: null, mongo: null, trello });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, agent, trello };
}

const patchDifficulty = (agent: request.Agent, projectId: unknown, cardId: string, difficulty: string) =>
  agent.patch(`/api/projects/${projectId}/workcards/${cardId}/difficulty`).send({ difficulty });

describe('W3 — difficulty write, on the WORK CARD (BRD-§9-A1; owl #78)', () => {
  it('persists the new value only after Trello succeeded, and everything is audited as work_card', async () => {
    const { project, agent, trello } = await setup();
    const res = await patchDifficulty(agent, project._id, 'task1', 'Hard').expect(200);
    expect(res.body).toEqual({ ok: true, difficulty: 'Hard' });
    const doc = await WorkCard.findOne({ trello_card_id: 'task1' });
    expect(doc?.difficulty).toBe('Hard');
    // the stamp a later reconcile compares its fetch instant against (owl #50)
    expect(doc?.registry_written_at).toBeInstanceOf(Date);
    expect(trello.calls).toEqual([{ cardId: 'task1', boardId: 'testBoardX', difficulty: 'Hard' }]);
    const row = await AuditLog.findOne({ action: 'difficulty.set' });
    expect(row?.entity).toBe('work_card');
    expect(row?.entity_id).toBe('task1');
    expect(row?.before).toEqual({ difficulty: 'Medium' });
    expect(row?.after).toEqual({ difficulty: 'Hard' });
    const run = await SyncRun.findOne({ source: 'trello_write', ok: true });
    expect(run?.stats?.kind).toBe('work_card');
    expect(await SyncRun.countDocuments({ source: 'trello_write' })).toBe(1);
    // the main card beside it is untouched — the write went to the task
    const main = await Deliverable.findOne({ trello_card_id: 'card1' });
    expect(main?.difficulty).toBe('Medium');
    expect(main?.registry_written_at).toBeUndefined();
  });

  it('a failed Trello write leaves local state untouched and records the failure', async () => {
    const { project, agent, trello } = await setup();
    trello.fail = true;
    const res = await patchDifficulty(agent, project._id, 'task1', 'Hard');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('TRELLO_WRITE_FAILED');
    const doc = await WorkCard.findOne({ trello_card_id: 'task1' });
    expect(doc?.difficulty).toBe('Medium'); // never diverges from Trello
    // no stamp either: Trello was never changed, so there is nothing a later
    // read could contradict and nothing to shield from reconcile (owl #50)
    expect(doc?.registry_written_at).toBeUndefined();
    const failRow = await AuditLog.findOne({ action: 'difficulty.set_failed' });
    expect(failRow?.entity).toBe('work_card');
    expect(failRow?.entity_id).toBe('task1');
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: false })).toBe(1);
  });

  it('no-op guard: a same-value write makes no Trello call and writes no audit row', async () => {
    const { project, agent, trello } = await setup();
    const res = await patchDifficulty(agent, project._id, 'task1', 'Medium');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_OP');
    expect(trello.calls).toHaveLength(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('rejects values outside Easy/Medium/Hard', async () => {
    const { project, agent } = await setup();
    const res = await patchDifficulty(agent, project._id, 'task1', 'Extreme');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });

  it('a card with no difficulty label yet can be set (the missing-difficulty fix path)', async () => {
    const { project, agent } = await setup();
    await WorkCard.updateOne({ trello_card_id: 'task1' }, { $unset: { difficulty: '' } });
    await patchDifficulty(agent, project._id, 'task1', 'Easy').expect(200);
    expect((await WorkCard.findOne({ trello_card_id: 'task1' }))?.difficulty).toBe('Easy');
  });

  it('invariant 17: refuses to write to a production board outside production', async () => {
    const { project, agent, trello } = await setup({ PROD_TRELLO_BOARD_IDS: 'testBoardX' });
    const res = await patchDifficulty(agent, project._id, 'task1', 'Hard');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCTION_BOARD_GUARD');
    expect(trello.calls).toHaveLength(0);
  });

  it('G7: a read-only project refuses through the same door with WRITES_DISABLED', async () => {
    const { project, agent, trello } = await setup({}, { writes_enabled: false });
    const res = await patchDifficulty(agent, project._id, 'task1', 'Hard');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRITES_DISABLED');
    expect(trello.calls).toHaveLength(0);
    expect((await WorkCard.findOne({ trello_card_id: 'task1' }))?.difficulty).toBe('Medium');
  });

  it('a DEACTIVATED work card no longer answers writes — kind flips leave ghosts (2026-08-18 review)', async () => {
    const { project, agent } = await setup({}, {}, { active: false });
    const res = await patchDifficulty(agent, project._id, 'task1', 'Hard');
    expect(res.status).toBe(404);
  });

  it('CROSS-KIND: a main-card id on the work-card route is a 404 — W3 cannot reach the main card', async () => {
    /* PLAN decision D2. `card1` is a DELIVERABLE, active, in the same project,
       and Hard ≠ its Medium so the no-op guard cannot be what stops it: only
       the collection the route looks up stands between this request and a
       wrong-target write that would silently re-key the Pipeline forecast. */
    const { project, agent, trello } = await setup();
    const res = await patchDifficulty(agent, project._id, 'card1', 'Hard');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(trello.calls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.difficulty).toBe('Medium');
  });

  it('CROSS-KIND: the deliverable-scoped route no longer exists (404), for either card id', async () => {
    const { project, agent, trello } = await setup();
    for (const id of ['card1', 'task1']) {
      const res = await agent.patch(`/api/projects/${project._id}/deliverables/${id}/difficulty`).send({ difficulty: 'Hard' });
      expect(res.status, id).toBe(404);
    }
    expect(trello.calls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });
});

describe('TrelloClient.setDifficulty — label-swap mechanics', () => {
  /** fetch stub over a board with the full Difficulty taxonomy and a card wearing `Difficulty: Medium`. */
  function makeFetch(opts: { failRemoval?: boolean } = {}) {
    const ops: string[] = [];
    const fetchImpl = (async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      const path = u.split('?')[0]!.replace('https://api.trello.com/1', '');
      ops.push(`${method} ${path}`);
      if (method === 'GET' && path === '/boards/b1/labels') {
        return new Response(JSON.stringify([
          { id: 'l-easy', name: 'Difficulty: Easy' },
          { id: 'l-med', name: 'Difficulty: Medium' },
          { id: 'l-hard', name: 'Difficulty: Hard' },
          { id: 'l-urgent', name: 'Urgent' },
        ]), { status: 200 });
      }
      if (method === 'GET' && path === '/cards/c1/labels') {
        return new Response(JSON.stringify([
          { id: 'l-med', name: 'Difficulty: Medium' },
          { id: 'l-urgent', name: 'Urgent' },
        ]), { status: 200 });
      }
      if (method === 'POST' && path === '/cards/c1/idLabels') {
        return new Response('{}', { status: 200 });
      }
      if (method === 'DELETE' && path.startsWith('/cards/c1/idLabels/')) {
        if (opts.failRemoval && path.endsWith('/l-med')) return new Response('boom', { status: 500 });
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    return { ops, fetchImpl };
  }

  it('adds the new label BEFORE removing the stale one — the card never lacks a difficulty', async () => {
    const { ops, fetchImpl } = makeFetch();
    const client = new TrelloClient('k', 't', fetchImpl);
    await client.setDifficulty('c1', 'b1', 'Hard');
    const writes = ops.filter((o) => !o.startsWith('GET'));
    expect(writes).toEqual(['POST /cards/c1/idLabels', 'DELETE /cards/c1/idLabels/l-med']);
  });

  it('restores the original state when stale-label removal fails, then reports failure', async () => {
    const { ops, fetchImpl } = makeFetch({ failRemoval: true });
    const client = new TrelloClient('k', 't', fetchImpl);
    await expect(client.setDifficulty('c1', 'b1', 'Hard')).rejects.toThrow(/HTTP 500/);
    // the just-added Hard label is removed again so Trello returns to Medium-only
    expect(ops).toContain('DELETE /cards/c1/idLabels/l-hard');
  });

  it('creates a missing taxonomy label on demand (test boards), then caches it', async () => {
    const ops: string[] = [];
    const fetchImpl = (async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      const path = u.split('?')[0]!.replace('https://api.trello.com/1', '');
      ops.push(`${method} ${path}`);
      if (method === 'GET' && path === '/boards/b1/labels') {
        return new Response(JSON.stringify([{ id: 'l-urgent', name: 'Urgent' }]), { status: 200 });
      }
      if (method === 'POST' && path === '/boards/b1/labels') {
        return new Response(JSON.stringify({ id: 'l-new', name: 'Difficulty: Easy' }), { status: 200 });
      }
      if (method === 'GET' && path === '/cards/c1/labels') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (method === 'POST' && path === '/cards/c1/idLabels') {
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    const client = new TrelloClient('k', 't', fetchImpl);
    await client.setDifficulty('c1', 'b1', 'Easy');
    await client.setDifficulty('c2', 'b1', 'Easy').catch(() => {}); // second card: label id comes from cache
    expect(ops.filter((o) => o === 'GET /boards/b1/labels')).toHaveLength(1);
    expect(ops.filter((o) => o === 'POST /boards/b1/labels')).toHaveLength(1);
  });
});
