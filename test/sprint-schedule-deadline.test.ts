/**
 * SUITE 2b (the DEADLINE cell — write registry entry W2) and SUITE 3
 * (placement), split out of test/sprint-schedule-render.test.ts on 2026-09-05
 * (PLAN.md §C). The shared prelude lives in
 * test/helpers/sprint-schedule-tab.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS_CODE,
  GANTT_CSS,
  TEMPLATE,
  OFF_BOARD,
  PLOTTED,
  UNPLOTTED,
  handlerBody,
  fnBody,
  divFragment,
  cssRule,
  renderSprintSchedule,
  topDecl,
} from './helpers/gantt-render.ts';
import { groupsOf, schedulesView } from './helpers/sprint-schedule-tab.ts';

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

/**
 * The AFFORDANCE GUARD, executed out of the shipped file (rule 2) — never a
 * retyped copy of its three clauses. `placeable` reads one key off the app
 * instance (`sprints`), so a one-key stand-in is the whole surface it needs.
 */
interface PlaceHarness {
  setSprints(list: Array<{ id: string; start: string | null; end: string | null }>): void;
  placeable(row: unknown, day: string | null): boolean;
}
let place: PlaceHarness | undefined;
const P = (): PlaceHarness => {
  if (!place) {
    place = new Function(`
      const SPRINTS = { v: [] };
      const app = { get: (k) => { if (k !== 'sprints') throw new Error('placeable harness: unstubbed app.get(' + k + ')'); return SPRINTS.v; } };
      ${topDecl('placeable')}
      return { setSprints: (list) => { SPRINTS.v = list; }, placeable };
    `)() as PlaceHarness;
  }
  return place;
};

/** Sprint A runs Mon 10 Aug — Fri 21 Aug 2026, both ends inclusive. */
const SPRINT_A = { id: 's1', start: '2026-08-10', end: '2026-08-21' };
const inSprint = (deadline: string | null) => ({ sprintId: 's1', deadline });

describe('placeable — the affordance guard, and the three rules it holds (JP 2026-09-08)', () => {
  it('takes a day INSIDE the sprint, both boundary days included', () => {
    P().setSprints([SPRINT_A]);
    expect(P().placeable(inSprint(null), '2026-08-10')).toBe(true); // the first day
    expect(P().placeable(inSprint(null), '2026-08-14')).toBe(true); // the middle
    expect(P().placeable(inSprint(null), '2026-08-21')).toBe(true); // the last day
  });

  it('refuses a day BEFORE the sprint starts and one AFTER it ends', () => {
    P().setSprints([SPRINT_A]);
    expect(P().placeable(inSprint(null), '2026-08-07')).toBe(false); // the Friday before
    expect(P().placeable(inSprint(null), '2026-08-24')).toBe(false); // the Monday after
  });

  it('takes the DEADLINE DAY itself and refuses the day after it', () => {
    // §5.1 keeps a late FINISH legal and red; what JP refused is a START
    // after the date the card was promised for — so the deadline day is in
    P().setSprints([SPRINT_A]);
    expect(P().placeable(inSprint('2026-08-18'), '2026-08-18')).toBe(true);
    expect(P().placeable(inSprint('2026-08-18'), '2026-08-19')).toBe(false);
    expect(P().placeable(inSprint('2026-08-18'), '2026-08-17')).toBe(true);
  });

  it('lets a row with NO deadline have the whole sprint (BR-9: no deadline, no lateness)', () => {
    P().setSprints([SPRINT_A]);
    for (const day of ['2026-08-10', '2026-08-13', '2026-08-21']) {
      expect(P().placeable(inSprint(null), day), day).toBe(true);
    }
    expect(P().placeable({ sprintId: 's1' }, '2026-08-21')).toBe(true); // absent key, not null
  });

  it('refuses when there is nothing to measure against — no row, no day, no sprint, no dates', () => {
    P().setSprints([SPRINT_A]);
    expect(P().placeable(null, '2026-08-12')).toBe(false);
    expect(P().placeable(inSprint(null), null)).toBe(false);
    expect(P().placeable({ sprintId: 'gone', deadline: null }, '2026-08-12')).toBe(false);
    P().setSprints([{ id: 's1', start: null, end: null }]);
    expect(P().placeable(inSprint(null), '2026-08-12')).toBe(false);
  });

  it('names the row’s OWN sprint, not the first one on the board', () => {
    // the guard is per ROW; two sprints in the list must not blur into one range
    P().setSprints([SPRINT_A, { id: 's2', start: '2026-08-24', end: '2026-09-04' }]);
    expect(P().placeable({ sprintId: 's2', deadline: null }, '2026-08-12')).toBe(false);
    expect(P().placeable({ sprintId: 's2', deadline: null }, '2026-08-26')).toBe(true);
  });

  it('reads the calendar as STRINGS, so no Date and no timezone can shift a day', () => {
    // invariant 11: 'YYYY-MM-DD' compares chronologically as text; a `new
    // Date(iso)` here would land on the previous day west of UTC
    const src = topDecl('placeable');
    expect(src).not.toContain('new Date');
    expect(src).not.toContain('getTime');
  });
});

