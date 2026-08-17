/**
 * Cards/week write — PATCH /api/projects/:projectId/capacity (BR-6a).
 * Sirius-internal planning data: no source system is touched, so no Trello
 * write registry entry and no writes_enabled gate. Zod-strict body (§1.2),
 * project-scoped (invariant 1), member-only (invariant 9), audited on every
 * change (invariant 10).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, Project, User, UserProject } from '../src/models/index.ts';
import { HARD_MIX } from '../lib/planner.constants.ts';

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
  const project = await Project.create({
    code: 'rt-837', name: 'Fx', trello_board_id: 'fxA',
    weekly_capacity: 92, ref_week_least: 40, ref_week_typical: 92, ref_week_most: 160,
    effective_weekly_rate: 88,
  });
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { app, project, user, agent };
}

describe('capacity write (BR-6a)', () => {
  it('sets weekly capacity and echoes the deliverables capacity shape', async () => {
    const { project, agent } = await setup();
    const res = await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 120 }).expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.capacity).toEqual({
      weekly: 120, least: 40, typical: 92, most: 160, effectiveWeeklyRate: 88,
      hardIdeal: HARD_MIX.ideal, hardCeiling: HARD_MIX.ceiling,
      locked: false, // owl #23 — the slider's lock state rides the same object
    });
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(120);
    // the planner reads it back from the same place (deliverables.ts capacity)
    const read = await agent.get(`/api/projects/${project._id}/deliverables`).expect(200);
    expect(read.body.capacity.weekly).toBe(120);
    // the echo must be shape-identical to the GET: the client re-seats the
    // whole object, so a missing key here silently strips the planner footer's
    // ceiling label.
    expect(res.body.capacity).toEqual(read.body.capacity);
  });

  it('writes a capacity.set audit row with before/after (invariant 10)', async () => {
    const { project, agent } = await setup();
    await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 120 }).expect(200);
    const log = await AuditLog.findOne({ action: 'capacity.set' }).orFail();
    expect(log.actor).toBe('pm@frostdesigngroup.com');
    expect(log.entity).toBe('project');
    expect(log.entity_id).toBe(String(project._id));
    expect(String(log.project_id)).toBe(String(project._id));
    expect((log.before as Record<string, unknown>).weekly_capacity).toBe(92);
    expect((log.after as Record<string, unknown>).weekly_capacity).toBe(120);
  });

  it('403s a non-member and leaves the capacity untouched (invariant 9, AC-3)', async () => {
    const { app, project } = await setup();
    const outsider = await User.create({ email: 'outsider@frostdesigngroup.com' });
    const stranger = request.agent(app);
    await stranger.post('/__test/login').send({ userId: String(outsider._id), email: outsider.email }).expect(200);
    await stranger.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 1 }).expect(403);
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(92);
    expect(await AuditLog.countDocuments({ action: 'capacity.set' })).toBe(0);
  });

  it('refuses unknown keys and a missing weekly (400; §1.2 strict bodies)', async () => {
    const { project, agent } = await setup();
    await agent.patch(`/api/projects/${project._id}/capacity`)
      .send({ weekly: 120, ref_week_typical: 5 }).expect(400); // .strict() — not ignored
    await agent.patch(`/api/projects/${project._id}/capacity`).send({}).expect(400);
    await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: '120' }).expect(400);
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(92);
    expect(await AuditLog.countDocuments({ action: 'capacity.set' })).toBe(0);
  });

  it('refuses non-integer and out-of-range values (400)', async () => {
    const { project, agent } = await setup();
    for (const weekly of [12.5, 0, -3, 2001]) {
      const res = await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly });
      expect(res.status, `weekly=${weekly}`).toBe(400);
      expect(res.body.error.code).toBe('INVALID_BODY');
    }
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(92);
  });
});
