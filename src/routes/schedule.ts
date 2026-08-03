/**
 * Schedule routes — the ONLY write surface for Sirius-owned planning fields
 * (slotted week, pin, confidence, SLA overrides, status note; FR-5.x).
 * Zod-strict bodies refuse anything Sirius doesn't own (§1.2). Every state
 * change writes the audit log (invariant 10). Sprint CRUD rejects overlaps
 * on save (FR-5.15, BR-5). Suggest plan proposes only (FR-5.8, BR-7).
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { ensureAuthenticated, type SessionUser } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { audit } from '../services/audit.ts';
import { loadPipeline } from '../services/pipeline.ts';
import { Deliverable, Sprint } from '../models/index.ts';
import { sprintIssues, suggestPlan, type PlannerCard } from '../../lib/planner.ts';
import { buildWeeks } from '../../lib/calendar.ts';

const DATE_ONLY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const planningPatch = z
  .object({
    slotted_week: DATE_ONLY.nullable().optional(),
    pinned: z.boolean().optional(),
    confidence: z.enum(['Average', '0.7', '0.85', '0.95']).optional(),
    sla_sketch: z.number().min(0).max(60).nullable().optional(),
    sla_render: z.number().min(0).max(60).nullable().optional(),
    status_note: z.string().max(500).nullable().optional(),
  })
  .strict(); // Trello-/sheet-owned fields are refused, not ignored

const SIRIUS_FIELDS = ['slotted_week', 'pinned', 'confidence', 'sla_sketch', 'sla_render', 'status_note'] as const;

export function scheduleRouter(): Router {
  const router = Router();

  router.patch(
    '/api/projects/:projectId/deliverables/:cardId/planning',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const parsed = planningPatch.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY', issues: parsed.error.issues } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const cardId = String(req.params.cardId);
      const doc = await Deliverable.findOne({ project_id: projectId, trello_card_id: cardId });
      if (!doc) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const f of SIRIUS_FIELDS) {
        if (f in parsed.data) {
          before[f] = doc.get(f) ?? null;
          after[f] = parsed.data[f as keyof typeof parsed.data] ?? null;
          doc.set(f, parsed.data[f as keyof typeof parsed.data] ?? null);
        }
      }
      await doc.save();
      await audit({
        project_id: projectId,
        actor: (req.user as SessionUser).email,
        action: 'schedule.planning',
        entity: 'deliverable',
        entity_id: cardId,
        before,
        after,
      });
      res.json({ ok: true });
    },
  );

  // Multi-row replot (BR-8): the client computes the relative shift with
  // lib/planner semantics; the server applies absolute weeks atomically-ish
  // and audits each move.
  router.post(
    '/api/projects/:projectId/replot',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z
        .object({ moves: z.array(z.object({ cardId: z.string(), week: DATE_ONLY.nullable() })).min(1).max(500) })
        .strict()
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const actor = (req.user as SessionUser).email;
      let moved = 0;
      for (const move of body.data.moves) {
        const doc = await Deliverable.findOne({ project_id: projectId, trello_card_id: move.cardId });
        if (!doc || doc.pinned) continue; // pinned rows are immovable (FR-5.9)
        const before = doc.slotted_week ?? null;
        doc.slotted_week = move.week;
        await doc.save();
        await audit({
          project_id: projectId, actor, action: 'schedule.replot', entity: 'deliverable',
          entity_id: move.cardId, before: { slotted_week: before }, after: { slotted_week: move.week },
        });
        moved++;
      }
      res.json({ ok: true, moved });
    },
  );

  // Duplicate a row WITHOUT its Trello or Figma links (FR-5.12).
  router.post(
    '/api/projects/:projectId/deliverables/:cardId/duplicate',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const projectId = res.locals.project._id as Types.ObjectId;
      const src = await Deliverable.findOne({ project_id: projectId, trello_card_id: String(req.params.cardId) });
      if (!src) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const copy = await Deliverable.create({
        project_id: projectId,
        mc_number: src.mc_number,
        display_id: `${src.display_id} (copy)`,
        trello_card_id: localId,
        name: `${src.name} (copy)`,
        current_list: src.current_list,
        difficulty: src.difficulty,
        lane: src.lane,
        labels: src.labels,
        sheet_deadline: src.sheet_deadline,
        use_case: src.use_case,
        brief: src.brief,
        requestor: src.requestor,
        confidence: src.confidence,
        // deliberately NOT inherited: trello_url, figma_url, trello_due
      });
      await audit({
        project_id: projectId, actor: (req.user as SessionUser).email, action: 'schedule.duplicate',
        entity: 'deliverable', entity_id: localId, before: { source: src.trello_card_id }, after: { display_id: copy.display_id },
      });
      res.json({ ok: true, cardId: localId });
    },
  );

  // Sprint list replace: overlaps and inversions reject the SAVE (FR-5.15).
  router.put(
    '/api/projects/:projectId/sprints',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z
        .object({
          sprints: z.array(
            z.object({ id: z.string().optional(), name: z.string().min(1).max(80), start: DATE_ONLY, end: DATE_ONLY }).strict(),
          ).max(100),
        })
        .strict()
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const issues = sprintIssues(
        body.data.sprints.map((s, i) => ({ id: s.id ?? `new-${i}`, name: s.name, start: s.start, end: s.end })),
      ).filter((i) => i.kind !== 'gap'); // gaps are legal and surfaced, not rejected (BR-5)
      if (issues.length > 0) {
        res.status(422).json({ ok: false, error: { code: 'SPRINT_CONFLICT', issues } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const before = await Sprint.find({ project_id: projectId }).sort({ position: 1 }).lean();
      await Sprint.deleteMany({ project_id: projectId });
      const sorted = [...body.data.sprints].sort((a, b) => (a.start < b.start ? -1 : 1));
      for (let i = 0; i < sorted.length; i++) {
        await Sprint.create({
          project_id: projectId, name: sorted[i]!.name, starts_on: sorted[i]!.start, ends_on: sorted[i]!.end, position: i + 1,
        });
      }
      await audit({
        project_id: projectId, actor: (req.user as SessionUser).email, action: 'sprints.replace', entity: 'sprint',
        before: { sprints: before.map((s) => ({ name: s.name, start: s.starts_on, end: s.ends_on })) },
        after: { sprints: sorted },
      });
      res.json({ ok: true });
    },
  );

  // Suggest plan: PROPOSES only — nothing applies until the client accepts
  // and calls /replot explicitly (FR-5.7, FR-5.8, BR-7, AC-15).
  router.post(
    '/api/projects/:projectId/suggest',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z
        .object({ from: DATE_ONLY, weeks: z.number().int().min(1).max(26).default(8) })
        .strict()
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const pipeline = await loadPipeline(projectId, body.data.from);
      const cards: PlannerCard[] = pipeline.rows
        .filter((r) => r.status !== 'done')
        .map((r) => ({
          id: r.cardId,
          difficulty: r.difficulty ?? undefined,
          currentList: r.currentList ?? '',
          labels: [],
          startDate: r.slottedWeek ?? body.data.from,
          deadline: r.deadline,
          urgency: r.urgency,
          pinned: r.pinned,
          week: r.slottedWeek ?? 'Unscheduled',
          blocker: r.blocker,
        }));
      const weeks = buildWeeks(body.data.from, body.data.weeks);
      const result = suggestPlan(cards, weeks, { capacity: res.locals.project.weekly_capacity });
      res.json({ ok: true, ...result, weekKeys: weeks.map((w) => w.key) });
    },
  );

  return router;
}
