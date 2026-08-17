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
 * by counting tags. It has since grown past the Gantt — the Suggest bar, the
 * sprints modal and (batch 5) the Pipeline and Requests tables all render
 * through the same `divFragment` + `toHTML` path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import RactiveModule from 'ractive';

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
  new (opts: { template: string; data: Record<string, unknown> }): RactiveInstance;
  DEBUG: boolean;
  parse(template: string): unknown;
}

const Ractive = RactiveModule as unknown as RactiveCtor;

Ractive.DEBUG = false;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readFrontend = (...p: string[]) => fs.readFileSync(path.join(root, 'frontend', ...p), 'utf8');

export const TEMPLATE = readFrontend('templates', '00-app.html');
export const GANTT_CSS = readFrontend('styles', '35-gantt.css');
/** The sprints modal's recipes live here, not in the Gantt sheet. */
export const UI_CSS = readFrontend('styles', '10-ui.css');
/** The Pipeline table, its row states and every popover that escapes its clip. */
export const PIPELINE_CSS = readFrontend('styles', '20-pipeline.css');
/** The Requests table — status badges and the frost-note cell. */
export const REQUESTS_CSS = readFrontend('styles', '25-requests.css');
export const APP_JS = readFrontend('scripts', '01-app.js');
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

export interface PlannerRow {
  cardId: string;
  mcLabel: string;
  displayId: string;
  name: string;
  slottedWeek: string | null;
  urgency: string;
  difficulty?: string;
  requestor?: string;
  assetType?: string;
  currentList?: string;
  status?: string;
  statusNote?: string;
  pinned?: boolean;
}

export interface PlannerGroup {
  id: string;
  kind: string;
  name: string;
  meta: string;
  count: string;
  rows: PlannerRow[];
}

const ROWS: PlannerRow[] = [
  {
    cardId: 'c1', mcLabel: 'MC-655', displayId: 'MC-655.1', name: 'Hero render',
    slottedWeek: '2026-08-03', urgency: 'Urgent', difficulty: 'Hard',
    requestor: 'Ana', assetType: 'Render', currentList: 'Sketching', status: 'ongoing',
  },
  {
    cardId: 'c2', mcLabel: 'MC-712', displayId: 'MC-712', name: 'Loft plan',
    slottedWeek: null, urgency: 'Non-Urgent', currentList: 'Backlog', status: 'pending',
  },
];

export const GROUPS: PlannerGroup[] = [
  { id: 's1', kind: 'sprint', name: 'Sprint A', meta: '2 wk', count: '1 item', rows: [ROWS[0]!] },
  { id: 'outside', kind: 'outside', name: 'Outside any sprint', meta: '', count: '0 items', rows: [] },
  { id: 'unscheduled', kind: 'unscheduled', name: 'Unscheduled', meta: '', count: '1 item', rows: [ROWS[1]!] },
];

export interface GanttState {
  leftCollapsed?: boolean;
  collapsedBlocks?: Record<string, boolean>;
  plannerGroups?: PlannerGroup[];
  arrived?: Record<string, boolean>;
  ganttDragging?: boolean;
}

/**
 * Renders the block for one view state. The per-row helpers (`phaseBars`,
 * `deadlineTick`, `ghostBar`, `footText`, `footCls`) are stubbed: their maths
 * is covered by test/planner-weeks.test.ts and test/planner-payload.test.ts —
 * what matters here is which nodes the template emits, not what is inside a bar.
 */
export function renderGantt(state: GanttState = {}): string {
  const instance = new Ractive({
    template: ganttFragment(),
    data: {
      leftCollapsed: state.leftCollapsed ?? false,
      collapsedBlocks: state.collapsedBlocks ?? {},
      plannerGroups: state.plannerGroups ?? GROUPS,
      plannerWeeks: [
        { key: '2026-08-03', wk: 'wk1', sub: 'Aug 3–7' },
        { key: '2026-08-10', wk: 'wk2', sub: 'Aug 10–14' },
      ],
      plannerMonths: [{ month: 'AUGUST', monthKey: '2026-08', span: 2 }],
      selected: {},
      // T139: cardId → true for the rows a drop just moved (the arrival pulse)
      arrived: state.arrived ?? {},
      // T139, rescoped in batch 7 (T153): live from dragstart to dragend. It
      // no longer touches the bar — a drag source that is not hit-testable is a
      // drag Chrome cancels — and now hides only the `.gdl` deadline tick,
      // which paints over the bar and carries no dragover handler of its own.
      ganttDragging: state.ganttDragging ?? false,
      footCaption: '92 / wk',
      ganttThumb: { needed: false },
      icon: {},
      phaseBars: () => [{ cls: 'sketch', left: 0, width: 10, title: 'Sketch' }],
      deadlineTick: () => null,
      ghostBar: () => [],
      fmt: (v: unknown) => String(v),
      footCls: () => 'ok',
      footText: () => '1',
    },
  });
  return instance.toHTML();
}

