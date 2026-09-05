/*
 * Sections E2–G of test/pipeline-expanded.test.ts (split 2026-09-05): block 4's
 * auto-open / hand-collapse / narrowed kids, the derived-map gate, the
 * multi-deliverable and keyboard guards, and owl #52's shared MC. Describes and
 * the section-G prelude moved verbatim; the shared prelude lives in
 * ./helpers/pipeline-expanded.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  COMPUTED_CTX_JS,
  type PipeRow,
  type WorkCardRow,
  divFragment,
  fnBody,
  handlerBody,
  method,
  observerCalls,
  pipeRecipeDecls,
  renderPipelineTable,
  stampRows,
} from './helpers/gantt-render.ts';
import {
  CHILDLESS,
  OPEN,
  PARENT,
  TASKS,
  cell,
  row,
  rowWarning,
  task,
  taskRows,
} from './helpers/pipeline-expanded.ts';

/* ---------------------------------------------------------------------- */
/* E2 — block 4 (owl #78 §4/§5): auto-open, hand-collapse, narrowed kids   */
/* ---------------------------------------------------------------------- */

interface OpenHarness {
  set(key: string, value: unknown): void;
  empty(): Record<string, (string | null)[]>;
  live(): boolean;
  auto(): boolean;
  open(): Record<string, boolean>;
  kids(): Record<string, WorkCardRow[]>;
  rows(): PipeRow[];
}

/* The four block-4 computeds EXECUTED out of the shipped scripts, with the
   computeds they read resolved through the same `get` — the executed-computed
   idiom the `kpi` block below and test/pipeline-sortfilter-noresults.test.ts share. A
   source-text assertion could show `pipeOpen` exists without showing it ever
   opens a group, or that it refuses a childless one.

   `set` re-stamps `work`/`hasTasks` on the rows through the render helper's
   own `stampRows` — the one restatement of `loadAll`'s stamp the suites
   share — so the computeds read the row shape the browser hands them; the
   stamp itself is guarded at its source below ("stamps hasTasks in loadAll"). */
const openHarness = (): OpenHarness =>
  new Function('stampRows', `
    ${pipeRecipeDecls()}
    const computed = { ${['pipeSearched', 'pipeSortDef', 'pipelineRows', 'pipeWorkLive', 'pipeAutoOpen', 'pipeOpen', 'pipeKids'].map((n) => method(n)).join(', ')} };
    const DATA = { rows: [], searchQ: '', pipeFilters: PIPE_FILTERS_EMPTY(), pipeSort: null, expanded: {}, pipeShut: {}, workCardsByMc: {} };
    ${COMPUTED_CTX_JS}
    const stamp = () => { DATA.rows = stampRows(DATA.rows, () => null, DATA.workCardsByMc); };
    return {
      set: (k, v) => { DATA[k] = v; stamp(); },
      empty: () => PIPE_FILTERS_EMPTY(),
      live: () => computed.pipeWorkLive.call(ctx),
      auto: () => computed.pipeAutoOpen.call(ctx),
      open: () => computed.pipeOpen.call(ctx),
      kids: () => computed.pipeKids.call(ctx),
      rows: () => computed.pipelineRows.call(ctx),
    };
  `)(stampRows) as OpenHarness;

