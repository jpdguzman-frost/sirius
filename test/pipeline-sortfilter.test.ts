/**
 * owl miles→jp #62 — Pipeline filter + sort (nodes 592:56850 · 592:56913 ·
 * 592:56966 · 593:78434 · 593:74881; answers in jp→miles #49).
 *
 * Both are READ-ONLY view operations over rows the client already holds, so
 * the whole feature lives in the shipped app scripts. The recipes below are
 * SLICED OUT OF THOSE SCRIPTS AND EXECUTED (the executed-computed pattern,
 * now homed in test/sprint-schedule-render.test.ts) — a
 * source-text assertion could show a sort exists without showing it orders
 * anything.
 *
 * What this file cannot prove: that a click opens the panel, that arrow keys
 * walk the items, that Escape returns focus. `toHTML()` has no pointer, focus
 * or clock — those belong to the live pass.
 *
 * AMENDED 2026-09-05 — owls miles→jp #78 §1/§3 and #79, frame `809:83486`.
 * The table is TEN columns now: REQUESTOR left Pipeline for Requests, URGENCY
 * moved ahead of DIFFICULTY, and DUE became DEADLINE. Block 1 parked the
 * URGENCY and DIFFICULTY axes and the Priority sorts with it, because #78
 * moved those values onto the WORK CARD and an axis narrowing MAIN rows by
 * either would have filtered parents on a value the table no longer draws.
 *
 * BLOCK 4, same day (owl #78 §4/§5, frames 841:53782 / 841:58731): the parked
 * coverage is BACK. The four axes are TYPE · DIFFICULTY · URGENCY · STATUS in
 * the frame's order; DIFFICULTY and URGENCY read the WORK CARDS (a group
 * matches through a child, PLAN B2/B3), the Priority pair ranks by the group's
 * children (B6), the two Deadline sorts key on the earliest matching child's
 * `due` (B5), and Identity has both directions (ten sorts). Keyless rows sort
 * last either way and MC-ascending among themselves; equal keys fall back to
 * newest-filed then MC (B7). The `it.todo` entries block 1 left are live
 * tests again, and the rules that were re-pointed at TYPE while the axes were
 * parked are proven on the restored axes as well.
 *
 * Every `due` is a Manila day string and compares AS A STRING (test/CLAUDE.md
 * rule 5) — no Date is constructed anywhere in this file.
 */

import { readFileSync } from 'node:fs';
import RactiveModule from 'ractive';
import { describe, expect, it } from 'vitest';
import { APP_JS, APP_JS_CODE, PIPELINE_CSS, TEMPLATE, cssRule, decl, divFragment, fnBody, handlerBody, method } from './helpers/gantt-render.ts';

type Sel = Record<string, (string | null)[]>;
interface Sort { key: string; group: string; label: string; dir: number; derived?: boolean; value: (r: unknown, sel?: Sel) => unknown }
interface Axis { key: string; col: string; label: string; pick?: (r: unknown) => unknown; work?: string; order?: string[]; none?: boolean; scroll?: boolean }
interface FacetValue { value: string | null; label: string; count: number; on: boolean }
interface Facet { key: string; label: string; scroll: boolean; values: FacetValue[] }
interface WorkKeys { due: string | null; urgent: 0 | 1 | null; hard: number | null }

/* The block-4 helpers ride in the same recipe: `DIFF_RANK` and the five
   `pipeWork*`/`pipeValues`/`pipeTiebreak` consts are what the ten sorts and
   the four axes call, so a decl-list without them would throw at the first
   derived key. Names are the frozen ones (PLAN.md block 4). */
const recipe = new Function(`
  ${decl(APP_JS, 'DIFF_RANK')}
  ${decl(APP_JS, 'PIPE_SORTS')}
  ${decl(APP_JS, 'PIPE_SORT_DEFAULT')}
  ${decl(APP_JS, 'pipeTiebreak')}
  ${decl(APP_JS, 'pipeCompare')}
  ${decl(APP_JS, 'pipeSortRows')}
  ${decl(APP_JS, 'PIPE_COLS')}
  ${decl(APP_JS, 'pipeColLabel')}
  ${decl(APP_JS, 'PIPE_FILTERS')}
  ${decl(APP_JS, 'unranked')}
  ${decl(APP_JS, 'alphaSort')}
  ${decl(APP_JS, 'pipePick')}
  ${decl(APP_JS, 'pipeValueLabel')}
  ${decl(APP_JS, 'PIPE_FILTERS_EMPTY')}
  ${decl(APP_JS, 'pipeWorkMatch')}
  ${decl(APP_JS, 'pipeWorkKids')}
  ${decl(APP_JS, 'pipeValues')}
  ${decl(APP_JS, 'pipeWorkKeys')}
  ${decl(APP_JS, 'pipeMatches')}
  ${decl(APP_JS, 'pipeFacetList')}
  ${decl(APP_JS, 'pipeChipList')}
  ${decl(APP_JS, 'pipeSortLabel')}
  ${decl(APP_JS, 'mcRank')}
  return { DIFF_RANK, PIPE_COLS, pipeChipList, PIPE_SORTS, PIPE_SORT_DEFAULT, pipeSortRows, PIPE_FILTERS, PIPE_FILTERS_EMPTY, pipeMatches, pipeFacetList, pipeSortLabel, pipeWorkMatch, pipeWorkKids, pipeValues, pipeWorkKeys, pipeTiebreak };
`)() as {
  DIFF_RANK: Record<string, number>;
  PIPE_COLS: Array<{ cls: string; label: string }>;
  PIPE_SORTS: Sort[];
  PIPE_SORT_DEFAULT: Sort;
  pipeSortRows: (rows: unknown[], s: Sort, sel: Sel) => unknown[];
  PIPE_FILTERS: Axis[];
  PIPE_FILTERS_EMPTY: () => Sel;
  pipeMatches: (r: unknown, sel: Sel, except: string | null) => boolean;
  pipeFacetList: (rows: unknown[], sel: Sel) => Facet[];
  pipeChipList: (sel: Sel) => Array<{ key: string; label: string; text: string; on: boolean }>;
  pipeSortLabel: (k: string | null) => string;
  pipeWorkMatch: (w: unknown, sel: Sel, except: string | null) => boolean;
  pipeWorkKids: (r: unknown, sel: Sel, except: string | null) => unknown[];
  pipeValues: (f: Axis, r: unknown, sel: Sel) => (string | null)[];
  pipeWorkKeys: (r: unknown, sel: Sel) => WorkKeys;
  pipeTiebreak: (a: unknown, b: unknown, keyless: boolean) => number;
};

/* A main row as `loadAll` stamps it: `work` is the row's own task cards
   (block 4 stamp, beside blob/warning), empty by default so a fixture that
   is not about work cards states nothing about them. */
const row = (over: Record<string, unknown> = {}) => ({
  cardId: 'c1', mcNumber: 'MC-800', name: 'A card', deadline: null, workStarted: null,
  workStartedTs: null, workDone: null, workDoneTs: null, urgency: 'Non-Urgent',
  difficulty: null, assetType: null, currentList: null, requestor: null, filedAt: null, work: [], ...over,
});
/* A work card as WorkCardWire carries it — the wire's own defaults:
   `Non-Urgent` is a VALUE (the absence of the Urgent label), `difficulty` and
   `due` genuinely absent until a label or a date says otherwise. */
