/**
 * Rollover — the ONE thing that moves a plotted row on its own.
 *
 * Owl miles→jp #75 §2: an unfinished work card slated for a day moves to the
 * next day by itself, crossing weeks AND sprints; sprint membership follows
 * it; the bar translates whole; no marker, no stopping condition. jp→miles
 * #59 §3 (JP 2026-08-28): audit rows yes, UI marker no. PLAN.md B10 (block 3,
 * 2026-09-05) fixes the shape below; drift rows 19, 27, 28, 46. Review
 * 2026-09-05 (R3-1..R3-4, R5-6) hardened the write path — each fix is marked
 * inline with its finding id.
 *
 * WHAT IT DOES. For every ongoing project — the same `status: 'ongoing'` set
 * the ARES sync itself walks — every row that is plotted (`starts_on` set)
 * and whose card is still on the board, carries a difficulty label, and does
 * not sit in a done lane: while the row's forecast FINISH is before today
 * (Manila, invariant 11), its start moves to the next working day. The finish
 * is the engine's — `finishOf`, the same number the bar and the FORECASTED
 * column read — never a copy of its arithmetic. A row that moved re-picks the
 * sprint holding its NEW finish day and joins that sprint's list at the tail,
 * exactly as the PATCH sprint-items route does on a move; when no sprint
 * covers the day the row stays listed where it is (a gap between sprints is
 * a legal state, invariant 12, and "Outside any sprint" is how it surfaces).
 * One audit row per moved card, actor `system`. An unchanged row writes
 * nothing and audits nothing — invariant 10 logs CHANGES, not attempts, the
 * convention the PATCH route's no-op guard set.
 *
 * WHY AFTER THE SYNC, NOT BEFORE — AND WHY THE GATE IS HERE (R3-1). The
 * worker calls this at the end of `aresTick`. The sync is what tells Sirius
 * a card went done in Trello, and a done card is skipped here (#75 §3: a
 * done card does not roll) — so reading the board first means a card
 * finished over the weekend is seen as done before Saturday's tick would
 * have rolled it to Monday. Rolling on a FAILED read defeats that: the lanes
 * are stale, and the job would move a card the board has finished. The
 * worker's own return-on-throw is not enough, because `runAresSync` records
 * a project's failure in `sync_runs` and returns normally (worker/syncAres.ts)
 * — so the gate lives here, per project, on the record the sync leaves:
 * a project rolls only when its LATEST `sync_runs` row from a READ — source
 * `ares` (the full sync) or `ares_push` (a push drain, which re-reads the
 * cards that changed) — exists, is ok, and is no older than `SYNC_FRESH_MS`.
 * Both sources count because FR-9.6 relaxes the full sync to HOURLY while
 * push is healthy, and a push-healthy project writes only `ares_push` rows in
 * between; a window that read `ares` alone gated such a project to one roll
 * an hour (fix-agent note 1). A stale success is a failed cycle in disguise
 * (the worker's healthz gate skips the whole tick and writes nothing). A gated project's rows are counted under `skipped`
 * and left exactly as they are.
 *
 * NO LOST UPDATE (R3-2). The rows are read once and walked with awaits in
 * between; a PM can plot, un-plot or delete a row in that window. So the
 * move is ONE conditional update keyed on what the job read — `starts_on`
 * and `sprint_id` — and a row that no longer reads that way is not written:
 * `matchedCount` 0 means someone wrote in between, the row is left alone,
 * nothing is audited, it is counted under `raced`, and the next tick
 * re-evaluates it from its new state. There is no `save()` in this file.
 *
 * AUDIT OR REVERT, PER ROW (R3-3). A state change without its audit row is
 * exactly what invariant 10 forbids (the batch-add route's rule,
 * src/routes/schedule.ts). When the audit insert fails after the update
 * matched, a second conditional update keyed on the NEW values takes the row
 * back, and the row is counted under `failed`. Every row and every project
 * runs under its own guard: one failure never aborts the rest of the pass.
 *
 * ONE `sync_runs` ROW PER PROJECT PER RUN (R5-6). contracts/worker.md's
 * universal rule: every run writes a `sync_runs` document. Source
 * `rollover`, `ok` false only when the project's pass threw OUTSIDE the
 * per-row guard (a read failed before any row was reached); the stats carry
 * the five row counts and, for a gated project, the `reason`.
 *
 * WHY NO UI MARKER. Owl #75 §2 asks for none and jp→miles #59 §3 confirms
 * it: the moved bar IS the information and the audit log is the record.
 * Nothing here flags a row as rolled, and `SprintItemRow` carries no such
 * field. A reader who wants to know whether a bar was moved by hand or by
 * this job reads `audit_log` — `sprintItem.plot` against `sprintItem.rollover`.
 *
 * WHY `classifyList`, AND ITS WATCH ITEM. The done test is the keyword
 * classifier, which is JP's INTERIM (jp→miles #59: lanes come from Apollo per
 * project, no static table; keyword classification retires WHEN that mapping
 * lands — which needs Miles's group×type rule and an ARES lanes read
 * endpoint, and neither exists yet; drift row 26). Until then owl #80 §2's
 * watch item applies: a client-review lane ("Sent for Client Review") matches
 * neither regex, classifies ONGOING, and therefore ROLLS — a card waiting on
 * the client keeps stepping forward one working day per tick. That is the
 * ruled behaviour, recorded in the rulebook, not a defect to patch here; when
 * the mapping lands the swap is the one `classifyList` call below.
 *
 * WHY THE WORK CARD, AND WHAT IS LEFT ALONE. The schedule's unit is the task
 * card (#72). This module reads `sprint_items` and never the board to fill
 * gaps (#72 §2), and never removes a row on the strength of a card's status
 * (#72 §5). A row whose card has gone, or has no difficulty, has no finish
 * (PLAN.md B2) and so nothing to move: it is left exactly as it is, and it is
 * absent from Deadlines for the same reason.
 *
 * WHAT IT WRITES. `sprint_items`, `audit_log` and `sync_runs` only —
 * Sirius-owned planning data and its own record. Nothing reaches Trello or
 * the sheet (invariant 2), so `writes_enabled` — which gates the three-entry
 * Trello registry alone — does not gate this, and a read-only project's
 * schedule rolls like any other.
 */

