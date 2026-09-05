/**
 * Hit-testability + the inline-style law. Batch 7 (T153) built this file for
 * the planner's drag; TRIMMED 2026-08-28 when the Sprint Schedules rebuild
 * (owls #72/#73, PLAN.md) withdrew that drag — placement is a CLICK now.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT SURVIVES THE TRIM, AND WHY.
 *
 * 1. THE DRAG-SOURCE SWEEP — now over the EMPTY set. The schedules sources
 *    (`.grun`, `.growr`) died with their drag on 2026-08-28, and the Deadlines
 *    day entry — the one that survived that trim — died with the day planner on
 *    2026-09-05 (owls #74/#75, PLAN.md block 3: the rebuilt cards are read-only
 *    and derived, and the server's rollover is the only thing that moves one).
 *    The sweep is KEPT and stays wired to the template, so a new `draggable`
 *    rejoins it automatically; what changed is that its non-vacuity is proven
 *    against a fixture source (`FIXTURE_SOURCES`) rather than against a shipped
 *    element, because a sweep over an empty list finds nothing for reasons that
 *    have nothing to do with the law.
 *
 * 2. THE WEEK-CELL SWEEP, same law, NEW CONSUMER. The `.gweek` cells used to
 *    be the drop path outside the coloured run; they are now the columns a
 *    real placement CLICK lands through — select a row, hover a week, click
 *    (`plotHover`/`plotPlace` on the `.gtrack` above them). A
 *    `pointer-events: none` anywhere on that chain refuses every placement
 *    while nothing else in the suite notices, exactly as it once refused
 *    every drop.
 *
 * 3. THE INLINE-STYLE LAW, verbatim — including the `noteGrow` exact-text
 *    allow-list and its length-2 pin. It never was about the drag: a CSS
 *    guard cannot see an inline write, so the cheapest way to keep inline
 *    writes visible is to have none (minus the one documented exemption).
 *
 * 4. THE weekAtX SUITE. The mapper survived the rebuild unchanged
 *    (50-gantt-geometry.js) and `plotHover` now feeds it the pointer, so the
 *    arithmetic that used to place a DROP places a CLICK.
 *
 * Gone with the drags: the `.grun`/`.gbar` source sweeps and their `auto`
 * dependency pair, the `.gdragging` mid-drag sweep (the class is withdrawn),
 * the dropOnBar/dropOnWeek wiring suite, and the pinned/unscheduled render
 * suites. No mid-drag sweep replaces the old one — neither retired drag ever
 * carried a mid-drag state class.
 * ────────────────────────────────────────────────────────────────────────────
 * HONESTY NOTE — READ BEFORE TRUSTING A GREEN RUN.
 *
 * Nothing in this file can prove a drag — or a click — works.
 * This repo has no jsdom and no browser runner, so every assertion below is a
 * read of the shipped source text or an execution of a slice of it. A
 * synthetic `DragEvent` NEVER enters Chrome's drag machinery (gantt-rules
 * §46–47); none are used here and none may be added. What these tests prove
 * is that the CONDITIONS the browser needs are present in the shipped files
 * and cannot silently regress. Real-input verification stays the
 * orchestrator's, in a browser, after deploy.
 *
 * THE BUG THIS FILE EXISTS FOR, in one sentence: an interaction target that
 * is `pointer-events: none` in any state cannot be hit-tested — a drag
 * cancels in the tick it starts, and a click falls through to nothing.
 * ────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_JS, GANTT_CSS, TEMPLATE, decl } from './helpers/gantt-render.ts';

/* ====================================================================== *
 * Parsers. Deliberately small, and each one is pinned by a test of its
 * own further down — a guard whose parser silently matches nothing is
 * worse than no guard at all.
 * ====================================================================== */

const FRONTEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const readAll = (dir: string, ext: string): { file: string; text: string }[] =>
  fs
    .readdirSync(path.join(FRONTEND_DIR, dir))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((file) => ({ file, text: fs.readFileSync(path.join(FRONTEND_DIR, dir, file), 'utf8') }));

/**
 * EVERY stylesheet, read off disk rather than from a hard-coded list: the bug
 * must not be able to move to a new sheet by being written in a new file.
 */
const STYLESHEETS: { file: string; css: string }[] = readAll('styles', '.css').map(({ file, text }) => ({
  file,
  css: text,
}));

/** Every shipped script, for the vectors that never go through a stylesheet. */
const SCRIPTS: { file: string; js: string }[] = readAll('scripts', '.js').map(({ file, text }) => ({
  file,
  js: text,
}));

/**
 * `pointer-events: none`, in every spelling CSS accepts.
 *
 * Property names and keywords are case-INsensitive and whitespace is legal on
 * both sides of the colon, so `POINTER-EVENTS : NONE` takes a target out
 * of hit-testing exactly as thoroughly as the canonical form. A guard that only
 * knows the house style is a guard a reformat walks past.
 */
const HIT_TEST_OFF = /pointer-events\s*:\s*none/i;

const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

interface CssRule {
  file: string;
  selector: string;
  body: string;
  /**
   * True when the rule sits inside an at-rule block — `@media`, `@supports`.
   *
   * A ban must ignore this (a rule that only bites at one viewport is still a
   * rule that bites), but the ONE exemption the ancestor sweep grants must not:
   * a cure that applies at one viewport is no cure at the others.
   */
  conditional: boolean;
}

