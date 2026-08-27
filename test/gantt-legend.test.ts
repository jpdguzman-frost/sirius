/**
 * Work-phase legend (owl #26, node 262:33342; re-cut by the Sprint Schedules
 * rebuild, owls #72/#73 + PLAN.md, 2026-08-28: Review LEFT the legend with
 * the phase it named — the bar is one task card now, so the entries are
 * Sketch / Render / Past deadline / Client deadline).
 *
 * The legend is a KEY, not a filter, and it is the only place in the app where
 * the bar colours are named. Two things can silently break it: a second
 * colour map appearing beside the shared swatch classes (drift), and the
 * deadline tick growing its own geometry instead of reusing the one `.gdl`
 * recipe — 1px red-500 since frame 731:98733, and the swatch must follow the
 * shared rule automatically rather than restate it.
 *
 * The template half is RENDERED with Ractive (test/helpers/gantt-render.ts),
 * not grepped: a mis-nested section or a Ractive comment can make the source
 * text and the emitted markup disagree. The CSS half is read off the shipped
 * stylesheet, because the repo has no browser test runner.
 */

import { describe, expect, it } from 'vitest';
import { GANTT_CSS, TEMPLATE, cssRule, renderSprintSchedule } from './helpers/gantt-render.ts';

/** The rendered `<div class="glegend" …>…</div>` subtree. */
function legendHtml(): string {
  const html = renderSprintSchedule();
  const at = html.indexOf('<div class="glegend"');
  expect(at, 'the legend never rendered').toBeGreaterThan(-1);
  return html.slice(at, html.indexOf('</div>', at) + '</div>'.length);
}

describe('the entries — Review is withdrawn with its phase (#72)', () => {
  it('renders four, in bar order, closing with the deadline tick', () => {
    const legend = legendHtml();
    const entries = [...legend.matchAll(/<span class="(gleg[^"]*)">(.*?)<\/span>(.*?)<\/span>/g)];
    expect(entries.map((m) => m[3])).toEqual(['Sketch', 'Render', 'Past deadline', 'Client deadline']);
    expect(entries.map((m) => m[1])).toEqual(['gleg', 'gleg', 'gleg', 'gleg gleg-dl']);
  });

  it('names no Review anywhere in the strip', () => {
    expect(legendHtml()).not.toContain('Review');
  });
});

describe('one colour map, one deadline-marker recipe', () => {
  it('reuses the shared swatch classes — the legend markup carries no colour of its own', () => {
    // the class names are the bars' own (`late` is the row flag worn as a
    // swatch, PLAN.md); what this pins is the DRIFT rule: no hex, no inline
    // style, so the legend cannot quietly disagree with the bars it explains
    const legend = legendHtml();
    expect(legend).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(legend).not.toMatch(/style=/);
    expect(legend).toMatch(/class="[^"]*\bsketch\b/);
    expect(legend).toMatch(/class="[^"]*\brender\b/);
    expect(legend).toMatch(/class="[^"]*\blate\b/);
  });

  it('keeps the retired colour classes out of the whole stylesheet', () => {
    // comments stripped first (test/CLAUDE.md rule 3)
    const css = GANTT_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(css).not.toContain('.gseg.review');
    expect(css).not.toContain('.gseg.renderOverdue');
  });

  it('lets the shared 1px red-500 .gdl recipe reach the legend tick', () => {
    const rule = cssRule('.gantt .glegend .gdl');
    expect(rule).toContain('position: static'); // it must not stay absolute
    // declaring a width here is what once forked the recipe — the legend
    // swatch FOLLOWS the shared rule, whatever the shared rule says
    expect(rule).not.toContain('width');
    expect(GANTT_CSS).toMatch(/\.gdl[^,{]*\{[^}]*width: 1px/);
    expect(GANTT_CSS).toMatch(/\.gdl[^,{]*\{[^}]*var\(--red-500\)/);
  });
});

describe('a key, not a filter, and not part of the scroller', () => {
  it('renders aria-hidden with nothing focusable or clickable inside it', () => {
    const legend = legendHtml();
    expect(legend).toContain('aria-hidden="true"');
    expect(legend).not.toMatch(/<button|<a\b|<input|tabindex|on-click|on-mouseover|on-mouseenter|on-focus/);
  });

  it('sits outside .pscroll, so it stays put while the timeline scrolls', () => {
    const html = renderSprintSchedule();
    const legendAt = html.indexOf('<div class="glegend"');
    const scrollAt = html.indexOf('pscrollwrap');
    expect(legendAt).toBeGreaterThan(-1);
    expect(scrollAt).toBeGreaterThan(legendAt);
    expect(legendHtml()).not.toContain('pscroll');
    // and the source keeps it a sibling of .gwrap inside .gantt
    expect(TEMPLATE).toMatch(/<div class="glegend"[\s\S]{0,900}<div class="pscrollwrap gwrap">/);
  });

  it('does not declare hover or cursor chrome on any legend part', () => {
    const at = GANTT_CSS.indexOf('.glegend {');
    expect(at, 'no .glegend rule').toBeGreaterThan(-1);
    // the legend's own rules are contiguous; read to the next section comment
    const next = GANTT_CSS.indexOf('/* ----', at);
    const legendCss = GANTT_CSS.slice(at, next > at ? next : undefined);
    expect(legendCss).not.toMatch(/:hover|cursor:|:focus/);
  });
});
