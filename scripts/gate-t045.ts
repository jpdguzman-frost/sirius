/**
 * T044 — gate T045 evidence generator. Syncs the real board from the ARES
 * read API into a LOCAL database, runs the model refresh, and writes the
 * validation report for JP + PM to docs/gate-t045-model-validation.md
 * (gitignored — it names real deliverables).
 *
 * Usage: MONGODB_URI=... ARES_URL=... ARES_API_KEY=... BOARD=hLL7WW2V ROWKEY=837 \
 *        npx tsx scripts/gate-t045.ts
 */

import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { validateEnv } from '../src/config/env.ts';
import { runMigrations } from './migrate/migrations.ts';
import { AresClient } from '../src/services/ares.ts';
import { syncProject } from '../worker/syncAres.ts';
import { refreshProjectModel } from '../worker/refreshModel.ts';
import { loadProjectModel } from '../src/services/model-grid.ts';
import { manilaToday } from '../src/services/pipeline.ts';
import { forecast } from '../lib/forecast.ts';
import { Deliverable, ModelGrid, Project, SyncRun } from '../src/models/index.ts';
import { EMPIRICAL } from '../lib/model.ts';
import type { Lane } from '../lib/model.ts';

const env = validateEnv(process.env);
if (!env.MONGODB_URI || !env.ARES_URL || !env.ARES_API_KEY) {
  console.error('MONGODB_URI, ARES_URL, ARES_API_KEY required');
  process.exit(1);
}
const BOARD = process.env.BOARD ?? 'hLL7WW2V';
const ROWKEY = process.env.ROWKEY ?? '837';

await mongoose.connect(env.MONGODB_URI);
await runMigrations(mongoose.connection);

let project = await Project.findOne({ code: `rt-${ROWKEY}` });
if (!project) {
  project = await Project.create({
    code: `rt-${ROWKEY}`,
    name: `Gate evidence rt-${ROWKEY}`,
    trello_board_id: BOARD,
    weekly_capacity: 120,
  });
}

const client = new AresClient({ baseUrl: env.ARES_URL, apiKey: env.ARES_API_KEY });
console.log('[gate] syncing board', BOARD, '…');
const syncStats = await syncProject(client, project);
console.log('[gate] sync:', JSON.stringify(syncStats));

// X8: the refresh throws when the code is not rt-<n> or Ares has no model; the
// script still writes the report and reaches the T182 verdict (FAIL), never a
// stack trace. `scriptStart` keeps a stale sync_runs row from backing a verdict.
const scriptStart = new Date();
console.log('[gate] refreshing model…');
let refresh: Awaited<ReturnType<typeof refreshProjectModel>> | null = null;
let refreshError: string | null = null;
try {
  refresh = await refreshProjectModel(project._id);
  console.log('[gate] refresh:', JSON.stringify({ ...refresh, alerts: refresh.alerts.length }));
} catch (err) {
  refreshError = err instanceof Error ? err.message : String(err);
  console.error('[gate] refresh threw — falling through to the T182 verdict:', refreshError);
}

const { model, provenance } = await loadProjectModel(project._id);

const sampleCards = await Deliverable.find({
  project_id: project._id,
  active: true,
  difficulty: { $ne: null },
}).limit(8);

// Invariant 11: the report's day and the sample forecasts' start are the Manila calendar day.
const today = manilaToday();
const MANILA_SHORT = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: '2-digit' });
const lines: string[] = [];
lines.push(`# Gate T045 — model validation evidence (${today})`);
lines.push(`\nBoard: ${BOARD} · window: ${project.model_window_months} months · generated locally, NOT committed.\n`);
lines.push(`## Sync\n\n\`\`\`json\n${JSON.stringify(syncStats, null, 2)}\n\`\`\``);
lines.push(`## Refresh\n\n\`\`\`json\n${JSON.stringify(refresh ?? { error: refreshError }, null, 2)}\n\`\`\``);
lines.push(`## Grid (refreshed) vs BRD Appendix snapshot\n`);
lines.push(`Provenance: ${provenance.source} · cells ${provenance.cells} · fallback ${provenance.fallback}\n`);
lines.push('| key | refreshed 0.7 | snapshot 0.7 | refreshed n | snapshot n |');
lines.push('|---|---|---|---|---|');
for (const diff of ['Easy', 'Medium', 'Hard'] as const) {
  // X8: every lane the refreshed model carries (content included), then any snapshot-only lane.
  const lanes = [...new Set([...Object.keys(model.design[diff] ?? {}), ...Object.keys(EMPIRICAL.design[diff] ?? {})])] as Lane[];
  for (const lane of lanes) {
    const r = model.design[diff]?.[lane];
    const s = EMPIRICAL.design[diff]?.[lane];
    if (r || s) lines.push(`| ${diff}/${lane} | ${r?.['0.7'] ?? '—'} | ${s?.['0.7'] ?? '—'} | ${r?.n ?? '—'} | ${s?.n ?? '—'} |`);
  }
}
lines.push(`| review | ${model.review['0.7']} | ${EMPIRICAL.review['0.7']} | ${model.review.n} | ${EMPIRICAL.review.n} |`);
lines.push(`\n## Sample forecasts (start ${today}, confidence 0.7) — do these look like reality?\n`);
lines.push('| deliverable | difficulty/lane | sketch delivery | sketch approved | render delivery |');
lines.push('|---|---|---|---|---|');
for (const card of sampleCards) {
  const f = forecast(
    { difficulty: card.difficulty ?? undefined, currentList: card.current_list ?? '', labels: card.labels, startDate: today, confidence: '0.7' },
    model,
  );
  const d = (x: Date) => MANILA_SHORT.format(x); // 'Sep 08' — Manila-fixed, same shape as before
  lines.push(`| ${card.display_id} ${card.name.slice(0, 40)} | ${card.difficulty}/${f.lane} | ${d(f.sketchDelivery)} | ${d(f.sketchApproved)} | ${d(f.renderDelivery)} |`);
}
lines.push(`\n**Gate question for the PM:** do the grid values and these dates match how delivery actually behaves? Pass/fail is JP's call (T045).\n`);

