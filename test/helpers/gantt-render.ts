/**
 * Render harness for the Gantt planner block (phase 13i, owls #24/#26).
 *
 * The repo has no browser test runner, and the two features this exists for —
 * the work-phase legend and the collapse toggles — are pure TEMPLATE behaviour:
 * what markup Ractive emits for a given view state. Source-text assertions
 * (test/planner-weeks.test.ts's precedent) can prove a string is present but
 * not that it renders, and a Ractive comment or a mis-nested section can make
 * the two disagree silently.
 *
 * So this harness parses and renders the SHIPPED template with Ractive itself
 * — the same library and version the browser loads, and the one
 * `frontend/build.js` already parse-checks with. `toHTML()` needs no DOM, so
 * the assertions run in plain Node.
 *
 * Only one subtree is rendered per call: each is self-contained (the rest of
 * the template would drag in every tab's computeds), and its own div nesting
 * is balanced inside each `{{#if}}` branch, so the extractor can find its end
 * by counting tags. It has since grown past the Gantt — the sprints modal and
 * (batch 5) the Pipeline and Requests tables all render through the same
 * `divFragment` + `toHTML` path. The Suggest bar's renderer retired with the
 * feature (owl #72, 2026-08-28), and `renderGantt` gave way to
 * `renderSprintSchedule` when the tab body was rebuilt on the work-card unit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import RactiveModule from 'ractive';
import { appScripts, template } from './source.ts';
import type { WorkCardWire } from '../../src/services/pipeline.ts';
import type { SprintItemRow } from '../../src/services/sprint-items.ts';

/**
 * Ractive ships ESM typings inside a CommonJS package, so the default import
 * types as the module namespace under `moduleResolution: NodeNext`. The runtime
 * shape is the constructor (that is what `frontend/build.js` and the browser
 * both use), and this harness needs exactly three members of it — so it is
 * named here rather than fought with in the vendor typings.
 */
interface RactiveInstance {
  toHTML(): string;
}
interface RactiveCtor {
  new (opts: { template: string; data: Record<string, unknown>; partials?: Record<string, string> }): RactiveInstance;
  DEBUG: boolean;
  parse(template: string): unknown;
}

const Ractive = RactiveModule as unknown as RactiveCtor;

Ractive.DEBUG = false;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readFrontend = (...p: string[]) => fs.readFileSync(path.join(root, 'frontend', ...p), 'utf8');

export const TEMPLATE = template();
export const GANTT_CSS = readFrontend('styles', '35-gantt.css');
/** The planner chrome that is not the timeline — badges, toolbar, blocks. */
export const PLANNER_CSS = readFrontend('styles', '30-planner.css');
/** The sprints modal's recipes live here, not in the Gantt sheet. */
export const UI_CSS = readFrontend('styles', '10-ui.css');
/** The Pipeline table, its row states and every popover that escapes its clip. */
export const PIPELINE_CSS = readFrontend('styles', '20-pipeline.css');
/** The Requests table — status badges and the frost-note cell. */
export const REQUESTS_CSS = readFrontend('styles', '25-requests.css');
/** The design tokens — where a CSS value has a JS twin, this is its side. */
export const TOKENS_CSS = readFrontend('styles', '05-tokens.css');
/** The Deadlines tab — week columns, the deadline card, the banners, the legend. */
export const DEADLINES_CSS = readFrontend('styles', '40-deadlines.css');
/**
 * The WHOLE shipped script set, in build.js's own order and join — see
 * test/helpers/source.ts for why guards read the bundle, never one file.
 */
export const APP_JS = appScripts();

/**
 * APP_JS with block and line comments stripped — the corpus for guards that
 * must not be tripped by prose. `(^|[^:])` so a `https://…` inside a template
 * literal is not mistaken for a line comment. ONE copy, shared by every suite
 * that slices the shipped client (pipeline-warning, pipeline-expanded, …).
 */
export const APP_JS_CODE = APP_JS.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/gm, '$1');

/**
 * The body of a top-level `function NAME(…) { … }`, braces balanced, read
 * from the comment-free corpus. For assertions about STRUCTURE — which door
 * calls which, and in what order — never for snapshotting a body's text.
 * Throws (fails the calling test) when the function is missing or unclosed.
 */
export function fnBody(name: string, src: string = APP_JS_CODE): string {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`gantt-render: no \`function ${name}\` in the source given`);
  let i = src.indexOf('(', at);
  for (let depth = 0; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) break;
  }
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(open, j + 1);
  }
  throw new Error(`gantt-render: \`${name}\` never closes`);
}
export const ICONS_JS = readFrontend('scripts', '00-icons.js');

/**
 * One `<div …>` subtree of the shipped template, found by counting div tags to
 * depth 0. Each `{{#if}}` branch in these blocks is balanced on its own, so
 * counting tags lands on the right closer.
 */
