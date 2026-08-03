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
import { forecast } from '../lib/forecast.ts';
import { Deliverable, Project } from '../src/models/index.ts';
import { EMPIRICAL } from '../lib/model.ts';

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

console.log('[gate] refreshing model…');
const refresh = await refreshProjectModel(project._id);
console.log('[gate] refresh:', JSON.stringify({ ...refresh, alerts: refresh.alerts.length }));

const { model, provenance } = await loadProjectModel(project._id);

const sampleCards = await Deliverable.find({
  project_id: project._id,
  active: true,
  difficulty: { $ne: null },
}).limit(8);

const today = new Date().toISOString().slice(0, 10);
const lines: string[] = [];
lines.push(`# Gate T045 — model validation evidence (${today})`);
lines.push(`\nBoard: ${BOARD} · window: ${project.model_window_months} months · generated locally, NOT committed.\n`);
lines.push(`## Sync\n\n\`\`\`json\n${JSON.stringify(syncStats, null, 2)}\n\`\`\``);
lines.push(`## Refresh\n\n\`\`\`json\n${JSON.stringify(refresh, null, 2)}\n\`\`\``);
lines.push(`## Grid (refreshed) vs BRD Appendix snapshot\n`);
lines.push(`Provenance: ${provenance.source} · cells ${provenance.cells} · fallback ${provenance.fallback}\n`);
lines.push('| key | refreshed 0.7 | snapshot 0.7 | refreshed n | snapshot n |');
lines.push('|---|---|---|---|---|');
for (const diff of ['Easy', 'Medium', 'Hard'] as const) {
  for (const lane of ['design', 'ops', 'assets'] as const) {
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
  const d = (x: Date) => x.toDateString().slice(4, 10);
  lines.push(`| ${card.display_id} ${card.name.slice(0, 40)} | ${card.difficulty}/${f.lane} | ${d(f.sketchDelivery)} | ${d(f.sketchApproved)} | ${d(f.renderDelivery)} |`);
}
lines.push(`\n**Gate question for the PM:** do the grid values and these dates match how delivery actually behaves? Pass/fail is JP's call (T045).\n`);

fs.writeFileSync('docs/gate-t045-model-validation.md', lines.join('\n'));
console.log('[gate] report written to docs/gate-t045-model-validation.md');
await mongoose.disconnect();
