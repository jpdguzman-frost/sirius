/**
 * T028 — taxonomy mapper (invariants 3, 4; FR-1.3; AC-5; BRD §5).
 */

import { describe, expect, it } from 'vitest';
import { assignDisplayIds, mapTrello, mcNumberOf } from '../src/services/mapper.ts';
import type { AresCard } from '../src/services/ares.ts';
import { aresCard } from './helpers/ares-card.ts';

/* Built on the shared factory, so the contract fields — notably
   `lastPolledAt`, which the reconcile guard compares against — come from one
   definition. This suite kept its own inline builder through the 2026-08-25
   consolidation and was the one place it mattered most: it owns mapping, so a
   card here that never carries the field means the mapped `trello_polled_at`
   is only ever exercised on its null path (review). */
let n = 0;
function card(name: string, labels: string[], over: Partial<AresCard> = {}): AresCard {
  n++;
  return aresCard({
    cardId: over.cardId ?? `card${String(n).padStart(3, '0')}`,
    name,
    labels: labels.map((l, i) => ({ id: `l${i}`, name: l })),
    ...over,
  });
}

describe('taxonomy (BRD §5)', () => {
  it('Main Card label → deliverable; verb-prefix titles → work cards on the MC group', () => {
    const r = mapTrello(
      [
        card('MC-655 / Main Card: Landing hero', ['Main Card', 'Difficulty: Medium']),
        card('Render Asset: MC-655 hero exports', ['Difficulty: Easy']),
        card('Icon Clean Up: MC-655 glyphs', []),
      ],
      null,
    );
    expect(r.deliverables.length).toBe(1);
    expect(r.workCards.length).toBe(2);
    expect(r.workCards.map((w) => w.mc_number)).toEqual(['MC-655', 'MC-655']);
    expect(r.workCards[0]?.task_prefix).toBe('Render Asset');
    expect(r.deliverables[0]?.difficulty).toBe('Medium');
  });

  it('a task with no MC number attaches to nothing — reported, not guessed (invariant 4)', () => {
    const r = mapTrello([card('Board cleanup chores', [])], null);
    expect(r.workCards.length).toBe(0);
    expect(r.unlinked.length).toBe(1);
    expect(r.unlinked[0]?.isMainCard).toBe(false);
  });

  it('AC-5: with a project label set, only labelled cards appear', () => {
    const r = mapTrello(
      [
        card('MC-1 / Main Card: Acme thing', ['Main Card', 'Acme']),
        card('MC-2 / Main Card: Other project', ['Main Card', 'Jollibee']),
        card('Render Asset: MC-1 exports', ['Acme']),
      ],
      'Acme',
    );
    expect(r.deliverables.map((d) => d.mc_number)).toEqual(['MC-1']);
    expect(r.workCards.map((w) => w.mc_number)).toEqual(['MC-1']);
  });

  it('extracts blockers from 🛑 labels, figma from the description, due as a date-only string', () => {
    const r = mapTrello(
      [
        card('MC-9 / Main Card: Blocked thing', ['Main Card', '🛑 On hold'], {
          description: '👉 [Figma link](https://www.figma.com/file/Abc123?node-id=1)',
          due: '2026-08-21T09:00:00.000Z',
        }),
      ],
      null,
    );
    const d = r.deliverables[0]!;
    expect(d.blocker).toBe('On hold');
    expect(d.figma_url).toMatch(/^https:\/\/www\.figma\.com\/file\/Abc123/);
    expect(d.trello_due).toBe('2026-08-21');
  });

  it('slices the due to the MANILA day, not the UTC day (2026-08-18 review — both W2 halves)', () => {
    // 16:30Z = 00:30 the NEXT day in Manila: the UTC slice stored it a day
    // early beside the manilaDate()-true Started/Done on the same row
    const r = mapTrello(
      [
        card('MC-4 / Main Card: Early-morning due', ['Main Card'], { due: '2026-08-21T16:30:00.000Z' }),
        card('Render Asset: MC-4 exports', [], { due: '2026-08-21T16:30:00.000Z', cardId: 'wc-tz' }),
      ],
      null,
    );
    expect(r.deliverables[0]?.trello_due).toBe('2026-08-22');
    expect(r.workCards[0]?.trello_due).toBe('2026-08-22');
    // and a garbage instant degrades to no-due instead of poisoning the sync
    const bad = mapTrello([card('Render Asset: MC-5 exports', [], { due: 'not-a-date' })], null);
    expect(bad.workCards[0]?.trello_due).toBeNull();
  });

  it('carries a WORK card due as the same date-only + instant pair (owl #45, W2 task-card scope)', () => {
    const r = mapTrello(
      [card('Render Asset: MC-2 exports', [], { due: '2026-08-21T09:00:00.000Z' })],
      null,
    );
    const w = r.workCards[0]!;
    expect(w.trello_due).toBe('2026-08-21');
    expect(w.trello_due_at).toBe('2026-08-21T09:00:00.000Z');
    // and absent stays absent, not an invented default
    const none = mapTrello([card('Render Asset: MC-3 exports', [])], null);
    expect(none.workCards[0]?.trello_due).toBeNull();
    expect(none.workCards[0]?.trello_due_at).toBeNull();
  });

  it('mcNumberOf tolerates MC-57, MC 57 and mc-57 forms', () => {
    expect(mcNumberOf('MC-57 / thing')).toBe('MC-57');
    expect(mcNumberOf('MC 57 thing')).toBe('MC-57');
    expect(mcNumberOf('mc-57 thing')).toBe('MC-57');
    expect(mcNumberOf('no number here')).toBeNull();
  });
});

