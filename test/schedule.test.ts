/**
 * Phase 7 backend — schedule writes (AC-13/AC-14 API side), ownership
 * enforcement, sprint overlap rejection (FR-5.15), suggest-proposes-only
 * (AC-15), duplicate-without-links (FR-5.12), audit on every change
 * (invariant 10), the withdrawn acknowledgement/day-plan routes staying
 * withdrawn (owl #87, 2026-09-08), and — since block 9 (owls #88/#89/#90) —
 * the two owners of `PATCH /sprint-items/:itemId` (the PM's `week`, the
 * Design Lead's bounded `starts_on`) and the re-date displacement on
 * `PUT /sprints`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request, { type Agent } from 'supertest';
import mongoose, { Types } from 'mongoose';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { NOT_ADDABLE_STATES } from '../src/routes/schedule.ts';
import { longDate } from '../src/services/sprint-items.ts';
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
    // a REAL Done lane (spec v1.3 §7a), not the bare word: the lane
    // classifier is moving from keywords to the enumerated table, where 'Done'
    // is not a lane name at all
    const sprint = await seedAddable(project._id, { current_list: 'Design Complete' });
    const res = await agent.post(`/api/projects/${project._id}/sprint-items`)
      .send({ sprint_id: String(sprint._id), card_id: 'wc-3', starts_on: '2026-08-10' }).expect(409);
    expect(res.body.error.code).toBe('CARD_COMPLETE');
    // the placement smuggles nothing past the ADD-time filter: no row, no audit
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
  });

  /* The rule the two add paths share: a card is refused when its LANE says the
     work is finished, or when the lane sits outside the delivery pipeline
     altogether (spec v1.3 §7a's EXCLUDED group — Operations, Discarded Work,
     Unused Work, the process lane). Stated over the shipped set rather than
     over one lane name, because the behavioural half above can only exercise
     the states the classifier already produces. */
  it('refuses the same states on BOTH add paths — finished work and lanes outside the pipeline', async () => {
    expect([...NOT_ADDABLE_STATES].sort()).toEqual(['done', 'excluded']);
    // and no add path states the rule a second time by hand: every use of the
    // lane classifier in this file goes through the ONE refusal map, so
    // widening the rule cannot reach one route and miss the other
    const src = await readFile(new URL('../src/routes/schedule.ts', import.meta.url), 'utf8');
    const uses = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)) // comments name it without calling it
      .filter((l) => /classifyList\(/.test(l) && !/^import /.test(l));
    expect(uses.length, 'nothing calls classifyList here — this guard is vacuous').toBeGreaterThan(0);
    expect(uses.filter((l) => !/NOT_ADDABLE_REFUSAL\[classifyList\(/.test(l))).toEqual([]);
    // …and the set the pool reads is the map's own keys, never a second list
    expect(/NOT_ADDABLE_STATES[^=]*=\s*new Set\(Object\.keys\(NOT_ADDABLE_REFUSAL\)\)/.test(src)).toBe(true);
  });

  it('an EXCLUDED card is refused in its own words, not the completed card\u2019s (review ruling 2026-09-08)', async () => {
    /* THE RULE: both states are refused, and each is refused HONESTLY. A card
       in Discarded Work, Unused Work or an ops lane is not finished work, and
       the PM reading the banner is being told why their click failed — the
       done copy names a state the board does not hold.

       Reachable the moment a card moves into such a lane between the schedule
       load and the add, and on every batch add. The two are asserted side by
       side because the defect was that they answered identically. */
    const { project, agent } = await setup();
    const sprint = await seedAddable(project._id, { current_list: 'Discarded Work' });
    const res = await agent.post(`/api/projects/${project._id}/sprint-items`)
      .send({ sprint_id: String(sprint._id), card_id: 'wc-3', starts_on: '2026-08-10' }).expect(409);
    expect(res.body.error.code).toBe('CARD_EXCLUDED');
    expect(res.body.error.message).toContain('outside the pipeline');
    expect(res.body.error.message).not.toContain('complete');
    // refused all the same: no row, no audit
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
  });

  it('a digit-shaped non-date is refused, on POST and PATCH alike (review 2026-08-28b, finding 8)', async () => {
    /* DATE_ONLY proves the CALENDAR now, not just the shape: a stored
       `2026-08-32` walks the forecast into NaN and a spurious LATE flag,
       and `new Date` would have silently normalised it to September 1. */
    const { project, agent } = await setup();
    const sprint = await seedAddable(project._id);
    for (const bad of ['2026-08-32', '2026-13-01', '2026-02-30', '2026-00-15']) {
      const res = await agent.post(`/api/projects/${project._id}/sprint-items`)
        .send({ sprint_id: String(sprint._id), card_id: 'wc-3', starts_on: bad }).expect(400);
      expect(res.body.error.code).toBe('INVALID_BODY');
    }
    /* The leap day itself is REAL and passes the same gate \u2014 and now meets the
       PLOT guard on the far side of it (JP 2026-09-08): 2028 is nowhere near
       this sprint's fortnight, so the answer is 422 with a placement code, not
       the 400 the malformed dates above earn. That difference is what still
       proves the shape gate let a real date through. */
    const leap = await agent.post(`/api/projects/${project._id}/sprint-items`)
      .send({ sprint_id: String(sprint._id), card_id: 'wc-3', starts_on: '2028-02-29' }).expect(422);
    expect(leap.body.error.code).toBe('OUT_OF_SPRINT');
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);

    // and PATCH shares the one definition \u2014 no second, laxer spelling
    const ok = await agent.post(`/api/projects/${project._id}/sprint-items`)
      .send({ sprint_id: String(sprint._id), card_id: 'wc-3', starts_on: '2026-08-10' }).expect(201);
    await agent.patch(`/api/projects/${project._id}/sprint-items/${ok.body.id}`)
      .send({ starts_on: '2026-02-30' }).expect(400);
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(1);
  });
});

