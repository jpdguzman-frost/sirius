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

/* owl #52 — the wire fact the expansion needs. `mc_number` is not a key
   (invariant 3), so the client cannot tell an attributable MC from a shared
   one without being told; and it must not recount, because the SAME counts
   already divide the weight above. Board-measured 2026-08-20: 19 of 37 MC
   numbers carry more than one main card, so this is the common case. */
describe('mcDeliverables — the count the expansion attributes by', () => {
  it('reports one entry per MC number, holding its deliverable count', async () => {
    const p = await project();
    await group(p._id, 'MC-837', 3, 5, 0); // shared: three mains, five tasks
    await group(p._id, 'MC-901', 1, 2, 1); // attributable: one main
    const { mcDeliverables } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(mcDeliverables).toEqual({ 'MC-837': 3, 'MC-901': 1 });
  });

  it('is the SAME count the weight divides by — one source, so they cannot disagree', async () => {
    const p = await project();
    await group(p._id, 'MC-825', 99, 30, 0);
    const { rows, mcDeliverables } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    const n = mcDeliverables['MC-825']!;
    expect(n).toBe(99);
    for (const r of rows) expect(r.weight).toBeCloseTo(1 + 30 / n, 10);
  });

  it('omits a deliverable with no MC number — it groups with nothing', async () => {
    const p = await project();
    await Deliverable.create({ project_id: p._id, display_id: 'loose', trello_card_id: 'loose-1', name: 'No MC' });
    const { mcDeliverables } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(mcDeliverables).toEqual({});
  });
});

/* owl #61 — Miles ruled the orphaned work must be VISIBLE. A work card whose
   MC number has no deliverable row hangs under nothing in the Pipeline and,
   because the BR-6c pass only weighs a task whose MC has a row, it weighs into
   nothing either. So it is real work that is invisible AND silently absent
   from capacity — the quiet half of the reused-MC problem (the live board
   carried 11 such numbers and 35 cards on 2026-08-20). */
describe('unattachedWork — work that belongs to no row and no week', () => {
  it('counts the cards and names the MC numbers, sorted', async () => {
    const p = await project();
    await group(p._id, 'MC-837', 2, 3, 0); // attached: has deliverables
    await WorkCard.insertMany([
      { project_id: p._id, mc_number: 'MC-804', trello_card_id: 'o-1', name: 'orphan 1' },
      { project_id: p._id, mc_number: 'MC-804', trello_card_id: 'o-2', name: 'orphan 2' },
      { project_id: p._id, mc_number: 'MC-755', trello_card_id: 'o-3', name: 'orphan 3' },
    ]);
    const { unattachedWork } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(unattachedWork).toEqual({ cards: 3, mcNumbers: ['MC-755', 'MC-804'] });
  });

  it('is EMPTY when every MC has a row — the surface hides at zero', async () => {
    const p = await project();
    await group(p._id, 'MC-837', 1, 4, 0);
    const { unattachedWork } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(unattachedWork).toEqual({ cards: 0, mcNumbers: [] });
  });

  it('proves the capacity gap it exists to report — orphans weigh NOTHING', async () => {
    /* the whole point of the surface: without it these cards are absent from
       every week's load and nothing on screen says so */
    const p = await project();
    await group(p._id, 'MC-837', 1, 2, 0); // 1 row + 2 tasks = weight 3
    await WorkCard.insertMany([
      { project_id: p._id, mc_number: 'MC-999', trello_card_id: 'o-1', name: 'orphan 1' },
      { project_id: p._id, mc_number: 'MC-999', trello_card_id: 'o-2', name: 'orphan 2' },
    ]);
    const { rows, unattachedWork } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(3, 9); // the orphans add nothing
    expect(unattachedWork.cards).toBe(2); // …and this is what says so
  });

  it('scopes to the project — another project’s orphans are not this one’s', async () => {
    const p = await project();
    const other = await Project.create({ code: 'rt-test', name: 'Other', trello_board_id: 'fxB', weekly_capacity: 5 });
    await WorkCard.create({ project_id: other._id, mc_number: 'MC-804', trello_card_id: 'x-1', name: 'theirs' });
    const { unattachedWork } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(unattachedWork).toEqual({ cards: 0, mcNumbers: [] });
  });
});
