/**
 * Requests TABLE FOOTER + the two things that hang off it (owl #77 §1/§2,
 * nodes 809:85294 / 809:85301; PLAN.md block 5 D4/D5/D8).
 *
 * The footer is the count line and the pager, moved out of the retired filter
 * bar into a row of their own under the table. Beside it live the two rules
 * that decide what the reader is counting: the tiles are the STATUS axis's
 * second door (D4), and the sync strip warns when the sheet's own row order
 * disagrees with its date columns (D5) — because the default order trusts
 * that row order.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS_CODE,
  REQUESTS_CSS,
  TEMPLATE,
  cssRule,
  fnBody,
  handlerBody,
  observerCalls,
  tabViewCode,
} from './helpers/gantt-render.ts';
import { recipe, renderRequests, reqHarness, reqSelRig, row } from './helpers/requests-sortfilter.ts';

/** every rule in the sheet whose selector names this, comments stripped */
const rulesFor = (needle: string, css: string = REQUESTS_CSS): string =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1]!.includes(needle))
    .map((m) => m[2]!)
    .join(' ');

const sheet = (n: number) => Array.from({ length: n }, (_, i) => row({ sheet_row: i + 1, name: `Row ${i + 1}` }));
/**
 * The tile's whole write path — the handler plus, where it delegates, the
 * helper that owns the mapping (PLAN.md: `applyRequestFilter` becomes the D4
 * mapping). Read as one so a one-line handler is not read as an empty one.
 */
const tileDoor = (): string => {
  let src = handlerBody('setRequestFilter');
  try {
    src += fnBody('applyRequestFilter');
  } catch {
    // the handler may own the whole mapping — nothing to add
  }
  return src;
};
const TILES = [
  { key: 'all', cls: '', label: 'REQUESTS', value: 3, on: true },
  { key: 'filed', cls: 'green', label: 'IN PIPELINE', value: 1, on: false },
  { key: 'filing', cls: 'amber', label: 'TO FILE', value: 2, on: false },
  { key: 'clarification', cls: 'red', label: 'FOR CLARIFICATION', value: 1, on: false },
];

/* ---------------------------------------------------------------------- */
/* A — the count line (D8)                                                  */
/* ---------------------------------------------------------------------- */

describe('the footer says which slice of the table is on screen', () => {
  it('counts the page, not the sheet — 1-10 of 50', () => {
    expect(reqHarness({ requests: sheet(50) }).get('reqPageRange')).toEqual({ from: 1, to: 10, total: 50 });
    expect(reqHarness({ requests: sheet(50), reqPage: 2 }).get('reqPageRange')).toEqual({ from: 11, to: 20, total: 50 });
  });

  it('CLAMPS the last page to the rows that exist, and the page to the last one', () => {
    /* the short final page reads 41-50, never 41-50 of a page-sized window
       that runs past the end — and a `reqPage` left over from a wider table
       (a filter just narrowed it) clamps rather than showing an empty page
       with a range nobody can reach */
    expect(reqHarness({ requests: sheet(45), reqPage: 5 }).get('reqPageRange')).toEqual({ from: 41, to: 45, total: 45 });
    expect(reqHarness({ requests: sheet(45), reqPage: 99 }).get('reqPageRange')).toEqual({ from: 41, to: 45, total: 45 });
  });

  it('reads ZERO at zero rows — never an inverted range', () => {
    /* the footer does not render here (the table's branch owns it), so what
       matters is that the numbers never come out backwards, `1-0 of 0`, if a
       future caller does read them */
    const range = reqHarness().get('reqPageRange') as { from: number; to: number; total: number };
    expect(range).toEqual({ from: 0, to: 0, total: 0 });
  });

  it('counts the FILTERED set, which is the table the reader is looking at', () => {
    const rows = [
      ...sheet(3).map((r, i) => row({ sheet_row: i + 1, asset_type: 'Icon' })),
      ...[4, 5].map((n) => row({ sheet_row: n, asset_type: 'Assets' })),
    ];
    const h = reqHarness({ requests: rows, reqFilters: { ...recipe.REQ_FILTERS_EMPTY(), type: ['Icon'] } });
    expect(h.get('reqPageRange')).toEqual({ from: 1, to: 3, total: 3 });
  });

  it('draws the words around the two counts, and BOLDS only the counts', () => {
    /* node 809:85301: `Showing` / `of` / `requests` are Regular slate-500 and
       the two numbers SemiBold slate-900 — the sentence is chrome, the
       numbers are the information */
    const html = renderRequests({
      requests: sheet(50), reqFiltered: sheet(50), reqRows: sheet(10), reqStats: TILES,
      reqPage: 1, reqPageCount: 5, reqPages: [{ n: 1 }, { n: 2 }], reqPageRange: { from: 1, to: 10, total: 50 },
    });
    expect(html).toMatch(/Showing\s*<b>1-10<\/b>\s*of\s*<b>50<\/b>\s*requests/);
    expect(html).toContain('class="reqfoot-range"');
  });
});