const wc = (over: Record<string, unknown> = {}) => ({
  cardId: 'w1', name: 'A task', urgency: 'Non-Urgent', difficulty: null, due: null, ...over,
});
const sel = (over: Sel = {}): Sel => ({ ...recipe.PIPE_FILTERS_EMPTY(), ...over });
const ids = (rows: unknown[]) => rows.map((r) => (r as { cardId: string }).cardId);
const sortBy = (key: string | null, rows: unknown[], live: Sel = sel()) => {
  const s = key ? recipe.PIPE_SORTS.find((x) => x.key === key)! : recipe.PIPE_SORT_DEFAULT;
  // the SHIPPED sort path, decorate-sort-undecorate and all — not a
  // re-implementation of it around the bare comparator. The selection rides
  // along because a work-card key is read over the MATCHING children (B5).
  return recipe.pipeSortRows(rows, s, live);
};

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
       is executed in test/pipeline-expanded.test.ts. */
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

  it('compares the Manila day strings AS STRINGS — the same key in both TZs', () => {
    /* test/CLAUDE.md rule 5: a Date built from '2026-03-15' lands on the 14th
       or the 15th depending on the process TZ. The key is the wire string
       itself, unchanged — asserted by identity, which a Date round-trip
       cannot pass. */
    const r = row({ work: [wc({ due: '2026-03-15' })] });
    expect(recipe.pipeWorkKeys(r, sel()).due).toBe('2026-03-15');
    expect(typeof recipe.pipeWorkKeys(r, sel()).due).toBe('string');
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

/* ---------------------------------------------------------------------- */
/* D — the surviving filter axes, OR within / AND across                    */
/* ---------------------------------------------------------------------- */

describe('filtering is OR within a category and AND across them', () => {
  const rows = [
    row({ cardId: 'a', assetType: 'Icon', currentList: 'Design' }),
    row({ cardId: 'b', assetType: 'UI', currentList: 'Backlogs: Icon' }),
    row({ cardId: 'c', assetType: 'Icon', currentList: 'Backlogs: Icon' }),
  ];
  const pick = (sel: Record<string, string[]>) =>
    rows.filter((r) => recipe.pipeMatches(r, { ...recipe.PIPE_FILTERS_EMPTY(), ...sel }, null)).map((r) => r.cardId);

  it('carries the FOUR axes in the frame’s order — Type, Difficulty, Urgency, Status', () => {
    /* SUPERSEDES block 1's two-axis pin. #78 §4 (frame 841:53782) rebuilds
       DIFFICULTY and URGENCY over WORK-CARD values — a group matches through a
       child (B2/B3) — and that is what brings them back; REQUESTOR stays gone
       with its column (#78 §3). The order is the frame's (B1). */
    expect(recipe.PIPE_FILTERS.map((f) => f.label)).toEqual(['Type', 'Difficulty', 'Urgency', 'Status']);
    const keys = recipe.PIPE_FILTERS.map((f) => f.key);
    expect(keys).toContain('difficulty');
    expect(keys).toContain('urgency');
    expect(keys).not.toContain('requestor');
  });

  it('reads TYPE and STATUS off the MAIN row and DIFFICULTY and URGENCY off the WORK cards (B2)', () => {
    /* the axis says which field of WorkCardWire it reads (`work`), and the
       main-row axes keep `pick`; an axis with both, or neither, is an axis
       the matcher cannot evaluate */
    const by = Object.fromEntries(recipe.PIPE_FILTERS.map((f) => [f.key, f]));
    expect(by.difficulty!.work).toBe('difficulty');
    expect(by.urgency!.work).toBe('urgency');
    expect(by.type!.work).toBeUndefined();
    expect(by.status!.work).toBeUndefined();
    expect(typeof by.type!.pick).toBe('function');
    expect(typeof by.status!.pick).toBe('function');
  });

  it('a group matches a work-card axis through ONE child that satisfies EVERY live work axis (B3)', () => {
    /* child-level conjunction. The tempting shape is row-level: "some child is
       Urgent AND some child is Hard". That admits a group whose urgent card is
       easy and whose hard card is quiet — and the reader, looking for urgent
       hard work, opens it to find neither. */
    const split = row({ cardId: 'split', work: [wc({ urgency: 'Urgent', difficulty: 'Easy' }), wc({ cardId: 'w2', difficulty: 'Hard' })] });
    const one = row({ cardId: 'one', work: [wc({ urgency: 'Urgent', difficulty: 'Hard' }), wc({ cardId: 'w2' })] });
    const both = sel({ urgency: ['Urgent'], difficulty: ['Hard'] });
    expect(recipe.pipeMatches(split, both, null)).toBe(false);
    expect(recipe.pipeMatches(one, both, null)).toBe(true);
    // each axis alone still admits the split group — it is the conjunction that fails
    expect(recipe.pipeMatches(split, sel({ urgency: ['Urgent'] }), null)).toBe(true);
    expect(recipe.pipeMatches(split, sel({ difficulty: ['Hard'] }), null)).toBe(true);
    // the same rule at the card level, which is what `pipeKids` draws (B3)
    expect(recipe.pipeWorkKids(split, both, null)).toEqual([]);
    expect(recipe.pipeWorkKids(one, both, null).map((w) => (w as { cardId: string }).cardId)).toEqual(['w1']);
  });

  it('hides a group with NO matching child — a childless MC cannot pass a work-card axis (E2)', () => {
    /* undrawn in the frame, decided at the gate: a main row matches a
       work-card axis only through a child, so a group with no children — or
       none matching — is not shown under that axis at all. Shown, it would be
       a row the reader cannot explain and cannot open. */
    const childless = row({ cardId: 'lone' });
    expect(recipe.pipeMatches(childless, sel({ urgency: ['Urgent'] }), null)).toBe(false);
    expect(recipe.pipeMatches(childless, sel({ urgency: ['Non-Urgent'] }), null)).toBe(false);
    expect(recipe.pipeMatches(childless, sel({ difficulty: [null] }), null)).toBe(false);
    // …and is untouched by a main-row axis it does satisfy
    expect(recipe.pipeMatches(row({ assetType: 'Icon' }), sel({ type: ['Icon'] }), null)).toBe(true);
  });

  it('ORs within a WORK axis and ANDs it against a MAIN axis, the same as before', () => {
    const rows = [
      row({ cardId: 'a', assetType: 'Icon', work: [wc({ difficulty: 'Easy' })] }),
      row({ cardId: 'b', assetType: 'UI', work: [wc({ difficulty: 'Hard' })] }),
      row({ cardId: 'c', assetType: 'Icon', work: [wc({ difficulty: 'Hard' })] }),
    ];
    const hit = (s: Sel) => rows.filter((r) => recipe.pipeMatches(r, s, null)).map((r) => r.cardId);
    expect(hit(sel({ difficulty: ['Easy', 'Hard'] }))).toEqual(['a', 'b', 'c']);
    expect(hit(sel({ type: ['Icon'], difficulty: ['Hard'] }))).toEqual(['c']);
  });

  it('pipeValues: a main axis yields one value (or nothing where None is not offered); a work axis the DISTINCT child values', () => {
    /* the value SET is what the counts and the matcher both read, so its
       shape is a rule: a STATUS-less row has NO value on STATUS (the axis
       offers no None), a type-less row has [null] on TYPE (it does), and a
       group with two Hard cards and one Easy carries {Hard, Easy} once each —
       which is what makes a count a count of GROUPS (B4). */
    const by = Object.fromEntries(recipe.PIPE_FILTERS.map((f) => [f.key, f]));
    const r = row({ work: [wc({ difficulty: 'Hard' }), wc({ cardId: 'w2', difficulty: 'Hard' }), wc({ cardId: 'w3', difficulty: 'Easy' })] });
    expect(recipe.pipeValues(by.type!, r, sel())).toEqual([null]);
    expect(recipe.pipeValues(by.status!, r, sel())).toEqual([]);
    expect(recipe.pipeValues(by.difficulty!, r, sel()).slice().sort()).toEqual(['Easy', 'Hard']);
    expect(recipe.pipeValues(by.urgency!, r, sel())).toEqual(['Non-Urgent']);
    // a childless group has NO value on a work axis — not None, nothing
    expect(recipe.pipeValues(by.difficulty!, row(), sel())).toEqual([]);
    // the set on one work axis is read over the children matching the OTHER
    // live work axes — the axis's own selection is ignored (R-pf-c)
    const mixed = row({ work: [wc({ urgency: 'Urgent', difficulty: 'Easy' }), wc({ cardId: 'w2', difficulty: 'Hard' })] });
    expect(recipe.pipeValues(by.difficulty!, mixed, sel({ urgency: ['Urgent'] }))).toEqual(['Easy']);
    expect(recipe.pipeValues(by.difficulty!, mixed, sel({ urgency: ['Urgent'], difficulty: ['Hard'] }))).toEqual(['Easy']);
  });

  it('leaves no axis pointed at a column the ten-column table stopped drawing', () => {
    /* THE RULE #78 could have broken quietly: an axis takes its label from the
       column it narrows, so one left behind on `col-requestor` or `col-diff`
       renders a heading of `undefined` over a live list of checkboxes. Section
       H proves the join from the column side; this is the axis side, and it is
       the side that fails first when a column is deleted. */
    const cols = recipe.PIPE_COLS.map((c) => c.cls);
    for (const a of recipe.PIPE_FILTERS) expect(cols, `axis "${a.key}" narrows "${a.col}"`).toContain(a.col);
    expect(cols, 'the Requestor column is gone from Pipeline (#78 §3)').not.toContain('col-requestor');
  });

  it('ORs within a category — Icon plus UI shows both', () => {
    expect(pick({ type: ['Icon', 'UI'] })).toEqual(['a', 'b', 'c']);
  });

  it('ANDs across categories — Icon plus one list shows only that list’s icons', () => {
    expect(pick({ type: ['Icon'], status: ['Backlogs: Icon'] })).toEqual(['c']);
  });

  it('an empty axis constrains nothing', () => {
    expect(pick({})).toEqual(['a', 'b', 'c']);
    expect(pick({ type: [] })).toEqual(['a', 'b', 'c']);
  });

  it('has NO state axes — blocked and missing-info were declined', () => {
    const keys = recipe.PIPE_FILTERS.map((f) => f.key);
    expect(keys).not.toContain('blocker');
    expect(keys).not.toContain('missing');
  });
});

/* ---------------------------------------------------------------------- */
/* E — the facet counts (jp→miles #49)                                      */
/* ---------------------------------------------------------------------- */

describe('a category counts against the OTHER categories, never its own', () => {
  it('ignoring its own selection is what keeps a second value reachable', () => {
    /* the whole reason for the third option: counted against ALL filters
       including its own, picking Icon drops UI to zero and it can never be
       added without clearing first — accurate and unusable. */
    const rows = [row({ cardId: 'a', assetType: 'Icon' }), row({ cardId: 'b', assetType: 'UI' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] };
    const forType = rows.filter((r) => recipe.pipeMatches(r, sel, 'type'));
    expect(forType.map((r) => r.cardId)).toEqual(['a', 'b']); // UI still countable
    const forOthers = rows.filter((r) => recipe.pipeMatches(r, sel, 'status'));
    expect(forOthers.map((r) => r.cardId)).toEqual(['a']); // …but the other axis sees the narrowing
  });

  it('counts GROUPS on a work-card axis — a group with two Urgent cards is one Urgent (B4)', () => {
    /* the row unit the table draws and pages is the main row; a count of
       cards would read "3 Urgent" over a table that shows one group. */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', work: [wc({ urgency: 'Urgent' }), wc({ cardId: 'w2', urgency: 'Urgent' }), wc({ cardId: 'w3' })] }),
      row({ cardId: 'b', mcNumber: 'MC-2', work: [wc()] }),
      row({ cardId: 'c', mcNumber: 'MC-3' }), // childless: on no pool of a work axis
    ];
    const urgency = recipe.pipeFacetList(rows, sel()).find((f) => f.key === 'urgency')!;
    expect(urgency.values.map((v) => [v.label, v.count])).toEqual([['Non-Urgent', 2], ['Urgent', 1]]);
  });

  it('ignores its OWN axis on a work axis too, and sees the other work axis’s narrowing', () => {
    /* R-pf-c with two work axes live at once. Picking Urgent must leave
       Non-Urgent countable (own axis ignored), while DIFFICULTY — another
       axis — counts only the children that ARE urgent (B3's conjunction
       reaching the counts). */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', assetType: 'Icon', work: [wc({ urgency: 'Urgent', difficulty: 'Hard' }), wc({ cardId: 'w2', difficulty: 'Easy' })] }),
      row({ cardId: 'b', mcNumber: 'MC-2', assetType: 'UI', work: [wc({ difficulty: 'Easy' })] }),
    ];
    const facets = recipe.pipeFacetList(rows, sel({ urgency: ['Urgent'] }));
    const of = (k: string) => facets.find((f) => f.key === k)!.values.map((v) => [v.label, v.count]);
    expect(of('urgency'), 'own axis ignored: Non-Urgent still reachable').toEqual([['Non-Urgent', 2], ['Urgent', 1]]);
    expect(of('difficulty'), 'the other work axis counts urgent children only').toEqual([['Hard', 1]]);
    expect(of('type'), 'a main axis sees the narrowing').toEqual([['Icon', 1]]);
    // …and a MAIN axis's selection narrows the WORK axes' counts in turn
    const byType = recipe.pipeFacetList(rows, sel({ type: ['UI'] }));
    expect(byType.find((f) => f.key === 'difficulty')!.values.map((v) => [v.label, v.count])).toEqual([['Easy', 1]]);
  });

  /* ---- BOTH work-card axes live (PLAN.md B12; owl #78 §4; R-pf-c) ----------
     THE RULE every number below is derived from:
       pool_j = the rows matching the selection with axis j REMOVED, each
       counted once per value it carries on j over the children the OTHER
       work axes admit.
     The work-card axes are ONE conjunction (B3), so a row fails them together
     and that is ONE failure: it still counts in every WORK pool with its
     own-ignoring set, and in no MAIN pool. Counted per axis instead, `split`
     fell out of both work pools the moment Urgent and Hard were ticked, and
     Easy read zero on a panel where ticking it would have widened the table —
     R-pf-c's "accurate and unusable", found on 446 of 1000 random boards.
     The board: `both` has ONE child that is Urgent AND Hard; `split` has an
     Urgent Easy card and a quiet Hard card; `far` is `split` under a TYPE the
     selection below does not pick. */
  const both = row({ cardId: 'both', mcNumber: 'MC-1', assetType: 'Icon', work: [wc({ urgency: 'Urgent', difficulty: 'Hard' })] });
  const split = row({ cardId: 'split', mcNumber: 'MC-2', assetType: 'Icon', work: [wc({ urgency: 'Urgent', difficulty: 'Easy' }), wc({ cardId: 'w2', difficulty: 'Hard' })] });
  const far = row({ cardId: 'far', mcNumber: 'MC-3', assetType: 'UI', work: [wc({ urgency: 'Urgent', difficulty: 'Easy' }), wc({ cardId: 'w2', difficulty: 'Hard' })] });
  const facetOf = (facets: Facet[], key: string): FacetValue[] => facets.find((f) => f.key === key)?.values ?? [];
  const counts = (facets: Facet[], key: string) => facetOf(facets, key).map((v) => [v.label, v.count]);
  const asMap = (facets: Facet[], key: string) => new Map(facetOf(facets, key).map((v) => [v.value, v.count] as const));
  /* the rule EXECUTED from the shipped matcher and value set, so the facet
     pass is checked against the rule and not against a copy of its own
     arithmetic (test/CLAUDE.md rule 2): `pipeMatches(…, null)` over the
     selection with j removed IS pool_j, and `pipeValues` on j reads the
     children the other work axes admit */
  const byRule = (rows: unknown[], live: Sel, key: string) => {
    const f = recipe.PIPE_FILTERS.find((x) => x.key === key)!;
    const pool = rows.filter((r) => recipe.pipeMatches(r, { ...live, [key]: [] }, null));
    const m = new Map<string | null, number>();
    for (const r of pool) for (const v of recipe.pipeValues(f, r, live)) m.set(v, (m.get(v) || 0) + 1);
    return m;
  };

  it('counts with BOTH work axes live — the conjunction fails as ONE, so a failed group still counts in every WORK pool (B12)', () => {
    /* Urgent + Hard ticked. By the rule:
         table      = rows matching Urgent AND Hard → `both` (its one child is
                      both); `split` has no such child
         DIFFICULTY = rows matching Urgent alone → both, split; values over the
                      URGENT children: both → Hard, split → Easy   ⇒ Easy 1, Hard 1
         URGENCY    = rows matching Hard alone → both, split; values over the
                      HARD children: both → Urgent, split → Non-Urgent ⇒ Non-Urgent 1, Urgent 1
         TYPE       = rows matching Urgent AND Hard → both only    ⇒ Icon 1
       `split` reaches Easy and Non-Urgent, and no MAIN pool. */
    const rows = [both, split];
    const live = sel({ urgency: ['Urgent'], difficulty: ['Hard'] });
    expect(ids(rows.filter((r) => recipe.pipeMatches(r, live, null)))).toEqual(['both']);
    const facets = recipe.pipeFacetList(rows, live);
    expect(counts(facets, 'difficulty'), 'split reaches Easy through its Urgent child').toEqual([['Easy', 1], ['Hard', 1]]);
    expect(counts(facets, 'urgency'), 'split reaches Non-Urgent through its Hard child').toEqual([['Non-Urgent', 1], ['Urgent', 1]]);
    expect(counts(facets, 'type'), 'a MAIN pool keeps the conjunction — split is not in it').toEqual([['Icon', 1]]);
    for (const f of recipe.PIPE_FILTERS) expect(asMap(facets, f.key), `pool ${f.key}, by the rule`).toEqual(byRule(rows, live, f.key));
  });

  it('a MAIN miss on top of the conjunction miss is TWO failures — the group counts nowhere (B12)', () => {
    /* Type=Icon, Urgent, Hard. `far` fails TYPE and fails the conjunction.
       By the rule every pool removes ONE axis and the other failure remains,
       so `far` is in none of them: UI never appears under TYPE, and the work
       pools read exactly what `split` (Icon — one failure) gives them:
         DIFFICULTY = matching Icon + Urgent → both (Hard), split (Easy)
         URGENCY    = matching Icon + Hard   → both (Urgent), split (Non-Urgent)
         TYPE       = matching Urgent + Hard → both                ⇒ Icon 1 */
    const rows = [both, split, far];
    const live = sel({ type: ['Icon'], urgency: ['Urgent'], difficulty: ['Hard'] });
    expect(ids(rows.filter((r) => recipe.pipeMatches(r, live, null)))).toEqual(['both']);
    const facets = recipe.pipeFacetList(rows, live);
    expect(counts(facets, 'type'), 'UI is nowhere — far failed two axes').toEqual([['Icon', 1]]);
    expect(counts(facets, 'difficulty')).toEqual([['Easy', 1], ['Hard', 1]]);
    expect(counts(facets, 'urgency')).toEqual([['Non-Urgent', 1], ['Urgent', 1]]);
    for (const f of recipe.PIPE_FILTERS) expect(asMap(facets, f.key), `pool ${f.key}, by the rule`).toEqual(byRule(rows, live, f.key));
  });

  it('"except axis j" IS the selection with j removed — on a work axis too, with the other one live (B12)', () => {
    /* the definition the pools are drawn from. Before B12, "except
       difficulty" skipped DIFFICULTY's own test but handed the FULL selection
       to URGENCY's child filter, so `split` was asked for a child that is
       Urgent AND Hard after all — j leaked back in through the other work
       axis, and the rule above could not hold. */
    const rows = [both, split, far, row({ cardId: 'lone', mcNumber: 'MC-4', assetType: 'Icon' })];
    const live = sel({ type: ['Icon'], urgency: ['Urgent'], difficulty: ['Hard'] });
    for (const r of rows) for (const f of recipe.PIPE_FILTERS) {
      expect(recipe.pipeMatches(r, live, f.key), `${ids([r])[0]} except ${f.key}`).toBe(recipe.pipeMatches(r, { ...live, [f.key]: [] }, null));
    }
    // the concrete case: split has an Urgent child and a Hard child, so it
    // survives either work axis being ignored — only the conjunction fails it
    expect(recipe.pipeMatches(split, live, 'difficulty')).toBe(true);
    expect(recipe.pipeMatches(split, live, 'urgency')).toBe(true);
    expect(recipe.pipeMatches(split, live, null)).toBe(false);
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

/* ---------------------------------------------------------------------- */
/* F — "None" is a value (owl #63, closing R-pf-i)                          */
/* ---------------------------------------------------------------------- */

const facet = (rows: unknown[], key: string, sel: Record<string, (string | null)[]> = recipe.PIPE_FILTERS_EMPTY()) =>
  recipe.pipeFacetList(rows, sel).find((f) => f.key === key)!;

describe('absence is selectable on the axis that can lack a value', () => {
  it('offers None on TYPE and DIFFICULTY, and never on URGENCY or STATUS', () => {
    /* AMENDED twice on 2026-09-05. Block 1 parked DIFFICULTY with its column
       and left TYPE the one none-bearing axis; block 4 (owl #78 §4, F11)
       brings DIFFICULTY back over the WORK cards, and None with it — a card
       with no difficulty label is exactly the incomplete work a PM filters
       for. The RULE is untouched: an axis whose subject can carry no value
       must offer the absence. URGENCY offers none because every card carries
       one (Non-Urgent IS the absence of the label, and it is a value); STATUS
       because every card sits in a Trello list. */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', work: [wc()] }),
      row({ cardId: 'b', mcNumber: 'MC-2', assetType: 'Icon', currentList: 'Design', work: [wc({ difficulty: 'Easy' })] }),
    ];
    const labels = (k: string) => facet(rows, k).values.map((v) => v.label);
    expect(labels('type')).toContain('None');
    expect(labels('difficulty')).toContain('None');
    expect(labels('urgency')).not.toContain('None');
    expect(labels('status')).not.toContain('None');
    // the flags say the same, so the chip and the matcher agree with the panel
    const none = Object.fromEntries(recipe.PIPE_FILTERS.map((f) => [f.key, !!f.none]));
    expect(none).toEqual({ type: true, difficulty: true, urgency: false, status: false });
  });

  it('offers None on DIFFICULTY only through an unlabelled MATCHING child — never for a childless group', () => {
    /* the work-axis half of "None is derived": a childless MC has no card to
       lack a label, so it contributes no None; a group whose only unlabelled
       card is filtered out by ANOTHER live work axis does not either — the
       reader would tick None and see a group with nothing unlabelled in it */
    const childless = [row({ cardId: 'a', mcNumber: 'MC-1' })];
    expect(recipe.pipeFacetList(childless, sel()).find((f) => f.key === 'difficulty')).toBeUndefined();

    const labelled = [row({ cardId: 'a', mcNumber: 'MC-1', work: [wc({ difficulty: 'Hard' }), wc({ cardId: 'w2', difficulty: 'Easy' })] })];
    expect(facet(labelled, 'difficulty').values.map((v) => v.label)).not.toContain('None');

    const oneUnlabelled = [row({ cardId: 'a', mcNumber: 'MC-1', work: [wc({ difficulty: 'Hard', urgency: 'Urgent' }), wc({ cardId: 'w2' })] })];
    expect(facet(oneUnlabelled, 'difficulty').values.map((v) => [v.label, v.count])).toEqual([['Hard', 1], ['None', 1]]);
    // the quiet unlabelled card is not a match under Urgency = Urgent, so None goes
    expect(facet(oneUnlabelled, 'difficulty', sel({ urgency: ['Urgent'] })).values.map((v) => v.label)).toEqual(['Hard']);
    // …and selecting None reaches exactly the groups with an unlabelled matching card
    const rows = [...labelled, ...oneUnlabelled.map((r) => ({ ...r, cardId: 'b', mcNumber: 'MC-2' })), ...childless.map((r) => ({ ...r, cardId: 'c', mcNumber: 'MC-3' }))];
    expect(rows.filter((r) => recipe.pipeMatches(r, sel({ difficulty: [null] }), null)).map((r) => r.cardId)).toEqual(['b']);
  });

  it('DERIVES None like every other value — a complete board never shows it', () => {
    /* the axes are built from what the board carries, so None is not a fixed
       sixth checkbox that sits there reading zero */
    const rows = [row({ cardId: 'a', assetType: 'Icon' }), row({ cardId: 'b', assetType: 'UI' })];
    expect(facet(rows, 'type').values.map((v) => v.label)).toEqual(['Icon', 'UI']);
  });

  it('selects exactly the rows with no value there', () => {
    // read on TYPE since #78 parked the difficulty axis; the rule is unchanged
    const rows = [
      row({ cardId: 'a', assetType: 'Icon' }),
      row({ cardId: 'b' }),
      row({ cardId: 'c', assetType: '' }), // empty string is absence too
    ];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: [null] };
    const hit = rows.filter((r) => recipe.pipeMatches(r, sel, null)).map((r) => r.cardId);
    expect(hit).toEqual(['b', 'c']);
  });

  it('THE POINT — every row is now reachable, which is what R-pf-i said was broken', () => {
    /* before this, the rows carrying no type were the only rows no filter could
       select, and they are the incomplete rows most needing attention. Stated
       as a sum: on an axis that admits absence, the values account for the
       whole board. (URGENCY and STATUS are NOT asserted to reconcile — owl #63
       retracted that, and on a real board they do not.) */
    const rows = [
      row({ cardId: 'a', assetType: 'Icon' }),
      row({ cardId: 'b', assetType: 'UI' }),
      row({ cardId: 'c' }),
      row({ cardId: 'd' }),
    ];
    /* The sum is asserted over the `none`-marked MAIN-row axes rather than
       a named list. Block 4's DIFFICULTY is none-bearing too but counts
       GROUPS through children (B4): a group with a Hard card and an
       unlabelled one is counted under BOTH values, so its sum is not a row
       count — the reachability it owes is proven as a union, below. */
    const noneMain = recipe.PIPE_FILTERS.filter((f) => f.none && !f.work).map((f) => f.key);
    expect(noneMain, 'no main axis admits absence — the sum would hold vacuously').toContain('type');
    for (const key of noneMain) {
      const total = facet(rows, key).values.reduce((n, v) => n + v.count, 0);
      expect(total, key).toBe(rows.length);
    }
  });

  it('THE POINT on a WORK axis — every group with a child is reachable through the values the panel offers', () => {
    /* the same reachability, stated the way a group axis can honour it: tick
       every value DIFFICULTY offers and every group that has a child comes
       back — the unlabelled ones through None. The childless group is the one
       exception, by construction (E2), and it is asserted as one. */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', work: [wc({ difficulty: 'Hard' })] }),
      row({ cardId: 'b', mcNumber: 'MC-2', work: [wc()] }),
      row({ cardId: 'c', mcNumber: 'MC-3', work: [wc({ difficulty: 'Easy' }), wc({ cardId: 'w2' })] }),
      row({ cardId: 'd', mcNumber: 'MC-4' }),
    ];
    const noneWork = recipe.PIPE_FILTERS.filter((f) => f.none && f.work).map((f) => f.key);
    expect(noneWork, 'no work axis admits absence — the union would hold vacuously').toContain('difficulty');
    for (const key of noneWork) {
      const all = facet(rows, key).values.map((v) => v.value);
      expect(all, key).toContain(null);
      const reached = rows.filter((r) => recipe.pipeMatches(r, sel({ [key]: all }), null)).map((r) => r.cardId);
      expect(reached, key).toEqual(['a', 'b', 'c']);
    }
  });

  it('stores None as null, so a board value that IS the word stays separate', () => {
    /* a Trello asset-type label could legitimately be called None; merging the
       two into one checkbox would silently mis-count both. Read on TYPE since
       #78 — it was REQUESTOR's case before, and the axis went with its column. */
    const rows = [
      row({ cardId: 'a', assetType: 'None' }),
      row({ cardId: 'b' }),
    ];
    const values = facet(rows, 'type').values;
    expect(values.map((v) => v.label)).toEqual(['None', 'None']);
    expect(values.map((v) => v.value)).toEqual(['None', null]);
    expect(values.map((v) => v.count)).toEqual([1, 1]);

    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['None'] };
    expect(rows.filter((r) => recipe.pipeMatches(r, sel, null)).map((r) => r.cardId)).toEqual(['a']);
  });

  it('sorts None LAST — it is the residue, not a value in the vocabulary', () => {
    /* alphabetically None would land mid-list and push the real vocabulary
       down. The ORDERED half of this rule rode on DIFFICULTY (`order:
       ['Easy','Medium','Hard']`, where None has no place at all), parked with
       that axis in block 1, and is back under test below (block 4, F2). */
    const rows = [
      row({ cardId: 'a', assetType: 'Zeppelin' }),
      row({ cardId: 'b', assetType: 'Animation' }),
      row({ cardId: 'c' }),
    ];
    expect(facet(rows, 'type').values.map((v) => v.label)).toEqual(['Animation', 'Zeppelin', 'None']);
  });

  it('reads DIFFICULTY in its own progression — Easy, Medium, Hard — then None; URGENCY Non-Urgent then Urgent', () => {
    /* the `order` branch, live again: alphabetically Hard would sit between
       Easy and Medium, and the panel would read as a list of words rather
       than a scale. Fed in reverse so the sort has to do the work. */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', work: [wc()] }),
      row({ cardId: 'b', mcNumber: 'MC-2', work: [wc({ difficulty: 'Hard', urgency: 'Urgent' })] }),
      row({ cardId: 'c', mcNumber: 'MC-3', work: [wc({ difficulty: 'Medium' })] }),
      row({ cardId: 'd', mcNumber: 'MC-4', work: [wc({ difficulty: 'Easy' })] }),
    ];
    expect(facet(rows, 'difficulty').values.map((v) => v.label)).toEqual(['Easy', 'Medium', 'Hard', 'None']);
    expect(facet(rows, 'urgency').values.map((v) => v.label)).toEqual(['Non-Urgent', 'Urgent']);
    // the orders are the axes' own, derived — not a second list typed here
    const by = Object.fromEntries(recipe.PIPE_FILTERS.map((f) => [f.key, f]));
    expect(by.difficulty!.order).toEqual(['Easy', 'Medium', 'Hard']);
    expect(by.urgency!.order).toEqual(['Non-Urgent', 'Urgent']);
  });

  it('keeps STATUS alphabetical — the wire carries no list position (R-pf-e stands, B8)', () => {
    /* #78 §4 asks for Trello LIST order; nothing on the wire says what that
       is, and inventing one from the names would be a second order the board
       could contradict. Alphabetical until the ARES read API carries a
       position (backlog). Asserted as "no `order` declared" plus the result. */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', currentList: 'Working on design' }),
      row({ cardId: 'b', mcNumber: 'MC-2', currentList: 'Backlogs: Icon' }),
      row({ cardId: 'c', mcNumber: 'MC-3', currentList: 'Render: Ready for Client Review' }),
    ];
    expect(recipe.PIPE_FILTERS.find((f) => f.key === 'status')!.order).toBeUndefined();
    expect(facet(rows, 'status').values.map((v) => v.label)).toEqual(['Backlogs: Icon', 'Render: Ready for Client Review', 'Working on design']);
  });

  it('still ignores its own axis when None is the selection', () => {
    /* R-pf-c has to hold for None as well, or picking it would strip every
       sibling value to zero and there would be no way back without clearing */
    const rows = [row({ cardId: 'a' }), row({ cardId: 'b', assetType: 'Icon' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: [null] };
    expect(facet(rows, 'type', sel).values.map((v) => [v.label, v.count])).toEqual([['Icon', 1], ['None', 1]]);
  });

  it('draws the label and toggles the value — they differ for exactly this item', () => {
    expect(TEMPLATE).toContain('<span class="pmval">{{v.label}}</span>');
    // one partial serves both panels now — the row is written once
    expect(TEMPLATE).toContain("on-click=\"['togglePipeFilter', key, v.value]\"");
  });
});

/* ---------------------------------------------------------------------- */
/* F2 — the review pass, 2026-08-21: three defects the suite had not seen    */
/* ---------------------------------------------------------------------- */

describe('the panels can actually open, and stay open', () => {
  it('SHIELDS both triggers and the panel from the outside-click dismisser', () => {
    /* THE DEFECT: `pipeSortMenu`/`pipeFilterMenu` joined OVERLAY_KEYS but not
       the dismisser's hand-written selector string. Ractive's own click handler
       runs first, so by the time the document listener fired an overlay WAS
       open, nothing in the ignore list matched, and closeMenus() shut it again
       in the same event — neither panel could appear at all. Every checkbox
       click closed it too, against the explicit "the panel STAYS OPEN" rule. */
    const shields = decl(APP_JS, 'OVERLAY_SHIELDS');
    const keys = decl(APP_JS, 'OVERLAY_KEYS');
    for (const key of ['pipeSortMenu', 'pipeFilterMenu', 'warnPop', 'reqMenu', 'duePopover', 'urgencyMenu', 'diffMenu']) {
      expect(keys, `${key} is an overlay`).toContain(key);
      expect(shields, `${key} has no shield — its own click would dismiss it`).toContain(`${key}:`);
    }
    expect(shields).toContain('.sfbtn');
    expect(shields).toContain('.pipemenu');
  });

  it('derives the ignore list FROM that map, so the two cannot drift again', () => {
    // the whole failure was two lists that had to agree by hand
    expect(APP_JS).toContain('const OVERLAY_SHIELD = ');
    expect(fnBody('anyMenuOpen')).toContain('OVERLAY_KEYS');
    expect(APP_JS).toContain('e.target.closest(OVERLAY_SHIELD)');
  });

  it('does not let a scroll inside the STATUS group dismiss the panel', () => {
    /* the group is a deliberate internal scroller, so a wheel over it reached
       the capture-phase dismisser and shut the panel — the exact failure the
       due popover and the Requests select are already shielded from */
    expect(decl(APP_JS, 'OVERLAY_SELF_SCROLL')).toContain('.pipemenu');
    expect(cssRule('.pipemenu .pmscroll', PIPELINE_CSS)).toContain('overflow-y: auto');
  });
});

describe('the panels are ANCHORED to their trigger, never measured (JP, 2026-08-21)', () => {
  it('hangs BOTH panels off the container, not off either button', () => {
    /* THE RULE: one opening position, whichever button was pressed. Anchored to
       its own trigger instead, the filter panel travels up to 196px sideways —
       the sort button grows from 38px to as much as 240px when it names its
       selection, and drags the filter button along with it. Measured live
       before the change: the filter panel sat 4px from the window edge with no
       sort applied and 72px with one. A per-button wrapper is what would
       reintroduce that, so its absence is the assertion. */
    expect(TEMPLATE).not.toContain('sfwrap');
    const row = TEMPLATE.slice(TEMPLATE.indexOf('class="sortfilter"'));
    const rowEnd = row.indexOf('pscrollwrap');
    const inside = row.slice(0, rowEnd);
    expect(inside, 'the filter panel left the container').toContain('pipemenu filtermenu');
    expect(inside, 'the sort panel left the container').toContain('pipemenu sortmenu');
  });

  it('positions in CSS off the row whose right edge cannot move', () => {
    /* `.sortfilter` ends at the page inset, so `right: 0` on it is a fixed
       point — which is the whole reason this anchor was chosen over the two
       that were built first */
    /* `.pipemenu` is the SURFACE only — three panels wear it and they do not
       hang off the same thing, so each anchor is named by its own container. */
    expect(cssRule('.pipemenu', PIPELINE_CSS)).toContain('position: absolute');
    expect(cssRule('.sortfilter .pipemenu', PIPELINE_CSS)).toContain('right: 0');
    expect(cssRule('.sortfilter .pipemenu', PIPELINE_CSS)).toContain('top: 100%');
    expect(cssRule('.sortfilter', PIPELINE_CSS)).toContain('position: relative');
  });

  it('carries NO inline coordinates and asks for no placement', () => {
    // the whole point: nothing computes a left or a top for these two
    expect(TEMPLATE).not.toContain('pipeSortMenuPos');
    expect(TEMPLATE).not.toContain('pipeFilterMenuPos');
    expect(APP_JS).not.toContain('pipeSortMenuPos');
    expect(APP_JS).not.toContain('PIPE_FILTER_H');
    // the handlers are object methods, not top-level functions — read the
    // shipped call itself
    expect(APP_JS).toContain("openOverlay(ctx, 'filter', { key: 'pipeFilterMenu' })");
    expect(APP_JS).toContain("openOverlay(ctx, 'sort', { key: 'pipeSortMenu' })");
  });

  it('keeps placement OPTIONAL in the shared opener, not deleted from it', () => {
    /* the three overlays that float free of any wrapper still measure — the
       door stays one door, and `posKey` is what says "this one needs coords" */
    const opener = fnBody('openOverlay');
    expect(opener).toContain('opts.posKey');
    expect(opener).toContain('placeBox(');
    expect(fnBody('showWarnPop')).toContain('posKey');
  });
});

describe('the panels sit on the frame’s own geometry (JP, 2026-08-21)', () => {
  it('lands the item content FLUSH with its group heading', () => {
    /* Measured off nodes 592:56913 (sort) and 593:78434 (filter): the heading
       text sits 24px inside the group, and the item's content 16px inside an
       item box that is itself 8px inside the panel — so both land on the same
       left edge. At 8px the rows hung 8px left of every heading above them. */
    const head = cssRule('.pipemenu .pmhead', PIPELINE_CSS);
    const items = cssRule('.pipemenu .pmitems', PIPELINE_CSS);
    expect(head).toContain('padding: 2px var(--space-16) var(--space-8)');
    expect(items).toContain('padding: 0 var(--space-8) var(--space-8)');
    /* THE PROPERTY: the checkbox and the heading share a left edge. The heading
       is inset once, by its own padding; the checkbox twice, by the list's and
       the row's. JP revised both on 2026-08-21 so the two sums agree at 16 —
       17px from the panel edge once the border is counted. */
    const px = (v: string) => ({ '--space-8': 8, '--space-16': 16, '--space-24': 24 })[v]!;
    expect(px('--space-8') + px('--space-8'), 'the item content left the heading’s edge').toBe(px('--space-16'));
  });

  it('renders BOTH panels’ group headings in capitals, as the frame draws them', () => {
    /* the filter axes spell their labels in capitals in the data; the sort
       groups are spelt in title case (`Dates`, `Identity`), which is what the
       comparator table wants to be read as — so the case is applied at
       display, once, and the sort panel stops disagreeing with the filter
       panel beside it */
    expect(cssRule('.pipemenu .pmhead', PIPELINE_CSS)).toContain('text-transform: uppercase');
    expect(recipe.PIPE_SORTS.map((s) => s.group)).toContain('Dates');
  });

  it('draws the SELECTED sort as a filled pill, not as bold text', () => {
    /* node 592:56954, the item's `State` variant `Selected`: slate-900 ground,
       white label, 6px radius — and the weight stays Regular. Bold is the
       obvious way to mark a choice and it is not what the frame does. */
    const on = cssRule('.sortmenu .pmitem.on', PIPELINE_CSS);
    expect(on).toContain('background: var(--slate-900)');
    expect(on).toContain('color: var(--white)');
    expect(on).toContain('border-radius: var(--radius-input)');
    expect(on).not.toContain('font-weight');
  });

  it('colours Clear by the button’s two variants — blue live, slate disabled', () => {
    /* Button-Small carries a `Color` variant: `Blue` #1d4ed8 while there is a
       sort to clear, `Disabled` #94a3b8 when there is not. It read slate in
       both states before. */
    /* de-scoped from `.pipemenu`: the chip row's Clear all wears the same
       recipe rather than a copy of it */
    expect(cssRule('.pmclear', PIPELINE_CSS)).toContain('color: var(--blue-700)');
    expect(cssRule('.pmclear[disabled]', PIPELINE_CSS)).toContain('color: var(--slate-400)');
    expect(TEMPLATE).toContain('class="pmclear fclearall"');
  });

  it('TICKS the checked box instead of just filling it', () => {
    /* the checked box was a plain dark square. The Checkbox component fills the
       box AND shows a white check inside it — without the tick the two states
       differ only by colour, which reads as a swatch rather than a checkbox. */
    const box = cssRule('.pipemenu .pmbox', PIPELINE_CSS);
    expect(box).toContain('border-radius: var(--radius-sm)'); // 4px, was 2
    expect(box).toContain('position: relative');
    const tick = cssRule('.pipemenu .pmitem.on .pmbox::after', PIPELINE_CSS);
    expect(tick).toContain('border-left: 2px solid var(--white)');
    expect(tick).toContain('rotate(-45deg)');
  });

  it('does NOT bold a checked filter value — the box is the whole signal', () => {
    /* checked and unchecked labels are identical in the frame: 14px, weight
       400, slate-900, and the row keeps its `Default` variant. Bolding is the
       intuitive move and it is not what the component does. */
    expect(PIPELINE_CSS).not.toContain('.filtermenu .pmitem.on { font-weight');
  });

  it('wraps a sort label at 160px, where a filter value ellipsises', () => {
    /* what makes `Due dates closest to now` the two-line 53px row the frame
       draws rather than a one-line 32px one */
    /* the cap earns its keep only in the sort panel, where it drives the wrap.
       On a filter value it truncated long Trello list names with empty space
       still to their right, so JP had it removed there. */
    expect(cssRule('.pipemenu .pmwrap', PIPELINE_CSS)).toContain('max-width: 160px');
    expect(cssRule('.pipemenu .pmval', PIPELINE_CSS)).toContain('text-overflow: ellipsis');
    expect(cssRule('.pipemenu .pmval', PIPELINE_CSS)).not.toContain('max-width');
    expect(TEMPLATE).toContain('<span class="pmwrap">{{it.label}}</span>');
  });

  it('spaces the groups and the footer the way the frame measures them', () => {
    /* 18px from the separator to the next heading (Content's 16px gap plus the
       group's own 2px), and 16px from the last row to the footer rule (the item
       list's 8px plus the content-to-button 8px). Both ran 8px short. */
    expect(cssRule('.pipemenu .pmitems + .pmhead', PIPELINE_CSS)).toContain('padding-top: 18px');
    /* the gap before the footer belongs to the SORT panel alone: its dropdown's
       auto-layout carries `spacing: 8` and the filter's carries `spacing: 0`.
       One shared component, two different numbers. */
    expect(cssRule('.sortmenu .pmfoot', PIPELINE_CSS)).toContain('margin-top: var(--space-8)');
    expect(cssRule('.pipemenu .pmfoot', PIPELINE_CSS)).not.toContain('margin-top');
    /* 6 above the text and 5 below is the frame's vertical asymmetry (a 32px
       row). The SIDES are 16 right / 8 left — with the list's own 8, that lands
       the checkbox on 17px, level with the heading above it. Deliberately not
       symmetric: aligning the checkbox to the heading and evening the two
       insets cannot both hold with these two rules. */
    expect(cssRule('.pipemenu .pmitem', PIPELINE_CSS)).toContain('padding: 6px var(--space-16) 5px var(--space-8)');
  });

  it('wears the CARD-ISSUE popover’s shadow, not the light chrome one', () => {
    /* The panels float over a dense table; the 1px stroke alone did not lift
       them off it. Same reasoning that gave the card-issue popover the heavier
       value in owl #53 — and the two must not drift apart again. */
    expect(cssRule('.pipemenu', PIPELINE_CSS)).toContain('box-shadow: var(--shadow-card)');
    expect(cssRule('.warnpop', PIPELINE_CSS)).toContain('box-shadow: var(--shadow-card)');
  });
});

describe('the search field keeps its own recipe', () => {
  it('declares the SHARED .searchbar base — three tabs wear it', () => {
    /* THE DEFECT: owl #62 wrapped the field in `.pipetools` and deleted this
       block in the same hunk. Without `display: flex` the icon and the input
       stacked vertically on Pipeline, Requests AND Deadlines, and the two
       modifier rules (`.reqsearch`, `.dlsearch`) were left modifying nothing. */
    const base = cssRule('.searchbar', PIPELINE_CSS);
    expect(base).toContain('display: flex');
    expect(base).toContain('align-items: center');
    expect(base).toContain('gap: var(--space-8)');
    expect(base).toContain('border-bottom');
  });
});

describe('the default order’s index survives the next syncIndexes', () => {
  it('is DECLARED ON THE SCHEMA, not only created by migration 008', () => {
    /* THE DEFECT: 008 created `project_filed_desc` with a raw createIndex while
       every other index in the codebase is declared on the schema and applied
       through `Model.syncIndexes()` — which DROPS anything it does not find
       there. It worked on a fresh run and would have been removed silently by
       the next migration that followed the established pattern. The name is
       matched so syncIndexes adopts the existing index instead of rebuilding
       it. */
    const models = readFileSync(new URL('../src/models/index.ts', import.meta.url), 'utf8');
    const mig = readFileSync(new URL('../scripts/migrate/migrations.ts', import.meta.url), 'utf8');
    expect(mig).toContain("name: 'project_filed_desc'");
    expect(models).toContain('trello_created_at: -1');
    expect(models).toContain("name: 'project_filed_desc'");
  });
});

describe('a picked filter value never disappears while it is still filtering', () => {
  it('keeps its checkbox at zero when a search eliminates every row carrying it', () => {
    /* seeded only from the searched rows, the value vanished from the panel:
       an empty table, a Filter button still reading "1 applied", and no way to
       un-pick it short of Clear */
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] };
    const values = facet([row({ cardId: 'a', assetType: 'UI' })], 'type', sel).values;
    const icon = values.find((v) => v.label === 'Icon');
    expect(icon, 'the picked value left the panel').toBeTruthy();
    expect([icon!.count, icon!.on]).toEqual([0, true]);
  });
});

