/**
 * Push drain (T083–T084; FR-9.4–9.6; contracts/ares-push.md) — the worker
 * half of the ARES push channel. The receiver only persisted triggers; here
 * they turn into reads: each distinct card is re-fetched from the ARES read
 * API and reconciled through the same ownership-safe upserts the full sync
 * uses. board.resync events run a full board sync instead.
 *
 * Fallback policy (FR-9.6): while push is healthy (an accepted event within
 * 30 min) the 15-min poll relaxes to an hourly reconcile; when the channel
 * goes silent with ARES itself healthy, the poll reverts and ONE alerting
 * sync_runs row records the silence — never a data loss, only latency.
 */

import type { Types } from 'mongoose';
import { AresClient } from '../src/services/ares.ts';
import { assignDisplayIds, mapTrello } from '../src/services/mapper.ts';
import { Deliverable, Project, PushEvent, SyncRun, WorkCard } from '../src/models/index.ts';
import type { Env } from '../src/config/env.ts';
import { deriveWorkSpans, insertCardEvents, makeClient, syncProject, upsertDeliverable, upsertWorkCard } from './syncAres.ts';

const PUSH_HEALTHY_MS = 30 * 60 * 1000;
const RECONCILE_WHILE_HEALTHY_MS = 60 * 60 * 1000;

type ProjectDoc = { _id: Types.ObjectId; code: string; trello_board_id: string; trello_label?: string | null };

/**
 * Re-read one card from ARES and reconcile it (notification-then-read). The
 * read returns the card's movement history alongside it, and those movements
 * are ingested here on the same dedupe key the full sync uses — without them
 * the move that TRIGGERED this push is not in card_events, and the caller's
 * deriveWorkSpans could neither advance a span nor stop re-applying a stale
 * work_done_at to a reopened-then-recompleted card.
 */
export async function reconcileCard(
  client: AresClient,
  project: ProjectDoc,
  cardId: string,
): Promise<{ kind: 'deliverable' | 'work_card' | 'descoped' | 'missing'; unstamped: boolean }> {
  // No read instant (2026-08-25). This used to stamp `new Date()` before the
  // read, on the reasoning that a registry write landing mid-flight must win
  // over the payload — true, but it measured the wrong flight. ARES answers
  // from its own store, so the payload can predate our write however fast the
  // request returns, and the push would revert a change the user just made.
  // The fetch instant rides on the card itself now; see `staleGuard`.
  const { card, movements } = await client.cardWithMovements(cardId);
  if (!card) return { kind: 'missing', unstamped: false }; // the full board sync catches true deletions
  const mapped = mapTrello([card], project.trello_label ?? null);

  if (mapped.deliverables.length > 0) {
    const d = mapped.deliverables[0]!;
    const existing = await Deliverable.find({ project_id: project._id }).select('trello_card_id display_id');
    const ids = assignDisplayIds(new Map(existing.map((x) => [x.trello_card_id, x.display_id])), [d]);
    const reconciled = await upsertDeliverable(project._id, d, ids.get(d.trello_card_id));
    // a card that just GAINED the Main Card label may have lived in the other
    // collection: deactivate the twin here rather than waiting up to an hour
    // for the full sync's sweep, or the same trello_card_id is served — and
    // writable — as both kinds meanwhile (review pass 2026-08-18)
    await WorkCard.updateOne(
      { project_id: project._id, trello_card_id: cardId, active: true },
      { $set: { active: false } },
    );
    await insertCardEvents(project._id, movements);
    return { kind: 'deliverable', unstamped: !reconciled };
  }
  if (mapped.workCards.length > 0) {
    const reconciled = await upsertWorkCard(project._id, mapped.workCards[0]!);
    // the mirror case: a card that just LOST the Main Card label
    await Deliverable.updateOne(
      { project_id: project._id, trello_card_id: cardId, active: true },
      { $set: { active: false, updated_at: new Date() } },
    );
    await insertCardEvents(project._id, movements);
    return { kind: 'work_card', unstamped: !reconciled };
  }
  // Scoped out (lost the project label) or an unlinked task: locally known
  // rows go inactive, never deleted (FR-8.4 mirror).
  await Deliverable.updateOne(
    { project_id: project._id, trello_card_id: cardId, active: true },
    { $set: { active: false, updated_at: new Date() } },
  );
  await WorkCard.updateOne(
    { project_id: project._id, trello_card_id: cardId, active: true },
    { $set: { active: false } },
  );
  return { kind: 'descoped', unstamped: false };
}

