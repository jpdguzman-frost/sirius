/**
 * Requests routes (T039 + T094; FR-3.x, FR-11) — read-only mirror of the
 * intake sheet, plus the one Sirius-owned annotation: the frost note.
 *
 * Status derives from the Trello join and the note, never stored (FR-11.3,
 * amends FR-3.3):
 *   MC group has deliverables → 'In Pipeline'
 *   else clarification flag   → 'With Clarification'
 *   else                      → 'For Filing'
 * A remark alone never changes status (FR-11.4, AC-21).
 *
 * Notes never touch the sheet (FR-11.2) — no Sheets write path exists
 * anywhere; the service account stays spreadsheets.readonly (FR-8.2/8.3).
 * Filters: filed / unfiled / clarification / missing-deadline (FR-3.6).
 * Sync status + last-success surfaces here (FR-8.6, AC-19).
 */

import { Router } from 'express';
import { z } from 'zod';
import type { Types } from 'mongoose';
import { Deliverable, FrostNote, IntakeReject, IntakeRequest, SyncRun } from '../models/index.ts';
import { ensureAuthenticated, type SessionUser } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { audit } from '../services/audit.ts';

const notePut = z
  .object({
    remark: z.string().max(2000).nullable().optional(),
    clarify: z.boolean(),
    clarify_reason: z.string().max(500).nullable().optional(),
  })
  .strict();

type NoteShape = { remark: string | null; clarify: boolean; clarify_reason: string | null };

const noteOf = (n: { remark?: string | null; clarify?: boolean; clarify_reason?: string | null } | null): NoteShape | null =>
  n ? { remark: n.remark ?? null, clarify: Boolean(n.clarify), clarify_reason: n.clarify_reason ?? null } : null;

export function requestsRouter(): Router {
  const router = Router();

  router.get(
    '/api/projects/:projectId/requests',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const projectId = res.locals.project._id;
      const filter = String(req.query.filter ?? '');

      const requests = await IntakeRequest.find({ project_id: projectId, active: true }).sort({
        sheet_row: 1,
      });
      const filedMcs = new Set(
        (await Deliverable.find({ project_id: projectId, active: true }).select('mc_number')).map(
          (d) => d.mc_number,
        ),
      );
      const notes = new Map(
        (await FrostNote.find({ project_id: projectId }).lean()).map((n) => [n.mc_number, n]),
      );

      let rows = requests.map((r) => {
        const note = notes.get(r.mc_number) ?? null;
        // FR-11.3: derived, never stored — pipeline wins over the flag
        const status = filedMcs.has(r.mc_number)
          ? 'In Pipeline'
          : note?.clarify
            ? 'With Clarification'
            : 'For Filing';
        return {
          mc_number: r.mc_number,
          sheet_row: r.sheet_row,
          name: r.name,
          requestor: r.requestor,
          asset_type: r.asset_type,
          use_case: r.use_case,
          brief: r.brief,
          deadline: r.deadline ?? null,
          status,
          note: noteOf(note),
        };
      });
      // FR-11.5 tile counts, from the unfiltered set
      const counts = {
        requests: rows.length,
        inPipeline: rows.filter((r) => r.status === 'In Pipeline').length,
        forFiling: rows.filter((r) => r.status === 'For Filing').length,
        forClarification: rows.filter((r) => r.status === 'With Clarification').length,
      };
      if (filter === 'filed') rows = rows.filter((r) => r.status === 'In Pipeline');
      if (filter === 'unfiled') rows = rows.filter((r) => r.status !== 'In Pipeline');
      if (filter === 'filing') rows = rows.filter((r) => r.status === 'For Filing');
      if (filter === 'clarification') rows = rows.filter((r) => r.status === 'With Clarification');
      if (filter === 'missing-deadline') rows = rows.filter((r) => !r.deadline);

      const rejects = await IntakeReject.find({ project_id: projectId }).sort({ sheet_row: 1 });
      const lastRun = await SyncRun.findOne({ project_id: projectId, source: 'sheet' }).sort({ at: -1 });
      const lastGood = lastRun?.ok
        ? lastRun
        : await SyncRun.findOne({ project_id: projectId, source: 'sheet', ok: true }).sort({ at: -1 });

      res.json({
        ok: true,
        requests: rows,
        counts,
        rejects: rejects.map((r) => ({ sheet_row: r.sheet_row, raw: r.raw, reason: r.reason })),
        sync: {
          lastAttemptAt: lastRun?.at ?? null,
          lastAttemptOk: lastRun?.ok ?? null,
          lastSuccessAt: lastGood?.at ?? null,
          error: lastRun && !lastRun.ok ? lastRun.error : null,
        },
      });
    },
  );

  // FR-11: the note write. Optimistic on the client; the server is the truth
  // and every change lands in audit_log (FR-11.6, invariant 10).
  router.put(
    '/api/projects/:projectId/requests/:mc/note',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const parsed = notePut.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY', issues: parsed.error.issues } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const mc = String(req.params.mc);
      const actor = (req.user as SessionUser).email;

      const request = await IntakeRequest.findOne({ project_id: projectId, mc_number: mc, active: true });
      if (!request) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }

      const remark = parsed.data.remark?.trim() || null;
      const clarify = parsed.data.clarify;
      const reason = clarify ? parsed.data.clarify_reason?.trim() || null : null;
      if (clarify && !reason) {
        // the flag marks the request as not fileable — that always needs a why
        res.status(400).json({ ok: false, error: { code: 'REASON_REQUIRED' } });
        return;
      }

      const existing = await FrostNote.findOne({ project_id: projectId, mc_number: mc });
      const before = noteOf(existing);
      const after: NoteShape | null =
        remark === null && !clarify ? null : { remark, clarify, clarify_reason: reason };

      if (JSON.stringify(before) === JSON.stringify(after)) {
        res.json({ ok: true, note: after, noop: true }); // idempotent — no audit echo
        return;
      }

      if (after === null) {
        await FrostNote.deleteOne({ project_id: projectId, mc_number: mc });
      } else {
        await FrostNote.updateOne(
          { project_id: projectId, mc_number: mc },
          { $set: { ...after, updated_by: actor, updated_at: new Date() } },
          { upsert: true },
        );
      }
      await audit({
        project_id: projectId,
        actor,
        action: after === null ? 'frost_note.cleared' : 'frost_note.set',
        entity: 'request',
        entity_id: mc,
        before,
        after,
      });
      res.json({ ok: true, note: after });
    },
  );

  return router;
}
