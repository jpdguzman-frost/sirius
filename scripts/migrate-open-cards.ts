/**
 * T074 — project onboarding migration (Implementation Plan layout §2.3):
 * brings a project's open cards into Sirius for the first time — full ARES
 * sync, model refresh, and a summary the PM can eyeball before pilot.
 *
 * Usage:
 *   MONGODB_URI=... ARES_URL=... ARES_API_KEY=... \
 *   CODE=rt-837 BOARD=hLL7WW2V [LABEL="Some Label"] [CAPACITY=120] [WRITES=0] \
 *   npx tsx scripts/migrate-open-cards.ts
 *
 * WRITES=0 onboards the project READ-ONLY (G7 observation mode): the write
 * registry refuses W1/W2 for it until JP flips writes_enabled.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { validateEnv } from '../src/config/env.ts';
import { runMigrations } from './migrate/migrations.ts';
import { AresClient } from '../src/services/ares.ts';
import { syncProject } from '../worker/syncAres.ts';
import { refreshProjectModel } from '../worker/refreshModel.ts';
import { Deliverable, Project, SyncRun } from '../src/models/index.ts';

const env = validateEnv(process.env);
const CODE = process.env.CODE;
const BOARD = process.env.BOARD;
if (!env.MONGODB_URI || !env.ARES_URL || !env.ARES_API_KEY || !CODE || !BOARD) {
  console.error('[migrate-open-cards] MONGODB_URI, ARES_URL, ARES_API_KEY, CODE, BOARD required');
  process.exit(1);
}

await mongoose.connect(env.MONGODB_URI);
await runMigrations(mongoose.connection);

let project = await Project.findOne({ code: CODE });
if (!project) {
  project = await Project.create({
    code: CODE,
    name: process.env.NAME ?? CODE,
    trello_board_id: BOARD,
    trello_label: process.env.LABEL ?? null,
    weekly_capacity: Number(process.env.CAPACITY ?? 120),
    writes_enabled: process.env.WRITES !== '0',
  });
  console.log(`[migrate-open-cards] project ${CODE} created${process.env.WRITES === '0' ? ' READ-ONLY (G7 observation mode)' : ''}`);
}

const client = new AresClient({ baseUrl: env.ARES_URL, apiKey: env.ARES_API_KEY });
const stats = await syncProject(client, project);
await SyncRun.create({ project_id: project._id, source: 'ares', ok: true, stats });
console.log('[migrate-open-cards] sync:', JSON.stringify(stats));

const refresh = await refreshProjectModel(project._id);
console.log('[migrate-open-cards] model:', JSON.stringify({ ...refresh, alerts: refresh.alerts.length }));

const open = await Deliverable.countDocuments({ project_id: project._id, active: true });
const withDeadline = await Deliverable.countDocuments({
  project_id: project._id, active: true,
  $or: [{ trello_due: { $ne: null } }, { sheet_deadline: { $ne: null } }],
});
const noDifficulty = await Deliverable.countDocuments({ project_id: project._id, active: true, difficulty: null });
console.log(`[migrate-open-cards] summary: ${open} open deliverables · deadline coverage ${withDeadline}/${open} · missing difficulty ${noDifficulty}`);
console.log('[migrate-open-cards] next: allow-list users, assign membership, and review the corrections list in Pipeline.');
await mongoose.disconnect();
