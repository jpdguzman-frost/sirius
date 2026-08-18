/**
 * T064 — the one write: optimistic-with-rollback semantics, audit +
 * sync_runs on success AND failure, absence-means-non-urgent round-trip,
 * invariant-17 production-board guard, local-row rejection
 * (FR-4.6, FR-4.7; invariants 2, 8, 17).
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
  calls: Array<{ cardId: string; boardId: string; urgent: boolean }> = [];
  fail = false;
  async ensureUrgentLabel(): Promise<string> {
    return 'label-1';
  }
  async setUrgency(cardId: string, boardId: string, urgent: boolean): Promise<void> {
    if (this.fail) throw new Error('Trello POST /cards failed: HTTP 500');
    this.calls.push({ cardId, boardId, urgent });
  }
  async setDue(): Promise<void> {} // W2 lives in deadline-write.test.ts
  async setDifficulty(): Promise<void> {} // W3 lives in difficulty-write.test.ts
}

async function setup(envOver: Record<string, string> = {}) {
  const env = validateEnv({ NODE_ENV: 'test', ...envOver });
  const project = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'testBoardX', weekly_capacity: 3 });
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  await Deliverable.create({
    project_id: project._id, mc_number: 'MC-1', display_id: 'MC-1', trello_card_id: 'card1', name: 'D1',
  });
  const trello = new StubTrello();
  const app = createApp({ env, redis: null, mongo: null, trello });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, agent, trello };
}

describe('the one write (FR-4.6)', () => {
  it('adds then removes the label — absence means non-urgent, and everything is audited', async () => {
    const { project, agent, trello } = await setup();
    await agent.patch(`/api/projects/${project._id}/deliverables/card1/urgency`).send({ urgent: true }).expect(200);
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.urgency).toBe('Urgent');

    await agent.patch(`/api/projects/${project._id}/deliverables/card1/urgency`).send({ urgent: false }).expect(200);
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.urgency).toBe('Non-Urgent');

    expect(trello.calls).toEqual([
      { cardId: 'card1', boardId: 'testBoardX', urgent: true },
      { cardId: 'card1', boardId: 'testBoardX', urgent: false },
    ]);
    expect(await AuditLog.countDocuments({ action: 'urgency.set' })).toBe(2);
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: true })).toBe(2);
  });

  it('FR-4.7: a failed Trello write leaves local state untouched and records the failure', async () => {
    const { project, agent, trello } = await setup();
    trello.fail = true;
    const res = await agent.patch(`/api/projects/${project._id}/deliverables/card1/urgency`).send({ urgent: true });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('TRELLO_WRITE_FAILED');
    const doc = await Deliverable.findOne({ trello_card_id: 'card1' });
    expect(doc?.urgency).toBe('Non-Urgent'); // never diverges from Trello
    expect(doc?.registry_written_at).toBeUndefined(); // nothing written, nothing to shield (owl #50)
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: false })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'urgency.set_failed' })).toBe(1);
  });

  it('invariant 17: refuses to write to a production board outside production', async () => {
    const { project, agent, trello } = await setup({ PROD_TRELLO_BOARD_IDS: 'testBoardX,otherProd' });
    const res = await agent.patch(`/api/projects/${project._id}/deliverables/card1/urgency`).send({ urgent: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCTION_BOARD_GUARD');
    expect(trello.calls).toHaveLength(0);
  });

  it('rejects local duplicated rows — no Trello card to label', async () => {
    const { project, agent } = await setup();
    await Deliverable.create({
      project_id: project._id, mc_number: 'MC-1', display_id: 'MC-1 (copy)', trello_card_id: 'local-abc', name: 'Copy',
    });
    const res = await agent.patch(`/api/projects/${project._id}/deliverables/local-abc/urgency`).send({ urgent: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LOCAL_ROW');
  });
});

describe('TrelloClient label bootstrap', () => {
  it('creates the Urgent label when the board lacks one (0/26 boards today), then caches it', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: unknown) => {
      const u = String(url);
      calls.push(u.split('?')[0]!);
      if (u.includes('/boards/b1/labels') && !u.includes('name=')) {
        return new Response(JSON.stringify([{ id: 'l-other', name: 'Design Team' }]), { status: 200 });
      }
      if (u.includes('/boards/b1/labels?name=')) {
        return new Response(JSON.stringify({ id: 'l-urgent', name: 'Urgent' }), { status: 200 });
      }
      if (u.includes('/cards/c1/idLabels')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    const client = new TrelloClient('k', 't', fetchImpl);
    await client.setUrgency('c1', 'b1', true);
    await client.setUrgency('c1', 'b1', false);
    const labelFetches = calls.filter((c) => c.includes('/boards/b1/labels'));
    expect(labelFetches.length).toBe(2); // list + create — then cached, never refetched
  });

  it('error messages never contain the credential', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const client = new TrelloClient('SECRETKEY', 'SECRETTOKEN', fetchImpl);
    await expect(client.ensureUrgentLabel('b1')).rejects.toThrow(/HTTP 500/);
    await expect(client.ensureUrgentLabel('b1')).rejects.not.toThrow(/SECRET/);
  });
});
