/**
 * Sprint Schedules on the WORK-CARD unit — owl miles→jp #72, BRD v2.7, BR-1a.
 *
 * The suite is organised around the rules #72 asks for BY NAME, because every
 * one of them is a thing a reasonable engineer would build the other way:
 *
 *   A. nothing is auto-populated, and absence is not a sync failure
 *   B. added and plotted are two acts; unplotted is a real state
 *   C. no cascade — placing a sketch does nothing to its render (BR-1a)
 *   D. the filter governs what can be ADDED, never what is REMOVED
 *   E. one row per card, and the bar's finish is computed from the click
 *
 * `toHTML()`-style render checks are not here; this file proves the server
 * contract. Geometry and the two dropdowns are the live pass's to prove.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { loadSprintItems, finishOf } from '../src/services/sprint-items.ts';
import { EMPIRICAL } from '../lib/model.ts';
import { workday } from '../lib/calendar.ts';
import {
  AuditLog,
  Deliverable,
  Project,
  Sprint,
  SprintItem,
  User,
  UserProject,
  WorkCard,
} from '../src/models/index.ts';

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

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function setup() {
  const project = await Project.create({
    code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 22,
  });
  const user = await User.create({ email: 'ops@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  const sprint = await Sprint.create({
    project_id: project._id, name: 'Sprint 12', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 0,
  });
  // the MC group: one main card carrying the client date and the urgency
  await Deliverable.create({
    project_id: project._id, mc_number: 'MC-07', display_id: 'MC-07', trello_card_id: 'main07',
    name: 'GCat Twirling', difficulty: 'Medium', lane: 'design', current_list: 'Design',
    sheet_deadline: '2026-12-31',
  });
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, sprint, agent };
}

/** One task card under MC-07 — #73's sample: three assets, sketch and render each. */
const mkCard = (projectId: Types.ObjectId, id: string, over: Record<string, unknown> = {}) =>
  WorkCard.create({
    project_id: projectId, mc_number: 'MC-07', trello_card_id: id,
    name: `Sketch Asset: ${id}`, task_prefix: 'Sketch Asset', difficulty: 'Medium',
    current_list: 'Working on Design', ...over,
  });

const load = (projectId: Types.ObjectId) => loadSprintItems(projectId, EMPIRICAL);
const add = (agent: ReturnType<typeof request.agent>, pid: unknown, body: Record<string, unknown>) =>
  agent.post(`/api/projects/${pid}/sprint-items`).send(body);

/* ---------------------------------------------------------------------- */
/* A — nothing is auto-populated                                           */
/* ---------------------------------------------------------------------- */

describe('the schedule is opt-in — it is NOT a mirror of the board', () => {
  it('a board full of task cards yields an EMPTY schedule', async () => {
    const { project } = await setup();
    await mkCard(project._id, 'w1');
    await mkCard(project._id, 'w2');
    await mkCard(project._id, 'w3');

    const { rows } = await load(project._id);
    /* #72 §2, flagged hard by product because every OTHER surface in Sirius
       reconciles against the board — so an empty schedule reads as a failed
       sync. Here absence is the design. If this test ever starts failing
       because rows appeared on their own, the fix is to delete whatever
       populated them, not to update the number. */
    expect(rows).toEqual([]);
  });

  it('offers every incomplete card for ADDING, keyed by MC', async () => {
    const { project } = await setup();
    await mkCard(project._id, 'w1');
    await mkCard(project._id, 'w2');

    const { addable } = await load(project._id);
    expect(addable['MC-07']!.map((c) => c.cardId).sort()).toEqual(['w1', 'w2']);
  });

  it('sorts the dropdown alphabetically by the FULL label — Render before Sketch', async () => {
    const { project } = await setup();
    await mkCard(project._id, 'r1', { name: 'Render Asset: GRaf Playing Flute', task_prefix: 'Render Asset' });
    await mkCard(project._id, 's1', { name: 'Sketch Asset: GRaf Playing Flute' });
    await mkCard(project._id, 'r2', { name: 'Render Asset: GCat Twirling', task_prefix: 'Render Asset' });

    /* #73's warning, made a test so nobody "fixes" it: alphabetical puts
       Render before Sketch — the reverse of the order the work happens in.
       That is the correct output of the rule as stated, and the rule is
       explicitly provisional. */
    const { addable } = await load(project._id);
    expect(addable['MC-07']!.map((c) => c.name)).toEqual([
      'Render Asset: GCat Twirling',
      'Render Asset: GRaf Playing Flute',
      'Sketch Asset: GRaf Playing Flute',
    ]);
  });

  it('stores the FULL card name — the menu ellipsis is a display clamp, not the value', async () => {
    const { project, sprint, agent } = await setup();
    const full = 'Sketch Asset: Corey G Singing "Chicosci Vampire Social Club" by Chicosci';
    await mkCard(project._id, 'long', { name: full });
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'long' }).expect(201);

    // #73: 71 characters that only LOOK truncated. Two cards under one MC can
    // share their first 40, so a shortened string is not a safe identifier.
    const { rows } = await load(project._id);
    expect(rows[0]!.name).toBe(full);
  });
});

