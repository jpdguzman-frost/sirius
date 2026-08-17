/**
 * Sprint-block collapse + collapsible left pane (owl #24, phase 13i).
 *
 * Both features are presentation only, and that is the whole risk: the moment
 * collapse reaches `plannerGroups`, `schedRows` or the capacity footer, a
 * hidden row stops counting against capacity and the planner starts lying. The
 * footer is DATA, not visibility.
 *
 * The template half is RENDERED with Ractive (test/helpers/gantt-render.ts)
 * rather than grepped — a `{{#if}}` that guards the wrong node, or a Ractive
 * comment that swallows a negation, both survive a source-text assertion and
 * `node frontend/build.js` alike. The live-browser half (drag, keyboard reslot,
 * the real thumb ratio) is recorded in the frame notes.
 */

import { describe, expect, it } from 'vitest';
import { APP_JS, GANTT_CSS, GROUPS, TEMPLATE, cssRule, leakedMustacheText, renderGantt } from './helpers/gantt-render.ts';

/** Brace-match a named block (`  toggleBlock(_ctx, id) {`, `  schedRows() {`). */
function block(header: string, src: string = APP_JS): string {
  const at = src.indexOf(`\n${header}`);
  if (at < 0) throw new Error(`gantt-collapse: no \`${header.trim()}\` in the shipped frontend source`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`gantt-collapse: unterminated \`${header.trim()}\``);
}

const ALL_COLLAPSED = Object.fromEntries(GROUPS.map((g) => [g.id, true]));

/** The three header spans a reader keeps while a block is shut. */
function headerMeta(html: string): string[] {
  return [...html.matchAll(/<span class="gb(?:name|meta|count)">.*?<\/span>/g)].map((m) => m[0]);
}

describe('collapsing a block hides its rows and nothing else', () => {
  it('drops every row, keeps every header name, meta line and count', () => {
    const open = renderGantt();
    const shut = renderGantt({ collapsedBlocks: ALL_COLLAPSED });

    expect(open).toContain('MC-655');
    expect(open).toContain('MC-712');
    expect(shut).not.toContain('MC-655');
    expect(shut).not.toContain('MC-712');
    expect(shut).not.toContain('class="growr');

    // byte-identical header meta in both states — the counts are data
    expect(headerMeta(shut)).toEqual(headerMeta(open));
    expect(headerMeta(open)).toContain('<span class="gbcount">1 item</span>');
  });

  it('leaves the capacity footer untouched — hidden rows still count', () => {
    const foot = (html: string) => html.slice(html.indexOf('<div class="gfoot">'));
    expect(foot(renderGantt({ collapsedBlocks: ALL_COLLAPSED }))).toBe(foot(renderGantt()));
  });

  it('collapses one block without touching its neighbours', () => {
    const html = renderGantt({ collapsedBlocks: { s1: true } });
    expect(html).not.toContain('MC-655'); // Sprint A is shut
    expect(html).toContain('MC-712'); // Unscheduled is still open
  });

  it('keeps the Unscheduled bar as the one unslot drop zone while collapsed', () => {
    const shut = renderGantt({ collapsedBlocks: ALL_COLLAPSED });
    expect(shut).toMatch(/class="gblockhead dropzone"/);
    // toHTML() strips event directives, so the handlers are read off the source:
    // they ride the HEADER, which is why collapsing cannot take the drop zone away
    const head = TEMPLATE.slice(TEMPLATE.indexOf('<div class="gblockhead '));
    expect(head.slice(0, head.indexOf('>'))).toMatch(/on-dragover=.*\n?.*on-drop=/s);
  });
});

