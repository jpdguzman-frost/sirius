/**
 * Schedule routes — the ONLY write surface for Sirius-owned planning fields
 * (slotted week, pin, confidence, SLA overrides, status note, weekly
 * capacity; FR-5.x).
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
import { HARD_MIX } from '../../lib/planner.constants.ts';
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

/**
 * One sprint-save rejection. Widens `SprintIssue.kind` (lib/planner) with the
 * route-owned `duplicate-name` so both classes travel in the SAME
 * 422 SPRINT_CONFLICT envelope the client already reads.
 */
interface SprintSaveIssue {
  id: string;
  kind: string;
  text: string;
}

/**
 * Per-project duplicate sprint name rejection (owl #28, batch 4) — SERVER
 * TRUTH beside the modal's live check. Names compare trimmed and
 * case-insensitively, so `Sprint 46` and ` sprint 46 ` collide. Uniqueness is
 * per project by construction: the route only ever sees one project's list,
 * and the same name in another project is untouched (invariant 1).
 *
 * It lives here, NOT in lib/** — lib/planner.ts is constitution-frozen
 * (invariant 5) and this is a route-layer validation, not planner logic.
 * One issue per duplicated name, never one per extra row, so a triple reports
 * once. The copy matches the modal's error banner verbatim so the client's
 * `issues[0].text` fallback reads identically to the live banner.
 *
 * BLANKS ARE NOT ITS PROBLEM — `blankNameIssues` owns that class, and the
 * caller hands this only the named rows. Two unnamed rows would otherwise
 * collide on the key `''` and report as `Multiple sprints are named ""`, which
 * is both wrong and unreadable (owl #37 item 2). Filtering at the boundary
 * rather than inside keeps the rule stated once.
 */
function duplicateNameIssues(sprints: { id: string; name: string }[]): SprintSaveIssue[] {
  const firstSeen = new Map<string, string>();
  const reported = new Set<string>();
  const issues: SprintSaveIssue[] = [];
  sprints.forEach((s) => {
    const key = s.name.trim().toLocaleLowerCase();
    const first = firstSeen.get(key);
    if (first === undefined) {
      firstSeen.set(key, s.name.trim());
      return;
    }
    if (reported.has(key)) return;
    reported.add(key);
    issues.push({
      id: s.id,
      kind: 'duplicate-name',
      text: `Multiple sprints are named "${first}". Give each sprint a unique name to save.`,
    });
  });
  return issues;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * '2026-08-17' → '17 Aug 2026' — the client's `fmtLongIso` (frontend/scripts/10-constants.js),
 * reproduced as pure string math so the two sides emit byte-identical copy:
 * no `Date` (no TZ shift, invariant 11) and no locale (en-GB says 'Sept').
 */
function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  /* DATE_ONLY only proves the SHAPE — `2026-00-17` and `2026-13-17` both match
     its two-digit month — so an out-of-range month would index past the table
     and render the word `undefined` into copy the modal shows verbatim. Fall
     back to the raw month rather than to a lie. */
  const month = MONTHS_SHORT[Number(m) - 1] ?? m;
  return `${Number(d)} ${month} ${y}`;
}

/**
 * Blank sprint name rejection (owl #37 item 2, Miles) — SERVER TRUTH beside the
 * modal's live check, same envelope as duplicates. A nameless sprint is
 * unidentifiable in the Gantt's sprint headers, so `''` and whitespace-only are
 * one class and both reject.
 *
 * ONE issue per blank ROW (unlike duplicates, which are one per NAME): every
 * unnamed row is its own thing to fix, and there is no shared name to point at.
 * The row is named by the only identity it still has — its start date, which
 * `DATE_ONLY` guarantees is present and `YYYY-MM-DD` here.
 *
 * Route-layer validation, never lib/** (invariant 5).
 */
