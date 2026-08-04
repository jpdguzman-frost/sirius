/**
 * T079 — W2 due-date write (FR-9.1, FR-9.3; contracts/trello-write.md):
 * set/change/clear with Trello-first rollback semantics, 17:00 Manila
 * default with existing time-of-day preserved, the no-op guard, the
 * invariant-17 board guard, and audit + sync_runs on every attempt.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { composeDueIso, type TrelloWriter } from '../lib/trello.ts';
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
  dueCalls: Array<{ cardId: string; dueIso: string | null }> = [];
  fail = false;
  async ensureUrgentLabel(): Promise<string> {
    return 'label-1';
  }
  async setUrgency(): Promise<void> {}
  async setDue(cardId: string, dueIso: string | null): Promise<void> {
    if (this.fail) throw new Error('Trello PUT /cards failed: HTTP 500');
    this.dueCalls.push({ cardId, dueIso });
  }
}

async function setup(envOver: Record<string, string> = {}, deliverable: Record<string, unknown> = {}) {
  const env = validateEnv({ NODE_ENV: 'test', ...envOver });
  const project = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'testBoardX', weekly_capacity: 3 });
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  await Deliverable.create({
    project_id: project._id, mc_number: 'MC-1', display_id: 'MC-1', trello_card_id: 'card1', name: 'D1',
    ...deliverable,
  });
  const trello = new StubTrello();
  const app = createApp({ env, redis: null, mongo: null, trello });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, agent, trello };
}

const patchDeadline = (agent: request.Agent, projectId: unknown, date: string | null) =>
  agent.patch(`/api/projects/${projectId}/deliverables/card1/deadline`).send({ date });

describe('composeDueIso — W2 semantics (contracts/trello-write.md)', () => {
  it('defaults to 17:00 Asia/Manila', () => {
    expect(composeDueIso('2026-08-21')).toBe('2026-08-21T09:00:00.000Z');
  });
  it('preserves the existing time-of-day when the card already has a due', () => {
    // 2026-08-10T03:30Z = 11:30 Manila
    expect(composeDueIso('2026-08-25', new Date('2026-08-10T03:30:00.000Z'))).toBe('2026-08-25T03:30:00.000Z');
  });
  it('falls back to 17:00 when the preserved time would fold to the previous UTC day', () => {
    // 2026-08-09T22:00Z = 06:00 Manila — preserving it would slice back a day
    expect(composeDueIso('2026-08-25', new Date('2026-08-09T22:00:00.000Z'))).toBe('2026-08-25T09:00:00.000Z');
  });
  it('the UTC day of the instant always equals the chosen Manila day', () => {
    for (const preserve of [null, new Date('2026-08-10T03:30:00.000Z'), new Date('2026-08-09T22:00:00.000Z')]) {
      expect(composeDueIso('2026-08-25', preserve).slice(0, 10)).toBe('2026-08-25');
    }
  });
});

describe('W2 — the due-date write (FR-9.1)', () => {
  it('sets a date at 17:00 Manila, persists both fields, audits, and logs the sync run', async () => {
    const { project, agent, trello } = await setup();
    const res = await patchDeadline(agent, project._id, '2026-08-21').expect(200);
    expect(res.body).toEqual({ ok: true, trello_due: '2026-08-21' });
    expect(trello.dueCalls).toEqual([{ cardId: 'card1', dueIso: '2026-08-21T09:00:00.000Z' }]);
    const doc = await Deliverable.findOne({ trello_card_id: 'card1' });
    expect(doc?.trello_due).toBe('2026-08-21');
    expect(doc?.trello_due_at?.toISOString()).toBe('2026-08-21T09:00:00.000Z');
    expect(await AuditLog.countDocuments({ action: 'due.set' })).toBe(1);
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: true })).toBe(1);
  });

  it('changing the date preserves the existing time-of-day', async () => {
    const { project, agent, trello } = await setup({}, {
      trello_due: '2026-08-10',
      trello_due_at: new Date('2026-08-10T03:30:00.000Z'), // 11:30 Manila
    });
    await patchDeadline(agent, project._id, '2026-08-25').expect(200);
    expect(trello.dueCalls).toEqual([{ cardId: 'card1', dueIso: '2026-08-25T03:30:00.000Z' }]);
  });

  it('clearing sends null and precedence falls back to the sheet deadline (BR-9)', async () => {
    const { project, agent, trello } = await setup({}, {
      trello_due: '2026-08-10',
      trello_due_at: new Date('2026-08-10T09:00:00.000Z'),
      sheet_deadline: '2026-08-15',
    });
    await patchDeadline(agent, project._id, null).expect(200);
    expect(trello.dueCalls).toEqual([{ cardId: 'card1', dueIso: null }]);
    const doc = await Deliverable.findOne({ trello_card_id: 'card1' });
    expect(doc?.trello_due).toBeNull();
    expect(doc?.trello_due_at).toBeNull();
    const viewed = await Deliverable.db.collection('deliverables_v').findOne({ trello_card_id: 'card1' });
    expect(viewed?.deadline).toBe('2026-08-15');
    expect(viewed?.deadline_source).toBe('sheet');
  });

  it('no-op guard: same value → 400 NO_OP, no Trello call, no audit row', async () => {
    const { project, agent, trello } = await setup({}, { trello_due: '2026-08-21' });
    const res = await patchDeadline(agent, project._id, '2026-08-21');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_OP');
    expect(trello.dueCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it('FR-9.3: a failed Trello write leaves local state untouched and records the failure', async () => {
    const { project, agent, trello } = await setup({}, { trello_due: '2026-08-10' });
    trello.fail = true;
    const res = await patchDeadline(agent, project._id, '2026-08-25');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('TRELLO_WRITE_FAILED');
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.trello_due).toBe('2026-08-10');
    expect(await AuditLog.countDocuments({ action: 'due.set_failed' })).toBe(1);
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: false })).toBe(1);
  });

  it('invariant 17: refuses to write to a production board outside production', async () => {
    const { project, agent, trello } = await setup({ PROD_TRELLO_BOARD_IDS: 'testBoardX' });
    const res = await patchDeadline(agent, project._id, '2026-08-21');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCTION_BOARD_GUARD');
    expect(trello.dueCalls).toHaveLength(0);
  });

  it('rejects malformed dates', async () => {
    const { project, agent } = await setup();
    const res = await patchDeadline(agent, project._id, '21-08-2026');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });
});
