/**
 * Requests SORTS (owl #77 §2, nodes 809:87722 / 809:87697; PLAN.md block 5
 * §Node amendments). Eight options in two groups, and a DEFAULT that is not
 * one of them: `Recently requested` by the intake sheet's own row number,
 * descending — explicitly NOT the year/month order the table shipped with,
 * which ties on every row filed in the same month.
 *
 * The sort path is executed out of the shipped scripts
 * (test/helpers/requests-sortfilter.ts, test/CLAUDE.md rule 2) — the shipped
 * `reqSortRows`, decorate/sort/undecorate and all, never a re-implementation
 * around the bare comparator.
 */

import { describe, expect, it } from 'vitest';
import { APP_JS, TEMPLATE, handlerBody, tabViewCode } from './helpers/gantt-render.ts';
import { ids, recipe, reqHarness, row, sel, sortBy } from './helpers/requests-sortfilter.ts';

/** the node spells both Identity name sorts with an EN DASH, U+2013 */
const AZ = 'Deliverable Name: A–Z';
const ZA = 'Deliverable Name: Z–A';

/* ---------------------------------------------------------------------- */
/* A — the sort set is the node's, in the node's order                      */
/* ---------------------------------------------------------------------- */

describe('the sort set matches the node exactly', () => {
  it('carries the EIGHT options in two groups, in the node’s order and words', () => {
    /* Requests has no work cards and no phase, so Pipeline's Priority group
       and its four derived sorts have no Requests twin; what it does have
       that Pipeline does not is the sheet's row order, which is the default
       AND a listed pair. The node's hidden PRIORITY group (`Needs
       clarification first` …) is deliberately NOT built — invisible in both
       nodes, flagged to Miles. */
    expect(recipe.REQ_SORTS.map((s) => `${s.group}: ${s.label}`)).toEqual([
      'Dates: Deadline closest to now',
      'Dates: Deadline farthest from now',
      'Dates: Recently requested',
      'Dates: Oldest request first',
      `Identity: MC Number: Low to High`,
      `Identity: MC Number: High to Low`,
      `Identity: ${AZ}`,
      `Identity: ${ZA}`,
    ]);
    expect(recipe.REQ_SORTS.map((s) => s.key)).toEqual([
      'due-near', 'due-far', 'recent', 'oldest', 'mc', 'mc-desc', 'name', 'name-desc',
    ]);
  });

  it('spells the name sorts with an EN DASH, not a hyphen', () => {
    /* the node draws A–Z; a hyphen is the character a keyboard reaches for
       and it is not what the panel says */
    const name = recipe.REQ_SORTS.find((s) => s.key === 'name')!;
    expect(name.label).toContain('–');
    expect(name.label).not.toContain('-');
    expect(recipe.REQ_SORTS.find((s) => s.key === 'name-desc')!.label).toContain('–');
  });

  it('keeps each group’s options ADJACENT, so the panel’s two groups derive from this order', () => {
    /* the sort panel opens a group at every change of `group` — two runs here
       means two headings, and a stray Identity option among the Dates would
       silently draw three */
    expect(recipe.REQ_SORTS.map((s) => s.group)).toEqual([
      'Dates', 'Dates', 'Dates', 'Dates', 'Identity', 'Identity', 'Identity', 'Identity',
    ]);
  });

  it('names sorts by the RESULTING ORDER, never column-plus-arrow', () => {
    for (const s of recipe.REQ_SORTS) expect(s.label, s.key).not.toMatch(/[↑↓]|\basc\b|\bdesc\b/i);
  });

  it('formats the button’s label as `Group: Item`, for every option (R-pf-f)', () => {
    for (const s of recipe.REQ_SORTS) expect(recipe.reqSortLabel(s)).toBe(`${s.group}: ${s.label}`);
  });
});

/* ---------------------------------------------------------------------- */
/* B — the default is the sheet's row order (owl #77 §2, D12)               */
/* ---------------------------------------------------------------------- */

