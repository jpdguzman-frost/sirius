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
 *   F. Add All is ONE act with a per-card answer (owl #77 §0, PLAN.md B3)
 *
 * `toHTML()`-style render checks are not here; this file proves the server
 * contract. The search row's geometry and its three states belong to
 * test/sprint-schedule-add-search.test.ts and the live pass.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import type { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { mkWorkCard, otherProject } from './helpers/schedule-fixture.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { loadPipeline } from '../src/services/pipeline.ts';
import { finishOf, plotIssue, sprintRangeIssue } from '../src/services/sprint-items.ts';
import { EMPIRICAL } from '../lib/model.ts';
import { forecast } from '../lib/forecast.ts';
import { getHolidays, localIso, setHolidays } from '../lib/calendar.ts';
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
  // the MC group: one main card with a client date — which a row does NOT
  // inherit since owl #78 §2, any more than it inherits the group's urgency
  // (#78 §1). The asset badge is the one thing a row reads off the group,
  // and only when the group agrees (section E).
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

/**
 * Runs `intrude` immediately before the route's FIRST `SprintItem` insert and
 * then lets that insert proceed — the seam both race guards below need, and
 * the only place a competing actor can be simulated without reaching inside
 * the route. Returns the spy, so the caller restores it in its own `finally`.
 */
const interruptFirstInsert = (
  intrude: (create: (doc: Record<string, unknown>) => Promise<unknown>, doc: Record<string, unknown>) => Promise<unknown>,
) => {
  const original = SprintItem.create.bind(SprintItem) as (doc: Record<string, unknown>) => Promise<unknown>;
  return vi.spyOn(SprintItem, 'create').mockImplementationOnce((async (doc: Record<string, unknown>) => {
    await intrude(original, doc);
    return original(doc);
  }) as never);
};

/* Through `loadPipeline`, not `loadSprintItems` directly — sprint items are
   opt-in on that call, so going the real route also proves the one caller that
   asks for them actually gets them. */
const load = async (projectId: Types.ObjectId) =>
  (await loadPipeline(projectId, '2026-08-03', 22, { withSprintItems: true })).sprintItems;

const itemUrl = (pid: unknown, id: string) => `/api/projects/${pid}/sprint-items/${id}`;
const add = (agent: ReturnType<typeof request.agent>, pid: unknown, body: Record<string, unknown>) =>
  agent.post(`/api/projects/${pid}/sprint-items`).send(body);
/** Add All — the search row's one request carrying the listed ids (owl #77 §0). */
const batch = (agent: ReturnType<typeof request.agent>, pid: unknown, body: Record<string, unknown>) =>
  agent.post(`/api/projects/${pid}/sprint-items/batch`).send(body);
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

/** Sprint 13 — the fortnight AFTER `setup()`'s, and the target of every
    list-move case below. Five cases needed the same three dates; written out
    five times, one of them drifts and the case stops testing what it names. */
const nextSprint = (projectId: Types.ObjectId) => Sprint.create({
  project_id: projectId, name: 'Sprint 13', starts_on: '2026-08-17', ends_on: '2026-08-28', position: 1,
});

/**
 * Runs `body` with `day` added to the ACTIVE working-day calendar, restoring
 * whatever was loaded before on every path. That is the shape an ARES calendar
 * refresh has mid-session — a day nobody touched becomes a holiday — and the
 * only way to reach `NOT_A_WORKDAY` on a weekday. The restore has to be a
 * `finally`: leak a holiday and the next suite's Wednesday stops being a
 * working day.
 */
const withHoliday = async (day: string, body: () => Promise<void>) => {
  const restore = getHolidays();
  try {
    setHolidays([...restore, day]);
    /* the three cases below all expect a 200, so a calendar that quietly
       failed to take the day would leave every one of them passing while
       proving nothing. One assertion here covers all three. */
    expect(getHolidays(), `${day} never reached the active working-day calendar`).toContain(day);
    await body();
  } finally {
    setHolidays(restore);
  }
};

/* ---------------------------------------------------------------------- */
/* A — nothing is auto-populated                                           */
/* ---------------------------------------------------------------------- */

describe('the schedule is opt-in — it is NOT a mirror of the board', () => {
  it('a board full of task cards yields an EMPTY schedule', async () => {
    const { project } = await setup();
    await mkWorkCard(project._id, 'w1');
    await mkWorkCard(project._id, 'w2');
    await mkWorkCard(project._id, 'w3');

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
    await mkWorkCard(project._id, 'w1');
    await mkWorkCard(project._id, 'w2');

    const { addable } = await load(project._id);
    expect(addable['MC-07']!.map((c) => c.cardId).sort()).toEqual(['w1', 'w2']);
  });

  it('sorts the pool alphabetically by the FULL label — Render before Sketch', async () => {
    const { project } = await setup();
    await mkWorkCard(project._id, 'r1', { name: 'Render Asset: GRaf Playing Flute', task_prefix: 'Render Asset' });
    await mkWorkCard(project._id, 's1', { name: 'Sketch Asset: GRaf Playing Flute' });
    await mkWorkCard(project._id, 'r2', { name: 'Render Asset: GCat Twirling', task_prefix: 'Render Asset' });

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

  it('stores the FULL card name — the result row’s ellipsis is a display clamp, not the value', async () => {
    const { project, sprint, agent } = await setup();
    const full = 'Sketch Asset: Corey G Singing "Chicosci Vampire Social Club" by Chicosci';
    await mkWorkCard(project._id, 'long', { name: full });
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
    await mkWorkCard(project._id, 'w1');
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
    await mkWorkCard(project._id, 'w1');
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
      await mkWorkCard(project._id, id, { difficulty: 'Easy', task_prefix: prefix, name: `${prefix}: X` });
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
    await mkWorkCard(project._id, 'w1', { difficulty: null });
    await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');

    const { rows } = await load(project._id);
    expect(rows[0]!.startsOn).toBe('2026-08-03'); // the row is still placed
    expect(rows[0]!.finish).toBeNull(); // there is just nothing to key a design cell on
  });

  it('un-plots back to the list rather than deleting the row', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
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
    await mkWorkCard(project._id, 'sketch1');
    await mkWorkCard(project._id, 'render1', { name: 'Render Asset: GCat', task_prefix: 'Render Asset' });
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
    await mkWorkCard(project._id, 'done1', { current_list: 'Design Complete' });
    await mkWorkCard(project._id, 'open1');

    const { addable } = await load(project._id);
    expect(addable['MC-07']!.map((c) => c.cardId)).toEqual(['open1']);
    // and the server refuses it, so the pool is not the only guard
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'done1' }).expect(409);
  });

  /* §7a, 2026-09-08. The add filter is now TWO states, and this is the second.
     Under the retired keyword classifier none of the ops lists but
     `Ops Work Complete` was filtered at all, so ops task cards were offered
     into the sprint pool as ordinary work. */
  it('a card in an EXCLUDED lane is never OFFERED either (§7a)', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'ops1', { current_list: 'Working on Ops Work' });
    await mkWorkCard(project._id, 'binned1', { current_list: 'Discarded Work' });
    await mkWorkCard(project._id, 'open1');

    const { addable } = await load(project._id);
    expect(addable['MC-07']!.map((c) => c.cardId)).toEqual(['open1']);
    // and the routes give the same answer the pool does
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'ops1' }).expect(409);
  });

  it('an excluded card the PM already scheduled STAYS, and its row says `excluded`', async () => {
    /* The filter governs ADD, never REMOVE — the same rule a completed card
       gets. A row that vanished when someone moved its card to an ops lane
       would destroy the record of what was planned. */
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');

    await WorkCard.updateOne({ project_id: project._id, trello_card_id: 'w1' }, { $set: { current_list: 'Working on Ops Work' } });

    const { rows, addable } = await load(project._id);
    expect(rows.map((r) => r.cardId)).toEqual(['w1']);
    expect(rows[0]!.status).toBe('excluded'); // NOT null — null means the card left the board
    expect(rows[0]!.startsOn).toBe('2026-08-03'); // and it keeps its bar
    expect(addable['MC-07'] ?? []).toEqual([]);
  });

  it('a card that completes AFTER being scheduled STAYS', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');

    await WorkCard.updateOne({ project_id: project._id, trello_card_id: 'w1' }, { $set: { current_list: 'Design Complete' } });

    /* Not removed, not greyed out, not prompted to clear. A tidy-up that
       pruned completed rows would destroy the record of what was planned. */
    const { rows, addable } = await load(project._id);
    expect(rows.map((r) => r.cardId)).toEqual(['w1']);
    expect(rows[0]!.startsOn).toBe('2026-08-03'); // and it keeps its bar
    expect(addable['MC-07'] ?? []).toEqual([]); // while no longer being offerable
  });

  it('keeps a scheduled row whose card has left the board', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await WorkCard.updateOne({ project_id: project._id, trello_card_id: 'w1' }, { $set: { active: false } });

    const { rows } = await load(project._id);
    expect(rows).toHaveLength(1); // the schedule is the record of what was planned
    expect(rows[0]!.cardId).toBe('w1');
    expect(rows[0]!.finish).toBeNull();
  });
});

