/**
 * THE PIPELINE METRIC STRIP — block 10 (owls #91/#92/#93, Miles 2026-09-10;
 * build spec v1.4 §4.0 and §8; nodes 843:125893 · 843:125895 · 913:36123 ·
 * 843:125894 read through Rex 2026-09-12).
 *
 * The strip was replaced whole. What stood there were two reconciliation
 * totals and an ingestion warning, counted over the whole project; what stands
 * there now are four figures counted in WORK-CARD units over the rows the
 * table is actually showing. Three of them partition the non-excluded lanes of
 * §7a; the fourth cuts across those three and is never added to them.
 *
 * WHAT THIS FILE IS FOR. Two of the rules above are cheap to state and easy to
 * lose:
 *   - the walk is BY MC NUMBER, once each. Every deliverable row of an MC
 *     holds the same array object its siblings hold, so a walk by row
 *     multiplies that MC's work cards by however many deliverables it carries.
 *     The largest carries ninety-nine. A per-row rewrite reads as a
 *     simplification, produces numbers nobody can check by eye, and breaks
 *     nothing else. That is the defect this suite exists to make loud.
 *   - the figures RESCOPE. A total that quietly stopped following the filter
 *     would look perfectly reasonable on a full table and be wrong on every
 *     narrowed one.
 *
 * HOW IT ASSERTS. The arithmetic is never restated here: the computed is
 * sliced out of the shipped scripts and EXECUTED, with the computeds it reads
 * resolved through the same `get` the browser gives it (test/CLAUDE.md rule 2,
 * the idiom shared with test/pipeline-expanded-groups.test.ts and
 * test/pipeline-sortfilter-noresults.test.ts). The markup goes through the
 * shipped template and real Ractive (rule 6). Colours are asserted as TOKEN
 * NAMES, never as hex.
 *
 * What it cannot prove: that the strip stays put while the table scrolls, and
 * that the figures are legible at the widths the frame draws. `toHTML()` has
 * no layout. Those belong to the live pass.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  PIPELINE_CSS,
  TEMPLATE,
  TOKENS_CSS,
  type PipeRow,
  type WorkCardRow,
  COMPUTED_CTX_JS,
  cssRule,
  divFragment,
  method,
  pipeRecipeDecls,
  renderMetrics,
  stampRows,
  tabViewCode,
} from './helpers/gantt-render.ts';
import { row, task } from './helpers/pipeline-expanded.ts';

/* ---------------------------------------------------------------------- */
/* The harness — the shipped computed, executed                            */
/* ---------------------------------------------------------------------- */

interface Tiles { pending: number; ongoing: number; done: number; urgent: number }
type Sel = Record<string, (string | null)[]>;
type StampedRow = PipeRow & { work: WorkCardRow[]; hasTasks: boolean };

interface TilesHarness {
  /** write one state key and re-stamp the rows the way `loadAll` stamps them */
  set(key: string, value: unknown): void;
  /** an empty SELECTION, derived from the shipped axis list rather than typed out */
  empty(): Sel;
  tiles(): Tiles;
  rows(): StampedRow[];
  noResults(): boolean;
}

/* `pipeTiles` EXECUTED out of the shipped scripts, together with every
   computed it reads — the search pass, the sort definition, the filtered row
   set and the work-axis flag all resolve through the SAME `get`, so this
   harness counts over the rows the browser's table is drawing rather than over
   a set the test assembled itself. A source assertion could show the computed
   reaching for `pipelineRows` without showing that it ever produces a
   different number from the project total it replaced.

   `pipeNoResults` and `pipeChips` come along because the empty-table rule
   below is one claim about two things: the table is gone AND the strip is not.
   `chipPop` stays null throughout, so the chip derivation never reaches for
   the facet pass (its own suite pins that ordering).

   `stampRows` is the render helper's single restatement of `loadAll`'s stamp,
   and it is what reproduces the hazard this file guards: every sibling row of
   an MC comes back holding the identical `work` array object, not a copy. */
