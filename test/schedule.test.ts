/**
 * Phase 7 backend — schedule writes (AC-13/AC-14 API side), ownership
 * enforcement, sprint overlap rejection (FR-5.15), suggest-proposes-only
 * (AC-15), duplicate-without-links (FR-5.12), deadlines conflicts
 * (AC-17, AC-18; BR-6), audit on every change (invariant 10).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request, { type Agent } from 'supertest';
import { Types } from 'mongoose';
import { readFile } from 'node:fs/promises';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, Deliverable, Project, Sprint, SprintItem, SyncRun, User, UserProject, WorkCard } from '../src/models/index.ts';
import { getHolidays, setHolidays } from '../lib/calendar.ts';

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

async function setup() {
  const project = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 3 });
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  const mk = (i: number, over: Record<string, unknown> = {}) =>
    Deliverable.create({
      project_id: project._id, mc_number: `MC-${i}`, display_id: `MC-${i}`, trello_card_id: `c${i}`,
      name: `D${i}`, difficulty: 'Medium', lane: 'design', current_list: 'Design', ...over,
    });
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, user, agent, mk };
}

describe('planning writes (AC-13 API side)', () => {
  it('slots a week, sets pin and note, audits before/after', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await agent
      .patch(`/api/projects/${project._id}/deliverables/c1/planning`)
      .send({ slotted_week: '2026-08-10', pinned: true, status_note: 'manual: waiting on legal' })
      .expect(200);
    const d = await Deliverable.findOne({ trello_card_id: 'c1' }).orFail();
    expect(d.slotted_week).toBe('2026-08-10');
    expect(d.pinned).toBe(true);
    const log = await AuditLog.findOne({ action: 'schedule.planning' }).orFail();
    expect(log.actor).toBe('pm@frostdesigngroup.com');
    expect((log.before as Record<string, unknown>).slotted_week).toBeNull();
    expect((log.after as Record<string, unknown>).slotted_week).toBe('2026-08-10');
  });

  /* CLOSED 2026-08-27 (JP). Confidence and the two review-SLA overrides lost
     their only UI with the Forecast tab, but the engine still READS all three —
     so a stored value would keep moving every date on the remaining tabs with
     nothing on screen able to show or clear it. The board had none set, so
     there was nothing to clear; this is what stops one appearing.

     Asserted as REFUSED rather than ignored, and asserted to leave the stored
     value untouched — the storage and the engine path are deliberately intact,
     so re-opening this is three lines when product gives the controls a home. */
  it('refuses the three orphaned forecast controls, and stores nothing', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    for (const body of [{ confidence: '0.85' }, { sla_sketch: 2 }, { sla_render: 2 }]) {
      await agent
        .patch(`/api/projects/${project._id}/deliverables/c1/planning`)
        .send({ slotted_week: '2026-08-10', ...body })
        .expect(400);
    }
    const d = await Deliverable.findOne({ trello_card_id: 'c1' }).orFail();
    expect(d.confidence).toBe('0.7'); // the default, never the refused value
    expect(d.sla_sketch ?? null).toBeNull();
    expect(d.sla_render ?? null).toBeNull();
    expect(d.slotted_week ?? null).toBeNull(); // the whole body is refused, not the bad half
  });

  it('refuses Trello-owned fields outright (§1.2 ownership; invariant 2)', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    const res = await agent
      .patch(`/api/projects/${project._id}/deliverables/c1/planning`)
      .send({ name: 'hacked', difficulty: 'Easy' });
    expect(res.status).toBe(400);
    const d = await Deliverable.findOne({ trello_card_id: 'c1' }).orFail();
    expect(d.name).toBe('D1');
  });
});

describe('multi-row replot (AC-14 API side, BR-8)', () => {
  it('applies moves to every unpinned row and skips pinned ones (FR-5.9)', async () => {
    const { project, agent, mk } = await setup();
    await mk(1, { slotted_week: '2026-08-03' });
    await mk(2, { slotted_week: '2026-08-10' });
    await mk(3, { slotted_week: '2026-08-03', pinned: true });
    // +1 week relative shift, computed client-side, applied absolutely
    const res = await agent
      .post(`/api/projects/${project._id}/replot`)
      .send({ moves: [
        { cardId: 'c1', week: '2026-08-10' },
        { cardId: 'c2', week: '2026-08-17' },
        { cardId: 'c3', week: '2026-08-10' },
      ] })
      .expect(200);
    expect(res.body.moved).toBe(2);
    expect((await Deliverable.findOne({ trello_card_id: 'c1' }))?.slotted_week).toBe('2026-08-10');
    expect((await Deliverable.findOne({ trello_card_id: 'c2' }))?.slotted_week).toBe('2026-08-17');
    expect((await Deliverable.findOne({ trello_card_id: 'c3' }))?.slotted_week).toBe('2026-08-03'); // pinned
    expect(await AuditLog.countDocuments({ action: 'schedule.replot' })).toBe(2);
  });
});

