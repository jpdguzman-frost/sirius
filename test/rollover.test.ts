/**
 * Rollover — owl miles→jp #75 §2, jp→miles #59 §3, PLAN.md B10 (block 3).
 *
 * The rule under test: after each successful ARES sync, a plotted, unfinished
 * work card whose forecast finish is before today (Manila) moves forward one
 * working day at a time until its finish is today or later; its sprint
 * follows its finish day (tail position on a change of sprint, the PATCH
 * route's rule); one audit row per moved card, actor `system`; nothing else
 * moves, and nothing unchanged is written or audited.
 *
 * THE ENGINE IS THE ORACLE. Every expected date is derived from the shipped
 * `finishOf` and `lib/calendar.ts` (test/CLAUDE.md rule 2) — the design
 * cell's length is never typed here. Fixed August 2026 days set the SCENARIO
 * (which weekday a finish lands on; a precondition assertion says so, and
 * fails loudly if the snapshot moves), and the walk is asserted against
 * `workday`. One identity carries most cases: shifting a start by one working
 * day shifts the engine's finish by one working day, so "k working days late"
 * means "the start moves k working days" — a theorem of `workday`, not a
 * property of the snapshot.
 *
 * THE MODEL. `Project` defaults `model_frozen: true` (invariant 7's gate,
 * JP 2026-08-27), so `loadProjectModel` hands back the shipped `EMPIRICAL`
 * snapshot — the same model `finishOf` is called with here. No grid is
 * seeded; the freeze IS the seeding.
 */

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { nextFinishDay, rollUnfinished, sprintFor } from '../src/services/rollover.ts';
import { finishOf } from '../src/services/sprint-items.ts';
import { classifyList } from '../src/services/status-rules.ts';
import { manilaToday } from '../src/services/pipeline.ts';
import { EMPIRICAL } from '../lib/model.ts';
import { getHolidays, isHoliday, localIso, parseDate, setHolidays, workday } from '../lib/calendar.ts';
import { AuditLog, Project, Sprint, SprintItem, WorkCard } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

/* ---------------------------------------------------------------------- */
/* fixture                                                                 */
/* ---------------------------------------------------------------------- */

/** #73's sample card: Medium, in a design lane. The lane comes from the LIST alone. */
const CARD = { difficulty: 'Medium', current_list: 'Working on Design', task_prefix: 'Sketch Asset' };

/** The engine's finish for a start — the ONE number every expectation is built from. */
const finishFor = (start: string, card: typeof CARD = CARD): string => {
  const f = finishOf(card, start, EMPIRICAL);
  if (!f) throw new Error(`no finish for ${start} — the fixture card must carry a difficulty`);
  return f;
};
/** One working day on, on the ACTIVE calendar — the rollover's own step. */
const nextWorkday = (iso: string) => localIso(workday(parseDate(iso), 1));
const plusDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return localIso(d);
};
const weekday = (iso: string) => parseDate(iso).getDay();
const MON = 1;
const FRI = 5;
const SAT = 6;

/* August 2026: the third is a Monday; the seed calendar has no holiday
   before the thirty-first, so the first two weeks are five clean days each. */
const MONDAY = '2026-08-03';
const WEDNESDAY = '2026-08-05';
const SPRINT_A = { name: 'Sprint 12', starts_on: '2026-08-03', ends_on: '2026-08-07', position: 0 };
const SPRINT_B = { name: 'Sprint 13', starts_on: '2026-08-10', ends_on: '2026-08-14', position: 1 };

async function setup(sprint: Partial<typeof SPRINT_A> = {}, projectOver: Record<string, unknown> = {}) {
  const project = await Project.create({
    code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 22, ...projectOver,
  });
  const sprintA = await Sprint.create({ project_id: project._id, ...SPRINT_A, ...sprint });
  return { project, sprintA };
}

const mkCard = (projectId: Types.ObjectId, id: string, over: Record<string, unknown> = {}) =>
  WorkCard.create({
    project_id: projectId, mc_number: 'MC-07', trello_card_id: id, name: `Sketch Asset: ${id}`,
    ...CARD, ...over,
  });

