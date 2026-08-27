/**
 * Pipeline assembler — one place that turns db rows into what the five tabs
 * consume: deliverables (via deliverables_v so BR-9 precedence is the
 * database's, invariant 14) + forecast dates from the per-project model +
 * BR-10 status. Lean queries; the 5,000-card envelope is NFR-1's target.
 */

import mongoose, { Types } from 'mongoose';
import { localIso, parseDate, workday } from '../../lib/calendar.ts';
import { forecast, type Forecast } from '../../lib/forecast.ts';
import type { EmpiricalModel } from '../../lib/model.ts';
import { HARD_MIX } from '../../lib/planner.constants.ts';
import { loadProjectModel } from './model-grid.ts';
import { classifyList } from './status-rules.ts';
import { WorkCard } from '../models/index.ts';
import type { Milestone } from './conflicts.ts';
import { loadSprintItems, type SprintItemsResult } from './sprint-items.ts';

/** What a caller that did not ask for sprint items gets — never undefined, so
    the payload shape is one shape and the client never branches on presence.
    A FRESH object each time: a single shared module-level instance would be
    handed by reference to every non-opting caller, so one future `rows.push`
    would poison the "empty" value for the rest of the process. */
const emptySprintItems = (): SprintItemsResult => ({ rows: [], addable: {} });

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* Invariant 11: raw instants convert to MANILA calendar days regardless of
   the host timezone (en-CA gives YYYY-MM-DD). */
const MANILA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const manilaDate = (d: Date): string => MANILA_DAY.format(d);
export const manilaToday = (): string => MANILA_DAY.format(new Date());

const mondayOf = (d: Date) => {
  const t = new Date(d);
  const day = t.getDay() === 0 ? 7 : t.getDay();
  t.setDate(t.getDate() - (day - 1));
  return localDate(t);
};

/** Gantt segment kinds. `renderOverdue` is `render` drawn late (BR-9). */
export type PlannerPhaseName = 'sketch' | 'review' | 'render' | 'renderOverdue';

export interface PlannerPhase {
  phase: PlannerPhaseName;
  /** 'YYYY-MM-DD', INCLUSIVE first day. Always a Mon–Fri Manila calendar day. */
  startIso: string;
  /** 'YYYY-MM-DD', EXCLUSIVE — the first day NOT covered. Always a Mon–Fri day. */
  endIso: string;
}

/** One capacity-footer column. Absent from `perWeek` entirely when the week is empty. */
export interface PlannerWeekTotal {
  /** Σ row.weight — BR-6c card-equivalents. Rounded to 3 decimals. */
  cards: number;
  /** plain row count in the week */
  rows: number;
  /** rows whose difficulty === 'Hard' */
  hard: number;
  /** hard / rows; 0 when rows === 0 */
  hardShare: number;
  /** cards > the project's weekly_capacity (BR-6a) */
  over: boolean;
  /** hardShare > HARD_MIX.ceiling (BR-6b) */
  hardOver: boolean;
  /** hardShare > HARD_MIX.ideal && hardShare <= HARD_MIX.ceiling */
  hardWarn: boolean;
}

