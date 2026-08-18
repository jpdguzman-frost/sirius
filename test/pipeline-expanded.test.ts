/**
 * T172–T178 — the expanded MC row (owl miles→jp #45, node 520:54192; answers
 * in jp→miles #40; W2 task-card scope ruled by JP 2026-08-18 —
 * contracts/trello-write.md §W2 scope clarification).
 *
 * The structural promise this suite defends is the one made to Miles in #40:
 * parent and child are rows of the SAME table, so both levels share one
 * column model BY CONSTRUCTION and nothing can drift when the table scrolls.
 * Everything else follows the annotation: the tint is the nesting cue
 * (parent white, children slate-50 — inverted from the earlier version), the
 * empty first cell is the indent (the MC# is not repeated), and the child
 * deliberately shows NO type/difficulty/urgency/requestor — MC-level
 * attributes a task must not appear able to diverge from.
 *
 * Like every suite here: `toHTML()` has no layout, no pointer and no clock,
 * so widths, row heights and the live due write are the live pass's to
 * prove. This file proves structure, wiring and recipes.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  PIPELINE_CSS,
  TEMPLATE,
  type PipeRow,
  type WorkCardRow,
  cssRule,
  renderPipelineTable,
} from './helpers/gantt-render.ts';

const jsCode = APP_JS.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/gm, '$1');

/** The body of a top-level `function NAME(…) { … }` (the pipeline-warning slicer). */
function fnBody(name: string): string {
  const at = jsCode.indexOf(`function ${name}(`);
  expect(at, `no \`function ${name}\` in the shipped client`).toBeGreaterThan(-1);
  let i = jsCode.indexOf('(', at);
  for (let depth = 0; i < jsCode.length; i++) {
    if (jsCode[i] === '(') depth++;
    else if (jsCode[i] === ')' && --depth === 0) break;
  }
  const open = jsCode.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < jsCode.length; j++) {
    if (jsCode[j] === '{') depth++;
    else if (jsCode[j] === '}' && --depth === 0) return jsCode.slice(open, j + 1);
  }
  throw new Error(`pipeline-expanded: \`${name}\` never closes`);
}

const row = (over: Partial<PipeRow> = {}): PipeRow => ({
  cardId: 'main-1',
  mcNumber: 'MC-837',
  mcLabel: 'MC-837',
  displayId: 'MC-837',
  name: 'MC-837 Main Card: GBox Nav Icons',
  missing: [],
  trelloUrl: 'https://trello.com/c/main-1',
  ...over,
});

const task = (over: Partial<WorkCardRow> = {}): WorkCardRow => ({
  cardId: 'task-1',
  name: 'MC-837 Render Icon: APIs — Filled',
  currentList: 'Backlogs: Icon',
  status: 'pending',
  trelloUrl: 'https://trello.com/c/task-1',
  figmaUrl: null,
  due: '2026-08-07',
  started: '2026-08-02',
  startedTs: '2026-08-02T01:00:00.000Z',
  done: null,
  ...over,
});

const PARENT = row();
/** a second MC with NO task cards — the childless half of every assertion */
const CHILDLESS = row({ cardId: 'main-2', mcNumber: 'MC-901', mcLabel: 'MC-901', displayId: 'MC-901', name: 'Lone deliverable' });
const TASKS: Record<string, WorkCardRow[]> = { 'MC-837': [task(), task({ cardId: 'task-2', name: 'MC-837 Render Icon: My Groups', due: null, started: null, startedTs: null })] };

const rowWarning = () => null;

const collapsed = () =>
  renderPipelineTable({ pipelineRows: [PARENT, CHILDLESS], rowWarning, workCardsByMc: TASKS });
const open = (over: Record<string, unknown> = {}) =>
  renderPipelineTable({ pipelineRows: [PARENT, CHILDLESS], rowWarning, workCardsByMc: TASKS, expanded: { 'MC-837': true }, ...over });

/** All `<tr class="ptask">…</tr>` blocks of a render. */
const taskRows = (html: string): string[] =>
  [...html.matchAll(/<tr class="ptask">([\s\S]*?)<\/tr>/g)].map((m) => m[1]!);

/** One `<td class="…">…</td>`; task-row cells never nest tables. */
function cell(rowMarkup: string, cls: string): string {
  const at = rowMarkup.indexOf(`<td class="${cls}"`);
  expect(at, `no .${cls} cell in the task row`).toBeGreaterThan(-1);
  return rowMarkup.slice(at, rowMarkup.indexOf('</td>', at) + '</td>'.length);
}

/* ---------------------------------------------------------------------- */
/* A — one table, one column model                                          */
/* ---------------------------------------------------------------------- */

