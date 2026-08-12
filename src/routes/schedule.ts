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
import { loadPipeline, manilaToday, toMilestones } from '../services/pipeline.ts';
import { ConflictAcknowledgement, Deliverable, MilestoneDayPlan, Sprint } from '../models/index.ts';
import { sprintIssues, suggestPlan, type PlannerCard } from '../../lib/planner.ts';
import { buildWeeks } from '../../lib/calendar.ts';
import { isHolidayDate, weekDays } from '../../lib/dayplan.ts';

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
      // FR-12.6: a moved week lapses the card's day placements — the read
      // side also week-checks, so this is the explicit-trigger half.
      if ('slotted_week' in parsed.data && before.slotted_week !== after.slotted_week) {
        const lapsed = await MilestoneDayPlan.deleteMany({ project_id: projectId, trello_card_id: cardId });
        if (lapsed.deletedCount > 0) after.dayPlanLapsed = lapsed.deletedCount;
      }
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
        const lapsed = before === move.week
          ? { deletedCount: 0 }
          : await MilestoneDayPlan.deleteMany({ project_id: projectId, trello_card_id: move.cardId }); // FR-12.6
        await audit({
          project_id: projectId, actor, action: 'schedule.replot', entity: 'deliverable',
          entity_id: move.cardId, before: { slotted_week: before },
          after: { slotted_week: move.week, ...(lapsed.deletedCount > 0 ? { dayPlanLapsed: lapsed.deletedCount } : {}) },
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

  // Conflict acknowledgements (FR-6.7/6.8; BR-9a; invariant 13): keyed on
  // the situation; must reach the audit log (phase 8a).
  router.post(
    '/api/projects/:projectId/conflicts/acknowledge',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z.object({ conflict_key: z.string().min(3).max(2000), reason: z.string().max(500).optional() }).strict().safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const actor = (req.user as SessionUser).email;
      await ConflictAcknowledgement.updateOne(
        { project_id: projectId, conflict_key: body.data.conflict_key },
        { $set: { acknowledged_by: actor, reason: body.data.reason ?? null, at: new Date() }, $setOnInsert: { project_id: projectId } },
        { upsert: true },
      );
      await audit({ project_id: projectId, actor, action: 'conflict.acknowledge', entity: 'conflict', entity_id: body.data.conflict_key, after: { reason: body.data.reason ?? null } });
      res.json({ ok: true });
    },
  );

  router.post(
    '/api/projects/:projectId/conflicts/restore',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z.object({ conflict_key: z.string().min(3).max(2000) }).strict().safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const actor = (req.user as SessionUser).email;
      await ConflictAcknowledgement.deleteOne({ project_id: projectId, conflict_key: body.data.conflict_key });
      await audit({ project_id: projectId, actor, action: 'conflict.restore', entity: 'conflict', entity_id: body.data.conflict_key });
      res.json({ ok: true });
    },
  );

  // FR-12: day placement on Deadlines. Never changes the week (FR-12.3) —
  // the day must sit inside the milestone's CURRENT week and off holidays
  // (FR-12.4 rejects drops). null clears back to the forecast default.
  router.put(
    '/api/projects/:projectId/deadlines/day',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z
        .object({
          cardId: z.string().min(1),
          phase: z.enum(['sketch', 'render']),
          day: DATE_ONLY.nullable(),
        })
        .strict()
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY', issues: body.error.issues } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const actor = (req.user as SessionUser).email;
      const { cardId, phase, day } = body.data;

      const pipeline = await loadPipeline(projectId, manilaToday());
      const milestone = toMilestones(pipeline.rows).find((m) => m.cardId === cardId && m.phase === phase);
      if (!milestone) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } }); // unslotted/unforecastable cards have no milestone
        return;
      }

      const existing = await MilestoneDayPlan.findOne({ project_id: projectId, trello_card_id: cardId, phase }).lean();
      const beforeDay = existing && existing.week === milestone.week ? existing.day : null;

      if (day === null) {
        if (!existing) {
          res.json({ ok: true, plannedDay: null, noop: true });
          return;
        }
        await MilestoneDayPlan.deleteOne({ project_id: projectId, trello_card_id: cardId, phase });
        await audit({
          project_id: projectId, actor, action: 'deadline.day_cleared', entity: 'deliverable',
          entity_id: cardId, before: { phase, day: beforeDay }, after: { phase, day: null },
        });
        res.json({ ok: true, plannedDay: null });
        return;
      }

      if (!weekDays(milestone.week).includes(day)) {
        res.status(400).json({ ok: false, error: { code: 'DAY_OUTSIDE_WEEK', week: milestone.week } });
        return;
      }
      if (isHolidayDate(day)) {
        res.status(400).json({ ok: false, error: { code: 'HOLIDAY' } }); // holidays take zero and reject drops
        return;
      }
      if (beforeDay === day) {
        res.json({ ok: true, plannedDay: day, noop: true });
        return;
      }
      await MilestoneDayPlan.updateOne(
        { project_id: projectId, trello_card_id: cardId, phase },
        { $set: { day, week: milestone.week, set_by: actor, set_at: new Date() } },
        { upsert: true },
      );
      await audit({
        project_id: projectId, actor, action: 'deadline.day_set', entity: 'deliverable',
        entity_id: cardId, before: { phase, day: beforeDay }, after: { phase, day, week: milestone.week },
      });
      res.json({ ok: true, plannedDay: day });
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
