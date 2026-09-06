/**
 * Shared prelude for the Requests sort + filter suites (block 5, owl #77
 * §1–4; PLAN.md §Frozen + §Node amendments). The Requests twin of
 * test/helpers/pipeline-sortfilter.ts, and deliberately the same shape: the
 * recipe is SLICED OUT OF THE SHIPPED SCRIPTS AND EXECUTED (test/CLAUDE.md
 * rule 2) rather than retyped, the computeds are run through the
 * executed-computed resolver, and the markup goes through real Ractive
 * `toHTML()` over the shipped template (rule 6).
 *
 * It cannot literally reuse the Pipeline helper: every exported name there is
 * `pipe*`, Requests rows are flat (no work cards, no `derived` sorts), and
 * Requests pages where Pipeline scrolls.
 *
 * What this file cannot prove: that a click opens a panel, that the panel is
 * 276px on screen, that Escape returns focus. `toHTML()` has no pointer, no
 * layout and no clock — those belong to the live pass.
 */

import RactiveModule from 'ractive';
import {
  APP_JS,
  APP_JS_CODE,
  COMPUTED_CTX_JS,
  TEMPLATE,
  decl,
  divFragment,
  handlerBody,
  method,
  pipeTableData,
  tabView,
} from './gantt-render.ts';

interface RactiveCtor {
  new (opts: { template: string; partials?: Record<string, string>; data: Record<string, unknown> }): {
    toHTML(): string;
  };
}
const Ractive = RactiveModule as unknown as RactiveCtor;

/* ---- the recipe, sliced and executed ---------------------------------- */

/** a selection: axis key → the values ticked on it (`null` is the None value) */
export type ReqSel = Record<string, Array<string | number | null>>;
export interface ReqAxis {
  key: string;
  col: string;
  label: string;
  pick?: (r: unknown) => unknown;
  values?: (r: unknown) => string[];
  order?: string[];
  scroll?: boolean;
  none?: boolean;
}
export interface ReqSortDef { key: string | null; group?: string; label?: string; dir: number; value: (r: unknown) => unknown }
export interface ReqFacetValue { value: string | number | null; label: string; count: number; on: boolean }
export interface ReqFacet { table: string; key: string; label: string; scroll?: boolean; values: ReqFacetValue[] }
export interface ReqChip { key: string; axis: string; value: string | number | null; label: string }
export interface ReqCol { cls: string; label: string; sort?: string }
export type ReqFixture = Record<string, unknown> & { sheet_row: number };

/**
 * The declarations the Requests recipe needs BEFORE its own, in the order the
 * shipped source can evaluate them. Soft on purpose: these are the recipe's
 * dependencies, not PLAN.md's frozen interface, so a legitimate restructure
 * that drops one must not fail six suites with a slicer error. A dependency
 * that is genuinely still needed and genuinely gone fails loudly anyway — as
 * a ReferenceError the moment the recipe runs.
 */
const REQ_SUPPORT_NAMES = [
  'MONTHS_SHORT', 'MONTHS_LONG', 'monthShort', 'monthOrder',
  'STATUS_FILED', 'clarified', 'REQUEST_SEGMENTS', 'noteText', 'REQ_PAGE_SIZE',
  'alphaSort', 'numCmp', 'ciCmp', 'unranked', 'monthRank', 'mcRank', 'sheetRowAsc',
  'cmpNullsLast', 'pipeValueLabel',
  'requestBlob', 'blobRequests',
];
/**
 * The FROZEN names (PLAN.md §Frozen, amended by §Node amendments), in
 * dependency order — `reqColLabel` before `REQ_FILTERS`, which calls it at
 * declaration, and `reqStatusOf` before it too. A missing one throws here,
 * naming itself: that is the interface contract failing, which is what these
 * suites are for.
 */
const REQ_RECIPE_NAMES = [
  'REQ_COLS', 'reqColLabel',
  'REQ_STATUS_VALUES', 'REQUEST_SEGMENT_STATUS', 'reqStatusOf',
  'REQ_FILTERS', 'REQ_FILTERS_EMPTY',
  'REQ_SORTS', 'REQ_SORT_DEFAULT',
  'reqMatches', 'reqFacetList', 'reqSortRows', 'reqChipList', 'reqSortLabel',
];

