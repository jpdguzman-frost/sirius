/**
 * T079 — W2 due-date write (FR-9.1, FR-9.3; contracts/trello-write.md):
 * set/change/clear with Trello-first rollback semantics, 17:00 Manila
 * default with existing time-of-day preserved, the no-op guard, the
 * invariant-17 board guard, and audit + sync_runs on every attempt.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { composeDueIso } from '../lib/trello.ts';
import { setupWriteFixture } from './helpers/write-fixture.ts';
import { AuditLog, Deliverable, SyncRun, WorkCard } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

/**
 * The shared registry fixture (test/helpers/write-fixture.ts) with the main
 * card `card1` alone — W2's deliverable half. The task-card half below asks
 * the same fixture for `task1` as well.
 */
const setup = (envOver: Record<string, string> = {}, deliverable: Record<string, unknown> = {}) =>
  setupWriteFixture({ env: envOver, deliverable });

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

  it('rejects calendar-impossible dates as 400, never an unaudited 500 (2026-08-18 review)', async () => {
    // the shape regex admits 2026-02-30 / 2026-13-01; composeDueIso would
    // throw OUTSIDE the try — the only trail-less failure in the file
    const { project, agent, trello } = await setup();
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10']) {
      const res = await patchDeadline(agent, project._id, bad);
      expect(res.status, bad).toBe(400);
      expect(res.body.error.code).toBe('INVALID_BODY');
    }
    expect(trello.dueCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0); // non-attempts never audit
  });

  it('a DEACTIVATED doc no longer answers writes — kind flips leave ghosts (2026-08-18 review)', async () => {
    const { project, agent } = await setup({}, { active: false });
    const res = await patchDeadline(agent, project._id, '2026-08-21');
    expect(res.status).toBe(404);
  });
});

/**
 * W2's task-card half (owl #45; JP's 2026-08-18 scope clarification —
 * contracts/trello-write.md §W2). Same field, same setDue(), same guards
 * through the SAME writeGuards door; only the collection and the audit
 * entity differ. Asserted against the shared handler, not a copy of it.
 */
describe('W2 — the task-card due write (owl #45 scope)', () => {
  const patchTaskDue = (agent: request.Agent, projectId: unknown, date: string | null) =>
    agent.patch(`/api/projects/${projectId}/workcards/task1/deadline`).send({ date });

  const setupTask = (envOver: Record<string, string> = {}, taskOver: Record<string, unknown> = {}) =>
    setupWriteFixture({ env: envOver, task: taskOver });

  it('sets a date, persists both fields on the WORK CARD, audits as work_card', async () => {
    const { project, agent, trello } = await setupTask();
    const res = await patchTaskDue(agent, project._id, '2026-08-21').expect(200);
    expect(res.body).toEqual({ ok: true, trello_due: '2026-08-21' });
    expect(trello.dueCalls).toEqual([{ cardId: 'task1', dueIso: '2026-08-21T09:00:00.000Z' }]);
    const doc = await WorkCard.findOne({ trello_card_id: 'task1' });
    expect(doc?.trello_due).toBe('2026-08-21');
    expect(doc?.trello_due_at?.toISOString()).toBe('2026-08-21T09:00:00.000Z');
    const row = await AuditLog.findOne({ action: 'due.set' });
    expect(row?.entity).toBe('work_card');
    expect(row?.entity_id).toBe('task1');
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: true })).toBe(1);
    // the deliverable beside it is untouched — the write went to the task
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.trello_due ?? null).toBeNull();
  });

  it('preserves the task’s existing time-of-day, exactly as the deliverable half does', async () => {
    const { project, agent, trello } = await setupTask({}, {
      trello_due: '2026-08-10',
      trello_due_at: new Date('2026-08-10T03:30:00.000Z'), // 11:30 Manila
    });
    await patchTaskDue(agent, project._id, '2026-08-25').expect(200);
    expect(trello.dueCalls).toEqual([{ cardId: 'task1', dueIso: '2026-08-25T03:30:00.000Z' }]);
  });

  it('clears with null — a task has no sheet fallback, so cleared means cleared', async () => {
    const { project, agent, trello } = await setupTask({}, {
      trello_due: '2026-08-10', trello_due_at: new Date('2026-08-10T09:00:00.000Z'),
    });
    await patchTaskDue(agent, project._id, null).expect(200);
    expect(trello.dueCalls).toEqual([{ cardId: 'task1', dueIso: null }]);
    const doc = await WorkCard.findOne({ trello_card_id: 'task1' });
    expect(doc?.trello_due).toBeNull();
    expect(doc?.trello_due_at).toBeNull();
    // a CLEAR is a registry write like any other, so it earns the same shield
    // against a reconcile still holding the old date (owl #50)
    expect(doc?.registry_written_at).toBeInstanceOf(Date);
  });

  it('no-op guard holds: same value → 400 NO_OP, no Trello call, no audit row', async () => {
    const { project, agent, trello } = await setupTask({}, { trello_due: '2026-08-21' });
    const res = await patchTaskDue(agent, project._id, '2026-08-21');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_OP');
    expect(trello.dueCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it('rollback holds: a failed Trello write leaves the task untouched and records the failure', async () => {
    const { project, agent, trello } = await setupTask({}, { trello_due: '2026-08-10' });
    trello.fail = true;
    const res = await patchTaskDue(agent, project._id, '2026-08-25');
    expect(res.status).toBe(502);
    expect((await WorkCard.findOne({ trello_card_id: 'task1' }))?.trello_due).toBe('2026-08-10');
    const failRow = await AuditLog.findOne({ action: 'due.set_failed' });
    expect(failRow?.entity).toBe('work_card');
  });

  it('the shared board guard holds through the same door (invariant 17)', async () => {
    const { project, agent } = await setupTask({ PROD_TRELLO_BOARD_IDS: 'testBoardX' });
    const res = await patchTaskDue(agent, project._id, '2026-08-21');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCTION_BOARD_GUARD');
  });

  it('a cardId of the WRONG kind is a 404 — each half looks up its own collection', async () => {
    // card1 is a DELIVERABLE: the workcards route must not find it, and the
    // deliverables route must not find the task
    const { project, agent } = await setupTask();
    const cross = await agent.patch(`/api/projects/${project._id}/workcards/card1/deadline`).send({ date: '2026-08-21' });
    expect(cross.status).toBe(404);
    const reverse = await agent.patch(`/api/projects/${project._id}/deliverables/task1/deadline`).send({ date: '2026-08-21' });
    expect(reverse.status).toBe(404);
  });
});