export function divFragment(openTag: string, src: string = TEMPLATE): string {
  const start = src.indexOf(openTag);
  if (start < 0) throw new Error(`gantt-render: no \`${openTag}\` in the shipped template`);
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tags.exec(src)) !== null) {
    if (m[0] === '</div>') {
      if (--depth === 0) return src.slice(start, m.index + '</div>'.length);
    } else depth++;
  }
  throw new Error(`gantt-render: \`${openTag}\` never closes — its div nesting is unbalanced`);
}

/** The `<div class="gantt …">` subtree. */
export const ganttFragment = (src: string = TEMPLATE): string => divFragment('<div class="gantt ', src);

/* ------------------------------------------------------------------ *
 * Sprint Schedules — the work-card rebuild (owls #72/#73, frame 731:98513)
 *
 * `renderGantt` (deliverable rows, phase runs, drag) retired with the drag
 * on 2026-08-28; `renderSuggestBar` went with the Suggest feature the same
 * day. This renderer is their replacement for the rebuilt tab body: one row
 * = one work card, placement is a CLICK, and the bar is `itemBar(row)`.
 * ------------------------------------------------------------------ */

/**
 * A schedule row as `src/services/sprint-items.ts loadSprintItems()` puts it
 * on the wire — DERIVED from the server's own `SprintItemRow` rather than
 * hand-copied (the `WorkCardRow` precedent), so the fixture shape cannot
 * drift from the contract; the identity fields stay required and the rest
 * keeps this helper's fixture-friendly optionality.
 */
export type SprintScheduleRow = Pick<SprintItemRow, 'id' | 'sprintId' | 'cardId' | 'mcNumber' | 'name'> &
  Partial<SprintItemRow>;

/** One group as the shipped `sprintGroups()` computed emits it — no `kind`: */
export interface SprintGroup {
  id: string;
  name: string;
  meta: string;
  count: string;
  rows: SprintScheduleRow[];
}

/** One bar as the shipped `itemBar(row)` emits it (50-gantt-geometry.js). */
export interface ItemBarStub {
  left: string;
  width: string;
  cls: string;
  title: string;
}

/**
 * The #73 fixture name — a real board title long enough that every clamp is
 * tempted. The value on the row is ALWAYS this full string (the ellipsis is a
 * display clamp, not the value); test/sprint-items.test.ts pins the same
 * string on the server side.
 */
export const COREY_G = 'Sketch Asset: Corey G Singing "Chicosci Vampire Social Club" by Chicosci';

/** Plotted, urgent, on-board — the row with everything to render. */
export const PLOTTED: SprintScheduleRow = {
  id: 'i1', sprintId: 's1', cardId: 'w1', mcNumber: 'MC-655', name: 'Hero render',
  taskPrefix: 'Render Asset', difficulty: 'Hard', currentList: 'Working on design',
  status: 'ongoing', trelloUrl: null, urgent: true,
  startsOn: '2026-08-03', finish: '2026-08-12', deadline: '2026-08-28', late: false, position: 1,
};

/** Unplotted (a REAL state, #72 §6), non-urgent, no difficulty, no deadline. */
export const UNPLOTTED: SprintScheduleRow = {
  id: 'i2', sprintId: 's1', cardId: 'w2', mcNumber: 'MC-824', name: COREY_G,
  taskPrefix: 'Sketch Asset', difficulty: null, currentList: 'Backlog',
  status: 'pending', trelloUrl: null, urgent: false,
  startsOn: null, finish: null, deadline: null, late: false, position: 2,
};

/** The card left the board: `status` null is its own state, not 'ongoing'. */
export const OFF_BOARD: SprintScheduleRow = {
  id: 'i3', sprintId: 's1', cardId: 'w3', mcNumber: 'MC-712', name: 'Loft plan',
  taskPrefix: null, difficulty: 'Easy', currentList: null,
  status: null, trelloUrl: null, urgent: false,
  startsOn: '2026-08-10', finish: '2026-08-14', deadline: '2026-08-11', late: true, position: 3,
};

/**
 * The default groups: one sprint with rows and one EMPTY sprint — empty
 * renders too (the add affordance needs a home), and NO 'outside', NO
 * 'unscheduled' group exists any more (#72 §2: absence is the design).
 * `count` uses the shipped `itemCount` format ('· N items').
 */
export const SPRINT_GROUPS: SprintGroup[] = [
  { id: 's1', name: 'Sprint A', meta: 'Aug 24 - Aug 28', count: '· 3 items', rows: [PLOTTED, UNPLOTTED, OFF_BOARD] },
  { id: 's2', name: 'Sprint B', meta: 'Aug 31 - Sep 4', count: '· 0 items', rows: [] },
];

