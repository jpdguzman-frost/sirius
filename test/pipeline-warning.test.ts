/**
 * T144 → T165 — the Pipeline per-row warning. Batch 10 (owl miles → jp #41,
 * nodes 578:56516 / I578:56516;484:27906 / 537:69135) REVISES what batch 5
 * shipped: the underlined "Needs Info" message line under the card name becomes
 * a 14×14 alert ICON in the MC# cell, the amber-50 row wash is deleted, and the
 * click popover becomes a HOVER CARD that also opens on keyboard focus.
 *
 * Two halves, both executed rather than grepped:
 *
 *   RECIPE — `WARN_LABEL`, `WARN_WHY` and `rowWarning` are sliced out of the
 *   SHIPPED `frontend/scripts/01-app.js` and evaluated (the
 *   test/suggest-counts.test.ts pattern). The label is a VARIABLE string in
 *   every place it appears, so the tests read it from the constant instead of
 *   re-typing 'Needs Info' — retyping it would be the drift the ruling exists
 *   to prevent. Batch 10 moves the icon's accessible NAME into the same recipe
 *   (label + pluralised missing-field count + card identity, R-warn-m), because
 *   pluralising a count is arithmetic and the template must not do arithmetic.
 *
 *   MARKUP — the same function is then fed to `renderPipelineTable`, which
 *   renders the shipped template through Ractive's own `toHTML()`. That is
 *   what proves the recipe and the row actually meet: a source-text assertion
 *   can show a string is present without showing that it renders.
 *
 * ─── WHAT THIS FILE CANNOT PROVE ────────────────────────────────────────────
 *
 * There is no jsdom and no browser runner in this repo. `toHTML()` is a string,
 * not a document: it has no pointer, no focus, no layout and no clock. So NONE
 * of the behaviour this batch is actually about is provable here —
 *
 *   · that hovering the icon opens the card;
 *   · that the transparent `::before` bridge lets the pointer cross the 4px gap
 *     without the card closing under it;
 *   · that the 150ms close delay feels right, or that row A's pending close
 *     cannot shut row B;
 *   · that `focusout` with a `relatedTarget` inside the card does not dismiss;
 *   · that Escape from inside the card closes it and hands focus back;
 *   · that the bridge and the squared corner really do flip together at the
 *     bottom of the viewport.
 *
 * Dispatching a synthetic `mouseenter` at a detached Ractive fragment would
 * demonstrate that a handler is WIRED, not that the hover card works, and its
 * greenness must never be allowed to stand in for the live pass. So this file
 * asserts two things and refuses to pretend to a third: the STRUCTURE that
 * makes the behaviour possible (DOM order, one timer handle, one close path,
 * the bridge rule, the flip carrier) and the WIRING (which directive sits on
 * which node). The behaviour itself is the orchestrator's live pass after
 * deploy — exactly as the drag was in batch 8. See the `it.todo` block at the
 * foot of this file: it is the checklist that pass owes.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The deletion guards matter as much as the feature: the aggregate signal did
 * not disappear with the panel, it moved to the OPEN WORK KPI, and `corrections`
 * must stay on the wire (test/schedule.test.ts:301 is the server half of that).
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_JS,
  PIPELINE_CSS,
  TEMPLATE,
  type PipeRow,
  cssRule,
  decl,
  leakedMustacheText,
  renderPipelineTable,
} from './helpers/gantt-render.ts';

interface Warning {
  label: string;
  /** batch 10: the icon's accessible name, composed in the recipe (R-warn-m) */
  srLabel: string;
  items: Array<{ label: string; why: string }>;
}
interface Recipe {
  WARN_LABEL: string;
  WARN_WHY: Record<string, string>;
  rowWarning: (row: unknown) => Warning | null;
}

const recipe = new Function(`
  ${decl(APP_JS, 'WARN_LABEL')}
  ${decl(APP_JS, 'WARN_WHY')}
  ${decl(APP_JS, 'rowWarning')}
  return { WARN_LABEL, WARN_WHY, rowWarning };
`)() as Recipe;

/**
 * The server's own tokens, READ OUT OF the server, in the order
 * `src/services/pipeline.ts toRow()` pushes them.
 *
 * Deliberately not a hand-copied list. `WARN_WHY` is keyed on these strings and
 * `rowWarning` renders `WARN_WHY[f] || ''` — so a reworded token on the server
 * ships a popover with the field name and a BLANK rationale, and a snapshot
 * here would have agreed with the client copy and stayed green while the app
 * explained nothing.
 */
const SERVER_TOKENS: string[] = (() => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'services', 'pipeline.ts'),
    'utf8',
  );
  const fn = src.slice(src.indexOf('function toRow('));
  const found = [...fn.slice(0, fn.indexOf('const startDate')).matchAll(/missing\.push\('([^']+)'\)/g)]
    .map((m) => m[1] as string);
  if (found.length === 0) throw new Error('pipeline-warning: no missing.push() tokens found in toRow()');
  return found;
})();

const row = (over: Partial<PipeRow> = {}): PipeRow => ({
  cardId: 'card-1',
  mcNumber: 'MC-655',
  mcLabel: 'MC-655',
  displayId: 'MC-655.1',
  name: 'Hero render',
  missing: [],
  trelloUrl: 'https://trello.com/c/card-1',
  ...over,
});

const WARNED = row({ missing: [...SERVER_TOKENS] });
const CLEAN = row({ cardId: 'card-2', mcNumber: 'MC-712', mcLabel: 'MC-712', name: 'Loft plan', missing: [] });
/** one problem only — the singular half of the pluralisation rule */
const ONE = row({ cardId: 'card-5', mcNumber: 'MC-901', mcLabel: 'MC-901', name: 'Thin card', missing: ['due date'] });
/** R-warn-g, now held BY CONSTRUCTION: blocked wins the fill, warned keeps the accent */
const BOTH = row({
  cardId: 'card-4', mcNumber: 'MC-800', mcLabel: 'MC-800', name: 'Blocked and thin',
  missing: ['due date'], blocker: 'Awaiting brief',
});

/**
 * The `<tr class="prow …">` of one row, up to (not including) the next `<tr`.
 * Anchored on the rendered MC label, because Ractive directives (`on-click`)
 * never reach `toHTML()` — the cardId is not in the emitted markup at all.
 */
function rowHtml(html: string, mcLabel: string): string {
  const anchor = html.indexOf(`<span class="mcnum">${mcLabel}</span>`);
  expect(anchor, `no row for ${mcLabel} rendered`).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<tr', anchor);
  const next = html.indexOf('<tr', anchor);
  return html.slice(start, next < 0 ? html.length : next);
}

/** One `<td class="…">…</td>` of a rendered row. Table cells do not nest here. */
function cell(rowMarkup: string, cls: string): string {
  const at = rowMarkup.indexOf(`<td class="${cls}"`);
  expect(at, `no .${cls} cell in the row`).toBeGreaterThan(-1);
  const end = rowMarkup.indexOf('</td>', at);
  return rowMarkup.slice(at, end + '</td>'.length);
}

/** One start tag, from its opening marker to the `>` that closes it. */
function tag(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `no \`${marker}\``).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf('>', at) + 1);
}

const attr = (tagText: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tagText);
  return m ? m[1]! : null;
};

/* Comments are prose and may legitimately quote a deleted class or a frame
   measurement — R-warn-a's block still records that the frame drew 113px. The
   rules below are about what the sheet DECLARES and what the page RENDERS, so
   they read a comment-free copy. */
const cssCode = PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
const tplCode = TEMPLATE.replace(/<!--[\s\S]*?-->/g, ' ');
/* `(^|[^:])` so a `https://…` inside a template literal is not mistaken for a
   line comment — stripping it would swallow the rest of that line. */
const jsCode = APP_JS.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/gm, '$1');

/**
 * The body of a top-level `function NAME(…) { … }`, braces balanced, read from
 * the comment-free copy. Used only for assertions about STRUCTURE — which door
 * calls which, and in what order — never to snapshot a body's text.
 */
