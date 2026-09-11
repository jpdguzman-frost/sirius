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
 *
 * The block-8 review round (2026-09-10) added the four things the first pass
 * left un-asserted, each named at its case: the failed read is LOUD and not
 * only when it throws (A4-F1), the rule tier is exercised by names that are
 * NOT table rows (A4-F2), the board id in the request is checked and not just
 * the key it is filed under (A4-F3), the lane count separates "none unknown"
 * from "none looked at" (A4-F6), lane names are pinned verbatim (A4-F7) — and
 * the resync push path is proved to carry the same provenance the scheduled
 * sync does (A4-F5), which is why this file also reaches `worker/drainPush.ts`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { aresCard, label } from './helpers/ares-card.ts';
import { runAresSync, syncProject, type SyncStats } from '../worker/syncAres.ts';
import { drainPushEvents } from '../worker/drainPush.ts';
import { validateEnv } from '../src/config/env.ts';
import type { AresBoardLane, AresCard, AresClient, AresMovement } from '../src/services/ares.ts';
import { Project, PushEvent, SyncRun } from '../src/models/index.ts';

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
 * The lane table defaults to `null` — the contract's "the read failed, however
 * it failed", which this suite pins in `a null lane table…` and `a lane table
 * that THROWS…`: the reconcile check must degrade, never take a sync down, and
 * must say so out loud.
 *
 * `boardLanes` takes the board id it is asked for, deliberately: a stub that
 * ignored its argument let a call for the WRONG board pass every assertion in
 * this file (review A4-F3, 2026-09-10), because `lanesSyncedAt` is keyed by the
 * board id we hold rather than by the one we asked ARES about.
 */
const client = (
  cards: AresCard[],
  movements: AresMovement[] = [],
  boardLanes: (boardId: string) => Promise<LaneTable> = async () => null,
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
    /* Every name below the first is ABSENT from LIST_STATES and resolves only
       through the rule tier of `isKnownList` (review A4-F2, 2026-09-10: the
       names this test used to carry — `➜ Ready for Screen Design`,
       `Backlog: Migration`, `➜ Refinement: Working on it` — are all exact table
       rows, so replacing the whole rule tier with a table lookup left the suite
       green and the tier untested). Invented families and stages on purpose:
       the rule says the STAGE is what puts a card in flight, whichever family
       is running it, and only a family §7a has never heard of proves that. */
    const p = await project();
    const stats = await syncProject(
      client([
        card('a', 'Working on Design'), // exact table
        card('b', '➜ Ready for Anything'), // Ready-for rule — not a table row
        card('c', '➜ Newfamily: Working on it'), // family-stage rule — invented family
        card('d', 'Backlog: Brand New'), // Backlog rule — not a table row
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
  /**
   * `asked` collects the board id every call was made for — the request the
   * stub used to throw away (review A4-F3).
   */
  const table = (
    names: string[],
    syncedAt: string | null = '2026-09-10T02:00:00.000Z',
    asked?: string[],
  ) =>
    async (boardId: string) => {
      asked?.push(boardId);
      return { lanes: names.map((n) => lane(n)), syncedAt };
    };

  it('records the lane no rule recognises, and leaves the ruled ones alone', async () => {
    const p = await project();
    const stats = await syncProject(
      client(
        [card('a', 'Working on Design')],
        [],
        /* Three the §7a enumeration settles — one by the table and two only by
           the rule tier, so the check is proved to consult BOTH tiers of
           `isKnownList`. `Backlog: Brand New` and `➜ Ready for Anything` are
           absent from LIST_STATES on purpose (review A4-F2): the names this
           case used to carry were exact rows, so a table-only lookup passed. */
        table(['Working on Design', 'Backlog: Brand New', '➜ Ready for Anything', 'For Archive']),
      ),
      p,
    );
    expect(stats.unknownLanes).toEqual(['For Archive']);
  });

  it('consults the family-stage rule for lane names too, not only the table', async () => {
    /* The third tier, on its own case so a partial regression is legible: an
       invented family at a known stage is RULED, the same family at a stage
       §7a does not list is not. */
    const p = await project();
    const stats = await syncProject(
      client(
        [card('a', 'Working on Design')],
        [],
        table(['➜ Newfamily: Working on it', '➜ Newfamily: Having a Think']),
      ),
      p,
    );
    expect(stats.unknownLanes).toEqual(['➜ Newfamily: Having a Think']);
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

  it('records the lane table’s own syncedAt, per board id — for the board it ASKED about', async () => {
    const p = await project();
    /* The recorded KEY is the board id we already hold, so it proves nothing
       about the request: reading another board's lane table and filing it under
       this one passed every assertion in this file until the stub started
       keeping its argument (review A4-F3). */
    const asked: string[] = [];
    const stats = await syncProject(
      client([card('a', 'Working on Design')], [], table(['NOTE'], '2026-09-10T02:00:00.000Z', asked)),
      p,
    );
    expect(stats.lanesSyncedAt).toEqual({ fxA: '2026-09-10T02:00:00.000Z' });
    expect(asked).toEqual([p.trello_board_id]);
  });

  it('records the lane names verbatim — the board’s spelling, not a normalised one', async () => {
    /* The twin of the list-name case above. Normalisation is for MATCHING; a
       report that tidied `  For   Archive  ` into `For Archive` would hide the
       stray whitespace that is the very defect worth surfacing, and until this
       case existed a collapsing edit passed the whole suite (review A4-F7). */
    const p = await project();
    const stats = await syncProject(
      client([card('a', 'Working on Design')], [], table(['  For   Archive  '])),
      p,
    );
    expect(stats.unknownLanes).toEqual(['  For   Archive  ']);
  });

  it('records how many lanes it saw — “none unknown” is not “none looked at”', async () => {
    const p = await project();
    const stats = await syncProject(
      client([card('a', 'Working on Design')], [], table(['Working on Design', 'For Archive', 'NOTE'])),
      p,
    );
    expect(stats.lanesSeen).toEqual({ fxA: 3 });
    expect(stats.unknownLanes).toEqual(['For Archive', 'NOTE']);
  });

  it('an EMPTY table counts 0, a table that could not be read counts null', async () => {
    /* The two rows `unknownLanes: []` + a stamped `lanesSyncedAt` cannot tell
       apart (review A4-F6): a board whose every lane is ruled, and a board that
       answered with no lanes at all. The count is the only thing between them,
       and `null` keeps the failed read distinct from both. */
    const p = await project();
    const empty = await syncProject(
      client([card('a', 'Working on Design')], [], table([], '2026-09-10T02:00:00.000Z')),
      p,
    );
    expect(empty.lanesSeen).toEqual({ fxA: 0 });
    expect(empty.lanesSyncedAt).toEqual({ fxA: '2026-09-10T02:00:00.000Z' });
    expect(empty.unknownLanes).toEqual([]);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const none = await syncProject(client([card('a', 'Working on Design')], [], async () => null), p);
      expect(none.lanesSeen).toEqual({ fxA: null });
      expect(none.unknownLanes).toEqual([]);
    } finally {
      warn.mockRestore();
    }
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const stats = await syncProject(client([card('a', 'Working on Design')], [], async () => null), p);
      expect(stats.lanesSyncedAt).toEqual({ fxA: null });
      expect(stats.unknownLanes).toEqual([]);
      // the rest of the run is untouched — the check is a report, not a gate
      expect(stats.cards).toBe(1);
      expect(stats.deliverables).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('a lane table it could not read is LOUD — the plain null, not only the throw', async () => {
    /* `boardLanes` answers `null` for 404, 500, network trouble and Zod drift
       alike and throws for none of them, so a warn that lived only in the catch
       covered the one path the contract forbids and stayed silent on every path
       it actually produces (review A4-F1). The whole check could stop working
       and the only trace would be a `null` in a Mixed field nothing reads. */
    const p = await project();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await syncProject(client([card('a', 'Working on Design')], [], async () => null), p);
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('lane table'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('fxA'); // the BOARD, which is what a reader has to go look at
      expect(lines[0]).toContain('rt-837');
      expect(lines[0]).toContain('no lane check this run');
    } finally {
      warn.mockRestore();
    }
  });

  it('says nothing about the lane table when it read one', async () => {
    /* The non-vacuity twin of the case above: the warn must be about failure,
       not about lanes existing, or it is one more line every healthy run. */
    const p = await project();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await syncProject(client([card('a', 'Working on Design')], [], table(['Working on Design'])), p);
      expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('lane table'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
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
      expect(stats.lanesSeen).toEqual({ fxA: null });
      expect(stats.deliverables).toBe(1);
      // failed loudly, not silently: an empty unknownLanes must never be read
      // as "every lane is ruled" when nothing was actually read. ONE line, the
      // same one the plain-null path prints, and it carries the reason.
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('lane table'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Ares HTTP 500');
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
    /* Through the REAL persistence path (X10, 2026-09-11): `runAresSync` with
       the fixture client injected, so the row asserted is the one the worker
       writes — `Project.find({status:'ongoing'})` picking the fixture up, the
       board guard, `lastGoodRun`, the create — not a hand copy of its one
       line. The env has no ARES_URL on purpose: the override must be what is
       used, or `makeClient` throws and the case is red. */
    const p = await project();
    const stub = client([card('a', 'Working on Design')], [], table(['For Archive']));
    await runAresSync(validateEnv({ NODE_ENV: 'test' }), undefined, stub);
    const row = await SyncRun.findOne({ project_id: p._id, source: 'ares' }).lean<{ ok: boolean; stats: SyncStats }>();
    expect(row?.ok).toBe(true);
    expect(row?.stats.unknownLanes).toEqual(['For Archive']);
    expect(row?.stats.lanesSyncedAt).toEqual({ fxA: '2026-09-10T02:00:00.000Z' });
    expect(row?.stats.lanesSeen).toEqual({ fxA: 1 });
    // and the row is the WHOLE stats object, not a curated subset — a new
    // counter must never be dropped between the return and the record. The
    // reference key set is what the sync itself returns for the same board.
    const reference = await syncProject(stub, p);
    expect(Object.keys(row?.stats ?? {}).sort()).toEqual(Object.keys(reference).sort());
    expect(await SyncRun.countDocuments({ source: 'ares' })).toBe(1);
  });
});

/**
 * The OTHER writer of a full sync's stats (review A4-F5, 2026-09-10). FR-9.6
 * relaxes the scheduled full sync to hourly while push is healthy, which makes
 * a `board.resync` push the primary path a whole board gets re-read on — and
 * that path built its sync_runs row out of its own counters, dropping every
 * §7a array the sync it just ran had produced. `resync: 1` and nothing else
 * reads as "checked, clean".
 */
describe('a resync push records the full sync’s §7a provenance too', () => {
  const env = validateEnv({
    NODE_ENV: 'test',
    ARES_WEBHOOK_SECRET: 's3cret',
    ARES_URL: 'http://ares.test',
    ARES_API_KEY: 'k',
  });

  it('carries unmappedLists, unknownLanes, lanesSyncedAt and lanesSeen onto the ares_push row', async () => {
    const p = await project();
    await PushEvent.create({
      project_id: p._id,
      event_id: 'evt-resync-lanes',
      type: 'board.resync',
      board_id: 'fxA',
      card_id: null,
      occurred_at: new Date(),
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await drainPushEvents(
        env,
        client([card('a', 'For Archive')], [], async () => ({
          lanes: [lane('NOTE')],
          syncedAt: '2026-09-10T02:00:00.000Z',
        })),
      );
    } finally {
      warn.mockRestore();
    }

    const run = await SyncRun.findOne({ project_id: p._id, source: 'ares_push', ok: true })
      .lean<{ stats: Record<string, unknown> }>();
    expect(run?.stats).toMatchObject({
      resync: 1,
      // the card-level half, pre-existing and just as absent before this
      unmappedLists: ['For Archive'],
      // and the board-level half, which is the whole point of reading the table
      unknownLanes: ['NOTE'],
      lanesSyncedAt: { fxA: '2026-09-10T02:00:00.000Z' },
      lanesSeen: { fxA: 1 },
    });
  });
});
