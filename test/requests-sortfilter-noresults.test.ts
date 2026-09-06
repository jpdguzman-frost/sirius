/**
 * Requests NO-RESULTS (owl #77 §3, node 809:111116; PLAN.md block 5 D8/D9) —
 * the verdict, and the block it replaces.
 *
 * The state is Pipeline's, SHARED rather than copied: one `{{#partial
 * noResults}}`, called by both tabs, with the `.pnores` recipe moved to the
 * shared stylesheet. The two differences Requests owns are that its
 * pagination footer leaves with the table and its metric tiles stay — the
 * tiles are how the reader gets back.
 */

import { describe, expect, it } from 'vitest';
import { PIPELINE_CSS, TEMPLATE, UI_CSS, cssRule, method } from './helpers/gantt-render.ts';
import {
  pnoresBlock,
  recipe,
  renderPipeNoResults,
  renderRequests,
  reqHarness,
  row,
} from './helpers/requests-sortfilter.ts';

const TILES = [
  { key: 'all', cls: '', label: 'REQUESTS', value: 3, on: false },
  { key: 'filed', cls: 'green', label: 'IN PIPELINE', value: 1, on: false },
  { key: 'filing', cls: 'amber', label: 'TO FILE', value: 2, on: false },
  { key: 'clarification', cls: 'red', label: 'FOR CLARIFICATION', value: 1, on: false },
];
const ROWS = [row({ sheet_row: 1, name: 'Alpha' }), row({ sheet_row: 2, name: 'Beta' })];

const emptied = (over: Record<string, unknown> = {}) =>
  renderRequests({ requests: ROWS, reqFiltered: [], reqRows: [], reqNoResults: true, reqQ: 'zzz', reqStats: TILES, ...over });
const populated = (over: Record<string, unknown> = {}) =>
  renderRequests({
    requests: ROWS, reqFiltered: ROWS, reqRows: ROWS, reqNoResults: false, reqStats: TILES,
    reqPage: 1, reqPageCount: 1, reqPages: [{ n: 1 }], reqPageRange: { from: 1, to: 2, total: 2 }, ...over,
  });

/* ---------------------------------------------------------------------- */
/* A — the verdict: empty AND caused by the reader                          */
/* ---------------------------------------------------------------------- */

describe('the no-results verdict — empty AND caused by the reader', () => {
  const noHit = row({ sheet_row: 1, name: 'A request', asset_type: 'Icon' });

  it('says true for search-only, filter-only, and both together — ONE state', () => {
    expect(reqHarness({ requests: [noHit], reqQ: 'zzz-nothing-carries-this' }).get('reqNoResults'), 'search emptied the table').toBe(true);
    expect(
      reqHarness({ requests: [noHit], reqFilters: { ...recipe.REQ_FILTERS_EMPTY(), type: ['Lottie File'] } }).get('reqNoResults'),
      'a filter emptied the table',
    ).toBe(true);
    expect(
      reqHarness({
        requests: [noHit],
        reqQ: 'zzz-nothing-carries-this',
        reqFilters: { ...recipe.REQ_FILTERS_EMPTY(), type: ['Lottie File'] },
      }).get('reqNoResults'),
      'term and filter together',
    ).toBe(true);
  });

  it('says false the moment anything matches — results beat the message', () => {
    expect(reqHarness({ requests: [noHit], reqQ: 'request' }).get('reqNoResults')).toBe(false);
  });

  it('stays FALSE on a fresh empty tab — no rows, blank search, no filters', () => {
    /* the out-of-scope path, held out on purpose: a project whose sheet has
       nothing in it gets the plain table, because this state's remedy line
       points at a term or a filter that reader never set */
    const h = reqHarness();
    expect(h.get('reqNoResults')).toBe(false);
    h.set('reqQ', '   ');
    expect(h.get('reqNoResults'), 'whitespace-only search read as a caused empty').toBe(false);
  });

  it('stays FALSE for a project the SHEET emptied — a term the reader typed cannot clear that', () => {
    /* PLAN.md §Fix amendment 3, L2. The outer gate lets a rejects-only project
       through on `rejects.length`, so `requests` is empty while the tab is
       drawn: every path below it then reads "nothing to show", and the moment
       the reader touches the search field or a filter the shared state offered
       them a remedy — "clear your filters" — that cannot possibly bring a row
       back. The rejected-rows box is the honest answer whatever is typed. */
    const typed = reqHarness({ requests: [], reqQ: 'zzz-nothing-carries-this' });
    expect(typed.get('reqNoResults'), 'a search term over a rejects-only project').toBe(false);
    const filtered = reqHarness({
      requests: [],
      reqFilters: { ...recipe.REQ_FILTERS_EMPTY(), type: ['Lottie File'] },
    });
    expect(filtered.get('reqNoResults'), 'a live filter over a rejects-only project').toBe(false);
    // …and the rule is the ROWS, not the term: one usable row and the same
    // term is the reader's own doing again
    expect(reqHarness({ requests: [noHit], reqQ: 'zzz-nothing-carries-this' }).get('reqNoResults')).toBe(true);
  });

  it('reads "a filter is live" off the CHIPS’ own derivation, never a second spelling', () => {
    /* the chips row and its Clear all render from `reqChips`; a re-sum over
       the raw selection here would be a second answer to "is something
       filtering", free to drift from the first */
    const body = method('reqNoResults');
    expect(body).toContain("this.get('reqFiltered')");
    expect(body).toContain("this.get('reqQ')");
    expect(body).toContain("this.get('reqChips')");
    expect(body).not.toMatch(/reqFilters|REQ_FILTERS|reqFilterCount/);
  });
});

