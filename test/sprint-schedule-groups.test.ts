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
 * SUITE 1 — groups: one per sprint, EMPTY INCLUDED, and — since owl #90
 * (block 9) — 'Outside any sprint' LAST, only while a row has sprintId null.
 * The computed is EXECUTED out of the shipped scripts (rule 2); the render
 * half proves the markup an empty group still emits.
 * ====================================================================== */

describe('sprintGroups — one group per sprint, empty sprints included, plus Outside any sprint only while a row is displaced (#90)', () => {
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

  it("appends ONE 'Outside any sprint' group, LAST, when a row has sprintId null — and none otherwise (owl #90; block 9)", () => {
    /* INVERTED 2026-09-11 (block 9, owl #90, JP 2026-09-10; PLAN.md R3).
       #72 §2's "absence is the design" is overturned for this ONE case: a
       sprint whose dates were edited leaves the rows its range no longer
       covers with `sprintId: null`, keeping their exact day, and this screen
       must SHOW them — surfaced, never quietly redistributed — under a
       synthetic group the PM re-slots from by week click. Both directions
       are asserted so the guard cannot pass by the group never rendering
       (rule 1): present with a null row, absent without one. */
    const h = H();
    h.set('sprints', SPRINTS);
    h.set('sprintItems', { rows: [{ ...PLOTTED, sprintId: 's1' }, { ...OFF_BOARD, id: 'd1', sprintId: null }], addable: {} });
    const groups = h.groups();
    expect(groups.map((g) => g.id)).toEqual(['s1', 's2', 'outside']);
    const outside = groups[2]!;
    expect(outside.name).toBe('Outside any sprint');
    expect(outside.rows.map((r: SprintScheduleRow) => r.id)).toEqual(['d1']);
    expect(outside.count).toBe(h.itemCount(1));
    // the sprint groups are untouched by its presence
    expect(groups[0]!.rows.map((r: SprintScheduleRow) => r.id)).toEqual(['i1']);
    expect(groups[1]!.rows).toEqual([]);

    // ABSENT when no row is outside — the group is not a permanent fixture
    h.set('sprintItems', { rows: [{ ...PLOTTED, sprintId: 's1' }], addable: {} });
    expect(h.groups().map((g) => g.id)).toEqual(['s1', 's2']);
    h.set('sprintItems', { rows: [], addable: {} });
    expect(h.groups().map((g) => g.id)).toEqual(['s1', 's2']);
  });

  it("keeps 'Outside any sprint' for NULL alone — a row naming a sprint the list lacks still surfaces nowhere", () => {
    // `null` is a stored state (#90: the server nulls membership on
    // displacement); a dangling id is a row that outlived its list, which the
    // deletion cascade makes abnormal — it is not promoted into the group
    const h = H();
    h.set('sprints', SPRINTS);
    h.set('sprintItems', { rows: [{ ...PLOTTED, sprintId: 'gone' }], addable: {} });
    const groups = h.groups();
    expect(groups.map((g) => g.id)).toEqual(['s1', 's2']);
    expect(groups.every((g) => g.rows.length === 0)).toBe(true);
  });

  it("emits NO 'unscheduled' group — that absence is still the design (#72 §2)", () => {
    const h = H();
    h.set('sprints', SPRINTS);
    h.set('sprintItems', { rows: [{ ...PLOTTED, sprintId: 's1' }, { ...UNPLOTTED, sprintId: null }], addable: {} });
    expect(h.groups().map((g) => g.id)).toEqual(['s1', 's2', 'outside']);
    expect(h.groups().map((g) => g.name)).not.toContain('Unscheduled');
    // and the tab BODY names no retired group. Comments are stripped first
    // (the prose legitimately explains the absence), and the sweep stops at
    // the sprints modal.
    const view = schedulesView().replace(/\{\{!\s[\s\S]*?\}\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const body = view.slice(0, view.indexOf('modal-back') > 0 ? view.indexOf('modal-back') : undefined);
    expect(body).not.toContain('Unscheduled');
  });

  it("renders the 'Outside any sprint' group LAST, with its rows, through the same group markup", () => {
    /* the render half: the synthetic group takes the ordinary group HEADER
       and the ordinary row markup, so nothing here can special-case it into a
       different shape. Its ONE difference — no add controls — is the test
       below (PLAN.md block 9 amendment 3). */
    const html = renderSprintSchedule({
      sprintGroups: [
        { id: 's1', name: 'Sprint A', meta: 'Aug 24 - Aug 28', count: '· 1 items', rows: [PLOTTED] },
        { id: 'outside', name: 'Outside any sprint', meta: 'no sprint dates', count: '· 1 items', rows: [{ ...OFF_BOARD, sprintId: null }] },
      ],
    });
    expect(html.indexOf('Outside any sprint')).toBeGreaterThan(html.indexOf('Sprint A'));
    expect([...html.matchAll(/growr sitem/g)]).toHaveLength(2);
    expect(html).toContain('MC-712'); // the displaced row's MC, in the second group
    // and the fixture's ordinary two-group render never says it
    expect(renderSprintSchedule()).not.toContain('Outside any sprint');
  });

  it("gives the 'Outside any sprint' group NO search field and NO Add links — there is no sprint to add INTO (PLAN.md amendment 3)", () => {
    /* THE RULE (owl #90 + PLAN.md amendment 3): the synthetic group is a
       PARKING BAY, not a sprint. `addOne`/`addAll` post to
       `/sprint-items` with a sprint id, and `'outside'` is not one — a field
       there would offer a click that can only 404, and Add All would offer it
       in bulk. The PM's way back in is the WEEK CLICK on the row's own track,
       which the group keeps.

       NON-VACUOUS BY CONSTRUCTION: both pieces of add state are forced ON for
       the group id — a typed query and an open panel with a match — so the
       template has everything it needs to draw the field, the Add All link
       and a result row, and draws none of them. The real sprint beside it,
       given the same state, draws all three. */
    const outside = { id: 'outside', name: 'Outside any sprint', meta: 'no sprint dates', count: '· 1 items', rows: [{ ...OFF_BOARD, sprintId: null }] };
    const real = { id: 's1', name: 'Sprint A', meta: 'Aug 24 - Aug 28', count: '· 1 items', rows: [PLOTTED] };
    const panel = { items: [{ cardId: 'w9', mc: 'MC-999', name: 'Sketch Asset: parked', label: 'MC-999: Sketch Asset: parked' }] };
    const html = renderSprintSchedule({
      sprintGroups: [real, outside],
      addQ: { outside: 'MC-999', s1: 'MC-999' },
      addPanels: { outside: panel, s1: panel },
    });
    // the POSITIVE control first — with this state a real sprint draws all three
    expect(html).toContain('id="gaddq-s1"');
    expect(html).toContain('aria-label="Add every listed work card to Sprint A"');
    expect(html).toContain('aria-label="Add MC-999: Sketch Asset: parked to Sprint A"');
    // …and the parking bay draws none of them
    expect(html).not.toContain('id="gaddq-outside"');
    expect(html).not.toContain('Add every listed work card to Outside any sprint');
    expect(html).not.toContain('to Outside any sprint"'); // no `Add … to …` label of either kind
    expect(html).not.toContain('Search work cards to add to Outside any sprint');
    // one search row on the page, and it belongs to the real sprint
    expect([...html.matchAll(/growr gsearch/g)]).toHaveLength(1);
    expect([...html.matchAll(/growr gresult/g)]).toHaveLength(1);
    expect(html.indexOf('growr gsearch')).toBeLessThan(html.indexOf('Outside any sprint'));
    // the group still HAS its header, its count and its row — it is hidden from
    // nothing, only unaddable
    expect(html).toContain('Outside any sprint');
    expect(html).toContain('MC-712');
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
  it('spells urgency as a chip on an URGENT row only — the other state draws none (JP 2026-09-08)', () => {
    /* The row used to state both states, the second one dashed (frame
       731:98513). JP withdrew it as display noise: a row that is not urgent
       now carries no urgency chip at all, and the recipe that dressed one
       goes with it — a live rule with no markup is what a later edit
       mistakes for a supported state. */
    const urgent = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) });
    const non = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED) });
    expect(urgent).toMatch(/class="gub urgent"/);
    expect(urgent).toContain('⚡Urgent');
    expect(non).not.toMatch(/class="gub/);
    expect(non).not.toContain('Non-Urgent');
    expect(GANTT_CSS, 'the withdrawn chip outlived its markup').not.toContain('nonurgent');
    expect(PLANNER_CSS, 'the withdrawn chip outlived its markup').not.toContain('nonurgent');
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

