/**
 * Batch 7 (T153) — a drag source must stay HIT-TESTABLE, and the bar owns its
 * own drop.
 *
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
}

/**
 * Flattens a stylesheet to `{ selector, body }` pairs. `@media`/`@supports`
 * blocks are walked into (a rule that only bites at one viewport is still a
 * rule); `@keyframes` and `@font-face` are skipped because their inner blocks
 * are keyed by percentages and descriptors, not selectors.
 */
function cssRules(file: string, css: string): CssRule[] {
  const out: CssRule[] = [];
  const walk = (src: string): void => {
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
          if (!/^@(keyframes|font-face|counter-style|property)\b/.test(selector)) walk(body);
        } else if (selector) out.push({ file, selector, body });
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

/**
 * Every ancestor of every drag source, de-duplicated. Derived, never listed.
 */
const ANCESTOR_TARGETS = targetsFor(
  'an ancestor of a drag source',
  [
    ...new Map(
      DRAG_SOURCES.flatMap((s) => s.ancestors).map((a) => [`${a.name}.${a.classes.join('.')}`, a]),
    ).values(),
  ],
);

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
    expect(selectors).toContain('.ubadge.saving');
    expect(selectors).toContain('.gantt .gbar .gseg');
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
    expect(chain('gbar')).toEqual(
      expect.arrayContaining(['gantt', 'gwrap', 'gsheet', 'gblock', 'gbrows', 'growr', 'gtrack']),
    );
    expect(chain('growr')).toEqual(expect.arrayContaining(['gantt', 'gwrap', 'gsheet', 'gblock', 'gbrows']));
    expect(chain('entry')).toEqual(expect.arrayContaining(['weekgrid', 'weekcard', 'daygrid', 'daycol']));
    // and the wrappers a hand-kept list had missed — this is the whole reason
    // the chain is derived rather than written down
    expect(chain('gbar')).toEqual(expect.arrayContaining(['view', 'pscrollwrap', 'pscroll', 'gscroll']));
  });
});

/* ====================================================================== *
 * SUITE 1 — THE GUARD
 * ====================================================================== */

