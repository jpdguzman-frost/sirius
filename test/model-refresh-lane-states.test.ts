/**
 * §7a consumer guard, model refresh (block 6, 2026-09-08). The cycle-time
 * model must not measure work Sirius does not own: an EXCLUDED list is neither
 * design dwell nor a completion.
 *
 * These are REAL changes of model input, not tidy-ups. Under the retired
 * keyword classifier `Working on Ops Work` matched neither regex, classified
 * ongoing, and its dwell went into the design percentiles; `Ops Work Complete`
 * matched `\bcomplete\b`, classified done, and ended a card in the throughput
 * counts. Both are now excluded by identity.
 *
 * WHAT MAKES THESE FAIL. Not a branch in `model-refresh.ts` — there is none to
 * remove: `deriveSamples` counts `=== 'ongoing'` and `computeThroughput` counts
 * `=== 'done'`, so a fourth state falls out of both by construction. What these
 * pin is the MAPPING: give `Working on Ops Work` the state `'ongoing'` in
 * `LIST_STATES`, or `Ops Work Complete` the state `'done'` — which is exactly
 * what the retired keyword classifier did — and they fail.
 */

import { describe, expect, it } from 'vitest';
import { computeThroughput, deriveSamples } from '../src/services/model-refresh.ts';
import { classifyList } from '../src/services/status-rules.ts';

const at = (h: number) => new Date(Date.UTC(2026, 6, 1, h));
const MEDIUM = [{ trello_card_id: 'c1', difficulty: 'Medium' as const, lane: 'design' as const }];

describe('an excluded list is not design dwell', () => {
  it('the premise: ops lists are excluded, and a design list is not', () => {
    expect(classifyList('Working on Ops Work')).toBe('excluded');
    expect(classifyList('Working on Design')).toBe('ongoing');
  });

  it('dwell in `Working on Ops Work` produces no sample', () => {
    const samples = deriveSamples(
      [
        { trello_card_id: 'c1', to_list: 'Working on Ops Work', occurred_at: at(0) },
        { trello_card_id: 'c1', to_list: 'Design Complete', occurred_at: at(48) },
      ],
      MEDIUM,
    );
    expect(samples).toEqual([]);
  });

  it('the identical shape in an ONGOING list does produce one — so the guard is about the state, not the fixture', () => {
    const samples = deriveSamples(
      [
        { trello_card_id: 'c1', to_list: 'Working on Design', occurred_at: at(0) },
        { trello_card_id: 'c1', to_list: 'Design Complete', occurred_at: at(48) },
      ],
      MEDIUM,
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]!.metric).toBe('design');
    expect(samples[0]!.days).toBe(2);
  });

  it('an excluded list contributes nothing while a real review wait beside it still does', () => {
    /* Two intervals in one card's history: the excluded one must not become a
       sample of either metric, while the genuine client wait beside it is
       measured normally — so the guard is about the state, not about
       `deriveSamples` refusing to sample anything at all. */
    const samples = deriveSamples(
      [
        { trello_card_id: 'c1', to_list: '➜ Process Lane', occurred_at: at(0) },
        { trello_card_id: 'c1', to_list: 'Sent for Client Review', occurred_at: at(24) },
        { trello_card_id: 'c1', to_list: 'Design Complete', occurred_at: at(48) },
      ],
      MEDIUM,
    );
    expect(samples.map((s) => s.metric)).toEqual(['review']); // the real review wait, and nothing from the ops list
  });
});

describe('an excluded list is not a completion', () => {
  it('`Ops Work Complete` no longer ends a card — it used to, on the word `complete`', () => {
    expect(classifyList('Ops Work Complete')).toBe('excluded');
    const rows = computeThroughput(
      [{ trello_card_id: 'c1', to_list: 'Ops Work Complete', occurred_at: new Date('2026-07-06T10:00:00Z') }],
      [{ trello_card_id: 'c1', difficulty: 'Easy', lane: 'design' }],
    );
    expect(rows).toEqual([]);
  });

  it('a real Done list still counts — the same fixture, one name apart', () => {
    const rows = computeThroughput(
      [{ trello_card_id: 'c1', to_list: 'Design Complete', occurred_at: new Date('2026-07-06T10:00:00Z') }],
      [{ trello_card_id: 'c1', difficulty: 'Easy', lane: 'design' }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.weeks).toBe(1);
  });

  it('and the three Done lists no keyword rule reaches count too (§7a’s surviving trap)', () => {
    for (const list of ['Passed QA', '➜ Development: Pushed to Production', '➜ Development: Released']) {
      const rows = computeThroughput(
        [{ trello_card_id: 'c1', to_list: list, occurred_at: new Date('2026-07-06T10:00:00Z') }],
        [{ trello_card_id: 'c1', difficulty: 'Easy', lane: 'design' }],
      );
      expect(rows, list).toHaveLength(1);
    }
  });
});
