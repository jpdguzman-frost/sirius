/**
 * T064 — W1, the urgency write: optimistic-with-rollback semantics, audit +
 * sync_runs on success AND failure, absence-means-non-urgent round-trip,
 * invariant-17 production-board guard, local-row rejection
 * (FR-4.6, FR-4.7; invariants 2, 8, 17).
 *
 * Re-pointed at the WORK CARD 2026-09-05 (product owl #78; contracts/
 * trello-write.md §W1/W3 scope clarification): the shipped build had been
 * labelling the Main Card, the wrong object. The deliverable route is
 * DELETED, not kept beside the new one (PLAN decision D2) — so the cross-kind
 * cases below are the guard that the wrong-target write cannot come back.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { TrelloClient } from '../lib/trello.ts';
import { setupWriteFixture } from './helpers/write-fixture.ts';
import { AuditLog, Deliverable, Project, SyncRun, UserProject, WorkCard } from '../src/models/index.ts';

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
 * The shared registry fixture (test/helpers/write-fixture.ts): one MC group —
 * the main card `card1`, which W1 must NOT touch, and the task card `task1`
 * under it, which W1 writes.
 */
const setup = (envOver: Record<string, string> = {}, projectOver: Record<string, unknown> = {}, taskOver: Record<string, unknown> = {}) =>
  setupWriteFixture({ env: envOver, project: projectOver, task: taskOver });

const patchUrgency = (agent: request.Agent, projectId: unknown, cardId: string, urgent: boolean) =>
  agent.patch(`/api/projects/${projectId}/workcards/${cardId}/urgency`).send({ urgent });

