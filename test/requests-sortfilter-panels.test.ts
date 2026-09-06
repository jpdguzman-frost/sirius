/**
 * Requests PANELS (owl #77 §1; PLAN.md block 5 D3/D10, R-pf-g/R-pf-j) — the
 * two icon buttons, the two dropdowns they open, where those hang, and the
 * doors they are NOT allowed to re-implement. Pipeline's panel is the
 * component; Requests declares state and accessible names, nothing else.
 *
 * What is provable without a browser: which overlay list the keys join, what
 * the markup anchors to, what the Clear controls say and when they are dead.
 * That a click opens the panel and Escape returns focus belongs to the live
 * pass.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  PIPELINE_CSS,
  REQUESTS_CSS,
  TEMPLATE,
  cssRule,
  decl,
  fnBody,
  handlerBody,
  tabView,
  tabViewCode,
} from './helpers/gantt-render.ts';
import { recipe, reqHarness, row } from './helpers/requests-sortfilter.ts';

const REQ_VIEW = tabView('requests');

/* ---------------------------------------------------------------------- */
/* A — the shared overlay door (R-pf-g)                                     */
/* ---------------------------------------------------------------------- */

describe('the two panels behave like every other overlay (R-pf-g)', () => {
  it('joins OVERLAY_KEYS as `reqSortMenu` and `reqFilterMenu`, and the old select key is GONE', () => {
    /* "opening one closes the other", outside-click, scroll-dismiss and
       Escape-with-focus-return are all things `openOverlay` already does to
       every key in this list — a second rule here could disagree with it. The
       four inline selects the panel replaces took `reqMenu` with them. */
    const keys = decl(APP_JS_CODE, 'OVERLAY_KEYS');
    expect(keys).toContain('reqSortMenu');
    expect(keys).toContain('reqFilterMenu');
    expect(keys, 'the retired select overlay is still in the list').not.toContain("'reqMenu'");
  });

  it('SHIELDS each panel’s own trigger and its own box from the dismisser', () => {
    /* THE DEFECT this guard exists for (Pipeline, 2026-08-21): a key joined
       OVERLAY_KEYS but not the shield map, so the document click that opened
       the panel closed it again in the same event and the panel could never
       appear. A missing entry is a failing test, not a dead button. */
    const shields = decl(APP_JS, 'OVERLAY_SHIELDS');
    for (const key of ['reqSortMenu', 'reqFilterMenu']) {
      expect(shields, `${key} has no shield — its own click would dismiss it`).toContain(`${key}:`);
      const entry = new RegExp(`${key}:\\s*'([^']*)'`).exec(shields)?.[1] ?? '';
      expect(entry, `${key} does not shield its trigger`).toContain('.sfbtn');
      expect(entry, `${key} does not shield its box`).toContain('.pipemenu');
    }
  });

  it('lets the panel answer its OWN wheel — a scroll inside it must not dismiss it', () => {
    /* D3 gives the Requests filter panel a viewport cap and its own
       scrollbar; without the self-scroll shield a wheel over six axes would
       shut the panel the reader is using. */
    expect(decl(APP_JS, 'OVERLAY_SELF_SCROLL')).toContain('.pipemenu');
  });

  it('opens both through the SHARED opener, asking for no placement (R-pf-j)', () => {
    /* the panels are anchored in CSS, so nothing computes a left or a top for
       them: `posKey` is the flag that says "this one needs coords", and
       neither of these does. */
    const filter = handlerBody('openReqFilter');
    const sort = handlerBody('openReqSort');
    expect(filter).toContain('openOverlay(');
    expect(filter).toContain('reqFilterMenu');
    expect(filter).not.toContain('posKey');
    expect(sort).toContain('openOverlay(');
    expect(sort).toContain('reqSortMenu');
    expect(sort).not.toContain('posKey');
    // the door itself keeps placement optional for the overlays that DO measure
    expect(fnBody('openOverlay')).toContain('opts.posKey');
  });

  it('resets both on project switch, with the search and the pager', () => {
    /* a Unit or a Requestor carried into another project names values that
       project may not have, which shows an empty table for no visible reason */
    const reset = fnBody('resetForProjectSwitch');
    for (const key of ['reqFilters', 'reqSort', 'reqQ', 'reqPage']) expect(reset, key).toContain(key);
  });

  it('retires the four inline selects with their state and their geometry', () => {
    /* the old door was four `<select>`-alikes measured into place; leaving any
       of it behind leaves a second filter door with a different option set */
    const view = tabViewCode('requests');
    for (const gone of ['reqMenuPos', 'openReqMenu', 'pickReqFilter', 'reqSortBy']) {
      expect(APP_JS_CODE, `${gone} survived the panel`).not.toContain(gone);
    }
    for (const gone of ['REQ_MENU_W', 'REQ_MENU_H']) expect(APP_JS_CODE, gone).not.toContain(gone);
    for (const cls of ['filterbar', 'rfilter', 'selwrap', 'seltrigger']) {
      expect(view, `the old select markup (${cls}) is still drawn`).not.toContain(cls);
    }
  });
});