/**
 * Flattens a stylesheet to `{ selector, body }` pairs. `@media`/`@supports`
 * blocks are walked into (a rule that only bites at one viewport is still a
 * rule) and marked `conditional`; `@keyframes` and `@font-face` are skipped
 * because their inner blocks are keyed by percentages and descriptors, not
 * selectors.
 */
function cssRules(file: string, css: string): CssRule[] {
  const out: CssRule[] = [];
  const walk = (src: string, conditional = false): void => {
    let i = 0;
    let chunkStart = 0;
    while (i < src.length) {
      const c = src[i]!;
      if (c === '{') {
        const selector = src.slice(chunkStart, i).trim();
        let depth = 1;
        let j = i + 1;
        for (; j < src.length && depth > 0; j++) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
        }
        const body = src.slice(i + 1, j - 1);
        if (selector.startsWith('@')) {
          if (!/^@(keyframes|font-face|counter-style|property)\b/.test(selector)) walk(body, true);
        } else if (selector) out.push({ file, selector, body, conditional });
        i = j;
        chunkStart = j;
        continue;
      }
      if (c === '}') {
        i++;
        chunkStart = i;
        continue;
      }
      i++;
    }
  };
  walk(stripCssComments(css));
  return out;
}

const ALL_RULES: CssRule[] = STYLESHEETS.flatMap(({ file, css }) => cssRules(file, css));

/** Every rule that turns hit-testing OFF, anywhere in the app's CSS. */
const TRANSPARENT_RULES = ALL_RULES.filter((r) => HIT_TEST_OFF.test(r.body));

/**
 * The `.class` tokens of a selector's RIGHTMOST compound — its SUBJECT.
 *
 * `pointer-events` only disables an element when the rule's subject IS that
 * element (inheritance to descendants is handled separately, below), so the
 * subject is what a target has to be compared against. Pseudo-classes and
 * pseudo-elements are stripped: `.entry:active` is still `.entry`, and a rule
 * that only bites while `:active` is still a rule that bites mid-interaction.
 */
function subjectClasses(selector: string): string[] {
  const compound = selector.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? '';
  const bare = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
  return [...bare.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!);
}

/**
 * Does the selector's SUBJECT carry a pseudo-class or pseudo-element?
 *
 * `.entry:hover` and `.entry::after` are state-scoped subjects. That is
 * deliberately ignored by every BAN in this file (a rule that bites only while
 * `:active` still bites) and it is deliberately fatal to a CURE, which has to
 * hold for the whole interaction. Attribute selectors are stripped first so a
 * legitimate `[data-…]` containing a colon does not read as a state.
 */
function hasSubjectState(selector: string): boolean {
  const compound = selector.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? '';
  return compound.replace(/\[[^\]]*\]/g, '').includes(':');
}

/** The subject with every class stripped — `*`, `div`, or '' for a bare `.x`. */
function subjectElement(selector: string): string {
  const compound = selector.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? '';
  return compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '').replace(/\.[\w-]+/g, '');
}

/**
 * The shipped template with both comment forms removed.
 *
 * Ractive's `{{! … }}` ends at the FIRST `}}`, and that is what is emulated
 * here — matching what the browser does rather than what the author meant.
 * `{{!expr}}` in attribute position is a NEGATION, not a comment, so only
 * `{{!` followed by whitespace is treated as one. HTML comments go too: a
 * comment that quotes example markup must not be mistaken for a drag source.
 */
const TEMPLATE_CODE = TEMPLATE.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\{\{!\s[\s\S]*?\}\}/g, ' ');

/** The end of an element's open tag — quote- and mustache-aware. */
function tagEnd(src: string, start: number): number {
  let quote = '';
  for (let i = start; i < src.length; i++) {
    const c = src[i]!;
    if (quote) {
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '{' && src[i + 1] === '{') {
      const close = src.indexOf('}}', i);
      i = close < 0 ? src.length : close + 1;
      continue;
    }
    if (c === '>') return i;
  }
  return -1;
}

/**
 * The class tokens an element CAN carry, conditionals included:
 * `class="entry {{#if m.late}}late{{/if}}"` means `late` may be present, so a
 * rule targeting `.late` alone would still hit this element.
 */
function possibleClasses(openTag: string): string[] {
  const attr = /class="([^"]*)"/.exec(openTag)?.[1] ?? '';
  return attr
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

interface TemplateElement {
  /** the tag name, lowercased */
  name: string;
  /** the open tag as SOURCE — directives and mustaches intact */
  source: string;
  classes: string[];
  /** outermost first, straight off the template's own nesting */
  ancestors: { name: string; classes: string[] }[];
}

/** Elements that carry no closing tag, HTML voids plus the SVG leaves used here. */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', 'use', 'path', 'circle', 'rect', 'line',
  'polyline', 'polygon', 'stop',
]);

/**
 * The shipped template as a TREE, so an element's ancestors are the ones the
 * browser will actually give it.
 *
 * A hand-kept list of ancestor classes is the same staleness vector the drag
 * sources are already protected from: `pointer-events` INHERITS, so a wrapper
 * introduced tomorrow — or one that exists today and was simply forgotten —
 * disables every target inside it while a hard-coded sweep stays green. The
 * parse is a plain open/close stack; Ractive requires each section's content to
 * be balanced, so it reaches depth 0 and any imbalance is reported rather than
 * thrown (a throw at module scope would take the hit-test guard down with it).
 */
