/**
 * Sirius worker (T033) — owns ALL sync; sync never runs inside a web request.
 * Cadence per contracts/worker.md: ares 15 min · intake 15 min (phase 5) ·
 * model nightly (phase 6) · health daily.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { validateEnv } from '../src/config/env.ts';
import { runAresSync, makeClient } from './syncAres.ts';

const FIFTEEN_MIN = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const env = validateEnv(process.env);

if (!env.MONGODB_URI) {
  console.error('[sirius-worker] MONGODB_URI is required');
  process.exit(1);
}
await mongoose.connect(env.MONGODB_URI);
console.log(`[sirius-worker] up (${env.NODE_ENV}) — ares sync every 15 min`);

async function aresTick() {
  try {
    // Freshness gate before trusting a sync (guide §6.10).
    const health = await makeClient(env).health();
    if (health.status && health.status !== 'ok') {
      console.warn('[sirius-worker] ARES healthz not ok — skipping this cycle');
      return;
    }
    await runAresSync(env);
    console.log('[sirius-worker] ares sync complete');
  } catch (err) {
    console.error('[sirius-worker] ares sync failed:', (err as Error).message);
  }
}

async function healthTick() {
  console.log('[sirius-worker] health tick ok');
}

await aresTick();
setInterval(aresTick, FIFTEEN_MIN);
setInterval(healthTick, DAY);

process.on('SIGTERM', async () => {
  await mongoose.disconnect();
  process.exit(0);
});
