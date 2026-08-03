/**
 * Sirius — Express server entry point (ARES bootstrap pattern).
 *
 *   1. validateEnv() — fail-fast on missing required env in production
 *   2. connect Mongo + Redis where configured (shell boots without them in dev)
 *   3. createApp() — HTTP composition lives in src/app.ts (testable via supertest)
 *   4. app.listen()
 *
 * Sync NEVER runs here — the worker process (worker/index.js) owns all sync.
 */

import 'dotenv/config';

import { validateEnv } from './src/config/env.ts';
import { connectMongo, disconnectMongo } from './src/db/mongo.ts';
import { connectRedis, disconnectRedis } from './src/db/redis.ts';
import { createApp } from './src/app.ts';

const env = validateEnv(process.env);

const mongo = await connectMongo(env);
const redis = await connectRedis(env);

const app = createApp({ env, redis, mongo });

const port = Number(env.PORT ?? 3000);
const httpServer = app.listen(port, () => {
  console.log(`[sirius] web listening on :${port} (${env.NODE_ENV ?? 'development'})`);
});

async function shutdown(signal) {
  console.log(`[sirius] ${signal} — shutting down`);
  httpServer.close();
  await disconnectRedis();
  await disconnectMongo();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