describe('a work-card axis or a work-card-derived sort opens the groups it explains (block 4)', () => {
  const URGENT_HARD = task({ cardId: 'task-u', name: 'MC-837 Render Icon: Urgent one', urgency: 'Urgent', difficulty: 'Hard' });
  const QUIET = task({ cardId: 'task-q', name: 'MC-837 Render Icon: Quiet one', due: null });
  const KIDS: Record<string, WorkCardRow[]> = { 'MC-837': [URGENT_HARD, QUIET] };
  const DERIVED = ['due-near', 'due-far', 'urgent', 'hardest'];
  const PLAIN = ['started', 'completed', 'mc', 'mc-desc', 'name', 'name-desc', null];

  /** a harness holding the two-group table: MC-837 with work, MC-901 with none */
  const table = () => {
    const h = openHarness();
    h.set('workCardsByMc', KIDS);
    h.set('rows', [{ ...PARENT }, { ...CHILDLESS }]);
    return h;
  };
  const filters = (h: OpenHarness, over: Record<string, (string | null)[]>) => h.set('pipeFilters', { ...h.empty(), ...over });

  it('reads "a work axis is live" off the WORK axes only — a Type or Status pick opens nothing', () => {
    const h = table();
    filters(h, { type: ['Icon'] });
    expect(h.live()).toBe(false);
    expect(h.auto()).toBe(false);
    filters(h, { urgency: ['Urgent'] });
    expect(h.live()).toBe(true);
    filters(h, { difficulty: [null] });
    expect(h.live(), 'None on DIFFICULTY is a live work selection too').toBe(true);
  });

  it('opens every group with a matching child under a work filter — and never a childless MC', () => {
    /* Miles: "filtering auto-expands main cards" (E1). The reader asked for
       urgent work; the group opens on it. `expanded` stays EMPTY throughout,
       so nothing but the filter can be what opened it. */
    const h = table();
    filters(h, { urgency: ['Urgent'] });
    expect(h.auto()).toBe(true);
    const open = h.open();
    expect(open['MC-837']).toBe(true);
    // drift E2: under a work axis a childless group is not in the table at
    // all — it has no child to match — so pipeOpen carries no entry for it;
    // the hasTasks gate itself is proven by the derived-sort loop below, where
    // nothing filters it out (2026-09-05 block 4 review, finding 9)
    expect('MC-901' in open).toBe(false);
  });

  it('ORDERS the table by the key read over the MATCHING children — through the shipped computed, selection and all (B5)', () => {
    /* `pipelineRows` had never been executed for ORDER here: the sort, or the
       `sel` its pipeSortRows call passes, could go and every test stayed
       green (2026-09-05 block 4 review, finding 5). The rule: a Deadline key
       is the earliest MATCHING child's `due`, so the same group keys
       differently once Urgent narrows its children. */
    const h = openHarness();
    h.set('workCardsByMc', {
      'MC-a': [task({ cardId: 'a-quiet', due: '2026-09-01' }), task({ cardId: 'a-urgent', urgency: 'Urgent', due: '2026-09-20' })],
      'MC-b': [task({ cardId: 'b-urgent', urgency: 'Urgent', due: '2026-09-10' })],
    });
    h.set('rows', [row({ cardId: 'a', mcNumber: 'MC-a' }), row({ cardId: 'b', mcNumber: 'MC-b' })]);
    h.set('pipeSort', 'due-near');
    const order = () => h.rows().map((r) => r.cardId);
    expect(order(), 'nothing live: a leads on its quiet child').toEqual(['a', 'b']);
    filters(h, { urgency: ['Urgent'] });
    expect(order(), 'Urgent live: a keys on its urgent child and trails').toEqual(['b', 'a']);
  });

  it('opens under EACH work-card-derived sort — the Deadline pair and the Priority pair — and under no other', () => {
    /* S6: an order the reader cannot see the basis for looks arbitrary, so
       every reordered group opens to show it. A childless MC is still in the
       table under a sort (nothing filters it out) and still stays shut —
       there is nothing to show. Under the six main-row sorts and the default,
       the hand state is the only truth, and here it is empty. */
    for (const key of DERIVED) {
      const h = table();
      h.set('pipeSort', key);
      expect(h.auto(), `${key} does not auto-open`).toBe(true);
      expect(h.open()['MC-837'], `${key} left the group shut`).toBe(true);
      expect(h.open()['MC-901'], `${key} opened a childless MC`).toBeFalsy();
    }
    for (const key of PLAIN) {
      const h = table();
      h.set('pipeSort', key);
      expect(h.auto(), `${key} auto-opens`).toBe(false);
      expect(h.open()['MC-837'], `${key} opened a group by itself`).toBeFalsy();
    }
  });

  it('keeps a HAND-collapsed group shut while the trigger is live — and ignores `expanded` meanwhile', () => {
    /* E4/B10: the reader closed MC-837 by hand under Urgent first; it stays
       closed. `expanded` is set TRUE here on purpose — while auto-open is on,
       the manual map is not consulted at all, so a stale manual flag cannot
       re-open what the reader just closed. */
    const h = table();
    h.set('pipeSort', 'urgent');
    h.set('pipeShut', { 'MC-837': true });
    h.set('expanded', { 'MC-837': true });
    expect(h.open()['MC-837']).toBe(false);
    // a filter trigger, same rule
    const g = table();
    filters(g, { difficulty: ['Hard'] });
    g.set('pipeShut', { 'MC-837': true });
    expect(g.open()['MC-837']).toBe(false);
  });

  it('returns to the reader’s own `expanded` truth when no trigger is live — pipeShut is not consulted', () => {
    /* B10's other half. Clear the filter and the sort, and the table is the
       table the reader left by hand — a group they closed under the filter
       is not held closed after it. */
    const h = table();
    h.set('pipeShut', { 'MC-837': true });
    h.set('expanded', { 'MC-837': true });
    expect(h.auto()).toBe(false);
    expect(h.open()['MC-837']).toBe(true);
    h.set('expanded', {});
    expect(h.open()['MC-837']).toBe(false);
  });

  it('resets the hand-collapses on EVERY filter or sort change (B10)', () => {
    /* the override is keyed to the trigger that was live when the reader
       closed the group; a different filter or a different sort is a different
       question, and the group it explains should open again. One observer on
       both keys — asserted as a call whose keypath names both and whose body
       empties the map (it may first check the map is not already empty), not
       as a text snapshot of the line. */
    const hit = observerCalls().find(
      (o) => o.keys.includes('pipeFilters') && o.keys.includes('pipeSort') && /app\.set\('pipeShut',\s*\{\}\)/.test(o.call),
    );
    expect(hit, 'no observer on pipeFilters AND pipeSort that empties pipeShut').toBeTruthy();
  });

  it('draws only the MATCHING children inside an opened group under a live work axis (B3)', () => {
    /* MC-825 carries 99 work cards; showing all of them to find the two
       urgent ones defeats the filter. The same conjunction the matcher
       applies: a card is drawn iff it satisfies EVERY live work axis. */
    const h = table();
    filters(h, { urgency: ['Urgent'] });
    expect(h.kids()['MC-837']!.map((w) => w.cardId)).toEqual(['task-u']);
    filters(h, { urgency: ['Urgent'], difficulty: ['Easy'] });
    expect(h.kids()['MC-837'], 'no child is both Urgent and Easy').toEqual([]);
    filters(h, { difficulty: [null] });
    expect(h.kids()['MC-837']!.map((w) => w.cardId), 'None reaches the unlabelled child').toEqual(['task-q']);
  });

  it('hands back the SAME arrays when no work axis is live — a derived sort narrows nothing', () => {
    /* identity, not equality: Ractive diffs `{{#each}}` on array identity, so
       a fresh copy per render would re-key every task row on each keystroke.
       A sort explains an order, it does not exclude a card; a MAIN axis
       narrows groups, not the cards inside them. */
    const h = table();
    h.set('pipeSort', 'urgent');
    expect(h.kids()['MC-837']).toBe(KIDS['MC-837']);
    filters(h, { type: ['Icon'] });
    expect(h.kids()['MC-837']).toBe(KIDS['MC-837']);
    h.set('pipeSort', null);
    expect(h.kids()['MC-837']).toBe(KIDS['MC-837']);
  });

  it('routes the chevron AND the Enter key through ONE door that picks the map the trigger owns', () => {
    /* `toggleMc` is the single place that decides whether a click is a
       hand-collapse (auto-open on → `pipeShut`) or a hand-open (off →
       `expanded`); a handler that toggled a map directly would write the
       wrong truth half the time. The keyboard path keeps its childless
       refusal in front of the door (R-exp-c). EXECUTED, not read for its
       keypaths — the two maps swapped still contained both names (2026-09-05
       block 4 review, finding 6). */
    const calls: string[] = [];
    const reads: string[] = [];
    const knock = (auto: boolean) =>
      new Function('app', `function toggleMc(mc) ${fnBody('toggleMc')}\n toggleMc('MC-837');`)({
        get: (k: string) => { reads.push(k); return auto; },
        toggle: (k: string) => calls.push(k),
      });
    knock(true);
    knock(false);
    expect(calls, 'auto-open on → pipeShut, off → expanded').toEqual(['pipeShut.MC-837', 'expanded.MC-837']);
    expect(reads).toEqual(['pipeAutoOpen', 'pipeAutoOpen']);
    for (const h of ['toggleGroup', 'pipeRowKey']) {
      const body = handlerBody(h);
      expect(body, `${h} does not use the door`).toContain('toggleMc(');
      expect(body, `${h} toggles a map on its own`).not.toContain('app.toggle(');
    }
  });
});

