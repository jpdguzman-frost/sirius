/**
 * Shared route-test fixture: one project, one allow-listed member, a logged-in
 * supertest agent. Every suite that exercises a `/api/projects/:id/...` route
 * needs exactly this preamble — keeping it in one place stops the project and
 * auth shape drifting between suites.
 */

import request from 'supertest';
import { createApp } from '../../src/app.ts';
import { validateEnv } from '../../src/config/env.ts';
import { Project, User, UserProject } from '../../src/models/index.ts';

const env = validateEnv({ NODE_ENV: 'test' });

export type TestAgent = ReturnType<typeof request.agent>;

export async function loggedInProjectFixture(over: Record<string, unknown> = {}) {
  const p = await Project.create({
    code: 'rt-837',
    name: 'Fx',
    trello_board_id: 'fxA',
    weekly_capacity: 120,
    ...over,
  });
  const user = await User.create({ email: 'member@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: p._id });
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { p, user, agent };
}