/* ---------------------------------------------------------------------- */
/* F3 — the filter indicator (node 593:79380)                               */
/* ---------------------------------------------------------------------- */

describe('the filter indicator says what is filtered, in words', () => {
  const chips = (sel: Record<string, (string | null)[]>) =>
    recipe.pipeChipList({ ...recipe.PIPE_FILTERS_EMPTY(), ...sel });

  it('makes ONE CHIP PER AXIS, listing that axis’s values', () => {
    /* not one chip per value: the frame's `Number` variant counts the values
       INSIDE a chip, and its `2` variant is a single chip listing two of them
       under one axis name and one ✕ (node 566:52332). */
    expect(chips({ type: ['Icon', 'Asset'] })).toEqual([
      { key: 'type', label: 'Type', text: 'Icon, Asset', on: true },
    ]);
  });

  it('names the axis from the panel’s own heading, not a second list', () => {
    /* every axis label is one word, so the chip name is derived — an axis
       restored by #78 §4 needs no entry anywhere for its chip to read
       correctly. Asserted as the DERIVATION rather than against two named
       axes, which is what survives the panel shrinking to two and growing
       back to four. */
    expect(chips({ status: ['Design'] })[0]!.label).toBe('Status');
    expect(chips({ type: ['Icon'] })[0]!.label).toBe('Type');
    for (const f of recipe.PIPE_FILTERS) {
      expect(f.label, f.key).toBe(recipe.PIPE_COLS.find((c) => c.cls === f.col)!.label);
    }
  });

  it('shows the absence value as the word the panel draws it with', () => {
    expect(chips({ type: [null] })[0]!.text).toBe('None');
  });

  it('shows a chip for EVERY filtered axis, and none for the rest', () => {
    expect(chips({ type: ['Icon'], status: [] }).map((c) => c.key)).toEqual(['type']);
    expect(chips({ type: ['Icon'], status: ['Design'] }).map((c) => c.key)).toEqual(['type', 'status']);
    expect(chips({})).toEqual([]);
  });

  it('renders nothing at all when nothing is filtered', () => {
    expect(TEMPLATE).toContain('{{#if pipeChips.length}}');
  });

  it('WRAPS the row rather than collapsing or scrolling it (JP)', () => {
    /* the frame only ever draws one chip; four axes can be filtered at once
       (block 4) and wrapping is what keeps each one separately removable */
    expect(cssRule('.fchips', PIPELINE_CSS)).toContain('flex-wrap: wrap');
  });

  it('names a WORK axis chip the way it names a main one — "Difficulty is Hard"', () => {
    // the chip derives from PIPE_FILTERS, so the restored axes need no entry;
    // asserted so a restore that forgot the label would show here, not in E2E
    expect(chips({ difficulty: ['Hard'] })).toEqual([{ key: 'difficulty', label: 'Difficulty', text: 'Hard', on: true }]);
    expect(chips({ urgency: ['Urgent'], type: ['Icon'] }).map((c) => c.key)).toEqual(['type', 'urgency']); // panel order, not tick order
    expect(chips({ difficulty: [null] })[0]!.text).toBe('None');
  });

  it('counts the axes in its prose the way the consts count them', () => {
    /* the template and the stylesheet both explain the wrap by saying how
       many axes can be filtered at once; the number is the axis table's, and
       "five" (owl #62's panel) survived block 1 unread */
    expect(recipe.PIPE_FILTERS).toHaveLength(4);
    expect(TEMPLATE).not.toContain('five axes');
    expect(PIPELINE_CSS).not.toContain('five axes');
  });

  it('TRIMS a long value instead of letting one chip take the row', () => {
    /* a real status value such as `Render: Ready for Client Review` would
       otherwise push every other chip onto its own line */
    const vals = cssRule('.fchip .fcvals', PIPELINE_CSS);
    expect(vals).toContain('max-width');
    expect(vals).toContain('text-overflow: ellipsis');
    expect(TEMPLATE).toContain('title="{{c.text}}"'); // the full text stays reachable
  });

  it('costs a walk of the SELECTION only, until a panel is actually open', () => {
    /* `pipeChips` is always live — the row's `{{#if}}` binds it — so reading
       `pipeFacets` unconditionally put the whole facet recount back on the
       search-keystroke path, even with no filter applied and no panel open.
       Values are joined on for the ONE open chip and no other. */
    const body = method('pipeChips');
    expect(body).toContain("this.get('pipeFilters')");
    expect(body).toContain("this.get('chipPop')");
    expect(body.indexOf("this.get('chipPop')")).toBeLessThan(body.indexOf("this.get('pipeFacets')"));
    expect(body).toMatch(/if \(!open\) return chips;/);
  });

  it('INVERTS the chip on hover, keeping the quiet/loud contrast', () => {
    /* JP, 2026-08-21. The axis stays the dimmer half against the dark ground
       and the values stay the bright one — flattening both to white would turn
       the chip into a block of text instead of a sentence. */
    expect(cssRule('.fchip:hover', PIPELINE_CSS)).toContain('background: var(--slate-900)');
    expect(cssRule('.fchip:hover .fcvals', PIPELINE_CSS)).toContain('var(--white)');
    expect(cssRule('.fchip:hover .fcaxis', PIPELINE_CSS)).toContain('var(--slate-400)');
  });

  it('keeps the row COMPACT — no margin of its own', () => {
    expect(cssRule('.fchips', PIPELINE_CSS)).not.toContain('margin');
  });

  it('opens the chip’s OWN group on hover, cut down as the frame sets it', () => {
    /* node 593:80073 is the same dropdown component with the footer button and
       the scrollbar switched OFF and the box clipped to one group — so the
       panel wears `.pipemenu` for its chrome and renders a single heading and
       one item list, with no `.pmfoot`. */
    const view = TEMPLATE.slice(TEMPLATE.indexOf('class="fchips"'));
    const chip = view.slice(0, view.indexOf('fclearall'));
    expect(chip).toContain('{{#if chipPop === c.key}}');
    expect(chip).toContain('class="pipemenu chipmenu {{#if chipPopFlip}}flip{{/if}}"');
    expect(chip).not.toContain('pmfoot');
    // it anchors LEFT, to the chip — the shared rule anchors right, to the row
    /* two classes, because `.pipemenu` anchors right and is declared later —
       a single-class rule lost the cascade and only looked right because a box
       with left, right and width is over-constrained. `-1px` because `left`
       resolves against the chip's padding box, inside its 1px border. */
    expect(cssRule('.fchip .pipemenu', PIPELINE_CSS)).toContain('left: -1px');
    expect(cssRule('.fchip', PIPELINE_CSS)).toContain('position: relative');
  });

  it('insets the chip panel 16px, and wins the cascade to do it', () => {
    /* One group and no footer, so the shared 20px reads as slack. Asserted on
       `.fchip .pipemenu` because a single-class `.chipmenu` override loses to
       the shared rules declared later in the file — that had already silently
       cost the list's zeroed bottom padding, under a comment claiming
       otherwise. Two classes cannot lose, whatever the order. */
    const rule = cssRule('.fchip .pipemenu', PIPELINE_CSS);
    expect(rule).toContain('padding-top: var(--space-16)');
    expect(rule).toContain('padding-bottom: var(--space-16)');
    expect(cssRule('.fchip .pipemenu .pmitems', PIPELINE_CSS)).toContain('padding-bottom: 0');
    // the shared panel keeps its own, larger inset
    expect(cssRule('.pipemenu', PIPELINE_CSS)).toContain('padding-top: 20px');
  });

  it('lets the pointer REACH the panel — a bridge and a shared close delay', () => {
    /* the panel sits 4px clear of the chip, so without a bridge the pointer
       crosses dead space, mouseleave fires, and the close can run out before it
       arrives. The panel is also a DOM child of the chip, which is what makes
       the containment guard cover the whole journey. */
    // one bridge recipe, shared with the warning card's, in the gap's own token
    expect(cssRule('.warnpop::before, .chipmenu::before', PIPELINE_CSS)).toContain('height: var(--space-4)');
    const body = handlerBody('chipPopOut');
    expect(body).toContain('relatedTarget');
    expect(body).toContain('ctx.node.contains(to)');
    expect(body).toContain('scheduleHoverClose(');
    expect(body.indexOf('relatedTarget')).toBeLessThan(body.indexOf('scheduleHoverClose('));
  });

  it('CLOSES ITSELF when the axis it names goes empty', () => {
    /* Clearing the last value unmounts the chip, but `chipPop` kept naming it —
       `anyMenuOpen()` then stayed true against a panel nobody could see, and
       every hover overlay refused to open until an unshielded click. Neither
       route out fires on its own: the ✕ and the panel are both inside
       OVERLAY_SHIELD. Stated once, as an observer, rather than in each handler
       that can empty an axis. */
    expect(APP_JS).toContain("app.observe('pipeFilters'");
    const at = APP_JS.indexOf("app.observe('pipeFilters'");
    const body = APP_JS.slice(at, at + 300);
    expect(body).toContain("app.get('chipPop')");
    expect(body).toContain("app.set('chipPop', null)");
  });

  it('does NOT let a page scroll dismiss an anchored panel', () => {
    /* An anchored panel moves WITH the page, so a scroll cannot detach it from
       its trigger — and dismissing anyway made its lower half unreachable on a
       short viewport, because the only way to reach it is to scroll. */
    const anchored = decl(APP_JS, 'OVERLAY_ANCHORED');
    for (const k of ['pipeSortMenu', 'pipeFilterMenu', 'chipPop']) expect(anchored).toContain(k);
    expect(APP_JS).toContain('OVERLAY_ANCHORED.indexOf(k) > -1');
  });

  it('FLIPS the chip panel rather than running it off the right edge', () => {
    /* the chips row wraps, so a chip can sit far enough right that a
       left-anchored 276px panel leaves the viewport — unreachable rows and a
       page scrollbar. The width is a constant, so the decision needs the chip's
       own box and nothing measured after render. */
    const body = handlerBody('chipPopIn');
    expect(body).toContain('PIPE_MENU_W');
    expect(body).toContain("app.set('chipPopFlip'");
    expect(cssRule('.fchip .pipemenu.flip', PIPELINE_CSS)).toContain('right: -1px');
  });

  it('opens on FOCUS as well as hover — the panel holds real controls', () => {
    // the warning card's own rule: a pointer-only overlay puts its contents out
    // of a keyboard user's reach
    const view = TEMPLATE.slice(TEMPLATE.indexOf('class="fchips"'));
    expect(view).toContain("on-focusin=\"['chipPopIn', c.key]\"");
    expect(view).toContain("on-focusout=\"['chipPopOut']\"");
  });

  it('joins the overlay list, so Escape and an outside click dismiss it', () => {
    const keys = decl(APP_JS, 'OVERLAY_KEYS');
    const shields = decl(APP_JS, 'OVERLAY_SHIELDS');
    expect(keys).toContain('chipPop');
    expect(shields, 'chipPop has no shield — its own hover would dismiss it').toContain('chipPop:');
    expect(shields).toContain('.fchip');
  });

  it('REFUSES to open over another overlay, and is not a toggle on re-entry', () => {
    /* a chip merely grazed while the Filter panel is up must not replace it
       (R-warn-r's rule, from the other side), and re-entering the same chip is
       not a second click */
    /* both rules now live in ONE hover-open policy, and the cancel deliberately
       comes AFTER the refusal — cancelling first cancels somebody else's pending
       close and never reschedules it, stranding their overlay open. */
    const policy = fnBody('openHoverOverlay');
    expect(policy).toContain('k !== key && app.get(k)');
    expect(policy).toContain('app.get(key) === id');
    expect(policy.indexOf('app.get(k)')).toBeLessThan(policy.indexOf('warnPopCancelClose()'));
    expect(APP_JS).toContain("openHoverOverlay('chipPop', key)");
    expect(fnBody('showWarnPop')).toContain("openHoverOverlay('warnPop', cardId)");
  });

  it('ticks through the SAME handler the main panel uses', () => {
    // one way to change a filter, so the two panels cannot diverge
    // both panels render the same partial, so there is one row and one handler
    expect(TEMPLATE).toContain('{{>filterGroup f}}');
    expect(TEMPLATE).toContain('{{>filterGroup c}}');
  });

  it('shares ONE hover-close scheduler with the warning card', () => {
    // two timers is the shape that leaks: the older fires against state it was
    // never scheduled for
    expect([...APP_JS.matchAll(/warnCloseTimer\s*=\s*setTimeout\(/g)]).toHaveLength(1);
    expect(fnBody('scheduleHoverClose')).toContain('WARN_CLOSE_MS');
  });

  it('clears ONE AXIS from the ✕ and everything from Clear all', () => {
    /* the chip names an axis and lists its values, so its ✕ removes what it
       names; Clear all goes through the SAME handler the panel's own Clear
       uses, so there is one way to clear rather than two */
    const body = handlerBody('removePipeAxis');
    expect(body).toContain('pipeFilters.${axis}');
    expect(body).toContain('[]');
    expect(body).toContain('pipeBackToTop()');
    expect(TEMPLATE).toContain("on-click=\"['clearPipeFilters']\">Clear all");
  });

  it('returns the reader to the top on a SEARCH change as well (R-pf-h, closed in block 4)', () => {
    /* I7: every filter and sort handler called `pipeBackToTop()`; the search
       field is two-way bound and had no handler, so it was the one narrowing
       that left the reader halfway down a list that was no longer the list.
       Stated once, as an observer on the bound key — the same shape the
       chipPop observer takes — rather than a keystroke handler. */
    const at = APP_JS_CODE.indexOf("app.observe('searchQ'");
    expect(at, 'no observer on searchQ').toBeGreaterThan(-1);
    expect(APP_JS_CODE.slice(at, APP_JS_CODE.indexOf(');', at))).toContain('pipeBackToTop()');
  });

  it('names the axis in each ✕’s accessible name', () => {
    // the icon carries no text, so this is the only route to which filter goes
    expect(TEMPLATE).toContain('aria-label="Remove the {{c.label}} filter"');
  });
});

/* ---------------------------------------------------------------------- */
/* G — the two buttons differ on purpose                                    */
/* ---------------------------------------------------------------------- */

describe('the sort button names its selection; the filter button never does', () => {
  it('formats the sort label as `Group: Item`, for every sort', () => {
    /* the group prefix does real work — 'Recently started' alone is ambiguous
       out of context, and the prefix says which axis is ordering the table.
       Block 4 keeps the format (B9): the Identity items carry a colon of their
       own, so the button reads 'Identity: MC Number: Low to High' — flagged to
       Miles as a question, built as the frame draws it, pinned as built. */
    expect(recipe.pipeSortLabel('started')).toBe('Dates: Recently started');
    expect(recipe.pipeSortLabel('urgent')).toBe('Priority: Urgent first');
    expect(recipe.pipeSortLabel('mc')).toBe('Identity: MC Number: Low to High');
    for (const s of recipe.PIPE_SORTS) expect(recipe.pipeSortLabel(s.key)).toBe(`${s.group}: ${s.label}`);
    expect(recipe.pipeSortLabel(null)).toBe('');
  });

  it('renders NO count on the filter button — declined, and not to be re-added', () => {
    const btn = /<button class="sfbtn[^>]*openPipeFilter[^>]*>[\s\S]*?<\/button>/.exec(TEMPLATE)?.[0] ?? '';
    expect(btn).toBeTruthy();
    expect(btn).not.toContain('sflabel');
    expect(btn).not.toMatch(/>\{\{pipeFilterCount\}\}</);
  });

  it('puts the applied count ONLY in the filter button’s accessible name', () => {
    /* with no label and no count, that name is the single route to the
       information for someone who cannot see the fill change */
    expect(TEMPLATE).toContain('aria-label="Filter{{#if pipeFilterCount}}, {{pipeFilterCount}} applied{{/if}}"');
  });

  it('caps the sort label so the search row cannot be pushed around', () => {
    expect(cssRule('.sfbtn .sflabel', PIPELINE_CSS)).toMatch(/max-width: \d+px/);
    expect(cssRule('.sfbtn .sflabel', PIPELINE_CSS)).toContain('text-overflow: ellipsis');
  });

  it('gives both buttons the same active fill, and only sort a label', () => {
    expect(cssRule('.sfbtn.on', PIPELINE_CSS)).toContain('var(--slate-900)');
    expect(TEMPLATE).toContain('{{#if pipeSort}}<span class="sflabel">{{pipeSortLabelText}}</span>{{/if}}');
  });
});

/* ---------------------------------------------------------------------- */
/* H — panel behaviour that IS provable without a browser                   */
/* ---------------------------------------------------------------------- */

describe('the panels behave like every other overlay', () => {
  it('joins OVERLAY_KEYS, so mutual exclusion is not re-implemented', () => {
    /* "opening one closes the other" is what openOverlay already does to every
       key in this list — a second rule here could disagree with it */
    const keys = decl(APP_JS_CODE, 'OVERLAY_KEYS');
    expect(keys).toContain('pipeSortMenu');
    expect(keys).toContain('pipeFilterMenu');
  });

  it('disables Clear when there is nothing to clear, in BOTH panels', () => {
    expect(TEMPLATE).toContain('disabled="{{!pipeSort}}"');
    expect(TEMPLATE).toContain('disabled="{{!pipeFilterCount}}"');
  });

  it('HIDES a zero-count value rather than greying it (JP, 2026-08-21)', () => {
    /* It used to render disabled, which is what the frame asked for ("expose
       empty categories instead of hiding them") — and on a real board that
       filled STATUS with rows nobody could ever pick. Nothing is disabled now,
       because nothing unpickable is drawn. */
    expect(TEMPLATE).not.toContain('disabled="{{!v.count');
    // read on STATUS since #78 parked the difficulty axis; the rule is the same
    const rows = [row({ cardId: 'a', currentList: 'Design' }), row({ cardId: 'b', currentList: 'Backlogs: Icon' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] }; // matches nothing
    const status = recipe.pipeFacetList(rows, sel).find((f) => f.key === 'status');
    expect(status, 'an axis with nothing left to offer is dropped whole').toBeUndefined();
  });

  it('KEEPS a ticked value that has fallen to zero — the only way back off it', () => {
    /* the case that makes this not a bare `count > 0`: a value already applied
       can fall to zero as other axes narrow, and hiding it would strand the
       reader with a filter they can neither see nor un-tick */
    const rows = [row({ cardId: 'a', assetType: 'UI', currentList: 'Design' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] };
    const type = recipe.pipeFacetList(rows, sel).find((f) => f.key === 'type')!;
    const icon = type.values.find((v) => v.label === 'Icon');
    expect(icon, 'the ticked value vanished').toBeTruthy();
    expect([icon!.count, icon!.on]).toEqual([0, true]);
  });

  it('keeps group headings out of the tab order — they are labels, not options', () => {
    const heads = [...TEMPLATE.matchAll(/<p class="pmhead"[^>]*>/g)].map((m) => m[0]);
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h).toContain('aria-hidden="true"');
  });

  it('scrolls STATUS inside its own group, not the whole panel', () => {
    /* the axis carries the flag; the template no longer names STATUS, so a
       sixth open-ended axis is one entry in the table rather than three edits */
    expect(TEMPLATE).toContain('{{#if scroll}}pmscroll{{/if}}');
    // rows, not an empty board: an axis with nothing to offer is dropped now
    const rows = [row({ currentList: 'Sketch: With Revision', assetType: 'Icon' })];
    const scrolling = recipe.pipeFacetList(rows, recipe.PIPE_FILTERS_EMPTY()).filter((f) => f.scroll);
    expect(scrolling.map((f) => f.key)).toEqual(['status']);
    expect(cssRule('.pipemenu .pmscroll', PIPELINE_CSS)).toContain('overflow-y: auto');
    expect(cssRule('.pipemenu', PIPELINE_CSS)).not.toContain('overflow-y');
  });

  it('groups the sort panel as Dates, Priority, Identity — derived from the sort array, in its order', () => {
    /* the panel's headings come from the `PIPE_SORT_GROUPS` computed, which
       walks PIPE_SORTS and opens a group at every change of `group`. Executed
       out of the shipped scripts; the items are asserted to be the sorts
       themselves, flattened back, so a group cannot hold a sort the array
       does not, and the Priority group sits where the frame draws it. */
    const groups = new Function(`
      ${decl(APP_JS, 'PIPE_SORTS')}
      const computed = { ${method('PIPE_SORT_GROUPS')} };
      return computed.PIPE_SORT_GROUPS.call({ get: () => undefined });
    `)() as Array<{ group: string; items: Sort[] }>;
    expect(groups.map((g) => g.group)).toEqual(['Dates', 'Priority', 'Identity']);
    expect(groups.flatMap((g) => g.items.map((s) => s.key))).toEqual(recipe.PIPE_SORTS.map((s) => s.key));
    expect(groups.map((g) => g.items.length)).toEqual([4, 2, 4]);
  });

  it('resets both on project switch, like the planner’s expansion state', () => {
    /* `resetForProjectSwitch` is a `function`, not a sliceable `const`, so read
       its BODY — the same reason fnBody exists beside decl. A Type or a Status
       carried into another project names values that project may not have,
       which would silently show an empty table (R-exp-f's reasoning). */
    const reset = fnBody('resetForProjectSwitch');
    expect(reset).toContain('pipeSort');
    expect(reset).toContain('pipeFilters');
  });
});

/* ---------------------------------------------------------------------- */
/* H — one word per column, wherever it is spoken                          */
/* ---------------------------------------------------------------------- */

describe('a column and the filter that narrows it use the SAME word', () => {
  /* Miles, owl #66: REQUESTOR everywhere. The header had said `Client` since
     the frame did (`70:10009` names Client in its column order), while the
     panel, the chip and the Requests table all said Requestor — over the same
     field, since the cell underneath had always rendered `row.requestor`. The
     values are people; on a single-client board a Client filter selects
     everything or nothing, which is why the axis was never built as one.

     ⚠️ The FIX is not this test. The header is now derived from `PIPE_COLS`
     and each filter takes its label from the column it narrows, so the word is
     spelt in one place and a second spelling cannot be typed. What is left to
     assert is the join that makes that true: every axis must name a column the
     table actually draws. An axis pointing at a `col-` that does not exist
     yields `undefined` as its label, which would render an empty filter
     heading — visible only here.

     AMENDED 2026-09-05 (owl #78 §3, frame `809:83486`): the column SET is now
     a ruling in its own right — three columns changed at once — so the ordered
     list is asserted here, once, out of the shipped `PIPE_COLS`. That is the
     rule (the frame's column order), not the count-pin rule 1 forbids: nothing
     hand-copies a NUMBER, and `test/pipeline-expanded.test.ts` no longer keeps
     a second literal list — it now asserts both row kinds' cells AGAINST this
     same array, which is the "one column model by construction" promise made
     to Miles in jp→miles #40.

     Deliberately NOT asserted: the absence of the word `Client` across the
     table subtree (that reads raw text including comments — rule 3 — so one
     capital in a prose comment would fail it for a reason unrelated to the
     rule). */
  const COLS = recipe.PIPE_COLS as Array<{ cls: string; label: string }>;

  it('is the frame’s TEN columns, in the frame’s order (owl #78 §3)', () => {
    /* Three edits from one frame, and each one is a place the table could
       silently keep its old shape: REQUESTOR leaves Pipeline entirely (it stays
       on Requests, asserted below), URGENCY moves ahead of DIFFICULTY, and DUE
       is renamed DEADLINE — class and label together, because a class naming
       the old word is how the old word gets back into the markup (#66's own
       lesson, applied again). */
    expect(COLS.map((c) => c.cls)).toEqual([
      'col-mc', 'col-name', 'col-type', 'col-urgency', 'col-diff',
      'col-status', 'col-deadline', 'col-started', 'col-done', 'col-links',
    ]);
    expect(COLS.map((c) => c.label)).toEqual([
      'MC #', 'Card Name', 'Type', 'Urgency', 'Difficulty',
      'Status', 'Deadline', 'Started', 'Done', 'Links',
    ]);
  });

  it('draws its header FROM the column table, with nothing hand-typed', () => {
    const table = TEMPLATE.slice(TEMPLATE.indexOf('<table class="ptable">'));
    const head = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));
    expect(head).toContain('{{#each pipeCols as c}}');
    expect(head, 'a hand-typed header cell is back').not.toMatch(/<th class="[a-z-]+">[A-Za-z]/);
  });

  it('gives every filter axis a column that exists, and takes its label from it', () => {
    const axes = recipe.PIPE_FILTERS as Array<Axis & { col: string }>;
    expect(axes.length).toBeGreaterThan(0);
    for (const a of axes) {
      const col = COLS.find((c) => c.cls === a.col);
      expect(col, `axis "${a.key}" names column "${a.col}", which the table does not draw`).toBeTruthy();
      expect(a.label, `axis "${a.key}" has a label the column table did not supply`).toBe(col!.label);
    }
  });

  it('every column class it emits is one the stylesheet and the body both know', () => {
    /* The gap the review found in the derivation (2026-08-25): the HEADER now
       comes from `PIPE_COLS`, but the body `<td class="col-…">` cells and the
       `.ptable .col-…` width rules are still hand-typed. Rename a `cls` here —
       the exact edit this table was built to make safe — and the `<th>` renders
       a class the stylesheet has no rule for, so the header cell loses its
       width while its body cells keep theirs and the column visibly misaligns.
       Nothing else notices: pipeline-expanded pins the BODY classes as its own
       list, and the header test above only checks that the loop exists.

       So the join is asserted here in both directions: every emitted class is
       drawn by the body and measured by the stylesheet. */
    const table = TEMPLATE.slice(TEMPLATE.indexOf('<table class="ptable">'));
    const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
    const bodyClasses = new Set([...body.matchAll(/<td class="(col-[a-z-]+)"/g)].map((m) => m[1]!));

    // Rule blocks, comments stripped first — a source scan reads raw text and
    // a prose comment naming a class would otherwise satisfy this (rule 3).
    const css = PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const measured = new Set<string>();
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/width\s*:/.test(m[2]!)) continue;
      for (const cls of m[1]!.matchAll(/\.ptable\s+\.(col-[a-z-]+)/g)) measured.add(cls[1]!);
    }

    for (const c of COLS) {
      expect(bodyClasses, `header column "${c.cls}" has no body cell`).toContain(c.cls);
      expect(
        measured,
        `header column "${c.cls}" has no width rule — its header and body will misalign`,
      ).toContain(c.cls);
    }
  });

  it('says Requestor where the column lives — and Pipeline no longer has one', () => {
    /* SUPERSEDES the #66 pin that read "still says Requestor" on Pipeline.
       #66's ruling is untouched: the word is REQUESTOR and never CLIENT,
       because the values are people. What #78 §3 changed is WHERE the column
       is — off Pipeline, kept on Requests, where the row's own subject is the
       person who asked. So the guard holds both ends now, since dropping a
       column from one table is exactly how the word comes back misspelt in the
       other, with nothing left to compare it against. */
    expect(COLS.map((c) => c.label), 'Requestor came back to Pipeline').not.toContain('Requestor');
    expect(COLS.map((c) => c.cls)).not.toContain('col-requestor');
    expect(COLS.map((c) => c.label)).not.toContain('Client');

    /* Requests is where it went, and #66's spelling still binds there. The
       shipped `REQ_COLS` is EXECUTED, not grepped — the comparators it names
       are passed in as parameters because only the LABELS are under test and a
       sort function is a different suite's business. */
    const reqCols = new Function(
      'numCmp', 'ciCmp', 'alphaSort',
      `${decl(APP_JS, 'REQ_COLS')} return REQ_COLS;`,
    )(null, null, null) as Array<{ label: string }>;
    expect(reqCols.map((c) => c.label)).toContain('Requestor');
    expect(reqCols.map((c) => c.label)).not.toContain('Client');
  });
});

