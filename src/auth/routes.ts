/**
 * Auth routes — Google SSO only, no local passwords (FR-2.1).
 * A denied sign-in lands on /auth/failed with a clear reason (AC-1, AC-2).
 */

import { Router } from 'express';
import passport from './passport.ts';

export function authRouter(): Router {
  const router = Router();

  router.get('/auth/google', passport.authenticate('google', { scope: ['openid', 'email', 'profile'] }));

  router.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', (err: Error | null, user?: Express.User | false, info?: { message?: string }) => {
      if (err) return next(err);
      if (!user) {
        const reason = info?.message ?? 'Sign-in denied.';
        return res.redirect(`/auth/failed?reason=${encodeURIComponent(reason)}`);
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.redirect('/');
      });
    })(req, res, next);
  });

  router.get('/auth/failed', (req, res) => {
    res.status(403).json({
      ok: false,
      error: { code: 'SIGN_IN_DENIED', message: String(req.query.reason ?? 'Sign-in denied.') },
    });
  });

  router.post('/auth/logout', (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  return router;
}