/* ---------------------------------------------------------------------- */
/* B — added and plotted are two separate acts                             */
/* ---------------------------------------------------------------------- */

describe('adding a card and plotting its bar are two acts', () => {
  it('lands UNPLOTTED, and unplotted is a real state rather than missing data', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);

    const { rows } = await load(project._id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startsOn).toBeNull();
    expect(rows[0]!.finish).toBeNull(); // no start, nothing to compute a finish from
    expect(rows[0]!.late).toBe(false);
  });

  it('the click sets the START and the finish is COMPUTED from it', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await agent
      .patch(`/api/projects/${project._id}/sprint-items/${res.body.id}`)
      .send({ starts_on: '2026-08-03' })
      .expect(200);

    const { rows } = await load(project._id);
    expect(rows[0]!.startsOn).toBe('2026-08-03');
    /* Derived, not typed: `lead + design` on the working-day calendar. #72 §6 —
       the user sets the start, the finish is computed, and if the bar and the
       FORECASTED column can ever disagree something is wrong. Both read this. */
    expect(rows[0]!.finish).toBe(finishOf(
      { difficulty: 'Medium', current_list: 'Working on Design', task_prefix: 'Sketch Asset' },
      '2026-08-03',
      EMPIRICAL,
    ));
    expect(rows[0]!.finish).not.toBeNull();
  });

  it('has NO review wait in the bar — one phase, and the wait belongs to neither', async () => {
    /* The reason #72 split the row in two. A single phase is lead + design;
       the client's wait sits BETWEEN phases and so belongs to no row. */
    const finish = finishOf(
      { difficulty: 'Medium', current_list: 'Working on Design', task_prefix: 'Sketch Asset' },
      '2026-08-03',
      EMPIRICAL,
    );
    const design = EMPIRICAL.design.Medium!.design!['0.7'];
    expect(finish).toBe(localDate(workday('2026-08-03', 0.5 + design)));
    // and it is strictly shorter than a cycle that included the review wait
    expect(finish! < localDate(workday('2026-08-03', 0.5 + design + EMPIRICAL.review['0.7']))).toBe(true);
  });

  it('draws no bar for a card with no difficulty label', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1', { difficulty: null });
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await agent
      .patch(`/api/projects/${project._id}/sprint-items/${res.body.id}`)
      .send({ starts_on: '2026-08-03' })
      .expect(200);

    const { rows } = await load(project._id);
    expect(rows[0]!.startsOn).toBe('2026-08-03'); // the row is still placed
    expect(rows[0]!.finish).toBeNull(); // there is just nothing to key a design cell on
  });

  it('un-plots back to the list rather than deleting the row', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    const url = `/api/projects/${project._id}/sprint-items/${res.body.id}`;
    await agent.patch(url).send({ starts_on: '2026-08-03' }).expect(200);
    await agent.patch(url).send({ starts_on: null }).expect(200);

    const { rows } = await load(project._id);
    expect(rows).toHaveLength(1); // still in the sprint's list
    expect(rows[0]!.startsOn).toBeNull();
  });
});

/* ---------------------------------------------------------------------- */
/* C — no cascade (BR-1a)                                                  */
/* ---------------------------------------------------------------------- */