const softDecl = (name: string): string => {
  try {
    return decl(APP_JS, name);
  } catch {
    return '';
  }
};

/** The recipe's declarations as one `new Function` prelude, plus any the caller adds. */
export const reqRecipeDecls = (extra: string[] = []): string =>
  [
    ...REQ_SUPPORT_NAMES.map(softDecl),
    ...[...REQ_RECIPE_NAMES, ...extra].map((n) => decl(APP_JS, n)),
  ]
    .filter(Boolean)
    .join('\n');

export const recipe = new Function(`
  ${reqRecipeDecls()}
  return { REQ_COLS, reqColLabel, REQ_FILTERS, REQ_FILTERS_EMPTY, REQ_STATUS_VALUES, REQUEST_SEGMENT_STATUS,
           reqStatusOf, REQ_SORTS, REQ_SORT_DEFAULT, reqMatches, reqFacetList, reqSortRows, reqChipList,
           reqSortLabel, STATUS_FILED, clarified, requestBlob, blobRequests, monthShort };
`)() as {
  REQ_COLS: ReqCol[];
  reqColLabel: (cls: string) => string;
  REQ_FILTERS: ReqAxis[];
  REQ_FILTERS_EMPTY: () => ReqSel;
  REQ_STATUS_VALUES: string[];
  REQUEST_SEGMENT_STATUS: Record<string, string>;
  reqStatusOf: (r: unknown) => string[];
  REQ_SORTS: Array<ReqSortDef & { key: string; group: string; label: string }>;
  REQ_SORT_DEFAULT: ReqSortDef;
  reqMatches: (r: unknown, sel: ReqSel, exceptKey?: string | null) => boolean;
  reqFacetList: (rows: unknown[], sel: ReqSel) => ReqFacet[];
  reqSortRows: (rows: unknown[], def: ReqSortDef) => unknown[];
  // ONE parameter (PLAN.md §Fix amendment 3, S3): the chip's hover panel reads
  // `reqFacets` in the template, so the builder joins no group onto a chip
  reqChipList: (sel: ReqSel) => ReqChip[];
  reqSortLabel: (def: ReqSortDef | string | null) => string;
  STATUS_FILED: string;
  clarified: (r: unknown) => boolean;
  requestBlob: (r: unknown) => string;
  blobRequests: (rows: unknown[]) => ReqFixture[];
  monthShort: (raw: unknown) => string;
};

/* ---- fixtures ---------------------------------------------------------- */

/**
 * One request row as `/requests` puts it on the wire, STAMPED the way
 * `blobRequests` stamps it in `loadAll` — `blob`, `_monthIdx` and `_mcRank`
 * come from the shipped stamp rather than a second copy of it, so a sort that
 * reads a stamped key reads the same key the browser would.
 *
 * `sheet_row` is the fixture identity: it is unique per project (invariant 3
 * rules `mc_number` out) and it is the field the default order keys on.
 */
export const row = (over: Record<string, unknown> = {}): ReqFixture =>
  recipe.blobRequests([{
    mc_number: 'MC-800',
    sheet_row: 1,
    name: 'A request',
    asset_type: null,
    use_case: null,
    requestor: null,
    deadline: null,
    deadline_source: null,
    brief: null,
    year: null,
    month: null,
    status: recipe.STATUS_FILED,
    note: null,
    ...over,
  }])[0]!;

/** A selection with every axis empty but the ones named. */
export const sel = (over: ReqSel = {}): ReqSel => ({ ...recipe.REQ_FILTERS_EMPTY(), ...over });
/** The rows, by their sheet row — the order assertions read as the sheet reads. */
export const ids = (rows: unknown[]): number[] => rows.map((r) => (r as ReqFixture).sheet_row);
/** The ids of the rows the SHIPPED matcher admits under a selection. */
export const matching = (rows: ReqFixture[], live: ReqSel, exceptKey: string | null = null): number[] =>
  ids(rows.filter((r) => recipe.reqMatches(r, live, exceptKey)));
