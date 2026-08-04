/**
 * Sirius — HTTP composition (ARES pattern: all Express wiring here, testable
 * via supertest; server.js only bootstraps).
 *
 * Every API route passes ensureAuthenticated; every project-scoped route
 * additionally passes ensureProjectMember — hiding a tab is not access
 * control (invariant 9). Sessions live in Redis, httpOnly cookie (FR-2.3).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import type { Redis } from 'ioredis';
import type mongoose from 'mongoose';
import type { Env } from './config/env.ts';
import { mongoState } from './db/mongo.ts';
import { redisState } from './db/redis.ts';
import passport, { configurePassport } from './auth/passport.ts';
import { authRouter } from './auth/routes.ts';
import { projectsRouter } from './routes/projects.ts';
import { requestsRouter } from './routes/requests.ts';
import { deliverablesRouter } from './routes/deliverables.ts';
import { scheduleRouter } from './routes/schedule.ts';
import { writesRouter } from './routes/writes.ts';
import { aresWebhookRouter } from './routes/webhooks.ts';
import { makeTrelloWriter, type TrelloWriter } from '../lib/trello.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AppDeps {
  env: Env;
  redis: Redis | null;
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
          res.redirect(`${base}/`);
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
  root.use(projectsRouter());
  root.use(requestsRouter());
  root.use(deliverablesRouter());
  root.use(scheduleRouter());
  root.use(writesRouter(env, trello !== undefined ? trello : makeTrelloWriter(env)));

  // Built frontend (frontend/build.js → public/). No credential ever ships here.
  root.use(express.static(path.join(__dirname, '..', 'public')));

  // Unknown API paths answer JSON, not HTML.
  root.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  app.use(base || '/', root);
  return app;
}
