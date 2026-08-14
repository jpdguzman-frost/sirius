/**
 * Requests routes (T039 + T094; FR-3.x, FR-11) — read-only mirror of the
 * intake sheet, plus the one Sirius-owned annotation: the frost note.
 *
 * Status derives from the Trello join and the note, never stored (FR-11.3,
 * amends FR-3.3; names corrected by owls #13–#15, 2026-08-14):
 *   MC group has deliverables → 'In Pipeline'   (wins over the flag)
 *   else clarification flag   → 'For Clarification'
 *   else                      → 'To File'
 * A remark alone never changes status (FR-11.4, AC-21).
 *
 * The tile counts are CROSS-CUTTING, not a partition of the three statuses
 * (owl #14): `toFile` is EVERY unfiled row, flagged ones included, so
 * requests = inPipeline + toFile and `forClarification` is a subset of
 * `toFile`. A filed+flagged row is In Pipeline only — never clarification.
 *
 * The note is a SINGLE freeform box (owl #15): the remark carries notes and
 * clarifications alike, so the flag requires the remark (REMARK_REQUIRED) and
 * new writes store clarify_reason null. The field stays in the accepted body
 * for API compatibility (a browser still running the pre-owl-#15 bundle posts
 * it on every flagged save), and legacy rows keep their text: the GET returns
 * both fields verbatim and the reader joins them, so a legacy row carrying a
 * remark AND a reason shows — and re-saves — both.
 *
 * The deadline is RESOLVED, not the sheet cell (invariant 14 / BR-9, same
 * precedence as deliverables_v): the MC group's earliest Trello due wins,
 * else the sheet date, else none — mc_number is not unique (invariant 3),
 * so the whole group is scanned.
 *
 * Notes never touch the sheet (FR-11.2) — no Sheets write path exists
 * anywhere; the service account stays spreadsheets.readonly (FR-8.2/8.3).
 * Filters: filed / unfiled / clarification / missing-deadline (FR-3.6);
 * missing-deadline tests the resolved value.
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

/* The derived-status vocabulary, named ONCE on the side that owns it. The
 * client mirrors these three strings; a rename here is one table, not nine
 * literals scattered through the derivation, the counts and the filters. */
const STATUS = { filed: 'In Pipeline', clarify: 'For Clarification', toFile: 'To File' } as const;

type SegmentRow = { status: string; deadline: string | null };
type Segment = (r: SegmentRow) => boolean;
/* ONE predicate table for the ?filter= branches AND the tile counts, so the
 * cross-cutting rule (owl #14: unfiled is NOT In Pipeline, flagged included)
 * cannot be spelled two ways that silently drift apart. FR-3.6. */
const SEGMENTS = {
  filed: (r) => r.status === STATUS.filed,
  unfiled: (r) => r.status !== STATUS.filed,
  clarification: (r) => r.status === STATUS.clarify,
  'missing-deadline': (r) => !r.deadline,
} satisfies Record<string, Segment>;

export function requestsRouter(): Router {
  const router = Router();

  router.get(
    '/api/projects/:projectId/requests',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const projectId = res.locals.project._id;
      const filter = String(req.query.filter ?? '');

      // every read here is flattened into plain literals below — no document
      // methods, no virtuals, no save — so all of them are .lean().
      // The five are mutually independent (each keyed on project_id alone,
      // none consumes another's result), so they fan out in ONE round trip
      // instead of five serial ones — only `lastGood` genuinely waits on
      // `lastRun`. Invariant 1: project_id still filters every query.
      const [requests, deliverables, noteRows, rejects, lastRun] = await Promise.all([
        IntakeRequest.find({ project_id: projectId, active: true }).sort({ sheet_row: 1 }).lean(),
        Deliverable.find({ project_id: projectId, active: true }).select('mc_number trello_due').lean(),
        FrostNote.find({ project_id: projectId }).lean(),
        IntakeReject.find({ project_id: projectId }).sort({ sheet_row: 1 }).lean(),
        SyncRun.findOne({ project_id: projectId, source: 'sheet' }).sort({ at: -1 }).lean(),
      ]);
      const filedMcs = new Set(deliverables.map((d) => d.mc_number));
      // invariant 14: earliest Trello due per MC group — date-only strings
      // compare lexicographically (mapper stores them YYYY-MM-DD)
      const trelloDue = new Map<string, string>();
      for (const d of deliverables) {
        if (!d.mc_number || !d.trello_due) continue;
        const seen = trelloDue.get(d.mc_number);
        if (seen === undefined || d.trello_due < seen) trelloDue.set(d.mc_number, d.trello_due);
      }
      const notes = new Map(noteRows.map((n) => [n.mc_number, n]));

      let rows = requests.map((r) => {
        const note = notes.get(r.mc_number) ?? null;
        // FR-11.3: derived, never stored — pipeline wins over the flag
        const status = filedMcs.has(r.mc_number)
          ? STATUS.filed
          : note?.clarify
            ? STATUS.clarify
            : STATUS.toFile;
        const due = trelloDue.get(r.mc_number) ?? null;
        const sheetDeadline = r.deadline ?? null;
        return {
          mc_number: r.mc_number,
          sheet_row: r.sheet_row,
          name: r.name,
          requestor: r.requestor,
          asset_type: r.asset_type,
          use_case: r.use_case,
          brief: r.brief,
          deadline: due ?? sheetDeadline,
          deadline_source: due ? 'trello' : sheetDeadline ? 'sheet' : null,
          year: r.year ?? null,
          month: r.month ?? null,
          status,
          note: noteOf(note),
        };
      });
      // FR-11.5 tile counts, from the unfiltered set — cross-cutting (owl #14):
      // toFile is every unfiled row, so requests = inPipeline + toFile, and
      // forClarification is a subset of toFile rather than a fourth bucket.
      // toFile is the ARITHMETIC complement, which states that invariant in
      // code instead of leaving two independent scans to agree by luck.
      const inPipeline = rows.filter(SEGMENTS.filed).length;
      const counts = {
        requests: rows.length,
        inPipeline,
        toFile: rows.length - inPipeline,
        forClarification: rows.filter(SEGMENTS.clarification).length,
      };
      // hasOwn, not a bare lookup: `?filter=__proto__` must miss the table,
      // not reach Object.prototype
      const seg = Object.hasOwn(SEGMENTS, filter) ? (SEGMENTS[filter as keyof typeof SEGMENTS] as Segment) : null;
      if (seg) rows = rows.filter(seg);

      const lastGood = lastRun?.ok
        ? lastRun
        : await SyncRun.findOne({ project_id: projectId, source: 'sheet', ok: true })
            .sort({ at: -1 })
            .lean();

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
      if (clarify && !remark) {
        // owl #15: one box holds notes and clarifications alike, so the flag —
        // which marks the request not fileable — needs THAT box filled in
        res.status(400).json({ ok: false, error: { code: 'REMARK_REQUIRED' } });
        return;
      }

      const existing = await FrostNote.findOne({ project_id: projectId, mc_number: mc });
      const before = noteOf(existing);
      // clarify_reason is retired by the single-box model (owl #15) — still
      // accepted in the body for API compat, never stored again; legacy rows
      // keep their text until the next write nulls it
      const after: NoteShape | null =
        remark === null && !clarify ? null : { remark, clarify, clarify_reason: null };

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
