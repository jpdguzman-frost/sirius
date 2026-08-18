/**
 * T067/T068 — conflict acknowledgements (FR-6.7, FR-6.8; BR-9a;
 * invariants 10, 13): ack silences ONE situation, lapses automatically when
 * the cards change, is restorable and counted, reaches the audit log, and
 * card-level indicators are never suppressed.
 *
 * T135 (JP ruling A, 2026-08-17; constitution v4.3.0) — the situation key
 * gained the project's weekly capacity: `week | rule | capacity | sorted
 * card:phase pairs`. A capacity change now lapses the acknowledgement too,
 * uniformly across all three acknowledgeable rules.
 */

import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appScripts } from './helpers/source.ts';
import mongoose from 'mongoose';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, ConflictAcknowledgement, Deliverable, Project, User, UserProject } from '../src/models/index.ts';
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

/**
 * A board whose week 2026-08-17 trips ALL THREE acknowledgeable rules at once
 * (measured, not assumed): two urgent renders overlap, the non-urgent third is
 * displaced past a capacity of 2, and every render lands after the 2026-08-05
 * client deadline. Its conflict SET is stable across capacity changes, so a
 * re-surfaced key differs from the acked one in the capacity token alone.
 */
async function setupThreeRules(capacity = 2) {
  const project = await Project.create({ code: 'rt-test', name: 'Tri', trello_board_id: 'triA', weekly_capacity: capacity });
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  for (let i = 1; i <= 3; i++) {
    await Deliverable.create({
      project_id: project._id, mc_number: `MC-${i}`, display_id: `MC-${i}`, trello_card_id: `c${i}`,
      name: `D${i}`, difficulty: 'Medium', lane: 'design', current_list: 'Design',
      urgency: i === 3 ? 'Normal' : 'Urgent', slotted_week: '2026-08-03', sheet_deadline: '2026-08-05',
    });
  }
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, agent };
}

type Agent = ReturnType<typeof request.agent>;
type WireConflict = { key: string; week: string; rule: string; items: unknown[] };

const deadlines = async (agent: Agent, projectId: unknown) =>
  (await agent.get(`/api/projects/${String(projectId)}/deadlines`).expect(200)).body as {
    conflicts: WireConflict[];
    acknowledged: Array<WireConflict & { ack: { by: string; reason: string | null } | null }>;
    milestones: Array<{ late: boolean }>;
  };

const ack = (agent: Agent, projectId: unknown, key: string, reason?: string) =>
  agent
    .post(`/api/projects/${String(projectId)}/conflicts/acknowledge`)
    .send({ conflict_key: key, ...(reason ? { reason } : {}) })
    .expect(200);

/** The one invalidation trigger: PATCH /capacity (S21 — the only mutation site). */
const setCapacity = (agent: Agent, projectId: unknown, weekly: number) =>
  agent.patch(`/api/projects/${String(projectId)}/capacity`).send({ weekly }).expect(200);

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

    // the situation changes → different sorted card:phase pairs → new key.
    // (Capacity is the OTHER dimension of the same key, covered below.)
    await mk(3);
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

    // …and a capacity change does not touch them either: the banners come back
    // (the key moved), the card-level facts never went away (BR-9a).
    await setCapacity(agent, project._id, 40);
    const moved = await deadlines(agent, project._id);
    expect(moved.conflicts.length).toBeGreaterThan(0);
    expect(moved.milestones.filter((m) => m.late).length).toBe(lateFlags.length);
  });
});

