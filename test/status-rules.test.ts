/**
 * T031 — BR-10 list → state classification, rebuilt 2026-09-08 on build-spec
 * v1.3 §7a / owl miles→jp #82.
 *
 * THE GOLDEN-PARITY CHECK IS GONE. This suite used to assert
 * `classifyList(l) === O.ka(l)` against the verbatim prototype regex in
 * `test/golden/original.mjs`. That regex IS the keyword classifier §7a orders
 * retired — it got 9 of 20 real list names wrong — so a parity test against it
 * now defends the defect. Retired, not skipped: a skipped test is a promise to
 * come back, and there is nothing to come back to. `original.mjs` itself is
 * untouched and still proves the forecast/planner/calendar port (invariant 5);
 * only this one assertion against its `ka` export is withdrawn.
 * [2026-09-08, block 6, PLAN.md §L item 4]
 *
 * WHAT THIS SUITE DEFENDS, in the order the classifier resolves:
 *   1. the exact table, name by name for every Pending / Done / Excluded row
 *   2. the Ready-for rule, with a near-miss that must NOT take it
 *   3. the family-stage rule, likewise
 *   4. the Backlog rule, likewise
 *   5. normalisation (arrow glyph, case, whitespace)
 *   6. an unknown name → `ongoing` AND `isKnownList() === false`
 *
 * Names are asserted INDIVIDUALLY rather than looped off `LIST_STATES`. A loop
 * over the shipped table would pass whatever the table says, including a typo
 * or a deletion — it would test that a Map works. These literals are the
 * ruling; the table is the implementation.
 */

import { describe, expect, it } from 'vitest';
import { LIST_STATES, classifyList, isKnownList, normalizeListName } from '../src/services/status-rules.ts';

/* ------------------------------------------------------------------ */
/* 1 — the exact table: Pending, Done, Excluded, name by name          */
/* ------------------------------------------------------------------ */

/**
 * Pending is the Backlog lists and NOTHING else (#82 §3). Fifteen §7a names
 * plus the five the production board actually holds, which the Backlog rule
 * settles and which are in the table verbatim because JP ruled ARES the source
 * of truth for spelling.
 */
const PENDING = [
  'Production Backlog',
  'Content Backlog',
  'Design Backlog',
  'Development Backlog',
  'Backlog: Process Lane',
  'Backlog: Screens',
  'Backlog: Components',
  'Backlog: Normalization',
  'Backlog: Assets',
  'Backlog: Sketch Revisions',
  'Backlog: Render Revisions',
  'Backlog: UI Revisions',
  'Backlog: Icons',
  'Backlog: Motion',
  'Backlog: Bugs and Fixes',
  'Backlog: Export',
  'Backlog: For Cascade',
  'Backlog: For Pushback',
  'Backlog: Migration',
  'Backlog: Pending Art Direction',
];

/**
 * Done comes ONLY from the table. Three of these are why the enumeration
 * exists at all: `Passed QA`, `➜ Development: Pushed to Production` and
 * `➜ Development: Released` are finished work that no keyword rule reaches,
 * and the keyword classifier called all three ongoing.
 */
const DONE = [
  'Content Complete',
  'Design Complete',
  'Passed QA',
  'Development Complete',
  '➜ Content: Done',
  '➜ Screen: Done',
  '➜ Component: Done',
  '➜ Render: Done',
  '➜ Final Animation: Done',
  '➜ UAT: Done',
  '➜ Development: Pushed to Production',
  '➜ Development: Completed',
  '➜ Development: Released',
  '➜ Development: Done',
];

/**
 * Excluded is IDENTITY, not state (§7a). Five ops lists and three with no
 * equivalent status. `Operations Backlog` is genuinely Pending and
 * `Ops Work Complete` is genuinely Done — they are excluded for whose work it
 * is, which is why a `group === 'OPS'` rule would be wrong and why
 * `Production Backlog`, which sits in the same group, is Pending above.
 */
const EXCLUDED = [
  'Operations Backlog',
  'Working on Ops Work',
  'Ready for Ops Review',
  'Reviewing Ops Work',
  'Ops Work Complete',
  '➜ Process Lane',
  'Discarded Work',
  'Unused Work',
];

/** The three enumerated states and their names — the pairing the whole of
 *  section 1 asserts, stated once. */
const TABLE = [
  ['Pending', PENDING, 'pending'],
  ['Done', DONE, 'done'],
  ['Excluded', EXCLUDED, 'excluded'],
] as const;