function parseTemplate(src: string): { elements: TemplateElement[]; problems: string[] } {
  const elements: TemplateElement[] = [];
  const problems: string[] = [];
  const stack: { name: string; classes: string[] }[] = [];
  for (const m of src.matchAll(/<\/?([a-zA-Z][\w-]*)\b/g)) {
    const name = m[1]!.toLowerCase();
    if (src[m.index + 1] === '/') {
      const top = stack.pop();
      if (top?.name !== name) problems.push(`</${name}> closes ${top ? `<${top.name}>` : 'nothing'}`);
      continue;
    }
    const end = tagEnd(src, m.index);
    if (end < 0) {
      problems.push(`<${name}> has no closing angle bracket`);
      continue;
    }
    const source = src.slice(m.index, end + 1);
    const el = { name, classes: possibleClasses(source) };
    elements.push({ ...el, source, ancestors: [...stack] });
    if (!VOID_ELEMENTS.has(name) && !/\/\s*>$/.test(source)) stack.push(el);
  }
  for (const unclosed of stack) problems.push(`<${unclosed.name}> is never closed`);
  return { elements, problems };
}

const PARSED = parseTemplate(TEMPLATE_CODE);
const TEMPLATE_ELEMENTS = PARSED.elements;

/** Every element in the shipped template that carries a `draggable` directive. */
const DRAG_SOURCES: TemplateElement[] = TEMPLATE_ELEMENTS.filter((e) => /\bdraggable=/.test(e.source));

/**
 * A SYNTHETIC drag source, parsed by the SAME `parseTemplate` the shipped sweep
 * uses — and the reason this file still means something after 2026-09-05.
 *
 * The Deadlines rebuild (owls #74/#75, PLAN.md block 3) retired the day-drag
 * planner: the cards are read-only and derived, and the only thing that moves
 * one is the server's rollover. So `DRAG_SOURCES` is EMPTY today, and every
 * sweep over it passes for free. That is exactly the state in which a guard
 * quietly stops being a guard.
 *
 * The law it defends has not changed and the app has not lost the ability to
 * grow a drag — so the machinery is kept, wired to the template so a new
 * `draggable` joins it the day it appears, and its non-vacuity is proven
 * against this fixture instead of against a shipped element that no longer
 * exists. The fixture wears the retired chain (a scroller, a column, an entry
 * with two state classes) because that is the shape the bug wore twice.
 */
const FIXTURE_TEMPLATE = [
  '<div class="dlscroll"><div class="dlweeks"><section class="dlweek">',
  '<div class="daygrid"><div class="daycol {{#if d.holiday}}holiday{{/if}}">',
  '<article class="entry {{#if m.late}}late{{/if}} {{#if m.urgent}}urgent{{/if}}" draggable="true"></article>',
  '</div></div></section></div></div>',
].join('');
const FIXTURE_SOURCES: TemplateElement[] = parseTemplate(FIXTURE_TEMPLATE).elements.filter((e) =>
  /\bdraggable=/.test(e.source),
);

const isSubsetOf = (tokens: string[], possible: string[]): boolean =>
  tokens.length > 0 && tokens.every((t) => possible.includes(t));

/**
 * The whole guard, in one function so it can be pointed at a fixture as well
 * as at the shipped sheets. A rule offends when the SUBJECT of one of its
 * selectors would match an element in `targets` — the interaction targets
 * themselves, or (because `pointer-events` inherits) one of their ancestors.
 */
function offendersIn(
  rules: CssRule[],
  targets: { name: string; classes: string[] }[],
  matcher: RegExp = HIT_TEST_OFF,
): string[] {
  const out: string[] = [];
  for (const rule of rules.filter((r) => matcher.test(r.body))) {
    for (const selector of rule.selector.split(',')) {
      const tokens = subjectClasses(selector);
      for (const target of targets) {
        if (isSubsetOf(tokens, target.classes)) {
          out.push(`${rule.file}: \`${selector.trim()}\` makes ${target.name} un-hit-testable`);
        }
      }
    }
  }
  return out;
}

/** One guard target per element, so `.a.b` only bites when ONE element has both. */
const targetsFor = (label: string, els: { name: string; classes: string[] }[]): { name: string; classes: string[] }[] =>
  els.map((e) => ({ name: `${label} <${e.name}${e.classes.map((c) => `.${c}`).join('')}>`, classes: e.classes }));

const SOURCE_TARGETS = targetsFor('the drag source', DRAG_SOURCES);
/** The same target list, built from the fixture — what keeps the sweeps honest. */
const FIXTURE_TARGETS = targetsFor('the drag source', FIXTURE_SOURCES);

const dedupe = (els: { name: string; classes: string[] }[]): { name: string; classes: string[] }[] => [
  ...new Map(els.map((a) => [`${a.name}.${a.classes.join('.')}`, a])).values(),
];

