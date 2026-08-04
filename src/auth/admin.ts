/**
 * ensureAdmin (FR-10.5) — layered AFTER ensureAuthenticated: the four
 * sign-in checks are untouched; this re-reads the users document on every
 * request so a demotion or deactivation bites immediately. Hiding the Admin
 * tab is not access control — this is.
 */

import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/index.ts';
import type { SessionUser } from './session.ts';

export async function ensureAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionUser = req.user as SessionUser | undefined;
  if (!sessionUser) {
    res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    return;
  }
  const user = await User.findById(sessionUser.userId);
  if (!user || !user.active || !user.is_admin) {
    res.status(403).json({ ok: false, error: { code: 'ADMIN_ONLY', message: 'This action needs an admin account.' } });
    return;
  }
  res.locals.adminUser = user;
  next();
}