/* ---------------------------------------------------------------------- */
/* H — the no-results state (owl #76, frame 748:18444)                      */
/* ---------------------------------------------------------------------- */

interface NoResultsHarness {
  set(key: string, value: unknown): void;
  verdict(): boolean;
}

/* `pipeNoResults` EXECUTED out of the shipped scripts, with the computeds it
   reads resolved through the same `get` — the executed-computed idiom the
   recipe block at the top of this file and sprint-schedule-render share. A
   source-text assertion could show the computed exists without showing it
   ever says true. `chipPop` stays null throughout, so `pipeChips` never
   reaches for the facet pass (its own guard above pins that ordering). */
const noResultsHarness = (): NoResultsHarness =>
  new Function(`
    ${decl(APP_JS, 'DIFF_RANK')}
    ${decl(APP_JS, 'PIPE_SORTS')}
    ${decl(APP_JS, 'PIPE_SORT_DEFAULT')}
    ${decl(APP_JS, 'pipeTiebreak')}
    ${decl(APP_JS, 'pipeCompare')}
    ${decl(APP_JS, 'pipeSortRows')}
    ${decl(APP_JS, 'PIPE_COLS')}
    ${decl(APP_JS, 'pipeColLabel')}
    ${decl(APP_JS, 'PIPE_FILTERS')}
    ${decl(APP_JS, 'unranked')}
    ${decl(APP_JS, 'alphaSort')}
    ${decl(APP_JS, 'pipePick')}
    ${decl(APP_JS, 'pipeValueLabel')}
    ${decl(APP_JS, 'PIPE_FILTERS_EMPTY')}
    ${decl(APP_JS, 'pipeWorkMatch')}
    ${decl(APP_JS, 'pipeWorkKids')}
    ${decl(APP_JS, 'pipeValues')}
    ${decl(APP_JS, 'pipeWorkKeys')}
    ${decl(APP_JS, 'pipeMatches')}
    ${decl(APP_JS, 'pipeChipList')}
    ${decl(APP_JS, 'mcRank')}
    const computed = { ${['pipeSearched', 'pipelineRows', 'pipeChips', 'pipeNoResults'].map((n) => method(n)).join(', ')} };
    const DATA = { rows: [], searchQ: '', pipeFilters: PIPE_FILTERS_EMPTY(), pipeSort: null, chipPop: null };
    const ctx = { get: (k) => (Object.prototype.hasOwnProperty.call(computed, k) ? computed[k].call(ctx) : DATA[k]) };
    return { set: (k, v) => { DATA[k] = v; }, verdict: () => computed.pipeNoResults.call(ctx) };
  `)() as NoResultsHarness;

