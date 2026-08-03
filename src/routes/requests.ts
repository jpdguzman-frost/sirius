/**
 * Requests routes (T039; FR-3.x) — read-only mirror of the intake sheet.
 * Status derives from the Trello join: *In pipeline* when the MC group has
 * deliverables, else *Not yet filed* (FR-3.3). Filters: filed / unfiled /
 * missing-deadline (FR-3.6). Sync status + last-success surfaces here
 * (FR-8.6, AC-19).
 */

import { Router } from 'express';
import { Deliverable, IntakeReject, IntakeRequest, SyncRun } from '../models/index.ts';
import { ensureAuthenticated } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';

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

      let rows = requests.map((r) => ({
        mc_number: r.mc_number,
        sheet_row: r.sheet_row,
        name: r.name,
        requestor: r.requestor,
        asset_type: r.asset_type,
        use_case: r.use_case,
        brief: r.brief,
        deadline: r.deadline ?? null,
        status: filedMcs.has(r.mc_number) ? 'In pipeline' : 'Not yet filed',
      }));
      if (filter === 'filed') rows = rows.filter((r) => r.status === 'In pipeline');
      if (filter === 'unfiled') rows = rows.filter((r) => r.status === 'Not yet filed');
      if (filter === 'missing-deadline') rows = rows.filter((r) => !r.deadline);

      const rejects = await IntakeReject.find({ project_id: projectId }).sort({ sheet_row: 1 });
      const lastRun = await SyncRun.findOne({ project_id: projectId, source: 'sheet' }).sort({ at: -1 });
      const lastGood = lastRun?.ok
        ? lastRun
        : await SyncRun.findOne({ project_id: projectId, source: 'sheet', ok: true }).sort({ at: -1 });

      res.json({
        ok: true,
        requests: rows,
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

  return router;
}
