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

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  COMPUTED_CTX_JS,
  GANTT_CSS,
  PLANNER_CSS,
  TEMPLATE,
  COREY_G,
  OFF_BOARD,
  PLOTTED,
  UNPLOTTED,
  method,
  handlerBody,
  fnBody,
  divFragment,
  cssRule,
  renderSprintSchedule,
  tabView,
  topDecl,
  type SprintGroup,
  type SprintScheduleRow,
} from './helpers/gantt-render.ts';

/**
 * The SECOND argument of a top-level `app.set('name', …)` — the registered
 * helper, sliced so it can be EXECUTED rather than retyped. `sprintFootText`
 * and `sprintFootCls` are registered arrows (70-measure.js), which no `decl`
 * or `method` slicer can address by name.
 */
function appSetArg(name: string, src: string = APP_JS): string {
  const marker = `app.set('${name}',`;
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`sprint-schedule-render: no \`app.set('${name}', …)\` in the shipped frontend source`);
  const start = at + marker.length;
  let depth = 1; // inside app.set's own paren
  for (let i = start; i < src.length; i++) {
    const c = src[i]!;
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ')' && --depth === 0) return src.slice(start, i).trim();
  }
  throw new Error(`sprint-schedule-render: \`app.set('${name}', …)\` never closes`);
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
const schedulesView = (): string => tabView('schedules');

/** One single-row group, so a per-row assertion reads exactly one row. */
const groupsOf = (...rows: SprintScheduleRow[]): SprintGroup[] => [
  { id: 's1', name: 'Sprint A', meta: 'Aug 24 - Aug 28', count: `· ${rows.length} items`, rows },
];

/* ====================================================================== *
 * SUITE 1 — groups: one per sprint, EMPTY INCLUDED, and nothing else.
 * The computed is EXECUTED out of the shipped scripts (rule 2); the render
 * half proves the markup an empty group still emits.
 * ====================================================================== */

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
const H = (): GroupsHarness =>
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

describe('sprintGroups — one group per sprint, empty sprints included, no synthetic groups', () => {
  const SPRINTS = [
    { id: 's1', name: 'Alpha', start: '2026-08-24', end: '2026-08-28' },
    { id: 's2', name: 'Beta', start: '2026-08-31', end: '2026-09-04' },
  ];

  it('emits every sprint — an EMPTY sprint keeps its group, because the SEARCH ROW needs a home', () => {
    const h = H();
    h.set('sprints', SPRINTS);
    h.set('sprintItems', { rows: [{ ...PLOTTED, sprintId: 's1' }], addable: {} });
    const groups = h.groups();
    expect(groups.map((g) => g.id)).toEqual(['s1', 's2']);
    expect(groups[1]!.rows).toEqual([]);
  });

  it('filters rows by sprintId in SERVER order — position-sorted there, never re-sorted here', () => {
    const h = H();
    const rows = [
      { ...OFF_BOARD, id: 'b', sprintId: 's1' },
      { ...PLOTTED, id: 'a', sprintId: 's1' },
      { ...UNPLOTTED, id: 'c', sprintId: 's2' },
    ];
    h.set('sprints', SPRINTS);
    h.set('sprintItems', { rows, addable: {} });
    expect(h.groups()[0]!.rows.map((r: SprintScheduleRow) => r.id)).toEqual(['b', 'a']);
    expect(h.groups()[1]!.rows.map((r: SprintScheduleRow) => r.id)).toEqual(['c']);
  });

  it('derives meta and count through the SAME shipped formatters the header prints', () => {
    const h = H();
    h.set('sprints', [SPRINTS[0]]);
    h.set('sprintItems', { rows: [], addable: {} });
    const g = h.groups()[0]!;
    // both sides shipped: the assertion is the composition, not the strings
    expect(g.meta).toBe(`${h.fmtDate('2026-08-24')} - ${h.fmtDate('2026-08-28')}`);
    expect(g.count).toBe(h.itemCount(0));
  });

  it('NEVER auto-populates — three addable cards and zero rows is zero rows', () => {
    const h = H();
    h.set('sprints', SPRINTS);
    h.set('sprintItems', {
      rows: [],
      addable: { 'MC-07': [{ cardId: 'w1', name: 'A', taskPrefix: null }, { cardId: 'w2', name: 'B', taskPrefix: null }, { cardId: 'w3', name: 'C', taskPrefix: null }] },
    });
    expect(h.groups().every((g) => g.rows.length === 0)).toBe(true);
  });

  it("emits NO 'outside' and NO 'unscheduled' group — absence is the design (#72 §2)", () => {
    const h = H();
    h.set('sprints', SPRINTS);
    // a row pointing at NO existing sprint surfaces nowhere on this screen
    h.set('sprintItems', { rows: [{ ...PLOTTED, sprintId: 'gone' }], addable: {} });
    const groups = h.groups();
    expect(groups.map((g) => g.id)).toEqual(['s1', 's2']);
    expect(groups.every((g) => g.rows.length === 0)).toBe(true);
    // and the tab BODY names neither retired group. Comments are stripped
    // first (the prose legitimately explains the absence), and the sweep
    // stops at the sprints modal — untouched this build, and its delete
    // notice still speaks in deliverable terms (flagged at CLOSE, not here).
    const view = schedulesView().replace(/\{\{!\s[\s\S]*?\}\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const body = view.slice(0, view.indexOf('modal-back') > 0 ? view.indexOf('modal-back') : undefined);
    expect(body).not.toContain('Outside any sprint');
    expect(body).not.toContain('Unscheduled');
  });

  it('renders an empty group as header + search row with zero rows', () => {
    const html = renderSprintSchedule({
      sprintGroups: [{ id: 's2', name: 'Sprint B', meta: 'Aug 31 - Sep 4', count: '· 0 items', rows: [] }],
    });
    expect(html).toContain('Sprint B');
    expect(html).not.toContain('sitem');
    expect(html).toContain('growr gsearch'); // always visible, even here (owl #77 §0)
  });

  it('keeps the no-groups empty state, pointed at the Sprints modal', () => {
    const html = renderSprintSchedule({ sprintGroups: [] });
    expect(html).not.toContain('gcolhead');
    expect(html).toMatch(/Create a sprint/i);
  });
});

/* ====================================================================== *
 * SUITE 2 — the pinned pane: five heads, and each cell's contract
 * ====================================================================== */

describe('the pinned pane carries FIVE heads — Requestor and Type left with the deliverable rows', () => {
  it('orders them MC / Scope / Deadline / Forecasted / Status, by the frozen cell classes', () => {
    const html = renderSprintSchedule();
    const head = html.slice(html.indexOf('gcolhead'), html.indexOf('gblock'));
    expect(head).toMatch(/c-mc[\s\S]*c-scope[\s\S]*c-dl[\s\S]*c-fc[\s\S]*c-gstatus/);
    expect(head).toMatch(/MC no\./i);
    expect(head).toMatch(/deadline/i);
    expect(head).toMatch(/forecasted/i);
    expect(head).not.toContain('c-req');
    expect(head).not.toContain('c-type');
  });

  it('deleted the two retired columns from the stylesheet as well', () => {
    for (const gone of ['.c-req', '.c-type']) {
      expect(GANTT_CSS, `${gone} outlived its column`).not.toContain(gone);
      expect(PLANNER_CSS, `${gone} outlived its column`).not.toContain(gone);
    }
  });
});

describe('the selection checkbox — a row highlight; placement no longer starts here (jp→miles #60)', () => {
  it('renders one .gsel per row, labelled with the MC number AND the card name', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) });
    const box = /<input[^>]*class="gsel"[^>]*>/.exec(html);
    expect(box, 'no selection checkbox rendered').not.toBeNull();
    expect(box![0]).toContain('type="checkbox"');
    /* "Highlight", not "Select … for placement" — the label must not teach
       the retired checkbox-arms-placement model (review 2026-08-28b,
       finding 11) */
    expect(html).toMatch(/aria-label="Highlight MC-655 Hero render"/);
  });

  it('is checked — and the row wears .sel — exactly when sprintSel is this row', () => {
    // attribute ORDER is the template author's, so the tags are read whole
    const checkedBoxes = (html: string): number =>
      [...html.matchAll(/<input[^>]*>/g)].filter((m) => m[0].includes('gsel') && m[0].includes('checked')).length;
    const on = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED, UNPLOTTED), sprintSel: 'i1' });
    const off = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED, UNPLOTTED), sprintSel: null });
    expect(checkedBoxes(on)).toBe(1);
    expect(checkedBoxes(off)).toBe(0);
    expect(on).toMatch(/growr sitem[^"]*\bsel\b/);
    expect(off).not.toMatch(/growr sitem[^"]*\bsel\b/);
  });

  it('wires the toggle to sprintSelect with the row id (source — directives never reach toHTML)', () => {
    expect(schedulesView()).toContain("['sprintSelect', row.id]");
  });
});

describe('the scope cell — badges above the FULL name', () => {
  it('spells urgency as a coloured chip: urgent vs nonurgent, and the dashed Non-Urgent stroke survives', () => {
    const urgent = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) });
    const non = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED) });
    expect(urgent).toMatch(/class="gub urgent"/);
    expect(non).toMatch(/class="gub nonurgent"/);
    expect(non).toContain('Non-Urgent');
    // the DASHED stroke is the Non-Urgent identity (frame 731:98513)
    expect(`${GANTT_CSS}\n${PLANNER_CSS}`).toMatch(/nonurgent[^{]*\{[^}]*dashed/);
  });

  it('shows difficulty as the pbadge family, or an em-dash when the card carries none', () => {
    expect(renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) })).toMatch(/pbadge gsm d-Hard/);
    const none = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED) });
    expect(none).not.toMatch(/pbadge gsm d-/);
    expect(none).toContain('—');
  });

  it('renders the #73 Corey G name IN FULL — the value is never clamped, only the display is', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED) });
    expect(COREY_G.length).toBeGreaterThan(70); // the fixture stays a clamp-tempting one
    expect(html).toContain('class="gname"');
    expect(html).toContain('Corey G Singing');
    expect(html).toContain('by Chicosci'); // the tail survives — nothing cut the middle out
    expect(html).not.toContain('…');
    // and the template binds the raw value — no slice, no clip helper
    expect(schedulesView()).toMatch(/class="gname">\{\{row\.name\}\}/);
  });
});

/* ====================================================================== *
 * SUITE 2b — the DEADLINE cell: the ONE place W2 is armed
 * (owl #78 §2, #72 §7; PLAN.md block 3 B13; nodes 731:98513 / 731:98733)
 *
 * The date the red tick stands at is set HERE and nowhere else. Pipeline's two
 * pickers were withdrawn in the same block, so this cell is the whole of write
 * registry entry W2's user surface — the reason its guards are stricter than a
 * cell's usually are.
 * ====================================================================== */

/**
 * Every `<div class="gcell c-dl">…</div>` of a render, in row order, sliced by
 * counting div tags: the cell nests (`.duewrap`, and the popover inside it), so
 * a non-greedy match to the first `</div>` would hand back a fragment and every
 * negative assertion below would pass on markup it never saw.
 */
const dlCells = (html: string): string[] => {
  const out: string[] = [];
  const open = '<div class="gcell c-dl"';
  for (let at = html.indexOf(open); at >= 0; at = html.indexOf(open, at + 1)) {
    const tags = /<div\b|<\/div>/g;
    tags.lastIndex = at;
    let depth = 0;
    let m: RegExpExecArray | null;
    while ((m = tags.exec(html)) !== null) {
      if (m[0] === '</div>') {
        if (--depth === 0) {
          out.push(html.slice(at, m.index + '</div>'.length));
          break;
        }
      } else depth++;
    }
  }
  return out;
};

