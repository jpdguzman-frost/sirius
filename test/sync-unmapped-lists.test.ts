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
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { aresCard, label } from './helpers/ares-card.ts';
import { syncProject } from '../worker/syncAres.ts';
import type { AresCard, AresClient, AresMovement } from '../src/services/ares.ts';
import { Project } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

const client = (cards: AresCard[], movements: AresMovement[] = []) =>
  ({
    boardCards: async () => cards,
    boardMovements: async () => movements,
    referenceWeeks: async () => ({ least: 1, typical: 116, most: 367, effectiveWeeklyRate: 89.2 }),
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
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('does not recognise'));
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
      expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('does not recognise'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});
