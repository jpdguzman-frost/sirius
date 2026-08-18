/**
 * T111 — W3 difficulty write (BRD-§9-A1, approved by JP 2026-08-12):
 * optimistic-with-rollback semantics, audit + sync_runs on success AND
 * failure, no-op guard, and the label-swap mechanics — add-first ordering,
 * stale-label removal, restore on partial failure
 * (contracts/trello-write.md W3; invariants 2, 8, 17).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { TrelloClient, type TrelloWriter } from '../lib/trello.ts';
import { AuditLog, Deliverable, Project, SyncRun, User, UserProject } from '../src/models/index.ts';

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

async function setup() {
  const env = validateEnv({ NODE_ENV: 'test' });
  const project = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'testBoardX', weekly_capacity: 3 });
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  await Deliverable.create({
    project_id: project._id, mc_number: 'MC-1', display_id: 'MC-1', trello_card_id: 'card1', name: 'D1', difficulty: 'Medium',
  });
  const trello = new StubTrello();
  const app = createApp({ env, redis: null, mongo: null, trello });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, agent, trello };
}

describe('W3 — difficulty write (BRD-§9-A1)', () => {
  it('persists the new value only after Trello succeeded, and everything is audited', async () => {
    const { project, agent, trello } = await setup();
    await agent.patch(`/api/projects/${project._id}/deliverables/card1/difficulty`).send({ difficulty: 'Hard' }).expect(200);
    const doc = await Deliverable.findOne({ trello_card_id: 'card1' });
    expect(doc?.difficulty).toBe('Hard');
    // the stamp a later reconcile compares its read instant against (owl #50)
    expect(doc?.registry_written_at).toBeInstanceOf(Date);
    expect(trello.calls).toEqual([{ cardId: 'card1', boardId: 'testBoardX', difficulty: 'Hard' }]);
    expect(await AuditLog.countDocuments({ action: 'difficulty.set' })).toBe(1);
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: true })).toBe(1);
  });

  it('a failed Trello write leaves local state untouched and records the failure', async () => {
    const { project, agent, trello } = await setup();
    trello.fail = true;
    const res = await agent.patch(`/api/projects/${project._id}/deliverables/card1/difficulty`).send({ difficulty: 'Hard' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('TRELLO_WRITE_FAILED');
    const doc = await Deliverable.findOne({ trello_card_id: 'card1' });
    expect(doc?.difficulty).toBe('Medium'); // never diverges from Trello
    // no stamp either: Trello was never changed, so there is nothing a later
    // read could contradict and nothing to shield from reconcile (owl #50)
    expect(doc?.registry_written_at).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'difficulty.set_failed' })).toBe(1);
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: false })).toBe(1);
  });

  it('no-op guard: a same-value write makes no Trello call and writes no audit row', async () => {
    const { project, agent, trello } = await setup();
    const res = await agent.patch(`/api/projects/${project._id}/deliverables/card1/difficulty`).send({ difficulty: 'Medium' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_OP');
    expect(trello.calls).toHaveLength(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('rejects values outside Easy/Medium/Hard', async () => {
    const { project, agent } = await setup();
    const res = await agent.patch(`/api/projects/${project._id}/deliverables/card1/difficulty`).send({ difficulty: 'Extreme' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });

  it('a card with no difficulty label yet can be set (the missing-difficulty fix path)', async () => {
    const { project, agent } = await setup();
    await Deliverable.updateOne({ trello_card_id: 'card1' }, { $unset: { difficulty: '' } });
    await agent.patch(`/api/projects/${project._id}/deliverables/card1/difficulty`).send({ difficulty: 'Easy' }).expect(200);
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.difficulty).toBe('Easy');
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
