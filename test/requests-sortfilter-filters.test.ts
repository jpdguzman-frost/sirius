/**
 * Requests FILTER AXES (owl #77 §1, nodes 795:71554 / 795:67981; PLAN.md
 * block 5 §Frozen + §Node amendments). Six axes where Pipeline has four, one
 * of them — STATUS — MULTI-VALUED per row (D2), and every one of Pipeline's
 * own facet rulings (R-pf-c, R-pf-d, R-pf-i) carried over rather than
 * re-derived.
 *
 * The recipe is executed out of the shipped scripts by
 * test/helpers/requests-sortfilter.ts (test/CLAUDE.md rule 2): a source-text
 * assertion could show an axis exists without showing it ever narrows
 * anything.
 */

import { describe, expect, it } from 'vitest';
import { type ReqFacetValue, facet, matching, recipe, row, sel } from './helpers/requests-sortfilter.ts';

const AXIS_KEYS = ['year', 'month', 'type', 'unit', 'requestor', 'status'];
const values = (vs: ReqFacetValue[] | undefined) => (vs ?? []).map((v) => v.label);
const counts = (vs: ReqFacetValue[] | undefined) => (vs ?? []).map((v) => [v.label, v.count]);

/* ---------------------------------------------------------------------- */
/* A — the axes are the node's, in the node's order                         */
/* ---------------------------------------------------------------------- */

describe('the filter panel carries the node’s six axes', () => {
  it('lists them in the node’s order — YEAR, MONTH, TYPE, UNIT, REQUESTOR, STATUS', () => {
    /* PLAN §Node amendments (795:71554): UNIT sits FOURTH, ahead of REQUESTOR.
       The order is the panel's order and nothing else derives it, so it is
       pinned here — the same way Pipeline pins its four. */
    expect(recipe.REQ_FILTERS.map((f) => f.key)).toEqual(AXIS_KEYS);
    expect(recipe.REQ_FILTERS.map((f) => f.col)).toEqual([
      'col-ryear', 'col-rmonth', 'col-rtype', 'col-runit', 'col-rwho', 'col-rstatus',
    ]);
  });

  it('takes every axis label FROM the column it narrows — one word, spelt once (R-pf-n)', () => {
    /* the #66 lesson applied to Requests: the panel heading, the chip and the
       table header are one string, read out of `REQ_COLS`, so UNIT cannot be
       renamed in one place and not the other. The four-part guard in
       test/requests-sortfilter-indicator.test.ts holds the other half. */
    for (const f of recipe.REQ_FILTERS) {
      const col = recipe.REQ_COLS.find((c) => c.cls === f.col);
      expect(col, `axis "${f.key}" narrows "${f.col}", which the table does not draw`).toBeTruthy();
      expect(f.label, `axis "${f.key}"`).toBe(col!.label);
      expect(f.label, `axis "${f.key}"`).toBe(recipe.reqColLabel(f.col));
    }
    expect(recipe.REQ_FILTERS.map((f) => f.label)).toEqual(['Year', 'Month', 'Type', 'Unit', 'Requestor', 'Status']);
  });

  it('empties to one array per axis, and nothing else', () => {
    /* the empty selection IS the axis table — a seventh key here, or a missing
       one, is an axis the panel offers and the matcher never reads */
    const empty = recipe.REQ_FILTERS_EMPTY();
    expect(Object.keys(empty)).toEqual(AXIS_KEYS);
    expect(Object.values(empty)).toEqual([[], [], [], [], [], []]);
    // a fresh object each call: two readers must not share one array
    expect(recipe.REQ_FILTERS_EMPTY()).not.toBe(empty);
  });

  it('scrolls REQUESTOR inside its own group — the one open-ended axis (D3)', () => {
    /* people, not a taxonomy: the axis grows with the client. It scrolls
       WITHIN its group so the five short axes keep their place, exactly as
       Pipeline scrolls STATUS (jp→miles #49). */
    expect(recipe.REQ_FILTERS.filter((f) => f.scroll).map((f) => f.key)).toEqual(['requestor']);
  });
});