/** A plotted row — the two acts (add, plot) collapsed, since only the plotted state rolls. */
const mkItem = (
  projectId: Types.ObjectId,
  sprintId: Types.ObjectId,
  cardId: string,
  startsOn: string | null,
  over: Record<string, unknown> = {},
) =>
  SprintItem.create({
    project_id: projectId, sprint_id: sprintId, mc_number: 'MC-07', trello_card_id: cardId,
    ...(startsOn ? { starts_on: startsOn } : {}), position: 0, added_by: 'ops@frostdesigngroup.com', ...over,
  });

/** The one late row most cases start from: card + plotted row + the pass. */
async function lateRow(start: string, today: string, cardOver: Record<string, unknown> = {}) {
  const { project, sprintA } = await setup();
  await mkCard(project._id, 'w1', cardOver);
  const item = await mkItem(project._id, sprintA._id, 'w1', start);
  const result = await rollUnfinished({ today, projectId: project._id });
  const after = await SprintItem.findById(item._id).orFail();
  const audits = await AuditLog.find({ project_id: project._id });
  return { project, sprintA, item, result, after, audits };
}

/* ---------------------------------------------------------------------- */
/* the walk                                                                */
/* ---------------------------------------------------------------------- */

describe('a late row walks forward one working day at a time until its finish reaches today', () => {
  it('one working day late → the start moves exactly one working day', async () => {
    const f0 = finishFor(MONDAY);
    const today = nextWorkday(f0); // the day after the finish, on the calendar the walk uses
    const { result, after, audits } = await lateRow(MONDAY, today);

    expect(result).toEqual({ projects: 1, moved: 1 });
    expect(after.starts_on).toBe(nextWorkday(MONDAY));
    // the rule itself: the previous finish was before today, the new one is not
    expect(f0 < today).toBe(true);
    expect(finishFor(after.starts_on!) >= today).toBe(true);
    expect(audits).toHaveLength(1);
  });

  it('a Friday finish seen on Saturday lands on Monday — weekends are not days', async () => {
    const f0 = finishFor(WEDNESDAY);
    expect(weekday(f0)).toBe(FRI); // the scenario: pick another start if the snapshot moves this
    const today = plusDays(f0, 1);
    expect(weekday(today)).toBe(SAT);

    const { after } = await lateRow(WEDNESDAY, today);
    const f1 = finishFor(after.starts_on!);
    expect(weekday(f1)).toBe(MON);
    expect(f1).toBe(nextWorkday(f0)); // one working day on from Friday IS Monday
    expect(after.starts_on).toBe(nextWorkday(WEDNESDAY)); // and the start took exactly one step
  });

  it('three working days late → caught up in ONE pass, one audit row, no overshoot', async () => {
    const f0 = finishFor(MONDAY);
    const today = localIso(workday(parseDate(f0), 3));
    const { after, audits, result } = await lateRow(MONDAY, today);

    expect(result.moved).toBe(1);
    expect(after.starts_on).toBe(localIso(workday(parseDate(MONDAY), 3)));
    expect(finishFor(after.starts_on!) >= today).toBe(true);
    // minimal: every start the walk stepped OVER still finished before today
    for (let d = nextWorkday(MONDAY); d < after.starts_on!; d = nextWorkday(d)) {
      expect(finishFor(d) < today).toBe(true);
    }
    // one pass, one row — not one row per step
    expect(audits).toHaveLength(1);
  });

  it('a second pass with the same today moves nothing and audits nothing — idempotent', async () => {
    const today = localIso(workday(parseDate(finishFor(MONDAY)), 3));
    const { project, item, after } = await lateRow(MONDAY, today);
    const settled = after.starts_on;

    const again = await rollUnfinished({ today, projectId: project._id });
    expect(again).toEqual({ projects: 1, moved: 0 });
    expect((await SprintItem.findById(item._id).orFail()).starts_on).toBe(settled);
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(1);
  });

  it('a finish that IS today is not late — the day is still running', async () => {
    const { result, after, audits } = await lateRow(MONDAY, finishFor(MONDAY));
    expect(result.moved).toBe(0);
    expect(after.starts_on).toBe(MONDAY);
    expect(audits).toEqual([]);
  });

  it('a holiday set via setHolidays is stepped over — the start never lands on it', async () => {
    const restore = getHolidays();
    try {
      const holiday = nextWorkday(WEDNESDAY); // Thursday, on the seed calendar
      setHolidays([...restore, holiday]);
      expect(isHoliday(parseDate(holiday))).toBe(true);

      const f0 = finishFor(WEDNESDAY); // computed on the ACTIVE calendar, holiday included
      const today = nextWorkday(f0);
      const { after } = await lateRow(WEDNESDAY, today);

      expect(after.starts_on).not.toBe(holiday);
      expect(after.starts_on).toBe(nextWorkday(WEDNESDAY)); // Friday: one working day on, Thursday skipped
      expect(isHoliday(parseDate(after.starts_on!))).toBe(false);
      expect(finishFor(after.starts_on!) >= today).toBe(true);
    } finally {
      setHolidays(restore);
    }
  });
});