/* ---------------------------------------------------------------------- */
/* B — the footer's own geometry (node 809:85294)                           */
/* ---------------------------------------------------------------------- */

describe('the footer is a row of its own under the table', () => {
  it('sits the count and the pager at opposite ends, on no ground of its own', () => {
    const foot = cssRule('.reqfoot', REQUESTS_CSS);
    expect(foot).toContain('display: flex');
    expect(foot).toContain('justify-content: space-between');
    expect(foot).toContain('align-items: center');
    expect(foot, 'the footer drew itself a card').not.toMatch(/background|border/);
  });

  it('sizes the ACTIVE page 32×32 with the node’s hairline, its siblings 28×32', () => {
    /* the current page is the only bordered button in the row; the node grows
       it by 4px rather than bolding it, which is the same "state is not
       weight" rule the sort panel keeps */
    /* the pair reads as one measurement: every cell in the row is 32 tall and
       28 wide, and the current page widens to 32 — so 32×32 against 28×32
       without either number being written twice */
    const base = [...REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => m[1]!.includes('.pbtn') && !m[1]!.includes('.on') && !m[1]!.includes(':'))
      .map((m) => m[2]!)
      .join(' ');
    expect(base).toMatch(/(?:min-)?width:\s*28px/);
    expect(base).toMatch(/height:\s*32px/);
    expect(base, 'the 34px pager width is the retired recipe').not.toContain('34px');

    const on = rulesFor('.pbtn.on');
    expect(on).toBeTruthy();
    expect(on).toMatch(/(?:min-)?width:\s*32px/);
    expect(on, 'the active page states its own height, which the row already sets').not.toMatch(/height:\s*(?!32px)/);
    expect(on).toMatch(/var\(--slate-300\)|#cbd5e1/i); // the 1px hairline
    expect(on).toMatch(/var\(--slate-100\)|#f1f5f9/i); // the pale fill
    expect(on, 'the active page is bolded — the node grows it instead').not.toContain('font-weight: 600');
  });

  it('drops the inline-bar recipe with the bar — no auto margin pushing it right', () => {
    /* the pager used to float at the right end of the filter bar on
       `margin-left: auto`; the footer's own space-between puts it there now,
       and both rules together is how it ends up somewhere neither intended */
    expect(rulesFor('.pager'), 'the retired auto margin is still shoving the pager').not.toContain('margin-left: auto');
  });

  it('resets the reader to page one whenever the table changes under them', () => {
    /* being left on page 4 of a table that is no longer the table you paged
       into is the disorientation paging protects against. ONE observer owns
       it, so no handler can forget it. */
    const observed = observerCalls().find((o) => o.keys.includes('reqQ'));
    expect(observed, 'nothing watches the search, the filters and the sort together').toBeTruthy();
    for (const key of ['reqQ', 'reqFilters', 'reqSort']) expect(observed!.keys, key).toContain(key);
    expect(observed!.call).toContain("app.set('reqPage', 1)");
  });
});

/* ---------------------------------------------------------------------- */
/* C — the tiles are the STATUS axis's second door (D4)                     */
/* ---------------------------------------------------------------------- */

describe('the tiles and the STATUS axis are ONE state (D4)', () => {
  const counts = { requests: 3, inPipeline: 1, toFile: 2, forClarification: 1 };
  const stats = (status: string[]) =>
    reqHarness({ requestCounts: counts, reqFilters: { ...recipe.REQ_FILTERS_EMPTY(), status } })
      .get('reqStats') as Array<{ key: string; on: boolean }>;

  it('writes the tile’s click straight into the axis, and retires the old key', () => {
    /* two controls over one field cannot disagree if they are one state: the
       segment key `requestFilter` is gone, and the tile sets the axis the
       panel's checkboxes set. The write may sit in the handler or in the
       helper it delegates to — the rule is that it lands on the axis. */
    expect(tileDoor(), 'the tile writes somewhere other than the STATUS axis').toContain('reqFilters.status');
    expect(APP_JS_CODE, 'the retired segment state survived').not.toContain('requestFilter');
    expect(tabViewCode('requests')).toContain("['setRequestFilter', s.key]");
  });

  it('maps a segment key to its status value through the ONE table', () => {
    /* `REQUEST_SEGMENT_STATUS` is the join between the tiles' vocabulary and
       the axis's values — a status string spelt again in the handler is how a
       tile ends up ticking a value the panel does not offer */
    expect(recipe.REQUEST_SEGMENT_STATUS.filing).toBe('For Filing');
    expect(recipe.REQUEST_SEGMENT_STATUS.clarification).toBe('For Clarification');
    for (const v of Object.values(recipe.REQUEST_SEGMENT_STATUS)) expect(recipe.REQ_STATUS_VALUES).toContain(v);
    expect(tileDoor(), 'a status value is spelt a second time in the tile door')
      .not.toMatch(/'For Filing'|'For Clarification'|'In Pipeline'/);
  });

  it('DERIVES the pressed tile from the axis — set the axis, the tile lights', () => {
    /* the proof that the pressed state is not a second copy: nothing here
       calls the handler, and the tile still knows */
    const on = (status: string[]) => stats(status).filter((s) => s.on).map((s) => s.key);
    expect(on(['For Filing'])).toEqual(['filing']);
    expect(on(['For Clarification'])).toEqual(['clarification']);
    expect(on([recipe.STATUS_FILED])).toEqual(['filed']);
  });

  it('presses REQUESTS exactly when the axis is empty — the show-all', () => {
    expect(stats([]).filter((s) => s.on).map((s) => s.key)).toEqual(['all']);
  });

  it('presses EVERY tile the axis holds when the panel ticks two or three (H2)', () => {
    /* PLAN.md §Fix amendment 3, H2. The STATUS group is multi-select like
       every other axis, and the tiles are its second door: with two values
       ticked, membership is what a tile stands for, not sole occupancy. The
       old `length === 1` read left every tile unpressed the moment the panel
       held two — including the two the reader had just ticked. */
    const on = (status: string[]) => stats(status).filter((s) => s.on).map((s) => s.key);
    expect(on(['For Filing', 'For Clarification'])).toEqual(['filing', 'clarification']);
    expect(on([recipe.STATUS_FILED, 'For Filing', 'For Clarification'])).toEqual(['filed', 'filing', 'clarification']);
    // REQUESTS is the show-all and nothing else: it is pressed only over an
    // empty axis, never alongside a value
    expect(on(['For Filing', 'For Clarification'])).not.toContain('all');
  });

  it('renders the pressed state off that flag, and dims the rest', () => {
    const html = renderRequests({
      requests: [row({ sheet_row: 1 })], reqFiltered: [row({ sheet_row: 1 })], reqRows: [row({ sheet_row: 1 })],
      reqStats: [{ key: 'filing', cls: 'amber', label: 'TO FILE', value: 2, on: true }],
      reqFilters: { ...recipe.REQ_FILTERS_EMPTY(), status: ['For Filing'] },
      reqPages: [{ n: 1 }], reqPageRange: { from: 1, to: 1, total: 1 },
    });
    expect(html).toContain('aria-pressed="true"');
  });

  it('dims only the tiles the two-value selection leaves out (H2)', () => {
    /* the two halves fed to each other: the shipped `reqStats` decides which
       tiles are on and the shipped markup decides which recede, so `.off` and
       `aria-pressed` cannot describe different selections. `.rstat.off` means
       "an unpicked segment" — on every tile at once it means nothing. */
    const status = ['For Filing', 'For Clarification'];
    const r = row({ sheet_row: 1 });
    const html = renderRequests({
      requests: [r], reqFiltered: [r], reqRows: [r],
      reqStats: reqHarness({ requestCounts: counts, reqFilters: { ...recipe.REQ_FILTERS_EMPTY(), status } }).get('reqStats'),
      reqFilters: { ...recipe.REQ_FILTERS_EMPTY(), status },
      reqPages: [{ n: 1 }], reqPageRange: { from: 1, to: 1, total: 1 },
    });
    const tiles = [...html.matchAll(/class="metric rstat([^"]*)"[^>]*aria-pressed="([a-z]+)"[\s\S]*?<span class="mlabel">([^<]*)</g)]
      .map((m) => ({ label: m[3]!, off: /\boff\b/.test(m[1]!), pressed: m[2] === 'true' }));
    expect(tiles.map((t) => t.label)).toEqual(['REQUESTS', 'IN PIPELINE', 'TO FILE', 'FOR CLARIFICATION']);
    expect(tiles.filter((t) => t.pressed).map((t) => t.label)).toEqual(['TO FILE', 'FOR CLARIFICATION']);
    expect(tiles.filter((t) => t.off).map((t) => t.label)).toEqual(['REQUESTS', 'IN PIPELINE']);
  });

  it('leaves the CLICK rules exactly as they were — sole re-click clears, otherwise narrow (D4)', () => {
    /* the pressed state widened; the write did not. Executed rather than read
       (test/CLAUDE.md rule 1): the door's rule is which values the axis ends
       up holding, and a regex over its body cannot tell a narrowing from a
       toggle. */
    const rig = reqSelRig();
    rig.setRequestFilter('filing');
    expect(rig.state.reqFilters.status, 'a first press narrows to exactly its value').toEqual(['For Filing']);
    rig.setRequestFilter('filing');
    expect(rig.state.reqFilters.status, 'the sole value re-clicked does not clear').toEqual([]);

    // a PRESSED tile among several is not the sole value: it narrows to itself
    const many = reqSelRig({ status: ['For Filing', 'For Clarification'] });
    many.setRequestFilter('filing');
    expect(many.state.reqFilters.status).toEqual(['For Filing']);

    // and the show-all clears whatever is there
    const all = reqSelRig({ status: [recipe.STATUS_FILED, 'For Filing'] });
    all.setRequestFilter('all');
    expect(all.state.reqFilters.status).toEqual([]);
  });

  it('CLEARS on a segment key the vocabulary does not carry (H5)', () => {
    /* `REQUEST_SEGMENT_STATUS` is an object literal, so `toString`,
       `constructor` and `valueOf` all answer to a bare lookup and none of them
       is a status. The same `Object.hasOwn` guard `toggleFacetValue` already
       carries: an unknown key is a wiring mistake, and the axis it writes must
       not become a filter over a function. */
    for (const foreign of ['toString', 'constructor', 'valueOf', 'nope']) {
      const rig = reqSelRig({ status: ['For Filing'] });
      rig.setRequestFilter(foreign);
      expect(rig.state.reqFilters.status, foreign).toEqual([]);
    }
  });
});

/* ---------------------------------------------------------------------- */
/* D — the divergence guard (D5)                                            */
/* ---------------------------------------------------------------------- */

describe('the sync strip warns when the sheet disagrees with itself (D5)', () => {
  /* the default order trusts the sheet's row order; where that order and the
     Year/Month columns tell different stories, `Recently requested` is only
     as right as the sheet is. The guard is client-side arithmetic over rows
     the client already holds — no wire change, nothing written anywhere. */
  const divergence = (rows: unknown[]) => reqHarness({ requests: rows }).get('reqOrderDivergence');

  it('counts the adjacent pairs that go BACKWARDS along the row order', () => {
    const rows = [
      row({ sheet_row: 1, year: 2026, month: 'January' }),
      row({ sheet_row: 2, year: 2026, month: 'February' }),
      row({ sheet_row: 3, year: null, month: null }),
      row({ sheet_row: 4, year: 2026, month: 'March' }),
      row({ sheet_row: 5, year: 2026, month: 'February' }),
      row({ sheet_row: 6, year: 2025, month: 'December' }),
      row({ sheet_row: 7, year: 2026, month: 'January' }),
    ];
    // rows 5 and 6 each step back from the row above them; the undated row is
    // skipped rather than counted as a step in either direction
    expect(divergence(rows)).toBe(2);
  });

  it('says zero for a sheet that agrees with itself, in either direction of month', () => {
    expect(divergence([
      row({ sheet_row: 1, year: 2025, month: 'November' }),
      row({ sheet_row: 2, year: 2026, month: 'January' }),
      row({ sheet_row: 3, year: 2026, month: 'January' }),
    ])).toBe(0);
    expect(divergence([]), 'an empty sheet cannot disagree with itself').toBe(0);
    expect(divergence([row({ sheet_row: 1, year: null, month: null }), row({ sheet_row: 2, year: null, month: null })]))
      .toBe(0);
  });

  it('reads the ROW ORDER, not the order the payload happened to arrive in', () => {
    const shuffled = [
      row({ sheet_row: 3, year: 2026, month: 'March' }),
      row({ sheet_row: 1, year: 2026, month: 'January' }),
      row({ sheet_row: 2, year: 2026, month: 'February' }),
    ];
    expect(divergence(shuffled)).toBe(0);
  });

  it('adds ONE sentence to the sync strip, and only while the count is above zero', () => {
    expect(TEMPLATE).toContain('{{#if reqOrderDivergence}}');
    const warned = renderRequests({ reqOrderDivergence: 2, reqStats: TILES });
    expect(warned).toContain('disagree in 2 places');
    const quiet = renderRequests({ reqOrderDivergence: 0, reqStats: TILES });
    expect(quiet, 'the warning showed over a sheet that agrees with itself').not.toContain('disagree in');
    // it rides the strip that is already there, rather than a banner of its own
    expect(warned).toContain('syncstrip');
  });

  it('counts PLACES, and says so in the singular at one (S2)', () => {
    /* PLAN.md §Fix amendment 3, S2. The number is the count of adjacent pairs
       that step backwards — the places where the two orders part company —
       and it was worded as a count of rows, which it is not: two rows are
       involved in each. "1 places" is also the tell that nobody rendered it
       at one. */
    const one = renderRequests({ reqOrderDivergence: 1, reqStats: TILES });
    expect(one).toContain('disagree in 1 place,');
    expect(one, 'a plural over a single place').not.toContain('1 places');
    expect(renderRequests({ reqOrderDivergence: 2, reqStats: TILES })).toContain('disagree in 2 places,');
    // the noun is the disagreement, never the rows it spans
    expect(one, 'the sentence still counts rows').not.toContain(' rows,');
  });
});
