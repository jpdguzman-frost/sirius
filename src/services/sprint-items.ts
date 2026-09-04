/**
 * Sprint Schedules — the scheduled rows. THE UNIT IS THE WORK CARD.
 *
 * Owl miles→jp #72 replaced the deliverable row with the Trello task card:
 * one row = one task card = one bar, so Sketch and Render are separate rows
 * rather than two segments of one. BRD v2.7 records it; BR-1a records the
 * consequence — BR-1's "render begins the Friday of the sketch-approval week"
 * no longer governs PLACEMENT. BR-1 still supplies each bar's right-hand end.
 *
 * THREE RULES THIS FILE EXISTS TO KEEP, all from #72:
 *
 *  1. **Nothing is auto-populated.** Rows come from `sprint_items`, which only
 *     the PM writes. This module NEVER reads the board and fills gaps. Every
 *     other surface in Sirius reconciles against Trello — 478 cards, the
 *     UNATTACHED tile, coverage counts — so an empty schedule looks like a
 *     failed sync and is not. If you are about to add a "missing cards"
 *     warning here, that is the thing #72 asks twice for nobody to build.
 *  2. **Every row is placed by hand, including render.** No cascade, no
 *     auto-follow, no ghost placement off a sketch's forecast finish.
 *  3. **The filter governs what can be ADDED, never what is REMOVED.** A card
 *     that completes after being scheduled STAYS. Nothing here deletes a row
 *     on the strength of a card's status.
 *
 * The finish is COMPUTED and the start is the PM's click (#72 §6). If the bar
 * and the FORECASTED column can ever disagree, something is wrong — so both
 * read the one `finish` this module returns.
 */

import { Types } from 'mongoose';
import { localIso } from '../../lib/calendar.ts';
import { forecast } from '../../lib/forecast.ts';
import type { EmpiricalModel } from '../../lib/model.ts';
import { SprintItem } from '../models/index.ts';
import { classifyList } from './status-rules.ts';
import type { PipelineRow, WorkCardDoc } from './pipeline.ts';

/** One scheduled row as the Sprint Schedules tab consumes it. */
export interface SprintItemRow {
  /** The `sprint_items` document id — the handle for plot / move / remove. */
  id: string;
  /** Which sprint's LIST the row appears under (#72 §4: the + carries meaning). */
  sprintId: string;
  mcNumber: string;
  /** The WORK CARD's Trello id. Identity is (project, card) — invariant 3. */
  cardId: string;
  name: string;
  taskPrefix: string | null;
  difficulty: string | null;
  currentList: string | null;
  /** `null` when the work card has left the board — absent is not 'ongoing'. */
  status: string | null;
  trelloUrl: string | null;
  /**
   * THIS card carries the `Urgent` label (owl #78, 2026-09-05). Not the MC
   * group's — see the note at the `rows` map. False when the card has left
   * the board: an absent card asserts nothing.
   */
  urgent: boolean;
  /**
   * The PM's click, or null. Null is a REAL state, not missing data: a row is
   * added to a sprint list and plotted in two separate acts (#72 §6), and an
   * unplotted row shows in the list with no bar and the violet + waiting.
   * Deadlines excludes it entirely until it has one (#74 §1).
   */
  startsOn: string | null;
  /**
   * BR-1's right-hand end: `WORKDAY(start, lead + design)`. Null when the row
   * is unplotted, or when the card carries no difficulty label and the design
   * cell cannot be keyed. The bar and the FORECASTED column both read this.
   */
  finish: string | null;
  /** The client date this row is measured against — see `deadlineFor`. */
  deadline: string | null;
  /**
   * The work runs past the client date (JP ruling 2026-08-27). The review wait
   * is NOT in it — see `workFinishOf` in pipeline.ts for why. False whenever
   * either date is absent: no deadline is no conflict (BR-9).
   */
  late: boolean;
  position: number;
}

export interface SprintItemsResult {
  rows: SprintItemRow[];
  /**
   * What the Work Card dropdown may offer, by MC number (#72 §5). A card
   * already complete is never offered, and neither is one already scheduled —
   * one row per card. This is an ADD-time filter and says nothing about the
   * rows above: a row whose card completed later stays in `rows`.
   */
  addable: Record<string, Array<{ cardId: string; name: string; taskPrefix: string | null }>>;
}