describe('the FORECASTED cell still prints the forecast, or an em-dash', () => {
  it('prints the finish through fmtLongIso when the row is plotted', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) });
    expect(html).toContain('long:2026-08-12'); // c-fc — the field the bar's right edge reads
  });

  it('prints an em-dash for an unplotted row', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED) });
    expect(html).not.toContain('long:2026-08-12');
    expect(html).toContain('—');
  });
});

describe('the DEADLINE cell is the W2 setter, gated on the project (PLAN.md B13)', () => {
  it('draws a read-only span on a project whose writes are OFF', () => {
    /* First `writesEnabled` gate on this tab. It is UX only — the server
       refuses the write regardless (`writeGuards`) — but a control that is
       drawn and then refused teaches the reader the wrong thing about the
       project they are in. */
    const cell = dlCells(renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) }))[0]!;
    expect(cell).toContain('class="datefield readonly');
    expect(cell).toContain('long:2026-08-28');
    expect(cell, 'a read-only project still renders a pressable date field').not.toContain('<button');
    expect(cell).not.toContain('duepop');
  });

  it('stays read-only on a row whose card has LEFT the board, whatever the switch says', () => {
    /* Review finding R4-1 / R5-2: an off-board row (status null — the card is
       archived or gone) armed the setter, and Apply then did nothing at all.
       There is nothing to write to, so the cell is the read-only span. */
    const cell = dlCells(renderSprintSchedule({ sprintGroups: groupsOf(OFF_BOARD), writesEnabled: true }))[0]!;
    expect(cell).toContain('class="datefield readonly');
    expect(cell, 'an off-board row still renders a pressable date field').not.toContain('<button');
    expect(cell).not.toContain('duepop');
  });

  it('arms the trigger on a project whose writes are ON', () => {
    const cell = dlCells(renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED), writesEnabled: true }))[0]!;
    expect(cell).toContain('class="duewrap"');
    expect(cell).toMatch(/<button class="datefield/);
    expect(cell).toContain('long:2026-08-28');
    expect(cell).toContain('aria-haspopup="dialog"');
    // the write registry is NAMED where the write is armed — the one place a
    // reader learns that Apply reaches Trello (invariant 2)
    expect(cell).toMatch(/W2/);
  });

  it('offers `Select Date` and the missing dress on a row with no deadline', () => {
    /* Inheritance is retired (#78 §2, PLAN.md B14): the row's deadline is its
       own card's Trello due date or none. A row that shows nothing here is a
       row whose card carries no date — not a row waiting on its MC group. */
    const cell = dlCells(renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED), writesEnabled: true }))[0]!;
    expect(cell).toContain('Select Date');
    expect(cell).toMatch(/class="datefield[^"]*missing/);
  });

  it('says `saving…` while that row’s write is in flight, and only that row’s', () => {
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED, OFF_BOARD),
      writesEnabled: true,
      savingDeadline: { w1: true },
    });
    const [first, second] = dlCells(html);
    expect(first).toContain('saving…');
    expect(first).toMatch(/class="datefield[^"]*saving/);
    expect(second, 'a second row went inert on someone else’s write').not.toContain('saving…');
  });

  it('opens the popover inside the OPEN row’s cell, and in no other', () => {
    /* `duePopover` is one global key holding a cardId, so the branch has to
       compare against the ROW's card. Rendered with two rows on purpose: a
       branch that tested only "is anything open" would put a dialog in every
       cell, and a single-row render could never catch it. */
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED, OFF_BOARD),
      writesEnabled: true,
      duePopover: 'w1',
    });
    const cells = dlCells(html);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toContain('class="duepop"');
    expect(cells[1], 'a closed row rendered the dialog too').not.toContain('duepop');
    expect([...html.matchAll(/class="duepop"/g)]).toHaveLength(1);
  });

  it('really renders the shared calendar inside it (the rule-6 vacuous hazard)', () => {
    /* Ractive swallows an unresolved `{{>dueCalendar}}` in silence. Without
       this, every popover assertion above could be reading a shell that never
       got its contents — the failure mode the Pipeline renderer was caught by
       on 2026-08-18, inherited here with the partial's only remaining caller. */
    const cell = dlCells(renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED), writesEnabled: true, duePopover: 'w1',
    }))[0]!;
    expect(cell).toContain('class="duehead"');
    expect(cell).toContain('class="dueshort"');
    expect(cell).toContain('Next Monday');
    expect(cell).toContain('Apply');
    expect(cell).toContain('Clear Due Date');
  });

  it('enables Clear exactly when there is a date to clear', () => {
    const withDate = dlCells(renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED), writesEnabled: true, duePopover: 'w1',
    }))[0]!;
    expect(withDate).not.toMatch(/<button class="dueclear" disabled/);
    const without = dlCells(renderSprintSchedule({
      sprintGroups: groupsOf(UNPLOTTED), writesEnabled: true, duePopover: 'w2',
    }))[0]!;
    expect(without).toMatch(/<button class="dueclear" disabled/);
  });

  it('binds all three handlers to the ROW’s work card (source — directives never reach toHTML)', () => {
    /* The kind argument is gone with the deliverable half of W2: there is one
       kind left, so passing it would be a second place the kind is stated and a
       second place it could be stated wrongly. */
    const view = schedulesView();
    for (const handler of ['openDuePopover', 'dueApply', 'dueClear']) {
      expect(view, `${handler} lost its work-card binding`).toContain(`['${handler}', row.cardId]`);
      expect(view, `${handler} still carries a kind`).not.toContain(`['${handler}', row.cardId, `);
    }
  });

  it('is the ONLY caller of the shared calendar left in the product', () => {
    // one definition, one call: a calendar change lands in the one popover
    // there is, and a second armed picker cannot appear without failing here
    expect([...TEMPLATE.matchAll(/\{\{#partial dueCalendar\}\}/g)]).toHaveLength(1);
    expect([...TEMPLATE.matchAll(/\{\{>dueCalendar\}\}/g)]).toHaveLength(1);
    expect(schedulesView()).toContain('{{>dueCalendar}}');
    expect([...TEMPLATE.matchAll(/class="dueact"/g)]).toHaveLength(1);
  });

  it('writes to the WORK CARD route, and knows no other', () => {
    /* Registry W2 narrowed to the work card (contract §W2, PLAN.md). Asserted
       as the RULE — this door posts to the work-card endpoint and names no
       other — rather than as a snapshot of the body, and asserted on the ONE
       door: `writeTaskDue` folded into `writeDeadline`, so a second deadline
       writer anywhere in the client is itself the defect. */
    const door = fnBody('writeDeadline');
    expect(door).toContain('/workcards/');
    expect(door, 'the deadline write still knows the deliverable route').not.toContain('/deliverables/');
    expect(APP_JS_CODE, 'a second deadline writer survived the fold').not.toMatch(
      /(?<![\w$.])writeTaskDue(?![\w$])/,
    );

    /* The optimistic contract, asserted as ORDER rather than as text (rule 1):
       the no-op comparison comes BEFORE the network call, the optimistic set
       goes through `patchWorkCard` — the one door that RE-FINDS the card, so a
       keypath held across the await cannot land on another card or on another
       project's map after a switch — and a failure reverts and says so
       (invariant 8). */
    const guardAt = door.search(/=== \(found\.card\.due/);
    expect(guardAt, 'no no-op comparison against the card’s own due').toBeGreaterThan(-1);
    const sendAt = door.indexOf('api.send');
    expect(guardAt).toBeLessThan(sendAt);
    expect(door, 'nothing is set optimistically').toContain('patchWorkCard(cardId, { due:');
    expect(door.indexOf('patchWorkCard(cardId')).toBeLessThan(sendAt);
    expect(door.lastIndexOf('patchWorkCard(cardId'), 'the write never reverts').toBeGreaterThan(sendAt);
    expect(door).toContain('flashBanner');
    // and the reload is what re-derives the deadline, `late` and the tick
    expect(door).toContain('loadAll');
  });

  it('reads the popover’s opening date off the work card, not off the row', () => {
    // the row's `deadline` is derived server-side; what Apply overwrites is the
    // CARD's own Trello due date, so that is what the calendar must open on
    const body = handlerBody('openDuePopover');
    expect(body).toContain('findWorkCard(cardId)');
    expect(body, 'the opener still branches on a retired kind').not.toMatch(/kind/);
  });

  it('puts NO overdue tint on this cell — the tick and the bar already say late', () => {
    /* #72 §7: the bar ends at the forecast and the tick stands at the deadline,
       so lateness is drawn twice on this row already. A third voice on the cell
       would be the loudest and the least precise. */
    const late = dlCells(renderSprintSchedule({
      sprintGroups: groupsOf({ ...PLOTTED, late: true }), writesEnabled: true,
    }))[0]!;
    expect(late).not.toContain('overdue');
  });
});

describe('the status cell — the RAW lane chip, and absence as its own state', () => {
  it('prints the current list VERBATIM in the s-{{status}} colourway', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) });
    expect(html).toMatch(/pbadge s-ongoing/);
    expect(html).toContain('Working on design'); // the raw list name, no translation
  });

  it('renders a titled em-dash when the card has left the board — null is not "ongoing"', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(OFF_BOARD) });
    expect(html).not.toMatch(/pbadge s-/);
    expect(html).toContain('This card is no longer on the board');
  });
});

describe('the icon trio — two parked, one live (ruled decision 4)', () => {
  it('refuses duplicate and pin with a stated reason, in every row state', () => {
    for (const row of [PLOTTED, UNPLOTTED]) {
      const html = renderSprintSchedule({ sprintGroups: groupsOf(row) });
      expect(html).toContain('One row per work card — duplicating is refused');
      expect(html).toContain('Pinning is parked');
    }
  });

  it('enables the calendar only on a plotted row, and says what it does', () => {
    const plotted = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) });
    const unplotted = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED) });
    expect(plotted).toContain('Clear the placement — the row stays');
    // the disabled state is per-row data, so both renders carry the title but
    // only the unplotted one disables the control
    const calBtn = (html: string): string => /<button[^>]*Clear the placement[^>]*>/.exec(html)?.[0]
      ?? /<button[^>]*>(?:(?!<\/button>)[\s\S])*?Clear the placement/.exec(html)?.[0] ?? '';
    expect(calBtn(unplotted)).toContain('disabled');
    expect(calBtn(plotted)).not.toContain('disabled');
  });

  it('wires the calendar to unplotItem, which clears starts_on and reloads (source)', () => {
    expect(schedulesView()).toContain("['unplotItem', row.id]");
    const body = handlerBody('unplotItem');
    expect(body).toContain('starts_on');
    expect(body).toContain('null');
    expect(body).toContain('loadAll');
  });
});

/* ====================================================================== *
 * SUITE 3 — placement: the violet + rides HOVER on any UNPLOTTED row
 * (PLAN 2026-08-28 F2; Miles's note on node 731:100277)
 * ====================================================================== */

