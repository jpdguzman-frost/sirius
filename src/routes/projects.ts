/**
 * Project routes — the switcher's data source (FR-1.2) and the scoping
 * pattern every later route group follows (T016):
 *
 *   GET /api/projects                 → only projects the caller belongs to
 *   GET /api/projects/:projectId      → ensureProjectMember, then scoped reads
 *
 * Every query filters on project_id (invariant 1, FR-1.4). No data bleeds
 * between projects (AC-4).
 */

import { Router } from 'express';
import { Types } from 'mongoose';
import { Project, UserProject } from '../models/index.ts';
import { ensureAuthenticated, type SessionUser } from '../auth/session.ts';
import { ensureProjectMember } from '../auth/membership.ts';

export function projectsRouter(): Router {
  const router = Router();

  router.get('/api/me', ensureAuthenticated, async (req, res) => {
    // admin flag read fresh per request (FR-10.1) — the tab appears/vanishes
    // with the flag; enforcement is server-side either way (FR-10.5)
    const sessionUser = req.user as SessionUser;
    const { User } = await import('../models/index.ts');
    const doc = await User.findById(sessionUser.userId);
    res.json({ ok: true, user: { ...sessionUser, admin: Boolean(doc?.active && doc?.is_admin) } });
  });

  router.get('/api/projects', ensureAuthenticated, async (req, res) => {
    const user = req.user as SessionUser;
    const memberships = await UserProject.find({ user_id: new Types.ObjectId(user.userId) });
    const projects = await Project.find({
      _id: { $in: memberships.map((m) => m.project_id) },
    }).select('code name client status trello_board_id trello_label weekly_capacity');
    res.json({ ok: true, projects });
  });

  router.get(
    '/api/projects/:projectId',
    ensureAuthenticated,
    ensureProjectMember,
    async (_req, res) => {
      res.json({ ok: true, project: res.locals.project });
    },
  );

  return router;
}
