/**
 * Batch 7 (T153) — a drag source must stay HIT-TESTABLE, and the bar owns its
 * own drop. Repointed in batch 8 (T158) onto the source that replaced it.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE CHANGED, AND WHY THAT IS THE GUARD WORKING.
 *
 * The drag SOURCE moved. It was `.gbar`, a transparent-then-solid box spanning
 * the whole 1104px track; it is now `.grun`, the coloured run's own box nested
 * inside `.gbar`. This file pins the source count and the source class names on
 * purpose, so moving the source could not be done quietly — the guard failed
 * the moment the template changed, which is exactly what it is for.
 *
 * The ban did not shrink. It moved to the new source AND grew a rule it did not
 * have before: because `.gbar` is now an ANCESTOR of the source and is
 * deliberately `pointer-events: none` (it must be, or it swallows the `.gweek`
 * columns' drops outside the run), the ancestor sweep had to learn the one
 * legitimate escape — an ancestor's inherited `none` is cured by the SOURCE's
 * own explicit `auto`. That exemption is evaluated PER SOURCE and only from the
 * same rules being swept, so `.growr`, which declares no `auto`, still catches
 * every transparent wrapper above it. The SOURCE sweep takes no exemption at
 * all: a source's own `none` is banned outright, in every state.
 *
 * Three counts are unchanged and are meant to be: three drag sources, one
 * `.gdragging` transparency subject (`.gdl`), and every `dropOnBar` assertion in
 * SUITE 3 — the proof that the drop path did not move with the source.
 * ────────────────────────────────────────────────────────────────────────────
 * HONESTY NOTE — READ BEFORE TRUSTING A GREEN RUN.
 *
 * Nothing in this file can prove the drag works. This repo has no jsdom and no
 * browser runner (there is no vitest config and no `environment` anywhere), so
 * every assertion below is either Ractive's `toHTML()` or a read of the shipped
 * source text. A synthetic `DragEvent` dispatched in a test runner NEVER enters
 * Chrome's drag machinery: it calls the app's own handlers directly, which is
 * exactly why every automated check since 13g/13j passed while the live bar was
 * un-draggable. Synthetic events were the blind spot, so this suite does not
 * use them.
 *
 * What these tests prove is narrower and, for this bug, sufficient: that the
 * CONDITIONS Chrome needs are present in the shipped files and cannot silently
 * regress. The real-input verification — a real mouse, a real drag, a real drop
 * — is the orchestrator's, in a browser, after deploy.
 *
 * THE BUG IN ONE SENTENCE: a drag source that is `pointer-events: none` in any
 * state cannot be hit-tested, and Chrome creates and cancels the drag in the
 * same tick.
 * ────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  GANTT_CSS,
  TEMPLATE,
  decl,
  type PlannerGroup,
  type PlannerRow,
  renderGantt,
} from './helpers/gantt-render.ts';

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
 * both sides of the colon, so `POINTER-EVENTS : NONE` takes a drag source out
 * of hit-testing exactly as thoroughly as the canonical form. A guard that only
 * knows the house style is a guard a reformat walks past.
 */
const HIT_TEST_OFF = /pointer-events\s*:\s*none/i;

/**
 * The three ways a stylesheet can take an element out of hit-testing. Used only
 * for the mid-drag sweep: `visibility: hidden` and `display: none` are ordinary
 * at-rest tools (a filtered-out row, a collapsed block) and flagging them
 * everywhere would be noise — but a rule that hides the DRAG SOURCE for the
 * duration of the drag is control 3 of the real-input diagnosis, whichever
 * property it reaches for.
 */
const HIT_TEST_OFF_ANY = /(?:pointer-events\s*:\s*none|visibility\s*:\s*hidden|display\s*:\s*none)/i;

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
 * subject is what a drag source has to be compared against. Pseudo-classes and
 * pseudo-elements are stripped: `.gseg:active` is still `.gseg`, and a rule
 * that only bites while `:active` is still a rule that bites mid-drag.
 */
function subjectClasses(selector: string): string[] {
  const compound = selector.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? '';
  const bare = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
  return [...bare.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!);
}

/**
 * Does the selector's SUBJECT carry a pseudo-class or pseudo-element?
 *
 * `.growr:hover` and `.gseg::after` are state-scoped subjects. That is
 * deliberately ignored by every BAN in this file (a rule that bites only while
 * `:active` still bites mid-drag) and it is deliberately fatal to a CURE, which
 * has to hold for the whole drag. Attribute selectors are stripped first so a
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
 * here — matching what the browser does rather than what the author meant. The
 * lone `{{!row.trelloDue}}` in the template is a NEGATION in attribute
 * position, not a comment, so only `{{!` followed by whitespace is treated as
 * one. HTML comments go too: batch 7 rewrites one of these blocks, and a
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
 * `class="growr {{#if row.pinned}}pinned{{/if}}"` means `pinned` may be
 * present, so a rule targeting `.pinned` alone would still hit this element.
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
 * disables every source inside it while a hard-coded sweep stays green. The
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

const isSubsetOf = (tokens: string[], possible: string[]): boolean =>
  tokens.length > 0 && tokens.every((t) => possible.includes(t));

/**
 * The whole guard, in one function so it can be pointed at a fixture as well
 * as at the shipped sheets. A rule offends when the SUBJECT of one of its
 * selectors would match an element in `targets` — the drag sources themselves,
 * or (because `pointer-events` inherits) one of their ancestors.
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

const dedupe = (els: { name: string; classes: string[] }[]): { name: string; classes: string[] }[] => [
  ...new Map(els.map((a) => [`${a.name}.${a.classes.join('.')}`, a])).values(),
];

/**
 * Every ancestor of every drag source, de-duplicated. Derived, never listed.
 */