describe('the violet + rides the hovered week of any unplotted row — the checkbox gates nothing', () => {
  /* `plotRow` cannot reach a render: the harness passes only the state the
     template owned before the hover pair, and directives never fire in
     `toHTML()` — so the POSITIVE (pointer on a track → + at its week) is
     E2E's real-pointer proof, per this file's honesty note. What a render
     CAN prove is the negative space: the retired `sprintSel` gate must not
     summon the + — under the pre-F2 template both of these drew it. */
  it('a selected, unplotted, hovered-week row shows NOTHING without plotRow', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED), sprintSel: 'i2', plotWeek: '2026-08-10' });
    expect(html).not.toContain('gplus');
    expect(html).not.toContain('ghovcell');
  });

  it('a hovered week alone draws neither — plotRow names WHOSE track', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED, PLOTTED), plotWeek: '2026-08-10' });
    expect(html).not.toContain('gplus');
    expect(html).not.toContain('ghovcell');
  });

  /** Both `.gtrack` subtrees of the view — the committed row's, then the draft's. */
  const trackBlocks = (): [string, string] => {
    const view = schedulesView();
    const first = divFragment('<div class="gtrack"', view);
    const second = divFragment('<div class="gtrack"', view.slice(view.indexOf(first) + first.length));
    return [first, second];
  };

  it('the committed track carries the FROZEN handler gate — hover on any unplotted row', () => {
    expect(schedulesView()).toContain(
      `{{#if !row.startsOn}}on-mousemove="['plotHover', row.id]" on-mouseleave="['plotLeave']" on-click="['plotPlace', row.id]"{{/if}}`,
    );
  });

  it('the + and the hover cell both gate on !row.startsOn && plotRow === row.id && plotWeek — the frozen strings', () => {
    const [committed] = trackBlocks();
    /* !row.startsOn in the RENDER gate, not just the handler gate (review
       2026-08-28b, finding 1): a plotRow re-armed during the placement
       reload survives the row flipping to plotted — with its mouseleave
       gone. The render clause is what keeps that ghost invisible. */
    expect(committed).toContain(
      '{{#if !row.startsOn && plotRow === row.id && plotWeek}}<div class="ghovcell" style="left:{{plusLeft(plotWeek)}}%;" aria-hidden="true"></div>{{/if}}',
    );
    // the + repeats the SAME gate in its own section, so the bars and the
    // deadline tick stack between the tint and the circle by DOM order
    expect(committed.split('{{#if !row.startsOn && plotRow === row.id && plotWeek}}').length - 1).toBe(2);
    expect(committed).toContain('aria-label="Place the bar in the week of {{plotWeek}}"');
  });

  it('the retired sprintSel gate is GONE — the old strings, and the track blocks whole', () => {
    const view = schedulesView();
    expect(view, 'the pre-F2 handler gate regressed — checkbox-armed placement breaks the 731:100277 ruling')
      .not.toContain('sprintSel === row.id && !row.startsOn}}on-mousemove');
    expect(view, 'the pre-F2 + gate regressed').not.toContain('sprintSel === row.id && plotWeek');
    for (const block of trackBlocks()) {
      expect(block, 'sprintSel reached into a track block — the checkbox gates nothing in placement').not.toContain('sprintSel');
    }
  });

  it('lets the TRACK take the click — the + itself is pointer-transparent (CSS)', () => {
    // the same reasoning the drag era swept: a solid circle over the track
    // would swallow the placement click at exactly the column the user aims at
    expect(GANTT_CSS).toMatch(/\.gplus[^{]*\{[^}]*pointer-events: none/);
  });

  it('the hover cell is a slate-50 week column, stacked by DOM order (node 731:100271)', () => {
    const rule = cssRule('.gantt .ghovcell');
    expect(rule).toContain('var(--slate-50)');
    expect(rule).toContain('width: var(--gw)'); // mirrors the week column, no re-derived maths
    expect(rule).toMatch(/position: absolute; top: 0; bottom: 0;/);
    expect(rule).toContain('pointer-events: none'); // the TRACK owns the click, here too
    expect(rule, 'z-index would outstack the bars — DOM order is the seating here').not.toContain('z-index');
  });

  it('wires hover, leave and click on the track, row id and all (source)', () => {
    const view = schedulesView();
    expect(view).toContain(`on-mousemove="['plotHover', row.id]"`);
    expect(view).toContain(`on-mouseleave="['plotLeave']"`);
    expect(view).toContain(`on-click="['plotPlace', row.id]"`);
  });

  it('plotHover names the row and maps the pointer; plotLeave clears the pair (source)', () => {
    const hover = handlerBody('plotHover');
    expect(hover).toContain('plotRow');
    expect(hover).toContain('weekAtX'); // the drop era's pure mapper — rect in, week key out
    const leave = handlerBody('plotLeave');
    expect(leave).toContain('plotRow');
    expect(leave).toContain('plotWeek');
  });

  it('plotPlace PATCHes starts_on and reloads; the geometry mapping is weekAtX (source)', () => {
    const body = handlerBody('plotPlace');
    expect(body).toContain('starts_on');
    expect(body).toContain('/sprint-items/');
    expect(body).toContain('loadAll');
    // the same pure mapper the drop used — measured rect in, week key out
    expect(handlerBody('plotHover')).toContain('weekAtX');
  });

  it('a project switch clears the whole placement and add state (source)', () => {
    const body = fnBody('resetForProjectSwitch');
    for (const key of ['sprintSel', 'plotRow', 'plotWeek', 'addBusy']) {
      expect(body, `${key} survives a project switch`).toMatch(new RegExp(`${key}: null`));
    }
    /* the queries reset to an EMPTY MAP, not null (PLAN.md B10): `addQ` is
       one field per sprint and several may hold text, and the sprint ids it
       is keyed on are per-project — carried over, a query would name another
       project's sprint. */
    expect(body, 'the search queries survive a project switch').toMatch(/addQ: \{\s*\}/);
  });
});

/* Review 2026-08-28b: `plotRow`/`plotWeek` are one GLOBAL pair under many
   tracks, and every defect the correctness pass confirmed was a way for that
   pair to outlive or outreach the hover that set it. These pins hold the four
   disciplines that close them. */
describe('the hover pair cannot strand, and a click places only its OWN hover (review 2026-08-28b)', () => {
  it('plotHover refuses to re-arm during a placement flight (finding 1)', () => {
    expect(
      handlerBody('plotHover'),
      'a hover during the awaited reload re-arms plotRow on the row being placed — the fresh render strips its mouseleave and the ghost + never clears',
    ).toContain('if (sprintItemSaving) return;');
  });

  /* The draft row's half of finding 7 retired with the pending row (owl #77
     §0); the committed row's half is the whole rule now — result rows land
     UNPLOTTED (PLAN.md B5), so nothing but a committed track ever places. */
  it('plotPlace demands the hover is ITS OWN before writing (finding 7)', () => {
    expect(handlerBody('plotPlace'), 'plotPlace would place this row at a week hovered on another track')
      .toContain("app.get('plotRow') !== itemId");
  });
});

/* ====================================================================== *
 * SUITE 4 — adding a work card: ONE always-visible search field per sprint,
 * the matching cards listed beneath it, `Add` on every result row and
 * `Add All` on the field row (owl #77 §0; nodes 833:68629 resting,
 * 840:31597 results, 841:33668 + 841:33689 no matches).
 *
 * The three states are RENDERED (rule 6) and every recipe behind them is
 * EXECUTED out of the shipped scripts (rule 2) — the handlers included, so
 * what a guard proves is the ROUTE one calls and the ids it carries, not
 * that a string appears somewhere in a body. A real keystroke, a real
 * pointer on `Add` and the measured hover rise are E2E's (gantt-rules §5).
 * ====================================================================== */

/**
 * One panel item, shaped as the shipped `addMatches` emits them. The label is
 * spelled out here deliberately: a render proves which NODES the template
 * emits, and the label's composition is proven by executing `addLabel`
 * against `addMatches` in the source suite below.
 */
const item = (mc: string, name: string, cardId: string) => ({ cardId, mc, name, label: `${mc}: ${name}` });

/** Sprint A's panel — two results. */
const PANEL_A = {
  items: [item('MC-06', 'Illustrate Asset: Hero Banner', 'c1'), item('MC-06', 'Illustrate Asset: Chickenjoy Mascot', 'c3')],
};
/** Sprint B's panel — a DIFFERENT card, so a leak between sprints shows. */
const PANEL_B = { items: [item('MC-07', 'Sketch Asset: Loft Plan', 'c9')] };
const PANELS = { s1: PANEL_A, s2: PANEL_B };

/** Every `<button>` open tag in `html` whose class list carries `cls`. */
const links = (html: string, cls: string): string[] =>
  [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(cls));

/** The one `cls` link in `html` — asserts the count so a read cannot go silent. */
const oneLink = (html: string, cls: string): string => {
  const found = links(html, cls);
  expect(found, `expected exactly one \`${cls}\` link`).toHaveLength(1);
  return found[0]!;
};

/** A two-group render split at Sprint B's header — [Sprint A's half, B's]. */
const bySprint = (html: string): [string, string] => {
  const at = html.indexOf('Sprint B');
  expect(at, 'the two-group fixture stopped rendering its second sprint').toBeGreaterThan(-1);
  return [html.slice(0, at), html.slice(at)];
};

/** 35-gantt.css with comments stripped — rule 3's kinder corpus for sweeps
    whose subject the sheet may legitimately NAME while explaining it. */
const CSS = GANTT_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Every rule as `{ selector, body }`. The sheet carries no at-rules, so
    splitting on `}` lands exactly on rule boundaries. */
const CSS_RULES: Array<{ selector: string; body: string }> = CSS.split('}')
  .map((chunk) => {
    const at = chunk.indexOf('{');
    return at < 0 ? null : { selector: chunk.slice(0, at).trim(), body: chunk.slice(at + 1) };
  })
  .filter((r): r is { selector: string; body: string } => r !== null);

/** Every rule whose selector names `.cls` as a WHOLE class token. */
const rulesFor = (cls: string) => CSS_RULES.filter((r) => new RegExp(`\\.${cls}(?![\\w-])`).test(r.selector));

describe('the search row — always visible, one per sprint, resting until typed into (833:68629)', () => {
  it('rests with the placeholder alone: no Add All, no results, no message', () => {
    const html = renderSprintSchedule(); // two groups, one of them empty
    expect([...html.matchAll(/growr gsearch/g)]).toHaveLength(2);
    expect(html).toContain('Search by MC# or Work Card to add to sprint');
    expect(html, 'Add All is drawn at rest — 833:68629 shows the field alone').not.toContain('gaddall');
    expect(html, 'a result row exists with no query behind it').not.toContain('gresult');
    expect(html).not.toContain('No cards found for this query');
  });

  it('draws the week grid in its timeline half and NO placement + (B5; 840:31630)', () => {
    const row = divFragment('<div class="growr gsearch"', renderSprintSchedule());
    expect(row).toContain('gweek'); // the grid runs on across the row
    expect(row, 'the frame draws no + on the search row — a result lands UNPLOTTED (#72 §6)').not.toContain('gplus');
    expect(row).not.toContain('ghovcell');
  });

  it('survives the collapsed pane — the field is pane-wide, so nothing hides it (B9)', () => {
    const html = renderSprintSchedule({ leftCollapsed: true, addQ: { s1: 'illustrate' }, addPanels: { s1: PANEL_A } });
    expect(html).toContain('growr gsearch');
    expect(html).toContain('growr gresult');
    /* the retired hide existed only because the pending row's dropdown cells
       lived in columns `lpc` hides; a field that FILLs the pane has none */
    const lpc = CSS_RULES.filter((r) => r.selector.includes('lpc'));
    expect(lpc.length, 'no lpc rules at all — this sweep would be vacuous').toBeGreaterThan(0);
    for (const r of lpc) {
      expect(r.selector, 'the collapsed pane hides the search row — B9 keeps it').not.toMatch(/gsearch|gresult/);
    }
  });

  it('wires field and links to the frozen handlers, per sprint (source — directives never reach toHTML)', () => {
    const view = schedulesView();
    expect(view).toContain('value="{{addQ[g.id]}}"'); // one field per sprint, two-way bound
    expect(view).toContain(`on-keydown="['addKey', g.id]"`);
    expect(view).toContain(`on-click="['addAll', g.id]"`);
    expect(view).toContain(`on-click="['addOne', g.id, m.cardId]"`);
  });
});

