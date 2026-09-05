/**
 * Rollover — the ONE thing that moves a plotted row on its own.
 *
 * Owl miles→jp #75 §2: an unfinished work card slated for a day moves to the
 * next day by itself, crossing weeks AND sprints; sprint membership follows
 * it; the bar translates whole; no marker, no stopping condition. jp→miles
 * #59 §3 (JP 2026-08-28): audit rows yes, UI marker no. PLAN.md B10 (block 3,
 * 2026-09-05) fixes the shape below; drift rows 19, 27, 28, 46.
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
 * WHY AFTER THE SYNC, NOT BEFORE. The worker calls this at the end of a
 * SUCCESSFUL `aresTick`. The sync is what tells Sirius a card went done in
 * Trello, and a done card is skipped here (#75 §3: a done card does not
 * roll) — so reading the board first means a card finished over the weekend
 * is seen as done before Saturday's tick would have rolled it to Monday.
 * Rolling first would move a card that was already finished, and the audit
 * row would say so forever. A failed or skipped sync runs no rollover at all,
 * for the same reason: stale lanes would roll cards the board has finished.
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
 * WHAT IT WRITES. `sprint_items` and `audit_log` only — Sirius-owned planning
 * data, the same class as `slotted_week` and pins. Nothing reaches Trello or
 * the sheet (invariant 2), so `writes_enabled` — which gates the three-entry
 * Trello registry alone — does not gate this, and a read-only project's
 * schedule rolls like any other.
 */

import { Types } from 'mongoose';
import { localIso, parseDate, workday } from '../../lib/calendar.ts';
import { Project, Sprint, SprintItem, WorkCard } from '../models/index.ts';
import { audit } from './audit.ts';
import { loadProjectModel } from './model-grid.ts';
import { manilaToday } from './pipeline.ts';
import { finishOf } from './sprint-items.ts';
import { classifyList } from './status-rules.ts';

export interface RolloverResult {
  /** Ongoing projects visited (whether or not any row moved). */
  projects: number;
  /** Rows whose `starts_on` changed — one audit row each. */
  moved: number;
}

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
 * ongoing set to one project — it does not lift the ongoing requirement.
 *
 * Idempotent: a second pass with the same `today` moves nothing and audits
 * nothing. Catch-up after downtime is one pass: the walk runs to today, not
 * one step per tick.
 */
export async function rollUnfinished(
  opts: { today?: string; projectId?: Types.ObjectId } = {},
): Promise<RolloverResult> {
  const today = opts.today ?? manilaToday();
  const projects = await Project.find({
    status: 'ongoing',
    ...(opts.projectId ? { _id: opts.projectId } : {}),
  })
    .select({ _id: 1 })
    .lean();
  let moved = 0;
  /* Sequential on purpose: the tail-position read below must see the rows an
     earlier iteration has already saved into the same sprint. */
  for (const p of projects) moved += await rollProject(p._id, today);
  return { projects: projects.length, moved };
}

async function rollProject(projectId: Types.ObjectId, today: string): Promise<number> {
  /* Plotted rows only. `$ne: null` excludes both an explicit null and an
     absent field (un-plotting unsets it). Position order with the `_id`
     tiebreak — the order the schedule reads — so two rows rolling into one
     sprint in a single pass take tail positions in list order. */
  const items = await SprintItem.find({ project_id: projectId, starts_on: { $ne: null } }).sort({
    position: 1,
    _id: 1,
  });
  if (items.length === 0) return 0;

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

  let moved = 0;
  for (const it of items) {
    const w = byId.get(it.trello_card_id);
    if (!w) continue; // card gone — no finish, nothing to move (B2)
    if (!w.difficulty) continue; // no label → no design cell → no finish (B2)
    if (classifyList(w.current_list) === 'done') continue; // a done card does not roll (#75 §3)

    const startsOn = it.starts_on as string;
    const next = nextFinishDay(startsOn, (s) => finishOf(w, s, model), today);
    if (next === null || next === startsOn) continue; // not late, or nothing computable: no write, no audit

    /* Re-read rather than threaded out of the walk: `nextFinishDay` returned
       this day BECAUSE the engine gave it a finish on or after today, so the
       null branch is unreachable by construction — typed, not trusted. */
    const finish = finishOf(w, next, model);
    if (finish === null) continue;

    const before = { starts_on: startsOn, sprint_id: String(it.sprint_id) };
    it.starts_on = next;

    /* Membership follows the FINISH day (#75 §2: "sprint membership follows").
       A different sprint takes that list's TAIL position — the PATCH route's
       rule, for the PATCH route's reason: carrying the old position across
       lets the row tie with one already there, and the load sorts on
       position, so the two would swap places between reads. The same sprint
       keeps the row's position; no covering sprint keeps the row where it is
       listed. */
    const target = sprintFor(finish, ranges);
    if (target !== null && target !== before.sprint_id) {
      const tail = await SprintItem.findOne({ project_id: projectId, sprint_id: target })
        .sort({ position: -1 })
        .select({ position: 1 })
        .lean();
      it.sprint_id = new Types.ObjectId(target);
      it.position = ((tail?.position as number) ?? -1) + 1;
    }
    await it.save();
    await audit({
      project_id: projectId,
      actor: 'system',
      action: 'sprintItem.rollover',
      entity: 'sprint_item',
      entity_id: String(it._id),
      before,
      after: { starts_on: it.starts_on ?? null, sprint_id: String(it.sprint_id) },
    });
    moved++;
  }
  return moved;
}