/* ---------------------------------------------------------------------- */
/* what does not roll                                                      */
/* ---------------------------------------------------------------------- */

describe('rows that never move', () => {
  const wayLate = () => localIso(workday(parseDate(finishFor(MONDAY)), 5));

  it('a card in a done lane — a done card does not roll (#75 §3)', async () => {
    expect(classifyList('Done')).toBe('done'); // the premise, read off the classifier
    const { result, after, audits } = await lateRow(MONDAY, wayLate(), { current_list: 'Done' });
    expect(result.moved).toBe(0);
    expect(after.starts_on).toBe(MONDAY);
    expect(audits).toEqual([]);
  });

  it('a card with no difficulty label — no design cell, no finish, nothing to move', async () => {
    const { result, after, audits } = await lateRow(MONDAY, wayLate(), { difficulty: null });
    expect(result.moved).toBe(0);
    expect(after.starts_on).toBe(MONDAY);
    expect(audits).toEqual([]);
  });

  it('a card that left the board (deactivated) — the row keeps its place, unmoved', async () => {
    const { result, after, audits } = await lateRow(MONDAY, wayLate(), { active: false });
    expect(result.moved).toBe(0);
    expect(after.starts_on).toBe(MONDAY);
    expect(audits).toEqual([]);
  });

  it('a row whose card was never mirrored at all', async () => {
    const { project, sprintA } = await setup();
    const item = await mkItem(project._id, sprintA._id, 'ghost', MONDAY);
    const result = await rollUnfinished({ today: wayLate(), projectId: project._id });
    expect(result.moved).toBe(0);
    expect((await SprintItem.findById(item._id).orFail()).starts_on).toBe(MONDAY);
  });

  it('an unplotted row — there is no bar to move', async () => {
    const { project, sprintA } = await setup();
    await mkCard(project._id, 'w1');
    const item = await mkItem(project._id, sprintA._id, 'w1', null);
    const result = await rollUnfinished({ today: wayLate(), projectId: project._id });
    expect(result.moved).toBe(0);
    expect((await SprintItem.findById(item._id).orFail()).starts_on).toBeUndefined();
  });

  /* Owl #80 §2's watch item, recorded as behaviour: the keyword classifier is
     JP's interim (#59), and a client-review lane matches neither its done nor
     its pending regex, so it classifies ONGOING and rolls. When the Apollo
     mapping lands this case is the one to revisit — until then it documents
     the ruled state, so a change here is noticed rather than slipped. */
  it('WATCH (#80 §2): a client-review lane classifies ongoing and therefore ROLLS', async () => {
    expect(classifyList('Sent for Client Review')).toBe('ongoing');
    const { result, after } = await lateRow(MONDAY, nextWorkday(finishFor(MONDAY)), {
      current_list: 'Sent for Client Review',
    });
    expect(result.moved).toBe(1);
    expect(after.starts_on).toBe(nextWorkday(MONDAY));
  });
});

/* ---------------------------------------------------------------------- */
/* sprint membership follows the finish                                    */
/* ---------------------------------------------------------------------- */