describe('the table opens on the sheet’s own row order, newest first', () => {
  /* the fixture that separates the two candidate defaults: read by YEAR then
     MONTH these rows come out 1, 3, 2; read by sheet row they come out 3, 2,
     1. A sheet whose Year/Month columns disagree with its row order is the
     normal case, not a corner one — which is why owl #77 §2 ruled the row
     number in and the date columns out. */
  const disagreeing = [
    row({ sheet_row: 1, year: 2026, month: 'December' }),
    row({ sheet_row: 2, year: 2025, month: 'January' }),
    row({ sheet_row: 3, year: 2026, month: 'June' }),
  ];

  it('orders by SHEET ROW descending — never by year and month (owl #77 §2)', () => {
    expect(ids(sortBy(null, disagreeing))).toEqual([3, 2, 1]);
    expect(ids(sortBy(null, disagreeing)), 'the year/month order is back').not.toEqual([1, 3, 2]);
  });

  it('is an UNLISTED order whose effect the listed `recent` reproduces (D12)', () => {
    /* Pipeline's shape: `reqSort: null` IS the default order, and the listed
       option with the same effect exists so a reader who wandered off it can
       name their way back. Clear Sort returns to null, which is the default —
       "return to default" and "return to null" are one behaviour. */
    expect(recipe.REQ_SORT_DEFAULT.key).toBe(null);
    expect(recipe.REQ_SORT_DEFAULT.dir).toBe(-1);
    expect(ids(sortBy('recent', disagreeing))).toEqual(ids(sortBy(null, disagreeing)));
  });

  it('holds `reqSort` at null at rest, and nothing highlighted (D12)', () => {
    /* the node draws no default marker: at rest the panel shows eight
       unselected options and the button names nothing. */
    expect(APP_JS).toMatch(/\breqSort:\s*null\b/);
    const h = reqHarness();
    expect(h.get('reqSortLabelText'), 'the button named an order the reader never picked').toBe('');
    expect(h.get('reqSortDef')).toMatchObject({ key: null });
    expect(tabViewCode('requests')).toContain('{{#if reqSort}}');
  });

  it('falls back to the default for an UNKNOWN key — a stale sort never leaves the table unordered', () => {
    const h = reqHarness({ reqSort: 'sort-that-was-removed' });
    expect(h.get('reqSortDef')).toMatchObject({ key: null });
    const listed = reqHarness({ reqSort: 'oldest' });
    expect((listed.get('reqSortDef') as { key: string }).key).toBe('oldest');
  });

  it('disables Clear Sort while there is nothing to clear', () => {
    expect(TEMPLATE).toContain('disabled="{{!reqSort}}"');
  });

  /**
   * The shipped pick handler, EXECUTED against a stand-in app (test/CLAUDE.md
   * rule 1). The rule is what a SECOND pick of the applied option does, and
   * that is a comparison inside the write — invisible to any reading of the
   * source that is not the source itself.
   */
  const sortRig = (start: string | null = null) => {
    const state: Record<string, unknown> = { reqSort: start };
    const closed: unknown[] = [];
    const pick = new Function(
      'app',
      'closeMenus',
      `return function pickReqSort(_ctx, key) ${handlerBody('pickReqSort')};`,
    )(
      { get: (k: string) => state[k], set: (k: string, v: unknown) => { state[k] = v; } },
      (opts: unknown) => closed.push(opts),
    ) as (ctx: unknown, key: string) => void;
    return { state, closed, pick: (key: string) => pick(null, key) };
  };

  it('CLEARS the applied sort when the same option is picked again — the panel undoes itself', () => {
    /* SINGLE-select, and rest is reachable from the option list itself: with
       no re-pick branch the only way back to the sheet's own order is Clear
       Sort, and a reader who cannot find it is stuck in an order they picked
       by accident. Rest is not "unordered" — `reqSortDef` falls back to the
       default, which is the order the table opened on. */
    const rig = sortRig();
    rig.pick('oldest');
    expect(rig.state.reqSort).toBe('oldest');
    rig.pick('oldest');
    expect(rig.state.reqSort, 'picking the applied option again did not return the table to rest').toBe(null);

    // …and rest really is the default order, not an absence of one
    expect(reqHarness({ reqSort: rig.state.reqSort }).get('reqSortDef')).toMatchObject({ key: null });

    // choosing REPLACES, never stacks — and every commit closes through the
    // one path, focus and all (the roll-call is in pipeline-warning-wiring)
    const other = sortRig('oldest');
    other.pick('name');
    expect(other.state.reqSort).toBe('name');
    other.pick('name-desc');
    expect(other.state.reqSort).toBe('name-desc');
    expect(other.closed).toEqual([{ restoreFocus: true }, { restoreFocus: true }]);
  });
});

