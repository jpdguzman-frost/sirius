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
  APP_JS_CODE,
  PIPELINE_CSS,
  TEMPLATE,
  type PipeRow,
  type WorkCardRow,
  cssRule,
  fnBody,
  renderPipelineTable,
} from './helpers/gantt-render.ts';

const jsCode = APP_JS_CODE;

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
/* the three recurring renders, hoisted once — the gantt-requestor-clip
   precedent; fresh calls remain only where options differ */
const COLLAPSED = collapsed();
const OPEN = open();
const WRITABLE = open({ writesEnabled: true });

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
    expect(taskRows(COLLAPSED)).toHaveLength(0);
    expect(taskRows(OPEN)).toHaveLength(2);
  });

  it('emits the same cell classes as the parent row, in the same order — no colspan', () => {
    const cells = [...taskRows(OPEN)[0]!.matchAll(/<td class="([a-z-]+)"/g)].map((m) => m[1]);
    expect(cells).toEqual([
      'col-mc', 'col-name', 'col-type', 'col-diff', 'col-urgency',
      'col-status', 'col-client', 'col-due', 'col-started', 'col-done', 'col-links',
    ]);
    expect(taskRows(OPEN)[0]).not.toContain('colspan');
  });

  it('leaves the first cell EMPTY — the indent is the absent MC#, not a repeat of it', () => {
    for (const r of taskRows(OPEN)) {
      expect(cell(r, 'col-mc')).toBe('<td class="col-mc"></td>');
      expect(r).not.toContain('MC-837</'); // the number never renders in a task row cell of its own
    }
  });

  it('leaves type, difficulty, urgency and requestor cells EMPTY — MC-level attributes', () => {
    for (const cls of ['col-type', 'col-diff', 'col-urgency', 'col-client']) {
      expect(cell(taskRows(OPEN)[0]!, cls)).toBe(`<td class="${cls}"></td>`);
    }
  });

  it('names the task with the parent’s own name recipe and shows its status badge', () => {
    const r = taskRows(OPEN)[0]!;
    expect(cell(r, 'col-name')).toContain('<span class="cardname">MC-837 Render Icon: APIs — Filled</span>');
    expect(cell(r, 'col-status')).toContain('class="pbadge s-pending"');
    expect(cell(r, 'col-status')).toContain('Backlogs: Icon');
  });

  it('shows Started/Done with the parent’s plaincell recipe, dash when absent', () => {
    const [withDates, without] = taskRows(OPEN);
    expect(cell(withDates!, 'col-started')).toContain('class="plaincell nowrap"');
    expect(cell(withDates!, 'col-started')).toContain('2026-08-02');
    expect(cell(withDates!, 'col-done')).toContain('<span class="dimcell">—</span>');
    expect(cell(without!, 'col-started')).toContain('<span class="dimcell">—</span>');
  });

  it('renders BOTH link icons, the absent one as the parent’s dimmed non-link', () => {
    const links = cell(taskRows(OPEN)[0]!, 'col-links');
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
    const html = COLLAPSED;
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
    /* DERIVED, not copied (test/CLAUDE.md rule 2): the chevron is an `.i16`
       glyph with no horizontal pad, so the spacer's width is read out of
       `.i16`'s own rule — if the glyph box ever changes, this fails instead
       of staying green while the MC# column misaligns. */
    const glyphWidth = /width: (\d+px)/.exec(cssRule('.i16', PIPELINE_CSS))?.[1];
    expect(glyphWidth, 'no width in the .i16 rule').toBeDefined();
    expect(cssRule('.ptable .mccell .chevgap', PIPELINE_CSS)).toContain(`width: ${glyphWidth}`);
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
    expect(OPEN).toContain('<span class="subtone">Main Card</span>');
    expect(COLLAPSED).not.toContain('class="subtone"');
    // …and on the expanded PARENT, never inside a task row
    for (const r of taskRows(OPEN)) expect(r).not.toContain('subtone');
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
    const due = cell(taskRows(WRITABLE)[0]!, 'col-due');
    expect(due).toContain('class="datefield');
    expect(due).toContain('2026-08-07');
    expect(due).toContain('write registry W2, task-card scope');
  });

  it('shows `Select Date` and the missing dress on a task without one', () => {
    const due = cell(taskRows(WRITABLE)[1]!, 'col-due');
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
    const due = cell(taskRows(OPEN)[0]!, 'col-due')  // writesEnabled false is the default;
    expect(due).toContain('class="datefield readonly');
    expect(due).not.toContain('<button');
  });

  it('the template SAYS the kind — every task-cell due handler passes it explicitly', () => {
    /* The dispatch rule: which half of W2 a write takes is decided where the
       kind is KNOWN — the template's task each-block — never re-derived from
       set-membership, so `rows` being the complete deliverable store is not
       load-bearing. Asserted on both sides of the boundary: the task cell
       passes 'task' on all three handlers, and the parent cell passes none. */
    for (const h of ['openDuePopover', 'dueApply', 'dueClear']) {
      expect(TEMPLATE).toContain(`['${h}', w.cardId, 'task']`);
      expect(TEMPLATE).toContain(`['${h}', row.cardId]`);
      expect(TEMPLATE).not.toContain(`['${h}', row.cardId, `);
    }
  });

  it('each half posts to its OWN endpoint, and only that one', () => {
    // the rule, not the mechanism's text: the task half owns /workcards/,
    // the deliverable half owns /deliverables/, and neither names the other's
    const taskHalf = fnBody('writeTaskDue');
    expect(taskHalf).toContain('/workcards/');
    expect(taskHalf).not.toContain('/deliverables/');
    const oneDoor = fnBody('writeDeadline');
    expect(oneDoor).toContain('/deliverables/');
    expect(oneDoor).not.toContain('/workcards/');
    /* same optimistic contract on the task half, asserted as ORDER, not as a
       source snapshot (rule 1): the no-op comparison against the task's own
       due must come BEFORE the network call, and a failure reverts + says so */
    const guardAt = taskHalf.search(/=== \(found\.card\.due/);
    expect(guardAt, 'no no-op comparison against the task due').toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(taskHalf.indexOf('api.send'));
    expect(taskHalf).toContain('flashBanner');
  });

  it('the popover opener reads the task’s current date from the task store, by kind', () => {
    const at = jsCode.indexOf('openDuePopover(');
    const body = jsCode.slice(at, jsCode.indexOf('\n  },', at));
    expect(body).toContain('findWorkCard(cardId)');
    expect(body).toMatch(/kind === 'task'/);
  });

  it('the shared calendar is ONE partial, used by both popovers', () => {
    // owl #45 hardening: the month nav / day grid / shortcuts exist once as
    // the top-level dueCalendar partial — a calendar change lands in both
    // popovers or in neither. Only the action footers are per-kind.
    expect([...TEMPLATE.matchAll(/\{\{#partial dueCalendar\}\}/g)]).toHaveLength(1);
    expect([...TEMPLATE.matchAll(/\{\{>dueCalendar\}\}/g)]).toHaveLength(2);
    expect([...TEMPLATE.matchAll(/class="duegrid"/g)]).toHaveLength(1);
    expect([...TEMPLATE.matchAll(/class="dueshort"/g)]).toHaveLength(1);
    // the footers stay inline and per-kind: two dueact blocks
    expect([...TEMPLATE.matchAll(/class="dueact"/g)]).toHaveLength(2);
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

/* ---------------------------------------------------------------------- */
/* F — the 2026-08-18 review pass's guards                                  */
/* ---------------------------------------------------------------------- */

describe('a multi-deliverable MC renders its task list ONCE (invariant 3)', () => {
  /* mc_number is not unique — MC-825 carries 99 deliverable rows — and
     expansion is per-MC, so the block after EVERY sibling row rendered the
     whole task list once per sibling: 99×N duplicated rows and, with a task
     popover open, 99 duplicate role=dialog boxes. The list and the SubTone
     hang under the group's FIRST row only, via the stamped firstOfMc. */
  const SIBLING = row({ cardId: 'main-1b', displayId: 'MC-837.2', name: 'Second deliverable, same MC' });
  const multi = renderPipelineTable({
    pipelineRows: [PARENT, SIBLING, CHILDLESS], rowWarning, workCardsByMc: TASKS,
    expanded: { 'MC-837': true }, duePopover: 'task-1', writesEnabled: true,
  });

  it('renders each task row once, not once per sibling', () => {
    expect(taskRows(multi)).toHaveLength(2);
  });

  it('renders an open task popover once, not once per sibling', () => {
    expect([...multi.matchAll(/<div class="duepop"/g)]).toHaveLength(1);
  });

  it('shows the SubTone on the first sibling only', () => {
    expect([...multi.matchAll(/class="subtone"/g)]).toHaveLength(1);
  });

  it('is stamped in loadAll beside hasTasks, never asked in the template', () => {
    const stamp = fnBody('loadAll');
    expect(stamp).toContain('r.firstOfMc');
    expect(stamp).toContain('r.hasTasks');
  });
});

describe('the keyboard path refuses exactly where the chevron refuses (R-exp-c)', () => {
  it('pipeRowKey checks hasTasks before toggling expansion', () => {
    // Enter on a childless row used to set a stale expanded flag that showed
    // the SubTone with zero task rows and pre-expanded the group if tasks
    // later arrived — the affordance-that-lies, back through the keyboard
    const at = jsCode.indexOf('pipeRowKey(');
    const body = jsCode.slice(at, jsCode.indexOf('\n  },', at));
    expect(body).toContain('hasTasks');
    expect(body.indexOf('hasTasks')).toBeLessThan(body.indexOf('app.toggle'));
  });
});

describe('the shared calendar really renders (the rule-6 vacuous hazard)', () => {
  it('a task popover render contains the partial’s own blocks', () => {
    // the partial is registered on the render instance from the SHIPPED
    // template's own body; if that registration breaks, these vanish and
    // this fails instead of every calendar guard passing against nothing
    const due = cell(taskRows(renderPipelineTable({
      pipelineRows: [PARENT], rowWarning, workCardsByMc: TASKS,
      expanded: { 'MC-837': true }, duePopover: 'task-1', writesEnabled: true,
    }))[0]!, 'col-due');
    expect(due).toContain('class="duehead"');
    expect(due).toContain('class="dueshort"');
    expect(due).toContain('Next Monday');
  });
});

describe('the task due wears the parent’s FULL dress, overdue included', () => {
  it('tints a past-due task the way the parent recipe would', () => {
    const late = renderPipelineTable({
      pipelineRows: [PARENT], rowWarning,
      workCardsByMc: { 'MC-837': [task({ overdue: true })] },
      expanded: { 'MC-837': true },
    });
    expect(cell(taskRows(late)[0]!, 'col-due')).toMatch(/class="datefield readonly overdue/);
    // …and a current one stays undressed
    expect(cell(taskRows(OPEN)[0]!, 'col-due')).not.toContain('overdue');
  });
});