/**
 * Does `rules` re-enable hit-testing ON THE ELEMENT ITSELF, unconditionally?
 *
 * `pointer-events` inherits, and an inherited value is overridden by the
 * element's own explicit one — that is the ONLY escape the ancestor sweeps
 * grant. The cure must hold in EVERY state and at EVERY viewport (gantt-rules
 * §52): a `:hover` or `@media`-scoped `auto` evaporates mid-interaction, so
 * the curing rule must sit at the top level of its sheet and its SUBJECT
 * compound must carry no pseudo-class. Rejecting a cure only ever makes the
 * sweep stricter, so an over-cautious reading here is safe.
 *
 * Evaluated against the SAME `rules` being swept, never against the shipped
 * sheets: a fixture containing only a `none` must still fire.
 */
const declaresAuto = (rules: CssRule[], src: { classes: string[] }): boolean =>
  rules.some(
    (r) =>
      !r.conditional
      && /pointer-events\s*:\s*auto/i.test(r.body)
      && r.selector
        .split(',')
        .some((sel) => !hasSubjectState(sel) && isSubsetOf(subjectClasses(sel), src.classes)),
  );

/**
 * The ancestor sweep, PER SOURCE. A source that re-enables itself drops out of
 * the sweep entirely; every other source keeps its whole chain.
 *
 * `sources` is a parameter rather than a closure over `DRAG_SOURCES` because
 * the shipped set is empty today (see `FIXTURE_SOURCES`): the fixture proofs
 * have to be able to point the same sweep at a source that exists, or they
 * would be proving that an empty list finds nothing.
 */
const ancestorOffenders = (rules: CssRule[], sources: TemplateElement[] = DRAG_SOURCES): string[] =>
  offendersIn(
    rules,
    targetsFor(
      'an ancestor of a drag source',
      dedupe(sources.filter((src) => !declaresAuto(rules, src)).flatMap((s) => s.ancestors)),
    ),
  );

/**
 * The planner's WEEK CELLS — the columns a placement CLICK lands through.
 *
 * SAME LAW, NEW CONSUMER (the 2026-08-28 trim). Before the rebuild these
 * cells were the drop path outside the coloured run and were derived by their
 * `dropOnWeek` handler. The rebuilt track carries the handlers itself
 * (`plotHover`/`plotPlace`, derived below), and the cells carry none — so the
 * derivation keys on the frozen class instead (PLAN.md template contract: the
 * `.gtrack` holds the 12 `.gweek` cells). The chain still matters exactly as
 * it did: a `pointer-events: none` on `.gtrack` or anything above it refuses
 * every placement click while the rest of the suite stays green — check (j)'s
 * failure shape, reached by a click instead of a drop.
 */
const WEEK_CELLS: TemplateElement[] = TEMPLATE_ELEMENTS.filter((e) => e.classes.includes('gweek'));

/** The elements that TAKE the placement click — derived by their handler. */
const PLACE_TRACKS: TemplateElement[] = TEMPLATE_ELEMENTS.filter((e) => e.source.includes("'plotPlace'"));

const weekCellOffenders = (rules: CssRule[]): string[] => [
  ...offendersIn(rules, targetsFor('the week cell', WEEK_CELLS)),
  ...offendersIn(
    rules,
    targetsFor(
      'an ancestor of the week cell',
      dedupe(WEEK_CELLS.filter((c) => !declaresAuto(rules, c)).flatMap((c) => c.ancestors)),
    ),
  ),
];

/* ====================================================================== *
 * SUITE 0 — the parsers themselves
 * ====================================================================== */

describe('the guard’s own parsers actually see the shipped files', () => {
  /* Non-vacuity and attribution — that `readAll` really walked the directory
     rather than returning nothing, and that every sheet arrives with its
     filename and some text. It reads the directory again, independently, and
     compares: a sheet added, renamed or deleted needs no edit here; a
     `readAll` that silently stopped seeing files still fails. */
  it('reads every stylesheet in frontend/styles, not a list that can go stale', () => {
    const onDisk = fs
      .readdirSync(path.join(fileURLToPath(new URL('../frontend/styles', import.meta.url))))
      .filter((f) => f.endsWith('.css'))
      .sort();
    expect(onDisk.length, 'no stylesheets found — the enumeration is reading the wrong place').toBeGreaterThan(4);
    expect(STYLESHEETS.map((s) => s.file)).toEqual(onDisk);
    // filename order IS cascade order, and every sheet must carry real text
    expect(STYLESHEETS.map((s) => s.file)).toEqual([...STYLESHEETS.map((s) => s.file)].sort());
    expect(STYLESHEETS.every((s) => s.css.length > 0)).toBe(true);
  });

  it('flattens rules well enough to find known subjects in two different sheets', () => {
    // by SUBJECT rather than by exact selector spelling, so the styles pass
    // that dresses the rebuilt tab cannot break the parser test by rewording
    // a selector the flattener still sees perfectly well
    const subjects = ALL_RULES.flatMap((r) => r.selector.split(',').flatMap(subjectClasses));
    expect(subjects).toContain('gweek');
    expect(subjects).toContain('gtrack');
    expect(subjects).toContain('saving'); // .ubadge.saving, 20-pipeline.css
  });

  it('uses no CSS nesting, which is the premise the flattener rests on', () => {
    // a nested block would make `body` carry a second selector and silently
    // attribute its declarations to the wrong subject
    for (const r of ALL_RULES) expect(r.body).not.toContain('{');
  });

  it('finds real `pointer-events: none` rules and ignores the prose about them', () => {
    // the sheets discuss pointer-events in comments; the parser must count
    // the declarations, not the paragraphs
    expect(TRANSPARENT_RULES.length).toBeGreaterThan(0);
    for (const r of TRANSPARENT_RULES) expect(r.body).toMatch(HIT_TEST_OFF);
  });

  it('reads the template as a BALANCED tree, which is what makes the ancestor sweep real', () => {
    // every ancestor claim below is only as good as this parse: an unbalanced
    // stack would hand a target somebody else's ancestors, or none at all
    expect(PARSED.problems).toEqual([]);
    expect(TEMPLATE_ELEMENTS.length).toBeGreaterThan(200);
  });

  it('still gives a drag source the ancestors the browser would give it', () => {
    /* The derivation, proven against the fixture now that the shipped template
       carries no drag (see `FIXTURE_SOURCES`). It is the ancestor CHAIN that
       matters — `pointer-events` inherits — and it comes off the template's own
       nesting, so a wrapper added tomorrow is swept the day it appears rather
       than the day someone remembers to add it to a list. */
    const entry = FIXTURE_SOURCES.find((s) => s.classes[0] === 'entry');
    expect(entry, 'the draggable derivation stopped seeing a draggable element').toBeDefined();
    expect(entry!.ancestors.flatMap((a) => a.classes)).toEqual(
      expect.arrayContaining(['dlscroll', 'dlweeks', 'dlweek', 'daygrid', 'daycol']),
    );
  });
});

