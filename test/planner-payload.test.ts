/**
 * Gantt planner payload (owl #22, frozen contract §1) — the schedules-tab
 * planner body reads exactly ONE fetch, `GET /deliverables`, and everything
 * the server sends is WINDOW-INDEPENDENT: phase segments are absolute dates
 * and per-week totals are keyed on each row's own slotted week, never on the
 * 12 visible columns. The visible window (week keys, `wkN`, month grouping)
 * is pure calendar arithmetic with no database input and stays client-side,
 * so it is deliberately absent from these tests — see the R2 note at the end.
 *
 * Locked here, because the client cannot recompute either for itself:
 *  - `rows[].phases` — the Gantt bar (R3: differences between the four
 *    forecast dates; no new forecast math, no lib/ edit)
 *  - `perWeek` — the capacity footer (BR-6a capacity, BR-6b hard mix, BR-6c
 *    card-equivalent weights)
 *
 * Every date assertion here is timezone-stable: the suite runs under the host
 * TZ and under TZ=UTC. `lib/calendar.ts`'s documented `isHoliday` UTC/local
 * quirk makes a forecast that CROSSES a PH holiday TZ-dependent, so the
 * month-spanning case asserts structure and week keys rather than exact days.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { loadPipeline } from '../src/services/pipeline.ts';
import type { PipelineRow, PlannerPhase } from '../src/services/pipeline.ts';
import { seedDatabase } from '../scripts/seed.ts';
import { HARD_MIX } from '../lib/planner.constants.ts';
import { forecast } from '../lib/forecast.ts';
import { EMPIRICAL } from '../lib/model.ts';
import { localIso, parseDate, workday } from '../lib/calendar.ts';
import { Deliverable, Project, Sprint, User, UserProject, WorkCard } from '../src/models/index.ts';

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

const TODAY = '2026-08-03';

const newProject = (over: Record<string, unknown> = {}) =>
  Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120, ...over });

/** A forecastable design-lane row; `over` supplies week / difficulty / deadline. */
const mk = (projectId: Types.ObjectId, id: string, over: Record<string, unknown> = {}) =>
  Deliverable.create({
    project_id: projectId, mc_number: `MC-${id}`, display_id: `MC-${id}`, trello_card_id: id,
    name: `D${id}`, difficulty: 'Medium', lane: 'design', current_list: 'Design', ...over,
  });

const load = (p: { _id: Types.ObjectId; weekly_capacity: number }) =>
  loadPipeline(p._id, TODAY, p.weekly_capacity);

/** One calendar day back from an ISO date — not a workday step; the deadline
    is a client date and lands on whatever day it lands on. */