describe('sprints (FR-5.14, FR-5.15, BR-5)', () => {
  it('rejects overlapping sprints on save; allows gaps (invariant 12)', async () => {
    const { project, agent } = await setup();
    const overlap = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { name: 'S1', start: '2026-08-03', end: '2026-08-14' },
        { name: 'S2', start: '2026-08-10', end: '2026-08-21' },
      ],
    });
    expect(overlap.status).toBe(422);
    expect(overlap.body.error.code).toBe('SPRINT_CONFLICT');
    expect(overlap.body.error.issues[0].kind).toBe('overlap');
    expect(overlap.body.error.issues[0].text).toBeTruthy(); // the client renders issues[0].text
    expect(await Sprint.countDocuments({})).toBe(0);
    // a refusal is not a state change — it must not reach the audit log
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(0);

    await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { name: 'S1', start: '2026-08-03', end: '2026-08-14' },
        { name: 'S2', start: '2026-08-24', end: '2026-09-04' }, // gap — legal
      ],
    }).expect(200);
    expect(await Sprint.countDocuments({})).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(1);
    const saved = await Sprint.find({ project_id: project._id }).sort({ position: 1 });
    expect(saved.map((s) => s.position)).toEqual([1, 2]); // position derived from start order
    expect(saved.map((s) => s.name)).toEqual(['S1', 'S2']);
  });

  // Owl #28 / batch 4: the modal blocks Save on duplicates client-side; this is
  // the server truth behind it. Names are unique PER PROJECT.
  it('rejects duplicate sprint names before writing anything', async () => {
    const { project, agent } = await setup();
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
        { name: 'Sprint 46', start: '2026-08-17', end: '2026-08-28' },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SPRINT_CONFLICT');
    expect(res.body.error.issues[0].kind).toBe('duplicate-name');
    expect(res.body.error.issues[0].text).toBe(
      'Multiple sprints are named "Sprint 46". Give each sprint a unique name to save.',
    );
    expect(res.body.error.issues).toHaveLength(1); // one issue per duplicated NAME, not per row
    expect(await Sprint.countDocuments({})).toBe(0); // rejected before deleteMany
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(0);
  });

  it('compares names trimmed and case-insensitively, and never destroys the stored list', async () => {
    const { project, agent } = await setup();
    await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
        { name: 'Sprint 47', start: '2026-08-17', end: '2026-08-28' },
      ],
    }).expect(200);

    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
        { name: '  sprint 46  ', start: '2026-08-17', end: '2026-08-28' },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.issues[0].kind).toBe('duplicate-name');
    // the replace is destructive — a rejected save must leave the two good rows
    expect(await Sprint.countDocuments({ project_id: project._id })).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(1); // only the good save
  });

  it('scopes name uniqueness to the project (invariant 1)', async () => {
    const { project, user, agent } = await setup();
    const other = await Project.create({ code: 'rt-2', name: 'Second', trello_board_id: 'fxB', weekly_capacity: 3 });
    await UserProject.create({ user_id: user._id, project_id: other._id });

    const span = [{ name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' }];
    await agent.put(`/api/projects/${project._id}/sprints`).send({ sprints: span }).expect(200);
    await agent.put(`/api/projects/${other._id}/sprints`).send({ sprints: span }).expect(200);

    expect(await Sprint.countDocuments({ project_id: project._id })).toBe(1);
    expect(await Sprint.countDocuments({ project_id: other._id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(2);
  });

  it('reports one issue per duplicated name even when a name repeats three times', async () => {
    const { project, agent } = await setup();
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { name: 'Alpha', start: '2026-08-03', end: '2026-08-07' },
        { name: 'alpha', start: '2026-08-10', end: '2026-08-14' },
        { name: 'ALPHA', start: '2026-08-17', end: '2026-08-21' },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.issues.filter((i: { kind: string }) => i.kind === 'duplicate-name')).toHaveLength(1);
    expect(await Sprint.countDocuments({})).toBe(0);
  });
});

/**
 * Owl #37 item 2 (Miles): "Trim and reject empty, surfaced like the
 * duplicate-name error." A nameless sprint is unidentifiable in the Gantt's
 * sprint headers. Both `''` and whitespace-only are ONE class, and the class
 * must land on the friendly 422 — never a Zod 400, whose envelope carries no
 * `issues[]` for the modal's `issues[0].text` fallback to read.
 */
describe('sprint identity survives the save (review 2026-08-28, finding 1)', () => {
  /* THE BUG THIS PINS: the save was deleteMany + insertMany, minting fresh
     ObjectIds on every PUT. Invisible while membership was DERIVED from the
     slotted week; the moment #72 stored `sprint_items.sprint_id`, a routine
     RENAME would have orphaned every scheduled row — gone from every group,
     still counted in the footer, its card locked out of the dropdown by the
     unique index, with no UI path back. The fix: a row with an id UPDATES
     that sprint; a row without one inserts; a live sprint absent from the
     payload is removed WITH its scheduled items, in the same audited act the
     modal's confirm banner warns about (Miles #30). */

  async function seedSprintWithItem(projectId: Types.ObjectId) {
    const sprint = await Sprint.create({ project_id: projectId, name: 'Sprint 46', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 1 });
    await WorkCard.create({
      project_id: projectId, trello_card_id: 'wc-1', mc_number: 'MC-655',
      name: 'Sketch Asset: hero', task_prefix: 'Sketch Asset', current_list: 'Design', active: true,
    });
    const item = await SprintItem.create({
      project_id: projectId, sprint_id: sprint._id, mc_number: 'MC-655',
      trello_card_id: 'wc-1', starts_on: '2026-08-03', position: 0, added_by: 'pm@frostdesigngroup.com',
    });
    return { sprint, item };
  }

  it('a rename keeps the sprint id, and the scheduled row keeps its home', async () => {
    const { project, agent } = await setup();
    const { sprint, item } = await seedSprintWithItem(project._id);
    await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [{ id: String(sprint._id), name: 'Sprint 46 — renamed', start: '2026-08-03', end: '2026-08-14' }],
    }).expect(200);
    const after = await Sprint.find({ project_id: project._id }).lean();
    expect(after).toHaveLength(1);
    expect(String(after[0]!._id)).toBe(String(sprint._id)); // THE identity
    expect(after[0]!.name).toBe('Sprint 46 — renamed');
    const row = await SprintItem.findById(item._id).lean();
    expect(String(row!.sprint_id)).toBe(String(sprint._id)); // still joined
  });

  it('adding a second sprint leaves the first id — and its rows — untouched', async () => {
    const { project, agent } = await setup();
    const { sprint, item } = await seedSprintWithItem(project._id);
    await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { id: String(sprint._id), name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
        { name: 'Sprint 47', start: '2026-08-17', end: '2026-08-28' },
      ],
    }).expect(200);
    const after = await Sprint.find({ project_id: project._id }).sort({ position: 1 }).lean();
    expect(after).toHaveLength(2);
    expect(String(after[0]!._id)).toBe(String(sprint._id));
    expect(await SprintItem.countDocuments({ _id: item._id })).toBe(1);
  });

  it('removing a sprint removes its scheduled rows WITH it, in the same audit row', async () => {
    /* the cascade is the confirm banner's promise kept: without it the rows
       orphan — invisible in every group yet still counted, their cards
       locked out of the dropdown forever */
    const { project, agent } = await setup();
    const { item } = await seedSprintWithItem(project._id);
    await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [{ name: 'Sprint 99', start: '2026-09-07', end: '2026-09-18' }],
    }).expect(200);
    expect(await SprintItem.countDocuments({ _id: item._id })).toBe(0);
    const log = await AuditLog.findOne({ action: 'sprints.replace' }).lean();
    const removed = (log!.after as { removed_items: { card_id: string }[] }).removed_items;
    expect(removed.map((r) => r.card_id)).toEqual(['wc-1']);
    // and the card is addable again — the unique index no longer holds it
    expect(await SprintItem.countDocuments({ project_id: project._id, trello_card_id: 'wc-1' })).toBe(0);
  });

  it('an id the project does not hold is refused as stale, not treated as new', async () => {
    const { project, agent } = await setup();
    await seedSprintWithItem(project._id);
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [{ id: '6a7c2a9f58d668316cb1ffff', name: 'Ghost', start: '2026-08-03', end: '2026-08-14' }],
    }).expect(409);
    expect(res.body.error.code).toBe('SPRINTS_STALE');
    // and NOTHING moved — a refused save must leave the collection as it was
    expect(await Sprint.countDocuments({ project_id: project._id })).toBe(1);
  });
});

