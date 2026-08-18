/**
 * Requestor cell truncation (owl #39 as corrected by #40, batch 6, T150; FR-5.2).
 *
 * The bug: `.gantt .gdetails .c-req` is a fixed 136px box and the badge inside
 * it hugs its text, so a long requestor was cut MID-CHARACTER — and, because
 * the clip lived on the CELL rather than on the badge, ~8px of that text
 * painted outside the badge's own 1px stroke. Miles's ruling: truncate with a
 * trailing ellipsis, show the whole value on hover AND on keyboard focus, do
 * not wrap (row heights are aligned to the timeline bars), do not widen the
 * column (real requestors are "Andy" / "Chev" — the frames sample `@handle`
 * fixtures that production never produces).
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. There is no vitest config and no jsdom
 * in this repo: vitest runs in the default `node` environment, and the harness
 * renders the SHIPPED template through Ractive's own `toHTML()`, which needs no
 * DOM. So **nothing here measures a layout**. The truncation decision is a real
 * browser measurement (`scrollWidth > clientWidth`, in `refreshClips()`), and
 * every assertion about it is made against the shipped app-script bundle
 * source, with that said out loud in the test name — the precedent
 * test/gantt-rowactions.test.ts sets for `on-dragstart`. The live pass (a real
 * ellipsis, a real tab stop, the tooltip against a real viewport) is owed and
 * recorded in specs/001-sirius-v1/gantt-frame-notes.md.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  GANTT_CSS,
  PIPELINE_CSS,
  TEMPLATE,
  type PlannerGroup,
  type PlannerRow,
  cssRule,
  divFragment,
  leakedMustacheText,
  renderGantt,
} from './helpers/gantt-render.ts';

/** Brace-match a named block, the test/gantt-collapse.test.ts slicer. */
function block(header: string, src: string = APP_JS): string {
  const at = src.indexOf(`\n${header}`);
  if (at < 0) throw new Error(`gantt-requestor-clip: no \`${header.trim()}\` in the shipped frontend source`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`gantt-requestor-clip: unterminated \`${header.trim()}\``);
}

/**
 * The fixture the frames sample and production never produces (owl #40). Kept
 * local: the harness's own `ROWS[0].requestor` is 'Ana' by design, and every
 * other suite renders against it — a long value there would change what those
 * files assert.
 */
const LONG = '@charlotte.hemsworth-fixture';

const base: Omit<PlannerRow, 'cardId' | 'mcLabel' | 'displayId' | 'requestor'> = {
  name: 'Hero render', slottedWeek: '2026-08-03', urgency: 'Non-Urgent',
  assetType: 'Render', currentList: 'Sketching', status: 'ongoing',
};

const SHORT: PlannerRow = { ...base, cardId: 'short', mcLabel: 'MC-100', displayId: 'MC-100', requestor: 'Ana' };
const LONGROW: PlannerRow = { ...base, cardId: 'long', mcLabel: 'MC-200', displayId: 'MC-200', requestor: LONG };
/** no `requestor` key at all — the `{{else}}` branch */
const NONE: PlannerRow = { ...base, cardId: 'none', mcLabel: 'MC-300', displayId: 'MC-300' };

const GROUP: PlannerGroup[] = [
  { id: 's1', kind: 'sprint', name: 'Sprint A', meta: '2 wk', count: '3 items', rows: [SHORT, LONGROW, NONE] },
];

const HTML = renderGantt({ plannerGroups: GROUP });

/** The one `<div class="growr …">…</div>` for a card (the rowactions slicer). */
function row(html: string, cardId: string): string {
  const at = html.indexOf(`data-card="${cardId}"`);
  if (at < 0) throw new Error(`gantt-requestor-clip: no row for ${cardId}`);
  const start = html.lastIndexOf('<div class="growr', at);
  const next = html.indexOf('<div class="growr', at);
  return html.slice(start, next < 0 ? html.length : next);
}

/** One `.gcell` of one row, div-counted so `.c-scope`'s nested `.gchips` cannot end it early. */
const cell = (cardId: string, cls: string): string =>
  divFragment(`<div class="gcell ${cls}">`, row(HTML, cardId));

const reqCell = (cardId: string): string => cell(cardId, 'c-req');