describe('the task rows live in the parent’s own column grid', () => {
  it('renders task rows only for an EXPANDED group', () => {
    expect(taskRows(collapsed())).toHaveLength(0);
    expect(taskRows(open())).toHaveLength(2);
  });

  it('emits the same cell classes as the parent row, in the same order — no colspan', () => {
    const cells = [...taskRows(open())[0]!.matchAll(/<td class="([a-z-]+)"/g)].map((m) => m[1]);
    expect(cells).toEqual([
      'col-mc', 'col-name', 'col-type', 'col-diff', 'col-urgency',
      'col-status', 'col-client', 'col-due', 'col-started', 'col-done', 'col-links',
    ]);
    expect(taskRows(open())[0]).not.toContain('colspan');
  });

  it('leaves the first cell EMPTY — the indent is the absent MC#, not a repeat of it', () => {
    for (const r of taskRows(open())) {
      expect(cell(r, 'col-mc')).toBe('<td class="col-mc"></td>');
      expect(r).not.toContain('MC-837</'); // the number never renders in a task row cell of its own
    }
  });

  it('leaves type, difficulty, urgency and requestor cells EMPTY — MC-level attributes', () => {
    for (const cls of ['col-type', 'col-diff', 'col-urgency', 'col-client']) {
      expect(cell(taskRows(open())[0]!, cls)).toBe(`<td class="${cls}"></td>`);
    }
  });

  it('names the task with the parent’s own name recipe and shows its status badge', () => {
    const r = taskRows(open())[0]!;
    expect(cell(r, 'col-name')).toContain('<span class="cardname">MC-837 Render Icon: APIs — Filled</span>');
    expect(cell(r, 'col-status')).toContain('class="pbadge s-pending"');
    expect(cell(r, 'col-status')).toContain('Backlogs: Icon');
  });

  it('shows Started/Done with the parent’s plaincell recipe, dash when absent', () => {
    const [withDates, without] = taskRows(open());
    expect(cell(withDates!, 'col-started')).toContain('class="plaincell nowrap"');
    expect(cell(withDates!, 'col-started')).toContain('2026-08-02');
    expect(cell(withDates!, 'col-done')).toContain('<span class="dimcell">—</span>');
    expect(cell(without!, 'col-started')).toContain('<span class="dimcell">—</span>');
  });

  it('renders BOTH link icons, the absent one as the parent’s dimmed non-link', () => {
    const links = cell(taskRows(open())[0]!, 'col-links');
    expect(links).toContain('href="https://trello.com/c/task-1"');
    expect(links).toContain('#i-figma');
    expect(links).toContain('class="srclink off"'); // figmaUrl null → same off recipe as the parent row
  });
});

/* ---------------------------------------------------------------------- */
/* B — the childless MC loses its expand affordance                         */
/* ---------------------------------------------------------------------- */

describe('a childless MC renders no chevron (jp→miles #40 proposal)', () => {
  it('keeps the chevron on an MC with task cards and swaps a spacer in for one without', () => {
    const html = collapsed();
    const mcCell = (label: string) => {
      const at = html.indexOf(`<span class="mcnum">${label}</span>`);
      expect(at, `no ${label} row`).toBeGreaterThan(-1);
      return html.slice(html.lastIndexOf('<td class="col-mc"', at), at);
    };
    expect(mcCell('MC-837')).toContain('class="chevbtn');
    expect(mcCell('MC-901')).not.toContain('chevbtn');
    expect(mcCell('MC-901')).toContain('class="chevgap"');
    expect(mcCell('MC-901')).toContain('aria-hidden="true"');
  });

  it('sizes the spacer to the chevron glyph box, so the MC# column cannot shift', () => {
    // the chevron is an .i16 glyph (16px box, no horizontal pad) — the spacer
    // is that same box; a drifted pair fails here
    expect(cssRule('.ptable .mccell .chevgap', PIPELINE_CSS)).toContain('width: 16px');
    expect(cssRule('.ptable .mccell .chevgap', PIPELINE_CSS)).toContain('flex: none');
  });
});

/* ---------------------------------------------------------------------- */
/* C — the nesting cues: tint, border, SubTone                              */
/* ---------------------------------------------------------------------- */