describe('the sprint-item PATCH refuses to audit a non-change (review finding 2)', () => {
  it('an identical starts_on writes no second audit row', async () => {
    /* invariant 10 logs CHANGES, not attempts — the client's in-flight lock
       now spans its reload, and this is the backstop the lock cannot be:
       before == after answers ok WITHOUT saving and WITHOUT auditing. */
    const { project, agent } = await setup();
    const sprint = await Sprint.create({ project_id: project._id, name: 'S', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 1 });
    await WorkCard.create({ project_id: project._id, trello_card_id: 'wc-2', mc_number: 'MC-701', name: 'Render Asset: icons', current_list: 'Design', active: true });
    const created = await agent.post(`/api/projects/${project._id}/sprint-items`).send({ sprint_id: String(sprint._id), card_id: 'wc-2' }).expect(201);
    const itemId = created.body.id as string;
    await agent.patch(`/api/projects/${project._id}/sprint-items/${itemId}`).send({ starts_on: null }).expect(200);
    const audits = await AuditLog.countDocuments({ action: 'sprintItem.plot' });
    const res = await agent.patch(`/api/projects/${project._id}/sprint-items/${itemId}`).send({ starts_on: null }).expect(200);
    expect(res.body.noop).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'sprintItem.plot' })).toBe(audits); // no new row
  });
});