/* ---------------------------------------------------------------------- */
/* E — one row per card, the deadline it is measured against, its urgency, */
/*     and the two fields the Deadlines card reads (figma, asset)          */
/* ---------------------------------------------------------------------- */

describe('one row = one task card = one bar', () => {
  it('refuses a second row for the same card', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    const dup = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(409);
    expect(dup.body.error.code).toBe('ALREADY_SCHEDULED');
    // and it is out of the pool, so the refusal is a backstop not the UX
    const { addable } = await load(project._id);
    expect(addable['MC-07'] ?? []).toEqual([]);
  });

  it('does NOT inherit the MC group’s client date — an undated card has no deadline (owl #78 §2)', async () => {
    /* The exact input the retired rule read as LATE: the group's main card
       dated the day after the bar starts, the task card undated. Until
       2026-09-05 the row took the group's earliest deadline (jp→miles #58
       judgement 1) and this bar ran past it. #78 §2 put deadlines on work
       cards and nowhere else, so the row has no date to be measured against
       and cannot be late — the schedule's tick and the Pipeline work row must
       show the SAME date for the same card, and the card has none. */
    const { project, sprint, agent } = await setup();
    await Deliverable.updateOne({ trello_card_id: 'main07' }, { $set: { sheet_deadline: '2026-08-04' } });
    await mkWorkCard(project._id, 'w1');
    await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');

    const { rows } = await load(project._id);
    expect(rows[0]!.finish! > '2026-08-04').toBe(true); // the work DOES run past the group's date
    expect(rows[0]!.deadline).toBeNull();
    expect(rows[0]!.late).toBe(false);
  });

  it('ignores the group whether it agrees with itself or not — there is no "earliest" any more', async () => {
    const { project, sprint, agent } = await setup();
    // invariant 3: mc_number is not a key — a second deliverable under MC-07,
    // dated from Trello this time so both of `deliverables_v`'s sources are
    // on the table (the main card's sheet date is in the fixture)
    await Deliverable.create({
      project_id: project._id, mc_number: 'MC-07', display_id: 'MC-07.2', trello_card_id: 'main07b',
      name: 'Second', difficulty: 'Medium', lane: 'design', current_list: 'Design',
      trello_due: '2026-09-01',
    });
    await mkWorkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);

    expect((await load(project._id)).rows[0]!.deadline).toBeNull();
  });

  it('is urgent iff ITS OWN card carries the label — never inherited (owl #78)', async () => {
    /* #78 retired the #58 judgement that a scheduled row took the MC group's
       urgency. Task cards carry their own `Urgent` label now, and W1 writes
       it there. The row follows the card. */
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
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
    await mkWorkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);

    await Deliverable.updateOne({ trello_card_id: 'main07' }, { $set: { urgency: 'Urgent' } });
    expect((await load(project._id)).rows[0]!.urgent).toBe(false);
  });

  it('the deadline is the card’s OWN Trello due date, and nothing else', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1', { trello_due: '2026-08-20' });
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    // the field W2 writes on the work card (contracts/trello-write.md §W2)
    expect((await load(project._id)).rows[0]!.deadline).toBe('2026-08-20');

    // cleared in Trello → no date, NOT the group's; the row follows the card
    await WorkCard.updateOne({ trello_card_id: 'w1' }, { $unset: { trello_due: 1 } });
    expect((await load(project._id)).rows[0]!.deadline).toBeNull();

    // and a card that has left the board carries nothing to measure against
    await WorkCard.deleteOne({ trello_card_id: 'w1' });
    expect((await load(project._id)).rows[0]!.deadline).toBeNull();
  });

  it('flags late when the WORK runs past ITS date, and never without one', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1', { trello_due: '2026-08-04' });
    await mkWorkCard(project._id, 'w2'); // undated — and the group's main card IS dated (fixture)
    await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await addAndPlot(agent, project._id, 'w2', String(sprint._id), '2026-08-03');

    const { rows } = await load(project._id);
    const byId = new Map(rows.map((r) => [r.cardId, r]));
    expect(byId.get('w1')!.finish! > '2026-08-04').toBe(true);
    expect(byId.get('w1')!.late).toBe(true);
    expect(byId.get('w2')!.deadline).toBeNull();
    expect(byId.get('w2')!.late).toBe(false); // BR-9: no deadline is no conflict
  });

  it('carries the card’s Figma link for the Deadlines card, and null when there is none (#74 §3)', async () => {
    const { project, sprint, agent } = await setup();
    const figma = 'https://www.figma.com/design/abc/Fx?node-id=1-2';
    await mkWorkCard(project._id, 'w1', { figma_url: figma });
    await mkWorkCard(project._id, 'w2');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w2' }).expect(201);

    const byId = new Map((await load(project._id)).rows.map((r) => [r.cardId, r]));
    expect(byId.get('w1')!.figmaUrl).toBe(figma);
    expect(byId.get('w2')!.figmaUrl).toBeNull();

    // gone from the board → nothing to link; the row stays (#72 §5)
    await WorkCard.deleteOne({ trello_card_id: 'w1' });
    expect((await load(project._id)).rows.find((r) => r.cardId === 'w1')!.figmaUrl).toBeNull();
  });
});