/* ====================================================================== *
 * SUITE 3 — placement: the violet + rides HOVER on any UNPLOTTED row, on
 * the WORKDAY under the pointer (block 7; PLAN 2026-08-28 F2; Miles's note
 * on node 731:100277)
 * ====================================================================== */

describe('the violet + rides the hovered DAY of any unplotted row — the checkbox gates nothing', () => {
  /* `plotRow` cannot reach a render: the harness passes only the state the
     template owned before the hover pair, and directives never fire in
     `toHTML()` — so the POSITIVE (pointer on a track → + at its day) is
     E2E's real-pointer proof, per this file's honesty note. What a render
     CAN prove is the negative space: the retired `sprintSel` gate must not
     summon the + — under the pre-F2 template both of these drew it. */
  it('a selected, unplotted, hovered-day row shows NOTHING without plotRow', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED), sprintSel: 'i2', plotDay: '2026-08-12' });
    expect(html).not.toContain('gplus');
    expect(html).not.toContain('ghovcell');
  });

  it('a hovered day alone draws neither — plotRow names WHOSE track', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED, PLOTTED), plotDay: '2026-08-12' });
    expect(html).not.toContain('gplus');
    expect(html).not.toContain('ghovcell');
  });

  /** Both `.gtrack` subtrees of the view — the committed row's, then the draft's. */
  const trackBlocks = (): [string, string] => {
    const view = schedulesView();
    const first = divFragment('<div class="gtrack', view);
    const second = divFragment('<div class="gtrack', view.slice(view.indexOf(first) + first.length));
    return [first, second];
  };

  it('the committed track carries the FROZEN handler gate — hover on any unplotted row, DRAG on a placed one', () => {
    expect(schedulesView()).toContain(
      `{{#if !row.startsOn}}on-mousemove="['plotHover', row.id]" on-mouseleave="['plotLeave']" on-click="['plotPlace', row.id]"{{else}}on-mousemove="['barDragMove', row.id]"{{/if}}`,
    );
  });

  it('the + and the hover cell both gate on !row.startsOn && plotRow === row.id && plotDay — the frozen strings', () => {
    const [committed] = trackBlocks();
    /* !row.startsOn in the RENDER gate, not just the handler gate (review
       2026-08-28b, finding 1): a plotRow re-armed during the placement
       reload survives the row flipping to plotted — with its mouseleave
       gone. The render clause is what keeps that ghost invisible. */
    expect(committed).toContain(
      '{{#if !row.startsOn && plotRow === row.id && plotDay}}<div class="ghovcell" style="left:{{plusLeft(plotDay)}}%;" aria-hidden="true"></div>{{/if}}',
    );
    // the + repeats the SAME gate in its own section, and the TRACK wears it a
    // third time as the `placing` cursor — so the affordance, the tint and the
    // pointer cursor cannot disagree about whether this day is on offer
    expect(committed.split('{{#if !row.startsOn && plotRow === row.id && plotDay}}').length - 1).toBe(3);
    expect(committed).toContain('aria-label="Place the bar on {{fmtLongIso(plotDay)}}"');
  });

  it('names the day the way the rest of the app does — the shared long-date formatter, not a raw ISO string', () => {
    // `fmtLongIso` is the FORECASTED cell's formatter too (10-constants-core.js);
    // an aria-label reading "2026-08-12" would be the one place the app spells
    // a date to a screen reader in machine form
    const [committed] = trackBlocks();
    expect(committed, 'the + announced a raw ISO day').not.toContain('the bar on {{plotDay}}');
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(UNPLOTTED),
      plotDay: '2026-08-12',
      // the render harness stubs fmtLongIso as `long:<iso>`; what is proven
      // here is that the label goes THROUGH it, not what it renders
    });
    expect(html).not.toContain('gplus'); // still gated on plotRow — the negative space above
    expect(committed).toContain('fmtLongIso(plotDay)');
  });

  it('the retired sprintSel gate is GONE — the old strings, and the track blocks whole', () => {
    const view = schedulesView();
    expect(view, 'the pre-F2 handler gate regressed — checkbox-armed placement breaks the 731:100277 ruling')
      .not.toContain('sprintSel === row.id && !row.startsOn}}on-mousemove');
    expect(view, 'the pre-F2 + gate regressed').not.toContain('sprintSel === row.id && plotDay');
    for (const block of trackBlocks()) {
      expect(block, 'sprintSel reached into a track block — the checkbox gates nothing in placement').not.toContain('sprintSel');
    }
  });

  it('lets the TRACK take the click — the + itself is pointer-transparent (CSS)', () => {
    // the same reasoning the drag era swept: a solid circle over the track
    // would swallow the placement click at exactly the day the user aims at
    expect(GANTT_CSS).toMatch(/\.gplus[^{]*\{[^}]*pointer-events: none/);
  });

  it('the hover cell is a slate-50 ONE-DAY column, stacked by DOM order (node 731:100271)', () => {
    const rule = cssRule('.gantt .ghovcell');
    expect(rule).toContain('var(--slate-50)');
    // ONE unit, not one week: the tint has to sit under a + that names a day
    expect(rule).toContain('width: var(--gu)');
    expect(rule, 'the cell is still a whole week wide').not.toContain('width: var(--gw)');
    expect(rule).toMatch(/position: absolute; top: 0; bottom: 0;/);
    expect(rule).toContain('pointer-events: none'); // the TRACK owns the click, here too
    expect(rule, 'z-index would outstack the bars — DOM order is the seating here').not.toContain('z-index');
  });

  it('derives the day unit from the week column rather than shipping a second pixel number', () => {
    // --gu is what makes the tint, the + and the bar agree at any zoom
    expect(GANTT_CSS).toMatch(/\.gantt \{[^}]*--gu: calc\(var\(--gw\) \/ 5\)/);
    expect([...GANTT_CSS.matchAll(/--gu:/g)], '--gu is declared more than once').toHaveLength(1);
    /* and the + FITS the day column it names (review 2026-09-09, confirmed
       finding 3): a fixed 24px circle centred on an 18.4px column overhangs
       it by 2.8px each side, and at unit 0 that overhang lands under the
       opaque sticky left pane, which paints over it. The circle is the column
       now, so nothing hangs off either end of the track. */
    const plus = cssRule('.gantt .gplus');
    expect(plus).toContain('width: var(--gu)');
    expect(plus).toContain('height: var(--gu)');
    expect(plus, 'a fixed pixel size cannot fit a column derived from --gw').not.toMatch(/(width|height): \d+px/);
    expect(plus, 'a centring margin is what pushed the circle outside its column').not.toContain('margin-left');
  });

  it('shows a pointer cursor only where a day is actually on offer', () => {
    // the refusal has no chrome of its own — it is the ABSENCE of the offer
    // (no tint, no +, no pointer), which is what keeps the client from
    // advertising a write the server would answer 422 to
    expect(cssRule('.gantt .gtrack')).toContain('cursor: default');
    expect(cssRule('.gantt .gtrack.placing')).toContain('cursor: pointer');
    expect(schedulesView()).toContain('<div class="gtrack{{#if !row.startsOn && plotRow === row.id && plotDay}} placing{{/if}}"');
  });

  it('wires hover, leave and click on the track, row id and all (source)', () => {
    const view = schedulesView();
    expect(view).toContain(`on-mousemove="['plotHover', row.id]"`);
    expect(view).toContain(`on-mouseleave="['plotLeave']"`);
    expect(view).toContain(`on-click="['plotPlace', row.id]"`);
  });

  it('plotHover maps the pointer to a DAY and stores it only when the row may have it (source)', () => {
    const hover = handlerBody('plotHover');
    expect(hover).toContain('plotRow');
    expect(hover, 'the week mapper survived — placement is at day grain now').not.toContain('weekAtX');
    expect(hover).toContain('dayAtX'); // the pure mapper: rect in, workday ISO out
    // the guard rides in the STORE, so one key carries "no hover" and "no offer"
    expect(hover).toMatch(/placeable\(sprintRow\(rowId\), day\) \? day : null/);
    const leave = handlerBody('plotLeave');
    expect(leave).toContain('plotRow');
    expect(leave).toContain('plotDay');
  });

  it('plotPlace PATCHes the hovered DAY and reloads; a refused day never reaches the wire (source)', () => {
    const body = handlerBody('plotPlace');
    expect(body).toContain('starts_on: day');
    expect(body).toContain('/sprint-items/');
    expect(body).toContain('loadAll');
    // no plotDay = no mousemove, or a day this row may not have — either way
    // the click is a no-op, and the server stays the backstop for both
    expect(body).toContain("if (!day || app.get('plotRow') !== itemId || sprintItemSaving) return;");
    expect(body, 'a refusal must surface the SERVER’s own sentence').toContain('flashBanner(errText(err))');
  });

  it('a project switch clears the whole placement, drag and add state (source)', () => {
    const body = fnBody('resetForProjectSwitch');
    for (const key of ['sprintSel', 'plotRow', 'plotDay', 'dragRow', 'dragDay', 'dragLeft', 'dragGrab', 'addBusy']) {
      expect(body, `${key} survives a project switch`).toMatch(new RegExp(`${key}: null`));
    }
    // and the drag's window listeners come down with it — state cleared while
    // a mouseup listener still waits is a listener that fires into nothing
    expect(body).toContain('barDragStop();');
    /* the queries reset to an EMPTY MAP, not null (PLAN.md B10): `addQ` is
       one field per sprint and several may hold text, and the sprint ids it
       is keyed on are per-project — carried over, a query would name another
       project's sprint. */
    expect(body, 'the search queries survive a project switch').toMatch(/addQ: \{\s*\}/);
  });
});

