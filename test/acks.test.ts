/**
 * T067/T068 — conflict acknowledgements (FR-6.7, FR-6.8; BR-9a;
 * invariants 10, 13): ack silences ONE situation, lapses automatically when
 * the cards change, is restorable and counted, reaches the audit log, and
 * card-level indicators are never suppressed.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, Deliverable, Project, User, UserProject } from '../src/models/index.ts';

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
  const project = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 50 });
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  const mk = (i: number, over: Record<string, unknown> = {}) =>
    Deliverable.create({
      project_id: project._id, mc_number: `MC-${i}`, display_id: `MC-${i}`, trello_card_id: `c${i}`,
      name: `D${i}`, difficulty: 'Medium', lane: 'design', current_list: 'Design',
      urgency: 'Urgent', slotted_week: '2026-08-03', sheet_deadline: '2026-09-30', ...over,
    });
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, agent, mk };
}

describe('acknowledgement lifecycle (BR-9a)', () => {
  it('ack removes the banner AND its replot items; count + restore work; audit written', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2);

    const before = await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    const conflict = before.body.conflicts.find((c: { rule: string }) => c.rule === 'urgent-overlap');
    expect(conflict).toBeDefined();

    await agent
      .post(`/api/projects/${project._id}/conflicts/acknowledge`)
      .send({ conflict_key: conflict.key, reason: 'accepted by choice' })
      .expect(200);

    const after = await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    expect(after.body.conflicts.find((c: { key: string }) => c.key === conflict.key)).toBeUndefined();
    expect(after.body.acknowledged).toHaveLength(1);
    expect(after.body.acknowledged[0].ack.by).toBe('pm@frostdesigngroup.com');
    expect(after.body.acknowledged[0].ack.reason).toBe('accepted by choice');

    await agent.post(`/api/projects/${project._id}/conflicts/restore`).send({ conflict_key: conflict.key }).expect(200);
    const restored = await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    expect(restored.body.conflicts.find((c: { key: string }) => c.key === conflict.key)).toBeDefined();

    expect(await AuditLog.countDocuments({ action: 'conflict.acknowledge' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'conflict.restore' })).toBe(1);
  });

  it('invariant 13: the ack lapses when the situation changes (a third urgent card joins)', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2);
    const before = await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    const key = before.body.conflicts.find((c: { rule: string }) => c.rule === 'urgent-overlap').key;
    await agent.post(`/api/projects/${project._id}/conflicts/acknowledge`).send({ conflict_key: key }).expect(200);

    await mk(3); // situation changes → different sorted card:phase pairs → new key
    const after = await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    const resurfaced = after.body.conflicts.find((c: { rule: string }) => c.rule === 'urgent-overlap');
    expect(resurfaced).toBeDefined();
    expect(resurfaced.key).not.toBe(key); // the old ack matches nothing — lapsed
    expect(resurfaced.items).toHaveLength(3);
  });

  it('BR-9a: card-level late flags are NEVER suppressed by an acknowledgement', async () => {
    const { project, agent, mk } = await setup();
    await mk(1, { sheet_deadline: '2026-08-05' }); // render forecast lands after this
    await mk(2, { sheet_deadline: '2026-08-05' });

    const before = await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    for (const c of before.body.conflicts) {
      await agent.post(`/api/projects/${project._id}/conflicts/acknowledge`).send({ conflict_key: c.key }).expect(200);
    }
    const after = await agent.get(`/api/projects/${project._id}/deadlines`).expect(200);
    expect(after.body.conflicts).toHaveLength(0); // all banners silenced
    const lateFlags = after.body.milestones.filter((m: { late: boolean }) => m.late);
    expect(lateFlags.length).toBeGreaterThan(0); // the fact is not dismissible
  });
});