describe('sprint membership follows the NEW finish day (#75 §2)', () => {
  /* Wednesday's finish is Friday (asserted), Saturday is today, so the new
     finish is Monday — the first day of the NEXT sprint. */
  const crossing = () => {
    const f0 = finishFor(WEDNESDAY);
    expect(weekday(f0)).toBe(FRI);
    return plusDays(f0, 1);
  };

  it('crosses into the next sprint: sprint_id changes and the row takes the TAIL position', async () => {
    const { project, sprintA } = await setup();
    const sprintB = await Sprint.create({ project_id: project._id, ...SPRINT_B });
    await mkCard(project._id, 'w1');
    await mkCard(project._id, 'b1');
    // B already lists a row at position four — unplotted, so it cannot itself roll
    await mkItem(project._id, sprintB._id, 'b1', null, { position: 4 });
    const item = await mkItem(project._id, sprintA._id, 'w1', WEDNESDAY);

    const today = crossing();
    await rollUnfinished({ today, projectId: project._id });
    const after = await SprintItem.findById(item._id).orFail();

    expect(finishFor(after.starts_on!) >= SPRINT_B.starts_on).toBe(true);
    expect(String(after.sprint_id)).toBe(String(sprintB._id));
    expect(after.position).toBe(5); // the PATCH route's rule: tail of the target list, never the old slot

    const [row] = await AuditLog.find({ project_id: project._id });
    expect(row!.before).toEqual({ starts_on: WEDNESDAY, sprint_id: String(sprintA._id) });
    expect(row!.after).toEqual({ starts_on: after.starts_on, sprint_id: String(sprintB._id) });
  });

  it('two rows crossing in one pass take DISTINCT tail positions, in list order', async () => {
    const { project, sprintA } = await setup();
    const sprintB = await Sprint.create({ project_id: project._id, ...SPRINT_B });
    await mkCard(project._id, 'w1');
    await mkCard(project._id, 'w2');
    const first = await mkItem(project._id, sprintA._id, 'w1', WEDNESDAY, { position: 0 });
    const second = await mkItem(project._id, sprintA._id, 'w2', WEDNESDAY, { position: 1 });

    await rollUnfinished({ today: crossing(), projectId: project._id });
    const a = await SprintItem.findById(first._id).orFail();
    const b = await SprintItem.findById(second._id).orFail();
    expect(String(a.sprint_id)).toBe(String(sprintB._id));
    expect(String(b.sprint_id)).toBe(String(sprintB._id));
    expect([a.position, b.position]).toEqual([0, 1]);
  });

  it('no sprint covers the new finish → sprint_id and position stay as they were', async () => {
    const { project, sprintA } = await setup(); // sprint A alone; the week after is a gap
    await mkCard(project._id, 'w1');
    const item = await mkItem(project._id, sprintA._id, 'w1', WEDNESDAY, { position: 3 });

    const today = crossing();
    const result = await rollUnfinished({ today, projectId: project._id });
    const after = await SprintItem.findById(item._id).orFail();

    expect(result.moved).toBe(1); // the bar still moved
    expect(after.starts_on).toBe(nextWorkday(WEDNESDAY));
    expect(finishFor(after.starts_on!) > SPRINT_A.ends_on).toBe(true); // outside any sprint
    expect(String(after.sprint_id)).toBe(String(sprintA._id));
    expect(after.position).toBe(3);

    const [row] = await AuditLog.find({ project_id: project._id });
    expect(row!.after).toEqual({ starts_on: after.starts_on, sprint_id: String(sprintA._id) });
  });

  it('the same sprint still covers the finish → the row keeps its position', async () => {
    const { project, sprintA } = await setup({ ends_on: SPRINT_B.ends_on }); // one two-week sprint
    await mkCard(project._id, 'w1');
    const item = await mkItem(project._id, sprintA._id, 'w1', WEDNESDAY, { position: 3 });

    await rollUnfinished({ today: crossing(), projectId: project._id });
    const after = await SprintItem.findById(item._id).orFail();
    expect(String(after.sprint_id)).toBe(String(sprintA._id));
    expect(after.position).toBe(3);
  });
});