describe("typing opens THAT sprint's panel — matches, no matches, one sprint at a time", () => {
  it('lists one result row per item, each with its label and its own Add, and offers Add All', () => {
    const html = renderSprintSchedule({ addQ: { s1: 'mc-06 illustrate' }, addPanels: { s1: PANEL_A } });
    const [a, b] = bySprint(html);
    expect([...a.matchAll(/growr gresult/g)]).toHaveLength(2);
    expect(a).toContain('MC-06: Illustrate Asset: Hero Banner');
    expect(a).toContain('MC-06: Illustrate Asset: Chickenjoy Mascot');
    expect(links(a, 'gaddone')).toHaveLength(2);
    expect(oneLink(a, 'gaddall'), 'Add All is dead with a set to add').not.toContain('disabled');
    expect(a).not.toContain('gnomatch');
    // the other sprint is untouched — the field is per sprint (B10)
    expect(b).not.toContain('gaddall');
    expect(b).not.toContain('gresult');
  });

  it('greys Add All for a query with no matches and draws ONE muted line where the first result would be', () => {
    const html = renderSprintSchedule({ addQ: { s1: 'zzz' }, addPanels: { s1: { items: [] } } });
    const [a] = bySprint(html);
    expect([...a.matchAll(/growr gresult/g)], 'the muted line IS the first result row (841:33689)').toHaveLength(1);
    expect(a).toContain('gnomatch');
    expect(a).toContain('No cards found for this query');
    expect(a).toContain('gmuted');
    expect(oneLink(a, 'gaddall'), 'Add All stays live with nothing to add').toContain('disabled');
    expect(links(a, 'gaddone'), 'a row with no card offered an Add').toHaveLength(0);
  });

  it('treats an EMPTY items array as an OPEN panel — absence of the KEY is what rests', () => {
    // the switch is `{{#if addPanels[g.id]}}`, never the item count: a
    // no-match query must show its message, not fall back to the resting row
    expect(renderSprintSchedule()).not.toContain('gaddall');
    expect(renderSprintSchedule({ addQ: { s1: 'zzz' }, addPanels: { s1: { items: [] } } })).toContain('gaddall');
  });

  it('wears .typed on the field exactly while its OWN panel is open (B12 — CSS cannot read a value)', () => {
    expect(renderSprintSchedule()).not.toMatch(/class="gaddq[^"]*typed/);
    const [a, b] = bySprint(renderSprintSchedule({ addQ: { s1: 'zzz' }, addPanels: { s1: { items: [] } } }));
    expect(a).toMatch(/class="gaddq[^"]*typed/);
    expect(b).not.toMatch(/class="gaddq[^"]*typed/);
  });

  it('holds two independent panels — several sprints may carry text at once (B10)', () => {
    const html = renderSprintSchedule({ addQ: { s1: 'illustrate', s2: 'loft' }, addPanels: PANELS });
    const [a, b] = bySprint(html);
    expect(a).toContain('MC-06: Illustrate Asset: Hero Banner');
    expect(a, "Sprint B's result leaked into Sprint A's panel").not.toContain('MC-07: Sketch Asset: Loft Plan');
    expect(b).toContain('MC-07: Sketch Asset: Loft Plan');
    expect(b, "Sprint A's results leaked into Sprint B's panel").not.toContain('MC-06: Illustrate');
    expect(links(a, 'gaddone')).toHaveLength(2);
    expect(links(b, 'gaddone')).toHaveLength(1);
  });

  it("makes EVERY sprint's links inert while one add is in the air — one act per screen (B10, amended at review)", () => {
    /* the handler guards on `addBusy` being set at all, so the template must
       disable on the same truth: a link rendered live in a sprint that is not
       adding would answer a click with nothing (review 2026-09-05, B2-R2) */
    const html = renderSprintSchedule({ addQ: { s1: 'illustrate', s2: 'loft' }, addPanels: PANELS, addBusy: 's1' });
    const [a, b] = bySprint(html);
    for (const half of [a, b]) {
      for (const cls of ['gaddone', 'gaddall']) {
        expect(links(half, cls).length, `no ${cls} to read — the assertions below would be vacuous`).toBeGreaterThan(0);
        expect(links(half, cls).every((tag) => tag.includes('disabled')), `a ${cls} stayed live during a flight`).toBe(true);
      }
    }
    // every result row wears the busy grammar — the CSS greys the link and holds the label on it
    expect([...html.matchAll(/<div class="growr gresult[^"]*"/g)].every((m) => m[0].includes('busy'))).toBe(true);
    const idle = renderSprintSchedule({ addQ: { s1: 'illustrate', s2: 'loft' }, addPanels: PANELS, addBusy: null });
    expect(links(idle, 'gaddone').some((tag) => tag.includes('disabled')), 'a per-row Add froze with nothing in flight').toBe(false);
    expect(idle).not.toMatch(/class="growr gresult[^"]*busy/);
  });

  it('draws no placement + on a result row — the card lands UNPLOTTED (B5)', () => {
    const row = divFragment('<div class="growr gresult ', renderSprintSchedule({ addQ: { s1: 'x' }, addPanels: { s1: PANEL_A } }));
    expect(row).toContain('gweek');
    expect(row, 'the result row offers placement — adding and placing are TWO acts (#72 §6)').not.toContain('gplus');
    expect(row).not.toContain('ghovcell');
  });
});

