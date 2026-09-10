/**
 * §7a's safety net (block 6, 2026-09-08): "an unmapped lane must be SURFACED,
 * never guessed at."
 *
 * A static enumeration is only safe if the list it does NOT recognise is loud.
 * `classifyList` still answers `ongoing` so the app renders something, but that
 * answer is a fallback rather than a classification, and every sync run records
 * which names took it — `sync_runs.stats.unmappedLists`, sorted and unique,
 * plus one warn line. No new collection, no UI: the array is the record and the
 * question goes to product through it.
 *
 * A separate file from `test/syncAres.test.ts` on purpose: this is one narrow
 * §7a guard over the sync, and the T029/T030/T032 suite is about upsert
 * ownership and idempotency.
 *
 * Block 8 (2026-09-10) adds the second half of the same guard, on the other
 * axis: `stats.unknownLanes` asks the identical question of the BOARD'S OWN
 * lane table, so a lane with no rule surfaces before the first card sits in
 * it (item 11 of the block-8 drift report; the promise owls #11/#13 traded).
 * Both halves are collected by the same `collectUnmapped`, which is why they
 * are proved in one file.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { aresCard, label } from './helpers/ares-card.ts';
import { syncProject, type SyncStats } from '../worker/syncAres.ts';
import type { AresBoardLane, AresCard, AresClient, AresMovement } from '../src/services/ares.ts';
import { Project, SyncRun } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

/** What ARES answers for `/boards/:id/lanes`; `null` = never synced / no read. */
type LaneTable = { lanes: AresBoardLane[]; syncedAt: string | null } | null;

/**
 * One lane row as Apollo's id-keyed table sends it. Every contract field is
 * present even though the check reads only `name` — a fixture that carried the
 * one field the code happens to use would stop proving the code ignores the
 * rest, and type/group/isStart/isDone are a SECOND taxonomy that must never
 * leak into §7a's state mapping.
 */
const lane = (name: string, over: Partial<AresBoardLane> = {}): AresBoardLane => ({
  listId: `l-${name}`,
  name,
  pos: 1,
  type: 'work',
  group: 'Design',
  isStart: false,
  isDone: false,
  ...over,
});

/**
 * The lane table defaults to `null` — the shape every OTHER suite's stub
 * client answers with, since none of them defines `boardLanes` at all. That is
 * the contract this suite pins in `a lane table that throws…`: the reconcile
 * check must degrade, never take a sync down.
 */
const client = (
  cards: AresCard[],
  movements: AresMovement[] = [],
  boardLanes: () => Promise<LaneTable> = async () => null,
) =>
  ({
    boardCards: async () => cards,
    boardMovements: async () => movements,
    referenceWeeks: async () => ({ least: 1, typical: 116, most: 367, effectiveWeeklyRate: 89.2 }),
    boardLanes,
  }) as unknown as AresClient;

const project = () => Project.create({ code: 'rt-837', name: 'Fixture', trello_board_id: 'fxA', weekly_capacity: 120 });

const card = (id: string, currentList: string | null) =>
  aresCard({ cardId: id, boardId: 'fxA', name: `MC-1 / ${id}`, currentList, labels: [label('Main Card')] });

