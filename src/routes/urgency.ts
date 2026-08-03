/**
 * Urgency route — THE write path (T066; FR-4.6, FR-4.7; invariants 2, 8, 17).
 *
 * Order of operations makes the rollback guarantee structural: Trello is
 * written FIRST, and the local field changes only after Trello succeeded —
 * Sirius never displays a state Trello lacks. Every attempt, success or
 * failure, writes audit_log AND sync_runs.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { Types } from 'mongoose';
import { ensureAuthenticated, type SessionUser } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { audit } from '../services/audit.ts';
import { Deliverable, SyncRun } from '../models/index.ts';
import type { TrelloWriter } from '../../lib/trello.ts';
import type { Env } from '../config/env.ts';

export function urgencyRouter(env: Env, trello: TrelloWriter | null): Router {
  const router = Router();

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
      const projectId = res.locals.project._id as Types.ObjectId;
      const boardId = res.locals.project.trello_board_id as string;
      const cardId = String(req.params.cardId);
      const actor = (req.user as SessionUser).email;

      // Invariant 17: outside production, a configured production board
      // refuses the write outright.
      const prodIds = (env.PROD_TRELLO_BOARD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (env.NODE_ENV !== 'production' && prodIds.includes(boardId)) {
        res.status(409).json({
          ok: false,
          error: { code: 'PRODUCTION_BOARD_GUARD', message: 'This environment refuses to write to a production Trello board (invariant 17).' },
        });
        return;
      }

      const doc = await Deliverable.findOne({ project_id: projectId, trello_card_id: cardId });
      if (!doc) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      if (cardId.startsWith('local-')) {
        res.status(400).json({ ok: false, error: { code: 'LOCAL_ROW', message: 'A duplicated local row has no Trello card to label.' } });
        return;
      }
      if (!trello) {
        res.status(503).json({ ok: false, error: { code: 'TRELLO_NOT_CONFIGURED', message: 'TRELLO_API_KEY / TRELLO_TOKEN are not set.' } });
        return;
      }

      const before = doc.urgency;
      const after = body.data.urgent ? 'Urgent' : 'Non-Urgent';
      try {
        await trello.setUrgency(cardId, boardId, body.data.urgent);
        doc.urgency = after;
        await doc.save();
        await audit({ project_id: projectId, actor, action: 'urgency.set', entity: 'deliverable', entity_id: cardId, before: { urgency: before }, after: { urgency: after } });
        await SyncRun.create({ project_id: projectId, source: 'trello_write', ok: true, stats: { cardId, urgent: body.data.urgent } });
        res.json({ ok: true, urgency: after });
      } catch (err) {
        // local state untouched — the UI's optimistic change reverts (FR-4.7)
        const message = (err as Error).message;
        await audit({ project_id: projectId, actor, action: 'urgency.set_failed', entity: 'deliverable', entity_id: cardId, before: { urgency: before }, after: { attempted: after, error: message } });
        await SyncRun.create({ project_id: projectId, source: 'trello_write', ok: false, error: message, stats: { cardId, urgent: body.data.urgent } });
        res.status(502).json({ ok: false, error: { code: 'TRELLO_WRITE_FAILED', message } });
      }
    },
  );

  return router;
}