describe('the search row after review (2026-09-05) — the field debounces, names itself, and the panel speaks', () => {
  const open = renderSprintSchedule({ addQ: { s1: 'illustrate' }, addPanels: { s1: PANEL_A } });
  const none = renderSprintSchedule({ addQ: { s1: 'zzz' }, addPanels: { s1: { items: [] } } });

  it('debounces the field like every other search field in the app (surface-4)', () => {
    // three fields carry lazy="250" already — a fourth that re-ran the whole pool per keystroke would be the odd one
    expect(TEMPLATE.match(/<input class="gaddq[^>]*lazy="250"/), 'the add field has no lazy debounce').not.toBeNull();
  });

  it('gives the field an id keyed on the sprint — what the focus return finds (B2-R7)', () => {
    expect(open).toMatch(/<input class="gaddq[^>]*id="gaddq-s1"/);
    expect(fnBody('addRefocus'), 'addRefocus does not look the field up by that id').toContain('gaddq-');
  });

  it('announces the answer — the no-match line is a status, and a match count is spoken off-screen (surface-3)', () => {
    expect(none).toMatch(/<span class="gmuted" role="status">No cards found for this query<\/span>/);
    expect(open).toMatch(/<span class="gvh" role="status">2 work cards match<\/span>/);
    expect(none, 'a zero count spoke beside the no-match line').not.toContain('work cards match');
    const one = renderSprintSchedule({ addQ: { s1: 'x' }, addPanels: { s1: { items: [PANEL_A.items[0]!] } } });
    expect(one).toContain('1 work card matches');
  });
});

/* ---------------------------------------------------------------------- *
 * The matching recipe and the panel computed, executed from shipped source.
 * ---------------------------------------------------------------------- */

interface Match {
  cardId: string;
  mc: string;
  name: string;
  label: string;
}
type Addable = Record<string, Array<{ cardId: string; name: string; taskPrefix: string | null }>>;
interface AddHarness {
  addLabel(mc: string, name: string): string;
  addTokens(q: string): string[];
  addMatches(q: string, addable: Addable): Match[];
  panels(s: { sprints: Array<{ id: string }>; addQ: Record<string, string>; addable: Addable }): Record<string, { items: Match[] } | undefined>;
}

/**
 * `addLabel` / `addTokens` / `addMatches` (10-constants.js) and the
 * `addPanels` computed (40-app-state.js), sliced out of the shipped bundle
 * and executed. `mcRank`, `cmpNullsLast` and its `unranked` ride along because
 * the cross-MC order is defined in terms of them (PLAN.md B2) — the same rank
 * and the same nulls-last comparator the Requests and Pipeline tables already
 * sort by, so "unrankable last" cannot come to mean two things on two screens.
 * `mcRank` ships from a LATER file in build.js's order; a runtime call sees it
 * either way, so the prelude declares it first.
 *
 * Sliced LAZILY, as `G()` is: `topDecl` throws when a declaration is absent,
 * and a throw at module scope would take the render suites down with it.
 */
let addHarness: AddHarness | undefined;
const A = (): AddHarness =>
  (addHarness ??= new Function(`
    ${['mcRank', 'unranked', 'cmpNullsLast', 'addLabel', 'addTokens', 'addMatches'].map((n) => topDecl(n)).join('\n')}
    const computed = { ${method('addPanels')} };
    const DATA = { sprints: [], addQ: {}, sprintItems: { addable: {} } };
    ${COMPUTED_CTX_JS}
    return {
      addLabel, addTokens, addMatches,
      panels: (s) => {
        DATA.sprints = s.sprints;
        DATA.addQ = s.addQ;
        DATA.sprintItems = { addable: s.addable };
        return computed.addPanels.call(ctx);
      },
    };
  `)() as AddHarness);

/**
 * The annotation's own example (840:31597): "MC-06 Illustrate" lists MC-06's
 * Illustrate cards. The Jollibee card shares the MC and the MC-07 card shares
 * the word — each is a way for a looser rule to over-list.
 */
const ADDABLE: Addable = {
  'MC-06': [
    { cardId: 'c1', name: 'Illustrate Asset: Hero Banner', taskPrefix: 'Illustrate Asset' },
    { cardId: 'c2', name: 'Jollibee Chickenjoy Poster', taskPrefix: null },
    { cardId: 'c3', name: 'Illustrate Asset: Chickenjoy Mascot', taskPrefix: 'Illustrate Asset' },
  ],
  'MC-07': [{ cardId: 'c4', name: 'Illustrate Asset: Other Client', taskPrefix: 'Illustrate Asset' }],
};

describe('addMatches — every token, over the whole label, in MC order (PLAN.md B1/B2)', () => {
  it("lists MC-06's Illustrate cards for the annotation's own query, and nothing else", () => {
    expect(A().addMatches('MC-06 Illustrate', ADDABLE).map((m) => m.cardId)).toEqual(['c1', 'c3']);
  });

  it('needs EVERY token — a raw substring test would match none of them (the colon)', () => {
    const hits = A().addMatches('MC-06 Illustrate', ADDABLE);
    expect(hits.length).toBeGreaterThan(0);
    // the proof that a passing recipe cannot be `label.includes(query)`: no
    // label carries the query as typed, because a label reads `MC: name`
    for (const m of hits) expect(m.label).not.toContain('MC-06 Illustrate');
  });

  it('matches through the LABEL, so a token can name a card the NAME never mentions', () => {
    const hits = A().addMatches('mc-07', ADDABLE);
    expect(hits.map((m) => m.cardId)).toEqual(['c4']);
    expect(hits[0]!.name, 'the fixture stopped testing what it claims to').not.toContain('MC-07');
  });

  it('is case-blind in both directions', () => {
    const lower = A().addMatches('mc-06 illustrate', ADDABLE).map((m) => m.cardId);
    expect(lower).toEqual(['c1', 'c3']);
    expect(A().addMatches('MC-06 ILLUSTRATE', ADDABLE).map((m) => m.cardId)).toEqual(lower);
  });

  it('answers a blank or whitespace-only query with NOTHING — blank is the resting state (B1)', () => {
    expect(A().addTokens('')).toEqual([]);
    expect(A().addTokens('   ')).toEqual([]);
    expect(A().addMatches('', ADDABLE)).toEqual([]);
    expect(A().addMatches('   \t ', ADDABLE)).toEqual([]);
  });

  it('composes every label through the shipped addLabel — one spelling, never two', () => {
    const hits = A().addMatches('illustrate', ADDABLE);
    expect(hits.length).toBeGreaterThan(0);
    for (const m of hits) expect(m.label).toBe(A().addLabel(m.mc, m.name));
  });

  it("orders MC ascending, then the SERVER's order inside an MC — never re-sorted here (B2)", () => {
    /* the per-MC list is deliberately UNSORTED: the server sorts it (#73's
       provisional alphabetical rule) and the client must not sort it again —
       a client alphabetical pass would answer ['m', 'a', 'z'] */
    const unsorted: Addable = {
      'MC-825': [
        { cardId: 'z', name: 'Zebra pass', taskPrefix: null },
        { cardId: 'a', name: 'Apple pass', taskPrefix: null },
      ],
      'MC-06': [{ cardId: 'm', name: 'Middle pass', taskPrefix: null }],
    };
    expect(A().addMatches('pass', unsorted).map((m) => m.cardId)).toEqual(['m', 'z', 'a']);
  });

  it('puts an unrankable MC last, ordered among its own by string (B2)', () => {
    const mixed: Addable = {
      'MC-ZZ': [{ cardId: 'z', name: 'Zed pass', taskPrefix: null }],
      'MC-AA': [{ cardId: 'a', name: 'Ana pass', taskPrefix: null }],
      'MC-825': [{ cardId: 'n', name: 'Numbered pass', taskPrefix: null }],
    };
    expect(A().addMatches('pass', mixed).map((m) => m.cardId)).toEqual(['n', 'a', 'z']);
  });

  it('caps nothing — a one-letter query lists the WHOLE addable set (B2, raised with Miles)', () => {
    // "the list on screen IS the set": a cap would let Add All add rows the
    // reader cannot see, which is the one thing this design must not do
    expect(A().addMatches('m', ADDABLE)).toHaveLength(Object.values(ADDABLE).flat().length);
  });
});

describe('addPanels — a key exists only where a query has tokens (frozen contract)', () => {
  const SPRINTS = [{ id: 's1' }, { id: 's2' }];
  const panels = (addQ: Record<string, string>) => A().panels({ sprints: SPRINTS, addQ, addable: ADDABLE });

  it('emits NO key for a blank or whitespace query — a resting sprint is absent', () => {
    expect(Object.keys(panels({}))).toEqual([]);
    expect(Object.keys(panels({ s1: '', s2: '   ' }))).toEqual([]);
  });

  it('emits a key with an EMPTY items array for a query that matches nothing', () => {
    const p = panels({ s1: 'zzzz' });
    expect(Object.keys(p)).toEqual(['s1']);
    expect(p.s1!.items).toEqual([]);
  });

  it('emits the matches for a query that finds some, and only for the sprint that typed', () => {
    const p = panels({ s2: 'MC-06 Illustrate' });
    expect(Object.keys(p)).toEqual(['s2']);
    expect(p.s2!.items.map((m) => m.cardId)).toEqual(['c1', 'c3']);
  });

  it('answers every sprint from the SAME pool — the addable map is not partitioned (B11)', () => {
    const p = panels({ s1: 'illustrate', s2: 'illustrate' });
    expect(p.s1!.items.map((m) => m.cardId)).toEqual(p.s2!.items.map((m) => m.cardId));
  });

  it('opens no panel for a sprint that no longer exists — a stale query is not a phantom row', () => {
    expect(Object.keys(panels({ gone: 'illustrate' }))).toEqual([]);
  });
});

/* ---------------------------------------------------------------------- *
 * The three handlers, executed. What matters about them is the ROUTE, the
 * ids that ride along and when the query clears — none of which a source
 * grep can tell apart from a string that merely appears in a body.
 * ---------------------------------------------------------------------- */

interface AddRun {
  api: Array<{ method: string; path: string; body: Record<string, unknown> }>;
  banners: string[];
  /** the sprints the handler asked the focus return for, in order */
  refocus: string[];
  reloads: number;
  reply: unknown;
  state: Record<string, unknown>;
}

/** Every top-level `const`/`function` the shipped bundle declares — what
    `topDecl` can slice. The two shared top-level `let`s are stubbed by name. */
const TOP_LEVEL = new Set([...APP_JS_CODE.matchAll(/\n(?:const|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!));

/** The stub scope every handler run is given. */
const STUBBED = ['app', 'api', 'flashBanner', 'errText', 'loadAll', 'addRefocus', 'sprintItemSaving'];

/**
 * The shipped declarations a body NAMES beyond the stub scope, and theirs in
 * turn, as one prelude. A handler may lean on any top-level helper in the
 * bundle — the skip banner's sentence and its code→wording map, for two — and
 * PLAN.md froze the HANDLERS, not the helpers they reach for. Naming those
 * here would couple this suite to a spelling nobody froze, so they are
 * RESOLVED out of the shipped source instead (test/CLAUDE.md rule 2). Bare
 * references count, not just calls: the map behind the banner is read, never
 * called, and missing it turned a partial add into a caught ReferenceError.
 */
const shippedDeps = (body: string): string => {
  const out: string[] = [];
  const seen = new Set(STUBBED);
  const queue = [body];
  while (queue.length) {
    for (const m of queue.shift()!.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      const name = m[1]!;
      if (seen.has(name) || !TOP_LEVEL.has(name)) continue;
      seen.add(name);
      const decl = topDecl(name);
      out.push(decl);
      queue.push(decl);
    }
  }
  return out.join('\n');
};

/**
 * The handler's own signature as a function expression, DERIVED rather than
 * retyped (rule 2): PLAN.md froze the parameter lists, and a retyped copy
 * would keep binding the arguments below to names the shipped handler had
 * stopped using. Reads the comment-stripped source, as `handlerBody` does.
 */
const handlerHead = (name: string): string => {
  const m = new RegExp(`\\n  (async )?(${name}\\([^)]*\\))`).exec(APP_JS_CODE);
  expect(m, `no \`${name}\` handler in the shipped client`).not.toBeNull();
  return `${m![1] ?? ''}function ${m![2]}`;
};

/**
 * Runs one shipped add handler in a stub scope. Everything the body reaches
 * for outside itself — `app`, `api`, `flashBanner`, `errText`, `loadAll`, the
 * module-level `sprintItemSaving` lock, and any shipped helper it calls — is
 * supplied and recorded. `api.send` answers with the route's documented body,
 * or throws when `reply` is an Error. The seed is DEEP-COPIED: one shared
 * fixture object mutated by an earlier run made a later run's assertion read
 * the earlier run's writes.
 */
const runAdd = async (
  name: 'addOne' | 'addAll' | 'addKey',
  args: unknown[],
  seed: Record<string, unknown> = {},
  reply: unknown = { ok: true, added: 1, skipped: [] },
): Promise<AddRun> => {
  const run: AddRun = {
    api: [],
    banners: [],
    refocus: [],
    reloads: 0,
    reply: reply instanceof Error ? null : reply,
    state: { activeProjectId: 'p1', addQ: {}, addBusy: null, addPanels: {}, ...structuredClone(seed) },
  };
  const factory = new Function(
    'run',
    'fail',
    `
    const state = run.state;
    const app = {
      get: (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), state),
      set: (a, b) => {
        const write = (k, v) => {
          const parts = k.split('.');
          const last = parts.pop();
          let o = state;
          for (const p of parts) o = (o[p] = o[p] || {});
          o[last] = v;
        };
        if (a && typeof a === 'object') Object.keys(a).forEach((k) => write(k, a[k]));
        else write(a, b);
      },
    };
    const api = { send: async (m, p, b) => { run.api.push({ method: m, path: p, body: b }); if (fail) throw fail; return typeof run.reply === 'function' ? run.reply(run) : run.reply; } };
    /* the banner is STATE, as shipped: flashBanner writes the slot and the
       reload writes it too — 80-loaders.js's one app.set carries
       \`banner: … : ''\`. A stub reload that left the slot alone let a summary
       the reload wipes pass as delivered (review 2026-09-05, B2-R1). */
    const flashBanner = (m) => { run.banners.push(String(m)); app.set('banner', String(m)); };
    const errText = (e) => (e && e.detail && e.detail.message) || (e && e.message) || 'Request failed';
    const loadAll = async () => { run.reloads += 1; app.set('banner', ''); };
    const addRefocus = (s) => { run.refocus.push(String(s)); };
    let sprintItemSaving = false;
    ${shippedDeps(handlerBody(name))}
    return ${handlerHead(name)} ${handlerBody(name)};
  `,
  ) as (r: AddRun, fail: Error | null) => (...a: unknown[]) => unknown;
  await factory(run, reply instanceof Error ? reply : null)(...args);
  return run;
};

/** That run's query map, after the handler had its way with it. */
const queries = (run: AddRun) => run.state.addQ as Record<string, string>;

describe('addOne — the single route, and the query stays (B4)', () => {
  const seed = { addQ: { s1: 'illustrate' }, addPanels: PANELS };

  it('POSTs the sprint and the card to the EXISTING single route, never the batch one', async () => {
    const run = await runAdd('addOne', [null, 's1', 'c1'], seed);
    expect(run.api).toHaveLength(1);
    expect(run.api[0]!.method).toBe('POST');
    expect(run.api[0]!.path).toBe('/api/projects/p1/sprint-items');
    expect(run.api[0]!.body).toEqual({ sprint_id: 's1', card_id: 'c1' });
    expect(run.api[0]!.body, 'a single add carries a start — the two acts collapsed back into one (B5)')
      .not.toHaveProperty('starts_on');
    expect(run.reloads, 'the added row never arrives — loadAll is what fetches it').toBe(1);
  });

  it('leaves the query alone — the added card drops out when loadAll replaces the pool (B4)', async () => {
    expect(queries(await runAdd('addOne', [null, 's1', 'c1'], seed)).s1).toBe('illustrate');
  });

  it('refuses to start while another add is in flight, and writes nothing', async () => {
    const run = await runAdd('addOne', [null, 's1', 'c1'], { ...seed, addBusy: 's2' });
    expect(run.api).toHaveLength(0);
  });

  it('surfaces a plain failure through the banner, reloads nothing, and releases the lock', async () => {
    const run = await runAdd('addOne', [null, 's1', 'c1'], seed, new Error('Failed to fetch'));
    expect(run.banners).toEqual(['Failed to fetch']);
    expect(run.reloads, 'a network failure says nothing about the list — reloading it is noise').toBe(0);
    expect(run.state.addBusy, 'the lock outlived a failed flight — that sprint can never add again').toBeFalsy();
  });

  it('reloads BEFORE bannering a refusal that means the list is stale — the refused row leaves (B2-R6)', async () => {
    const stale = Object.assign(new Error('ALREADY_SCHEDULED'), {
      detail: { code: 'ALREADY_SCHEDULED', message: 'That task card is already on the schedule.' },
    });
    const run = await runAdd('addOne', [null, 's1', 'c1'], seed, stale);
    expect(run.reloads, 'the refused row stays listed and the next click refuses again').toBe(1);
    // the banner is written AFTER the reload, so the reload cannot wipe it
    expect(run.state.banner).toBe('That task card is already on the schedule.');
    expect(queries(run).s1, 'a refusal consumed the query').toBe('illustrate');
  });

  it("returns focus to that sprint's field after the reload — the clicked Add is gone with its row (B2-R7)", async () => {
    const run = await runAdd('addOne', [null, 's1', 'c1'], seed);
    expect(run.refocus).toEqual(['s1']);
    const failed = await runAdd('addOne', [null, 's1', 'c1'], seed, new Error('Failed to fetch'));
    expect(failed.refocus, 'a failed add moved focus — nothing left the page').toEqual([]);
  });
});

describe('Add All — ONE request carrying the listed set, in list order (B3/B4)', () => {
  const seed = { addQ: { s1: 'illustrate', s2: 'loft' }, addPanels: PANELS };

  it("POSTs the PANEL'S OWN ids to the batch route, in the order on screen", async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, { ok: true, added: 2, skipped: [] });
    expect(run.api, 'Add All fanned out into one request per card').toHaveLength(1);
    expect(run.api[0]!.method).toBe('POST');
    expect(run.api[0]!.path).toBe('/api/projects/p1/sprint-items/batch');
    expect(run.api[0]!.body).toEqual({ sprint_id: 's1', card_ids: ['c1', 'c3'] });
    expect(run.api[0]!.body, 'the batch carries a start — its rows land UNPLOTTED (B5)').not.toHaveProperty('starts_on');
    expect(run.reloads).toBe(1);
  });

  it("sends the OPEN sprint's ids only — never another sprint's panel", async () => {
    const run = await runAdd('addAll', [null, 's2'], seed, { ok: true, added: 1, skipped: [] });
    expect(run.api[0]!.body).toEqual({ sprint_id: 's2', card_ids: ['c9'] });
  });

  it("clears that sprint's query when something landed — the set was consumed (B4)", async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, { ok: true, added: 2, skipped: [] });
    expect(queries(run).s1).toBe('');
    expect(queries(run).s2, "another sprint's query was cleared too").toBe('loft');
  });

  it('KEEPS the query when nothing landed — an untouched set must stay on screen (B4)', async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, {
      ok: true,
      added: 0,
      skipped: [{ card_id: 'c1', code: 'ALREADY_SCHEDULED' }, { card_id: 'c3', code: 'CARD_COMPLETE' }],
    });
    expect(queries(run).s1).toBe('illustrate');
  });

  it('banners a PARTIAL result and stays silent when everything landed (B3)', async () => {
    const partial = await runAdd('addAll', [null, 's1'], seed, {
      ok: true, added: 1, skipped: [{ card_id: 'c3', code: 'ALREADY_SCHEDULED' }],
    });
    expect(partial.banners.length, 'a partial add said nothing — a card goes missing silently').toBe(1);
    expect(partial.reloads).toBe(1);
    expect(partial.state.banner, 'the reload wiped the summary — the user never reads it (B2-R1)').toBe(partial.banners[0]);
    const clean = await runAdd('addAll', [null, 's1'], seed, { ok: true, added: 2, skipped: [] });
    expect(clean.banners, 'a clean add interrupted with a banner — no confirmation, no count-check (Miles)').toEqual([]);
  });

  it('clears only the query it SENT — text typed during the flight survives (B2-R4)', async () => {
    const typedMeanwhile = (run: AddRun) => {
      (run.state.addQ as Record<string, string>).s1 = 'illustrate corey';
      return { ok: true, added: 2, skipped: [] };
    };
    const run = await runAdd('addAll', [null, 's1'], seed, typedMeanwhile);
    expect(run.api).toHaveLength(1);
    expect(queries(run).s1, 'the clear wiped what the user typed while the batch was in the air').toBe('illustrate corey');
  });

  it("returns focus to the field after the reload — Add All left with the emptied panel (B2-R7)", async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, { ok: true, added: 2, skipped: [] });
    expect(run.refocus).toEqual(['s1']);
  });

  it('writes nothing for an empty panel, and nothing while any sprint is busy', async () => {
    const empty = await runAdd('addAll', [null, 's1'], { addQ: { s1: 'zzz' }, addPanels: { s1: { items: [] } } });
    expect(empty.api).toHaveLength(0);
    const busy = await runAdd('addAll', [null, 's1'], { ...seed, addBusy: 's1' });
    expect(busy.api).toHaveLength(0);
    const elsewhere = await runAdd('addAll', [null, 's1'], { ...seed, addBusy: 's2' });
    expect(elsewhere.api, 'two adds in the air at once — one act per screen (B10)').toHaveLength(0);
  });

  it('releases the lock, banners, and keeps the query when the batch itself fails', async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, new Error('SPRINT_NOT_FOUND'));
    expect(run.banners).toEqual(['SPRINT_NOT_FOUND']);
    expect(run.state.addBusy).toBeFalsy();
    expect(queries(run).s1, 'a failed batch consumed the query anyway').toBe('illustrate');
  });
});

