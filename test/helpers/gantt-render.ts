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
 * Only the `.gantt` subtree is rendered: it is self-contained (the rest of the
 * template would drag in every tab's computeds), and the block's own div
 * nesting is balanced inside each `{{#if}}` branch, so the extractor can find
 * its end by counting tags.
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
export const APP_JS = readFrontend('scripts', '01-app.js');

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