/* ---------------------------------------------------------------------- */
/* B — OR within, AND across (R-pf-d)                                       */
/* ---------------------------------------------------------------------- */

describe('filtering is OR within an axis and AND across them (R-pf-d)', () => {
  const rows = [
    row({ sheet_row: 1, asset_type: 'Icon', use_case: 'Brand', requestor: 'Ana' }),
    row({ sheet_row: 2, asset_type: 'Assets', use_case: 'Brand', requestor: 'Bo' }),
    row({ sheet_row: 3, asset_type: 'Icon', use_case: 'Growth', requestor: 'Bo' }),
  ];

  it('ORs within an axis — Icon plus Assets shows both', () => {
    expect(matching(rows, sel({ type: ['Icon', 'Assets'] }))).toEqual([1, 2, 3]);
  });

  it('ANDs across axes — Icon plus Brand shows only the Brand icons', () => {
    expect(matching(rows, sel({ type: ['Icon'], unit: ['Brand'] }))).toEqual([1]);
  });

  it('an empty axis constrains nothing', () => {
    expect(matching(rows, sel({}))).toEqual([1, 2, 3]);
    expect(matching(rows, sel({ type: [] }))).toEqual([1, 2, 3]);
  });
});

/* ---------------------------------------------------------------------- */
/* C — the counts ignore their own axis (R-pf-c)                            */
/* ---------------------------------------------------------------------- */

describe('an axis counts against the OTHER axes, never its own (R-pf-c)', () => {
  it('ignoring its own selection is what keeps a second value reachable', () => {
    /* counted against ALL axes including its own, picking Icon drops Assets to
       zero and it can never be added without clearing first — accurate and
       unusable. This is the same rule Pipeline keeps, on Requests' own rows. */
    const rows = [row({ sheet_row: 1, asset_type: 'Icon' }), row({ sheet_row: 2, asset_type: 'Assets' })];
    const live = sel({ type: ['Icon'] });
    expect(matching(rows, live, 'type'), 'Assets still countable').toEqual([1, 2]);
    expect(matching(rows, live, 'requestor'), 'another axis sees the narrowing').toEqual([1]);
    expect(counts(facet(rows, 'type', live)?.values)).toEqual([['Assets', 1], ['Icon', 1]]);
  });

  it('narrows a NEIGHBOUR’s counts as it narrows the table', () => {
    const rows = [
      row({ sheet_row: 1, asset_type: 'Icon', requestor: 'Ana' }),
      row({ sheet_row: 2, asset_type: 'Assets', requestor: 'Bo' }),
    ];
    expect(counts(facet(rows, 'requestor')?.values)).toEqual([['Ana', 1], ['Bo', 1]]);
    expect(counts(facet(rows, 'requestor', sel({ type: ['Icon'] }))?.values)).toEqual([['Ana', 1]]);
  });

  it('counts a MULTI-VALUED status row once per value it belongs to (D2)', () => {
    /* one row, two values: an unfiled row carrying a clarification flag is
       both For Filing and For Clarification, so it counts on both — a count
       that split it between them would understate whichever the reader picks. */
    const rows = [
      row({ sheet_row: 1, status: 'For Filing', note: { remark: '', clarify: true, clarify_reason: null } }),
      row({ sheet_row: 2, status: 'For Filing', note: null }),
      row({ sheet_row: 3, status: recipe.STATUS_FILED, note: null }),
    ];
    expect(counts(facet(rows, 'status')?.values)).toEqual([
      ['For Clarification', 1], ['For Filing', 2], ['In Pipeline', 1],
    ]);
  });
});

/* ---------------------------------------------------------------------- */
/* D — nothing unpickable is drawn (JP, 2026-08-21)                         */
/* ---------------------------------------------------------------------- */