/* ---------------------------------------------------------------------- */
/* C — each option orders the way its words promise                         */
/* ---------------------------------------------------------------------- */

describe('every option orders in the direction it names', () => {
  it('DEADLINE closest / farthest — the ISO day string compares as a string', () => {
    /* test/CLAUDE.md rule 5: no Date is constructed anywhere in this file, and
       none is constructed in the sort either — a Manila day string sorts
       chronologically as text, in both timezones the suite runs under. */
    const rows = [
      row({ sheet_row: 1, deadline: '2026-12-01' }),
      row({ sheet_row: 2, deadline: '2026-03-15' }),
      row({ sheet_row: 3, deadline: '2026-07-04' }),
    ];
    expect(ids(sortBy('due-near', rows))).toEqual([2, 3, 1]);
    expect(ids(sortBy('due-far', rows))).toEqual([1, 3, 2]);
  });

  it('RECENTLY REQUESTED / OLDEST FIRST — the sheet’s row number, both ways', () => {
    const rows = [row({ sheet_row: 4 }), row({ sheet_row: 1 }), row({ sheet_row: 9 })];
    expect(ids(sortBy('recent', rows))).toEqual([9, 4, 1]);
    expect(ids(sortBy('oldest', rows))).toEqual([1, 4, 9]);
  });

  it('MC NUMBER low / high — NATURALLY, so MC-9 precedes MC-10', () => {
    /* the rank is the number inside the label, stamped once per load; a string
       compare would put MC-10 before MC-9 and look almost right */
    const rows = [
      row({ sheet_row: 1, mc_number: 'MC-10' }),
      row({ sheet_row: 2, mc_number: 'MC-9' }),
      row({ sheet_row: 3, mc_number: 'MC-655.3' }),
    ];
    expect(ids(sortBy('mc', rows))).toEqual([2, 1, 3]);
    expect(ids(sortBy('mc-desc', rows))).toEqual([3, 1, 2]);
  });

  it('DELIVERABLE NAME A–Z / Z–A — case-insensitively', () => {
    /* a capital must not sort a whole block of names ahead of the lower-case
       ones; the sheet's capitalisation is nobody's ordering intent */
    const rows = [
      row({ sheet_row: 1, name: 'banner set' }),
      row({ sheet_row: 2, name: 'Alpha kit' }),
      row({ sheet_row: 3, name: 'Corey G' }),
    ];
    expect(ids(sortBy('name', rows))).toEqual([2, 1, 3]);
    expect(ids(sortBy('name-desc', rows))).toEqual([3, 1, 2]);
  });
});

/* ---------------------------------------------------------------------- */
/* D — empties last, in every direction                                     */
/* ---------------------------------------------------------------------- */