/**
 * Renders the swap and everything around it. The state under test is the
 * `{{#if pipeNoResults}}` branch AROUND `.pscrollwrap`, which no helper
 * renderer slices — `renderPipelineTable` starts INSIDE the else branch — so
 * this renders the enclosing balanced `.pipestack` subtree through the
 * helper's own `divFragment` (rule 6's mechanics: shipped template, real
 * `toHTML()`, every iterated array stubbed, the recipe under test executed
 * from shipped source by the harness above rather than stubbed). The data
 * set mirrors `renderPipelineTable`'s; the toolbar chrome renders with no
 * menus open and no chips, which is not what these assertions read anyway.
 */
const RactiveCtor = RactiveModule as unknown as {
  new (opts: { template: string; data: Record<string, unknown> }): { toHTML(): string };
};
const renderPipestack = (state: { pipeNoResults: boolean; pipelineRows?: unknown[] }): string =>
  new RactiveCtor({
    template: divFragment('<div class="pipestack">'),
    data: {
      icon: {},
      searchQ: '',
      pipeFilterCount: 0,
      pipeSort: null,
      pipeSortLabelText: '',
      pipeFilterMenu: null,
      pipeSortMenu: null,
      pipeFacets: [],
      PIPE_SORT_GROUPS: [],
      pipeChips: [],
      chipPop: null,
      chipPopFlip: false,
      pipeNoResults: state.pipeNoResults,
      pipeCols: recipe.PIPE_COLS,
      pipelineRows: state.pipelineRows ?? [],
      pipeMcAnchor: {},
      expanded: {},
      workCardsByMc: {},
      pipeOpen: {},
      pipeKids: {},
      writesEnabled: false,
      savingUrgency: {},
      savingDifficulty: {},
      savingDeadline: {},
      urgencyMenu: null,
      diffMenu: null,
      duePopover: null,
      urgencyMenuPos: { left: 0, top: 0 },
      diffMenuPos: { left: 0, top: 0 },
      duePopPos: { left: 0, top: 0 },
      warnPop: null,
      warnPopPos: { left: 0, top: 0, up: false },
      pipeThumb: { needed: false },
      hl: (s: unknown) => String(s ?? ''),
      fmtLong: (s: unknown) => String(s ?? ''),
      fmtInstant: () => '',
    },
  }).toHTML();