describe('the template gates on the DERIVED maps, not on the raw state (block 4)', () => {
  const rows = [PARENT, CHILDLESS];

  it('opens a group off `pipeOpen` — `expanded` alone opens nothing, `pipeOpen` alone opens it', () => {
    /* rendered both ways so the assertion cannot pass on a template that
       still reads `expanded`: that template opens the second render and not
       the first, which is exactly backwards */
    const derived = renderPipelineTable({ pipelineRows: rows, rowWarning, workCardsByMc: TASKS, expanded: {}, pipeOpen: { 'MC-837': true } });
    expect(taskRows(derived)).toHaveLength(2);
    const chev = /<button class="chevbtn[^"]*"[^>]*>/.exec(derived)![0];
    expect(chev).toMatch(/class="chevbtn open"/);
    expect(chev).toContain('aria-expanded="true"');

    const manual = renderPipelineTable({ pipelineRows: rows, rowWarning, workCardsByMc: TASKS, expanded: { 'MC-837': true }, pipeOpen: {} });
    expect(taskRows(manual)).toHaveLength(0);
    expect(/<button class="chevbtn[^"]*"[^>]*>/.exec(manual)![0]).toContain('aria-expanded="false"');
  });

  it('draws the children off `pipeKids` — the full map is not what an opened group iterates', () => {
    const narrowed = renderPipelineTable({
      pipelineRows: rows, rowWarning, workCardsByMc: TASKS,
      pipeOpen: { 'MC-837': true }, pipeKids: { 'MC-837': [TASKS['MC-837']![0]!] },
    });
    expect(taskRows(narrowed)).toHaveLength(1);
    expect(narrowed).toContain('Render Icon: APIs');
    expect(narrowed).not.toContain('Render Icon: My Groups');
  });

  it('names the two computeds in the table subtree and the two raw maps nowhere in it', () => {
    /* the render above proves the wiring; this pins WHERE, so a second
       `{{#each workCardsByMc[...]}}` cannot come back beside the first under
       a render that happened to pass on the narrowed fixture */
    const tableTpl = divFragment('<div class="pscrollwrap">');
    expect(tableTpl).toContain('pipeOpen[row.mcNumber]');
    expect(tableTpl).toContain('{{#each pipeKids[row.mcNumber] as w}}');
    expect(tableTpl).not.toContain('expanded[row.mcNumber]');
    expect(tableTpl).not.toContain('workCardsByMc[row.mcNumber]');
  });
});

