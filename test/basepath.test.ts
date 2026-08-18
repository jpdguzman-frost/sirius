/**
 * G1 (docs/operations/server-setup.md §4) — BASE_PATH: the whole app mounts under a path
 * prefix for the platforms-host pattern (platforms.frostdesigngroup.com/sirius).
 * Unset = domain root, byte-for-byte today's behavior — the rest of the suite
 * is the regression proof for that; these tests prove the prefixed mount.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { Project, User, UserProject } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

const baseEnv = { NODE_ENV: 'test', BASE_PATH: '/sirius' };

describe('BASE_PATH=/sirius — everything lives under the prefix', () => {
  it('healthz, API and webhook answer under /sirius; the root paths are gone', async () => {
    const app = createApp({ env: validateEnv(baseEnv), redis: null, mongo: null, trello: null });
    await request(app).get('/sirius/healthz').expect(200);
    await request(app).get('/healthz').expect(404);

    const api = await request(app).get('/sirius/api/projects');
    expect(api.status).toBe(401); // route exists, session required
    await request(app).get('/api/projects').expect(404);

    const hook = await request(app).post('/sirius/api/webhooks/ares').send({});
    expect(hook.status).toBe(503); // route exists, secret not configured
    await request(app).post('/api/webhooks/ares').send({}).expect(404);
  });

  it('unknown API paths under the prefix still answer JSON 404', async () => {
    const app = createApp({ env: validateEnv(baseEnv), redis: null, mongo: null, trello: null });
    const res = await request(app).get('/sirius/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('the session cookie is scoped to the base path and the app works end-to-end under it', async () => {
    const project = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'b1', weekly_capacity: 3 });
    const user = await User.create({ email: 'pm@frostdesigngroup.com' });
    await UserProject.create({ user_id: user._id, project_id: project._id });

    const app = createApp({ env: validateEnv(baseEnv), redis: null, mongo: null, trello: null });
    const agent = request.agent(app);
    const login = await agent.post('/sirius/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
    expect(String(login.headers['set-cookie'])).toContain('Path=/sirius');

    const res = await agent.get('/sirius/api/projects').expect(200);
    expect(res.body.projects).toHaveLength(1);
  });

  it('BASE_PATH is validated: trailing slash and missing leading slash are refused', () => {
    expect(() => validateEnv({ NODE_ENV: 'test', BASE_PATH: '/sirius/' })).toThrow();
    expect(() => validateEnv({ NODE_ENV: 'test', BASE_PATH: 'sirius' })).toThrow();
  });
});