export interface SuggestBarState {
  suggest?: unknown;
  suggestProposed?: number;
  suggestFlagged?: number;
  suggestHardHeavy?: number;
  suggestBlockedWhy?: string;
}

/**
 * Renders the planner toolbar's functionality box (owl #25). The counts are fed
 * in directly — the computeds that produce them are executed against the
 * shipped source in test/suggest-counts.test.ts, so what this proves is the
 * other half: that the bar takes the Suggest button's slot, and that
 * `disabled="{{suggestBlockedWhy}}"` really drops the attribute when the
 * reason is empty. That one idiom is the whole R-e mechanism.
 */
export function renderSuggestBar(state: SuggestBarState = {}): string {
  const instance = new Ractive({
    template: divFragment('<div class="fnbox">'),
    data: {
      suggest: state.suggest ?? null,
      suggestProposed: state.suggestProposed ?? 0,
      suggestFlagged: state.suggestFlagged ?? 0,
      suggestHardHeavy: state.suggestHardHeavy ?? 0,
      suggestBlockedWhy: state.suggestBlockedWhy ?? '',
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
  const instance = new Ractive({
    template: divFragment('<div class="modal-back"'),
    data: {
      sprintModal: true,
      sprintDraft: state.sprintDraft ?? [],
      sprintDupNames: state.sprintDupNames ?? [],
      sprintOverlaps: state.sprintOverlaps ?? [],
      sprintGaps: state.sprintGaps ?? [],
      sprintBlankNames: state.sprintBlankNames ?? [],
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
 *     frontend/scripts/01-app.js by the suites that use them, so a render
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
  /** the SHIPPED recipe, executed out of 01-app.js — never a stub */
  rowWarning: (row: PipeRow) => unknown;
}

/**
 * Renders the Pipeline table (`<div class="pscrollwrap">`, which occurs
 * exactly once — the Requests and Gantt wrappers carry a second class).
 *
 * `writesEnabled: false` is deliberate: it takes the read-only Due branch and
 * so avoids stubbing the whole date-picker calendar for a test about a
 * different cell. The urgency/difficulty menus and the due popover are all
 * closed for the same reason.
 */
export function renderPipelineTable(state: PipelineTableState): string {
  const instance = new Ractive({
    template: divFragment('<div class="pscrollwrap">'),
    data: {
      pipelineRows: state.pipelineRows,
      rowWarning: state.rowWarning,
      warnPop: state.warnPop ?? null,
      warnPopPos: { left: 0, top: 0 },
      expanded: {},
      workCardsByMc: {},
      writesEnabled: false,
      savingUrgency: {},
      savingDifficulty: {},
      savingDeadline: {},
      urgencyMenu: null,
      diffMenu: null,
      duePopover: null,
      urgencyMenuPos: { left: 0, top: 0 },
      diffMenuPos: { left: 0, top: 0 },
      pipeThumb: { needed: false },
      icon: {},
      // the highlighter wraps query matches in <mark>; with no query it is
      // identity, which is what these assertions want to read
      hl: (s: unknown) => String(s ?? ''),
      fmtLong: (s: unknown) => String(s ?? ''),
      fmtInstant: () => '',
    },
  });
  return instance.toHTML();
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
  /** the SHIPPED clarification predicate, executed out of 01-app.js */
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
  if (at < 0) throw new Error(`gantt-render: no declaration of \`${name}\` in the shipped frontend source`);
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i]!;
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`gantt-render: unterminated declaration \`${name}\``);
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