const tilesHarness = (): TilesHarness =>
  new Function('stampRows', `
    ${pipeRecipeDecls()}
    const computed = { ${['pipeSearched', 'pipeSortDef', 'pipelineRows', 'pipeWorkLive', 'pipeTiles', 'pipeChips', 'pipeNoResults'].map((n) => method(n)).join(', ')} };
    const DATA = { rows: [], searchQ: '', pipeFilters: PIPE_FILTERS_EMPTY(), pipeSort: null, chipPop: null, workCardsByMc: {} };
    ${COMPUTED_CTX_JS}
    const stamp = () => { DATA.rows = stampRows(DATA.rows, DATA.workCardsByMc); };
    return {
      set: (k, v) => { DATA[k] = v; stamp(); },
      empty: () => PIPE_FILTERS_EMPTY(),
      tiles: () => computed.pipeTiles.call(ctx),
      rows: () => computed.pipelineRows.call(ctx),
      noResults: () => computed.pipeNoResults.call(ctx),
    };
  `)(stampRows) as TilesHarness;

/* ---------------------------------------------------------------------- */
/* Fixtures                                                                */
/* ---------------------------------------------------------------------- */

/** One deliverable row of an MC, searchable and filterable the way the wire makes them. */
const deliverable = (mc: string, i: number, over: Record<string, unknown> = {}) => ({
  ...row({
    cardId: `${mc}-${i}`,
    mcNumber: mc,
    mcLabel: mc,
    displayId: `${mc}.${i}`,
    name: `${mc} deliverable ${i}`,
  }),
  // `loadAll` precomputes the searchable text per row; the search pass reads
  // nothing else, so a fixture without it is unsearchable rather than unmatched
  blob: `${mc} deliverable ${i}`.toLowerCase(),
  assetType: 'Icon',
  currentList: 'Backlogs: Icon',
  ...over,
});

/** N sibling deliverables under ONE MC — the shape invariant three describes. */
const siblings = (mc: string, n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => deliverable(mc, i + 1, over));

const card = (cardId: string, over: Partial<WorkCardRow> = {}): WorkCardRow =>
  task({ cardId, name: `work ${cardId}`, ...over });

/* The population every rescoping assertion below narrows. MC-825 carries four
   countable cards and one in an ops lane; MC-901 carries one. Two asset types,
   so a main-card axis can separate them, and distinct searchable text, so the
   search pass can. */
const BIG_MC = 'MC-825';
const SMALL_MC = 'MC-901';
const WORK: Record<string, WorkCardRow[]> = {
  [BIG_MC]: [
    card('a', { status: 'pending' }),
    card('b', { status: 'pending', urgency: 'Urgent' }),
    card('c', { status: 'ongoing' }),
    card('d', { status: 'done' }),
    card('e', { status: 'excluded', urgency: 'Urgent' }),
  ],
  [SMALL_MC]: [card('f', { status: 'ongoing', urgency: 'Urgent' })],
};
/** What the fixture above is worth, per MC, with nothing narrowing it. */
const BIG_ALONE: Tiles = { pending: 2, ongoing: 1, done: 1, urgent: 1 };
const SMALL_ALONE: Tiles = { pending: 0, ongoing: 1, done: 0, urgent: 1 };
const BOTH: Tiles = { pending: 2, ongoing: 2, done: 1, urgent: 2 };

/** the population, with `big` sibling rows under MC-825 and one under MC-901 */
const populated = (big: number, over: Record<string, unknown> = {}): TilesHarness => {
  const h = tilesHarness();
  h.set('workCardsByMc', WORK);
  h.set('rows', [...siblings(BIG_MC, big), ...siblings(SMALL_MC, 1, { assetType: 'Web' })]);
  for (const [k, v] of Object.entries(over)) h.set(k, v);
  return h;
};

/* ---------------------------------------------------------------------- */
/* Markup readers                                                          */
/* ---------------------------------------------------------------------- */