describe("addKey — Escape clears that sprint's query, every other key falls through (B6)", () => {
  const press = async (key: string, seed: Record<string, unknown>) => {
    let prevented = 0;
    const ctx = { event: { key, preventDefault: () => { prevented += 1; }, stopPropagation: () => {} } };
    return { run: await runAdd('addKey', [ctx, 's1'], seed), prevented: () => prevented };
  };

  it('clears the query on Escape, and takes the key so nothing else answers it', async () => {
    const { run, prevented } = await press('Escape', { addQ: { s1: 'illustrate', s2: 'loft' } });
    expect(queries(run).s1).toBe('');
    expect(queries(run).s2, "Escape cleared another sprint's field").toBe('loft');
    expect(prevented()).toBe(1);
  });

  it('leaves Enter INERT — Enter-as-Add-All is a suggestion to Miles, not built (B6)', async () => {
    const { run, prevented } = await press('Enter', { addQ: { s1: 'illustrate' }, addPanels: PANELS });
    expect(queries(run).s1).toBe('illustrate');
    expect(run.api, 'Enter added the listed set — no such ruling exists').toHaveLength(0);
    expect(prevented(), 'Enter was swallowed — whatever default the field owns dies with it').toBe(0);
  });

  it('leaves an ordinary keystroke alone — the field is two-way bound, not handler-driven', async () => {
    const { run, prevented } = await press('a', { addQ: { s1: 'illustrate' } });
    expect(queries(run).s1).toBe('illustrate');
    expect(prevented()).toBe(0);
  });
});

/* ---------------------------------------------------------------------- *
 * The dress: heights that cannot reflow, two blue TOKENS, one hover rise.
 * ---------------------------------------------------------------------- */

describe('the search row and its results in CSS (833:68629 / 840:31597 / 841:33668)', () => {
  it("pins both row heights as HEIGHTS — only the field's right edge may move (B7)", () => {
    for (const [cls, px] of [['gsearch', '77px'], ['gresult', '54px']] as const) {
      const rules = rulesFor(cls);
      expect(rules.length, `no CSS rule names \`.${cls}\``).toBeGreaterThan(0);
      expect(
        rules.some((r) => new RegExp(`(^|;)\\s*height:\\s*${px}`).test(r.body)),
        `.${cls} lost its fixed ${px} height`,
      ).toBe(true);
      expect(
        rules.every((r) => !r.body.includes('min-height')),
        `.${cls} uses a min-height — the row can grow, and the first keystroke reflows the sprint`,
      ).toBe(true);
    }
  });

  it('never fakes the second blue with opacity — two TOKENS, never one colour dimmed (B8, Miles)', () => {
    const linkRules = CSS_RULES.filter((r) => /\.galink|\.gaddone|\.gaddall/.test(r.selector));
    expect(linkRules.length, 'no add-link rules at all — this sweep would be vacuous').toBeGreaterThan(0);
    expect(linkRules.filter((r) => /(^|[^-\w])opacity\s*:/.test(r.body)).map((r) => r.selector)).toEqual([]);
  });

  it('rests the per-row Add on the blue-300 TOKEN (840:31661)', () => {
    const rest = rulesFor('gaddone').filter((r) => !r.selector.includes(':'));
    expect(rest.some((r) => /color:\s*var\(--blue-300\)/.test(r.body)), 'the resting Add is not the blue-300 token').toBe(true);
  });

  it("raises the link AND the label together, on the ROW's hover and focus (840:31670/31671)", () => {
    const risen = CSS_RULES.filter((r) => /\.gresult:(hover|focus-within)/.test(r.selector));
    expect(risen.length, 'no row-hover rules at all — the rise is not built').toBeGreaterThan(0);
    const link = risen.filter((r) => /\.gaddone/.test(r.selector));
    const label = risen.filter((r) => /\.glabel/.test(r.selector));
    expect(link.some((r) => /var\(--blue-600\)/.test(r.body)), 'the Add does not rise to blue-600 on row hover').toBe(true);
    expect(label.some((r) => /font-weight:\s*600/.test(r.body)), 'the label does not thicken with it — the two move together').toBe(true);
    // the keyboard gets the same rise: a focus-within clause on each half
    expect(link.some((r) => r.selector.includes(':focus-within')), 'the Add rises for a pointer only').toBe(true);
    expect(label.some((r) => r.selector.includes(':focus-within')), 'the label thickens for a pointer only').toBe(true);
  });

  it('greys a dead Add All to slate-400 — never a pale blue (841:33668)', () => {
    const dis = rulesFor('gaddall').filter((r) => r.selector.includes('[disabled]'));
    expect(dis.length, 'no disabled Add All rule').toBeGreaterThan(0);
    expect(dis.some((r) => /color:\s*var\(--slate-400\)/.test(r.body))).toBe(true);
  });

  it('turns the live grammar OFF on a busy row — grey link, no rise, and it wins by ORDER (surface-1 / B2-R3)', () => {
    const busyLink = CSS_RULES.filter((r) => /\.gresult\.busy .*\.galink/.test(r.selector));
    const busyLabel = CSS_RULES.filter((r) => /\.gresult\.busy .*\.glabel/.test(r.selector));
    expect(busyLink.some((r) => /color:\s*var\(--slate-400\)/.test(r.body) && /cursor:\s*default/.test(r.body)), 'a busy Add still reads live').toBe(true);
    expect(busyLabel.some((r) => /font-weight:\s*400/.test(r.body)), 'a busy row still thickens its label on hover').toBe(true);
    // same specificity as the rise, so the sheet ORDER is what decides — the busy rules must come later
    const at = (re: RegExp) => CSS.search(re);
    expect(at(/\.gresult\.busy \.galink/)).toBeGreaterThan(at(/\.gresult:hover \.gaddone/));
    expect(at(/\.gresult\.busy \.glabel/)).toBeGreaterThan(at(/\.gresult:hover \.glabel/));
  });

  it("draws the seam above the footer ONCE — the row above owns it (surface-2)", () => {
    const seam = CSS_RULES.filter((r) => /\.gblock \+ \.gfoot/.test(r.selector));
    expect(seam.some((r) => /border-top:\s*none/.test(r.body)), 'the footer doubles the rule of the row above it').toBe(true);
  });

  it("yields the sixteenth pixel below the field to the row's own rule — 16 + 45 + 15 + 1 = 77 (surface-5)", () => {
    const pane = rulesFor('gsearchpane');
    expect(pane.some((r) => /padding:\s*var\(--space-16\) var\(--space-24\) 15px var\(--space-16\)/.test(r.body)), 'the search pane pads 16 below and the field overflows the border-box').toBe(true);
  });

  it('keeps the placement circle — the + outlived the add zone it shared a recipe with', () => {
    expect(
      rulesFor('gplus').some((r) => /var\(--indigo-500\)/.test(r.body)),
      'the placement + lost its circle with the add zone',
    ).toBe(true);
  });
});

