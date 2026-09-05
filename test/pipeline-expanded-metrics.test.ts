/*
 * Sections H–I and the two colour sections of test/pipeline-expanded.test.ts
 * (split 2026-09-05): the work-card urgency/difficulty writes, the URGENT and
 * UNATTACHED metrics, and the amber/blue tile colours. Describes moved
 * verbatim.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  PIPELINE_CSS,
  TOKENS_CSS,
  cssRule,
  handlerBody,
  method,
  renderMetrics,
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
/* H2 — owl #78 §1 / D3: the URGENT tile counts WORK cards                  */
/* ---------------------------------------------------------------------- */

describe('the URGENT tile counts urgent WORK cards, project-wide', () => {
  /* EXECUTED, not read: a source assertion could show the computed reaching
     for `workCardsByMc` without showing it ever produces a different number
     from the old main-card count. The idiom is the executed-computed one this
     suite's siblings use (`method()` out of the shipped scripts, a `get` that
     serves the plain data the computed reads).

     WHICH population "urgent" means was never ruled — the frame gives the tile
     no definition beyond the word — so D3 reads it project-wide, orphans
     included, matching the population the column now shows. Asked of Miles;
     one line changes if he wants attached cards only. */
  const kpi = (over: Record<string, unknown>) =>
    new Function('DATA', `
      const computed = { ${method('kpi')} };
      return computed.kpi.call({ get: (k) => DATA[k] });
    `)({
      rows: [], workCardsByMc: {}, corrections: [],
      unattachedWork: { cards: 0, mcNumbers: [] },
      ...over,
    }) as { urgent: number; main: number; work: number };

  const wc = (cardId: string, urgency: string) => ({ cardId, urgency });

  it('reads ZERO for an urgent MAIN card whose work cards are all quiet', () => {
    /* the exact state the defect produced: the label sits on the parent, the
       tile counted it, and nothing a reader can see on the table agrees. */
    const out = kpi({
      rows: [{ cardId: 'main-1', mcNumber: 'MC-837', urgency: 'Urgent' }],
      workCardsByMc: { 'MC-837': [wc('t1', 'Non-Urgent'), wc('t2', 'Non-Urgent')] },
    });
    expect(out.urgent).toBe(0);
    expect(out.main, 'MAIN CARDS still counts rows').toBe(1);
    expect(out.work, 'WORK CARDS still counts every work card').toBe(2);
  });

  it('reads TWO for two urgent work cards under one MC', () => {
    expect(kpi({
      rows: [{ cardId: 'main-1', mcNumber: 'MC-837', urgency: 'Non-Urgent' }],
      workCardsByMc: { 'MC-837': [wc('t1', 'Urgent'), wc('t2', 'Urgent'), wc('t3', 'Non-Urgent')] },
    }).urgent).toBe(2);
  });

  it('counts an urgent card under an MC with no row at all (D3 — orphans included)', () => {
    /* `work` above has always totalled these (owl #61), so excluding them here
       would make the two tiles disagree about what the board holds. */
    expect(kpi({ rows: [], workCardsByMc: { 'MC-999': [wc('t9', 'Urgent')] } }).urgent).toBe(1);
  });

  it('treats a card with no urgency at all as quiet, not as urgent', () => {
    // the wire defaults to 'Non-Urgent', but a lean read that missed the field
    // must not promote the card — absence is the absence of the Urgent label
    expect(kpi({ workCardsByMc: { 'MC-837': [{ cardId: 't1' }] } }).urgent).toBe(0);
  });
});

/* ---------------------------------------------------------------------- */
/* I — owl #61: work that belongs to no row and no week                     */
/* ---------------------------------------------------------------------- */

describe('the UNATTACHED metric states work that is absent from capacity', () => {
  const kpi = (over: Record<string, unknown> = {}) => ({
    main: 10, work: 45, open: 3, urgent: 1, unattached: 35, unattachedMcs: 11, ...over,
  });

  it('renders the tile with the count when there is unattached work', () => {
    const html = renderMetrics(kpi());
    // owl #79 / D8: the node's own string is UNATTACHED CARDS, not UNATTACHED
    expect(html).toContain('UNATTACHED CARDS');
    expect(html).toContain('>35</span>');
  });

  it('HIDES at zero — a permanent zero teaches people to stop reading it', () => {
    expect(renderMetrics(kpi({ unattached: 0, unattachedMcs: 0 }))).not.toContain('UNATTACHED');
    // the four standing metrics are untouched by its absence
    expect(renderMetrics(kpi({ unattached: 0 }))).toContain('MAIN CARDS');
    expect(renderMetrics(kpi({ unattached: 0 }))).toContain('URGENT');
  });

  it('carries the CONSEQUENCE in its tooltip, not just the number', () => {
    /* the count alone is trivia; "counted in NO week's capacity" is the thing
       that tells a PM their planned load reads lighter than the real work */
    const tip = /title="([^"]*)"/.exec(renderMetrics(kpi()))![1]!;
    expect(tip).toContain('no main card');
    // apostrophes come back HTML-escaped from toHTML(), so match around one
    expect(tip).toMatch(/counted in NO week/i);
    expect(tip).toContain('Trello'); // where it gets fixed — at source, not here
  });

  it('pluralises both counts rather than printing "1 cards across 1 MC numbers"', () => {
    const tip = (n: number, mcs: number) =>
      /title="([^"]*)"/.exec(renderMetrics(kpi({ unattached: n, unattachedMcs: mcs })))![1]!;
    expect(tip(1, 1)).toContain('1 task card across 1 MC number ');
    expect(tip(35, 11)).toContain('35 task cards across 11 MC numbers ');
  });

  it('wears the QUIETEST voice on the strip — slate-400, and never a warning again', () => {
    /* SUPERSEDES owl #61's amber-700 reading, which this test used to pin.
       Owl #79 (node 843:125895, #94A3B8 on both text nodes) demoted the tile:
       unattached cards are a condition of the DATA, not of the work, and amber
       sat one shade from URGENT — two adjacent tiles competing in the same warm
       family while answering unrelated questions. The tooltip carries the
       consequence (#48's reasoning, asserted above); the tile carries the
       number. #61's hide-at-zero rule is untouched and still asserted above.

       "Do not restore a warning colour here" is the ruling, so the OLD
       modifier is asserted gone from the stylesheet rather than merely unused:
       a live `.metric.warn` rule is exactly how the amber comes back, one
       template edit later, under a green suite. */
    expect(renderMetrics(kpi())).toContain('class="metric quiet"');
    const rule = cssRule('.metrics .metric.quiet .mlabel, .metrics .metric.quiet .mvalue', PIPELINE_CSS);
    expect(rule).toContain('var(--slate-400)');
    expect(TOKENS_CSS).toContain('--slate-400:');
    // the help cursor moved with the modifier — the tooltip IS the tile's point
    expect(cssRule('.metrics .metric.quiet .mvalue', PIPELINE_CSS)).toContain('cursor: help');
    // declarations only: a prose comment naming the retired modifier is history
    // being kept, not a treatment (test/CLAUDE.md rule 3)
    expect(PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ')).not.toContain('.metric.warn');
    expect(renderMetrics(kpi())).not.toContain('class="metric warn"');
  });
});

