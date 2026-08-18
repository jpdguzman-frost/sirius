/**
 * Capacity lock (owl #23, JP-endorsed 2026-08-17; phase 13i).
 *
 * A locked project refuses PATCH /api/projects/:projectId/capacity with 403
 * CAPACITY_LOCKED *before any write and before the body is parsed* — and a
 * refusal is NOT a state change, so it writes no audit row (invariant 10 logs
 * changes). The lock itself is admin-only (invariant 9 via ensureAdmin) and
 * every real toggle is audited. Migration 006 locks exactly one project by
 * code, idempotently, audited.
 *
 * Polarity note: absent/false = unlocked, so every read is `=== true`. This is
 * the mirror of writes_enabled (absent = enabled, read as `!== false`).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { appScripts, template } from './helpers/source.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, Project, User, UserProject } from '../src/models/index.ts';
import { MIGRATIONS } from '../scripts/migrate/migrations.ts';

const env = validateEnv({ NODE_ENV: 'test' });

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

/**
 * `locked === undefined` simulates a pre-flag document: the schema default is
 * stripped from the db exactly as test/writes-disabled.test.ts does, so the
 * "absent means unlocked" half of the polarity is really exercised.
 */
async function setup(locked: boolean | undefined = false) {
  const project = await Project.create({
    code: 'rt-837', name: 'Fx', trello_board_id: 'fxA',
    weekly_capacity: 92, ref_week_least: 40, ref_week_typical: 92, ref_week_most: 160,
    effective_weekly_rate: 88,
    ...(locked === undefined ? {} : { capacity_locked: locked }),
  });
  if (locked === undefined) {
    await Project.collection.updateOne({ _id: project._id }, { $unset: { capacity_locked: '' } });
  }
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  const admin = await User.create({ email: 'jp@frostdesigngroup.com', is_admin: true });

  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  const asAdmin = request.agent(app);
  await asAdmin.post('/__test/login').send({ userId: String(admin._id), email: admin.email }).expect(200);
  return { app, project, user, admin, agent, asAdmin };
}

describe('PATCH /capacity — the lock refuses the write', () => {
  it('403 CAPACITY_LOCKED on a locked project: nothing written, nothing audited', async () => {
    const { project, agent } = await setup(true);
    const res = await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 7 }).expect(403);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('CAPACITY_LOCKED');
    expect(res.body.error.message).toContain('unlock');
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(92);
    // a refusal is not a state change — invariant 10 logs changes, not attempts
    expect(await AuditLog.countDocuments({ action: 'capacity.set' })).toBe(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it('a malformed body on a locked project is still 403, not 400 (lock precedes the parse)', async () => {
    const { project, agent } = await setup(true);
    for (const body of [{ weekly: 'x' }, {}, { weekly: 120, ref_week_typical: 5 }, { weekly: -3 }]) {
      const res = await agent.patch(`/api/projects/${project._id}/capacity`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(res.body.error.code, JSON.stringify(body)).toBe('CAPACITY_LOCKED');
    }
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(92);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it('a pre-flag project (field absent) is unlocked: the write lands and audits', async () => {
    const { project, agent } = await setup(undefined);
    await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 120 }).expect(200);
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(120);
    expect(await AuditLog.countDocuments({ action: 'capacity.set' })).toBe(1);
  });

  it('an explicitly unlocked project keeps its 400 for a malformed body', async () => {
    const { project, agent } = await setup(false);
    const res = await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 'x' }).expect(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });
});

describe('lock state on the wire', () => {
  it('GET /deliverables carries capacity.locked, and the PATCH echo is shape-identical', async () => {
    const { project, agent } = await setup(false);
    const read = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    expect(read.body.capacity.locked).toBe(false);
    const echo = await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 120 }).expect(200);
    expect(echo.body.capacity.locked).toBe(false);
    const reread = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    // the client re-seats `capacity` wholesale — a key present in one emitter
    // and missing from the other silently strips the slider's lock state
    expect(echo.body.capacity).toEqual(reread.body.capacity);
  });

  it('a locked project reports capacity.locked true on the read path', async () => {
    const { project, agent } = await setup(true);
    const read = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    expect(read.body.capacity.locked).toBe(true);
  });
});

