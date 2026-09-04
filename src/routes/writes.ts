/**
 * Write-registry routes — THE Trello write paths (invariants 2, 8, 17;
 * contracts/trello-write.md): W1 urgency (T066; FR-4.6, FR-4.7),
 * W2 deadline (T080; FR-9.1), W3 difficulty (T111; BRD-§9-A1).
 *
 * WHICH CARD each entry writes (the registry enumerates FIELDS; the card
 * kind is a scope note on the entry, never a registry growth):
 *  - W1 and W3 write the WORK CARD, and only the work card, since product
 *    owl #78 (2026-09-05; contracts/trello-write.md §W1/W3 scope
 *    clarification). "A main card does not have these properties" — a
 *    website request can hold an urgent screen and non-urgent assets, so one
 *    value on the parent cannot be true. The deliverable-scoped routes were
 *    DELETED rather than left beside the new ones: a dormant write path is
 *    exactly how the shipped build spent three weeks labelling the wrong
 *    object (PLAN decision D2). A main card's own labels still exist in
 *    Trello and still reconcile IN through ARES (decision D1) — they are
 *    read-only in Sirius, changed in Trello only.
 *  - W2 writes either kind — the deliverable row and its expanded MC group's
 *    task cards alike (JP 2026-08-18, §W2 scope clarification).
 *
 * Order of operations makes the rollback guarantee structural: Trello is
 * written FIRST, and the local field changes only after Trello succeeded —
 * Sirius never displays a state Trello lacks. Every attempt, success or
 * failure, writes audit_log AND sync_runs.
 *
 * Every success also stamps `registry_written_at`, which is what stops a
 * reconcile holding an older ARES read from reverting the value a moment
 * later (product owl #50; the guard itself is `staleGuard` in
 * worker/syncAres.ts). It is stamped on the SUCCESS path only: a failed write
 * left Trello unchanged, so there is nothing for a later read to contradict.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Types } from 'mongoose';
import { ensureAuthenticated, type SessionUser } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { audit } from '../services/audit.ts';
import { Deliverable, SyncRun, WorkCard } from '../models/index.ts';
import { composeDueIso, type TrelloWriter } from '../../lib/trello.ts';
import type { Env } from '../config/env.ts';

interface WriteContext<TDoc> {
  projectId: Types.ObjectId;
  boardId: string;
  cardId: string;
  actor: string;
  doc: TDoc;
  trello: TrelloWriter;
}

/** The card kinds a registry write can target, and each kind's doc type. */
type KindDoc = {
  deliverable: InstanceType<typeof Deliverable>;
  work_card: InstanceType<typeof WorkCard>;
};

/**
 * Guards shared by every registry write; responds and returns null on refusal.
 * `kind` names the collection the card is looked up in — a card id of the
 * other kind is a 404, which is the cross-kind guard every route relies on.
 * Every refusal guard is identical for both kinds, which is the point of the
 * ONE door (src/CLAUDE.md rule 3). Generic over the kind, so `ctx.doc` is
 * COMPILER-typed at every call site: a literal kind narrows to its doc, a
 * variable kind yields the union (fine for handlers that touch only the
 * fields both kinds share, which is exactly W2's shared-handler case).
 *
 * `kind` is REQUIRED. It used to default to 'deliverable' when that was the
 * only kind; since owl #78 no route is deliverable-only, and a default that
 * silently picks a collection is the shape of the wrong-target write this
 * build removed.
 */
