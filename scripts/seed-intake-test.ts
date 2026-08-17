/**
 * Seed a SYNTHETIC intake mirror into a TEST project, so the team can
 * exercise Requests + frost notes (FR-3, FR-11) while the live sheet stays
 * deferred. Fixture data only — no real briefs, requestors or clients ever
 * (invariant 16).
 *
 * Safety: refuses any project whose board is listed in
 * PROD_TRELLO_BOARD_IDS, regardless of NODE_ENV — unlike the boot guard,
 * which trusts production. Seeding real projects is never wanted.
 *
 * Rows go through the REAL intake pipeline (syncIntakeRows): mirror upsert,
 * deadline join to matching MC groups, reject surfacing. Idempotent —
 * re-running replaces the same mirror; connecting the real sheet later
 * marks these rows inactive automatically (mirror semantics, AC-9).
 *
 * Usage: CODE=rt-test npx tsx scripts/seed-intake-test.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { validateEnv } from '../src/config/env.ts';
import { Deliverable, Project } from '../src/models/index.ts';
import { syncIntakeRows } from '../worker/syncIntake.ts';

const env = validateEnv(process.env);
const CODE = process.env.CODE;
if (!env.MONGODB_URI || !CODE) {
  console.error('[seed-intake] MONGODB_URI and CODE are required');
  process.exit(1);
}

await mongoose.connect(env.MONGODB_URI);
const project = await Project.findOne({ code: CODE });
if (!project) {
  console.error(`[seed-intake] no project with code ${CODE}`);
  process.exit(1);
}
const prodBoards = (env.PROD_TRELLO_BOARD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (prodBoards.includes(project.trello_board_id)) {
  console.error(
    `[seed-intake] REFUSING: ${CODE} points at PRODUCTION board ${project.trello_board_id} — synthetic intake rows are for test projects only`,
  );
  process.exit(1);
}

// Tie some rows to real MC groups on the TEST board so 'In Pipeline' status
// and the deadline join both light up.
const filedMcs = (await Deliverable.distinct('mc_number', { project_id: project._id, active: true }))
  .filter((mc): mc is string => Boolean(mc))
  .slice(0, 4);
console.log(`[seed-intake] ${CODE}: joining ${filedMcs.length} existing MC group(s): ${filedMcs.join(', ') || '(none)'}`);

/* Year and Month are the sheet's own filing-period columns. They are seeded
   deliberately MIXED — a full name, a 1-12 number, an abbreviation — because
   the live sheet's encoding is not known until the credential lands and the
   Requests tab canonicalises all three onto one value (monthShort). Two years
   and several months are what give the YEAR/MONTH filters more than an 'All'
   option, the column sorts something to move, and the default newest-filed
   order a visible effect. One row leaves both blank, for the em-dash cell and
   the unranked-last rule. Invariant 16: this fixture is the only way any of
   that is exercisable. */
const HEADER = ['MC #', 'Deliverable', 'Type', 'Use Case', 'Type', 'Requestor', 'Year', 'Month', 'Deadline', 'Brief', 'In Frost Prod'];
const row = (
  mc: string, name: string, deadline: string, year: string, month: string,
  brief = 'Synthetic fixture brief — no client content',
) => [mc, name, 'Static', 'Team testing', 'Web', 'fixtures@frostdesigngroup.com', year, month, deadline, brief, 'TRUE'];

// period per filed row, cycling the three encodings the parser passes through raw
const PERIODS = [['2026', 'August'], ['2026', '9'], ['2025', 'Jul'], ['2026', 'October']];

const rows: string[][] = [HEADER];
// filed rows → 'In Pipeline'; their deadlines join onto the MC group (AC-8 shape)
filedMcs.forEach((mc, i) => {
  const [year, month] = PERIODS[i % PERIODS.length]!;
  rows.push(row(mc, `Filed fixture ${i + 1}`, `2026-09-${String(10 + i).padStart(2, '0')}`, year!, month!));
});
// unfiled rows → 'For Filing'; targets for frost-note testing. The
// clarification flag does NOT change status (owls #34–#35) — it shows in the
// Remarks cell and drives the FOR CLARIFICATION tile only.
rows.push(row('MC-9101', 'Unfiled fixture — flag me for clarification', '2026-09-18', '2026', 'September'));
rows.push(row('MC-9102', 'Unfiled fixture — add a remark to me', '2026-09-21', '2026', '8'));
rows.push(row('MC-9103', 'Unfiled fixture — plain', '2026-09-25', '2025', 'December'));
rows.push(row('MC-9104', 'Unfiled fixture — no deadline (missing-deadline filter)', '', '', ''));
rows.push(['', 'Broken fixture row — lands in the corrections panel', 'Static', 'Team testing', 'Web', 'fixtures@frostdesigngroup.com', '2026', 'September', '2026-09-30', 'no MC number', 'TRUE']);

const stats = await syncIntakeRows(project._id, rows);
console.log('[seed-intake] done:', JSON.stringify(stats));
console.log('[seed-intake] undo: db.intake_requests.deleteMany({project_id}) + db.intake_rejects.deleteMany({project_id}) for this project');
await mongoose.disconnect();
