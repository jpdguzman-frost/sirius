/**
 * Deliverables routes — pipeline read (FR-4.1–4.5), model read (FR-7.7,
 * AC-11), deadlines view (FR-6.1–6.6, BR-6). All read-only; Trello- and
 * sheet-owned fields never writable here (invariant 2).
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { loadProjectModel } from '../services/model-grid.ts';
import { loadPipeline, manilaToday, toMilestones } from '../services/pipeline.ts';
import { detectConflicts, replotList } from '../services/conflicts.ts';
import { dayCapacities } from '../../lib/dayplan.ts';
import { getHolidays } from '../../lib/calendar.ts';
import { HARD_MIX } from '../../lib/planner.constants.ts';
import { ConflictAcknowledgement, MilestoneDayPlan, PushEvent, Sprint, SyncRun } from '../models/index.ts';


export function deliverablesRouter(): Router {
  const router = Router();

  router.get(
    '/api/projects/:projectId/deliverables',
    ensureAuthenticated,
    ensureProjectMember,
    async (_req, res) => {
      const projectId = res.locals.project._id;
      const pipeline = await loadPipeline(projectId, manilaToday(), res.locals.project.weekly_capacity);
      const sprints = await Sprint.find({ project_id: projectId }).sort({ position: 1 }).lean();
      const lastAres = await SyncRun.findOne({ project_id: projectId, source: 'ares' }).sort({ at: -1 }).lean();
      // FR-8.6: `at`/`ok` describe the last ATTEMPT — that is what the header
      // chip reports ("sync failing — showing last good data"). The Requests
      // strip names when the data on screen was actually read, which is the
      // last SUCCESSFUL run: a failed attempt does not un-sync the good data
      // still being displayed. Same lastGood shape the requests route emits
      // for the sheet sync.
      const lastAresGood = lastAres?.ok
        ? lastAres
        : await SyncRun.findOne({ project_id: projectId, source: 'ares', ok: true }).sort({ at: -1 }).lean();
      // FR-8.6 + FR-9.6: push channel freshness beside the poll freshness.
      const lastPush = await PushEvent.findOne({ project_id: projectId }).sort({ received_at: -1 }).select('received_at').lean();
      res.json({
        ok: true,
        ...pipeline,
        writesEnabled: res.locals.project.writes_enabled !== false, // G7 observation mode
        sprints: sprints.map((s) => ({ id: String(s._id), name: s.name, start: s.starts_on, end: s.ends_on, position: s.position })),
        // R-f-8: the sprints modal's gap warning counts WORKING days, never
        // raw weekdays, so the client needs the same holiday set the server
        // computes with — the ARES-canonical calendar loaded at boot and
        // refreshed every 15 min (server.js → loadCalendar → setHolidays).
        // Read-only, no collection of its own; sending it is what keeps the
        // client's weekend/holiday skip from drifting into a second calendar.
        holidays: getHolidays(),
        capacity: {
          weekly: res.locals.project.weekly_capacity,
          least: res.locals.project.ref_week_least ?? null,
          typical: res.locals.project.ref_week_typical ?? null,
          most: res.locals.project.ref_week_most ?? null,
          effectiveWeeklyRate: res.locals.project.effective_weekly_rate ?? null,
          // BR-6b hard-mix thresholds ride along so the planner footer renders
          // the measured ceiling instead of a second hardcoded copy.
          hardIdeal: HARD_MIX.ideal,
          hardCeiling: HARD_MIX.ceiling,
          // Capacity lock (owl #23): the slider reads its disabled state from
          // here. Absent/false = unlocked, so the test is `=== true`.
          locked: res.locals.project.capacity_locked === true,
        },
        sync: lastAres
          ? {
              at: lastAres.at,
              ok: lastAres.ok,
              error: lastAres.error ?? null,
              push_at: lastPush?.received_at ?? null,
              lastSuccessAt: lastAresGood?.at ?? null,
            }
          : null,
      });
    },
  );

  router.get(
    '/api/projects/:projectId/deadlines',
    ensureAuthenticated,
    ensureProjectMember,
    async (_req, res) => {
      const projectId = res.locals.project._id;
      const pipeline = await loadPipeline(projectId, manilaToday(), res.locals.project.weekly_capacity);
      const milestones = toMilestones(pipeline.rows);

      // FR-12: join day placements. A placement is valid only while the
      // milestone still lands in the week it was made for — a moved week
      // means the placement has LAPSED and reads as absent (FR-12.6).
      const plans = await MilestoneDayPlan.find({ project_id: projectId }).lean();
      const planByKey = new Map(plans.map((p) => [`${p.trello_card_id}:${p.phase}`, p]));
      for (const m of milestones) {
        const plan = planByKey.get(`${m.cardId}:${m.phase}`);
        m.plannedDay = plan && plan.week === m.week ? plan.day : null;
      }
      // Day capacities per distinct milestone week (FR-12.4) — columns always
      // sum exactly to the weekly capacity; holidays take zero.
      const days: Record<string, ReturnType<typeof dayCapacities>> = {};
      for (const week of new Set(milestones.map((m) => m.week))) {
        days[week] = dayCapacities(week, res.locals.project.weekly_capacity);
      }

      const all = detectConflicts(milestones, res.locals.project.weekly_capacity);
      // BR-9a: an acknowledgement silences ONE situation — its key carries the
      // exact cards AND the weekly capacity they were acknowledged under, so a
      // change to either re-surfaces the conflict (invariant 13 v4.3.0). The
      // match is one set-membership test on an opaque string; the mismatch that
      // re-surfaces a week writes nothing (it is a non-match, not a change).
      // Card-level indicators (late flags on milestones) are NEVER suppressed.
      const acks = await ConflictAcknowledgement.find({ project_id: projectId });
      const ackedKeys = new Set(acks.map((a) => a.conflict_key));
      const active = all.filter((c) => !ackedKeys.has(c.key));
      const acknowledged = all.filter((c) => ackedKeys.has(c.key));
      res.json({
        ok: true,
        milestones,
        days,
        conflicts: active,
        acknowledged: acknowledged.map((c) => ({
          ...c,
          ack: acks.find((a) => a.conflict_key === c.key)
            ? { by: acks.find((a) => a.conflict_key === c.key)!.acknowledged_by, reason: acks.find((a) => a.conflict_key === c.key)!.reason ?? null, at: acks.find((a) => a.conflict_key === c.key)!.at }
            : null,
        })),
        replot: replotList(active),
      });
    },
  );

  router.get(
    '/api/projects/:projectId/model',
    ensureAuthenticated,
    ensureProjectMember,
    async (_req, res) => {
      const projectId = res.locals.project._id;
      const { model, provenance } = await loadProjectModel(projectId);
      const lastRefresh = await SyncRun.findOne({ project_id: projectId, source: 'model' }).sort({ at: -1 });
      res.json({
        ok: true,
        model,
        provenance,
        lastRefresh: lastRefresh
          ? { at: lastRefresh.at, ok: lastRefresh.ok, stats: lastRefresh.stats ?? null, error: lastRefresh.error ?? null }
          : null,
      });
    },
  );

  return router;
}