async function writeGuards<K extends keyof KindDoc>(
  env: Env,
  trello: TrelloWriter | null,
  req: Request,
  res: Response,
  kind: K,
): Promise<WriteContext<KindDoc[K]> | null> {
  const projectId = res.locals.project._id as Types.ObjectId;
  const boardId = res.locals.project.trello_board_id as string;
  const cardId = String(req.params.cardId);

  // Invariant 17: outside production, a configured production board refuses
  // the write outright.
  const prodIds = (env.PROD_TRELLO_BOARD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (env.NODE_ENV !== 'production' && prodIds.includes(boardId)) {
    res.status(409).json({
      ok: false,
      error: { code: 'PRODUCTION_BOARD_GUARD', message: 'This environment refuses to write to a production Trello board (invariant 17).' },
    });
    return null;
  }

  // G7 observation mode (JP, 2026-08-12): a read-only project refuses every
  // registry write — the real board is watched, never written, until JP
  // flips writes on. Absent flag = enabled (pre-flag projects keep writes).
  if (res.locals.project.writes_enabled === false) {
    res.status(403).json({
      ok: false,
      error: { code: 'WRITES_DISABLED', message: 'This project is read-only — Trello writes are disabled while observing the real board.' },
    });
    return null;
  }

  // active: true — a card that flipped kind (gained/lost the Main Card
  // label) leaves a deactivated doc in its old collection, and that ghost
  // must not keep answering writes (review pass 2026-08-18).
  const doc =
    kind === 'work_card'
      ? await WorkCard.findOne({ project_id: projectId, trello_card_id: cardId, active: true })
      : await Deliverable.findOne({ project_id: projectId, trello_card_id: cardId, active: true });
  if (!doc) {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
    return null;
  }
  if (cardId.startsWith('local-')) {
    res.status(400).json({ ok: false, error: { code: 'LOCAL_ROW', message: 'A duplicated local row has no Trello card to write to.' } });
    return null;
  }
  if (!trello) {
    res.status(503).json({ ok: false, error: { code: 'TRELLO_NOT_CONFIGURED', message: 'TRELLO_API_KEY / TRELLO_TOKEN are not set.' } });
    return null;
  }
  // the branch above proves doc matches `kind`; TS cannot narrow K from a
  // value comparison, so this is the ONE place the correspondence is asserted
  return { projectId, boardId, cardId, actor: (req.user as SessionUser).email, doc: doc as KindDoc[K], trello };
}

export function writesRouter(env: Env, trello: TrelloWriter | null): Router {
  const router = Router();

  // W1 — urgency label (FR-4.6, FR-4.7) on the WORK CARD (owl #78). The
  // label is presence-or-absence in Trello — there is no "Non-Urgent" label —
  // so `urgent: false` removes it. No no-op guard here, and never was one:
  // the toggle's two states are both writable at any time and a same-value
  // set is one idempotent label call.
  router.patch(
    '/api/projects/:projectId/workcards/:cardId/urgency',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z.object({ urgent: z.boolean() }).strict().safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const ctx = await writeGuards(env, trello, req, res, 'work_card');
      if (!ctx) return;

      const doc = ctx.doc; // typed work card by the guard's generic — W1's only surface since #78
      const before = doc.urgency;
      const after = body.data.urgent ? 'Urgent' : 'Non-Urgent';
      try {
        await ctx.trello.setUrgency(ctx.cardId, ctx.boardId, body.data.urgent);
        doc.urgency = after;
        doc.registry_written_at = new Date();
        await doc.save();
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'urgency.set', entity: 'work_card', entity_id: ctx.cardId, before: { urgency: before }, after: { urgency: after } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: true, stats: { cardId: ctx.cardId, kind: 'work_card', urgent: body.data.urgent } });
        res.json({ ok: true, urgency: after });
      } catch (err) {
        // local state untouched — the UI's optimistic change reverts (FR-4.7)
        const message = (err as Error).message;
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'urgency.set_failed', entity: 'work_card', entity_id: ctx.cardId, before: { urgency: before }, after: { attempted: after, error: message } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: false, error: message, stats: { cardId: ctx.cardId, kind: 'work_card', urgent: body.data.urgent } });
        res.status(502).json({ ok: false, error: { code: 'TRELLO_WRITE_FAILED', message } });
      }
    },
  );

  // W2 — due date (FR-9.1): date set or cleared; 17:00 Manila default,
  // existing time-of-day preserved (contracts/trello-write.md W2 semantics).
  // ONE handler for both card kinds — the deliverable row and, since JP's
  // 2026-08-18 scope clarification, the task cards its expanded MC group
  // reveals (owl #45). Same field, same setDue(), same guards; only the
  // looked-up collection and the audit entity differ. Task-card dues play no
  // part in deadline precedence or forecasting.
  const dueHandler = (kind: 'deliverable' | 'work_card') =>
    async (req: Request, res: Response) => {
      const body = z
        .object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            // the regex admits calendar-impossible days (2026-02-30) that
            // would make composeDueIso throw OUTSIDE the try — a 500 with no
            // audit trail (review pass 2026-08-18). A real-date check keeps
            // bad input in the 400 lane, where non-attempts belong.
            .refine((d) => {
              const t = new Date(`${d}T00:00:00Z`).getTime();
              return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
            }, 'not a real calendar date')
            .nullable(),
        })
        .strict()
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      // a variable kind yields the union-typed doc — exactly right for a
      // handler that touches only the field pair both kinds share
      const ctx = await writeGuards(env, trello, req, res, kind);
      if (!ctx) return;

      const doc = ctx.doc;
      const before = doc.trello_due ?? null;
      const after = body.data.date;
      if (before === after) {
        // no-op guard: no Trello call, no audit row
        res.status(400).json({ ok: false, error: { code: 'NO_OP', message: 'The due date already has this value.' } });
        return;
      }

      const dueIso = after === null ? null : composeDueIso(after, doc.trello_due_at ?? null);
      try {
        await ctx.trello.setDue(ctx.cardId, dueIso);
        doc.trello_due = after;
        doc.trello_due_at = dueIso ? new Date(dueIso) : null;
        doc.registry_written_at = new Date();
        await doc.save();
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'due.set', entity: kind, entity_id: ctx.cardId, before: { trello_due: before }, after: { trello_due: after } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: true, stats: { cardId: ctx.cardId, kind, due: after } });
        res.json({ ok: true, trello_due: after });
      } catch (err) {
        const message = (err as Error).message;
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'due.set_failed', entity: kind, entity_id: ctx.cardId, before: { trello_due: before }, after: { attempted: after, error: message } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: false, error: message, stats: { cardId: ctx.cardId, kind, due: after } });
        res.status(502).json({ ok: false, error: { code: 'TRELLO_WRITE_FAILED', message } });
      }
    };

  router.patch(
    '/api/projects/:projectId/deliverables/:cardId/deadline',
    ensureAuthenticated,
    ensureProjectMember,
    dueHandler('deliverable'),
  );
  router.patch(
    '/api/projects/:projectId/workcards/:cardId/deadline',
    ensureAuthenticated,
    ensureProjectMember,
    dueHandler('work_card'),
  );

  // W3 — difficulty label swap (BRD-§9-A1, approved 2026-08-12) on the WORK
  // CARD (owl #78). The Sprint Schedules bar re-keys from the persisted value
  // at read time (difficulty × lane, `finishOf`); the Pipeline forecast does
  // NOT — it still keys on the main card's own label, reconciled from Trello
  // (decision D1, revisited in block 3).
  router.patch(
    '/api/projects/:projectId/workcards/:cardId/difficulty',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z.object({ difficulty: z.enum(['Easy', 'Medium', 'Hard']) }).strict().safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const ctx = await writeGuards(env, trello, req, res, 'work_card');
      if (!ctx) return;

      const doc = ctx.doc; // typed work card by the guard's generic — W3's only surface since #78
      const before = doc.difficulty ?? null;
      const after = body.data.difficulty;
      if (before === after) {
        // no-op guard: no Trello call, no audit row
        res.status(400).json({ ok: false, error: { code: 'NO_OP', message: 'The difficulty already has this value.' } });
        return;
      }

      try {
        await ctx.trello.setDifficulty(ctx.cardId, ctx.boardId, after);
        doc.difficulty = after;
        doc.registry_written_at = new Date();
        await doc.save();
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'difficulty.set', entity: 'work_card', entity_id: ctx.cardId, before: { difficulty: before }, after: { difficulty: after } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: true, stats: { cardId: ctx.cardId, kind: 'work_card', difficulty: after } });
        res.json({ ok: true, difficulty: after });
      } catch (err) {
        // local state untouched — the UI's optimistic change reverts (invariant 8)
        const message = (err as Error).message;
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'difficulty.set_failed', entity: 'work_card', entity_id: ctx.cardId, before: { difficulty: before }, after: { attempted: after, error: message } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: false, error: message, stats: { cardId: ctx.cardId, kind: 'work_card', difficulty: after } });
        res.status(502).json({ ok: false, error: { code: 'TRELLO_WRITE_FAILED', message } });
      }
    },
  );

  return router;
}
