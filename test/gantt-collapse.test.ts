/**
 * Sprint-block collapse + collapsible left pane (owl #24, phase 13i; carried
 * across the Sprint Schedules rebuild, owls #72/#73 + PLAN.md, 2026-08-28 —
 * the blocks now hold WORK-CARD rows and the pane collapses 952 → 384, but
 * the collapse mechanism itself survived the rebuild unchanged).
 *
 * Both features are presentation only, and that is the whole risk: the moment
 * collapse reaches `sprintGroups` or the capacity footer, a hidden row stops
 * counting against capacity and the planner starts lying. The footer is DATA,
 * not visibility.
 *
 * The template half is RENDERED with Ractive (test/helpers/gantt-render.ts)
 * rather than grepped — a `{{#if}}` that guards the wrong node, or a Ractive
 * comment that swallows a negation, both survive a source-text assertion and
 * `node frontend/build.js` alike. The live-browser half (the real thumb
 * ratio, a real click on the toggle) stays with E2E.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  GANTT_CSS,
  PLOTTED,
  OFF_BOARD,
  TEMPLATE,
  cssRule,
  leakedMustacheText,
  renderSprintSchedule,
  type SprintGroup,
} from './helpers/gantt-render.ts';

/** Brace-match a named block (`  toggleBlock(_ctx, id) {`, a function head). */
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

/** Two sprints, one row each, so a per-block claim has a neighbour to check. */
const GROUPS: SprintGroup[] = [
  { id: 's1', name: 'Sprint A', meta: 'Aug 24 - Aug 28', count: '· 1 item', rows: [PLOTTED] },
  { id: 's2', name: 'Sprint B', meta: 'Aug 31 - Sep 4', count: '· 1 item', rows: [{ ...OFF_BOARD, sprintId: 's2' }] },
];

const render = (state: Parameters<typeof renderSprintSchedule>[0] = {}) =>
  renderSprintSchedule({ sprintGroups: GROUPS, ...state });

const ALL_COLLAPSED = Object.fromEntries(GROUPS.map((g) => [g.id, true]));

/** The three header spans a reader keeps while a block is shut. */
function headerMeta(html: string): string[] {
  return [...html.matchAll(/<span class="gb(?:name|meta|count)">.*?<\/span>/g)].map((m) => m[0]);
}

describe('collapsing a block hides its rows and nothing else', () => {
  it('drops every row, keeps every header name, meta line and count', () => {
    const open = render();
    const shut = render({ collapsedBlocks: ALL_COLLAPSED });

    expect(open).toContain('MC-655');
    expect(open).toContain('MC-712');
    expect(shut).not.toContain('MC-655');
    expect(shut).not.toContain('MC-712');
    expect(shut).not.toContain('class="growr');

    // byte-identical header meta in both states — the counts are data
    expect(headerMeta(shut)).toEqual(headerMeta(open));
    expect(headerMeta(open)).toContain('<span class="gbcount">· 1 item</span>');
  });

  it('leaves the capacity footer untouched — hidden rows still count', () => {
    const foot = (html: string) => html.slice(html.indexOf('<div class="gfoot">'));
    expect(foot(render({ collapsedBlocks: ALL_COLLAPSED }))).toBe(foot(render()));
  });

  it('collapses one block without touching its neighbours', () => {
    const html = render({ collapsedBlocks: { s1: true } });
    expect(html).not.toContain('MC-655'); // Sprint A is shut
    expect(html).toContain('MC-712'); // Sprint B is still open
  });

  it('shows a shut block its HEADER ONLY — the search row and its results go with the rows', () => {
    /* PLAN.md B14: the always-visible search row (owl #77 §0) sits inside the
       same `collapsedBlocks` gate the retired add zone sat in — after the
       rows, inside the block body. A shut block that still offered the field
       would list results nobody can see, and Add All would act on them.
       Asserted per-block: shut s1 loses field AND results, open s2 keeps
       both. */
    const panel = { items: [{ cardId: 'c1', mc: 'MC-06', name: 'Illustrate Asset: Hero', label: 'MC-06: Illustrate Asset: Hero' }] };
    const html = render({ collapsedBlocks: { s1: true }, addQ: { s1: 'hero', s2: 'hero' }, addPanels: { s1: panel, s2: panel } });
    const beforeB = html.slice(0, html.indexOf('Sprint B'));
    const afterB = html.slice(html.indexOf('Sprint B'));
    expect(beforeB).not.toContain('gsearch');
    expect(beforeB).not.toContain('gresult');
    expect(afterB).toContain('growr gsearch');
    expect(afterB).toContain('growr gresult');
  });
});

