/**
 * Deliverables routes — pipeline read (FR-4.1–4.5), model read (FR-7.7,
 * AC-11). All read-only; Trello- and sheet-owned fields never writable here
 * (invariant 2).
 *
 * `GET /deadlines` (the milestone-unit read: milestones, day capacities,
 * conflicts, acknowledged, replot) was DELETED 2026-09-08 — owl #87, JP.
 * It lost its caller with the milestone tab (owls #74/#75) and the conflict
 * half is withdrawn outright, not parked. The Deadlines tab reads
 * `GET /deliverables` like every other tab. Do not reintroduce it.
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { loadProjectModel } from '../services/model-grid.ts';
import { latestRead } from '../services/sync-status.ts';
import { loadPipeline, manilaToday } from '../services/pipeline.ts';
import { getHolidays } from '../../lib/calendar.ts';
import { HARD_MIX } from '../../lib/planner.constants.ts';
import { PushEvent, Sprint, SyncRun } from '../models/index.ts';


export function deliverablesRouter(): Router {
  const router = Router();

  router.get(
    '/api/projects/:projectId/deliverables',
    ensureAuthenticated,
    ensureProjectMember,
    async (_req, res) => {
      const projectId = res.locals.project._id;
      // the ONE route that returns sprint items — the planner body reads
      // exactly this fetch (frozen contract §1), so the tab switch stays free
      const pipeline = await loadPipeline(projectId, manilaToday(), res.locals.project.weekly_capacity, {
        withSprintItems: true,
      });
      const sprints = await Sprint.find({ project_id: projectId }).sort({ position: 1 }).lean();
      /* The chip's "latest read" is the FULL sync alone — `ares`, not the push
         drains the rollover's gate also counts (READ_SOURCES in
         services/sync-status.ts). Whether the chip should keep reading "sync
         failing" while push keeps a project fresh is a WORDING question and
         JP's to change (simplification pass 2026-09-05, ALT-4); until ruled,
         the list is explicit here so the divergence is one named argument. */
      const lastAres = await latestRead(projectId, { sources: ['ares'] });
      // FR-8.6: `at`/`ok` describe the last ATTEMPT — that is what the header
      // chip reports ("sync failing — showing last good data"). The Requests
      // strip names when the data on screen was actually read, which is the
      // last SUCCESSFUL run: a failed attempt does not un-sync the good data
      // still being displayed. Same lastGood shape the requests route emits
      // for the sheet sync.
      const lastAresGood = lastAres?.ok ? lastAres : await latestRead(projectId, { sources: ['ares'], okOnly: true });
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