/* ====================================================================== *
 * SUITE 1 — THE GUARD
 * ====================================================================== */

describe('every drag source stays hit-testable (a synthetic DragEvent CANNOT prove this — real input only)', () => {
  it('enumerates the drag sources FROM the template — the set is EMPTY since the day planner withdrew', () => {
    /* 2026-08-28 (#72): `.grun` and `.growr` died with the planner drag, and
       the Deadlines day entry was the one drag left. 2026-09-05 (owls #74/#75,
       PLAN.md block 3) retires that one too — the cards on the rebuilt tab are
       read-only and derived, and the server's rollover is the only thing that
       moves a card now. So the shipped app drags NOTHING.

       Asserted as the empty SET rather than by deleting the sweep: the count is
       a fact about today, the law is not, and the derivation below still reads
       the template — so a `draggable` added tomorrow rejoins every guard in
       this suite automatically, and has to justify itself here when it does. */
    expect(DRAG_SOURCES.map((s) => s.classes[0]).sort()).toEqual([]);
  });

  it('reads the conditional class tokens too — a rule may target a state, not a resting class', () => {
    // proven on the fixture: a source's STATE classes are part of what a
    // selector can bite, and dropping them would let `.entry.late` slip past
    const entry = FIXTURE_SOURCES.find((s) => s.classes[0] === 'entry')!;
    expect(entry.classes).toEqual(['entry', 'late', 'urgent']);
  });

  it('lets NO rule in ANY stylesheet make a drag source pointer-events: none, in any state', () => {
    // THIS IS THE BUG. A rule whose SUBJECT is the element carrying
    // `draggable` cancels the drag in the tick it starts. NO EXEMPTION HERE,
    // ever: a source that turns ITSELF off has nothing left to cure it.
    // Vacuous while nothing drags — kept armed, and kept honest by the fixture
    // proof below, which runs the same function against a real source.
    expect(offendersIn(ALL_RULES, SOURCE_TARGETS)).toEqual([]);
  });

  it('IS NOT VACUOUS — it flags the batch-7 bug shape on a source that exists', () => {
    // a guard that cannot fail on the known bug proves nothing. These are the
    // 1e13088 shapes, worn by the fixture source (see `FIXTURE_SOURCES`).
    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), FIXTURE_TARGETS);

    expect(fixture('.daycol .entry { position: absolute; pointer-events: none; cursor: grab; }')).toHaveLength(1);
    expect(fixture('.entry.late { pointer-events: none; }')).toHaveLength(1); // a state class is still the element
    expect(fixture('.entry:active { pointer-events: none; }')).toHaveLength(1); // the drag has to survive :active
    // …in whatever spelling: CSS is case-insensitive and tolerates whitespace
    // around the colon, so a reformat must not be able to walk past the guard
    expect(fixture('.daycol .entry { POINTER-EVENTS : NONE; }')).toHaveLength(1);
    expect(fixture('.daycol .entry { pointer-events:none !important; }')).toHaveLength(1);
  });

  it('does NOT cry wolf over rules that target something else', () => {
    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), FIXTURE_TARGETS);
    expect(fixture('.entry .cliptext { pointer-events: none; }')).toEqual([]); // subject is the child
    expect(fixture('.daycol .entry { pointer-events: auto; }')).toEqual([]); // not a `none`
    expect(fixture('.ubadge.saving { pointer-events: none; }')).toEqual([]);
    expect(fixture('.gplus { pointer-events: none; }')).toEqual([]); // the placement +, deliberately inert
  });

  it('refuses a class-less subject as well — `*` or a bare tag would blanket every source', () => {
    // the subset test above only fires on a CLASS selector; `* { … }` or
    // `div { … }` names no class and would slip through it while disabling
    // every interaction target in the app
    const blanket = TRANSPARENT_RULES.flatMap((r) =>
      r.selector
        .split(',')
        .filter((s) => subjectClasses(s).length === 0)
        .map((s) => `${r.file}: \`${s.trim()}\` (subject \`${subjectElement(s) || '*'}\`)`),
    );
    expect(blanket).toEqual([]);
  });

  it('sweeps ANCESTORS too, because pointer-events is an inherited property', () => {
    // a transparent wrapper would disable the source inside it just as surely,
    // and the chains come from the template's own nesting so one added
    // tomorrow is swept the day it appears. Empty today, armed all the same.
    expect(ancestorOffenders(ALL_RULES)).toEqual([]);
    // the chain the sweep WOULD walk is real — proven on the fixture, so this
    // pair cannot both be empty for the same uninteresting reason
    expect(FIXTURE_SOURCES.flatMap((s) => s.ancestors).length).toBeGreaterThan(3);
  });

  it('the ancestor sweep IS NOT VACUOUS either — a transparent wrapper is flagged wherever it sits', () => {
    const fixture = (css: string) => ancestorOffenders(cssRules('fixture.css', css), FIXTURE_SOURCES);
    expect(fixture('.daycol { pointer-events: none; }')).toHaveLength(1);
    expect(fixture('.daycol.holiday { pointer-events: none; }')).toHaveLength(1); // a state up the chain
    expect(fixture('.dlweeks { pointer-events: none; }')).toHaveLength(1);
    // the documented escape: an ancestor's `none` cured by the source's own
    // unconditional `auto` — the T158 mechanism, kept because the law is
    // general even though no shipped pair uses it today
    expect(fixture('.daycol { pointer-events: none; } .entry { pointer-events: auto; }')).toEqual([]);
    expect(fixture('.entry .cliptext { pointer-events: none; }')).toEqual([]); // a CHILD, not an ancestor
  });

  it('takes NO state- or viewport-scoped rule as a CURE — a ban may bite sometimes, a cure may not', () => {
    // the asymmetry is the point (gantt-rules §52). `:active` counts against a
    // BAN above, because a rule that bites only while pressed still kills the
    // interaction. The mirror image is forbidden: a `:hover` cure holds at
    // mousedown and evaporates mid-drag, and a `@media` cure simply is not
    // there at other viewports.
    const fixture = (css: string) => ancestorOffenders(cssRules('fixture.css', css), FIXTURE_SOURCES);
    expect(fixture('.daycol { pointer-events: none; } .entry:hover { pointer-events: auto; }')).toHaveLength(1);
    expect(
      fixture('.daycol { pointer-events: none; } @media (max-width: 600px) { .entry { pointer-events: auto; } }'),
    ).toHaveLength(1);
    // …while the unconditional, state-free form cures
    expect(fixture('.daycol { pointer-events: none; } .entry { pointer-events: auto; }')).toEqual([]);
    // and the flattener still MARKS the conditional rule rather than dropping
    // it, so the ban side keeps seeing it
    const inMedia = cssRules('fixture.css', '@media (max-width: 600px) { .daycol .entry { pointer-events: none; } }');
    expect(inMedia.map((r) => r.conditional)).toEqual([true]);
    expect(offendersIn(inMedia, FIXTURE_TARGETS)).toHaveLength(1);
  });

  it('sweeps the WEEK CELLS — the columns every placement CLICK lands through (same law, new consumer)', () => {
    // the track carries the click handlers; the cells and the whole chain
    // above them must stay hit-testable or placement dies silently — the
    // exact failure shape drops used to have, reached by a click instead.
    // The count is NOT pinned: the rebuilt template draws the cells in more
    // than one branch, and every occurrence is swept wherever it sits.
    expect(WEEK_CELLS.length).toBeGreaterThanOrEqual(1);
    for (const cell of WEEK_CELLS) {
      expect(cell.classes).toEqual(['gweek']);
      expect(cell.ancestors.flatMap((a) => a.classes)).toEqual(
        expect.arrayContaining(['gantt', 'gtrack']),
      );
    }
    expect(weekCellOffenders(ALL_RULES)).toEqual([]);
  });

  it('ties the sweep to its consumer — the placement handlers ride the track ABOVE the cells', () => {
    // derived by handler, so a renamed or relocated click target re-derives
    // the day it moves; the cells' ancestor chain then covers it
    expect(PLACE_TRACKS.length).toBeGreaterThanOrEqual(1);
    for (const track of PLACE_TRACKS) {
      expect(track.classes).toContain('gtrack');
      expect(track.source).toContain("'plotHover'");
    }
  });

  it('the week-cell sweep IS NOT VACUOUS — and it covers what the source exemption never did', () => {
    // one offence PER SWEPT ELEMENT, and the element count is the template's
    // business — so the assertions are “fires” / “stays quiet”, not a tally
    const fixture = (css: string) => weekCellOffenders(cssRules('fixture.css', css));
    expect(fixture('.gweek { pointer-events: none; }').length).toBeGreaterThan(0);
    expect(fixture('.gantt .gtrack { pointer-events: none; }').length).toBeGreaterThan(0);
    // a cell may cure an ancestor for itself, exactly as a drag source does
    expect(fixture('.gantt .gtrack { pointer-events: none; } .gweek { pointer-events: auto; }')).toEqual([]);
    // the `.gplus` circle is pointer-transparent BY DESIGN (the track takes
    // the click) — a child, so the sweep rightly says nothing about it
    expect(fixture('.gplus { pointer-events: none; }')).toEqual([]);
  });

  it('leaves the deliberate transparencies alone — the guard must not have been met by deleting rules', () => {
    // each of these is a child or a bystander, never a target or its ancestor:
    // the placement + hands its click to the track, and the two saving states
    // freeze a control that is mid-write
    expect(GANTT_CSS).toMatch(/\.gplus[^{]*\{[^}]*pointer-events: none/);
    const pipeline = STYLESHEETS.find((s) => s.file === '20-pipeline.css')!.css;
    expect(pipeline).toMatch(/\.ubadge\.saving \{[^}]*pointer-events: none/);
    expect(pipeline).toMatch(/\.datefield\.saving \{[^}]*pointer-events: none/);
  });

  it('closes the inline-style vector — no interaction target hides itself outside the stylesheets', () => {
    // the sweep above reads frontend/styles only; a `style="…"` attribute or a
    // `node.style.pointerEvents` write would reintroduce the bug where no CSS
    // guard can see it. Neither exists today, and this is what keeps it so.
    const styleOf = (el: TemplateElement): string => /style="([^"]*)"/.exec(el.source)?.[1] ?? '';
    for (const el of TEMPLATE_ELEMENTS) expect(styleOf(el)).not.toMatch(/pointer-events/i);
    // the stricter per-source clause: empty while nothing drags, kept armed for
    // the day something does — the whole-template line above is what bites now
    for (const src of DRAG_SOURCES) expect(styleOf(src)).not.toMatch(/pointer-events|visibility|display/i);
    for (const { js } of SCRIPTS) {
      // the properties that actually take an element out of hit-testing:
      // banned outright, in every script, with no way to opt out
      expect(js).not.toMatch(/\.style\.(pointerEvents|visibility|display)\b/);
      expect(js).not.toMatch(/pointerEvents/);
      expect(js).not.toMatch(/cssText/); // sets every property at once
      /* ...and then the BLANKET ban on touching `.style` at all, which is what
         has kept the sweep above honest: a CSS guard cannot see an inline
         write, so the cheapest way to keep inline writes visible is to have
         none. That is still the rule. It is not absolute any more, because a
         blanket ban on an entire DOM API is a proxy for the real rule and a
         proxy eventually blocks correct work — it blocked the Requests note
         field, which hugs its text and must therefore write its own height
         (frame 731:101140, JP 2026-08-27).
         The exemption is BY EXACT TEXT, not by property or by file: adding a
         write means adding it here, in front of whoever is reading this rule.
         Nothing on this list may touch geometry a click or a drag reads —
         height on a textarea in the Requests table is not a placement track,
         is not an ancestor of one, and cannot become one without this list
         changing. */
      const SAFE_INLINE_WRITES = [
        "el.style.height = 'auto';",
        'el.style.height = `${el.scrollHeight}px`;',
      ];
      let rest = js;
      for (const w of SAFE_INLINE_WRITES) rest = rest.split(w).join('');
      expect(rest).not.toMatch(/\.style\b/);
    }
  });

  it('keeps the inline-style exemption list SHORT and used', () => {
    /* An allow-list that outlives its entries stops being a decision and
       becomes a hole. Both entries belong to one function; if `noteGrow` goes,
       the list goes with it. */
    const all = SCRIPTS.map((s) => s.js).join('\n');
    expect(all).toContain('const noteGrow =');
    expect([...all.matchAll(/\.style\b/g)]).toHaveLength(2);
  });
});

