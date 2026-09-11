/**
 * SUITE 2b (the DEADLINE cell — write registry entry W2), split out of
 * test/sprint-schedule-render.test.ts on 2026-09-05 (PLAN.md §C). SUITE 3
 * (day-grain placement) was retired with block 9 — see the note at the foot.
 * The shared prelude lives in test/helpers/sprint-schedule-tab.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS_CODE,
  TEMPLATE,
  OFF_BOARD,
  PLOTTED,
  UNPLOTTED,
  handlerBody,
  fnBody,
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
 * SUITE 3 — placement — RETIRED with the day controls (block 9, owls
 * #88/#89, JP 2026-09-10; PLAN.md block 9).
 *
 * The violet + on the hovered DAY, the one-day hover cell, `plotHover` /
 * `plotPlace`, and the `placeable` affordance guard all belonged to a
 * day-grain placement that the PM no longer has: Sprint Schedules is WEEK
 * grain (hover a week, click — test/drag-hittest.test.ts holds the `.gweek`
 * bindings), and the day is the Design Lead's, on Deadlines only. The three
 * rules `placeable` held (inside the sprint · not after the deadline · a
 * working day) carried across intact and gained the week bound: the client
 * half is `dlDayPlaceable`, executed in test/deadlines-drag.test.ts, the
 * server half `plotIssue` in test/sprint-items-plot.test.ts.
 * ====================================================================== */