const ANCESTOR_TARGETS = targetsFor('an ancestor of a drag source', dedupe(DRAG_SOURCES.flatMap((s) => s.ancestors)));

/**
 * Does `rules` re-enable hit-testing ON THE ELEMENT ITSELF, unconditionally?
 *
 * `pointer-events` inherits, and an inherited value is overridden by the
 * element's own explicit one — so `.gantt .gbar { pointer-events: none }` above
 * `.gantt .grun { pointer-events: auto }` leaves the source hit-testable. That
 * is the shipped shape as of T158, and it is the ONLY escape the ancestor and
 * drop-target sweeps grant.
 *
 * The cure must hold in EVERY state and at EVERY viewport, which is the one
 * place this sweep is stricter than the bans around it. A ban counts a rule
 * that only bites while `:hover`, or only inside a `@media` block, because a
 * rule that bites sometimes is still a bug sometimes. A CURE cannot be read the
 * same way: `.growr:hover { pointer-events: auto }` above a transparent
 * ancestor holds at mousedown and evaporates the instant the pointer leaves the
 * row mid-drag — control 2 of the T153 diagnosis, wearing a cure's clothes. So
 * the curing rule must sit at the top level of its sheet (`conditional` false)
 * and its SUBJECT compound must carry no pseudo-class. Rejecting a cure only
 * ever makes the sweep stricter, so an over-cautious reading here is safe.
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
 * the sweep entirely; every other source keeps its whole chain. `.gantt` and
 * `.gbrows` are ancestors of BOTH `.grun` and `.growr`, and `.growr` declares no
 * `auto`, so a `none` up there is still caught — which is what makes this an
 * exemption rather than a hole.
 */
const ancestorOffenders = (rules: CssRule[]): string[] =>
  offendersIn(
    rules,
    targetsFor(
      'an ancestor of a drag source',
      dedupe(DRAG_SOURCES.filter((src) => !declaresAuto(rules, src)).flatMap((s) => s.ancestors)),
    ),
  );

/**
 * The planner's WEEK CELLS — derived from the template by their handler, never
 * listed — because T158 made them load-bearing and the exemption above stops
 * covering them by accident.
 *
 * Before T158 the `.gweek` cells were incidentally protected: `.gtrack` and
 * everything above it was swept as an ancestor of `.gbar`, the drag source, and
 * the cells inherit through that same chain. T158 moved the source into `.grun`
 * and gave it its own `auto`, so `.grun`'s whole chain now drops out of the
 * ancestor sweep — correctly, for the SOURCE — and the cells lost the cover
 * they never had in their own name.
 *
 * They cannot be left uncovered. `.gbar` is `pointer-events: none` precisely so
 * that a drop landing on the track OUTSIDE the coloured run reaches a `.gweek`
 * cell, which is the ONLY path such a drop has: no cell, no `dropOnWeek`, no
 * `moveRows`. A `pointer-events: none` anywhere on `.gweek` or above it would
 * refuse every drop outside the run while all three drag sources still dragged
 * happily — check (j) of T155, reaching the browser with a green suite.
 *
 * Scoped to the planner's week cells on purpose: this is the path JP's ruling
 * of 2026-08-18 made load-bearing, not a new charter over every drop zone in
 * the app. The other drop targets (`.gblockhead`, `.daycol`) are untouched by
 * this batch and are left to whoever owns them.
 */