import { Types } from 'mongoose';
import { localIso, parseDate, workday } from '../../lib/calendar.ts';
import { Project, Sprint, SprintItem, SyncRun, WorkCard } from '../models/index.ts';
import { audit } from './audit.ts';
import { loadProjectModel } from './model-grid.ts';
import { manilaToday } from './pipeline.ts';
import { finishOf } from './sprint-items.ts';
import { classifyList } from './status-rules.ts';

/**
 * R3-1: how old the project's latest successful read may be for this tick
 * to roll on it. The full sync runs every 15 minutes but relaxes to HOURLY
 * while push is healthy (FR-9.6, worker/drainPush.ts), with push drains
 * writing `ares_push` rows in between — so the window is the hour plus five
 * minutes of slack for a slow read. A success older than this is a failed
 * cycle in disguise, and the project sits this tick out.
 */
export const SYNC_FRESH_MS = 65 * 60 * 1000; // the hourly reconcile while push is healthy (FR-9.6) plus five minutes of slack

/** The five row counts — every count but `projects` is a count of ROWS. */
export interface RolloverCounts {
  /** Rows whose `starts_on` changed — one audit row each. */
  moved: number;
  /** Plotted rows of a project whose ARES read was missing, failed or stale (R3-1) — left alone. */
  skipped: number;
  /** Rows rewritten between the job's read and its write (R3-2) — left alone, unaudited. */
  raced: number;
  /** Rows whose move could not be audited and were taken back, or whose write threw (R3-3). */
  failed: number;
  /** Rows whose walk hit the step cap and were left alone (R3-5). */
  capped: number;
}

export interface RolloverResult extends RolloverCounts {
  /** Ongoing projects visited (whether or not any row moved). */
  projects: number;
}

/** Why a project's pass was skipped whole (R3-1) — carried in its sync_runs stats. */
export type SkipReason = 'sync_missing' | 'sync_failed' | 'sync_stale';

const zero = (): RolloverCounts => ({ moved: 0, skipped: 0, raced: 0, failed: 0, capped: 0 });