/** One axis's facet — values, counts, ticks — as the shipped pass reads it. */
export const facet = (rows: ReqFixture[], key: string, live: ReqSel = recipe.REQ_FILTERS_EMPTY()): ReqFacet | undefined =>
  recipe.reqFacetList(rows, live).find((f) => f.key === key);
/** The shipped sort path — decorate/sort/undecorate and all, never the bare comparator. */
export const sortBy = (key: string | null, rows: ReqFixture[]): ReqFixture[] =>
  recipe.reqSortRows(rows, key ? recipe.REQ_SORTS.find((s) => s.key === key)! : recipe.REQ_SORT_DEFAULT) as ReqFixture[];

/* ---- the two Requests-only selection doors, executed ------------------- */

/** A stand-in app store holding only the Requests selection, and the doors that write it. */
export interface ReqSelRig {
  /** what the doors have written — the assertion reads this, never a return value */
  state: { reqFilters: Record<string, unknown> };
  /** a stat tile's click: `['setRequestFilter', s.key]` (D4) */
  setRequestFilter(segKey: unknown): void;
  /** a chip's ✕: `['removeReqChip', c.key, c.value]` (D7) */
  removeReqChip(key: string, value: unknown): void;
}

/**
 * The SHIPPED tile door (`setRequestFilter` plus the `applyRequestFilter`
 * mapping it delegates to) and the SHIPPED chip ✕ (`removeReqChip`), EXECUTED
 * against a stand-in app store (test/CLAUDE.md rules 1+2).
 *
 * Reading either for its text proves nothing that matters: the tile door's
 * rule is WHICH values the axis ends up holding after a press, and the ✕'s is
 * that it removes its own value and leaves its siblings standing — both are
 * outcomes of a write, and both were guarded by a regex over the body until
 * REVIEW round 1 (PLAN.md §Fix amendment 3, items H5 and R2).
 */
export const reqSelRig = (start: Record<string, unknown> = {}): ReqSelRig => {
  const state = { reqFilters: { ...start } };
  const app = {
    get: (k: string): unknown =>
      k.split('.').reduce<unknown>(
        (o, p) => (o == null ? o : (o as Record<string, unknown>)[p]),
        state as unknown as Record<string, unknown>,
      ),
    set: (k: string, v: unknown): void => {
      const parts = k.split('.');
      const last = parts.pop()!;
      const holder = parts.reduce<Record<string, unknown>>(
        (o, p) => (o[p] ??= {}) as Record<string, unknown>,
        state as unknown as Record<string, unknown>,
      );
      holder[last] = v;
    },
  };
  const doors = new Function(
    'app',
    `${decl(APP_JS_CODE, 'STATUS_FILED')}
     ${decl(APP_JS_CODE, 'REQUEST_SEGMENT_STATUS')}
     ${decl(APP_JS_CODE, 'applyRequestFilter')}
     return {
       setRequestFilter(_ctx, f) ${handlerBody('setRequestFilter')},
       removeReqChip(_ctx, key, value) ${handlerBody('removeReqChip')},
     };`,
  )(app) as {
    setRequestFilter(ctx: unknown, segKey: unknown): void;
    removeReqChip(ctx: unknown, key: string, value: unknown): void;
  };
  return {
    state,
    setRequestFilter: (segKey) => doors.setRequestFilter(null, segKey),
    removeReqChip: (key, value) => doors.removeReqChip(null, key, value),
  };
};

/* ---- the shared facet-tick door, executed ------------------------------ */

/** The two filter roots the one dispatcher can write, as a stand-in app store. */
export interface FacetRoots {
  reqFilters: Record<string, unknown>;
  pipeFilters: Record<string, unknown>;
}
export interface FacetTickRig {
  /** what the write left behind, both roots — the assertion reads this */
  state: FacetRoots;
  /** the shared partial's own click: `['toggleFacet', table, key, v.value]` */
  toggleFacet(table: unknown, key: string, value: unknown): void;
  /** each table's own named door onto the same write */
  toggleReqFilter(key: string, value: unknown): void;
  togglePipeFilter(key: string, value: unknown): void;
}