function fnBody(name: string): string {
  const at = jsCode.indexOf(`function ${name}(`);
  expect(at, `no \`function ${name}\` in the shipped client`).toBeGreaterThan(-1);
  let i = jsCode.indexOf('(', at);
  for (let depth = 0; i < jsCode.length; i++) {
    if (jsCode[i] === '(') depth++;
    else if (jsCode[i] === ')' && --depth === 0) break;
  }
  const open = jsCode.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < jsCode.length; j++) {
    if (jsCode[j] === '{') depth++;
    else if (jsCode[j] === '}' && --depth === 0) return jsCode.slice(open, j + 1);
  }
  throw new Error(`pipeline-warning: \`${name}\` never closes`);
}

/** The body of an `on:` object member `NAME(…) { … }`, same contract. */
function handlerBody(name: string): string {
  const at = new RegExp(`\\n  ${name}\\(`).exec(jsCode)?.index;
  expect(at, `no \`${name}\` handler in the shipped client`).toBeGreaterThan(-1);
  const open = jsCode.indexOf('{', jsCode.indexOf(')', at!));
  let depth = 0;
  for (let j = open; j < jsCode.length; j++) {
    if (jsCode[j] === '{') depth++;
    else if (jsCode[j] === '}' && --depth === 0) return jsCode.slice(open, j + 1);
  }
  throw new Error(`pipeline-warning: \`${name}\` never closes`);
}

describe('the copy map and the server speak the same vocabulary', () => {
  it('keys WARN_WHY on EXACTLY the tokens the server pushes — no more, no fewer', () => {
    /* The failure this catches is silent by construction: `rowWarning` renders
       `WARN_WHY[f] || ''`, so a token the map has not met produces a popover
       that names the field and explains nothing, with every other test still
       green. Asserted as set equality in both directions — an orphaned key is
       dead copy nobody will ever see, and a missing one is a blank rationale. */
    expect(Object.keys(recipe.WARN_WHY).sort()).toEqual([...SERVER_TOKENS].sort());
  });

  it('reads the server’s tokens from the server, not from a copy in this file', () => {
    // the guard is only worth having if it cannot drift with what it guards
    expect(SERVER_TOKENS.length).toBeGreaterThan(0);
    expect(SERVER_TOKENS).toContain('difficulty label');
  });
});

describe('the warning recipe, executed out of the shipped source', () => {
  it('returns null for a complete card — the template has exactly one test', () => {
    expect(recipe.rowWarning(CLEAN)).toBeNull();
    expect(recipe.rowWarning({ ...CLEAN, missing: undefined })).toBeNull();
    expect(recipe.rowWarning(null)).toBeNull();
  });

  it('names the card itself first, then one item per missing field in server order', () => {
    const w = recipe.rowWarning(WARNED)!;
    expect(w.label).toBe(recipe.WARN_LABEL);
    expect(w.items).toHaveLength(4);
    // items[0] is the ROW's own identity — the frame's 'MC-821' is stale filler
    expect(w.items[0]).toEqual({ label: WARNED.mcLabel, why: WARNED.name });
    expect(w.items[0]!.label).not.toBe('MC-821');
    expect(w.items.slice(1).map((i) => i.label)).toEqual(SERVER_TOKENS);
  });

  it('carries a non-empty rationale for every field, from the ONE copy map', () => {
    const w = recipe.rowWarning(WARNED)!;
    for (const item of w.items.slice(1)) {
      expect(item.why.length).toBeGreaterThan(0);
      expect(item.why).toBe(recipe.WARN_WHY[item.label]);
    }
    // the two that predate this pass keep the deleted banner's own wording
    expect(recipe.WARN_WHY['difficulty label']).toMatch(/difficulty label the card cannot forecast/);
    expect(recipe.WARN_WHY['due date']).toMatch(/due date .* cannot raise a deadline conflict/);
    // R-warn-b: proposed copy, flagged to Miles
    expect(recipe.WARN_WHY['Figma attachment']).toMatch(/Figma attachment/);
  });

  it('renders an unknown token with an empty rationale rather than throwing', () => {
    const w = recipe.rowWarning(row({ missing: ['a field nobody has met'] }))!;
    expect(w.items).toHaveLength(2);
    expect(w.items[1]).toEqual({ label: 'a field nobody has met', why: '' });
  });

  it('follows a single missing field, not the full set', () => {
    const w = recipe.rowWarning(row({ missing: ['due date'] }))!;
    expect(w.items.map((i) => i.label)).toEqual(['MC-655', 'due date']);
  });

  /* R-warn-m. With the message line deleted the icon is the ONLY textual
     carrier of the warning left on the row, so its accessible name is the whole
     accessibility story — and the name has to say WHICH card, because 247 of
     249 live rows warn and two icons on screen would otherwise be
     indistinguishable. Composed in the recipe, never in the markup. */
  it('composes the icon’s accessible name — label, count, card identity — in the RECIPE', () => {
    const w = recipe.rowWarning(WARNED)!;
    expect(w.srLabel).toContain(recipe.WARN_LABEL);
    expect(w.srLabel).toContain(WARNED.mcLabel);
    expect(w.srLabel).toContain(WARNED.name);
  });

  it('pluralises the count, and counts the PROBLEMS rather than the list items', () => {
    const one = recipe.rowWarning(ONE)!;
    expect(one.srLabel).toContain('1 missing field');
    // the singular is the whole point of the assertion: '1 missing fields' is
    // what a template doing its own arithmetic would have produced
    expect(one.srLabel).not.toContain('1 missing fields');

    const many = recipe.rowWarning(WARNED)!;
    expect(many.srLabel).toContain(`${SERVER_TOKENS.length} missing fields`);

    // items[0] is the card's own identity, so the count is items.length - 1 —
    // stated here so the two can never drift into disagreeing on screen
    for (const w of [one, many]) {
      expect(w.srLabel).toContain(`${w.items.length - 1} missing field`);
    }
  });
});

