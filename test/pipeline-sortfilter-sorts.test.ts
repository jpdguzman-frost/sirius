/**
 * Pipeline SORTS — the sort set, empty-sorts-last, the work-card keys and
 * tiebreak (PLAN B5/B7), the default order, and the MC-number sort.
 * Split 2026-09-05 out of test/pipeline-sortfilter.test.ts (sections A, B,
 * B2, C, and the MC-number sort that sat under E); the shared prelude —
 * recipe harness and row/work-card fixtures — is
 * test/helpers/pipeline-sortfilter.ts.
 */

import { describe, expect, it } from 'vitest';
import { APP_JS_CODE, decl } from './helpers/gantt-render.ts';
import { ids, recipe, row, sel, sortBy, wc } from './helpers/pipeline-sortfilter.ts';

/* ---------------------------------------------------------------------- */
/* A — the sorts are the frame's, in the frame's order                      */
/* ---------------------------------------------------------------------- */

describe('the sort set matches the frame exactly', () => {
  it('carries the ten items in three groups, in the frame’s order and words', () => {
    /* AMENDED 2026-09-05, block 4 (owl #78 §5, frame 841:58731). Block 1 had
       parked the Priority pair and pinned six; the parked coverage is back and
       the set is the frame's TEN — the Priority group between Dates and
       Identity, Identity in BOTH directions, and the labels as the frame's
       nodes spell them ('Deadline …', 'MC Number: …', 'Deliverable Name: …').
       The strings are pinned because the frame ruled them and Requests will
       copy them (S12); the ORDER is pinned because the panel derives its
       groups from this array's order and nothing else. */
    expect(recipe.PIPE_SORTS.map((s) => `${s.group}: ${s.label}`)).toEqual([
      'Dates: Deadline closest to now',
      'Dates: Deadline farthest from now',
      'Dates: Recently started',
      'Dates: Recently completed',
      'Priority: Urgent first',
      'Priority: Hardest first',
      'Identity: MC Number: Low to High',
      'Identity: MC Number: High to Low',
      'Identity: Deliverable Name: A–Z',
      'Identity: Deliverable Name: Z–A',
    ]);
  });

  it('marks EXACTLY the work-card-derived sorts `derived` — the flag the auto-open reads', () => {
    /* The Deadline pair and the Priority pair rank a group by its CHILDREN,
       so the table opens every reordered group (S6, PLAN B-decisions) or the
       order is illegible. `derived` is how `pipeAutoOpen` knows which sorts
       those are; a fifth sort flagged, or one of these four unflagged, is a
       table that opens for no visible reason or stays shut over an order the
       reader cannot check. Named by key rather than counted. */
    const derived = recipe.PIPE_SORTS.filter((s) => s.derived === true).map((s) => s.key);
    expect(derived).toEqual(['due-near', 'due-far', 'urgent', 'hardest']);
  });

  it('ranks WORK cards Urgent first, with the group auto-expanded (block 4, #78 §5)', () => {
    /* LIVE again. Any Urgent child ranks the group 1; a group whose children
       are ALL Non-Urgent ranks 0 — a VALUE, not an absence — and only a group
       with no matching child at all is keyless (B6). The auto-open half of the
       promise is the `derived` flag pinned above; the computed that acts on it
       is executed in test/pipeline-expanded-groups.test.ts. */
    const rows = [
      row({ cardId: 'quiet', mcNumber: 'MC-2', work: [wc(), wc({ cardId: 'w2' })] }),
      row({ cardId: 'none', mcNumber: 'MC-1' }),
      row({ cardId: 'mixed', mcNumber: 'MC-3', work: [wc(), wc({ cardId: 'w2', urgency: 'Urgent' })] }),
    ];
    expect(ids(sortBy('urgent', rows))).toEqual(['mixed', 'quiet', 'none']);
    expect(recipe.pipeWorkKeys(rows[2], sel()).urgent).toBe(1);
    expect(recipe.pipeWorkKeys(rows[0], sel()).urgent, 'all Non-Urgent is the value 0').toBe(0);
    expect(recipe.pipeWorkKeys(rows[1], sel()).urgent, 'no children is keyless').toBe(null);
    expect(recipe.PIPE_SORTS.find((s) => s.key === 'urgent')!.derived).toBe(true);
  });

  it('ranks WORK cards Hardest first — Hard → Medium → Easy, never alphabetically (block 4, #78 §5)', () => {
    /* LIVE again. Alphabetically Hard sits between Easy and Medium, so an
       implementation that forgot the ranking table would read Medium, Hard,
       Easy under a descending sort — and look plausible. A group ranks by its
       HARDEST labelled child (max rank, B6); unlabelled children contribute
       nothing, and a group with no labelled child is keyless. */
    const rows = [
      row({ cardId: 'easy', mcNumber: 'MC-1', work: [wc({ difficulty: 'Easy' })] }),
      row({ cardId: 'unlabelled', mcNumber: 'MC-2', work: [wc(), wc({ cardId: 'w2' })] }),
      row({ cardId: 'medium', mcNumber: 'MC-3', work: [wc({ difficulty: 'Medium' })] }),
      row({ cardId: 'hard', mcNumber: 'MC-4', work: [wc({ difficulty: 'Hard' })] }),
      // the max rule: an Easy sibling does not soften a Hard one
      row({ cardId: 'mixed', mcNumber: 'MC-5', work: [wc({ difficulty: 'Easy' }), wc({ cardId: 'w2', difficulty: 'Hard' }), wc({ cardId: 'w3' })] }),
    ];
    // `hard` and `mixed` share the top key; the tiebreak (B7, proven below)
    // puts the lower MC first
    expect(ids(sortBy('hardest', rows))).toEqual(['hard', 'mixed', 'medium', 'easy', 'unlabelled']);
    // the ranking table itself: a strict Hard > Medium > Easy, so the sort
    // cannot be alphabetical by construction
    expect(recipe.DIFF_RANK.Hard).toBeGreaterThan(recipe.DIFF_RANK.Medium!);
    expect(recipe.DIFF_RANK.Medium).toBeGreaterThan(recipe.DIFF_RANK.Easy!);
    expect(recipe.pipeWorkKeys(rows[4], sel()).hard).toBe(recipe.DIFF_RANK.Hard);
    expect(recipe.pipeWorkKeys(rows[1], sel()).hard, 'no labelled child is keyless').toBe(null);
    expect(recipe.PIPE_SORTS.find((s) => s.key === 'hardest')!.derived).toBe(true);
    /* review 2026-09-05, finding C1: a label outside the taxonomy — including
       one that happens to name an Object.prototype member — is KEYLESS (B6),
       never an inherited property masquerading as a rank */
    for (const bad of ['constructor', 'toString', 'Very Hard']) {
      expect(recipe.pipeWorkKeys(row({ work: [wc({ difficulty: bad })] }), sel()).hard, bad).toBe(null);
    }
  });

  it('names sorts by the RESULTING ORDER, never column-plus-arrow', () => {
    /* the frame is explicit that the labels should read rather than need
       decoding — no '↑', no '↓', no 'Due (asc)' */
    for (const s of recipe.PIPE_SORTS) expect(s.label).not.toMatch(/[↑↓]|asc|desc/i);
  });

  it('spells no filter AXIS into the sort list — the four axes are the panel’s, not a sort’s', () => {
    /* RETITLED 2026-09-05 twice — block 1 (D5) and block 4. A difficulty
       ORDER as a sort is legitimate (that is 'Hardest first'); a difficulty or
       urgency AXIS spelt into the sort list is not, and neither is Type or
       Status. The word list is derived from the axes the panel declares, so
       an axis added later is covered without an edit here. */
    const labels = recipe.PIPE_SORTS.map((s) => s.label.toLowerCase());
    const axisWords = recipe.PIPE_FILTERS.map((f) => f.label.toLowerCase());
    expect(axisWords, 'no axes — the walk below would prove nothing').toHaveLength(4);
    for (const word of axisWords) expect(labels.some((l) => l.includes(word)), word).toBe(false);
  });

  it('has no phase-progression sort — considered and removed', () => {
    const labels = recipe.PIPE_SORTS.map((s) => s.label.toLowerCase());
    expect(labels.some((l) => l.includes('furthest') || l.includes('progress'))).toBe(false);
  });
});

