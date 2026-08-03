/**
 * ensureProjectMember — session AND project membership re-checked on every
 * project-scoped route (invariant 9, FR-1.2). A session calling an API for
 * another project gets 403 (AC-3). Downstream handlers read the resolved
 * project from res.locals.project and MUST filter every query on its id
 * (invariant 1, FR-1.4).
 */

import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Project, UserProject } from '../models/index.ts';
import type { SessionUser } from './session.ts';

export async function ensureProjectMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const projectId = Array.isArray(req.params.projectId) ? '' : (req.params.projectId ?? '');
  if (!projectId || !Types.ObjectId.isValid(projectId)) {
    res.status(404).json({ ok: false, error: { code: 'PROJECT_NOT_FOUND' } });
    return;
  }
  const user = req.user as SessionUser | undefined;
  if (!user) {
    res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    return;
  }
  const membership = await UserProject.findOne({
    user_id: new Types.ObjectId(user.userId),
    project_id: new Types.ObjectId(projectId),
  });
  if (!membership) {
    res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You are not a member of this project.' },
    });
    return;
  }
  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ ok: false, error: { code: 'PROJECT_NOT_FOUND' } });
    return;
  }
  res.locals.project = project;
  next();
}