describe('the add can arrive already PLOTTED — the draft row\u2019s + (PLAN 2026-08-28 F2)', () => {
  async function seedAddable(projectId: Types.ObjectId, over: Record<string, unknown> = {}) {
    const sprint = await Sprint.create({ project_id: projectId, name: 'S', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 1 });
    await WorkCard.create({
      project_id: projectId, trello_card_id: 'wc-3', mc_number: 'MC-702',
      name: 'Sketch Asset: pose', task_prefix: 'Sketch Asset', current_list: 'Design', active: true, ...over,
    });
    return sprint;
  }

  it('creates the row already plotted, and the ONE add audit row carries the placement', async () => {
    const { project, agent } = await setup();
    const sprint = await seedAddable(project._id);
    const res = await agent.post(`/api/projects/${project._id}/sprint-items`)
      .send({ sprint_id: String(sprint._id), card_id: 'wc-3', starts_on: '2026-08-10' }).expect(201);
    const row = await SprintItem.findById(res.body.id as string).orFail();
    expect(row.starts_on).toBe('2026-08-10');
    /* one act, one row (invariant 10): the placement rides the add's own
       audit row — no synthetic sprintItem.plot lands beside it */
    const log = await AuditLog.findOne({ action: 'sprintItem.add' }).orFail();
    expect((log.after as Record<string, unknown>).starts_on).toBe('2026-08-10');
    expect(await AuditLog.countDocuments({ action: 'sprintItem.add' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'sprintItem.plot' })).toBe(0);
  });

  it('without starts_on the row still lands UNPLOTTED — the Add Item path is untouched', async () => {
    const { project, agent } = await setup();
    const sprint = await seedAddable(project._id);
    const res = await agent.post(`/api/projects/${project._id}/sprint-items`)
      .send({ sprint_id: String(sprint._id), card_id: 'wc-3' }).expect(201);
    const row = await SprintItem.findById(res.body.id as string).orFail();
    expect(row.starts_on ?? null).toBeNull();
    // the audit spells the unplotted state the PATCH route's way: an explicit null
    const log = await AuditLog.findOne({ action: 'sprintItem.add' }).orFail();
    expect((log.after as Record<string, unknown>).starts_on).toBeNull();
  });

  it('a complete card is refused even when the click carries a placement (#72 \u00a75)', async () => {
    const { project, agent } = await setup();
    const sprint = await seedAddable(project._id, { current_list: 'Done' });
    const res = await agent.post(`/api/projects/${project._id}/sprint-items`)
      .send({ sprint_id: String(sprint._id), card_id: 'wc-3', starts_on: '2026-08-10' }).expect(409);
    expect(res.body.error.code).toBe('CARD_COMPLETE');
    // the placement smuggles nothing past the ADD-time filter: no row, no audit
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
  });
});