export interface SprintScheduleState {
  sprintGroups?: SprintGroup[];
  leftCollapsed?: boolean;
  collapsedBlocks?: Record<string, boolean>;
  /** single selection — the checkbox toggles it; null = nothing selected */
  sprintSel?: string | null;
  /** the week the pointer is over on the SELECTED unplotted row's track */
  plotWeek?: string | null;
  addRow?: { sprintId: string; mc: string | null; cardId: string | null; saving: boolean } | null;
  addMenu?: null | 'mc' | 'card';
  /** what the two dropdowns list — the deriving computeds are executed from
      shipped source in test/sprint-schedule-render.test.ts, never re-proven
      through a render */
  addMcOptions?: string[];
  addCardOptions?: Array<{ cardId: string; name: string; taskPrefix: string | null }>;
  /**
   * `() => []` renders a row with NO bar — unplotted, unforecastable, or
   * clipped fully outside the window. The default draws one bar so the
   * `.gitem` assertions have a node to read.
   */
  itemBar?: (row: SprintScheduleRow) => ItemBarStub[];
  deadlineTick?: (row: SprintScheduleRow) => string | null;
  sprintFootText?: (weekKey: string) => string;
  sprintFootCls?: (weekKey: string) => string;
}

/**
 * Renders the rebuilt tab body (`<div class="gantt …">`) for one view state.
 * The per-row helpers (`itemBar`, `plusLeft`, `deadlineTick`, the two foot
 * helpers) are stubbed here BECAUSE test/sprint-schedule-render.test.ts
 * executes each recipe out of the shipped scripts — what a render proves is
 * which nodes the template emits, not what is inside a bar. Every array the
 * template iterates is stubbed (rule 6), or a section renders empty and its
 * assertion passes vacuously.
 */
export function renderSprintSchedule(state: SprintScheduleState = {}): string {
  const instance = new Ractive({
    template: ganttFragment(),
    data: {
      sprintGroups: state.sprintGroups ?? SPRINT_GROUPS,
      leftCollapsed: state.leftCollapsed ?? false,
      collapsedBlocks: state.collapsedBlocks ?? {},
      sprintSel: state.sprintSel ?? null,
      plotWeek: state.plotWeek ?? null,
      addRow: state.addRow ?? null,
      addMenu: state.addMenu ?? null,
      addMcOptions: state.addMcOptions ?? ['MC-655', 'MC-824'],
      addCardOptions: state.addCardOptions ?? [],
      plannerWeeks: [
        { key: '2026-08-03', wk: 'wk1', sub: 'Aug 3–7' },
        { key: '2026-08-10', wk: 'wk2', sub: 'Aug 10–14' },
      ],
      plannerMonths: [{ month: 'AUGUST', monthKey: '2026-08', span: 2 }],
      footCaption: 'Capacity: 8',
      ganttThumb: { needed: false },
      icon: {},
      itemBar: state.itemBar
        ?? ((row: SprintScheduleRow) =>
          row.startsOn && row.finish
            ? [{ left: '0.00', width: '11.67', cls: 'render', title: `${row.startsOn} → ${row.finish}` }]
            : []),
      deadlineTick: state.deadlineTick ?? (() => null),
      // left edge of the hovered column as a track % — the shipped arithmetic
      // is `plusLeft` in 50-gantt-geometry.js, executed by the geometry suite
      plusLeft: () => '8.33',
      fmtLongIso: (iso: unknown) => (iso ? `long:${String(iso)}` : '—'),
      sprintFootText: state.sprintFootText ?? (() => '—'),
      sprintFootCls: state.sprintFootCls ?? (() => 'empty'),
    },
  });
  return instance.toHTML();
}

export interface SprintDraftRow {
  id?: string;
  name: string;
  start: string;
  end: string;
}

/** One `.sbanner` payload as the computeds emit it. */
export interface SprintBanner {
  variant: 'err' | 'warn';
  title: string;
  text: string;
  /** draft index this banner renders AFTER (gaps + overlaps only, R-f-4) */
  after?: number;
}

export interface SprintModalState {
  sprintDraft?: SprintDraftRow[];
  sprintDupNames?: SprintBanner[];
  sprintOverlaps?: SprintBanner[];
  sprintGaps?: SprintBanner[];
  /** blocking: one banner per UNNAMED row (owl #37 item 2) */
  sprintBlankNames?: SprintBanner[];
  /** blocking: one banner per row missing a start or an end date */
  sprintMissingDates?: SprintBanner[];
  sprintError?: string;
  sprintDeleteConfirm?: { idx: number; name: string; count: number } | null;
  /**
   * R7 (superseded, owl #37 item 1): the draft differs from the baseline
   * captured at open. Save is live iff dirty AND no blocking issue — so
   * opened-empty, and edit-and-put-it-back, are the same dead state.
   */
  sprintDirty?: boolean;
}