/**
 * The placement guards where they meet the CALENDAR (JP 2026-09-08, drift row
 * 5). The sprint-range and deadline halves are exercised in
 * test/sprint-items.test.ts; what belongs here is the one thing only a route
 * can show — that the guard reads the ACTIVE working-day calendar, the set
 * calendar-sync.ts loads from ARES, rather than a weekday rule of its own.
 */
describe('the plot guard reads the active ARES working-day calendar (invariant 11)', () => {
  it('refuses a holiday inside the sprint, and takes the same day once the calendar clears it', async () => {
    const { project, agent } = await setup();
    const sprint = await Sprint.create({ project_id: project._id, name: 'S', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 1 });
    await WorkCard.create({
      project_id: project._id, trello_card_id: 'wc-9', mc_number: 'MC-704',
      name: 'Sketch Asset: pose', current_list: 'Design', active: true,
    });
    const plot = (day: string) => agent.post(`/api/projects/${project._id}/sprint-items`)
      .send({ sprint_id: String(sprint._id), card_id: 'wc-9', starts_on: day });

    const restore = getHolidays();
    try {
      setHolidays(['2026-08-05']); // a WEDNESDAY inside the sprint — a workday but for the calendar
      const res = await plot('2026-08-05').expect(422);
      expect(res.body.error.code).toBe('NOT_A_WORKDAY');
      expect(res.body.error.message).toBe('That day is not a working day.');
      expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);

      // the SAME day, with the calendar no longer calling it a holiday
      setHolidays([]);
      await plot('2026-08-05').expect(201);
    } finally {
      setHolidays(restore);
    }
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(1);
  });
});

/* ====================================================================== *
 * BLOCK 9 — two owners, one route (owls miles→jp #88/#89, JP 2026-09-10;
 * PLAN.md block 9 "Server"): the PM's WEEK click and the Design Lead's DAY
 * move share `PATCH /sprint-items/:itemId`, and a re-dated sprint displaces
 * rows to *Outside any sprint* (owl #90) without refusing the save.
 * ====================================================================== */

/** One sprint (Mon 3 – Fri 14 Aug 2026), one work card, one row — unplotted unless `startsOn` says otherwise. */
async function seedRow(projectId: Types.ObjectId, over: { startsOn?: string | null; due?: string | null; sprint?: { starts_on: string; ends_on: string } } = {}) {
  const sprint = await Sprint.create({ project_id: projectId, name: 'Sprint 46', position: 1, ...(over.sprint ?? { starts_on: '2026-08-03', ends_on: '2026-08-14' }) });
  await WorkCard.create({
    project_id: projectId, trello_card_id: 'wc-1', mc_number: 'MC-655',
    name: 'Sketch Asset: hero', task_prefix: 'Sketch Asset', current_list: 'Design', active: true,
    ...(over.due ? { trello_due: over.due } : {}),
  });
  const item = await SprintItem.create({
    project_id: projectId, sprint_id: sprint._id, mc_number: 'MC-655', trello_card_id: 'wc-1',
    position: 0, added_by: 'pm@frostdesigngroup.com', ...(over.startsOn ? { starts_on: over.startsOn } : {}),
  });
  return { sprint, item };
}
const itemUrl = (pid: unknown, id: unknown) => `/api/projects/${pid}/sprint-items/${id}`;
const rowOf = async (id: unknown) => (await SprintItem.findById(id).lean())!;