/**
 * The first start day, walking forward one WORKING day at a time from
 * `startsOn`, whose finish is on or after `today` — `startsOn` itself when it
 * already is. Pure: the finish is whatever `finishOf` says, so the caller
 * hands in the engine bound to the card and the project's model.
 *
 * `>=`, not `>`: a card whose finish IS today is not late — the day is still
 * running in Manila — and must not move. Date-only strings compare as dates.
 *
 * The step is `workday(d, 1)` from lib/calendar.ts (invariant 11: no other
 * date arithmetic anywhere), which skips weekends and the ACTIVE holiday set —
 * so a Friday finish seen on Saturday lands on Monday, and a holiday is
 * stepped over the same way the finish itself steps over it. `parseDate`
 * first: a raw string through `new Date()` is UTC midnight and starts the
 * walk a day early west of UTC (the defect `finishOf` once had; its header
 * tells the story).
 *
 * Null when there is no finish to compare (no difficulty → no design cell),
 * and null when `cap` steps did not reach today. The cap guards against a
 * broken finish, it is not a feature: the engine's finish is monotone in the
 * start and strictly after it, so a real walk ends within the working days
 * between the finish and today, and four hundred of those is over a year and
 * a half of downtime. Past the cap a PARTIAL move would write a date that is
 * still wrong and repeat itself next tick, so the answer is "do not move",
 * which the caller reads as null.
 */
export function nextFinishDay(
  startsOn: string,
  finishOf: (s: string) => string | null,
  today: string,
  cap = 400,
): string | null {
  let day = startsOn;
  for (let steps = 0; steps <= cap; steps++) {
    const finish = finishOf(day);
    if (finish === null) return null;
    if (finish >= today) return day;
    day = localIso(workday(parseDate(day), 1));
  }
  return null;
}

/**
 * The sprint whose date range holds `day`, inclusive at both ends, or null.
 * Overlapping sprints are rejected on save (invariant 12), so at most one can
 * match and the first hit is the answer; gaps between sprints are legal and
 * yield null — the caller leaves the row listed where it is.
 */
export function sprintFor(
  day: string,
  sprints: Array<{ id: string; starts_on: string; ends_on: string }>,
): string | null {
  const hit = sprints.find((s) => s.starts_on <= day && day <= s.ends_on);
  return hit ? hit.id : null;
}

/**
 * Roll every late row of every ongoing project forward (see the header).
 * `today` defaults to the Manila calendar day; passing one is for tests and
 * for a deliberate dry pass against a local copy. `projectId` narrows the
 * ongoing set to one project — it does not lift the ongoing requirement, and
 * it does not lift the sync gate (R3-1).
 *
 * Idempotent: a second pass with the same `today` moves nothing and audits
 * nothing. Catch-up after downtime is one pass: the walk runs to today, not
 * one step per tick. Never rejects on a project's account: each project's
 * pass is guarded and recorded in `sync_runs` (R3-3, R5-6).
 */
export async function rollUnfinished(
  opts: { today?: string; projectId?: Types.ObjectId } = {},
): Promise<RolloverResult> {
  const today = opts.today ?? manilaToday();
  /* One clock reading for the whole run: the freshness gate (R3-1) is
     "relative to the run", so every project is measured against the same
     instant, not against however long the earlier projects took. */
  const now = new Date();
  const projects = await Project.find({
    status: 'ongoing',
    ...(opts.projectId ? { _id: opts.projectId } : {}),
  })
    .select({ _id: 1 })
    .lean();
  const total: RolloverResult = { projects: projects.length, ...zero() };
  /* Sequential on purpose: the tail-position read below must see the rows an
     earlier iteration has already written into the same sprint. */
  for (const p of projects) {
    const counts = await rollProject(p._id, today, now);
    total.moved += counts.moved;
    total.skipped += counts.skipped;
    total.raced += counts.raced;
    total.failed += counts.failed;
    total.capped += counts.capped;
  }
  return total;
}

/**
 * R3-1: the project's latest ARES read, judged. Null means "fresh success —
 * roll"; otherwise the reason the project sits this tick out. The LATEST row
 * of any outcome, not the latest success: a failure after a success is the
 * current state of the read, and a stale lane set must not be rolled on.
 */
