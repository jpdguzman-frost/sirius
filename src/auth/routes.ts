/**
 * Auth routes — Google SSO only, no local passwords (FR-2.1).
 * A denied sign-in lands on /auth/failed with a clear reason (AC-1, AC-2).
 */

import { Router } from 'express';
import passport from './passport.ts';
import { safeReturnTo } from '../routing/paths.ts';

export function authRouter(basePath = ''): Router {
  const router = Router();

  // Deep-link return (phase 13h, JP 2026-08-15): remember where the user was
  // headed so sign-in lands there instead of always on the default tab. The
  // target rides the SESSION, not the OAuth `state` — the strategy is built
  // with no state store, so `state` would be an unvalidated round trip through
  // Google, while the session is already the trust boundary and its lax
  // same-site cookie survives the top-level redirect back.
  router.get('/auth/google', (req, res, next) => {
    const returnTo = safeReturnTo(req.query.returnTo);
    if (returnTo) req.session.returnTo = returnTo;
    else delete req.session.returnTo;
    passport.authenticate('google', { scope: ['openid', 'email', 'profile'] })(req, res, next);
  });

  router.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', (err: Error | null, user?: Express.User | false, info?: { message?: string }) => {
      if (err) return next(err);
      if (!user) {
        const reason = info?.message ?? 'Sign-in denied.';
        return res.redirect(`${basePath}/auth/failed?reason=${encodeURIComponent(reason)}`);
      }
      // Read BEFORE req.logIn, not inside its callback: passport regenerates
      // the session on login to guard against session fixation
      // (passport/lib/sessionmanager.js), which drops everything stashed
      // pre-auth. The delete keeps it single-use even on the keepSessionInfo
      // path, where the old session would otherwise be merged back in.
      // Re-validated on the way out, so the redirect is always basePath + a
      // whitelisted in-app path — never an absolute URL.
      const returnTo = safeReturnTo(req.session.returnTo) ?? '/';
      delete req.session.returnTo;
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.redirect(`${basePath}${returnTo}`);
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