/* ---------------------------------------------------------------------- */
/* A — what the SHIPPED template emits                                     */
/* ---------------------------------------------------------------------- */

describe('the requestor badge renders through the shared clip recipe', () => {
  it('wears `.pbadge .clipbadge` with the value in a `.cliptext` child', () => {
    // the child is not decoration: `text-overflow` needs a box it owns, and a
    // bare text node inside the inline-flex badge is an anonymous flex item
    // that CSS cannot address
    expect(reqCell('short')).toContain('class="pbadge clipbadge"');
    expect(reqCell('short')).toContain('<span class="cliptext">Ana</span>');
    expect(reqCell('long')).toContain('class="pbadge clipbadge"');
    expect(reqCell('long')).toContain(`<span class="cliptext">${LONG}</span>`);
  });

  it('carries the full value as the accessible name, byte-identical to the visible text', () => {
    const c = reqCell('long');
    const label = /aria-label="([^"]*)"/.exec(c)?.[1];
    const visible = /<span class="cliptext">([^<]*)<\/span>/.exec(c)?.[1];
    expect(label, 'no aria-label on the clipped badge').toBeDefined();
    // asserted as an EQUALITY, not two `toContain`s: this is what proves the
    // tooltip (`content: attr(aria-label)`) and the accessible name can never
    // disagree — one attribute, both jobs
    expect(label).toBe(LONG);
    expect(visible).toBe(label);
  });

  it('carries a role that is ALLOWED to be named by the author', () => {
    // review finding, batch 6: a bare <span> is `role=generic`, and ARIA 1.2
    // PROHIBITS an author-supplied name on generic — Chrome exposes it anyway,
    // but a conforming AT stack may drop it, and the badge enters the tab order
    // once truncated. `note` is the weakest role that permits naming; it is on
    // both branches of the badge, focusable or not, so the markup does not vary
    // with a measurement.
    expect(reqCell('long')).toContain('role="note"');
    expect(reqCell('short')).toContain('role="note"');
    // and it is still not a control: no role that implies an action, no click
    for (const r of ['button', 'link', 'checkbox', 'menuitem', 'tooltip']) {
      expect(reqCell('long'), r).not.toContain(`role="${r}"`);
    }
    expect(reqCell('long')).not.toContain('on-click');
  });

  it('adds NO tab stop — the template never emits one, for any value length', () => {
    // the browser-side MEASUREMENT is the only thing that grants focus, and it
    // grants it only to a badge that is actually truncated. A `tabindex` here
    // would put every row's requestor in the tab order, which is the ruling's
    // "do not add a tab stop to every row" defeated at the source.
    expect(reqCell('short')).not.toContain('tabindex');
    expect(reqCell('long')).not.toContain('tabindex');
  });

  it('is not a `title` tooltip — the mechanism the ruling rejects', () => {
    // `title` is pointer-and-hover only in practice and never fires on
    // :focus-visible, so it fails the keyboard half of the ruling outright
    expect(reqCell('long')).not.toContain('title=');
    expect(reqCell('short')).not.toContain('title=');
  });

  it('leaves an empty requestor as the dimmed dash it already was', () => {
    expect(reqCell('none')).toContain('<span class="gdim">—</span>');
    expect(reqCell('none')).not.toContain('clipbadge');
    expect(reqCell('none')).not.toContain('cliptext');
  });

  it('applies the recipe to the requestor column and to nothing else', () => {
    // two rows carry a requestor, so exactly two badges in the whole render
    expect([...HTML.matchAll(/clipbadge/g)]).toHaveLength(2);
    expect([...HTML.matchAll(/cliptext/g)]).toHaveLength(2);
    for (const cardId of ['short', 'long', 'none']) {
      for (const cls of ['c-mc', 'c-scope', 'c-type', 'c-status']) {
        expect(cell(cardId, cls), `${cardId}/${cls}`).not.toContain('clipbadge');
        expect(cell(cardId, cls), `${cardId}/${cls}`).not.toContain('cliptext');
      }
    }
  });

  it('leaves the column HEADER cell byte-unchanged', () => {
    const head = HTML.slice(HTML.indexOf('<div class="gpin gdetails">'));
    expect(head).toContain('<span class="gcell c-req">Requestor</span>');
  });

  it('cannot reslot the deliverable with an arrow key — the RULE, on the row', () => {
    /* `.growr` carries on-keydown="['rowKey', …]" and rowKey RESLOTS the
       deliverable on ArrowLeft/ArrowRight through POST /replot. Keydown
       bubbles, so EVERY focusable descendant inherited that: tab to it, press
       an arrow, and an audited move happened from a keystroke that should have
       done nothing.

       This badge was patched individually first (`on-keydown="['noop']"`),
       which fixed one of seven controls and hid how wide the hole was. The
       guard is now the one `pipeRowKey` has always had — the handler ignores
       any event that did not START on the row — so it is asserted here as a
       rule about `rowKey`, not as a directive on this cell. */
    const body = block('  async rowKey(ctx, cardId) {');
    expect(body).toContain('ctx.event.target !== ctx.node');
    expect(body.indexOf('ctx.event.target !== ctx.node')).toBeLessThan(body.indexOf('moveRows'));
    expect(TEMPLATE).toContain('on-keydown="[\'rowKey\', row.cardId]"'); // still the row's own listener
    // every focusable control in the row is covered by that one guard, so the
    // per-element stop is gone and must not come back for the next cell
    const src = TEMPLATE.slice(TEMPLATE.indexOf('<div class="gcell c-req">'));
    expect(src.slice(0, src.indexOf('</div>'))).not.toContain('noop');
  });

  it('leaks no Ractive comment text into the rendered DOM', () => {
    // the edit sits in ELEMENT-CONTENT position, where `{{! … }}` ends at the
    // first `}}` and spills its tail into the page as literal text; the
    // explanation above the cell is therefore an HTML comment
    expect(leakedMustacheText()).toEqual([]);
    expect(HTML).not.toContain('<!--'); // and toHTML() strips it, so nothing ships
  });
});