/**
 * Renders the sprints modal (owls #28–#30) for one view state.
 *
 * `modal-back` occurs exactly once in the shipped template, so the div counter
 * lands on this subtree and nothing else. The three validators are STUBBED —
 * their arithmetic is executed against the shipped source in
 * test/sprints-modal.test.ts — because what this proves is the other half:
 * which nodes each state emits, that neither banner carries a CTA, and that
 * the component's unused 1450px variant slots never reach the markup.
 *
 * `sprintBlankNames`, `sprintOverlaps` and `sprintGaps` must ALL THREE be
 * arrays: the template iterates
 * `sprintBlankNames.concat(sprintOverlaps, sprintGaps)`, and a missing stub
 * renders no banner at all rather than throwing — a silent pass. Defaulting
 * every one of them here is what stops a test from proving nothing.
 *
 * `sprintDirty` defaults FALSE — Save dead unless a state says otherwise,
 * the same polarity the retired `sprintOpenedEmpty ?? true` had.
 */
export function renderSprintModal(state: SprintModalState = {}): string {
  const blank = state.sprintBlankNames ?? [];
  const noDates = state.sprintMissingDates ?? [];
  const overlaps = state.sprintOverlaps ?? [];
  const gaps = state.sprintGaps ?? [];
  const dups = state.sprintDupNames ?? [];
  const instance = new Ractive({
    template: divFragment('<div class="modal-back"'),
    data: {
      sprintModal: true,
      sprintDraft: state.sprintDraft ?? [],
      sprintDupNames: dups,
      sprintOverlaps: overlaps,
      sprintGaps: gaps,
      sprintBlankNames: blank,
      sprintMissingDates: noDates,
      /* The template reads two DERIVED values rather than re-deriving them in
         the markup — the banner list in reading order, and "Save would be
         refused". Both are computeds in the shipped app; the harness derives
         them from the same stubs so a caller still states only the validator
         outputs, and a new blocking class cannot be stubbed into existence
         without also blocking Save. Gaps are excluded from blocking on
         purpose: they are legal and advisory (BR-5). */
      sprintRowBanners: blank.concat(noDates, overlaps, gaps),
      sprintBlocked: dups.length > 0 || blank.length > 0 || noDates.length > 0 || overlaps.length > 0,
      sprintError: state.sprintError ?? '',
      sprintDeleteConfirm: state.sprintDeleteConfirm ?? null,
      sprintDirty: state.sprintDirty ?? false,
      // LENGTH is derived and read-only; the real helper is mondaysBetween
      sprintLength: (s: SprintDraftRow) => (s && s.start && s.end ? '2 wk' : '0 wk'),
    },
  });
  return instance.toHTML();
}

/* ------------------------------------------------------------------ *
 * Pipeline + Requests tables (batch 5, owls #34–#36)
 *
 * Same contract as the blocks above: the SHIPPED template is rendered, and
 * every helper whose maths is proven elsewhere is stubbed. Two rules the
 * stubs follow, both learned the hard way in this file:
 *
 *   - every array the template iterates MUST be stubbed, or the section
 *     renders nothing and the assertion passes on an empty string;
 *   - the recipe UNDER TEST is never stubbed. `rowWarning` and `clarified`
 *     are therefore required arguments, extracted from the shipped
 *     the shipped app scripts by the suites that use them, so a render
 *     test proves the real function and the real markup together.
 * ------------------------------------------------------------------ */

/** A Pipeline row as `src/services/pipeline.ts toRow()` puts it on the wire. */
export interface PipeRow {
  cardId: string;
  mcNumber: string;
  mcLabel: string;
  displayId: string;
  name: string;
  /** the read-only Trello gaps — 'difficulty label' · 'due date' · 'Figma attachment' */
  missing: string[];
  trelloUrl: string | null;
  figmaUrl?: string | null;
  blocker?: string | null;
  assetType?: string | null;
  difficulty?: string | null;
  urgency?: string;
  currentList?: string | null;
  status?: string;
  statusNote?: string | null;
  requestor?: string | null;
  deadline?: string | null;
  overdue?: boolean;
  workStarted?: string | null;
  workDone?: string | null;
}