/* ---------------------------------------------------------------------- */
/* B — the block is SHARED with Pipeline, not copied (D9)                   */
/* ---------------------------------------------------------------------- */

describe('both tabs render the SAME empty state (D9)', () => {
  it('defines the state ONCE, as a partial both views call', () => {
    expect((TEMPLATE.match(/\{\{#partial noResults\}\}/g) ?? []).length, 'the shared state was copied, not shared').toBe(1);
    expect((TEMPLATE.match(/\{\{>noResults\}\}/g) ?? []).length, 'both tabs must call it').toBe(2);
  });

  it('renders byte-identical markup on Requests and on Pipeline', () => {
    /* the strongest form of "character-for-character": not two strings
       compared to a third, but the two tabs' own output compared to each
       other */
    const req = pnoresBlock(emptied());
    expect(req).toBe(pnoresBlock(renderPipeNoResults()));
    expect(req).toContain('<p class="pnores-head">No results found</p>');
    expect(req).toContain('<p class="pnores-sub">Try adjusting your search term or clearing active filters</p>');
  });

  it('echoes NO term and interpolates NOTHING — one static state for every path', () => {
    const at = TEMPLATE.indexOf('<div class="pnores">');
    expect(at).toBeGreaterThan(-1);
    expect(TEMPLATE.slice(at, TEMPLATE.indexOf('</div>', at))).not.toContain('{{');
  });

  it('houses the recipe in the SHARED stylesheet, and leaves none behind (D9)', () => {
    /* content moves, never copies: two `.pnores` blocks in two sheets is the
       drift this move exists to prevent */
    const pnores = cssRule('.pnores', UI_CSS);
    expect(pnores).toContain('padding: 64px 64px 180px');
    expect(pnores).toContain('min-height: 606px');
    expect(pnores).not.toMatch(/background|border/);
    expect(cssRule('.pnores-head', UI_CSS)).toContain('font-weight: 700');
    expect(cssRule('.pnores-sub', UI_CSS)).toContain('color: var(--slate-500)');
    const pipe = PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(pipe, 'the Pipeline sheet did not load — the absence below would prove nothing').toContain('.pipemenu');
    expect(pipe, 'the Pipeline sheet still declares the moved recipe').not.toMatch(/\.pnores[\s-]/);
  });
});

/* ---------------------------------------------------------------------- */
/* C — what goes and what stays (owl #77 §3, D8)                            */
/* ---------------------------------------------------------------------- */

describe('the state replaces the table, the footer goes with it, the tiles stay', () => {
  it('renders the message IN PLACE of the table — no header row survives', () => {
    const html = emptied();
    expect(html).toContain('class="pnores"');
    expect(html).not.toContain('<thead');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('pscrollwrap');
  });

  it('takes the pagination footer with it — a count of nothing is not information', () => {
    /* the Requests-only half of the state: Pipeline has no pagination to
       remove, so nothing in its own guard says this */
    const html = emptied();
    expect(html, 'the footer outlived the table it describes').not.toContain('reqfoot');
    expect(html).not.toContain('Showing');
    expect(html).not.toContain('class="pager"');
  });

  it('keeps the tiles, the sync strip and the toolbar — they are the way back', () => {
    const html = emptied();
    expect(html).toContain('rstat');
    expect(html).toContain('REQUESTS');
    expect(html).toContain('FOR CLARIFICATION');
    expect(html).toContain('syncstrip');
    expect(html).toContain('requests-search');
    // the term the reader typed is still in the field
    expect(html).toContain('zzz');
  });

  it('renders the table AND the footer whenever rows exist — one page included (D8)', () => {
    /* "Showing 1-2 of 2 requests" is information at one page too, and a
       footer that only appears past ten rows makes the table look like it
       changed shape */
    const html = populated();
    expect(html).toContain('<thead');
    expect(html).toContain('reqfoot');
    expect(html).toContain('Showing');
    expect(html).not.toContain('pnores');
  });

  it('composes the two proofs — the shipped verdict fed to the shipped markup', () => {
    /* fresh-empty renders the TABLE, not the state: the verdict comes from
       the executed computed rather than being hand-set here, so the two
       derivations cannot disagree */
    const verdict = reqHarness().get('reqNoResults') as boolean;
    expect(renderRequests({ requests: ROWS, reqFiltered: ROWS, reqRows: ROWS, reqNoResults: verdict, reqStats: TILES, reqPages: [{ n: 1 }], reqPageRange: { from: 1, to: 2, total: 2 } }))
      .toContain('<thead');
  });

  it('keeps the sheet’s own empty state apart from the reader’s', () => {
    /* every parsed row landing in rejects is not a filter the reader can
       clear, so it keeps its own dashed box rather than borrowing this one —
       and it keeps it WITH a term in the field (L2): the verdict comes from
       the executed computed rather than being hand-set here, so the two
       derivations cannot disagree about a project the sheet emptied. */
    const verdict = reqHarness({ requests: [], reqQ: 'zzz' }).get('reqNoResults') as boolean;
    const html = renderRequests({
      requests: [], rejects: [{}], reqFiltered: [], reqRows: [], reqNoResults: verdict, reqQ: 'zzz', reqStats: TILES,
    });
    expect(html).toContain('rempty');
    expect(html).toContain('No usable requests');
    expect(html, 'a remedy the reader cannot act on').not.toContain('pnores');
  });
});