describe('PATCH { week } — the PM’s week click lands the bar on the week’s FIRST WORKING day (#89 §2)', () => {
  it('resolves the day on the canonical calendar, audits before/after, and answers the day it chose', async () => {
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id);
    const res = await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-10' }).expect(200);
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-10');
    /* THE 200 BODY IS FROZEN (PLAN.md amendment 4): `{ ok, starts_on,
       sprint_id }`. The client draws the bar at the week's MONDAY for the
       flight and re-stamps the row from THIS answer before its reload
       (amendment 17), so a body that stopped naming the day the server chose
       would leave a bar on a day nobody picked — and `expect(res.body.ok)`
       alone could not see it go. Pinned whole, both keys. */
    expect(res.body).toEqual({ ok: true, starts_on: '2026-08-10', sprint_id: String(sprint._id) });
    const log = await AuditLog.findOne({ action: 'sprintItem.plot', entity_id: String(item._id) }).lean();
    expect(log!.before).toMatchObject({ starts_on: null });
    expect(log!.after).toMatchObject({ starts_on: '2026-08-10' });
    expect(log!.actor).toBe('pm@frostdesigngroup.com');
  });

  it('hands a holiday Monday to Tuesday — the ARES calendar decides, never a weekday assumption (invariant 11)', async () => {
    const { project, agent } = await setup();
    const { item } = await seedRow(project._id);
    const restore = getHolidays();
    try {
      setHolidays(['2026-08-10']);
      await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-10' }).expect(200);
    } finally {
      setHolidays(restore);
    }
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-11');
  });

  it('judges the resolved day on the three non-week checks — the sprint, the deadline, the calendar', async () => {
    const { project, agent } = await setup();
    const { item } = await seedRow(project._id, { due: '2026-08-05' });
    // a week the sprint does not cover
    let res = await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-17' }).expect(422);
    expect(res.body.error.code).toBe('OUT_OF_SPRINT');
    // a week whose first working day is past the deadline
    res = await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-10' }).expect(422);
    expect(res.body.error.code).toBe('PAST_DEADLINE');
    // a week of nothing but holidays has no day to offer
    const restore = getHolidays();
    try {
      setHolidays(['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']);
      res = await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-03' }).expect(422);
      /* THE COPY IS FROZEN (PLAN.md block 9 amendment 6). This is the one
         refusal on this route that is about a WEEK rather than a day, and it
         says so in the calendar's own words. Pinned whole: `expect.any(String)`
         took the wrong CODE and a reworded sentence alike, and the sentence is
         what the banner reads out to the PM. */
      expect(res.body.error).toEqual({ code: 'NOT_A_WORKDAY', message: 'That week has no working day.' });
    } finally {
      setHolidays(restore);
    }
    // every refusal wrote nothing and audited nothing
    expect((await rowOf(item._id)).starts_on ?? null).toBeNull();
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
    // IS NOT VACUOUS: the week every check allows lands
    await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-03' }).expect(200);
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-03');
  });

  it('refuses a week that is not a Monday, and a week sent WITH a day, as malformed (400) — nothing judged, nothing written', async () => {
    const { project, agent } = await setup();
    const { item } = await seedRow(project._id);
    for (const body of [
      { week: '2026-08-11' }, // a Tuesday
      { week: '2026-08-09' }, // a Sunday — the UTC-midnight trap would call it Monday's key
      { week: '2026-08-10', starts_on: '2026-08-12' }, // two owners in one act
      { week: '2026-08-10', starts_on: null },
    ]) {
      const res = await agent.patch(itemUrl(project._id, item._id)).send(body).expect(400);
      expect(res.body.error.code, JSON.stringify(body)).toBe('INVALID_BODY');
    }
    expect((await rowOf(item._id)).starts_on ?? null).toBeNull();
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
  });

  it('re-places a PLACED row by week — the Design Lead’s day is the PM’s to overwrite by week (drift report §H)', async () => {
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id, { startsOn: '2026-08-05' });
    await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-10' }).expect(200);
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-10');
    // the same week again is the no-op it is (invariant 10 logs changes)
    const res = await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-10' }).expect(200);
    // the no-op answers the SAME shape (PLAN.md amendment 4) — the client
    // re-stamps from every 200, so a body that went thin on the cheap path
    // would blank the row it was meant to leave alone
    expect(res.body).toEqual({ ok: true, noop: true, starts_on: '2026-08-10', sprint_id: String(sprint._id) });
    expect(await AuditLog.countDocuments({ action: 'sprintItem.plot', entity_id: String(item._id) })).toBe(1);
  });
});