/* ---------------------------------------------------------------------- */
/* B — EMPTY SORTS LAST, in every direction                                 */
/* ---------------------------------------------------------------------- */

describe('an absent value never displaces a real one', () => {
  /* the deadline lives on the WORK CARD since block 4 (B5): `work` carries
     it, and the parent's own `deadline` is deliberately NOT set here */
  const withDue = [
    row({ cardId: 'none', mcNumber: 'MC-1' }),
    row({ cardId: 'far', mcNumber: 'MC-2', work: [wc({ due: '2026-12-01' })] }),
    row({ cardId: 'near', mcNumber: 'MC-3', work: [wc({ due: '2026-08-01' })] }),
  ];

  it('sorts empties last ASCENDING (deadline closest to now)', () => {
    expect(ids(sortBy('due-near', withDue))).toEqual(['near', 'far', 'none']);
  });

  it('sorts empties last DESCENDING too — the direction must not flip them up', () => {
    /* this is the assertion that matters: on the real board most cards lack a
       due date, so a naive nulls-first descending order fills the top of the
       table with blanks and looks broken */
    expect(ids(sortBy('due-far', withDue))).toEqual(['far', 'near', 'none']);
  });

  it('holds for every other sort — both Identity directions and the Priority pair included', () => {
    /* `hardest` is back in this list (block 4); `urgent` joins it, and so do
       the two Identity directions the frame added — a descending name sort
       is exactly where a naive comparator would float the empties up */
    const cases: Array<[string, Record<string, unknown>]> = [
      ['started', { workStartedTs: '2026-08-02T00:00:00Z' }],
      ['completed', { workDoneTs: '2026-08-02T00:00:00Z' }],
      ['name', { name: 'Zeta' }],
      ['name-desc', { name: 'Zeta' }],
      ['urgent', { work: [wc()] }],
      ['hardest', { work: [wc({ difficulty: 'Easy' })] }],
    ];
    for (const [key, real] of cases) {
      const rows = [row({ cardId: 'empty', mcNumber: 'MC-1', name: '' }), row({ cardId: 'real', mcNumber: 'MC-2', name: '', ...real })];
      expect(ids(sortBy(key, rows)), key).toEqual(['real', 'empty']);
    }
    // the MC pair: a row with no number is the empty one, in both directions
    for (const key of ['mc', 'mc-desc']) {
      const rows = [row({ cardId: 'empty', mcNumber: '' }), row({ cardId: 'real', mcNumber: 'MC-7' })];
      expect(ids(sortBy(key, rows)), key).toEqual(['real', 'empty']);
    }
  });

  it('treats Non-Urgent as a VALUE, not an absence — nothing falls to the bottom (block 4, #78 §5)', () => {
    /* LIVE again. Every card on the wire carries an urgency (the default IS
       Non-Urgent), so a group of quiet cards has a key — 0 — and ranks above
       a group with nothing to rank, never beside it. Read through the sort
       path AND the key, so a comparator that coerced 0 to "empty" fails here
       rather than quietly pushing every quiet group to the bottom. */
    const rows = [
      row({ cardId: 'childless', mcNumber: 'MC-1' }),
      row({ cardId: 'quiet', mcNumber: 'MC-2', work: [wc()] }),
    ];
    expect(ids(sortBy('urgent', rows))).toEqual(['quiet', 'childless']);
    expect(recipe.pipeWorkKeys(rows[1], sel()).urgent).toBe(0);
  });
});