describe('invariant 13 v4.3.0 — capacity is part of the situation (JP ruling A, T135)', () => {
  it('every rule carries the capacity as component 3 of 4 — uniformly (all three rules, one week)', async () => {
    const { project, agent } = await setupThreeRules(2);
    const body = await deadlines(agent, project._id);

    const tripleWeek = body.conflicts.filter((c) => c.week === '2026-08-17');
    expect(tripleWeek.map((c) => c.rule).sort()).toEqual(['over-capacity', 'past-deadline', 'urgent-overlap']);

    for (const c of body.conflicts) {
      const parts = c.key.split('|');
      expect(parts).toHaveLength(4); // week | rule | capacity | pairs
      expect(parts[0]).toBe(c.week);
      expect(parts[1]).toBe(c.rule);
      expect(parts[2]).toBe('2'); // the project's weekly_capacity, verbatim
      expect(c.key.startsWith(`${c.week}|${c.rule}|2|`)).toBe(true);
    }
  });

  it('a new ack persists the capacity and keeps suppressing while the capacity is unchanged', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2);
    const first = await deadlines(agent, project._id);
    const target = first.conflicts.find((c) => c.rule === 'urgent-overlap')!;
    expect(target.key).toContain('|50|');

    await ack(agent, project._id, target.key, 'accepted by choice');

    const stored = await ConflictAcknowledgement.findOne({ project_id: project._id }).orFail();
    expect(stored.conflict_key).toBe(target.key);
    expect(stored.conflict_key.split('|')[2]).toBe('50');

    for (const _ of [1, 2]) { // two consecutive reads: suppression is stable
      const body = await deadlines(agent, project._id);
      expect(body.conflicts.find((c) => c.key === target.key)).toBeUndefined();
      expect(body.acknowledged.map((c) => c.key)).toContain(target.key);
    }
  });

  it('a weekly_capacity change re-surfaces the acknowledged conflict under a new key', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2);
    const first = await deadlines(agent, project._id);
    const target = first.conflicts.find((c) => c.rule === 'urgent-overlap')!;
    await ack(agent, project._id, target.key);
    expect((await deadlines(agent, project._id)).acknowledged.map((c) => c.key)).toContain(target.key);

    await setCapacity(agent, project._id, 40);

    const after = await deadlines(agent, project._id);
    const resurfaced = after.conflicts.find((c) => c.rule === 'urgent-overlap' && c.week === target.week)!;
    expect(resurfaced).toBeDefined();
    expect(resurfaced.key).not.toBe(target.key);
    expect(resurfaced.key).toContain('|40|');
    expect(after.acknowledged).toHaveLength(0);
    // the ONLY difference is the capacity token — the cards did not move
    expect(resurfaced.key.split('|').filter((_, i) => i !== 2)).toEqual(target.key.split('|').filter((_, i) => i !== 2));
  });

  it('invalidation is a NON-MATCH: the stale ack row survives and writes no audit row (invariant 10)', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2);
    const target = (await deadlines(agent, project._id)).conflicts.find((c) => c.rule === 'urgent-overlap')!;
    await ack(agent, project._id, target.key);

    const conflictRowsBefore = await AuditLog.countDocuments({ action: /^conflict\./ });
    await setCapacity(agent, project._id, 40);
    await deadlines(agent, project._id); // the read that observes the mismatch

    expect(await ConflictAcknowledgement.countDocuments({ project_id: project._id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: /^conflict\./ })).toBe(conflictRowsBefore);
    expect(await AuditLog.countDocuments({ action: 'capacity.set' })).toBe(1); // the change itself IS audited
  });

  it('re-acknowledging at the new capacity suppresses again and stores the new number', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2);
    const target = (await deadlines(agent, project._id)).conflicts.find((c) => c.rule === 'urgent-overlap')!;
    await ack(agent, project._id, target.key);
    await setCapacity(agent, project._id, 40);

    const resurfaced = (await deadlines(agent, project._id)).conflicts.find((c) => c.rule === 'urgent-overlap' && c.week === target.week)!;
    await ack(agent, project._id, resurfaced.key);

    const after = await deadlines(agent, project._id);
    expect(after.conflicts.find((c) => c.key === resurfaced.key)).toBeUndefined();
    expect(after.acknowledged.map((c) => c.key)).toContain(resurfaced.key);

    const keys = (await ConflictAcknowledgement.find({ project_id: project._id })).map((a) => a.conflict_key).sort();
    expect(keys).toHaveLength(2);
    expect(keys.some((k) => k.includes('|50|'))).toBe(true);
    expect(keys.some((k) => k.includes('|40|'))).toBe(true);
  });

  it('reverting the capacity re-suppresses through the ORIGINAL ack — a situation dimension, not an expiry (OD-4 stays open)', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2);
    const target = (await deadlines(agent, project._id)).conflicts.find((c) => c.rule === 'urgent-overlap')!;
    await ack(agent, project._id, target.key);
    await setCapacity(agent, project._id, 40);
    expect((await deadlines(agent, project._id)).acknowledged).toHaveLength(0);

    await setCapacity(agent, project._id, 50); // back to where the ack was made

    const back = await deadlines(agent, project._id);
    expect(back.conflicts.find((c) => c.key === target.key)).toBeUndefined();
    expect(back.acknowledged.map((c) => c.key)).toContain(target.key);
    expect(await AuditLog.countDocuments({ action: 'conflict.acknowledge' })).toBe(1); // no second ack was needed
    expect(await ConflictAcknowledgement.countDocuments({ project_id: project._id })).toBe(1);
  });

  it('uniformity under a capacity change: urgent-overlap and past-deadline re-surface too, not only over-capacity', async () => {
    const { project, agent } = await setupThreeRules(2);
    const before = await deadlines(agent, project._id);
    expect(before.conflicts).toHaveLength(5);
    for (const c of before.conflicts) await ack(agent, project._id, c.key);
    expect((await deadlines(agent, project._id)).conflicts).toHaveLength(0);

    await setCapacity(agent, project._id, 1);

    const after = await deadlines(agent, project._id);
    expect(after.acknowledged).toHaveLength(0);
    expect(after.conflicts).toHaveLength(5);
    expect(new Set(after.conflicts.map((c) => c.rule))).toEqual(
      new Set(['urgent-overlap', 'over-capacity', 'past-deadline']),
    );
    for (const rule of ['urgent-overlap', 'past-deadline'] as const) {
      const rows = after.conflicts.filter((c) => c.rule === rule);
      expect(rows.length).toBeGreaterThan(0);
      for (const c of rows) expect(c.key).toContain('|1|'); // capacity-independent rules re-key too
    }
  });

  it('cross-project isolation (invariant 1): acking in A leaves B active, and B carries its OWN capacity', async () => {
    const a = await Project.create({ code: 'rt-a', name: 'A', trello_board_id: 'ba', weekly_capacity: 50 });
    const b = await Project.create({ code: 'rt-b', name: 'B', trello_board_id: 'bb', weekly_capacity: 7 });
    const user = await User.create({ email: 'pm@frostdesigngroup.com' });
    for (const p of [a, b]) {
      await UserProject.create({ user_id: user._id, project_id: p._id });
      for (let i = 1; i <= 2; i++) {
        await Deliverable.create({
          project_id: p._id, mc_number: `MC-${i}`, display_id: `MC-${i}`, trello_card_id: `c${i}`,
          name: `D${i}`, difficulty: 'Medium', lane: 'design', current_list: 'Design',
          urgency: 'Urgent', slotted_week: '2026-08-03', sheet_deadline: '2026-09-30',
        });
      }
    }
    const app = createApp({ env, redis: null, mongo: null });
    const agent = request.agent(app);
    await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);

    const aConflict = (await deadlines(agent, a._id)).conflicts.find((c) => c.rule === 'urgent-overlap')!;
    const bConflict = (await deadlines(agent, b._id)).conflicts.find((c) => c.rule === 'urgent-overlap')!;
    expect(aConflict.key).toContain('|50|');
    expect(bConflict.key).toContain('|7|');
    expect(aConflict.key).not.toBe(bConflict.key); // same cards, same week — different capacity token

    await ack(agent, a._id, aConflict.key);
    expect((await deadlines(agent, a._id)).acknowledged.map((c) => c.key)).toContain(aConflict.key);
    const bAfter = await deadlines(agent, b._id);
    expect(bAfter.acknowledged).toHaveLength(0);
    expect(bAfter.conflicts.map((c) => c.key)).toContain(bConflict.key);
    expect(await ConflictAcknowledgement.countDocuments({ project_id: b._id })).toBe(0);
  });

  it('a REFUSED capacity write invalidates nothing — the Option-B lock keeps the ack suppressing', async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2);
    const target = (await deadlines(agent, project._id)).conflicts.find((c) => c.rule === 'urgent-overlap')!;
    await ack(agent, project._id, target.key);

    project.capacity_locked = true;
    await project.save();

    const refused = await agent.patch(`/api/projects/${project._id}/capacity`).send({ weekly: 40 }).expect(403);
    expect(refused.body.error.code).toBe('CAPACITY_LOCKED');
    expect((await Project.findById(project._id).orFail()).weekly_capacity).toBe(50);

    const after = await deadlines(agent, project._id);
    expect(after.conflicts.find((c) => c.key === target.key)).toBeUndefined();
    expect(after.acknowledged.map((c) => c.key)).toContain(target.key);
    expect(await AuditLog.countDocuments({ action: 'capacity.set' })).toBe(0);
  });

  it('guard: hard-mix stays a planner flag — it is not a Conflict and has no ack surface', async () => {
    const project = await Project.create({ code: 'rt-hard', name: 'H', trello_board_id: 'bh', weekly_capacity: 50 });
    const user = await User.create({ email: 'pm@frostdesigngroup.com' });
    await UserProject.create({ user_id: user._id, project_id: project._id });
    for (let i = 1; i <= 2; i++) {
      await Deliverable.create({
        project_id: project._id, mc_number: `MC-${i}`, display_id: `MC-${i}`, trello_card_id: `c${i}`,
        name: `D${i}`, difficulty: 'Hard', lane: 'design', current_list: 'Design',
        urgency: 'Urgent', slotted_week: '2026-08-03', sheet_deadline: '2026-09-30',
      });
    }
    const app = createApp({ env, redis: null, mongo: null });
    const agent = request.agent(app);
    await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);

    const planner = (await agent.get(`/api/projects/${project._id}/deliverables`).expect(200)).body as {
      perWeek: Record<string, { hardOver: boolean; hardWarn: boolean }>;
    };
    expect(planner.perWeek['2026-08-03']!.hardOver).toBe(true); // 100% Hard — the flag IS tripped

    const body = await deadlines(agent, project._id);
    expect(body.conflicts.length).toBeGreaterThan(0);
    for (const c of body.conflicts) {
      expect(['urgent-overlap', 'over-capacity', 'past-deadline']).toContain(c.rule);
    }
    // no ack surface for the flag: nothing on /deadlines names it at all
    expect(JSON.stringify(body)).not.toMatch(/hard(Over|Warn|-mix)/i);
  });
});