fs.writeFileSync('docs/gate-t045-model-validation.md', lines.join('\n'));
console.log('[gate] report written to docs/gate-t045-model-validation.md');

// ---- T182: the sanity gate verdict (block 8) ------------------------------
// The refresh above already ran the gate at write time: passed cells sit in
// model_grid, failed cells (with reasons) sit on the latest sync_runs stats
// for source:'model' (provenance, PLAN.md frozen shape). Print both, exit
// non-zero when any cell failed or no model run exists.
type CellRow = Partial<Record<'lane' | 'difficulty' | 'confidence' | 'value' | 'sample_n', unknown>>;
type StatsFailure = { cell?: CellRow | string | null; reasons?: string[] };
const run = await SyncRun.findOne({ project_id: project._id, source: 'model', at: { $gte: scriptStart } })
  .sort({ at: -1 })
  .lean();
const stats = (run?.stats ?? {}) as Record<string, unknown>;
const failures = (Array.isArray(stats.failures) ? stats.failures : []) as StatsFailure[];
const written = await ModelGrid.find({ project_id: project._id }).select('lane difficulty confidence value sample_n').lean();

const cellRow = (c: CellRow | string | null | undefined, verdict: string) => {
  const k: CellRow = typeof c === 'string' ? { lane: c } : (c ?? {}); // A3-6: a failure without a cell prints '—'
  const f = (x: unknown) => (x === undefined || x === null ? '—' : String(x));
  return `| ${f(k.lane)} | ${f(k.difficulty)} | ${f(k.confidence)} | ${f(k.value)} | ${f(k.sample_n)} | ${verdict} |`;
};
console.log('\n[gate] T182 cells');
console.log('| lane | difficulty | confidence | value | n | verdict |');
console.log('|---|---|---|---|---|---|');
for (const c of written) console.log(cellRow(c, 'passed'));
for (const x of failures) console.log(cellRow(x.cell, `failed: ${(x.reasons ?? []).join(', ')}`));

const cellStats = (stats.cells ?? {}) as Record<string, unknown>;
console.log('\n[gate] T182 model envelope');
console.log(
  JSON.stringify(
    {
      run: run ? { at: run.at, ok: run.ok, error: run.error ?? null } : null,
      generatedAt: stats.generatedAt ?? null,
      window: stats.window ?? null,
      workingDayHours: stats.workingDayHours ?? null,
      historyUnverified: stats.historyUnverified ?? null,
      sampled: stats.sampled ?? null,
      considered: stats.considered ?? null,
      droppedReasons: stats.droppedReasons ?? null,
      cells: cellStats,
      unmappedWorkTypes: stats.unmappedWorkTypes ?? null,
    },
    null,
    2,
  ),
);

const failedCount = typeof cellStats.failed === 'number' ? cellStats.failed : failures.length;
await mongoose.disconnect();
if (refreshError) {
  console.error(`[gate] T182 FAIL — the model refresh threw: ${refreshError}`);
  process.exit(1);
}
if (!run || !run.ok) {
  console.error('[gate] T182 FAIL — no successful model run for the project');
  process.exit(1);
}
if (failedCount > 0) {
  console.error(`[gate] T182 FAIL — ${failedCount} cell(s) failed the gate (${written.length} passed)`);
  process.exit(1);
}
if (written.length === 0) {
  // A3-2: a gate that measured nothing cannot report a pass (T182 is JP's unfreeze precondition).
  console.error('[gate] T182 NO CELLS — nothing reached the gate (0 written, 0 failed)');
  process.exit(1);
}
console.log(`[gate] T182 PASS — ${written.length} cell(s) passed, none failed`);