/* ------------------------------------------------------------------ */
/* URGENCY SPEAKS WITH ONE COLOUR — owls #78/#79                       */
/* nodes 843:125889 (strip) · 842:125808 (badge) · I833:40013;40:4853  */
/* ------------------------------------------------------------------ */

describe('the Pipeline urgency colour set is amber, tile and badge alike', () => {
  const kpi = { main: 10, work: 45, open: 4, urgent: 3, unattached: 0, unattachedMcs: 0 };

  it('paints the URGENT tile amber-600 on BOTH text nodes, not red', () => {
    /* SUPERSEDES the `.metric.red` reading the tile shipped with (and the
       annotation `28:3666`'s "URGENT (red)"). #78 §6 flagged the inconsistency
       — the tile was red while the badge under it is amber-600 — and #79 ruled
       it closed: "URGENT tile is now #D97706, overline and figure both,
       matching the Urgent badge exactly. Do not revert the tile to red."
       Pipeline gets its OWN modifier so Deadlines' URGENT tile, which #79
       leaves alone, keeps `.red`. */
    expect(renderMetrics(kpi)).toContain('class="metric urgent"');
    expect(renderMetrics(kpi), 'the Pipeline strip went back to red').not.toContain('class="metric red"');
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
/* OPEN WORK goes blue — owl miles→jp #69, node 731:100892             */
/* ------------------------------------------------------------------ */

describe('a coloured metric tile colours the LABEL as well as the figure', () => {
  const kpi = { main: 10, work: 45, open: 4, urgent: 1, unattached: 0, unattachedMcs: 0 };

  it('OPEN WORK carries blue/500', () => {
    expect(renderMetrics(kpi)).toContain('class="metric blue"');
    const rule = cssRule('.metrics .metric.blue .mlabel, .metrics .metric.blue .mvalue', PIPELINE_CSS);
    expect(rule).toContain('var(--blue-500)');
    // that the token EXISTS, not what it is worth: pinning the hex here would
    // fail on a palette retune that has nothing to do with this tile
    expect(TOKENS_CSS).toContain('--blue-500:');
  });

  /* THE RULE, not this tile. #69 says "both text nodes take the colour" and
     says it twice, because the natural build is to colour only the 32px
     figure — which leaves a blue number under a slate-900 label and reads as
     a rendering fault rather than a treatment. Asserted over every modifier
     the shipped markup actually uses, so the next coloured tile is covered
     the day it is added and nobody has to remember this file exists. */
  it('EVERY metric modifier in the shipped markup pairs .mlabel with .mvalue', () => {
    const markup = renderMetrics({ ...kpi, unattached: 35, unattachedMcs: 11 });
    const modifiers = [...markup.matchAll(/class="metric ([a-z]+)"/g)].map((m) => m[1]!);
    expect(new Set(modifiers).size, 'no coloured tiles rendered — the guard would pass vacuously')
      .toBeGreaterThan(1);
    /* #69's promise was that the NEXT coloured tile is covered the day it is
       added, and owls #78/#79 are that day: `urgent` and `quiet` are the two
       modifiers they introduce, and both must be inside this walk rather than
       beside it. Named explicitly so a renamed modifier fails here instead of
       quietly leaving the pairing rule uncovered. */
    expect([...new Set(modifiers)].sort()).toEqual(['blue', 'quiet', 'urgent']);

    for (const mod of new Set(modifiers)) {
      const selector = `.metrics .metric.${mod} .mlabel, .metrics .metric.${mod} .mvalue`;
      const rule = cssRule(selector, PIPELINE_CSS);
      expect(rule, `.metric.${mod} colours one node but not both — see owl #69`).toBeTruthy();
      expect(rule).toMatch(/color:/);
    }
  });
});