describe('the toggle is a real button', () => {
  it('carries button semantics and the state a screen reader needs', () => {
    const open = render();
    const shut = render({ collapsedBlocks: ALL_COLLAPSED });
    expect(open).toMatch(/<button class="gbtoggle" type="button"/);
    expect(open).toMatch(/aria-expanded="true"/);
    expect(shut).toMatch(/aria-expanded="false"/);
    expect(open).toMatch(/aria-controls="gbrows-s1"/);
    expect(open).toMatch(/id="gbrows-s1"/); // the control target really exists
    expect(open).toMatch(/aria-label="Collapse Sprint A"/);
    expect(shut).toMatch(/aria-label="Expand Sprint A"/);
  });

  it('rotates the ONE chevron in the sprite instead of adding an icon', () => {
    expect(render()).toContain('gbchev-o');
    expect(render({ collapsedBlocks: ALL_COLLAPSED })).toContain('gbchev-c');
    expect(cssRule('.gantt .gbchev-o')).toContain('rotate(90deg)');
    expect(cssRule('.gantt .gbchev-c')).toContain('transform: none');
    expect(render()).toMatch(/<use href="#i-rowChevron"/);
    expect(GANTT_CSS).not.toMatch(/#i-gbchev|i-collapse|i-expand/);
  });

  it('is keyboard reachable and focus-visible', () => {
    const rule = cssRule('.gantt .gbtoggle:focus-visible');
    expect(rule).toContain('outline');
  });
});

describe('collapse never reaches the data', () => {
  it('is absent from sprintGroups and from the footer counts', () => {
    // the deriving computed and the overlap counter are the two places a
    // "skip hidden rows" shortcut would land; neither may know the view state
    expect(block('    sprintGroups() {')).not.toContain('collapsedBlocks');
    expect(block('function sprintWeekLoad(weekKey) {')).not.toContain('collapsedBlocks');
    const footRegion = APP_JS.slice(APP_JS.indexOf("app.set('sprintFootText'"), APP_JS.indexOf("app.set('sprintFootCls'"));
    expect(footRegion).not.toContain('collapsedBlocks');
  });

  it('stores view state only, keyed on the group id', () => {
    expect(APP_JS).toMatch(/collapsedBlocks: \{\}/);
    const handler = block('  toggleBlock(_ctx, id) {');
    expect(handler).toContain('collapsedBlocks.${id}');
    expect(handler).toContain('remeasure()'); // the sheet just changed height — thumbs AND clip verdicts
  });

  it('clears the collapsed set on a project switch (R-d) — sprint ids are per-project', () => {
    const reset = block('async function resetForProjectSwitch() {');
    const payload = reset.slice(reset.indexOf('app.set({'), reset.indexOf('});') + 3);
    expect(payload).toMatch(/collapsedBlocks: \{\}/);
    // leftCollapsed is a reader preference about the pane — deliberately kept
    expect(payload).not.toContain('leftCollapsed');
  });
});

describe('the collapsible left pane rides one variable', () => {
  it('collapses --gleft to exactly the MC# + Scope widths (952 → 384, PLAN.md)', () => {
    const mc = /\.gantt \.gdetails \.c-mc \{[^}]*width: (\d+)px/.exec(GANTT_CSS);
    const scope = /\.gantt \.gdetails \.c-scope \{[^}]*width: (\d+)px/.exec(GANTT_CSS);
    expect(mc, 'c-mc width not found').not.toBeNull();
    expect(scope, 'c-scope width not found').not.toBeNull();
    const collapsed = Number(mc![1]) + Number(scope![1]);
    expect(collapsed).toBe(384); // a column resize must fail here, not mis-collapse
    expect(cssRule('.gantt.lpc')).toContain(`--gleft: ${collapsed}px`);
  });

  it('hides exactly the deadline, forecast and status cells', () => {
    const hide = /((?:\.gantt\.lpc [^,{]+,\s*)+\.gantt\.lpc [^,{]+)\{\s*display: none/.exec(GANTT_CSS);
    expect(hide, 'no .gantt.lpc hide list').not.toBeNull();
    expect(hide![1]!.split(',').map((s) => s.trim()).filter(Boolean)).toEqual([
      '.gantt.lpc .c-dl', '.gantt.lpc .c-fc', '.gantt.lpc .c-gstatus',
    ]);
  });

  it('does no JS width maths — the sheet recomputes from max-content', () => {
    expect(cssRule('.gantt .gsheet')).toContain('width: max-content');
    expect(APP_JS).not.toMatch(/\b(952|384)\b/); // no pane width constant in JS
    expect(block('  toggleLeftPane() {')).toContain('remeasure()');
  });

  it('flags the class on .gantt and flips the chevron, in both states', () => {
    const open = render();
    const shut = render({ leftCollapsed: true });
    // read the class LIST rather than the literal attribute, so a second
    // state class joining the root cannot silently satisfy the assertion
    const classes = (h: string) => (/^<div class="([^"]*)"/.exec(h)?.[1] ?? '').split(/\s+/).filter(Boolean);
    expect(classes(open)).toEqual(['gantt']);
    expect(classes(shut)).toEqual(['gantt', 'lpc']);
    expect(open).not.toContain('flipx');
    expect(shut).toContain('flipx');
    expect(cssRule('.gantt .lpctoggle .flipx')).toContain('rotate(180deg)');
  });

  it('parks the toggle inside the sticky pinned header, absolutely positioned', () => {
    const head = render();
    const pin = head.slice(head.indexOf('<div class="gpin gdetails">'));
    expect(pin.slice(0, pin.indexOf('</div>'))).toContain('class="lpctoggle"');
    const rule = cssRule('.gantt .lpctoggle');
    expect(rule).toContain('position: absolute');
    expect(rule).toContain('right: var(--space-4)');
    expect(cssRule('.gantt .gpin')).toContain('position: sticky'); // the positioned ancestor
  });

  it('keeps the selection checkbox visible when collapsed — placement must keep working', () => {
    // the checkbox lives in c-mc, which survives the collapse; the drag-era
    // grip is gone for good (#72), so the checkbox is the whole affordance
    const shut = render({ leftCollapsed: true });
    expect(shut).toContain('class="gsel"');
    expect(shut).not.toContain('ghandle');
    expect(shut).not.toContain('draggable');
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

// TEMPLATE is imported for the one source-level read below; everything else
// in this file renders. The unslot drop zone died with the drag (#72) — the
// block header carries no handlers now, and nothing here may wish them back.
describe('the block header carries no drop handlers any more', () => {
  it('has neither dragover nor drop on gblockhead', () => {
    const at = TEMPLATE.indexOf('gblockhead');
    expect(at, 'no gblockhead in the shipped template').toBeGreaterThan(-1);
    const head = TEMPLATE.slice(TEMPLATE.lastIndexOf('<', at), TEMPLATE.indexOf('>', at) + 1);
    expect(head).not.toContain('on-dragover');
    expect(head).not.toContain('on-drop');
  });
});
