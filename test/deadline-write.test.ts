/**
 * T079 — W2 due-date write (FR-9.1, FR-9.3; contracts/trello-write.md) on the
 * WORK CARD: set/change/clear with Trello-first rollback semantics, 17:00
 * Manila default with existing time-of-day preserved, the no-op guard, the
 * invariant-17 board guard, and audit + sync_runs on every attempt.
 *
 * W2 had two halves from 2026-08-18 (JP's "either kind" scope note, owl #45):
 * the deliverable row and the task cards its expanded MC group reveals. Owl
 * #78 §2 (2026-09-05, block 3) put deadlines on work cards and nowhere else —
 * Pipeline reflects the date read-only, the setter is the Sprint Schedules
 * DEADLINE cell — so the deliverable route was DELETED on the W1/W3 block-1
 * precedent. What was that half's suite is now one fact: the old path is a
 * 404, whatever the id and whatever the body.
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
 * The shared registry fixture (test/helpers/write-fixture.ts): the task card
 * `task1` under the main card `card1`. Both exist side by side so every case
 * can say which one the write reached — and that the other did not move.
 */
const setup = (envOver: Record<string, string> = {}, task: Record<string, unknown> = {}) =>
  setupWriteFixture({ env: envOver, task });

const patchDeadline = (agent: request.Agent, projectId: unknown, date: string | null) =>
  agent.patch(`/api/projects/${projectId}/workcards/task1/deadline`).send({ date });

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

/**
 * Asserted through the SAME writeGuards / commitRegistryWrite door W1 and W3
 * use — the guards below are the shared ones, proven here at W2's field.
 */
describe('W2 — the due-date write on the WORK CARD (FR-9.1; owl #78 §2)', () => {
  it('sets a date at 17:00 Manila, persists both fields on the WORK CARD, audits as work_card, logs the sync run', async () => {
    const { project, agent, trello } = await setup();
    const res = await patchDeadline(agent, project._id, '2026-08-21').expect(200);
    expect(res.body).toEqual({ ok: true, trello_due: '2026-08-21' });
    expect(trello.dueCalls).toEqual([{ cardId: 'task1', dueIso: '2026-08-21T09:00:00.000Z' }]);
    const doc = await WorkCard.findOne({ trello_card_id: 'task1' });
    expect(doc?.trello_due).toBe('2026-08-21');
    expect(doc?.trello_due_at?.toISOString()).toBe('2026-08-21T09:00:00.000Z');
    const row = await AuditLog.findOne({ action: 'due.set' });
    expect(row?.entity).toBe('work_card');
    expect(row?.entity_id).toBe('task1');
    expect(await AuditLog.countDocuments({ action: 'due.set' })).toBe(1);
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: true })).toBe(1);
    // the main card beside it is untouched — the write went to the work card
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.trello_due ?? null).toBeNull();
  });

  it('changing the date preserves the existing time-of-day', async () => {
    const { project, agent, trello } = await setup({}, {
      trello_due: '2026-08-10',
      trello_due_at: new Date('2026-08-10T03:30:00.000Z'), // 11:30 Manila
    });
    await patchDeadline(agent, project._id, '2026-08-25').expect(200);
    expect(trello.dueCalls).toEqual([{ cardId: 'task1', dueIso: '2026-08-25T03:30:00.000Z' }]);
  });

  it('clears with null — a work card has no sheet fallback, so cleared means cleared', async () => {
    const { project, agent, trello } = await setup({}, {
      trello_due: '2026-08-10', trello_due_at: new Date('2026-08-10T09:00:00.000Z'),
    });
    await patchDeadline(agent, project._id, null).expect(200);
    expect(trello.dueCalls).toEqual([{ cardId: 'task1', dueIso: null }]);
    const doc = await WorkCard.findOne({ trello_card_id: 'task1' });
    expect(doc?.trello_due).toBeNull();
    expect(doc?.trello_due_at).toBeNull();
    // a CLEAR is a registry write like any other, so it earns the same shield
    // against a reconcile still holding the old date (owl #50)
    expect(doc?.registry_written_at).toBeInstanceOf(Date);
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
    expect((await WorkCard.findOne({ trello_card_id: 'task1' }))?.trello_due).toBe('2026-08-10');
    const failRow = await AuditLog.findOne({ action: 'due.set_failed' });
    expect(failRow?.entity).toBe('work_card');
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

  it('a main card’s id on this route is a 404 — the door looks up work cards only', async () => {
    // card1 is a DELIVERABLE: the work-card route must not find it, and must
    // not reach Trello or touch either document
    const { project, agent, trello } = await setup();
    const cross = await agent.patch(`/api/projects/${project._id}/workcards/card1/deadline`).send({ date: '2026-08-21' });
    expect(cross.status).toBe(404);
    expect(trello.dueCalls).toHaveLength(0);
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.trello_due ?? null).toBeNull();
  });
});

/**
 * The deliverable half's whole suite, since block 3. The 404 body is the
 * app's unknown-API answer and `writeGuards`'s NOT_FOUND share a shape, so
 * one id cannot tell "route gone" from "route looks in the wrong
 * collection" — the pair below can: were the route still registered, a
 * main card's id would have written (200) and a work card's id would have
 * 404'd on the lookup; were it registered over the work-card collection, the
 * reverse. Both 404 only when nothing answers the path at all.
 */
describe('W2’s deliverable route is GONE (owl #78 §2, block 3)', () => {
  const oldPath = (agent: request.Agent, projectId: unknown, cardId: string, date: string | null) =>
    agent.patch(`/api/projects/${projectId}/deliverables/${cardId}/deadline`).send({ date });

  it('a main card’s id on the old path is a 404 — with Trello configured, writes enabled and a valid body', async () => {
    const { project, agent, trello } = await setupWriteFixture({ deliverable: { trello_due: '2026-08-10' } });
    const res = await oldPath(agent, project._id, 'card1', '2026-08-21');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(trello.dueCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
    expect(await SyncRun.countDocuments({})).toBe(0);
    // the main card keeps its Trello-owned date — read-only in Sirius now
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.trello_due).toBe('2026-08-10');
  });

  it('so is a clear, and so is a work card’s id — the route is gone, not just its lookup', async () => {
    const { project, agent, trello } = await setup();
    expect((await oldPath(agent, project._id, 'card1', null)).status).toBe(404);
    expect((await oldPath(agent, project._id, 'task1', '2026-08-21')).status).toBe(404);
    expect(trello.dueCalls).toHaveLength(0);
    expect((await WorkCard.findOne({ trello_card_id: 'task1' }))?.trello_due ?? null).toBeNull();
  });
});