/* ---------------------------------------------------------------------- */
/* B — anchored to the toolbar row, never to a button (R-pf-j)              */
/* ---------------------------------------------------------------------- */

describe('the panels are ANCHORED, never measured (R-pf-j, JP 2026-08-21)', () => {
  it('hangs BOTH panels off the container, not off either button', () => {
    /* THE RULE: one opening position, whichever button was pressed. Anchored
       to its own trigger instead, the filter panel travels sideways every
       time the sort button grows to name its selection. */
    const at = REQ_VIEW.indexOf('class="sortfilter"');
    expect(at, 'the Requests toolbar has no .sortfilter row').toBeGreaterThan(-1);
    const inside = REQ_VIEW.slice(at, REQ_VIEW.indexOf('pscrollwrap'));
    expect(inside, 'the filter panel left the container').toContain('pipemenu filtermenu');
    expect(inside, 'the sort panel left the container').toContain('pipemenu sortmenu');
    expect(REQ_VIEW, 'a per-button wrapper is what reintroduces the sideways travel').not.toContain('sfwrap');
  });

  it('carries NO inline coordinates and asks for no placement', () => {
    /* the whole point: nothing computes a left or a top for these two. Read on
       the toolbar block rather than the whole tab, because the table's own
       scroll thumb IS positioned in pixels and always was. */
    expect(REQ_VIEW).not.toContain('reqSortMenuPos');
    expect(REQ_VIEW).not.toContain('reqFilterMenuPos');
    const at = REQ_VIEW.indexOf('class="reqtools"');
    const toolbar = REQ_VIEW.slice(at, REQ_VIEW.indexOf('{{#if reqChips.length}}'));
    expect(toolbar, 'a panel is being placed in pixels again').not.toContain('style="');
  });

  it('positions in CSS off the row whose right edge cannot move', () => {
    /* the same shared rule Pipeline hangs on: `.sortfilter` ends at the page
       inset, so `right: 0` on it is a fixed point. Requests wears the recipe
       rather than declaring a second one. */
    expect(cssRule('.sortfilter .pipemenu', PIPELINE_CSS)).toContain('right: 0');
    expect(cssRule('.sortfilter .pipemenu', PIPELINE_CSS)).toContain('top: 100%');
    expect(cssRule('.sortfilter', PIPELINE_CSS)).toContain('position: relative');
    // comments stripped first: a Requests comment POINTING at the shared rule
    // is the right thing to write, and a raw scan would fail on it (rule 3)
    const css = REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(css, 'a second anchor recipe for the same component').not.toContain('.sortfilter .pipemenu');
  });

  it('CAPS the panel to the viewport and scrolls it, six axes deep (D3)', () => {
    /* the node draws a panel-level scrollbar: six axes cannot fit where
       Pipeline's four do. The one open-ended axis keeps its in-group scroll on
       top of that, so the short axes stay reachable. */
    const cap = cssRule('.reqtools .filtermenu', REQUESTS_CSS);
    expect(cap).toMatch(/max-height:/);
    expect(cap).toContain('overflow-y: auto');
    expect(recipe.REQ_FILTERS.filter((f) => f.scroll).map((f) => f.key)).toEqual(['requestor']);
  });
});

/* ---------------------------------------------------------------------- */
/* C — one filter-group partial, dispatched by table (D10)                  */
/* ---------------------------------------------------------------------- */

