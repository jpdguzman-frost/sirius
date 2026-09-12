/*
 * Sections H–I and the two colour sections of test/pipeline-expanded.test.ts
 * (split 2026-09-05): the work-card urgency/difficulty writes, the URGENT and
 * UNATTACHED metrics, and the tile colours. Describes moved verbatim.
 *
 * AMENDED 2026-09-07 (owl #81, Miles): OPEN WORK is off the strip. It counted
 * the incomplete-card set of build-spec §4.4, and §4.4 is withdrawn whole —
 * so the tile, its blue recipe, the `open` figure in the kpi computed and the
 * `corrections` state it counted are all gone, and the guard that pinned them
 * is now the guard that they stay gone. The colour RULE #69 established (a
 * coloured tile colours the label as well as the figure) outlived its first
 * tile and is asserted over the two modifiers that remain.
 *
 * AMENDED 2026-09-12, block 10 (owls #91/#92/#93, build spec v1.4 §4.0/§8):
 * the strip was replaced WHOLE. The project-total computed these describes
 * executed no longer exists; four rescoped work-card figures took its place.
 * Three consequences, each handled below rather than deleted:
 *   - the URGENT population is now the RESCOPED one, and D3's "orphans
 *     included" reading is REVERSED — work under an MC with no row on the
 *     table is reachable from no key in the new walk, by design.
 *   - the UNATTACHED tile is retired, and its two rules go with it: hide-at-
 *     zero (owl #61) and the tooltip that carried the consequence (owl #48).
 *     That describe is now the guard that neither comes back HERE — the
 *     warning itself survives on Sprint Schedules and is asserted to.
 *   - the modifier set grew from two to four.
 * The strip's own arithmetic — the by-MC walk, the excluded lanes, the
 * rescoping and the cross-cutting rule — lives in test/pipeline-tiles.test.ts
 * with the harness that executes it. What stays here is what this file has
 * always owned: the two enumerated writes, the urgency POPULATION, the
 * retirements, and the colour rules.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  COMPUTED_CTX_JS,
  PIPELINE_CSS,
  TEMPLATE,
  TOKENS_CSS,
  type WorkCardRow,
  cssRule,
  divFragment,
  handlerBody,
  method,
  pipeRecipeDecls,
  renderMetrics,
  stampRows,
  tabViewCode,
} from './helpers/gantt-render.ts';

/* ---------------------------------------------------------------------- */
/* H — owl #78 §1: W1 and W3 write to the WORK CARD                         */
/* ---------------------------------------------------------------------- */

describe('the urgency and difficulty writes address a WORK card, and only that', () => {
  /* THE DEFECT #78 reported, in shipped code: "every urgency and difficulty
     write happening now lands on the wrong object." A website request can
     carry an urgent screen and non-urgent assets, so one value on the parent
     cannot be true. The two enumerated writes are RE-POINTED, not widened —
     a deliverable-scoped route left dormant beside the new one is how a defect
     like this survives its own fix, so the old URL must be absent from the
     client entirely, not merely unreached. */
  const HALVES = [
    ['chooseUrgency', 'urgency'],
    ['chooseDifficulty', 'difficulty'],
  ] as const;

  it('PATCHes /workcards/, and names /deliverables/ in neither handler', () => {
    for (const [h, path] of HALVES) {
      const body = handlerBody(h);
      expect(body, `${h} no longer PATCHes`).toContain("api.send('PATCH'");
      expect(body, `${h} writes the wrong card kind`).toContain(`/workcards/\${cardId}/${path}`);
      expect(body, `${h} still has a deliverable-scoped URL`).not.toContain('/deliverables/');
    }
    // and the retired URLs are gone from the whole shipped bundle, comments
    // and all — the concatenated `<script>` is one scope (test/helpers/source.ts)
    expect(APP_JS).not.toContain('/deliverables/${cardId}/urgency');
    expect(APP_JS).not.toContain('/deliverables/${cardId}/difficulty');
  });

  it('applies and rolls back on the WORK-CARD store, not on the deliverable rows', () => {
    /* invariant 8 unchanged, re-pointed: the optimistic set lands before the
       network call and the revert after it, and BOTH go through
       `patchWorkCard`. Left on `patchRow`, the badge would flip on a main row
       that no longer draws one — a write with no visible subject. */
    for (const [h] of HALVES) {
      const body = handlerBody(h);
      expect(body, `${h} does not patch the work-card store`).toContain('patchWorkCard(cardId');
      expect(body, `${h} still patches a deliverable row`).not.toContain('patchRow(cardId');
      expect(body.indexOf('patchWorkCard(cardId'), h).toBeLessThan(body.indexOf('api.send'));
      expect(body.lastIndexOf('patchWorkCard(cardId'), `${h} never reverts`).toBeGreaterThan(body.indexOf('api.send'));
    }
  });

  it('re-reads the server after a successful write — BOTH halves, not just difficulty', () => {
    /* 2026-09-05 review finding 1. The optimistic `patchWorkCard` moves the
       client's own copy of the card and nothing else, but the Sprint Schedules
       row chip and the Pipeline metric tile above the table are DERIVED
       server-side, per row — so a write that skips the re-read leaves them
       stating the previous value until the next load. Difficulty already
       re-read (the sprint bar re-keys on it) and the deadline write does too;
       urgency was the odd one out. Asserted as ORDER, not presence: a
       `loadAll()` before the PATCH would prove nothing. */
    for (const [h] of HALVES) {
      const body = handlerBody(h);
      expect(body, `${h} never re-reads`).toContain('await loadAll()');
      expect(body.indexOf('await loadAll()'), `${h} re-reads before it writes`).toBeGreaterThan(body.indexOf('api.send('));
    }
  });
});

