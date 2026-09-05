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