/**
 * The lane classifier's inputs for a TASK card: its LIST, and nothing else.
 *
 * `task_prefix` was fed in as a label at first, on the reasoning that it is the
 * same kind of text `laneOf` classifies. It is not, and the effect was severe:
 * `laneOf` matches `/asset|illustrat|render|icon/`, and EVERY task prefix the
 * board actually uses — 'Sketch Asset', 'Render Asset', 'Icon Clean Up' —
 * matches it. So the lane was `assets` for every task card regardless of the
 * work, which for an Easy card selects a 13.88-day design cell instead of a
 * 0.94-day one. A fourteen-fold difference chosen by a title convention.
 *
 * The list is a fact about where the card sits on the board; the title prefix
 * is a naming habit. Classifying on the list alone is the same signal the main
 * card is classified on, minus labels a task card does not have.
 *
 * KNOWN RESIDUAL, raised not solved: a task card's list can still classify
 * differently from its MC's main card, so a bar here and the Pipeline forecast
 * for the same MC can key off different cells. They are different units — one
 * phase against a whole deliverable — so some divergence is inherent, but which
 * lane a TASK belongs to is a product question nobody has ruled.
 */
const laneInputs = (w: { current_list?: string | null }) => ({
  currentList: w.current_list ?? '',
  labels: [] as string[],
});

/**
 * One bar's finish: `lead + design` for the card's own difficulty × lane,
 * counted on the working-day calendar. Review is deliberately absent — this is
 * ONE phase, and the wait between phases belongs to neither of them, which is
 * the whole reason #72 split the row in two.
 *
 * THE ENGINE COMPUTES IT, we only read it. `sketchDelivery` is precisely
 * `WORKDAY(start, lead + design)` (`lib/forecast.ts:70`), so calling `forecast`
 * and taking that one field is the same number the Pipeline forecast is built
 * from rather than a second derivation of it. It is read for a RENDER row too:
 * the engine's render lead and render design equal the sketch pair by
 * construction, and its own note says the four fields are read separately so
 * the day they stop being equal the tables show it.
 *
 * Written the short way first — `workday(startsOn, 0.5 + designCell(...))` —
 * and that was wrong twice over. It transcribed the engine's `0.5` lead, so a
 * change there would have moved the Pipeline warning and left these bars
 * behind while the file's own header promised the two can never disagree; and
 * it handed `workday` a RAW STRING, which `new Date()` reads as UTC midnight.
 * West of UTC that starts the walk a day early: verified `2026-08-04` against
 * `2026-08-05` under `America/New_York`. The dual-TZ suite runs UTC and Manila,
 * both at or ahead of UTC, so nothing in CI could ever have caught it.
 * `forecast` parses with `parseDate` (local midnight) as every other caller in
 * the repo does.
 *
 * CONFIDENCE: the caller passes none, so every bar is drawn at the engine's
 * default percentile. Deliberate but NOT ruled — confidence is a per-deliverable
 * field and the unit here is a task card, which has none; taking the MC group's
 * would need a rule for a group that disagrees with itself, exactly as the
 * deadline below does. Raised to product rather than guessed at.
 */
export function finishOf(
  card: { difficulty?: string | null; current_list?: string | null; task_prefix?: string | null },
  startsOn: string,
  model: EmpiricalModel,
  confidence?: string,
): string | null {
  if (!card.difficulty) return null; // no label → no design cell → nothing to draw
  const f = forecast(
    { difficulty: card.difficulty, ...laneInputs(card), startDate: startsOn, confidence },
    model,
  );
  return localIso(f.sketchDelivery);
}

/**
 * The client date a task card is measured against.
 *
 * Precedence mirrors invariant 14's shape, one level down: the card's OWN
 * Trello due date wins where present (task cards are W2-writable — JP
 * 2026-08-18), else the MC group's.
 *
 * **The MC's date is the EARLIEST among its deliverables, and that is a
 * judgement.** `mc_number` is not a key (invariant 3) — MC-825 carries 99
 * deliverables — and a task attaches to the GROUP, never to one of them
 * (invariant 4), so there is no single correct date to inherit. Earliest is
 * the binding one: miss it and something under that MC is late. Reversible in
 * one line if product wants latest, or wants the row to show no date at all
 * when the group disagrees.
 */
function deadlineFor(
  card: { trello_due?: string | null } | undefined,
  mcNumber: string,
  mcDeadline: Map<string, string>,
): string | null {
  return card?.trello_due ?? mcDeadline.get(mcNumber) ?? null;
}

/**
 * ONE query. The work cards and the deliverable rows are handed in by
 * `loadPipeline`, which has just read both.
 *
 * It fetched them itself at first, with `WorkCard.find({project_id, active})`
 * byte-identical to the caller's own line and a `Deliverable.find` re-reading
 * what the caller already had as `rows`. That cost ~478 extra documents per
 * call — doubled in practice, because the client fires `/deliverables` and
 * `/deadlines` in one `Promise.all` and both go through `loadPipeline`.
 *
 * Taking `rows` rather than raw deliverables also removes a second spelling of
 * BR-9: `rows[].deadline` is resolved by the `deliverables_v` view, which
 * invariant 14 names as the ONE home for "Trello due wins, else the sheet".
 * The re-derivation here was a fourth copy of that rule.
 */
