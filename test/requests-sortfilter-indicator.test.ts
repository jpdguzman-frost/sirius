/**
 * Requests FILTER INDICATOR + the header-label guard (owl #77 §1/§4, nodes
 * 795:72905 / 841:37792 / 809:85709; PLAN.md block 5 D6/D7).
 *
 * Two things live here for the same reason they live together on Pipeline:
 * the chips SPEAK the axis words, and the header-label guard is what keeps
 * those words spelt in one place. Requests diverges from Pipeline on exactly
 * one point — ONE CHIP PER VALUE, not per axis (D7, Miles's ruling) — and
 * nowhere else.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  PIPELINE_CSS,
  REQUESTS_CSS,
  TEMPLATE,
  UI_CSS,
  cssRule,
  decl,
  handlerBody,
  method,
  observerCalls,
  tabView,
  tabViewCode,
} from './helpers/gantt-render.ts';
import {
  type ReqChip,
  type ReqSel,
  facetTickRig,
  recipe,
  renderRequests,
  reqHarness,
  reqSelRig,
  row,
  sel,
} from './helpers/requests-sortfilter.ts';

const REQ_VIEW = tabView('requests');

/* One row carrying a value on every axis, plus a second that differs on each
   — enough for any axis's facet to exist, which is what the chip builder
   reads its drawn labels from. */
const ROWS = [
  row({ sheet_row: 1, asset_type: 'Assets', use_case: 'Brand', requestor: 'Ana', year: 2026, month: 'August', status: 'For Filing' }),
  row({ sheet_row: 2, asset_type: 'Lottie File', use_case: null, requestor: 'Bo', year: 2025, month: 'March', status: recipe.STATUS_FILED }),
];
/** the chips the SHIPPED computed builds for a selection — the wiring, not just the builder */
const chips = (over: ReqSel, rows = ROWS) =>
  reqHarness({ requests: rows, reqFilters: sel(over) }).get('reqChips') as ReqChip[];
/** one value that really is on the panel, per axis */
const A_VALUE: Record<string, string | number> = {
  year: 2026, month: 'Aug', type: 'Assets', unit: 'Brand', requestor: 'Ana', status: 'For Filing',
};

/* ---------------------------------------------------------------------- */
/* A — one chip per VALUE (D7)                                              */
/* ---------------------------------------------------------------------- */

