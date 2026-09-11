/**
 * Hit-testability + the inline-style law. Batch 7 (T153) built this file for
 * the planner's drag; TRIMMED 2026-08-28 when the Sprint Schedules rebuild
 * (owls #72/#73) withdrew that drag; RE-ARMED 2026-09-08 (block 7) when a
 * placed bar dragged again; RE-TARGETED 2026-09-11 (block 9, owls #88/#89/#90,
 * JP 2026-09-10; PLAN.md block 9) when the day left Sprint Schedules for the
 * Deadlines tab, where the Design Lead's card is the ONE drag source in Sirius.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE HOLDS, AND WHY.
 *
 * 1. THE DRAG-SOURCE SWEEP, on the Deadlines CARD (block 9). The source is
 *    found by the HANDLER that starts the drag — `on-pointerdown="['dlDragStart'`
 *    on `.dlcard` — never by a `draggable` attribute, because there is none to
 *    find: the HTML5 API dies inside the sticky, scrolling containers this
 *    layout is built from (build-spec §5.2), so the drag is pointer events and
 *    the card itself is the only thing the browser must keep hit-testable, in
 *    every state it wears (`urgent`, `done`, `dragging`, `refused`). The
 *    `draggable` set is swept SEPARATELY, and must stay EMPTY. The card's
 *    ancestor chain is read off a RENDER of the expanded lane, because the
 *    partial is defined at the top level of its own file and the template
 *    parse would hand it no ancestors at all — the chain the browser gives it
 *    (`.dlscroll` → `.dlweeks` → `.dlweek` → `.dldays.dllane` → `.dlday` →
 *    `.dlcards`) only exists where the partial is CALLED. The fixture
 *    (`FIXTURE_SOURCES`) is kept beside the shipped source: it proves the
 *    sweeps fire on the ancestor-chain shapes the bug wore twice, which no
 *    arrangement of today's stylesheet can demonstrate.
 *
 * 2. THE WEEK-CELL SWEEP AND ITS BINDINGS (block 9). The `.gweek` cells are the
 *    columns a placement CLICK lands through — and since #88 they CARRY the
 *    click: `weekHover` / `weekLeave` / `weekPlace` ride every committed row's
 *    cells, placed rows included (the PM owns the week and re-places by week).
 *    A `pointer-events: none` anywhere on that chain refuses every placement
 *    while nothing else in the suite notices, exactly as it once refused every
 *    drop. The bar (`.gitem`) is DISPLAY-ONLY here and is no longer a source —
 *    and since PLAN.md block 9 amendment 11 it must be pointer-TRANSPARENT, the
 *    one inversion of this file's law: the bar is absolutely positioned across
 *    the cells, so a multi-week run swallowed the click of every week it ran
 *    through. A transparent overlay and an un-hit-testable target are the same
 *    property pointed opposite ways, and both live in the same sweep below.
 *
 * 3. THE INLINE-STYLE LAW, verbatim — including the `noteGrow` exact-text
 *    allow-list and its length-2 pin. It never was about the drag: a CSS
 *    guard cannot see an inline write, so the cheapest way to keep inline
 *    writes visible is to have none (minus the one documented exemption).
 *
 * Gone with block 9: the `dayAtX` suite (pointer-X → workday arithmetic — the
 * PM names a week by its column INDEX now, and the Design Lead names a day by
 * its COLUMN, so nothing maps an X to a day any more) and, with it, the literal
 * `weekAtX` name-ban it carried (a snapshot guard, test/CLAUDE.md rule 1: the
 * capability is what the bindings suite below states, not a name). Gone with
 * the earlier trims: the `.grun`/`.gbar` source sweeps, the `.gdragging`
 * sweep, the dropOnBar/dropOnWeek wiring suite, the pinned/unscheduled render
 * suites, and block 7's `.gitem` source sweep.
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
import {
  GANTT_CSS,
  TEMPLATE,
  PLOTTED,
  UNPLOTTED,
  cssRule,
  dlCardPartial,
  renderDeadlines,
  renderSprintSchedule,
  type DlCard,
  type DlWeek,
} from './helpers/gantt-render.ts';
import { groupsOf, schedulesView } from './helpers/sprint-schedule-tab.ts';

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

/**
 * THE DRAG SOURCES — derived by the handler that STARTS a drag.
 *
 * Block 9 gives the Deadlines CARD a pointer drag (owls #88/#89): pointerdown
 * on `.dlcard` inside an expanded lane, pointermove over the lane's day
 * columns, pointerup writes the day. There is no `draggable` attribute to key
 * on, so the derivation reads the handler instead — and it is still a
 * derivation, not a list: a second drag source added tomorrow joins every
 * sweep below the day it appears.
 */
