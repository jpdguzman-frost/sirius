/**
 * Batch-3 seeded probe (phase 13i, owls #23/#25) — exercises the capacity lock
 * and the suggest-bar counts end to end against an ISOLATED in-memory mongod.
 * Never a real database, never a Trello call, never a Sheets call. Usage:
 *   npx tsx scripts/batch3-probe.ts
 * Exits non-zero on the first failed check.
 *
 * What it proves, in order:
 *   1. rt-837 seeded, then locked by the shipped migration 006 entry;
 *   2. PATCH /capacity → 403 CAPACITY_LOCKED on rt-837 with no capacity.set
 *      audit row, and 200 on the unlocked rt-test;
 *   3. the admin toggle unlocks (audited, before/after), the write then lands,
 *      re-locking closes it again;
 *   4. /suggest answers plan/notes/strain, and the THREE EXPRESSIONS THE
 *      CLIENT USES for the expanded bar are computed here from that payload —
 *      so the counts are checked against the real planner, not a fixture.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, Deliverable, Project, User, UserProject } from '../src/models/index.ts';
import { MIGRATIONS, runMigrations } from './migrate/migrations.ts';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(`[probe] ${ok ? 'PASS' : 'FAIL'} — ${label}${ok || detail === undefined ? '' : ` · ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const server = await MongoMemoryServer.create();
await mongoose.connect(server.getUri('sirius-batch3-probe'));

try {
  await runMigrations(mongoose.connection);

  // ---- 1. seed two projects, an admin and a plain member -------------------
  const locked = await Project.create({
    code: 'rt-837', name: 'Frost Retainer', trello_board_id: 'probe-a', weekly_capacity: 120,
  });
  const open = await Project.create({
    code: 'rt-test', name: 'Test Board', trello_board_id: 'probe-b', weekly_capacity: 12,
  });
  const member = await User.create({ email: 'pm@frostdesigngroup.com' });
  const admin = await User.create({ email: 'jp@frostdesigngroup.com', is_admin: true });
  for (const p of [locked, open]) {
    await UserProject.create({ user_id: member._id, project_id: p._id });
    await UserProject.create({ user_id: admin._id, project_id: p._id });
  }

  // the shipped migration entry does the locking — not a hand-written $set
  const m006 = MIGRATIONS.find((m) => m.id === '006-capacity-lock-rt837');
  if (!m006) throw new Error('migration 006-capacity-lock-rt837 is missing');
  await m006.up(mongoose.connection);
  check('006 locks rt-837', (await Project.findById(locked._id).orFail()).capacity_locked === true);
  check('006 leaves rt-test unlocked', (await Project.findById(open._id).orFail()).capacity_locked === false);
  await m006.up(mongoose.connection);
  check('006 is idempotent (one audit row)', (await AuditLog.countDocuments({ action: 'capacity.lock' })) === 1);

  const app = createApp({ env: validateEnv({ NODE_ENV: 'test' }), redis: null, mongo: null });
  const asMember = request.agent(app);
  await asMember.post('/__test/login').send({ userId: String(member._id), email: member.email });
  const asAdmin = request.agent(app);
  await asAdmin.post('/__test/login').send({ userId: String(admin._id), email: admin.email });

  // ---- 2. the lock refuses the write --------------------------------------
  const refused = await asMember.patch(`/api/projects/${locked._id}/capacity`).send({ weekly: 92 });
  check('locked project → 403 CAPACITY_LOCKED', refused.status === 403 && refused.body?.error?.code === 'CAPACITY_LOCKED', {
    status: refused.status, code: refused.body?.error?.code,
  });
  check('rt-837 capacity untouched (120 is JP-held calibration)', (await Project.findById(locked._id).orFail()).weekly_capacity === 120);
  check('refusal wrote no capacity.set row', (await AuditLog.countDocuments({ action: 'capacity.set' })) === 0);

  const allowed = await asMember.patch(`/api/projects/${open._id}/capacity`).send({ weekly: 14 });
  check('unlocked project → 200', allowed.status === 200, { status: allowed.status });
  check('unlocked echo carries capacity.locked=false', allowed.body?.capacity?.locked === false);
  const read = await asMember.get(`/api/projects/${locked._id}/deliverables`);
  check('GET /deliverables carries capacity.locked=true', read.body?.capacity?.locked === true);

  // ---- 3. admin toggle round trip -----------------------------------------
  const unlock = await asAdmin.patch(`/api/admin/projects/${locked._id}/capacity-lock`).send({ locked: false });
  check('admin unlock → 200 capacityLocked:false', unlock.status === 200 && unlock.body?.capacityLocked === false, unlock.body);
  const unlockRow = await AuditLog.findOne({ action: 'capacity.unlock' });
  check('capacity.unlock audited with actor + before/after', Boolean(
    unlockRow &&
    unlockRow.actor === admin.email &&
    unlockRow.entity === 'project' &&
    String(unlockRow.project_id) === String(locked._id) &&
    (unlockRow.before as { capacity_locked?: boolean })?.capacity_locked === true &&
    (unlockRow.after as { capacity_locked?: boolean })?.capacity_locked === false,
  ), unlockRow ? { actor: unlockRow.actor, before: unlockRow.before, after: unlockRow.after } : null);

  const nowOk = await asMember.patch(`/api/projects/${locked._id}/capacity`).send({ weekly: 92 });
  check('after unlock the write lands (200)', nowOk.status === 200, { status: nowOk.status });

  const noop = await asAdmin.patch(`/api/admin/projects/${locked._id}/capacity-lock`).send({ locked: false });
  check('no-op toggle → 200, still one unlock row', noop.status === 200 && (await AuditLog.countDocuments({ action: 'capacity.unlock' })) === 1);

  const relock = await asAdmin.patch(`/api/admin/projects/${locked._id}/capacity-lock`).send({ locked: true });
  check('admin re-lock → 200', relock.status === 200 && relock.body?.capacityLocked === true);
  const refusedAgain = await asMember.patch(`/api/projects/${locked._id}/capacity`).send({ weekly: 5 });
  check('re-locked project → 403 again', refusedAgain.status === 403 && refusedAgain.body?.error?.code === 'CAPACITY_LOCKED');

  const asNonAdmin = await asMember.patch(`/api/admin/projects/${open._id}/capacity-lock`).send({ locked: true });
  check('non-admin member → 403 ADMIN_ONLY', asNonAdmin.status === 403 && asNonAdmin.body?.error?.code === 'ADMIN_ONLY');

  // ---- 4. suggest counts, computed with the client's own expressions -------
  //
  // The three expressions below are the ones frontend/scripts/01-app.js uses
  // for the expanded bar (suggestProposed / suggestFlagged / suggestHardHeavy),
  // run here against the REAL planner over a seeded board. Both fixtures carry
  // a hand computation, so the probe fails on a wrong number and not merely on
  // a broken inequality — a `flagged 0` that is right for the wrong reason is
  // exactly the failure an inequality cannot see.
  interface Suggested {
    plan?: Record<string, string>;
    notes?: Record<string, string>;
    strain?: string[];
    weekKeys?: string[];
    backlogHardShare?: number;
    unavoidable?: boolean;
  }
  const counts = (s: Suggested) => ({
    proposed: s.plan ? Object.keys(s.plan).length : 0,
    flagged: s.plan && s.notes ? Object.keys(s.plan).filter((id) => s.notes![id]).length : 0,
    hardHeavy: Array.isArray(s.strain) ? s.strain.length : 0,
  });

  /* Fixture A — 20 cards over 4 weeks on rt-test, whose capacity is 14 by now
     (the unlocked write above set it). By hand, against lib/planner:
       difficulties cycle to 7 Hard / 7 Medium / 6 Easy;
       y = min(14, ceil(20/4)) = 5; backlog hard share 7/20 = 35% > the 12.9%
       ceiling, so `unavoidable` and the hard quota T = ceil(7/4) = 2;
       the 7 Hard spread 2/2/2/1, the 13 others fill each week to y = 5;
       every card lands → proposed 20, no card needs a note → flagged 0,
       and every week's hard share (2/5, 2/5, 2/5, 1/5) clears 12.9%
       → hard-heavy 4. */
  const DIFF = ['Easy', 'Medium', 'Hard', 'Hard', 'Medium', 'Easy'] as const;
  for (let i = 1; i <= 20; i++) {
    await Deliverable.create({
      project_id: open._id, mc_number: `MC-${i}`, display_id: `MC-${i}`, trello_card_id: `p${i}`,
      name: `Probe ${i}`, difficulty: DIFF[i % DIFF.length]!, lane: 'design', current_list: 'Design',
    });
  }
  check('rt-test capacity is the 14 the unlocked write set', (await Project.findById(open._id).orFail()).weekly_capacity === 14);
  const sug = await asMember.post(`/api/projects/${open._id}/suggest`).send({ from: '2026-08-03', weeks: 4 });
  check('/suggest → 200', sug.status === 200, { status: sug.status });
  const s = sug.body as Suggested;
  const a = counts(s);
  console.log(`[probe] fixture A counts — proposed ${a.proposed} · flagged ${a.flagged} · hard-heavy ${a.hardHeavy} (of ${s.weekKeys?.length ?? 0} weeks)`);
  check('A · proposed = 20 (every card placed)', a.proposed === 20, a);
  check('A · flagged = 0 (no card needed a compromise)', a.flagged === 0, s.notes);
  check('A · hard-heavy = 4 (every week clears the 12.9% ceiling)', a.hardHeavy === 4, s.strain);
  check('A · the mix is unavoidable at 35% Hard', s.unavoidable === true && Math.abs((s.backlogHardShare ?? 0) - 0.35) < 1e-9, {
    unavoidable: s.unavoidable, share: s.backlogHardShare,
  });
  check('A · every strain key is a week key', (s.strain ?? []).every((k) => (s.weekKeys ?? []).includes(k)), s.strain);
  check('A · nothing was applied by /suggest (AC-15)', (await Deliverable.countDocuments({ project_id: open._id, slotted_week: { $ne: null } })) === 0);

  /* Fixture B — the mirror image, so `flagged` is proved non-zero too. Four
     Medium cards over 4 weeks on a board whose capacity is 10; two carry a 🛑
     blocker. By hand: no Hard at all, so hard-heavy 0 and the quota is moot;
     y = min(10, ceil(4/4)) = 1, so each week takes exactly one card and a
     blocked card simply cannot take week 1 — whatever order the pipeline
     returns, all four land (proposed 4) and exactly the two blocked ones carry
     a `deferred — …` note (flagged 2). R-a in one line: 2 flagged, 0
     hard-heavy, different units. */
  const blocked = await Project.create({
    code: 'rt-probe-b', name: 'Blocker Board', trello_board_id: 'probe-c', weekly_capacity: 10,
  });
  await UserProject.create({ user_id: member._id, project_id: blocked._id });
  for (let i = 1; i <= 4; i++) {
    await Deliverable.create({
      project_id: blocked._id, mc_number: `MB-${i}`, display_id: `MB-${i}`, trello_card_id: `b${i}`,
      name: `Blocked ${i}`, difficulty: 'Medium', lane: 'design', current_list: 'Design',
      ...(i <= 2 ? { blocker: '🛑 waiting on client' } : {}),
    });
  }
  const sugB = await asMember.post(`/api/projects/${blocked._id}/suggest`).send({ from: '2026-08-03', weeks: 4 });
  const b = counts(sugB.body as Suggested);
  console.log(`[probe] fixture B counts — proposed ${b.proposed} · flagged ${b.flagged} · hard-heavy ${b.hardHeavy}`);
  check('B · proposed = 4', b.proposed === 4, b);
  check('B · flagged = 2 — the two blocked cards, and only those', b.flagged === 2, (sugB.body as Suggested).notes);
  check('B · hard-heavy = 0 with no Hard card in the board', b.hardHeavy === 0, (sugB.body as Suggested).strain);
  check('B · flagged and hard-heavy move independently (R-a)', b.flagged > 0 && b.hardHeavy === 0);
} finally {
  await mongoose.disconnect();
  await server.stop();
}

console.log(failures === 0 ? '[probe] all checks passed' : `[probe] ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