describe('drift guard — one key recipe, server-side only', () => {
  it('the pipe layout is written in exactly ONE place in src/services/conflicts.ts', async () => {
    const src = await readFile(new URL('../src/services/conflicts.ts', import.meta.url), 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l));
    const templates = code.filter((l) => /`[^`]*\|[^`]*`/.test(l));
    expect(templates).toHaveLength(1);
    expect(templates[0]).toContain('${week}|${rule}|${CAP(weeklyCapacity)}|${pairs}');
    // …and the three rules all go through the one composer
    const calls = code.filter((l) => /(?<![A-Za-z])conflictKey\(/.test(l) && !/export const conflictKey/.test(l));
    expect(calls).toHaveLength(3);
    expect(calls.filter((l) => l.includes("'urgent-overlap'"))).toHaveLength(1);
    expect(calls.filter((l) => l.includes("'over-capacity'"))).toHaveLength(1);
    expect(calls.filter((l) => l.includes("'past-deadline'"))).toHaveLength(1);
  });

  it('the routes never compose or parse a conflict key — matching is one opaque set-membership test', async () => {
    for (const file of ['../src/routes/schedule.ts', '../src/routes/deliverables.ts']) {
      const src = await readFile(new URL(file, import.meta.url), 'utf8');
      const code = src.split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l));
      expect(code.filter((l) => l.includes("split('|')"))).toHaveLength(0);
      expect(code.filter((l) => /`[^`]*\|[^`]*`/.test(l))).toHaveLength(0);
    }
  });

  it('the client holds NO key recipe — it echoes the opaque string back', () => {
    const js = appScripts(); // the WHOLE shipped script set, not one file
    for (const rule of ['urgent-overlap|', 'over-capacity|', 'past-deadline|']) {
      expect(js).not.toContain(rule);
    }
    // ack/restore pass their `key` argument through untouched
    const passes = js.split('\n').filter((l) => l.includes('conflict_key'));
    expect(passes).toHaveLength(2);
    for (const l of passes) expect(l).toContain('conflict_key: key');
    // the ONE split('|') in the client is the drag payload, never a conflict key
    const splits = js.split('\n').filter((l) => l.includes("split('|')"));
    expect(splits).toHaveLength(1);
    expect(splits[0]).toContain('dataTransfer');
  });
});