describe('sprints — blank names reject (owl #37 item 2)', () => {
  it('rejects a whitespace-only name with a 422 that writes nothing and audits nothing', async () => {
    const { project, agent } = await setup();
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [{ name: '   ', start: '2026-08-17', end: '2026-08-28' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SPRINT_CONFLICT');
    expect(res.body.error.issues).toHaveLength(1);
    expect(res.body.error.issues[0].kind).toBe('blank-name');
    // the copy the modal banner shows, verbatim — the row is named by its start
    expect(res.body.error.issues[0].text).toBe(
      'A sprint starting 17 Aug 2026 has no name. Name every sprint to save.',
    );
    expect(await Sprint.countDocuments({})).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(0);
  });

  // regression on relaxing `.min(1)`: '' used to be swallowed as INVALID_BODY
  it('answers 422 and NOT a Zod 400 for an empty-string name', async () => {
    const { project, agent } = await setup();
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [{ name: '', start: '2026-08-17', end: '2026-08-28' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SPRINT_CONFLICT');
    expect(res.body.error.code).not.toBe('INVALID_BODY');
    expect(res.body.error.issues[0].kind).toBe('blank-name');
    expect(res.body.error.issues[0].text).toBe(
      'A sprint starting 17 Aug 2026 has no name. Name every sprint to save.',
    );
    expect(await Sprint.countDocuments({})).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(0);
  });

  // the two sides used to disagree exactly here: the client's `if (key)` guard
  // stayed silent while the server called two blanks a duplicate of each other
  it('reports one blank issue PER ROW and never also calls two blanks a duplicate', async () => {
    const { project, agent } = await setup();
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { name: '', start: '2026-08-03', end: '2026-08-14' },
        { name: '  ', start: '2026-08-17', end: '2026-08-28' },
      ],
    });
    expect(res.status).toBe(422);
    const issues = res.body.error.issues as { kind: string; text: string }[];
    expect(issues.filter((i) => i.kind === 'blank-name')).toHaveLength(2);
    expect(issues.filter((i) => i.kind === 'duplicate-name')).toHaveLength(0);
    expect(issues.map((i) => i.text)).toEqual([
      'A sprint starting 3 Aug 2026 has no name. Name every sprint to save.',
      'A sprint starting 17 Aug 2026 has no name. Name every sprint to save.',
    ]);
    expect(await Sprint.countDocuments({})).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(0);
  });

  it('saves the same list once every row has a name', async () => {
    const { project, agent } = await setup();
    await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
        { name: 'Sprint 47', start: '2026-08-17', end: '2026-08-28' },
      ],
    }).expect(200);
    expect(await Sprint.countDocuments({ project_id: project._id })).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(1);
  });

  it('still refuses an over-long name as INVALID_BODY — .max(80) survived the relaxation', async () => {
    const { project, agent } = await setup();
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [{ name: 'x'.repeat(81), start: '2026-08-17', end: '2026-08-28' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
    expect(await Sprint.countDocuments({})).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(0);
  });

  // a blank row must not destroy a good stored list either (the replace is
  // destructive; rejection returns before deleteMany)
  it('leaves an already-stored list intact when a later save carries a blank', async () => {
    const { project, agent } = await setup();
    await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [{ name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' }],
    }).expect(200);

    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
        { name: '\t', start: '2026-08-17', end: '2026-08-28' },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.issues[0].kind).toBe('blank-name');
    expect(await Sprint.countDocuments({ project_id: project._id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(1); // only the good save
  });

  // the date in the copy is pure string math on the YYYY-MM-DD the wire carries:
  // no Date, so no TZ shift (invariant 11) and no locale (en-GB emits 'Sept')
  it('renders the start date as the frame format, in any timezone', async () => {
    const { project, agent } = await setup();
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [{ name: ' ', start: '2026-09-01', end: '2026-09-11' }],
    });
    expect(res.body.error.issues[0].text).toContain('1 Sep 2026');
    expect(res.body.error.issues[0].text).not.toContain('Sept');
  });
});