function blankNameIssues(sprints: { id: string; name: string; start: string }[]): SprintSaveIssue[] {
  const issues: SprintSaveIssue[] = [];
  sprints.forEach((s) => {
    if (s.name.trim() !== '') return;
    issues.push({
      id: s.id,
      kind: 'blank-name',
      text: `A sprint starting ${longDate(s.start)} has no name. Name every sprint to save.`,
    });
  });
  return issues;
}

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
            // `.min(1)` deliberately absent: an empty name is a USER mistake with
            // a friendly fix, not a malformed body. Zod would answer 400
            // INVALID_BODY — an envelope carrying no `issues[]` at all — and the
            // modal's `issues[0].text` fallback would print a developer string.
            // blankNameIssues owns the whole blank class on the 422 path instead.
            // `.max(80)` still guards the field length (owl #37 item 2).
            z.object({ id: z.string().optional(), name: z.string().max(80), start: DATE_ONLY, end: DATE_ONLY }).strict(),
          ).max(100),
        })
        .strict()
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      // Every validator runs BEFORE any write: a rejected save must leave the
      // collection exactly as it was (the replace below is destructive).
      // Overlaps/inversions are invariant 12, already enforced by sprintIssues;
      // duplicate names are the batch-4 addition; blank names the batch-5b one.
      // Same envelope, so the client reads one issues[] whichever class fired.
      // Blanks append LAST so issues[0] is unchanged for every pre-existing case.
      /* Identity is settled ONCE, here: a row the client has not persisted yet
         has no id, and `new-<index>` was previously re-derived inside each
         validator, which is why they all carried an index parameter. Settling
         it up front also keeps ids stable under the blank-name filter below. */
      const rows = body.data.sprints.map((s, i) => ({
        id: s.id ?? `new-${i}`, name: s.name, start: s.start, end: s.end,
      }));
      const issues: SprintSaveIssue[] = [
        ...sprintIssues(rows).filter((i) => i.kind !== 'gap'), // gaps are legal and surfaced, not rejected (BR-5)
        ...duplicateNameIssues(rows.filter((s) => s.name.trim() !== '')),
        ...blankNameIssues(rows),
      ];
      if (issues.length > 0) {
        res.status(422).json({ ok: false, error: { code: 'SPRINT_CONFLICT', issues } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const before = await Sprint.find({ project_id: projectId }).sort({ position: 1 }).lean();
      await Sprint.deleteMany({ project_id: projectId });
      const sorted = [...body.data.sprints].sort((a, b) => (a.start < b.start ? -1 : 1));
      /* ONE round trip, not one per sprint. insertMany and not Promise.all:
         the writes are ordered (`position` is their index) and they land in a
         collection this request has just emptied, so concurrent unordered
         inserts would be the wrong shape. `project_id` is on every doc
         (invariant 1). */
      await Sprint.insertMany(sorted.map((s, i) => ({
        project_id: projectId, name: s.name, starts_on: s.start, ends_on: s.end, position: i + 1,
      })));
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
      const body = z.object({ conflict_key: z.string().min(3).max(8000), reason: z.string().max(500).optional() }).strict().safeParse(req.body);
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
      const body = z.object({ conflict_key: z.string().min(3).max(8000) }).strict().safeParse(req.body);
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

      const pipeline = await loadPipeline(projectId, manilaToday(), res.locals.project.weekly_capacity);
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

  // Cards/week (BR-6a): Sirius-internal planning data, the same class as
  // slotted_week and pins — no source system is touched, so this is NOT gated
  // by writes_enabled (which guards the Trello write registry alone). Audited
  // like every other state change (invariant 10).
  router.patch(
    '/api/projects/:projectId/capacity',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      // Capacity lock (owl #23): refuse BEFORE the body is even read — a locked
      // project has no valid capacity write, whatever the payload says, so a
      // malformed body on a locked project answers 403 and not 400. No audit
      // row: a refusal is not a state change (invariant 10 logs changes).
      if (res.locals.project.capacity_locked === true) {
        res.status(403).json({
          ok: false,
          error: {
            code: 'CAPACITY_LOCKED',
            message: 'Capacity is locked for this project — an admin can unlock it.',
          },
        });
        return;
      }
      const body = z.object({ weekly: z.number().int().min(1).max(2000) }).strict().safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY', issues: body.error.issues } });
        return;
      }
      const project = res.locals.project;
      const projectId = project._id as Types.ObjectId;
      const before = project.weekly_capacity;
      project.weekly_capacity = body.data.weekly;
      await project.save();
      await audit({
        project_id: projectId,
        actor: (req.user as SessionUser).email,
        action: 'capacity.set',
        entity: 'project',
        entity_id: String(projectId),
        before: { weekly_capacity: before },
        after: { weekly_capacity: body.data.weekly },
      });
      res.json({
        ok: true,
        // Same shape GET /deliverables emits — the client re-seats this
        // wholesale, so dropping a key here would strip it from the planner.
        capacity: {
          weekly: project.weekly_capacity,
          least: project.ref_week_least ?? null,
          typical: project.ref_week_typical ?? null,
          most: project.ref_week_most ?? null,
          effectiveWeeklyRate: project.effective_weekly_rate ?? null,
          hardIdeal: HARD_MIX.ideal,
          hardCeiling: HARD_MIX.ceiling,
          // Always false here by construction (a locked project never reaches
          // this echo), but the key must exist: the client re-seats `capacity`
          // wholesale, so omitting it would strip the slider's lock state.
          locked: project.capacity_locked === true,
        },
      });
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
      const pipeline = await loadPipeline(projectId, body.data.from, res.locals.project.weekly_capacity);
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