/* ---------------------------------------------------------------------- */
/* H2 — owl #78 §1 / D3: the URGENT figure counts WORK cards                 */
/* ---------------------------------------------------------------------- */

describe('the urgent figure counts urgent WORK cards, over the rows on the table', () => {
  /* EXECUTED, not read: a source assertion could show the computed reaching
     for `workCardsByMc` without showing it ever produces a different number
     from the old main-card count. The idiom is the executed-computed one this
     suite's siblings use (`method()` out of the shipped scripts, a `get` that
     serves the plain data the computed reads).

     WHICH population it means was unruled when #78 asked, and D3 answered it
     project-wide, orphans included, to match the column beneath. Block 10
     REVERSES that half: §8 rescopes every figure on the strip to the rows
     search and filter have left, so the population is the distinct MCs on the
     table, and work belonging to no row belongs to no figure. Its own home is
     ingestion health (§4.0) — and §2.6, where the spec sends it, has never
     been written, which is why nothing here counts it instead.

     Scoped to the POPULATION question, which is this file's. How the walk
     itself behaves — once per MC, ops lanes dropped, the filter and the search
     followed — is test/pipeline-tiles.test.ts's, beside the harness. */
  const tiles = (over: Record<string, unknown>) =>
    new Function('stampRows', 'OVER', `
      ${pipeRecipeDecls()}
      const computed = { ${['pipeSearched', 'pipeSortDef', 'pipelineRows', 'pipeWorkLive', 'pipeTiles'].map((n) => method(n)).join(', ')} };
      const DATA = { rows: [], searchQ: '', pipeFilters: PIPE_FILTERS_EMPTY(), pipeSort: null, workCardsByMc: {}, ...OVER };
      DATA.rows = stampRows(DATA.rows, DATA.workCardsByMc);
      ${COMPUTED_CTX_JS}
      return computed.pipeTiles.call(ctx);
    `)(stampRows, over) as { pending: number; ongoing: number; done: number; urgent: number };

  /** a work card as the wire carries it, in a lane so the state figures see it too */
  const wc = (cardId: string, urgency: string): WorkCardRow =>
    ({ cardId, name: `work ${cardId}`, status: 'pending', urgency } as WorkCardRow);

  it('reads ZERO for an urgent MAIN card whose work cards are all quiet', () => {
    /* the exact state the defect produced: the label sits on the parent, the
       tile counted it, and nothing a reader can see on the table agrees.
       The state figure is read alongside, so a zero here cannot come from the
       cards being dropped from the walk altogether — they ARE counted, and
       only the parent's label is not. */
    const out = tiles({
      rows: [{ cardId: 'main-1', mcNumber: 'MC-837', urgency: 'Urgent' }],
      workCardsByMc: { 'MC-837': [wc('t1', 'Non-Urgent'), wc('t2', 'Non-Urgent')] },
    });
    expect(out.urgent).toBe(0);
    expect(out.pending, 'the two work cards were dropped from the walk entirely').toBe(2);
  });

  it('reads TWO for two urgent work cards under one MC', () => {
    expect(tiles({
      rows: [{ cardId: 'main-1', mcNumber: 'MC-837', urgency: 'Non-Urgent' }],
      workCardsByMc: { 'MC-837': [wc('t1', 'Urgent'), wc('t2', 'Urgent'), wc('t3', 'Non-Urgent')] },
    }).urgent).toBe(2);
  });

  it('REVERSES D3 — an urgent card under an MC with no row is counted nowhere', () => {
    /* D3 included orphans so the two tiles beside it could not disagree about
       what the board held; block 10 retired both of those tiles, and §8
       replaced the question. The figure describes the table now, and that card
       is not on the table. The pair below is the whole rule: the same card,
       counted once its MC has a row and not at all while it has none. */
    const orphan = { 'MC-999': [wc('t9', 'Urgent')] };
    expect(tiles({ rows: [], workCardsByMc: orphan }).urgent).toBe(0);
    expect(tiles({ rows: [{ cardId: 'main-9', mcNumber: 'MC-999' }], workCardsByMc: orphan }).urgent).toBe(1);
  });

  it('treats a card with no urgency at all as quiet, not as urgent', () => {
    // the wire defaults to 'Non-Urgent', but a lean read that missed the field
    // must not promote the card — absence is the absence of the Urgent label
    expect(tiles({
      rows: [{ cardId: 'main-1', mcNumber: 'MC-837' }],
      workCardsByMc: { 'MC-837': [{ cardId: 't1', name: 'no urgency field', status: 'pending' }] },
    }).urgent).toBe(0);
  });
});