const WEEK_CELLS: TemplateElement[] = TEMPLATE_ELEMENTS.filter((e) => /on-drop="\['dropOnWeek'/.test(e.source));

const weekCellOffenders = (rules: CssRule[]): string[] => [
  ...offendersIn(rules, targetsFor('the week-cell drop target', WEEK_CELLS)),
  ...offendersIn(
    rules,
    targetsFor(
      'an ancestor of the week-cell drop target',
      dedupe(WEEK_CELLS.filter((c) => !declaresAuto(rules, c)).flatMap((c) => c.ancestors)),
    ),
  ),
];

const WEEK_CELL_TARGETS = [
  ...targetsFor('the week-cell drop target', WEEK_CELLS),
  ...targetsFor('an ancestor of the week-cell drop target', dedupe(WEEK_CELLS.flatMap((c) => c.ancestors))),
];

/* ====================================================================== *
 * SUITE 0 — the parsers themselves
 * ====================================================================== */

describe('the guard’s own parsers actually see the shipped files', () => {
  it('reads every stylesheet in frontend/styles, not a list that can go stale', () => {
    expect(STYLESHEETS.map((s) => s.file)).toEqual([
      '00-base.css', '05-tokens.css', '10-ui.css', '20-pipeline.css',
      '25-requests.css', '30-planner.css', '35-gantt.css',
    ]);
  });

  it('flattens rules well enough to find known ones in two different sheets', () => {
    const selectors = ALL_RULES.map((r) => r.selector);
    expect(selectors).toContain('.gantt .gbar');
    expect(selectors).toContain('.gantt .grun');
    expect(selectors).toContain('.ubadge.saving');
    expect(selectors).toContain('.gantt .grun .gseg');
  });

  it('uses no CSS nesting, which is the premise the flattener rests on', () => {
    // a nested block would make `body` carry a second selector and silently
    // attribute its declarations to the wrong subject
    for (const r of ALL_RULES) expect(r.body).not.toContain('{');
  });

  it('finds real `pointer-events: none` rules and ignores the prose about them', () => {
    // 35-gantt.css discusses pointer-events at length in comments; the parser
    // must count the declarations, not the paragraphs
    expect(TRANSPARENT_RULES.length).toBeGreaterThan(0);
    for (const r of TRANSPARENT_RULES) expect(r.body).toMatch(HIT_TEST_OFF);
  });

  it('reads the template as a BALANCED tree, which is what makes the ancestor sweep real', () => {
    // every ancestor claim below is only as good as this parse: an unbalanced
    // stack would hand a drag source somebody else's ancestors, or none at all
    expect(PARSED.problems).toEqual([]);
    expect(TEMPLATE_ELEMENTS.length).toBeGreaterThan(200);
  });

  it('gives each drag source the ancestors the browser will give it', () => {
    const chain = (primary: string): string[] =>
      DRAG_SOURCES.find((s) => s.classes[0] === primary)!.ancestors.flatMap((a) => a.classes);
    expect(chain('grun')).toEqual(
      expect.arrayContaining(['gantt', 'gwrap', 'gsheet', 'gblock', 'gbrows', 'growr', 'gtrack']),
    );
    // T158: `.gbar` is no longer the source — it is the source's PARENT, and it
    // is deliberately transparent. Asserting it explicitly is the whole reason
    // the ancestor sweep had to learn the `auto` escape below.
    expect(chain('grun')).toContain('gbar');
    expect(chain('growr')).toEqual(expect.arrayContaining(['gantt', 'gwrap', 'gsheet', 'gblock', 'gbrows']));
    expect(chain('entry')).toEqual(expect.arrayContaining(['weekgrid', 'weekcard', 'daygrid', 'daycol']));
    // and the wrappers a hand-kept list had missed — this is the whole reason
    // the chain is derived rather than written down
    expect(chain('grun')).toEqual(expect.arrayContaining(['view', 'pscrollwrap', 'pscroll', 'gscroll']));
  });
});

/* ====================================================================== *
 * SUITE 1 — THE GUARD
 * ====================================================================== */

describe('every drag source stays hit-testable (a synthetic DragEvent CANNOT prove this — real input only)', () => {
  it('enumerates the drag sources FROM the template, so a fourth one joins this guard automatically', () => {
    // hard-coding the list is how the next drag source slips past the guard.
    // T158 moved one of them (`.gbar` → `.grun`) and the count is UNCHANGED on
    // purpose: the source moved, it did not multiply. One handle per phase
    // segment was the variant JP rejected, and this is what would catch it.
    const primary = DRAG_SOURCES.map((s) => s.classes[0]).sort();
    expect(primary).toEqual(['entry', 'growr', 'grun']);
    expect(DRAG_SOURCES).toHaveLength(3);
  });

  it('reads the conditional class tokens too — a rule may target a state, not a resting class', () => {
    const byPrimary = Object.fromEntries(DRAG_SOURCES.map((s) => [s.classes[0]!, s.classes]));
    expect(byPrimary['growr']).toEqual(['growr', 'sel', 'pinned', 'unsched', 'arrived']);
    // the run box carries no conditional class — its pinned refusal is reached
    // through `.growr.pinned`, which is why the CSS can scope by ancestor
    expect(byPrimary['grun']).toEqual(['grun']);
    expect(byPrimary['entry']).toEqual(['entry', 'late', 'urgent']);
  });

  it('lets NO rule in ANY stylesheet make a drag source pointer-events: none, in any state', () => {
    // THIS IS THE BUG. `.gantt .grun { pointer-events: none }` is a rule whose
    // SUBJECT is `.grun`, and `.grun` carries `draggable` — Chrome starts the
    // drag from that element and aborts because it cannot be hit.
    // NO EXEMPTION HERE, ever. The ancestor sweep below forgives an inherited
    // `none` that the source cures with its own `auto`; a source that turns
    // ITSELF off has nothing left to cure it, in any state or any spelling.
    expect(offendersIn(ALL_RULES, SOURCE_TARGETS)).toEqual([]);
  });

  it('IS NOT VACUOUS — it flags the exact rule that shipped the bug, and the two variants that also broke it', () => {
    // a guard that cannot fail on the known bug proves nothing. These three are
    // the shipped rule and the two the orchestrator confirmed with real input.
    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), SOURCE_TARGETS);

    // 1. the shape that shipped the bug at 1e13088, rewritten onto the source
    //    that carries `draggable` today — transparent at rest
    expect(fixture('.gantt .grun { position: absolute; top: 0; bottom: 0; pointer-events: none; cursor: grab; }'))
      .toHaveLength(1);
    // 2. hit-testable at mousedown only — forced transparent for the duration
    expect(fixture('.gantt.gdragging .grun { pointer-events: none; }')).toHaveLength(1);
    // 3. the same trap on the OTHER planner source, scoped to one row state
    expect(fixture('.gantt .growr.pinned { pointer-events: none; }')).toHaveLength(1);
    // and a state-only rule still counts: the drag has to survive :active
    expect(fixture('.grun:active { pointer-events: none; }')).toHaveLength(1);
    // …in whatever spelling: CSS is case-insensitive and tolerates whitespace
    // around the colon, so a reformat must not be able to walk past the guard
    expect(fixture('.gantt .grun { POINTER-EVENTS : NONE; }')).toHaveLength(1);
    expect(fixture('.gantt .grun { pointer-events:none !important; }')).toHaveLength(1);
  });

  it('does NOT cry wolf over rules that target something else', () => {
    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), SOURCE_TARGETS);
    expect(fixture('.gantt .grun .gseg { pointer-events: none; }')).toEqual([]); // subject is .gseg
    expect(fixture('.gantt .grun { pointer-events: auto; }')).toEqual([]); // not a `none`
    expect(fixture('.ubadge.saving { pointer-events: none; }')).toEqual([]);
    expect(fixture('.gghost { pointer-events: none; }')).toEqual([]);
  });

  it('refuses a class-less subject as well — `*` or a bare tag would blanket every source', () => {
    // the subset test above only fires on a CLASS selector; `* { … }` or
    // `div { … }` names no class and would slip through it while disabling
    // every drag source in the app
    const blanket = TRANSPARENT_RULES.flatMap((r) =>
      r.selector
        .split(',')
        .filter((s) => subjectClasses(s).length === 0)
        .map((s) => `${r.file}: \`${s.trim()}\` (subject \`${subjectElement(s) || '*'}\`)`),
    );
    expect(blanket).toEqual([]);
  });

  it('sweeps ANCESTORS too, because pointer-events is an inherited property', () => {
    // a transparent `.gtrack` would disable the `.grun` inside it just as
    // surely, and the chains come from the template's own nesting so a wrapper
    // added tomorrow is swept the day it appears. The ONE exemption (T158): an
    // ancestor's `none` that the source overrides with its own explicit `auto`
    // — which is precisely the shipped `.gbar` none / `.grun` auto pair.
    expect(ANCESTOR_TARGETS.length).toBeGreaterThan(10);
    expect(ancestorOffenders(ALL_RULES)).toEqual([]);
  });

  it('the ancestor sweep IS NOT VACUOUS either — a transparent wrapper is flagged wherever it sits', () => {
    const fixture = (css: string) => ancestorOffenders(cssRules('fixture.css', css));
    expect(fixture('.gtrack { pointer-events: none; }')).toHaveLength(1); // the run's own grandparent
    expect(fixture('.gantt .gbar { pointer-events: none; }')).toHaveLength(1); // uncured: no `auto` anywhere
    // THE DOCUMENTED ESCAPE, and the shape that actually ships
    expect(fixture('.gantt .gbar { pointer-events: none; } .gantt .grun { pointer-events: auto; }')).toEqual([]);
    // …and it is PER SOURCE, not a global amnesty: `.gbrows` is an ancestor of
    // `.growr` too, and `.growr` declares no `auto` of its own
    expect(fixture('.gbrows { pointer-events: none; } .gantt .grun { pointer-events: auto; }')).toHaveLength(1);
    expect(fixture('.gscroll { pointer-events: none; }')).toHaveLength(1); // a wrapper the old list missed
    expect(fixture('.daycol.holiday { pointer-events: none; }')).toHaveLength(1); // the Deadlines chain
    expect(fixture('.gseg { pointer-events: none; }')).toEqual([]); // a CHILD, not an ancestor
  });

  it('proves the escape is load-bearing on the REAL sheet — delete the run’s `auto` and the sweep fires', () => {
    // the fixtures above show the exemption behaves; this shows the SHIPPED
    // stylesheet actually depends on it. Strip `.gantt .grun`'s own
    // `pointer-events: auto` out of the real rule set and `.gantt .gbar`'s
    // deliberate `none` immediately becomes what it would be without the cure:
    // an inherited transparency on the drag source's parent, i.e. the batch-7
    // bug wearing a different selector.
    const withoutRunAuto = ALL_RULES.filter(
      (r) => !(r.selector === '.gantt .grun' && /pointer-events\s*:\s*auto/i.test(r.body)),
    );
    expect(withoutRunAuto.length).toBe(ALL_RULES.length - 1);
    expect(ancestorOffenders(withoutRunAuto).join(' | ')).toContain('.gantt .gbar');
  });

  it('takes NO state- or viewport-scoped rule as a CURE — a ban may bite sometimes, a cure may not', () => {
    // the asymmetry is the point. `:active` counts against a BAN two tests up,
    // because a rule that bites only while pressed still kills the drag. The
    // same reasoning forbids the mirror image: `.growr:hover { auto }` over a
    // transparent ancestor holds at mousedown and evaporates the moment the
    // pointer leaves the row mid-drag — control 2's signature, wearing a cure's
    // clothes — and a `@media` cure simply is not there at other viewports.
    const fixture = (css: string) => ancestorOffenders(cssRules('fixture.css', css));
    expect(fixture('.gbrows { pointer-events: none; } .growr:hover { pointer-events: auto; }')).toHaveLength(1);
    expect(
      fixture('.gantt .gbar { pointer-events: none; } @media (max-width: 600px) { .gantt .grun { pointer-events: auto; } }'),
    ).toHaveLength(1);
    // …while the unconditional, state-free form — the one that ships — cures
    expect(fixture('.gantt .gbar { pointer-events: none; } .gantt .grun { pointer-events: auto; }')).toEqual([]);
    // and the flattener still MARKS the conditional rule rather than dropping
    // it, so the ban side keeps seeing it
    const inMedia = cssRules('fixture.css', '@media (max-width: 600px) { .gantt .grun { pointer-events: none; } }');
    expect(inMedia.map((r) => r.conditional)).toEqual([true]);
    expect(offendersIn(inMedia, SOURCE_TARGETS)).toHaveLength(1);
  });

  it('sweeps the WEEK CELLS as well — T158 made them the only drop path outside the coloured run', () => {
    // `.gbar` is transparent so a drop on empty track reaches a `.gweek` cell.
    // That is the cells' ONLY path: no cell, no `dropOnWeek`, no `moveRows`.
    // Derived from the handler in the template, so a renamed cell is swept the
    // day it is renamed.
    expect(WEEK_CELLS).toHaveLength(1);
    expect(WEEK_CELLS[0]!.classes).toEqual(['gweek']);
    expect(WEEK_CELLS[0]!.ancestors.flatMap((a) => a.classes)).toEqual(
      expect.arrayContaining(['gantt', 'gsheet', 'gbrows', 'growr', 'gtrack', 'gweeks']),
    );
    expect(weekCellOffenders(ALL_RULES)).toEqual([]);
  });

  it('the week-cell sweep IS NOT VACUOUS — and it covers exactly what the source exemption stops covering', () => {
    const fixture = (css: string) => weekCellOffenders(cssRules('fixture.css', css));
    expect(fixture('.gweek { pointer-events: none; }')).toHaveLength(1);
    expect(fixture('.gantt .gweeks { pointer-events: none; }')).toHaveLength(1);
    expect(fixture('.gantt .gtrack { pointer-events: none; }')).toHaveLength(1);
    // the shipped shape is fine: `.gbar` is the run's parent and the cells'
    // SIBLING, so its `none` never reaches them
    expect(fixture('.gantt .gbar { pointer-events: none; } .gantt .grun { pointer-events: auto; }')).toEqual([]);
    // a cell may cure an ancestor for itself, exactly as the run does
    expect(fixture('.gantt .gtrack { pointer-events: none; } .gweek { pointer-events: auto; }')).toEqual([]);

    // THE GAP THIS SWEEP EXISTS FOR, stated as a pair. `.gtrack` is an ancestor
    // of `.grun` and of nothing else that drags, so the moment `.grun` cures
    // itself the drag-source sweep stops looking at `.gtrack` — correctly, for
    // the SOURCE. Every source would still drag; every drop outside the run
    // would be silently refused.
    const cured = '.gantt .gtrack { pointer-events: none; } .gantt .grun { pointer-events: auto; }';
    expect(ancestorOffenders(cssRules('fixture.css', cured))).toEqual([]);
    expect(weekCellOffenders(cssRules('fixture.css', cured))).toHaveLength(1);
  });

  it('lets no `.gdragging` rule hide a drag source by ANY means — it must stay hittable for the whole drag', () => {
    // control 3 of the real-input diagnosis: hit-testable at mousedown only is
    // not enough. `visibility: hidden` and `display: none` take an element out
    // of hit-testing exactly as `pointer-events: none` does, so the mid-drag
    // sweep looks for all three — while leaving at-rest hiding (a filtered row,
    // a collapsed block) alone, which is ordinary layout work.
    // NO exemption is passed here, and that is deliberate: the ancestor sweep's
    // `auto` escape works only because `pointer-events` is a single inherited
    // property a child can override. `display: none` and `visibility: hidden` on
    // an ancestor cannot be undone from inside it, so the FULL ancestor set is
    // swept mid-drag. The shipped `.gantt.gdragging .gdl` is neither a source
    // nor an ancestor of one, so it passes.
    // the WEEK CELLS ride along here for the same reason they get their own
    // resting sweep: mid-drag is exactly when a hidden drop target costs a drop.
    const midDrag = ALL_RULES.filter((r) => r.selector.includes('.gdragging'));
    expect(midDrag.length).toBeGreaterThan(0);
    expect(
      offendersIn(midDrag, [...SOURCE_TARGETS, ...ANCESTOR_TARGETS, ...WEEK_CELL_TARGETS], HIT_TEST_OFF_ANY),
    ).toEqual([]);

    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), SOURCE_TARGETS, HIT_TEST_OFF_ANY);
    expect(fixture('.gantt.gdragging .grun { pointer-events: none; }')).toHaveLength(1);
    expect(fixture('.gantt.gdragging .grun { visibility: hidden; }')).toHaveLength(1);
    expect(fixture('.gantt.gdragging .grun { display: none; }')).toHaveLength(1);
  });

  it('closes the inline-style vector — no drag source hides itself outside the stylesheets', () => {
    // the sweep above reads frontend/styles only; a `style="…"` attribute or a
    // `node.style.pointerEvents` write would reintroduce the bug where no CSS
    // guard can see it. Neither exists today, and this is what keeps it so.
    const styleOf = (el: TemplateElement): string => /style="([^"]*)"/.exec(el.source)?.[1] ?? '';
    for (const el of TEMPLATE_ELEMENTS) expect(styleOf(el)).not.toMatch(/pointer-events/i);
    for (const src of DRAG_SOURCES) expect(styleOf(src)).not.toMatch(/pointer-events|visibility|display/i);
    for (const { js } of SCRIPTS) {
      expect(js).not.toMatch(/pointerEvents/);
      expect(js).not.toMatch(/\.style\b/);
    }
  });

  /**
   * ⚠ THESE ARE THE ASSERTIONS THAT FLIP AGAINST THE PRE-T158 STYLESHEET. Read
   * them before assuming a red run here is a regression: at 1c571f1 `.gbar` was
   * the source and was `auto`; it is now the source's transparent parent and is
   * `none`, and the `auto` that keeps the drag alive sits on `.grun`.
   */
  it('states `pointer-events: auto` on the RUN BOX rather than merely omitting none', () => {
    // an explicit auto is what the next reader sees, and — since the property
    // INHERITS — it is what overrides `.gbar`'s deliberate `none` above it
    expect(GANTT_CSS).toMatch(/\.gantt \.grun \{[^}]*pointer-events: auto/);
    expect(GANTT_CSS).not.toMatch(/\.gantt \.grun \{[^}]*pointer-events: none/);
    // INVERTED (T158): the wrapper is transparent now, on purpose
    expect(GANTT_CSS).toMatch(/\.gantt \.gbar \{[^}]*pointer-events: none/);
  });

  it('names the dependency between those two rules, so neither can be deleted alone', () => {
    // `.gbar` MUST be transparent or it swallows every `.gweek` column's drop
    // outside the coloured run — the whole reason the source moved down a level.
    // That is only safe because `.grun` re-declares `auto` for itself; delete
    // that one declaration and the drag source is un-hit-testable again, which
    // is the exact defect batch 7 fixed. They ship together or not at all.
    const barNone = /\.gantt \.gbar \{[^}]*pointer-events: none/.test(GANTT_CSS);
    const runAuto = /\.gantt \.grun \{[^}]*pointer-events: auto/.test(GANTT_CSS);
    expect([barNone, runAuto]).toEqual([true, true]);
  });

  it('hides the deadline tick alone mid-drag — it paints OVER the bar and carries no dragover handler', () => {
    // `.gdl` is a later sibling of `.gbar` in the same positioned `.gtrack`,
    // both absolute at z-index auto, so it wins hit-testing at its 2px column;
    // left solid it would swallow the dragover and refuse the drop there.
    expect(GANTT_CSS).toMatch(/\.gantt\.gdragging \.gdl \{[^}]*pointer-events: none/);
    // and the segments are NOT in that rule any more. Nothing needs them
    // transparent — the solid bar beneath them takes the drop — and the ban is
    // the stricter line on purpose: it is `draggable` moving down onto `.gseg`
    // (the variant batch 7 rejected) that would turn a blanked segment back
    // into control 3's same-tick cancel.
    expect(GANTT_CSS).not.toContain('.gantt.gdragging .gbar .gseg');
    // and the drag source itself is never in a `.gdragging` rule (T158)
    expect(GANTT_CSS).not.toContain('.gantt.gdragging .grun');
    const draggingSubjects = TRANSPARENT_RULES.filter((r) => r.selector.includes('.gdragging'))
      .flatMap((r) => r.selector.split(',').map((s) => subjectClasses(s).join('.')));
    expect(draggingSubjects).toEqual(['gdl']);
  });

  it('leaves the five legitimate transparencies alone — the guard must not have been met by deleting rules', () => {
    // `.gbar` (T158) is the one that carries a REASON rather than merely being
    // harmless: it wraps the track, so left solid it would swallow the `.gweek`
    // columns' drops everywhere outside the coloured run. It is an ancestor of a
    // drag source, and it is legal only because `.grun` re-declares `auto`.
    expect(GANTT_CSS).toMatch(/\.gantt \.gbar \{[^}]*pointer-events: none/);
    // the other four carry no `draggable` and none is an ancestor of one
    expect(GANTT_CSS).toMatch(/\.gantt \.gghost \{[^}]*pointer-events: none/s);
    expect(GANTT_CSS).toMatch(/\.gantt \.gunsched \{[^}]*pointer-events: none/s);
    const pipeline = STYLESHEETS.find((s) => s.file === '20-pipeline.css')!.css;
    expect(pipeline).toMatch(/\.ubadge\.saving \{[^}]*pointer-events: none/);
    expect(pipeline).toMatch(/\.datefield\.saving \{[^}]*pointer-events: none/);
  });

  it('keeps the segments hit-testable at rest as well, so the visible bar is grabbable', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.grun \.gseg \{[^}]*pointer-events: auto/);
  });
});

