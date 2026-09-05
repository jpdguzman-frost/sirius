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
 *  - W2 writes the WORK CARD too, since the same owl's §2 (block 3,
 *    2026-09-05): "deadlines live on work cards" — Pipeline shows the date
 *    read-only and the setter is the Sprint Schedules DEADLINE cell. The
 *    deliverable route (JP's 2026-08-18 "either kind" scope note, owl #45)
 *    was DELETED on the block-1 precedent above, not left dormant. A main
 *    card's own due still reconciles IN through ARES and still leads
 *    invariant 14's precedence in `deliverables_v` — read-only in Sirius,
 *    changed in Trello only. The contract's §W2 scope narrows with it.
 *
 * What every entry SHARES — the Trello-first order, the stamp, the audit and
 * sync_runs rows, the 502 — lives in `commitRegistryWrite` below, stated once
 * there. Each route holds only what is its own: the body schema, the no-op
 * guard where it has one, the setter it calls and the field it moves.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Types } from 'mongoose';
import { ensureAuthenticated, type SessionUser } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { audit } from '../services/audit.ts';
import { SyncRun, WorkCard } from '../models/index.ts';
import { composeDueIso, type TrelloWriter } from '../../lib/trello.ts';
import type { Env } from '../config/env.ts';

/**
 * THE ONE document kind a registry write targets: the work card. W1, W2 and
 * W3 all write it (the header). The door was generic over a card kind while
 * W2 still had a deliverable route; block 3 deleted that route, and the
 * generic, the second lookup arm and the `kind` threaded through every commit
 * went with it (simplification pass 2026-09-05, S-1/ALT-2) — a live lookup
 * path into a collection no registry entry may write is exactly the dormant
 * write path the header refuses to keep. A future main-card entry is a
 * constitution amendment and brings its own branch with it.
 */
type RegistryDoc = InstanceType<typeof WorkCard>;

interface WriteContext {
  projectId: Types.ObjectId;
  boardId: string;
  cardId: string;
  actor: string;
  doc: RegistryDoc;
  trello: TrelloWriter;
}

/**
 * Guards shared by every registry write; responds and returns null on refusal.
 * The card is looked up in the WORK CARD collection and nowhere else — a main
 * card's id is a 404 like any other stranger's, which is the cross-kind guard
 * every route relies on. Every refusal guard is the same for every entry,
 * which is the point of the ONE door (src/CLAUDE.md rule 3).
 */