/* ---------------------------------------------------------------------- */
/* I — owl #61's tile is RETIRED, and so are the two rules it carried        */
/* ---------------------------------------------------------------------- */

describe('the UNATTACHED tile and both of its rules are off the Pipeline strip', () => {
  /* WHAT DIED WITH THE TILE, said where the next reader will look for it.
     This describe used to assert three things about a fourth tile: that it
     drew the orphaned work, that it HID ITSELF AT ZERO (owl #61 — "a
     permanent zero teaches people to stop reading it"), and that its tooltip
     carried the CONSEQUENCE rather than the number (owl #48 — the cards are
     counted in no week's capacity, so planned load reads light).

     Block 10 retires the tile, and both rules retire with it. They are not
     rules of the strip and must not be carried onto the four figures that
     replaced it: those are unconditional by ruling (§8, a zero is a truthful
     answer) and none of them carries a tooltip, because a figure that needs a
     sentence to be readable is the wrong figure.

     THE FACT ITSELF IS NOT LOST. The server still derives the count, and
     Sprint Schedules still draws it from the loader state with the same
     consequence in the same voice. That is now its ONE home — asserted here,
     because retiring the tile is only safe while the other one stands. */

  it('draws no such tile, at any value, and no tooltip anywhere on the strip', () => {
    const markup = renderMetrics({ pending: 10, ongoing: 45, done: 4, urgent: 1 });
    expect(markup).not.toContain('UNATTACHED');
    expect(markup, 'a figure on the strip needs a sentence to be readable').not.toContain('title=');
  });

  it('leaves NO quiet recipe behind for the tile to come back to', () => {
    /* declarations only: a prose comment naming a retired modifier is history
       being kept, not a treatment (test/CLAUDE.md rule 3). The same reason the
       withdrawn `.blue` rule was removed rather than orphaned — a dead
       selector reads as a live treatment to the next person pricing a change.
       `.metric.warn` stays asserted gone too: #79 ruled "do not restore a
       warning colour here", and it outlived the tile it was ruled about. */
    const declarations = PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(declarations, 'the retired tile kept its recipe').not.toContain('.metric.quiet');
    expect(declarations, 'a warning colour came back to the strip').not.toContain('.metric.warn');
  });

  it('keeps the warning itself alive on Sprint Schedules, with its consequence', () => {
    /* Not a copy of the sentence — the SHAPE of it: the count, the fact that
       these belong to no week, and where it gets fixed. A tab that kept the
       number and dropped the consequence would leave the reader with trivia. */
    expect(TEMPLATE).toContain('unattachedWork.cards');
    const tip = /title="([^"]*)"/.exec(TEMPLATE.slice(TEMPLATE.indexOf('cwunattached')))![1]!;
    expect(tip).toContain('no main card');
    expect(tip).toMatch(/counted in no week/i);
    expect(tip).toContain('Trello'); // where it gets fixed — at source, not here
  });
});