/* ====================================================================== *
 * SUITE 2 — the pointer-X → week-column mapping. The consumer changed
 * (2026-08-28): `plotHover` feeds it the pointer now, so the arithmetic
 * that used to place a DROP places a CLICK. The recipe itself is the
 * shipped, unchanged `weekAtX`.
 * ====================================================================== */

type WeekAtX = (clientX: number, rect: { left: number; width: number }, weeks?: { key: string }[]) => string | null;

/**
 * The SHIPPED recipe, sliced out of the app scripts and executed — never retyped.
 *
 * Sliced LAZILY on purpose: `decl()` throws when the function is absent, and a
 * throw at module scope takes the whole file down with it — including the
 * hit-test guard above, which has nothing to do with this function. Failing
 * one suite is a report; failing the file is a blindfold.
 */
let weekAtXSrc: string | undefined;
const WEEK_AT_X_SRC = (): string => (weekAtXSrc ??= decl(APP_JS, 'weekAtX'));
let weekAtXFn: WeekAtX | undefined;
const weekAtX: WeekAtX = (...args) =>
  (weekAtXFn ??= new Function(`${WEEK_AT_X_SRC()}\nreturn weekAtX;`)() as WeekAtX)(...args);

/** 12 consecutive Mondays — `plannerWeeks` is always WEEK_COUNT long. */
const WEEK_KEYS = [
  '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24',
  '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21',
  '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19',
];
const WEEKS = WEEK_KEYS.map((key) => ({ key }));
/** 12 × 92px, the shipped `--gw`, offset so a bare `clientX` cannot pass by luck. */
const RECT = { left: 1000, width: 1104 };

