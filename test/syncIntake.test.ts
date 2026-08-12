/**
 * T037/T038/T039 — intake sync integration: mirror upserts, inactive-not-
 * deleted (AC-9), deadline join + coverage rise (AC-8), sync_runs on failure
 * with last good data (AC-19), and the requests route (FR-3.3, FR-3.6).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { runIntakeSync, syncIntakeRows } from '../worker/syncIntake.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { Deliverable, IntakeRequest, Project, SyncRun, User, UserProject } from '../src/models/index.ts';

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

const HEADER = ['MC #', 'Deliverable', 'Type', 'Use Case', 'Type', 'Requestor', 'Deadline', 'Brief', 'In Frost Prod'];
const ROW = (mc: string, name: string, dl = '2026-08-28') => [mc, name, 'Static', 'Campaign', 'Web', 'r@c.example', dl, 'brief', 'TRUE'];

async function makeProject() {
  return Project.create({ code: 'rt-837', name: 'Fixture', trello_board_id: 'fxA', weekly_capacity: 120 });
}

describe('mirror + join', () => {
  it('upserts requests and re-running changes nothing', async () => {
    const p = await makeProject();
    const rows = [HEADER, ROW('MC-655', 'Landing hero'), ROW('MC-702', 'Unfiled thing')];
    const s1 = await syncIntakeRows(p._id, rows);
    const s2 = await syncIntakeRows(p._id, rows);
    expect(s1.imported).toBe(2);
    expect(s2.imported).toBe(2);
    expect(await IntakeRequest.countDocuments({})).toBe(2);
  });

  it('AC-9: a row deleted from the sheet goes inactive with history intact', async () => {
    const p = await makeProject();
    await syncIntakeRows(p._id, [HEADER, ROW('MC-655', 'Landing hero'), ROW('MC-702', 'Goes away')]);
    await syncIntakeRows(p._id, [HEADER, ROW('MC-655', 'Landing hero')]);
    const gone = await IntakeRequest.findOne({ mc_number: 'MC-702' }).orFail();
    expect(gone.active).toBe(false);
    expect(gone.first_seen_at).toBeInstanceOf(Date);
  });

  it('AC-8: the deadline join raises coverage measurably, sheet fields land on the whole MC group', async () => {
    const p = await makeProject();
    for (let i = 1; i <= 3; i++)
      await Deliverable.create({
        project_id: p._id, mc_number: 'MC-655', display_id: `MC-655.${i}`,
        trello_card_id: `c${i}`, name: `D${i}`,
      });
    await Deliverable.create({
      project_id: p._id, mc_number: 'MC-900', display_id: 'MC-900',
      trello_card_id: 'c9', name: 'No sheet row',
    });

    const before = await Deliverable.countDocuments({ project_id: p._id, sheet_deadline: { $ne: null } });
    const stats = await syncIntakeRows(p._id, [HEADER, ROW('MC-655', 'Landing hero')]);
    expect(before).toBe(0);
    expect(stats.joined).toBe(3); // the whole group, not one deliverable
    expect(stats.deadlineCoverage).toEqual({ withDeadline: 3, total: 4 });

    const viaView = await Deliverable.db.db!
      .collection('deliverables_v')
      .findOne({ trello_card_id: 'c1' });
    expect(viaView?.deadline).toBe('2026-08-28'); // BR-9 via the view
    expect(viaView?.deadline_source).toBe('sheet');
  });

  it('AC-19: a failing fetch records ok:false and last good data survives', async () => {
    const p = await makeProject();
    await runIntakeSync(p._id, async () => [HEADER, ROW('MC-655', 'Landing hero')]);
    await runIntakeSync(p._id, async () => {
      throw new Error('sheets read failed: HTTP 403'); // AC-7's un-share scenario
    });
    expect(await IntakeRequest.countDocuments({ active: true })).toBe(1);
    const runs = await SyncRun.find({ source: 'sheet' }).sort({ at: 1 });
    expect(runs.map((r) => r.ok)).toEqual([true, false]);
    expect(runs[1]?.error).toMatch(/403/);
  });
});

describe('requests route (FR-3.2, FR-3.3, FR-3.6, FR-8.6)', () => {
  it('serves the mirror with Trello-join status, filters, rejects and sync state', async () => {
    const p = await makeProject();
    const user = await User.create({ email: 'member@frostdesigngroup.com' });
    await UserProject.create({ user_id: user._id, project_id: p._id });
    await Deliverable.create({
      project_id: p._id, mc_number: 'MC-655', display_id: 'MC-655',
      trello_card_id: 'c1', name: 'Filed one',
    });
    await runIntakeSync(p._id, async () => [
      HEADER,
      ROW('MC-655', 'Landing hero'),
      ['MC-702', 'Unfiled no deadline', 'Static', 'Campaign', 'Web', 'r@c.example', '', 'brief', 'TRUE'],
    ]);

    const app = createApp({ env, redis: null, mongo: null });
    const agent = request.agent(app);
    await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);

    const all = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    // FR-11.3 (2026-08-12): three-state — no note on these, so unfiled = For Filing
    expect(all.body.requests.map((r: { status: string }) => r.status)).toEqual(['In Pipeline', 'For Filing']);
    expect(all.body.sync.lastAttemptOk).toBe(true);
    expect(all.body.sync.lastSuccessAt).toBeTruthy();

    const unfiled = await agent.get(`/api/projects/${p._id}/requests?filter=unfiled`).expect(200);
    expect(unfiled.body.requests.length).toBe(1);
    const missing = await agent.get(`/api/projects/${p._id}/requests?filter=missing-deadline`).expect(200);
    expect(missing.body.requests.map((r: { mc_number: string }) => r.mc_number)).toEqual(['MC-702']);
  });
});