/* ---------------------------------------------------------------------- *
 * WITHDRAWAL — the 08-28 add flow, whole (owl #77 §0).
 * ---------------------------------------------------------------------- */

describe('the 08-28 add flow is withdrawn whole — zone, pending row, dropdowns, one-act commit', () => {
  it('is out of the shipped scripts', () => {
    for (const gone of [
      'addRow', 'addMenu', 'addMenuFlip', 'addMcOptions', 'addCardOptions',
      'openAddRow', 'cancelAddRow', 'openAddMenu', 'pickAddMc', 'pickAddCard',
      'addZoneKey', 'submitAddItem', 'draftPlace', "plotRow === 'add'",
    ]) {
      expect(APP_JS_CODE, `\`${gone}\` survives in the shipped scripts`).not.toContain(gone);
    }
  });

  it('is out of the schedules view', () => {
    // Ractive comments stripped first (rule 3's kinder corpus): the template
    // may legitimately explain what replaced the retired block
    const view = schedulesView().replace(/\{\{!\s[\s\S]*?\}\}/g, ' ');
    for (const gone of [
      'gaddzone', 'gaddrule', 'gaddplus', 'gaddrow', 'gaddbtn', 'gdd',
      'openAddRow', 'addZoneKey', 'submitAddItem', 'draftPlace',
      'addMcOptions', 'addCardOptions', 'Add Item',
    ]) {
      expect(view, `\`${gone}\` survives in the schedules view`).not.toContain(gone);
    }
  });

  it('is out of the stylesheet', () => {
    for (const gone of ['.gaddzone', '.gaddrule', '.gaddplus', '.gaddrow', '.gaddbtn', '.gdd']) {
      expect(CSS, `\`${gone}\` outlived the flow it dressed`).not.toContain(gone);
    }
  });

  it('left the overlay law with it — no addMenu key, no .gdd shield, no anchored entry', () => {
    const keys = new Function(`${topDecl('OVERLAY_KEYS')} return OVERLAY_KEYS;`)() as string[];
    expect(keys.length, 'no overlay keys at all — the assertion below would be vacuous').toBeGreaterThan(0);
    expect(keys, 'addMenu is still an overlay — the dropdown it shielded is gone').not.toContain('addMenu');
    const anchored = new Function(`${topDecl('OVERLAY_ANCHORED')} return OVERLAY_ANCHORED;`)() as string[];
    expect(anchored).not.toContain('addMenu');
    expect(topDecl('OVERLAY_SHIELDS'), 'the .gdd shield outlived its dropdown').not.toContain('.gdd');
    expect(topDecl('OVERLAY_SELF_SCROLL'), 'the .gddmenu self-scroll entry outlived its menu').not.toContain('.gddmenu');
  });
});

/* ====================================================================== *
 * SUITE 5 — the bar: `itemBar` EXECUTED from the shipped file.
 * The MIN_GRAB and anchor-identity arithmetic ported from
 * test/gantt-run-geometry.test.ts (retired 2026-08-28) lives here now.
 * ====================================================================== */

interface Bar {
  left: string;
  width: string;
  cls: string;
  title: string;
}
interface GeoHarness {
  itemBar(row: Partial<SprintScheduleRow>): Bar[];
  itemPhase(row: { taskPrefix?: string | null }): string;
  dayIndex(iso: string): number;
  unitPct(u: number): string;
  TOTAL_UNITS: number;
  WEEK_PX: number;
  MIN_GRAB_PX: number;
  UNIT_PX: number;
  MIN_GRAB_UNITS: number;
}

/**
 * Declaration order matters for the consts; `dayIndex` hoists. `dayIndex`
 * reads the window origin off the app instance and NOTHING else does, so the
 * one-key stand-in is the whole surface the shipped bodies need. Window:
 * 2026-08-03 (a Monday) through 12 columns × 5 workdays = 60 units.
 *
 * Sliced LAZILY (the drag-hittest weekAtX precedent): `topDecl` throws when a
 * declaration is absent, and a throw at module scope would take the WHOLE
 * file down — render suites included — while the scripts land.
 */
let geo: GeoHarness | undefined;
const G = (): GeoHarness => {
  if (!geo) {
    const src = ['WEEK_COUNT', 'WEEK_PX', 'WORKDAYS_PER_WEEK', 'TOTAL_UNITS', 'dayIndex', 'clampUnits', 'pctOf', 'unitPct', 'MIN_GRAB_PX', 'UNIT_PX', 'MIN_GRAB_UNITS', 'itemBar', 'itemPhase']
      .map((n) => topDecl(n))
      .join('\n');
    geo = new Function(`
      const app = { get: (k) => { if (k !== 'weekStart') throw new Error('geometry harness: unstubbed app.get(' + k + ')'); return '2026-08-03'; } };
      ${src}
      return { itemBar, itemPhase, dayIndex, unitPct, TOTAL_UNITS, WEEK_PX, MIN_GRAB_PX, UNIT_PX, MIN_GRAB_UNITS };
    `)() as GeoHarness;
  }
  return geo;
};

/** ISO date of workday unit `u` (ported), so a sweep can address every column. */
function isoAtUnit(u: number): string {
  const days = Math.floor(u / 5) * 7 + (u % 5);
  return new Date(Date.UTC(2026, 7, 3) + days * 864e5).toISOString().slice(0, 10);
}

const bar = (startsOn: string | null, finish: string | null, rest: Partial<SprintScheduleRow> = {}): Bar[] =>
  G().itemBar({ startsOn, finish, taskPrefix: 'Render Asset', ...rest });

describe('itemBar is the shipped recipe, on the shipped axis', () => {
  it('slices itemBar as a column-0 const — what makes executing it possible at all', () => {
    expect(APP_JS).toMatch(/\nconst itemBar = /);
    expect(typeof G().itemBar).toBe('function');
  });

  it('keeps the axis: 12 columns × 5 workdays = 60 units, ONE rounding rule', () => {
    expect(G().TOTAL_UNITS).toBe(60);
    expect(APP_JS).toMatch(/const unitPct = \(u\) => pctOf\(u, TOTAL_UNITS\);/);
  });

  it('lands the fixture dates on the units the assertions below assume', () => {
    expect(G().dayIndex('2026-08-03')).toBe(0);
    expect(G().dayIndex('2026-08-17')).toBe(10);
    expect(G().dayIndex('2026-08-21')).toBe(14);
    expect(G().dayIndex('2026-08-19')).toBe(12);
    expect(G().dayIndex('2026-10-23')).toBe(59); // the last workday drawn
    for (let u = 0; u <= 59; u++) expect(G().dayIndex(isoAtUnit(u))).toBe(u);
  });
});

describe('one row, one bar — start to finish, finish day INCLUSIVE', () => {
  it('covers the finish day: Mon→Fri is FIVE units wide, not four', () => {
    const [b] = bar('2026-08-17', '2026-08-21');
    expect(b!.left).toBe(G().unitPct(10));
    expect(b!.width).toBe(G().unitPct(5)); // dayIndex(finish) + 1
  });

  it('titles the bar with its own two dates, and says so when it runs late', () => {
    expect(bar('2026-08-17', '2026-08-21')[0]!.title).toBe('2026-08-17 → 2026-08-21');
    expect(bar('2026-08-17', '2026-08-21', { late: true })[0]!.title)
      .toBe('2026-08-17 → 2026-08-21 · past the client deadline');
  });

  it('hands the template finished 2dp strings — no arithmetic in the markup', () => {
    const [b] = bar('2026-08-17', '2026-08-21');
    const twoDp = /^\d+\.\d{2}$/;
    expect(b!.left).toMatch(twoDp);
    expect(b!.width).toMatch(twoDp);
    // and the template multiplies nothing (the run-geometry law, re-pointed)
    const tag = /<div class="gitem[^>]*>/.exec(schedulesView());
    expect(tag, 'no .gitem in the schedules view').not.toBeNull();
    const style = /style="([^"]*)"/.exec(tag![0])?.[1] ?? '';
    expect(style).toMatch(/^left:\{\{b\.left\}\}%;width:\{\{b\.width\}\}%;?$/);
  });

  it('returns [] for unplotted, unforecastable, and fully-clipped rows — no branch in the template', () => {
    expect(bar(null, null)).toEqual([]);
    expect(bar('2026-08-17', null)).toEqual([]); // no difficulty → no finish
    expect(bar(null, '2026-08-21')).toEqual([]);
    expect(bar('2026-07-13', '2026-07-17')).toEqual([]); // wholly before the window
    expect(bar('2026-11-09', '2026-11-13')).toEqual([]); // wholly after it
  });

  it('clips to the window at both edges', () => {
    const [left] = bar('2026-07-27', '2026-08-07'); // starts before the window
    expect(left!.left).toBe('0.00');
    const [right] = bar('2026-10-19', '2026-11-02'); // finishes after it
    expect(Number(right!.left) + Number(right!.width)).toBeCloseTo(100, 2);
  });
});

describe('the 24px minimum grab, ported intact (JP 2026-08-18 ruling 2)', () => {
  it('states the minimum in the units the box is measured in', () => {
    expect(G().MIN_GRAB_PX).toBe(24);
    expect(G().WEEK_PX).toBe(92);
    expect(G().UNIT_PX).toBe(92 / 5); // 18.4 — one workday column, mirroring --gw
    expect(G().MIN_GRAB_UNITS).toBe(24 / (92 / 5));
    expect(Number(G().unitPct(G().MIN_GRAB_UNITS))).toBe(2.17);
  });

  it('widens a one-day bar RIGHT: the box grows, its left edge does not move', () => {
    const [b] = bar('2026-08-19', '2026-08-19'); // unit 12, one day
    expect(Number(b!.width)).toBeGreaterThanOrEqual(2.17);
    expect(Number(G().unitPct(1))).toBeLessThan(2.17); // the day itself is 1.67%
    expect(b!.left).toBe(G().unitPct(12)); // anchored — the identity
  });

  it('leaves a bar already wider than the minimum exactly alone', () => {
    const [b] = bar('2026-09-07', '2026-09-18'); // units 25 → 34+1
    expect(b!.left).toBe(G().unitPct(25));
    expect(b!.width).toBe(G().unitPct(10));
  });

  it('slides LEFT in the final column rather than hanging off the track — one expression, no branch', () => {
    const [b] = bar('2026-10-23', '2026-10-23'); // unit 59, the last drawn
    expect(Number(b!.left) + Number(b!.width)).toBeCloseTo(100, 2);
    expect(Number(b!.left)).toBeLessThan(Number(G().unitPct(59)));
  });

  it('sweeps EVERY one-day bar in the window: anchored everywhere, clipped only at the end', () => {
    for (let u = 0; u < 60; u++) {
      const [b] = bar(isoAtUnit(u), isoAtUnit(u));
      expect(b, `unit ${u} drew no bar`).toBeDefined();
      const L = Number(b!.left);
      const W = Number(b!.width);
      expect(L, `unit ${u} left`).toBeGreaterThanOrEqual(0);
      expect(L + W, `unit ${u} right edge`).toBeLessThanOrEqual(100.02);
      if (u + G().MIN_GRAB_UNITS <= 60) {
        expect(b!.left, `unit ${u} moved off its anchor`).toBe(G().unitPct(u));
      }
    }
  });
});

