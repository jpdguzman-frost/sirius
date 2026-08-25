/**
 * The ARES card shape, for suites that map or reconcile it.
 *
 * Its own module, NOT `fixtures.ts` (review, 2026-08-25): that one imports
 * `createApp`, supertest and the whole route/passport graph for the HTTP
 * suites, and the three worker suites using this factory touch no HTTP. Paying
 * that import on every run of them is wasted work at best, and `test/CLAUDE.md`
 * rule 5 records a same-day flake of many files timing out at `startTestDb()`.
 * A pure factory needs two types and nothing else.
 */

import type { AresCard, AresLabel } from '../../src/services/ares.ts';


/**
 * A label as ARES sends it. Was hand-copied byte-for-byte in two suites.
 */
export const label = (name: string): AresLabel => ({ id: `l-${name}`, name });

/**
 * An ARES card carrying everything the CONTRACT guarantees, ready to override.
 *
 * Added 2026-08-25, and the change that prompted it is the argument for it:
 * adding one field (`lastPolledAt`) to the ARES card shape took four edits
 * across three suites, each carrying its own wording of the same explanation.
 * The next contract field would have repeated that, and the three rationales
 * would have drifted apart while nothing kept them honest.
 *
 * `lastPolledAt` is the instant ARES fetched the card from Trello, and the
 * reconcile guard in `worker/syncAres.ts` compares every registry write
 * against it. **Every real ARES card carries one** — it is stamped by both of
 * ARES's writers through one shared `buildCardDoc` (contracts/ares-read.md
 * §Freshness). A fixture WITHOUT it therefore exercises the skip path, not the
 * reconcile: pass `{ lastPolledAt: undefined }` when that is what you mean,
 * and `test/reconcile.test.ts` owns those cases.
 *
 * Defaults are deliberately neutral. A suite with its own card identity layers
 * over them (`const card = (o) => aresCard({ cardId: 'c1', ...o })`) rather
 * than restating the contract fields.
 */
export function aresCard(over: Partial<AresCard> = {}): AresCard {
  return {
    cardId: 'c1',
    boardId: 'b1',
    name: 'MC-1 A card',
    currentList: 'Design',
    labels: [label('Main Card')],
    due: null,
    lastPolledAt: '2026-08-18T12:00:00.000Z',
    ...over,
  } as AresCard;
}