describe('the tint is the nesting cue (annotation: inverted — parent white, children slate-50)', () => {
  it('paints task cells slate-50 and draws their stronger bottom border', () => {
    const rule = cssRule('.ptable tr.ptask td', PIPELINE_CSS);
    expect(rule).toContain('background: var(--slate-50)');
    expect(rule).toContain('border-bottom-color: var(--slate-200)');
  });

  it('leaves the indent cell borderless, so the gutter reads as one strip', () => {
    expect(cssRule('.ptable tr.ptask td.col-mc', PIPELINE_CSS)).toContain('border-bottom-color: transparent');
  });

  it('paints NO background on the parent row — white is the table’s own ground', () => {
    // the inversion warning: the OLD design tinted the whole block. A rule
    // painting .prow would rebuild that under a green suite.
    expect(PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ')).not.toMatch(/\.prow[^{]*\{[^}]*background/);
  });

  it('sets NO row height anywhere — the frame’s 109/75 are outcomes, not targets', () => {
    // R-warn-a's standing rule, restated for the expanded state; the
    // pipeline-warning suite walks every row-targeting rule for height props,
    // and .ptask is a row-targeting selector, so it inherits that walk. Here:
    // the two frame numbers must not appear as declarations.
    expect(cssRule('.ptable tr.ptask td', PIPELINE_CSS)).not.toMatch(/height/);
  });
});

describe('the parent’s SubTone appears with the expansion, and only then', () => {
  it('renders `Main Card` under the name only while the group is expanded', () => {
    expect(open()).toContain('<span class="subtone">Main Card</span>');
    expect(collapsed()).not.toContain('class="subtone"');
    // …and on the expanded PARENT, never inside a task row
    for (const r of taskRows(open())) expect(r).not.toContain('subtone');
  });

  it('wears label-size muted type on its own line, tokens only', () => {
    const rule = cssRule('.ptable .subtone', PIPELINE_CSS);
    expect(rule).toContain('display: block');
    expect(rule).toContain('font-size: var(--text-label)');
    expect(rule).toContain('color: var(--slate-500)');
    expect(rule.replace(/\/\*[\s\S]*?\*\//g, ' ')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\d+px/);
  });
});

/* ---------------------------------------------------------------------- */
/* D — the task due date: W2's task-card half                               */
/* ---------------------------------------------------------------------- */

describe('the task due cell is the SAME W2 recipe, bound to the task card', () => {
  it('renders the datefield with the task’s date, keyed on the task’s own cardId', () => {
    const due = cell(taskRows(open({ writesEnabled: true }))[0]!, 'col-due');
    expect(due).toContain('class="datefield');
    expect(due).toContain('2026-08-07');
    expect(due).toContain('write registry W2, task-card scope');
  });

  it('shows `Select Date` and the missing dress on a task without one', () => {
    const due = cell(taskRows(open({ writesEnabled: true }))[1]!, 'col-due');
    expect(due).toContain('Select Date');
    expect(due).toMatch(/class="datefield[^"]*missing/);
  });

  it('opens the shared popover inside the task cell, Clear enabled exactly when a due exists', () => {
    const withDue = cell(taskRows(open({ writesEnabled: true, duePopover: 'task-1' }))[0]!, 'col-due');
    expect(withDue).toContain('class="duepop"');
    expect(withDue).toContain('Clear Due Date');
    expect(withDue).not.toMatch(/<button class="dueclear" disabled/);

    const withoutDue = cell(taskRows(open({ writesEnabled: true, duePopover: 'task-2' }))[1]!, 'col-due');
    expect(withoutDue).toContain('class="duepop"');
    expect(withoutDue).toMatch(/<button class="dueclear" disabled/);
  });

  it('renders read-only datefields when the project’s writes are off', () => {
    const due = cell(taskRows(open({ writesEnabled: false }))[0]!, 'col-due');
    expect(due).toContain('class="datefield readonly');
    expect(due).not.toContain('<button');
  });

  it('routes a non-deliverable cardId to the task endpoint — one write function, two halves', () => {
    // writeDeadline stays the one door dueApply/dueClear call; a cardId
    // `rows` does not know falls through to the task half
    expect(fnBody('writeDeadline')).toContain('writeTaskDue(cardId, value)');
    const taskHalf = fnBody('writeTaskDue');
    expect(taskHalf).toContain('/workcards/');
    expect(taskHalf).toContain('findWorkCard(cardId)');
    // same optimistic contract: a no-op returns before any call, a failure reverts
    expect(taskHalf).toContain("if ((value || null) === (found.card.due || null)) return;");
    expect(taskHalf).toContain('flashBanner');
    // …and the deliverable half still posts to its own endpoint
    expect(fnBody('writeDeadline')).toContain('/deliverables/');
  });

  it('lets the popover opener find a task’s current date the same way', () => {
    const at = jsCode.indexOf('openDuePopover(');
    const body = jsCode.slice(at, jsCode.indexOf('\n  },', at));
    expect(body).toContain('findWorkCard(cardId)');
  });
});

/* ---------------------------------------------------------------------- */
/* E — view state                                                           */
/* ---------------------------------------------------------------------- */

describe('expansion is per-project view state', () => {
  it('resets with the project switch — mc_numbers repeat across projects (invariant 3)', () => {
    // the recon finding behind jp→miles #40's persistence answer: keyed on
    // mc_number alone, project A's expanded MC-655 arrived pre-expanded in
    // project B. The reset block is the same one the other per-project view
    // state uses.
    expect(fnBody('resetForProjectSwitch')).toContain('expanded: {}');
  });

  it('keeps multi-expand — the template keys each group on its own mcNumber', () => {
    const both = renderPipelineTable({
      pipelineRows: [PARENT, row({ cardId: 'main-3', mcNumber: 'MC-850', mcLabel: 'MC-850', displayId: 'MC-850', name: 'Second parent' })],
      rowWarning,
      workCardsByMc: { ...TASKS, 'MC-850': [task({ cardId: 'task-9', name: 'MC-850 Render Icon: Other' })] },
      expanded: { 'MC-837': true, 'MC-850': true },
    });
    expect(taskRows(both)).toHaveLength(3);
  });
});
