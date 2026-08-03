/**
 * Deliverables routes — pipeline read (FR-4.1–4.5), model read (FR-7.7,
 * AC-11), deadlines view (FR-6.1–6.6, BR-6). All read-only; Trello- and
 * sheet-owned fields never writable here (invariant 2).
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { loadProjectModel } from '../services/model-grid.ts';
import { loadPipeline, toMilestones } from '../services/pipeline.ts';
import { detectConflicts, replotList } from '../services/conflicts.ts';
import { Sprint, SyncRun } from '../models/index.ts';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function deliverablesRouter(): Router {
  const router = Router();

  router.get(
    '/api/projects/:projectId/deliverables',
    ensureAuthenticated,
    ensureProjectMember,
    async (_req, res) => {
      const projectId = res.locals.project._id;
      const pipeline = await loadPipeline(projectId, today());
      const sprints = await Sprint.find({ project_id: projectId }).sort({ position: 1 }).lean();
      const lastAres = await SyncRun.findOne({ project_id: projectId, source: 'ares' }).sort({ at: -1 }).lean();
      res.json({
        ok: true,
        ...pipeline,
        sprints: sprints.map((s) => ({ id: String(s._id), name: s.name, start: s.starts_on, end: s.ends_on, position: s.position })),
        capacity: {
          weekly: res.locals.project.weekly_capacity,
          least: res.locals.project.ref_week_least ?? null,
          typical: res.locals.project.ref_week_typical ?? null,
          most: res.locals.project.ref_week_most ?? null,
          effectiveWeeklyRate: res.locals.project.effective_weekly_rate ?? null,
        },
        sync: lastAres ? { at: lastAres.at, ok: lastAres.ok, error: lastAres.error ?? null } : null,
      });
    },
  );

  router.get(
    '/api/projects/:projectId/deadlines',
    ensureAuthenticated,
    ensureProjectMember,
    async (_req, res) => {
      const projectId = res.locals.project._id;
      const pipeline = await loadPipeline(projectId, today());
      const milestones = toMilestones(pipeline.rows);
      const conflicts = detectConflicts(milestones, res.locals.project.weekly_capacity);
      res.json({
        ok: true,
        milestones,
        conflicts,
        replot: replotList(conflicts),
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