/* ---------------------------------------------------------------------- */
/* the audit row                                                           */
/* ---------------------------------------------------------------------- */

describe('every move is audited (invariant 10), and only moves are', () => {
  it('writes sprintItem.rollover / sprint_item / system with before and after { starts_on, sprint_id }', async () => {
    const today = nextWorkday(finishFor(MONDAY));
    const { project, sprintA, item, after, audits } = await lateRow(MONDAY, today);

    expect(audits).toHaveLength(1);
    const row = audits[0]!;
    expect(row.action).toBe('sprintItem.rollover');
    expect(row.entity).toBe('sprint_item');
    expect(row.entity_id).toBe(String(item._id));
    expect(row.actor).toBe('system'); // no session behind a worker job
    expect(String(row.project_id)).toBe(String(project._id));
    expect(row.before).toEqual({ starts_on: MONDAY, sprint_id: String(sprintA._id) });
    expect(row.after).toEqual({ starts_on: after.starts_on, sprint_id: String(sprintA._id) });
    expect(row.at).toBeInstanceOf(Date);
    // distinguishable from a PM's own plot — the two are never the same action name
    expect(await AuditLog.countDocuments({ action: 'sprintItem.plot' })).toBe(0);
  });
});

/* ---------------------------------------------------------------------- */
/* scope                                                                   */
/* ---------------------------------------------------------------------- */

describe('scope — ongoing projects, optionally one of them (invariant 1)', () => {
  const late = () => nextWorkday(finishFor(MONDAY));

  it('projectId narrows the pass; a second project’s rows are untouched until its own pass', async () => {
    const { project: a, sprintA: sa } = await setup();
    const b = await Project.create({ code: 'rt-999', name: 'Other', trello_board_id: 'fxB', weekly_capacity: 22 });
    const sb = await Sprint.create({ project_id: b._id, ...SPRINT_A });
    await mkCard(a._id, 'w1');
    await mkCard(b._id, 'w1');
    const ia = await mkItem(a._id, sa._id, 'w1', MONDAY);
    const ib = await mkItem(b._id, sb._id, 'w1', MONDAY);

    expect(await rollUnfinished({ today: late(), projectId: a._id })).toEqual({ projects: 1, moved: 1 });
    expect((await SprintItem.findById(ia._id).orFail()).starts_on).toBe(nextWorkday(MONDAY));
    expect((await SprintItem.findById(ib._id).orFail()).starts_on).toBe(MONDAY);
    expect(await AuditLog.countDocuments({ project_id: b._id })).toBe(0);

    // the unscoped pass visits both; only the one still late moves
    expect(await rollUnfinished({ today: late() })).toEqual({ projects: 2, moved: 1 });
    expect((await SprintItem.findById(ib._id).orFail()).starts_on).toBe(nextWorkday(MONDAY));
  });

  it('a project that is not ongoing is not visited, even when named', async () => {
    const { project, sprintA } = await setup({}, { status: 'archived' });
    await mkCard(project._id, 'w1');
    const item = await mkItem(project._id, sprintA._id, 'w1', MONDAY);

    expect(await rollUnfinished({ today: late(), projectId: project._id })).toEqual({ projects: 0, moved: 0 });
    expect(await rollUnfinished({ today: late() })).toEqual({ projects: 0, moved: 0 });
    expect((await SprintItem.findById(item._id).orFail()).starts_on).toBe(MONDAY);
  });

  it('today defaults to the Manila calendar day (invariant 11)', async () => {
    const { project, sprintA } = await setup();
    await mkCard(project._id, 'w1');
    await mkCard(project._id, 'w2');
    // forty-five calendar days back is well inside the walk's cap; the year 2099 is not late
    const behind = await mkItem(project._id, sprintA._id, 'w1', plusDays(manilaToday(), -45));
    const ahead = await mkItem(project._id, sprintA._id, 'w2', '2099-01-04', { position: 1 });

    const result = await rollUnfinished({ projectId: project._id });
    expect(result.moved).toBe(1);
    expect(finishFor((await SprintItem.findById(behind._id).orFail()).starts_on!) >= manilaToday()).toBe(true);
    expect((await SprintItem.findById(ahead._id).orFail()).starts_on).toBe('2099-01-04');
  });
});