/* ====================================================================== *
 * SUITE 2 — the pointer-X → week-column mapping
 * ====================================================================== */

type WeekAtX = (clientX: number, rect: { left: number; width: number }, weeks?: { key: string }[]) => string | null;

/**
 * The SHIPPED recipe, sliced out of the app scripts and executed — never retyped.
 *
 * Sliced LAZILY on purpose: `decl()` throws when the function is absent, and a
 * throw at module scope takes the whole file down with it — including the
 * hit-test guard above, which is the most important test in this batch and has
 * nothing to do with this function. Failing one suite is a report; failing the
 * file is a blindfold.
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

describe('the drop maps a pointer’s X to a week column (arithmetic only — it cannot prove a real drop lands)', () => {
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

  it('re-tunes no column width in a media query, and collapses the PANE not the columns', () => {
    for (const rule of cssRules('35-gantt.css', GANTT_CSS)) {
      if (rule.selector.startsWith('@')) continue;
      // `.gantt.lpc` moves --gleft; it must never touch --gw
      if (rule.selector.includes('.lpc')) expect(rule.body).not.toContain('--gw');
    }
    expect(GANTT_CSS).toMatch(/\.gantt\.lpc \{[^}]*--gleft/);
    expect([...GANTT_CSS.matchAll(/@media/g)]).toHaveLength(1);
    expect(GANTT_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

/* ====================================================================== *
 * SUITE 3 — the wiring: the bar takes its own drop, through the one write
 * ====================================================================== */