describe('a value nobody can reach is not offered', () => {
  it('HIDES a zero-count value rather than greying it', () => {
    const rows = [
      row({ sheet_row: 1, asset_type: 'Icon', requestor: 'Ana' }),
      row({ sheet_row: 2, asset_type: 'Assets', requestor: 'Bo' }),
    ];
    // with Icon live, Bo can only ever produce an empty table
    expect(values(facet(rows, 'requestor', sel({ type: ['Icon'] }))?.values)).toEqual(['Ana']);
  });

  it('KEEPS a ticked value that has fallen to zero — the only way back off it', () => {
    const rows = [row({ sheet_row: 1, asset_type: 'Icon', requestor: 'Ana' })];
    const live = sel({ type: ['Icon'], requestor: ['Bo'] });
    const bo = facet(rows, 'requestor', live)?.values.find((v) => v.label === 'Bo');
    expect(bo, 'the ticked value vanished — nothing left to un-tick it with').toBeTruthy();
    expect([bo!.count, bo!.on]).toEqual([0, true]);
  });

  it('DROPS an axis with nothing left to offer, whole', () => {
    /* a heading over an empty group is a dead row in a panel that already has
       six of them */
    const rows = [row({ sheet_row: 1, asset_type: 'Icon', requestor: 'Ana' })];
    expect(facet(rows, 'requestor', sel({ type: ['Nothing carries this'] }))).toBeUndefined();
    // …while the axis whose own selection did the emptying still offers itself
    expect(facet(rows, 'type', sel({ type: ['Nothing carries this'] }))).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------- */
/* E — None is a value (R-pf-i, D11)                                        */
/* ---------------------------------------------------------------------- */

describe('absence is selectable on every axis that can lack a value (R-pf-i, D11)', () => {
  const rows = [
    row({ sheet_row: 1, year: 2026, month: 'August', asset_type: 'Icon', use_case: 'Brand', requestor: 'Ana' }),
    row({ sheet_row: 2, year: null, month: null, asset_type: null, use_case: null, requestor: null }),
  ];

  it('offers None on the five value axes and NEVER on STATUS', () => {
    /* STATUS is derived from a predicate table — every row has one, so there
       is no absence to offer (D2/D11). The other five read a sheet cell that
       can be blank. */
    for (const key of ['year', 'month', 'type', 'unit', 'requestor']) {
      expect(values(facet(rows, key)?.values), key).toContain('None');
    }
    expect(values(facet(rows, 'status')?.values)).not.toContain('None');
    expect(facet(rows, 'status')?.values.map((v) => v.value)).not.toContain(null);
  });

  it('sorts None LAST on every axis — it is the residue, not a value', () => {
    for (const key of ['year', 'month', 'type', 'unit', 'requestor']) {
      const vs = values(facet(rows, key)?.values);
      expect(vs[vs.length - 1], key).toBe('None');
    }
  });

  it('DERIVES it — a complete sheet never shows it', () => {
    const complete = [row({ sheet_row: 1, asset_type: 'Icon', use_case: 'Brand', requestor: 'Ana', year: 2026, month: 'August' })];
    for (const key of ['year', 'month', 'type', 'unit', 'requestor']) {
      expect(values(facet(complete, key)?.values), key).not.toContain('None');
    }
  });

  it('stores None as null and selects exactly the rows with nothing there', () => {
    /* the word and the value differ for this one item: a sheet that really
       writes "None" in a cell stays a separate checkbox (owl #63) */
    const none = facet(rows, 'unit')?.values.find((v) => v.label === 'None');
    expect(none!.value).toBe(null);
    expect(matching(rows, sel({ unit: [null] }))).toEqual([2]);
    const literal = [row({ sheet_row: 3, use_case: 'None' }), row({ sheet_row: 4, use_case: null })];
    expect(matching(literal, sel({ unit: ['None'] })), 'the word is not the absence').toEqual([3]);
    expect(matching(literal, sel({ unit: [null] }))).toEqual([4]);
  });

  it('THE POINT — every row is reachable through the values the panel offers', () => {
    const reachable = new Set<number>();
    for (const f of recipe.reqFacetList(rows, recipe.REQ_FILTERS_EMPTY())) {
      for (const v of f.values) for (const id of matching(rows, sel({ [f.key]: [v.value] }))) reachable.add(id);
    }
    expect([...reachable].sort()).toEqual([1, 2]);
  });
});

/* ---------------------------------------------------------------------- */
/* F — STATUS membership (D2)                                              */
/* ---------------------------------------------------------------------- */

describe('the STATUS axis is three DERIVED values, and a row can hold two (D2)', () => {
  const filedFlagged = row({ sheet_row: 1, status: recipe.STATUS_FILED, note: { remark: 'x', clarify: true, clarify_reason: null } });
  const unfiledFlagged = row({ sheet_row: 2, status: 'For Filing', note: { remark: '', clarify: true, clarify_reason: null } });
  const unfiledPlain = row({ sheet_row: 3, status: 'For Filing', note: null });

  it('offers the node’s three values, in the node’s order', () => {
    /* PLAN §Node amendments: the panel draws them alphabetically. `In
       Pipeline` is STATUS_FILED — the client's ONE status literal — and the
       other two are the tiles' own vocabulary, not new status values: the
       badge stays two-valued (Batch 5 ruling 21, untouched). */
    expect(recipe.REQ_STATUS_VALUES).toEqual(['For Clarification', 'For Filing', 'In Pipeline']);
    expect(recipe.REQ_STATUS_VALUES).toContain(recipe.STATUS_FILED);
    expect(values(facet([unfiledFlagged, filedFlagged], 'status')?.values)).toEqual(recipe.REQ_STATUS_VALUES);
  });

  it('derives membership from the ONE predicate table, never a second spelling', () => {
    /* the tiles and the axis read `REQUEST_SEGMENTS` through
       `REQUEST_SEGMENT_STATUS`; a row's values cannot disagree with the tile
       it is counted under because there is one predicate for both. */
    expect(Object.keys(recipe.REQUEST_SEGMENT_STATUS).sort()).toEqual(['clarification', 'filed', 'filing']);
    expect(recipe.REQUEST_SEGMENT_STATUS.filed).toBe(recipe.STATUS_FILED);
    expect(new Set(Object.values(recipe.REQUEST_SEGMENT_STATUS))).toEqual(new Set(recipe.REQ_STATUS_VALUES));
  });

  it('counts a clarified UNFILED row in For Filing AND For Clarification', () => {
    /* owl #14's subset rule, unchanged: FOR CLARIFICATION is a subset of the
       unfiled set, so the row belongs to both and the axis says so. */
    expect(recipe.reqStatusOf(unfiledFlagged)).toEqual(['For Filing', 'For Clarification']);
    expect(matching([filedFlagged, unfiledFlagged, unfiledPlain], sel({ status: ['For Filing'] }))).toEqual([2, 3]);
    expect(matching([filedFlagged, unfiledFlagged, unfiledPlain], sel({ status: ['For Clarification'] }))).toEqual([2]);
  });

  it('counts a FILED row under In Pipeline only, flag or no flag', () => {
    /* FR-11.3: In Pipeline wins. A filed row carrying a stale clarification
       flag is not "for clarification" — `clarified()` says so, and the axis
       reads that predicate rather than the flag. */
    expect(recipe.reqStatusOf(filedFlagged)).toEqual([recipe.STATUS_FILED]);
    expect(recipe.clarified(filedFlagged)).toBe(false);
    expect(matching([filedFlagged, unfiledFlagged], sel({ status: [recipe.STATUS_FILED] }))).toEqual([1]);
  });

  it('ORs the three like any other axis — For Filing plus In Pipeline is everything', () => {
    const rows = [filedFlagged, unfiledFlagged, unfiledPlain];
    expect(matching(rows, sel({ status: ['For Filing', recipe.STATUS_FILED] }))).toEqual([1, 2, 3]);
    // …and ANDs against a value axis
    const withType = [row({ sheet_row: 4, status: 'For Filing', asset_type: 'Icon' }), row({ sheet_row: 5, status: 'For Filing', asset_type: 'Assets' })];
    expect(matching(withType, sel({ status: ['For Filing'], type: ['Icon'] }))).toEqual([4]);
  });
});