export interface PipelineTableState {
  pipelineRows: PipeRow[];
  /** cardId whose warning popover is open, or null for every row closed */
  warnPop?: string | null;
  /**
   * Batch 10 (T165): `placeBox` now returns the flip decision alongside the
   * coords, and the markup reads it — `up` is what puts `flip` on the card, and
   * `flip` is what moves the hover bridge to the other side. It is therefore a
   * view state a render test has to be able to set, not an implementation
   * detail: the unflipped card and the flipped one are two different renders.
   * `over` is the same contract for the last-resort scroll state (owl #43
   * item D): placeBox decides it, `scroll` on the card spells it.
   */
  warnPopPos?: { left: number; top: number; up?: boolean; over?: boolean };
  /** the SHIPPED recipe, executed out of the app scripts — never a stub */
  rowWarning: (row: PipeRow) => unknown;
  /**
   * expanded MC groups (owl #45): mcNumber → true is the reader's HAND-opened
   * state. The template never reads it — it is the harness's fallback for
   * `pipeOpen` below (a guard in test/pipeline-expanded.test.ts proves the
   * subtree gates on the derived map alone).
   */
  expanded?: Record<string, boolean>;
  /**
   * the wire's task-card map, as src/services/pipeline.ts shapes it — what
   * `stampRows` reads `work`/`hasTasks` from, and the fallback for `pipeKids`
   */
  workCardsByMc?: Record<string, WorkCardRow[]>;
  /**
   * Block 4 (owl #78 §4/§5): the template gates a group on the DERIVED
   * `pipeOpen` computed, not on `expanded` — auto-open under a work-card axis
   * or a work-card-derived sort, hand state otherwise. When a caller does not
   * supply it, the harness derives it the way the shipped computed does with
   * no trigger live (`!!expanded[mc]`), so every render written before the
   * rework still says what it said. The computed's own arithmetic is executed
   * out of the shipped scripts in test/pipeline-expanded.test.ts.
   */
  pipeOpen?: Record<string, boolean>;
  /**
   * Same contract for the children an open group DRAWS: `pipeKids` narrows
   * `workCardsByMc` to the cards matching the live work-card axes (PLAN B3)
   * and is the whole map otherwise — which is the default here.
   */
  pipeKids?: Record<string, WorkCardRow[]>;
  /** false takes the read-only due branch on task rows too */
  writesEnabled?: boolean;
  /** cardId whose due popover is open (parent or task — one global key) */
  duePopover?: string | null;
}

/**
 * A task card as the wire carries it — DERIVED from the server's own
 * `WorkCardWire` (src/services/pipeline.ts) rather than hand-copied, so the
 * fixture shape cannot drift from the contract; only `cardId`/`name` stay
 * required, the fixture-friendly optionality this helper's row types share.
 */
export type WorkCardRow = Pick<WorkCardWire, 'cardId' | 'name'> & Partial<WorkCardWire>;

/**
 * The template reads `row.warning` and `row.hasTasks`, fields `loadAll`
 * STAMPS once per load — deliberately not expressions, so neither runs per
 * row per render (the performance law). The harness stamps them the same way
 * rather than handing Ractive functions: the recipes under test are still the
 * shipped ones, and the render proves the same wiring the browser runs.
 * Exported so the executed-computed harnesses re-stamp through the same
 * recipe rather than restating it.
 */
export const stampRows = (rows: PipeRow[], recipe: (row: PipeRow) => unknown, byMc: Record<string, WorkCardRow[]>) => {
  const seen = new Set<string>();
  /* owl #52: how many deliverable rows carry each MC number. Counted from the
     rows themselves, which is exactly what the server does (`rowsByMc` in
     src/services/pipeline.ts) — so a fixture that lists two MC-837 rows turns
     shared on its own, the same way the real board does, with no second
     switch a test could set inconsistently. */
  const perMc = new Map<string, number>();
  for (const r of rows) if (r.mcNumber) perMc.set(r.mcNumber, (perMc.get(r.mcNumber) ?? 0) + 1);
  return rows.map((r) => {
    const mcDeliverables = perMc.get(r.mcNumber) ?? 1;
    /* block 4: the row carries its own work cards (`r.work`, stamped in
       loadAll beside blob/warning) and `hasTasks` is that array's length —
       the same truth as the key-presence test it replaces, since the server
       only creates a key by pushing into it */
    const work = byMc[r.mcNumber] ?? [];
    return { ...r, warning: recipe(r), work, hasTasks: work.length > 0, mcDeliverables, sharedMc: mcDeliverables > 1 };
  });
};

/* Which row each MC's task list hangs under, derived from the rows AS PASSED —
   the same rule the shipped `pipeMcAnchor` computed applies to the rendered
   order. Deriving it here rather than accepting it as state is what lets a
   fixture that hides a group's first row prove the anchor moves. */
const mcAnchor = (rows: PipeRow[]): Record<string, string> => {
  const first: Record<string, string> = {};
  for (const r of rows) if (r.mcNumber && !(r.mcNumber in first)) first[r.mcNumber] = r.cardId;
  return first;
};

/**
 * The dueCalendar partial's BODY, sliced from the shipped template. Partial
 * definitions live at the template's top level — outside every fragment
 * divFragment can slice — and Ractive silently swallows an unresolved
 * `{{>name}}`, so without registering the shipped body on the instance the
 * calendar guards pass vacuously against markup that never rendered (the
 * rule-6 hazard; caught by the 2026-08-18 review pass).
 */