const dayBefore = (isoDay: string): string => {
  const d = new Date(isoDay + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const rowOf = (rows: PipelineRow[], cardId: string) => rows.find((r) => r.cardId === cardId)!;

const DOW = (iso: string) => new Date(iso + 'T00:00:00').getDay();
const isWorkday = (iso: string) => DOW(iso) >= 1 && DOW(iso) <= 5;

/** The two structural promises §1.2 makes about every bar. */
function expectWellFormed(phases: PlannerPhase[]) {
  for (const p of phases) {
    expect(p.startIso < p.endIso, `${p.phase} ${p.startIso}..${p.endIso} must be positive width`).toBe(true);
    expect(isWorkday(p.startIso), `${p.startIso} must be Mon–Fri`).toBe(true);
    expect(isWorkday(p.endIso), `${p.endIso} must be Mon–Fri`).toBe(true);
  }
  for (let i = 1; i < phases.length; i++) {
    // half-open intervals: the previous EXCLUSIVE end is the next inclusive start
    expect(phases[i]!.startIso).toBe(phases[i - 1]!.endIso);
  }
}

describe('planner phases — the Gantt bar (R3, contract §1.2)', () => {
  it('draws sketch → review → render as contiguous half-open segments at DAY resolution', async () => {
    const p = await newProject();
    await mk(p._id, 'c1', { slotted_week: '2026-08-03', sheet_deadline: '2026-12-31' });
    const { rows } = await load(p);

    // Medium/design @0.7 from Mon 3 Aug: sketch lands Wed 5th, approval Wed
    // 12th, render Tue 18th — boundaries INSIDE weeks, which is what makes the
    // bar day-resolution rather than week-blocked.
    expect(rowOf(rows, 'c1').phases).toEqual([
      { phase: 'sketch', startIso: '2026-08-03', endIso: '2026-08-05' },
      { phase: 'review', startIso: '2026-08-05', endIso: '2026-08-12' },
      { phase: 'render', startIso: '2026-08-12', endIso: '2026-08-18' },
    ]);
    expectWellFormed(rowOf(rows, 'c1').phases);
    // none of the three boundaries is a Monday — a week-aligned bar would fail here
    expect(rowOf(rows, 'c1').phases.slice(1).every((s) => DOW(s.startIso) !== 1)).toBe(true);
  });

  it('spans exactly slotted week → renderDelivery, reusing the forecast dates verbatim', async () => {
    const p = await newProject();
    await mk(p._id, 'c1', { difficulty: 'Hard', slotted_week: '2026-08-03', sheet_deadline: '2026-12-31' });
    const row = rowOf((await load(p)).rows, 'c1');
    const f = row.forecast!;

    expect(row.phases[0]!.startIso).toBe(row.slottedWeek); // bar starts at the SLOT, not at the forecast start
    expect(row.phases[0]!.endIso).toBe(f.sketchDelivery);
    expect(row.phases[1]!.endIso).toBe(f.sketchApproved);
    expect(row.phases.at(-1)!.endIso).toBe(f.renderDelivery); // renderApproved is NOT drawn
    expect(row.phases.at(-1)!.endIso).not.toBe(f.renderApproved);
  });

  it('paints the render segment renderOverdue when the WORK misses the deadline (BR-9)', async () => {
    const p = await newProject();
    // Deadlines derived from the row's own numbers, never typed: `workFinish`
    // is the day the work lands, so one day either side of it is the boundary
    // the rule is actually about (test/CLAUDE.md rule 2).
    await mk(p._id, 'probe', { slotted_week: '2026-08-03', sheet_deadline: '2026-12-31' });
    const probe = rowOf((await load(p)).rows, 'probe').forecast!;
    await Deliverable.deleteMany({ trello_card_id: 'probe' });

    await mk(p._id, 'late', { slotted_week: '2026-08-03', sheet_deadline: dayBefore(probe.workFinish) });
    await mk(p._id, 'ontime', { slotted_week: '2026-08-03', sheet_deadline: probe.workFinish });
    await mk(p._id, 'nodeadline', { slotted_week: '2026-08-03' });
    const { rows } = await load(p);

    expect(rowOf(rows, 'late').forecast!.late).toBe(true);
    expect(rowOf(rows, 'late').phases.map((s) => s.phase)).toEqual(['sketch', 'review', 'renderOverdue']);
    // ON the deadline is not past it
    expect(rowOf(rows, 'ontime').forecast!.late).toBe(false);
    expect(rowOf(rows, 'ontime').phases.map((s) => s.phase)).toEqual(['sketch', 'review', 'render']);
    // BR-9: no deadline is no conflict — never overdue
    expect(rowOf(rows, 'nodeadline').forecast!.late).toBe(false);
    expect(rowOf(rows, 'nodeadline').phases.map((s) => s.phase)).toEqual(['sketch', 'review', 'render']);
  });

  /* ROUNDING. `workday()` does `Math.round(days)`, so walking the two phases
     separately and walking their sum once are DIFFERENT dates — and they differ
     for every difficulty in the shipped model. The first version summed, which
     ran a working day EARLY for Medium and Hard: the dangerous direction, since
     a row whose work really does run past the deadline reports no warning.
     Asserted as "matches the engine's own phase-by-phase walk", the rule,
     rather than as a date. */
  it('walks the two phases SEPARATELY, exactly as the engine does', async () => {
    const p = await newProject();
    for (const d of ['Easy', 'Medium', 'Hard']) {
      await mk(p._id, `d${d}`, { difficulty: d, slotted_week: '2026-08-03', sheet_deadline: '2026-12-31' });
    }
    const { rows } = await load(p);

    let differed = 0;
    for (const d of ['Easy', 'Medium', 'Hard']) {
      const f = rowOf(rows, `d${d}`).forecast!;
      const start = f.startDate;
      const perPhase = localIso(
        workday(workday(parseDate(start), f.sketchLead + f.sketchDesign), f.renderLead + f.renderDesign),
      );
      const summedOnce = localIso(
        workday(parseDate(start), f.sketchLead + f.sketchDesign + f.renderLead + f.renderDesign),
      );
      expect(f.workFinish, `${d} does not match the engine's phase walk`).toBe(perPhase);
      if (perPhase !== summedOnce) differed++;
    }
    // the two spellings really are distinguishable, or the guard proves nothing
    expect(differed, 'summing and walking agree on every fixture — this guard is vacuous').toBeGreaterThan(0);
  });

  /* THE RULING ITSELF (JP, 2026-08-27, answering owls #72/#74). The client's
     review wait is out of the past-deadline warning; the forecast DATES still
     carry it. The gap between `workFinish` and `renderDelivery` is exactly that
     wait, so a deadline landing inside it is the one case where the old rule
     and the new one disagree — and the only case worth a test, because every
     other deadline gives the same answer under both. */
  it('a deadline inside the client-review wait is NOT late — the work fits', async () => {
    const p = await newProject();
    await mk(p._id, 'c1', { slotted_week: '2026-08-03', sheet_deadline: '2026-12-31' });
    const f = rowOf((await load(p)).rows, 'c1').forecast!;

    // the wait is real on this row, or the case below proves nothing
    expect(f.workFinish < f.renderDelivery, 'no review wait on this fixture — the guard is vacuous').toBe(true);

    await Deliverable.deleteMany({ trello_card_id: 'c1' });
    await mk(p._id, 'c1', { slotted_week: '2026-08-03', sheet_deadline: f.renderDelivery });
    const inWait = rowOf((await load(p)).rows, 'c1').forecast!;

    expect(inWait.late).toBe(false); // would have been TRUE before the ruling
    expect(inWait.renderDelivery > inWait.workFinish).toBe(true); // and the dates still say why
  });

  it('drops a zero-width segment instead of drawing it (SLA 0 collapses the review wait)', async () => {
    const p = await newProject();
    await mk(p._id, 'c1', { slotted_week: '2026-08-03', sheet_deadline: '2026-12-31', sla_sketch: 0 });
    const row = rowOf((await load(p)).rows, 'c1');

    expect(row.forecast!.sketchApproved).toBe(row.forecast!.sketchDelivery); // the wait really is zero
    expect(row.phases).toEqual([
      { phase: 'sketch', startIso: '2026-08-03', endIso: '2026-08-05' },
      { phase: 'render', startIso: '2026-08-05', endIso: '2026-08-11' },
    ]);
    expectWellFormed(row.phases); // still contiguous with the middle gone
  });

  it('suppresses the bar on the missing WEEK, not the missing forecast', async () => {
    const p = await newProject();
    await mk(p._id, 'unslotted', { sheet_deadline: '2026-12-31' }); // no slotted_week
    const row = rowOf((await load(p)).rows, 'unslotted');

    // an unslotted row still carries a forecast, keyed on today — the planner
    // must not draw it anywhere (it belongs in the Unscheduled block)
    expect(row.slottedWeek).toBeNull();
    expect(row.forecast).not.toBeNull();
    expect(row.phases).toEqual([]);
  });

  it('has no bar when the card has no difficulty label (no forecast to draw)', async () => {
    const p = await newProject();
    await mk(p._id, 'nodiff', { difficulty: undefined, slotted_week: '2026-08-03' });
    const row = rowOf((await load(p)).rows, 'nodiff');

    expect(row.difficulty).toBeNull();
    expect(row.forecast).toBeNull();
    expect(row.phases).toEqual([]);
    expect(row.missing).toContain('difficulty label');
  });

  it('never overlaps and never runs backwards across a mixed board', async () => {
    const p = await newProject();
    for (const [i, difficulty] of ['Easy', 'Medium', 'Hard'].entries())
      for (const [j, week] of ['2026-08-03', '2026-08-10', '2026-08-17'].entries())
        for (const [k, lane] of ['design', 'ops', 'assets'].entries())
          await mk(p._id, `c${i}${j}${k}`, { difficulty, lane, slotted_week: week, sheet_deadline: '2026-12-31' });

    const { rows } = await load(p);
    expect(rows).toHaveLength(27);
    for (const row of rows) {
      expect(row.phases.length).toBeGreaterThan(0);
      expectWellFormed(row.phases);
      expect(row.phases[0]!.startIso).toBe(row.slottedWeek);
    }
  });
});

describe('perWeek — the capacity footer (contract §1.3)', () => {
  it('counts BR-6c card-equivalents, not rows, and rounds to 3 decimals', async () => {
    const p = await newProject();
    // one MC group: 3 deliverables + 2 attached work cards → weight 1 + 2/3 each
    for (const id of ['g1', 'g2', 'g3'])
      await mk(p._id, id, { mc_number: 'MC-G', slotted_week: id === 'g3' ? undefined : '2026-08-03' });
    for (const id of ['t1', 't2'])
      await WorkCard.create({ project_id: p._id, mc_number: 'MC-G', trello_card_id: id, name: 't' });

    const { rows, perWeek } = await load(p);
    expect(rowOf(rows, 'g1').weight).toBeCloseTo(1 + 2 / 3, 10);
    // two SLOTTED rows carry the group's weight; the third is unscheduled
    expect(perWeek['2026-08-03']).toMatchObject({ cards: 3.333, rows: 2, hard: 0 });
  });

  it('omits empty weeks entirely — no zero entries for the client to filter', async () => {
    const p = await newProject();
    await mk(p._id, 'c1', { slotted_week: '2026-08-03' });
    await mk(p._id, 'c2', { slotted_week: '2026-08-17' });
    const { perWeek } = await load(p);

    expect(Object.keys(perWeek).sort()).toEqual(['2026-08-03', '2026-08-17']);
    expect(perWeek['2026-08-10']).toBeUndefined(); // the gap week is ABSENT, not {cards: 0}
  });

  it('excludes done rows and unslotted rows from the footer', async () => {
    const p = await newProject();
    await mk(p._id, 'live', { slotted_week: '2026-08-03' });
    await mk(p._id, 'done', { slotted_week: '2026-08-03', current_list: 'Done' });
    await mk(p._id, 'unslotted', {});
    const { rows, perWeek } = await load(p);

    expect(rowOf(rows, 'done').status).toBe('done');
    expect(perWeek['2026-08-03']!.rows).toBe(1); // the done row is on the board but not in the load
    expect(Object.keys(perWeek)).toEqual(['2026-08-03']);
  });

  it('flags over against the PROJECT weekly capacity (BR-6a)', async () => {
    const p = await newProject({ weekly_capacity: 3 });
    for (const id of ['a', 'b', 'c']) await mk(p._id, id, { slotted_week: '2026-08-03' });
    for (const id of ['d', 'e', 'f', 'g']) await mk(p._id, id, { slotted_week: '2026-08-10' });
    const { perWeek } = await load(p);

    expect(perWeek['2026-08-03']).toMatchObject({ cards: 3, over: false }); // AT capacity is not over
    expect(perWeek['2026-08-10']).toMatchObject({ cards: 4, over: true });
  });

  it('flags the hard mix against the MEASURED HARD_MIX thresholds, never a retyped 13%', async () => {
    const p = await newProject();
    const fill = async (week: string, total: number, hard: number) => {
      for (let i = 0; i < total; i++)
        await mk(p._id, `${week}-${i}`, { slotted_week: week, difficulty: i < hard ? 'Hard' : 'Medium' });
    };
    await fill('2026-08-03', 20, 1); // 0.05 — under the 8.3% ideal
    await fill('2026-08-10', 10, 1); // 0.10 — between ideal and the 12.9% ceiling
    await fill('2026-08-17', 5, 1); //  0.20 — over the ceiling
    await fill('2026-08-24', 4, 0); //  0.00 — clean

    const { perWeek } = await load(p);
    expect(perWeek['2026-08-03']).toMatchObject({ hard: 1, hardShare: 0.05, hardWarn: false, hardOver: false });
    expect(perWeek['2026-08-10']).toMatchObject({ hard: 1, hardShare: 0.1, hardWarn: true, hardOver: false });
    expect(perWeek['2026-08-17']).toMatchObject({ hard: 1, hardShare: 0.2, hardWarn: false, hardOver: true });
    expect(perWeek['2026-08-24']).toMatchObject({ hard: 0, hardShare: 0, hardWarn: false, hardOver: false });

    // the bands are the constants themselves, so a change to lib/planner.constants.ts
    // moves the footer rather than desynchronising it
    expect(perWeek['2026-08-03']!.hardShare).toBeLessThanOrEqual(HARD_MIX.ideal);
    expect(perWeek['2026-08-10']!.hardShare).toBeGreaterThan(HARD_MIX.ideal);
    expect(perWeek['2026-08-10']!.hardShare).toBeLessThanOrEqual(HARD_MIX.ceiling);
    expect(perWeek['2026-08-17']!.hardShare).toBeGreaterThan(HARD_MIX.ceiling);
  });

  it('keys every total on the slotted Monday, including a month-spanning week (R2 edge)', async () => {
    const p = await newProject();
    // Mon 31 Aug 2026 starts a week that runs into September — R2 files it
    // under AUGUST because its MONDAY is in August. The server half of that
    // rule is the key: it must be the Monday it was slotted on, byte for byte,
    // in every host timezone. (buildWeeks().key would yield Sunday 30 Aug on a
    // Manila host — recon §E.1 — which is why nothing here goes near it.)
    await mk(p._id, 'augEnd', { slotted_week: '2026-08-31' });
    await mk(p._id, 'sepStart', { slotted_week: '2026-09-07' });
    await mk(p._id, 'decEnd', { slotted_week: '2026-12-28' }); // week runs into January 2027
    const { rows, perWeek } = await load(p);

    expect(Object.keys(perWeek).sort()).toEqual(['2026-08-31', '2026-09-07', '2026-12-28']);
    for (const key of Object.keys(perWeek)) expect(DOW(key)).toBe(1); // every key is a Monday
    // the bar still starts on the slotted Monday even when the phases cross the
    // month (exact days are not asserted: an Aug-31 start crosses a PH holiday,
    // whose exclusion is TZ-dependent by lib/calendar.ts's documented quirk)
    for (const id of ['augEnd', 'sepStart', 'decEnd']) {
      const row = rowOf(rows, id);
      expect(row.phases[0]!.startIso).toBe(row.slottedWeek);
      expectWellFormed(row.phases);
    }
    expect(rowOf(rows, 'decEnd').phases.at(-1)!.endIso.slice(0, 4)).toBe('2027'); // spans the year boundary
  });

  it('never leaks another project’s rows into the totals (invariant 1)', async () => {
    const mine = await newProject();
    const theirs = await Project.create({ code: 'rt-900', name: 'Other', trello_board_id: 'fxB', weekly_capacity: 120 });
    await mk(mine._id, 'mine', { slotted_week: '2026-08-03' });
    for (const id of ['x', 'y', 'z']) await mk(theirs._id, id, { slotted_week: '2026-08-03' });

    const { rows, perWeek } = await load(mine);
    expect(rows.map((r) => r.cardId)).toEqual(['mine']);
    expect(perWeek['2026-08-03']).toMatchObject({ rows: 1, cards: 1 });
  });
});

describe('grouping inputs — membership is DERIVED, never stored (R5, invariant 12)', () => {
  it('emits sprint ranges and slotted weeks, and nothing that assigns a row to a sprint', async () => {
    const p = await newProject();
    await Sprint.create({ project_id: p._id, name: 'Sprint 46', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 1 });
    await Sprint.create({ project_id: p._id, name: 'Sprint 47', starts_on: '2026-08-24', ends_on: '2026-09-04', position: 2 });
    await mk(p._id, 'inSprint', { slotted_week: '2026-08-10' }); // inside Sprint 46
    await mk(p._id, 'inGap', { slotted_week: '2026-08-17' }); // the gap → Outside any sprint
    await mk(p._id, 'unscheduled', {}); // no week → Unscheduled

    const { rows } = await load(p);
    const sprints = await Sprint.find({ project_id: p._id }).sort({ position: 1 }).lean();
    const sprintOf = (week: string | null) =>
      week ? (sprints.find((s) => week >= s.starts_on && week <= s.ends_on)?.name ?? 'Outside any sprint') : 'Unscheduled';

    expect(sprintOf(rowOf(rows, 'inSprint').slottedWeek)).toBe('Sprint 46');
    expect(sprintOf(rowOf(rows, 'inGap').slottedWeek)).toBe('Outside any sprint'); // BR-5 gaps are surfaced, not hidden
    expect(sprintOf(rowOf(rows, 'unscheduled').slottedWeek)).toBe('Unscheduled');

    // there is no sprint-assignment write anywhere: moving the week IS the
    // sprint move, so no row may carry a sprint reference of its own
    for (const row of rows)
      expect(Object.keys(row).filter((k) => /sprint/i.test(k))).toEqual([]);
  });
});

describe('E2E probe — GET /deliverables on a seeded isolated DB', () => {
  it('serves one window-independent planner payload: rows, phases, sprints, perWeek, capacity', async () => {
    await seedDatabase();
    const project = await Project.findOne({ code: 'rt-837' }).orFail();
    const user = await User.findOne({ email: 'jpdguzman@frostdesigngroup.com' }).orFail();
    expect(await UserProject.countDocuments({ user_id: user._id, project_id: project._id })).toBe(1);
    const agent = request.agent(createApp({ env, redis: null, mongo: null }));
    await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);

    const body = (await agent.get(`/api/projects/${project._id}/deliverables`).expect(200)).body;
    const row = (cardId: string) => body.rows.find((r: PipelineRow) => r.cardId === cardId);

    // --- capacity: the 12.9% ceiling travels with the payload (§1.4) -------
    expect(body.capacity).toMatchObject({
      weekly: 120, typical: 120, hardIdeal: HARD_MIX.ideal, hardCeiling: HARD_MIX.ceiling,
    });
    expect(Math.round(body.capacity.hardCeiling * 100)).toBe(13); // the frame's "13%", rounded not retyped

    // --- sprints: emitted with a gap between them (BR-5) -------------------
    expect(body.sprints.map((s: { name: string }) => s.name)).toEqual(['Sprint 12', 'Sprint 13']);
    expect(body.sprints[1]).toMatchObject({ start: '2026-08-10', end: '2026-08-21' });

    // --- the three groups the planner draws --------------------------------
    expect(row('fxCard655a').slottedWeek).toBe('2026-08-10'); // inside Sprint 13
    expect(row('fxCard712').slottedWeek).toBe('2026-08-03'); // in the sprint gap → Outside any sprint
    expect(row('fxCard655b').slottedWeek).toBeNull(); // Unscheduled
    expect(row('fxCard655b').phases).toEqual([]);

    // --- the left table columns (§2 field mapping) -------------------------
    expect(row('fxCard712')).toMatchObject({
      mcLabel: 'MC-712', name: 'MC-712 Campaign banner set', requestor: '@andyandy', assetType: 'UI',
      currentList: 'Working on Design', status: 'ongoing', difficulty: 'Hard', urgency: 'Non-Urgent',
    });
    expect(row('fxCard701').requestor).toBeNull(); // the "—, no badge" empty state
    expect(row('fxCard701').assetType).toBeNull();

    /* --- phases, and the 2026-08-27 deadline ruling on real fixture data ---

       This Hard row is the whole ruling in one example. Its WORK lands 10 Aug
       and its deadline is 14 Aug, so the work fits with four days to spare —
       but the render segment ends 19 Aug, because the client's review wait
       sits between the two phases. Under the old rule it drew renderOverdue
       and a PM was warned about a date no amount of design work could move.

       The bar is UNCHANGED — the forecast dates still carry review, so the
       row still ends 19 Aug and the reader can still see the wait. Only the
       warning moved. `renderOverdue` itself is proved in the BR-9 case above,
       against a deadline derived from `workFinish`. */
    /* Derived, not pinned. `workFinish` walks the two phases SEPARATELY, as the
       engine does — `workday()` rounds its argument, so one walk over the summed
       days is a different date and came out a working day early for Medium and
       Hard (the dangerous direction: a missed warning). Executing the engine
       here means the guard tracks the rule rather than yesterday's number. */
    const f712 = forecast(
      { difficulty: 'Hard', currentList: 'Working on Design', labels: [], startDate: '2026-08-03' },
      EMPIRICAL,
    );
    const expectedWork = localIso(
      workday(workday(parseDate('2026-08-03'), f712.sketchLead + f712.sketchDesign), f712.renderLead + f712.renderDesign),
    );
    expect(row('fxCard712').forecast.workFinish).toBe(expectedWork);
    expect(expectedWork < '2026-08-14').toBe(true); // the work fits before the deadline…
    expect(row('fxCard712').forecast.late).toBe(false); // …so no warning, while the bar still ends 19 Aug
    expect(row('fxCard712').phases).toEqual([
      { phase: 'sketch', startIso: '2026-08-03', endIso: '2026-08-06' },
      { phase: 'review', startIso: '2026-08-06', endIso: '2026-08-13' },
      { phase: 'render', startIso: '2026-08-13', endIso: '2026-08-19' },
    ]);
    expectWellFormed(row('fxCard655a').phases);

    // --- perWeek: only the weeks that hold work, in card-equivalents -------
    expect(Object.keys(body.perWeek).sort()).toEqual(['2026-08-03', '2026-08-10']);
    expect(body.perWeek['2026-08-03']).toMatchObject({ rows: 1, hard: 1, hardShare: 1, hardOver: true, over: false });
    // MC-655 group: 3 deliverables + 2 tasks → 1.667 for the one slotted row;
    // MC-701: 1 deliverable + 1 task → 2. Rounded to 3 decimals.
    expect(body.perWeek['2026-08-10']).toMatchObject({ rows: 2, cards: 3.667, hard: 0 });

    // --- and nothing from the other seeded project (invariant 1) -----------
    expect(body.rows.some((r: PipelineRow) => r.cardId === 'fxCardAcme12')).toBe(false);
  });
});

/**
 * NOT tested here, deliberately: the `wkN` ordinal and month grouping (R2).
 * Contract §0/§3.3 keeps that grid client-side — it is calendar arithmetic
 * with no database input, so week nav stays fetch-free and the rule exists
 * once, in `plannerWeeks()`. Its edge cases (Aug 31 → wk5 of AUGUST, Sep 7 →
 * wk1 of SEPTEMBER, Oct 5 → wk1 of OCTOBER) belong to Builder B's suite. The
 * server half of R2 — that a slotted week key is always the Monday, in every
 * host timezone — is covered by the month-spanning test above.
 */
