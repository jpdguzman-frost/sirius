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
import { classifyList } from '../services/status-rules.ts';
import { loadPipeline, manilaToday, toMilestones } from '../services/pipeline.ts';
import { ConflictAcknowledgement, Deliverable, MilestoneDayPlan, Sprint, SprintItem, WorkCard } from '../models/index.ts';
import { sprintIssues, suggestPlan, type PlannerCard } from '../../lib/planner.ts';
import { HARD_MIX } from '../../lib/planner.constants.ts';
import { buildWeeks } from '../../lib/calendar.ts';
import { isHolidayDate, weekDays } from '../../lib/dayplan.ts';

/* Shape AND calendar validity (review 2026-08-28b, finding 8): the regex
   alone let `2026-08-32` through, and a stored non-date walks the forecast
   into NaN and a spurious LATE flag. Pure arithmetic — no `Date`, so no TZ
   shift (invariant 11) and no silent normalisation (`new Date('2026-02-30')`
   would happily answer March 2nd). One definition heals every route that
   takes a date: sprint dates, slotted week, both starts_on paths. */
const DATE_ONLY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  // slices, not split: the regex fixes the positions, and strict indexing
  // would type a destructured split as possibly-undefined
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (m < 1 || m > 12 || d < 1) return false;
  const feb = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return d <= ([31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] as number);
}, { message: 'not a calendar date' });

/* A Mongo id, validated IN THE SCHEMA rather than re-checked in the body.
   Written as a `min(1)` string plus a separate `isValid` branch first, which
   put the same four lines in two routes and — worse — answered 400 for a
   malformed `sprint_id` while the path-parameter check answered 404 for a
   malformed item id. Same class of bad input, two different answers. Zod owns
   it now, so a bad id in a BODY is a 400 with issues like every other field,
   and a bad id in a PATH stays a 404 because an unroutable id names nothing. */
const OBJECT_ID = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'not an id' });

/**
 * Why a batch add left one card out (owl #77 §0; PLAN.md B3). The three are
 * the single add's own refusals — 404 NOT_FOUND, 409 CARD_COMPLETE, 409
 * ALREADY_SCHEDULED — carried per id instead of per request, so the client
 * reads one vocabulary whichever route answered.
 */
type BatchSkipCode = 'NOT_FOUND' | 'CARD_COMPLETE' | 'ALREADY_SCHEDULED';


/**
 * CONFIDENCE AND THE TWO REVIEW-SLA OVERRIDES ARE NOT HERE — closed 2026-08-27
 * on JP's instruction, when the Forecast tab took their only UI with it.
 *
 * The engine still READS all three (`toRow` passes them to `forecast`), so a
 * stored value would keep moving every date the remaining tabs show, with no
 * control anywhere to see or clear it. Measured on the live board the day this
 * closed: nothing had a value — all 395 deliverables sat at the default
 * percentile and neither override was set anywhere — so there was nothing to
 * clear, and this is what stops one appearing while there is nowhere to see it.
 *
 * Product has PARKED these controls rather than dropped them (owl #67). When
 * they get a home, re-adding the three lines is the whole change; the storage,
 * the engine path and the audit trail were never touched.
 */
const planningPatch = z
  .object({
    slotted_week: DATE_ONLY.nullable().optional(),
    pinned: z.boolean().optional(),
    status_note: z.string().max(500).nullable().optional(),
  })
  .strict(); // Trello-/sheet-owned fields are refused, not ignored

