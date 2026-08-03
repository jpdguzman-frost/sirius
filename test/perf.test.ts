/**
 * T063 — NFR-1 perf pass: the pipeline read at the 5,000-card envelope.
 * Server-side budget kept well under the 2 s p95 page target so network +
 * render have room. Measured numbers land in STATE.md.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { Deliverable, Project, User, UserProject, WorkCard } from '../src/models/index.ts';

const env = validateEnv({ NODE_ENV: 'test' });
const DIFFS = ['Easy', 'Medium', 'Hard'];
const LISTS = ['Production Backlog', 'Design', 'Sent for Client Review', 'Done', 'Render Assets'];

beforeAll(async () => {
  await startTestDb();
}, 180_000);
afterAll(async () => {
  await stopTestDb();
});

describe('NFR-1 @ 5,000 cards', () => {
  it('pipeline + deadlines reads stay inside the server-side budget', async () => {
    const project = await Project.create({ code: 'rt-perf', name: 'Perf', trello_board_id: 'fxPerf', weekly_capacity: 120 });
    const user = await User.create({ email: 'perf@frostdesigngroup.com' });
    await UserProject.create({ user_id: user._id, project_id: project._id });

    const deliverables = Array.from({ length: 3000 }, (_, i) => ({
      project_id: project._id,
      mc_number: `MC-${Math.floor(i / 10)}`,
      display_id: `MC-${Math.floor(i / 10)}.${(i % 10) + 1}`,
      trello_card_id: `perf-d${i}`,
      name: `Perf deliverable ${i}`,
      difficulty: DIFFS[i % 3],
      lane: 'design',
      current_list: LISTS[i % LISTS.length],
      labels: ['Main Card'],
      sheet_deadline: i % 4 === 0 ? '2026-09-30' : null,
      slotted_week: i % 5 === 0 ? '2026-08-10' : null,
    }));
    await Deliverable.insertMany(deliverables);
    const workCards = Array.from({ length: 2000 }, (_, i) => ({
      project_id: project._id,
      mc_number: `MC-${Math.floor(i / 7)}`,
      trello_card_id: `perf-w${i}`,
      name: `Render Asset: perf task ${i}`,
      current_list: LISTS[i % LISTS.length],
    }));
    await WorkCard.insertMany(workCards);

    const app = createApp({ env, redis: null, mongo: null });
    const agent = request.agent(app);
    await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);

    // warm once (connection pools, model init), then measure
    await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);

    const t1 = performance.now();
    const res = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    const pipelineMs = performance.now() - t1;
    expect(res.body.rows).toHaveLength(3000);

    const t2 = performance.now();
    await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    const deadlinesMs = performance.now() - t2;

    console.log(`[perf] pipeline ${Math.round(pipelineMs)}ms · deadlines ${Math.round(deadlinesMs)}ms @ 5,000 cards`);
    expect(pipelineMs).toBeLessThan(1500); // server-side share of the 2 s p95 budget
    expect(deadlinesMs).toBeLessThan(1500);
  }, 120_000);
});
