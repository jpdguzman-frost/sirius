/**
 * Write-registry routes — THE Trello write paths (invariants 2, 8, 17;
 * contracts/trello-write.md): W1 urgency (T066; FR-4.6, FR-4.7) and
 * W2 deadline (T080; FR-9.1).
 *
 * Order of operations makes the rollback guarantee structural: Trello is
 * written FIRST, and the local field changes only after Trello succeeded —
 * Sirius never displays a state Trello lacks. Every attempt, success or
 * failure, writes audit_log AND sync_runs.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Types } from 'mongoose';
import { ensureAuthenticated, type SessionUser } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { audit } from '../services/audit.ts';
import { Deliverable, SyncRun } from '../models/index.ts';
import { composeDueIso, type TrelloWriter } from '../../lib/trello.ts';
import type { Env } from '../config/env.ts';

interface WriteContext {
  projectId: Types.ObjectId;
  boardId: string;
  cardId: string;
  actor: string;
  doc: InstanceType<typeof Deliverable>;
  trello: TrelloWriter;
}

/** Guards shared by every registry write; responds and returns null on refusal. */
async function writeGuards(
  env: Env,
  trello: TrelloWriter | null,
  req: Request,
  res: Response,
): Promise<WriteContext | null> {
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

  const doc = await Deliverable.findOne({ project_id: projectId, trello_card_id: cardId });
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
  return { projectId, boardId, cardId, actor: (req.user as SessionUser).email, doc, trello };
}

export function writesRouter(env: Env, trello: TrelloWriter | null): Router {
  const router = Router();

  // W1 — urgency label (FR-4.6, FR-4.7)
  router.patch(
    '/api/projects/:projectId/deliverables/:cardId/urgency',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z.object({ urgent: z.boolean() }).strict().safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const ctx = await writeGuards(env, trello, req, res);
      if (!ctx) return;

      const before = ctx.doc.urgency;
      const after = body.data.urgent ? 'Urgent' : 'Non-Urgent';
      try {
        await ctx.trello.setUrgency(ctx.cardId, ctx.boardId, body.data.urgent);
        ctx.doc.urgency = after;
        await ctx.doc.save();
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'urgency.set', entity: 'deliverable', entity_id: ctx.cardId, before: { urgency: before }, after: { urgency: after } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: true, stats: { cardId: ctx.cardId, urgent: body.data.urgent } });
        res.json({ ok: true, urgency: after });
      } catch (err) {
        // local state untouched — the UI's optimistic change reverts (FR-4.7)
        const message = (err as Error).message;
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'urgency.set_failed', entity: 'deliverable', entity_id: ctx.cardId, before: { urgency: before }, after: { attempted: after, error: message } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: false, error: message, stats: { cardId: ctx.cardId, urgent: body.data.urgent } });
        res.status(502).json({ ok: false, error: { code: 'TRELLO_WRITE_FAILED', message } });
      }
    },
  );

  // W2 — due date (FR-9.1): date set or cleared; 17:00 Manila default,
  // existing time-of-day preserved (contracts/trello-write.md W2 semantics).
  router.patch(
    '/api/projects/:projectId/deliverables/:cardId/deadline',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z
        .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })
        .strict()
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const ctx = await writeGuards(env, trello, req, res);
      if (!ctx) return;

      const before = ctx.doc.trello_due ?? null;
      const after = body.data.date;
      if (before === after) {
        // no-op guard: no Trello call, no audit row
        res.status(400).json({ ok: false, error: { code: 'NO_OP', message: 'The due date already has this value.' } });
        return;
      }

      const dueIso = after === null ? null : composeDueIso(after, ctx.doc.trello_due_at ?? null);
      try {
        await ctx.trello.setDue(ctx.cardId, dueIso);
        ctx.doc.trello_due = after;
        ctx.doc.trello_due_at = dueIso ? new Date(dueIso) : null;
        await ctx.doc.save();
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'due.set', entity: 'deliverable', entity_id: ctx.cardId, before: { trello_due: before }, after: { trello_due: after } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: true, stats: { cardId: ctx.cardId, due: after } });
        res.json({ ok: true, trello_due: after });
      } catch (err) {
        const message = (err as Error).message;
        await audit({ project_id: ctx.projectId, actor: ctx.actor, action: 'due.set_failed', entity: 'deliverable', entity_id: ctx.cardId, before: { trello_due: before }, after: { attempted: after, error: message } });
        await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: false, error: message, stats: { cardId: ctx.cardId, due: after } });
        res.status(502).json({ ok: false, error: { code: 'TRELLO_WRITE_FAILED', message } });
      }
    },
  );

  return router;
}