/* Review 2026-08-28b: `plotRow`/`plotDay` are one GLOBAL pair under many
   tracks, and every defect the correctness pass confirmed was a way for that
   pair to outlive or outreach the hover that set it. These pins hold the four
   disciplines that close them. */
describe('the hover pair cannot strand, and a click places only its OWN hover (review 2026-08-28b)', () => {
  it('plotHover refuses to re-arm during a placement flight (finding 1)', () => {
    /* stated as the RULE (test/CLAUDE.md rule 1): the flight lock returns
       EARLY out of plotHover. What it is now joined by — the drag gate below
       — is that guard's business, not this one's. */
    expect(
      handlerBody('plotHover'),
      'a hover during the awaited reload re-arms plotRow on the row being placed — the fresh render strips its mouseleave and the ghost + never clears',
    ).toMatch(/if \(sprintItemSaving\b[^\n]*\) return;/);
  });

  /* The draft row's half of finding 7 retired with the pending row (owl #77
     §0); the committed row's half is the whole rule now — result rows land
     UNPLOTTED (PLAN.md B5), so nothing but a committed track ever places. */
  it('plotPlace demands the hover is ITS OWN before writing (finding 7)', () => {
    expect(handlerBody('plotPlace'), 'plotPlace would place this row at a day hovered on another track')
      .toContain("app.get('plotRow') !== itemId");
  });
});