describe('sync_runs.stats.unmappedLists', () => {
  it('records every unrecognised list name, sorted and deduplicated', async () => {
    const p = await project();
    /* Four of the five names the production board really holds that §7a
       settles for none of us, one of them twice so the dedup is exercised. */
    const stats = await syncProject(
      client([
        card('a', 'For Archive'),
        card('b', 'NOTE'),
        card('c', 'For Archive'),
        card('d', 'On Hold: Ryse, NBG'),
        card('e', 'Hard Deadline: Monday Mar. 23'),
      ]),
      p,
    );
    expect(stats.unmappedLists).toEqual([
      'For Archive',
      'Hard Deadline: Monday Mar. 23',
      'NOTE',
      'On Hold: Ryse, NBG',
    ]);
  });

  it('is EMPTY when every name resolves — including by rule, not only by the table', async () => {
    const p = await project();
    const stats = await syncProject(
      client([
        card('a', 'Working on Design'), // exact table
        card('b', '➜ Ready for Screen Design'), // Ready-for rule
        card('c', '➜ Refinement: Working on it'), // family-stage rule, undocumented family
        card('d', 'Backlog: Migration'), // Backlog rule
        card('e', '-> Render: Sent for Client Approval'), // the ASCII-arrow typo §7a names
      ]),
      p,
    );
    expect(stats.unmappedLists).toEqual([]);
  });

  it('records the names verbatim — the board’s spelling, not a normalised one', async () => {
    const p = await project();
    const stats = await syncProject(client([card('a', '  For   Archive  ')]), p);
    // byte-for-byte what ARES sent. Normalisation is for MATCHING; a report
    // that tidied the name would hide the very typo it exists to surface.
    expect(stats.unmappedLists).toEqual(['  For   Archive  ']);
  });

  it('reads both ends of a movement, not just the card’s current list', async () => {
    /* A list a card has PASSED THROUGH is as unmapped as one it sits in, and
       `card_events.to_list` is what the model and the span derivation read. */
    const p = await project();
    const stats = await syncProject(
      client(
        [card('a', 'Working on Design')],
        [{ cardId: 'a', fromList: 'Wandered In From Somewhere', toList: 'Working on Design', detectedAt: '2026-08-03T01:00:00.000Z' }],
      ),
      p,
    );
    expect(stats.unmappedLists).toEqual(['Wandered In From Somewhere']);
  });

  it('does NOT record a card that is in no list at all — that is a different fact', async () => {
    const p = await project();
    const stats = await syncProject(
      client([card('a', null), card('b', '')], [{ cardId: 'a', fromList: null, toList: null, detectedAt: '2026-08-03T01:00:00.000Z' }]),
      p,
    );
    expect(stats.unmappedLists).toEqual([]);
  });

  it('warns ONCE per run, naming the project and every name', async () => {
    const p = await project();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await syncProject(client([card('a', 'For Archive'), card('b', 'NOTE')]), p);
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('list name(s)'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('rt-837');
      expect(lines[0]).toContain('For Archive');
      expect(lines[0]).toContain('NOTE');
    } finally {
      warn.mockRestore();
    }
  });

  it('says nothing at all when there is nothing to say', async () => {
    const p = await project();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await syncProject(client([card('a', 'Working on Design')]), p);
      expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('list name(s)'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});

/**
 * The lane reconcile check (block 8, item 11). Same rule as above — an unmapped
 * lane is SURFACED, never guessed at — asked of the board's lane table instead
 * of its cards, which is the only way to answer it BEFORE a card lands in an
 * unruled lane and gets the `ongoing` fallback.
 */
describe('sync_runs.stats.unknownLanes', () => {
  const table = (names: string[], syncedAt: string | null = '2026-09-10T02:00:00.000Z') =>
    async () => ({ lanes: names.map((n) => lane(n)), syncedAt });

  it('records the lane no rule recognises, and leaves the ruled ones alone', async () => {
    const p = await project();
    const stats = await syncProject(
      client(
        [card('a', 'Working on Design')],
        [],
        /* two the §7a enumeration settles — one by the table, one by the
           Backlog rule, so the check is proved to consult BOTH tiers of
           `isKnownList` and not just the literal name list. */
        table(['Working on Design', 'Backlog: Icons', 'For Archive']),
      ),
      p,
    );
    expect(stats.unknownLanes).toEqual(['For Archive']);
  });

  it('surfaces a lane NO CARD sits in — the whole reason the table is read', async () => {
    const p = await project();
    const stats = await syncProject(
      client([card('a', 'Working on Design')], [], table(['Working on Design', 'NOTE'])),
      p,
    );
    // The two arrays answer two different questions and must not be conflated:
    // no card is in `NOTE`, so the card-level check has nothing to say about it
    // and would stay silent until the first card arrived.
    expect(stats.unknownLanes).toEqual(['NOTE']);
    expect(stats.unmappedLists).toEqual([]);
  });

  it('deduplicates within a run and does not accumulate across runs', async () => {
    const p = await project();
    const lanes = table(['For Archive', 'NOTE', 'For Archive']);
    const first = await syncProject(client([card('a', 'Working on Design')], [], lanes), p);
    expect(first.unknownLanes).toEqual(['For Archive', 'NOTE']);
    // A second run over the same board reports the same two, never four: the
    // collector is per run, and the stats row is a snapshot, not a ledger.
    const second = await syncProject(client([card('a', 'Working on Design')], [], lanes), p);
    expect(second.unknownLanes).toEqual(first.unknownLanes);
  });

  it('records the lane table’s own syncedAt, per board id', async () => {
    const p = await project();
    const stats = await syncProject(client([card('a', 'Working on Design')], [], table(['NOTE'])), p);
    expect(stats.lanesSyncedAt).toEqual({ fxA: '2026-09-10T02:00:00.000Z' });
  });

  it('a table ARES has never synced records null, and the check still runs', async () => {
    const p = await project();
    // syncedAt null is ARES's documented "never synced" — the lanes it sends
    // are still lanes, so the names are still checked.
    const stats = await syncProject(client([card('a', 'Working on Design')], [], table(['NOTE'], null)), p);
    expect(stats.lanesSyncedAt).toEqual({ fxA: null });
    expect(stats.unknownLanes).toEqual(['NOTE']);
  });

  it('a null lane table records null and the sync SUCCEEDS', async () => {
    const p = await project();
    const stats = await syncProject(client([card('a', 'Working on Design')], [], async () => null), p);
    expect(stats.lanesSyncedAt).toEqual({ fxA: null });
    expect(stats.unknownLanes).toEqual([]);
    // the rest of the run is untouched — the check is a report, not a gate
    expect(stats.cards).toBe(1);
    expect(stats.deliverables).toBe(1);
  });

  it('a lane table that THROWS does not fail the sync either', async () => {
    /* The frozen contract says `boardLanes` never throws, but "never throws" is
       another module's promise, and every other suite's stub client has no
       `boardLanes` at all — calling one is a TypeError. Either way the board's
       whole dataset must still sync. */
    const p = await project();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const stats = await syncProject(
        client([card('a', 'Working on Design')], [], async () => {
          throw new Error('Ares HTTP 500');
        }),
        p,
      );
      expect(stats.lanesSyncedAt).toEqual({ fxA: null });
      expect(stats.deliverables).toBe(1);
      // failed loudly, not silently: an empty unknownLanes must never be read
      // as "every lane is ruled" when nothing was actually read.
      expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('lane table'))).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns ONCE per run about lanes, apart from the list line', async () => {
    const p = await project();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await syncProject(client([card('a', 'NOTE')], [], table(['For Archive', 'On Hold: Ryse, NBG'])), p);
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('lane name(s)'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('rt-837');
      expect(lines[0]).toContain('For Archive');
      expect(lines[0]).toContain('On Hold: Ryse, NBG');
      // the card-level line is still its own line, about its own name
      const listLines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('list name(s)'));
      expect(listLines).toHaveLength(1);
      expect(listLines[0]).toContain('NOTE');
    } finally {
      warn.mockRestore();
    }
  });

  it('says nothing when every lane on the board is ruled', async () => {
    const p = await project();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await syncProject(client([card('a', 'Working on Design')], [], table(['Working on Design'])), p);
      expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('lane name(s)'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('lands on the sync_runs document whole — no key lost to the Mixed schema', async () => {
    const p = await project();
    const stats = await syncProject(
      client([card('a', 'Working on Design')], [], table(['For Archive'])),
      p,
    );
    // exactly what runAresSync persists for a good run
    await SyncRun.create({ project_id: p._id, source: 'ares', ok: true, stats });
    const row = await SyncRun.findOne({ project_id: p._id, source: 'ares' }).lean<{ stats: SyncStats }>();
    expect(row?.stats.unknownLanes).toEqual(['For Archive']);
    expect(row?.stats.lanesSyncedAt).toEqual({ fxA: '2026-09-10T02:00:00.000Z' });
    // and the row is the WHOLE stats object, not a curated subset — a new
    // counter must never be dropped between the return and the record.
    expect(Object.keys(row?.stats ?? {}).sort()).toEqual(Object.keys(stats).sort());
  });
});