async function syncGate(projectId: Types.ObjectId, now: Date): Promise<SkipReason | null> {
  const last = await SyncRun.findOne({ project_id: projectId, source: { $in: ['ares', 'ares_push'] } })
    .sort({ at: -1 })
    .select({ ok: 1, at: 1 })
    .lean();
  if (!last) return 'sync_missing';
  if (!last.ok) return 'sync_failed';
  if (now.getTime() - last.at.getTime() > SYNC_FRESH_MS) return 'sync_stale';
  return null;
}

/**
 * One project's pass, guarded whole (R3-3) and recorded whole (R5-6). The
 * counts are returned to the caller AND written to `sync_runs`; `ok` is
 * false only when the pass threw outside the per-row guard — a read failed
 * before any row was reached — and the message goes with it. A gated project
 * still gets its row (ok, with the reason), so a reader of `sync_runs` sees
 * the tick happened and why nothing moved.
 */
async function rollProject(projectId: Types.ObjectId, today: string, now: Date): Promise<RolloverCounts> {
  const counts = zero();
  let reason: SkipReason | null = null;
  let error: string | undefined;
  try {
    reason = await syncGate(projectId, now);
    if (reason !== null) {
      // R3-1: the rows this tick would have looked at, left exactly as they are
      counts.skipped = await SprintItem.countDocuments({ project_id: projectId, starts_on: { $ne: null } });
    } else {
      await rollRows(projectId, today, counts);
    }
  } catch (err) {
    error = (err as Error).message;
    console.error(`[rollover] ${String(projectId)} failed: ${error}`);
  }
  try {
    await SyncRun.create({
      project_id: projectId,
      source: 'rollover',
      ok: error === undefined,
      stats: { ...counts, ...(reason !== null ? { reason } : {}) },
      ...(error !== undefined ? { error } : {}),
    });
  } catch (err) {
    /* The record failing must not take the other projects with it (R3-3);
       the log line is the record then. */
    console.error(`[rollover] ${String(projectId)} sync_runs write failed: ${(err as Error).message}`);
  }
  return counts;
}

/** One row's outcome, in the vocabulary of the counts; null = nothing to do. */
type RowOutcome = 'moved' | 'raced' | 'capped' | null;

async function rollRows(projectId: Types.ObjectId, today: string, counts: RolloverCounts): Promise<void> {
  /* Plotted rows only. `$ne: null` excludes both an explicit null and an
     absent field (un-plotting unsets it). Position order with the `_id`
     tiebreak — the order the schedule reads — so two rows rolling into one
     sprint in a single pass take tail positions in list order. Lean: the
     write below is a conditional update keyed on these values (R3-2), never
     a save of this snapshot. */
  const items = await SprintItem.find({ project_id: projectId, starts_on: { $ne: null } })
    .sort({ position: 1, _id: 1 })
    .lean();
  if (items.length === 0) return;

  /* The project's model — frozen projects read the shipped snapshot, which is
     what the schedule's own bars are drawn from (loadProjectModel decides,
     not this file). Active cards only: a deactivated card has left the board
     and its row keeps its place with no bar (#72 §5). */
  const [{ model }, cards, sprints] = await Promise.all([
    loadProjectModel(projectId),
    WorkCard.find({ project_id: projectId, active: true }).lean(),
    Sprint.find({ project_id: projectId }).lean(),
  ]);
  const byId = new Map(cards.map((w) => [w.trello_card_id, w] as const));
  const ranges = sprints.map((s) => ({ id: String(s._id), starts_on: s.starts_on, ends_on: s.ends_on }));

  for (const it of items) {
    const w = byId.get(it.trello_card_id);
    if (!w) continue; // card gone — no finish, nothing to move (B2)
    if (!w.difficulty) continue; // no label → no design cell → no finish (B2)
    if (classifyList(w.current_list) === 'done') continue; // a done card does not roll (#75 §3)

    /* R3-3: per-row guard. A throw here — the update itself, the audit, the
       revert — is this row's failure and nobody else's: counted, logged,
       and the pass goes on to the next row. */
    try {
      const outcome = await rollRow(projectId, it, w, model, ranges, today);
      if (outcome !== null) counts[outcome]++;
    } catch (err) {
      counts.failed++;
      console.error(`[rollover] ${String(projectId)}/${String(it._id)} failed: ${(err as Error).message}`);
    }
  }
}