/* ------------------------------------------------------------------ */
/* URGENCY SPEAKS WITH ONE COLOUR — owls #78/#79                       */
/* nodes 843:125889 (strip) · 842:125808 (badge) · I833:40013;40:4853  */
/* ------------------------------------------------------------------ */

describe('the Pipeline urgency colour set is amber, tile and badge alike', () => {
  const tiles = { pending: 10, ongoing: 45, done: 4, urgent: 3 };

  it('paints the URGENT tile amber-600 on BOTH text nodes, not red', () => {
    /* SUPERSEDES the `.metric.red` reading the tile shipped with (and the
       annotation `28:3666`'s "URGENT (red)"). #78 §6 flagged the inconsistency
       — the tile was red while the badge under it is amber-600 — and #79 ruled
       it closed: "URGENT tile is now #D97706, overline and figure both,
       matching the Urgent badge exactly. Do not revert the tile to red."
       Pipeline gets its OWN modifier so Deadlines' URGENT tile, which #79
       leaves alone, keeps `.red`. Block 10 rebuilt the strip around it and
       left this tile alone, which is why the ruling reads unchanged. */
    expect(renderMetrics(tiles)).toContain('class="metric urgent"');
    expect(renderMetrics(tiles), 'the Pipeline strip went back to red').not.toContain('class="metric red"');
    const rule = cssRule('.metrics .metric.urgent .mlabel, .metrics .metric.urgent .mvalue', PIPELINE_CSS);
    expect(rule).toContain('var(--amber-600)');
    expect(TOKENS_CSS).toContain('--amber-600:');
    // one colour, tile and badge: the same token the Urgent badge fills with
    expect(cssRule('.ubadge.urgent', PIPELINE_CSS)).toContain('var(--amber-600)');
  });

  it('gives Urgent and Non-Urgent ONE footprint, so the column cannot reflow', () => {
    /* #79: "Same footprint on both, so the column does not reflow when a
       card's urgency changes." Node 842:125808 is 96 × 25; the variants may
       change paint and nothing else, which is why the box lives on the base
       class alone.

       AN ALLOW-LIST, not a deny-list (2026-09-05 review). Naming the three
       properties that were known to resize the badge left every other one
       through: `border-width`, `letter-spacing`, `line-height`, `zoom`, a
       `font:` shorthand — each changes the rendered box and none matched.
       Listing what a variant MAY set is closed by construction, and it states
       the actual rule: a variant paints, it does not measure. */
    const ALLOWED = ['background', 'border-color', 'border-style', 'color'];
    /** the property NAMES a rule declares — `cssRule` hands back selector and
        braces too, so the block comes out before the split */
    const propsOf = (sel: string): string[] => {
      const rule = cssRule(sel, PIPELINE_CSS);
      return rule
        .slice(rule.indexOf('{') + 1, rule.lastIndexOf('}'))
        .split(';')
        .map((d) => d.split(':')[0]!.trim())
        .filter(Boolean);
    };
    expect(cssRule('.ubadge', PIPELINE_CSS)).toContain('width: 96px');
    for (const v of ['.ubadge.urgent', '.ubadge.nonurgent, .ubadge.unset']) {
      const props = propsOf(v);
      expect(props.length, `${v} declares nothing`).toBeGreaterThan(0);
      for (const p of props) expect(ALLOWED, `${v} sets "${p}", which is not paint`).toContain(p);
    }
    /* The difficulty pill wears `.ubadge` too — the rendered work-row cell is
       `pbadge ubadge d-…`, asserted where the row is rendered — so that ONE
       rule sizes both columns and they line up down the table. It also carried
       a column-scoped box of its own until the 2026-09-05 simplification pass;
       a second width rule can only drift from this one, so its ABSENCE is what
       is asserted here, not a copy of the width in two places. */
    expect(PIPELINE_CSS, 'a column-scoped difficulty-badge box came back')
      .not.toMatch(/\.col-diff\s+\.pbadge[^{}]*\{[^}]*width/);
  });

  it('fills Urgent solid amber-600 with an amber-50 label, exactly as the node draws it', () => {
    /* The node wins over the annotation prose twice here: #79's text says
       "white label", the node's label AND chevron are #FFFBEB (amber-50); and
       there is NO stroke, so the border takes the fill's own colour rather
       than a contrasting one. The chevron inherits `currentColor`, which is
       why one `color` covers both. */
    const rule = cssRule('.ubadge.urgent', PIPELINE_CSS);
    expect(rule).toContain('background: var(--amber-600)');
    expect(rule).toContain('border-color: var(--amber-600)');
    expect(rule).toContain('color: var(--amber-50)');
    expect(rule, 'the red-300/destructive dress survived').not.toContain('red');
  });

  it('draws Non-Urgent as an ABSENCE, one step above the row it sits on', () => {
    /* Two rulings in one rule. The DASH (#78 §6): Trello has an Urgent label
       and none meaning not urgent, so Urgent asserts a value and Non-Urgent
       draws its absence — a solid grey outline would assert a value the data
       does not hold. The FILL: slate-100, not the slate-50 Deadlines uses,
       because a work row's own ground is slate-50 and a slate-50 badge
       vanishes into it. "Keep the badge one step above whatever it sits on." */
    const rule = cssRule('.ubadge.nonurgent, .ubadge.unset', PIPELINE_CSS);
    expect(rule).toContain('border-style: dashed');
    expect(rule).toContain('border-color: var(--slate-400)');
    expect(rule).toContain('background: var(--slate-100)');
    expect(rule, 'the badge went back to the row’s own slate-50').not.toContain('var(--slate-50)');
    // and the row underneath is what makes that necessary
    expect(cssRule('.ptable tr.ptask td', PIPELINE_CSS)).toContain('background: var(--slate-50)');
  });

  it('draws Easy as green-100 behind a green-600 label', () => {
    /* SUPERSEDES owl #04's "50 fill / 500 text" difficulty recipe. Node
       `I833:40013;40:4853` reads fill #DCFCE7 (green-100), stroke #22C55E
       (green-500) and label #16A34A (green-600) — the label is the term #04
       had wrong. Medium and Hard rest on the Badge component set's
       Outline/Notice and Outline/Negative variants because the frame
       instantiates only Easy; that pairing is INFERRED from today's colour
       families and is flagged to Miles (D10), so it is asserted as the built
       recipe rather than as a ruling. */
    const easy = cssRule('.pbadge.d-Easy', PIPELINE_CSS);
    expect(easy).toContain('background: var(--green-100)');
    expect(easy).toContain('border-color: var(--green-500)');
    expect(easy).toContain('color: var(--green-600)');
    expect(easy, 'the #04 recipe came back').not.toContain('var(--green-50)');
    expect(TOKENS_CSS).toContain('--green-100:');
    expect(cssRule('.pbadge.d-Medium', PIPELINE_CSS)).toContain('var(--amber-100)');
    expect(cssRule('.pbadge.d-Hard', PIPELINE_CSS)).toContain('var(--red-50)');
  });
});

