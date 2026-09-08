/**
 * T107 — pipeline row derivations for the Figma frame columns: asset_type
 * joins onto the MC group (FR-4.1 "type"); Started / Done are the ROW CARD's
 * OWN movements, keyed (project_id, trello_card_id) per the 2026-08-13
 * product spec (Figma 431:17015/431:17016) — NOT the MC group's aggregate.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { loadPipeline } from '../src/services/pipeline.ts';
import { deriveWorkSpans } from '../worker/syncAres.ts';
import { syncIntakeRows } from '../worker/syncIntake.ts';
import { CardEvent, Deliverable, Project, WorkCard } from '../src/models/index.ts';

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

const newProject = () =>
  Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120 });

describe('phase-13 row derivations', () => {
  it('asset_type from the sheet lands on the whole MC group', async () => {
    const p = await newProject();
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-655', display_id: 'MC-655.1', trello_card_id: 'c1', name: 'D1' });
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-655', display_id: 'MC-655.2', trello_card_id: 'c2', name: 'D2' });
    await syncIntakeRows(p._id, [
      HEADER,
      ['MC-655', 'Landing hero', 'Static', 'Campaign', 'UI', 'r@c.example', '2026-08-28', 'brief', 'TRUE'],
    ]);
    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows.map((r) => r.assetType)).toEqual(['UI', 'UI']);
  });

  it('Started/Done are the row card’s OWN span, not the MC group’s', async () => {
    const p = await newProject();
    await Deliverable.create({
      project_id: p._id, mc_number: 'MC-1', display_id: 'MC-1.1', trello_card_id: 'c1', name: 'D1',
      current_list: 'Design Complete',
      work_started_at: new Date('2026-08-03T02:00:00Z'), work_done_at: new Date('2026-08-10T02:00:00Z'),
    });
    // same MC group, its own span — the sibling's dates must not leak across
    await Deliverable.create({
      project_id: p._id, mc_number: 'MC-1', display_id: 'MC-1.2', trello_card_id: 'c2', name: 'D2',
      current_list: 'Working on Design',
      work_started_at: new Date('2026-08-05T02:00:00Z'),
    });
    // nor may a work card's span reach the rows any more
    await WorkCard.create({
      project_id: p._id, mc_number: 'MC-1', trello_card_id: 'w1', name: 't1',
      work_started_at: new Date('2026-07-01T02:00:00Z'), work_done_at: new Date('2026-07-02T02:00:00Z'),
    });

    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    const byId = new Map(rows.map((r) => [r.cardId, r]));
    expect(byId.get('c1')!.workStarted).toBe('2026-08-03');
    expect(byId.get('c1')!.workDone).toBe('2026-08-10');
    expect(byId.get('c2')!.workStarted).toBe('2026-08-05');
    expect(byId.get('c2')!.workDone).toBeNull();
  });

  it('the Ts fields carry the raw instant behind the Manila day', async () => {
    const p = await newProject();
    await Deliverable.create({
      project_id: p._id, mc_number: 'MC-2', display_id: 'MC-2', trello_card_id: 'c1', name: 'D1',
      current_list: 'Design Complete',
      work_started_at: new Date('2026-08-03T02:15:30Z'), work_done_at: new Date('2026-08-10T09:45:00Z'),
    });
    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows[0]!.workStartedTs).toBe('2026-08-03T02:15:30.000Z');
    expect(rows[0]!.workDoneTs).toBe('2026-08-10T09:45:00.000Z');
  });

  it('invariant 11: instants convert to MANILA calendar days in every host timezone', async () => {
    const p = await newProject();
    await Deliverable.create({
      project_id: p._id, mc_number: 'MC-3', display_id: 'MC-3', trello_card_id: 'c3', name: 'D3',
      current_list: 'Design Complete',
      // 23:00 UTC = 07:00 NEXT DAY in Manila — a UTC host must not show Aug 2
      work_started_at: new Date('2026-08-02T23:00:00Z'),
      work_done_at: new Date('2026-08-06T23:30:00Z'), // Manila Aug 7 (Fri)
    });
    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows[0]!.workStarted).toBe('2026-08-03'); // Manila day, not the host's
    expect(rows[0]!.workDone).toBe('2026-08-07');
    expect(rows[0]!.workStartedTs).toBe('2026-08-02T23:00:00.000Z'); // tooltip keeps the instant
  });

  it('mcLabel is the bare MC number; displayId is untouched', async () => {
    const p = await newProject();
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-837', display_id: 'MC-837.2', trello_card_id: 'c1', name: 'D1' });
    await Deliverable.create({ project_id: p._id, display_id: 'UNLINKED-1', trello_card_id: 'c2', name: 'D2' });
    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    const byId = new Map(rows.map((r) => [r.cardId, r]));
    expect(byId.get('c1')!.mcLabel).toBe('MC-837');
    expect(byId.get('c1')!.displayId).toBe('MC-837.2'); // search + other surfaces still use it
    expect(byId.get('c2')!.mcLabel).toBe('UNLINKED-1'); // no mc_number → display_id fallback
  });

  it('deriveWorkSpans fills the spans from card movements — sync review fix', async () => {
    const p = await newProject();
    await WorkCard.create({ project_id: p._id, mc_number: 'MC-4', trello_card_id: 'w4', name: 't4', current_list: 'Design Complete' });
    await CardEvent.insertMany([
      { project_id: p._id, trello_card_id: 'w4', source_event_id: 'e1', from_list: 'Design Backlog', to_list: 'Working on Design', occurred_at: new Date('2026-08-04T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'w4', source_event_id: 'e2', from_list: 'Working on Design', to_list: 'Design Complete', occurred_at: new Date('2026-08-06T05:00:00Z') },
    ]);

    expect(await deriveWorkSpans(p._id)).toBe(1);
    let card = await WorkCard.findOne({ trello_card_id: 'w4' }).orFail();
    expect(card.work_started_at?.toISOString()).toBe('2026-08-04T01:00:00.000Z');
    expect(card.work_done_at?.toISOString()).toBe('2026-08-06T05:00:00.000Z');
    expect(await deriveWorkSpans(p._id)).toBe(0); // idempotent — same values write nothing

    // moved back out of a done list → done clears, started survives
    await WorkCard.updateOne({ trello_card_id: 'w4' }, { $set: { current_list: 'Working on Design' } });
    expect(await deriveWorkSpans(p._id)).toBe(1);
    card = await WorkCard.findOne({ trello_card_id: 'w4' }).orFail();
    expect(card.work_started_at?.toISOString()).toBe('2026-08-04T01:00:00.000Z');
    expect(card.work_done_at).toBeNull();
  });

  it('deriveWorkSpans derives the DELIVERABLE card’s own span too', async () => {
    const p = await newProject();
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-5', display_id: 'MC-5', trello_card_id: 'c5', name: 'D5', current_list: 'Design Complete' });
    await CardEvent.insertMany([
      { project_id: p._id, trello_card_id: 'c5', source_event_id: 'm1', from_list: 'Production Backlog', to_list: 'Working on Design', occurred_at: new Date('2026-08-04T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'c5', source_event_id: 'm2', from_list: 'Working on Design', to_list: 'Production Backlog', occurred_at: new Date('2026-08-05T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'c5', source_event_id: 'm3', from_list: 'Production Backlog', to_list: 'Working on Design', occurred_at: new Date('2026-08-06T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'c5', source_event_id: 'm4', from_list: 'Working on Design', to_list: 'Design Complete', occurred_at: new Date('2026-08-07T05:00:00Z') },
    ]);

    expect(await deriveWorkSpans(p._id)).toBe(1);
    let card = await Deliverable.findOne({ trello_card_id: 'c5' }).orFail();
    expect(card.work_started_at?.toISOString()).toBe('2026-08-04T01:00:00.000Z'); // the FIRST start survives the bounce back
    expect(card.work_done_at?.toISOString()).toBe('2026-08-07T05:00:00.000Z'); // the LATEST done
    expect(await deriveWorkSpans(p._id)).toBe(0); // idempotent

    // reopened → done clears, started survives
    await Deliverable.updateOne({ trello_card_id: 'c5' }, { $set: { current_list: 'Working on Design' } });
    expect(await deriveWorkSpans(p._id)).toBe(1);
    card = await Deliverable.findOne({ trello_card_id: 'c5' }).orFail();
    expect(card.work_started_at?.toISOString()).toBe('2026-08-04T01:00:00.000Z');
    expect(card.work_done_at).toBeNull();

    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows[0]!.workStarted).toBe('2026-08-04');
    expect(rows[0]!.workDone).toBeNull();
  });

  it('a card that skipped straight to done still counts as started', async () => {
    const p = await newProject();
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-6', display_id: 'MC-6', trello_card_id: 'c6', name: 'D6', current_list: 'Design Complete' });
    await CardEvent.create({
      project_id: p._id, trello_card_id: 'c6', source_event_id: 'k1',
      from_list: 'Production Backlog', to_list: 'Design Complete', occurred_at: new Date('2026-08-04T01:00:00Z'),
    });
    expect(await deriveWorkSpans(p._id)).toBe(1);
    const card = await Deliverable.findOne({ trello_card_id: 'c6' }).orFail();
    expect(card.work_started_at?.toISOString()).toBe('2026-08-04T01:00:00.000Z');
    expect(card.work_done_at?.toISOString()).toBe('2026-08-04T01:00:00.000Z');
  });

  it('a movement with no to_list is not a move INTO any list', async () => {
    const p = await newProject();
    // AresMovement.toList is `string | null`, so these rows exist; classifyList('')
    // falls through to 'ongoing', which would otherwise read as a Work Started.
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-8', display_id: 'MC-8.1', trello_card_id: 'c8', name: 'D8', current_list: 'Production Backlog' });
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-8', display_id: 'MC-8.2', trello_card_id: 'c8b', name: 'D8b', current_list: 'Working on Design' });
    await CardEvent.insertMany([
      { project_id: p._id, trello_card_id: 'c8', source_event_id: 'n1', to_list: null, occurred_at: new Date('2026-02-05T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'c8b', source_event_id: 'n2', to_list: null, occurred_at: new Date('2026-01-05T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'c8b', source_event_id: 'n3', to_list: 'Working on Design', occurred_at: new Date('2026-08-04T01:00:00Z') },
    ]);

    expect(await deriveWorkSpans(p._id)).toBe(1); // only c8b has a real move
    expect((await Deliverable.findOne({ trello_card_id: 'c8' }).orFail()).work_started_at).toBeFalsy();
    expect((await Deliverable.findOne({ trello_card_id: 'c8b' }).orFail()).work_started_at?.toISOString())
      .toBe('2026-08-04T01:00:00.000Z'); // the real move, not the list-less one
  });

  it('a card living in an OPS lane keeps its Started, and never reports a Done', async () => {
    /* THE RULE (review ruling 2026-09-08): a move into any lane that is not a
       Backlog one is somebody picking the card up, so an excluded lane anchors
       STARTED exactly like an ongoing one — while DONE is held only by a Done
       lane, which an ops lane is not. 805 production cards sit in
       `Ops Work Complete`; before the ruling they were written back with both
       dates nulled, because the derivation read `excluded` as "no list at all". */
    const p = await newProject();
    await WorkCard.create({ project_id: p._id, mc_number: 'MC-9', trello_card_id: 'w9', name: 'ops chore', current_list: 'Ops Work Complete' });
    await CardEvent.insertMany([
      { project_id: p._id, trello_card_id: 'w9', source_event_id: 'x1', from_list: 'Operations Backlog', to_list: 'Working on Ops Work', occurred_at: new Date('2026-08-04T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'w9', source_event_id: 'x2', from_list: 'Working on Ops Work', to_list: 'Ops Work Complete', occurred_at: new Date('2026-08-06T05:00:00Z') },
    ]);

    expect(await deriveWorkSpans(p._id)).toBe(1);
    const card = await WorkCard.findOne({ trello_card_id: 'w9' }).orFail();
    expect(card.work_started_at?.toISOString()).toBe('2026-08-04T01:00:00.000Z');
    // `Ops Work Complete` reads "complete" but is EXCLUDED, not Done: no Done date
    expect(card.work_done_at).toBeNull();
  });

  it('a design card whose first move was into an ops lane keeps that EARLIER start', async () => {
    /* The quiet half of the same ruling, and the one that touches in-scope
       work: a card lent to ops before its design lane began. Dropping the
       excluded move would leave the later design move as the anchor, and the
       row would report a start days after work really began — a silent shift
       in the very number the empirical model is refreshed from. */
    const p = await newProject();
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-10', display_id: 'MC-10', trello_card_id: 'c10', name: 'D10', current_list: 'Design Complete' });
    await CardEvent.insertMany([
      { project_id: p._id, trello_card_id: 'c10', source_event_id: 'y1', from_list: 'Production Backlog', to_list: 'Working on Ops Work', occurred_at: new Date('2026-08-03T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'c10', source_event_id: 'y2', from_list: 'Working on Ops Work', to_list: 'Working on Design', occurred_at: new Date('2026-08-05T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'c10', source_event_id: 'y3', from_list: 'Working on Design', to_list: 'Design Complete', occurred_at: new Date('2026-08-07T05:00:00Z') },
    ]);

    expect(await deriveWorkSpans(p._id)).toBe(1);
    const card = await Deliverable.findOne({ trello_card_id: 'c10' }).orFail();
    expect(card.work_started_at?.toISOString()).toBe('2026-08-03T01:00:00.000Z'); // the OPS move, not the design one
    expect(card.work_done_at?.toISOString()).toBe('2026-08-07T05:00:00.000Z');
  });

  it('a move into Operations Backlog starts NOTHING — the one excluded lane that is a backlog', async () => {
    /* §7a excludes `Operations Backlog` by identity, not because work has
       begun there; it is a backlog like `Production Backlog`. Without the
       named exception the "any non-pending lane starts work" rule would stamp
       a STARTED on a card that has only been queued for ops. */
    const p = await newProject();
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-11', display_id: 'MC-11', trello_card_id: 'c11', name: 'D11', current_list: 'Working on Design' });
    await CardEvent.insertMany([
      { project_id: p._id, trello_card_id: 'c11', source_event_id: 'z1', from_list: 'Production Backlog', to_list: 'Operations Backlog', occurred_at: new Date('2026-08-03T01:00:00Z') },
      { project_id: p._id, trello_card_id: 'c11', source_event_id: 'z2', from_list: 'Operations Backlog', to_list: 'Working on Design', occurred_at: new Date('2026-08-05T01:00:00Z') },
    ]);

    expect(await deriveWorkSpans(p._id)).toBe(1);
    const card = await Deliverable.findOne({ trello_card_id: 'c11' }).orFail();
    expect(card.work_started_at?.toISOString()).toBe('2026-08-05T01:00:00.000Z'); // the design move; the ops-backlog move is not a start
    expect(card.work_done_at ?? null).toBeNull();
  });

  /* ------------------------------------------------------------------ */
  /* §7a consumer guards — Pipeline and the capacity footer (block 6)     */
  /* ------------------------------------------------------------------ */

  it('an EXCLUDED lane keeps its Pipeline row — the card is still on the board', async () => {
    /* §7a: excluded is a visibility filter, not a state. The row is NOT
       dropped: a main card sitting in an ops lane is a fact about the board
       and hiding it would leave the PM looking for a card Sirius knows about
       and will not show. */
    const p = await newProject();
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-20', display_id: 'MC-20', trello_card_id: 'x1', name: 'Ops thing', current_list: 'Working on Ops Work' });
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-21', display_id: 'MC-21', trello_card_id: 'x2', name: 'Real thing', current_list: 'Working on Design' });

    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows.map((r) => r.cardId).sort()).toEqual(['x1', 'x2']);
    expect(rows.find((r) => r.cardId === 'x1')!.status).toBe('excluded');
    expect(rows.find((r) => r.cardId === 'x2')!.status).toBe('ongoing');
  });

  it('a work card in an excluded lane reaches its MC group the same way', async () => {
    const p = await newProject();
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-22', display_id: 'MC-22', trello_card_id: 'y1', name: 'D', current_list: 'Working on Design' });
    await WorkCard.create({ project_id: p._id, mc_number: 'MC-22', trello_card_id: 'yw1', name: 'ops task', current_list: 'Reviewing Ops Work' });

    const { workCardsByMc } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(workCardsByMc['MC-22']!.map((w) => w.status)).toEqual(['excluded']);
  });

  it('an excluded row does NOT consume the week’s capacity, and an ongoing one does', async () => {
    /* The footer counts work the week owes. Ops work and discarded work are
       not Sirius's to plan, so they weigh nothing — the same answer a DONE row
       gets, reached for a different reason. Before the enumeration, one of
       these two (`Ops Work Complete`) was already skipped, by the accident of
       the keyword classifier calling it done. */
    const p = await newProject();
    const base = { project_id: p._id, difficulty: 'Medium' as const, slotted_week: '2026-08-03' };
    await Deliverable.create({ ...base, mc_number: 'MC-30', display_id: 'MC-30', trello_card_id: 'z1', name: 'Ops', current_list: 'Ops Work Complete' });
    await Deliverable.create({ ...base, mc_number: 'MC-31', display_id: 'MC-31', trello_card_id: 'z2', name: 'Discarded', current_list: 'Discarded Work' });
    await Deliverable.create({ ...base, mc_number: 'MC-32', display_id: 'MC-32', trello_card_id: 'z3', name: 'Real', current_list: 'Working on Design' });

    const { perWeek } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(perWeek['2026-08-03']!.rows).toBe(1); // z3 alone
  });

  it('a card with no movements derives nothing', async () => {
    const p = await newProject();
    await Deliverable.create({ project_id: p._id, mc_number: 'MC-7', display_id: 'MC-7', trello_card_id: 'c9', name: 'Solo' });
    expect(await deriveWorkSpans(p._id)).toBe(0);
    const { rows } = await loadPipeline(p._id, '2026-08-03', p.weekly_capacity);
    expect(rows[0]!.workStarted).toBeNull();
    expect(rows[0]!.workDone).toBeNull();
    expect(rows[0]!.workStartedTs).toBeNull();
    expect(rows[0]!.workDoneTs).toBeNull();
  });
});
