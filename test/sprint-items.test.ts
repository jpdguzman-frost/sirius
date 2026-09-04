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
import { loadPipeline } from '../src/services/pipeline.ts';
import { finishOf } from '../src/services/sprint-items.ts';
import { EMPIRICAL } from '../lib/model.ts';
import { forecast } from '../lib/forecast.ts';
import { localIso } from '../lib/calendar.ts';
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

/* Through `loadPipeline`, not `loadSprintItems` directly — sprint items are
   opt-in on that call, so going the real route also proves the one caller that
   asks for them actually gets them. */
const load = async (projectId: Types.ObjectId) =>
  (await loadPipeline(projectId, '2026-08-03', 22, { withSprintItems: true })).sprintItems;

const itemUrl = (pid: unknown, id: string) => `/api/projects/${pid}/sprint-items/${id}`;
const add = (agent: ReturnType<typeof request.agent>, pid: unknown, body: Record<string, unknown>) =>
  agent.post(`/api/projects/${pid}/sprint-items`).send(body);
/** add + plot, the pair almost every case here needs. Returns the item id. */
const addAndPlot = async (
  agent: ReturnType<typeof request.agent>,
  pid: unknown,
  cardId: string,
  sprintId: string,
  day: string,
) => {
  const res = await add(agent, pid, { sprint_id: sprintId, card_id: cardId }).expect(201);
  await agent.patch(itemUrl(pid, res.body.id)).send({ starts_on: day }).expect(200);
  return res.body.id as string;
};

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

  /* THE ENGINE IS THE ORACLE, not a second copy of its arithmetic.
     Asserting against `finishOf(...)` with the same inputs was tautological —
     it could only fail if `loadSprintItems` stopped calling `finishOf` at all.
     And re-deriving `workday(start, 0.5 + design)` here re-typed the engine's
     own lead constant, so the ONE guard on that number was pinned to the copy
     rather than to the engine, and could never have caught them drifting apart
     (test/CLAUDE.md rule 2). Both sides now execute the shipped engine. */
  it('the click sets the START and the finish is the ENGINE’s own phase delivery', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');

    const { rows } = await load(project._id);
    expect(rows[0]!.startsOn).toBe('2026-08-03');

    const engine = forecast(
      {
        difficulty: 'Medium',
        currentList: 'Working on Design',
        labels: ['Sketch Asset'],
        startDate: '2026-08-03',
      },
      EMPIRICAL,
    );
    // #72 §6: the user sets the start, the finish is computed, and if the bar
    // and the FORECASTED column can ever disagree something is wrong.
    expect(rows[0]!.finish).toBe(localIso(engine.sketchDelivery));
    expect(rows[0]!.finish).not.toBeNull();
  });

  it('has NO review wait in the bar — one phase, and the wait belongs to neither', async () => {
    /* The reason #72 split the row in two. A single phase is lead + design;
       the client's wait sits BETWEEN phases and so belongs to no row. Both
       bounds come off the engine result, so the lead is never typed here. */
    const card = {
      difficulty: 'Medium',
      currentList: 'Working on Design',
      labels: ['Sketch Asset'],
      startDate: '2026-08-03',
    };
    const engine = forecast(card, EMPIRICAL);
    const finish = finishOf(
      { difficulty: 'Medium', current_list: 'Working on Design', task_prefix: 'Sketch Asset' },
      '2026-08-03',
      EMPIRICAL,
    );

    expect(finish).toBe(localIso(engine.sketchDelivery));
    // strictly earlier than the point the engine reaches once review is added
    expect(engine.sketchReview).toBeGreaterThan(0); // or the case below is vacuous
    expect(finish! < localIso(engine.sketchApproved)).toBe(true);
  });

  /* TIMEZONE. `new Date('2026-08-03')` is UTC midnight, so a raw string handed
     to `workday` starts the walk a day early west of UTC — which is what the
     first version of `finishOf` did. The dual-TZ suite runs UTC and Manila,
     both at or ahead of UTC, so only an explicit western zone can catch it.
     Asserted as agreement with the engine, which parses correctly, rather than
     as a fixed date — the rule is "these two never disagree", in any zone. */
  it('agrees with the engine in a timezone WEST of UTC', async () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      const card = {
        difficulty: 'Medium',
        currentList: 'Working on Design',
        labels: ['Sketch Asset'],
        startDate: '2026-08-03',
      };
      expect(
        finishOf(
          { difficulty: 'Medium', current_list: 'Working on Design', task_prefix: 'Sketch Asset' },
          '2026-08-03',
          EMPIRICAL,
        ),
      ).toBe(localIso(forecast(card, EMPIRICAL).sketchDelivery));
    } finally {
      /* `process.env.TZ = undefined` stores the STRING 'undefined', which Node
         cannot parse and silently treats as UTC — dropping the rest of this
         worker into the wrong zone, which is exactly the class of bug this
         case exists to catch. `npm run test:run` sets no TZ, so the undefined
         branch is the common one. */
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  /* THE CELL IS NOT CHOSEN BY THE CARD'S TITLE. `laneOf` matches
     /asset|illustrat|render|icon/, and every task prefix the board actually
     uses — 'Sketch Asset', 'Render Asset', 'Icon Clean Up' — matches it. Feeding
     the prefix in as a label therefore classified EVERY task card as `assets`,
     which for an Easy card selects a 13.88-day cell instead of a 0.94-day one.
     Fourteen times the duration, decided by a naming habit. Asserted across the
     three real prefixes rather than on one, so a fourth prefix cannot quietly
     reintroduce it. */
  it('does not let the task PREFIX choose the design cell', async () => {
    const { project, sprint, agent } = await setup();
    const finishes = new Set<string>();
    for (const [i, prefix] of ['Sketch Asset', 'Render Asset', 'Icon Clean Up'].entries()) {
      const id = `p${i}`;
      await mkCard(project._id, id, { difficulty: 'Easy', task_prefix: prefix, name: `${prefix}: X` });
      await addAndPlot(agent, project._id, id, String(sprint._id), '2026-08-03');
    }
    const { rows } = await load(project._id);
    rows.forEach((r) => finishes.add(r.finish!));

    // one list, one lane, one duration — the prefix contributes nothing
    expect(finishes.size).toBe(1);
    // and it is the DESIGN cell the card's own list implies, not the assets one
    const expected = localIso(
      forecast(
        { difficulty: 'Easy', currentList: 'Working on Design', labels: [], startDate: '2026-08-03' },
        EMPIRICAL,
      ).sketchDelivery,
    );
    expect([...finishes][0]).toBe(expected);
    // the trap it replaces was not subtle: assets would have been ~13 days out
    const assetsCell = localIso(
      forecast(
        { difficulty: 'Easy', currentList: 'Working on Design', labels: ['Sketch Asset'], startDate: '2026-08-03' },
        EMPIRICAL,
      ).sketchDelivery,
    );
    expect(assetsCell).not.toBe(expected);
  });

  it('draws no bar for a card with no difficulty label', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1', { difficulty: null });
    await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');

    const { rows } = await load(project._id);
    expect(rows[0]!.startsOn).toBe('2026-08-03'); // the row is still placed
    expect(rows[0]!.finish).toBeNull(); // there is just nothing to key a design cell on
  });

  it('un-plots back to the list rather than deleting the row', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.patch(itemUrl(project._id, id)).send({ starts_on: null }).expect(200);

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
    await addAndPlot(agent, project._id, 'sketch1', String(sprint._id), '2026-08-03');

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
    await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');

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
/* E — one row per card, the deadline it is measured against, its urgency  */
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

  it('inherits the MC group’s client date, not a task’s own', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);

    const { rows } = await load(project._id);
    // the client date is the group's (the deadline half of the old #58
    // judgement — untouched by #78, revisited in block 3)
    expect(rows[0]!.deadline).toBe('2026-12-31');
  });

  it('is urgent iff ITS OWN card carries the label — never inherited (owl #78)', async () => {
    /* #78 retired the #58 judgement that a scheduled row took the MC group's
       urgency. Task cards carry their own `Urgent` label now, and W1 writes
       it there. The row follows the card. */
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    expect((await load(project._id)).rows[0]!.urgent).toBe(false);

    await WorkCard.updateOne({ trello_card_id: 'w1' }, { $set: { urgency: 'Urgent' } });
    expect((await load(project._id)).rows[0]!.urgent).toBe(true);

    // and a card that has left the board asserts nothing — the row stays
    // (#72 §5) but it is not urgent
    await WorkCard.deleteOne({ trello_card_id: 'w1' });
    const { rows } = await load(project._id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.urgent).toBe(false);
  });

  it('a sibling main card’s Urgent no longer leaks onto the row (owl #78)', async () => {
    /* The exact input the old inheritance turned into `urgent: true`: an
       urgent MAIN card under the same MC, with the task card unlabelled. A
       website request can hold an urgent screen and non-urgent assets, so
       the group's value cannot be true of each row. */
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);

    await Deliverable.updateOne({ trello_card_id: 'main07' }, { $set: { urgency: 'Urgent' } });
    expect((await load(project._id)).rows[0]!.urgent).toBe(false);
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
    await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await addAndPlot(agent, project._id, 'w2', String(sprint._id), '2026-08-03');

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
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.delete(itemUrl(project._id, id)).expect(200);

    const actions = (await AuditLog.find({ project_id: project._id }).sort({ _id: 1 }).lean()).map((a) => a.action);
    expect(actions).toEqual(['sprintItem.add', 'sprintItem.plot', 'sprintItem.remove']);
  });

  it('records the before AND after of a move, so a plot is reconstructable', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.patch(itemUrl(project._id, id)).send({ starts_on: '2026-08-10' }).expect(200);

    const moves = await AuditLog.find({ project_id: project._id, action: 'sprintItem.plot' }).sort({ _id: 1 }).lean();
    expect(moves[1]!.before).toMatchObject({ starts_on: '2026-08-03' });
    expect(moves[1]!.after).toMatchObject({ starts_on: '2026-08-10' });
  });

  /* The move-between-sprints branch. It shipped unexercised in the first pass —
     no UI writes it yet and no test sent it — which is a write path nobody has
     ever run. The Schedules rebuild needs it (a row moves when the PM drags it
     to another sprint's list), so it is covered rather than deleted. */
  it('moves a row to another sprint, keeping its bar', async () => {
    const { project, sprint, agent } = await setup();
    const later = await Sprint.create({
      project_id: project._id, name: 'Sprint 13', starts_on: '2026-08-17', ends_on: '2026-08-28', position: 1,
    });
    await mkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.patch(itemUrl(project._id, id)).send({ sprint_id: String(later._id) }).expect(200);

    const { rows } = await load(project._id);
    expect(rows[0]!.sprintId).toBe(String(later._id));
    expect(rows[0]!.startsOn).toBe('2026-08-03'); // the list moved, the bar did not
  });

  it('refuses a move into another project’s sprint', async () => {
    const { project, sprint, agent } = await setup();
    const other = await Project.create({
      code: 'rt-999', name: 'Other', trello_board_id: 'fxB', weekly_capacity: 22,
    });
    const foreignSprint = await Sprint.create({
      project_id: other._id, name: 'S', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 0,
    });
    await mkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.patch(itemUrl(project._id, id)).send({ sprint_id: String(foreignSprint._id) }).expect(404);

    expect((await load(project._id)).rows[0]!.sprintId).toBe(String(sprint._id));
  });

  it('answers 400 for a malformed id in the BODY and 404 for one in the PATH', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    // same class of bad input used to get two different answers
    await add(agent, project._id, { sprint_id: 'not-an-id', card_id: 'w1' }).expect(400);
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.patch(itemUrl(project._id, id)).send({ sprint_id: 'not-an-id' }).expect(400);
    await agent.patch(itemUrl(project._id, 'not-an-id')).send({ starts_on: '2026-08-03' }).expect(404);
  });

  it('refuses a field Sirius does not own', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    // strict body: an unknown key is REFUSED, not ignored (src/CLAUDE.md §2)
    await agent
      .patch(itemUrl(project._id, res.body.id))
      .send({ starts_on: '2026-08-03', difficulty: 'Hard' })
      .expect(400);
    /* `starts_on` left this guard 2026-08-28: the add route OWNS it now —
       one-act commit-and-place (PLAN.md, node 731:100277). The unknown-key
       refusal is proven with a field no sprint-item route will ever own. */
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1', difficulty: 'Hard' })
      .expect(400);
  });

  it('refuses a malformed date rather than storing it', async () => {
    const { project, sprint, agent } = await setup();
    await mkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await agent.patch(itemUrl(project._id, res.body.id)).send({ starts_on: '3 Aug' }).expect(400);
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
    const url = itemUrl(project._id, String(foreign._id));
    await agent.patch(url).send({ starts_on: '2026-08-03' }).expect(404);
    await agent.delete(url).expect(404);
    expect(await SprintItem.countDocuments({ _id: foreign._id })).toBe(1);
  });
});