describe('every drag source stays hit-testable (a synthetic DragEvent CANNOT prove this — real input only)', () => {
  it('enumerates the drag sources FROM the template, so a fourth one joins this guard automatically', () => {
    // hard-coding the list is how the next drag source slips past the guard
    const primary = DRAG_SOURCES.map((s) => s.classes[0]).sort();
    expect(primary).toEqual(['entry', 'gbar', 'growr']);
    expect(DRAG_SOURCES).toHaveLength(3);
  });

  it('reads the conditional class tokens too — a rule may target a state, not a resting class', () => {
    const byPrimary = Object.fromEntries(DRAG_SOURCES.map((s) => [s.classes[0]!, s.classes]));
    expect(byPrimary['growr']).toEqual(['growr', 'sel', 'pinned', 'unsched', 'arrived']);
    expect(byPrimary['gbar']).toEqual(['gbar']);
    expect(byPrimary['entry']).toEqual(['entry', 'late', 'urgent']);
  });

  it('lets NO rule in ANY stylesheet make a drag source pointer-events: none, in any state', () => {
    // THIS IS THE BUG. `.gantt .gbar { pointer-events: none }` is a rule whose
    // SUBJECT is `.gbar`, and `.gbar` carries `draggable` — Chrome starts the
    // drag from that ancestor and aborts because it cannot be hit.
    expect(offendersIn(ALL_RULES, SOURCE_TARGETS)).toEqual([]);
  });

  it('IS NOT VACUOUS — it flags the exact rule that shipped the bug, and the two variants that also broke it', () => {
    // a guard that cannot fail on the known bug proves nothing. These three are
    // the shipped rule and the two the orchestrator confirmed with real input.
    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), SOURCE_TARGETS);

    // 1. what shipped at 1e13088 — the wrapper transparent at rest
    expect(fixture('.gantt .gbar { position: absolute; inset: 0; pointer-events: none; cursor: grab; }'))
      .toHaveLength(1);
    // 2. hit-testable at mousedown only — forced transparent for the duration
    expect(fixture('.gantt.gdragging .gbar { pointer-events: none; }')).toHaveLength(1);
    // 3. the same trap on the OTHER planner source, scoped to one row state
    expect(fixture('.gantt .growr.pinned { pointer-events: none; }')).toHaveLength(1);
    // and a state-only rule still counts: the drag has to survive :active
    expect(fixture('.gbar:active { pointer-events: none; }')).toHaveLength(1);
    // …in whatever spelling: CSS is case-insensitive and tolerates whitespace
    // around the colon, so a reformat must not be able to walk past the guard
    expect(fixture('.gantt .gbar { POINTER-EVENTS : NONE; }')).toHaveLength(1);
    expect(fixture('.gantt .gbar { pointer-events:none !important; }')).toHaveLength(1);
  });

  it('does NOT cry wolf over rules that target something else', () => {
    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), SOURCE_TARGETS);
    expect(fixture('.gantt .gbar .gseg { pointer-events: none; }')).toEqual([]); // subject is .gseg
    expect(fixture('.gantt .gbar { pointer-events: auto; }')).toEqual([]); // not a `none`
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
    // a transparent .gtrack would disable the .gbar inside it just as surely,
    // and the chains come from the template's own nesting so a wrapper added
    // tomorrow is swept the day it appears
    expect(ANCESTOR_TARGETS.length).toBeGreaterThan(10);
    expect(offendersIn(ALL_RULES, ANCESTOR_TARGETS)).toEqual([]);
  });

  it('the ancestor sweep IS NOT VACUOUS either — a transparent wrapper is flagged wherever it sits', () => {
    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), ANCESTOR_TARGETS);
    expect(fixture('.gtrack { pointer-events: none; }')).toHaveLength(1); // the bar's own parent
    expect(fixture('.gscroll { pointer-events: none; }')).toHaveLength(1); // a wrapper the old list missed
    expect(fixture('.daycol.holiday { pointer-events: none; }')).toHaveLength(1); // the Deadlines chain
    expect(fixture('.gseg { pointer-events: none; }')).toEqual([]); // a CHILD, not an ancestor
  });

  it('lets no `.gdragging` rule hide a drag source by ANY means — it must stay hittable for the whole drag', () => {
    // control 3 of the real-input diagnosis: hit-testable at mousedown only is
    // not enough. `visibility: hidden` and `display: none` take an element out
    // of hit-testing exactly as `pointer-events: none` does, so the mid-drag
    // sweep looks for all three — while leaving at-rest hiding (a filtered row,
    // a collapsed block) alone, which is ordinary layout work.
    const midDrag = ALL_RULES.filter((r) => r.selector.includes('.gdragging'));
    expect(midDrag.length).toBeGreaterThan(0);
    expect(offendersIn(midDrag, [...SOURCE_TARGETS, ...ANCESTOR_TARGETS], HIT_TEST_OFF_ANY)).toEqual([]);

    const fixture = (css: string) => offendersIn(cssRules('fixture.css', css), SOURCE_TARGETS, HIT_TEST_OFF_ANY);
    expect(fixture('.gantt.gdragging .gbar { pointer-events: none; }')).toHaveLength(1);
    expect(fixture('.gantt.gdragging .gbar { visibility: hidden; }')).toHaveLength(1);
    expect(fixture('.gantt.gdragging .gbar { display: none; }')).toHaveLength(1);
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

  it('states `pointer-events: auto` on the bar rather than merely omitting none', () => {
    // an explicit auto is what the next reader sees, and — since the property
    // INHERITS — what defends the source against a future ancestor rule
    expect(GANTT_CSS).toMatch(/\.gantt \.gbar \{[^}]*pointer-events: auto/);
    expect(GANTT_CSS).not.toMatch(/\.gantt \.gbar \{[^}]*pointer-events: none/);
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
    const draggingSubjects = TRANSPARENT_RULES.filter((r) => r.selector.includes('.gdragging'))
      .flatMap((r) => r.selector.split(',').map((s) => subjectClasses(s).join('.')));
    expect(draggingSubjects).toEqual(['gdl']);
  });

  it('leaves the four legitimate transparencies alone — the guard must not have been met by deleting rules', () => {
    // none of these carries `draggable`, and none is an ancestor of one
    expect(GANTT_CSS).toMatch(/\.gantt \.gghost \{[^}]*pointer-events: none/s);
    expect(GANTT_CSS).toMatch(/\.gantt \.gunsched \{[^}]*pointer-events: none/s);
    const pipeline = STYLESHEETS.find((s) => s.file === '20-pipeline.css')!.css;
    expect(pipeline).toMatch(/\.ubadge\.saving \{[^}]*pointer-events: none/);
    expect(pipeline).toMatch(/\.datefield\.saving \{[^}]*pointer-events: none/);
  });

  it('keeps the segments hit-testable at rest as well, so the visible bar is grabbable', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.gbar \.gseg \{[^}]*pointer-events: auto/);
  });
});

