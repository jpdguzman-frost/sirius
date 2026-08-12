/**
 * Pipeline assembler — one place that turns db rows into what the five tabs
 * consume: deliverables (via deliverables_v so BR-9 precedence is the
 * database's, invariant 14) + forecast dates from the per-project model +
 * BR-10 status. Lean queries; the 5,000-card envelope is NFR-1's target.
 */

import mongoose, { Types } from 'mongoose';
import { parseDate, workdaysBetween } from '../../lib/calendar.ts';
import { forecast } from '../../lib/forecast.ts';
import type { EmpiricalModel } from '../../lib/model.ts';
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

export interface PipelineRow {
  cardId: string;
  displayId: string;
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
  /** Frame 17:1015 columns — derived from the MC group's work cards (annotation-silent; assumptions in tasks.md phase 13). */
  workStarted: string | null;
  workDone: string | null;
  cycleDays: number | null;
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
  workCardsByMc: Record<string, Array<{ cardId: string; name: string; taskPrefix: string | null; currentList: string | null; status: string; trelloUrl: string | null; figmaUrl: string | null }>>;
  corrections: Array<{ cardId: string; displayId: string; name: string; missing: string[]; trelloUrl: string | null }>;
  model: { provenance: unknown };
}

export async function loadPipeline(projectId: Types.ObjectId, today: string): Promise<PipelineResult> {
  const { model, provenance } = await loadProjectModel(projectId);
  const view = await mongoose.connection.db!
    .collection('deliverables_v')
    .find({ project_id: projectId, active: true })
    .toArray();

  const rows = view.map((d) => toRow(d, model, today));

  const workCards = await WorkCard.find({ project_id: projectId, active: true }).lean();
  const workCardsByMc: PipelineResult['workCardsByMc'] = {};
  // ONE pass per work card: the DTO grouping and the Started/Done span
  // accumulate together, so a future filter cannot desynchronize them.
  const spanByMc = new Map<string, { minStart: Date | null; maxDone: Date | null; allDone: boolean }>();
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
    });
    const span = spanByMc.get(w.mc_number) ?? { minStart: null, maxDone: null, allDone: true };
    if (w.work_started_at && (!span.minStart || w.work_started_at < span.minStart)) span.minStart = w.work_started_at;
    if (!w.work_done_at) span.allDone = false;
    else if (!span.maxDone || w.work_done_at > span.maxDone) span.maxDone = w.work_done_at;
    spanByMc.set(w.mc_number, span);
  }
  // Finalize once per GROUP: earliest start; latest done only when EVERY
  // task is done; cycle in workdays. Instants become MANILA calendar days
  // first (invariant 11), then midnight-normalized dates feed the workday
  // walk — no host-TZ day shifts, no clock-time off-by-one.
  const groupSpan = new Map<string, { started: string | null; done: string | null; cycleDays: number | null }>();
  for (const [mc, s] of spanByMc) {
    const done = s.allDone ? s.maxDone : null;
    const startedIso = s.minStart ? manilaDate(s.minStart) : null;
    const doneIso = done ? manilaDate(done) : null;
    groupSpan.set(mc, {
      started: startedIso,
      done: doneIso,
      cycleDays: startedIso && doneIso ? workdaysBetween(parseDate(startedIso), parseDate(doneIso)) : null,
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
    const span = r.mcNumber ? groupSpan.get(r.mcNumber) : undefined;
    r.workStarted = span?.started ?? null;
    r.workDone = span?.done ?? null;
    r.cycleDays = span?.cycleDays ?? null;
  }

  const corrections = rows
    .filter((r) => r.missing.length > 0)
    .map((r) => ({ cardId: r.cardId, displayId: r.displayId, name: r.name, missing: r.missing, trelloUrl: r.trelloUrl }));

  return { rows, workCardsByMc, corrections, model: { provenance } };
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
  return {
    cardId: d.trello_card_id as string,
    displayId: d.display_id as string,
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
    workStarted: null, // group spans land after the work-card load in loadPipeline
    workDone: null,
    cycleDays: null,
    deadline: (d.deadline as string) ?? null,
    deadlineSource: (d.deadline_source as string) ?? null,
    overdue: d.deadline != null && (d.deadline as string) < today,
    trelloDue: (d.trello_due as string) ?? null, // W2 edit target (FR-9.1)
    trelloUrl: (d.trello_url as string) ?? null,
    figmaUrl: (d.figma_url as string) ?? null,
    slottedWeek: (d.slotted_week as string) ?? null,
    pinned: Boolean(d.pinned),
    confidence: (d.confidence as string) ?? '0.7',
    slaSketch: (d.sla_sketch as number) ?? null,
    slaRender: (d.sla_render as number) ?? null,
    weight: 1, // BR-6c weight lands after the work-card load in loadPipeline
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
