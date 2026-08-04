/**
 * T087 — admin panel authz + behavior (FR-10; NFR-6): every /api/admin route
 * walked mechanically (401 anon / 403 active non-admin), domain validation,
 * the last-admin lockout guard, live-session revocation on deactivation, and
 * an audit row per action.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, Project, User, UserProject } from '../src/models/index.ts';

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

async function setup() {
  const project = await Project.create({ code: 'rt-test', name: 'Fx', trello_board_id: 'b1', weekly_capacity: 3 });
  const admin = await User.create({ email: 'jp@frostdesigngroup.com', is_admin: true });
  const member = await User.create({ email: 'member@frostdesigngroup.com' });
  await UserProject.create({ user_id: member._id, project_id: project._id });

  const app = createApp({ env, redis: null, mongo: null, trello: null });
  const asAdmin = request.agent(app);
  await asAdmin.post('/__test/login').send({ userId: String(admin._id), email: admin.email }).expect(200);
  const asMember = request.agent(app);
  await asMember.post('/__test/login').send({ userId: String(member._id), email: member.email }).expect(200);
  return { app, project, admin, member, asAdmin, asMember };
}

function collectAdminRoutes(app: ReturnType<typeof createApp>) {
  const routes: Array<{ method: string; path: string }> = [];
  const walk = (layers: unknown[]) => {
    for (const layer of layers as Array<{ route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } }>) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) routes.push({ method: m.toUpperCase(), path: layer.route.path });
      } else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk((app as unknown as { router: { stack: unknown[] } }).router.stack);
  return routes.filter((r) => r.path.startsWith('/api/admin'));
}

describe('FR-10.5 — admin routes are walled, mechanically', () => {
  it('every /api/admin route: 401 anonymous, 403 active non-admin', async () => {
    const { app, asMember, member } = await setup();
    const routes = collectAdminRoutes(app);
    expect(routes.length).toBeGreaterThanOrEqual(4);
    const anon = request(app);
    for (const r of routes) {
      const path = r.path.replace(':userId', String(member._id));
      const method = r.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put';
      expect((await anon[method](path)).status, `${r.method} ${r.path} anon`).toBe(401);
      expect((await asMember[method](path)).status, `${r.method} ${r.path} member`).toBe(403);
    }
  });

  it('/api/me tells the frontend who it is — and whether to show the tab', async () => {
    const { asAdmin, asMember } = await setup();
    expect((await asAdmin.get('/api/me').expect(200)).body.user.admin).toBe(true);
    expect((await asMember.get('/api/me').expect(200)).body.user.admin).toBe(false);
  });
});

describe('FR-10.2 — adding people', () => {
  it('adds a Frost account with memberships, audited', async () => {
    const { asAdmin, project } = await setup();
    const res = await asAdmin.post('/api/admin/users').send({ email: 'New.Person@frostdesigngroup.com', name: 'New Person', projectIds: [String(project._id)] });
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'new.person@frostdesigngroup.com' });
    expect(user?.active).toBe(true);
    expect(user?.is_admin).toBe(false);
    expect(await UserProject.countDocuments({ user_id: user!._id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'user.added', entity_id: 'new.person@frostdesigngroup.com' })).toBe(1);
  });

  it('rejects non-Frost domains and duplicates', async () => {
    const { asAdmin } = await setup();
    expect((await asAdmin.post('/api/admin/users').send({ email: 'evil@gmail.com' })).status).toBe(400);
    expect((await asAdmin.post('/api/admin/users').send({ email: 'member@frostdesigngroup.com' })).status).toBe(409);
    expect(await AuditLog.countDocuments({ action: 'user.added' })).toBe(0);
  });
});

describe('FR-10.3/10.6 — deactivation', () => {
  it('deactivating a member revokes their LIVE session on the next request', async () => {
    const { asAdmin, asMember, member } = await setup();
    await asMember.get('/api/me').expect(200); // session alive
    await asAdmin.patch(`/api/admin/users/${member._id}`).send({ active: false }).expect(200);
    await asMember.get('/api/me').expect(401); // dead on the very next request
    expect(await AuditLog.countDocuments({ action: 'user.deactivated', entity_id: member.email })).toBe(1);
  });

  it('the LAST active admin cannot be deactivated; a second admin unblocks it', async () => {
    const { asAdmin, admin } = await setup();
    const res = await asAdmin.patch(`/api/admin/users/${admin._id}`).send({ active: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');

    await User.create({ email: 'second.admin@frostdesigngroup.com', is_admin: true });
    await asAdmin.patch(`/api/admin/users/${admin._id}`).send({ active: false }).expect(200);
  });

  it('reactivation restores access, audited', async () => {
    const { asAdmin, asMember, member } = await setup();
    await asAdmin.patch(`/api/admin/users/${member._id}`).send({ active: false }).expect(200);
    await asAdmin.patch(`/api/admin/users/${member._id}`).send({ active: true }).expect(200);
    await asMember.get('/api/me').expect(200); // same session works again
    expect(await AuditLog.countDocuments({ action: 'user.reactivated' })).toBe(1);
  });
});

describe('FR-10.4 — memberships', () => {
  it('replaces the membership set and audits the diff; a same-set write is silent', async () => {
    const { asAdmin, member, project } = await setup();
    const p2 = await Project.create({ code: 'rt-2', name: 'Fx2', trello_board_id: 'b2', weekly_capacity: 3 });

    await asAdmin.put(`/api/admin/users/${member._id}/memberships`).send({ projectIds: [String(p2._id)] }).expect(200);
    const after = await UserProject.find({ user_id: member._id });
    expect(after.map((m) => String(m.project_id))).toEqual([String(p2._id)]);
    expect(await AuditLog.countDocuments({ action: 'memberships.set' })).toBe(1);

    await asAdmin.put(`/api/admin/users/${member._id}/memberships`).send({ projectIds: [String(p2._id)] }).expect(200);
    expect(await AuditLog.countDocuments({ action: 'memberships.set' })).toBe(1); // no-op = no audit row

    void project; // rt-test membership replaced away above — intentional
  });
});
