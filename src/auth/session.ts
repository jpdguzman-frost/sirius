/**
 * ensureAuthenticated — every API route passes this; hiding a tab is not
 * access control (invariant 9, NFR-6).
 */

import type { NextFunction, Request, Response } from 'express';

export interface SessionUser {
  userId: string;
  email: string;
  name?: string;
}

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated && req.isAuthenticated()) {
    next();
    return;
  }
  res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } });
}