describe('the warned row (card closed)', () => {
  const html = () => renderPipelineTable({ pipelineRows: [WARNED, CLEAN, BOTH], rowWarning: recipe.rowWarning });

  it('marks the row .warn and leaves a complete card untouched', () => {
    const warned = rowHtml(html(), 'MC-655');
    expect(warned).toMatch(/class="prow\b[^"]*\bwarn\b/);

    const clean = rowHtml(html(), 'MC-712');
    expect(clean).not.toMatch(/\bwarn\b/);
    // a clean row gets NO trigger, no host and no card — the host is where the
    // focusout listener lives, so a complete card must not carry one at all
    expect(clean).not.toContain('warnbtn');
    expect(clean).not.toContain('warnhost');
    expect(clean).not.toContain('warnpop');
    // …but it still gets the identity group the icon would have joined
    expect(clean).toContain('<div class="mcid">');
  });

  it('puts exactly one icon button in the MC# CELL, wired for a dialog', () => {
    const warned = rowHtml(html(), 'MC-655');
    const mc = cell(warned, 'col-mc');

    expect([...warned.matchAll(/<button class="warnbtn"/g)]).toHaveLength(1);
    expect(mc).toContain('<button class="warnbtn"');

    const btn = tag(mc, '<button class="warnbtn"');
    expect(attr(btn, 'aria-haspopup')).toBe('dialog');
    expect(attr(btn, 'aria-expanded')).toBe('false');
    // the name is the recipe's, character for character — not a second
    // composition that happens to read the same today
    expect(attr(btn, 'aria-label')).toBe(recipe.rowWarning(WARNED)!.srLabel);
  });

  it('draws the warning as a 14px glyph the screen reader steps over', () => {
    const mc = cell(rowHtml(html(), 'MC-655'), 'col-mc');
    const svg = tag(mc, '<svg class="i14"');
    expect(attr(svg, 'aria-hidden')).toBe('true');
    expect(mc).toContain('#i-warning');
  });

  it('leaves NO visible text on the trigger — the name is the accessible one', () => {
    const mc = cell(rowHtml(html(), 'MC-655'), 'col-mc');
    const at = mc.indexOf('<button class="warnbtn"');
    const inner = mc.slice(mc.indexOf('>', at) + 1, mc.indexOf('</button>', at));
    expect(inner.replace(/<[^>]*>/g, '').trim()).toBe('');
    // the variable-string rule (R-warn-c): renaming the label is a one-line
    // change, so the word may not appear in the markup at all
    expect(TEMPLATE).not.toContain(recipe.WARN_LABEL);
  });

  it('leaves nothing of the message line behind, in the row or in the template', () => {
    const warned = rowHtml(html(), 'MC-655');
    for (const dead of ['warnmsg', 'warnwrap', 'warnlabel']) {
      expect(warned, `${dead} still renders`).not.toContain(dead);
      expect(tplCode, `${dead} still in the template`).not.toContain(dead);
    }
    expect(warned).not.toMatch(/\bi10\b/);
  });

  it('keeps the card-name cell free of the warning entirely', () => {
    expect(cell(rowHtml(html(), 'MC-655'), 'col-name')).not.toMatch(/warn/i);
  });

  it('disables nothing — the warning is presentation, and the row stays operable', () => {
    const disabledIn = (html_: string) => [...html_.matchAll(/disabled/g)].length;
    expect(disabledIn(rowHtml(html(), 'MC-655'))).toBe(disabledIn(rowHtml(html(), 'MC-712')));
    // and the row itself gained no handler with the class
    expect(rowHtml(html(), 'MC-655')).toContain('tabindex="0"');
    // the new control is a real, enabled, tabbable button
    expect(tag(rowHtml(html(), 'MC-655'), '<button class="warnbtn"')).not.toContain('disabled');
  });

  it('keeps the red fill on a row that is BOTH blocked and warned', () => {
    const both = rowHtml(html(), 'MC-800');
    expect(both).toMatch(/class="prow\b[^"]*\bblocked\b/);
    expect(both).toMatch(/class="prow\b[^"]*\bwarn\b/);
    expect(both).toContain('<button class="warnbtn"');
    /* R-warn-g now holds BY CONSTRUCTION rather than by an override: with the
       amber wash deleted, no rule paints a warned row's background at all, so
       the blocked rule is uncontested. The CSS half of this is asserted below
       (`no rule paints a warned row's background`). */
    expect(cssRule('.ptable tr.blocked td', PIPELINE_CSS)).toContain('var(--red-50)');
  });
});

