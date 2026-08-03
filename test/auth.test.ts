/**
 * T011 — authz matrix (FR-2.1–2.4; AC-1, AC-2, AC-3; invariant 9).
 *
 * The four sign-in checks are tested directly via evaluateSignIn (they are
 * the server-side decision, FR-2.3); the HTTP layer is tested via supertest
 * with session injection (test-only route).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { evaluateSignIn } from '../src/auth/passport.ts';
import { Project, User, UserProject } from '../src/models/index.ts';

const env = validateEnv({ NODE_ENV: 'test', ALLOWED_HD: 'frostdesigngroup.com' });

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

async function allowListed(email: string, active = true) {
  return User.create({ email, active });
}

describe('the four sign-in checks (evaluateSignIn)', () => {
  it('AC-1: a non-Frost Google account is denied with a clear reason', async () => {
    const result = await evaluateSignIn(
      { email: 'someone@gmail.com', email_verified: true, hd: undefined },
      env,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/frostdesigngroup\.com/);
  });

  it('denies an unverified email even on the right domain', async () => {
    await allowListed('jp@frostdesigngroup.com');
    const result = await evaluateSignIn(
      { email: 'jp@frostdesigngroup.com', email_verified: false, hd: 'frostdesigngroup.com' },
      env,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not verified/);
  });

  it('denies a spoofed hd claim with a mismatched email domain', async () => {
    const result = await evaluateSignIn(
      { email: 'attacker@evil.example', email_verified: true, hd: 'frostdesigngroup.com' },
      env,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/email addresses/);
  });

  it('AC-2: a Frost account NOT on the allow-list is denied', async () => {
    const result = await evaluateSignIn(
      { email: 'newhire@frostdesigngroup.com', email_verified: true, hd: 'frostdesigngroup.com' },
      env,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/allow-list/);
  });

  it('denies a deactivated allow-list row', async () => {
    await allowListed('former@frostdesigngroup.com', false);
    const result = await evaluateSignIn(
      { email: 'former@frostdesigngroup.com', email_verified: true, hd: 'frostdesigngroup.com' },
      env,
    );
    expect(result.ok).toBe(false);
  });

  it('admits an active allow-listed Frost account and stamps last_login_at', async () => {
    await allowListed('jp@frostdesigngroup.com');
    const result = await evaluateSignIn(
      { email: 'JP@frostdesigngroup.com', email_verified: 'true', hd: 'frostdesigngroup.com' },
      env,
    );
    expect(result.ok).toBe(true);
    const user = await User.findOne({ email: 'jp@frostdesigngroup.com' });
    expect(user?.last_login_at).toBeInstanceOf(Date);
  });
});

describe('project scoping over HTTP (AC-3, AC-4; invariant 9)', () => {
  async function seedTwoProjects() {
    const a = await Project.create({
      code: 'rt-837',
      name: 'A',
      trello_board_id: 'fxA',
      weekly_capacity: 120,
    });
    const b = await Project.create({
      code: 'rt-900',
      name: 'B',
      trello_board_id: 'fxB',
      weekly_capacity: 40,
    });
    const user = await User.create({ email: 'member@frostdesigngroup.com' });
    await UserProject.create({ user_id: user._id, project_id: a._id });
    return { a, b, user };
  }

  async function loggedInAgent(user: { _id: unknown; email: string }) {
    const app = createApp({ env, redis: null, mongo: null });
    const agent = request.agent(app);
    await agent
      .post('/__test/login')
      .send({ userId: String(user._id), email: user.email })
      .expect(200);
    return agent;
  }

  it('rejects unauthenticated API calls with 401', async () => {
    const app = createApp({ env, redis: null, mongo: null });
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('lists only the projects the caller belongs to (AC-4)', async () => {
    const { user } = await seedTwoProjects();
    const agent = await loggedInAgent(user);
    const res = await agent.get('/api/projects').expect(200);
    expect(res.body.projects.map((p: { code: string }) => p.code)).toEqual(['rt-837']);
  });

  it('AC-3: a session calling an API for another project gets 403', async () => {
    const { b, user } = await seedTwoProjects();
    const agent = await loggedInAgent(user);
    const res = await agent.get(`/api/projects/${b._id}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('serves a member project scoped to its id', async () => {
    const { a, user } = await seedTwoProjects();
    const agent = await loggedInAgent(user);
    const res = await agent.get(`/api/projects/${a._id}`).expect(200);
    expect(res.body.project.code).toBe('rt-837');
  });

  it('revokes access on the next request when the allow-list row is deactivated', async () => {
    const { user } = await seedTwoProjects();
    const agent = await loggedInAgent(user);
    await agent.get('/api/projects').expect(200);
    await User.updateOne({ _id: user._id }, { active: false });
    const res = await agent.get('/api/projects');
    expect(res.status).toBe(401);
  });
});