const SIRIUS_FIELDS = ['slotted_week', 'pinned', 'status_note'] as const;

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
      /* IDS ARE PRESERVED, NEVER REGENERATED (review 2026-08-28, finding 1 —
         the one 'breaks' both lenses found independently). This route used to
         deleteMany + insertMany, minting fresh ObjectIds on every save. That
         was invisible while sprint membership was DERIVED from the slotted
         week; the moment #72 stored membership as `sprint_items.sprint_id`, a
         routine rename would have orphaned every scheduled row — gone from
         every group, still counted in the footer, its card locked out of the
         search list by the unique index, with no UI path back. So: a row whose id
         matches a live sprint is UPDATED in place; a row without one is
         inserted; a live sprint absent from the payload is removed, and its
         scheduled items are removed WITH it — the modal's confirm banner warns
         with the count first (Miles #30), which makes the cascade the promise
         kept rather than a surprise. An unknown id is refused, not treated as
         new: the client only ever sends ids it was handed, so an unknown one
         means the modal is editing a stale world and must reload. */
      const alive = new Set(before.map((b) => String(b._id)));
      const sorted = [...body.data.sprints].sort((a, b) => (a.start < b.start ? -1 : 1));
      const keptIds = new Set(sorted.flatMap((sp) => (sp.id ? [sp.id] : [])));
      if ([...keptIds].some((id) => !alive.has(id))) {
        res.status(409).json({ ok: false, error: { code: 'SPRINTS_STALE', message: 'The sprint list changed since this modal opened — reload and re-apply the edit.' } });
        return;
      }
      const removedIds = before.filter((b) => !keptIds.has(String(b._id))).map((b) => b._id);
      const orphaned = removedIds.length
        ? await SprintItem.find({ project_id: projectId, sprint_id: { $in: removedIds } }).lean()
        : [];
      if (removedIds.length) {
        await SprintItem.deleteMany({ project_id: projectId, sprint_id: { $in: removedIds } });
        await Sprint.deleteMany({ project_id: projectId, _id: { $in: removedIds } });
      }
      for (const [i, sp] of sorted.entries()) {
        if (sp.id) {
          await Sprint.updateOne(
            { _id: sp.id, project_id: projectId },
            { $set: { name: sp.name, starts_on: sp.start, ends_on: sp.end, position: i + 1 } },
          );
        } else {
          await Sprint.create({ project_id: projectId, name: sp.name, starts_on: sp.start, ends_on: sp.end, position: i + 1 });
        }
      }
      await audit({
        project_id: projectId, actor: (req.user as SessionUser).email, action: 'sprints.replace', entity: 'sprint',
        before: { sprints: before.map((s) => ({ id: String(s._id), name: s.name, start: s.starts_on, end: s.ends_on })) },
        after: {
          sprints: sorted,
          // the cascade is part of the same act, so it audits in the same row:
          // which cards left the schedule because their sprint was removed
          removed_items: orphaned.map((o) => ({ card_id: o.trello_card_id, mc_number: o.mc_number, starts_on: o.starts_on ?? null })),
        },
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

  /* ------------------------------------------------------------------ */
  /* Sprint Schedules — the scheduled row. THE UNIT IS THE WORK CARD.     */
  /* owl miles→jp #72; BRD v2.7 / BR-1a.                                  */
  /*                                                                      */
  /* Sirius-owned planning data, like slotted_week and pins: no source     */
  /* system is touched, so these are NOT gated on `writes_enabled`, which  */
  /* guards the three-entry Trello registry alone. Audited like every      */
  /* other state change (invariant 10).                                    */
  /* ------------------------------------------------------------------ */

  /* ADD a work card to a sprint's list — the search row's per-row `Add`
     (owl #77 §0). Without `starts_on` the row lands UNPLOTTED: added and
     plotted are two separate acts (#72 §6), and the violet + on the committed
     row is what turns one into the other. `starts_on` stays OPTIONAL on this
     body as a tested contract (PLAN.md B13, block 2, 2026-09-05) — nothing in
     the search flow sends it; a caller that does gets the row created already
     plotted, with the placement in the add's one audit row rather than an add
     plus a synthetic plot (invariant 10 logs the act, and there was one act).

     The sprint comes from the body because the insertion point carries
     meaning: the search row belongs to a specific sprint's list, so the row
     lands in THAT sprint and never in a default one (#72 §4). */
  router.post(
    '/api/projects/:projectId/sprint-items',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z
        .object({ sprint_id: OBJECT_ID, card_id: z.string().min(1), starts_on: DATE_ONLY.optional() })
        .strict()
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY', issues: body.error.issues } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const actor = (req.user as SessionUser).email;

      /* All three UNDER THE PROJECT (invariant 1) — a sprint id or a card id
         from another project is a 404 here, not a cross-project write. The
         tail probe depends only on the id already validated above, not on the
         sprint document, so it belongs in the same round trip rather than
         after it. */
      const [sprint, card, last] = await Promise.all([
        Sprint.findOne({ _id: body.data.sprint_id, project_id: projectId }).select({ _id: 1 }).lean(),
        WorkCard.findOne({ project_id: projectId, trello_card_id: body.data.card_id, active: true })
          .select({ trello_card_id: 1, mc_number: 1, current_list: 1 })
          .lean(),
        SprintItem.findOne({ project_id: projectId, sprint_id: body.data.sprint_id })
          .sort({ position: -1 })
          .select({ position: 1 })
          .lean(),
      ]);
      if (!sprint || !card) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      /* #72 §5: a card already complete is never OFFERED, and the server says
         the same thing the search list's pool does. This is the ADD-time
         filter — it governs what can be added and NEVER what is removed, so a
         row whose card completes later is untouched by it. */
      if (classifyList(card.current_list as string | undefined) === 'done') {
        res.status(409).json({
          ok: false,
          error: { code: 'CARD_COMPLETE', message: 'That task card is already complete — the schedule is for work still to be done.' },
        });
        return;
      }

      try {
        const created = await SprintItem.create({
          project_id: projectId,
          sprint_id: sprint._id,
          mc_number: card.mc_number,
          trello_card_id: card.trello_card_id,
          // optional on the single add (PLAN.md B13); absent → unplotted (#72 §6)
          starts_on: body.data.starts_on,
          position: ((last?.position as number) ?? -1) + 1,
          added_by: actor,
        });
        await audit({
          project_id: projectId, actor, action: 'sprintItem.add', entity: 'sprint_item',
          entity_id: String(created._id),
          after: { sprint_id: String(sprint._id), card_id: card.trello_card_id, mc_number: card.mc_number, starts_on: created.starts_on ?? null },
        });
        res.status(201).json({ ok: true, id: String(created._id) });
      } catch (err) {
        // one row per card (#72: one row = one task card = one bar)
        if ((err as { code?: number }).code === 11000) {
          res.status(409).json({
            ok: false,
            error: { code: 'ALREADY_SCHEDULED', message: 'That task card is already on the schedule.' },
          });
          return;
        }
        throw err;
      }
    },
  );

  /* ADD ALL — the search row's one act (owl #77 §0; PLAN.md B3, block 2,
     2026-09-05). The client sends exactly the ids its list shows, in list
     order, and the server answers PER CARD rather than for the batch: a card
     that is complete, already on the schedule, or not this project's is
     SKIPPED with a code and the rest still land. Never fatal, never
     confirmed, never re-checked against a count (Miles: "the list on screen
     IS the set"). One request rather than N single adds because MC-825 alone
     is 99 cards — 99 round trips with no order guarantee and a half-done
     schedule on a mid-way error.

     Rows land UNPLOTTED. The two-act rule (#72 §6) holds for a batch as for
     a single add, so this body has no `starts_on` and `.strict()` refuses
     one. Every created row is its own audit row (invariant 10 logs the act,
     and here the act is N rows) in the SAME `after` shape as the single add,
     so the log reads alike whichever route wrote it. */
  router.post(
    '/api/projects/:projectId/sprint-items/batch',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z
        .object({ sprint_id: OBJECT_ID, card_ids: z.array(z.string().min(1)).min(1).max(2000) })
        .strict()
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY', issues: body.error.issues } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const actor = (req.user as SessionUser).email;
      /* First occurrence wins the order. A repeated id is one card — not a
         second row, and not a skip either: the list never shows a card twice,
         so a duplicate in the body is a client echo, not a fact to report. */
      const ids = [...new Set(body.data.card_ids)];

      /* Everything UNDER THE PROJECT (invariant 1), one read per collection
         rather than one per id: the sprint's existence, the cards, the ids
         already on the schedule, and the tail — one round trip, as the single
         add does. A sprint from another project is a 404 and nothing is
         written; a card from another project simply is not found here, so it
         is a skip and never a cross-project write. */
      const [sprint, cards, scheduled, last] = await Promise.all([
        Sprint.findOne({ _id: body.data.sprint_id, project_id: projectId }).select({ _id: 1 }).lean(),
        WorkCard.find({ project_id: projectId, trello_card_id: { $in: ids }, active: true })
          .select({ trello_card_id: 1, mc_number: 1, current_list: 1 })
          .lean(),
        SprintItem.find({ project_id: projectId, trello_card_id: { $in: ids } })
          .select({ trello_card_id: 1 })
          .lean(),
        SprintItem.findOne({ project_id: projectId, sprint_id: body.data.sprint_id })
          .sort({ position: -1 })
          .select({ position: 1 })
          .lean(),
      ]);
      if (!sprint) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      const cardById = new Map(cards.map((c) => [c.trello_card_id as string, c]));
      const taken = new Set(scheduled.map((s) => s.trello_card_id as string));
      /* The tail is read ONCE and counted up per CREATED row, so the batch
         lands in list order after whatever the sprint already holds; a skip
         consumes no position, so the created rows stay contiguous. */
      let position = ((last?.position as number) ?? -1) + 1;
      let added = 0;
      const skipped: Array<{ card_id: string; code: BatchSkipCode }> = [];

      for (const id of ids) {
        const card = cardById.get(id);
        if (!card) {
          skipped.push({ card_id: id, code: 'NOT_FOUND' });
          continue;
        }
        // #72 §5: the add-time filter — the same answer the pool gives
        if (classifyList(card.current_list as string | undefined) === 'done') {
          skipped.push({ card_id: id, code: 'CARD_COMPLETE' });
          continue;
        }
        if (taken.has(id)) {
          skipped.push({ card_id: id, code: 'ALREADY_SCHEDULED' });
          continue;
        }
        try {
          const created = await SprintItem.create({
            project_id: projectId,
            sprint_id: sprint._id,
            mc_number: card.mc_number,
            trello_card_id: card.trello_card_id,
            // no `starts_on` — unplotted by construction (#72 §6)
            position,
            added_by: actor,
          });
          position += 1;
          added += 1;
          await audit({
            project_id: projectId, actor, action: 'sprintItem.add', entity: 'sprint_item',
            entity_id: String(created._id),
            after: { sprint_id: String(sprint._id), card_id: card.trello_card_id, mc_number: card.mc_number, starts_on: created.starts_on ?? null },
          });
        } catch (err) {
          /* ONE BY ONE, never insertMany: the `scheduled` read above is a
             snapshot, and a row that lands between it and this insert (a
             second tab, a single Add) hits the unique index. That is the same
             "already on the schedule" fact the snapshot reports, so it gets
             the same code — not a 500, and not a half-written batch. */
          if ((err as { code?: number }).code === 11000) {
            skipped.push({ card_id: id, code: 'ALREADY_SCHEDULED' });
            continue;
          }
          throw err;
        }
      }
      res.json({ ok: true, added, skipped });
    },
  );

  /* PLOT or MOVE the bar. `starts_on` is the PM's click and the ONLY date they
     set — the finish is computed from it (#72 §6), because click-to-place has
     no duration to give and the bar must never be able to disagree with the
     FORECASTED column. null un-plots the row, which leaves it in the list.

     There is deliberately NO cascade: placing a sketch does not create,
     position or suggest its render (BR-1a). Auto-placing render the moment
     sketch is forecast to land is the helpful thing one adds unprompted, and
     it would remove the control this design exists to give. */
  router.patch(
    '/api/projects/:projectId/sprint-items/:itemId',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const body = z
        .object({ starts_on: DATE_ONLY.nullable().optional(), sprint_id: OBJECT_ID.optional() })
        .strict()
        .safeParse(req.body);
      if (!body.success || Object.keys(body.data).length === 0) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const projectId = res.locals.project._id as Types.ObjectId;
      const actor = (req.user as SessionUser).email;
      const itemId = String(req.params.itemId ?? '');
      if (!Types.ObjectId.isValid(itemId)) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      /* Independent lookups, one round trip. The item stays hydrated because
         it is saved below; only the sprint's EXISTENCE is in question, and its
         id is the one already validated. */
      const [item, sprint] = await Promise.all([
        SprintItem.findOne({ _id: itemId, project_id: projectId }),
        body.data.sprint_id === undefined
          ? Promise.resolve(null)
          : Sprint.exists({ _id: body.data.sprint_id, project_id: projectId }),
      ]);
      if (!item) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      if (body.data.sprint_id !== undefined && !sprint) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      const before = { starts_on: item.starts_on ?? null, sprint_id: String(item.sprint_id) };
      /* No-op guard (review 2026-08-28, finding 2): a second click in the
         client's reload window used to reach here with before == after and
         bank an audit row for a non-change. Invariant 10 logs CHANGES, not
         attempts — same convention as saveSprints' dirty check and dueApply's
         staged===baseline guard. */
      const nextStarts = body.data.starts_on !== undefined ? (body.data.starts_on ?? null) : before.starts_on;
      const nextSprint = body.data.sprint_id !== undefined ? body.data.sprint_id : before.sprint_id;
      if (nextStarts === before.starts_on && nextSprint === before.sprint_id) {
        res.json({ ok: true, noop: true });
        return;
      }
      if (body.data.sprint_id !== undefined && body.data.sprint_id !== String(item.sprint_id)) {
        /* A move takes the TARGET list's tail position. Carrying the old
           position across let the row tie with one already there, and the load
           sorts on position — so the two swapped places between requests and
           the row appeared to jump around the list. Same rule the insert uses. */
        const tail = await SprintItem.findOne({ project_id: projectId, sprint_id: body.data.sprint_id })
          .sort({ position: -1 })
          .select({ position: 1 })
          .lean();
        item.sprint_id = new Types.ObjectId(body.data.sprint_id);
        item.position = ((tail?.position as number) ?? -1) + 1;
      }
      if (body.data.starts_on !== undefined) item.starts_on = body.data.starts_on ?? undefined;
      await item.save();
      await audit({
        project_id: projectId, actor, action: 'sprintItem.plot', entity: 'sprint_item',
        entity_id: String(item._id), before,
        after: { starts_on: item.starts_on ?? null, sprint_id: String(item.sprint_id) },
      });
      res.json({ ok: true });
    },
  );

  /* REMOVE a row. The PM's own decision to un-plan work — which is the only
     thing that takes a row off this tab. Nothing else does: no status, no
     sync, no tidy-up. A pass that pruned completed rows would destroy the
     record of what was planned (#72 §5). */
  router.delete(
    '/api/projects/:projectId/sprint-items/:itemId',
    ensureAuthenticated,
    ensureProjectMember,
    async (req, res) => {
      const projectId = res.locals.project._id as Types.ObjectId;
      const actor = (req.user as SessionUser).email;
      const itemId = String(req.params.itemId ?? '');
      if (!Types.ObjectId.isValid(itemId)) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      const item = await SprintItem.findOneAndDelete({ _id: itemId, project_id: projectId }).lean();
      if (!item) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      await audit({
        project_id: projectId, actor, action: 'sprintItem.remove', entity: 'sprint_item',
        entity_id: String(item._id),
        before: { sprint_id: String(item.sprint_id), card_id: item.trello_card_id, starts_on: item.starts_on ?? null },
      });
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