describe('PATCH { starts_on } — the Design Lead’s day move stays INSIDE the row’s week (#89 §1), and needs a week to stay inside', () => {
  it('answers 422 NOT_PLACED for a row with no day — a card with no week is not on Deadlines to be dragged', async () => {
    const { project, agent } = await setup();
    const { item } = await seedRow(project._id);
    const res = await agent.patch(itemUrl(project._id, item._id)).send({ starts_on: '2026-08-05' }).expect(422);
    /* Frozen copy (PLAN.md amendment 6): the sentence TELLS the reader where
       a week comes from, which is the whole of what this refusal is for. The
       body is pinned whole, so a second field cannot appear unread. */
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'NOT_PLACED', message: 'That card has no week yet — place it on Sprint Schedules first.' },
    });
    expect((await rowOf(item._id)).starts_on ?? null).toBeNull();
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
    // the same body on the SAME row once the PM has given it a week goes through
    await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-03' }).expect(200);
    await agent.patch(itemUrl(project._id, item._id)).send({ starts_on: '2026-08-05' }).expect(200);
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-05');
  });

  it('answers 422 OUT_OF_WEEK, in the fourth voice, for a day past either edge of the current week — nothing written', async () => {
    const { project, agent } = await setup();
    const { item } = await seedRow(project._id, { startsOn: '2026-08-05' }); // Wed of week 3–7 Aug
    for (const day of ['2026-08-10', '2026-07-31', '2026-08-14']) {
      const res = await agent.patch(itemUrl(project._id, item._id)).send({ starts_on: day }).expect(422);
      expect(res.body.error, day).toEqual({
        code: 'OUT_OF_WEEK',
        message: "That day is outside the card's assigned week (Mon 3 Aug 2026 – Fri 7 Aug 2026).",
      });
    }
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-05');
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
  });

  it('takes a day inside the week — 200, the day written, one audit row with before and after', async () => {
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id, { startsOn: '2026-08-05' });
    for (const day of ['2026-08-03', '2026-08-07', '2026-08-04']) {
      const res = await agent.patch(itemUrl(project._id, item._id)).send({ starts_on: day }).expect(200);
      expect((await rowOf(item._id)).starts_on, day).toBe(day);
      // the day owner's 200 carries the frozen body too (PLAN.md amendment 4)
      expect(res.body, day).toEqual({ ok: true, starts_on: day, sprint_id: String(sprint._id) });
    }
    const moves = await AuditLog.find({ action: 'sprintItem.plot', entity_id: String(item._id) }).sort({ _id: 1 }).lean();
    expect(moves.map((m) => [(m.before as { starts_on: string }).starts_on, (m.after as { starts_on: string }).starts_on])).toEqual([
      ['2026-08-05', '2026-08-03'], ['2026-08-03', '2026-08-07'], ['2026-08-07', '2026-08-04'],
    ]);
    expect(moves.every((m) => m.actor === 'pm@frostdesigngroup.com')).toBe(true);
  });

  it('is gated by SURFACE only — any project member, no role check (JP at the block 9 gate, 2026-09-11)', async () => {
    // a second member of the same project writes the day; a non-member cannot
    // reach the route at all (invariant 9 — the membership check every route
    // already makes, and the ONLY check here)
    const { project, agent } = await setup();
    const { item } = await seedRow(project._id, { startsOn: '2026-08-05' });
    const lead = await User.create({ email: 'lead@frostdesigngroup.com' });
    await UserProject.create({ user_id: lead._id, project_id: project._id });
    const app = createApp({ env, redis: null, mongo: null });
    const leadAgent = request.agent(app);
    await leadAgent.post('/__test/login').send({ userId: String(lead._id), email: lead.email }).expect(200);
    await leadAgent.patch(itemUrl(project._id, item._id)).send({ starts_on: '2026-08-06' }).expect(200);
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-06');
    expect((await AuditLog.findOne({ action: 'sprintItem.plot', entity_id: String(item._id) }).lean())!.actor).toBe('lead@frostdesigngroup.com');
    const outsider = await User.create({ email: 'other@frostdesigngroup.com' });
    const outsiderAgent = request.agent(app);
    await outsiderAgent.post('/__test/login').send({ userId: String(outsider._id), email: outsider.email }).expect(200);
    const res = await outsiderAgent.patch(itemUrl(project._id, item._id)).send({ starts_on: '2026-08-07' });
    expect([403, 404]).toContain(res.status);
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-06');
    // the one-week route still guards the writer's own domain exactly as before
    void agent;
  });
});