describe('every row is placed by hand, render included (BR-1a)', () => {
  it('plotting a sketch creates NOTHING for its render', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'sketch1');
    await mkCard(project._id, 'render1', { name: 'Render Asset: GCat', task_prefix: 'Render Asset' });
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'sketch1' }).expect(201);
    await agent
      .patch(`/api/projects/${project._id}/sprint-items/${res.body.id}`)
      .send({ starts_on: '2026-08-03' })
      .expect(200);

    /* Auto-placing render the moment sketch is forecast to land is exactly the
       helpful thing one adds unprompted — and it removes the control this
       design exists to give. The render card is right there, unscheduled. */
    const { rows } = await load(project._id);
    expect(rows.map((r) => r.cardId)).toEqual(['sketch1']);
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(1);
  });
});

/* ---------------------------------------------------------------------- */
/* D — the filter governs ADD, never REMOVE                                */
/* ---------------------------------------------------------------------- */

describe('two rules that look alike and are not (#72 §5)', () => {
  it('a card already complete is never OFFERED', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'done1', { current_list: 'Done' });
    await mkCard(project._id, 'open1');

    const { addable } = await load(project._id);
    expect(addable['MC-07']!.map((c) => c.cardId)).toEqual(['open1']);
    // and the server refuses it, so the dropdown is not the only guard
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'done1' }).expect(409);
  });

  it('a card that completes AFTER being scheduled STAYS', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await agent
      .patch(`/api/projects/${project._id}/sprint-items/${res.body.id}`)
      .send({ starts_on: '2026-08-03' })
      .expect(200);

    await WorkCard.updateOne({ project_id: project._id, trello_card_id: 'w1' }, { $set: { current_list: 'Done' } });

    /* Not removed, not greyed out, not prompted to clear. A tidy-up that
       pruned completed rows would destroy the record of what was planned. */
    const { rows, addable } = await load(project._id);
    expect(rows.map((r) => r.cardId)).toEqual(['w1']);
    expect(rows[0]!.startsOn).toBe('2026-08-03'); // and it keeps its bar
    expect(addable['MC-07'] ?? []).toEqual([]); // while no longer being offerable
  });

  it('keeps a scheduled row whose card has left the board', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await WorkCard.updateOne({ project_id: project._id, trello_card_id: 'w1' }, { $set: { active: false } });

    const { rows } = await load(project._id);
    expect(rows).toHaveLength(1); // the schedule is the record of what was planned
    expect(rows[0]!.cardId).toBe('w1');
    expect(rows[0]!.finish).toBeNull();
  });
});

/* ---------------------------------------------------------------------- */
/* E — one row per card, and the deadline it is measured against           */
/* ---------------------------------------------------------------------- */

describe('one row = one task card = one bar', () => {
  it('refuses a second row for the same card', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    const dup = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(409);
    expect(dup.body.error.code).toBe('ALREADY_SCHEDULED');
    // and it is off the dropdown, so the refusal is a backstop not the UX
    const { addable } = await load(project._id);
    expect(addable['MC-07'] ?? []).toEqual([]);
  });

  it('inherits the MC group’s client date and urgency, not a task’s own', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);

    const { rows } = await load(project._id);
    // task cards carry no labels — urgency and the client date are the group's
    expect(rows[0]!.deadline).toBe('2026-12-31');
    expect(rows[0]!.urgent).toBe(false);

    await Deliverable.updateOne({ trello_card_id: 'main07' }, { $set: { urgency: 'Urgent' } });
    expect((await load(project._id)).rows[0]!.urgent).toBe(true);
  });

  it('takes the EARLIEST date when the MC group disagrees with itself', async () => {
    const { project, sprint, agent } = await setup();
    // invariant 3: mc_number is not a key — MC-825 carries 99 deliverables
    await Deliverable.create({
      project_id: project._id, mc_number: 'MC-07', display_id: 'MC-07.2', trello_card_id: 'main07b',
      name: 'Second', difficulty: 'Medium', lane: 'design', current_list: 'Design',
      sheet_deadline: '2026-09-01',
    });
    await mkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);

    const { rows } = await load(project._id);
    expect(rows[0]!.deadline).toBe('2026-09-01'); // the binding one, not the later
  });

  it('lets the task card’s OWN due date win over the group’s', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1', { trello_due: '2026-08-20' });
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);

    // invariant 14's shape, one level down — task cards are W2-writable
    expect((await load(project._id)).rows[0]!.deadline).toBe('2026-08-20');
  });

  it('flags late when the WORK runs past the date, and never without a date', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1', { trello_due: '2026-08-04' });
    await mkCard(project._id, 'w2');
    await Deliverable.updateOne({ trello_card_id: 'main07' }, { $unset: { sheet_deadline: 1 } });
    const a = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    const b = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w2' }).expect(201);
    for (const id of [a.body.id, b.body.id]) {
      await agent
        .patch(`/api/projects/${project._id}/sprint-items/${id}`)
        .send({ starts_on: '2026-08-03' })
        .expect(200);
    }

    const { rows } = await load(project._id);
    const byId = new Map(rows.map((r) => [r.cardId, r]));
    expect(byId.get('w1')!.finish! > '2026-08-04').toBe(true);
    expect(byId.get('w1')!.late).toBe(true);
    expect(byId.get('w2')!.deadline).toBeNull();
    expect(byId.get('w2')!.late).toBe(false); // BR-9: no deadline is no conflict
  });
});

