/**
 * T037/T038/T039 — intake sync integration: mirror upserts, inactive-not-
 * deleted (AC-9), deadline join + coverage rise (AC-8), sync_runs on failure
 * with last good data (AC-19), and the requests route (FR-3.3, FR-3.6).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { getRequests, mcsOf } from './helpers/requests.ts';
import { runIntakeSync, syncIntakeRows } from '../worker/syncIntake.ts';
import { parseIntake } from '../src/services/intake-parser.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { Deliverable, IntakeReject, IntakeRequest, Project, SyncRun, User, UserProject } from '../src/models/index.ts';

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

// The sheet's UNIT column is headed `Business Unit` (PLAN D1); `Use Case`,
// the older header, is proven still to map in test/intake.test.ts.
const HEADER = ['MC #', 'Deliverable', 'Type', 'Business Unit', 'Type', 'Requestor', 'Deadline', 'Brief', 'In Frost Prod'];
const ROW = (mc: string, name: string, dl = '2026-08-28', unit = 'Campaign') => [mc, name, 'Static', unit, 'Web', 'r@c.example', dl, 'brief', 'TRUE'];

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

  it('carries the new year/month columns onto the mirror, like use_case', async () => {
    const p = await makeProject();
    await syncIntakeRows(p._id, [
      [...HEADER, 'Year', 'Month'],
      [...ROW('MC-655', 'Landing hero'), '2026.0', 'January'],
      [...ROW('MC-702', 'No timing'), '', ''],
    ]);
    const filled = await IntakeRequest.findOne({ mc_number: 'MC-655' }).orFail();
    expect(filled.year).toBe(2026);
    expect(filled.month).toBe('January');
    const empty = await IntakeRequest.findOne({ mc_number: 'MC-702' }).orFail();
    expect(empty.year ?? null).toBeNull();
    expect(empty.month ?? null).toBeNull();
  });

  it('a multi-value unit reaches the mirror AND the joined deliverable WHOLE, is never a reject, and logs one line naming the field and reason the parser raised', async () => {
    const p = await makeProject();
    await Deliverable.create({
      project_id: p._id, mc_number: 'MC-655', display_id: 'MC-655',
      trello_card_id: 'c1', name: 'Filed two-unit',
    });
    const rows = [HEADER, ROW('MC-655', 'Two units', '2026-08-28', 'Campaign, Product'), ROW('MC-702', 'One unit')];
    // The warning the parser ACTUALLY raises — the log line is asserted
    // against these fields, never against a literal that a second warning
    // kind would make a lie.
    const raised = parseIntake(rows).warnings;
    expect(raised).toHaveLength(1);
    const w = raised[0]!;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let lines: string[] = [];
    let joinedCount = -1;
    try {
      joinedCount = (await syncIntakeRows(p._id, rows)).joined;
      // read the calls BEFORE restoring — mockRestore also resets them
      lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('[syncIntake]'));
    } finally {
      warn.mockRestore();
    }

    const multi = await IntakeRequest.findOne({ mc_number: 'MC-655' }).orFail();
    expect(multi.use_case).toBe('Campaign, Product');
    const single = await IntakeRequest.findOne({ mc_number: 'MC-702' }).orFail();
    expect(single.use_case).toBe('Campaign');
    expect(await IntakeReject.countDocuments({ project_id: p._id })).toBe(0); // a warning is not a reject

    // the join carries the same whole value onto the card — no split there either
    expect(joinedCount).toBe(1);
    const joined = await Deliverable.findOne({ trello_card_id: 'c1' }).orFail();
    expect(joined.use_case).toBe('Campaign, Product');

    expect(lines).toHaveLength(1); // one line per warning, the single-unit row silent
    expect(lines[0]).toContain(w.reason);
    expect(lines[0]).toContain(w.field);
    expect(lines[0]).toContain(`row ${w.sheet_row}`);
    expect(lines[0]).toContain(String(p._id));
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

    const all = await getRequests(agent, p._id);
    // FR-11.3 (owls #34–#35, 2026-08-17): two-state — status is the Trello
    // join alone, so an unfiled row reads 'For Filing' whatever its note says
    expect(all.requests.map((r) => r.status)).toEqual(['In Pipeline', 'For Filing']);
    expect(all.counts).toEqual({ requests: 2, inPipeline: 1, toFile: 1, forClarification: 0 });
    expect(all.sync.lastAttemptOk).toBe(true);
    expect(all.sync.lastSuccessAt).toBeTruthy();

    const unfiled = await getRequests(agent, p._id, '?filter=unfiled');
    expect(unfiled.requests.length).toBe(1);
    const missing = await getRequests(agent, p._id, '?filter=missing-deadline');
    expect(mcsOf(missing.requests)).toEqual(['MC-702']);
  });
});