const DRAG_SOURCES: TemplateElement[] = TEMPLATE_ELEMENTS.filter((e) =>
  /on-pointerdown="\['dlDragStart'/.test(e.source),
);

/** The HTML5 set — swept separately, and it must stay EMPTY (build-spec §5.2). */
const HTML5_SOURCES: TemplateElement[] = TEMPLATE_ELEMENTS.filter((e) => /\bdraggable=/.test(e.source));

/**
 * THE CARD'S ANCESTOR CHAIN, off a RENDER of the expanded lane.
 *
 * The template parse gives the `dlCard` partial's `<article>` no ancestors:
 * the partial is defined at the top level of its own file, and the chain the
 * browser will give it exists only where the partial is CALLED — inside the
 * day column of the open lane. So the shipped Deadlines tab is rendered with
 * one lane open and one card in a day column, and the SAME `parseTemplate`
 * reads the chain off the rendered markup. The card's own class list is
 * still read off the partial's SOURCE (the conditional tokens the render
 * would hide); only the chain comes from the render.
 */
const CHAIN_CARD: DlCard = {
  id: 'i1', rowId: 'i1', cardId: 'w1', mc: 'MC-655', label: 'MC-655: Hero', startsOn: '2026-08-04',
  urgent: false, difficulty: null, assetType: null, lane: null, done: false, trelloUrl: null, figmaUrl: null,
};
const CHAIN_WEEK: DlWeek = {
  key: '2026-08-03', label: 'Week 1', range: '3 - 7 Aug 2026', cards: [CHAIN_CARD],
  pending: 1, urgent: 0, done: 0, load: 1, capPct: '0.8',
  days: ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'].map((day, i) => ({
    day, name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i]!, cards: day === '2026-08-04' ? [CHAIN_CARD] : [], pending: 0, done: 0,
  })),
};
/* Rendered MID-GESTURE on purpose: the drop column wears `target` and the
   card `dragging`, so the chain carries the state token a rule could bite
   (`.dlday.target { … }`) — the resting render would hide it. */
const RENDERED_LANE = parseTemplate(renderDeadlines({
  dlWeeks: [CHAIN_WEEK],
  expandedWeek: '2026-08-03',
  dlDrag: { rowId: 'i1', fromDay: '2026-08-04', day: '2026-08-04', refused: false, weekKey: '2026-08-03' },
}));
const RENDERED_CARDS: TemplateElement[] = RENDERED_LANE.elements.filter((e) => e.classes.includes('dlcard'));

/** The shipped sources, each given the chain the browser gives it. */
const SOURCES_IN_PLACE: TemplateElement[] = DRAG_SOURCES.map((src) => ({
  ...src,
  ancestors: RENDERED_CARDS[0]?.ancestors ?? [],
}));

/**
 * A SYNTHETIC drag source, parsed by the SAME `parseTemplate` the shipped sweep
 * uses — what keeps the sweeps honest whatever the shipped stylesheet says.
 *
 * Between 2026-09-05 and block 7, and again briefly before block 9 re-armed
 * the Deadlines card, `DRAG_SOURCES` was EMPTY and every sweep over it passed
 * for free — exactly the state in which a guard quietly stops being a guard.
 * The fixture is the answer: its non-vacuity proofs run against a source that
 * always exists, wearing the retired chain (a scroller, a column, an entry
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

/** The source targets — the card, with every conditional token its source can carry. */
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
 * `declaresAuto`'s mirror: does `rules` take an element OUT of hit-testing,
 * unconditionally and in every state? Used for the one element this file wants
 * transparent — the display-only bar laid over the week cells (PLAN.md block 9
 * amendment 11). Same reading of a selector's SUBJECT, so a respelling counts
 * and a `:hover`- or media-scoped rule does not: a transparency that evaporates
 * mid-interaction is the defect, not the cure.
 */
const declaresNone = (rules: CssRule[], src: { classes: string[] }): boolean =>
  rules.some(
    (r) =>
      !r.conditional
      && HIT_TEST_OFF.test(r.body)
      && r.selector
        .split(',')
        .some((sel) => !hasSubjectState(sel) && isSubsetOf(subjectClasses(sel), src.classes)),
  );