/* ---------------------------------------------------------------------- */
/* B — the reusable recipe, frontend/styles/20-pipeline.css                 */
/* ---------------------------------------------------------------------- */

/** The tooltip rule — its selector spans two lines, so `cssRule()` cannot slice it. */
const TOOLTIP_GROUP =
  /((?:\.clipbadge\[data-clipped\][^,{]+,\s*)+\.clipbadge\[data-clipped\][^,{]+)\{([^}]*)\}/.exec(PIPELINE_CSS);

describe('the clip lives inside the badge, not on the cell', () => {
  it('gives `.cliptext` the ellipsis AND `min-width: 0`, without which it never renders', () => {
    const rule = cssRule('.clipbadge .cliptext', PIPELINE_CSS);
    expect(rule).toContain('overflow: hidden');
    expect(rule).toContain('text-overflow: ellipsis');
    expect(rule).toContain('white-space: nowrap');
    // load-bearing and silent when missing: the text is a flex item of the
    // inline-flex badge, and at the default `min-width: auto` a flex item
    // refuses to shrink below its content — the box overflows and the
    // ellipsis simply never appears
    expect(rule).toContain('min-width: 0');
  });

  it('declares the ellipsis exactly once here, and never in the gantt sheet', () => {
    expect([...cssRule('.clipbadge .cliptext', PIPELINE_CSS).matchAll(/text-overflow:\s*ellipsis/g)]).toHaveLength(1);
    // the file's only OTHER one is the pre-existing `.datefield .dpdate`, so
    // two is the whole count — a third copy of the recipe fails here
    expect([...PIPELINE_CSS.matchAll(/text-overflow:\s*ellipsis/g)]).toHaveLength(2);
    expect(cssRule('.datefield .dpdate', PIPELINE_CSS)).toContain('text-overflow: ellipsis');
    expect(GANTT_CSS).not.toContain('text-overflow');
  });

  it('sizes the badge against the CELL, never against a pixel that could drift', () => {
    // `.pbadge`'s own `max-width: 100%` is the cap — 100% of `.c-req`'s content
    // box — so the 136px lives in exactly one place, the stylesheet that owns
    // the column. Nothing in the recipe repeats it.
    expect(cssRule('.pbadge', PIPELINE_CSS)).toContain('max-width: 100%');
    expect(cssRule('.clipbadge .cliptext', PIPELINE_CSS)).not.toMatch(/width:\s*\d+px/);
    expect(TOOLTIP_GROUP?.[2]).not.toMatch(/width:\s*\d+px/);
    expect(PIPELINE_CSS).not.toContain('136');
  });

  it('names no column — it is a recipe, applied once in this batch', () => {
    for (const rule of [cssRule('.clipbadge .cliptext', PIPELINE_CSS), TOOLTIP_GROUP?.[0] ?? '']) {
      expect(rule).not.toContain('c-req');
      expect(rule).not.toContain('gantt');
    }
  });
});

describe('the tooltip answers hover AND keyboard focus', () => {
  it('does both in ONE rule, keyed on the measured attribute', () => {
    expect(TOOLTIP_GROUP, 'no `[data-clipped]` tooltip selector group').not.toBeNull();
    expect(TOOLTIP_GROUP![1]!.split(',').map((s) => s.trim()).filter(Boolean)).toEqual([
      '.clipbadge[data-clipped]:hover::after',
      '.clipbadge[data-clipped]:focus-visible::after',
    ]);
  });

  it('sources its text from the accessible name, so the two cannot drift', () => {
    expect(TOOLTIP_GROUP![2]).toContain('content: attr(aria-label)');
  });

  it('adds no layout — it cannot grow the row and desync the pane from the Gantt', () => {
    expect(TOOLTIP_GROUP![2]).toContain('position: absolute');
    expect(cssRule('.clipbadge[data-clipped]', PIPELINE_CSS)).toContain('position: relative');
  });

  it('shows NOTHING when the value fits — no bare `.clipbadge` reveal exists', () => {
    // ruling 3: a short name renders in full with no affordance at all
    expect(PIPELINE_CSS).not.toMatch(/\.clipbadge:(hover|focus-visible)::after/);
  });

  it('wears the house focus ring, only once it is focusable', () => {
    const rule = cssRule('.clipbadge[data-clipped]:focus-visible', PIPELINE_CSS);
    expect(rule).toContain('outline: 2px solid var(--blue-500)');
    expect(rule).toContain('outline-offset: 1px');
    // byte-identical to the row-action buttons' ring
    expect(GANTT_CSS).toContain('.gantt .gact:focus-visible { outline: 2px solid var(--blue-500); outline-offset: 1px; }');
  });

  it('uses tokens only — no new colour enters the app', () => {
    expect(TOOLTIP_GROUP![2]).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(cssRule('.clipbadge[data-clipped]:focus-visible', PIPELINE_CSS)).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

/* ---------------------------------------------------------------------- */
/* C — the single application, frontend/styles/35-gantt.css                 */
/* ---------------------------------------------------------------------- */

describe('the cell releases its clip, and only that cell', () => {
  it('keeps `.c-req`s width and hands the overflow to the badge', () => {
    const req = cssRule('.gantt .gdetails .c-req');
    expect(req).toContain('width: 136px');
    expect(req).toContain('overflow: visible');
  });

  it('wins over the `.gcell` clip by SOURCE ORDER, with no new selector', () => {
    // both selectors are (0,3,0); the cascade breaks the tie on order, so the
    // fix must stay BELOW the .gcell rule. A move fails here.
    expect(cssRule('.gantt .gdetails .gcell')).toContain('overflow: hidden');
    expect(GANTT_CSS.indexOf('.gantt .gdetails .c-req {'))
      .toBeGreaterThan(GANTT_CSS.indexOf('.gantt .gdetails .gcell {'));
  });

  it('leaves the other four columns clipped, as fixed boxes', () => {
    for (const cls of ['.c-mc', '.c-scope', '.c-type', '.c-status']) {
      expect(cssRule(`.gantt .gdetails ${cls}`), cls).not.toContain('overflow');
    }
  });

  it('leaves the left-pane collapse list exactly as it was', () => {
    // the assertion most likely to be broken by a careless edit near this
    // region — and the reason the collapse needs no special case: `.c-req` is
    // `display: none` there, so both measured widths read 0 and the sweep
    // strips the tab stop off a hidden cell
    const hide = /((?:\.gantt\.lpc [^,{]+,\s*)+\.gantt\.lpc [^,{]+)\{\s*display: none/.exec(GANTT_CSS);
    expect(hide, 'no .gantt.lpc hide list').not.toBeNull();
    expect(hide![1]!.split(',').map((s) => s.trim()).filter(Boolean)).toEqual([
      '.gantt.lpc .c-req', '.gantt.lpc .c-type', '.gantt.lpc .c-status', '.gantt.lpc .gchips',
    ]);
    expect(cssRule('.gantt.lpc')).toContain('--gleft: 417px');
    // and the collapse never touches this column's width, so the truncation
    // verdict is identical before and after a collapse cycle
    expect(GANTT_CSS).not.toMatch(/\.gantt\.lpc[^{]*\.c-req[^{]*\{[^}]*width:/);
  });
});

/* ---------------------------------------------------------------------- */
/* D — the measurement (source assertions: no DOM exists in this runner)    */
/* ---------------------------------------------------------------------- */

describe('the truncation test is a measurement, asserted against the shipped source', () => {
  const sweep = block('function refreshClips() {');

  it('measures the rendered box and never counts characters', () => {
    expect(sweep).toContain('scrollWidth');
    expect(sweep).toContain('clientWidth');
    // STRICT, and deliberately not updateThumb()'s `+ 1` epsilon (review
    // finding, batch 6): `text-overflow: ellipsis` fires on ANY overflow, so
    // `scrollWidth === clientWidth + 1` is a badge the user can SEE truncated —
    // under the epsilon it got no tooltip and no tab stop, which is this bug
    // surviving inside a ~1px band. The costs are asymmetric: a false positive
    // is a harmless tooltip on a value that just fits, a false negative hides
    // data with no way to reach it.
    expect(sweep).toMatch(/scrollWidth > [\w.]*clientWidth\b/);
    expect(sweep).not.toMatch(/clientWidth\s*\+/);
    // a character count would satisfy every other assertion in this file while
    // shipping the wrong behaviour: it clips "Andy" on one font and misses a
    // long value on another
    expect(sweep).not.toMatch(/\.length\s*[><]/);
  });

  it('MEASURES the whole set before it writes anything — one layout, not N', () => {
    /* `data-clipped` is a live selector (`.clipbadge[data-clipped]` turns the
       badge `position: relative` for the tooltip), so writing it dirties
       layout. Read-write-read-write therefore forced a full style+layout pass
       over the whole Gantt for EVERY badge whose verdict changed — worst on
       the left-pane collapse, where `.c-req` goes `display: none` and every
       badge flips at once, i.e. on a button click.

       Asserted as an ORDER, not as a shape: the last read must come before the
       first write, however the passes are spelled. */
    const lastRead = Math.max(sweep.lastIndexOf('scrollWidth'), sweep.lastIndexOf('clientWidth'));
    const firstWrite = Math.min(
      ...['setAttribute', 'removeAttribute'].map((w) => sweep.indexOf(w)).filter((i) => i >= 0),
    );
    expect(lastRead).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(lastRead, 'a layout read happens after a style write — that is the thrash').toBeLessThan(firstWrite);
  });

  it('GRANTS and REVOKES both attributes on every sweep', () => {
    expect(sweep).toContain("setAttribute('data-clipped'");
    expect(sweep).toContain("removeAttribute('data-clipped'");
    expect(sweep).toContain("setAttribute('tabindex', '0')");
    expect(sweep).toContain("removeAttribute('tabindex')");
    // the revoke half is not tidiness. `{{#each g.rows as row}}` is UNKEYED,
    // so Ractive reuses badge nodes by index and only rewrites their text — a
    // node that held a long value and now holds a short one would keep a stale
    // tab stop, and a stale tooltip, forever if the sweep only added.
  });

  it('owns both attributes alone — the template declares neither', () => {
    // so Ractive never fights the sweep between renders
    expect(TEMPLATE).not.toContain('data-clipped');
    const src = TEMPLATE.slice(TEMPLATE.indexOf('<div class="gcell c-req">'));
    expect(src.slice(0, src.indexOf('</div>'))).not.toContain('tabindex');
  });

  it('re-runs on every load — which is also the project switch', () => {
    // resetForProjectSwitch() and popstate both end in loadAll(), so the
    // project-switch case needs no separate hook
    expect(block('async function loadAll() {')).toContain('remeasure()');
    expect(block('async function resetForProjectSwitch() {')).toContain('loadAll');
  });

  it('re-runs when a tab remounts the sheet', () => {
    expect(block('function selectTab(id) {')).toContain('remeasure()');
  });

  it('re-runs when a sprint block expands — its rows did not exist a frame ago', () => {
    expect(block('  toggleBlock(_ctx, id) {')).toContain('remeasure()');
  });

  it('re-runs when the left pane expands — collapse strips the tab stop, expand restores it', () => {
    expect(block('  toggleLeftPane() {')).toContain('remeasure()');
  });

  it('re-measures after the webfont swaps, not only before', () => {
    // frontend/index.html loads Google Sans Flex with `display=swap`, so the
    // first paint measures fallback metrics and every width shifts when the
    // real font lands — without this the first sweep is wrong in both directions
    expect(APP_JS).toContain('document.fonts.ready');
    expect(APP_JS).toMatch(/document\.fonts\.ready\.then\(refreshClips\)/);
  });

  it('rides the existing rAF seams — no observer, no new post-render pattern', () => {
    for (const api of ['ResizeObserver', 'MutationObserver', 'IntersectionObserver']) {
      expect(APP_JS, api).not.toContain(api);
    }
    /* The rule is "no post-render measurement pass picks up half the work",
       not "the same lambda is copied four times" — the literal-count assertion
       this replaces actively BLOCKED naming the pair, and a fifth seam that
       called only one of them still passed it. So: exactly one place composes
       the pair, and no rAF anywhere calls either half on its own. */
    expect([...APP_JS.matchAll(/refreshThumbs\(\); refreshClips\(\);/g)]).toHaveLength(1);
    expect(APP_JS).toContain('const remeasure = () => requestAnimationFrame(');
    for (const m of APP_JS.matchAll(/requestAnimationFrame\((?:\(\) =>\s*)?([^\n]*)/g)) {
      const tail = m[1] ?? '';
      const one = tail.includes('refreshThumbs') !== tail.includes('refreshClips');
      expect(one, `a rAF measures only half the row chrome: ${tail.trim()}`).toBe(false);
    }
  });
});

/**
 * Every `/\b136\b/` in the shipped script that is NOT inside a comment.
 *
 * The gate is "no pane or column width lives in JS". The file has carried a
 * prose comment documenting the CSS arithmetic (`58 gutter + 97 + 262 + 136 +
 * 146 + 300`) since long before this batch, and that comment points AT the
 * stylesheet rather than duplicating a constant — deleting a correct comment to
 * satisfy a substring match would make the codebase worse, not safer. So the
 * ban is enforced where it means something: on code.
 */
function widthInCode(src: string, re: RegExp): string[] {
  const hits: string[] = [];
  for (const m of src.matchAll(re)) {
    const before = src.slice(0, m.index);
    const lineStart = before.lastIndexOf('\n') + 1;
    if (before.lastIndexOf('/*') > before.lastIndexOf('*/')) continue; // inside a block comment
    if (before.indexOf('//', lineStart) >= 0) continue; // after a line comment
    hits.push(src.slice(lineStart, src.indexOf('\n', m.index)));
  }
  return hits;
}

describe('no pane or column width lives in JS', () => {
  it('keeps the standing 999 / 417 guard', () => {
    expect(APP_JS).not.toMatch(/\b(999|417)\b/);
  });

  it('carries the requestor column width in no executable line', () => {
    expect(widthInCode(APP_JS, /\b136\b/g)).toEqual([]);
    expect(block('function refreshClips() {')).not.toMatch(/\d+px|\b136\b/);
  });

  it('but the scanner does bite (negative control — an always-empty scan proves nothing)', () => {
    expect(widthInCode('/* 136 in prose */\nconst w = 136;\n', /\b136\b/g)).toEqual(['const w = 136;']);
    expect(widthInCode('// 136 in a line comment\n', /\b136\b/g)).toEqual([]);
  });
});

/* ---------------------------------------------------------------------- */
/* E — the harness fixtures are untouched by this suite                     */
/* ---------------------------------------------------------------------- */

describe('the shared fixtures still describe production, not the frames', () => {
  it('leaves the harness requestor short, the way every other suite reads it', () => {
    // owl #40: production shows "Andy" / "Chev"; the long `@handle` is a
    // fixture account and lives only in this file
    expect(renderGantt()).toContain('<span class="cliptext">Ana</span>');
    expect(renderGantt()).not.toContain(LONG);
  });
});