/* ------------------------------------------------------------------ */
/* The metric strip — what is NOT on it, at three depths                */
/* ------------------------------------------------------------------ */

describe('the strip counts four things, and none of them is a project total', () => {
  const tiles = { pending: 10, ongoing: 45, done: 4, urgent: 1 };

  /* THE RULINGS, stacked. Owl #81 (2026-09-07) took OPEN WORK off: it counted
     `corrections`, the incomplete-card set build-spec §4.4 described, and §4.4
     is withdrawn whole. Owls #91–#93 (2026-09-10) then replaced the rest — the
     two reconciliation totals and the ingestion warning are dropped from this
     tab, and four work-card figures stand in their place.

     This is the negation of every guard that ever stood here, asserted at the
     three depths a retired tile can come back at on its own: the rendered
     strip, the computed that feeds it, and the state the computed counts.
     The POSITIVE half — four tiles, in order, unconditional, correctly
     coloured — is test/pipeline-tiles.test.ts's. */

  it('renders PENDING · ONGOING · DONE · URGENT and none of the four retired labels', () => {
    const markup = renderMetrics(tiles);
    for (const gone of ['OPEN WORK', 'MAIN CARDS', 'WORK CARDS', 'UNATTACHED CARDS']) {
      expect(markup, `${gone} is back on the strip`).not.toContain(gone);
    }
    expect(markup, 'the withdrawn tile came back under another word').not.toContain('metric blue');
    for (const label of ['PENDING', 'ONGOING', 'DONE', 'URGENT']) {
      expect(markup, `${label} left the strip`).toContain(label);
    }
  });

  it('draws its fourth tile ALWAYS — the conditional one retired with owl #61', () => {
    // what used to make "four" a count of what a fixture happened to carry is
    // now a property of the strip: nothing on it is conditional, so the same
    // four tiles render at every value, a full set of zeroes included
    for (const fixture of [tiles, { pending: 0, ongoing: 0, done: 0, urgent: 0 }]) {
      expect([...renderMetrics(fixture).matchAll(/class="metric /g)]).toHaveLength(4);
    }
  });

  it('stops computing the retired figures, and stops holding the state they counted', () => {
    /* Deeper than the markup: a tile removed from the template while the
       computed still counted a state key nobody filled would ship a silent
       arithmetic over an empty array, ready for the next reader to re-surface.
       Read off the comment-free corpus so the reasoning above the computed can
       go on naming what was dropped (test/CLAUDE.md rule 3). */
    const body = method('pipeTiles', APP_JS_CODE);
    expect(body, 'OPEN WORK came back as a figure of the strip computed').not.toMatch(/\bopen\s*:/);
    expect(APP_JS, 'the client still holds a `corrections` array').not.toContain('corrections');
    // the two reconciliation totals and the ingestion count are the block-10
    // half of the same rule, asserted beside the computed in
    // test/pipeline-tiles.test.ts rather than restated here
  });

  it('leaves NO .blue tile recipe behind for it to come back to', () => {
    // dead selectors read as a live treatment to the next person pricing a
    // change — the whole reason the withdrawn rules are removed, not orphaned
    expect(PIPELINE_CSS, 'the OPEN WORK tile colour outlived the tile')
      .not.toMatch(/\.metric\.blue/);
  });

  it('reads ONE computed, and the tab reads no other figure source', () => {
    /* The strip is one computed's four fields. A tile wired to a second source
       — a loader field, a server count — would render perfectly and rescope
       with nothing, which is the failure §8 is about. */
    const strip = divFragment('<div class="metrics">', tabViewCode('pipeline'));
    const reads = [...strip.matchAll(/\{\{([a-zA-Z]+)\.([a-zA-Z]+)\}\}/g)];
    expect(reads.length, 'no figure is read at all — the tiles draw literals').toBe(4);
    expect([...new Set(reads.map((m) => m[1]!))]).toEqual(['pipeTiles']);
  });
});

/* ------------------------------------------------------------------ */
/* Tile colour pairs the label with the figure — owl #69              */
/* ------------------------------------------------------------------ */

describe('a coloured metric tile colours the LABEL as well as the figure', () => {
  const tiles = { pending: 10, ongoing: 45, done: 4, urgent: 1 };

  /* THE RULE, not this tile. #69 says "both text nodes take the colour" and
     says it twice, because the natural build is to colour only the 32px
     figure — which leaves a blue number under a slate-900 label and reads as
     a rendering fault rather than a treatment. Asserted over every modifier
     the shipped markup actually uses, so the next coloured tile is covered
     the day it is added and nobody has to remember this file exists. */
  it('EVERY metric modifier in the shipped markup pairs .mlabel with .mvalue', () => {
    const markup = renderMetrics(tiles);
    const modifiers = [...markup.matchAll(/class="metric ([a-z]+)"/g)].map((m) => m[1]!);
    expect(new Set(modifiers).size, 'no coloured tiles rendered — the guard would pass vacuously')
      .toBeGreaterThan(1);
    /* #69's promise was that the NEXT coloured tile is covered the day it is
       added, and this is the third time it has come due: #78/#79 brought
       `urgent` and `quiet`, and owls #91–#93 replaced the whole strip with
       four coloured tiles at once — every one of which lands inside this walk
       rather than beside it, with no edit to the loop below. The set is named
       explicitly so a renamed or dropped modifier fails HERE instead of
       quietly leaving the pairing rule uncovered, and it is the complete set:
       an uncoloured fifth tile would fail it too, which is the point. */
    expect([...new Set(modifiers)].sort()).toEqual(['done', 'ongoing', 'pending', 'urgent']);

    for (const mod of new Set(modifiers)) {
      const selector = `.metrics .metric.${mod} .mlabel, .metrics .metric.${mod} .mvalue`;
      const rule = cssRule(selector, PIPELINE_CSS);
      expect(rule, `.metric.${mod} colours one node but not both — see owl #69`).toBeTruthy();
      expect(rule).toMatch(/color:/);
    }
  });
});