describe('the hover card (open on one row)', () => {
  const open = (over: Partial<Parameters<typeof renderPipelineTable>[0]> = {}) =>
    renderPipelineTable({
      pipelineRows: [WARNED, CLEAN], warnPop: WARNED.cardId, rowWarning: recipe.rowWarning, ...over,
    });
  const html = () => open();

  /**
   * Attribute-wise, not by literal substring: Ractive's `toHTML()` hoists the
   * inline `style` ahead of the attributes that follow it in source, so
   * `<div class="warnpop" role="dialog"` never appears verbatim.
   *
   * Anchored on `warnpop\b` rather than `warnpop"` since batch 10 — the flipped
   * card is `class="warnpop flip"`, and an anchor that could only find the
   * unflipped one would have silently stopped testing half the states.
   */
  function popover(src: string = html()): string {
    const at = src.search(/<div class="warnpop\b/);
    expect(at, 'the popover never rendered').toBeGreaterThan(-1);
    const rest = src.slice(at);
    let depth = 0;
    for (const m of rest.matchAll(/<div\b|<\/div>/g)) {
      if (m[0] === '</div>') {
        if (--depth === 0) return rest.slice(0, m.index + '</div>'.length);
      } else depth++;
    }
    throw new Error('pipeline-warning: the popover never closes');
  }

  it('is a dialog named by the recipe AND by the card, with the trigger reporting it open', () => {
    const pop = popover();
    expect(pop).toContain('role="dialog"');
    // several rows can be warned at once, so the dialog's accessible name has
    // to say WHICH card — attribute-wise for the reason the slicer documents
    const name = attr(tag(pop, '<div class="warnpop'), 'aria-label')!;
    expect(name).toContain(recipe.rowWarning(WARNED)!.label);
    expect(name).toContain(WARNED.mcLabel);
    expect(name).toContain(WARNED.name);
    expect(attr(tag(rowHtml(html(), 'MC-655'), '<button class="warnbtn"'), 'aria-expanded')).toBe('true');
  });

  /* THE KEYBOARD-ORDER RULE. `Open Card` is a link inside the card, so the card
     has to be Tab-reachable FROM the icon — which means it must be the icon's
     next sibling in DOM order, inside the same cell. Anything wedged between
     them (a wrapper, a second control, a stray span) breaks that with no visual
     symptom at all. */
  it('renders the card inside the MC# cell, immediately after its trigger', () => {
    const mc = cell(rowHtml(html(), 'MC-655'), 'col-mc');
    const btn = mc.indexOf('<button class="warnbtn"');
    const card = mc.search(/<div class="warnpop\b/);
    expect(btn).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(btn);

    const between = mc.slice(mc.indexOf('</button>', btn) + '</button>'.length, card);
    expect(between, 'something sits between the icon and its card').not.toContain('<');
  });

  it('carries the flip decision on the CARD, so the corner and the bridge move together', () => {
    // `warnPopPos.up` is the one carrier: placeBox decides it, the class
    // spells it, and the stylesheet mirrors the radius and the bridge off it
    const down = popover(open({ warnPopPos: { left: 0, top: 0, up: false } }));
    expect(tag(down, '<div class="warnpop')).toContain('class="warnpop"');

    const up = popover(open({ warnPopPos: { left: 0, top: 0, up: true } }));
    expect(tag(up, '<div class="warnpop')).toContain('class="warnpop flip"');
  });

  it('titles itself with the row label', () => {
    expect(/<span class="wptitle">([^<]*)<\/span>/.exec(popover())![1]).toBe(recipe.rowWarning(WARNED)!.label);
  });

  it('lists the card identity first, then every missing field with its rationale', () => {
    const items = [...popover().matchAll(
      /<div class="wpitem"><span class="wplabel">([^<]*)<\/span><span class="wpwhy">([^<]*)<\/span><\/div>/g,
    )].map((m) => ({ label: m[1], why: m[2] }));
    const expected = recipe.rowWarning(WARNED)!.items;
    expect(items).toHaveLength(expected.length);
    expect(items[0]).toEqual({ label: WARNED.mcLabel, why: WARNED.name });
    expect(items).toEqual(expected);
  });

  it('draws one separator', () => {
    expect([...popover().matchAll(/class="wpsep"/g)]).toHaveLength(1);
  });

  it('puts the separator BEFORE Open Card, never after the last detail', () => {
    const pop = popover();
    expect(pop.indexOf('class="wpsep"')).toBeLessThan(pop.indexOf('class="wpopen"'));
  });

  it('links Open Card to the ROW\'s own Trello URL, in a new tab, with rel=noopener', () => {
    const pop = popover();
    const link = /<a class="wpopen"([^>]*)>([^<]*)<\/a>/.exec(pop)!;
    expect(link[2]).toBe('Open Card');
    expect(link[1]).toContain(`href="${WARNED.trelloUrl}"`);
    expect(link[1]).toContain('target="_blank"');
    expect(link[1]).toContain('rel="noopener"');
  });

  it('renders neither Open Card nor a dangling separator for a row Trello has no URL for', () => {
    const noUrl = row({ cardId: 'card-3', missing: ['due date'], trelloUrl: null });
    const out = renderPipelineTable({ pipelineRows: [noUrl], warnPop: 'card-3', rowWarning: recipe.rowWarning });
    expect(out).toMatch(/<div class="warnpop\b/);
    expect(out).not.toContain('wpopen');
    // the separator exists to divide the details from the link; with no link
    // it would be a bare 1px rule under the last detail
    expect(out).not.toContain('wpsep');
  });

  it('opens exactly one card even when several rows are warned', () => {
    const second = row({ cardId: 'card-9', mcLabel: 'MC-900', name: 'Second warned', missing: ['due date'] });
    const out = renderPipelineTable({
      pipelineRows: [WARNED, second], warnPop: WARNED.cardId, rowWarning: recipe.rowWarning,
    });
    expect([...out.matchAll(/<div class="warnpop\b/g)]).toHaveLength(1);
    expect([...out.matchAll(/<button class="warnbtn"/g)]).toHaveLength(2);
  });
});

/**
 * WIRING, not behaviour. Ractive directives never reach `toHTML()`, so which
 * handler sits on which node can only be read out of the template source — and
 * reading it proves the wiring exists, nothing more. That hover, the bridge,
 * the delay and focus-out actually WORK is the live pass's to say.
 */
describe('the hover-card wiring, read out of the shipped template', () => {
  const btnTag = () => tag(tplCode, '<button class="warnbtn"');

  it('opens on pointer-enter AND on focus, from the same handler', () => {
    const t = btnTag();
    expect(t).toContain(`on-mouseenter="['warnPopIn', row.cardId]"`);
    expect(t).toContain(`on-focus="['warnPopIn', row.cardId]"`);
    expect(t).toContain(`on-mouseleave="['warnPopOut']"`);
  });

  it('holds itself open while the pointer is INSIDE the card, through the same handler', () => {
    // the card re-arms with the SAME opener and the same cardId: an opener that
    // is not idempotent would shut the card the moment the pointer reached it
    const card = tag(tplCode, '<div class="warnpop');
    expect(card).toContain(`on-mouseenter="['warnPopIn', row.cardId]"`);
    expect(card).toContain(`on-mouseleave="['warnPopOut']"`);
  });

  it('listens for focusout on the HOST — the one node containing both the icon and the card', () => {
    expect(tag(tplCode, '<div class="warnhost"')).toContain(`on-focusout="['warnPopFocusOut']"`);
    // …and not on the identity group, which every row renders: a complete card
    // must not attach a listener it can never fire
    expect(tag(tplCode, '<div class="mcid"')).not.toContain('on-');
  });

  it('gives the trigger NO click and NO keydown of its own', () => {
    const t = btnTag();
    expect(t).not.toContain('on-click');
    // pipeRowKey lives on the <tr> and guards on target !== node; a keydown
    // directive here would be the batch-6 immunisation patch all over again
    expect(t).not.toContain('on-keydown');
  });

  it('leaves pipeRowKey’s target guard standing, with a new focusable control in the row', () => {
    expect(handlerBody('pipeRowKey')).toContain('ctx.event.target !== ctx.node');
  });
});

/**
 * R-warn-f generalised. Focus return was added once, in the shared close path —
 * but only the DISMISS routes went through it. Five handlers that close an
 * overlay by COMMITTING a choice still nulled their own state key, so a
 * keyboard user who pressed Enter on a menu option was dropped at `<body>` and
 * restarted the next Tab from the top of the document: the exact regression the
 * Escape path was written to fix, surviving on the path people actually use.
 * The direct writes also left `overlayTrigger` pinning a node the re-render had
 * already detached.
 */
describe('every overlay closes through ONE path — commit as well as dismiss', () => {
  const OVERLAYS = ['urgencyMenu', 'diffMenu', 'duePopover', 'reqMenu', 'warnPop'];

  it('names the overlays once and derives the three lists from that name', () => {
    expect(APP_JS).toContain('const OVERLAY_KEYS = ');
    for (const key of OVERLAYS) expect(APP_JS, key).toContain(`'${key}'`);
    // the object literal that used to be written out in both closeMenus and
    // openOverlay, and had to be edited in step
    expect(APP_JS).toContain('const NO_OVERLAYS = ');
    expect(APP_JS).not.toContain('urgencyMenu: null, diffMenu: null');
  });

  it('leaves NO handler nulling an overlay key on its own', () => {
    for (const key of OVERLAYS) {
      expect(APP_JS, `${key} is closed outside closeMenus()`).not.toContain(`app.set('${key}', null)`);
    }
  });

  it('returns focus to the trigger when a choice is committed, not only on Escape', () => {
    for (const handler of [
      'async chooseUrgency(', 'async chooseDifficulty(', 'async dueApply(', 'async dueClear(', 'pickReqFilter(',
    ]) {
      const at = APP_JS.indexOf(handler);
      expect(at, handler).toBeGreaterThan(-1);
      const body = APP_JS.slice(at, at + 600);
      expect(body, handler).toContain('closeMenus({ restoreFocus: true })');
    }
  });

  it('restores focus WITHOUT scrolling — the dismisser itself runs on scroll', () => {
    // a trackpad nudge dismisses the overlay; focusing the trigger the normal
    // way would scroll it back into view and undo the gesture that closed it
    expect(APP_JS).toContain('t.focus({ preventScroll: true })');
  });

  it('EXTENDS the machinery rather than forking it — one opener, one placer', () => {
    // the hover card is the fifth overlay the list already names; a second
    // positioner or a second close path is the regression this guards
    expect([...jsCode.matchAll(/function placeBox\(/g)]).toHaveLength(1);
    expect([...jsCode.matchAll(/function placeMeasured\(/g)]).toHaveLength(1);
    expect([...jsCode.matchAll(/function closeMenus\(/g)]).toHaveLength(1);
    expect([...jsCode.matchAll(/function openOverlay\(/g)]).toHaveLength(1);
    expect(fnBody('showWarnPop')).toContain('openOverlay(');
  });

  it('PLACES THE CARD A SECOND TIME against the box that actually rendered', () => {
    /* The brief is verbatim on this — "Height is data-derived … so measure the
       rendered box and re-place; never assume a fixed height" — and nothing
       asserted it: deleting both lines from `showWarnPop` left the whole suite
       green. WARN_POP_H is 346 (three problems) against the ~202 a one-problem
       card measures, so without the re-place `placeBox` flips up over roughly
       the bottom half of any viewport and then parks the box ~144px above where
       the card renders. The bridge is 4px tall at the card's own edge, so it
       lands nowhere near the icon and `Open Card` is unreachable by pointer —
       the one thing the annotation insists on.

       It is load-bearing twice: the second placement is also what settles the
       final `up`, and `up` is the only carrier of the flip that drives both the
       squared corner and the side the bridge sits on (R-warn-p). */
    const body = fnBody('showWarnPop');
    expect(body, 'showWarnPop never re-places against the measured box').toContain('placeMeasured(');
    // …and it retries on the next frame when the card is not mounted yet —
    // placeMeasured returns false for exactly that case and says so
    expect(body).toContain('requestAnimationFrame(');
    expect(body.indexOf('openOverlay(')).toBeLessThan(body.indexOf('placeMeasured('));
    // it measures the CARD, not some other overlay's box
    expect(body).toContain("sel: '.warnpop'");
  });

  it('anchors the card to the BUTTON, not to whatever the pointer entered', () => {
    /* `ctx.node` is the element the directive sits on; `ctx.event.target` is
       the 14px `<svg>` inside it. Placing against the target would shift the
       card by the button's own pad and hand `openOverlay` the wrong element to
       capture as `overlayTrigger` — which is what the focus return, the timer
       stand-down (R-warn-v) and the flip all read back. */
    expect(handlerBody('warnPopIn')).toContain('ctx.node');
    expect(handlerBody('warnPopIn')).not.toContain('ctx.event.target');
  });
});

/**
 * The close DELAY is a timer, and timers outlive the state they were scheduled
 * against. None of the structure below can be demonstrated by a synthetic
 * event — what it CAN do is assert the shape that makes the leak impossible:
 * one handle, one scheduler, and a cancel on both doors.
 */
describe('the close timer cannot leak across rows (structure, not behaviour)', () => {
  it('keeps exactly ONE timer handle, at module scope, never keyed per row', () => {
    expect([...jsCode.matchAll(/\blet\s+warnCloseTimer\b/g)]).toHaveLength(1);
    // a per-card map is the shape that WOULD leak: row A's entry survives row
    // B opening, and both fire
    expect(jsCode).not.toMatch(/warnCloseTimer\s*\[/);
  });

  it('schedules the close in exactly one place, and clears it in exactly one place', () => {
    expect([...jsCode.matchAll(/warnCloseTimer\s*=\s*setTimeout\(/g)]).toHaveLength(1);
    const clears = [...jsCode.matchAll(/clearTimeout\(\s*warnCloseTimer\s*\)/g)];
    expect(clears).toHaveLength(1);
    expect(fnBody('warnPopCancelClose')).toContain('clearTimeout(warnCloseTimer)');
  });

  it('names the delay instead of spelling a number at the call site', () => {
    expect(jsCode).toMatch(/const WARN_CLOSE_MS = \d+/);
    // R-warn-j: 150ms is a default flagged to Miles as tunable, so it has to be
    // tunable in one place
    expect(handlerBody('warnPopOut')).toContain('WARN_CLOSE_MS');
    expect(handlerBody('warnPopOut')).not.toMatch(/setTimeout\([\s\S]*?,\s*\d+\s*\)/);
  });

  it('cancels a pending close at BOTH doors — every open and every close', () => {
    for (const door of ['openOverlay', 'closeMenus']) {
      const body = fnBody(door);
      expect(body, `${door} lets a pending close outlive it`).toContain('warnPopCancelClose()');
      /* …and it is the FIRST statement, so a timer can never outlive the state
         it was scheduled against. Stated as "first" rather than "before the
         first `app.set(`": if a future door writes its state through a helper
         there is no `app.set(` to order against, `indexOf` returns -1, and an
         ordering assertion against -1 fails for a reason that has nothing to do
         with the rule. */
      const first = body.replace(/^\{\s*/, '').split(/;|\n/)[0]!.trim();
      expect(first, `${door} does something before cancelling a pending close`)
        .toBe('warnPopCancelClose()');
    }
  });
});

describe('opening the hover card is idempotent, and never destroys an edit', () => {
  it('replaces the click opener with the three hover/focus handlers', () => {
    expect(jsCode).not.toContain('openWarnPop');
    for (const h of ['warnPopIn', 'warnPopOut', 'warnPopFocusOut']) {
      expect(handlerBody(h).length, h).toBeGreaterThan(0);
    }
  });

  it('guards the TOGGLE, because pointer-enter and focus can both fire on one icon', () => {
    // openOverlay toggles by contract — the other four overlays depend on that
    // — so re-entering an already-open icon would shut it. Guarded in the
    // opener, not by changing the toggle.
    expect(fnBody('showWarnPop')).toMatch(/app\.get\('warnPop'\) === cardId/);
  });

  it('refuses to open over an ACTIVE edit, from the ONE overlay list (R-warn-r)', () => {
    const body = fnBody('showWarnPop');
    // a passive mouse path across the table is not consent to discard a staged
    // due date that only Apply writes (W2)
    expect(body).toContain('OVERLAY_KEYS');
    // …and it must derive that from the list, not restate it: a second hardcoded
    // roll-call is the thing OVERLAY_KEYS exists to prevent
    expect(body).not.toMatch(/'(urgencyMenu|diffMenu|duePopover|reqMenu)'/);
  });

  it('nulls the captured trigger BEFORE closing on focus-out, or focus is trapped', () => {
    const body = handlerBody('warnPopFocusOut');
    // closeMenus' heldFocus branch would otherwise yank focus back to the icon
    // the instant the user Tabs out of `Open Card`
    expect(body).toContain('overlayTrigger = null');
    expect(body.indexOf('overlayTrigger = null')).toBeLessThan(body.indexOf('closeMenus('));
    // a null relatedTarget (window blur) is NOT a dismissal — the document
    // click dismisser owns that case
    expect(body).toContain('relatedTarget');
  });

  it('sends the flip decision out of placeBox rather than recomputing it', () => {
    // the markup needs the fact, because the bridge must sit on the gap side
    expect(fnBody('placeBox')).toMatch(/return \{[^}]*\bup\b[^}]*\}/);
  });
});

/**
 * T166 (integration). Both halves of this block are seams the three builders
 * could not see from their own file, and neither is provable by a synthetic
 * event — what IS provable is that the guard exists and runs before the timer
 * is armed.
 *
 * 1. R-warn-r held one way only. `showWarnPop` refuses to OPEN over another
 *    overlay, but the mouseleave that followed was unconditional — so a pointer
 *    that merely crossed a warning icon while a due popover was up armed a
 *    close that discarded a staged date only Apply writes (W2).
 * 2. Ractive delegates an each-block's events with a CAPTURE listener on the
 *    <tbody> and then simulates bubbling by walking from `ev.target` upward
 *    (`delegateHandler`, ractive.mjs). That is what makes `mouseenter` /
 *    `mouseleave` / `focus` arrive at all — none of the three bubbles — but it
 *    also re-dispatches a CHILD's mouseleave to the ancestor's handler, which
 *    native mouseleave never does. Moving off the 14px glyph onto the button's
 *    own padding, or between two lines inside the card, would otherwise arm a
 *    close while the pointer never left anything.
 */
describe('the pointer path cannot close what it did not open', () => {
  const body = () => handlerBody('warnPopOut');

  it('arms no close when no hover card is open — R-warn-r, from the leave side', () => {
    expect(body()).toMatch(/if \(!app\.get\('warnPop'\)\) return;/);
    expect(body().indexOf("app.get('warnPop')")).toBeLessThan(body().indexOf('setTimeout('));
  });

  it('arms no close when the pointer never left the node the directive sits on', () => {
    // relatedTarget is where the pointer actually went — the same shape the
    // focus-out guard uses, for the same reason
    expect(body()).toContain('relatedTarget');
    expect(body()).toContain('ctx.node.contains(to)');
    expect(body().indexOf('relatedTarget')).toBeLessThan(body().indexOf('setTimeout('));
  });

  it('does not re-open the card on the shared close path’s own focus return', () => {
    /* The icon opens on FOCUS, and closeMenus({ restoreFocus: true }) focuses
       the icon — so Escape would close the card and the restore would re-open
       it in the same tick. One flag, set by the one close path, read by the one
       opener; `focus()` dispatches synchronously, so it is never held longer
       than that call. (WAI-ARIA's tooltip pattern: Escape dismisses and the
       trigger keeps focus until focus leaves and returns.) */
    expect([...jsCode.matchAll(/\blet\s+restoringFocus\b/g)]).toHaveLength(1);
    expect(fnBody('showWarnPop')).toContain('if (restoringFocus) return;');
    const close = fnBody('closeMenus');
    expect(close).toContain('restoringFocus = true');
    expect(close).toContain('restoringFocus = false');
    expect(close.indexOf('restoringFocus = true')).toBeLessThan(close.indexOf('t.focus('));
    expect(close.indexOf('t.focus(')).toBeLessThan(close.indexOf('restoringFocus = false'));
  });

  it('stands down only for the host of the card that is OPEN, not for any host (R-warn-v)', () => {
    /* `.warnhost` renders on every one of the 247 warned rows, so
       `activeElement.closest('.warnhost')` alone answers "is focus in A host",
       not "is focus in MY host". Tab to row A's icon (its card opens on focus),
       then hover row B's icon and move the pointer away: the callback found
       focus inside A's host, returned, and card B was stranded open with no
       pointer on it and no focus in it — dismissible only by Escape, an outside
       click or a scroll, and NOT by clicking it, which the ignore list eats.
       `overlayTrigger` is the open card's own icon, so containment against it
       is the scoping the comment always claimed. */
    const b = body();
    expect(b).toContain("closest('.warnhost')");
    expect(b, 'the stand-down is not scoped to the open card')
      .toMatch(/overlayTrigger[\s\S]{0,40}\)\s*return;|contains\(overlayTrigger\)/);
    // the unscoped spelling is the regression: a bare closest() feeding return
    expect(b).not.toMatch(/if \(ae && ae\.closest && ae\.closest\('\.warnhost'\)\) return;/);
  });

  it('dismisses on focus-out only when the card is inside THIS host (R-warn-v)', () => {
    /* Same rule from the focus side. `!app.get('warnPop')` is a GLOBAL read: a
       Tab off row A's icon dismissed a card the POINTER had opened on row B and
       nulled a trigger this host never captured. The card is rendered inside
       its own host exactly when it is ours, so ask the host. */
    const b = handlerBody('warnPopFocusOut');
    expect(b).toContain("ctx.node.querySelector('.warnpop')");
    expect(b, 'a global state read cannot tell whose card is open')
      .not.toMatch(/!app\.get\('warnPop'\)/);
    // the ownership question still comes before anything is closed
    expect(b.indexOf('querySelector')).toBeLessThan(b.indexOf('closeMenus('));
  });
});

describe('the document dismissers name the TRIGGER, not the wrapper', () => {
  /** The `document` click dismisser's body, from its listener to the closing `});`. */
  const clickListener = (): string => {
    const at = jsCode.indexOf("addEventListener('click'");
    expect(at, 'the click dismisser moved').toBeGreaterThan(-1);
    return jsCode.slice(at, jsCode.indexOf('\n});', at));
  };

  it('ignores clicks on the icon and inside the card', () => {
    const body = clickListener();
    expect(body).toContain('.warnbtn');
    expect(body).toContain('.warnpop');
    // the deleted message trigger must not linger as a dead selector
    expect(body).not.toContain('.warnmsg');
    expect(jsCode).not.toContain('.warnwrap');
    // the four click-opened triggers keep their unconditional shield: each owns
    // an on-click that toggles its overlay, so the dismisser must not race it
    for (const sel of ['.ubadge-wrap', '.selectmenu', '.duewrap', '.duepop', '.selwrap']) {
      expect(body, `${sel} left the ignore list`).toContain(sel);
    }
  });

  it('shields the warning icon ONLY while its own card is open (R-warn-w)', () => {
    /* `.warnbtn` is the one trigger with no `on-click` — hover and focus open
       it — so it has no toggle for the dismisser to race. Shielded
       unconditionally it becomes a hole: with a difficulty menu or a due
       popover up, a click on the icon neither opens the card (showWarnPop
       refuses over an active edit, R-warn-r) nor dismisses what IS open. The
       shield has to be gated on `warnPop`, which is also what keeps a touch
       tap's synthesised click from closing the card the tap just opened
       (R-warn-l). */
    const body = clickListener();
    expect(body).toMatch(/app\.get\('warnPop'\)[\s\S]{0,80}\.warnbtn/);
    // the regression is `.warnbtn` back inside the unconditional selector list
    // beside the four that do own a click handler
    const unconditional = /closest\('([^']*)'\)/.exec(body)?.[1];
    expect(unconditional, 'the unconditional ignore list moved').toBeTruthy();
    expect(unconditional).not.toContain('.warnbtn');
  });

  it('keeps the hover card OUT of the scroll dismisser’s self-scroll exemption (R-warn-h)', () => {
    /* That exemption names overlays that scroll INSIDE themselves. R-warn-h
       ruled the card has no max-height/overflow-y — the second measured
       placement is the mitigation — so adding it here would make a scroll fail
       to dismiss a card that cannot scroll. */
    const at = jsCode.indexOf("addEventListener('scroll'");
    expect(at).toBeGreaterThan(-1);
    const listener = jsCode.slice(at, jsCode.indexOf('}, true)', at));
    expect(listener).toContain("closest('.duepop, .selectmenu')");
    expect(listener).not.toContain('.warnpop');
  });

  it('leaves Escape alone — it is on `document`, so it already reaches the card', () => {
    /* Escape fires with focus inside the card too, and the ONE close path hands
       focus back to the icon. Read out of the keydown listener rather than out
       of the whole file: five other handlers contain the same
       `closeMenus({ restoreFocus: true })` call, so grepping the file proves
       nothing about Escape. */
    const at = jsCode.indexOf("addEventListener('keydown'");
    expect(at, 'the Escape dismisser moved').toBeGreaterThan(-1);
    const listener = jsCode.slice(at, jsCode.indexOf('\n});', at));
    expect(listener).toMatch(/e\.key === 'Escape' && anyMenuOpen\(\)/);
    expect(listener).toContain('closeMenus({ restoreFocus: true })');
  });

  it('leaves the wheel swallow duePopover-only — the card has no scroll to protect', () => {
    /* The swallow exists so a trackpad nudge inside the DUE popover does not
       chain to the page and trip the scroll dismisser, discarding a staged
       date. R-warn-h ruled the hover card has no max-height/overflow-y, so it
       has nothing to swallow for and a nudge over it SHOULD dismiss it — the
       companion to keeping `.warnpop` out of the scroll exemption above. This
       test previously asserted only Escape and would have passed with the whole
       listener deleted. */
    const at = jsCode.indexOf("addEventListener('wheel'");
    expect(at, 'the wheel swallow was deleted').toBeGreaterThan(-1);
    const listener = jsCode.slice(at, jsCode.indexOf('\n}, { passive: false })', at));
    expect(listener).toContain("app.get('duePopover')");
    expect(listener).toContain("closest('.duepop')");
    expect(listener).toContain('preventDefault()');
    expect(listener, 'the hover card must not join the swallow').not.toContain('warnPop');
  });

  it('RETURNS focus rather than stealing it — the pointer opens the card (R-warn-u)', () => {
    /* The first overlay a POINTER opens is the first whose captured trigger is
       not also what the browser just focused. Without this the Escape a user
       types in the search field drags the caret onto a warning icon the pointer
       merely grazed. `restoringFocus` does not cover it — that suppresses the
       re-OPEN, not the focus move. */
    const close = fnBody('closeMenus');
    // focus is ours when it is on the trigger, inside the overlay, or nowhere
    expect(close).toMatch(/ae\s*===\s*t\b/);
    expect(close).toMatch(/ae\s*===\s*document\.body/);
    expect(close).toContain('heldFocus');
    /* …and that verdict has to gate the SAME `t.focus()` the ordering guards
       above pin, not sit in the body as an unread const. Read the `if` that
       actually wraps the call rather than the whole function. */
    const upTo = close.slice(0, close.indexOf('t.focus('));
    const guard = upTo.slice(upTo.lastIndexOf('if ('));
    expect(guard, 'the focus return is not gated on focusIsOurs').toContain('focusIsOurs');
  });
});

/**
 * Every rule in `src` whose selector's FINAL compound targets one of `tokens`
 * — rules that style THAT element, not a descendant of it.
 * `.ptable .mccell .chevbtn svg` ends at `svg`, so the chevron's own
 * `transform: rotate(90deg)` is correctly none of this block's business.
 */
function cssRules(src: string): Array<[string, string]> {
  return [...src.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => [m[1]!.trim(), m[2]!] as [string, string]);
}

/** The last compound of a selector — the element the rule actually styles. */
const subject = (sel: string): string => sel.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? '';

const compoundHits = (compound: string, tokens: string[]): boolean =>
  tokens.some((t) => (t.startsWith('.')
    ? new RegExp(`\\${t}(?![\\w-])`).test(compound)
    : new RegExp(`(^|[^\\w.#-])${t}(?![\\w-])`).test(compound)));

function rulesTargeting(tokens: string[], src: string): Array<[string, string]> {
  return cssRules(src).filter(([sel]) => sel.split(',').some((s) => compoundHits(subject(s), tokens)));
}

/** True when a declaration block sets `prop` (and not merely a longhand of it). */
const declares = (decls: string, prop: string): boolean =>
  new RegExp(`(^|[;{\\s])${prop}\\s*:`).test(decls);

describe('one recipe per visual (CSS)', () => {
  it('lets NOTHING on the card’s ancestor chain create a containing block', () => {
    /* `.warnpop` is `position: fixed` precisely so it escapes the `.pscroll`
       clip and the MC# cell's overflow. `transform`, `filter`, `contain`,
       `will-change`, `perspective` and `backdrop-filter` each make the element
       carrying them the containing block for a FIXED descendant — so any one of
       them anywhere from `.pscroll` down to `.warnhost` re-anchors every hover
       card back inside the cell the fixed positioning exists to escape.
       Stated in prose in three places before this test and enforced nowhere:
       `transform: translateY(-0.05em)` on `.ptable .mcid` went green.
       And it is not hypothetical — the live pass owes a look at `.mcid`'s
       ~1px optical shift inside `.mccell`, and a nudge is exactly the reflex
       fix. Same shape as the `.grun` property bans in gantt-run-geometry. */
    expect(PIPELINE_CSS, 'the flat rule walker cannot see inside an at-rule')
      .not.toMatch(/@(media|supports|container)/);
    const chain = ['.pscroll', '.ptable', 'table', 'tbody', 'tr', '.prow', 'td', '.col-mc', '.mccell', '.mcid', '.warnhost'];
    const banned = ['transform', 'filter', 'contain', 'will-change', 'perspective', 'backdrop-filter'];
    const rules = rulesTargeting(chain, PIPELINE_CSS);
    expect(rules.length, 'the walker matched nothing — its selectors moved').toBeGreaterThan(4);
    for (const [sel, decls] of rules) {
      for (const prop of banned) {
        expect(decls, `\`${sel}\` declares ${prop}, which re-anchors the fixed hover card`)
          .not.toMatch(new RegExp(`(^|[;\\s])${prop}\\s*:`));
      }
    }
  });

  it('positions the card in exactly one place — the shared fixed-box recipe', () => {
    /* `.warnpop`'s own rule already refuses `position:`; that reads ONE rule, so
       a second `.warnhost .warnpop { position: relative }` anywhere in the
       sheet went green — and it would drop the card back inside the .pscroll
       clip. The bridge is excluded because it IS absolute, by design. */
    const positioners = rulesTargeting(['.warnpop'], PIPELINE_CSS)
      .filter(([sel, decls]) => !sel.includes('::before') && declares(decls, 'position'));
    expect(positioners.map(([sel]) => sel), 'the card is positioned in more than one place')
      .toHaveLength(1);
    expect(positioners[0]![0].split(',').map((s) => s.trim()).sort())
      .toEqual(['.duepop', '.selectmenu', '.warnpop']);
    expect(positioners[0]![1]).toContain('position: fixed');
  });

  it('joins the shared fixed-box popover base rather than forking it', () => {
    /* Read as a SET, not as a spelling: `.duepop, .selectmenu, .warnpop {` is
       the identical rule and must not fail here. */
    const base = /\n([^{}\n]*\.warnpop[^{}\n]*)\{\s*\n\s*position: fixed/.exec(PIPELINE_CSS)?.[1];
    expect(base, 'the shared fixed-box base rule moved').toBeTruthy();
    expect(base!.split(',').map((s) => s.trim()).sort()).toEqual(['.duepop', '.selectmenu', '.warnpop']);
    // the fork is the annotation's slate-100 stroke and the asymmetric radius
    const own = cssRule('.warnpop', PIPELINE_CSS);
    expect(own).toContain('width: 235px');
    expect(own).toContain('border-color: var(--slate-100)');
    expect(own).not.toContain('position:');
    expect(own).not.toContain('box-shadow');
  });

  it('squares the corner the card grows out of — top-left anchored, bottom-left flipped', () => {
    const radius = (sel: string) => /border-radius:([^;]*);/.exec(cssRule(sel, PIPELINE_CSS))![1]!.trim();

    // anchored BELOW the icon: the top-left is the corner touching it
    const down = radius('.warnpop');
    expect(down.startsWith('0 ')).toBe(true);
    expect([...down.matchAll(/var\(--radius-md\)/g)]).toHaveLength(3);

    // R-warn-i: flipped ABOVE, the square mirrors to the bottom-left so it
    // still reads as growing out of the icon. Default taken, flagged to Miles.
    const up = radius('.warnpop.flip');
    expect(up.endsWith(' 0')).toBe(true);
    expect([...up.matchAll(/var\(--radius-md\)/g)]).toHaveLength(3);
  });

  it('bridges the 4px gap with a transparent pseudo-element that flips with the card', () => {
    /* R-warn-p. The card sits off the icon by the gap; without a bridge the
       pointer crosses dead space and the close timer fires before it can reach
       `Open Card`. It paints nothing, and it cannot exist while the card is
       closed because the card is not rendered then. */
    const before = cssRule('.warnpop::before', PIPELINE_CSS);
    expect(before).toMatch(/content: ''/);
    expect(before).toContain('position: absolute');
    expect(before).not.toContain('background');
    expect(before).toMatch(/top:/);

    const flipped = cssRule('.warnpop.flip::before', PIPELINE_CSS);
    expect(flipped).toContain('bottom:');
    expect(flipped).toContain('top: auto');
  });

  it('dresses the trigger as an amber icon button with a hit area bigger than its glyph', () => {
    const rule = cssRule('.warnbtn', PIPELINE_CSS);
    expect(rule).toContain('cursor: pointer');
    expect(rule).toContain('color: var(--amber-600)');
    // the annotation asks for a hit area larger than the 14px glyph, and the
    // padding is the whole of that — a token, never a bare px
    expect(rule).toMatch(/padding: var\(--space-\d+\)/);
    // it is an icon now: the underline went with the message line
    expect(rule).not.toContain('text-decoration');
    expect(cssRule('.i14', PIPELINE_CSS)).toContain('width: 14px');
    expect(cssRule('.i14', PIPELINE_CSS)).toContain('height: 14px');
  });

  it('groups the MC# label and its icon as ONE unit, gapped with a token', () => {
    const rule = cssRule('.ptable .mcid', PIPELINE_CSS);
    expect(rule).toContain('display: flex');
    // R-warn-n: `content › icon-offset` carries no px value in the frame, so
    // the gap is a token and the deviation is recorded, not invented
    expect(rule).toMatch(/gap: var\(--space-\d+\)/);
  });

  it('serves the icon from the table\'s one shared focus ring', () => {
    /* Read as a SET: which selector comes first in the list is a CSS no-op, and
       pinning the order would fail a correct reorder. What matters is that the
       icon's ring is a member of the ONE shared rule and that no second rule
       restates it. */
    const at = PIPELINE_CSS.indexOf('.datefield:focus-visible');
    const list = PIPELINE_CSS.slice(at, PIPELINE_CSS.indexOf('{', at)).split(',').map((s) => s.trim());
    expect(list).toContain('.warnbtn:focus-visible');
    expect(list).toContain('.datefield:focus-visible');
    // one ring, not two: a second rule for the same state is the fork
    expect([...cssCode.matchAll(/\.warnbtn:focus-visible/g)]).toHaveLength(1);
  });

  it('underlines Open Card in blue-700 and titles the popover amber-700/600', () => {
    expect(cssRule('.wpopen', PIPELINE_CSS)).toMatch(/text-decoration: underline/);
    expect(cssRule('.wpopen', PIPELINE_CSS)).toContain('var(--blue-700)');
    expect(cssRule('.wptitle', PIPELINE_CSS)).toContain('var(--amber-700)');
    expect(cssRule('.wptitle', PIPELINE_CSS)).toContain('font-weight: 600');
  });

  it('declares the R-warn-a left accent exactly once', () => {
    /* Read the comment-free copy: R-warn-a's block is prose and may legitimately
       quote the declaration it explains — counting quotations would fail a
       correct sheet. Every other rule in this describe already reads `cssCode`. */
    expect([...cssCode.matchAll(/inset 3px 0 0/g)]).toHaveLength(1);
    expect(cssCode).toContain('var(--amber-300)');
  });

  it('paints NO background on a warned row — asserted by shape, so it cannot creep back', () => {
    /* Miles's amber-wall ruling (#41): with 247 of 249 live rows warned, the
       wash was the page's ground colour. Deleting it is also what makes
       R-warn-g structural — `.ptable tr.blocked td` is now uncontested, so a
       blocked+warned row keeps its red fill without an override to defend it.

       Anchored on the PROPERTY inside a rule that targets a warned row or one
       of its cells, not on a selector spelling. `/\.prow\.warn[^{]*\{[^}]*
       background/` was both too narrow and too wide: `.ptable tr.warn > td`
       and `.ptable tr.warn.prow > td` restored the wall with a green suite,
       while a hover chip on the ICON (`… .warn .warnbtn:hover { background }`)
       and a paint-nothing `background-clip` on the accent were rejected. */
    let seen = 0;
    for (const [sel, decls] of cssRules(PIPELINE_CSS)) {
      for (const one of sel.split(',')) {
        // the selector must reach a WARNED row anywhere along its chain…
        if (!/\.warn(?![\w-])/.test(one)) continue;
        // …and style the row or one of its cells: a descendant of a warned row
        // (the icon, its hover chip) may still legitimately paint itself
        if (!compoundHits(subject(one), ['tr', 'td', '.prow', '.warn'])) continue;
        seen++;
        for (const prop of ['background', 'background-color', 'background-image']) {
          expect(declares(decls, prop), `\`${one.trim()}\` repaints a warned row — the amber wall is Miles's ruling`)
            .toBe(false);
        }
      }
    }
    // the accent rule itself is one of them; if the walker sees nothing, it broke
    expect(seen, 'no warned-row rule matched — the walker’s selectors moved').toBeGreaterThan(0);
    expect(cssCode).not.toMatch(/\.warnwrap|\.warnmsg|\.warnlabel|\.i10\b/);
    expect(tplCode, '.i10 lingers in the template').not.toMatch(/\bi10\b/);
  });

  it('keeps the row height CONTENT-derived — the frame numbers are outcomes, not targets', () => {
    /* R-warn-a, restated for batch 10: deleting the message line is what
       returns the row to ~95px. Asserting the number would pin an outcome and
       block the next correct change — so state the RULE (no rule in this sheet
       sets a row height) instead of banning two integers file-wide, which
       rejected an unrelated column that happened to measure 95px. */
    for (const [sel, decls] of rulesTargeting(['tr', 'td', '.prow', '.ptask'], PIPELINE_CSS)) {
      for (const prop of ['height', 'min-height', 'max-height']) {
        expect(decls, `\`${sel}\` sets a row height — R-warn-a keeps it content-derived`)
          .not.toMatch(new RegExp(`(^|[;\\s])${prop}\\s*:`));
      }
    }
    expect(cssRule('.ptable .col-name', PIPELINE_CSS)).not.toContain('280px');
  });

  it('spends no raw hex and no raw px on the new rules — tokens only', () => {
    // the ONE exception the constitution allows is an icon glyph box, which is
    // exactly the shape .i13/.i15/.i16/.i18 already have
    for (const sel of ['.warnbtn', '.warnhost', '.ptable .mcid', '.warnpop.flip', '.warnpop::before', '.warnpop.flip::before']) {
      const rule = cssRule(sel, PIPELINE_CSS).replace(/\/\*[\s\S]*?\*\//g, ' ');
      expect(rule, `${sel} carries a raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(rule, `${sel} carries a raw px`).not.toMatch(/\d+px/);
    }
  });
});

describe('the banner it replaces is gone, and the aggregate survived it', () => {
  it('leaves no .ipanel markup or styling behind', () => {
    for (const dead of ['ipanel', 'irow', 'ideets', 'ireason', 'iwhy', 'iopen']) {
      expect(TEMPLATE, `${dead} still in the template`).not.toContain(dead);
    }
    for (const dead of ['visibleCorrections', 'toggleCorrections', 'showAllCorrections']) {
      expect(TEMPLATE, `${dead} still in the template`).not.toContain(dead);
      expect(APP_JS, `${dead} still in the client`).not.toContain(dead);
    }
    expect(PIPELINE_CSS).not.toContain('.ipanel');
  });

  it('keeps OPEN WORK counting corrections, and corrections landing from the payload', () => {
    expect(APP_JS).toContain("open: this.get('corrections').length");
    expect(APP_JS).toContain('corrections: pipeline.corrections');
  });

  it('leaks no Ractive comment text into the rendered document', () => {
    /* The MC# cell gained a long comment this batch, in ELEMENT-CONTENT
       position — where `{{! … }}` ends at the first `}}` and spills its tail
       into the page as literal text. `Ractive.parse` accepts that happily, so
       `node frontend/build.js` cannot catch it; only looking at what parsed can. */
    expect(leakedMustacheText()).toEqual([]);
  });
});

/**
 * ─── OWED TO THE LIVE PASS ──────────────────────────────────────────────────
 *
 * Everything above is structure and wiring. NONE of it is evidence that the
 * hover card works, and no test in this repo can be: there is no DOM, no
 * pointer, no focus ring and no clock. A synthetic `mouseenter` dispatched at a
 * detached fragment would go green while the bridge was 40px off and the card
 * unreachable — which is precisely the failure mode this batch exists to avoid.
 *
 * These stay `todo` on purpose. They are not unwritten tests; they are the
 * checklist the orchestrator walks in the browser after deploy, exactly as
 * batch 8 did for the drag. Do not "implement" them with fake events.
 */
describe('what only the live pass can prove (browser, after deploy)', () => {
  it.todo('hovering the icon opens the card, anchored under it with a ~4px gap');
  it.todo('the pointer crosses the gap into the card without it closing — the ::before bridge');
  it.todo('the card stays open while the pointer is inside it, and closes ~150ms after leaving');
  it.todo('moving from row A\'s icon straight to row B\'s leaves B open — A\'s timer never fires late');
  it.todo('Tab reaches the icon, focus alone opens the card, and Tab again reaches Open Card');
  it.todo('Tabbing PAST Open Card closes the card and does not yank focus back to the icon');
  it.todo('Escape with focus inside the card closes it and returns focus to the icon');
  it.todo('near the viewport bottom the card flips up, and the squared corner AND the bridge flip with it');
  it.todo('a horizontal scroll of the table dismisses the card (it has no scroll of its own)');
  it.todo('hovering an icon while a due-date edit is staged leaves that edit intact — entering AND leaving it');
  it.todo('moving off the 14px glyph onto the button’s own padding does not close the card');
  it.todo('moving between two lines inside the card, across its padding, does not close it');
  it.todo('Escape does not immediately re-open the card via the focus returned to the icon');
  it.todo('a warned row shows the 3px amber accent and NO amber wash — including one that is also blocked');
  /* R-warn-p's geometry — measure, do not assume. The bridge is absolutely
     positioned inside a BORDERED fixed box, so its containing block is that
     box's PADDING box: the padding is INSIDE it, giving ~233px of span (235
     less the two 1px borders) and a start 1px inside the gap. The T166 report's
     "~201px inset ~17px each side" confused the padding box with the CONTENT
     box and is corrected in the frame notes — the icon sits well inside the
     span, so the direct downward path IS bridged. Limit that survives: `up` is
     decided before the on-screen clamp, so on a viewport too short for the
     flipped card the clamp can slide it back over its own icon. */
  it.todo('the bridge really does cover the pointer path from the icon into the card');
  /* Fixed after the verify pass — each is a sequence a green suite could not
     see, and none is provable without a pointer, a caret and a real focus ring. */
  it.todo('R-warn-u: Escape typed in the Pipeline search field leaves the caret in the search field, even with the pointer resting on a warning icon');
  it.todo('R-warn-v: Tab to row A’s icon, hover row B’s, move away — B closes and is not stranded open');
  it.todo('R-warn-v: Tab past row A’s icon while a card the pointer opened on row B is up — B survives');
  it.todo('R-warn-w: with a difficulty menu open, clicking a warning icon dismisses that menu');
  it.todo('R-warn-w: on touch, a tap on the icon still opens the card and does not close it again');
  /* Design questions the live pass should LOOK at rather than prove, raised by
     the verify pass and owed to Miles rather than to the code. */
  it.todo('the open card covers the icons of the rows beneath it — sweeping the warned column skips 2–4 rows at a time');
  it.todo('the MC# label still fits beside the icon in a 150px column, highlight included, without wrapping after the hyphen');
});
