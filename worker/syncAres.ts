/**
 * syncAres (T029, T032) — reads Trello data from the ARES API (never Trello
 * directly, FR-8.1), maps per taxonomy, upserts scoped to the project.
 * Idempotent: re-running against unchanged data changes nothing; movements
 * dedupe on a synthesized source_event_id (the API exposes no event id).
 * Every run writes a sync_runs document, success or failure; a failure
 * leaves last good data untouched (FR-8.5, AC-19).
 */

import { Types } from 'mongoose';
import { AresClient, type AresMovement } from '../src/services/ares.ts';
import { assignDisplayIds, mapTrello, type MappedDeliverable, type MappedWorkCard } from '../src/services/mapper.ts';
import { classifyList } from '../src/services/status-rules.ts';
import { CardEvent, Deliverable, Project, SyncRun, WorkCard } from '../src/models/index.ts';
import type { Env } from '../src/config/env.ts';
import { assertNotProductionBoards } from '../src/services/guard.ts';

export interface SyncStats {
  cards: number;
  deliverables: number;
  workCards: number;
  unlinked: number;
  events: number;
  eventsInserted: number;
  workSpans: number;
  deactivated: number;
  capacity: Record<string, number | null> | null;
}

export function makeClient(env: Env): AresClient {
  if (!env.ARES_URL || !env.ARES_API_KEY) throw new Error('[syncAres] ARES_URL and ARES_API_KEY are required');
  return new AresClient({ baseUrl: env.ARES_URL, apiKey: env.ARES_API_KEY });
}

const sourceEventId = (m: AresMovement) =>
  `${m.cardId}|${m.fromList ?? ''}|${m.toList ?? ''}|${m.detectedAt}`;

/**
 * Ownership-safe deliverable upsert — Trello-owned fields only; Sirius-owned
 * planning fields are NEVER touched by sync (§1.2 ownership). Urgency and the
 * due instant reconcile FROM Trello via ARES (FR-9.5): a manual change made
 * in Trello surfaces here, and the echo of Sirius's own write is a same-value
 * no-op. Shared by the full board sync and the push drain.
 */
export async function upsertDeliverable(
  projectId: Types.ObjectId,
  d: MappedDeliverable,
  displayId: string | undefined,
): Promise<void> {
  await Deliverable.updateOne(
    { project_id: projectId, trello_card_id: d.trello_card_id },
    {
      $set: {
        name: d.name,
        mc_number: d.mc_number,
        display_id: displayId,
        current_list: d.current_list,
        difficulty: d.difficulty ?? null,
        lane: d.lane,
        blocker: d.blocker ?? null,
        figma_url: d.figma_url ?? null,
        labels: d.labels,
        trello_due: d.trello_due,
        trello_due_at: d.trello_due_at ? new Date(d.trello_due_at) : null,
        urgency: d.urgent ? 'Urgent' : 'Non-Urgent',
        trello_url: d.trello_url ?? null,
        active: d.active,
        trello_synced_at: new Date(),
        updated_at: new Date(),
      },
      $setOnInsert: { project_id: projectId, created_at: new Date() },
    },
    { upsert: true },
  );
}

/** Ownership-safe work-card upsert — shared by full sync and the push drain. */
export async function upsertWorkCard(projectId: Types.ObjectId, w: MappedWorkCard): Promise<void> {
  await WorkCard.updateOne(
    { project_id: projectId, trello_card_id: w.trello_card_id },
    {
      $set: {
        name: w.name,
        mc_number: w.mc_number,
        task_prefix: w.task_prefix ?? null,
        difficulty: w.difficulty ?? null,
        current_list: w.current_list,
        figma_url: w.figma_url ?? null,
        trello_url: w.trello_url ?? null,
        active: w.active,
      },
      $setOnInsert: { project_id: projectId },
    },
    { upsert: true },
  );
}

/**
 * Derive work_started_at / work_done_at from card movements (JP go
 * 2026-08-12; closes the review's top finding — nothing populated these).
 * Started = the card's FIRST move into an ongoing-or-done list; done = the
 * LATEST move into a done list, kept only while the card currently sits in a
 * done list (moving it back out clears it). Idempotent: same-value spans
 * write nothing. Shared by the full board sync and the push drain.
 */
export async function deriveWorkSpans(projectId: Types.ObjectId, cardIds?: string[]): Promise<number> {
  const filter: Record<string, unknown> = { project_id: projectId, active: true };
  if (cardIds) filter.trello_card_id = { $in: cardIds };
  const cards = await WorkCard.find(filter).select('trello_card_id current_list work_started_at work_done_at');
  if (cards.length === 0) return 0;
  const events = await CardEvent.find({
    project_id: projectId,
    trello_card_id: { $in: cards.map((c) => c.trello_card_id) },
  }).select('trello_card_id to_list occurred_at');

  const byCard = new Map<string, { started: Date | null; done: Date | null }>();
  for (const e of events) {
    const cls = classifyList(e.to_list ?? '');
    if (cls !== 'ongoing' && cls !== 'done') continue;
    const s = byCard.get(e.trello_card_id) ?? { started: null, done: null };
    if (!s.started || e.occurred_at < s.started) s.started = e.occurred_at;
    if (cls === 'done' && (!s.done || e.occurred_at > s.done)) s.done = e.occurred_at;
    byCard.set(e.trello_card_id, s);
  }

  let updated = 0;
  for (const c of cards) {
    const s = byCard.get(c.trello_card_id) ?? { started: null, done: null };
    const done = classifyList(c.current_list ?? '') === 'done' ? s.done : null;
    if (
      (c.work_started_at?.getTime() ?? null) === (s.started?.getTime() ?? null) &&
      (c.work_done_at?.getTime() ?? null) === (done?.getTime() ?? null)
    ) {
      continue;
    }
    await WorkCard.updateOne(
      { project_id: projectId, trello_card_id: c.trello_card_id },
      { $set: { work_started_at: s.started, work_done_at: done } },
    );
    updated++;
  }
  return updated;
}