/* ---------------------------------------------------------------------- */
/* B2 — the work-card keys and the tiebreak (PLAN B5/B7)                    */
/* ---------------------------------------------------------------------- */

describe('the Deadline sorts key on the EARLIEST matching child, and ignore the parent', () => {
  it('reads the earliest child `due` as the key — the parent’s own deadline is not consulted', () => {
    /* #78 §2: "main cards have no deadline at all" (B5). The failing input:
       a parent whose BR-9 `deadline` is early but whose work is due late. On
       the parent key it leads; on the children's it trails. */
    const rows = [
      row({ cardId: 'parent-early', mcNumber: 'MC-1', deadline: '2026-01-01', work: [wc({ due: '2026-12-01' })] }),
      row({ cardId: 'child-early', mcNumber: 'MC-2', deadline: null, work: [wc({ due: '2026-06-01' })] }),
    ];
    expect(ids(sortBy('due-near', rows))).toEqual(['child-early', 'parent-early']);
    expect(ids(sortBy('due-far', rows))).toEqual(['parent-early', 'child-early']);
    // a parent with a deadline and no dated child is KEYLESS, not early
    const orphan = row({ cardId: 'p', deadline: '2026-01-01', work: [wc()] });
    expect(recipe.pipeWorkKeys(orphan, sel()).due).toBe(null);
  });

  it('takes the EARLIEST of several children, skipping the undated ones', () => {
    const r = row({ work: [wc({ due: '2026-09-01' }), wc({ cardId: 'w2' }), wc({ cardId: 'w3', due: '2026-03-15' }), wc({ cardId: 'w4', due: '2026-03-16' })] });
    expect(recipe.pipeWorkKeys(r, sel()).due).toBe('2026-03-15');
  });

  it('keys on the wire string ITSELF — pipeWorkKeys never touches Date, so the key is the same in both TZs', () => {
    /* test/CLAUDE.md rule 5: no Date math on `due`. Identity alone does not
       prove it — UTC and Asia/Manila both sit at or ahead of UTC, so a Date
       plus local getters round-trips '2026-03-15' intact under either — hence
       the assertion on the comment-stripped body (2026-09-05 block 4 review,
       finding 7). */
    const r = row({ work: [wc({ due: '2026-03-15' })] });
    expect(recipe.pipeWorkKeys(r, sel()).due).toBe('2026-03-15');
    expect(typeof recipe.pipeWorkKeys(r, sel()).due).toBe('string');
    expect(decl(APP_JS_CODE, 'pipeWorkKeys')).not.toMatch(/\bDate\b/);
  });

  it('reads the key over the MATCHING children only — a filtered-out sibling cannot set it', () => {
    /* B5's "matching": with Urgency = Urgent live, the group's earliest date
       is the earliest URGENT card's, or the table would open a group on its
       urgent children and order it by a card it does not show */
    const r = row({ work: [wc({ due: '2026-02-01' }), wc({ cardId: 'w2', urgency: 'Urgent', due: '2026-11-01' })] });
    expect(recipe.pipeWorkKeys(r, sel()).due).toBe('2026-02-01');
    expect(recipe.pipeWorkKeys(r, sel({ urgency: ['Urgent'] })).due).toBe('2026-11-01');
    // the same narrowing reaches the sort path through `sel`
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', work: [wc({ due: '2026-01-01' }), wc({ cardId: 'w2', urgency: 'Urgent', due: '2026-12-01' })] }),
      row({ cardId: 'b', mcNumber: 'MC-2', work: [wc({ urgency: 'Urgent', due: '2026-06-01' })] }),
    ];
    expect(ids(sortBy('due-near', rows))).toEqual(['a', 'b']);
    expect(ids(sortBy('due-near', rows, sel({ urgency: ['Urgent'] })))).toEqual(['b', 'a']);
  });
});

