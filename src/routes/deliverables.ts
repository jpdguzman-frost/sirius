/**
 * Deliverables routes — phase 6 exposes the model read (T043: provenance +
 * sample sizes visible, FR-7.7; AC-11 data side). The pipeline list itself
 * lands in phase 7 behind the T045 gate.
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';
import { loadProjectModel } from '../services/model-grid.ts';
import { SyncRun } from '../models/index.ts';

export function deliverablesRouter(): Router {
  const router = Router();

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