describe('the asset badge reads the MC group, and only when the group agrees (PLAN.md B6/B17)', () => {
  /* Work cards carry no asset type — it is the sheet's FR-4.1 field on the
     deliverable — and a task attaches to the GROUP (invariant 4), so the row
     borrows the group's value exactly when there is one value to borrow. */
  const secondDeliverable = (projectId: Types.ObjectId, over: Record<string, unknown> = {}) =>
    Deliverable.create({
      project_id: projectId, mc_number: 'MC-07', display_id: 'MC-07.2', trello_card_id: 'main07b',
      name: 'Second', difficulty: 'Medium', lane: 'design', current_list: 'Design', ...over,
    });
  const rowFor = async (projectId: Types.ObjectId) => (await load(projectId)).rows[0]!;

  it('agreed: every deliverable under the MC carries the same type → that type', async () => {
    const { project, sprint, agent } = await setup();
    await Deliverable.updateOne({ trello_card_id: 'main07' }, { $set: { asset_type: 'Illustration' } });
    await mkWorkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    expect((await rowFor(project._id)).assetType).toBe('Illustration'); // one deliverable agrees with itself

    await secondDeliverable(project._id, { asset_type: 'Illustration' });
    expect((await rowFor(project._id)).assetType).toBe('Illustration'); // two, still one value
  });

  it('disagreeing: two deliverables, two types → null, and the card draws no badge', async () => {
    const { project, sprint, agent } = await setup();
    await Deliverable.updateOne({ trello_card_id: 'main07' }, { $set: { asset_type: 'Illustration' } });
    await secondDeliverable(project._id, { asset_type: 'Icon' });
    await mkWorkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    expect((await rowFor(project._id)).assetType).toBeNull();
  });

  it('absent: no deliverable under the MC carries a type → null', async () => {
    const { project, sprint, agent } = await setup(); // the fixture's main card has none
    await secondDeliverable(project._id);
    await mkWorkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    expect((await rowFor(project._id)).assetType).toBeNull();
  });

  it('one typed and one untyped is not agreement → null (a judgement, reversible in one line)', async () => {
    /* The strict reading of "shared by every deliverable row": a deliverable
       with no sheet type does not share anything. Claiming the group is
       "Illustration" while one of its deliverables says nothing would put an
       inference on the card that the data does not carry. */
    const { project, sprint, agent } = await setup();
    await Deliverable.updateOne({ trello_card_id: 'main07' }, { $set: { asset_type: 'Illustration' } });
    await secondDeliverable(project._id);
    await mkWorkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    expect((await rowFor(project._id)).assetType).toBeNull();
  });

  it('never reads across projects — another project’s MC-07 has no say (invariant 1)', async () => {
    const { project, sprint, agent } = await setup();
    const other = await otherProject();
    await Deliverable.create({
      project_id: other._id, mc_number: 'MC-07', display_id: 'MC-07', trello_card_id: 'x07',
      name: 'Stranger', asset_type: 'Icon',
    });
    await Deliverable.updateOne({ trello_card_id: 'main07' }, { $set: { asset_type: 'Illustration' } });
    await mkWorkCard(project._id, 'w1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    expect((await rowFor(project._id)).assetType).toBe('Illustration');
  });
});

/* ---------------------------------------------------------------------- */
/* the write surface                                                       */
/* ---------------------------------------------------------------------- */

describe('the routes are Sirius-owned planning writes', () => {
  it('audits add, plot and remove (invariant 10)', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.delete(itemUrl(project._id, id)).expect(200);

    const actions = (await AuditLog.find({ project_id: project._id }).sort({ _id: 1 }).lean()).map((a) => a.action);
    expect(actions).toEqual(['sprintItem.add', 'sprintItem.plot', 'sprintItem.remove']);
  });

  it('records the before AND after of a move, so a plot is reconstructable', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.patch(itemUrl(project._id, id)).send({ starts_on: '2026-08-10' }).expect(200);

    const moves = await AuditLog.find({ project_id: project._id, action: 'sprintItem.plot' }).sort({ _id: 1 }).lean();
    expect(moves[1]!.before).toMatchObject({ starts_on: '2026-08-03' });
    expect(moves[1]!.after).toMatchObject({ starts_on: '2026-08-10' });
  });

  /* The move-between-sprints branch. It shipped unexercised in the first pass —
     no UI writes it yet and no test sent it — which is a write path nobody has
     ever run. The Schedules rebuild needs it (a row moves when the PM drags it
     to another sprint's list), so it is covered rather than deleted.

     A BARE LIST MOVE STILL MOVES A BAR (D5 resolved STRICT, 2026-09-09): the
     row carries its day across, so the day it lands on has to be inside the
     sprint it lands in. The row here is rolled onto a day the TARGET covers
     first — the case the exemption was written for — and then the move is
     the ordinary one. The refusal is the case below it. */
  it('moves a plotted row to a sprint whose dates COVER its bar, and the bar stays put', async () => {
    const { project, sprint, agent } = await setup();
    const later = await nextSprint(project._id);
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    /* The row rolls past its own sprint's end without changing lists — which is
       what rollover does when no sprint covers the new day yet (§6.2, and the
       reason it writes through Mongo and never through this route). The PM
       then re-files it by hand into the sprint that DOES cover it. */
    await SprintItem.updateOne({ _id: id, project_id: project._id }, { $set: { starts_on: '2026-08-18' } });

    await agent.patch(itemUrl(project._id, id)).send({ sprint_id: String(later._id) }).expect(200);

    const { rows } = await load(project._id);
    expect(rows[0]!.sprintId).toBe(String(later._id));
    expect(rows[0]!.startsOn).toBe('2026-08-18'); // the list moved, the bar did not
  });

  it('refuses a bare list move that would leave the bar outside the TARGET sprint', async () => {
    const { project, sprint, agent } = await setup();
    const later = await nextSprint(project._id);
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    const audits = await AuditLog.countDocuments({ project_id: project._id });

    /* 3 Aug is a fortnight before Sprint 13 begins. Letting this through wrote
       a bar a fortnight outside its own sprint's dates — the one thing JP's
       2026-09-08 ruling forbids — so the range is judged against the TARGET
       even though the PM supplied no day: they moved the bar by moving the
       list. The message names the sprint the row would land in. */
    const res = await agent.patch(itemUrl(project._id, id)).send({ sprint_id: String(later._id) }).expect(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'OUT_OF_SPRINT' } });
    expect(res.body.error.message).toBe("That day is outside the sprint's dates (17 Aug 2026 – 28 Aug 2026).");

    // refused whole: neither the list nor the bar moved, and nothing was audited
    const row = (await load(project._id)).rows[0]!;
    expect(row.sprintId).toBe(String(sprint._id));
    expect(row.startsOn).toBe('2026-08-03');
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(audits);
  });

  it('lets an UNPLOTTED row move into any sprint — there is no bar to misplace', async () => {
    const { project, sprint, agent } = await setup();
    const later = await nextSprint(project._id);
    await mkWorkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await agent.patch(itemUrl(project._id, res.body.id)).send({ sprint_id: String(later._id) }).expect(200);

    const row = (await load(project._id)).rows[0]!;
    expect(row.sprintId).toBe(String(later._id));
    expect(row.startsOn).toBeNull();
  });

  it('judges a bare move on the RANGE alone — not the deadline, not the calendar', async () => {
    const { project, sprint, agent } = await setup();
    const later = await nextSprint(project._id);
    // a client date long past, so a placement ON this day would earn PAST_DEADLINE
    await mkWorkCard(project._id, 'w1', { trello_due: '2026-08-06' });
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-05');
    await SprintItem.updateOne({ _id: id, project_id: project._id }, { $set: { starts_on: '2026-08-18' } });

    /* …and the day the row already sits on becomes a holiday, which is what an
       ARES calendar refresh does to a day nobody touched. The bare move asks
       ONE question — is the bar inside the sprint it lands in — because the day
       itself was accepted once and the PM is not re-placing it. Both other
       refusals would be a 422 for a day the request never named. */
    await withHoliday('2026-08-18', async () => {
      await agent.patch(itemUrl(project._id, id)).send({ sprint_id: String(later._id) }).expect(200);
    });

    const row = (await load(project._id)).rows[0]!;
    expect(row.sprintId).toBe(String(later._id));
    expect(row.startsOn).toBe('2026-08-18');
  });

  it('judges a day sent WITH a move against the TARGET sprint, not the old one', async () => {
    const { project, sprint, agent } = await setup();
    const later = await nextSprint(project._id);
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');

    // 3 Aug is inside the row's CURRENT sprint and outside the one it is moving to
    const res = await agent.patch(itemUrl(project._id, id))
      .send({ sprint_id: String(later._id), starts_on: '2026-08-03' }).expect(422);
    expect(res.body.error.code).toBe('OUT_OF_SPRINT');
    expect(res.body.error.message).toBe("That day is outside the sprint's dates (17 Aug 2026 – 28 Aug 2026).");
    // refused whole: neither the list nor the bar moved, and nothing was audited
    const row = (await load(project._id)).rows[0]!;
    expect(row.sprintId).toBe(String(sprint._id));
    expect(row.startsOn).toBe('2026-08-03');

    // and the same move with a day the target sprint covers goes through
    await agent.patch(itemUrl(project._id, id))
      .send({ sprint_id: String(later._id), starts_on: '2026-08-17' }).expect(200);
    const moved = (await load(project._id)).rows[0]!;
    expect(moved.sprintId).toBe(String(later._id));
    expect(moved.startsOn).toBe('2026-08-17');
  });

  it('refuses a move into another project’s sprint', async () => {
    const { project, sprint, agent } = await setup();
    const other = await otherProject();
    const foreignSprint = await Sprint.create({
      project_id: other._id, name: 'S', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 0,
    });
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.patch(itemUrl(project._id, id)).send({ sprint_id: String(foreignSprint._id) }).expect(404);

    expect((await load(project._id)).rows[0]!.sprintId).toBe(String(sprint._id));
  });

  it('answers 400 for a malformed id in the BODY and 404 for one in the PATH', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    // same class of bad input used to get two different answers
    await add(agent, project._id, { sprint_id: 'not-an-id', card_id: 'w1' }).expect(400);
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    await agent.patch(itemUrl(project._id, id)).send({ sprint_id: 'not-an-id' }).expect(400);
    await agent.patch(itemUrl(project._id, 'not-an-id')).send({ starts_on: '2026-08-03' }).expect(404);
  });

  it('refuses a field Sirius does not own', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    // strict body: an unknown key is REFUSED, not ignored (src/CLAUDE.md §2)
    await agent
      .patch(itemUrl(project._id, res.body.id))
      .send({ starts_on: '2026-08-03', difficulty: 'Hard' })
      .expect(400);
    /* `starts_on` is NOT the probe here: the single add keeps it as an
       optional, tested contract (PLAN.md B13, block 2 — nothing in the search
       flow sends it, and the batch route refuses it; see F below). The
       unknown-key refusal is proven with a field no sprint-item route will
       ever own. */
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1', difficulty: 'Hard' })
      .expect(400);
  });

  it('refuses a malformed date rather than storing it', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1' }).expect(201);
    await agent.patch(itemUrl(project._id, res.body.id)).send({ starts_on: '3 Aug' }).expect(400);
  });

  it('never reaches across projects (invariant 1)', async () => {
    const { project, sprint, agent } = await setup();
    const other = await otherProject();
    const otherSprint = await Sprint.create({
      project_id: other._id, name: 'S', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 0,
    });
    await WorkCard.create({
      project_id: other._id, mc_number: 'MC-07', trello_card_id: 'foreign',
      name: 'Foreign', difficulty: 'Medium', current_list: 'Working on Design',
    });
    await mkWorkCard(project._id, 'w1');

    // a sprint belonging to another project
    await add(agent, project._id, { sprint_id: String(otherSprint._id), card_id: 'w1' }).expect(404);
    // a card belonging to another project
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'foreign' }).expect(404);
    expect(await SprintItem.countDocuments({})).toBe(0);
  });

  it('404s an item id from another project instead of touching it', async () => {
    const { project, sprint, agent } = await setup();
    const other = await otherProject();
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

/* ---------------------------------------------------------------------- */
/* F — Add All: one act, a per-card answer (owl #77 §0; PLAN.md B3)        */
/* ---------------------------------------------------------------------- */

describe('Add All is one request that answers per card', () => {
  /** position by card id, straight off the collection — the rule under test is
      the ORDER the rows took, so it is read where it is stored. */
  const positions = async (projectId: Types.ObjectId) =>
    Object.fromEntries(
      (await SprintItem.find({ project_id: projectId }).lean()).map((it) => [it.trello_card_id, it.position]),
    );

  it('adds every listed card in LIST order, after the sprint’s tail', async () => {
    const { project, sprint, agent } = await setup();
    for (const id of ['a0', 'w1', 'w2', 'w3']) await mkWorkCard(project._id, id);
    // the sprint already holds a row: the batch lands AFTER it, never around it
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'a0' }).expect(201);

    /* Deliberately NOT alphabetical: the list on screen IS the set (Miles),
       and its order is the client's (MC rank, then the server's pool order),
       so the server takes the ids as sent and never re-sorts them. */
    const res = await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['w3', 'w1', 'w2'] }).expect(200);
    expect(res.body).toEqual({ ok: true, added: 3, skipped: [] });

    expect(await positions(project._id)).toEqual({ a0: 0, w3: 1, w1: 2, w2: 3 });
    // and the load — which sorts on position — reads the list in that order
    expect((await load(project._id)).rows.map((r) => r.cardId)).toEqual(['a0', 'w3', 'w1', 'w2']);
  });

  it('skips a complete, an excluded, an already-scheduled and an unknown card each with its OWN code, and still adds the rest', async () => {
    const { project, sprint, agent } = await setup();
    const other = await otherProject();
    await WorkCard.create({
      project_id: other._id, mc_number: 'MC-07', trello_card_id: 'foreign',
      name: 'Foreign', difficulty: 'Medium', current_list: 'Working on Design',
    });
    await mkWorkCard(project._id, 'open1');
    await mkWorkCard(project._id, 'open2');
    await mkWorkCard(project._id, 'done1', { current_list: 'Design Complete' });
    await mkWorkCard(project._id, 'ops1', { current_list: 'Discarded Work' });
    await mkWorkCard(project._id, 'sched1');
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'sched1' }).expect(201);

    /* Never fatal (#77 §0, Miles: no confirmation, no count-check, no review
       pass). Every skip carries the single add's own refusal code, so the
       client reads one vocabulary; a card from ANOTHER project is simply not
       found under this one (invariant 1) — a skip, never a cross-project
       write. The skip order is the request order. */
    const res = await batch(agent, project._id, {
      sprint_id: String(sprint._id),
      card_ids: ['open1', 'done1', 'ops1', 'sched1', 'ghost', 'foreign', 'open2'],
    }).expect(200);
    /* `ops1` carries its OWN code, not the done one (review ruling
       2026-09-08): a card in Discarded Work is refused for a different reason
       than a finished one, and the banner counts them separately. */
    expect(res.body).toEqual({
      ok: true,
      added: 2,
      skipped: [
        { card_id: 'done1', code: 'CARD_COMPLETE' },
        { card_id: 'ops1', code: 'CARD_EXCLUDED' },
        { card_id: 'sched1', code: 'ALREADY_SCHEDULED' },
        { card_id: 'ghost', code: 'NOT_FOUND' },
        { card_id: 'foreign', code: 'NOT_FOUND' },
      ],
    });

    // the two that could land did, in order, and a skip consumed no position
    expect(await positions(project._id)).toEqual({ sched1: 0, open1: 1, open2: 2 });
    expect(await SprintItem.countDocuments({ project_id: other._id })).toBe(0);
    expect(await SprintItem.countDocuments({ trello_card_id: 'foreign' })).toBe(0);
  });

  it('dedupes a repeated id — first occurrence keeps the order, and a repeat is not a skip', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    await mkWorkCard(project._id, 'w2');

    /* A duplicate in the body is a client echo, not a fact to report: without
       the dedupe the second `w1` would hit the unique index and come back as
       ALREADY_SCHEDULED, which would put a phantom skip in the banner. */
    const res = await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['w1', 'w1', 'w2', 'w1'] }).expect(200);
    expect(res.body).toEqual({ ok: true, added: 2, skipped: [] });
    expect(await positions(project._id)).toEqual({ w1: 0, w2: 1 });
  });

  it('audits one sprintItem.add per CREATED row, in the single add’s own shape (invariant 10)', async () => {
    const { project, sprint, agent } = await setup();
    for (const id of ['s1', 'b1', 'b2', 'done1']) await mkWorkCard(project._id, id, id === 'done1' ? { current_list: 'Design Complete' } : {});
    await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 's1' }).expect(201);
    await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['b1', 'b2', 'done1'] }).expect(200);

    const adds = await AuditLog.find({ project_id: project._id, action: 'sprintItem.add' }).sort({ _id: 1 }).lean();
    // one for the single add, one per row the batch created — none for the skip
    expect(adds).toHaveLength(3);

    /* DERIVED, not copied (test/CLAUDE.md rule 2): the batch row's `after` is
       compared key-for-key with what the single add wrote in this same run,
       so a field added to one route and not the other fails here rather than
       drifting the log into two dialects. */
    const single = adds[0]!.after as Record<string, unknown>;
    for (const row of adds.slice(1)) {
      const after = row.after as Record<string, unknown>;
      expect(Object.keys(after).sort()).toEqual(Object.keys(single).sort());
      expect(after.sprint_id).toBe(String(sprint._id));
      expect(after.mc_number).toBe('MC-07');
      expect(after.starts_on).toBeNull();
      // entity_id is the row it created, so the log can be followed to the row
      expect(await SprintItem.countDocuments({ _id: row.entity_id, trello_card_id: after.card_id as string })).toBe(1);
    }
    expect(adds.slice(1).map((a) => (a.after as { card_id: string }).card_id)).toEqual(['b1', 'b2']);
  });

  it('404s a sprint from another project and writes nothing', async () => {
    const { project, agent } = await setup();
    const other = await otherProject();
    const otherSprint = await Sprint.create({
      project_id: other._id, name: 'S', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 0,
    });
    await mkWorkCard(project._id, 'w1');
    await mkWorkCard(project._id, 'w2');

    // the sprint is the one thing that fails the WHOLE request (invariant 1):
    // there is no list to land in, so no card can be "the rest"
    await batch(agent, project._id, { sprint_id: String(otherSprint._id), card_ids: ['w1', 'w2'] }).expect(404);
    expect(await SprintItem.countDocuments({})).toBe(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it('refuses a malformed body rather than adding some of it', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const sprintId = String(sprint._id);

    const bad: Record<string, unknown>[] = [
      { card_ids: ['w1'] }, // no sprint
      { sprint_id: 'not-an-id', card_ids: ['w1'] }, // a bad id in the BODY is a 400, as the single add answers
      { sprint_id: sprintId }, // no ids
      { sprint_id: sprintId, card_ids: [] }, // an empty set is not a request
      { sprint_id: sprintId, card_ids: 'w1' }, // not an array
      { sprint_id: sprintId, card_ids: ['w1', ''] }, // an empty id is not an id — the WHOLE body is refused
      { sprint_id: sprintId, card_ids: ['w1', 7] },
    ];
    for (const body of bad) {
      const res = await batch(agent, project._id, body).expect(400);
      expect(res.body.error.code).toBe('INVALID_BODY');
    }
    expect(await SprintItem.countDocuments({})).toBe(0);
  });

  it('lands every row UNPLOTTED — the batch carries no starts_on and refuses one', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    await mkWorkCard(project._id, 'w2');

    /* Two acts (#72 §6), for a batch as for a single add: the result rows draw
       no + (node 840:31630), so there is no click to carry. The single add's
       optional `starts_on` (PLAN.md B13) is that route's contract, not this
       one's — `.strict()` refuses the key here (src/CLAUDE.md §2). */
    await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['w1'], starts_on: '2026-08-03' }).expect(400);
    expect(await SprintItem.countDocuments({})).toBe(0);

    await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['w1', 'w2'] }).expect(200);
    const { rows } = await load(project._id);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.startsOn).toBeNull();
      expect(r.finish).toBeNull();
    }
    // and stored as ABSENT, the same unplotted state the single add produces
    expect(await SprintItem.countDocuments({ project_id: project._id, starts_on: { $exists: true } })).toBe(0);
  });

  it('turns a row that lands between the pre-read and the insert into a skip, not a 500', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    await mkWorkCard(project._id, 'w2');

    /* The batch reads "already scheduled" ONCE, then inserts one by one. The
       race is a second actor scheduling `w1` after that read and before the
       insert — a second tab, a single Add. Simulated at the seam itself: the
       first `create` the route makes (for `w1`, first in order) is preceded
       by the competing row, so the route's own insert hits the unique index.
       The rule: that 11000 is the same fact the pre-read reports, so it is
       the same code, and the rest of the batch still lands. An `insertMany`
       or a dropped catch would fail here with a 500. */
    const spy = interruptFirstInsert((create, doc) =>
      create({ ...doc, position: 99, added_by: 'other@frostdesigngroup.com' }));
    try {
      const res = await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['w1', 'w2'] }).expect(200);
      expect(res.body).toEqual({ ok: true, added: 1, skipped: [{ card_id: 'w1', code: 'ALREADY_SCHEDULED' }] });
    } finally {
      spy.mockRestore();
    }

    // exactly one row for w1 (the competing one), w2 still added, and the
    // batch audited only what IT created
    expect(await SprintItem.countDocuments({ project_id: project._id, trello_card_id: 'w1' })).toBe(1);
    expect(await SprintItem.countDocuments({ project_id: project._id, trello_card_id: 'w2' })).toBe(1);
    const adds = await AuditLog.find({ project_id: project._id, action: 'sprintItem.add' }).lean();
    expect(adds.map((a) => (a.after as { card_id: string }).card_id)).toEqual(['w2']);
  });

  it('takes its own rows back and refuses when the sprint vanished mid-batch (review 2026-09-05, S1)', async () => {
    const { project, sprint, agent } = await setup();
    for (const id of ['w1', 'w2']) await mkWorkCard(project._id, id);
    /* The sprints editor removes a sprint and cascades its rows in one act.
       Simulated at the seam: the route's FIRST insert is preceded by exactly
       that act, so every row the batch creates hangs off a sprint that is
       gone — drawn nowhere, holding its card out of the pool. */
    const spy = interruptFirstInsert(async () => {
      await SprintItem.deleteMany({ project_id: project._id, sprint_id: sprint._id });
      await Sprint.deleteOne({ _id: sprint._id, project_id: project._id });
    });
    try {
      const res = await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['w1', 'w2'] }).expect(409);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('SPRINT_GONE');
      expect(typeof res.body.error.message).toBe('string');
    } finally {
      spy.mockRestore();
    }
    // no orphan: both cards are back in the pool, and the log holds the add AND the removal of each
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);
    expect((await load(project._id)).addable['MC-07']!.map((c) => c.cardId).sort()).toEqual(['w1', 'w2']);
    const log = (await AuditLog.find({ project_id: project._id }).sort({ _id: 1 }).lean()).map((a) => a.action);
    expect(log).toEqual(['sprintItem.add', 'sprintItem.add', 'sprintItem.remove', 'sprintItem.remove']);
  });

  it('rolls back a row whose audit row failed and says how far it got (review 2026-09-05, S2)', async () => {
    const { project, sprint, agent } = await setup();
    for (const id of ['w1', 'w2', 'w3']) await mkWorkCard(project._id, id);
    // the SECOND audit write fails: w1 stands with its row, w2 is taken back, w3 is never reached
    const original = AuditLog.create.bind(AuditLog) as (doc: Record<string, unknown>) => Promise<unknown>;
    let calls = 0;
    const spy = vi.spyOn(AuditLog, 'create').mockImplementation((async (doc: Record<string, unknown>) => {
      calls += 1;
      if (calls === 2) throw new Error('audit store unreachable');
      return original(doc);
    }) as never);
    try {
      const res = await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['w1', 'w2', 'w3'] }).expect(500);
      expect(res.body).toMatchObject({ ok: false, error: { code: 'PARTIAL' }, added: 1, skipped: [] });
      expect(res.body.error.message).toContain('Added 1 of 3');
    } finally {
      spy.mockRestore();
    }
    // invariant 10: no row without its audit row — w2's row went with its failed audit
    expect((await SprintItem.find({ project_id: project._id }).lean()).map((r) => r.trello_card_id)).toEqual(['w1']);
    const adds = await AuditLog.find({ project_id: project._id, action: 'sprintItem.add' }).lean();
    expect(adds.map((a) => (a.after as { card_id: string }).card_id)).toEqual(['w1']);
  });

  it('answers a vanished sprint with plain words, on both add routes (review 2026-09-05, B2-R5)', async () => {
    const { project, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const gone = await Sprint.create({
      project_id: project._id, name: 'Gone', starts_on: '2026-09-07', ends_on: '2026-09-18', position: 1,
    });
    await Sprint.deleteOne({ _id: gone._id });
    for (const res of [
      await batch(agent, project._id, { sprint_id: String(gone._id), card_ids: ['w1'] }).expect(404),
      await add(agent, project._id, { sprint_id: String(gone._id), card_id: 'w1' }).expect(404),
    ]) {
      expect(res.body.error.code).toBe('NOT_FOUND');
      // the client prints the server's own message; a bare code reached the banner before
      expect(res.body.error.message).toMatch(/no longer exists/);
    }
  });
});

