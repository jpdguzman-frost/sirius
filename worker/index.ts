/**
 * Sirius worker (T033) — owns ALL sync; sync never runs inside a web request.
 * Cadence per contracts/worker.md: ares 15 min · intake 15 min (phase 5) ·
 * model nightly (phase 6) · health daily · rollover at the end of every
 * SUCCESSFUL ares tick (PLAN.md B10, block 3 — see rolloverTick).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { validateEnv } from '../src/config/env.ts';
import { runAresSync, makeClient } from './syncAres.ts';
import { drainPushEvents, shouldRunFullSync } from './drainPush.ts';
import { runIntakeSync } from './syncIntake.ts';
import { makeSheetSource } from '../lib/sheets.ts';
import { runModelRefresh } from './refreshModel.ts';
import { Project } from '../src/models/index.ts';

const FIFTEEN_MIN = 15 * 60 * 1000;
const FIFTEEN_SEC = 15 * 1000;
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
    // FR-9.6: while push is healthy the full sync relaxes to hourly.
    await runAresSync(env, (projectId) => shouldRunFullSync(env, projectId));
    console.log('[sirius-worker] ares sync complete');
  } catch (err) {
    console.error('[sirius-worker] ares sync failed:', (err as Error).message);
    return; // no rollover off a failed read — stale lanes would roll cards the board has finished
  }
  await rolloverTick();
}

/**
 * Rollover (PLAN.md B10; owl #75 §2; jp→miles #59 §3): after a SUCCESSFUL
 * ares sync, every plotted, unfinished work card whose forecast finish has
 * passed (Manila) moves forward to the next working day until its finish is
 * today or later, sprint membership following the finish day; one audit row
 * per moved card, actor `system`; no UI marker. The rules and their sources
 * live in src/services/rollover.ts — this is only the seam.
 *
 * AFTER the sync, never before it, and never off a failed or skipped one:
 * the sync is what shows a card went done in Trello, and a done card does
 * not roll (#75 §3) — so a card finished over the weekend is seen as done
 * before Saturday's tick would have rolled it to Monday. The health gate and
 * the sync's own catch both return before reaching here.
 *
 * Its own try/catch, so a rollover failure never masks the sync's own log
 * line above, and the sync's failure never reads as a rollover one. Dynamic
 * import in calendarTick's style. The holiday set this walks on is the one
 * calendarTick loaded into this process — it runs before the first ares
 * tick and daily after, so the worker's calendar is the ARES-canonical one.
 */
async function rolloverTick() {
  try {
    const { rollUnfinished } = await import('../src/services/rollover.ts');
    const res = await rollUnfinished();
    console.log(`[sirius-worker] rollover: ${res.moved} moved (${res.projects} projects)`);
  } catch (err) {
    console.error('[sirius-worker] rollover failed:', (err as Error).message);
  }
}

async function drainTick() {
  try {
    await drainPushEvents(env);
  } catch (err) {
    console.error('[sirius-worker] push drain failed:', (err as Error).message);
  }
}

async function intakeTick() {
  if (!env.GOOGLE_SHEETS_CREDENTIALS) {
    console.warn('[sirius-worker] no Sheets credential configured — intake sync skipped');
    return;
  }
  const source = makeSheetSource(env.GOOGLE_SHEETS_CREDENTIALS);
  const projects = await Project.find({ status: 'ongoing', intake_sheet_id: { $ne: null } });
  for (const p of projects) {
    await runIntakeSync(p._id, () => source.readTab(p.intake_sheet_id!, p.intake_sheet_tab ?? 'Sheet1'));
  }
  console.log('[sirius-worker] intake sync complete');
}

async function modelTick() {
  try {
    await runModelRefresh();
    console.log('[sirius-worker] model refresh complete');
  } catch (err) {
    console.error('[sirius-worker] model refresh failed:', (err as Error).message);
  }
}

async function healthTick() {
  console.log('[sirius-worker] health tick ok');
}

async function calendarTick() {
  try {
    const { syncCalendarFromAres } = await import('../src/services/calendar-sync.ts');
    const { manilaToday } = await import('../src/services/pipeline.ts');
    const res = await syncCalendarFromAres(mongoose.connection, makeClient(env), manilaToday());
    if (!res) {
      console.warn('[sirius-worker] calendar sync: ARES daily surface unavailable — previous calendar kept');
    } else {
      console.log(
        `[sirius-worker] calendar sync: ${res.dates.length} non-working weekdays` +
          (res.mismatches.length ? ` — CROSS-CHECK MISMATCH weeks: ${res.mismatches.join(', ')}` : ''),
      );
    }
  } catch (err) {
    console.error('[sirius-worker] calendar sync failed:', (err as Error).message);
  }
}

await calendarTick(); // before the first forecast-consuming sync
await aresTick();
await intakeTick().catch((err) => console.error('[sirius-worker] intake sync failed:', err.message));
setInterval(calendarTick, DAY);
setInterval(aresTick, FIFTEEN_MIN);
// Push drain: cheap indexed check every 15 s — the < 1 min NFR-3 target
// (contracts/ares-push.md) lives or dies on this cadence.
if (env.ARES_WEBHOOK_SECRET) setInterval(drainTick, FIFTEEN_SEC);
setInterval(() => intakeTick().catch((err) => console.error('[sirius-worker] intake sync failed:', err.message)), FIFTEEN_MIN);
setInterval(modelTick, DAY); // nightly (FR-7.6)
setInterval(healthTick, DAY);

process.on('SIGTERM', async () => {
  await mongoose.disconnect();
  process.exit(0);
});