export async function syncProject(
  client: AresClient,
  project: InstanceType<typeof Project> extends never ? never : { _id: Types.ObjectId; code: string; trello_board_id: string; trello_label?: string | null },
  { movementsFrom }: { movementsFrom?: string } = {},
): Promise<SyncStats> {
  const projectId = project._id;

  const cards = await client.boardCards(project.trello_board_id);
  const mapped = mapTrello(cards, project.trello_label ?? null);

  // Stable display ids: existing assignments never reshuffle (invariant 3).
  const existing = await Deliverable.find({ project_id: projectId }).select('trello_card_id display_id');
  const displayIds = assignDisplayIds(
    new Map(existing.map((d) => [d.trello_card_id, d.display_id])),
    mapped.deliverables,
  );

  const seenDeliverables = new Set<string>();
  for (const d of mapped.deliverables) {
    seenDeliverables.add(d.trello_card_id);
    await upsertDeliverable(projectId, d, displayIds.get(d.trello_card_id));
  }

  const seenWork = new Set<string>();
  for (const w of mapped.workCards) {
    seenWork.add(w.trello_card_id);
    await upsertWorkCard(projectId, w);
  }

  // Cards gone from the board: inactive, never deleted (mirror of FR-8.4).
  const deactivated = await Deliverable.updateMany(
    { project_id: projectId, active: true, trello_card_id: { $nin: [...seenDeliverables] } },
    { $set: { active: false, updated_at: new Date() } },
  );
  await WorkCard.updateMany(
    { project_id: projectId, active: true, trello_card_id: { $nin: [...seenWork] } },
    { $set: { active: false } },
  );

  // Movements → card_events, idempotent on the synthesized key (T032).
  const movements = await client.boardMovements(project.trello_board_id, movementsFrom);
  let inserted = 0;
  if (movements.length > 0) {
    try {
      const res = await CardEvent.insertMany(
        movements.map((m) => ({
          project_id: projectId,
          trello_card_id: m.cardId,
          source_event_id: sourceEventId(m),
          from_list: m.fromList,
          to_list: m.toList,
          occurred_at: new Date(m.detectedAt),
        })),
        { ordered: false },
      );
      inserted = res.length;
    } catch (err) {
      // duplicate keys are the idempotency mechanism, not a failure
      const e = err as {
        code?: number;
        writeErrors?: Array<{ code?: number; err?: { code?: number } }>;
        result?: { insertedCount?: number };
        insertedDocs?: unknown[];
      };
      const codes = (e.writeErrors ?? []).map((w) => w.code ?? w.err?.code);
      const allDup = codes.length > 0 ? codes.every((c) => c === 11000) : e.code === 11000;
      if (!allDup) throw err;
      inserted = e.insertedDocs?.length ?? e.result?.insertedCount ?? 0;
    }
  }

  // Started/Done spans from the freshly appended movements.
  const workSpans = await deriveWorkSpans(projectId);

  // Capacity from ARES steering, behind the adapter (BR-6a, T030).
  const capacity = await client.referenceWeeks(project.code.replace(/^rt-/, ''));
  if (capacity.typical != null || capacity.effectiveWeeklyRate != null) {
    await Project.updateOne(
      { _id: projectId },
      {
        $set: {
          ref_week_least: capacity.least,
          ref_week_typical: capacity.typical,
          ref_week_most: capacity.most,
          effective_weekly_rate: capacity.effectiveWeeklyRate,
        },
      },
    );
  }

  return {
    cards: cards.length,
    deliverables: mapped.deliverables.length,
    workCards: mapped.workCards.length,
    unlinked: mapped.unlinked.length,
    events: movements.length,
    eventsInserted: inserted,
    workSpans,
    deactivated: deactivated.modifiedCount,
    capacity: capacity.typical != null ? (capacity as unknown as Record<string, number | null>) : null,
  };
}

/**
 * Sync every active project; one sync_runs document per project per run.
 * `policy` (FR-9.6, worker/drainPush.ts) may skip a project this tick —
 * while ARES push is healthy the full sync relaxes to an hourly reconcile.
 */
export async function runAresSync(
  env: Env,
  policy?: (projectId: Types.ObjectId) => Promise<boolean>,
): Promise<void> {
  const client = makeClient(env);
  const projects = await Project.find({ status: 'ongoing' });
  assertNotProductionBoards(env, projects.map((p) => p.trello_board_id)); // invariant 17

  for (const project of projects) {
    if (policy && !(await policy(project._id))) continue;
    try {
      const stats = await syncProject(client, project, { movementsFrom: await lastGoodRun(project._id) });
      await SyncRun.create({ project_id: project._id, source: 'ares', ok: true, stats });
    } catch (err) {
      // last good data stays visible; the failure is recorded and surfaced (AC-19)
      await SyncRun.create({
        project_id: project._id,
        source: 'ares',
        ok: false,
        error: (err as Error).message,
      });
    }
  }
}

async function lastGoodRun(projectId: Types.ObjectId): Promise<string | undefined> {
  const last = await SyncRun.findOne({ project_id: projectId, source: 'ares', ok: true }).sort({ at: -1 });
  if (!last) return undefined;
  // overlap one hour to be safe; dedup makes the overlap free
  return new Date(last.at.getTime() - 60 * 60 * 1000).toISOString();
}