describe('migration 007-ack-capacity', () => {
  const entry = () => {
    const m = MIGRATIONS.find((x) => x.id === '007-ack-capacity');
    if (!m) throw new Error('migration 007-ack-capacity is missing from MIGRATIONS');
    return m;
  };
  const legacyKey = '2026-08-03|urgent-overlap|c1:sketch,c2:sketch';

  it('is registered after 006 and runs last', () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids).toContain('007-ack-capacity');
    expect(ids.indexOf('007-ack-capacity')).toBe(ids.indexOf('006-capacity-lock-rt837') + 1);
    expect(ids[ids.length - 1]).toBe('007-ack-capacity');
  });

  it('lifts only 3-component keys, audits each change, and is idempotent', async () => {
    const project = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 50 });
    const legacy = await ConflictAcknowledgement.create({
      project_id: project._id, conflict_key: legacyKey, acknowledged_by: 'pm@frostdesigngroup.com',
    });
    const already = await ConflictAcknowledgement.create({
      project_id: project._id, conflict_key: '2026-08-10|over-capacity|7|c9:render', acknowledged_by: 'pm@frostdesigngroup.com',
    });

    await entry().up(mongoose.connection);

    expect((await ConflictAcknowledgement.findById(legacy._id).orFail()).conflict_key)
      .toBe('2026-08-03|urgent-overlap|50|c1:sketch,c2:sketch');
    expect((await ConflictAcknowledgement.findById(already._id).orFail()).conflict_key)
      .toBe('2026-08-10|over-capacity|7|c9:render'); // untouched — already amended

    const rows = await AuditLog.find({ action: 'ack.backfill-capacity' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor).toBe('migration:007-ack-capacity');
    expect(rows[0]!.entity).toBe('conflict_ack');
    expect(rows[0]!.entity_id).toBe(String(legacy._id));
    expect(String(rows[0]!.project_id)).toBe(String(project._id));
    expect(rows[0]!.before).toEqual({ conflict_key: legacyKey });
    expect(rows[0]!.after).toEqual({ conflict_key: '2026-08-03|urgent-overlap|50|c1:sketch,c2:sketch' });

    await entry().up(mongoose.connection); // idempotent
    expect(await AuditLog.countDocuments({ action: 'ack.backfill-capacity' })).toBe(1);
    expect((await ConflictAcknowledgement.findById(legacy._id).orFail()).conflict_key)
      .toBe('2026-08-03|urgent-overlap|50|c1:sketch,c2:sketch');
  });

  it('cross-project isolation (invariant 1): each ack is lifted with its OWN project capacity', async () => {
    const a = await Project.create({ code: 'rt-a', name: 'A', trello_board_id: 'ba', weekly_capacity: 50 });
    const b = await Project.create({ code: 'rt-b', name: 'B', trello_board_id: 'bb', weekly_capacity: 7 });
    const ackA = await ConflictAcknowledgement.create({ project_id: a._id, conflict_key: legacyKey, acknowledged_by: 'pm@frostdesigngroup.com' });
    const ackB = await ConflictAcknowledgement.create({ project_id: b._id, conflict_key: legacyKey, acknowledged_by: 'pm@frostdesigngroup.com' });

    await entry().up(mongoose.connection);

    expect((await ConflictAcknowledgement.findById(ackA._id).orFail()).conflict_key).toContain('|50|');
    expect((await ConflictAcknowledgement.findById(ackB._id).orFail()).conflict_key).toContain('|7|');
    expect(await AuditLog.countDocuments({ action: 'ack.backfill-capacity', project_id: a._id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'ack.backfill-capacity', project_id: b._id })).toBe(1);
  });

  it('orphan-safe: an ack whose project no longer exists is skipped, unaudited, without throwing', async () => {
    const orphan = await ConflictAcknowledgement.create({
      project_id: new mongoose.Types.ObjectId(), conflict_key: legacyKey, acknowledged_by: 'pm@frostdesigngroup.com',
    });
    await expect(entry().up(mongoose.connection)).resolves.toBeUndefined();
    expect((await ConflictAcknowledgement.findById(orphan._id).orFail()).conflict_key).toBe(legacyKey);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it("preserves today's suppression exactly — a legacy ack still silences its conflict after the lift", async () => {
    const { project, agent, mk } = await setup();
    await mk(1);
    await mk(2);
    const live = (await deadlines(agent, project._id)).conflicts.find((c) => c.rule === 'urgent-overlap')!;
    const legacy = live.key.split('|').filter((_, i) => i !== 2).join('|'); // what phase-8a stored
    await ConflictAcknowledgement.create({
      project_id: project._id, conflict_key: legacy, acknowledged_by: 'pm@frostdesigngroup.com',
    });

    const before = await deadlines(agent, project._id);
    expect(before.conflicts.map((c) => c.key)).toContain(live.key); // 3-component key matches nothing
    expect(before.acknowledged).toHaveLength(0);

    await entry().up(mongoose.connection);

    const after = await deadlines(agent, project._id);
    expect(after.conflicts.find((c) => c.key === live.key)).toBeUndefined();
    expect(after.acknowledged.map((c) => c.key)).toContain(live.key); // silenced, exactly as before deploy
  });
});