describe('the tiebreak — keyless last, then MC; equal keys by filing, then MC (B7)', () => {
  it('puts the keyless rows last in BOTH directions, MC ascending among themselves', () => {
    /* the server order is the trap: keyless rows used to keep whatever order
       they arrived in, so the bottom of the table reshuffled between loads.
       Fed in the WRONG order on purpose. */
    const rows = [
      row({ cardId: 'k30', mcNumber: 'MC-30' }),
      row({ cardId: 'dated', mcNumber: 'MC-99', work: [wc({ due: '2026-05-05' })] }),
      row({ cardId: 'k10', mcNumber: 'MC-10' }),
      row({ cardId: 'k20', mcNumber: 'MC-20' }),
    ];
    expect(ids(sortBy('due-near', rows))).toEqual(['dated', 'k10', 'k20', 'k30']);
    expect(ids(sortBy('due-far', rows))).toEqual(['dated', 'k10', 'k20', 'k30']);
    // a non-work key follows the same rule: no name, in both directions
    const named = [
      row({ cardId: 'k30', mcNumber: 'MC-30', name: '' }),
      row({ cardId: 'named', mcNumber: 'MC-99', name: 'Zed' }),
      row({ cardId: 'k10', mcNumber: 'MC-10', name: '' }),
    ];
    expect(ids(sortBy('name', named))).toEqual(['named', 'k10', 'k30']);
    expect(ids(sortBy('name-desc', named))).toEqual(['named', 'k10', 'k30']);
  });

  it('falls back on EQUAL keys to the table’s natural order — newest filed first, never-read last — then MC', () => {
    /* four rows sharing one deadline, fed in an order that satisfies none of
       the three steps so each one has to do its work: filing decides first
       (B before A), a tie on filing goes to the lower MC (D before B), and a
       row never re-read sorts after every filed one (C last). */
    const due = '2026-07-07';
    const rows = [
      row({ cardId: 'A', mcNumber: 'MC-5', filedAt: '2026-01-01T00:00:00Z', work: [wc({ due })] }),
      row({ cardId: 'B', mcNumber: 'MC-9', filedAt: '2026-03-01T00:00:00Z', work: [wc({ due })] }),
      row({ cardId: 'C', mcNumber: 'MC-1', filedAt: null, work: [wc({ due })] }),
      row({ cardId: 'D', mcNumber: 'MC-2', filedAt: '2026-03-01T00:00:00Z', work: [wc({ due })] }),
    ];
    expect(ids(sortBy('due-near', rows))).toEqual(['D', 'B', 'A', 'C']);
    // and the same fallback under a Priority key, where ties are the common case
    const urgent = rows.map((r) => ({ ...r, work: [wc({ urgency: 'Urgent' })] }));
    expect(ids(sortBy('urgent', urgent))).toEqual(['D', 'B', 'A', 'C']);
  });

  it('applies the tiebreak to the MC sorts too — a duplicated number orders by filing', () => {
    // mc_number is not unique (invariant 3): two MC-837 rows share a key
    const rows = [
      row({ cardId: 'old', mcNumber: 'MC-837', filedAt: '2026-01-01T00:00:00Z' }),
      row({ cardId: 'new', mcNumber: 'MC-837', filedAt: '2026-02-01T00:00:00Z' }),
      row({ cardId: 'low', mcNumber: 'MC-100' }),
    ];
    expect(ids(sortBy('mc', rows))).toEqual(['low', 'new', 'old']);
    expect(ids(sortBy('mc-desc', rows))).toEqual(['new', 'old', 'low']);
  });
});

