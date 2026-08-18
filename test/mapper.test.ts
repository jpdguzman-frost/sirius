/**
 * T028 — taxonomy mapper (invariants 3, 4; FR-1.3; AC-5; BRD §5).
 */

import { describe, expect, it } from 'vitest';
import { assignDisplayIds, mapTrello, mcNumberOf } from '../src/services/mapper.ts';
import type { AresCard } from '../src/services/ares.ts';

let n = 0;
function card(name: string, labels: string[], over: Partial<AresCard> = {}): AresCard {
  n++;
  return {
    cardId: over.cardId ?? `card${String(n).padStart(3, '0')}`,
    boardId: 'b1',
    name,
    currentList: 'Design',
    labels: labels.map((l, i) => ({ id: `l${i}`, name: l })),
    due: null,
    ...over,
  };
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