const DUE_CALENDAR_PARTIAL = (() => {
  const marker = '{{#partial dueCalendar}}';
  const open = TEMPLATE.indexOf(marker);
  const close = TEMPLATE.indexOf('{{/partial}}', open);
  if (open < 0 || close < 0) throw new Error('gantt-render: no dueCalendar partial in the shipped template');
  return TEMPLATE.slice(open + marker.length, close);
})();

/**
 * Renders the Pipeline KPI strip (`<div class="metrics">`) with a supplied
 * `kpi`. Its own renderer because the strip sits OUTSIDE `.pscrollwrap` — the
 * table renderer cannot reach it, and owl #61's tile is conditional, so its
 * absence at zero has to be renderable to be provable.
 */
export function renderMetrics(kpi: Record<string, unknown>): string {
  return new Ractive({ template: divFragment('<div class="metrics">'), data: { kpi } }).toHTML();
}

export const PIPE_COLS: Array<{ cls: string; label: string }> =
  new Function(`${decl(APP_JS, 'PIPE_COLS')} return PIPE_COLS;`)();

/**
 * Renders the Pipeline table (`<div class="pscrollwrap">`, which occurs
 * exactly once — the Requests and Gantt wrappers carry a second class).
 *
 * `writesEnabled: false` is deliberate: it takes the read-only Due branch and
 * so avoids stubbing the whole date-picker calendar for a test about a
 * different cell. The urgency/difficulty menus and the due popover are all
 * closed for the same reason.
 */
/**
 * The shipped `PIPE_COLS`, EXECUTED — not a stub copy like `REQ_COLS_STUB`
 * above. The whole point of deriving the Pipeline header (2026-08-25) is that
 * the column labels live in exactly one place; a hand-copied array here would
 * put a second one in the test helper and let the render pass while the app
 * drew something else.
 */
export function renderPipelineTable(state: PipelineTableState): string {
  const instance = new Ractive({
    template: divFragment('<div class="pscrollwrap">'),
    partials: { dueCalendar: DUE_CALENDAR_PARTIAL },
    data: pipeTableData(state),
  });
  return instance.toHTML();
}

/**
 * The Ractive data the Pipeline TABLE subtree reads, for a given view state —
 * every array it iterates stubbed (rule 6), the rows stamped as `loadAll`
 * stamps them. Split out of `renderPipelineTable` so a renderer of a LARGER
 * subtree (the `.pipestack` swap in test/pipeline-sortfilter.test.ts) can
 * spread it under its own toolbar keys rather than keep a second copy.
 */
export function pipeTableData(state: PipelineTableState): Record<string, unknown> {
  return {
    pipeCols: PIPE_COLS,
    pipelineRows: stampRows(state.pipelineRows, state.rowWarning, state.workCardsByMc ?? {}),
    pipeMcAnchor: mcAnchor(state.pipelineRows),
    warnPop: state.warnPop ?? null,
    warnPopPos: state.warnPopPos ?? { left: 0, top: 0, up: false },
    // the two DERIVED gates the table reads (block 4); absent, they are what
    // the shipped computeds yield with no work axis and no derived sort live
    pipeOpen: state.pipeOpen ?? state.expanded ?? {},
    pipeKids: state.pipeKids ?? state.workCardsByMc ?? {},
    writesEnabled: state.writesEnabled ?? false,
    savingUrgency: {},
    savingDifficulty: {},
    savingDeadline: {},
    urgencyMenu: null,
    diffMenu: null,
    duePopover: state.duePopover ?? null,
    urgencyMenuPos: { left: 0, top: 0 },
    diffMenuPos: { left: 0, top: 0 },
    pipeThumb: { needed: false },
    icon: {},
    // the highlighter wraps query matches in <mark>; with no query it is
    // identity, which is what these assertions want to read
    hl: (s: unknown) => String(s ?? ''),
    fmtLong: (s: unknown) => String(s ?? ''),
    fmtInstant: () => '',
    // the due popover's calendar internals are another suite's business —
    // an empty grid renders the popover SHELL (head, shortcuts, Clear,
    // Apply), which is all the structural assertions here read
    dueGrid: () => [],
    dueMonthLabel: () => '',
    dueMonth: '',
    dueStaged: null,
    dowNames: [],
    duePopPos: { left: 0, top: 0 },
  };
}

/** One frost note as `/requests` puts it on the wire. */
export interface ReqNote {
  remark: string | null;
  clarify: boolean;
  clarify_reason: string | null;
}

