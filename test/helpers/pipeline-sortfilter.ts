/**
 * Shared prelude of the old `test/pipeline-sortfilter.test.ts` — split
 * 2026-09-05 into `pipeline-sortfilter-{sorts,filters,panels,indicator,
 * noresults}.test.ts`. The declarations below are that file's lines 59–120
 * verbatim; the only edit is the `export` keyword on what the five files
 * import. The old file's own header follows next, unchanged, and the import
 * line under it is this module's own — the rest of the old import block moved
 * to the five files that use it.
 */

/**
 * owl miles→jp #62 — Pipeline filter + sort (nodes 592:56850 · 592:56913 ·
 * 592:56966 · 593:78434 · 593:74881; answers in jp→miles #49).
 *
 * Both are READ-ONLY view operations over rows the client already holds, so
 * the whole feature lives in the shipped app scripts. The recipes below are
 * SLICED OUT OF THOSE SCRIPTS AND EXECUTED (the executed-computed pattern,
 * now homed across the sprint-schedule-*.test.ts suites) — a
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

import { pipeRecipeDecls } from './gantt-render.ts';

export type Sel = Record<string, (string | null)[]>;
export interface Sort { key: string; group: string; label: string; dir: number; derived?: boolean; value: (r: unknown, sel?: Sel) => unknown }
export interface Axis { key: string; col: string; label: string; pick?: (r: unknown) => unknown; work?: string; order?: string[]; none?: boolean; scroll?: boolean }
export interface FacetValue { value: string | null; label: string; count: number; on: boolean }
export interface Facet { key: string; label: string; scroll: boolean; values: FacetValue[] }
interface WorkKeys { due: string | null; urgent: 0 | 1 | null; hard: number | null }

/* The whole sort + filter recipe, sliced out of the shipped scripts by the
   helper's ONE dependency-ordered name list (`pipeRecipeDecls`) — the same
   prelude the no-results harness below and the open harness in
   test/pipeline-expanded-groups.test.ts execute, so a helper added to the recipe is
   added in one place. Names are the frozen ones (PLAN.md block 4). */
export const recipe = new Function(`
  ${pipeRecipeDecls()}
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
export const row = (over: Record<string, unknown> = {}) => ({
  cardId: 'c1', mcNumber: 'MC-800', name: 'A card', deadline: null, workStarted: null,
  workStartedTs: null, workDone: null, workDoneTs: null, urgency: 'Non-Urgent',
  difficulty: null, assetType: null, currentList: null, requestor: null, filedAt: null, work: [], ...over,
});
/* A work card as WorkCardWire carries it — the wire's own defaults:
   `Non-Urgent` is a VALUE (the absence of the Urgent label), `difficulty` and
   `due` genuinely absent until a label or a date says otherwise. */
export const wc = (over: Record<string, unknown> = {}) => ({
  cardId: 'w1', name: 'A task', urgency: 'Non-Urgent', difficulty: null, due: null, ...over,
});
export const sel = (over: Sel = {}): Sel => ({ ...recipe.PIPE_FILTERS_EMPTY(), ...over });
export const ids = (rows: unknown[]) => rows.map((r) => (r as { cardId: string }).cardId);
/** The ids of the rows the shipped matcher admits under a selection — the table, by id. */
export const matching = (rs: unknown[], live: Sel) => ids(rs.filter((r) => recipe.pipeMatches(r, live, null)));
/** One axis's facet — values, counts, ticks — as the shipped pass reads it over `rows`. */
export const facet = (rows: unknown[], key: string, live: Sel = recipe.PIPE_FILTERS_EMPTY()) =>
  recipe.pipeFacetList(rows, live).find((f) => f.key === key)!;
export const sortBy = (key: string | null, rows: unknown[], live: Sel = sel()) => {
  const s = key ? recipe.PIPE_SORTS.find((x) => x.key === key)! : recipe.PIPE_SORT_DEFAULT;
  // the SHIPPED sort path, decorate-sort-undecorate and all — not a
  // re-implementation of it around the bare comparator. The selection rides
  // along because a work-card key is read over the MATCHING children (B5).
  return recipe.pipeSortRows(rows, s, live);
};