describe('the no-results verdict — empty AND caused by the reader', () => {
  it('says true for search-only, filter-only, and both together — ONE state', () => {
    const noHit = { cardId: 'c1', mcNumber: 'MC-800', name: 'A card', blob: 'a card mc-800', assetType: 'UI' };

    const searched = noResultsHarness();
    searched.set('rows', [noHit]);
    searched.set('searchQ', 'zzz-nothing-carries-this');
    expect(searched.verdict(), 'search emptied the table').toBe(true);

    const filtered = noResultsHarness();
    filtered.set('rows', [noHit]);
    filtered.set('pipeFilters', { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] });
    expect(filtered.verdict(), 'a filter emptied the table').toBe(true);

    const both = noResultsHarness();
    both.set('rows', [noHit]);
    both.set('searchQ', 'zzz-nothing-carries-this');
    both.set('pipeFilters', { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] });
    expect(both.verdict(), 'term and filter together').toBe(true);
  });

  it('says false the moment anything matches — results beat the message', () => {
    const h = noResultsHarness();
    h.set('rows', [{ cardId: 'c1', mcNumber: 'MC-800', name: 'Zeta card', blob: 'zeta card mc-800' }]);
    h.set('searchQ', 'zeta');
    expect(h.verdict()).toBe(false);
  });

  it('stays FALSE on fresh-empty — zero rows, blank search, no filters', () => {
    /* the out-of-scope path, held out on purpose: a project with no cards
       gets the plain table, because this state's remedy line points at a
       term or filters that reader would not have */
    const h = noResultsHarness();
    expect(h.verdict()).toBe(false);
    // whitespace is a blank term, exactly as the search recipe trims it
    h.set('searchQ', '   ');
    expect(h.verdict(), 'whitespace-only search read as a caused empty').toBe(false);
  });

  it('reads "a filter is live" off the chips’ own derivation, never a second spelling', () => {
    /* the chips row and its Clear all render from `pipeChips`; a re-sum over
       the raw selection here would be a second answer to "is something
       filtering", free to drift from the first */
    const body = method('pipeNoResults');
    expect(body).toContain("this.get('pipelineRows')");
    expect(body).toContain("this.get('searchQ')");
    expect(body).toContain("this.get('pipeChips')");
    expect(body).not.toMatch(/pipeFilters|PIPE_FILTERS|pipeFilterCount/);
  });
});

