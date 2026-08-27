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
 * NON-VACUOUS REVERT PROOFS OWED AT VALIDATE (test/CLAUDE.md; PLAN.md) — each
 * of these guards must be shown to FAIL under the revert it names:
 *   1. an EMPTY sprint still renders header + add zone (revert: filter empty
 *      groups out of `sprintGroups`)
 *   2. no auto-population — addable cards never become rows (revert: seed
 *      `rows` from `addable` in the computed)
 *   3. the violet + gates on `sprintSel === row.id && !row.startsOn` and
 *      `plotWeek` (revert: drop any one clause)
 *   4. `pickAddMc` always clears `cardId` (revert: keep the old card)
 *   5. MIN_GRAB widening anchors LEFT, slides left only in the final column
 *      (revert: `left = l` unclamped, or a CSS min-width)
 *   6. the bar covers the finish DAY (revert: `dayIndex(finish)` without +1)
 *   7. `.gdl` is 1px red-500 (revert: the old 2px slate-400)
 *   8. footer overlap counts include a Friday start and a Monday finish
 *      (revert: strict inequalities)
 *   9. the withdrawal sweeps (revert: reintroduce `draggable`, a drop
 *      handler, or Suggest markup in the schedules view)
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
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
  renderSprintSchedule,
  type SprintGroup,
  type SprintScheduleRow,
} from './helpers/gantt-render.ts';

/**
 * Slice one top-level declaration — `function` or `const` — out of the shipped
 * source. Kept local (the test/gantt-run-geometry.test.ts precedent, whose
 * arithmetic this file inherits): the helper's `decl` is const-only and cannot
 * slice `function dayIndex` or `function sprintWeekLoad`, both needed here.
 */
function fnDecl(name: string, src: string = APP_JS): string {
  const fnAt = src.indexOf(`\nfunction ${name}(`);
  if (fnAt >= 0) {
    // balance the PARAMETER LIST first — `capacityBand(value, { least, … })`
    // destructures, so the first `{` after the name is not the body's
    let i = src.indexOf('(', fnAt);
    for (let parens = 0; i < src.length; i++) {
      if (src[i] === '(') parens++;
      else if (src[i] === ')' && --parens === 0) break;
    }
    let depth = 0;
    for (let j = src.indexOf('{', i); j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) return src.slice(fnAt, j + 1);
    }
    throw new Error(`sprint-schedule-render: unterminated function \`${name}\``);
  }
  const at = src.indexOf(`\nconst ${name} =`);
  if (at < 0) throw new Error(`sprint-schedule-render: no declaration of \`${name}\` in the shipped frontend source`);
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i]!;
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`sprint-schedule-render: unterminated declaration \`${name}\``);
}

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
 * The schedules view, sliced to the NEXT tab guard whichever tab that is —
 * the test/deadlines-frame.test.ts recipe, adopted after the Forecast
 * withdrawal broke a slice that had named its neighbour.
 */
const schedulesView = (): string => {
  const at = TEMPLATE.indexOf("{{#if activeTab === 'schedules'}}");
  expect(at, 'no schedules view in the shipped template').toBeGreaterThan(-1);
  const end = TEMPLATE.indexOf("{{#if activeTab === '", at + 1);
  return TEMPLATE.slice(at, end > at ? end : undefined);
};

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
  mcs(): string[];
  cards(): Array<{ cardId: string; name: string }>;
  caption(): string;
  fmtDate(iso: string): string;
  itemCount(n: number): string;
}