export interface PipelineRow {
  cardId: string;
  displayId: string;
  /** Bare MC number for the table cell; display_id where the card has none. */
  mcLabel: string;
  mcNumber: string | null;
  name: string;
  currentList: string | null;
  status: 'pending' | 'ongoing' | 'done';
  statusNote: string | null;
  difficulty: string | null;
  lane: string | null;
  urgency: string;
  blocker: string | null;
  requestor: string | null;
  assetType: string | null; // FR-4.1 type, sheet-joined
  /** Figma 431:17015/17016 — Manila day of THIS card's own span; Ts keeps the raw instant for the tooltip. */
  workStarted: string | null;
  workDone: string | null;
  workStartedTs: string | null;
  workDoneTs: string | null;
  deadline: string | null;
  deadlineSource: string | null;
  overdue: boolean; // deadline < today, computed where deadline lives (one 'today' in the system)
  trelloDue: string | null;
  /**
   * The Trello card's own creation instant — the table's NATURAL order
   * ("by order of filing, most recently ingested first", owl #62). ISO, not a
   * day string: two cards filed on one day still have an order. Null until the
   * card has been re-read after migration 008, and a null sorts LAST like
   * every other empty.
   */
  filedAt: string | null;
  trelloUrl: string | null;
  figmaUrl: string | null;
  slottedWeek: string | null;
  pinned: boolean;
  confidence: string;
  slaSketch: number | null;
  slaRender: number | null;
  /** BR-6c: card-equivalents — 1 + (MC group's work cards ÷ group's deliverables); 1 outside any group. */
  weight: number;
  /** Gantt bar segments, absolute dates. [] when the row is unslotted or unforecastable. */
  phases: PlannerPhase[];
  /**
   * The WHOLE `Forecast` the engine returns, four dates flattened to local
   * calendar days, plus `startDate` (the day the forecast was actually keyed
   * on — `slotted_week` where there is one, else today, and the caller cannot
   * tell which without being told) and `late` (BR-9, not an engine field).
   *
   * Carrying all of it is R-fc-u: eleven fields used to be dropped here, which
   * is why six of build-spec §7.2's columns had no data and why the Forecast
   * template retyped `sketchReview * 2` — `lib/forecast.ts`'s own
   * `baselineReview` formula — into markup. Nothing is recomputed in the
   * browser (invariants 5-7); the engine is the only place forecast arithmetic
   * happens, so every column it feeds must come off this projection.
   */
  forecast: (Omit<Forecast, 'sketchDelivery' | 'sketchApproved' | 'renderDelivery' | 'renderApproved'> & {
    sketchDelivery: string;
    sketchApproved: string;
    renderDelivery: string;
    renderApproved: string;
    startDate: string;
    /**
     * The day the WORK finishes with no client-review wait in it — what
     * `late` is measured against since the 2026-08-27 ruling. Carried
     * alongside the four forecast dates rather than replacing any of them:
     * those still include review and still drive the bars, so the two
     * questions stay visibly separate. See `workFinishOf`.
     */
    workFinish: string;
    late: boolean;
  }) | null;
  missing: string[];
}

/**
 * A work card as it comes back from `WorkCard.find().lean()` — the raw mirror
 * document, not the wire shape below. Exported so `loadSprintItems` can be
 * handed the array this module has already read rather than reading it again.
 */
const loadWorkCards = (projectId: Types.ObjectId) =>
  WorkCard.find({ project_id: projectId, active: true }).lean();

export type WorkCardDoc = Awaited<ReturnType<typeof loadWorkCards>>[number];

/** A task card as the Pipeline wire carries it (owl #45 — the expanded MC row). */
export interface WorkCardWire {
  cardId: string;
  name: string;
  taskPrefix: string | null;
  currentList: string | null;
  status: string;
  trelloUrl: string | null;
  figmaUrl: string | null;
  due: string | null;
  /** parity with the parent row's recipe (R-exp-b): amber dress past due */
  overdue: boolean;
  started: string | null;
  startedTs: string | null;
  done: string | null;
  doneTs: string | null;
}