/**
 * The SHIPPED tick door — the `toggleFacet` handler, the per-table handlers
 * beside it and the `toggleFacetValue` write they all go through — EXECUTED
 * against a stand-in app store, keypaths and all (test/CLAUDE.md rules 1+2).
 *
 * The rule this exists for is D10: ONE filter-group partial serves both
 * tables, and which table a tick lands on is decided by the word the partial
 * carries. No reading of the source can tell a correct routing table from a
 * transposed one — both spell `req:` and `pipe:` — so the routing is run and
 * the two roots are read back.
 */
export const facetTickRig = (start: Partial<FacetRoots> = {}): FacetTickRig => {
  const state: FacetRoots = { reqFilters: { ...start.reqFilters }, pipeFilters: { ...start.pipeFilters } };
  const walk = (parts: string[]): Record<string, unknown> =>
    parts.reduce<Record<string, unknown>>(
      (o, p) => (o[p] ??= {}) as Record<string, unknown>,
      state as unknown as Record<string, unknown>,
    );
  const app = {
    get: (k: string): unknown =>
      k.split('.').reduce<unknown>(
        (o, p) => (o == null ? o : (o as Record<string, unknown>)[p]),
        state as unknown as Record<string, unknown>,
      ),
    set: (k: string, v: unknown): void => {
      const parts = k.split('.');
      const last = parts.pop()!;
      walk(parts)[last] = v;
    },
  };
  const doors = new Function(
    'app',
    `${decl(APP_JS_CODE, 'FACET_FILTER_ROOT')}
     ${decl(APP_JS_CODE, 'toggleFacetValue')}
     return {
       toggleFacet(_ctx, table, key, value) ${handlerBody('toggleFacet')},
       toggleReqFilter(_ctx, key, value) ${handlerBody('toggleReqFilter')},
       togglePipeFilter(_ctx, axis, value) ${handlerBody('togglePipeFilter')},
     };`,
  )(app) as {
    toggleFacet(ctx: unknown, table: unknown, key: string, value: unknown): void;
    toggleReqFilter(ctx: unknown, key: string, value: unknown): void;
    togglePipeFilter(ctx: unknown, axis: string, value: unknown): void;
  };
  return {
    state,
    toggleFacet: (table, key, value) => doors.toggleFacet(null, table, key, value),
    toggleReqFilter: (key, value) => doors.toggleReqFilter(null, key, value),
    togglePipeFilter: (key, value) => doors.togglePipeFilter(null, key, value),
  };
};

/* ---- the executed computeds ------------------------------------------- */

export interface ReqHarness {
  set(key: string, value: unknown): void;
  get(key: string): unknown;
}

/** Every Requests computed PLAN.md freezes, executed as one chain. */
const REQ_COMPUTEDS = [
  'reqSearched', 'reqFiltered', 'reqSorted', 'reqRows', 'reqFacets', 'reqChips', 'reqFilterCount',
  'reqSortDef', 'reqSortLabelText', 'reqNoResults', 'reqPageRange', 'reqOrderDivergence', 'reqStats',
  'reqPageCount', 'reqPages',
];

/**
 * The Requests computeds EXECUTED out of the shipped scripts, each resolving
 * the others through the same `get` (`COMPUTED_CTX_JS`) — the idiom the
 * Pipeline no-results harness uses. A source-text assertion could show a
 * computed exists without showing it ever answers anything.
 */
export const reqHarness = (init: Record<string, unknown> = {}): ReqHarness => {
  const h = new Function(`
    ${reqRecipeDecls()}
    const computed = { ${REQ_COMPUTEDS.map((n) => method(n)).join(', ')} };
    const DATA = {
      requests: [], reqQ: '', reqFilters: REQ_FILTERS_EMPTY(), reqSort: null, reqPage: 1, chipPop: null,
      requestCounts: { requests: 0, inPipeline: 0, toFile: 0, forClarification: 0 },
    };
    ${COMPUTED_CTX_JS}
    return { set: (k, v) => { DATA[k] = v; }, get: (k) => computed[k].call(ctx) };
  `)() as ReqHarness;
  for (const [k, v] of Object.entries(init)) h.set(k, v);
  return h;
};

