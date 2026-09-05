/*
 * Sections A–E of test/pipeline-expanded.test.ts (split 2026-09-05): the one
 * column model, the childless MC, the nesting cues, the read-only DEADLINE
 * cell and the per-project view state. Describes moved verbatim; the shared
 * prelude lives in ./helpers/pipeline-expanded.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS_CODE,
  PIPE_COLS,
  PIPELINE_CSS,
  TEMPLATE,
  cssRule,
  fnBody,
  renderPipelineTable,
  tabViewCode,
} from './helpers/gantt-render.ts';
import {
  COLLAPSED,
  OPEN,
  PARENT,
  TASKS,
  WRITABLE,
  cell,
  row,
  rowWarning,
  task,
  taskRows,
} from './helpers/pipeline-expanded.ts';

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
       `test/pipeline-sortfilter-indicator.test.ts` — and this is the promise made to
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
    // pipeline-warning-dismissal-css.test.ts walks every row-targeting rule for height props,
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
/* D — the DEADLINE cell is READ-ONLY on BOTH row kinds (owl #78 §2)        */
/* ---------------------------------------------------------------------- */

/**
 * The Pipeline view as shipped, with prose stripped.
 *
 * Guards below assert that a control is ABSENT, and the rebuilt template says
 * in its own comments where that control went — naming it. Reading raw text
 * would make the guard fire on the record of the decision (test/CLAUDE.md rule
 * 3, in the kind direction): what must be gone is the markup, not the
 * explanation.
 */
const pipelineView = (): string => tabViewCode('pipeline');

describe('Pipeline REFLECTS the deadline and never sets it (owl #78 §2)', () => {
  /* THE RULE, and the reason it is a rule: W2 writes the work card's Trello due
     date, and there is exactly ONE place in the product where that write is
     armed — the DEADLINE cell of a work-card row on Sprint Schedules, where the
     red tick gives the date something to be compared against. Pipeline shows
     the same date and cannot change it. Two armed pickers over one field is how
     two screens start disagreeing about which of them last wrote.

     The main row shows an em-dash for the reason #78 §1 gives about urgency and
     difficulty one column over: a main card does not HAVE this property. Not
     blank-pending-a-value, not inherited from its work cards — absent. */

  it('draws the static em-dash on the MAIN row, and no control at all', () => {
    /* Asserted on the main row ALONE — `taskRows` is stripped out first, or the
       work rows' own cells would satisfy every negative below and the guard
       would pass against the defect it exists to catch. */
    const mainOnly = WRITABLE.replace(/<tr class="ptask">[\s\S]*?<\/tr>/g, '');
    expect(cell(mainOnly, 'col-deadline')).toBe('<td class="col-deadline"><span class="dimcell">—</span></td>');
    expect(mainOnly, 'a date control survived on the main row').not.toContain('datefield');
  });

  it('draws the WORK row’s own date, read-only, with the calendar mark kept', () => {
    const due = cell(taskRows(WRITABLE)[0]!, 'col-deadline');
    expect(due).toContain('class="datefield readonly');
    expect(due).toContain('2026-08-07');
    expect(due).toContain('i-calendar');
    expect(due, 'the work row still carries a pressable date field').not.toContain('<button');
  });

  it('is read-only EVEN ON A WRITEABLE PROJECT — that is the whole change', () => {
    /* The adversarial case. Before #78 §2 the cell branched on `writesEnabled`,
       so a guard that only ever rendered a read-only project would have gone on
       passing while the picker stayed armed for every real user. Both renders
       are compared, and they must not differ. */
    const off = cell(taskRows(OPEN)[0]!, 'col-deadline'); // writesEnabled false
    const on = cell(taskRows(WRITABLE)[0]!, 'col-deadline'); // writesEnabled true
    expect(on).toBe(off);
    expect(on).not.toContain('duepop');
    expect(on).not.toContain('Select Date');
  });

  it('says `No Due Date` and wears the missing dress when the card has none', () => {
    const due = cell(taskRows(WRITABLE)[1]!, 'col-deadline');
    expect(due).toContain('No Due Date');
    expect(due).toMatch(/class="datefield readonly[^"]*missing/);
  });

  it('keeps the OVERDUE tint — reflecting a date includes reflecting that it has passed', () => {
    const late = renderPipelineTable({
      pipelineRows: [PARENT], rowWarning,
      workCardsByMc: { 'MC-837': [task({ overdue: true })] },
      expanded: { 'MC-837': true }, writesEnabled: true,
    });
    expect(cell(taskRows(late)[0]!, 'col-deadline')).toMatch(/class="datefield readonly[^"]*overdue/);
    // …and a current one stays undressed
    expect(cell(taskRows(WRITABLE)[0]!, 'col-deadline')).not.toContain('overdue');
  });

  it('carries NO picker anywhere in the Pipeline view — trigger, popover or calendar', () => {
    /* Stated over the whole view rather than per cell: the popover used to be
       drawn twice here (once per row kind), so a guard that checked one cell
       could leave the other armed. Nothing that opens, stages or applies a date
       may remain on this tab. */
    const view = pipelineView();
    for (const gone of ['dueCalendar', 'duewrap', 'duepop', 'dueact', 'dueapply', 'dueclear', 'duePopPos']) {
      expect(view, `\`${gone}\` outlived the Pipeline picker`).not.toContain(gone);
    }
    for (const handler of ['openDuePopover', 'dueApply', 'dueClear', 'duePick', 'dueNav', 'dueShortcut']) {
      expect(view, `\`${handler}\` is still wired on Pipeline`).not.toContain(handler);
    }
    expect(view, 'a deadline write is still flagged behind the project gate here').not.toMatch(
      /savingDeadline/,
    );
  });

  it('leaves the deliverable half of W2 unreachable from the client', () => {
    /* The registry entry narrowed to the work card (PLAN.md, contract §W2), and
       the deliverable route went with it. A client that still knew the URL
       would be one restored route away from writing to a main card again. */
    expect(APP_JS_CODE, 'the client can still PATCH a deliverable deadline').not.toMatch(
      /deliverables\/\$\{[^}]*\}\/deadline/,
    );
  });

  it('keeps the column itself — the same class, the same header word', () => {
    // #78 §3 renamed DUE → DEADLINE and moved the class with the label so
    // header, cells and width rule cannot drift over a half-applied rename
    expect(PIPE_COLS.map((c) => c.cls)).toContain('col-deadline');
    expect(PIPE_COLS.find((c) => c.cls === 'col-deadline')!.label).toMatch(/deadline/i);
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
    /* block 4: the hand-collapse map is keyed on mc_number too, so it carries
       the same cross-project hazard and resets beside `expanded` — not
       instead of it: the two are different truths (auto-open on / off) */
    expect(fnBody('resetForProjectSwitch')).toContain('pipeShut: {}');
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