export interface PipelineResult {
  rows: PipelineRow[];
  workCardsByMc: Record<string, WorkCardWire[]>;
  /**
   * How many deliverable rows share each MC number (owl #52). `mc_number` is
   * NOT a key (invariant 3) — 19 of the real board's 37 MC numbers carry more
   * than one main card, one carries 60 — so an MC's task list can only be
   * attributed to a single deliverable when this count is exactly 1. Above 1
   * the client must surface the tasks once, at MC level, marked as shared:
   * a misattributed task is indistinguishable from a correct one, whereas an
   * honestly shared one is not. Measured board-wide: 279 of 356 task cards
   * (78.4%) sit under an ambiguous MC, so this is the COMMON case.
   */
  mcDeliverables: Record<string, number>;
  /**
   * Work cards whose MC number has NO deliverable row (owl #61, Miles's
   * ruling: make them visible). They hang under nothing in the Pipeline AND
   * weigh into nothing — the BR-6c pass below only weighs a task whose MC has
   * a row — so today they are work that is real, invisible, and silently
   * absent from capacity. Measured on the live board 2026-08-20: 11 MC
   * numbers, 35 cards. This does not FIX the data (the cards need correcting
   * at source); it stops the gap being silent.
   */
  unattachedWork: { cards: number; mcNumbers: string[] };
  corrections: Array<{ cardId: string; displayId: string; name: string; missing: string[]; trelloUrl: string | null }>;
  model: { provenance: unknown };
  /**
   * Capacity-footer totals, keyed by slotted week Monday 'YYYY-MM-DD'. Weeks
   * with no rows are ABSENT (no zero entries) — the planner window is pure
   * client-side calendar arithmetic, so the server never guesses which weeks
   * are on screen.
   */
  perWeek: Record<string, PlannerWeekTotal>;
  /**
   * Sprint Schedules' rows and its add-time card lists (owl #72). Carried on
   * THIS payload rather than a fetch of its own because the planner body reads
   * exactly one (`GET /deliverables`, frozen contract §1) and the tab switch
   * must not become a round trip.
   *
   * These rows are NOT derived from `rows` above and never can be: the unit is
   * the work card, and a row exists only because the PM added it.
   *
   * EMPTY unless the caller passed `withSprintItems` — see `loadPipeline`.
   */
  sprintItems: SprintItemsResult;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * `withSprintItems` is opt-in because only ONE of this function's four callers
 * returns them. `GET /deadlines`, `PUT /deadlines/day` and `POST /suggest` all
 * load the pipeline and never look at `sprintItems` — and the client fires
 * `/deliverables` and `/deadlines` in a single `Promise.all`, so loading them
 * unconditionally did the work twice on every refresh and threw half away.
 */
export async function loadPipeline(
  projectId: Types.ObjectId,
  today: string,
  weeklyCapacity: number,
  opts: { withSprintItems?: boolean } = {},
): Promise<PipelineResult> {
  const { model, provenance } = await loadProjectModel(projectId);
  const view = await mongoose.connection.db!
    .collection('deliverables_v')
    .find({ project_id: projectId, active: true })
    .toArray();

  const rows = view.map((d) => toRow(d, model, today));

  const workCards = await loadWorkCards(projectId);
  const workCardsByMc: PipelineResult['workCardsByMc'] = {};
  for (const w of workCards) {
    if (!workCardsByMc[w.mc_number]) workCardsByMc[w.mc_number] = [];
    workCardsByMc[w.mc_number]!.push({
      cardId: w.trello_card_id,
      name: w.name,
      taskPrefix: w.task_prefix ?? null,
      currentList: w.current_list ?? null,
      status: classifyList(w.current_list),
      trelloUrl: w.trello_url ?? null,
      figmaUrl: w.figma_url ?? null,
      // expanded MC row (owl #45): the child row shows Due (W2-writable,
      // task-card scope — contracts/trello-write.md), Started and Done. Task
      // dues play NO part in deadline precedence or forecasting — those stay
      // deliverable-only, which is why this is a plain field, not a resolver.
      // No due INSTANT rides along: nothing reads one, the server preserves
      // time-of-day from its own doc, and a stale copy after an optimistic
      // write would be a trap for its first consumer (review pass 2026-08-18).
      due: w.trello_due ?? null,
      // same comparison the deliverable's overdue uses: Manila day strings
      overdue: !!w.trello_due && w.trello_due < today,
      started: w.work_started_at ? manilaDate(w.work_started_at) : null,
      startedTs: w.work_started_at ? w.work_started_at.toISOString() : null,
      done: w.work_done_at ? manilaDate(w.work_done_at) : null,
      doneTs: w.work_done_at ? w.work_done_at.toISOString() : null,
    });
  }

  // BR-6c: a row is a deliverable, but capacity counts CARDS — each row
  // weighs 1 + (its MC group's work cards ÷ the group's deliverables), so a
  // full board's rows sum to deliverables + attached work cards (478 on the
  // verified board). Tasks attach to the MC group (invariant 4); a task
  // whose MC has no deliverable row weighs into nothing. NOT used by the
  // hard-mix test (BR-6b) or suggestPlan (lib/planner.ts, golden-locked).
  const rowsByMc = new Map<string, number>();
  for (const r of rows) {
    if (r.mcNumber) rowsByMc.set(r.mcNumber, (rowsByMc.get(r.mcNumber) ?? 0) + 1);
  }
  // The same counts the weight pass below divides by, handed to the client so
  // expansion can tell an attributable MC from a shared one (owl #52). Derived
  // here rather than recounted there: two counts of the same thing are two
  // things that can disagree.
  const mcDeliverables: PipelineResult['mcDeliverables'] = Object.fromEntries(rowsByMc);
  for (const r of rows) {
    const group = r.mcNumber ? rowsByMc.get(r.mcNumber)! : 0;
    const tasks = r.mcNumber ? (workCardsByMc[r.mcNumber]?.length ?? 0) : 0;
    r.weight = group > 0 ? 1 + tasks / group : 1;
  }

  const corrections = rows
    .filter((r) => r.missing.length > 0)
    .map((r) => ({ cardId: r.cardId, displayId: r.displayId, name: r.name, missing: r.missing, trelloUrl: r.trelloUrl }));

  // Planner capacity footer: one entry per week that actually holds work —
  // over ALL slotted rows, not just the ones the client happens to be showing.
  // Runs after the BR-6c pass above so `cards` speaks card-equivalents.
  const perWeek: PipelineResult['perWeek'] = {};
  for (const r of rows) {
    if (r.status === 'done' || !r.slottedWeek) continue; // same filter the planner's row list uses
    const t = (perWeek[r.slottedWeek] ??= {
      cards: 0, rows: 0, hard: 0, hardShare: 0, over: false, hardOver: false, hardWarn: false,
    });
    t.cards += r.weight;
    t.rows += 1;
    if (r.difficulty === 'Hard') t.hard += 1;
  }
  for (const t of Object.values(perWeek)) {
    t.cards = round3(t.cards);
    t.hardShare = t.rows > 0 ? t.hard / t.rows : 0;
    t.over = t.cards > weeklyCapacity; // BR-6a
    // BR-6b thresholds come from lib/planner.constants.ts — the 12.9% ceiling
    // is measured, never retyped.
    t.hardOver = t.hardShare > HARD_MIX.ceiling;
    t.hardWarn = t.hardShare > HARD_MIX.ideal && t.hardShare <= HARD_MIX.ceiling;
  }

  /* Derived from the two maps already built above rather than a third query:
     an MC with tasks and no row is exactly a `workCardsByMc` key that
     `rowsByMc` does not know. Sorted so the wire is stable between reads. */
  const unattachedMcs = Object.keys(workCardsByMc).filter((mc) => !rowsByMc.has(mc)).sort();
  const unattachedWork: PipelineResult['unattachedWork'] = {
    cards: unattachedMcs.reduce((n, mc) => n + workCardsByMc[mc]!.length, 0),
    mcNumbers: unattachedMcs,
  };

  const sprintItems = opts.withSprintItems
    ? await loadSprintItems(projectId, model, workCards, rows)
    : emptySprintItems();

  return { rows, workCardsByMc, mcDeliverables, unattachedWork, corrections, model: { provenance }, perWeek, sprintItems };
}

/**
 * Gantt bar = the gaps BETWEEN the forecast's four dates (R3) — no new
 * forecast math, no lib/ edit. Half-open [startIso, endIso) so the segments
 * are contiguous and non-overlapping by construction; zero- and
 * negative-width segments are dropped rather than drawn.
 * An unslotted row still carries a forecast (keyed on today), so the bar is
 * suppressed on the missing WEEK, not on the missing forecast.
 */
function buildPhases(slottedWeek: string | null, fc: PipelineRow['forecast']): PlannerPhase[] {
  if (!slottedWeek || !fc) return [];
  const segments: PlannerPhase[] = [
    { phase: 'sketch', startIso: slottedWeek, endIso: fc.sketchDelivery },
    { phase: 'review', startIso: fc.sketchDelivery, endIso: fc.sketchApproved },
    { phase: fc.late ? 'renderOverdue' : 'render', startIso: fc.sketchApproved, endIso: fc.renderDelivery },
  ];
  return segments.filter((s) => s.startIso < s.endIso);
}

/**
 * The day the WORK finishes — lead and design for both phases, back to back,
 * with no client-review wait between them. This is what "past deadline" now
 * means (JP ruling 2026-08-27, answering the question product raised in owls
 * #72 and #74).
 *
 * Why it changed. `late` used to read `renderDelivery > deadline`, and
 * `renderDelivery` is measured from the Friday of the SKETCH-APPROVED week —
 * so the client's review wait was inside every past-deadline warning in the
 * product. That was defensible while the schedule drew a review segment and
 * auto-placed render behind it. It stopped being defensible when the redesign
 * removed the review bar from the drawing (owl #71) and made render a row the
 * PM places by hand (BR-1a, owl #72): review time then drove a warning while
 * being visible nowhere and adjustable nowhere, because the one control that
 * could move it — the review SLA override — left with the Forecast tab.
 *
 * A warning nobody can see the input to is a warning nobody can argue with.
 * So the wait comes out and the warning states something a PM can act on: the
 * work itself does not fit before the date.
 *
 * NOT a change to the engine. `lib/forecast.ts` is a verbatim port and stays
 * one (invariant 5) — every field read below is one it already returns, and
 * `workday` is the same calendar the engine itself counts on (invariant 11).
 * The forecast DATES are untouched and still include review; this is a second,
 * narrower question asked of the same numbers, carried as its own field so the
 * two can never be confused for each other.
 *
 * ⚠️ ONE SITE STILL MEASURES THE OLD WAY, deliberately. `lib/planner.ts` tests
 * `deadline < renderDelivery` and emits *"cannot meet deadline from any week in
 * view"*, which the Schedules toolbar counts as "N flagged". So Suggest Plan
 * can call a row deadline-compromised while its bar reads on time — the
 * divergence window is exactly the review wait. It is left alone on purpose:
 * `planner.ts` is golden-locked, and Suggest Plan itself is WITHDRAWN (owls
 * #70/#72 — FR-5.7, FR-5.8, BR-7, AC-15, AC-16 all marked withdrawn,
 * `suggestPlan()` kept dormant), so its toolbar goes with the Schedules
 * rebuild. Raised to JP rather than patched, because pre-adjusting the deadline
 * handed to the planner would be inventing behaviour for a feature product has
 * already dropped.
 */
function workFinishOf(f: Forecast, startDate: string): string {
  /* TWO WALKS, ONE PER PHASE — never one walk over the sum.
     `workday()` rounds its argument (`Math.round(days)`), so the engine
     walking `round(lead+design)` twice and this walking `round(2*lead+2*design)`
     once are DIFFERENT DATES, and they differ for every difficulty in the
     shipped model: from 2026-08-03, Easy 05 vs 06, Medium 07 vs 06, Hard 11 vs
     10. Medium and Hard came out a working day EARLY, which is the dangerous
     direction — a row whose work genuinely runs past the deadline reported no
     warning. Mirroring the engine's own phase-by-phase walk is what keeps this
     measure a reading of the engine rather than a rival to it.

     `parseDate`, never the raw string: `new Date('2026-08-03')` is UTC midnight,
     so west of UTC the walk starts a day early (measured 08-04 against 08-05
     under America/New_York). The dual-TZ suite runs UTC and Manila, both at or
     ahead of UTC, so it could never have caught that either. */
  const afterSketch = workday(parseDate(startDate), f.sketchLead + f.sketchDesign);
  return localIso(workday(afterSketch, f.renderLead + f.renderDesign));
}

function toRow(d: Record<string, unknown>, model: EmpiricalModel, today: string): PipelineRow {
  // display vocabulary lives with the checks (frame §4.4), not in the UI
  const missing: string[] = [];
  if (!d.difficulty) missing.push('difficulty label');
  if (!d.deadline) missing.push('due date');
  if (!d.figma_url) missing.push('Figma attachment');

  const startDate = (d.slotted_week as string | null) ?? today;
  let fc: PipelineRow['forecast'] = null;
  if (d.difficulty) {
    const f = forecast(
      {
        difficulty: d.difficulty as string,
        currentList: (d.current_list as string) ?? '',
        labels: (d.labels as string[]) ?? [],
        startDate,
        confidence: (d.confidence as string) ?? '0.7',
        slaSketch: (d.sla_sketch as number) ?? null,
        slaRender: (d.sla_render as number) ?? null,
      },
      model,
    );
    const deadline = (d.deadline as string) ?? null;
    const workFinish = workFinishOf(f, startDate);
    fc = {
      ...f,
      sketchDelivery: localDate(f.sketchDelivery),
      sketchApproved: localDate(f.sketchApproved),
      renderDelivery: localDate(f.renderDelivery),
      renderApproved: localDate(f.renderApproved),
      startDate,
      workFinish,
      late: deadline ? workFinish > deadline : false, // BR-9: no deadline → no conflict
    };
  }

  const manualStatus = (d.status_note as string) ?? null;
  const startedAt = (d.work_started_at as Date | null) ?? null;
  const doneAt = (d.work_done_at as Date | null) ?? null;
  const slottedWeek = (d.slotted_week as string) ?? null;
  return {
    cardId: d.trello_card_id as string,
    displayId: d.display_id as string,
    mcLabel: (d.mc_number as string) ?? (d.display_id as string),
    mcNumber: (d.mc_number as string) ?? null,
    name: d.name as string,
    currentList: (d.current_list as string) ?? null,
    status: classifyList((d.current_list as string) ?? ''),
    statusNote: manualStatus,
    difficulty: (d.difficulty as string) ?? null,
    lane: (d.lane as string) ?? null,
    urgency: (d.urgency as string) ?? 'Non-Urgent',
    blocker: (d.blocker as string) ?? null,
    filedAt: d.trello_created_at instanceof Date ? d.trello_created_at.toISOString() : null,
    requestor: (d.requestor as string) ?? null,
    assetType: (d.asset_type as string) ?? null,
    workStarted: startedAt ? manilaDate(startedAt) : null,
    workDone: doneAt ? manilaDate(doneAt) : null,
    workStartedTs: startedAt ? startedAt.toISOString() : null,
    workDoneTs: doneAt ? doneAt.toISOString() : null,
    deadline: (d.deadline as string) ?? null,
    deadlineSource: (d.deadline_source as string) ?? null,
    overdue: d.deadline != null && (d.deadline as string) < today,
    trelloDue: (d.trello_due as string) ?? null, // W2 edit target (FR-9.1)
    trelloUrl: (d.trello_url as string) ?? null,
    figmaUrl: (d.figma_url as string) ?? null,
    slottedWeek,
    pinned: Boolean(d.pinned),
    confidence: (d.confidence as string) ?? '0.7',
    slaSketch: (d.sla_sketch as number) ?? null,
    slaRender: (d.sla_render as number) ?? null,
    weight: 1, // BR-6c weight lands after the work-card load in loadPipeline
    phases: buildPhases(slottedWeek, fc),
    forecast: fc,
    missing,
  };
}

/** Deadlines view input: two entries per slotted, forecastable deliverable (FR-6.3). */
export function toMilestones(
  rows: PipelineRow[],
  workCardsByMc: PipelineResult['workCardsByMc'] = {},
): Milestone[] {
  const out: Milestone[] = [];
  for (const r of rows) {
    if (!r.forecast || !r.slottedWeek) continue;
    for (const phase of ['sketch', 'render'] as const) {
      const date = phase === 'sketch' ? r.forecast.sketchDelivery : r.forecast.renderDelivery;
      out.push({
        cardId: r.cardId,
        displayId: r.displayId,
        name: r.name,
        phase,
        date,
        week: mondayOf(new Date(date + 'T00:00:00')),
        urgent: r.urgency === 'Urgent',
        deadline: r.deadline,
        late: phase === 'render' && r.forecast.late,
        weight: r.weight, // BR-6c default on Deadlines too, pending the errata answer
        trelloUrl: r.trelloUrl,
        figmaUrl: r.figmaUrl,
        // owl #64's badge row and subtitle. `cards` counts the MC GROUP's work
        // cards (invariant 4) — every deliverable under one MC therefore
        // reports the same number, which is the truth: the work is attached to
        // the group and cannot be split between its deliverables.
        difficulty: r.difficulty,
        currentList: r.currentList,
        requestor: r.requestor,
        cards: r.mcNumber ? (workCardsByMc[r.mcNumber]?.length ?? 0) : 0,
      });
    }
  }
  return out;
}