describe('PUT /sprints re-date — displaced rows move to Outside any sprint, keeping their day; the save is never refused (#90)', () => {
  const put = (agent: Agent, pid: unknown, sprint: { _id: unknown; name: string }, start: string, end: string) =>
    agent.put(`/api/projects/${pid}/sprints`).send({ sprints: [{ id: String(sprint._id), name: sprint.name, start, end }] });

  it('nulls the membership of a row whose day left the range, keeps the day, names it in displaced[], audits once as the editor', async () => {
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id, { startsOn: '2026-08-12' });
    const res = await put(agent, project._id, sprint, '2026-08-03', '2026-08-07').expect(200);
    expect(res.body.displaced).toEqual([{
      id: String(item._id), display_id: 'MC-655', title: 'Sketch Asset: hero', starts_on: '2026-08-12', from_sprint: 'Sprint 46',
    }]);
    /* the NAME, never the id (PLAN.md amendment 5): the notice is read by a
       person deciding where to re-slot the card, and an ObjectId names
       nothing to them. Accepting either spelling let the useless one ship. */
    expect(res.body.displaced[0].from_sprint).not.toBe(String(sprint._id));
    const row = await rowOf(item._id);
    expect(row.sprint_id ?? null).toBeNull(); // *Outside any sprint*
    expect(row.starts_on).toBe('2026-08-12'); // the exact day, kept
    // ONE audit row per displaced row, the editor as actor — never `system`
    const logs = await AuditLog.find({ action: 'sprintItem.displaced', project_id: project._id }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actor: 'pm@frostdesigngroup.com', entity: 'sprint_item', entity_id: String(item._id),
      before: { starts_on: '2026-08-12', sprint_id: String(sprint._id) },
      after: { starts_on: '2026-08-12', sprint_id: null },
    });
    // the sprint itself was re-dated, not refused
    const saved = await Sprint.findById(sprint._id).lean();
    expect(saved).toMatchObject({ starts_on: '2026-08-03', ends_on: '2026-08-07' });
  });

  it('keeps a row whose day is ON the new boundary, and never touches an UNPLOTTED row — inclusive at both ends, no day, no displacement', async () => {
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id, { startsOn: '2026-08-07' });
    const unplotted = await SprintItem.create({
      project_id: project._id, sprint_id: sprint._id, mc_number: 'MC-655', trello_card_id: 'wc-2', position: 1, added_by: 'pm@frostdesigngroup.com',
    });
    const res = await put(agent, project._id, sprint, '2026-08-03', '2026-08-07').expect(200);
    expect(res.body.displaced ?? []).toEqual([]);
    expect(String((await rowOf(item._id)).sprint_id)).toBe(String(sprint._id));
    expect(String((await rowOf(unplotted._id)).sprint_id)).toBe(String(sprint._id));
    expect(await AuditLog.countDocuments({ action: 'sprintItem.displaced' })).toBe(0);
  });

  it('a re-date that displaces nothing answers no displaced[], touches no row, audits no displacement', async () => {
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id, { startsOn: '2026-08-05' });
    const before = await rowOf(item._id);
    const res = await put(agent, project._id, sprint, '2026-08-03', '2026-08-13').expect(200);
    expect(res.body.displaced ?? []).toEqual([]);
    const after = await rowOf(item._id);
    expect(after).toEqual(before); // byte for byte — no `updatedAt`, no position, nothing
    expect(await AuditLog.countDocuments({ action: 'sprintItem.displaced' })).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'sprints.replace' })).toBe(1);
  });

  it('a SHRINK never enters the deletion path — the row stays, removed_items stays empty, the sprint keeps its id', async () => {
    /* #90 keeps re-dating DISTINCT from deletion: deletion removes scheduled
       rows, audited as removed_items, behind a confirmation naming the count;
       a date edit is a light edit and must never be destructive. */
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id, { startsOn: '2026-08-12' });
    await put(agent, project._id, sprint, '2026-08-03', '2026-08-07').expect(200);
    expect(await SprintItem.countDocuments({ _id: item._id })).toBe(1);
    expect(await Sprint.countDocuments({ _id: sprint._id })).toBe(1);
    const replace = await AuditLog.findOne({ action: 'sprints.replace' }).lean();
    expect((replace!.after as { removed_items: unknown[] }).removed_items).toEqual([]);
    /* …and a displaced row belongs to NO sprint, so even deleting the sprint
       it was displaced from (the destructive act, cascading its own rows —
       proven above in "removing a sprint removes its scheduled rows WITH
       it") leaves it standing: it is the PM's to re-slot, never collateral. */
    await agent.put(`/api/projects/${project._id}/sprints`).send({ sprints: [{ name: 'Other', start: '2026-09-07', end: '2026-09-11' }] }).expect(200);
    expect(await SprintItem.countDocuments({ _id: item._id })).toBe(1);
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-12');
  });

  it('leaves a displaced row OUTSIDE even when its day sits inside ANOTHER kept sprint — never re-filed by the pass (#90)', async () => {
    /* #90's DISTINGUISHING claim, and the one shape no test held. A re-date
       that pushes a row out of its own sprint can easily leave its day inside
       a NEIGHBOURING sprint's range, and "file it there" is the obvious,
       wrong kindness: it is a membership decision nobody made, on a schedule
       the PM is in the middle of editing, and #90 gives the row to *Outside
       any sprint* so the PM sees it and chooses. The re-slot exists — it is
       the week click, one act later (the test below) — and it is the PM's.

       The neighbour is created in the SAME save, so this is the live shape:
       one modal apply that shortens one sprint and adds another. */
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id, { startsOn: '2026-08-12', sprint: { starts_on: '2026-08-03', ends_on: '2026-08-14' } });
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { id: String(sprint._id), name: 'Sprint 46', start: '2026-08-03', end: '2026-08-07' },
        { name: 'Sprint 47', start: '2026-08-10', end: '2026-08-14' },
      ],
    }).expect(200);
    // the neighbour really does cover the kept day — without this the test
    // would pass on a sprint that was never a candidate (rule 1)
    const neighbour = await Sprint.findOne({ project_id: project._id, name: 'Sprint 47' }).lean();
    expect(neighbour).not.toBeNull();
    expect(neighbour!.starts_on <= '2026-08-12' && '2026-08-12' <= neighbour!.ends_on).toBe(true);
    // …and the row went OUTSIDE all the same, day intact, named in the notice
    const row = await rowOf(item._id);
    expect(row.sprint_id ?? null).toBeNull();
    expect(String(row.sprint_id ?? '')).not.toBe(String(neighbour!._id));
    expect(row.starts_on).toBe('2026-08-12');
    expect(res.body.displaced.map((d: { id: string }) => d.id)).toEqual([String(item._id)]);
    const logs = await AuditLog.find({ action: 'sprintItem.displaced', project_id: project._id }).lean();
    expect(logs).toHaveLength(1);
    expect((logs[0]!.after as { sprint_id: unknown }).sprint_id).toBeNull();
    // the PM's own act still files it there — so the row is parked, not stranded
    await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-10' }).expect(200);
    expect(String((await rowOf(item._id)).sprint_id)).toBe(String(neighbour!._id));
  });

  it('names the sprint by the name SAVED IN THIS REQUEST — a rename in the same apply is the name the notice prints', async () => {
    /* PLAN.md amendment 5. One modal apply can rename AND re-date a sprint,
       and the notice is read after the save: printing the OLD name would send
       the PM looking for a sprint the screen behind the banner no longer has. */
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id, { startsOn: '2026-08-12', sprint: { starts_on: '2026-08-03', ends_on: '2026-08-14' } });
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [{ id: String(sprint._id), name: 'Sprint 46 revised', start: '2026-08-03', end: '2026-08-07' }],
    }).expect(200);
    expect(res.body.displaced).toEqual([{
      id: String(item._id), display_id: 'MC-655', title: 'Sketch Asset: hero', starts_on: '2026-08-12', from_sprint: 'Sprint 46 revised',
    }]);
    expect(res.body.displaced[0].from_sprint).not.toBe('Sprint 46'); // the name it had on the way in
  });

  it('judges ONLY the sprints whose dates changed in this request — a row already outside an untouched sprint is left alone (PLAN.md amendment 18a)', async () => {
    /* A row can sit outside its sprint's range without anything being wrong:
       rollover walks an unfinished card past its sprint's end BY DESIGN
       (§6.2), and that row keeps its membership until someone re-plans it.
       A sweep over every kept sprint would displace those rows on the next
       unrelated sprint save — a rename, a date change three sprints away —
       and audit each one as if the editor had done it. The pass is about
       what THIS request moved, so it asks only the sprints it moved. */
    const { project, agent } = await setup();
    const { sprint: sprintA, item: rolled } = await seedRow(project._id, { sprint: { starts_on: '2026-08-03', ends_on: '2026-08-07' } });
    // the rolled row: past its sprint's end, written the way rollover writes it
    await SprintItem.updateOne({ _id: rolled._id }, { $set: { starts_on: '2026-08-12' } });
    const sprintB = await Sprint.create({ project_id: project._id, name: 'Sprint 47', starts_on: '2026-08-10', ends_on: '2026-08-14', position: 2 });
    await WorkCard.create({
      project_id: project._id, trello_card_id: 'wc-b', mc_number: 'MC-700',
      name: 'Sketch Asset: second', current_list: 'Design', active: true,
    });
    const moved = await SprintItem.create({
      project_id: project._id, sprint_id: sprintB._id, mc_number: 'MC-700', trello_card_id: 'wc-b',
      position: 0, added_by: 'pm@frostdesigngroup.com', starts_on: '2026-08-14',
    });
    // the rolled row IS outside its sprint — the premise, asserted, so the
    // test cannot pass because nothing was ever a candidate
    expect('2026-08-12' > (await Sprint.findById(sprintA._id).lean())!.ends_on!).toBe(true);

    // ONE sprint re-dated: B. A is sent back byte-identical.
    const res = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { id: String(sprintA._id), name: 'Sprint 46', start: '2026-08-03', end: '2026-08-07' },
        { id: String(sprintB._id), name: 'Sprint 47', start: '2026-08-10', end: '2026-08-12' },
      ],
    }).expect(200);
    expect(res.body.displaced.map((d: { id: string }) => d.id)).toEqual([String(moved._id)]);
    expect(String((await rowOf(rolled._id)).sprint_id)).toBe(String(sprintA._id)); // untouched
    expect((await rowOf(moved._id)).sprint_id ?? null).toBeNull();
    const logs = await AuditLog.find({ action: 'sprintItem.displaced', project_id: project._id }).lean();
    expect(logs.map((l) => l.entity_id)).toEqual([String(moved._id)]);

    // IS NOT VACUOUS: re-date A itself and the same rolled row DOES go out
    const second = await agent.put(`/api/projects/${project._id}/sprints`).send({
      sprints: [
        { id: String(sprintA._id), name: 'Sprint 46', start: '2026-08-03', end: '2026-08-06' },
        { id: String(sprintB._id), name: 'Sprint 47', start: '2026-08-10', end: '2026-08-12' },
      ],
    }).expect(200);
    expect(second.body.displaced.map((d: { id: string }) => d.id)).toEqual([String(rolled._id)]);
    expect((await rowOf(rolled._id)).sprint_id ?? null).toBeNull();
  });

  it('writes each displacement CONDITIONALLY — a row whose day moved under the pass is neither displaced nor audited (PLAN.md amendment 18b)', async () => {
    /* R3-2's discipline, borrowed from rollover: the pass reads the rows,
       then writes. Between those two moments the Design Lead can drop the
       card on another day — the day write is a different route on the same
       collection — and a blind `updateMany` would null the membership of a
       row that, as it now stands, is inside the new range. Worse, the notice
       and the audit row would both claim a move that did not happen.

       Each write is keyed on the `starts_on` and `sprint_id` the pass READ;
       a row that no longer matches is left exactly as the other writer left
       it, and drops out of `displaced[]` and out of the log with it. The
       second row proves the pass carried on rather than bailing. */
    const { project, agent } = await setup();
    const { sprint, item: raced } = await seedRow(project._id, { startsOn: '2026-08-12', sprint: { starts_on: '2026-08-03', ends_on: '2026-08-14' } });
    await WorkCard.create({
      project_id: project._id, trello_card_id: 'wc-b', mc_number: 'MC-700',
      name: 'Sketch Asset: second', current_list: 'Design', active: true,
    });
    const stays = await SprintItem.create({
      project_id: project._id, sprint_id: sprint._id, mc_number: 'MC-700', trello_card_id: 'wc-b',
      position: 1, added_by: 'pm@frostdesigngroup.com', starts_on: '2026-08-13',
    });
    /* slip the Design Lead's day write under the pass's FIRST conditional
       update — the same seam test/rollover.test.ts uses for R3-2. The raced
       row is position 0, so it is the row the pass reaches first. */
    const original = SprintItem.updateOne.bind(SprintItem) as unknown as (...a: unknown[]) => unknown;
    const spy = vi.spyOn(SprintItem, 'updateOne').mockImplementationOnce((async (...args: unknown[]) => {
      await SprintItem.collection.updateOne({ _id: raced._id }, { $set: { starts_on: '2026-08-05' } });
      return original(...args);
    }) as never);
    let res;
    try {
      res = await agent.put(`/api/projects/${project._id}/sprints`).send({
        sprints: [{ id: String(sprint._id), name: 'Sprint 46', start: '2026-08-03', end: '2026-08-07' }],
      }).expect(200);
    } finally {
      spy.mockRestore();
    }
    // the raced row keeps the OTHER writer's day AND its membership — on that
    // day it belongs in the sprint, and nothing claims otherwise
    const rowA = await rowOf(raced._id);
    expect(rowA.starts_on).toBe('2026-08-05');
    expect(String(rowA.sprint_id)).toBe(String(sprint._id));
    // …and the pass went on to the row it really did move
    expect(res!.body.displaced.map((d: { id: string }) => d.id)).toEqual([String(stays._id)]);
    expect((await rowOf(stays._id)).sprint_id ?? null).toBeNull();
    const logs = await AuditLog.find({ action: 'sprintItem.displaced', project_id: project._id }).lean();
    expect(logs.map((l) => l.entity_id)).toEqual([String(stays._id)]);
  });

  it('a displaced row re-slots by the PM’s week click — into the sprint that covers the day, else it stays outside (invariant 12)', async () => {
    const { project, agent } = await setup();
    const { sprint, item } = await seedRow(project._id, { startsOn: '2026-08-12' });
    await put(agent, project._id, sprint, '2026-08-03', '2026-08-07').expect(200);
    expect((await rowOf(item._id)).sprint_id ?? null).toBeNull();
    // a week no sprint covers: the row keeps its new day and stays outside (gaps are legal)
    await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-17' }).expect(200);
    let row = await rowOf(item._id);
    expect(row.starts_on).toBe('2026-08-17');
    expect(row.sprint_id ?? null).toBeNull();
    // the sprint's own week: membership derives from the day it lands on
    await agent.patch(itemUrl(project._id, item._id)).send({ week: '2026-08-03' }).expect(200);
    row = await rowOf(item._id);
    expect(row.starts_on).toBe('2026-08-03');
    expect(String(row.sprint_id)).toBe(String(sprint._id));
    // and a displaced row still takes the Design Lead's day inside its week
    await put(agent, project._id, sprint, '2026-08-10', '2026-08-14').expect(200); // displaces it again
    expect((await rowOf(item._id)).sprint_id ?? null).toBeNull();
    await agent.patch(itemUrl(project._id, item._id)).send({ starts_on: '2026-08-05' }).expect(200);
    expect((await rowOf(item._id)).starts_on).toBe('2026-08-05');
  });
});

