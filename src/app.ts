/**
 * Sirius — HTTP composition (ARES pattern: all Express wiring here, testable
 * via supertest; server.js only bootstraps).
 *
 * Phase 0 shell: health, sessions, static frontend. Auth strategy (phase 2),
 * API routes (phases 4–8a) mount here as they land. Every future API route
 * passes ensureAuthenticated + ensureProjectMember — hiding a tab is not
 * access control (invariant 9).
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

  app.get('/healthz', (_req, res) => {
    res.json({
      status: 'ok',
      mongo: mongoState(),
      redis: redisState(),
      env: env.NODE_ENV,
    });
  });

  // Built frontend (frontend/build.js → public/). No credential ever ships here.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Unknown API paths answer JSON, not HTML.
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  return app;
}