describe('the indicator says what is filtered, one chip per VALUE (D7)', () => {
  it('makes TWO chips for two values of one axis — `Type is Assets`, `Type is Lottie File`', () => {
    /* node 841:37792 draws them as two chips with two ✕s. Pipeline stays one
       chip per AXIS (R-pf-l): same recipe, different list builder, and the
       divergence is Miles's explicit ruling rather than a drift. */
    expect(chips({ type: ['Assets', 'Lottie File'] })).toEqual([
      { key: 'type', axis: 'Type', value: 'Assets', label: 'Assets' },
      { key: 'type', axis: 'Type', value: 'Lottie File', label: 'Lottie File' },
    ]);
  });

  it('names every chip’s axis from the panel’s own heading, never a second list', () => {
    /* derived, so an axis added later needs no entry anywhere for its chip to
       read correctly */
    for (const f of recipe.REQ_FILTERS) {
      const c = chips({ [f.key]: [A_VALUE[f.key]!] })[0];
      expect(c?.axis, f.key).toBe(f.label);
      expect(c?.key, f.key).toBe(f.key);
      expect(String(c?.label), f.key).toBe(String(A_VALUE[f.key]));
    }
  });

  it('lists the chips in PANEL order, whatever order they were ticked in', () => {
    expect(chips({ status: ['For Filing'], year: [2026] }).map((c) => c.key)).toEqual(['year', 'status']);
    expect(chips({})).toEqual([]);
  });

  it('draws the absence chip with the word the panel draws it with', () => {
    expect(chips({ unit: [null] })[0]!.label).toBe('None');
    expect(chips({ unit: [null] })[0]!.value).toBe(null);
  });

  it('renders nothing at all when nothing is filtered', () => {
    expect(REQ_VIEW).toContain('{{#if reqChips.length}}');
  });

  it('WRAPS the row rather than collapsing or scrolling it (JP, 2026-08-21)', () => {
    /* six axes, several of them multi-valued, one chip per value: wrapping is
       what keeps every value separately removable. The recipe is declared
       ONCE for both tabs — a Requests copy is how the two start to differ. */
    expect(cssRule('.fchips', PIPELINE_CSS)).toContain('flex-wrap: wrap');
    const own = REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(own, 'a second .fchips recipe').not.toMatch(/\.fchips\s*\{/);
  });

  it('removes ITS value on ✕, leaving the rest of the axis standing', () => {
    /* the whole point of a per-value chip: a ✕ that emptied the axis would
       make the second chip a lie about what it removes.

       EXECUTED, not read (test/CLAUDE.md rule 1; PLAN.md §Fix amendment 3,
       R2). The two regexes here before — "it calls filter(" and "it never
       writes an empty array" — were satisfied by a handler that filtered on
       the wrong axis, or on the axis's own key rather than the value, and
       said nothing at all about the absence chip, whose value IS null. */
    expect(REQ_VIEW).toContain("['removeReqChip', c.key, c.value]");

    const rig = reqSelRig({ status: ['For Filing', recipe.STATUS_FILED], type: ['Assets', 'Lottie File'] });
    rig.removeReqChip('type', 'Assets');
    expect(rig.state.reqFilters, 'the ✕ took more than its own value').toEqual({
      status: ['For Filing', recipe.STATUS_FILED],
      type: ['Lottie File'],
    });
    // a value that is not there is a no-op, not an emptying
    rig.removeReqChip('type', 'Icon');
    expect(rig.state.reqFilters.type).toEqual(['Lottie File']);
    // …and the last one leaves the axis empty rather than undefined
    rig.removeReqChip('type', 'Lottie File');
    expect(rig.state.reqFilters.type).toEqual([]);

    // the absence chip is removable: `None` is drawn, `null` is stored (D11)
    const none = reqSelRig({ unit: [null, 'Brand'] });
    none.removeReqChip('unit', null);
    expect(none.state.reqFilters.unit, 'the None chip cannot be taken off').toEqual(['Brand']);
  });

  it('clears everything through the panel’s OWN clear handler — one way to clear', () => {
    expect(REQ_VIEW).toContain('class="pmclear fclearall"');
    expect(REQ_VIEW).toContain("['clearReqFilters']");
    const body = handlerBody('clearReqFilters');
    expect(body).toContain('REQ_FILTERS_EMPTY()');
  });

  it('reads the SELECTION, not the table — a chip stands over zero rows', () => {
    /* the chips row is always live, and the value it names may have fallen to
       zero as another axis narrowed. A chips list that reconstructed itself
       from the facets would drop that chip and strand the reader on a filter
       with nothing left to un-tick it with. */
    expect(chips({ type: ['Icon'] }, []).map((c) => c.value)).toEqual(['Icon']);
  });
});

/* ---------------------------------------------------------------------- */
/* B — one word per column, wherever it is spoken (R-pf-n, D6)              */
/* ---------------------------------------------------------------------- */

describe('a Requests column and everything that names it use the SAME word', () => {
  /* The four-part guard Pipeline carries, extended to Requests — the join
     owl #77 §4 asks for by name ("UNIT renames in two places"). UNIT is a
     LABEL: storage and wire keep `use_case` (D1), the screen says Unit, and
     the class, the sort key and the axis key say `unit`. The guard is what
     stops those four from drifting apart at the next rename. */
  const COLS = recipe.REQ_COLS;

  it('is the node’s ELEVEN columns, in the node’s order, with UNIT where USE CASE was', () => {
    /* node 809:85709. The labels are stored in title case and drawn in
       capitals by the shared `.ptable` recipe, as Pipeline's are. */
    expect(COLS.map((c) => c.cls)).toEqual([
      'col-ryear', 'col-rmonth', 'col-rmc', 'col-rname', 'col-rtype', 'col-runit',
      'col-rwho', 'col-rdue', 'col-rbrief', 'col-rstatus', 'col-rnote',
    ]);
    expect(COLS.map((c) => c.label)).toEqual([
      'Year', 'Month', 'MC #', 'Deliverable', 'Type', 'Unit',
      'Requestor', 'Deadline', 'Brief', 'Status', 'Frost Notes',
    ]);
    expect(COLS.map((c) => c.cls), 'the old class is how the old word gets back in').not.toContain('col-rcase');
    expect(COLS.map((c) => c.label)).not.toContain('Use Case');
  });

  it('draws its header FROM the column table, with nothing hand-typed', () => {
    const table = REQ_VIEW.slice(REQ_VIEW.indexOf('<table class="ptable rtable">'));
    const head = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));
    expect(head).toContain('{{#each reqCols as c}}');
    expect(head, 'a hand-typed header cell is back').not.toMatch(/<th class="[a-z-]+">[A-Za-z]/);
  });

  it('draws the headers PLAIN — no sort button, no chevron (D6)', () => {
    /* header-click sorting is retired: the sort panel is the one sort door,
       and two doors with different option sets cannot agree on what "sorted"
       means. The node draws an identical INACTIVE chevron on all eleven
       columns — decoration left from the old select design, not an
       affordance — so none is drawn. */
    const table = REQ_VIEW.slice(REQ_VIEW.indexOf('<table class="ptable rtable">'));
    const head = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));
    expect(head).not.toContain('sortbtn');
    expect(head).not.toContain('aria-sort');
    expect(head).not.toContain('badgeChevron');
    expect(head).not.toContain('sarrow');
    for (const gone of ['reqSortKey', 'reqSortDir']) {
      expect(APP_JS_CODE, `${gone} survived the retirement of header sorting`).not.toContain(gone);
      expect(tabViewCode('requests'), gone).not.toContain(gone);
    }
  });

  it('gives every filter axis a column that exists, and takes its label from it', () => {
    /* the join that catches a UNIT rename landing in one place only: an axis
       pointing at a `col-` the table does not draw yields `undefined` as its
       heading, which renders an empty filter group and is visible nowhere
       else */
    expect(recipe.REQ_FILTERS.length).toBe(6);
    for (const a of recipe.REQ_FILTERS) {
      const col = COLS.find((c) => c.cls === a.col);
      expect(col, `axis "${a.key}" names column "${a.col}", which the table does not draw`).toBeTruthy();
      expect(a.label, `axis "${a.key}" has a label the column table did not supply`).toBe(col!.label);
    }
    // …and the chip says the same word again, from the same place
    expect(chips({ unit: ['Brand'] })[0]!.axis).toBe(recipe.reqColLabel('col-runit'));
    expect(recipe.reqColLabel('col-runit')).toBe('Unit');
  });

  it('every column class it emits is one the body cells and the stylesheet both know', () => {
    /* both directions: rename a `cls` and the `<th>` renders a class the
       stylesheet has no width rule for, so the header cell loses its width
       while its body cells keep theirs and the column visibly misaligns. */
    const table = REQ_VIEW.slice(REQ_VIEW.indexOf('<table class="ptable rtable">'));
    const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
    const bodyClasses = new Set([...body.matchAll(/<td class="(col-[a-z-]+)"/g)].map((m) => m[1]!));

    const css = REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const measured = new Set<string>();
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/width\s*:/.test(m[2]!)) continue;
      for (const cls of m[1]!.matchAll(/\.rtable\s+\.(col-[a-z-]+)/g)) measured.add(cls[1]!);
    }

    for (const c of COLS) {
      expect(bodyClasses, `header column "${c.cls}" has no body cell`).toContain(c.cls);
      expect(measured, `header column "${c.cls}" has no width rule — its header and body will misalign`).toContain(c.cls);
    }
  });

  it('keeps the SORT keys on the column table, and the UNIT one renamed with it', () => {
    /* the axis key, the class and the sort key are one word in three places;
       `case` surviving anywhere is the rename half-done */
    expect(COLS.find((c) => c.cls === 'col-runit')!.sort).toBe('unit');
    expect(COLS.map((c) => c.sort).filter(Boolean)).not.toContain('case');
    expect(recipe.REQ_FILTERS.map((f) => f.key)).toContain('unit');
  });

  it('keeps the UNIT word off the wire — the rename is a LABEL (D1)', () => {
    /* `use_case` also lives on Deliverable and the schedule duplicate flow: a
       storage rename is a migration for a word. The search blob is where a
       half-done rename shows first — the cell would still draw while the
       search silently stopped matching it. */
    const r = row({ sheet_row: 1, use_case: 'Brand Refresh' });
    expect(recipe.requestBlob(r)).toContain('brand refresh');
    expect(APP_JS, 'the blob stopped reading the wire field').toContain('r.use_case');
    expect(String((r as unknown as { blob: string }).blob)).toContain('brand refresh');
  });

  it('reads the UNIT cell and the UNIT axis off the same wire field', () => {
    const rows = [row({ sheet_row: 1, use_case: 'Brand' }), row({ sheet_row: 2, use_case: null })];
    const facets = reqHarness({ requests: rows }).get('reqFacets') as Array<{ key: string; label: string; values: Array<{ label: string }> }>;
    const unit = facets.find((f) => f.key === 'unit')!;
    expect(unit.label).toBe('Unit');
    expect(unit.values.map((v) => v.label)).toEqual(['Brand', 'None']);
  });

  it('houses the shared empty-state recipe once, where both tabs can wear it (D9)', () => {
    /* the chips row and the no-results block are the two pieces both tabs
       share; this half is the stylesheet's (the markup half is in
       test/requests-sortfilter-noresults.test.ts) */
    expect(UI_CSS).toContain('.pnores');
    expect(PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' '), 'the moved rules were copied, not moved').not.toMatch(/\.pnores[\s-]/);
  });
});