/** Drain pending push events, project by project (invariant 1). */
export async function drainPushEvents(env: Env, clientOverride?: AresClient): Promise<void> {
  const projects = await Project.find({ status: 'ongoing' });
  let client: AresClient | null = clientOverride ?? null;

  for (const project of projects) {
    const pending = await PushEvent.find({ project_id: project._id, status: 'pending' })
      .sort({ received_at: 1 })
      .limit(500);
    if (pending.length === 0) continue;
    client ??= makeClient(env);

    const resync = pending.some((e) => e.type === 'board.resync');
    const cardIds = [...new Set(pending.map((e) => e.card_id).filter((c): c is string => !!c))];

    try {
      const outcomes: Record<string, number> = {};
      if (resync) {
        await syncProject(client, project);
        outcomes.resync = 1;
      } else {
        for (const cardId of cardIds) {
          const outcome = await reconcileCard(client, project, cardId);
          outcomes[outcome.kind] = (outcomes[outcome.kind] ?? 0) + 1;
          // Counted HERE and not only in the full sync, because the two paths
          // read DIFFERENT ARES endpoints — the board list there, the
          // single-card read here — so `lastPolledAt` can vanish from one and
          // not the other. And FR-9.6 relaxes the full sync to hourly while
          // push is healthy, so this is the path that would go quiet first
          // while the fallback that might have masked it is throttled.
          if (outcome.unstamped) outcomes.unstamped = (outcomes.unstamped ?? 0) + 1;
        }
        // ONE derivation for the whole batch: Started/Done follow the list
        // moves just ingested. Idempotent and order-independent, and it reads
        // only stored state, which the reconcile loop has finished writing.
        if (cardIds.length > 0) await deriveWorkSpans(project._id, cardIds);
      }
      await PushEvent.updateMany(
        { _id: { $in: pending.map((e) => e._id) }, project_id: project._id },
        { $set: { status: 'done' } },
      );
      await SyncRun.create({
        project_id: project._id,
        source: 'ares_push',
        ok: true,
        stats: { events: pending.length, cards: cardIds.length, ...outcomes },
      });
    } catch (err) {
      const message = (err as Error).message;
      await PushEvent.updateMany(
        { _id: { $in: pending.map((e) => e._id) }, project_id: project._id },
        { $set: { status: 'failed', error: message } },
      );
      await SyncRun.create({ project_id: project._id, source: 'ares_push', ok: false, error: message });
    }
  }
}

export interface PushHealth {
  configured: boolean;
  lastPushAt: Date | null;
  healthy: boolean;
}

export async function pushHealth(env: Env, projectId: Types.ObjectId, now = new Date()): Promise<PushHealth> {
  if (!env.ARES_WEBHOOK_SECRET) return { configured: false, lastPushAt: null, healthy: false };
  const last = await PushEvent.findOne({ project_id: projectId }).sort({ received_at: -1 }).select('received_at');
  const lastPushAt = last?.received_at ?? null;
  return {
    configured: true,
    lastPushAt,
    healthy: lastPushAt !== null && now.getTime() - lastPushAt.getTime() < PUSH_HEALTHY_MS,
  };
}

/**
 * Per-project poll policy for the 15-min tick (FR-9.6). Returns whether the
 * full sync should run now; writes the one-per-silence alert as a side
 * effect when the channel has gone quiet.
 */
export async function shouldRunFullSync(env: Env, projectId: Types.ObjectId, now = new Date()): Promise<boolean> {
  const health = await pushHealth(env, projectId, now);
  if (!health.configured || !health.lastPushAt) return true; // push absent — poll as always

  if (health.healthy) {
    const lastFull = await SyncRun.findOne({ project_id: projectId, source: 'ares', ok: true }).sort({ at: -1 });
    return !lastFull || now.getTime() - lastFull.at.getTime() >= RECONCILE_WHILE_HEALTHY_MS;
  }

  // Channel silent: alert once per silence period, then poll at full cadence.
  const alerted = await SyncRun.findOne({
    project_id: projectId,
    source: 'ares_push',
    ok: false,
    at: { $gt: health.lastPushAt },
    error: /push silent/,
  });
  if (!alerted) {
    await SyncRun.create({
      project_id: projectId,
      source: 'ares_push',
      ok: false,
      error: 'push silent > 30 min — reverted to 15-min polling (FR-9.6)',
    });
  }
  return true;
}
