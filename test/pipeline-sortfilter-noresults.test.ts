/**
 * Pipeline NO-RESULTS state (owl #76, frame 748:18444) — the verdict and the
 * block it replaces. Split 2026-09-05 out of
 * test/pipeline-sortfilter.test.ts (section H, the no-results state); its own
 * harness below stays local because only these two describes use it. The
 * shared prelude — recipe harness and fixtures — is
 * test/helpers/pipeline-sortfilter.ts.
 *
 * BLOCK 5 (owl #77 §3, D9): the block itself is now SHARED with Requests —
 * one `{{#partial noResults}}` both tables call, and its three recipes MOVED
 * from 20-pipeline.css to 10-ui.css. What Pipeline owns is unchanged: the
 * verdict, the swap, and the copy. Those are asserted here exactly as before;
 * what changed is where each is read FROM, and that the move was a move
 * rather than a copy.
 */

import RactiveModule from 'ractive';
import { describe, expect, it } from 'vitest';
import {
  APP_JS_CODE,
  COMPUTED_CTX_JS,
  PIPELINE_CSS,
  TEMPLATE,
  UI_CSS,
  type PipeRow,
  cssRule,
  divFragment,
  method,
  partialBody,
  pipeRecipeDecls,
  pipeTableData,
  tabView,
} from './helpers/gantt-render.ts';
import { recipe } from './helpers/pipeline-sortfilter.ts';

/* ---------------------------------------------------------------------- */
/* H — the no-results state (owl #76, frame 748:18444)                      */
/* ---------------------------------------------------------------------- */

interface NoResultsHarness {
  set(key: string, value: unknown): void;
  verdict(): boolean;
}

/* `pipeNoResults` EXECUTED out of the shipped scripts, with the computeds it
   reads resolved through the same `get` — the executed-computed idiom the
   recipe block at the top of this file and the sprint-schedule-*.test.ts suites share. A
   source-text assertion could show the computed exists without showing it
   ever says true. `chipPop` stays null throughout, so `pipeChips` never
   reaches for the facet pass (its own guard above pins that ordering). */
const noResultsHarness = (): NoResultsHarness =>
  new Function(`
    ${pipeRecipeDecls()}
    const computed = { ${['pipeSearched', 'pipeSortDef', 'pipelineRows', 'pipeChips', 'pipeNoResults'].map((n) => method(n)).join(', ')} };
    const DATA = { rows: [], searchQ: '', pipeFilters: PIPE_FILTERS_EMPTY(), pipeSort: null, chipPop: null };
    ${COMPUTED_CTX_JS}
    return { set: (k, v) => { DATA[k] = v; }, verdict: () => computed.pipeNoResults.call(ctx) };
  `)() as NoResultsHarness;

/**
 * Renders the swap and everything around it. The state under test is the
 * `{{#if pipeNoResults}}` branch AROUND `.pscrollwrap`, which no helper
 * renderer slices — `renderPipelineTable` starts INSIDE the else branch — so
 * this renders the enclosing balanced `.pipestack` subtree through the
 * helper's own `divFragment` (rule 6's mechanics: shipped template, real
 * `toHTML()`, every iterated array stubbed, the recipe under test executed
 * from shipped source by the harness above rather than stubbed). The table's
 * data set IS `renderPipelineTable`'s, spread from the helper's
 * `pipeTableData`; the toolbar chrome on top renders with no menus open and
 * no chips, which is not what these assertions read anyway.
 */
const RactiveCtor = RactiveModule as unknown as {
  new (opts: { template: string; data: Record<string, unknown>; partials?: Record<string, string> }): {
    toHTML(): string;
  };
};
const renderPipestack = (state: { pipeNoResults: boolean; pipelineRows?: PipeRow[] }): string =>
  new RactiveCtor({
    template: divFragment('<div class="pipestack">'),
    // the state itself is a partial call now (D9) — registered from the
    // SHIPPED partial, so this render proves the shared block, not a stand-in
    partials: { noResults: partialBody('noResults') },
    data: {
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
      ...pipeTableData({ pipelineRows: state.pipelineRows ?? [] }),
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
    const rows: PipeRow[] = [{ cardId: 'c1', mcNumber: 'MC-800', mcLabel: 'MC-800', displayId: 'MC-800', name: 'A card', urgency: 'Non-Urgent', trelloUrl: null }];
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

  it('reaches the block through the SHARED partial, and holds no copy of it', () => {
    /* D9: Requests draws the same two lines at the same offsets, so there is
       ONE block. Pipeline's view may therefore hold the CALL and nothing else
       — a second inline copy here is how the two wordings drifted apart the
       first time. The partial's own body is what the strings above are pinned
       on, and it is defined once. */
    const view = tabView('pipeline');
    expect(view).toContain('{{>noResults}}');
    expect(view, 'the pipeline view still inlines the block').not.toContain('class="pnores"');
    expect([...TEMPLATE.matchAll(/\{\{#partial noResults\}\}/g)], 'two definitions of one partial').toHaveLength(1);
    expect([...TEMPLATE.matchAll(/class="pnores"/g)], 'the block is drawn in more than one place').toHaveLength(1);
  });

  it('echoes NO term and interpolates NOTHING — one static state for every path', () => {
    /* the frame deliberately removed the term echo from the headline; a
       mustache anywhere inside the block would be it creeping back in */
    const at = TEMPLATE.indexOf('<div class="pnores">');
    expect(at).toBeGreaterThan(-1);
    expect(TEMPLATE.slice(at, TEMPLATE.indexOf('</div>', at))).not.toContain('{{');
  });

  it('draws the state as the page body — no fill, no border, the frame’s asymmetric padding', () => {
    const rule = cssRule('.pnores', UI_CSS);
    expect(rule).not.toMatch(/background|border/);
    expect(rule).toContain('padding: 64px 64px 180px'); // heavier below floats the message above centre
    expect(rule).toContain('gap: var(--space-12)');
    expect(rule).toContain('justify-content: center');
    expect(rule).toContain('min-height: 606px'); // the frame’s message-frame height — page body, not caption
  });

  it('sets the head at weight 700 — the frame’s own, ruled to stand over the house 600', () => {
    /* Miles flagged the weight as possible drift and ruled: build what the
       frame holds. This pin is what stops a well-meant normalisation. */
    const head = cssRule('.pnores-head', UI_CSS);
    expect(head).toContain('font-weight: 700');
    expect(head).toContain('font-size: var(--text-display)');
    expect(head).toContain('line-height: 1.2');
    expect(head).toContain('color: var(--slate-900)');
  });

  it('sets the sub a step down and muted — single-weight, like the head', () => {
    const sub = cssRule('.pnores-sub', UI_CSS);
    expect(sub).toContain('font-weight: 400');
    expect(sub).toContain('font-size: var(--text-title)');
    expect(sub).toContain('line-height: 1.2');
    expect(sub).toContain('color: var(--slate-500)');
  });

  it('left 20-pipeline.css when it became shared — moved, never copied (D9)', () => {
    /* The recipes are read from 10-ui.css above. If the old ones had stayed
       behind, both sheets would declare the same three selectors and the
       later one would win silently — which is a copy, and copies drift. */
    const declared = PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const gone of ['.pnores', '.pnores-head', '.pnores-sub']) {
      expect(declared, `${gone} is still declared in the Pipeline sheet`).not.toContain(gone);
    }
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
