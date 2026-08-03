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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AppDeps {
  env: Env;
  redis: Redis | null;
  mongo: typeof mongoose | null;
}

export function createApp({ env, redis }: AppDeps): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.use(
    session({
      store: redis ? new RedisStore({ client: redis, prefix: 'sirius:sess:' }) : undefined,
      secret: env.SESSION_SECRET ?? 'dev-only-not-a-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production' || env.NODE_ENV === 'staging',
      },
    }),
  );

  configurePassport(env);
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/healthz', (_req, res) => {
    res.json({
      status: 'ok',
      mongo: mongoState(),
      redis: redisState(),
      env: env.NODE_ENV,
    });
  });

  // Test-only session injection — lets the authz matrix run without a live
  // Google round-trip. Never mounted outside NODE_ENV=test.
  if (env.NODE_ENV === 'test') {
    app.post('/__test/login', (req, res, next) => {
      req.logIn(req.body, (err) => (err ? next(err) : res.json({ ok: true })));
    });
  }

  app.use(authRouter());
  app.use(projectsRouter());

  // Built frontend (frontend/build.js → public/). No credential ever ships here.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Unknown API paths answer JSON, not HTML.
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  return app;
}