describe('the toggle is a real button', () => {
  it('carries button semantics and the state a screen reader needs', () => {
    const open = renderGantt();
    const shut = renderGantt({ collapsedBlocks: ALL_COLLAPSED });
    expect(open).toMatch(/<button class="gbtoggle" type="button"/);
    expect(open).toMatch(/aria-expanded="true"/);
    expect(shut).toMatch(/aria-expanded="false"/);
    expect(open).toMatch(/aria-controls="gbrows-s1"/);
    expect(open).toMatch(/id="gbrows-s1"/); // the control target really exists
    expect(open).toMatch(/aria-label="Collapse Sprint A"/);
    expect(shut).toMatch(/aria-label="Expand Sprint A"/);
  });

  it('rotates the ONE chevron in the sprite instead of adding an icon', () => {
    expect(renderGantt()).toContain('gbchev-o');
    expect(renderGantt({ collapsedBlocks: ALL_COLLAPSED })).toContain('gbchev-c');
    expect(cssRule('.gantt .gbchev-o')).toContain('rotate(90deg)');
    expect(cssRule('.gantt .gbchev-c')).toContain('transform: none');
    expect(renderGantt()).toMatch(/<use href="#i-rowChevron"/);
    expect(GANTT_CSS).not.toMatch(/#i-gbchev|i-collapse|i-expand/);
  });

  it('is keyboard reachable and focus-visible', () => {
    const rule = cssRule('.gantt .gbtoggle:focus-visible');
    expect(rule).toContain('outline');
  });
});

describe('collapse never reaches the data', () => {
  it('is absent from plannerGroups, schedRows and the footer totals', () => {
    for (const header of ['    schedRows() {', '    plannerGroups() {', 'function weekTotal(weekKey) {']) {
      expect(block(header), header).not.toContain('collapsedBlocks');
    }
    // footText / footCls are app.set() arrows, so take the whole footer region
    const footer = APP_JS.slice(APP_JS.indexOf('function weekTotal('), APP_JS.indexOf("app.set('footCls'"));
    expect(APP_JS.slice(APP_JS.indexOf("app.set('footText'"), APP_JS.indexOf('/* ---------- data loading'))).not.toContain('collapsedBlocks');
    expect(footer).not.toContain('collapsedBlocks');
  });

  it('stores view state only, keyed on the group id', () => {
    expect(APP_JS).toMatch(/collapsedBlocks: \{\}/);
    const handler = block('  toggleBlock(_ctx, id) {');
    expect(handler).toContain('collapsedBlocks.${id}');
    expect(handler).toContain('refreshThumbs'); // the sheet just changed height
  });

  it('clears the proposal AND the collapsed set on a project switch (R-d)', () => {
    const reset = block('async function resetForProjectSwitch() {');
    // the assertion is about what the RESET WRITES, so it reads the app.set
    // payload — the surrounding comment names leftCollapsed on purpose
    const payload = reset.slice(reset.indexOf('app.set({'), reset.indexOf('});') + 3);
    expect(payload).toMatch(/suggest: null/);
    expect(payload).toMatch(/collapsedBlocks: \{\}/);
    // leftCollapsed is a reader preference about the pane — deliberately kept
    expect(payload).not.toContain('leftCollapsed');
  });
});

describe('the collapsible left pane rides one variable', () => {
  it('collapses --gleft to exactly the MC# + Scope widths', () => {
    const mc = /\.gantt \.gdetails \.c-mc \{[^}]*width: (\d+)px/.exec(GANTT_CSS);
    const scope = /\.gantt \.gdetails \.c-scope \{[^}]*width: (\d+)px/.exec(GANTT_CSS);
    expect(mc, 'c-mc width not found').not.toBeNull();
    expect(scope, 'c-scope width not found').not.toBeNull();
    const collapsed = Number(mc![1]) + Number(scope![1]);
    expect(collapsed).toBe(417); // a column resize must fail here, not mis-collapse
    expect(cssRule('.gantt.lpc')).toContain(`--gleft: ${collapsed}px`);
  });

  it('hides exactly the requestor, type, status and badge cells', () => {
    const hide = /((?:\.gantt\.lpc [^,{]+,\s*)+\.gantt\.lpc [^,{]+)\{\s*display: none/.exec(GANTT_CSS);
    expect(hide, 'no .gantt.lpc hide list').not.toBeNull();
    expect(hide![1]!.split(',').map((s) => s.trim()).filter(Boolean)).toEqual([
      '.gantt.lpc .c-req', '.gantt.lpc .c-type', '.gantt.lpc .c-status', '.gantt.lpc .gchips',
    ]);
  });

  it('does no JS width maths — the sheet recomputes from max-content', () => {
    expect(cssRule('.gantt .gsheet')).toContain('width: max-content');
    expect(APP_JS).not.toMatch(/\b(999|417)\b/); // no pane width constant in JS
    expect(block('  toggleLeftPane() {')).toContain('refreshThumbs');
  });

  it('flags the class on .gantt and flips the chevron, in both states', () => {
    const open = renderGantt();
    const shut = renderGantt({ leftCollapsed: true });
    // the root carries a second, unrelated state class (`gdragging`, T139
    // review fix), so the assertion reads the class LIST rather than the
    // literal attribute — `lpc` is present or it is not
    const classes = (h: string) => (/^<div class="([^"]*)"/.exec(h)?.[1] ?? '').split(/\s+/).filter(Boolean);
    expect(classes(open)).toEqual(['gantt']);
    expect(classes(shut)).toEqual(['gantt', 'lpc']);
    expect(open).not.toContain('flipx');
    expect(shut).toContain('flipx');
    expect(cssRule('.gantt .lpctoggle .flipx')).toContain('rotate(180deg)');
  });

  it('parks the toggle inside the sticky pinned header, absolutely positioned', () => {
    const head = renderGantt();
    const pin = head.slice(head.indexOf('<div class="gpin gdetails">'));
    expect(pin.slice(0, pin.indexOf('</div>'))).toContain('class="lpctoggle"');
    const rule = cssRule('.gantt .lpctoggle');
    expect(rule).toContain('position: absolute');
    expect(rule).toContain('right: var(--space-4)');
    expect(cssRule('.gantt .gpin')).toContain('position: sticky'); // the positioned ancestor
  });

  it('keeps the drag handle and the row checkbox visible when collapsed', () => {
    // both live in c-mc, which survives the collapse — drag must keep working
    const shut = renderGantt({ leftCollapsed: true });
    expect(shut).toContain('class="gsel"');
    expect(shut).toContain('class="ghandle"');
    expect(shut).toContain('draggable="true"');
  });
});

describe('the Ractive comment hazard', () => {
  it('leaks no comment text into the rendered DOM', () => {
    // `{{! … }}` ends at the FIRST `}}`, so a comment quoting a mustache spills
    // its tail into the page as literal text — and the template still parses.
    expect(leakedMustacheText()).toEqual([]);
  });

  it('but the scan does catch one (negative control — an always-empty scan proves nothing)', () => {
    const leaky = '<div>{{! never write {{#if !x}} inside a comment }}</div>';
    expect(leakedMustacheText(leaky)).not.toEqual([]);
  });
});
