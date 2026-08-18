/**
 * Pipeline assembler — one place that turns db rows into what the five tabs
 * consume: deliverables (via deliverables_v so BR-9 precedence is the
 * database's, invariant 14) + forecast dates from the per-project model +
 * BR-10 status. Lean queries; the 5,000-card envelope is NFR-1's target.
 */

import mongoose, { Types } from 'mongoose';
import { forecast } from '../../lib/forecast.ts';
import type { EmpiricalModel } from '../../lib/model.ts';
import { HARD_MIX } from '../../lib/planner.constants.ts';
import { loadProjectModel } from './model-grid.ts';
import { classifyList } from './status-rules.ts';
import { WorkCard } from '../models/index.ts';
import type { Milestone } from './conflicts.ts';

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
  forecast: {
    sketchDelivery: string;
    sketchApproved: string;
    renderDelivery: string;
    renderApproved: string;
    sketchDesign: number;
    sketchReview: number;
    forecastedReviewTime: number;
    totalCycleTime: number;
    sampleSize: number;
    late: boolean;
  } | null;
  missing: string[];
}

export interface PipelineResult {
  rows: PipelineRow[];
  workCardsByMc: Record<string, Array<{ cardId: string; name: string; taskPrefix: string | null; currentList: string | null; status: string; trelloUrl: string | null; figmaUrl: string | null; due: string | null; dueAt: string | null; started: string | null; startedTs: string | null; done: string | null; doneTs: string | null }>>;
  corrections: Array<{ cardId: string; displayId: string; name: string; missing: string[]; trelloUrl: string | null }>;
  model: { provenance: unknown };
  /**
   * Capacity-footer totals, keyed by slotted week Monday 'YYYY-MM-DD'. Weeks
   * with no rows are ABSENT (no zero entries) — the planner window is pure
   * client-side calendar arithmetic, so the server never guesses which weeks
   * are on screen.
   */
  perWeek: Record<string, PlannerWeekTotal>;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function loadPipeline(
  projectId: Types.ObjectId,
  today: string,
  weeklyCapacity: number,
): Promise<PipelineResult> {
  const { model, provenance } = await loadProjectModel(projectId);
  const view = await mongoose.connection.db!
    .collection('deliverables_v')
    .find({ project_id: projectId, active: true })
    .toArray();

  const rows = view.map((d) => toRow(d, model, today));

  const workCards = await WorkCard.find({ project_id: projectId, active: true }).lean();
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
      due: (w.trello_due as string | null) ?? null,
      dueAt: w.trello_due_at ? (w.trello_due_at as Date).toISOString() : null,
      started: w.work_started_at ? manilaDate(w.work_started_at as Date) : null,
      startedTs: w.work_started_at ? (w.work_started_at as Date).toISOString() : null,
      done: w.work_done_at ? manilaDate(w.work_done_at as Date) : null,
      doneTs: w.work_done_at ? (w.work_done_at as Date).toISOString() : null,
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

  return { rows, workCardsByMc, corrections, model: { provenance }, perWeek };
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
    fc = {
      sketchDelivery: localDate(f.sketchDelivery),
      sketchApproved: localDate(f.sketchApproved),
      renderDelivery: localDate(f.renderDelivery),
      renderApproved: localDate(f.renderApproved),
      sketchDesign: f.sketchDesign,
      sketchReview: f.sketchReview,
      forecastedReviewTime: f.forecastedReviewTime,
      totalCycleTime: f.totalCycleTime,
      sampleSize: f.sampleSize,
      late: deadline ? localDate(f.renderDelivery) > deadline : false, // BR-9: no deadline → no conflict
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
export function toMilestones(rows: PipelineRow[]): Milestone[] {
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
      });
    }
  }
  return out;
}
