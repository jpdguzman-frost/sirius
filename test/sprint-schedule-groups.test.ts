/**
 * SUITE 1 (sprint groups) and SUITE 2 (the pinned pane), split out of
 * test/sprint-schedule-render.test.ts on 2026-09-05 (PLAN.md §C). The shared
 * prelude, the groups harness `H()` and the panel/CSS fixtures live in
 * test/helpers/sprint-schedule-tab.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  GANTT_CSS,
  PLANNER_CSS,
  COREY_G,
  OFF_BOARD,
  PLOTTED,
  UNPLOTTED,
  renderSprintSchedule,
  type SprintScheduleRow,
} from './helpers/gantt-render.ts';
import { H, groupsOf, schedulesView } from './helpers/sprint-schedule-tab.ts';

/* ====================================================================== *
 * SUITE 1 — groups: one per sprint, EMPTY INCLUDED, and nothing else.
 * The computed is EXECUTED out of the shipped scripts (rule 2); the render
 * half proves the markup an empty group still emits.
 * ====================================================================== */

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