describe('suggest plan (AC-15, AC-16; BR-7)', () => {
  it('proposes without applying; pinned rows never appear in the plan', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2, { urgency: 'Urgent' });
    await mk(3, { pinned: true, slotted_week: '2026-08-10' });
    const res = await agent
      .post(`/api/projects/${project._id}/suggest`)
      .send({ from: '2026-08-03', weeks: 4 })
      .expect(200);
    expect(res.body.plan.c1).toBeDefined();
    expect(res.body.plan.c2).toBeDefined();
    expect(res.body.plan.c3).toBeUndefined(); // pinned (AC-16)
    // nothing applied (AC-15)
    expect((await Deliverable.findOne({ trello_card_id: 'c1' }))?.slotted_week ?? null).toBeNull();
  });

  // Owl #25: the expanded Suggest bar's three counts are derived CLIENT-SIDE
  // from this payload — proposed = |plan|, flagged = |plan ∩ notes|,
  // hard-heavy = |strain|. No response field was added for them, so this test
  // is the contract that keeps the three source fields on the wire; if one
  // ever disappears the bar would silently read 0 instead of failing.
  it('carries plan, notes and strain — the fields the suggest bar counts from', async () => {
    const { project, agent, mk } = await setup();
    for (let i = 1; i <= 9; i++) await mk(i, { difficulty: i % 2 ? 'Hard' : 'Easy' });
    const res = await agent
      .post(`/api/projects/${project._id}/suggest`)
      .send({ from: '2026-08-03', weeks: 4 })
      .expect(200);

    expect(res.body.plan).toBeTypeOf('object');
    expect(res.body.notes).toBeTypeOf('object');
    expect(Array.isArray(res.body.strain)).toBe(true);
    expect(Array.isArray(res.body.weekKeys)).toBe(true);
    // strain is a set of WEEK keys (its unit is weeks, not proposals — R-a)
    for (const k of res.body.strain) expect(res.body.weekKeys).toContain(k);

    const proposed = Object.keys(res.body.plan).length;
    const flagged = Object.keys(res.body.plan).filter((id) => res.body.notes[id]).length;
    const hardHeavy = res.body.strain.length;
    expect(proposed).toBeGreaterThan(0);
    expect(flagged).toBeLessThanOrEqual(proposed); // flagged intersects plan
    expect(hardHeavy).toBeLessThanOrEqual(res.body.weekKeys.length);
  });

  // BR-6b: the 12.9% ceiling that decides `strain` is computed inside
  // lib/planner against HARD_MIX — it is never retyped on a route.
  it('never retypes the hard-mix ceiling in the route layer', async () => {
    const src = await readFile(new URL('../src/routes/schedule.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/0\.129|12\.9/);
  });
});

describe('duplicate (FR-5.12)', () => {
  it('copies the row without Trello or Figma links', async () => {
    const { project, agent, mk } = await setup();
    await mk(1, { trello_url: 'https://trello.com/c/x', figma_url: 'https://figma.com/f/y', trello_due: '2026-08-21' });
    const res = await agent.post(`/api/projects/${project._id}/deliverables/c1/duplicate`).expect(200);
    const copy = await Deliverable.findOne({ trello_card_id: res.body.cardId }).orFail();
    expect(copy.name).toBe('D1 (copy)');
    expect(copy.trello_url ?? null).toBeNull();
    expect(copy.figma_url ?? null).toBeNull();
    expect(copy.trello_due ?? null).toBeNull();
    expect(copy.difficulty).toBe('Medium');
  });
});

