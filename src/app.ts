/**
 * Sirius — HTTP composition (ARES pattern: all Express wiring here, testable
 * via supertest; server.js only bootstraps).
 *
 * Every API route passes ensureAuthenticated; every project-scoped route
 * additionally passes ensureProjectMember — hiding a tab is not access
 * control (invariant 9). Sessions live in Redis, httpOnly cookie (FR-2.3).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import type mongoose from 'mongoose';
import type { Env } from './config/env.ts';
import { mongoState } from './db/mongo.ts';
import { redisState, type RedisClient } from './db/redis.ts';
import passport, { configurePassport } from './auth/passport.ts';
import { authRouter } from './auth/routes.ts';
import { adminRouter } from './routes/admin.ts';
import { projectsRouter } from './routes/projects.ts';
import { requestsRouter } from './routes/requests.ts';
import { deliverablesRouter } from './routes/deliverables.ts';
import { scheduleRouter } from './routes/schedule.ts';
import { writesRouter } from './routes/writes.ts';
import { aresWebhookRouter } from './routes/webhooks.ts';
import { injectBase, isShellPath, resolvesToShellFile, safeReturnTo } from './routing/paths.ts';
import { makeTrelloWriter, type TrelloWriter } from '../lib/trello.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHELL = path.join(__dirname, '..', 'public', 'index.html');

/**
 * The base-stamped shell, cached per base and keyed on the file's mtime: one
 * 224 KB read per `node frontend/build.js`, not per request, and a rebuild
 * during `npm run dev` is picked up without a restart. Keyed by base because a
 * single process serves more than one mount in the test suite.
 */
const shellCache = new Map<string, { mtimeMs: number; html: string }>();

async function serveShell(res: express.Response, base: string): Promise<void> {
  const stat = await fs.promises.stat(SHELL);
  let hit = shellCache.get(base);
  if (!hit || hit.mtimeMs !== stat.mtimeMs) {
    hit = { mtimeMs: stat.mtimeMs, html: injectBase(await fs.promises.readFile(SHELL, 'utf8'), base) };
    shellCache.set(base, hit);
  }
  res.set('Cache-Control', 'no-cache').type('html').send(hit.html);
}

export interface AppDeps {
  env: Env;
  redis: RedisClient | null;
  mongo: typeof mongoose | null;
  trello?: TrelloWriter | null;
}

export function createApp({ env, redis, trello }: AppDeps): express.Express {
  const app = express();

  app.set('trust proxy', 1);

  // The whole app mounts on one router at BASE_PATH (default: domain root) —
  // the platforms-host pattern serves Sirius at /sirius behind Apache without
  // the code knowing more than this one prefix.
  const base = env.BASE_PATH ?? '';
  const root = express.Router();

  // ARES push receiver first: needs the RAW body for its HMAC and has no use
  // for the JSON parser or a session (contracts/ares-push.md).
  root.use(aresWebhookRouter(env));

  root.use(express.json({ limit: '1mb' }));

  root.use(
    session({
      store: redis ? new RedisStore({ client: redis, prefix: 'sirius:sess:' }) : undefined,
      secret: env.SESSION_SECRET ?? 'dev-only-not-a-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production' || env.NODE_ENV === 'staging',
        path: base || '/',
      },
    }),
  );

  configurePassport(env);
  root.use(passport.initialize());
  root.use(passport.session());

  root.get('/healthz', (_req, res) => {
    res.json({
      status: 'ok',
      mongo: mongoState(),
      redis: redisState(),
      env: env.NODE_ENV,
    });
  });

  // Dev-only auto-login: NODE_ENV=development AND DEV_AUTOLOGIN set AND the
  // email is an ACTIVE allow-list row. Real SSO takes over the moment Google
  // credentials exist. Never mounted in staging/production.
  if (env.NODE_ENV === 'development' && env.DEV_AUTOLOGIN) {
    root.get('/auth/dev', (req, res, next) => {
      import('./models/index.ts').then(async ({ User }) => {
        const user = await User.findOne({ email: env.DEV_AUTOLOGIN!.toLowerCase() });
        if (!user || !user.active) {
          res.status(403).json({ ok: false, error: { code: 'DEV_LOGIN_DENIED', message: 'DEV_AUTOLOGIN email is not an active allow-list row.' } });
          return;
        }
        req.logIn({ userId: user._id.toString(), email: user.email, name: user.name }, (err) => {
          if (err) return next(err);
          // No round trip here, so the deep link rides the query string
          // directly — whitelist-validated, path-only (phase 13h).
          res.redirect(`${base}${safeReturnTo(req.query.returnTo) ?? '/'}`);
        });
      }, next);
    });
  }

  // Test-only session injection — lets the authz matrix run without a live
  // Google round-trip. Never mounted outside NODE_ENV=test.
  if (env.NODE_ENV === 'test') {
    root.post('/__test/login', (req, res, next) => {
      req.logIn(req.body, (err) => (err ? next(err) : res.json({ ok: true })));
    });
  }

  root.use(authRouter(base));
  root.use(adminRouter());
  root.use(projectsRouter());
  root.use(requestsRouter());
  root.use(deliverablesRouter());
  root.use(scheduleRouter());
  root.use(writesRouter(env, trello !== undefined ? trello : makeTrelloWriter(env)));

  // The shell is only ever served with its base stamped in (serveShell). This
  // guard and `index: false` below close the doors through which express.static
  // would otherwise hand out an UNSTAMPED copy — which would silently set
  // BASE='' in production and 404 every API call.
  //
  // It matches on what serve-static will RESOLVE, not on the one literal
  // spelling: serve-static percent-decodes and normalizes first, so a
  // `root.get('/index.html')` route still let `/index%2Ehtml`, `/%69ndex.html`
  // and `//index.html` through to the raw file (resolvesToShellFile).
  root.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!resolvesToShellFile(req.path)) return next();
    res.redirect(`${base}/`);
  });

  // Built frontend (frontend/build.js → public/). No credential ever ships here.
  root.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

  // Unknown API paths answer JSON, not HTML.
  root.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  // Client routing (phase 13h, JP 2026-08-15). Registered LAST so every real
  // route wins first, and whitelisted by isShellPath so it cannot shadow one
  // even if a later edit registers a route after it — two independent layers.
  // A plain middleware, not a path pattern: Express 5 ships path-to-regexp 8,
  // where an inline param regex throws at registration and a bare `/:a/:b`
  // would swallow `/api/*`.
  root.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!isShellPath(req.path)) return next();
    serveShell(res, base).catch(next);
  });

  app.use(base || '/', root);
  return app;
}