describe('§7a exact table', () => {
  for (const [label, names, state] of TABLE) {
    for (const name of names) {
      it(`${label}: ${name}`, () => {
        expect(classifyList(name)).toBe(state);
        expect(isKnownList(name)).toBe(true);
      });
    }
  }

  it('holds every Pending, Done and Excluded name and no others', () => {
    const of = (state: string) => LIST_STATES.filter((r) => r.state === state).map((r) => r.name).sort();
    expect(of('pending')).toEqual([...PENDING].sort());
    expect(of('done')).toEqual([...DONE].sort());
    expect(of('excluded')).toEqual([...EXCLUDED].sort());
  });

  it('carries no duplicate name — two rows normalising alike would let load order pick the state', () => {
    const keys = LIST_STATES.map((r) => normalizeListName(r.name));
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('gives every row a group, and no row an empty name', () => {
    expect(LIST_STATES.filter((r) => !r.name.trim() || !r.group.trim())).toEqual([]);
  });

  it('THE TABLE WINS: every row classifies as its own state', () => {
    /* The first step of the resolution order, stated over all 147 rows.
       HONEST NOTE (2026-09-08): today this cannot fail by reordering alone —
       no row in the table disagrees with the rule that would otherwise claim
       it, so exact-first and rule-first give the same answers everywhere.
       It becomes load-bearing the moment a row IS added that a rule would read
       differently, which is exactly when the mistake would otherwise ship. */
    expect(LIST_STATES.filter((r) => classifyList(r.name) !== r.state)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 2 — Ready-for rule: ALWAYS ongoing, and it is anchored on the arrow */
/* ------------------------------------------------------------------ */

describe('rule 2 — `➜ Ready for …` is always Ongoing (#82 §3)', () => {
  /* Real names off the production board, including the two whose families
     §7a never documents. */
  for (const name of [
    '➜ Ready for Screen Design',
    '➜ Ready for Sketch',
    '➜ Ready for Render',
    '➜ Ready for Final Animation',
    '➜ Ready for Generation',
    '➜ Ready for Refinement',
  ]) {
    it(`${name} → ongoing, known`, () => {
      expect(classifyList(name)).toBe('ongoing');
      expect(isKnownList(name)).toBe(true);
    });
  }

  it('reaches a Ready-for list nobody has seen yet', () => {
    expect(classifyList('➜ Ready for Storyboard')).toBe('ongoing');
    expect(isKnownList('➜ Ready for Storyboard')).toBe(true);
  });

  it('NEAR MISS: `Ready for Ops Review` carries no arrow and stays EXCLUDED', () => {
    // the exact table answers first, and the rule must not claim it either
    expect(classifyList('Ready for Ops Review')).toBe('excluded');
    /* The second half, which the table cannot prove: an arrowless `Ready for`
       name the table does NOT hold must stay UNKNOWN, so it reaches
       `unmappedLists` and someone looks at it. Without these two the arrow
       anchor can be dropped to a bare `\bready for\b` and the suite stays
       green — the rule would then silently claim every ops sign-off lane as a
       recognised pipeline lane. */
    expect(isKnownList('Ready for Ops Sign-off')).toBe(false);
    expect(isKnownList('Ready for Archive')).toBe(false);
  });

  it('NEAR MISS: `➜ Development: Ready for Release` is Done-adjacent, not a Ready-for list', () => {
    // "ready for" is not at the front, so rule 2 cannot fire; the table says ongoing,
    // and its past-tense sibling below is the trap §7a warns about
    expect(classifyList('➜ Development: Ready for Release')).toBe('ongoing');
    expect(classifyList('➜ Development: Released')).toBe('done');
  });
});

/* ------------------------------------------------------------------ */
/* 3 — family-stage rule                                               */
/* ------------------------------------------------------------------ */

describe('rule 3 — `➜ Family: <review stage>` is Ongoing for ANY family', () => {
  /* One real name per family actually on the board, §7a's six plus the two it
     never mentions (398 cards across `➜ Generation:` and `➜ Refinement:`). */
  for (const name of [
    '➜ Screen: Working on it',
    '➜ Sketch: Sent for Client Review',
    '➜ Render: Working on Revision',
    '➜ Final Animation: With Revision',
    '➜ Rough Animation: Ready for Client Approval',
    '➜ Generation: Working on it',
    '➜ Refinement: Working on it',
  ]) {
    it(`${name} → ongoing, known`, () => {
      expect(classifyList(name)).toBe('ongoing');
      expect(isKnownList(name)).toBe(true);
    });
  }

  it('reaches a family the table has never held', () => {
    expect(classifyList('➜ Storyboard: Sent for Client Approval')).toBe('ongoing');
    expect(isKnownList('➜ Storyboard: Sent for Client Approval')).toBe(true);
  });

  it('NEAR MISS: `➜ Screen: Done` is Done — no rule may produce Done', () => {
    expect(classifyList('➜ Screen: Done')).toBe('done');
  });

  it('NEAR MISS: a stage outside the closed list is not recognised at all', () => {
    // same shape, unknown stage: ongoing as a FALLBACK, and isKnownList says so
    expect(classifyList('➜ Screen: Waiting on the client')).toBe('ongoing');
    expect(isKnownList('➜ Screen: Waiting on the client')).toBe(false);
  });

  it('NEAR MISS: the stage must end the name — a suffix does not match', () => {
    expect(isKnownList('➜ Screen: Working on it again')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 4 — Backlog rule                                                    */
/* ------------------------------------------------------------------ */

describe('rule 4 — `Backlog…` is Pending, anchored at the start', () => {
  it('reaches a Backlog sub-list the table has never held', () => {
    expect(classifyList('Backlog: Storyboards')).toBe('pending');
    expect(isKnownList('Backlog: Storyboards')).toBe(true);
  });

  it('NEAR MISS: `Operations Backlog` ENDS with the word and is EXCLUDED', () => {
    /* The retired classifier tested `\bbacklog\b` anywhere in the string and
       called this Pending — surfacing ops work as pipeline work. */
    expect(classifyList('Operations Backlog')).toBe('excluded');
    /* …and the half the table cannot prove, because the table answers
       `Operations Backlog` before any rule runs: a name carrying the word
       anywhere but the START, which the table does NOT hold, must stay
       ongoing and UNKNOWN. Restore the unanchored test and this line goes
       pending/known while every table-held name still passes. */
    expect(classifyList('On Hold Backlog')).toBe('ongoing');
    expect(isKnownList('On Hold Backlog')).toBe(false);
  });

  it('NEAR MISS: `Backlogged Work` is not a Backlog list', () => {
    expect(isKnownList('Backlogged Work')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 5 — normalisation                                                   */
/* ------------------------------------------------------------------ */

describe('normalisation (§7a: match on a normalised form or the list never resolves)', () => {
  it('the ASCII arrow is the same list as `➜` — the one real typo §7a names', () => {
    // `-> Render: Sent for Client Approval` is how the production board spells it
    expect(classifyList('-> Render: Sent for Client Approval')).toBe('ongoing');
    expect(isKnownList('-> Render: Sent for Client Approval')).toBe(true);
    expect(normalizeListName('-> Render: Sent for Client Approval')).toBe(
      normalizeListName('➜ Render: Sent for Client Approval'),
    );
  });

  it('the ASCII arrow resolves a table row too, not only a rule', () => {
    expect(classifyList('-> Screen: Done')).toBe('done');
    expect(classifyList('-> Process Lane')).toBe('excluded');
  });

  it('case folds — the board really does spell one list `Sent For` with a capital F', () => {
    expect(classifyList('➜ Rough Animation: Sent For Client Review')).toBe('ongoing');
    expect(classifyList('➜ Rough Animation: Sent for Client Review')).toBe('ongoing');
    expect(isKnownList('➜ Rough Animation: Sent For Client Approval')).toBe(true);
    expect(classifyList('PASSED QA')).toBe('done');
  });

  it('trims the ends and collapses runs of internal whitespace', () => {
    expect(classifyList('  Design Complete  ')).toBe('done');
    expect(classifyList('➜   Screen:   Working on it')).toBe('ongoing');
    expect(classifyList('Ops\tWork  Complete')).toBe('excluded');
  });
});

/* ------------------------------------------------------------------ */
/* 6 — the fallback, and the safety net that reports it                */
/* ------------------------------------------------------------------ */

describe('an unmapped list is SURFACED, never guessed (§7a, said twice)', () => {
  /* The five real names on the production board that §7a settles for none of
     us — deliberately absent from the table, reported to product through
     `sync_runs.stats.unmappedLists`. */
  for (const name of ['For Archive', 'For Client Approval', 'Hard Deadline: Monday Mar. 23', 'NOTE', 'On Hold: Ryse, NBG']) {
    it(`${name}: ongoing as a fallback, and isKnownList() is false`, () => {
      expect(classifyList(name)).toBe('ongoing');
      expect(isKnownList(name)).toBe(false);
    });
  }

  it('an absent or empty list is unknown too, and never claims to be a state', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(classifyList(v)).toBe('ongoing');
      expect(isKnownList(v)).toBe(false);
    }
  });

  it('nothing the table does not name resolves to done or excluded', () => {
    /* The whole point of "no rule may produce Done or Excluded": a new list
       named after a finished-sounding word must not retire live work. */
    for (const v of ['Complete', 'All Done', 'Approved by client', 'Delivered!', 'Shipped', 'Archived', 'Ops']) {
      expect(classifyList(v), v).toBe('ongoing');
      expect(isKnownList(v), v).toBe(false);
    }
  });
});
