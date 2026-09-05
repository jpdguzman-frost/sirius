/**
 * Rollover — owl miles→jp #75 §2, jp→miles #59 §3, PLAN.md B10 (block 3),
 * hardened per review 2026-09-05 (R3-1..R3-4, R5-6).
 *
 * The rule under test: after each successful ARES sync, a plotted, unfinished
 * work card whose forecast finish is before today (Manila) moves forward one
 * working day at a time until its finish is today or later; its sprint
 * follows its finish day (tail position on a change of sprint, the PATCH
 * route's rule); one audit row per moved card, actor `system`; nothing else
 * moves, and nothing unchanged is written or audited. A project rolls only on
 * a FRESH, SUCCESSFUL ARES read of its own (R3-1); a row rewritten under the
 * job is left alone (R3-2); a move that cannot be audited is taken back
 * (R3-3); every project's pass leaves a `sync_runs` row (R5-6).
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
 *
 * THE SYNC. Every project the fixture builds carries a one-minute-old
 * successful `ares` sync_runs row, because without one the gate (R3-1) skips
 * the project whole — the gate's own cases build theirs by hand.
 */

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { SYNC_FRESH_MS, nextFinishDay, rollUnfinished, sprintFor } from '../src/services/rollover.ts';
import type { RolloverResult } from '../src/services/rollover.ts';
import { finishOf } from '../src/services/sprint-items.ts';
import { classifyList } from '../src/services/status-rules.ts';
import { manilaToday } from '../src/services/pipeline.ts';
import { EMPIRICAL } from '../lib/model.ts';
import { getHolidays, isHoliday, localIso, parseDate, setHolidays, workday } from '../lib/calendar.ts';
import { AuditLog, Project, Sprint, SprintItem, SyncRun, WorkCard } from '../src/models/index.ts';

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

/** The full result shape, zeros unless said otherwise — the six counts are the contract. */
const counts = (over: Partial<RolloverResult> = {}): RolloverResult => ({
  projects: 1, moved: 0, skipped: 0, raced: 0, failed: 0, capped: 0, ...over,
});

/** An `ares` sync_runs row for the project: ok and one minute old unless overridden. */
const syncRow = (projectId: Types.ObjectId, over: { ok?: boolean; agoMs?: number } = {}) =>
  SyncRun.create({
    project_id: projectId, source: 'ares', ok: over.ok ?? true,
    at: new Date(Date.now() - (over.agoMs ?? 60_000)),
  });

async function setup(
  sprint: Partial<typeof SPRINT_A> = {},
  projectOver: Record<string, unknown> = {},
  sync: { ok?: boolean; agoMs?: number } | null = {},
) {
  const project = await Project.create({
    code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 22, ...projectOver,
  });
  if (sync !== null) await syncRow(project._id, sync);
  const sprintA = await Sprint.create({ project_id: project._id, ...SPRINT_A, ...sprint });
  return { project, sprintA };
}

