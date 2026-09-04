/**
 * T172–T178 — the expanded MC row (owl miles→jp #45, node 520:54192; answers
 * in jp→miles #40; W2 task-card scope ruled by JP 2026-08-18 —
 * contracts/trello-write.md §W2 scope clarification).
 *
 * The structural promise this suite defends is the one made to Miles in #40:
 * parent and child are rows of the SAME table, so both levels share one
 * column model BY CONSTRUCTION and nothing can drift when the table scrolls.
 * Everything else follows the annotation: the tint is the nesting cue
 * (parent white, children slate-50 — inverted from the earlier version) and
 * the empty first cell is the indent (the MC# is not repeated).
 *
 * AMENDED 2026-09-05 — owls miles→jp #78 §1/§3 and #79 (frame `809:83486`,
 * badge `842:125808`, metric strip `843:125889`). #45's "the child shows NO
 * type/difficulty/urgency/requestor" is superseded in three of its four
 * terms. Urgency and difficulty are NOT MC-level: a website request can carry
 * an urgent screen and non-urgent assets, so the values live on the WORK CARD
 * and the editable badge+chevron moved from the parent row down to the task
 * rows, where W1 and W3 now write. The main row draws an em-dash in both
 * cells. REQUESTOR left Pipeline altogether (#78 §3). TYPE is the one term of
 * R-exp-b that survives, and it survives unchanged.
 *
 * Like every suite here: `toHTML()` has no layout, no pointer and no clock,
 * so widths, row heights and the live due write are the live pass's to
 * prove. This file proves structure, wiring and recipes.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  PIPE_COLS,
  PIPELINE_CSS,
  TEMPLATE,
  TOKENS_CSS,
  type PipeRow,
  type WorkCardRow,
  cssRule,
  fnBody,
  handlerBody,
  method,
  renderMetrics,
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
  /* owl #78 §1: the work card carries its own urgency and difficulty now, so
     the fixture carries the wire's own defaults — `Non-Urgent` is a VALUE (the
     absence of the Urgent label), `difficulty` is genuinely absent until a
     label says otherwise. */
  urgency: 'Non-Urgent',
  difficulty: null,
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
/* the three recurring renders, hoisted once (a hoist pattern from the
   retired gantt-requestor-clip suite, 2026-08-28); fresh calls remain only
   where options differ */
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
    /* DERIVED from the shipped `PIPE_COLS`, not a second hand-copied list
       (test/CLAUDE.md rule 2). That array is where owl #78 §3's ten-column
       ruling is asserted literally — once, in
       `test/pipeline-sortfilter.test.ts` — and this is the promise made to
       Miles in jp→miles #40 stated as an equality: BOTH row kinds draw the
       header's own columns, in the header's own order, so a column added,
       removed or reordered lands in all three or fails here. The previous
       version of this test copied the eleven classes by hand, which is how a
       task row could have kept `col-requestor` after #78 deleted the column. */
    const classes = (rowMarkup: string) =>
      [...rowMarkup.matchAll(/<td class="([a-z-]+)"/g)].map((m) => m[1]);
    const cols = PIPE_COLS.map((c) => c.cls);
    expect(cols, 'PIPE_COLS came back empty — the equality would hold vacuously').toHaveLength(10);
    expect(classes(taskRows(OPEN)[0]!)).toEqual(cols);
    expect(taskRows(OPEN)[0]).not.toContain('colspan');

    // the parent row, sliced from the same render, draws the same grid
    const mainRow = /<tr class="prow[^"]*"[^>]*>([\s\S]*?)<tr class="ptask">/.exec(OPEN)?.[1];
    expect(mainRow, 'no main row in the render').toBeTruthy();
    expect(classes(mainRow!)).toEqual(cols);
    expect(cols).not.toContain('col-requestor'); // #78 §3 — gone from both kinds
  });

  it('leaves the first cell EMPTY — the indent is the absent MC#, not a repeat of it', () => {
    for (const r of taskRows(OPEN)) {
      expect(cell(r, 'col-mc')).toBe('<td class="col-mc"></td>');
      expect(r).not.toContain('MC-837</'); // the number never renders in a task row cell of its own
    }
  });

  it('leaves the TYPE cell EMPTY — the one MC-level attribute left (R-exp-b)', () => {
    /* R-exp-b said type / difficulty / urgency / requestor. Owl #78 §1 kept
       only TYPE: repeating an MC's asset type per task would still imply a
       task can diverge from its MC, and nothing has re-ruled it. The other
       three are asserted by the two guards below — two of them now carry
       controls, and the fourth column no longer exists. */
    expect(cell(taskRows(OPEN)[0]!, 'col-type')).toBe('<td class="col-type"></td>');
    expect(OPEN).not.toContain('col-requestor');
  });

  it('carries the URGENCY and DIFFICULTY controls, bound to the WORK card (owl #78 §1)', () => {
    /* SUPERSEDES R-exp-b for these two cells. The failing input this was
       written against: leave the controls on the parent and give the task row
       an em-dash, and every assertion about "the main row is a dash" below
       still passes while W1/W3 keep writing the wrong object. So the binding
       is read off the markup — the handler AND the card id it carries. */
    const r = taskRows(WRITABLE)[0]!;
    const urgency = cell(r, 'col-urgency');
    expect(urgency).toContain('class="ubadge-wrap"');
    expect(urgency).toContain('Non-Urgent');
    expect(urgency).not.toContain('⚡'); // #79/D9: the node's label is the word alone
    const diff = cell(r, 'col-diff');
    expect(diff).toContain('class="ubadge-wrap"');
    expect(diff).toContain('—'); // no difficulty label yet — the same dash the parent draws

    // the row kind is the binding: `w.cardId`, never `row.cardId`
    for (const h of ['openUrgencyMenu', 'openDiffMenu']) {
      expect(TEMPLATE, `${h} lost its work-card binding`).toContain(`['${h}', w.cardId]`);
      expect(TEMPLATE, `${h} is still bound to a main card`).not.toContain(`['${h}', row.cardId]`);
    }
    for (const h of ['chooseUrgency', 'chooseDifficulty']) {
      expect(TEMPLATE).toContain(`['${h}', w.cardId, `);
      expect(TEMPLATE, `${h} is still bound to a main card`).not.toContain(`['${h}', row.cardId, `);
    }
  });

  it('renders the difficulty badge and the urgent fill from the card’s own values', () => {
    /* the render, not the template text: a badge whose class never changes
       with the data looks right in one fixture and is wrong in every other. */
    const html = renderPipelineTable({
      pipelineRows: [PARENT], rowWarning, expanded: { 'MC-837': true }, writesEnabled: true,
      workCardsByMc: { 'MC-837': [task({ urgency: 'Urgent', difficulty: 'Easy' })] },
    });
    const r = taskRows(html)[0]!;
    expect(cell(r, 'col-urgency')).toMatch(/class="pbadge ubadge urgent/);
    expect(cell(r, 'col-urgency')).toContain('Urgent');
    expect(cell(r, 'col-diff')).toMatch(/class="pbadge ubadge d-Easy/);
    expect(cell(r, 'col-diff')).toContain('Easy');
    // …and the default fixture takes the other branch on both
    expect(cell(taskRows(WRITABLE)[0]!, 'col-urgency')).toMatch(/class="pbadge ubadge nonurgent/);
    expect(cell(taskRows(WRITABLE)[0]!, 'col-diff')).toMatch(/class="pbadge ubadge unset/);
  });

  it('leaves the MAIN row’s urgency and difficulty as the static em-dash (owl #78 §1)', () => {
    /* "Not blank-pending-a-value, not inherited, not a mixed-state marker — a
       main card does not have these properties" (#78 §1). So the cell is the
       existing `.dimcell` recipe and nothing else: no button, no mustache, no
       handler. Asserted on the MAIN row only — `taskRows` is stripped out
       first, or the work rows' own controls would satisfy every one of these
       and the guard would pass against the defect it exists to catch. */
    const mainOnly = WRITABLE.replace(/<tr class="ptask">[\s\S]*?<\/tr>/g, '');
    for (const cls of ['col-urgency', 'col-diff']) {
      expect(cell(mainOnly, cls)).toBe(`<td class="${cls}"><span class="dimcell">—</span></td>`);
    }
    expect(mainOnly, 'a urgency/difficulty control survived on the main row').not.toContain('ubadge');

    /* `toHTML()` drops `on-*` directives, so WHICH row owns the handlers is a
       question only the template can answer — read per row kind, because a
       whole-file scan says nothing about placement and that is the entire
       defect. */
    const tpl = (open: string) => TEMPLATE.slice(TEMPLATE.indexOf(open), TEMPLATE.indexOf('</tr>', TEMPLATE.indexOf(open)));
    const mainTpl = tpl('<tr class="prow ');
    const workTpl = tpl('<tr class="ptask">');
    // both slices are real rows before anything is asserted ABSENT from one of
    // them — an empty slice satisfies every negative below
    expect(mainTpl).toContain('col-urgency');
    expect(workTpl).toContain('col-urgency');
    for (const h of ['openUrgencyMenu', 'openDiffMenu', 'chooseUrgency', 'chooseDifficulty']) {
      expect(mainTpl, `${h} is still on the main row`).not.toContain(h);
      expect(workTpl, `${h} never reached the work row`).toContain(h);
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

describe('the parent’s SubTone is WITHDRAWN (JP, 2026-08-27)', () => {
  /* owl #45 specced `Main Card` under the parent name and #52 specced the
     shared-MC caption below it; both were flagged at the time as defaults
     taken rather than rulings, and neither is in the frame. JP withdrew both.
     This guard exists so nobody restores them by reading those owls: the
     RULE is that the expanded parent carries no explanatory caption at all. */

  it('renders no SubTone span, expanded or collapsed', () => {
    /* asserted on the SPAN, never on the words: the fixture parent is itself
       named `MC-837 Main Card: GBox Nav Icons`, so a text assertion would
       fail on the card's own name — and, once that was "fixed", would pass
       for the wrong reason on any board whose cards drop the phrase. */
    expect(OPEN).not.toContain('class="subtone"');
    expect(COLLAPSED).not.toContain('class="subtone"');
    expect(OPEN).not.toContain('class="ptask pshared"');
    expect(OPEN).not.toContain('not a link to one card');
  });

  it('leaves no orphaned .subtone rule behind in the pipeline stylesheet', () => {
    /* a dead selector reads as a live treatment to the next person pricing a
       change — the markup and its recipe leave together or not at all. The
       one surviving mention is a Figma token NAME in a comment about button
       padding (`subtone-offset`), which is why this reads declarations only. */
    const declarations = PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(declarations).not.toContain('subtone');
    expect(declarations).not.toContain('pshared');
    expect(declarations).not.toContain('pshn');
  });
});

/* ---------------------------------------------------------------------- */
/* D — the task due date: W2's task-card half (cell renamed col-deadline)    */
/* ---------------------------------------------------------------------- */

describe('the task due cell is the SAME W2 recipe, bound to the task card', () => {
  /* The CLASS is `col-deadline` since owl #78 §3 renamed the column DUE →
     DEADLINE, matching the word Sprint Schedules uses for the same date; the
     class moved with the label so header, cells and width rule cannot drift
     over a name only half of them changed. The W2 picker itself is untouched
     here — #78 §2 makes Pipeline's deadline read-only, and that lands with the
     Sprint Schedules half rather than in this block. */
  it('renders the datefield with the task’s date, keyed on the task’s own cardId', () => {
    const due = cell(taskRows(WRITABLE)[0]!, 'col-deadline');
    expect(due).toContain('class="datefield');
    expect(due).toContain('2026-08-07');
    expect(due).toContain('write registry W2, task-card scope');
  });

  it('shows `Select Date` and the missing dress on a task without one', () => {
    const due = cell(taskRows(WRITABLE)[1]!, 'col-deadline');
    expect(due).toContain('Select Date');
    expect(due).toMatch(/class="datefield[^"]*missing/);
  });

  it('opens the shared popover inside the task cell, Clear enabled exactly when a due exists', () => {
    const withDue = cell(taskRows(open({ writesEnabled: true, duePopover: 'task-1' }))[0]!, 'col-deadline');
    expect(withDue).toContain('class="duepop"');
    expect(withDue).toContain('Clear Due Date');
    expect(withDue).not.toMatch(/<button class="dueclear" disabled/);

    const withoutDue = cell(taskRows(open({ writesEnabled: true, duePopover: 'task-2' }))[1]!, 'col-deadline');
    expect(withoutDue).toContain('class="duepop"');
    expect(withoutDue).toMatch(/<button class="dueclear" disabled/);
  });

  it('renders read-only datefields when the project’s writes are off', () => {
    const due = cell(taskRows(OPEN)[0]!, 'col-deadline')  // writesEnabled false is the default;
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
       due must come BEFORE the network call, and a failure reverts + says so.
       Both the optimistic set and the revert go through `patchWorkCard`, the
       one door that RE-FINDS the card — the same shape the urgency and
       difficulty handlers are held to below, for the same reason: a keypath
       held across the await can land on another card, or on another project's
       map after a switch. */
    const guardAt = taskHalf.search(/=== \(found\.card\.due/);
    expect(guardAt, 'no no-op comparison against the task due').toBeGreaterThan(-1);
    const sendAt = taskHalf.indexOf('api.send');
    expect(guardAt).toBeLessThan(sendAt);
    expect(taskHalf, 'the task due write does not patch the work-card store').toContain('patchWorkCard(cardId, { due:');
    expect(taskHalf.indexOf('patchWorkCard(cardId'), 'nothing is set optimistically').toBeLessThan(sendAt);
    expect(taskHalf.lastIndexOf('patchWorkCard(cardId'), 'the write never reverts').toBeGreaterThan(sendAt);
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

  it('hangs the task list under the FIRST sibling, not the second', () => {
    /* the anchor rule, probed positionally. It used to be probed by counting
       the parent's `Main Card` SubTone — withdrawn 2026-08-27 — so the visible
       consequence is now the only evidence: the tasks are emitted immediately
       after the anchor row, which puts them ABOVE the sibling's own row.
       Anchored to the sibling instead, they would appear below it; anchored to
       both, `taskRows` above would return four. */
    const firstTask = multi.indexOf('Render Icon: APIs');
    const siblingRow = multi.indexOf('Second deliverable, same MC');
    expect(firstTask).toBeGreaterThan(-1);
    expect(siblingRow).toBeGreaterThan(-1);
    expect(firstTask).toBeLessThan(siblingRow);
  });

  it('stamps hasTasks in loadAll, but DERIVES the anchor from the rendered rows', () => {
    /* `hasTasks` is per-row and constant, so it is stamped once (performance
       law). WHICH row the list hangs under is not: it depends on the rows as
       rendered, and owl #62's filter and sort change them. Stamped from the
       server's order it went stale — see the next test for what that cost. */
    const stamp = fnBody('loadAll');
    expect(stamp).toContain('r.hasTasks');
    expect(stamp).not.toContain('firstOfMc');
    expect(APP_JS).toContain('pipeMcAnchor()');
  });

  it('MOVES THE ANCHOR when a filter hides the group’s first row', () => {
    /* The defect this replaces: filter to the requestor who owns only the
       SECOND deliverable under a shared MC, and the row carrying the stamp is
       no longer rendered — so the visible row drew no chevron and, even with
       the group expanded, no task rows. The MC's work cards were unreachable
       from the table entirely. */
    const second = renderPipelineTable({
      pipelineRows: [SIBLING], // the group's FIRST row filtered away
      rowWarning: () => null,
      workCardsByMc: TASKS,
      expanded: { 'MC-837': true },
    });
    // the two halves of the defect: the visible row draws the chevron, and
    // the expanded group's tasks render under it
    expect([...second.matchAll(/class="chevbtn/g)]).toHaveLength(1);
    expect(taskRows(second)).toHaveLength(2);
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
    }))[0]!, 'col-deadline');
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
    expect(cell(taskRows(late)[0]!, 'col-deadline')).toMatch(/class="datefield readonly overdue/);
    // …and a current one stays undressed
    expect(cell(taskRows(OPEN)[0]!, 'col-deadline')).not.toContain('overdue');
  });
});

/* ---------------------------------------------------------------------- */
/* G — owl #52: an MC that several deliverables share                       */
/* ---------------------------------------------------------------------- */

/* The bug Miles reported on the real board: `mc_number` is not a key
   (invariant 3), so MC-837 carries several DIFFERENT main cards, and expanding
   one of them showed every MC-837 task under that single row — implying an
   attribution the board does not record.
 *
 * The 2026-08-20 probe of `hLL7WW2V` settled that it never will: 0 of 218 main
 * cards carry a checklist, no description links a card to another, list
 * position resolves 0 of 279 ambiguous tasks, members resolve 36, and the best
 * name segment resolves 60 while silently mis-resolving 117. So there is no
 * edge to model — invariant 4 stands — and the honest rendering is to attribute
 * only where the MC has exactly one deliverable and to SAY "shared" otherwise.
 * This is the common case, not the fallback: 279 of 356 task cards (78.4%).
 */
const SHARED_SIBLING = row({
  cardId: 'main-1b',
  name: 'MC-837 Main Card: GBox Nav Icons — Request Hub',
});
const shared = (over: Record<string, unknown> = {}) =>
  renderPipelineTable({
    pipelineRows: [PARENT, SHARED_SIBLING, CHILDLESS],
    rowWarning,
    workCardsByMc: TASKS,
    expanded: { 'MC-837': true },
    ...over,
  });
const SHARED = shared();
const captionRows = (html: string): string[] =>
  [...html.matchAll(/<tr class="ptask pshared">([\s\S]*?)<\/tr>/g)].map((m) => m[1]!);

describe('a shared MC surfaces its tasks once, at MC level — the caption is WITHDRAWN', () => {
  /* owl #52 specced a caption row explaining that these tasks carry the MC
     number and link to no single card; #55 specced the trailing count. JP
     withdrew the row on 2026-08-27 — it is not in the frame.

     WHAT THE WITHDRAWAL DID NOT CHANGE: the underlying fact, and invariant 4.
     There is still no task→deliverable edge (2026-08-20 probe of `hLL7WW2V`:
     0 of 218 main cards carry a checklist, no description links a card to
     another, list position resolves 0 of 279 ambiguous tasks, members resolve
     36, and the best name segment resolves 60 while silently mis-resolving
     117). The tasks still hang off the MC group and are still rendered once
     for the group, not once per deliverable — that is the 78.4%-of-task-views
     case and the 99× hazard invariant 3 warns about. Only the sentence went. */

  it('renders no caption row at all, shared or not', () => {
    expect(captionRows(SHARED)).toHaveLength(0);
    expect(SHARED).not.toContain('not a link to one card');
    expect(captionRows(OPEN)).toHaveLength(0);
    /* `shared by` survives EXACTLY ONCE and only as the chevron's accessible
       name — asserted as a count plus its one legitimate home, so this fails
       both if the caption comes back and if the label quietly goes with it. */
    expect([...SHARED.matchAll(/shared by/g)]).toHaveLength(1);
    expect(SHARED).toContain('aria-label="Work on MC-837, shared by 2 deliverables"');
  });

  it('still renders each task exactly once — the sibling does not duplicate the list', () => {
    /* THE RULE THAT SURVIVES THE CAPTION. The list hangs under the group's
       FIRST row only; with two siblings a per-row render would double it. */
    expect(taskRows(SHARED)).toHaveLength(2);
  });

  it('still renders each task once when THREE deliverables share the number', () => {
    /* #55 refused a threshold on the count, so the count is gone with the
       caption — but the de-duplication it accompanied must not degrade as N
       grows, which is the half that actually protects MC-825's 99 rows. */
    const many = renderPipelineTable({
      pipelineRows: [PARENT, SHARED_SIBLING, row({ cardId: 'main-1c' }), CHILDLESS],
      rowWarning, workCardsByMc: TASKS, expanded: { 'MC-837': true },
    });
    expect(taskRows(many)).toHaveLength(2);
    expect(captionRows(many)).toHaveLength(0);
  });
});

describe('the chevron belongs to the MC, not to each row that shares its number', () => {
  it('renders ONE chevron for a shared MC — on its first row, a spacer on the sibling', () => {
    const chevrons = [...SHARED.matchAll(/class="chevbtn/g)].length;
    // MC-837 (shared, one chevron) + MC-901 is childless (spacer, no chevron)
    expect(chevrons).toBe(1);
    expect([...SHARED.matchAll(/class="chevgap"/g)].length).toBe(2);
  });

  it('names the shared case in the chevron’s accessible label — now the ONLY place', () => {
    /* This was one of two statements of the shared case; the caption row was
       the other, and it was withdrawn on 2026-08-27. So this label is now the
       only place ANY user — sighted or not — is told that expanding shows
       MC-level tasks rather than this card's own. It was already the only
       place a screen-reader user was told. Do not withdraw it as "duplicate
       of the caption": there is no caption. */
    expect(SHARED).toContain('Work on MC-837, shared by 2 deliverables');
  });

  it('leaves the single-deliverable label alone — it attributes, so it says nothing extra', () => {
    expect(OPEN).toContain('aria-label="MC-837 work cards"');
    expect(OPEN).not.toContain('shared by');
  });
});

/* ---------------------------------------------------------------------- */
/* H — owl #78 §1: W1 and W3 write to the WORK CARD                         */
/* ---------------------------------------------------------------------- */

describe('the urgency and difficulty writes address a WORK card, and only that', () => {
  /* THE DEFECT #78 reported, in shipped code: "every urgency and difficulty
     write happening now lands on the wrong object." A website request can
     carry an urgent screen and non-urgent assets, so one value on the parent
     cannot be true. The two enumerated writes are RE-POINTED, not widened —
     a deliverable-scoped route left dormant beside the new one is how a defect
     like this survives its own fix, so the old URL must be absent from the
     client entirely, not merely unreached. */
  const HALVES = [
    ['chooseUrgency', 'urgency'],
    ['chooseDifficulty', 'difficulty'],
  ] as const;

  it('PATCHes /workcards/, and names /deliverables/ in neither handler', () => {
    for (const [h, path] of HALVES) {
      const body = handlerBody(h);
      expect(body, `${h} no longer PATCHes`).toContain("api.send('PATCH'");
      expect(body, `${h} writes the wrong card kind`).toContain(`/workcards/\${cardId}/${path}`);
      expect(body, `${h} still has a deliverable-scoped URL`).not.toContain('/deliverables/');
    }
    // and the retired URLs are gone from the whole shipped bundle, comments
    // and all — the concatenated `<script>` is one scope (test/helpers/source.ts)
    expect(APP_JS).not.toContain('/deliverables/${cardId}/urgency');
    expect(APP_JS).not.toContain('/deliverables/${cardId}/difficulty');
  });

  it('applies and rolls back on the WORK-CARD store, not on the deliverable rows', () => {
    /* invariant 8 unchanged, re-pointed: the optimistic set lands before the
       network call and the revert after it, and BOTH go through
       `patchWorkCard`. Left on `patchRow`, the badge would flip on a main row
       that no longer draws one — a write with no visible subject. */
    for (const [h] of HALVES) {
      const body = handlerBody(h);
      expect(body, `${h} does not patch the work-card store`).toContain('patchWorkCard(cardId');
      expect(body, `${h} still patches a deliverable row`).not.toContain('patchRow(cardId');
      expect(body.indexOf('patchWorkCard(cardId'), h).toBeLessThan(body.indexOf('api.send'));
      expect(body.lastIndexOf('patchWorkCard(cardId'), `${h} never reverts`).toBeGreaterThan(body.indexOf('api.send'));
    }
  });

  it('re-reads the server after a successful write — BOTH halves, not just difficulty', () => {
    /* 2026-09-05 review finding 1. The optimistic `patchWorkCard` moves the
       client's own copy of the card and nothing else, but the Sprint Schedules
       row chip and the Pipeline metric tile above the table are DERIVED
       server-side, per row — so a write that skips the re-read leaves them
       stating the previous value until the next load. Difficulty already
       re-read (the sprint bar re-keys on it) and the deadline write does too;
       urgency was the odd one out. Asserted as ORDER, not presence: a
       `loadAll()` before the PATCH would prove nothing. */
    for (const [h] of HALVES) {
      const body = handlerBody(h);
      expect(body, `${h} never re-reads`).toContain('await loadAll()');
      expect(body.indexOf('await loadAll()'), `${h} re-reads before it writes`).toBeGreaterThan(body.indexOf('api.send('));
    }
  });
});

/* ---------------------------------------------------------------------- */
/* H2 — owl #78 §1 / D3: the URGENT tile counts WORK cards                  */
/* ---------------------------------------------------------------------- */

describe('the URGENT tile counts urgent WORK cards, project-wide', () => {
  /* EXECUTED, not read: a source assertion could show the computed reaching
     for `workCardsByMc` without showing it ever produces a different number
     from the old main-card count. The idiom is the executed-computed one this
     suite's siblings use (`method()` out of the shipped scripts, a `get` that
     serves the plain data the computed reads).

     WHICH population "urgent" means was never ruled — the frame gives the tile
     no definition beyond the word — so D3 reads it project-wide, orphans
     included, matching the population the column now shows. Asked of Miles;
     one line changes if he wants attached cards only. */
  const kpi = (over: Record<string, unknown>) =>
    new Function('DATA', `
      const computed = { ${method('kpi')} };
      return computed.kpi.call({ get: (k) => DATA[k] });
    `)({
      rows: [], workCardsByMc: {}, corrections: [],
      unattachedWork: { cards: 0, mcNumbers: [] },
      ...over,
    }) as { urgent: number; main: number; work: number };

  const wc = (cardId: string, urgency: string) => ({ cardId, urgency });

  it('reads ZERO for an urgent MAIN card whose work cards are all quiet', () => {
    /* the exact state the defect produced: the label sits on the parent, the
       tile counted it, and nothing a reader can see on the table agrees. */
    const out = kpi({
      rows: [{ cardId: 'main-1', mcNumber: 'MC-837', urgency: 'Urgent' }],
      workCardsByMc: { 'MC-837': [wc('t1', 'Non-Urgent'), wc('t2', 'Non-Urgent')] },
    });
    expect(out.urgent).toBe(0);
    expect(out.main, 'MAIN CARDS still counts rows').toBe(1);
    expect(out.work, 'WORK CARDS still counts every work card').toBe(2);
  });

  it('reads TWO for two urgent work cards under one MC', () => {
    expect(kpi({
      rows: [{ cardId: 'main-1', mcNumber: 'MC-837', urgency: 'Non-Urgent' }],
      workCardsByMc: { 'MC-837': [wc('t1', 'Urgent'), wc('t2', 'Urgent'), wc('t3', 'Non-Urgent')] },
    }).urgent).toBe(2);
  });

  it('counts an urgent card under an MC with no row at all (D3 — orphans included)', () => {
    /* `work` above has always totalled these (owl #61), so excluding them here
       would make the two tiles disagree about what the board holds. */
    expect(kpi({ rows: [], workCardsByMc: { 'MC-999': [wc('t9', 'Urgent')] } }).urgent).toBe(1);
  });

  it('treats a card with no urgency at all as quiet, not as urgent', () => {
    // the wire defaults to 'Non-Urgent', but a lean read that missed the field
    // must not promote the card — absence is the absence of the Urgent label
    expect(kpi({ workCardsByMc: { 'MC-837': [{ cardId: 't1' }] } }).urgent).toBe(0);
  });
});

/* ---------------------------------------------------------------------- */
/* I — owl #61: work that belongs to no row and no week                     */
/* ---------------------------------------------------------------------- */

describe('the UNATTACHED metric states work that is absent from capacity', () => {
  const kpi = (over: Record<string, unknown> = {}) => ({
    main: 10, work: 45, open: 3, urgent: 1, unattached: 35, unattachedMcs: 11, ...over,
  });

  it('renders the tile with the count when there is unattached work', () => {
    const html = renderMetrics(kpi());
    // owl #79 / D8: the node's own string is UNATTACHED CARDS, not UNATTACHED
    expect(html).toContain('UNATTACHED CARDS');
    expect(html).toContain('>35</span>');
  });

  it('HIDES at zero — a permanent zero teaches people to stop reading it', () => {
    expect(renderMetrics(kpi({ unattached: 0, unattachedMcs: 0 }))).not.toContain('UNATTACHED');
    // the four standing metrics are untouched by its absence
    expect(renderMetrics(kpi({ unattached: 0 }))).toContain('MAIN CARDS');
    expect(renderMetrics(kpi({ unattached: 0 }))).toContain('URGENT');
  });

  it('carries the CONSEQUENCE in its tooltip, not just the number', () => {
    /* the count alone is trivia; "counted in NO week's capacity" is the thing
       that tells a PM their planned load reads lighter than the real work */
    const tip = /title="([^"]*)"/.exec(renderMetrics(kpi()))![1]!;
    expect(tip).toContain('no main card');
    // apostrophes come back HTML-escaped from toHTML(), so match around one
    expect(tip).toMatch(/counted in NO week/i);
    expect(tip).toContain('Trello'); // where it gets fixed — at source, not here
  });

  it('pluralises both counts rather than printing "1 cards across 1 MC numbers"', () => {
    const tip = (n: number, mcs: number) =>
      /title="([^"]*)"/.exec(renderMetrics(kpi({ unattached: n, unattachedMcs: mcs })))![1]!;
    expect(tip(1, 1)).toContain('1 task card across 1 MC number ');
    expect(tip(35, 11)).toContain('35 task cards across 11 MC numbers ');
  });

  it('wears the QUIETEST voice on the strip — slate-400, and never a warning again', () => {
    /* SUPERSEDES owl #61's amber-700 reading, which this test used to pin.
       Owl #79 (node 843:125895, #94A3B8 on both text nodes) demoted the tile:
       unattached cards are a condition of the DATA, not of the work, and amber
       sat one shade from URGENT — two adjacent tiles competing in the same warm
       family while answering unrelated questions. The tooltip carries the
       consequence (#48's reasoning, asserted above); the tile carries the
       number. #61's hide-at-zero rule is untouched and still asserted above.

       "Do not restore a warning colour here" is the ruling, so the OLD
       modifier is asserted gone from the stylesheet rather than merely unused:
       a live `.metric.warn` rule is exactly how the amber comes back, one
       template edit later, under a green suite. */
    expect(renderMetrics(kpi())).toContain('class="metric quiet"');
    const rule = cssRule('.metrics .metric.quiet .mlabel, .metrics .metric.quiet .mvalue', PIPELINE_CSS);
    expect(rule).toContain('var(--slate-400)');
    expect(TOKENS_CSS).toContain('--slate-400:');
    // the help cursor moved with the modifier — the tooltip IS the tile's point
    expect(cssRule('.metrics .metric.quiet .mvalue', PIPELINE_CSS)).toContain('cursor: help');
    // declarations only: a prose comment naming the retired modifier is history
    // being kept, not a treatment (test/CLAUDE.md rule 3)
    expect(PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ')).not.toContain('.metric.warn');
    expect(renderMetrics(kpi())).not.toContain('class="metric warn"');
  });
});

/* ------------------------------------------------------------------ */
/* URGENCY SPEAKS WITH ONE COLOUR — owls #78/#79                       */
/* nodes 843:125889 (strip) · 842:125808 (badge) · I833:40013;40:4853  */
/* ------------------------------------------------------------------ */

describe('the Pipeline urgency colour set is amber, tile and badge alike', () => {
  const kpi = { main: 10, work: 45, open: 4, urgent: 3, unattached: 0, unattachedMcs: 0 };

  it('paints the URGENT tile amber-600 on BOTH text nodes, not red', () => {
    /* SUPERSEDES the `.metric.red` reading the tile shipped with (and the
       annotation `28:3666`'s "URGENT (red)"). #78 §6 flagged the inconsistency
       — the tile was red while the badge under it is amber-600 — and #79 ruled
       it closed: "URGENT tile is now #D97706, overline and figure both,
       matching the Urgent badge exactly. Do not revert the tile to red."
       Pipeline gets its OWN modifier so Deadlines' URGENT tile, which #79
       leaves alone, keeps `.red`. */
    expect(renderMetrics(kpi)).toContain('class="metric urgent"');
    expect(renderMetrics(kpi), 'the Pipeline strip went back to red').not.toContain('class="metric red"');
    const rule = cssRule('.metrics .metric.urgent .mlabel, .metrics .metric.urgent .mvalue', PIPELINE_CSS);
    expect(rule).toContain('var(--amber-600)');
    expect(TOKENS_CSS).toContain('--amber-600:');
    // one colour, tile and badge: the same token the Urgent badge fills with
    expect(cssRule('.ubadge.urgent', PIPELINE_CSS)).toContain('var(--amber-600)');
  });

  it('gives Urgent and Non-Urgent ONE footprint, so the column cannot reflow', () => {
    /* #79: "Same footprint on both, so the column does not reflow when a
       card's urgency changes." Node 842:125808 is 96 × 25; the variants may
       change paint and nothing else, which is why the box lives on the base
       class alone.

       AN ALLOW-LIST, not a deny-list (2026-09-05 review). Naming the three
       properties that were known to resize the badge left every other one
       through: `border-width`, `letter-spacing`, `line-height`, `zoom`, a
       `font:` shorthand — each changes the rendered box and none matched.
       Listing what a variant MAY set is closed by construction, and it states
       the actual rule: a variant paints, it does not measure. */
    const ALLOWED = ['background', 'border-color', 'border-style', 'color'];
    /** the property NAMES a rule declares — `cssRule` hands back selector and
        braces too, so the block comes out before the split */
    const propsOf = (sel: string): string[] => {
      const rule = cssRule(sel, PIPELINE_CSS);
      return rule
        .slice(rule.indexOf('{') + 1, rule.lastIndexOf('}'))
        .split(';')
        .map((d) => d.split(':')[0]!.trim())
        .filter(Boolean);
    };
    expect(cssRule('.ubadge', PIPELINE_CSS)).toContain('width: 96px');
    for (const v of ['.ubadge.urgent', '.ubadge.nonurgent, .ubadge.unset']) {
      const props = propsOf(v);
      expect(props.length, `${v} declares nothing`).toBeGreaterThan(0);
      for (const p of props) expect(ALLOWED, `${v} sets "${p}", which is not paint`).toContain(p);
    }
    /* The difficulty pill wears `.ubadge` too — the rendered work-row cell is
       `pbadge ubadge d-…`, asserted where the row is rendered — so that ONE
       rule sizes both columns and they line up down the table. It also carried
       a column-scoped box of its own until the 2026-09-05 simplification pass;
       a second width rule can only drift from this one, so its ABSENCE is what
       is asserted here, not a copy of the width in two places. */
    expect(PIPELINE_CSS, 'a column-scoped difficulty-badge box came back')
      .not.toMatch(/\.col-diff\s+\.pbadge[^{}]*\{[^}]*width/);
  });

  it('fills Urgent solid amber-600 with an amber-50 label, exactly as the node draws it', () => {
    /* The node wins over the annotation prose twice here: #79's text says
       "white label", the node's label AND chevron are #FFFBEB (amber-50); and
       there is NO stroke, so the border takes the fill's own colour rather
       than a contrasting one. The chevron inherits `currentColor`, which is
       why one `color` covers both. */
    const rule = cssRule('.ubadge.urgent', PIPELINE_CSS);
    expect(rule).toContain('background: var(--amber-600)');
    expect(rule).toContain('border-color: var(--amber-600)');
    expect(rule).toContain('color: var(--amber-50)');
    expect(rule, 'the red-300/destructive dress survived').not.toContain('red');
  });

  it('draws Non-Urgent as an ABSENCE, one step above the row it sits on', () => {
    /* Two rulings in one rule. The DASH (#78 §6): Trello has an Urgent label
       and none meaning not urgent, so Urgent asserts a value and Non-Urgent
       draws its absence — a solid grey outline would assert a value the data
       does not hold. The FILL: slate-100, not the slate-50 Deadlines uses,
       because a work row's own ground is slate-50 and a slate-50 badge
       vanishes into it. "Keep the badge one step above whatever it sits on." */
    const rule = cssRule('.ubadge.nonurgent, .ubadge.unset', PIPELINE_CSS);
    expect(rule).toContain('border-style: dashed');
    expect(rule).toContain('border-color: var(--slate-400)');
    expect(rule).toContain('background: var(--slate-100)');
    expect(rule, 'the badge went back to the row’s own slate-50').not.toContain('var(--slate-50)');
    // and the row underneath is what makes that necessary
    expect(cssRule('.ptable tr.ptask td', PIPELINE_CSS)).toContain('background: var(--slate-50)');
  });

  it('draws Easy as green-100 behind a green-600 label', () => {
    /* SUPERSEDES owl #04's "50 fill / 500 text" difficulty recipe. Node
       `I833:40013;40:4853` reads fill #DCFCE7 (green-100), stroke #22C55E
       (green-500) and label #16A34A (green-600) — the label is the term #04
       had wrong. Medium and Hard rest on the Badge component set's
       Outline/Notice and Outline/Negative variants because the frame
       instantiates only Easy; that pairing is INFERRED from today's colour
       families and is flagged to Miles (D10), so it is asserted as the built
       recipe rather than as a ruling. */
    const easy = cssRule('.pbadge.d-Easy', PIPELINE_CSS);
    expect(easy).toContain('background: var(--green-100)');
    expect(easy).toContain('border-color: var(--green-500)');
    expect(easy).toContain('color: var(--green-600)');
    expect(easy, 'the #04 recipe came back').not.toContain('var(--green-50)');
    expect(TOKENS_CSS).toContain('--green-100:');
    expect(cssRule('.pbadge.d-Medium', PIPELINE_CSS)).toContain('var(--amber-100)');
    expect(cssRule('.pbadge.d-Hard', PIPELINE_CSS)).toContain('var(--red-50)');
  });
});

/* ------------------------------------------------------------------ */
/* OPEN WORK goes blue — owl miles→jp #69, node 731:100892             */
/* ------------------------------------------------------------------ */

describe('a coloured metric tile colours the LABEL as well as the figure', () => {
  const kpi = { main: 10, work: 45, open: 4, urgent: 1, unattached: 0, unattachedMcs: 0 };

  it('OPEN WORK carries blue/500', () => {
    expect(renderMetrics(kpi)).toContain('class="metric blue"');
    const rule = cssRule('.metrics .metric.blue .mlabel, .metrics .metric.blue .mvalue', PIPELINE_CSS);
    expect(rule).toContain('var(--blue-500)');
    // that the token EXISTS, not what it is worth: pinning the hex here would
    // fail on a palette retune that has nothing to do with this tile
    expect(TOKENS_CSS).toContain('--blue-500:');
  });

  /* THE RULE, not this tile. #69 says "both text nodes take the colour" and
     says it twice, because the natural build is to colour only the 32px
     figure — which leaves a blue number under a slate-900 label and reads as
     a rendering fault rather than a treatment. Asserted over every modifier
     the shipped markup actually uses, so the next coloured tile is covered
     the day it is added and nobody has to remember this file exists. */
  it('EVERY metric modifier in the shipped markup pairs .mlabel with .mvalue', () => {
    const markup = renderMetrics({ ...kpi, unattached: 35, unattachedMcs: 11 });
    const modifiers = [...markup.matchAll(/class="metric ([a-z]+)"/g)].map((m) => m[1]!);
    expect(new Set(modifiers).size, 'no coloured tiles rendered — the guard would pass vacuously')
      .toBeGreaterThan(1);
    /* #69's promise was that the NEXT coloured tile is covered the day it is
       added, and owls #78/#79 are that day: `urgent` and `quiet` are the two
       modifiers they introduce, and both must be inside this walk rather than
       beside it. Named explicitly so a renamed modifier fails here instead of
       quietly leaving the pairing rule uncovered. */
    expect([...new Set(modifiers)].sort()).toEqual(['blue', 'quiet', 'urgent']);

    for (const mod of new Set(modifiers)) {
      const selector = `.metrics .metric.${mod} .mlabel, .metrics .metric.${mod} .mvalue`;
      const rule = cssRule(selector, PIPELINE_CSS);
      expect(rule, `.metric.${mod} colours one node but not both — see owl #69`).toBeTruthy();
      expect(rule).toMatch(/color:/);
    }
  });
});