describe('the no-results state replaces the whole table block (owl #76)', () => {
  it('renders the message IN PLACE of the table — no header row survives', () => {
    const html = renderPipestack({ pipeNoResults: true });
    expect(html).toContain('class="pnores"');
    expect(html).toContain('No results found');
    expect(html).toContain('Try adjusting your search term or clearing active filters');
    // the ENTIRE table goes, thead included — not a header row over an empty body
    expect(html).not.toContain('<thead');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('pscrollwrap');
    // the toolbar above survives, term retained — only the table gives way
    expect(html).toContain('pipeline-search');
  });

  it('renders the table — thead and all — whenever the verdict is false', () => {
    const rows = [{ cardId: 'c1', mcNumber: 'MC-800', mcLabel: 'MC-800', displayId: 'MC-800', name: 'A card', urgency: 'Non-Urgent' }];
    const html = renderPipestack({ pipeNoResults: false, pipelineRows: rows });
    expect(html).toContain('<thead');
    expect(html).toContain('pscrollwrap');
    expect(html).not.toContain('pnores');
  });

  it('fresh-empty renders the TABLE, not the state — the two proofs composed', () => {
    /* the shipped verdict for the untouched-empty project, fed to the shipped
       markup: header row present, message absent */
    const html = renderPipestack({ pipeNoResults: noResultsHarness().verdict() });
    expect(html).toContain('<thead');
    expect(html).not.toContain('pnores');
  });

  it('pins both copy strings verbatim, and the gate they hang on', () => {
    expect(TEMPLATE).toContain('{{#if pipeNoResults}}');
    expect(TEMPLATE).toContain('<p class="pnores-head">No results found</p>');
    expect(TEMPLATE).toContain('<p class="pnores-sub">Try adjusting your search term or clearing active filters</p>');
  });

  it('echoes NO term and interpolates NOTHING — one static state for every path', () => {
    /* the frame deliberately removed the term echo from the headline; a
       mustache anywhere inside the block would be it creeping back in */
    const at = TEMPLATE.indexOf('<div class="pnores">');
    expect(at).toBeGreaterThan(-1);
    expect(TEMPLATE.slice(at, TEMPLATE.indexOf('</div>', at))).not.toContain('{{');
  });

  it('draws the state as the page body — no fill, no border, the frame’s asymmetric padding', () => {
    const rule = cssRule('.pnores', PIPELINE_CSS);
    expect(rule).not.toMatch(/background|border/);
    expect(rule).toContain('padding: 64px 64px 180px'); // heavier below floats the message above centre
    expect(rule).toContain('gap: var(--space-12)');
    expect(rule).toContain('justify-content: center');
    expect(rule).toContain('min-height: 606px'); // the frame’s message-frame height — page body, not caption
  });

  it('sets the head at weight 700 — the frame’s own, ruled to stand over the house 600', () => {
    /* Miles flagged the weight as possible drift and ruled: build what the
       frame holds. This pin is what stops a well-meant normalisation. */
    const head = cssRule('.pnores-head', PIPELINE_CSS);
    expect(head).toContain('font-weight: 700');
    expect(head).toContain('font-size: var(--text-display)');
    expect(head).toContain('line-height: 1.2');
    expect(head).toContain('color: var(--slate-900)');
  });

  it('sets the sub a step down and muted — single-weight, like the head', () => {
    const sub = cssRule('.pnores-sub', PIPELINE_CSS);
    expect(sub).toContain('font-weight: 400');
    expect(sub).toContain('font-size: var(--text-title)');
    expect(sub).toContain('line-height: 1.2');
    expect(sub).toContain('color: var(--slate-500)');
  });

  it('re-sweeps the slider when the verdict flips — the remount seam is never stale', () => {
    /* The swap unmounts .pscrollwrap whole while pipeThumb keeps its last
       values; the table's RETURN fires no scroll event, so without this
       observer the thumb re-renders its stale pixels over a fresh node at
       scrollLeft 0 (review 2026-08-30, finding 1 — the same never-stale
       rule the selectTab seam already keeps). */
    expect(APP_JS_CODE, 'the pipeNoResults remeasure observer is gone — the returning table draws a stale slider')
      .toMatch(/app\.observe\('pipeNoResults',\s*\(\)\s*=>\s*\{\s*remeasure\(\);\s*\}/);
  });
});
