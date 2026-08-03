/**
 * T069 (local half) — the authorization matrix, mechanically: EVERY
 * registered project-scoped API route answers 401 unauthenticated and 403
 * for a non-member. Routes are enumerated from the live Express router, so
 * a new endpoint added without guards fails this test by existing
 * (invariant 9; NFR-6; AC-3). The staging smoke repeats this over HTTPS.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { Project, User, UserProject } from '../src/models/index.ts';

const env = validateEnv({ NODE_ENV: 'test' });

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});

interface RouteInfo {
  method: string;
  path: string;
}

function collectRoutes(app: ReturnType<typeof createApp>): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const stack = (app as unknown as { router: { stack: unknown[] } }).router.stack;
  const walk = (layers: unknown[]) => {
    for (const layer of layers as Array<{ route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } }>) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) {
          routes.push({ method: m.toUpperCase(), path: layer.route.path });
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(stack);
  return routes.filter((r) => r.path.startsWith('/api/projects/:projectId'));
}

describe('authz matrix over every registered project route', () => {
  it('401 unauthenticated and 403 non-member — no exceptions', async () => {
    const project = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 3 });
    const outsider = await User.create({ email: 'outsider@frostdesigngroup.com' });
    await UserProject.deleteMany({ user_id: outsider._id }); // explicitly no membership

    const app = createApp({ env, redis: null, mongo: null });
    const routes = collectRoutes(app);
    expect(routes.length).toBeGreaterThanOrEqual(10); // the surface exists

    const anonymous = request(app);
    const member = request.agent(app);
    await member.post('/__test/login').send({ userId: String(outsider._id), email: outsider.email }).expect(200);

    for (const r of routes) {
      const path = r.path.replace(':projectId', String(project._id)).replace(':cardId', 'cardX');
      const anonRes = await (anonymous as unknown as Record<string, (p: string) => request.Test>)[r.method.toLowerCase()]!(path);
      expect(anonRes.status, `${r.method} ${r.path} unauthenticated`).toBe(401);
      const memberRes = await (member as unknown as Record<string, (p: string) => request.Test>)[r.method.toLowerCase()]!(path);
      expect(memberRes.status, `${r.method} ${r.path} non-member`).toBe(403);
    }
    console.log(`[authz] ${routes.length} project-scoped routes verified: 401 anon / 403 non-member`);
  }, 60_000);
});