/* ---------------------------------------------------------------------- */
/* the write surface                                                       */
/* ---------------------------------------------------------------------- */

describe('the routes are Sirius-owned planning writes', () => {
  it('audits add, plot and remove (invariant 10)', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    const url = `/api/projects/${project._id}/sprint-items/${res.body.id}`;
    await agent.patch(url).send({ starts_on: '2026-08-03' }).expect(200);
    await agent.delete(url).expect(200);

    const actions = (await AuditLog.find({ project_id: project._id }).sort({ _id: 1 }).lean()).map((a) => a.action);
    expect(actions).toEqual(['sprintItem.add', 'sprintItem.plot', 'sprintItem.remove']);
  });

  it('records the before AND after of a move, so a plot is reconstructable', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    const url = `/api/projects/${project._id}/sprint-items/${res.body.id}`;
    await agent.patch(url).send({ starts_on: '2026-08-03' }).expect(200);
    await agent.patch(url).send({ starts_on: '2026-08-10' }).expect(200);

    const moves = await AuditLog.find({ project_id: project._id, action: 'sprintItem.plot' }).sort({ _id: 1 }).lean();
    expect(moves[1]!.before).toMatchObject({ starts_on: '2026-08-03' });
    expect(moves[1]!.after).toMatchObject({ starts_on: '2026-08-10' });
  });

  it('refuses a field Sirius does not own', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    // strict body: an unknown key is REFUSED, not ignored (src/CLAUDE.md §2)
    await agent
      .patch(`/api/projects/${project._id}/sprint-items/${res.body.id}`)
      .send({ starts_on: '2026-08-03', difficulty: 'Hard' })
      .expect(400);
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1', starts_on: '2026-08-03' })
      .expect(400);
  });

  it('refuses a malformed date rather than storing it', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await agent
      .patch(`/api/projects/${project._id}/sprint-items/${res.body.id}`)
      .send({ starts_on: '3 Aug' })
      .expect(400);
  });

  it('never reaches across projects (invariant 1)', async () => {
    const { project, sprint, agent } = await setup();
    const other = await Project.create({
      code: 'rt-999', name: 'Other', trello_board_id: 'fxB', weekly_capacity: 22,
    });
    const otherSprint = await Sprint.create({
      project_id: other._id, name: 'S', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 0,
    });
    await WorkCard.create({
      project_id: other._id, mc_number: 'MC-07', trello_card_id: 'foreign',
      name: 'Foreign', difficulty: 'Medium', current_list: 'Working on Design',
    });
    await mkCard(project._id, 'w1');

    // a sprint belonging to another project
    await add(agent, project._id, { sprint_id: String(otherSprint._id), card_id: 'w1' }).expect(404);
    // a card belonging to another project
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'foreign' }).expect(404);
    expect(await SprintItem.countDocuments({})).toBe(0);
  });

  it('404s an item id from another project instead of touching it', async () => {
    const { project, sprint, agent } = await setup();
    const other = await Project.create({
      code: 'rt-999', name: 'Other', trello_board_id: 'fxB', weekly_capacity: 22,
    });
    const foreign = await SprintItem.create({
      project_id: other._id, sprint_id: sprint._id, mc_number: 'MC-07',
      trello_card_id: 'x', added_by: 'someone@frostdesigngroup.com',
    });
    const url = `/api/projects/${project._id}/sprint-items/${foreign._id}`;
    await agent.patch(url).send({ starts_on: '2026-08-03' }).expect(404);
    await agent.delete(url).expect(404);
    expect(await SprintItem.countDocuments({ _id: foreign._id })).toBe(1);
  });
});