/**
 * The ancestor sweep, PER SOURCE. A source that re-enables itself drops out of
 * the sweep entirely; every other source keeps its whole chain.
 *
 * `sources` is a parameter rather than a closure: the shipped card is swept
 * with the chain a RENDER gives it (`SOURCES_IN_PLACE`), and the fixture
 * proofs point the same sweep at a source whose chain the fixture itself
 * draws — neither would prove anything against the partial's own parse,
 * which has no chain at all.
 */
const ancestorOffenders = (rules: CssRule[], sources: TemplateElement[] = SOURCES_IN_PLACE): string[] =>
  offendersIn(
    rules,
    targetsFor(
      'an ancestor of a drag source',
      dedupe(sources.filter((src) => !declaresAuto(rules, src)).flatMap((s) => s.ancestors)),
    ),
  );

/**
 * The planner's WEEK CELLS — the columns a placement CLICK lands through, and
 * since block 9 the elements that CARRY it (owls #88/#89; PLAN.md template
 * contract): `weekHover` / `weekLeave` / `weekPlace` ride every committed
 * row's `.gweek` cells. The derivation keys on the frozen class; the
 * BINDINGS are derived below by handler, so a cell that stopped binding the
 * click is found by the bindings suite and a cell that stopped being
 * hit-testable by the sweep. The chain still matters exactly as it did: a
 * `pointer-events: none` on `.gtrack` or anything above it refuses every
 * placement click while the rest of the suite stays green.
 */
const WEEK_CELLS: TemplateElement[] = TEMPLATE_ELEMENTS.filter((e) => e.classes.includes('gweek'));