describe('placement maps a pointer’s X to a week column (arithmetic only — it cannot prove a real click lands)', () => {
  it('answers the first column at its exact left edge and at its middle', () => {
    expect(weekAtX(1000, RECT, WEEKS)).toBe('2026-08-03');
    expect(weekAtX(1045, RECT, WEEKS)).toBe('2026-08-03');
  });

  it('answers the last column at its last subpixel and at its middle', () => {
    expect(weekAtX(2103.9, RECT, WEEKS)).toBe('2026-10-19');
    expect(weekAtX(2050, RECT, WEEKS)).toBe('2026-10-19');
  });

  it('treats a column as half-open [start, end) — a pointer ON the boundary belongs to the RIGHT column', () => {
    expect(weekAtX(1091.99, RECT, WEEKS)).toBe('2026-08-03');
    expect(weekAtX(1092, RECT, WEEKS)).toBe('2026-08-10');
  });

  it('clamps a pointer LEFT of the track to the first column', () => {
    expect(weekAtX(500, RECT, WEEKS)).toBe('2026-08-03');
    expect(weekAtX(-5000, RECT, WEEKS)).toBe('2026-08-03');
  });

  it('clamps a pointer RIGHT of the track to the last column', () => {
    expect(weekAtX(5000, RECT, WEEKS)).toBe('2026-10-19');
  });

  it('walks every column in order, so no off-by-one hides in the middle', () => {
    const mids = WEEK_KEYS.map((_, i) => weekAtX(RECT.left + i * 92 + 46, RECT, WEEKS));
    expect(mids).toEqual(WEEK_KEYS);
  });

  it('divides the MEASURED width, not a hard-coded 92 — the same twelve keys come back at 2× zoom', () => {
    const zoom = { left: 0, width: 2208 };
    expect(WEEK_KEYS.map((_, i) => weekAtX(i * 184 + 92, zoom, WEEKS))).toEqual(WEEK_KEYS);
    expect(weekAtX(0, zoom, WEEKS)).toBe('2026-08-03');
    expect(weekAtX(183.99, zoom, WEEKS)).toBe('2026-08-03');
    expect(weekAtX(184, zoom, WEEKS)).toBe('2026-08-10');
    expect(weekAtX(2207.9, zoom, WEEKS)).toBe('2026-10-19');
    expect(weekAtX(-1, zoom, WEEKS)).toBe('2026-08-03');
    expect(weekAtX(99999, zoom, WEEKS)).toBe('2026-10-19');
  });

  it('returns null rather than a wrong week when it cannot measure', () => {
    // a detached or display:none track, and an empty/absent week list — the
    // handler bails without moving anything rather than guessing column 0
    expect(weekAtX(1500, { left: 1000, width: 0 }, WEEKS)).toBeNull();
    expect(weekAtX(1500, RECT, [])).toBeNull();
    expect(weekAtX(1500, RECT, undefined)).toBeNull();
  });

  it('is PURE — no document, no window, no app.get, no shared week constants', () => {
    // purity is what lets a test execute this exact source out of the shipped
    // file at all; the caller passes the measured rect and the week list in
    for (const forbidden of ['document', 'window', 'app.get', 'WEEK_PX', 'WEEK_COUNT']) {
      expect(WEEK_AT_X_SRC()).not.toContain(forbidden);
    }
  });

  it('is a named top-level function, not an expression buried in the handler', () => {
    expect(APP_JS).toMatch(/\nconst weekAtX = /);
    expect(WEEK_AT_X_SRC().startsWith('\nconst weekAtX =')).toBe(true);
  });
});