/* ====================================================================== *
 * The placement offer stands down mid-DRAG (review 2026-09-09, split
 * finding — main thread: fix).
 *
 * The tracks are stacked one per row, so a bar drag that wanders vertically
 * crosses an UNPLOTTED row's track and fires its `plotHover`. That row then
 * lights a violet +, a slate-50 day tint and a pointer cursor — a second
 * placement offered while the user is mid-gesture on another row. Executed,
 * because the defect is what the handler DOES, not which door calls it.
 * ====================================================================== */

interface HoverHarness {
  set(patch: Record<string, unknown>): void;
  hover(rowId: string, clientX: number): void;
  state: Record<string, unknown>;
}
const hoverHarness = (): HoverHarness =>
  new Function('WEEKS', 'RECT', `
    "use strict";
    const state = {
      weekStart: '2026-08-03', plannerWeeks: WEEKS,
      sprints: [{ id: 's1', start: '2026-08-03', end: '2026-10-23' }],
      sprintItems: { rows: [{ id: 'C', sprintId: 's1', startsOn: null, finish: null, deadline: null }] },
      plotRow: null, plotDay: null, dragRow: null,
    };
    let sprintItemSaving = false;
    const app = {
      get: (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), state),
      set: (a, b) => { if (typeof a === 'string') state[a] = b; else Object.assign(state, a); },
    };
    ${['WEEK_COUNT', 'WORKDAYS_PER_WEEK', 'isoOf', 'isoAddDays', 'dayAtX', 'placeable', 'sprintRow'].map((n) => topDecl(n)).join('\n')}
    const handlers = { plotHover(ctx, rowId) ${handlerBody('plotHover')} };
    return {
      state,
      set: (patch) => Object.assign(state, patch),
      hover: (rowId, clientX) => handlers.plotHover({ event: { clientX }, node: { getBoundingClientRect: () => RECT } }, rowId),
    };
  `)(
    Array.from({ length: 12 }, (_, i) => ({ key: new Date(Date.UTC(2026, 7, 3) + i * 7 * 864e5).toISOString().slice(0, 10) })),
    { left: 1000, width: 1104 },
  ) as HoverHarness;

describe('placement stands down while a bar drag is live (review 2026-09-09)', () => {
  /** Viewport X at the middle of unit 12 on the harness's 1104px track. */
  const X_UNIT_12 = 1000 + 12.5 * (1104 / 60);
  const DAY_12 = '2026-08-19';

  it('offers a day on an unplotted row when nothing else is happening', () => {
    const h = hoverHarness();
    h.hover('C', X_UNIT_12);
    expect(h.state.plotRow).toBe('C');
    expect(h.state.plotDay).toBe(DAY_12);
  });

  it('offers NOTHING while another row’s bar is being dragged', () => {
    const h = hoverHarness();
    h.set({ dragRow: 'A' }); // row A's bar is under the button
    h.hover('C', X_UNIT_12);
    expect(h.state.plotDay, 'a + lit on a neighbouring row mid-gesture').toBeNull();
    expect(h.state.plotRow, 'the hover pair armed mid-gesture').toBeNull();
  });

  it('offers again the moment the gesture ends', () => {
    const h = hoverHarness();
    h.set({ dragRow: 'A' });
    h.hover('C', X_UNIT_12);
    h.set({ dragRow: null });
    h.hover('C', X_UNIT_12);
    expect(h.state.plotDay).toBe(DAY_12);
  });
});