/** Every tile a render drew: its modifier, its overline and its figure. */
const tilesOf = (html: string) =>
  [...html.matchAll(/<div class="metric ([a-z-]+)"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => ({
    modifier: m[1]!,
    label: /<span class="mlabel"[^>]*>([\s\S]*?)<\/span>/.exec(m[2]!)?.[1] ?? null,
    value: /<span class="mvalue"[^>]*>([\s\S]*?)<\/span>/.exec(m[2]!)?.[1] ?? null,
  }));

/** Four figures no other number on the strip could be mistaken for. */
const DISTINCT: Tiles = { pending: 7, ongoing: 13, done: 29, urgent: 5 };
const ZEROED: Tiles = { pending: 0, ongoing: 0, done: 0, urgent: 0 };

/* ---------------------------------------------------------------------- */
/* 1 — the strip is four tiles, always, and the retired three are gone      */
/* ---------------------------------------------------------------------- */

describe('the strip draws four tiles, in the ruled order, unconditionally', () => {
  it('SEEDS the figures it is handed — the render harness is not drawing blanks', () => {
    /* THE VACUITY GUARD, and it is first on purpose. The renderer feeds one
       key into the shipped subtree. Feed the wrong one and the markup still
       comes back: four tiles, four overlines, four EMPTY figures — and every
       assertion in this file about labels, order, classes and colours passes
       against it. That is exactly the failure test/CLAUDE.md rule 6 describes,
       and it is what the strip's rebuild nearly shipped, because the key the
       template reads was renamed and the helper's was not.

       Four values chosen so no tile could borrow another's and pass. */
    const drawn = tilesOf(renderMetrics({ ...DISTINCT }));
    /* The count comes FIRST. Review finding, 2026-09-12: a loop over an empty
       list passes every iteration it never runs, so the guard written to catch
       vacuity was vacuous itself — markup with no tiles at all, or with the
       modifier class dropped so the parser matches nothing, sailed through it. */
    expect(drawn, 'the strip rendered no tiles — the loop below would assert nothing').toHaveLength(4);
    for (const t of drawn) {
      expect(t.value, `the ${t.modifier} tile drew no figure — the harness seeds a key the template does not read`)
        .toBe(String(DISTINCT[t.modifier as keyof Tiles]));
    }
  });

  it('is PENDING · ONGOING · DONE · URGENT, in that order, each naming its own figure', () => {
    /* Order is part of the ruling, not an accident of the markup: the three
       states read left to right in the order work moves through them, and the
       cross-cutting figure sits last because it is not a fourth state.

       The overline and the modifier are asserted AGAINST EACH OTHER rather
       than as two lists — a tile wearing one tile's colour under another
       tile's word is the failure that a pair of independently-correct lists
       would let through. */
    const drawn = tilesOf(renderMetrics({ ...DISTINCT }));
    expect(drawn.map((t) => t.modifier)).toEqual(['pending', 'ongoing', 'done', 'urgent']);
    for (const t of drawn) {
      expect(t.label, `the ${t.modifier} tile is overlined "${t.label}"`).toBe(t.modifier.toUpperCase());
      expect(t.value, `the ${t.modifier} tile draws another tile's figure`)
        .toBe(String(DISTINCT[t.modifier as keyof Tiles]));
    }
  });

  it('draws all four at zero — none of them hides itself', () => {
    /* §8. The tile that stood fourth before hid at zero (owl #61) and that
       rule retired WITH it: these four are not warnings, and zero is the
       truthful answer to a query that matched nothing. A strip that thinned
       out under a narrow filter would take the explanation away exactly when
       the reader needs it. */
    const drawn = tilesOf(renderMetrics({ ...ZEROED }));
    expect(drawn).toHaveLength(4);
    for (const t of drawn) expect(t.value, `the ${t.modifier} tile vanished at zero`).toBe('0');
  });

  it('carries NOTHING conditional between the tab and the last tile', () => {
    /* Deeper than a render at one state: the assertion above proves four tiles
       for the data it was handed, this proves there is no state at all in
       which the strip draws fewer. Read off the shipped template with its
       prose stripped, because a rebuilt block records in its own comments what
       used to be conditional here (test/CLAUDE.md rule 3, in the kind
       direction).

       The same read settles where the strip SITS: above the stack that holds
       the table, the pager and the empty state, so nothing that happens to the
       table can take the strip with it. */
    const tab = tabViewCode('pipeline');
    const guard = "{{#if activeTab === 'pipeline'}}";
    const stripAt = tab.indexOf('<div class="metrics">');
    const strip = divFragment('<div class="metrics">', tab);
    expect(stripAt, 'the strip left the Pipeline tab').toBeGreaterThan(-1);
    expect(tab.slice(tab.indexOf(guard) + guard.length, stripAt), 'the strip sits behind a second condition')
      .not.toMatch(/\{\{#/);
    expect(strip, 'a tile is drawn conditionally, or the four became a loop').not.toMatch(/\{\{#/);
    expect(tab.indexOf('<div class="pipestack">'), 'the strip moved inside the block the empty state replaces')
      .toBeGreaterThan(stripAt + strip.length - 1);
  });

  it('keeps the three retired figures off the tab entirely, not merely off the strip', () => {
    /* The two reconciliation totals and the ingestion warning are DROPPED, not
       rehomed: §4.0 sends them to an ingestion-health section that has never
       been written. Asserted over the whole tab rather than over the strip
       because the obvious way for one to come back is as a line of chrome
       somewhere else on the page — and the warning is not lost by being
       dropped here, it is drawn from the loader state on Sprint Schedules,
       which this asserts is still true. */
    const tab = tabViewCode('pipeline');
    for (const label of ['MAIN CARDS', 'WORK CARDS', 'UNATTACHED']) {
      expect(tab, `${label} is back on the Pipeline tab`).not.toContain(label);
    }
    expect(renderMetrics({ ...DISTINCT }), 'a retired tile came back onto the strip')
      .not.toMatch(/MAIN CARDS|WORK CARDS|UNATTACHED/);
    expect(TEMPLATE, 'the ingestion warning lost its last home in the app').toContain('unattachedWork.cards');
  });
});

/* ---------------------------------------------------------------------- */
/* 2 — colour: a token reference, and a token that exists                   */
/* ---------------------------------------------------------------------- */

describe('every tile is coloured by a token the stylesheet can actually resolve', () => {
  it('references var(--token) on BOTH text nodes and declares the token', () => {
    /* Two failures in one guard, and the second is invisible in a test that
       only reads the rule: `color: var(--emerald-600)` against a token nobody
       declared renders as INHERITED slate, which looks like a tile that was
       never coloured rather than like a typo. So the token name is read out of
       the rule and looked up in the token sheet, never typed here twice.

       Closed by construction over whatever the strip renders, so a fifth
       coloured tile is covered the day it is added. A hex literal in the rule
       body fails on sight: the sheet's colours are named, and a raw value is
       how a fill drifts from the one the node carries. */
    const drawn = tilesOf(renderMetrics({ ...DISTINCT }));
    expect(drawn.length, 'no tiles rendered — every assertion below would pass vacuously').toBe(4);
    for (const t of drawn) {
      const rule = cssRule(`.metrics .metric.${t.modifier} .mlabel, .metrics .metric.${t.modifier} .mvalue`, PIPELINE_CSS);
      const token = /var\(--([a-z0-9-]+)\)/.exec(rule)?.[1];
      expect(token, `.metric.${t.modifier} names no token`).toBeTruthy();
      expect(TOKENS_CSS, `--${token} is referenced by .metric.${t.modifier} and declared nowhere`)
        .toContain(`--${token}:`);
      expect(rule, `.metric.${t.modifier} carries a raw colour value`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      /* Review finding, 2026-09-12: reading the PAIRED rule proves what the
         paired rule says, not what the tile ends up wearing. A later rule
         naming one node alone — `.metrics .metric.pending .mlabel { color: … }`
         — wins the cascade and strands the overline, with every assertion here
         still green. So the sheet is swept: exactly ONE rule may set a colour
         on this modifier's text nodes, and it is the paired one. */
      const colouring = PIPELINE_CSS.split('\n')
        .filter((line) => line.includes(`.metric.${t.modifier} .m`) && /\bcolor\s*:/.test(line));
      expect(colouring, `more than one rule colours .metric.${t.modifier} — the last one wins, not the paired one`)
        .toHaveLength(1);
    }
  });

  it('gives the four tiles four different colours', () => {
    /* A strip whose tiles all resolved to the same token would satisfy every
       clause above and tell the reader nothing — the colour IS how the three
       states are told apart at a glance. */
    const tokens = tilesOf(renderMetrics({ ...DISTINCT })).map((t) =>
      /var\(--([a-z0-9-]+)\)/.exec(cssRule(`.metrics .metric.${t.modifier} .mlabel, .metrics .metric.${t.modifier} .mvalue`, PIPELINE_CSS))?.[1]);
    expect(new Set(tokens).size, 'two tiles share a colour').toBe(4);
  });
});

/* ---------------------------------------------------------------------- */
/* 3 — ONE MC, ONE CONTRIBUTION — the highest-value guard in the block      */
/* ---------------------------------------------------------------------- */

describe('an MC contributes its work cards ONCE, however many deliverables it carries', () => {
  /* THE DEFECT THIS EXISTS FOR. `loadAll` stamps each row's `work` with the
     SAME array object the map holds — not a copy, deliberately, so the table
     has nothing new to diff. Total the strip by walking rows and every MC's
     cards are counted once per deliverable it carries. mc_number is not a
     unique key (invariant three): the largest MC on the real board carries
     ninety-nine deliverables, so the figures come back ninety-nine times too
     large and still look like plausible numbers.

     It is also the rewrite most likely to be attempted, because a walk over
     rows reads simpler than a walk over rows keyed by MC, and nothing else on
     the tab breaks when it is made. */

  it('reproduces the hazard in the fixture before claiming immunity from it', () => {
    /* If the sibling rows ever stopped sharing one array object, every
       assertion below would keep passing and stop meaning anything. So the
       trap is asserted to EXIST first. */
    const rows = populated(4).rows().filter((r) => r.mcNumber === BIG_MC);
    expect(rows.length, 'the fixture lost its sibling rows').toBeGreaterThan(1);
    expect(rows[0]!.work, 'the siblings hold copies, so a per-row walk would no longer over-count')
      .toBe(rows[1]!.work);
  });

  it('reads the SAME four figures for one deliverable and for ninety-nine', () => {
    /* The rule, stated as the rule: the sibling count is not an input. A
       per-row walk fails this by a factor of ninety-nine, which is the whole
       point of pushing the fixture to the real board's worst case rather than
       to a tidy two. */
    const one = populated(1).tiles();
    const many = populated(99).tiles();
    expect(one).toEqual(BOTH);
    expect(many, 'the figures scale with the number of deliverables under an MC').toEqual(one);
  });

  it('holds when the siblings are INTERLEAVED with another MC, not contiguous', () => {
    /* A cheaper-looking fix for the same defect — skip a row whose MC matches
       the row BEFORE it — passes a contiguous fixture and fails the moment two
       MCs interleave. Identity has to be the whole set of MCs seen, not the
       last one.

       Review finding, 2026-09-12: this test did not catch that rewrite, because
       feeding interleaved ROWS proves nothing — `pipelineRows` sorts before
       `pipeTiles` walks it, and the default sort handed the walk a de-interleaved
       list. So the interleaving is produced through the SHIPPED sort (A–Z over
       names chosen to alternate) and asserted to survive into the row set before
       the figures are read — the same "reproduce the hazard first" idiom as the
       sibling test above. */
    const h = tilesHarness();
    h.set('workCardsByMc', WORK);
    h.set('pipeSort', 'name');
    h.set('rows', [
      deliverable(BIG_MC, 1, { name: 'a one', blob: 'a one' }),
      deliverable(SMALL_MC, 1, { name: 'b two', blob: 'b two' }),
      deliverable(BIG_MC, 2, { name: 'c three', blob: 'c three' }),
      deliverable(SMALL_MC, 2, { name: 'd four', blob: 'd four' }),
      deliverable(BIG_MC, 3, { name: 'e five', blob: 'e five' }),
    ]);
    const order = h.rows().map((r) => r.mcNumber);
    expect(order, 'the sort regrouped the MCs — an interleaved walk is no longer being tested')
      .toEqual([BIG_MC, SMALL_MC, BIG_MC, SMALL_MC, BIG_MC]);
    expect(h.tiles(), 'the walk remembers only the previous row, not every MC counted').toEqual(BOTH);
  });

  it('counts an MC once even when only SOME of its deliverables survive the filter', () => {
    /* The dangerous middle case: the group is still on the table, so it is
       still counted — but through fewer rows than it has. Its cards must not
       thin out with its rows, because the cards hang off the MC and not off
       any one deliverable (invariant four). */
    const h = tilesHarness();
    h.set('workCardsByMc', WORK);
    h.set('rows', [
      deliverable(BIG_MC, 1, { assetType: 'Icon' }),
      deliverable(BIG_MC, 2, { assetType: 'Web' }),
      deliverable(BIG_MC, 3, { assetType: 'Web' }),
    ]);
    h.set('pipeFilters', { ...h.empty(), type: ['Web'] });
    expect(h.rows(), 'the filter did not narrow the fixture').toHaveLength(2);
    expect(h.tiles(), 'an MC on the table contributed a share of its cards rather than all of them')
      .toEqual(BIG_ALONE);
  });

  it('contributes nothing for a row carrying no MC number, and nothing for work under no row', () => {
    /* Both ends of the join. A row with no MC number reaches no key in the
       map; work whose MC has no row is reachable from no key in the walk. The
       second is §4.0's decision, not an oversight — unattached work belongs to
       ingestion health, and counting it here would make the strip describe
       something other than the table under it. */
    const h = tilesHarness();
    h.set('workCardsByMc', { ...WORK, 'MC-000': [card('orphan', { status: 'pending', urgency: 'Urgent' })] });
    h.set('rows', [deliverable(BIG_MC, 1), { ...deliverable('', 1), mcNumber: '', blob: 'no mc at all' }]);
    expect(h.tiles()).toEqual(BIG_ALONE);
  });
});

/* ---------------------------------------------------------------------- */
/* 4 — ops lanes are counted nowhere on this strip                          */
/* ---------------------------------------------------------------------- */

describe('a card in an excluded lane is counted in NONE of the four', () => {
  it('reads four zeroes for a table whose every card is ops work — the urgent one included', () => {
    /* §7a: an excluded lane is not Frost's work. The cross-cutting figure is
       the one that would leak it — "urgent" reads as a property of a card
       rather than of a lane, so the natural build counts the label before it
       considers the lane, and an urgent ops card then inflates a figure that
       claims to describe Frost's load. Dropped BEFORE anything is counted. */
    const h = tilesHarness();
    h.set('workCardsByMc', { [BIG_MC]: [
      card('x', { status: 'excluded' }),
      card('y', { status: 'excluded', urgency: 'Urgent' }),
    ] });
    h.set('rows', siblings(BIG_MC, 2));
    expect(h.tiles()).toEqual(ZEROED);
  });

  it('leaves its neighbours untouched — the drop is the card, not the MC', () => {
    // the ops card sits under the same MC as countable work; excluding the MC
    // along with the card would silently retire a whole group from the strip
    expect(populated(3).tiles(), 'an ops card took its MC out of the figures with it').toEqual(BOTH);
  });

  it('drops a state the lane mapping does not produce, rather than letting it reach URGENT', () => {
    /* Added by the block 10 review, 2026-09-12. The bucketing was a deny-list:
       drop `excluded`, then test for the three. A state that is none of the four
       — the day a fifth `ListStatus` is added, or a card that reaches the client
       with no status at all — fell past all three buckets and still reached the
       cross-cutting line, so it was counted in NO state while inflating URGENT.
       That breaks the rule the whole strip rests on: a card counted in URGENT is
       ALSO counted in one of the three, never instead of one.

       `classifyList` is total over the four today, so this asserts a property
       rather than a live defect — which is the point of pinning it now. */
    const h = tilesHarness();
    /* The cast is the point, not a convenience: `ListStatus` is a closed union
       here, so TypeScript cannot express the very card this guards against —
       and cannot stop the server sending one either, since the wire is JSON
       that no compiler checks at runtime. */
    const offVocabulary = { status: 'negotiating' } as unknown as Partial<WorkCardRow>;
    h.set('workCardsByMc', { [BIG_MC]: [
      card('n', { ...offVocabulary, urgency: 'Urgent' }),
      card('u', { status: undefined, urgency: 'Urgent' }),
    ] });
    h.set('rows', siblings(BIG_MC, 2));
    expect(h.tiles(), 'an unrecognised state is counted in no tile — URGENT included').toEqual(ZEROED);
  });
});

/* ---------------------------------------------------------------------- */
/* 5 / 6 / 7 — the figures follow the table                                 */
/* ---------------------------------------------------------------------- */

describe('the figures describe what is left on the table, not the project (§8)', () => {
  it('RESCOPES to the filter', () => {
    /* §8 reversing its own former rule. What makes a narrowed figure safe to
       read is the chip row above it: an active axis is always on screen, so a
       rescoped number cannot be mistaken for a project total. */
    const h = populated(4);
    expect(h.tiles(), 'the fixture starts narrowed').toEqual(BOTH);
    h.set('pipeFilters', { ...h.empty(), type: ['Web'] });
    expect(h.tiles(), 'the filter narrowed the table and the strip kept the project total')
      .toEqual(SMALL_ALONE);
  });

  it('RESCOPES to the search', () => {
    /* Ruled the same way and for one reason: the reader cannot tell which
       control narrowed the table, so a strip that followed the filter but not
       the search would be indistinguishable from a broken one. */
    const h = populated(4);
    h.set('searchQ', SMALL_MC.toLowerCase());
    expect(h.rows(), 'the search did not narrow the fixture').toHaveLength(1);
    expect(h.tiles(), 'the search narrowed the table and the strip did not follow').toEqual(SMALL_ALONE);
  });

  it('follows the two TOGETHER, not whichever came last', () => {
    const h = populated(4);
    h.set('searchQ', 'deliverable');
    h.set('pipeFilters', { ...h.empty(), type: ['Web'] });
    expect(h.tiles()).toEqual(SMALL_ALONE);
  });

  it('STAYS at four zeroes when the table empties — it does not leave with the rows', () => {
    /* The empty-table state is one claim about two things, so both are read:
       the table is genuinely gone (the shipped verdict says so) and the strip
       is still four tiles reading zero. A strip that vanished with the table
       would take the reader's only remaining explanation off the page. */
    const h = populated(4);
    h.set('searchQ', 'zzz-nothing-on-this-board-carries-this');
    expect(h.rows(), 'the search matched something after all').toHaveLength(0);
    expect(h.noResults(), 'the table did not reach its empty state').toBe(true);
    expect(h.tiles()).toEqual(ZEROED);
    expect(tilesOf(renderMetrics({ ...ZEROED })), 'the strip drew fewer than four tiles at zero')
      .toHaveLength(4);
  });
});

/* ---------------------------------------------------------------------- */
/* 8 — the last figure cuts ACROSS the first three                          */
/* ---------------------------------------------------------------------- */

describe('the urgent figure is cross-cutting and never a fourth state', () => {
  const EVERY_STATE: Record<string, WorkCardRow[]> = {
    [BIG_MC]: [
      card('p', { status: 'pending' }),
      card('o', { status: 'ongoing' }),
      card('n', { status: 'done' }),
    ],
  };
  const withUrgency = (u: string) => {
    const h = tilesHarness();
    h.set('workCardsByMc', { [BIG_MC]: EVERY_STATE[BIG_MC]!.map((w) => ({ ...w, urgency: u })) });
    h.set('rows', siblings(BIG_MC, 3));
    return h;
  };

  it('counts an urgent card in its state AS WELL, so the three are unchanged by the label', () => {
    /* "A card carrying the label is also pending, ongoing or done, never
        instead of one." Asserted as a DIFFERENCE — the same three cards, the
        label on and off — because the three figures staying put is the claim,
        and a fixture read once cannot show that anything stayed. */
    const quiet = withUrgency('Non-Urgent').tiles();
    const loud = withUrgency('Urgent').tiles();
    expect(quiet).toEqual({ pending: 1, ongoing: 1, done: 1, urgent: 0 });
    expect(loud.pending, 'an urgent card left its state').toBe(quiet.pending);
    expect(loud.ongoing, 'an urgent card left its state').toBe(quiet.ongoing);
    expect(loud.done, 'an urgent card left its state').toBe(quiet.done);
  });

  it('is never ADDED to the three — the strip does not total', () => {
    /* The mirror of the rule above, and the one a reader can check by eye: with
       every card urgent the last figure equals the sum of the first three, and
       the three still count every card exactly once between them. A build that
       treated urgent as a fourth bucket would take those cards OUT of the
       three and the sum would collapse to zero. */
    const loud = withUrgency('Urgent').tiles();
    expect(loud.urgent).toBe(loud.pending + loud.ongoing + loud.done);
    expect(loud.pending + loud.ongoing + loud.done, 'the three stopped partitioning the cards').toBe(3);
  });

  it('reads a card with no urgency field at all as quiet', () => {
    // the wire's own value for the absent label is `Non-Urgent`; a lean read
    // that dropped the field must not promote the card, because urgency here
    // is the presence of one Trello label and nothing else
    const h = tilesHarness();
    h.set('workCardsByMc', { [BIG_MC]: [{ cardId: 'u', name: 'no urgency field', status: 'pending' } as WorkCardRow] });
    h.set('rows', siblings(BIG_MC, 1));
    expect(h.tiles()).toEqual({ pending: 1, ongoing: 0, done: 0, urgent: 0 });
  });
});

/* ---------------------------------------------------------------------- */
/* 9 — under a work-card axis, the strip counts what the table shows        */
/* ---------------------------------------------------------------------- */

describe('a live work-card axis narrows the cards counted, not just the rows', () => {
  /* A work-card axis keeps a GROUP whose child matches, and the open group
     then draws only the matching children. A strip counting the children the
     table is actively hiding has stopped describing the table — so it counts
     through the SAME predicate the group draws with, never a second copy of
     it. The consequence is deliberate and worth stating where it will be
     found: the three states then describe the filtered work, not the MC's
     whole load. */
  const MIXED: Record<string, WorkCardRow[]> = {
    [BIG_MC]: [
      card('h1', { status: 'pending', difficulty: 'Hard' }),
      card('h2', { status: 'ongoing', difficulty: 'Hard' }),
      card('e1', { status: 'pending', difficulty: 'Easy' }),
      card('e2', { status: 'done', difficulty: 'Easy', urgency: 'Urgent' }),
    ],
    [SMALL_MC]: [card('e3', { status: 'ongoing', difficulty: 'Easy' })],
  };
  const harness = () => {
    const h = tilesHarness();
    h.set('workCardsByMc', MIXED);
    h.set('rows', [...siblings(BIG_MC, 5), ...siblings(SMALL_MC, 1)]);
    return h;
  };

  it('counts only the cards the axis admits, dropping the rest of their MC', () => {
    const h = harness();
    expect(h.tiles(), 'the fixture starts narrowed').toEqual({ pending: 2, ongoing: 2, done: 1, urgent: 1 });
    h.set('pipeFilters', { ...h.empty(), difficulty: ['Hard'] });
    expect(h.tiles(), 'the strip counted cards the filtered table is hiding')
      .toEqual({ pending: 1, ongoing: 1, done: 0, urgent: 0 });
  });

  it('drops the cross-cutting figure for a hidden card too', () => {
    /* The urgent card here is Easy. Under a Hard axis the table does not draw
       it, so the strip must not count it — the one place where the
       cross-cutting figure could keep a card alive that every other figure
       has already let go. */
    const h = harness();
    h.set('pipeFilters', { ...h.empty(), difficulty: ['Hard'] });
    expect(h.tiles().urgent).toBe(0);
  });

  it('drops an MC whose every card the axis rejects', () => {
    // that MC is not on the table at all under the axis — no row of it matches
    const h = harness();
    h.set('pipeFilters', { ...h.empty(), difficulty: ['Hard'] });
    expect(h.rows().some((r) => r.mcNumber === SMALL_MC), 'the rejected MC is still on the table').toBe(false);
  });

  it('is NOT narrowed by a main-card axis, which says nothing about a card', () => {
    /* The split §4.1 rules: the filter positions a DELIVERABLE by its main
       card's lane, the strip counts work-card units. A main-card axis removes
       whole groups and must never reach inside a surviving one to thin out its
       cards — the two are correct at once and a reader will be tempted to
       reconcile them. */
    const h = harness();
    h.set('pipeFilters', { ...h.empty(), type: ['Icon'] });
    expect(h.tiles(), 'a main-card axis reached inside a group and filtered its cards')
      .toEqual({ pending: 2, ongoing: 2, done: 1, urgent: 1 });
  });
});

/* ---------------------------------------------------------------------- */
/* 10 — the project totals are gone, not merely unrendered                  */
/* ---------------------------------------------------------------------- */

describe('the retired project-total computed is gone from the shipped client', () => {
  it('no longer exists as a computed, and nothing in the template reads it', () => {
    /* The "field is really gone" idiom, at the depth that matters. A computed
       left behind while its tiles were removed is an un-rendered arithmetic
       over live state: it costs a pass on every dependency change, it answers
       a question nobody asked any more, and it is one template edit away from
       being back on screen under a green suite. */
    expect(() => method('pipeTiles'), 'the strip has no computed at all').not.toThrow();
    expect(() => method('kpi'), 'the retired project-total computed is still in the shipped scripts').toThrow();
    expect(APP_JS, 'the retired computed is still named somewhere in the client').not.toMatch(/\bkpi\b/);
    expect(TEMPLATE, 'a tile still reads the retired computed').not.toContain('{{kpi.');
  });

  it('did not survive as fields on the computed that replaced it', () => {
    /* The other way back: the four figures acquire a fifth and a sixth, the
       reconciliation totals return as fields of the strip's own computed, and
       the tab grows two tiles nobody ruled on. The strip returns four numbers
       and they are named here — read off the comment-free corpus, so the
       reasoning above the computed can go on describing what was dropped. */
    const body = method('pipeTiles', APP_JS_CODE);
    expect(body, 'a retired project total came back as a field of the strip computed')
      .not.toMatch(/\b(main|work|unattached|unattachedMcs|open)\s*:/);
    for (const field of ['pending', 'ongoing', 'done', 'urgent']) {
      expect(body, `the strip computed no longer produces ${field}`).toContain(field);
    }
  });

  it('keeps the ingestion figure the server still derives out of the strip', () => {
    /* The unattached count is still on the wire and still drawn — on Sprint
       Schedules, straight from the loader state. What must not come back is a
       Pipeline tile reading it: the warning has one home now, and two homes is
       how the two drift apart. */
    expect(divFragment('<div class="metrics">', tabViewCode('pipeline')), 'the ingestion warning is back on the strip')
      .not.toContain('unattached');
  });
});
