/**
 * T029/T030/T032 — syncAres against real mongod with a stubbed ARES client:
 * upsert idempotency, ownership boundaries, label scoping (AC-5),
 * inactive-not-deleted, card_events dedup, sync_runs on success AND failure
 * with last good data preserved (AC-19), capacity copy (BR-6a).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { syncProject } from '../worker/syncAres.ts';
import type { AresCard, AresClient, AresMovement } from '../src/services/ares.ts';
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

function stubClient(over: Partial<Record<'cards' | 'movements', unknown[]>> & { refWeeks?: object; failCards?: boolean } = {}) {
  return {
    boardCards: async () => {
      if (over.failCards) throw new Error('ARES unavailable');
      return (over.cards ?? []) as AresCard[];
    },
    boardMovements: async () => (over.movements ?? []) as AresMovement[],
    referenceWeeks: async () =>
      over.refWeeks ?? { least: 1, typical: 116, most: 367, effectiveWeeklyRate: 89.2 },
  } as unknown as AresClient;
}

// `lastPolledAt` is on both: every real ARES card carries it, and the reconcile
// guard reads it as the instant ARES fetched the card from Trello
// (contracts/ares-read.md §Freshness). Omitting it exercises the SKIP path,
// which has its own tests in reconcile.test.ts.
const CARDS: AresCard[] = [
  {
    cardId: 'c-main-1',
    boardId: 'fxA',
    name: 'MC-655 / Main Card: Landing hero',
    currentList: 'Design',
    labels: [
      { id: 'l1', name: 'Main Card' },
      { id: 'l2', name: 'Difficulty: Medium' },
    ],
    due: '2026-08-21T09:00:00.000Z',
    lastPolledAt: '2026-08-18T12:00:00.000Z',
  },
  {
    cardId: 'c-task-1',
    boardId: 'fxA',
    name: 'Render Asset: MC-655 exports',
    currentList: 'Production Backlog',
    labels: [],
    due: null,
    lastPolledAt: '2026-08-18T12:00:00.000Z',
  },
];

const MOVES: AresMovement[] = [
  { cardId: 'c-main-1', fromList: 'Backlog', toList: 'Design', detectedAt: '2026-08-03T01:00:00.000Z' },
  { cardId: 'c-main-1', fromList: 'Design', toList: 'Sent for Client Review', detectedAt: '2026-08-03T05:00:00.000Z' },
];

async function makeProject(over: Record<string, unknown> = {}) {
  return Project.create({
    code: 'rt-837',
    name: 'Fixture',
    trello_board_id: 'fxA',
    weekly_capacity: 120,
    ...over,
  });
}

describe('syncProject', () => {
  it('maps and upserts deliverables + work cards, idempotently', async () => {
    const project = await makeProject();
    const client = stubClient({ cards: CARDS, movements: MOVES });

    const s1 = await syncProject(client, project);
    expect(s1.deliverables).toBe(1);
    expect(s1.workCards).toBe(1);
    expect(s1.eventsInserted).toBe(2);

    const s2 = await syncProject(client, project); // rerun: nothing duplicates
    expect(s2.eventsInserted).toBe(0);
    expect(await Deliverable.countDocuments({})).toBe(1);
    expect(await WorkCard.countDocuments({})).toBe(1);
    expect(await CardEvent.countDocuments({})).toBe(2);

    const d = await Deliverable.findOne({ trello_card_id: 'c-main-1' }).orFail();
    expect(d.display_id).toBe('MC-655');
    expect(d.trello_due).toBe('2026-08-21');
    expect(d.difficulty).toBe('Medium');
  });

  it('sync never touches Sirius-owned planning fields (§1.2 ownership)', async () => {
    const project = await makeProject();
    const client = stubClient({ cards: CARDS });
    await syncProject(client, project);
    await Deliverable.updateOne(
      { trello_card_id: 'c-main-1' },
      { $set: { slotted_week: '2026-08-10', pinned: true, confidence: '0.85', status_note: 'note' } },
    );
    await syncProject(client, project);
    const d = await Deliverable.findOne({ trello_card_id: 'c-main-1' }).orFail();
    expect(d.slotted_week).toBe('2026-08-10');
    expect(d.pinned).toBe(true);
    expect(d.confidence).toBe('0.85');
    expect(d.status_note).toBe('note');
  });

  it('AC-5: a labelled project on a shared board only sees its own cards', async () => {
    const project = await makeProject({ code: 'rt-900', trello_board_id: 'fxShared', trello_label: 'Acme' });
    const shared: AresCard[] = [
      { ...CARDS[0]!, cardId: 's1', name: 'MC-1 / Main Card: Acme', labels: [{ id: 'a', name: 'Main Card' }, { id: 'b', name: 'Acme' }] },
      { ...CARDS[0]!, cardId: 's2', name: 'MC-2 / Main Card: Other', labels: [{ id: 'a', name: 'Main Card' }, { id: 'c', name: 'Jollibee' }] },
    ];
    const stats = await syncProject(stubClient({ cards: shared }), project);
    expect(stats.deliverables).toBe(1);
    expect(await Deliverable.countDocuments({ project_id: project._id })).toBe(1);
  });

  it('cards gone from the board go inactive, never deleted', async () => {
    const project = await makeProject();
    await syncProject(stubClient({ cards: CARDS }), project);
    await syncProject(stubClient({ cards: [] }), project);
    const d = await Deliverable.findOne({ trello_card_id: 'c-main-1' }).orFail();
    expect(d.active).toBe(false);
  });

  it('BR-6a: capacity reference weeks are copied onto the project each run', async () => {
    const project = await makeProject();
    await syncProject(stubClient({ cards: [] }), project);
    const p = await Project.findById(project._id).orFail();
    expect(p.ref_week_typical).toBe(116);
    expect(p.effective_weekly_rate).toBe(89.2);
  });

  it('AC-19: a failed sync throws, and last good data stays untouched', async () => {
    const project = await makeProject();
    await syncProject(stubClient({ cards: CARDS, movements: MOVES }), project);
    await expect(syncProject(stubClient({ failCards: true }), project)).rejects.toThrow(/unavailable/);
    expect(await Deliverable.countDocuments({})).toBe(1); // last good data intact
    expect(await CardEvent.countDocuments({})).toBe(2);
  });
});
