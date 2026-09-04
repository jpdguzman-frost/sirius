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
 * The shared registry fixture (test/helpers/write-fixture.ts), with both cards
 * seeded Medium: the main card `card1`, which W3 must NOT touch, and the task
 * card `task1` under it, which W3 writes. Medium on both is what lets a
 * cross-kind case ask for Hard and know the no-op guard is not what refused it.
 */
const setup = (envOver: Record<string, string> = {}, projectOver: Record<string, unknown> = {}, taskOver: Record<string, unknown> = {}) =>
  setupWriteFixture({
    env: envOver,
    project: projectOver,
    deliverable: { difficulty: 'Medium' },
    task: { difficulty: 'Medium', ...taskOver },
  });

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
    expect(trello.difficultyCalls).toEqual([{ cardId: 'task1', boardId: 'testBoardX', difficulty: 'Hard' }]);
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
    expect(trello.difficultyCalls).toHaveLength(0);
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
    expect(trello.difficultyCalls).toHaveLength(0);
  });

  it('G7: a read-only project refuses through the same door with WRITES_DISABLED', async () => {
    const { project, agent, trello } = await setup({}, { writes_enabled: false });
    const res = await patchDifficulty(agent, project._id, 'task1', 'Hard');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRITES_DISABLED');
    expect(trello.difficultyCalls).toHaveLength(0);
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
    expect(trello.difficultyCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
    expect((await Deliverable.findOne({ trello_card_id: 'card1' }))?.difficulty).toBe('Medium');
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
      name: 'Render Asset: MC-9 exports', current_list: 'Backlogs', difficulty: 'Medium',
    });

    const res = await patchDifficulty(agent, project._id, 'w9', 'Hard');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(trello.difficultyCalls).toHaveLength(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
    expect((await WorkCard.findOne({ trello_card_id: 'w9' }))?.difficulty).toBe('Medium');

    // the same card through its OWN project's URL still writes
    await patchDifficulty(agent, other._id, 'w9', 'Hard').expect(200);
    expect((await WorkCard.findOne({ trello_card_id: 'w9' }))?.difficulty).toBe('Hard');
  });

  it('CROSS-KIND: the deliverable-scoped route no longer exists (404), for either card id', async () => {
    const { project, agent, trello } = await setup();
    for (const id of ['card1', 'task1']) {
      const res = await agent.patch(`/api/projects/${project._id}/deliverables/${id}/difficulty`).send({ difficulty: 'Hard' });
      expect(res.status, id).toBe(404);
    }
    expect(trello.difficultyCalls).toHaveLength(0);
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