/** A Requests row as `src/routes/requests.ts` puts it on the wire. */
export interface ReqRow {
  mc_number: string;
  sheet_row?: number | null;
  name: string;
  asset_type?: string | null;
  use_case?: string | null;
  requestor?: string | null;
  deadline?: string | null;
  deadline_source?: string | null;
  brief?: string | null;
  year?: number | null;
  month?: string | null;
  /** two-valued since owls #34/#35: 'In Pipeline' | 'For Filing' */
  status: string;
  note: ReqNote | null;
}

export interface RequestsTableState {
  reqRows: ReqRow[];
  /** STATUS_FILED out of the shipped source — the one status literal the client owns */
  statusFiled: string;
  /** the SHIPPED clarification predicate, executed out of the app scripts */
  clarified: (r: ReqRow) => boolean;
  /** the shipped noteText() — resolves a legacy clarify_reason into one string */
  noteText: (n: ReqNote | null) => string;
  /** mc_number whose inline editor is open (null = every row in display state) */
  noteEditing?: string | null;
}

/**
 * The header columns, by `cls`/`label`/`sort` only. REQ_COLS also carries the
 * sort accessors and comparators, which test/requests-sort coverage owns —
 * what the table needs to render is the three display fields.
 */
const REQ_COLS_STUB = [
  { cls: 'col-ryear', label: 'Year', sort: 'year' },
  { cls: 'col-rmonth', label: 'Month', sort: 'month' },
  { cls: 'col-rmc', label: 'MC #', sort: 'mc' },
  { cls: 'col-rname', label: 'Deliverable', sort: 'name' },
  { cls: 'col-rtype', label: 'Type', sort: 'type' },
  { cls: 'col-rcase', label: 'Use Case', sort: 'case' },
  { cls: 'col-rwho', label: 'Requestor', sort: 'who' },
  { cls: 'col-rdue', label: 'Deadline', sort: 'due' },
  { cls: 'col-rbrief', label: 'Brief', sort: '' },
  { cls: 'col-rstatus', label: 'Status', sort: 'status' },
  { cls: 'col-rnote', label: 'Frost Notes', sort: '' },
];

/** Renders the Requests table (`<div class="pscrollwrap reqwrap">`). */
export function renderRequestsTable(state: RequestsTableState): string {
  const instance = new Ractive({
    template: divFragment('<div class="pscrollwrap reqwrap">'),
    data: {
      reqRows: state.reqRows,
      statusFiled: state.statusFiled,
      clarified: state.clarified,
      noteText: state.noteText,
      noteEditing: state.noteEditing ?? null,
      reqCols: REQ_COLS_STUB,
      reqSortKey: '',
      reqSortDir: 'desc',
      reqThumb: { needed: false },
      noteDraft: { remark: '', clarify: false },
      noteError: '',
      icon: {},
      // no sheet URL is derivable in tests, so the row link renders as the
      // plain-text branch — the note cell is what these suites read
      sheetRowUrl: () => '',
      hlr: (s: unknown) => String(s ?? ''),
      fmtLong: (s: unknown) => String(s ?? ''),
      monthShort: (s: unknown) => String(s ?? ''),
      clip180: (s: unknown) => String(s ?? ''),
    },
  });
  return instance.toHTML();
}

/**
 * One top-level `const NAME = …;` declaration, sliced out of the shipped
 * frontend source so a test can EXECUTE the recipe the browser runs rather
 * than a retyped copy of it. The declaration ends at the first `;` outside
 * any bracket — which is why every shared recipe has to be a column-0 `const`
 * rather than an inline arrow inside the `data:` object or a `computed:`
 * method. (test/suggest-counts.test.ts keeps its own copy of this plus a
 * `method()` slicer for computeds; this one serves the batch-5 suites.)
 */
export function decl(src: string, name: string): string {
  const at = src.indexOf(`\nconst ${name} =`);
  if (at < 0) throw new Error(`gantt-render: no declaration of \`${name}\` in the source given`);
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i]!;
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`gantt-render: unterminated declaration \`${name}\``);
}

/**
 * One Ractive `computed` method (`  name() { … }`), sliced by brace matching.
 * Three suites had kept byte-identical private copies of this; the convention
 * it encodes (two-space indent, `name() {`) is a property of the shipped file,
 * so it belongs beside `decl` and `fnBody` rather than in each caller.
 */
export function method(name: string, src: string = APP_JS): string {
  const at = src.indexOf(`\n    ${name}() {`);
  if (at < 0) throw new Error(`gantt-render: no computed \`${name}()\` in the shipped frontend source`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`gantt-render: unterminated computed \`${name}()\``);
}

/**
 * Every top-level const the Pipeline sort + filter recipe needs, in the order
 * the shipped source can evaluate them (PIPE_FILTERS calls pipeColLabel at
 * declaration; PIPE_WORK_FILTERS filters PIPE_FILTERS). ONE list: three
 * harnesses execute this recipe — the sortfilter recipe and no-results
 * harness, the expanded open harness — and three hand-copied decl lists
 * drifted by a name each time a helper was added (block 4). A new helper is
 * added here once. Names are the frozen ones (PLAN.md block 4).
 */