/* ---------------------------------------------------------------------- */
/* C — the DEFAULT order                                                    */
/* ---------------------------------------------------------------------- */

describe('the default order is by filing, newest first', () => {
  it('is not one of the listed sorts — it is the order they deviate FROM', () => {
    expect(recipe.PIPE_SORTS.some((s) => s.key === null)).toBe(false);
    expect(recipe.PIPE_SORT_DEFAULT.key).toBe(null);
  });

  it('orders newest filed first, with never-read rows last', () => {
    const rows = [
      row({ cardId: 'old', filedAt: '2026-07-01T00:00:00Z' }),
      row({ cardId: 'unread' }),
      row({ cardId: 'new', filedAt: '2026-08-19T00:00:00Z' }),
    ];
    expect(sortBy(null, rows).map((r) => (r as { cardId: string }).cardId)).toEqual(['new', 'old', 'unread']);
  });

  it('reads filedAt and NOT the Sirius row timestamp', () => {
    /* `created_at` is when the SIRIUS row was made: on the live board it stamps
       289 rows with the single day the board was onboarded, so ordering by it
       would be a meaningless tie dressed as an order (migration 008). */
    const src = recipe.PIPE_SORT_DEFAULT.value.toString();
    expect(src).toContain('filedAt');
    expect(src).not.toContain('created_at');
    expect(src).not.toContain('createdAt');
  });
});

describe('the MC-number sort actually orders by the MC number', () => {
  it('puts 9 before 10, and keeps a fraction rather than truncating it', () => {
    /* this sort shipped ordering NOTHING: `mcRank` took a request ROW and read
       `mc_number` off it, the Pipeline handed it the STRING, and every row
       ranked null. The suite could not see it because it carried a hand-written
       stub of `mcRank` instead of slicing the shipped one — so the guard now
       executes the real helper, and this case is what the stub was hiding. */
    const rows = [row({ cardId: 'a', mcNumber: 'MC-10' }), row({ cardId: 'b', mcNumber: 'MC-9' }), row({ cardId: 'c', mcNumber: 'MC-655.3' })];
    expect(ids(sortBy('mc', rows))).toEqual(['b', 'a', 'c']);
    // the frame's second direction is the same key reversed (block 4)
    expect(ids(sortBy('mc-desc', rows))).toEqual(['c', 'a', 'b']);
    // a row with no MC number is empty, and empty still sorts last
    expect(ids(sortBy('mc', [row({ cardId: 'x', mcNumber: '' }), row({ cardId: 'y', mcNumber: 'MC-1' })]))).toEqual(['y', 'x']);
  });

  it('orders the name sort in both directions, case-insensitively', () => {
    const rows = [row({ cardId: 'b', mcNumber: 'MC-1', name: 'beta' }), row({ cardId: 'a', mcNumber: 'MC-2', name: 'Alpha' }), row({ cardId: 'c', mcNumber: 'MC-3', name: 'Charlie' })];
    expect(ids(sortBy('name', rows))).toEqual(['a', 'b', 'c']);
    expect(ids(sortBy('name-desc', rows))).toEqual(['c', 'b', 'a']);
  });
});