/* ---------------------------------------------------------------------- */
/* C — the hover panel hangs on ONE chip (PLAN.md §Fix amendment 1)         */
/* ---------------------------------------------------------------------- */

describe('the chip’s hover panel is keyed on the VALUE, not on the axis', () => {
  /* A Requests chip is one VALUE (D7), so the axis alone cannot say WHICH chip
     is hovered: keyed on the axis, an axis with two chips drew the panel under
     both of them, and a ✕ on the hovered chip left the open key naming a value
     that had gone while the axis still had others. Pipeline is one chip per
     axis (R-pf-l), so its own pair is untouched by all of this. */
  const TWO: ReqSel = { type: ['Assets', 'Lottie File'] };

  /** the Requests tab as the reader sees it with one chip's panel open */
  const openOn = (value: string | null): string => {
    const h = reqHarness({ requests: ROWS, reqFilters: sel(TWO) });
    return renderRequests({
      reqFilters: sel(TWO),
      reqChips: h.get('reqChips'),
      reqFacets: h.get('reqFacets'),
      reqFilterCount: 2,
      chipPop: 'type',
      chipPopValue: value,
    });
  };
  /** the rendered chips, one chunk each, in the order the row draws them */
  const chipChunks = (html: string): string[] => html.split('<span class="fchip"').slice(1);

  it('draws the open chip’s panel from the FACETS, and its ticks land on the Requests selection (D10/R-pf-m)', () => {
    /* Hovering a chip opens its WHOLE axis (R-pf-m) — the one place a
       neighbouring value can be ticked back on. The axis group comes from the
       template's own lookup in `reqFacets`, and the chip carries no copy of
       it: a copy was a second join that could only ever agree with the first,
       and `reqChips` paid for it by pulling the whole facet pass onto the
       search-keystroke path (PLAN.md §Fix amendment 3, S3).

       Ractive's `toHTML()` drops `on-*` directives, so the routing word cannot
       be read off the rendered panel. It is proven where it lives instead: the
       partial's click passes the GROUP's own `table`, the group the panel
       draws is the facet, and that word is run through the shipped dispatcher
       (test/CLAUDE.md rule 2). */
    const h = reqHarness({ requests: ROWS, reqFilters: sel(TWO) });
    const group = (h.get('reqFacets') as Array<{ key: string; table: string; values: Array<{ label: string; count: number }> }>)
      .find((f) => f.key === 'type')!;

    const panel = (() => {
      const chunk = chipChunks(openOn('Assets'))[0]!;
      return chunk.slice(chunk.indexOf('chipmenu'));
    })();
    expect(panel, 'the hovered chip drew no panel at all').toContain('pmitem pmcheck');
    for (const v of group.values) {
      expect(panel, `the chip’s panel is missing the ${v.label} checkbox`).toContain(`<span class="pmval">${v.label}</span>`);
    }
    expect(panel, 'the chip’s panel drew a neighbouring axis too').not.toContain('<span class="pmval">Ana</span>');

    // the partial's checkbox routes by the group's own word …
    expect(TEMPLATE).toContain("['toggleFacet', table, key, v.value]");
    // … and that word really does land on the REQUESTS selection
    const rig = facetTickRig();
    rig.toggleFacet(group.table, 'type', 'Icon');
    expect(rig.state.reqFilters, 'a tick from the chip’s own panel went nowhere').toEqual({ type: ['Icon'] });
    expect(rig.state.pipeFilters, 'a tick from the Requests chip panel wrote the Pipeline').toEqual({});
  });

  it('builds the chips from the SELECTION alone — open or closed, the same list', () => {
    /* the dead join, stated as a rule: `reqChips` reads the selection and
       nothing else, so a keystroke costs a walk of six arrays rather than a
       recount of every axis, and the chip carries no fields the template can
       read a second, disagreeing answer out of. */
    const body = method('reqChips');
    expect(body, 'the chips still read the open key').not.toContain('chipPop');
    expect(body, 'the chips still read the facet pass').not.toContain('reqFacets');

    const shape = [
      { key: 'type', axis: 'Type', value: 'Assets', label: 'Assets' },
      { key: 'type', axis: 'Type', value: 'Lottie File', label: 'Lottie File' },
    ];
    for (const open of ['type', null]) {
      const chips = reqHarness({ requests: ROWS, reqFilters: sel(TWO), chipPop: open }).get('reqChips') as ReqChip[];
      expect(chips, `chipPop = ${String(open)}`).toEqual(shape);
    }
  });

  it('draws ONE panel, under the chip the pointer is on', () => {
    const chunks = chipChunks(openOn('Assets'));
    expect(chunks).toHaveLength(2);
    expect(chunks[0], 'the chips row is not in value order').toContain('Assets');
    expect(chunks[1]).toContain('Lottie File');
    expect(chunks[0], 'the hovered chip has no panel').toContain('chipmenu');
    expect(chunks[1], 'a sibling chip of the same axis drew the panel too').not.toContain('chipmenu');
  });

  it('passes the chip’s own value in, and remembers it beside the axis', () => {
    /* the value has to travel with the hover: the template cannot ask which
       chip fired without it, and `null` (the absence value) is a legitimate
       answer rather than "nothing open" */
    expect(tabViewCode('requests')).toContain("['reqChipPopIn', c.key, c.value]");
    expect(handlerBody('reqChipPopIn'), 'the axis is remembered without the value').toContain("app.set('chipPopValue'");
    expect(APP_JS_CODE).toMatch(/reqChipPopIn\(ctx, key, value\)/);
  });

  /**
   * The shipped hover-open handler, EXECUTED against a stand-in app (the prune
   * observer's recipe, one door up): the rule is WHICH chip the panel ends up
   * under, and no reading of the handler's text can tell a moved anchor from an
   * early return. The panel's width and the viewport margin are read out of the
   * shipped source rather than copied, so the flip this asserts is the flip the
   * browser computes.
   */
  const shippedHoverIn = new Function(
    'app', 'openHoverOverlay', 'openOverlay', 'document',
    `${decl(APP_JS_CODE, 'PIPE_MENU_W')}\n${decl(APP_JS_CODE, 'OVERLAY_EDGE')}
     return function reqChipPopIn(ctx, key, value) ${handlerBody('reqChipPopIn')};`,
  ) as (
    app: { get: (k: string) => unknown; set: (k: string, v: unknown) => void },
    openHoverOverlay: (key: string, id: string) => boolean,
    openOverlay: (ctx: unknown, key: string, opts: { key: string }) => void,
    document: { documentElement: { clientWidth: number } },
  ) => (ctx: { node: { getBoundingClientRect: () => { left: number } } }, key: string, value: unknown) => void;

  const [MENU_W, EDGE] = new Function(
    `${decl(APP_JS_CODE, 'PIPE_MENU_W')}\n${decl(APP_JS_CODE, 'OVERLAY_EDGE')}
     return [PIPE_MENU_W, OVERLAY_EDGE];`,
  )() as [number, number];
  const VIEW_W = 1000;
  /** a chip at the start of the row: the panel hangs off its left edge and fits */
  const NEAR = 1;
  /** a chip far enough along the wrapped row that a left-hung panel leaves the viewport */
  const FAR = VIEW_W - EDGE - MENU_W + 1;

  /** one stand-in app wired to both doors the handler goes through */
  const hoverRig = (start: Record<string, unknown>) => {
    const state = { ...start };
    const opens: string[] = [];
    const asked: Array<[string, string]> = [];
    let refuses = false;
    const enter = shippedHoverIn(
      { get: (k) => state[k], set: (k, v) => { state[k] = v; } },
      (key, id) => { asked.push([key, id]); return !refuses; },
      // the shared door: what it writes is the axis, and it is the only writer of it
      (_ctx, key) => { opens.push(key); state.chipPop = key; },
      { documentElement: { clientWidth: VIEW_W } },
    );
    return {
      state, opens, asked,
      /** the pointer arriving on a chip whose box starts at `left` */
      hover(key: string, value: unknown, left: number, refuse = false) {
        refuses = refuse;
        enter({ node: { getBoundingClientRect: () => ({ left }) } }, key, value);
      },
    };
  };

  it('MOVES the panel to the sibling chip the pointer crossed onto', () => {
    /* the panel is a DOM child of whichever chip satisfies the template's
       guard, so moving between two chips of ONE axis moves it only if the
       remembered value moves. The shared hover door reads the axis alone and
       calls that re-entry — it refuses, correctly, because the overlay really
       is already open — so the handler has to finish the journey itself. */
    const rig = hoverRig({ chipPop: null, chipPopValue: null, chipPopFlip: false });
    rig.hover('type', 'Assets', NEAR);
    expect(rig.state.chipPopValue).toBe('Assets');
    expect(rig.state.chipPopFlip, 'a chip at the start of the row flipped').toBe(false);

    rig.hover('type', 'Lottie File', FAR, true); // the door refuses: same axis, still open
    expect(rig.asked, 'the shared door is no longer asked once per hover, about the axis').toEqual([
      ['chipPop', 'type'], ['chipPop', 'type'],
    ]);
    expect(rig.state.chipPopValue, 'the panel stayed under the first chip').toBe('Lottie File');
    expect(rig.state.chipPopFlip, 'the flip still describes the chip left behind').toBe(true);
    expect(rig.opens, 're-entry went through the shared door a second time').toEqual(['type']);
    expect(rig.state.chipPop, 'the axis is unchanged, and nothing toggled it shut').toBe('type');
  });

  it('changes nothing when the door refuses because ANOTHER overlay is up', () => {
    /* the same refusal carries two meanings, and only one of them is a moved
       anchor: with a different axis open — or any other overlay — the grazed
       chip must not repaint the panel that is up. */
    const rig = hoverRig({ chipPop: 'year', chipPopValue: 2026, chipPopFlip: false });
    rig.hover('type', 'Lottie File', FAR, true);
    expect(rig.state.chipPopValue).toBe(2026);
    expect(rig.state.chipPopFlip).toBe(false);
    expect(rig.state.chipPop).toBe('year');
    expect(rig.opens).toEqual([]);
  });

  /**
   * The shipped prune observer, EXECUTED against a stand-in app rather than
   * read for its text (test/CLAUDE.md rule 1): the rule is which situations
   * close the panel, and a keypath assertion could not tell containment from
   * emptiness. Returns every write the observer makes.
   */
  const prune = (state: Record<string, unknown>): Array<[string, unknown]> => {
    const observed = observerCalls().find((o) => o.keys.join(' ') === 'reqFilters' && o.call.includes('chipPop'));
    expect(observed, 'nothing closes a Requests chip panel whose subject is gone').toBeTruthy();
    const writes: Array<[string, unknown]> = [];
    new Function('app', observed!.call)({
      get: (k: string) => k.split('.').reduce<unknown>((o, p) => (o == null ? o : (o as Record<string, unknown>)[p]), state),
      set: (k: string, v: unknown) => { writes.push([k, v]); },
      observe: (_keys: string, fn: () => void) => fn(),
    });
    return writes;
  };

  it('CLOSES the panel when the value it hangs on is removed, axis still standing', () => {
    /* the ✕ on the hovered chip: its axis keeps `Lottie File`, so an
       axis-empty test never fires and the panel is left open over a chip that
       has unmounted — `anyMenuOpen()` then stays true against something nobody
       can see, and every hover overlay refuses to open until an unshielded
       click happens to clear it. */
    expect(prune({ chipPop: 'type', chipPopValue: 'Assets', reqFilters: { type: ['Lottie File'] } }))
      .toEqual([['chipPop', null]]);
    // containment subsumes the axis emptying, which is the case it replaced
    expect(prune({ chipPop: 'type', chipPopValue: 'Assets', reqFilters: { type: [] } }))
      .toEqual([['chipPop', null]]);
  });

  it('leaves an open panel alone when a DIFFERENT axis changes under it', () => {
    /* the observer watches the whole selection object, so every tick anywhere
       lands here; closing on one would shut the panel the reader is pointing
       at from the other side of the row */
    expect(prune({
      chipPop: 'type',
      chipPopValue: 'Assets',
      reqFilters: { type: ['Assets', 'Lottie File'], year: [2026] },
    })).toEqual([]);
    // the absence value is a value: a panel open on None survives its own axis
    expect(prune({ chipPop: 'unit', chipPopValue: null, reqFilters: { unit: [null] } })).toEqual([]);
  });
});
