/**
 * SUITE 4, first half — the always-visible search field, its three rendered
 * states, and the matching recipe/panel computed executed from shipped source.
 * Split out of test/sprint-schedule-render.test.ts on 2026-09-05 (PLAN.md §C);
 * the handlers and the dress are in sprint-schedule-add-handlers.test.ts, the
 * shared prelude and the panel/CSS fixtures in
 * test/helpers/sprint-schedule-tab.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPUTED_CTX_JS,
  TEMPLATE,
  method,
  fnBody,
  divFragment,
  renderSprintSchedule,
  topDecl,
} from './helpers/gantt-render.ts';
import {
  CSS_RULES,
  PANEL_A,
  PANELS,
  bySprint,
  links,
  oneLink,
  schedulesView,
} from './helpers/sprint-schedule-tab.ts';

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
 * `addLabel` / `addTokens` / `addMatches` (12-constants-pipeline.js) and the
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