/**
 * The refusal copy carries a date, and there are now two pure-string-math
 * formatters on the server: the route's (pinned in place by
 * test/sprints-modal.test.ts, which slices it out of this file's raw source
 * and runs it against the client's) and the validator's, which the service
 * needs because it cannot import a private helper out of a route module.
 * Two copies stay honest only if they are RUN against each other (test/CLAUDE.md
 * rule 2) — comparing them as source text would pass on a table that spelled
 * 'Sept'.
 */
describe('the route’s long date and the validator’s render the same words', () => {
  const ROUTE = readFileSync(new URL('../src/routes/schedule.ts', import.meta.url), 'utf8');
  const routeLongDate = new Function(`
    ${ROUTE.slice(ROUTE.indexOf('const MONTHS_SHORT'), ROUTE.indexOf('\n', ROUTE.indexOf('const MONTHS_SHORT')))}
    ${ROUTE.slice(ROUTE.indexOf('function longDate('), ROUTE.indexOf('\n}', ROUTE.indexOf('function longDate(')) + 2)
      .replace('(iso: string): string', '(iso)')}
    return longDate;
  `)() as (iso: string) => string;

  it('agrees on every month, the year’s edges and a leap day', () => {
    const days = ['2026-01-01', '2026-12-31', '2024-02-29', '2026-08-09'];
    for (let m = 1; m <= 12; m++) days.push(`2026-${String(m).padStart(2, '0')}-17`);
    for (const iso of days) expect(longDate(iso), iso).toBe(routeLongDate(iso));
  });

  it('says "Sep", never the en-GB locale’s "Sept"', () => {
    expect(longDate('2026-09-01')).toBe('1 Sep 2026');
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

/**
 * The acknowledgement surface is GONE (owl #87, JP, 2026-09-08): the four
 * routes below are deleted, not disabled, and this is the guard that says so.
 *
 * It is answered by an authenticated MEMBER of the project, so a 404 is the
 * route table's answer and not an auth refusal — and a live route on each of
 * the same two routers is asserted alongside, so the block cannot go green by
 * the app failing to boot or the project id being wrong.
 */
describe('withdrawn routes — the acknowledgement and day-plan surface (owl #87)', () => {
  it('answers 404 for every deleted route while the routers beside them still serve', async () => {
    const { project, agent, mk } = await setup();
    await mk(1, { slotted_week: '2026-08-03' });

    // the control: one live route per router that lost a route below
    await agent.get(`/api/projects/${project._id}/deliverables`).expect(200); // deliverables router
    await agent.patch(`/api/projects/${project._id}/deliverables/c1/planning`).send({ pinned: true }).expect(200); // schedule router

    await agent.get(`/api/projects/${project._id}/deadlines`).expect(404);
    await agent.put(`/api/projects/${project._id}/deadlines/day`)
      .send({ cardId: 'c1', phase: 'sketch', day: '2026-08-04' }).expect(404);
    await agent.post(`/api/projects/${project._id}/conflicts/acknowledge`)
      .send({ conflict_key: '2026-08-03|urgent-overlap|3|c1:sketch' }).expect(404);
    await agent.post(`/api/projects/${project._id}/conflicts/restore`)
      .send({ conflict_key: '2026-08-03|urgent-overlap|3|c1:sketch' }).expect(404);
  });

  it('writes nothing: a call to a deleted route leaves no row and no audit trail', async () => {
    const { project, agent, mk } = await setup();
    await mk(1, { slotted_week: '2026-08-03' });
    await agent.post(`/api/projects/${project._id}/conflicts/acknowledge`)
      .send({ conflict_key: '2026-08-03|urgent-overlap|3|c1:sketch' }).expect(404);
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
    const names = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name);
    expect(names).not.toContain('conflict_acknowledgements'); // 001 no longer creates it
  });
});

/* BR-9 lives on, rehomed. The claim — a card with no deadline anywhere is
   never LATE — was asserted through `GET /deadlines`'s milestones until that
   route was deleted (owl #87). The same field rides the pipeline row every
   live tab reads, so the rule keeps its guard. The urgent-overlap conflict
   test that stood beside it went with the feature: there is no conflict left
   to detect. */
describe('BR-9 — no deadline is no conflict', () => {
  it('a card with no deadline anywhere is never flagged late', async () => {
    const { project, agent, mk } = await setup();
    await mk(1, { slotted_week: '2026-08-03' }); // no trello_due, no sheet_deadline
    const res = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    const row = res.body.rows.find((r: { cardId: string }) => r.cardId === 'c1');
    expect(row.deadline ?? null).toBeNull();
    expect(row.forecast.late).toBe(false);
  });

  it('and one whose forecast lands past its deadline IS — so the guard above can fail', async () => {
    const { project, agent, mk } = await setup();
    await mk(2, { slotted_week: '2026-08-03', sheet_deadline: '2026-08-05' });
    const res = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    const row = res.body.rows.find((r: { cardId: string }) => r.cardId === 'c2');
    expect(row.forecast.late).toBe(true);
  });
});

describe('pipeline read (FR-4.1–4.4)', () => {
  it('serves rows with forecast, sprints and capacity', async () => {
    const { project, agent, mk } = await setup();
    await mk(1, { figma_url: 'https://figma.com/f/x', sheet_deadline: '2026-09-04' });
    await mk(2, { difficulty: null }); // a second row, sparser than the first
    const res = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    expect(res.body.rows).toHaveLength(2);
    const r1 = res.body.rows.find((r: { cardId: string }) => r.cardId === 'c1');
    expect(r1.forecast.sketchDelivery).toBeTruthy();
    // invariant 14 / BR-9: no Trello due, so the SHEET date is the deadline the row is measured against
    expect(r1.deadline).toBe('2026-09-04');
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