const PIPE_RECIPE_NAMES = [
  'DIFF_RANK', 'PIPE_SORTS', 'PIPE_SORT_DEFAULT', 'cmpNullsLast', 'pipeTiebreak', 'pipeCompare', 'pipeSortRows',
  'PIPE_COLS', 'pipeColLabel', 'PIPE_FILTERS', 'PIPE_WORK_FILTERS', 'unranked', 'alphaSort', 'pipePick', 'pipeWorkPick',
  'pipeValueLabel', 'PIPE_FILTERS_EMPTY', 'pipeWorkMatch', 'pipeWorkKids', 'pipeValues', 'pipeWorkKeys', 'pipeMatches',
  'pipeFacetList', 'pipeChipList', 'pipeSortLabel', 'mcRank',
];
/** The recipe's declarations as one `new Function` prelude, plus any the caller adds. */
export const pipeRecipeDecls = (extra: string[] = []): string =>
  [...PIPE_RECIPE_NAMES, ...extra].map((n) => decl(APP_JS, n)).join('\n');

/**
 * The executed-computed resolver: a `this` whose `get` answers a computed by
 * CALLING it (so a computed that reads another goes through the same door)
 * and anything else from a `DATA` object. Expects `computed` and `DATA` in
 * scope — every harness declares both, then this line.
 */
export const COMPUTED_CTX_JS =
  'const ctx = { get: (k) => (Object.prototype.hasOwnProperty.call(computed, k) ? computed[k].call(ctx) : DATA[k]) };';

/**
 * Every `app.observe('keys', …)` call in the shipped client: the keypaths it
 * names and the call's full text, paren-balanced from `app.observe(`. A guard
 * about an observer asserts the RULE — which keys, what the body does — from
 * this rather than from a text snapshot of the line (test/CLAUDE.md rule 1).
 */
export function observerCalls(src: string = APP_JS_CODE): Array<{ keys: string[]; call: string }> {
  return [...src.matchAll(/app\.observe\('([^']+)'/g)].map((m) => {
    let depth = 0;
    for (let i = m.index! + 'app.observe'.length; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')' && --depth === 0) return { keys: m[1]!.split(/\s+/), call: src.slice(m.index, i + 1) };
    }
    throw new Error(`gantt-render: an app.observe('${m[1]}') call never closes`);
  });
}

/**
 * The body of a Ractive EVENT HANDLER (`  name(ctx…) { … }`), braces balanced.
 * Handlers are object methods, not top-level functions, so `fnBody` cannot see
 * them — and the alternative every caller reached for was `indexOf` plus a
 * magic slice length, which silently changes what it reads the moment a handler
 * grows past the number.
 *
 * `async` is optional in the match, and that is load-bearing rather than
 * tidiness: every handler that WRITES is async, so without it this helper could
 * only read the handlers that never leave the browser — it threw on the whole
 * class of handler whose failure path is worth guarding.
 */
export function handlerBody(name: string, src: string = APP_JS_CODE): string {
  const at = new RegExp(`\\n  (?:async )?${name}\\(`).exec(src)?.index;
  if (at === undefined) throw new Error(`gantt-render: no \`${name}\` handler in the shipped client`);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(open, j + 1);
  }
  throw new Error(`gantt-render: \`${name}\` never closes`);
}

/** One CSS rule body, sliced by its selector line. */
export function cssRule(selector: string, src: string = GANTT_CSS): string {
  const at = src.indexOf(`\n${selector} {`);
  if (at < 0) throw new Error(`gantt-render: no CSS rule \`${selector}\``);
  const end = src.indexOf('}', at);
  if (end < 0) throw new Error(`gantt-render: unterminated CSS rule \`${selector}\``);
  return src.slice(at + 1, end + 1);
}

/**
 * Every text node in a parsed template that still carries `{{` or `}}`.
 *
 * This is the real gate for the Ractive comment hazard: `{{! … }}` ends at the
 * FIRST `}}`, so a comment that quotes a mustache leaks the rest of itself into
 * the DOM as literal text. `Ractive.parse` accepts such a template happily, so
 * `node frontend/build.js` cannot catch it — only looking at what parsed can.
 * (In ATTRIBUTE position `{{!x}}` is a negation, not a comment, which is why
 * this walks the parse tree instead of grepping for `{{!`.)
 */
export function leakedMustacheText(template: string = TEMPLATE): string[] {
  const leaks: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (node.includes('{{') || node.includes('}}')) leaks.push(node.trim());
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(Ractive.parse(template));
  return leaks;
}