/* ====================================================================== *
 * SUITE 2 — the pointer-X → week-column mapping
 * ====================================================================== */

type WeekAtX = (clientX: number, rect: { left: number; width: number }, weeks?: { key: string }[]) => string | null;

/**
 * The SHIPPED recipe, sliced out of 01-app.js and executed — never retyped.
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

/** The `<div class="gbar" …>` open tag, as source — directives never render. */
const BAR_TAG = TEMPLATE_ELEMENTS.find((e) => e.source.startsWith('<div class="gbar"'))!.source;

describe('the bar is the drag source AND its own drop target', () => {
  it('carries all five directives on one element (source, not render — directives never reach toHTML)', () => {
    expect(BAR_TAG).toMatch(/\bdraggable=/);
    expect(BAR_TAG).toContain("on-dragstart=\"['dragRow', row.cardId]\"");
    expect(BAR_TAG).toContain("on-dragend=\"['dragEnd']\"");
    expect(BAR_TAG).toContain("on-dragover=\"['dragOver']\"");
    expect(BAR_TAG).toContain("on-drop=\"['dropOnBar']\"");
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
    expect(html).toContain('<div class="gbar" draggable="false"');
    expect(html).toContain('title="Pinned — unpin to move"');
  });

  it('a pinned bar is still a valid LANDING strip for someone else’s drag — the pin freezes the ROW, not the column', () => {
    // suppressing the drop handlers on a pinned bar would carve a dead 1104px
    // strip across the timeline that silently refuses every drop. The
    // directives sit outside any pinned conditional, which is what makes that
    // true for every row state at once.
    expect(BAR_TAG).toContain("on-dragover=\"['dragOver']\"");
    expect(BAR_TAG).toContain("on-drop=\"['dropOnBar']\"");
    expect(BAR_TAG).not.toContain('{{#if');
    expect(BAR_TAG).not.toContain('{{#unless');
  });
});

describe('an unscheduled row keeps the row-drag it has no bar to replace', () => {
  const html = renderGantt({ plannerGroups: groups([UNSCHEDULED]) });

  it('still drags whole, still shows its grip, still renders no bar', () => {
    expect(/<div class="growr[^>]*>/.exec(html)![0]).toContain('draggable="true"');
    expect(html).toContain('class="ghandle"');
    expect(html).not.toContain('class="gbar"');
    expect(html).toContain('class="gunsched"');
  });

  it('is the second `draggable` source in the template, and the guard covers it too', () => {
    expect(DRAG_SOURCES.some((s) => s.classes[0] === 'growr')).toBe(true);
  });
});