async function writeGuards(env: Env, trello: TrelloWriter | null, req: Request, res: Response): Promise<WriteContext | null> {
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
  const doc = await WorkCard.findOne({ project_id: projectId, trello_card_id: cardId, active: true });
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

/** What one registry entry has to say about itself to be committed. */
interface RegistryCommit {
  /** audit action stem — `<action>.set` on success, `<action>.set_failed` on failure */
  action: 'urgency' | 'due' | 'difficulty';
  /** the document field the audit's before/after snapshots are keyed on */
  field: 'urgency' | 'trello_due' | 'difficulty';
  before: string | null;
  after: string | null;
  /** what this entry adds to the sync_runs stats, beside cardId and the card kind */
  stats: Record<string, unknown>;
  /** Trello FIRST, then the document field — see the order note below */
  apply: () => Promise<void>;
  /** the success response body */
  respond: Record<string, unknown>;
}

/**
 * The commit half of EVERY registry write — one place, so W1, W2 and W3 cannot
 * drift apart on the guarantees they all owe (simplification pass 2026-09-05;
 * the three had hand-written the same shape).
 *
 * Order of operations makes the rollback guarantee structural: `apply()` calls
 * Trello FIRST and changes the local field only after Trello succeeded, so a
 * throw leaves the document exactly as it was — Sirius never displays a state
 * Trello lacks (invariant 8), and the UI's optimistic change reverts. Every
 * attempt, success or failure, writes audit_log AND sync_runs (invariant 10:
 * one act, one row).
 *
 * Every success also stamps `registry_written_at`, which is what stops a
 * reconcile holding an older ARES read from reverting the value a moment
 * later (product owl #50; the guard itself is `staleGuard` in
 * worker/syncAres.ts). It is stamped on the SUCCESS path only: a failed write
 * left Trello unchanged, so there is nothing for a later read to contradict.
 */
async function commitRegistryWrite(
  ctx: WriteContext,
  res: Response,
  { action, field, before, after, stats, apply, respond }: RegistryCommit,
): Promise<void> {
  // the audit row's `entity` and the run's `kind` name the one card kind the
  // registry writes — stated here, once, rather than by every caller
  const entry = { project_id: ctx.projectId, actor: ctx.actor, entity: 'work_card', entity_id: ctx.cardId };
  const runStats = { cardId: ctx.cardId, kind: 'work_card', ...stats };
  try {
    await apply();
    ctx.doc.registry_written_at = new Date();
    await ctx.doc.save();
    await audit({ ...entry, action: `${action}.set`, before: { [field]: before }, after: { [field]: after } });
    await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: true, stats: runStats });
    res.json(respond);
  } catch (err) {
    const message = (err as Error).message;
    await audit({ ...entry, action: `${action}.set_failed`, before: { [field]: before }, after: { attempted: after, error: message } });
    await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: false, error: message, stats: runStats });
    res.status(502).json({ ok: false, error: { code: 'TRELLO_WRITE_FAILED', message } });
  }
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
      const ctx = await writeGuards(env, trello, req, res);
      if (!ctx) return;

      const doc = ctx.doc; // the work card — W1's only surface since #78
      const before = doc.urgency;
      const after = body.data.urgent ? 'Urgent' : 'Non-Urgent';
      await commitRegistryWrite(ctx, res, {
        action: 'urgency',
        field: 'urgency',
        before,
        after,
        stats: { urgent: body.data.urgent },
        apply: async () => {
          await ctx.trello.setUrgency(ctx.cardId, ctx.boardId, body.data.urgent);
          doc.urgency = after;
        },
        respond: { ok: true, urgency: after },
      });
    },
  );

  // W2 — due date (FR-9.1) on the WORK CARD (owl #78 §2, block 3): date set
  // or cleared; 17:00 Manila default, existing time-of-day preserved
  // (contracts/trello-write.md W2 semantics). The setter is the Sprint
  // Schedules DEADLINE cell; Pipeline only reflects the date. From 2026-08-18
  // (JP's "either kind" scope note, owl #45) this handler was a factory over
  // the card kind and served a deliverable route beside this one; that route
  // is deleted and the kind is fixed, so a main card's id here is a 404 like
  // any other stranger. A work card's due plays no part in deliverable
  // precedence (invariant 14, `deliverables_v`) or forecasting; it IS the
  // date the card's schedule row is measured against (`deadlineFor`,
  // services/sprint-items.ts), so the Pipeline work row and the schedule's
  // tick read the one field this writes.
  const dueHandler = async (req: Request, res: Response) => {
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
    const ctx = await writeGuards(env, trello, req, res);
    if (!ctx) return;

    const doc = ctx.doc; // the work card — W2's only surface since #78 §2
    const before = doc.trello_due ?? null;
    const after = body.data.date;
    if (before === after) {
      // no-op guard: no Trello call, no audit row
      res.status(400).json({ ok: false, error: { code: 'NO_OP', message: 'The due date already has this value.' } });
      return;
    }

    const dueIso = after === null ? null : composeDueIso(after, doc.trello_due_at ?? null);
    await commitRegistryWrite(ctx, res, {
      action: 'due',
      field: 'trello_due',
      before,
      after,
      stats: { due: after },
      apply: async () => {
        await ctx.trello.setDue(ctx.cardId, dueIso);
        doc.trello_due = after;
        doc.trello_due_at = dueIso ? new Date(dueIso) : null;
      },
      respond: { ok: true, trello_due: after },
    });
  };

  router.patch(
    '/api/projects/:projectId/workcards/:cardId/deadline',
    ensureAuthenticated,
    ensureProjectMember,
    dueHandler,
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
      const ctx = await writeGuards(env, trello, req, res);
      if (!ctx) return;

      const doc = ctx.doc; // the work card — W3's only surface since #78
      const before = doc.difficulty ?? null;
      const after = body.data.difficulty;
      if (before === after) {
        // no-op guard: no Trello call, no audit row
        res.status(400).json({ ok: false, error: { code: 'NO_OP', message: 'The difficulty already has this value.' } });
        return;
      }

      await commitRegistryWrite(ctx, res, {
        action: 'difficulty',
        field: 'difficulty',
        before,
        after,
        stats: { difficulty: after },
        apply: async () => {
          await ctx.trello.setDifficulty(ctx.cardId, ctx.boardId, after);
          doc.difficulty = after;
        },
        respond: { ok: true, difficulty: after },
      });
    },
  );

  return router;
}
