/**
 * G7 observation mode (JP, 2026-08-12): a project onboarded read-only
 * (writes_enabled: false) refuses EVERY write-registry route with
 * WRITES_DISABLED, while a pre-flag project (field absent) keeps its writes.
 * Sirius-local planning writes stay allowed — only Trello writes are gated.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { Deliverable, Project, User, UserProject } from '../src/models/index.ts';

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

async function fixture(writesEnabled: boolean | undefined) {
  const p = await Project.create({
    code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120,
    ...(writesEnabled === undefined ? {} : { writes_enabled: writesEnabled }),
  });
  if (writesEnabled === undefined) {
    // simulate a pre-flag document: strip the schema default from the db
    await Project.collection.updateOne({ _id: p._id }, { $unset: { writes_enabled: '' } });
  }
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: p._id });
  await Deliverable.create({
    project_id: p._id, mc_number: 'MC-1', display_id: 'MC-1', trello_card_id: 'c1', name: 'D1',
  });
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { p, agent };
}

describe('G7 observation mode — per-project write switch', () => {
  it('a read-only project refuses every registry write with WRITES_DISABLED', async () => {
    const { p, agent } = await fixture(false);
    const urgency = await agent
      .patch(`/api/projects/${p._id}/deliverables/c1/urgency`)
      .send({ urgent: true })
      .expect(403);
    expect(urgency.body.error.code).toBe('WRITES_DISABLED');
    const deadline = await agent
      .patch(`/api/projects/${p._id}/deliverables/c1/deadline`)
      .send({ date: '2026-09-01' })
      .expect(403);
    expect(deadline.body.error.code).toBe('WRITES_DISABLED');
    const difficulty = await agent
      .patch(`/api/projects/${p._id}/deliverables/c1/difficulty`)
      .send({ difficulty: 'Hard' })
      .expect(403);
    expect(difficulty.body.error.code).toBe('WRITES_DISABLED');
    // nothing changed locally either
    const doc = await Deliverable.findOne({ trello_card_id: 'c1' }).orFail();
    expect(doc.urgency).toBe('Non-Urgent');
    expect(doc.trello_due ?? null).toBeNull();
    expect(doc.difficulty ?? null).toBeNull();
  });

  it('a pre-flag project (field absent) keeps its writes reachable', async () => {
    const { p, agent } = await fixture(undefined);
    // Trello is not configured in tests, so the write proceeds past the
    // project gate and fails at the TRELLO_NOT_CONFIGURED guard instead —
    // proving WRITES_DISABLED did not fire.
    const res = await agent
      .patch(`/api/projects/${p._id}/deliverables/c1/urgency`)
      .send({ urgent: true })
      .expect(503);
    expect(res.body.error.code).toBe('TRELLO_NOT_CONFIGURED');
  });

  it('Sirius-local planning writes stay allowed on a read-only project', async () => {
    const { p, agent } = await fixture(false);
    await agent
      .patch(`/api/projects/${p._id}/deliverables/c1/planning`)
      .send({ slotted_week: '2026-08-17' })
      .expect(200);
  });

  it('the pipeline payload carries writesEnabled for the UI', async () => {
    const { p, agent } = await fixture(false);
    const res = await agent.get(`/api/projects/${p._id}/deliverables`).expect(200);
    expect(res.body.writesEnabled).toBe(false);
  });
});