async function rollRow(
  projectId: Types.ObjectId,
  it: { _id: Types.ObjectId; starts_on?: string | null; sprint_id: Types.ObjectId; position: number },
  w: Parameters<typeof finishOf>[0],
  model: Parameters<typeof finishOf>[2],
  ranges: Array<{ id: string; starts_on: string; ends_on: string }>,
  today: string,
): Promise<RowOutcome> {
  const startsOn = it.starts_on as string;
  const engine = (s: string) => finishOf(w, s, model);
  /* `nextFinishDay` answers null for two different reasons — no finish at
     all, and a walk that hit the cap. The first is settled here, before the
     walk, so the null the walk returns can only be the cap (R3-5: today's
     silent continue becomes a count). By construction the difficulty guard
     above makes this branch unreachable — typed, not trusted. */
  if (engine(startsOn) === null) return null;
  const next = nextFinishDay(startsOn, engine, today);
  if (next === null) return 'capped'; // do not move; the count is the operator's signal
  if (next === startsOn) return null; // not late: no write, no audit

  /* Re-read rather than threaded out of the walk: `nextFinishDay` returned
     this day BECAUSE the engine gave it a finish on or after today, so the
     null branch is unreachable by construction — typed, not trusted. */
  const finish = engine(next);
  if (finish === null) return null;

  const before = { starts_on: startsOn, sprint_id: String(it.sprint_id), position: it.position };

  /* Membership follows the FINISH day (#75 §2: "sprint membership follows").
     A different sprint takes that list's TAIL position — the PATCH route's
     rule, for the PATCH route's reason: carrying the old position across
     lets the row tie with one already there, and the load sorts on
     position, so the two would swap places between reads. The same sprint
     keeps the row's position — and is not written at all, so a PM's
     reorder in the window is never clobbered (R3-2); no covering sprint
     keeps the row where it is listed. */
  const target = sprintFor(finish, ranges);
  const moves = target !== null && target !== before.sprint_id;
  let position = before.position;
  if (moves) {
    const tail = await SprintItem.findOne({ project_id: projectId, sprint_id: target })
      .sort({ position: -1 })
      .select({ position: 1 })
      .lean();
    position = ((tail?.position as number) ?? -1) + 1;
  }
  const after = { starts_on: next, sprint_id: moves ? (target as string) : before.sprint_id, position };

  /* R3-2: ONE conditional update. The row moves only if it still reads
     exactly what this pass read — `starts_on` and `sprint_id` — so a plot,
     un-plot or delete made between the read above and this write leaves
     `matchedCount` at 0 and the row untouched: no audit, counted `raced`,
     re-evaluated next tick from its new state. */
  const res = await SprintItem.updateOne(
    { _id: it._id, project_id: projectId, starts_on: before.starts_on, sprint_id: new Types.ObjectId(before.sprint_id) },
    {
      $set: {
        starts_on: after.starts_on,
        ...(moves ? { sprint_id: new Types.ObjectId(after.sprint_id), position: after.position } : {}),
      },
    },
    { runValidators: true },
  );
  if (res.matchedCount === 0) return 'raced';

  try {
    await audit({
      project_id: projectId,
      actor: 'system',
      action: 'sprintItem.rollover',
      entity: 'sprint_item',
      entity_id: String(it._id),
      before: { starts_on: before.starts_on, sprint_id: before.sprint_id },
      after: { starts_on: after.starts_on, sprint_id: after.sprint_id },
    });
  } catch (err) {
    /* R3-3: audit-or-revert. The move landed but its record did not, and a
       state change without its audit row is what invariant 10 forbids — so
       the row goes back, by the same conditional shape keyed on the NEW
       values (all three, so nothing a PM wrote since is undone). The row is
       then this pass's `failed`, and the next tick moves it again, audited. */
    await SprintItem.updateOne(
      {
        _id: it._id,
        project_id: projectId,
        starts_on: after.starts_on,
        sprint_id: new Types.ObjectId(after.sprint_id),
        position: after.position,
      },
      { $set: { starts_on: before.starts_on, sprint_id: new Types.ObjectId(before.sprint_id), position: before.position } },
      { runValidators: true },
    );
    throw err;
  }
  return 'moved';
}
