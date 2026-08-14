/**
 * T098 — BR-6c row weight (AC-24): rows weigh 1 + (MC group's work cards ÷
 * group's deliverables), so load speaks the same unit as BR-6a capacity
 * (cards). The verified board shape — 269 deliverables + 209 attached work
 * cards — must total exactly 478 card-equivalents. lib/planner.ts is NOT
 * touched by this: suggestPlan still counts rows (golden-locked).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { loadPipeline, toMilestones } from '../src/services/pipeline.ts';
import { detectConflicts, fmtLoad } from '../src/services/conflicts.ts';
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

const project = () =>
  Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 5 });

async function group(projectId: unknown, mc: string, deliverables: number, tasks: number, offset: number) {
  await Deliverable.insertMany(
    Array.from({ length: deliverables }, (_, i) => ({
      project_id: projectId, mc_number: mc, display_id: `${mc}.${i + 1}`,
      trello_card_id: `d-${offset}-${i}`, name: `${mc} deliverable ${i + 1}`,
    })),
  );
  await WorkCard.insertMany(
    Array.from({ length: tasks }, (_, i) => ({
      project_id: projectId, mc_number: mc, trello_card_id: `t-${offset}-${i}`, name: `${mc} task ${i + 1}`,
    })),
  );
}

describe('BR-6c row weight', () => {
  it('MC-805 shape: 13 deliverables + 40 tasks → 4.08 per row, 53 for the group', async () => {
    const p = await project();
    await group(p._id, 'MC-805', 13, 40, 0);
    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows).toHaveLength(13);
    for (const r of rows) expect(r.weight).toBeCloseTo(1 + 40 / 13, 10);
    expect(fmtLoad(rows[0]!.weight)).toBe('4.1'); // one decimal for fractions
    expect(rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(53, 9);
  });

  it('AC-24: the verified board shape sums to exactly 478 = 269 + 209', async () => {
    const p = await project();
    // Mirror the real distribution coarsely: one huge group (MC-825-like),
    // a task-heavy one (MC-805-like), several plain ones, and singletons —
    // 269 deliverables and 209 attached work cards in total.
    await group(p._id, 'MC-825', 99, 30, 1); // the 99-deliverable MC
    await group(p._id, 'MC-805', 13, 40, 2);
    await group(p._id, 'MC-655', 3, 27, 3);
    await group(p._id, 'MC-700', 50, 60, 4);
    await group(p._id, 'MC-701', 44, 52, 5);
    for (let i = 0; i < 60; i++) await group(p._id, `MC-9${String(i).padStart(2, '0')}`, 1, 0, 100 + i);

    expect(await Deliverable.countDocuments({})).toBe(269);
    expect(await WorkCard.countDocuments({})).toBe(209);

    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(478, 6);
  });

  it('a row with no work cards weighs exactly 1; an unkeyed row weighs 1', async () => {
    const p = await project();
    await group(p._id, 'MC-1', 2, 0, 0);
    await Deliverable.create({ project_id: p._id, display_id: 'loose', trello_card_id: 'loose-1', name: 'No MC' });
    // a task whose MC has no deliverable weighs into nothing
    await WorkCard.create({ project_id: p._id, mc_number: 'MC-ORPHAN', trello_card_id: 'orphan-t', name: 'Orphan task' });

    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows.map((r) => r.weight)).toEqual([1, 1, 1]);
  });

  it('the over-capacity conflict fires on card-equivalents, not row count', async () => {
    const p = await project(); // weekly_capacity 5
    // 3 rows, but each carries 2 tasks → 3 × (1 + 2) = 9 card-equivalents
    await Deliverable.insertMany(
      Array.from({ length: 3 }, (_, i) => ({
        project_id: p._id, mc_number: `MC-${i}`, display_id: `MC-${i}`, trello_card_id: `c${i}`,
        name: `D${i}`, difficulty: 'Medium', lane: 'design', current_list: 'Design',
        slotted_week: '2026-08-03', sheet_deadline: '2026-12-31',
      })),
    );
    for (let i = 0; i < 3; i++)
      await WorkCard.insertMany([
        { project_id: p._id, mc_number: `MC-${i}`, trello_card_id: `w${i}a`, name: 't' },
        { project_id: p._id, mc_number: `MC-${i}`, trello_card_id: `w${i}b`, name: 't' },
      ]);

    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    const milestones = toMilestones(rows).filter((m) => m.phase === 'sketch');
    // 3 sketch milestones in one week: row count (3) is under capacity (5),
    // weighted load (9) is over — BR-6c is what trips the rule.
    const byWeek = new Map<string, typeof milestones>();
    for (const m of milestones) byWeek.set(m.week, [...(byWeek.get(m.week) ?? []), m]);
    const [week, items] = [...byWeek.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
    expect(items.length).toBeLessThanOrEqual(5);

    const conflicts = detectConflicts(items, 5).filter((c) => c.rule === 'over-capacity' && c.week === week);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.explanation).toContain('9 cards');

    // strip the weights → row count only → no conflict at the same capacity
    const unweighted = items.map((m) => ({ ...m, weight: 1 }));
    expect(detectConflicts(unweighted, 5).filter((c) => c.rule === 'over-capacity')).toHaveLength(0);
  });
});