/** One `name(ctx…) { … }` handler body, brace-matched out of the shipped source. */
function handlerBody(src: string, name: string): string {
  const at = src.indexOf(`${name}(ctx`);
  if (at < 0) throw new Error(`drag-hittest: no handler \`${name}\` in the shipped frontend source`);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`drag-hittest: unterminated handler \`${name}\``);
}

/** The `<div class="grun" …>` open tag, as source — directives never render. */
const RUN_TAG = TEMPLATE_ELEMENTS.find((e) => e.source.startsWith('<div class="grun"'))!.source;
/** Its parent, which keeps its element and its class and loses every directive. */
const BAR_TAG = TEMPLATE_ELEMENTS.find((e) => e.source.startsWith('<div class="gbar"'))!.source;

describe('the coloured run is the drag source AND its own drop target', () => {
  it('carries all five directives on one element (source, not render — directives never reach toHTML)', () => {
    expect(RUN_TAG).toMatch(/\bdraggable=/);
    expect(RUN_TAG).toContain("on-dragstart=\"['dragRow', row.cardId]\"");
    expect(RUN_TAG).toContain("on-dragend=\"['dragEnd']\"");
    expect(RUN_TAG).toContain("on-dragover=\"['dragOver']\"");
    expect(RUN_TAG).toContain("on-drop=\"['dropOnBar']\"");
  });

  it('leaves the wrapper inert — `.gbar` keeps its element and its class and nothing else', () => {
    // JP's ruling: "Gbar stays." It is a positioning box now, not a handle; a
    // stray directive left on it would re-create the 1104px drag source.
    expect(BAR_TAG).not.toMatch(/\bdraggable=/);
    for (const directive of ['on-dragstart', 'on-dragend', 'on-dragover', 'on-drop']) {
      expect(BAR_TAG, `.gbar must not carry ${directive}`).not.toContain(directive);
    }
  });

  it('reuses the existing dragOver, which is exactly the preventDefault the browser waits for', () => {
    expect(APP_JS).toMatch(/dragOver\(ctx\) \{ ctx\.event\.preventDefault\(\); \}/);
  });

  it('takes the SAME write recipe dropOnWeek takes — one POST, one audit row, no fork', () => {
    const body = handlerBody(APP_JS, 'dropOnBar');
    expect(body).toMatch(/await moveRows\(/);
    expect(body).not.toContain('api.send');
    // the two pre-existing /replot call sites — Accept-suggestions and moveRows
    // — and no third: a new endpoint here would be a second audit path
    expect([...APP_JS.matchAll(/api\.send\('POST', `\/api\/projects\/\$\{app\.get\('activeProjectId'\)\}\/replot`/g)])
      .toHaveLength(2);
  });

  it('reads the dragged card off the dataTransfer, NEVER off the bar it landed on', () => {
    // an UNSCHEDULED row dragged across a scheduled row now drops on THAT bar;
    // taking the id from `row.cardId` would move the wrong card
    const body = handlerBody(APP_JS, 'dropOnBar');
    expect(body).toContain("ctx.event.dataTransfer.getData('text/plain')");
    expect(body).not.toContain('row.cardId');
    expect(APP_JS).toMatch(/dropOnBar\(ctx\)/);
    expect(APP_JS).not.toMatch(/dropOnBar\(ctx, /);
  });

  it('measures ctx.node’s track, not the event target — the event fires on a 26px segment and bubbles', () => {
    const body = handlerBody(APP_JS, 'dropOnBar');
    expect(body).toContain("ctx.node.closest('.gtrack')");
    expect(body).not.toContain('event.target');
  });

  it('calls preventDefault and bails on an unmeasurable track without writing', () => {
    const body = handlerBody(APP_JS, 'dropOnBar');
    expect(body).toContain('ctx.event.preventDefault();');
    expect(body).toMatch(/if \(!week\) return;/);
    expect(body.indexOf('return;')).toBeLessThan(body.indexOf('moveRows'));
  });

  it('feeds the mapping the shipped week list, so the columns it divides are the ones drawn', () => {
    expect(handlerBody(APP_JS, 'dropOnBar')).toContain("app.get('plannerWeeks')");
  });
});

describe('the week cells and the unslot zone keep the drops they already owned', () => {
  it('leaves .gweek’s own handlers verbatim — unscheduled rows still land there', () => {
    expect(TEMPLATE).toContain('<div class="gweek" on-dragover="[\'dragOver\']" on-drop="[\'dropOnWeek\', wk.key]">');
    expect(renderGantt()).toContain('<div class="gweek"></div>');
  });

  it('leaves the Unscheduled block header unslotting', () => {
    expect(TEMPLATE).toContain("on-dragover=\"['dragOverBlock', g.kind]\"");
    expect(TEMPLATE).toContain("on-drop=\"['dropBlock', g.kind]\"");
  });

  it('keeps dropOnWeek on the same one write path', () => {
    expect(APP_JS).toMatch(/dropOnWeek\(ctx, weekKey\)[\s\S]{0,200}?moveRows\(ctx\.event\.dataTransfer\.getData\('text\/plain'\), weekKey\)/);
  });
});

/* ====================================================================== *
 * SUITE 4 — the pin, rendered
 * ====================================================================== */

const SCHEDULED: PlannerRow = {
  cardId: 'c1', mcLabel: 'MC-655', displayId: 'MC-655.1', name: 'Hero render',
  slottedWeek: '2026-08-03', urgency: 'Urgent', difficulty: 'Hard',
  requestor: 'Ana', assetType: 'Render', currentList: 'Sketching', status: 'ongoing',
};
const PINNED: PlannerRow = { ...SCHEDULED, cardId: 'c3', mcLabel: 'MC-900', displayId: 'MC-900', pinned: true };
const UNSCHEDULED: PlannerRow = {
  cardId: 'c2', mcLabel: 'MC-712', displayId: 'MC-712', name: 'Loft plan',
  slottedWeek: null, urgency: 'Non-Urgent', currentList: 'Backlog', status: 'pending',
};
const groups = (rows: PlannerRow[]): PlannerGroup[] => [
  { id: 's1', kind: 'sprint', name: 'Sprint A', meta: '2 wk', count: `${rows.length} items`, rows },
];

describe('adding the drop did not re-arm the grab on a pinned row (JP 2026-08-17, ruling B)', () => {
  const html = renderGantt({ plannerGroups: groups([PINNED]) });

  it('still refuses the grab, and still says why', () => {
    // read off the extracted OPEN TAG: `toHTML()` emits `style` ahead of
    // `draggable` regardless of the order the template writes them in
    expect(/<div class="grun"[^>]*>/.exec(html)![0]).toContain('draggable="false"');
    // NOT a claim about the run box (JP, 2026-08-18): neither `.gbar` nor
    // `.grun` carries a `title` in either branch. The refusal is on `.growr`,
    // which a title-less `.gtrack`/`.gbar`/`.grun` inherits, so hovering
    // anywhere on a pinned row still states it — and each `.gseg` appends the
    // same sentence to its phase title. Placement is pinned in
    // gantt-rowactions.test.ts.
    expect(html).toContain('title="Pinned — unpin to move"');
    expect(RUN_TAG).not.toContain('title=');
  });

  it('a pinned row is still a valid LANDING strip for someone else’s drag — the pin freezes the ROW, not the column', () => {
    // Two halves now (T158). The RUN BOX carries the drop pair unconditionally,
    // with no `{{#if}}` in its open tag, so a pinned row's coloured bar accepts
    // someone else's drop exactly as an unpinned one does. Everywhere ELSE
    // along a pinned row, the track is `.gbar`, which is transparent — so the
    // drag falls through to the `.gweek` cells and lands via `dropOnWeek`,
    // which runs the SAME `moveRows`. Either path, the pin freezes only the row
    // it belongs to; neither carves a dead strip across the timeline.
    expect(RUN_TAG).toContain("on-dragover=\"['dragOver']\"");
    expect(RUN_TAG).toContain("on-drop=\"['dropOnBar']\"");
    expect(RUN_TAG).not.toContain('{{#if');
    expect(RUN_TAG).not.toContain('{{#unless');
    expect(TEMPLATE).toContain('<div class="gweek" on-dragover="[\'dragOver\']" on-drop="[\'dropOnWeek\', wk.key]">');
  });
});

describe('an unscheduled row keeps the row-drag it has no bar to replace', () => {
  const html = renderGantt({ plannerGroups: groups([UNSCHEDULED]) });

  it('still drags whole, still shows its grip, still renders neither bar nor run box', () => {
    expect(/<div class="growr[^>]*>/.exec(html)![0]).toContain('draggable="true"');
    expect(html).toContain('class="ghandle"');
    expect(html).not.toContain('class="gbar"');
    expect(html).not.toContain('class="grun"');
    expect(html).toContain('class="gunsched"');
  });

  it('is the second `draggable` source in the template, and the guard covers it too', () => {
    expect(DRAG_SOURCES.some((s) => s.classes[0] === 'growr')).toBe(true);
  });
});