/* ---------------------------------------------------------------------- */
/* F — the 2026-08-18 review pass's guards                                  */
/* ---------------------------------------------------------------------- */

describe('a multi-deliverable MC renders its task list ONCE (invariant 3)', () => {
  /* mc_number is not unique — MC-825 carries 99 deliverable rows — and
     expansion is per-MC, so the block after EVERY sibling row rendered the
     whole task list once per sibling: 99×N duplicated rows and, when the cell
     still held an openable popover, 99 duplicate role=dialog boxes. The list
     and the SubTone hang under the group's FIRST row only, via the stamped
     firstOfMc. */
  const SIBLING = row({ cardId: 'main-1b', displayId: 'MC-837.2', name: 'Second deliverable, same MC' });
  const multi = renderPipelineTable({
    pipelineRows: [PARENT, SIBLING, CHILDLESS], rowWarning, workCardsByMc: TASKS,
    expanded: { 'MC-837': true }, writesEnabled: true,
  });

  it('renders each task row once, not once per sibling', () => {
    expect(taskRows(multi)).toHaveLength(2);
  });

  it('renders each task’s DEADLINE cell once, not once per sibling', () => {
    /* The duplication used to be measured on the open popover; the picker left
       Pipeline with #78 §2, so it is measured on the cell that replaced it —
       same defect, same arithmetic, a surface that still exists. */
    expect(taskRows(multi).map((r) => cell(r, 'col-deadline'))).toHaveLength(2);
    // three main rows plus the two tasks, each with exactly one cell
    expect([...multi.matchAll(/<td class="col-deadline">/g)]).toHaveLength(5);
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
    /* block 4: the row carries its OWN work cards (`r.work`), stamped here
       beside blob/warning from the same map — the work-card axes and the
       derived sort keys read the row, never the map, so a filter pass costs
       no lookup per row per axis. `hasTasks` is that array's length. */
    expect(stamp).toContain('r.work =');
    expect(stamp).toContain('workCardsByMc[r.mcNumber]');
    expect(stamp).toMatch(/r\.hasTasks = r\.work\.length > 0/);
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
    // later arrived — the affordance-that-lies, back through the keyboard.
    // Block 4 moved the toggle itself behind `toggleMc` (it picks the map);
    // the refusal stays in front of that door.
    const body = handlerBody('pipeRowKey');
    expect(body).toContain('hasTasks');
    expect(body.indexOf('toggleMc('), 'no toggle in the keyboard path').toBeGreaterThan(-1);
    expect(body.indexOf('hasTasks')).toBeLessThan(body.indexOf('toggleMc('));
  });
});

/* The Pipeline picker's own render guards retired WITH the picker (owl #78
   §2, block 3): the shared `dueCalendar` partial now has ONE consumer, the
   DEADLINE cell on Sprint Schedules, and test/sprint-schedule-deadline.test.ts
   owns proving that it really renders there — including the rule-6 vacuity
   check this file used to carry. The overdue dress moved into section D
   above, where it is now asserted on the READ-ONLY span. */

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