describe('display ids (invariant 3)', () => {
  it('a lone deliverable gets the bare MC number; groups get stable .n suffixes', () => {
    const solo = mapTrello([card('MC-701 / Main Card: Icon set', ['Main Card'])], null);
    const ids1 = assignDisplayIds(new Map(), solo.deliverables);
    expect([...ids1.values()]).toEqual(['MC-701']);

    const group = mapTrello(
      [
        card('MC-825 / Main Card: One', ['Main Card'], { cardId: 'a1' }),
        card('MC-825 / Main Card: Two', ['Main Card'], { cardId: 'a2' }),
        card('MC-825 / Main Card: Three', ['Main Card'], { cardId: 'a3' }),
      ],
      null,
    );
    const ids2 = assignDisplayIds(new Map(), group.deliverables);
    expect([...ids2.values()].sort()).toEqual(['MC-825.1', 'MC-825.2', 'MC-825.3']);
  });

  it('NEVER reshuffles existing assignments when the group grows', () => {
    const existing = new Map([
      ['a1', 'MC-825.1'],
      ['a2', 'MC-825.2'],
    ]);
    const grown = mapTrello(
      [
        card('MC-825 / Main Card: One', ['Main Card'], { cardId: 'a1' }),
        card('MC-825 / Main Card: Two', ['Main Card'], { cardId: 'a2' }),
        card('MC-825 / Main Card: New arrival', ['Main Card'], { cardId: 'a9' }),
      ],
      null,
    );
    const ids = assignDisplayIds(existing, grown.deliverables);
    expect(ids.get('a1')).toBe('MC-825.1');
    expect(ids.get('a2')).toBe('MC-825.2');
    expect(ids.get('a9')).toBe('MC-825.3');
  });
});

describe('the payload-fetch instant the reconcile guard reads', () => {
  /* `trello_polled_at` is not a display field — it is the clock `staleGuard`
     compares a Sirius registry write against, so the mapper reading the wrong
     source field would silently disarm the guard. It had no assertion in the
     suite that owns mapping (review, 2026-08-25); the DB-backed suites covered
     it only indirectly. */
  it('carries ARES lastPolledAt onto BOTH mapped kinds', () => {
    const r = mapTrello(
      [
        card('MC-1 Hero', ['Main Card'], { lastPolledAt: '2026-08-20T01:02:03.000Z' }),
        card('Render Asset: MC-1 exports', [], { lastPolledAt: '2026-08-20T01:02:03.000Z' }),
      ],
      null,
    );
    expect(r.deliverables[0]!.trello_polled_at).toBe('2026-08-20T01:02:03.000Z');
    expect(r.workCards[0]!.trello_polled_at).toBe('2026-08-20T01:02:03.000Z');
  });

  it('maps an absent instant to null rather than inventing one', () => {
    const r = mapTrello([card('MC-2 Hero', ['Main Card'], { lastPolledAt: undefined })], null);
    expect(r.deliverables[0]!.trello_polled_at).toBeNull();
  });
});
