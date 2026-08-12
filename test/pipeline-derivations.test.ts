/**
 * T107 — pipeline row derivations for the Figma frame columns (phase 13):
 * asset_type joins onto the MC group (FR-4.1 "type"), Work Started = the
 * group's earliest task start, Work Done = latest done only when EVERY task
 * is done, Cycle Time = workdays between. Assumptions logged in tasks.md.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { loadPipeline } from '../src/services/pipeline.ts';
import { syncIntakeRows } from '../worker/syncIntake.ts';
import { Deliverable, Project, WorkCard } from '../src/models/index.ts';

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

describe('phase-13 row derivations', () => {
  it('asset_type from the sheet lands on the whole MC group', async () => {
    const p = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120 });
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-655', display_id: 'MC-655.1', trello_card_id: 'c1', name: 'D1' });
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-655', display_id: 'MC-655.2', trello_card_id: 'c2', name: 'D2' });
    await syncIntakeRows(p._id, [
      HEADER,
      ['MC-655', 'Landing hero', 'Static', 'Campaign', 'UI', 'r@c.example', '2026-08-28', 'brief', 'TRUE'],
    ]);
    const { rows } = await loadPipeline(p._id, '2026-08-03');
    expect(rows.map((r) => r.assetType)).toEqual(['UI', 'UI']);
  });

  it('work span: earliest start; done only when every task is done; cycle in workdays', async () => {
    const p = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120 });
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-1', display_id: 'MC-1', trello_card_id: 'c1', name: 'D1' });
    await WorkCard.create({
      project_id: p._id, mc_number: 'MC-1', trello_card_id: 'w1', name: 't1',
      work_started_at: new Date('2026-08-05T02:00:00Z'), work_done_at: new Date('2026-08-07T02:00:00Z'),
    });
    await WorkCard.create({
      project_id: p._id, mc_number: 'MC-1', trello_card_id: 'w2', name: 't2',
      work_started_at: new Date('2026-08-03T02:00:00Z'), // earlier start, NOT done
    });

    let { rows } = await loadPipeline(p._id, '2026-08-03');
    expect(rows[0]!.workStarted).toBe('2026-08-03');
    expect(rows[0]!.workDone).toBeNull(); // one task still open
    expect(rows[0]!.cycleDays).toBeNull();

    await WorkCard.updateOne({ trello_card_id: 'w2' }, { $set: { work_done_at: new Date('2026-08-10T02:00:00Z') } });
    ({ rows } = await loadPipeline(p._id, '2026-08-03'));
    expect(rows[0]!.workDone).toBe('2026-08-10');
    expect(rows[0]!.cycleDays).toBeGreaterThan(0); // Mon 03 → Mon 10: workdays, weekend skipped
    expect(rows[0]!.cycleDays).toBeLessThanOrEqual(5);
  });

  it('a group with no work cards derives nothing', async () => {
    const p = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120 });
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-2', display_id: 'MC-2', trello_card_id: 'c9', name: 'Solo' });
    const { rows } = await loadPipeline(p._id, '2026-08-03');
    expect(rows[0]!.workStarted).toBeNull();
    expect(rows[0]!.workDone).toBeNull();
    expect(rows[0]!.cycleDays).toBeNull();
  });
});