describe('PATCH /api/admin/projects/:projectId/capacity-lock', () => {
  it('round trips lock → unlock, one audit row each, with before/after', async () => {
    const { project, asAdmin, admin } = await setup(false);

    const lock = await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: true }).expect(200);
    expect(lock.body).toEqual({ ok: true, capacityLocked: true });
    expect((await Project.findById(project._id).orFail()).capacity_locked).toBe(true);
    const lockRows = await AuditLog.find({ action: 'capacity.lock' });
    expect(lockRows).toHaveLength(1);
    const row = lockRows[0]!;
    expect(row.actor).toBe(admin.email);
    expect(row.entity).toBe('project');
    expect(row.entity_id).toBe(String(project._id));
    expect(String(row.project_id)).toBe(String(project._id));
    expect(row.before).toEqual({ capacity_locked: false });
    expect(row.after).toEqual({ capacity_locked: true });

    const unlock = await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: false }).expect(200);
    expect(unlock.body).toEqual({ ok: true, capacityLocked: false });
    expect((await Project.findById(project._id).orFail()).capacity_locked).toBe(false);
    const unlockRows = await AuditLog.find({ action: 'capacity.unlock' });
    expect(unlockRows).toHaveLength(1);
    expect(unlockRows[0]!.before).toEqual({ capacity_locked: true });
    expect(unlockRows[0]!.after).toEqual({ capacity_locked: false });
  });

  it('unlocking really re-opens the write, and re-locking closes it again', async () => {
    const { project, agent, asAdmin } = await setup(true);
    await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 111 }).expect(403);
    await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: false }).expect(200);
    await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 111 }).expect(200);
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(111);
    await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: true }).expect(200);
    await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 92 }).expect(403);
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(111);
  });

  it('a no-op toggle answers 200 and writes no audit row', async () => {
    const { project, asAdmin } = await setup(false);
    const res = await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: false }).expect(200);
    expect(res.body).toEqual({ ok: true, capacityLocked: false });
    expect(await AuditLog.countDocuments({ action: { $in: ['capacity.lock', 'capacity.unlock'] } })).toBe(0);

    await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: true }).expect(200);
    await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: true }).expect(200);
    expect(await AuditLog.countDocuments({ action: 'capacity.lock' })).toBe(1);
  });

  it('refuses a non-admin member (403 ADMIN_ONLY), anonymous (401), and never toggles', async () => {
    const { app, project, agent } = await setup(false);
    const member = await agent.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: true }).expect(403);
    expect(member.body.error.code).toBe('ADMIN_ONLY');
    await request(app).patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: true }).expect(401);
    expect((await Project.findById(project._id).orFail()).capacity_locked).toBe(false);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it('400s a bogus id or body, 404s an unknown project', async () => {
    const { project, asAdmin } = await setup(false);
    expect((await asAdmin.patch('/api/admin/projects/not-an-id/capacity-lock').send({ locked: true })).status).toBe(400);
    expect((await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({})).status).toBe(400);
    expect((await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: 'yes' })).status).toBe(400);
    expect((await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: true, extra: 1 })).status).toBe(400);
    const gone = new mongoose.Types.ObjectId();
    expect((await asAdmin.patch(`/api/admin/projects/${gone}/capacity-lock`).send({ locked: true })).status).toBe(404);
  });

  it('the admin screen payload carries capacityLocked per project', async () => {
    const { project, asAdmin } = await setup(false);
    const other = await Project.create({ code: 'rt-test', name: 'Test', trello_board_id: 'tb', weekly_capacity: 3 });
    await asAdmin.patch(`/api/admin/projects/${project._id}/capacity-lock`).send({ locked: true }).expect(200);
    const res = await asAdmin.get('/api/admin/users').expect(200);
    const byId = new Map(res.body.projects.map((p: { id: string; capacityLocked: boolean }) => [p.id, p.capacityLocked]));
    expect(byId.get(String(project._id))).toBe(true);
    expect(byId.get(String(other._id))).toBe(false);
  });
});

