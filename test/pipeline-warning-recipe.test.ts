/**
 * The Pipeline per-row warning — the RECIPE, executed out of the shipped
 * source, and the row it renders (closed and with the hover card open).
 *
 * Split verbatim out of `test/pipeline-warning.test.ts`, split 2026-09-05 (PLAN.md §D);
 * the shared prelude is `test/helpers/pipeline-warning.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  PIPELINE_CSS,
  TEMPLATE,
  cssRule,
  renderPipelineTable,
} from './helpers/gantt-render.ts';
import {
  BOTH,
  CLEAN,
  ONE,
  SERVER_TOKENS,
  WARNED,
  attr,
  cell,
  recipe,
  row,
  rowHtml,
  tag,
  tplCode,
} from './helpers/pipeline-warning.ts';

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
    /* sentence-cased at display (JP, 2026-08-20) while the SERVER token stays
       lowercase for `srLabel`'s mid-sentence use — derived from the tokens, so
       a new server token cannot slip through un-cased */
    expect(w.items.slice(1).map((i) => i.label)).toEqual(
      SERVER_TOKENS.map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
    );
    // the raw token survives beside it, which is what WARN_WHY is keyed on
    expect(w.items.slice(1).map((i) => i.field)).toEqual(SERVER_TOKENS);
  });

  it('carries a non-empty rationale for every field, from the ONE copy map', () => {
    const w = recipe.rowWarning(WARNED)!;
    for (const item of w.items.slice(1)) {
      expect(item.why.length).toBeGreaterThan(0);
      expect(item.why).toBe(recipe.WARN_WHY[item.field!]);
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
    expect(w.items[1]).toEqual({ field: 'a field nobody has met', label: 'A field nobody has met', why: '' });
  });

  it('follows a single missing field, not the full set', () => {
    const w = recipe.rowWarning(row({ missing: ['due date'] }))!;
    expect(w.items.map((i) => i.label)).toEqual(['MC-655', 'Due date']);
    expect(w.items[1]!.field).toBe('due date'); // the server's token is untouched
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

  it('carries the last-resort scroll state the same way — placeBox decides, the class spells it', () => {
    /* Miles's ruling (owl #43 item D): no internal scrolling stays the rule,
       and scrolling is allowed only when the viewport genuinely cannot fit the
       card. `warnPopPos.over` is that verdict's one carrier, decided in
       placeBox from the measured height — the template spells it and the
       stylesheet caps and scrolls off it. On the default pos (over unset) the
       class must be absent, or every card would scroll. */
    const capped = popover(open({ warnPopPos: { left: 0, top: 0, up: false, over: true } }));
    expect(tag(capped, '<div class="warnpop')).toContain('class="warnpop scroll"');

    const both = popover(open({ warnPopPos: { left: 0, top: 0, up: true, over: true } }));
    expect(tag(both, '<div class="warnpop')).toContain('class="warnpop flip scroll"');

    expect(tag(popover(), '<div class="warnpop')).not.toContain('scroll');
  });

  it('titles itself with the row label', () => {
    expect(/<span class="wptitle">([^<]*)<\/span>/.exec(popover())![1]).toBe(recipe.rowWarning(WARNED)!.label);
  });

  it('lists the card identity first, then every missing field with its rationale', () => {
    const items = [...popover().matchAll(
      /<div class="wpitem"><span class="wplabel">([^<]*)<\/span><span class="wpwhy">([^<]*)<\/span><\/div>/g,
    )].map((m) => ({ label: m[1], why: m[2] }));
    /* the markup renders the DISPLAY pair only — `field` is the recipe's own
       key for WARN_WHY and deliberately never reaches the DOM, so the
       comparison is narrowed to what actually ships rather than widened to
       what the recipe happens to carry */
    const expected = recipe.rowWarning(WARNED)!.items.map((i) => ({ label: i.label, why: i.why }));
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
    // …but the closing line is MESSAGE copy, not the link's caption, so a card
    // with nowhere to link still says what to do (owl #43 item B)
    expect(out).toContain('class="wpfix"');
  });

  /* The deleted banner's closing sentence, restored by Miles's ruling (owl #43
     item B): the reading order becomes what's wrong → why it matters → where
     to fix it → the link that takes you there — and the line is also what
     tells a PM that Sirius will not fix the card itself. */
  it('closes the field list with the restored banner copy, verbatim', () => {
    // the copy is the deleted banner's own sentence (batch 5), carried back
    // word for word — a paraphrase here is drift from a JP-visible ruling
    expect(/<div class="wpfix">([^<]*)<\/div>/.exec(popover())?.[1])
      .toBe('Fix in Trello and it corrects on the next sync.');
  });

  it('places the closing line AFTER the field list and ABOVE Open Card', () => {
    const pop = popover();
    const lastItem = pop.lastIndexOf('class="wpitem"');
    expect(lastItem).toBeGreaterThan(-1);
    expect(pop.indexOf('class="wpfix"')).toBeGreaterThan(lastItem);
    expect(pop.indexOf('class="wpfix"')).toBeLessThan(pop.indexOf('class="wpsep"'));
    expect([...pop.matchAll(/class="wpfix"/g)]).toHaveLength(1);
  });

  it('wears the rationale’s own recipe — one shared rule, never a copy', () => {
    // the closing line is message copy, so it shares .wpwhy's declaration
    // list in ONE rule; a standalone .wpfix rule is the duplicate creeping back
    expect(PIPELINE_CSS).toMatch(/\n\.wpwhy, \.wpfix \{/);
    expect(PIPELINE_CSS).not.toMatch(/\n\.wpfix \{/);
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