describe('an absent value never displaces a real one', () => {
  it('sinks the empty row under EVERY option, ascending and descending alike', () => {
    /* the assertion that matters on this table: most intake rows carry no
       deadline, so a naive nulls-first descending order fills the top of the
       page with blanks and looks broken. `sheet_row` is excluded because the
       sheet's own row number is required and unique per project (schema) —
       there is no absent case to place. */
    const cases: Array<[string, Record<string, unknown>]> = [
      ['due-near', { deadline: '2026-05-01' }],
      ['due-far', { deadline: '2026-05-01' }],
      ['mc', { mc_number: 'MC-7' }],
      ['mc-desc', { mc_number: 'MC-7' }],
      ['name', { name: 'Zeta' }],
      ['name-desc', { name: 'Zeta' }],
    ];
    for (const [key, real] of cases) {
      const rows = [
        row({ sheet_row: 1, name: '', mc_number: '', deadline: null }),
        row({ sheet_row: 2, name: '', mc_number: '', deadline: null, ...real }),
      ];
      expect(ids(sortBy(key, rows)), key).toEqual([2, 1]);
    }
    expect(cases.map((c) => c[0]).concat(['recent', 'oldest']).sort())
      .toEqual(recipe.REQ_SORTS.map((s) => s.key).sort());
  });

  it('breaks a TIE on the sheet row, ascending, whichever way the option points', () => {
    /* equal keys must never reshuffle between renders, and the tiebreak sits
       OUTSIDE the direction sign — a descending sort does not reverse it
       (S8). The sheet's row order is the table's natural order, so ties read
       as the sheet reads. */
    const tied = [
      row({ sheet_row: 7, deadline: '2026-05-01' }),
      row({ sheet_row: 3, deadline: '2026-05-01' }),
      row({ sheet_row: 5, deadline: '2026-05-01' }),
    ];
    expect(ids(sortBy('due-near', tied))).toEqual([3, 5, 7]);
    expect(ids(sortBy('due-far', tied))).toEqual([3, 5, 7]);
    // two empties tie with each other the same way, rather than by input order
    const empties = [row({ sheet_row: 8 }), row({ sheet_row: 2 })];
    expect(ids(sortBy('due-near', empties))).toEqual([2, 8]);
  });

  it('sorts the WHOLE filtered set, never the visible page', () => {
    /* filter → sort → paginate, in that order: the client holds every row of
       the project, so a page sliced BEFORE the sort orders the page and not
       the table — page one keeps the first ten rows of the sheet and merely
       rearranges them.

       THE FIXTURE IS THE ASSERTION HERE. The sorted order has to DISAGREE
       with the filtered one or the mutation is invisible: five rows of
       another Type make the filtered set twenty-five of thirty and leave it
       in sheet order, and `mc-desc` reverses that. Seeded in sheet order and
       sorted by the sheet's own order, this test passed with the slice taken
       off `reqFiltered` (block 5 proof 42). */
    const OTHER_TYPE = [6, 12, 18, 24, 30];
    const rows = Array.from({ length: 30 }, (_, i) =>
      row({
        sheet_row: i + 1,
        mc_number: `MC-${i + 1}`,
        asset_type: OTHER_TYPE.includes(i + 1) ? 'Icon' : 'Assets',
      }));
    const at = (page: number) => reqHarness({
      requests: rows, reqFilters: sel({ type: ['Assets'] }), reqSort: 'mc-desc', reqPage: page,
    });
    const h = at(1);

    const filtered = ids(h.get('reqFiltered') as unknown[]);
    const sorted = ids(h.get('reqSorted') as unknown[]);
    expect(filtered, 'the Type axis narrowed nothing').toHaveLength(25);
    expect(filtered.slice(0, 5), 'the filtered set is not in the sheet’s own order').toEqual([1, 2, 3, 4, 5]);
    expect(sorted.slice(0, 5), 'the sort did not disagree with the sheet — this test would prove nothing')
      .toEqual([29, 28, 27, 26, 25]);

    // PAGE ONE IS THE SORTED HEAD, not the sheet's
    expect(ids(h.get('reqRows') as unknown[]))
      .toEqual([29, 28, 27, 26, 25, 23, 22, 21, 20, 19]);
    expect(ids(h.get('reqRows') as unknown[]), 'the page is not a slice of the sorted set').toEqual(sorted.slice(0, 10));
    // …and the last page is the sorted TAIL, five rows of the twenty-five
    expect(ids(at(3).get('reqRows') as unknown[])).toEqual([5, 4, 3, 2, 1]);
    expect(ids(at(3).get('reqRows') as unknown[])).toEqual(sorted.slice(20));
  });
});