describe('both tabs draw their axes through the ONE filter-group partial (D10)', () => {
  it('dispatches the checkbox click by TABLE, so the partial stays one copy', () => {
    /* the partial was typed out twice before and drifted; it reads a CONTEXT
       rather than root state for exactly that reason. What lets Requests reuse
       it without a dynamic proxy-event name is that the click names its TABLE
       and one dispatcher reads it — so the assertion is that the table
       argument is carried and acted on, not which private helper does it. */
    expect(TEMPLATE).toContain("on-click=\"['toggleFacet', table, key, v.value]\"");
    expect(TEMPLATE, 'the partial still calls one tab’s handler directly').not.toContain("['togglePipeFilter', key, v.value]");
    const params = /toggleFacet\(([^)]*)\)/.exec(APP_JS_CODE)?.[1] ?? '';
    for (const arg of ['table', 'key', 'value']) expect(params, `toggleFacet drops ${arg}`).toContain(arg);
    expect(handlerBody('toggleFacet'), 'the dispatcher ignores which table asked').toContain('table');
    // and each tab keeps its own named door onto the same write
    expect(() => handlerBody('toggleReqFilter')).not.toThrow();
    expect(() => handlerBody('togglePipeFilter')).not.toThrow();
  });

  it('stamps every facet with the table it belongs to', () => {
    const rows = [row({ sheet_row: 1, asset_type: 'Icon' })];
    const facets = reqHarness({ requests: rows }).get('reqFacets') as Array<{ table: string; key: string }>;
    expect(facets.length).toBeGreaterThan(0);
    for (const f of facets) expect(f.table, f.key).toBe('req');
    expect(APP_JS, 'the Pipeline facets carry no table either').toContain("table: 'pipe'");
  });

  it('renders each axis through the partial, and never a hand-typed group', () => {
    expect(REQ_VIEW).toContain('{{#each reqFacets as f}}');
    expect(REQ_VIEW).toContain('{{>filterGroup f}}');
    expect(REQ_VIEW, 'the Requests panel is drawing its own checkbox rows').not.toContain('pmcheck');
    // the in-group scroll rides the axis flag, not a named axis in the markup
    expect(TEMPLATE).toContain('{{#if scroll}}pmscroll{{/if}}');
  });
});

/* ---------------------------------------------------------------------- */
/* D — the Clear controls (R-pf-g)                                          */
/* ---------------------------------------------------------------------- */

describe('Clear is dead while there is nothing to clear (R-pf-g)', () => {
  it('disables Clear filter at zero applied values and Clear Sort at rest', () => {
    expect(TEMPLATE).toContain('disabled="{{!reqFilterCount}}"');
    expect(TEMPLATE).toContain('disabled="{{!reqSort}}"');
    const h = reqHarness();
    expect(h.get('reqFilterCount'), 'a fresh tab has something to clear').toBe(0);
  });

  it('counts VALUES, not axes — the number the button’s accessible name reads', () => {
    const h = reqHarness({ reqFilters: { ...recipe.REQ_FILTERS_EMPTY(), type: ['Icon', 'Assets'], unit: ['Brand'] } });
    expect(h.get('reqFilterCount')).toBe(3);
  });

  it('says exactly what Pipeline’s three Clear controls say', () => {
    /* one recipe, one wording. The node writes `Clear Filter`; the shipped
       component writes `Clear filter`, and a second casing in a second tab is
       how the two drift. Flagged to Miles; the shipped string ships. */
    const view = tabViewCode('requests');
    expect(view).toContain('>Clear filter<');
    expect(view).toContain('>Clear Sort<');
    expect(view).toContain('>Clear all<');
  });

  it('keeps the group headings out of the tab order — they are labels, not options', () => {
    const heads = [...REQ_VIEW.matchAll(/<p class="pmhead"[^>]*>/g)].map((m) => m[0]);
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h).toContain('aria-hidden="true"');
  });

  it('puts the applied count ONLY in the filter button’s accessible name', () => {
    /* icon-only by ruling (node 593:74881 declined a count badge); with no
       label and no badge, the name is the single route to the information */
    expect(REQ_VIEW).toContain('{{#if reqFilterCount}}, {{reqFilterCount}} applied{{/if}}');
    const btn = /<button class="sfbtn[^>]*openReqFilter[\s\S]*?<\/button>/.exec(REQ_VIEW)?.[0] ?? '';
    expect(btn).toBeTruthy();
    expect(btn, 'the filter button grew a label').not.toContain('sflabel');
  });

  it('names the sort button’s one selection, as Pipeline’s does (R-pf-f)', () => {
    expect(REQ_VIEW).toContain('{{#if reqSort}}<span class="sflabel">{{reqSortLabelText}}</span>{{/if}}');
  });
});