/* ---------------------------------------------------------------------- */
/* the pure pieces                                                         */
/* ---------------------------------------------------------------------- */

describe('nextFinishDay — pure', () => {
  it('returns the input when its finish is already on or after today', () => {
    const fixed = () => '2026-08-10';
    expect(nextFinishDay('2026-08-03', fixed, '2026-08-10')).toBe('2026-08-03'); // on
    expect(nextFinishDay('2026-08-03', fixed, '2026-08-05')).toBe('2026-08-03'); // after
  });

  it('returns null when there is no finish to compare', () => {
    expect(nextFinishDay('2026-08-03', () => null, '2026-08-10')).toBeNull();
  });

  it('steps with workday: a Friday start seen on Saturday yields Monday', () => {
    // finish = start, so the walk is the calendar alone
    const monday = nextFinishDay('2026-08-07', (s) => s, '2026-08-08');
    expect(monday).toBe('2026-08-10');
    expect(weekday(monday!)).toBe(MON);
  });

  it('gives up at the cap rather than writing a partial move', () => {
    let calls = 0;
    const broken = () => {
      calls++;
      return '2000-01-01'; // never reaches today, whatever the start
    };
    expect(nextFinishDay('2026-08-03', broken, '2026-08-10', 5)).toBeNull();
    expect(calls).toBe(6); // the input plus five steps, then it stops
  });
});

describe('sprintFor — pure', () => {
  const sprints = [
    { id: 'A', starts_on: '2026-08-03', ends_on: '2026-08-07' },
    { id: 'B', starts_on: '2026-08-10', ends_on: '2026-08-14' },
  ];
  it('is inclusive at both ends', () => {
    expect(sprintFor('2026-08-03', sprints)).toBe('A');
    expect(sprintFor('2026-08-07', sprints)).toBe('A');
    expect(sprintFor('2026-08-10', sprints)).toBe('B');
    expect(sprintFor('2026-08-14', sprints)).toBe('B');
  });
  it('is null in a gap, past the last sprint, and with no sprints at all', () => {
    expect(sprintFor('2026-08-08', sprints)).toBeNull();
    expect(sprintFor('2026-08-17', sprints)).toBeNull();
    expect(sprintFor('2026-08-03', [])).toBeNull();
  });
});

/* ---------------------------------------------------------------------- */
/* the worker seam                                                         */
/* ---------------------------------------------------------------------- */

/* Source-reading guard (test/CLAUDE.md rule 3 — raw text, comments included).
   The worker cannot be imported here (it connects and schedules on load), so
   the rule "rollover runs only after a SUCCESSFUL sync, and its failure never
   masks the sync's own line" is read off the tick's shape. */
describe('the worker seam — worker/index.ts', () => {
  const WORKER = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
  const tick = WORKER.match(/async function aresTick\(\) \{\n([\s\S]*?)\n\}/)?.[1] ?? '';

  it('calls the rollover past the sync’s own catch, which returns first', () => {
    expect(tick).not.toBe('');
    const sync = tick.indexOf('runAresSync(');
    const caught = tick.indexOf('} catch (err)');
    const roll = tick.indexOf('rolloverTick()');
    expect(sync).toBeGreaterThan(-1);
    expect(caught).toBeGreaterThan(sync);
    expect(roll).toBeGreaterThan(caught);
    expect(tick.slice(caught, roll)).toMatch(/\breturn;/); // a failed sync runs no rollover
  });

  it('imports the service dynamically and logs its failure under its own prefix', () => {
    expect(WORKER).toMatch(/import\('\.\.\/src\/services\/rollover\.ts'\)/);
    expect(WORKER).toContain("'[sirius-worker] rollover failed:'");
    expect(WORKER).toMatch(/\[sirius-worker\] rollover: \$\{res\.moved\} moved/);
  });
});