describe('deadlines view (AC-17, AC-18; BR-6, BR-9a)', () => {
  it('flags and names two urgent milestones in a week; late rows land on the replot list', async () => {
    const { project, agent, mk } = await setup();
    // both urgent, slotted same week → sketch milestones collide (AC-17)
    await mk(1, { urgency: 'Urgent', slotted_week: '2026-08-03', sheet_deadline: '2026-09-30' });
    await mk(2, { urgency: 'Urgent', slotted_week: '2026-08-03', sheet_deadline: '2026-09-30' });
    // deadline before the render forecast → late (AC-18)
    await mk(3, { slotted_week: '2026-08-03', sheet_deadline: '2026-08-05' });

    const res = await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    const urgentConflicts = res.body.conflicts.filter((c: { rule: string }) => c.rule === 'urgent-overlap');
    expect(urgentConflicts.length).toBeGreaterThanOrEqual(1);
    const named = urgentConflicts[0].items.map((i: { displayId: string }) => i.displayId).sort();
    expect(named).toEqual(['MC-1', 'MC-2']);

    const late = res.body.milestones.filter((m: { late: boolean }) => m.late);
    expect(late.length).toBe(1);
    expect(late[0].displayId).toBe('MC-3');
    expect(res.body.replot.map((r: { displayId: string }) => r.displayId)).toContain('MC-3');

    // conflict keys carry the situation (invariant 13 v4.3.0): week | rule |
    // capacity | sorted card:phase pairs — this project's capacity is 3.
    expect(urgentConflicts[0].key).toMatch(/^2026-08-\d{2}\|urgent-overlap\|3\|c1:sketch,c2:sketch$/);
  });

  it('a card with no deadline cannot raise a deadline conflict (BR-9)', async () => {
    const { project, agent, mk } = await setup();
    await mk(1, { slotted_week: '2026-08-03' }); // no deadline anywhere
    const res = await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    expect(res.body.milestones.every((m: { late: boolean }) => !m.late)).toBe(true);
    expect(res.body.conflicts.filter((c: { rule: string }) => c.rule === 'past-deadline')).toHaveLength(0);
  });
});

describe('pipeline read (FR-4.1–4.4)', () => {
  it('serves rows with forecast, corrections, sprints and capacity', async () => {
    const { project, agent, mk } = await setup();
    await mk(1, { figma_url: 'https://figma.com/f/x', sheet_deadline: '2026-09-04' });
    await mk(2, { difficulty: null }); // missing difficulty + deadline + figma
    const res = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    expect(res.body.rows).toHaveLength(2);
    const r1 = res.body.rows.find((r: { cardId: string }) => r.cardId === 'c1');
    expect(r1.forecast.sketchDelivery).toBeTruthy();
    expect(r1.deadlineSource).toBe('sheet');
    const corrections = res.body.corrections.map((c: { cardId: string }) => c.cardId);
    expect(corrections).toContain('c2');
    expect(res.body.capacity.weekly).toBe(3);
  });

  // FR-8.6: a failed latest attempt does not un-sync the last good data the
  // header chip says is on screen — the Requests strip needs the last SUCCESS,
  // or it prints 'not yet synced' beside a screenful of synced rows.
  it('reports the last SUCCESSFUL ares run beside the last attempt (FR-8.6)', async () => {
    const { project, agent } = await setup();
    const good = new Date('2026-08-14T07:05:00Z');
    await SyncRun.create({ project_id: project._id, source: 'ares', ok: true, at: good });
    await SyncRun.create({
      project_id: project._id, source: 'ares', ok: false,
      error: 'ARES unavailable', at: new Date('2026-08-14T07:20:00Z'),
    });

    const res = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    expect(res.body.sync.ok).toBe(false); // the attempt state the chip renders
    expect(res.body.sync.error).toBe('ARES unavailable');
    expect(new Date(res.body.sync.lastSuccessAt).toISOString()).toBe(good.toISOString());
  });

  // S4 / R-f-8: the sprints modal counts WORKING days in a gap, so it needs
  // the server's active (ARES-canonical) holiday set on the wire. Without it
  // the client would grow a second calendar and drift.
  it('serves the active holiday calendar on the deliverables payload', async () => {
    const { project, agent } = await setup();
    const restore = getHolidays();
    try {
      setHolidays(['2026-08-21', '2026-12-25']);
      const res = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
      expect(Array.isArray(res.body.holidays)).toBe(true);
      expect(res.body.holidays).toEqual(['2026-08-21', '2026-12-25']);
      expect(res.body.holidays).toEqual(getHolidays()); // the wire IS the active set, not a copy of the seed
    } finally {
      setHolidays(restore);
    }
  });

  it('has no lastSuccessAt when no ares run has ever succeeded (FR-8.6)', async () => {
    const { project, agent } = await setup();
    await SyncRun.create({ project_id: project._id, source: 'ares', ok: false, error: 'boom' });
    // another project's success must not leak across the boundary (invariant 1)
    const other = await Project.create({ code: 'zz-1', name: 'Other', trello_board_id: 'zzB', weekly_capacity: 3 });
    await SyncRun.create({ project_id: other._id, source: 'ares', ok: true });

    const res = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    expect(res.body.sync.lastSuccessAt).toBeNull();
  });
});