describe('W1 — the urgency write, on the WORK CARD (FR-4.6; owl #78)', () => {
  it('adds then removes the label — absence means non-urgent, and everything is audited as work_card', async () => {
    const { project, agent, trello } = await setup();
    const on = await patchUrgency(agent, project._id, 'task1', true).expect(200);
    expect(on.body).toEqual({ ok: true, urgency: 'Urgent' });
    const written = await WorkCard.findOne({ trello_card_id: 'task1' });
    expect(written?.urgency).toBe('Urgent');
    // the stamp a later reconcile compares its fetch instant against (owl #50)
    expect(written?.registry_written_at).toBeInstanceOf(Date);

    const off = await patchUrgency(agent, project._id, 'task1', false).expect(200);
    expect(off.body).toEqual({ ok: true, urgency: 'Non-Urgent' });
    expect((await WorkCard.findOne({ trello_card_id: 'task1' }))?.urgency).toBe('Non-Urgent');

    expect(trello.urgencyCalls).toEqual([
      { cardId: 'task1', boardId: 'testBoardX', urgent: true },
      { cardId: 'task1', boardId: 'testBoardX', urgent: false },
    ]);
    const rows = await AuditLog.find({ action: 'urgency.set' });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.entity).toBe('work_card');
      expect(row.entity_id).toBe('task1');
    }
    const runs = await SyncRun.find({ source: 'trello_write', ok: true });
    expect(runs).toHaveLength(2);
    expect(runs[0]?.stats?.kind).toBe('work_card');

    // the main card beside it is untouched — the write went to the task
    const main = await Deliverable.findOne({ trello_card_id: 'card1' });
    expect(main?.urgency).toBe('Non-Urgent');
    expect(main?.registry_written_at).toBeUndefined();
  });

  it('FR-4.7: a failed Trello write leaves local state untouched and records the failure', async () => {
    const { project, agent, trello } = await setup();
    trello.fail = true;
    const res = await patchUrgency(agent, project._id, 'task1', true);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('TRELLO_WRITE_FAILED');
    const doc = await WorkCard.findOne({ trello_card_id: 'task1' });
    expect(doc?.urgency).toBe('Non-Urgent'); // never diverges from Trello
    expect(doc?.registry_written_at).toBeUndefined(); // nothing written, nothing to shield (owl #50)
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: false })).toBe(1);
    const failRow = await AuditLog.findOne({ action: 'urgency.set_failed' });
    expect(failRow?.entity).toBe('work_card');
    expect(failRow?.entity_id).toBe('task1');
  });

  it('invariant 17: refuses to write to a production board outside production', async () => {
    const { project, agent, trello } = await setup({ PROD_TRELLO_BOARD_IDS: 'testBoardX,otherProd' });
    const res = await patchUrgency(agent, project._id, 'task1', true);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCTION_BOARD_GUARD');
    expect(trello.urgencyCalls).toHaveLength(0);
  });

  it('G7: a read-only project refuses through the same door with WRITES_DISABLED', async () => {
    const { project, agent, trello } = await setup({}, { writes_enabled: false });
    const res = await patchUrgency(agent, project._id, 'task1', true);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRITES_DISABLED');
    expect(trello.urgencyCalls).toHaveLength(0);
    expect((await WorkCard.findOne({ trello_card_id: 'task1' }))?.urgency).toBe('Non-Urgent');
  });

  it('rejects a body outside { urgent: boolean }', async () => {
    const { project, agent, trello } = await setup();
    const res = await agent.patch(`/api/projects/${project._id}/workcards/task1/urgency`).send({ urgent: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
    expect(trello.urgencyCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0); // non-attempts never audit
  });

  it('rejects local duplicated rows — no Trello card to label', async () => {
    const { project, agent } = await setup();
    await WorkCard.create({
      project_id: project._id, mc_number: 'MC-1', trello_card_id: 'local-abc', name: 'Copy',
    });
    const res = await patchUrgency(agent, project._id, 'local-abc', true);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LOCAL_ROW');
  });

  it('a DEACTIVATED work card no longer answers writes — kind flips leave ghosts (2026-08-18 review)', async () => {
    const { project, agent } = await setup({}, {}, { active: false });
    const res = await patchUrgency(agent, project._id, 'task1', true);
    expect(res.status).toBe(404);
  });

  it('CROSS-KIND: a main-card id on the work-card route is a 404 — W1 cannot reach the main card', async () => {
    /* PLAN decision D2. `card1` is a DELIVERABLE, active, in the same project:
       the ONLY thing standing between this request and a wrong-target write
       is that the route looks up work_cards and nothing else. */
    const { project, agent, trello } = await setup();
    const res = await patchUrgency(agent, project._id, 'card1', true);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(trello.urgencyCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.urgency).toBe('Non-Urgent');
  });

  it('CROSS-PROJECT: a work card of ANOTHER project is a 404 on this project’s URL (invariant 1)', async () => {
    /* 2026-09-05 review. The cross-KIND case above proves the route looks up
       work_cards; it says nothing about the project filter, and a lookup by
       `trello_card_id` alone would pass it. Invariant 1: every query filters
       on `project_id`. The user is a member of BOTH projects here, so
       membership authz cannot be what refuses the request — only the scoping
       of the lookup itself. The positive anchor at the end stops the case
       passing vacuously (a typo'd URL would 404 for the wrong reason). */
    const { project, agent, trello, user } = await setup();
    const other = await Project.create({ code: 'rt-999', name: 'Other', trello_board_id: 'testBoardY', weekly_capacity: 3 });
    await UserProject.create({ user_id: user._id, project_id: other._id });
    await WorkCard.create({
      project_id: other._id, mc_number: 'MC-9', trello_card_id: 'w9',
      name: 'Render Asset: MC-9 exports', current_list: 'Backlogs',
    });

    const res = await patchUrgency(agent, project._id, 'w9', true);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(trello.urgencyCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
    expect((await WorkCard.findOne({ trello_card_id: 'w9' }))?.urgency).toBe('Non-Urgent');

    // the same card through its OWN project's URL still writes
    await patchUrgency(agent, other._id, 'w9', true).expect(200);
    expect((await WorkCard.findOne({ trello_card_id: 'w9' }))?.urgency).toBe('Urgent');
  });

  it('CROSS-KIND: the deliverable-scoped route no longer exists (404), for either card id', async () => {
    const { project, agent, trello } = await setup();
    for (const id of ['card1', 'task1']) {
      const res = await agent.patch(`/api/projects/${project._id}/deliverables/${id}/urgency`).send({ urgent: true });
      expect(res.status, id).toBe(404);
    }
    expect(trello.urgencyCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
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
