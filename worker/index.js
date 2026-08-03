/**
 * Sirius worker — owns ALL sync; sync never runs inside a web request.
 *
 * Phase 0 stub. Phases 4–6 add:
 *   syncAres      every 15 min   (contracts/worker.md)
 *   syncIntake    every 15 min
 *   refreshModel  nightly
 *   health        daily — gates on ARES /healthz freshness
 *
 * Every run writes a sync_runs document, success or failure.
 */

import 'dotenv/config';
import { validateEnv } from '../src/config/env.ts';

const env = validateEnv(process.env);
console.log(`[sirius-worker] shell boot (${env.NODE_ENV ?? 'development'}) — jobs land in phase 4`);