/** The cells that TAKE the placement click — derived by their handler. */
const CLICK_CELLS: TemplateElement[] = WEEK_CELLS.filter((e) => e.source.includes("'weekPlace'"));
/** The rest — the search row's and the result rows' inert tracks (owl #77 §0). */
const INERT_CELLS: TemplateElement[] = WEEK_CELLS.filter((e) => !e.source.includes("'weekPlace'"));

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
  it('enumerates the drag sources FROM the template — the Deadlines CARD, and only it (block 9, #88)', () => {
    /* One source, and it is the CARD on Deadlines. Not the day column: a
       pointerdown on empty column would arm a drag from nothing. Not the
       Sprint Schedules bar: the day belongs to the Design Lead, on this tab
       and nowhere else (#88), so `.gitem` binds nothing (its own contract is
       test/sprint-schedule-bars-footer.test.ts SUITE 7). */
    expect(DRAG_SOURCES.map((s) => `${s.name}.${s.classes[0]}`)).toEqual(['article.dlcard']);
    expect(DRAG_SOURCES).toHaveLength(1);
    expect(TEMPLATE_ELEMENTS.filter((e) => e.classes.includes('gitem')).every((e) => !/\son-[a-z]+=/.test(e.source))).toBe(true);
  });

  it('drags by POINTER only — the `draggable` set stays empty', () => {
    // §5.2's own reason: HTML5 drag-and-drop fails inside sticky, scrolling
    // containers, and this layout is one. An attribute here would hand the
    // gesture to a machine that cancels it in the tick it starts.
    expect(HTML5_SOURCES.map((e) => e.classes.join('.'))).toEqual([]);
  });

  it('knows every STATE the source wears — the two card flags and the two gesture states', () => {
    /* The class list is what a `pointer-events` rule can bite: the resting
       class, the card's own `urgent` / `done`, and the two the gesture adds
       (`dragging` while live, `refused` over a day the row may not have).
       There is no in-flight class to add — the write is optimistic and the
       row reloads, so the card wears nothing while the PATCH is in the air. */
    expect(DRAG_SOURCES[0]!.classes).toEqual(['dlcard', 'urgent', 'done', 'dragging', 'refused']);
    expect(SOURCE_TARGETS[0]!.classes.sort()).toEqual(['dlcard', 'done', 'dragging', 'refused', 'urgent']);
  });

  it('lets NO rule make the card un-hit-testable in ANY of those states — and would catch one that did', () => {
    /* THE BUG, on a source that exists. A `pointer-events: none` on the card
       — in any state, at any viewport — cancels the drag in the tick it
       starts, and nothing else in the suite notices. Both halves are asserted
       together so neither can pass for an uninteresting reason: the shipped
       sheets are clean, AND the sweep fires on every shape that would dirty
       them. */
    expect(offendersIn(ALL_RULES, SOURCE_TARGETS)).toEqual([]);
    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), SOURCE_TARGETS);
    for (const sel of [
      '.dlcard',
      '.dlcard.urgent', // the urgent card — the one most worth dragging
      '.dlcard.done', // a finished card is faded, never inert
      '.dlcard.dragging', // mid-gesture: a cure that evaporates on grab is no cure
      '.dlcard.refused',
      '.dlcard.dragging.refused',
      '.dlcard:hover', // the state the pointer is IN when the button goes down
      '.dlcard:active',
      '.dlcard:focus-visible', // the keyboard path shares the element
      '.dllane .dlday .dlcard.urgent',
    ]) {
      expect(fixture(`${sel} { pointer-events: none; }`), `\`${sel}\` slipped past the sweep`).toHaveLength(1);
    }
  });

  it('reads the conditional class tokens too — a rule may target a state, not a resting class', () => {
    // the same derivation on the fixture, whose chain is the shape the bug
    // wore twice: a source's STATE classes are part of what a selector can
    // bite, and dropping them would let `.entry.late` slip past
    const entry = FIXTURE_SOURCES.find((s) => s.classes[0] === 'entry')!;
    expect(entry.classes).toEqual(['entry', 'late', 'urgent']);
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
    expect(fixture('.dlquote { pointer-events: none; }')).toEqual([]); // the card's painted bar — a child
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
    // and the chain comes from a RENDER of the open lane — the partial's own
    // parse has none — so a wrapper added tomorrow is swept the day it appears
    expect(RENDERED_LANE.problems).toEqual([]);
    expect(RENDERED_CARDS, 'the rendered lane carries no card to read a chain off').toHaveLength(1);
    expect(ancestorOffenders(ALL_RULES)).toEqual([]);
    // …and the card's chain is a real one: the column it sits in, the open
    // lane (the drop bound), the week, and the sheet that scrolls
    expect(SOURCES_IN_PLACE[0]!.ancestors.flatMap((a) => a.classes))
      .toEqual(expect.arrayContaining(['dlscroll', 'dlweeks', 'dlweek', 'dldays', 'dllane', 'dlday', 'dlcards']));
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
    // …and on the SHIPPED chain, read off the render: the day column, the
    // open lane and the scroller each take the card out of hit-testing
    const shipped = (css: string) => ancestorOffenders(cssRules('fixture.css', css));
    expect(shipped('.dlday { pointer-events: none; }')).toHaveLength(1);
    expect(shipped('.dllane { pointer-events: none; }')).toHaveLength(1);
    expect(shipped('.dlscroll { pointer-events: none; }')).toHaveLength(1);
    expect(shipped('.dlday.target { pointer-events: none; }')).toHaveLength(1); // the drop column's own state
    expect(shipped('.dlday { pointer-events: none; } .dlcard { pointer-events: auto; }')).toEqual([]);
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
      expect(cell.classes[0]).toBe('gweek');
      expect(cell.classes.every((c) => c === 'gweek' || c === 'hover')).toBe(true);
      expect(cell.ancestors.flatMap((a) => a.classes)).toEqual(
        expect.arrayContaining(['gantt', 'gtrack']),
      );
    }
    expect(weekCellOffenders(ALL_RULES)).toEqual([]);
    // the hovered state is part of what a rule can bite — swept as a token
    const fixture = (css: string) => weekCellOffenders(cssRules('fixture.css', css));
    expect(fixture('.gweek.hover { pointer-events: none; }').length).toBeGreaterThan(0);
  });

  it('ties the sweep to its consumer — the placement handlers ride the CELLS themselves (block 9)', () => {
    // derived by handler, so a renamed or relocated click target re-derives
    // the day it moves; the cells' own ancestor chain then covers it
    expect(CLICK_CELLS.length).toBeGreaterThanOrEqual(1);
    for (const cell of CLICK_CELLS) {
      expect(cell.classes).toContain('gweek');
      expect(cell.ancestors.flatMap((a) => a.classes)).toContain('gtrack');
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
    /* the bar is a SIBLING of the cells, not an ancestor, so a rule on it
       never makes a CELL un-hit-testable — the sweep stays quiet about it.
       That is a statement about this sweep's scope, not about the bar: the
       bar's own rule is now `pointer-events: none` and the test below is
       where that law lives (PLAN.md block 9 amendment 11). */
    expect(fixture('.gitem { pointer-events: none; }')).toEqual([]);
  });

  it('keeps the BAR pointer-TRANSPARENT — a multi-week run must not swallow the weeks it covers (PLAN.md amendment 11)', () => {
    /* THE DEFECT, found at REVIEW. `.gitem` is absolutely positioned and as
       wide as the run, so it lies OVER the `.gweek` cells of every week it
       passes through, not merely its own. While it took the pointer, those
       cells never saw a click — and the PM could not re-place a card into any
       week its own bar covered, which is most of the act #88 leaves this tab.

       This is the file's own law, inverted for one element: everything a
       person aims at stays hit-testable, and anything laid OVER those things
       that takes no act of its own must get out of the way. The bar qualifies
       on both counts — it binds nothing and it overlaps. The cure is read
       through the same parsers the sweeps use, so a respelling
       (`.gantt .gitem`, `.gitem.late`) still counts and a `:hover`- or
       media-scoped one still does not. */
    const BARS = TEMPLATE_ELEMENTS.filter((e) => e.classes.includes('gitem'));
    expect(BARS.length, 'the schedules view lost its bar').toBeGreaterThanOrEqual(1);
    for (const bar of BARS) {
      // it lies ACROSS the track: absolutely placed, as wide as the run
      expect(bar.source, 'the bar stopped being an inline-placed overlay').toMatch(/style="left:[^"]*width:[^"]*"/);
      expect(bar.ancestors.flatMap((a) => a.classes)).toContain('gtrack');
      // …and it is a SIBLING of the cells, never one of their ancestors —
      // an ancestor would be the OTHER bug, and the sweep above owns that one
      expect(WEEK_CELLS.some((c) => c.ancestors.some((a) => a.classes.includes('gitem')))).toBe(false);
      // it asks for no pointer act, so giving the pointer up costs it nothing
      expect(bar.source, 'a bar that binds a handler cannot be transparent').not.toMatch(/\son-[a-z]+=/);
      // the shipped rule, unconditional and un-stated, on the bar itself
      expect(declaresNone(ALL_RULES, bar), 'the bar takes the pointer back from the cells it covers').toBe(true);
    }
  });

  it('the transparency check IS NOT VACUOUS — it reads a real `none` and refuses a cure that is not one', () => {
    const bar = TEMPLATE_ELEMENTS.find((e) => e.classes.includes('gitem'))!;
    const rules = (css: string) => cssRules('fixture.css', css);
    expect(declaresNone(rules('.gitem { pointer-events: none; }'), bar)).toBe(true);
    expect(declaresNone(rules('.gantt .gitem { pointer-events: none; }'), bar)).toBe(true);
    // …and what does NOT satisfy it
    expect(declaresNone(rules('.gitem { pointer-events: auto; }'), bar)).toBe(false);
    expect(declaresNone(rules('.gitem:hover { pointer-events: none; }'), bar)).toBe(false);
    expect(declaresNone(rules('@media (max-width: 600px) { .gitem { pointer-events: none; } }'), bar)).toBe(false);
    expect(declaresNone(rules('.gdl { pointer-events: none; }'), bar)).toBe(false); // the tick is not the bar
  });

  it('leaves the deliberate transparencies alone — the guard must not have been met by deleting rules', () => {
    // each of these is a bystander, never a target or its ancestor: the two
    // saving states freeze a control that is mid-write. The placement `+`
    // (`.gplus`, pointer-transparent so the track took its click) is GONE
    // with the day controls (block 9) — not exempt, deleted.
    expect(GANTT_CSS, 'the retired `+` rule came back').not.toMatch(/\.gplus\b/);
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
    /* the stricter per-source clause: the CARD carries no inline style at
       all — its box is the stylesheet's — so the one place an inline
       `display:none` or a `visibility` write could hide the drag source
       from the sweep above is closed by there being no `style=` to write. */
    expect(DRAG_SOURCES.length, 'the per-source clause went vacuous').toBeGreaterThan(0);
    for (const src of DRAG_SOURCES) expect(styleOf(src), 'the card grew an inline style').toBe('');
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
 * SUITE 2 — the WEEK-CLICK BINDINGS (block 9, owls #88/#89, JP 2026-09-10;
 * PLAN.md block 9 template contract). Was the `dayAtX` suite (block 7): the
 * pointer-X → workday arithmetic went with the day grain — the PM names a
 * week by its column INDEX, so there is no X to map. What replaces it is a
 * statement of the CAPABILITY (test/CLAUDE.md rule 1), not a name-ban: every
 * committed row's `.gweek` cells carry the three week handlers, placed rows
 * included; the inert tracks carry none; the day machinery is out of the
 * shipped template whole.
 * ====================================================================== */

describe('the week click rides the `.gweek` cells of every committed row — placed rows included (#88)', () => {
  it('binds hover, leave and click on the cell, with the row id and the column index', () => {
    expect(CLICK_CELLS.length, 'no cell binds weekPlace — the week click has no home').toBeGreaterThanOrEqual(1);
    for (const cell of CLICK_CELLS) {
      expect(cell.source).toContain(`on-mouseenter="['weekHover', row.id, @index]"`);
      expect(cell.source).toContain(`on-mouseleave="['weekLeave']"`);
      expect(cell.source).toContain(`on-click="['weekPlace', row.id, @index]"`);
    }
  });

  it('binds UNCONDITIONALLY — no clause on `row.startsOn` gates the cells, so a placed row re-places by week', () => {
    /* Block 7 switched the track's bindings on `{{#if !row.startsOn}}` (hover
       and click for an unplotted row, the bar drag for a placed one). #88 gives
       the PM the week on EVERY row — the Design Lead's day is the PM's to
       overwrite by week (drift report §H) — so no such gate may exist on this
       tab. Read as the RULE: nowhere in the schedules view is a section opened
       on whether the row is placed. */
    const view = schedulesView().replace(/\{\{!\s[\s\S]*?\}\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    expect(view).not.toMatch(/\{\{#if !?row\.startsOn\}\}/);
    // the cell's own open tag: its bindings sit outside any section — the one
    // mustache it carries is the hover token inside `class`, and that is the
    // only place a section may open
    for (const cell of CLICK_CELLS) expect(cell.source.replace(/class="[^"]*"/, '')).not.toContain('{{#if');
    // …and the cells sit directly inside the committed row's track
    for (const cell of CLICK_CELLS) {
      expect(cell.ancestors.flatMap((a) => a.classes)).toEqual(expect.arrayContaining(['growr', 'sitem', 'gtrack', 'gweeks']));
    }
  });

  it('leaves the search row’s and the result rows’ cells INERT (owl #77 §0: adding and placing are two acts)', () => {
    expect(INERT_CELLS.length).toBeGreaterThanOrEqual(1);
    for (const cell of INERT_CELLS) {
      expect(cell.source, `an inert cell binds a handler: ${cell.source}`).not.toMatch(/\son-[a-z]+=/);
      const chain = cell.ancestors.flatMap((a) => a.classes);
      expect(chain.some((c) => c === 'gsearch' || c === 'gresult'), `an inert cell outside the search row: ${chain.join('.')}`).toBe(true);
    }
  });

  it('tints exactly the hovered WEEK of the hovered ROW — `gweek hover` from the pair, nothing else', () => {
    const on = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED, UNPLOTTED), hoverRow: 'i1', hoverWeek: 1 });
    const off = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED, UNPLOTTED), hoverRow: null, hoverWeek: null });
    const hovered = (html: string): string[] => [...html.matchAll(/<div class="gweek[^"]*"/g)].map((m) => m[0]).filter((t) => /\bhover\b/.test(t));
    expect(hovered(on)).toHaveLength(1);
    expect(hovered(off)).toHaveLength(0);
    // a row without a week (hoverWeek null) tints nothing — the OFFER is null
    expect(hovered(renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED), hoverRow: 'i1', hoverWeek: null }))).toHaveLength(0);
    // and the track says a click lands here, on the hovered row only
    expect([...on.matchAll(/class="gtrack placing"/g)]).toHaveLength(1);
    expect(off).not.toContain('gtrack placing');
  });

  it('carries none of block 7’s day machinery in the shipped template', () => {
    const view = TEMPLATE.replace(/\{\{!\s[\s\S]*?\}\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    for (const gone of ['gplus', 'ghovcell', 'barDrag', 'plotHover', 'plotLeave', 'plotPlace', 'plotDay', 'plotRow', 'dragRow', 'dragLeft', 'dragDay', 'plusLeft(', 'placeable(']) {
      expect(view, `\`${gone}\` outlived the day controls in the template`).not.toContain(gone);
    }
    // negative control: the sweep sees the template it claims to read
    expect(view).toContain("'weekPlace'");
    expect(view).toContain("'dlDragStart'");
  });

  it('keeps the week tint a stylesheet rule on the cell, not a second element', () => {
    // the hover cell (`.ghovcell`) was a one-workday element stacked in the
    // track; the week tint is the cell's own state class (PLAN.md styles)
    expect(cssRule('.gantt .gweek.hover')).toMatch(/background/);
    expect(GANTT_CSS).not.toMatch(/\.ghovcell\b/);
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