describe('the pin is visible, not tribal knowledge', () => {
  // Miles's words. A lock the PM cannot see is a bug report waiting to happen,
  // so the shipped template text is asserted here — the same "inspect the
  // shipped frontend source" precedent as test/planner-weeks.test.ts, since the
  // repo has no browser test runner.
  it('the cards/week slider renders disabled with the reason on it', () => {
    const html = template();
    const slider = html.slice(html.indexOf('id="cards-per-week"'), html.indexOf('id="cards-per-week"') + 600);
    expect(slider).toContain('disabled="{{capacity.locked}}"');
    expect(html).toContain('Capacity locked — admin can unlock');
  });

  it('the second lock lives in the write path too (a lock can flip in another tab)', () => {
    const js = appScripts(); // the WHOLE shipped script set, not one file
    const at = js.indexOf('async function writeCapacity');
    expect(at).toBeGreaterThan(-1);
    const body = js.slice(at, js.indexOf("const prev = app.get('capacity').weekly", at));
    // the guard must precede the first mutation, i.e. sit above `prev`
    expect(body).toContain("app.get('capacity').locked");
    expect(body).toContain('return;');
  });
});

describe('migration 006-capacity-lock-rt837', () => {
  const entry = () => {
    const m = MIGRATIONS.find((x) => x.id === '006-capacity-lock-rt837');
    if (!m) throw new Error('migration 006 is missing from MIGRATIONS');
    return m;
  };

  it('is registered after 005 and runs last', () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids).toContain('006-capacity-lock-rt837');
    expect(ids.indexOf('006-capacity-lock-rt837')).toBe(ids.indexOf('005-monday-slotted-week') + 1);
  });

  it('locks rt-837 only, audits it, and is idempotent on a second run', async () => {
    const rt837 = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120 });
    const rtTest = await Project.create({ code: 'rt-test', name: 'Test', trello_board_id: 'tb', weekly_capacity: 3 });

    await entry().up(mongoose.connection);
    expect((await Project.findById(rt837._id).orFail()).capacity_locked).toBe(true);
    expect((await Project.findById(rtTest._id).orFail()).capacity_locked).toBe(false);

    const rows = await AuditLog.find({ action: 'capacity.lock' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor).toBe('migration:006-capacity-lock-rt837');
    expect(rows[0]!.entity).toBe('project');
    expect(rows[0]!.entity_id).toBe(String(rt837._id));
    expect(String(rows[0]!.project_id)).toBe(String(rt837._id));
    expect(rows[0]!.before).toEqual({ capacity_locked: false });
    expect(rows[0]!.after).toEqual({ capacity_locked: true });

    await entry().up(mongoose.connection);
    expect(await AuditLog.countDocuments({ action: 'capacity.lock' })).toBe(1); // idempotent
  });

  it('no-ops without throwing when rt-837 does not exist', async () => {
    await Project.create({ code: 'rt-test', name: 'Test', trello_board_id: 'tb', weekly_capacity: 3 });
    await expect(entry().up(mongoose.connection)).resolves.toBeUndefined();
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it('leaves every existing suite unlocked: the runner already applied 006 to an empty db', async () => {
    // test/helpers/db.ts runs runMigrations at startTestDb against an EMPTY
    // database and clearCollections preserves `migrations`, so fixtures that
    // create a project called rt-837 (capacity/schedule/writes-disabled/authz)
    // are never retro-locked.
    const db = mongoose.connection.db!;
    const applied = await db.collection('migrations').find({ id: '006-capacity-lock-rt837' }).toArray();
    expect(applied).toHaveLength(1);
    const fresh = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 92 });
    expect(fresh.capacity_locked).toBe(false);
  });
});