/* ---- the render harness ------------------------------------------------ */

/** One `{{#partial name}}…{{/partial}}` body out of the shipped template. */
export const partialBody = (name: string, src: string = TEMPLATE): string => {
  const marker = `{{#partial ${name}}}`;
  const open = src.indexOf(marker);
  const close = src.indexOf('{{/partial}}', open);
  if (open < 0 || close < 0) throw new Error(`requests-sortfilter: no \`${name}\` partial in the shipped template`);
  return src.slice(open + marker.length, close);
};

const partials = (): Record<string, string> => ({
  reqSyncStrip: partialBody('reqSyncStrip'),
  filterGroup: partialBody('filterGroup'),
  noResults: partialBody('noResults'),
});

/**
 * The Ractive data the Requests TAB reads. Every array the template iterates
 * is stubbed (rule 6) — a section that renders empty must do so visibly, not
 * because its list was never supplied — and the helpers the cells call are
 * the shipped ones where a suite executes their maths elsewhere.
 */
const reqRenderData = (): Record<string, unknown> => ({
  activeTab: 'requests',
  // the OUTER gate: the tab has rows loaded. What the reader can see is
  // `reqFiltered`/`reqRows`, which each state below sets for itself.
  requests: [row()],
  rejects: [],
  reqStats: [],
  reqFilters: recipe.REQ_FILTERS_EMPTY(),
  reqQ: '',
  reqFacets: [],
  reqChips: [],
  reqFilterCount: 0,
  reqFilterMenu: null,
  reqSortMenu: null,
  reqSort: null,
  reqSortLabelText: '',
  REQ_SORT_GROUPS: [],
  chipPop: null,
  chipPopFlip: false,
  reqCols: recipe.REQ_COLS,
  reqRows: [],
  reqFiltered: [],
  reqNoResults: false,
  reqPage: 1,
  reqPageCount: 1,
  reqPages: [],
  reqPageRange: { from: 0, to: 0, total: 0 },
  reqOrderDivergence: 0,
  reqThumb: { needed: false, left: 0, width: 100 },
  syncStripLabel: 'synced 9:00 AM',
  statusFiled: recipe.STATUS_FILED,
  clarified: recipe.clarified,
  noteText: (n: unknown) => (n ? String((n as { remark?: string }).remark ?? '') : ''),
  noteEditing: null,
  noteDraft: { remark: '', clarify: false },
  noteError: '',
  icon: {},
  sheetRowUrl: () => '',
  hlr: (s: unknown) => String(s ?? ''),
  fmtLong: (s: unknown) => String(s ?? ''),
  monthShort: recipe.monthShort,
  clip180: (s: unknown) => String(s ?? ''),
});

/** The whole Requests tab, rendered from the shipped template for one view state. */
export const renderRequests = (state: Record<string, unknown> = {}): string =>
  new Ractive({
    template: tabView('requests'),
    partials: partials(),
    data: { ...reqRenderData(), ...state },
  }).toHTML();

/**
 * Pipeline's own no-results render, for the ONE assertion that needs both
 * tabs at once: that the block they draw is the same block (D9). The data is
 * the Pipeline no-results suite's, spread from the shared `pipeTableData`.
 */
export const renderPipeNoResults = (): string =>
  new Ractive({
    template: divFragment('<div class="pipestack">'),
    partials: partials(),
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
      pipeNoResults: true,
      ...pipeTableData({ pipelineRows: [], rowWarning: () => null }),
    },
  }).toHTML();

/** The rendered `.pnores` subtree, balanced — for comparing one tab's against the other's. */
export const pnoresBlock = (html: string): string => divFragment('<div class="pnores"', html);
