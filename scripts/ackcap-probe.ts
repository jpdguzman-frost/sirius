/**
 * Ack-capacity seeded probe (T135, JP ruling A 2026-08-17) — exercises the
 * amended invariant-13 situation key end to end against an ISOLATED in-memory
 * mongod. Never a real database, never a Trello call, never a Sheets call.
 * Usage:
 *   npx tsx scripts/ackcap-probe.ts
 * Exits non-zero on the first failed check.
 *
 * What it proves, in order:
 *   1. every conflict key carries the project's capacity as component 3 of 4,
 *      uniformly across urgent-overlap, over-capacity and past-deadline;
 *   2. ack → SUPPRESSED;
 *   3. PATCH /capacity → RE-SURFACED under a new key, the old ack row intact;
 *   4. re-ack at the new capacity → SUPPRESSED again;
 *   5. reverting the capacity re-suppresses through the ORIGINAL ack (ruling A
 *      is a situation dimension, not an expiry — OD-4 stays open);
 *   6. the audit trail: one capacity.set per landed PATCH, exactly two
 *      conflict.acknowledge rows, and ZERO rows produced by either
 *      invalidation (a non-match is not a state change, invariant 10);
 *   7. the Option-B lock leg: 403 CAPACITY_LOCKED, ack still suppressing, no
 *      capacity.set row;
 *   8. the migration leg: a legacy 3-component ack is lifted by the shipped
 *      007 entry and silences its conflict again.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, ConflictAcknowledgement, Deliverable, Project, User, UserProject } from '../src/models/index.ts';
import { MIGRATIONS, runMigrations } from './migrate/migrations.ts';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(`[probe] ${ok ? 'PASS' : 'FAIL'} — ${label}${ok || detail === undefined ? '' : ` · ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

interface WireConflict {
  key: string;
  week: string;
  rule: string;
}
interface Deadlines {
  conflicts: WireConflict[];
  acknowledged: Array<WireConflict & { ack: { by: string; reason: string | null } | null }>;
  milestones: Array<{ late: boolean }>;
}

const server = await MongoMemoryServer.create();
await mongoose.connect(server.getUri('sirius-ackcap-probe'));

try {
  await runMigrations(mongoose.connection);

  // ---- seed: one board whose week 2026-08-17 trips ALL THREE rules ---------
  const project = await Project.create({
    code: 'rt-test', name: 'Test Board', trello_board_id: 'probe-ack', weekly_capacity: 2,
  });
  const member = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: member._id, project_id: project._id });
  for (let i = 1; i <= 3; i++) {
    await Deliverable.create({
      project_id: project._id, mc_number: `MC-${i}`, display_id: `MC-${i}`, trello_card_id: `c${i}`,
      name: `Probe ${i}`, difficulty: 'Medium', lane: 'design', current_list: 'Design',
      urgency: i === 3 ? 'Normal' : 'Urgent', slotted_week: '2026-08-03', sheet_deadline: '2026-08-05',
    });
  }

  const app = createApp({ env: validateEnv({ NODE_ENV: 'test' }), redis: null, mongo: null });
  const asMember = request.agent(app);
  await asMember.post('/__test/login').send({ userId: String(member._id), email: member.email });

  const read = async (): Promise<Deadlines> =>
    (await asMember.get(`/api/projects/${project._id}/deadlines`)).body as Deadlines;

  // ---- 1. the key shape, uniformly across all three rules -------------------
  const first = await read();
  const tri = first.conflicts.filter((c) => c.week === '2026-08-17').map((c) => c.rule).sort();
  check('week 2026-08-17 trips all three acknowledgeable rules', JSON.stringify(tri) === JSON.stringify(['over-capacity', 'past-deadline', 'urgent-overlap']), tri);
  check('every key is week|rule|capacity|pairs with the capacity in slot 3', first.conflicts.every((c) => {
    const p = c.key.split('|');
    return p.length === 4 && p[0] === c.week && p[1] === c.rule && p[2] === '2';
  }), first.conflicts.map((c) => c.key));

  // ---- 2. ack → suppressed --------------------------------------------------
  const target = first.conflicts.find((c) => c.rule === 'urgent-overlap' && c.week === '2026-08-17');
  if (!target) throw new Error('probe fixture no longer raises a 2026-08-17 urgent-overlap conflict');
  await asMember
    .post(`/api/projects/${project._id}/conflicts/acknowledge`)
    .send({ conflict_key: target.key, reason: 'accepted by choice' });
  const acked = await read();
  check('ack → the conflict is suppressed', !acked.conflicts.some((c) => c.key === target.key) && acked.acknowledged.some((c) => c.key === target.key));
  check('the stored key carries the capacity it was acked under', (await ConflictAcknowledgement.findOne({ project_id: project._id }))?.conflict_key === target.key, target.key);
  const lateBefore = acked.milestones.filter((m) => m.late).length;
  check('card-level late flags survive the ack (BR-9a)', lateBefore > 0, { lateBefore });

  // ---- 3. capacity change → re-surfaced ------------------------------------
  const conflictAuditBefore = await AuditLog.countDocuments({ action: { $regex: '^conflict\\.' } });
  const bump = await asMember.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 1 });
  check('PATCH /capacity 2 → 1 lands (200)', bump.status === 200, { status: bump.status });
  const moved = await read();
  const resurfaced = moved.conflicts.find((c) => c.rule === 'urgent-overlap' && c.week === '2026-08-17');
  check('the acknowledged conflict is back under `conflicts`', Boolean(resurfaced), moved.conflicts.map((c) => c.key));
  check('…under a NEW key carrying the new capacity', resurfaced?.key !== target.key && resurfaced?.key.includes('|1|') === true, resurfaced?.key);
  check('…and nothing is left acknowledged', moved.acknowledged.length === 0, moved.acknowledged.map((c) => c.key));
  check('every rule re-surfaced, not just over-capacity (uniformity)', new Set(moved.conflicts.map((c) => c.rule)).size === 3, moved.conflicts.map((c) => c.rule));
  check('the superseded ack ROW survives (invalidation is a non-match)', (await ConflictAcknowledgement.countDocuments({ project_id: project._id })) === 1);
  check('the non-match wrote NO audit row (invariant 10)', (await AuditLog.countDocuments({ action: { $regex: '^conflict\\.' } })) === conflictAuditBefore, { conflictAuditBefore });
  check('card-level late flags are untouched by the capacity change', moved.milestones.filter((m) => m.late).length === lateBefore);

  // ---- 4. re-ack at the new capacity → suppressed again ---------------------
  await asMember.post(`/api/projects/${project._id}/conflicts/acknowledge`).send({ conflict_key: resurfaced!.key });
  const reacked = await read();
  check('re-ack → suppressed again', !reacked.conflicts.some((c) => c.key === resurfaced!.key) && reacked.acknowledged.some((c) => c.key === resurfaced!.key));
  const keys = (await ConflictAcknowledgement.find({ project_id: project._id })).map((a) => a.conflict_key);
  check('both acks coexist — |2| and |1| side by side under the unique index', keys.length === 2 && keys.some((k) => k.includes('|2|')) && keys.some((k) => k.includes('|1|')), keys);

  // ---- 5. reverting the capacity re-suppresses through the ORIGINAL ack -----
  const revert = await asMember.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 2 });
  check('PATCH /capacity 1 → 2 lands (200)', revert.status === 200, { status: revert.status });
  const back = await read();
  check('the original ack silences it again — a SITUATION dimension, not an expiry', !back.conflicts.some((c) => c.key === target.key) && back.acknowledged.some((c) => c.key === target.key));

  // ---- 6. the audit trail ---------------------------------------------------
  check('two capacity.set rows — one per landed PATCH', (await AuditLog.countDocuments({ action: 'capacity.set' })) === 2);
  check('exactly two conflict.acknowledge rows', (await AuditLog.countDocuments({ action: 'conflict.acknowledge' })) === 2);
  check('zero conflict.restore rows — nothing was restored by hand', (await AuditLog.countDocuments({ action: 'conflict.restore' })) === 0);
  check('no audit action was invented for invalidation', (await AuditLog.countDocuments({ action: { $regex: 'invalidat|lapse|resurface' } })) === 0);

  // ---- 7. the Option-B lock leg --------------------------------------------
  await Project.updateOne({ _id: project._id }, { $set: { capacity_locked: true } });
  const capSetBefore = await AuditLog.countDocuments({ action: 'capacity.set' });
  const refused = await asMember.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 9 });
  check('locked project → 403 CAPACITY_LOCKED', refused.status === 403 && refused.body?.error?.code === 'CAPACITY_LOCKED', { status: refused.status, code: refused.body?.error?.code });
  check('the refusal wrote no capacity.set row', (await AuditLog.countDocuments({ action: 'capacity.set' })) === capSetBefore);
  const locked = await read();
  check('a REFUSED write invalidates nothing — the ack keeps suppressing', locked.acknowledged.some((c) => c.key === target.key));
  await Project.updateOne({ _id: project._id }, { $set: { capacity_locked: false } });

  // ---- 8. the migration leg -------------------------------------------------
  const other = await Project.create({
    code: 'rt-legacy', name: 'Legacy Board', trello_board_id: 'probe-legacy', weekly_capacity: 2,
  });
  await UserProject.create({ user_id: member._id, project_id: other._id });
  for (let i = 1; i <= 3; i++) {
    await Deliverable.create({
      project_id: other._id, mc_number: `ML-${i}`, display_id: `ML-${i}`, trello_card_id: `c${i}`,
      name: `Legacy ${i}`, difficulty: 'Medium', lane: 'design', current_list: 'Design',
      urgency: i === 3 ? 'Normal' : 'Urgent', slotted_week: '2026-08-03', sheet_deadline: '2026-08-05',
    });
  }
  const legacyRead = async (): Promise<Deadlines> =>
    (await asMember.get(`/api/projects/${other._id}/deadlines`)).body as Deadlines;
  const live = (await legacyRead()).conflicts.find((c) => c.rule === 'urgent-overlap' && c.week === '2026-08-17')!;
  const legacyKey = live.key.split('|').filter((_, i) => i !== 2).join('|'); // what phase-8a stored
  const legacyRow = await ConflictAcknowledgement.create({
    project_id: other._id, conflict_key: legacyKey, acknowledged_by: member.email,
  });
  const preLift = await legacyRead();
  check('before 007 the legacy 3-component ack matches nothing', preLift.conflicts.some((c) => c.key === live.key) && preLift.acknowledged.length === 0);

  const m007 = MIGRATIONS.find((m) => m.id === '007-ack-capacity');
  if (!m007) throw new Error('migration 007-ack-capacity is missing');
  await m007.up(mongoose.connection);
  const lifted = await legacyRead();
  check('after 007 the same ack silences the conflict again (suppression preserved)', !lifted.conflicts.some((c) => c.key === live.key) && lifted.acknowledged.some((c) => c.key === live.key));
  check('007 audited the lift with before/after', Boolean(await AuditLog.findOne({
    action: 'ack.backfill-capacity', actor: 'migration:007-ack-capacity', entity: 'conflict_ack', entity_id: String(legacyRow._id),
  })));
  const liftRows = await AuditLog.countDocuments({ action: 'ack.backfill-capacity' });
  await m007.up(mongoose.connection);
  check('007 is idempotent — a second run writes nothing', (await AuditLog.countDocuments({ action: 'ack.backfill-capacity' })) === liftRows, { liftRows });
  check('007 left the already-amended acks on the first project alone', (await ConflictAcknowledgement.countDocuments({ project_id: project._id })) === 2);
} finally {
  await mongoose.disconnect();
  await server.stop();
}

console.log(failures === 0 ? '[probe] all checks passed' : `[probe] ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
