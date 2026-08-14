/**
 * Requests tab v2 — the resolved deadline (invariant 14 / BR-9) on the
 * intake mirror: the MC group's earliest Trello due wins over the sheet
 * date, else the sheet date, else nothing. mc_number is NOT unique
 * (invariant 3), so the whole group is scanned. Plus the year/month
 * passthrough of the new intake columns.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { loggedInProjectFixture } from './helpers/fixtures.ts';
import { byMc, rowsOf } from './helpers/requests.ts';
import type { Types } from 'mongoose';
import { Deliverable, IntakeRequest, Project } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

const fixture = loggedInProjectFixture;

const intake =(projectId: Types.ObjectId, mc: string, sheet_row: number, over: Record<string, unknown> = {}) =>
  IntakeRequest.create({ project_id: projectId, mc_number: mc, sheet_row, name: `Req ${mc}`, ...over });

const card = (projectId: Types.ObjectId, mc: string, id: string, over: Record<string, unknown> = {}) =>
  Deliverable.create({
    project_id: projectId,
    mc_number: mc,
    display_id: id,
    trello_card_id: id,
    name: `Card ${id}`,
    ...over,
  });

describe('resolved deadline (invariant 14)', () => {
  it('a filed deliverable carrying trello_due beats the sheet date', async () => {
    const { p, agent } = await fixture();
    await intake(p._id, 'MC-655', 3, { deadline: '2026-09-30' });
    await card(p._id, 'MC-655', 'c1', { trello_due: '2026-08-21' });

    const row = byMc(await rowsOf(agent, p._id), 'MC-655');
    expect(row.deadline).toBe('2026-08-21');
    expect(row.deadline_source).toBe('trello');
  });

  it('a multi-deliverable MC resolves to the EARLIEST trello_due', async () => {
    const { p, agent } = await fixture();
    await intake(p._id, 'MC-825', 4, { deadline: '2026-09-30' });
    await card(p._id, 'MC-825', 'c1', { trello_due: '2026-10-02' });
    await card(p._id, 'MC-825', 'c2', { trello_due: '2026-08-19' }); // earliest
    await card(p._id, 'MC-825', 'c3', { trello_due: '2026-09-01' });
    await card(p._id, 'MC-825', 'c4'); // no due at all — ignored, not treated as earliest

    const row = byMc(await rowsOf(agent, p._id), 'MC-825');
    expect(row.deadline).toBe('2026-08-19');
    expect(row.deadline_source).toBe('trello');
  });

  it('a filed MC with no Trello due falls back to the sheet date', async () => {
    const { p, agent } = await fixture();
    await intake(p._id, 'MC-701', 5, { deadline: '2026-08-28' });
    await card(p._id, 'MC-701', 'c5');

    const row = byMc(await rowsOf(agent, p._id), 'MC-701');
    expect(row.deadline).toBe('2026-08-28');
    expect(row.deadline_source).toBe('sheet');
  });

  it('an unfiled request falls back to the sheet date, and to null with neither', async () => {
    const { p, agent } = await fixture();
    await intake(p._id, 'MC-702', 6, { deadline: '2026-08-28' });
    await intake(p._id, 'MC-703', 7);

    const rows = await rowsOf(agent, p._id);
    expect(byMc(rows, 'MC-702')).toMatchObject({ deadline: '2026-08-28', deadline_source: 'sheet' });
    expect(byMc(rows, 'MC-703')).toMatchObject({ deadline: null, deadline_source: null });
  });

  it('an inactive deliverable never supplies the deadline', async () => {
    const { p, agent } = await fixture();
    await intake(p._id, 'MC-704', 8, { deadline: '2026-08-28' });
    await card(p._id, 'MC-704', 'c6', { trello_due: '2026-07-01', active: false });

    const row = byMc(await rowsOf(agent, p._id), 'MC-704');
    expect(row.deadline).toBe('2026-08-28');
    expect(row.deadline_source).toBe('sheet');
  });

  it("another project's deliverable never leaks in (invariant 1)", async () => {
    const { p, agent } = await fixture();
    const other = await Project.create({
      code: 'rt-999',
      name: 'Other',
      trello_board_id: 'fxB',
      weekly_capacity: 120,
    });
    await intake(p._id, 'MC-705', 9, { deadline: '2026-08-28' });
    await card(other._id, 'MC-705', 'c7', { trello_due: '2026-07-01' });

    const row = byMc(await rowsOf(agent, p._id), 'MC-705');
    expect(row.deadline).toBe('2026-08-28');
    expect(row.deadline_source).toBe('sheet');
  });

  it('filter=missing-deadline tests the RESOLVED deadline, not the sheet field', async () => {
    const { p, agent } = await fixture();
    await intake(p._id, 'MC-706', 10); // no sheet date, but Trello has one → not missing
    await card(p._id, 'MC-706', 'c8', { trello_due: '2026-08-21' });
    await intake(p._id, 'MC-707', 11, { deadline: '2026-08-28' }); // sheet only → not missing
    await intake(p._id, 'MC-708', 12); // nothing anywhere → missing
    await card(p._id, 'MC-708', 'c9');

    const rows = await rowsOf(agent, p._id, '?filter=missing-deadline');
    expect(rows.map((r) => r.mc_number)).toEqual(['MC-708']);
  });
});

describe('year / month passthrough (new intake columns)', () => {
  it('serves year and month when present, null when absent', async () => {
    const { p, agent } = await fixture();
    await intake(p._id, 'MC-709', 13, { year: 2026, month: 'January' });
    await intake(p._id, 'MC-710', 14);

    const rows = await rowsOf(agent, p._id);
    expect(byMc(rows, 'MC-709')).toMatchObject({ year: 2026, month: 'January' });
    expect(byMc(rows, 'MC-710')).toMatchObject({ year: null, month: null });
  });
});