/* ---------------------------------------------------------------------- */
/* G — the plot guards: the day the PM picks must be a day work can start  */
/*     (JP 2026-09-08; drift.md rows 1, 2 and 5)                           */
/* ---------------------------------------------------------------------- */

/**
 * ONE validator behind every route that takes a `starts_on` from the PM, and
 * three refusals in one order. JP's rules (2026-09-08): a row cannot be placed
 * outside its sprint's dates, and cannot START after the card's deadline — a
 * FINISH past the deadline stays legal and red (R9-b, and the `late` cases in
 * section E above, which is why the guard is on the START alone). The third is
 * invariant 11: the grid is Mon–Fri and the ARES working-day calendar is
 * canonical, so a holiday is not a day work can begin.
 *
 * ROLLOVER IS EXEMPT, and the last test here is what keeps it that way: §6.2
 * lets a roll leave its sprint and outrun the deadline "with no cap", so the
 * guard belongs to the manual write paths alone.
 */
describe('plotIssue — one validator, three refusals, one order', () => {
  const sprint = { starts_on: '2026-08-03', ends_on: '2026-08-14' }; // Mon .. Fri

  it('allows every working day inside the sprint, both boundaries included', () => {
    for (const day of ['2026-08-03', '2026-08-07', '2026-08-10', '2026-08-14']) {
      expect(plotIssue({ sprint, startsOn: day, deadline: null }), day).toBeNull();
    }
  });

  it('refuses a day outside the sprint, naming the range in the PM’s own words', () => {
    for (const day of ['2026-07-31', '2026-08-17']) {
      expect(plotIssue({ sprint, startsOn: day, deadline: null }), day).toEqual({
        code: 'OUT_OF_SPRINT',
        message: "That day is outside the sprint's dates (3 Aug 2026 – 14 Aug 2026).",
      });
    }
  });

  it('allows the DEADLINE DAY itself and refuses the day after it', () => {
    expect(plotIssue({ sprint, startsOn: '2026-08-05', deadline: '2026-08-05' })).toBeNull();
    expect(plotIssue({ sprint, startsOn: '2026-08-06', deadline: '2026-08-05' })).toEqual({
      code: 'PAST_DEADLINE',
      message: "That day is after the card's deadline (5 Aug 2026).",
    });
  });

  it('invents no deadline — a card without one is judged on the sprint alone (BR-9)', () => {
    expect(plotIssue({ sprint, startsOn: '2026-08-13' })).toBeNull();
    expect(plotIssue({ sprint, startsOn: '2026-08-13', deadline: null })).toBeNull();
  });

  it('refuses the weekend — the grid is Mon–Fri', () => {
    expect(plotIssue({ sprint, startsOn: '2026-08-08' })).toEqual({
      code: 'NOT_A_WORKDAY',
      message: 'That day is not a working day.',
    });
    expect(plotIssue({ sprint, startsOn: '2026-08-09' })!.code).toBe('NOT_A_WORKDAY'); // Sunday
  });

  it('refuses a holiday from the ACTIVE (ARES) calendar rather than a list of its own', () => {
    const restore = getHolidays();
    try {
      /* The one holiday source: whatever `setHolidays` last loaded — the ARES
         working-day calendar in production (calendar-sync.ts), the seed until
         it lands. A second list here would drift from the forecast's. */
      setHolidays([...restore, '2026-08-05']);
      expect(plotIssue({ sprint, startsOn: '2026-08-05' })!.code).toBe('NOT_A_WORKDAY');
      setHolidays(restore);
      expect(plotIssue({ sprint, startsOn: '2026-08-05' })).toBeNull();
    } finally {
      setHolidays(restore);
    }
  });

  it('takes an injected calendar, so a caller can ask against a set of its own', () => {
    const calendar = { isHoliday: (d: Date) => localIso(d) === '2026-08-12' };
    expect(plotIssue({ sprint, startsOn: '2026-08-12', calendar })!.code).toBe('NOT_A_WORKDAY');
    expect(plotIssue({ sprint, startsOn: '2026-08-11', calendar })).toBeNull();
  });

  it('checks in ONE order: the sprint, then the deadline, then the calendar', () => {
    // a Saturday BEFORE the sprint and after a deadline — the sprint answers first
    expect(plotIssue({ sprint, startsOn: '2026-08-01', deadline: '2026-07-01' })!.code).toBe('OUT_OF_SPRINT');
    // inside the sprint, past the deadline AND a Saturday — the deadline answers
    expect(plotIssue({ sprint, startsOn: '2026-08-08', deadline: '2026-08-05' })!.code).toBe('PAST_DEADLINE');
  });

  it('answers its range refusal THROUGH sprintRangeIssue — one range rule, two callers', () => {
    /* The bare list move (D5, strict) judges the range and nothing else, so
       the clause is factored out and `plotIssue` calls it first. Executed
       against each other rather than compared as source (test/CLAUDE.md rule
       2): the two must agree on every day around both boundaries, including
       the exact words, or the PM reads one sentence when they drop a bar and
       another when they drag its list. */
    for (const day of ['2026-07-31', '2026-08-02', '2026-08-03', '2026-08-10', '2026-08-14', '2026-08-15', '2026-08-17']) {
      const full = plotIssue({ sprint, startsOn: day, deadline: null });
      expect(sprintRangeIssue({ sprint, startsOn: day }), day)
        .toEqual(full?.code === 'OUT_OF_SPRINT' ? full : null);
    }
    // and it answers ONLY the range: a Saturday inside the sprint is its problem
    expect(sprintRangeIssue({ sprint, startsOn: '2026-08-08' })).toBeNull();
    expect(plotIssue({ sprint, startsOn: '2026-08-08' })!.code).toBe('NOT_A_WORKDAY');
  });

  it('is never called by rollover — §6.2 lets a roll leave its sprint and outrun the deadline', () => {
    /* The guard is on the PM's own click, never on the day-advance job. A roll
       that had to satisfy it would stop moving a card the moment the card ran
       late, which is the one case rollover exists for ("moves indefinitely …
       with no cap. That is intended", spec v1.3 §6.2). */
    const src = readFileSync(new URL('../src/services/rollover.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('plotIssue');
  });
});

describe('the write routes refuse a day that cannot be plotted on', () => {
  /** The three refusals as the routes answer them: 422 { code, message }. */
  const CASES: Array<[string, string]> = [
    ['2026-08-17', 'OUT_OF_SPRINT'], // a Monday, past the sprint's last day
    ['2026-08-13', 'PAST_DEADLINE'], // a Thursday, the day after the card's due date
    /* A Saturday INSIDE the sprint and BEFORE the deadline — so the first two
       checks pass it and the calendar is the one that answers. A Saturday past
       the due date would earn PAST_DEADLINE instead, which is the documented
       order, not a bug: the PM is told the first thing wrong with the day. */
    ['2026-08-08', 'NOT_A_WORKDAY'],
  ];

  it('PATCH answers 422 with the code and the words, and writes NOTHING', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1', { trello_due: '2026-08-12' });
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    const audits = await AuditLog.countDocuments({ project_id: project._id });

    for (const [day, code] of CASES) {
      const res = await agent.patch(itemUrl(project._id, id)).send({ starts_on: day }).expect(422);
      expect(res.body, day).toMatchObject({ ok: false, error: { code } });
      expect(String(res.body.error.message), day).toMatch(/^That day is /);
    }
    /* A REFUSED WRITE AUDITS NOTHING (invariant 10 logs changes, not attempts)
       and leaves the bar exactly where it was — the client restores the row
       from this answer, so a half-applied state here would be a state Trello
       and Sirius disagree about. */
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(audits);
    expect((await SprintItem.findOne({ _id: id, project_id: project._id }).lean())!.starts_on).toBe('2026-08-03');
  });

  it('the single ADD holds the same rule — no row, no audit, then the good day lands', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1', { trello_due: '2026-08-12' });

    for (const [day, code] of CASES) {
      const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1', starts_on: day }).expect(422);
      expect(res.body.error.code, day).toBe(code);
    }
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);

    // the day that IS plottable still lands already plotted, in the one act
    const ok = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1', starts_on: '2026-08-05' }).expect(201);
    expect((await SprintItem.findOne({ _id: ok.body.id, project_id: project._id }).lean())!.starts_on).toBe('2026-08-05');
  });

  it('allows the boundary days — the sprint’s first and last, and the deadline day itself', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1', { trello_due: '2026-08-14' });
    // the sprint's FIRST day (a plot through the PATCH route)
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    // the sprint's LAST day, which is also the deadline day
    await agent.patch(itemUrl(project._id, id)).send({ starts_on: '2026-08-14' }).expect(200);
    expect((await load(project._id)).rows[0]!.startsOn).toBe('2026-08-14');
  });

  it('never judges an UN-plot — null clears a row wherever it happens to sit', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-05');
    /* The day the row sits on becomes a holiday AFTER the plot — exactly what
       an ARES calendar refresh can do. Clearing the bar must still work: the
       guard judges a placement, and null is the absence of one. */
    await withHoliday('2026-08-05', async () => {
      await agent.patch(itemUrl(project._id, id)).send({ starts_on: null }).expect(200);
    });
    expect((await SprintItem.findOne({ _id: id, project_id: project._id }).lean())!.starts_on ?? null).toBeNull();
  });

  it('answers a RE-SEND of the day a row already sits on as the no-op it is', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-05');
    const audits = await AuditLog.countDocuments({ project_id: project._id });
    /* The calendar turns the row's own day into a holiday after the fact. The
       client's reload window can re-send the day it already sent, and that is
       not a placement — before == after, so it never reaches the guard, writes
       nothing and audits nothing (the no-op rule, review finding 2). A refusal
       here would be a 422 for a change nobody made. */
    await withHoliday('2026-08-05', async () => {
      const res = await agent.patch(itemUrl(project._id, id)).send({ starts_on: '2026-08-05' }).expect(200);
      expect(res.body.noop).toBe(true);
    });
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(audits);
    expect((await SprintItem.findOne({ _id: id, project_id: project._id }).lean())!.starts_on).toBe('2026-08-05');
  });

  it('the batch add carries no day at all, so no placement can be smuggled past the guard', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    /* Rows land unplotted by construction (#72 §6) — `.strict()` refuses the
       key, which is a REFUSAL OF THE BODY (400), stricter than the 422 a bad
       day earns on the routes that do take one. So the three plot codes cannot
       arise here, and a batch can never write a placement nobody validated. */
    await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['w1'], starts_on: '2026-08-08' }).expect(400);
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);
  });
});