describe('the equal-column premise the mapping rests on is still true in the CSS', () => {
  const BASE_CSS = STYLESHEETS.find((s) => s.file === '00-base.css')!.css;

  it('declares --gw exactly once, on .gantt', () => {
    const decls = [...GANTT_CSS.matchAll(/--gw:/g)];
    expect(decls).toHaveLength(1);
    expect(GANTT_CSS).toMatch(/\.gantt \{[^}]*--gw: 92px/);
  });

  it('gives every week cell that one width and forbids it flexing', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.gweek \{[^}]*width: var\(--gw\)/);
    expect(GANTT_CSS).toMatch(/\.gantt \.gweek \{[^}]*flex: none/);
  });

  it('keeps the track content-sized, so 12 columns is the whole width', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.gtrack \{[^}]*flex: none/);
  });

  it('keeps the border-box reset that makes the first column’s missing border cost no width', () => {
    expect(BASE_CSS).toMatch(/\*\s*\{[^}]*box-sizing: border-box/);
  });

  it('re-tunes no column width conditionally, and collapses the PANE not the columns', () => {
    // stated as the RULE rather than a media-query tally (test/CLAUDE.md rule
    // 1): --gw is declared once, at the top level, and NO conditional or
    // pane-collapse rule re-declares it — `.gantt.lpc` moves --gleft only
    for (const rule of cssRules('35-gantt.css', GANTT_CSS)) {
      if (rule.conditional) expect(rule.body, `\`${rule.selector}\` re-tunes --gw conditionally`).not.toContain('--gw');
      if (rule.selector.includes('.lpc')) expect(rule.body).not.toContain('--gw');
    }
    expect(GANTT_CSS).toMatch(/\.gantt\.lpc \{[^}]*--gleft/);
  });
});