// Computeds read `this.get(key)`; the harness `get` resolves computeds
// transparently, exactly as Ractive does (the suggest-counts idiom).
let groupsHarness: GroupsHarness | undefined;
const H = (): GroupsHarness =>
  (groupsHarness ??= new Function(`
    ${fnDecl('fmtDate')}
    ${fnDecl('itemCount')}
    ${fnDecl('CAP_TYPICAL_TOLERANCE')}
    ${fnDecl('CAP_EDGE_SHARE')}
    ${fnDecl('capacityBand')}
    const computed = { ${['sprintGroups', 'addMcOptions', 'addCardOptions', 'footCaption'].map((n) => method(n)).join(', ')} };
    const DATA = {
      sprintItems: { rows: [], addable: {} },
      sprints: [],
      addRow: null,
      capacity: { weekly: 8, least: 6, typical: 8, most: 10 },
    };
    const ctx = { get: (k) => (Object.prototype.hasOwnProperty.call(computed, k) ? computed[k].call(ctx) : DATA[k]) };
    return {
      set: (k, v) => { DATA[k] = v; },
      groups: () => computed.sprintGroups.call(ctx),
      mcs: () => computed.addMcOptions.call(ctx),
      cards: () => computed.addCardOptions.call(ctx),
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

  it('emits every sprint — an EMPTY sprint keeps its group, because the add affordance needs a home', () => {
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

  it('renders an empty group as header + add zone with zero rows', () => {
    const html = renderSprintSchedule({
      sprintGroups: [{ id: 's2', name: 'Sprint B', meta: 'Aug 31 - Sep 4', count: '· 0 items', rows: [] }],
    });
    expect(html).toContain('Sprint B');
    expect(html).not.toContain('sitem');
    expect(html).toContain('gaddzone');
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

describe('the selection checkbox — placement starts here (ruled decision 3)', () => {
  it('renders one .gsel per row, labelled with the MC number AND the card name', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) });
    const box = /<input[^>]*class="gsel"[^>]*>/.exec(html);
    expect(box, 'no selection checkbox rendered').not.toBeNull();
    expect(box![0]).toContain('type="checkbox"');
    expect(html).toMatch(/aria-label="Select MC-655 Hero render for placement"/);
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

describe('the date cells — fmtLongIso or an em-dash', () => {
  it('prints deadline and forecast through fmtLongIso when present', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) });
    expect(html).toContain('long:2026-08-28'); // c-dl
    expect(html).toContain('long:2026-08-12'); // c-fc — the same field the bar's right edge reads
  });

  it('prints an em-dash for a row with neither', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED) });
    expect(html).not.toContain('long:');
    expect(html).toContain('—');
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
 * SUITE 3 — placement: the violet + rides the SELECTED unplotted row
 * ====================================================================== */

describe('the violet + renders only on the selected, unplotted row, under the pointer', () => {
  const CASES: Array<[string, Parameters<typeof renderSprintSchedule>[0], boolean]> = [
    ['selected + unplotted + hovered week', { sprintGroups: groupsOf(UNPLOTTED), sprintSel: 'i2', plotWeek: '2026-08-10' }, true],
    ['selected + unplotted, pointer off the track', { sprintGroups: groupsOf(UNPLOTTED), sprintSel: 'i2', plotWeek: null }, false],
    ['selected but already plotted', { sprintGroups: groupsOf(PLOTTED), sprintSel: 'i1', plotWeek: '2026-08-10' }, false],
    ['unplotted but not selected', { sprintGroups: groupsOf(UNPLOTTED), sprintSel: null, plotWeek: '2026-08-10' }, false],
  ];

  for (const [label, state, expected] of CASES) {
    it(`${label}: ${expected ? 'shows' : 'hides'} the +`, () => {
      expect(renderSprintSchedule(state).includes('gplus')).toBe(expected);
    });
  }

  it('names the week it would place into', () => {
    const html = renderSprintSchedule({ sprintGroups: groupsOf(UNPLOTTED), sprintSel: 'i2', plotWeek: '2026-08-10' });
    expect(html).toContain('aria-label="Place the bar in the week of 2026-08-10"');
  });

  it('lets the TRACK take the click — the + itself is pointer-transparent (CSS)', () => {
    // the same reasoning the drag era swept: a solid circle over the track
    // would swallow the placement click at exactly the column the user aims at
    expect(GANTT_CSS).toMatch(/\.gplus[^{]*\{[^}]*pointer-events: none/);
  });

  it('wires hover, leave and click on the track (source)', () => {
    const view = schedulesView();
    expect(view).toContain("'plotHover'");
    expect(view).toContain("'plotLeave'");
    expect(view).toContain("'plotPlace'");
  });

  it('plotPlace PATCHes starts_on and reloads; the geometry mapping is weekAtX (source)', () => {
    const body = handlerBody('plotPlace');
    expect(body).toContain('starts_on');
    expect(body).toContain('/sprint-items/');
    expect(body).toContain('loadAll');
    // the same pure mapper the drop used — measured rect in, week key out
    expect(handlerBody('plotHover')).toContain('weekAtX');
  });

  it('a project switch clears the whole placement state (source)', () => {
    // `addMenu` is deliberately absent here: it closes through the derived
    // NO_OVERLAYS spread, which the overlay suite in this file pins instead.
    const body = fnBody('resetForProjectSwitch');
    for (const key of ['sprintSel', 'plotWeek', 'addRow']) {
      expect(body, `${key} survives a project switch`).toMatch(new RegExp(`${key}: null`));
    }
  });
});

/* ====================================================================== *
 * SUITE 4 — the add affordance: zone → row → two dropdowns → Add Item
 * ====================================================================== */

describe('the add zone — hidden at rest, one per group, opens the add row in ITS group only', () => {
  it('renders per group and opens via openAddRow with the group id (source)', () => {
    const html = renderSprintSchedule(); // two groups
    expect([...html.matchAll(/gaddzone/g)].length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/gaddrule/);
    expect(html).toMatch(/gaddplus/);
    expect(schedulesView()).toContain("['openAddRow', g.id]");
  });

  it('is revealed by hover/focus, not always-on chrome (CSS)', () => {
    expect(GANTT_CSS).toMatch(/\.gaddzone[^{]*\{[^}]*opacity: 0/);
    expect(GANTT_CSS).toMatch(/\.gaddzone[^{]*(hover|focus)[^{]*\{[^}]*opacity: 1/);
  });

  it('swaps to the add ROW in the opened group, keeping the zone in the other', () => {
    const html = renderSprintSchedule({
      addRow: { sprintId: 's1', mc: null, cardId: null, saving: false },
    });
    expect(html).toContain('gaddrow');
    // Sprint B (s2) still offers its zone
    const afterB = html.slice(html.indexOf('Sprint B'));
    expect(afterB).toContain('gaddzone');
    expect(afterB).not.toContain('gaddrow');
  });
});

describe('the two dropdowns — MC first, card second, full strings always', () => {
  const OPEN_MC = {
    addRow: { sprintId: 's1', mc: null, cardId: null, saving: false },
    addMenu: 'mc' as const,
    addMcOptions: ['MC-07', 'MC-824'],
  };

  it('the work-card control is inert until an MC is picked — render AND handler agree', () => {
    const html = renderSprintSchedule({ addRow: { sprintId: 's1', mc: null, cardId: null, saving: false } });
    const scope = html.slice(html.indexOf('gaddrow'));
    expect(scope).toMatch(/disabled/);
    // the handler refuses to open 'card' without an MC — the belt to the
    // template's braces (one gate in each half cannot drift apart silently)
    expect(handlerBody('openAddMenu')).toContain('.mc');
  });

  it('lists the MC options in a listbox that opens UPWARD and scrolls as the NORMAL case', () => {
    const html = renderSprintSchedule(OPEN_MC);
    expect(html).toContain('gddmenu');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('MC-07');
    expect(html).toContain('MC-824');
    // #73: upward, fixed height, own scrollbar — most MC lists are longer
    expect(GANTT_CSS).toMatch(/\.gddmenu[^{]*\{[^}]*bottom: calc\(100% \+ 5px\)/);
    expect(GANTT_CSS).toMatch(/\.gddmenu[^{]*\{[^}]*max-height: 218px/);
    expect(GANTT_CSS).toMatch(/\.gddmenu[^{]*\{[^}]*overflow-y: auto/);
  });

  it("marks the picked option by WEIGHT ALONE — `.on` is font-weight 600 and nothing else (#73)", () => {
    const at = GANTT_CSS.search(/\.gdditem\.on\s*\{/);
    expect(at, 'no .gdditem.on rule').toBeGreaterThan(-1);
    const body = GANTT_CSS.slice(GANTT_CSS.indexOf('{', at) + 1, GANTT_CSS.indexOf('}', at));
    const decls = body.split(';').map((d) => d.trim()).filter(Boolean);
    expect(decls).toEqual(['font-weight: 600']);
    // no tick joins it in the markup either — the menu subtree alone is read,
    // so an icon elsewhere in the sheet cannot mask (or fake) a violation
    const html = renderSprintSchedule({ ...OPEN_MC, addRow: { ...OPEN_MC.addRow, mc: 'MC-07' } });
    const menu = divFragment('<div class="gddmenu ', html);
    expect(menu).not.toContain('<svg'); // the chevron lives on the control, not in the list
  });

  it('hands the handler the FULL stored string — never a display-clamped copy (source)', () => {
    const view = schedulesView();
    expect(view).toMatch(/\['pickAddMc', \w+\]/);
    expect(view).toMatch(/\['pickAddCard', \w+\.cardId\]/);
  });

  it('addMcOptions / addCardOptions read the server map and NEVER re-sort the cards (#73)', () => {
    const h = H();
    const cards = [
      { cardId: 'r1', name: 'Render Asset: GRaf Playing Flute', taskPrefix: 'Render Asset' },
      { cardId: 's1', name: 'Sketch Asset: GRaf Playing Flute', taskPrefix: 'Sketch Asset' },
    ];
    h.set('sprintItems', { rows: [], addable: { 'MC-824': cards, 'MC-07': [] } });
    h.set('addRow', { sprintId: 's1', mc: 'MC-824', cardId: null, saving: false });
    expect(h.mcs()).toEqual(['MC-07', 'MC-824']); // keys, sorted
    expect(h.cards()).toEqual(cards); // the server's order, untouched
    h.set('addRow', { sprintId: 's1', mc: null, cardId: null, saving: false });
    expect(h.cards()).toEqual([]); // no MC picked → nothing to offer
  });

  it('re-picking the MC ALWAYS clears the card — never re-matched by name (#73; source)', () => {
    // matches the keypath spelling too: `'addRow.cardId': null`
    expect(handlerBody('pickAddMc')).toMatch(/cardId'?\s*:\s*null/);
  });

  it('the add dropdown joins the overlay law: addMenu closes by the derived list, shielded by .gdd', () => {
    const keys = new Function(`${fnDecl('OVERLAY_KEYS')} return OVERLAY_KEYS;`)() as string[];
    expect(keys).toContain('addMenu');
    expect(fnDecl('OVERLAY_SHIELDS')).toMatch(/addMenu: '\.gdd'/);
  });
});

describe('Add Item — dead until a card is picked, saving while the POST runs', () => {
  const addRow = (patch: Partial<{ mc: string | null; cardId: string | null; saving: boolean }>) => ({
    addRow: { sprintId: 's1', mc: null, cardId: null, saving: false, ...patch },
  });

  const addBtn = (html: string): string => {
    const at = html.indexOf('Add Item');
    expect(at, 'no Add Item button rendered').toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf('<button', at), at); // the open tag ahead of the label
  };

  it('is disabled with no card, live with one, disabled again while saving', () => {
    expect(addBtn(renderSprintSchedule(addRow({ mc: 'MC-07' })))).toContain('disabled');
    expect(addBtn(renderSprintSchedule(addRow({ mc: 'MC-07', cardId: 'w1' })))).not.toContain('disabled');
    expect(addBtn(renderSprintSchedule(addRow({ mc: 'MC-07', cardId: 'w1', saving: true })))).toContain('disabled');
  });

  it('POSTs the pair, surfaces the 409s through the banner, reloads on success (source)', () => {
    const body = handlerBody('submitAddItem');
    expect(body).toContain('sprint_id');
    expect(body).toContain('card_id');
    expect(body).toContain('/sprint-items');
    expect(body).toContain('flashBanner');
    expect(body).toContain('loadAll');
  });

  it('fills the far cells with em-dashes — the add row forecasts nothing', () => {
    const html = renderSprintSchedule(addRow({}));
    const tail = html.slice(html.indexOf('gaddrow'));
    expect([...tail.matchAll(/—/g)].length).toBeGreaterThanOrEqual(2);
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
 * Sliced LAZILY (the drag-hittest weekAtX precedent): `fnDecl` throws when a
 * declaration is absent, and a throw at module scope would take the WHOLE
 * file down — render suites included — while the scripts land.
 */
let geo: GeoHarness | undefined;
const G = (): GeoHarness => {
  if (!geo) {
    const src = ['WEEK_COUNT', 'WEEK_PX', 'WORKDAYS_PER_WEEK', 'TOTAL_UNITS', 'dayIndex', 'clampUnits', 'pctOf', 'unitPct', 'MIN_GRAB_PX', 'UNIT_PX', 'MIN_GRAB_UNITS', 'itemBar', 'itemPhase']
      .map((n) => fnDecl(n))
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

describe('the deadline tick — recipe unchanged, dress per frame 731:98733', () => {
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
    ${fnDecl('isoOf')}
    ${fnDecl('isoAddDays')}
    ${fnDecl('sprintWeekLoad')}
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
      'Select a row, then click a week to place its bar — the finish is computed.',
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
