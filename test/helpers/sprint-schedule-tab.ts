/* The shared prelude of test/sprint-schedule-render.test.ts, split 2026-09-05
   (PLAN.md §C) — moved here verbatim so the five sprint-schedule-*.test.ts
   files can share it. */
/**
 * Sprint Schedules, rebuilt on the WORK CARD (owls #72/#73, frame 731:98513;
 * PLAN.md 2026-08-28). One row = one task card, placement is a CLICK (select
 * the row, hover a week, click), and the bar is `itemBar(row)` — start to
 * finish, finish day INCLUSIVE, out of the row's own server fields.
 *
 * RETIRED WITH THE FEATURE, 2026-08-28 (the Forecast-tab pattern — the file
 * goes, the reasoning stays where a reader will look):
 *   - test/suggest-counts.test.ts — Suggest is withdrawn (#72); no counts.
 *   - test/gantt-rowactions.test.ts — pins/copy are parked as INERT controls
 *     (ruled decision 4); the drag reversal died with the drag.
 *   - test/gantt-requestor-clip.test.ts — the Requestor and Type cells left
 *     the pinned pane (five heads now, `.c-req`/`.c-type` deleted).
 *   - test/gantt-run-geometry.test.ts — `phaseRun` gave way to `itemBar`; its
 *     MIN_GRAB and anchor-identity arithmetic is PORTED into the geometry
 *     suite below, not deleted.
 *
 * HONESTY NOTE (unchanged law): no browser runs here. Every assertion is
 * Ractive's own `toHTML()` over the SHIPPED template subtree, or an execution
 * of source sliced out of the shipped scripts (test/CLAUDE.md rules 2 and 6).
 * A real click landing on a real track is E2E's, after deploy.
 *
 * RETIRED WITH THE ADD FLOW, 2026-09-05 (owl #77 §0 — "anything built to the
 * earlier two-dropdown flow is superseded"): the hover-revealed zone, the
 * pending row, the MC and Work Card dropdowns, Add Item, and the draft row's
 * one-act commit-and-place. Their describes go; the SEARCH FIELD's take their
 * place, and the withdrawal sweep below is what keeps them gone.
 *
 * NON-VACUOUS REVERT PROOFS OWED AT VALIDATE (test/CLAUDE.md; PLAN.md) — each
 * of these guards must be shown to FAIL under the revert it names:
 *   1. an EMPTY sprint still renders header + search row (revert: filter
 *      empty groups out of `sprintGroups`)
 *   2. no auto-population — addable cards never become rows, and only a
 *      QUERY opens a panel (revert: seed `rows` from `addable` in the
 *      computed, or emit a panel for a blank query)
 *   3. the violet + gates on `!row.startsOn && plotRow === row.id &&
 *      plotWeek`, and the track's handlers on `!row.startsOn` — the checkbox
 *      gates NOTHING (revert: drop any one clause, or re-gate on `sprintSel`;
 *      the !row.startsOn render clause is review 2026-08-28b finding 1 — a
 *      hover re-armed during the placement reload must not strand chrome on
 *      the freshly plotted row)
 *   4. `addMatches` needs EVERY token — the annotation's "MC-06 Illustrate"
 *      example lists MC-06's Illustrate cards and nothing else (revert: a raw
 *      substring test, or OR across the tokens)
 *   5. MIN_GRAB widening anchors LEFT, slides left only in the final column
 *      (revert: `left = l` unclamped, or a CSS min-width)
 *   6. the bar covers the finish DAY (revert: `dayIndex(finish)` without +1)
 *   7. `.gdl` is 1px red-500 (revert: the old 2px slate-400)
 *   8. footer overlap counts include a Friday start and a Monday finish
 *      (revert: strict inequalities)
 *   9. the withdrawal sweeps (revert: reintroduce `draggable`, a drop
 *      handler, Suggest markup, or any of the retired add flow)
 *  10. the hover cell renders in BOTH tracks only under `plotRow`+`plotWeek`
 *      and wears slate-50 (revert: drop the `.ghovcell` element, its gate
 *      clause, or the `var(--slate-50)` fill)
 *  11. a PAST deadline pins to the window's LEFT edge; the right clip stays
 *      (revert: restore the `u >= 0` left clip in `deadlineTick`)
 *  12. Add All sends the PANEL'S OWN ids to the batch route in one act, and
 *      clears that sprint's query only when something was added (revert: N
 *      single POSTs, re-derive the ids, or clear unconditionally)
 *  13. plotHover refuses to re-arm mid-flight, and plotPlace demands the
 *      hover is its OWN before writing (revert: drop the `sprintItemSaving`
 *      return or the identity clause)
 *  14. Escape ALONE clears a sprint's query; Enter is inert (revert: clear on
 *      any key, or give Enter an Add All branch)
 *  15. row heights are pinned as HEIGHTS — the first keystroke moves only the
 *      field's right edge (revert: a min-height on `.gsearch`/`.gresult`)
 *  16. the two blues are two TOKENS (revert: one colour at an opacity on
 *      `.galink`/`.gaddone`/`.gaddall`)
 */

import { expect } from 'vitest';
import {
  APP_JS,
  COMPUTED_CTX_JS,
  GANTT_CSS,
  method,
  tabView,
  topDecl,
  type SprintGroup,
  type SprintScheduleRow,
} from './gantt-render.ts';