export async function loadSprintItems(
  projectId: Types.ObjectId,
  model: EmpiricalModel,
  workCards: WorkCardDoc[],
  deliverableRows: PipelineRow[],
): Promise<SprintItemsResult> {
  /* `_id` breaks a `position` tie. Ties are possible — two concurrent adds to
     one sprint both read the same tail position, and a move between sprints
     carries its old position across — and without a tiebreaker the two rows
     swap places between requests, so the list appears to shuffle on refresh. */
  const items = await SprintItem.find({ project_id: projectId }).sort({ position: 1, _id: 1 }).lean();

  /* Earliest client date per MC group — see `deadlineFor` for why earliest. */
  const mcDeadline = new Map<string, string>();
  for (const d of deliverableRows) {
    if (!d.mcNumber || !d.deadline) continue;
    const held = mcDeadline.get(d.mcNumber);
    if (!held || d.deadline < held) mcDeadline.set(d.mcNumber, d.deadline);
  }

  const byId = new Map(workCards.map((w) => [w.trello_card_id as string, w]));

  /* A scheduled row whose work card has gone from the board keeps its place in
     the list rather than vanishing — the schedule is the record of what was
     planned (#72 §5), and a card can be archived in Trello after being
     scheduled. It renders with what the row itself carries and no bar. */
  const rows: SprintItemRow[] = items.map((it) => {
    const w = byId.get(it.trello_card_id as string);
    const startsOn = (it.starts_on as string | null) ?? null;
    const finish = w && startsOn ? finishOf(w, startsOn, model) : null;
    /* THE ROW'S OWN `mc_number`, not the card's current one. They can differ:
       the row snapshots the group at add time and the sync follows the card, so
       a card re-titled into another MC in Trello would otherwise be grouped
       under one MC while being measured against another's client date. One
       source for identity and deadline, whichever it is. */
    const deadline = deadlineFor(w, it.mc_number as string, mcDeadline);
    return {
      id: String(it._id),
      sprintId: String(it.sprint_id),
      mcNumber: it.mc_number as string,
      cardId: it.trello_card_id as string,
      name: (w?.name as string) ?? it.trello_card_id as string,
      taskPrefix: (w?.task_prefix as string) ?? null,
      difficulty: (w?.difficulty as string) ?? null,
      currentList: (w?.current_list as string) ?? null,
      /* `null`, not `classifyList(undefined)` — that falls through to
         'ongoing', so a row whose card has left the board rendered an active
         status chip beside a null list, a null bar and no name. Absent is its
         own state and the UI must be able to say so. */
      status: w ? classifyList(w.current_list as string | undefined) : null,
      trelloUrl: (w?.trello_url as string) ?? null,
      /* THE CARD'S OWN label (owl #78, 2026-09-05), and nothing inherited.
         This retired the #58 judgement, which took the MC group's urgency —
         "any urgent main card under the MC makes the group urgent" — on the
         reasoning that task cards carry no labels. They do now: a website
         request can hold an urgent screen and non-urgent assets, so the
         group's value cannot be true of each row. Unlike the deadline just
         above there is NO fallback to the group: an absent card, or a card
         without the label, is simply not urgent. */
      urgent: w?.urgency === 'Urgent',
      startsOn,
      finish,
      deadline,
      late: Boolean(finish && deadline && finish > deadline),
      position: it.position as number,
    };
  });

  /* THE ADD-TIME FILTER (#72 §5). Two rules that look alike and are not: a
     complete card is never OFFERED, and a card that completes after being
     scheduled STAYS. Only the first is expressed here — `rows` above is built
     from `sprint_items` alone and consults no status at all. */
  const scheduled = new Set(items.map((it) => it.trello_card_id as string));
  const addable: SprintItemsResult['addable'] = {};
  for (const w of workCards) {
    if (scheduled.has(w.trello_card_id as string)) continue; // one row per card
    if (classifyList(w.current_list as string | undefined) === 'done') continue;
    const mc = w.mc_number as string;
    (addable[mc] ??= []).push({
      cardId: w.trello_card_id as string,
      name: w.name as string,
      taskPrefix: (w.task_prefix as string) ?? null,
    });
  }
  /* Alphabetical ascending by the full card label — Miles's rule, explicitly
     PROVISIONAL (#73), so it is sorted here in one line rather than baked into
     the query or the component. Be aware what it yields: "Render" sorts before
     "Sketch", so a list reads Render, Render, Render, Sketch, Sketch, Sketch —
     phases grouped but render leading, the reverse of the order work happens
     in. That is the correct output of the rule as stated. */
  for (const mc of Object.keys(addable)) addable[mc]!.sort((a, b) => a.name.localeCompare(b.name));

  return { rows, addable };
}