describe('itemPhase — colour only, never data (the lane-by-title lesson)', () => {
  it('maps the two known prefixes and dresses everything else neutral', () => {
    expect(G().itemPhase({ taskPrefix: 'Sketch Asset' })).toBe('sketch');
    expect(G().itemPhase({ taskPrefix: 'Render Asset' })).toBe('render');
    expect(G().itemPhase({ taskPrefix: 'sketch thing' })).toBe('sketch'); // case-blind
    expect(G().itemPhase({ taskPrefix: 'Icon Clean Up' })).toBe('work');
    expect(G().itemPhase({ taskPrefix: null })).toBe('work');
    expect(G().itemPhase({})).toBe('work');
  });

  it('feeds the bar class, and the late tint rides the ROW flag on top', () => {
    expect(bar('2026-08-17', '2026-08-21')[0]!.cls).toBe('render');
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(OFF_BOARD),
      itemBar: () => [{ left: '0.00', width: '10.00', cls: 'work', title: 't' }],
    });
    expect(html).toMatch(/class="gitem work late"/);
    // late overrides the phase fill to red — the rule, not a snapshot
    expect(GANTT_CSS).toMatch(/\.gitem[^{]*\.late[^{]*\{[^}]*var\(--red-600\)/);
  });
});

describe('the deadline tick — dress per 731:98733; a PAST deadline pins LEFT (JP 2026-08-28)', () => {
  it('renders through deadlineTick at the position it names', () => {
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED),
      deadlineTick: () => '41.67',
    });
    expect(html).toMatch(/class="gdl"[^>]*style="left:41\.67%/);
  });

  it('is 1px of red-500 now — was 2px slate-400; the legend swatch follows automatically', () => {
    expect(GANTT_CSS).toMatch(/\.gdl[^,{]*\{[^}]*width: 1px/);
    expect(GANTT_CSS).toMatch(/\.gdl[^,{]*\{[^}]*var\(--red-500\)/);
  });

  /** The shipped recipe, EXECUTED (rule 2) — the same stand-in app as `G()`. */
  const tick = (): ((row: { deadline?: string | null }) => string | null) =>
    new Function(`
      const app = { get: (k) => { if (k !== 'weekStart') throw new Error('tick harness: unstubbed app.get(' + k + ')'); return '2026-08-03'; } };
      ${['WEEK_COUNT', 'WORKDAYS_PER_WEEK', 'TOTAL_UNITS', 'dayIndex', 'pctOf', 'unitPct'].map((n) => topDecl(n)).join('\n')}
      return (${appSetArg('deadlineTick')});
    `)() as (row: { deadline?: string | null }) => string | null;

  it('pins a PAST deadline to the window LEFT EDGE instead of vanishing — the F1 fix', () => {
    // every real row's deadline predates the window; a late row must always
    // show its rule LEFT of the bar (bar-right-of-tick is the late signal)
    expect(tick()({ deadline: '2026-07-20' })).toBe('0.00');
  });

  it('keeps an in-window deadline on its own workday, and the RIGHT-edge clip', () => {
    const t = tick();
    expect(t({ deadline: '2026-08-17' })).toBe(G().unitPct(10));
    expect(t({ deadline: '2026-11-09' })).toBeNull(); // a beyond-window FUTURE tick signals nothing
    expect(t({ deadline: null })).toBeNull();
    expect(t({})).toBeNull();
  });

  it('carries the frozen left-pin, and the old before-window clip is gone (source)', () => {
    const tickSrc = appSetArg('deadlineTick');
    expect(tickSrc).toContain('Math.max(0, dayIndex(row.deadline))');
    expect(tickSrc, 'the u >= 0 clip regressed — a late row loses its rule (F1 ruling, 2026-08-28)')
      .not.toContain('u >= 0');
  });
});

/* ====================================================================== *
 * SUITE 6 — the capacity footer: overlap counts, executed from 70-measure
 * ====================================================================== */

interface FootHarness {
  set(rows: Array<Partial<SprintScheduleRow>>, weekly: number): void;
  text(weekKey: string): string;
  cls(weekKey: string): string;
}

let foot: FootHarness | undefined;
const F = (): FootHarness =>
  (foot ??= new Function(`
    ${topDecl('isoOf')}
    ${topDecl('isoAddDays')}
    ${topDecl('sprintWeekLoad')}
    const DATA = { sprintItems: { rows: [] }, capacity: { weekly: 8 } };
    const app = {
      get: (k) => { if (!(k in DATA)) throw new Error('foot harness: unstubbed app.get(' + k + ')'); return DATA[k]; },
    };
    const text = (${appSetArg('sprintFootText')});
    const cls = (${appSetArg('sprintFootCls')});
    return {
      set: (rows, weekly) => { DATA.sprintItems = { rows }; DATA.capacity = { weekly }; },
      text, cls,
    };
  `)() as FootHarness);

describe('the footer counts every week a bar TOUCHES — workday-window overlap', () => {
  const WK = '2026-08-10'; // Monday; its Friday is 2026-08-14
  const row = (startsOn: string | null, finish: string | null) => ({ startsOn, finish });

  it('counts a bar spanning the week, and one that merely clips either end', () => {
    F().set([row('2026-08-03', '2026-08-21')], 8); // spans it whole
    expect(F().text(WK)).toBe('1');
    F().set([row('2026-08-14', '2026-08-21')], 8); // STARTS on the Friday
    expect(F().text(WK)).toBe('1');
    F().set([row('2026-08-03', '2026-08-10')], 8); // FINISHES on the Monday
    expect(F().text(WK)).toBe('1');
  });

  it('does not count a bar that misses the window on either side, or an unplotted row', () => {
    F().set([row('2026-08-17', '2026-08-21')], 8); // starts the Monday after
    expect(F().text(WK)).toBe('—');
    F().set([row('2026-08-03', '2026-08-07')], 8); // finishes the Friday before
    expect(F().text(WK)).toBe('—');
    F().set([row(null, null), row('2026-08-10', null)], 8); // unplotted / unforecastable
    expect(F().text(WK)).toBe('—');
  });

  it('a two-week bar weighs on BOTH weeks — the flagged default, asserted', () => {
    F().set([row('2026-08-05', '2026-08-12')], 8);
    expect(F().text('2026-08-03')).toBe('1');
    expect(F().text('2026-08-10')).toBe('1');
  });

  it('classes: over above capacity, empty at zero, nothing in between', () => {
    const rows = Array.from({ length: 3 }, () => row('2026-08-10', '2026-08-12'));
    F().set(rows, 2);
    expect(F().cls(WK)).toBe('over');
    F().set(rows, 3);
    expect(F().cls(WK)).toBe('');
    F().set([], 3);
    expect(F().cls(WK)).toBe('empty');
    expect(F().text(WK)).toBe('—'); // em-dash at zero, never a 0
  });
});

describe('the footer caption — the committed capacity through the one band recipe', () => {
  it('prints Capacity: N with the band the slider itself would name', () => {
    const h = H();
    h.set('capacity', { weekly: 8, least: 6, typical: 8, most: 10 });
    expect(h.caption()).toBe('Capacity: 8 (typical)');
    // no references → capacityBand hides the band rather than inventing one
    h.set('capacity', { weekly: 8 });
    expect(h.caption()).toBe('Capacity: 8');
  });

  it('renders the label and per-week cells through the two shipped helpers', () => {
    const html = renderSprintSchedule({
      sprintFootText: (k) => `N(${k})`,
      sprintFootCls: () => 'over',
    });
    expect(html).toMatch(/WORK CARDS \/ WEEK/i);
    expect(html).toContain('N(2026-08-03)');
    expect(html).toContain('N(2026-08-10)');
    expect(html).toMatch(/class="[^"]*\bover\b/);
  });
});

/* ====================================================================== *
 * SUITE 7 — WITHDRAWN with the drag (owl #72). Source sweeps: the view
 * slice, the script bundle (comment-stripped — rule 3's kinder corpus),
 * and the stylesheet.
 * ====================================================================== */

describe('the schedules view carries no drag, no drop, no ghost, no Suggest', () => {
  it('has no draggable and no drag/drop directives anywhere in the subtree', () => {
    const view = schedulesView();
    expect(view).not.toMatch(/\bdraggable=/);
    expect(view).not.toMatch(/on-drag/);
    expect(view).not.toMatch(/on-drop/);
  });

  it('dropped the drag-era chrome: grip, ghost, unsched hint, gdragging, run box', () => {
    const view = schedulesView();
    for (const gone of ['ghandle', 'gghost', 'gunsched', 'gdragging', 'grun', 'gbar', 'ghostBar']) {
      expect(view, `\`${gone}\` survives in the schedules view`).not.toContain(gone);
    }
  });

  it('dropped the Suggest branch and both conflict banners', () => {
    const view = schedulesView();
    for (const gone of ['runSuggest', 'acceptSuggest', 'clearSuggest', 'sgbar', 'suggestOffWeeks', 'unavoidable']) {
      expect(view, `\`${gone}\` survives in the schedules view`).not.toContain(gone);
    }
  });

  it('teaches the CLICK, not the drag — the standing hint is the placement sentence', () => {
    expect(schedulesView()).toContain(
      'Hover a week on an unplotted row and click to place its bar — the finish is computed.',
    );
  });

  it('the retired handlers, computeds and state keys are out of the shipped bundle', () => {
    for (const gone of [
      'dragRow', 'dragEnd', 'dropOnWeek', 'dropOnBar', 'dragOverBlock', 'dropBlock',
      'moveRows', 'rowKey', 'togglePin', 'duplicateRow', 'unslotRow', 'editNote',
      'runSuggest', 'clearSuggest', 'acceptSuggest', 'suggestProposed', 'suggestFlagged',
      'suggestHardHeavy', 'suggestBlockedWhy', 'suggestOffWeeks', 'schedRows',
      'plannerGroups', 'phaseRun', 'ghostBar', 'perWeekLocal', "'arrived'",
    ]) {
      expect(APP_JS_CODE, `\`${gone}\` survives in the shipped scripts`).not.toContain(gone);
    }
    // `selected` is NOT swept by name: the token is too common to grep for —
    // its removal is proven by the checkbox suite reading `sprintSel` instead.
  });

  it('the stylesheet dropped the drag-era rules — including the review colours', () => {
    // comments stripped first (rule 3): the sheet may legitimately NAME a
    // retired rule while explaining what replaced it
    const css = GANTT_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const gone of ['.gseg.review', '.gseg.renderOverdue', '.grun', '.gbar', '.gghost', '.gunsched', '.gdragging', '.ghandle']) {
      expect(css, `\`${gone}\` survives in 35-gantt.css`).not.toContain(gone);
    }
  });
});