/**
 * The SECOND argument of a top-level `app.set('name', …)` — the registered
 * helper, sliced so it can be EXECUTED rather than retyped. `sprintFootText`
 * and `sprintFootCls` are registered arrows (70-measure.js), which no `decl`
 * or `method` slicer can address by name.
 */
export function appSetArg(name: string, src: string = APP_JS): string {
  const marker = `app.set('${name}',`;
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`sprint-schedule-tab: no \`app.set('${name}', …)\` in the shipped frontend source`);
  const start = at + marker.length;
  let depth = 1; // inside app.set's own paren
  for (let i = start; i < src.length; i++) {
    const c = src[i]!;
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ')' && --depth === 0) return src.slice(start, i).trim();
  }
  throw new Error(`sprint-schedule-tab: \`app.set('${name}', …)\` never closes`);
}

/**
 * The schedules view, sliced to the NEXT tab guard whichever tab that is.
 *
 * The recipe moved into `test/helpers/gantt-render.ts` as `tabView` on
 * 2026-09-05, when a third suite needed it: three private copies is how a
 * lesson gets half-remembered, and the lesson here is that the slice must not
 * name its neighbour — the Forecast withdrawal (owl #67) broke a version that
 * did, and the suite then failed on another tab's markup.
 */
export const schedulesView = (): string => tabView('schedules');

/** One single-row group, so a per-row assertion reads exactly one row. */
export const groupsOf = (...rows: SprintScheduleRow[]): SprintGroup[] => [
  { id: 's1', name: 'Sprint A', meta: 'Aug 24 - Aug 28', count: `· ${rows.length} items`, rows },
];


interface GroupsHarness {
  set(key: string, value: unknown): void;
  groups(): SprintGroup[];
  caption(): string;
  fmtDate(iso: string): string;
  itemCount(n: number): string;
}

// Computeds read `this.get(key)`; the harness `get` resolves computeds
// transparently, exactly as Ractive does (the suggest-counts idiom).
let groupsHarness: GroupsHarness | undefined;
export const H = (): GroupsHarness =>
  (groupsHarness ??= new Function(`
    ${topDecl('fmtDate')}
    ${topDecl('itemCount')}
    ${topDecl('CAP_TYPICAL_TOLERANCE')}
    ${topDecl('CAP_EDGE_SHARE')}
    ${topDecl('capacityBand')}
    const computed = { ${['sprintGroups', 'footCaption'].map((n) => method(n)).join(', ')} };
    const DATA = {
      sprintItems: { rows: [], addable: {} },
      sprints: [],
      capacity: { weekly: 8, least: 6, typical: 8, most: 10 },
    };
    ${COMPUTED_CTX_JS}
    return {
      set: (k, v) => { DATA[k] = v; },
      groups: () => computed.sprintGroups.call(ctx),
      caption: () => computed.footCaption.call(ctx),
      fmtDate,
      itemCount,
    };
  `)() as GroupsHarness);


/**
 * One panel item, shaped as the shipped `addMatches` emits them. The label is
 * spelled out here deliberately: a render proves which NODES the template
 * emits, and the label's composition is proven by executing `addLabel`
 * against `addMatches` in the source suite below.
 */
const item = (mc: string, name: string, cardId: string) => ({ cardId, mc, name, label: `${mc}: ${name}` });

/** Sprint A's panel — two results. */
export const PANEL_A = {
  items: [item('MC-06', 'Illustrate Asset: Hero Banner', 'c1'), item('MC-06', 'Illustrate Asset: Chickenjoy Mascot', 'c3')],
};
/** Sprint B's panel — a DIFFERENT card, so a leak between sprints shows. */
const PANEL_B = { items: [item('MC-07', 'Sketch Asset: Loft Plan', 'c9')] };
export const PANELS = { s1: PANEL_A, s2: PANEL_B };

/** Every `<button>` open tag in `html` whose class list carries `cls`. */
export const links = (html: string, cls: string): string[] =>
  [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(cls));

/** The one `cls` link in `html` — asserts the count so a read cannot go silent. */
export const oneLink = (html: string, cls: string): string => {
  const found = links(html, cls);
  expect(found, `expected exactly one \`${cls}\` link`).toHaveLength(1);
  return found[0]!;
};

/** A two-group render split at Sprint B's header — [Sprint A's half, B's]. */
export const bySprint = (html: string): [string, string] => {
  const at = html.indexOf('Sprint B');
  expect(at, 'the two-group fixture stopped rendering its second sprint').toBeGreaterThan(-1);
  return [html.slice(0, at), html.slice(at)];
};

/** 35-gantt.css with comments stripped — rule 3's kinder corpus for sweeps
    whose subject the sheet may legitimately NAME while explaining it. */
export const CSS = GANTT_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Every rule as `{ selector, body }`. The sheet carries no at-rules, so
    splitting on `}` lands exactly on rule boundaries. */
export const CSS_RULES: Array<{ selector: string; body: string }> = CSS.split('}')
  .map((chunk) => {
    const at = chunk.indexOf('{');
    return at < 0 ? null : { selector: chunk.slice(0, at).trim(), body: chunk.slice(at + 1) };
  })
  .filter((r): r is { selector: string; body: string } => r !== null);

/** Every rule whose selector names `.cls` as a WHOLE class token. */
export const rulesFor = (cls: string) => CSS_RULES.filter((r) => new RegExp(`\\.${cls}(?![\\w-])`).test(r.selector));