/** A second ongoing project with its own sprint A and a fresh sync — the scope and record cases. */
async function otherProject() {
  const b = await Project.create({ code: 'rt-999', name: 'Other', trello_board_id: 'fxB', weekly_capacity: 22 });
  await syncRow(b._id);
  const sb = await Sprint.create({ project_id: b._id, ...SPRINT_A });
  return { b, sb };
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

/** The project's rollover record for the pass just run — exactly one per pass (R5-6). */
async function record(projectId: Types.ObjectId) {
  const rows = await SyncRun.find({ project_id: projectId, source: 'rollover' }).lean();
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/* ---------------------------------------------------------------------- */
/* the walk                                                                */
/* ---------------------------------------------------------------------- */

describe('a late row walks forward one working day at a time until its finish reaches today', () => {
  it('one working day late → the start moves exactly one working day', async () => {
    const f0 = finishFor(MONDAY);
    const today = nextWorkday(f0); // the day after the finish, on the calendar the walk uses
    const { result, after, audits } = await lateRow(MONDAY, today);

    expect(result).toEqual(counts({ moved: 1 }));
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
    expect(again).toEqual(counts());
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

  /* R3-5: the cap is "do not move", and it is COUNTED — a bar two and a half
     years behind must not read as "nothing was late" on the worker's line. */
  it('a walk that hits the step cap leaves the row where it is and counts it capped', async () => {
    const { project, sprintA } = await setup();
    await mkCard(project._id, 'w1');
    const farBack = '2024-01-02'; // ~670 working days before the today below — well past 400 steps
    const item = await mkItem(project._id, sprintA._id, 'w1', farBack);
    // the premise: the walk really does give up at the default cap for this distance
    expect(nextFinishDay(farBack, (s) => finishFor(s), '2026-09-05')).toBeNull();

    const result = await rollUnfinished({ today: '2026-09-05', projectId: project._id });
    expect(result).toEqual(counts({ capped: 1 }));
    expect((await SprintItem.findById(item._id).orFail()).starts_on).toBe(farBack);
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
    expect((await record(project._id)).stats).toEqual({ moved: 0, skipped: 0, raced: 0, failed: 0, capped: 1 });
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
/* the sync gate (R3-1)                                                    */
/* ---------------------------------------------------------------------- */

describe('R3-1 — a project rolls only on a FRESH, SUCCESSFUL ARES read of its own', () => {
  const late = () => nextWorkday(finishFor(MONDAY));

  /** Two plotted rows and one unplotted: the gate's `skipped` is the PLOTTED count.
      `later` writes a second ares row AFTER the fixture's — the latest row is what the gate reads. */
  async function gated(sync: { ok?: boolean; agoMs?: number } | null, later?: { ok: boolean; source?: 'ares' | 'ares_push' }) {
    const { project, sprintA } = await setup({}, {}, sync);
    if (later) {
      await SyncRun.create({ project_id: project._id, source: later.source ?? 'ares', ok: later.ok, error: later.ok ? undefined : 'ARES 502', at: new Date() });
    }
    for (const id of ['w1', 'w2', 'w3']) await mkCard(project._id, id);
    const a = await mkItem(project._id, sprintA._id, 'w1', MONDAY, { position: 0 });
    const b = await mkItem(project._id, sprintA._id, 'w2', MONDAY, { position: 1 });
    await mkItem(project._id, sprintA._id, 'w3', null, { position: 2 });
    const result = await rollUnfinished({ today: late(), projectId: project._id });
    const rows = await Promise.all([a._id, b._id].map((id) => SprintItem.findById(id).orFail()));
    return { project, result, rows, audits: await AuditLog.countDocuments({ project_id: project._id }) };
  }

  it('the LATEST ares row is a failure (after a fresh success) → nothing moves, nothing is audited, the rows count as skipped', async () => {
    // the fixture's fresh success is followed by a failure: the latest row of ANY outcome is the read's state
    const { project, result, rows, audits } = await gated({ ok: true, agoMs: 60_000 }, { ok: false });
    expect(result).toEqual(counts({ skipped: 2 }));
    expect(rows.map((r) => r.starts_on)).toEqual([MONDAY, MONDAY]);
    expect(audits).toBe(0);
    const rec = await record(project._id);
    expect(rec.ok).toBe(true); // the tick happened; the project sat it out, and the row says why
    expect(rec.error).toBeUndefined();
    expect(rec.stats).toEqual({ moved: 0, skipped: 2, raced: 0, failed: 0, capped: 0, reason: 'sync_failed' });
  });

  it('a success AFTER a failure → the read recovered, the project rolls', async () => {
    const { result, rows, audits } = await gated({ ok: false, agoMs: 60_000 }, { ok: true });
    expect(result).toEqual(counts({ moved: 2 }));
    expect(rows.map((r) => r.starts_on)).toEqual([nextWorkday(MONDAY), nextWorkday(MONDAY)]);
    expect(audits).toBe(2);
  });

  it('a failure with NO success before it → skipped, reason sync_failed', async () => {
    const { result, rows, audits, project } = await gated({ ok: false });
    expect(result).toEqual(counts({ skipped: 2 }));
    expect(rows.map((r) => r.starts_on)).toEqual([MONDAY, MONDAY]);
    expect(audits).toBe(0);
    expect((await record(project._id)).stats).toMatchObject({ skipped: 2, reason: 'sync_failed' });
  });

  it('a success OLDER than the window → skipped, reason sync_stale', async () => {
    const { result, rows, audits, project } = await gated({ ok: true, agoMs: SYNC_FRESH_MS + 1_000 });
    expect(result).toEqual(counts({ skipped: 2 }));
    expect(rows.map((r) => r.starts_on)).toEqual([MONDAY, MONDAY]);
    expect(audits).toBe(0);
    expect((await record(project._id)).stats).toMatchObject({ skipped: 2, reason: 'sync_stale' });
  });

  it('a fresh ok PUSH drain counts as the read — a push-healthy project rolls between its hourly reconciles', async () => {
    /* FR-9.6: while push is healthy the full sync runs hourly and the ticks
       in between write only `ares_push` rows; a gate that read `ares` alone
       rolled such a project once an hour (fix-agent note 1). */
    const { result, rows, audits, project } = await gated(null, { ok: true, source: 'ares_push' });
    expect(result).toEqual(counts({ moved: 2 }));
    expect(rows.map((r) => r.starts_on)).toEqual([nextWorkday(MONDAY), nextWorkday(MONDAY)]);
    expect(audits).toBe(2);
    expect((await record(project._id)).stats).toEqual({ moved: 2, skipped: 0, raced: 0, failed: 0, capped: 0 });
  });

  it('a FAILED push drain as the latest read gates the project like a failed full sync', async () => {
    const { result, rows, audits, project } = await gated({ ok: true, agoMs: 60_000 }, { ok: false, source: 'ares_push' });
    expect(result).toEqual(counts({ skipped: 2 }));
    expect(rows.map((r) => r.starts_on)).toEqual([MONDAY, MONDAY]);
    expect(audits).toBe(0);
    expect((await record(project._id)).stats).toMatchObject({ skipped: 2, reason: 'sync_failed' });
  });

  it('no ares row at all (never synced) → skipped, reason sync_missing', async () => {
    const { result, rows, project } = await gated(null);
    expect(result).toEqual(counts({ skipped: 2 }));
    expect(rows.map((r) => r.starts_on)).toEqual([MONDAY, MONDAY]);
    expect((await record(project._id)).stats).toMatchObject({ skipped: 2, reason: 'sync_missing' });
  });

  it('a success INSIDE the window → rolls; the window is the exported constant, not a copy', async () => {
    expect(SYNC_FRESH_MS).toBe(65 * 60 * 1000); // the hourly reconcile while push is healthy (FR-9.6) plus five minutes of slack
    const { result, rows, audits, project } = await gated({ ok: true, agoMs: SYNC_FRESH_MS - 1_000 });
    expect(result).toEqual(counts({ moved: 2 }));
    expect(rows.map((r) => r.starts_on)).toEqual([nextWorkday(MONDAY), nextWorkday(MONDAY)]);
    expect(audits).toBe(2);
    expect((await record(project._id)).stats).toEqual({ moved: 2, skipped: 0, raced: 0, failed: 0, capped: 0 });
  });

  it('the gate is per project: a failed read on one project never holds the other back', async () => {
    const { project: a, sprintA: sa } = await setup({}, {}, { ok: false });
    const { b, sb } = await otherProject();
    await mkCard(a._id, 'w1');
    await mkCard(b._id, 'w1');
    const ia = await mkItem(a._id, sa._id, 'w1', MONDAY);
    const ib = await mkItem(b._id, sb._id, 'w1', MONDAY);

    expect(await rollUnfinished({ today: late() })).toEqual(counts({ projects: 2, moved: 1, skipped: 1 }));
    expect((await SprintItem.findById(ia._id).orFail()).starts_on).toBe(MONDAY);
    expect((await SprintItem.findById(ib._id).orFail()).starts_on).toBe(nextWorkday(MONDAY));
  });
});

/* ---------------------------------------------------------------------- */
/* no lost update (R3-2)                                                   */
/* ---------------------------------------------------------------------- */

describe('R3-2 — a row rewritten between the job’s read and its write is left alone', () => {
  const PM_DAY = '2026-09-28';

  /** Slip a PM write under the job: it runs just before the job's FIRST conditional update. */
  function underTheJob(write: (filter: { _id: Types.ObjectId }) => Promise<unknown>) {
    const original = SprintItem.updateOne.bind(SprintItem) as unknown as (...a: unknown[]) => unknown;
    return vi.spyOn(SprintItem, 'updateOne').mockImplementationOnce((async (...args: unknown[]) => {
      await write(args[0] as { _id: Types.ObjectId });
      return original(...args);
    }) as never);
  }

  it('the PM re-plots the row in the window → the PM’s day stands, no audit, counted raced', async () => {
    const { project, sprintA } = await setup();
    await mkCard(project._id, 'w1');
    const item = await mkItem(project._id, sprintA._id, 'w1', MONDAY);
    const spy = underTheJob((f) => SprintItem.collection.updateOne({ _id: f._id }, { $set: { starts_on: PM_DAY } }));
    try {
      const result = await rollUnfinished({ today: nextWorkday(finishFor(MONDAY)), projectId: project._id });
      expect(result).toEqual(counts({ raced: 1 }));
    } finally {
      spy.mockRestore();
    }
    expect((await SprintItem.findById(item._id).orFail()).starts_on).toBe(PM_DAY);
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
    expect((await record(project._id)).stats).toMatchObject({ raced: 1, moved: 0 });

    // the next tick re-evaluates from the PM's state: 09-28 is not late, so nothing moves
    expect(await rollUnfinished({ today: nextWorkday(finishFor(MONDAY)), projectId: project._id })).toEqual(counts());
  });

  it('the PM un-plots the row in the window → it stays unplotted, never re-plotted by the job', async () => {
    const { project, sprintA } = await setup();
    await mkCard(project._id, 'w1');
    const item = await mkItem(project._id, sprintA._id, 'w1', MONDAY);
    const spy = underTheJob((f) => SprintItem.collection.updateOne({ _id: f._id }, { $unset: { starts_on: 1 } }));
    try {
      expect(await rollUnfinished({ today: nextWorkday(finishFor(MONDAY)), projectId: project._id })).toEqual(counts({ raced: 1 }));
    } finally {
      spy.mockRestore();
    }
    expect((await SprintItem.findById(item._id).orFail()).starts_on).toBeUndefined();
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);
  });

  it('the PM deletes the row in the window → no throw, the pass goes on to the next row', async () => {
    const { project, sprintA } = await setup();
    await mkCard(project._id, 'w1');
    await mkCard(project._id, 'w2');
    const gone = await mkItem(project._id, sprintA._id, 'w1', MONDAY, { position: 0 });
    const stays = await mkItem(project._id, sprintA._id, 'w2', MONDAY, { position: 1 });
    const spy = underTheJob((f) => SprintItem.collection.deleteOne({ _id: f._id }));
    try {
      expect(await rollUnfinished({ today: nextWorkday(finishFor(MONDAY)), projectId: project._id })).toEqual(
        counts({ raced: 1, moved: 1 }),
      );
    } finally {
      spy.mockRestore();
    }
    expect(await SprintItem.findById(gone._id)).toBeNull(); // not resurrected
    expect((await SprintItem.findById(stays._id).orFail()).starts_on).toBe(nextWorkday(MONDAY));
    const audits = await AuditLog.find({ project_id: project._id }).lean();
    expect(audits.map((a) => a.entity_id)).toEqual([String(stays._id)]);
  });
});

/* ---------------------------------------------------------------------- */
/* audit or revert, per row (R3-3)                                         */
/* ---------------------------------------------------------------------- */

describe('R3-3 — a move that cannot be audited is taken back, and one failure never stops the pass', () => {
  const crossing = () => {
    const f0 = finishFor(WEDNESDAY);
    expect(weekday(f0)).toBe(FRI);
    return plusDays(f0, 1);
  };

  it('AuditLog.create rejects once → that row is back where it was (day, sprint, position), the next row moves and audits', async () => {
    const { project, sprintA } = await setup();
    const sprintB = await Sprint.create({ project_id: project._id, ...SPRINT_B });
    await mkCard(project._id, 'w1');
    await mkCard(project._id, 'w2');
    // both cross into sprint B — so the revert has all three fields to put back
    const first = await mkItem(project._id, sprintA._id, 'w1', WEDNESDAY, { position: 0 });
    const second = await mkItem(project._id, sprintA._id, 'w2', WEDNESDAY, { position: 1 });

    const spy = vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('audit store unreachable'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let result: RolloverResult;
    try {
      result = await rollUnfinished({ today: crossing(), projectId: project._id });
    } finally {
      spy.mockRestore();
      errors.mockRestore();
    }
    expect(result).toEqual(counts({ moved: 1, failed: 1 }));

    // the first row: exactly its pre-move state — nothing moved un-audited
    const a = await SprintItem.findById(first._id).orFail();
    expect(a.starts_on).toBe(WEDNESDAY);
    expect(String(a.sprint_id)).toBe(String(sprintA._id));
    expect(a.position).toBe(0);
    // the second row: moved, at B's tail — which is empty, the first row having been taken back
    const b = await SprintItem.findById(second._id).orFail();
    expect(b.starts_on).toBe(nextWorkday(WEDNESDAY));
    expect(String(b.sprint_id)).toBe(String(sprintB._id));
    expect(b.position).toBe(0);
    // one audit row, the second row's
    const audits = await AuditLog.find({ project_id: project._id }).lean();
    expect(audits.map((r) => r.entity_id)).toEqual([String(second._id)]);
    // the project's pass did not throw: ok, with the failure in the counts
    const rec = await record(project._id);
    expect(rec.ok).toBe(true);
    expect(rec.stats).toEqual({ moved: 1, skipped: 0, raced: 0, failed: 1, capped: 0 });

    // and the next tick moves the reverted row, audited this time
    expect(await rollUnfinished({ today: crossing(), projectId: project._id })).toEqual(counts({ moved: 1 }));
    expect((await SprintItem.findById(first._id).orFail()).starts_on).toBe(nextWorkday(WEDNESDAY));
    expect(await AuditLog.countDocuments({ project_id: project._id, entity_id: String(first._id) })).toBe(1);
  });

  it('a project whose pass throws outside the row guard → its record says so, the other project still rolls', async () => {
    const { project: a, sprintA: sa } = await setup();
    const { b, sb } = await otherProject();
    await mkCard(a._id, 'w1');
    await mkCard(b._id, 'w1');
    const ia = await mkItem(a._id, sa._id, 'w1', MONDAY);
    const ib = await mkItem(b._id, sb._id, 'w1', MONDAY);

    // the cards read fails for project A only — keyed on the filter, not on call order
    const original = WorkCard.find.bind(WorkCard) as unknown as (...args: unknown[]) => unknown;
    const spy = vi.spyOn(WorkCard, 'find').mockImplementation(((...args: unknown[]) => {
      const filter = args[0] as { project_id?: Types.ObjectId };
      if (filter?.project_id && String(filter.project_id) === String(a._id)) throw new Error('cards read failed');
      return original(...args);
    }) as never);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let result: RolloverResult;
    try {
      result = await rollUnfinished({ today: nextWorkday(finishFor(MONDAY)) });
    } finally {
      spy.mockRestore();
      errors.mockRestore();
    }
    expect(result).toEqual(counts({ projects: 2, moved: 1 }));
    expect((await SprintItem.findById(ia._id).orFail()).starts_on).toBe(MONDAY);
    expect((await SprintItem.findById(ib._id).orFail()).starts_on).toBe(nextWorkday(MONDAY));

    const ra = await record(a._id);
    expect(ra.ok).toBe(false);
    expect(ra.error).toBe('cards read failed');
    expect(ra.stats).toEqual({ moved: 0, skipped: 0, raced: 0, failed: 0, capped: 0 });
    const rb = await record(b._id);
    expect(rb.ok).toBe(true);
    expect(rb.stats).toEqual({ moved: 1, skipped: 0, raced: 0, failed: 0, capped: 0 });
  });
});

/* ---------------------------------------------------------------------- */
/* the sync_runs record (R5-6)                                             */
/* ---------------------------------------------------------------------- */

describe('R5-6 — every project’s pass writes ONE sync_runs row, source rollover', () => {
  it('one row per project per run, ok, stats in the five-count shape, no error field', async () => {
    const { project: a, sprintA: sa } = await setup();
    const { b, sb } = await otherProject();
    await mkCard(a._id, 'w1');
    await mkCard(b._id, 'w1');
    await mkItem(a._id, sa._id, 'w1', MONDAY);
    await mkItem(b._id, sb._id, 'w1', '2099-01-04'); // not late

    await rollUnfinished({ today: nextWorkday(finishFor(MONDAY)) });
    const ra = await record(a._id);
    const rb = await record(b._id);
    for (const r of [ra, rb]) {
      expect(r.source).toBe('rollover');
      expect(r.ok).toBe(true);
      expect(r.error).toBeUndefined();
      expect(r.at).toBeInstanceOf(Date);
      expect(Object.keys(r.stats as object).sort()).toEqual(['capped', 'failed', 'moved', 'raced', 'skipped']);
    }
    expect(ra.stats).toEqual({ moved: 1, skipped: 0, raced: 0, failed: 0, capped: 0 });
    expect(rb.stats).toEqual({ moved: 0, skipped: 0, raced: 0, failed: 0, capped: 0 });

    // a second run is a second row each — the record is per RUN, never overwritten
    await rollUnfinished({ today: nextWorkday(finishFor(MONDAY)) });
    expect(await SyncRun.countDocuments({ source: 'rollover' })).toBe(4);
    // and the ares rows the gate reads are untouched by it
    expect(await SyncRun.countDocuments({ source: 'ares' })).toBe(2);
  });

  it('a project outside the ongoing set gets no row — it was not visited', async () => {
    const { project } = await setup({}, { status: 'archived' });
    await rollUnfinished({ today: MONDAY });
    expect(await SyncRun.countDocuments({ project_id: project._id, source: 'rollover' })).toBe(0);
  });
});

/* ---------------------------------------------------------------------- */
/* scope                                                                   */
/* ---------------------------------------------------------------------- */

describe('scope — ongoing projects, optionally one of them (invariant 1)', () => {
  const late = () => nextWorkday(finishFor(MONDAY));

  it('projectId narrows the pass; a second project’s rows are untouched until its own pass', async () => {
    const { project: a, sprintA: sa } = await setup();
    const { b, sb } = await otherProject();
    await mkCard(a._id, 'w1');
    await mkCard(b._id, 'w1');
    const ia = await mkItem(a._id, sa._id, 'w1', MONDAY);
    const ib = await mkItem(b._id, sb._id, 'w1', MONDAY);

    expect(await rollUnfinished({ today: late(), projectId: a._id })).toEqual(counts({ moved: 1 }));
    expect((await SprintItem.findById(ia._id).orFail()).starts_on).toBe(nextWorkday(MONDAY));
    expect((await SprintItem.findById(ib._id).orFail()).starts_on).toBe(MONDAY);
    expect(await AuditLog.countDocuments({ project_id: b._id })).toBe(0);

    // the unscoped pass visits both; only the one still late moves
    expect(await rollUnfinished({ today: late() })).toEqual(counts({ projects: 2, moved: 1 }));
    expect((await SprintItem.findById(ib._id).orFail()).starts_on).toBe(nextWorkday(MONDAY));
  });

  it('a project that is not ongoing is not visited, even when named', async () => {
    const { project, sprintA } = await setup({}, { status: 'archived' });
    await mkCard(project._id, 'w1');
    const item = await mkItem(project._id, sprintA._id, 'w1', MONDAY);

    expect(await rollUnfinished({ today: late(), projectId: project._id })).toEqual(counts({ projects: 0 }));
    expect(await rollUnfinished({ today: late() })).toEqual(counts({ projects: 0 }));
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
   the rule "rollover runs only after the sync, its failure never masks the
   sync's own line, and the stored calendar is active before anything
   forecasts" is read off the file's shape. The per-project gate itself is
   proven above against the database (R3-1) — the seam is only the seam. */
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
    expect(tick.slice(caught, roll)).toMatch(/\breturn;/); // a thrown sync runs no rollover
  });

  it('imports the service dynamically, logs its failure under its own prefix, and prints the six counts', () => {
    expect(WORKER).toMatch(/import\('\.\.\/src\/services\/rollover\.ts'\)/);
    expect(WORKER).toContain("'[sirius-worker] rollover failed:'");
    const line = WORKER.match(/\[sirius-worker\] rollover: ([\s\S]*?)\(\$\{res\.projects\} projects\)/)?.[1] ?? '';
    expect(line).not.toBe('');
    for (const key of ['moved', 'skipped', 'raced', 'failed', 'capped']) {
      expect(line).toContain(`\${res.${key}} ${key}`);
    }
  });

  /* R3-4: the web process loads the stored calendar at boot (server.js); the
     worker now does the same, BEFORE the first calendarTick, so a restart
     during an ARES outage walks the persisted set and never the seed. */
  it('loads the STORED calendar at boot, before the first calendar tick (R3-4)', () => {
    expect(WORKER).toMatch(/import\('\.\.\/src\/services\/calendar-sync\.ts'\)[\s\S]*?loadCalendar\(mongoose\.connection\)/);
    const load = WORKER.indexOf('await loadStoredCalendar()');
    const firstCalendarTick = WORKER.indexOf('await calendarTick()');
    const firstAresTick = WORKER.indexOf('await aresTick()');
    expect(load).toBeGreaterThan(-1);
    expect(firstCalendarTick).toBeGreaterThan(load);
    expect(firstAresTick).toBeGreaterThan(firstCalendarTick);
    expect(WORKER).toContain("'[sirius-worker] calendar load failed:'"); // its own catch, its own line
  });
});
