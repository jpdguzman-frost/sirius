/**
 * Work-phase legend (owl #26, node 262:33342; phase 13i).
 *
 * The legend is a KEY, not a filter, and it is the only place in the app where
 * the four phase colours are named. Two things can silently break it: a second
 * phase→colour map appearing beside `.gseg` (drift), and the deadline tick
 * growing its own geometry instead of reusing the one `.gantt .gdl` recipe —
 * which is exactly what this pass removed.
 *
 * The template half is RENDERED with Ractive (test/helpers/gantt-render.ts),
 * not grepped: a mis-nested section or a Ractive comment can make the source
 * text and the emitted markup disagree. The CSS half is read off the shipped
 * stylesheet, because the repo has no browser test runner — the measured pass
 * at 1600px is recorded in the frame notes.
 */

import { describe, expect, it } from 'vitest';
import { GANTT_CSS, TEMPLATE, cssRule, renderGantt } from './helpers/gantt-render.ts';

/** The rendered `<div class="glegend" …>…</div>` subtree. */
function legendHtml(): string {
  const html = renderGantt();
  const at = html.indexOf('<div class="glegend"');
  expect(at, 'the legend never rendered').toBeGreaterThan(-1);
  return html.slice(at, html.indexOf('</div>', at) + '</div>'.length);
}

describe('the strip itself (node 262:33342)', () => {
  it('is a 12px right-aligned row with a 4px inset and no wrapping', () => {
    const rule = cssRule('.glegend');
    expect(rule).toContain('justify-content: flex-end');
    expect(rule).toContain('height: 12px');
    expect(rule).toContain('padding-right: var(--space-4)');
    expect(rule).toContain('gap: var(--space-16)'); // 16 between items
    // a wrapped row cannot live in a 12px box — the old flex-wrap is gone
    expect(rule).not.toContain('flex-wrap');
  });

  it('states 12/400 slate-500 explicitly, so a future inherit cannot flip it', () => {
    const rule = cssRule('.glegend');
    expect(rule).toContain('font-size: var(--text-label)'); // 12px
    expect(rule).toContain('font-weight: 400');
    expect(rule).toContain('color: var(--surface-muted-foreground)'); // slate-500 #64748b
  });
});

describe('the entries', () => {
  it('draws phase swatches at 20×10 r4', () => {
    const rule = cssRule('.glegend .gseg');
    expect(rule).toContain('width: 20px');
    expect(rule).toContain('height: 10px');
    expect(rule).toContain('border-radius: var(--radius-sm)'); // 4px
  });

  it('sets the swatch→label gap to 6 on the phases and 8 on the deadline entry', () => {
    expect(cssRule('.glegend .gleg')).toContain('gap: 6px');
    expect(cssRule('.glegend .gleg-dl')).toContain('gap: var(--space-8)');
    // and the modifier is declared AFTER the base, or it never wins
    expect(GANTT_CSS.indexOf('.glegend .gleg-dl')).toBeGreaterThan(GANTT_CSS.indexOf('.glegend .gleg {'));
  });

  it('renders the five entries in order, with the deadline one carrying the modifier', () => {
    const legend = legendHtml();
    const entries = [...legend.matchAll(/<span class="(gleg[^"]*)">(.*?)<\/span>(.*?)<\/span>/g)];
    expect(entries.map((m) => m[3])).toEqual([
      'Sketch', 'Review', 'Render', 'Render past deadline', 'Client deadline',
    ]);
    expect(entries.map((m) => m[1])).toEqual(['gleg', 'gleg', 'gleg', 'gleg', 'gleg gleg-dl']);
  });
});

describe('one phase→colour map, one deadline-marker recipe', () => {
  it('reuses the .gseg classes — the legend markup carries no colour of its own', () => {
    const legend = legendHtml();
    expect([...legend.matchAll(/<span class="gseg ([a-zA-Z]+)"><\/span>/g)].map((m) => m[1])).toEqual([
      'sketch', 'review', 'render', 'renderOverdue',
    ]);
    expect(legend).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(legend).not.toMatch(/style=/);
  });

  it('declares each phase colour exactly once in the whole stylesheet', () => {
    for (const cls of ['sketch', 'review', 'render', 'renderOverdue']) {
      const hits = [...GANTT_CSS.matchAll(new RegExp(`\\.gseg\\.${cls}\\b`, 'g'))];
      expect(hits, `.gseg.${cls} is declared ${hits.length} times`).toHaveLength(1);
    }
  });

  it('lets the shared .gantt .gdl 2px/slate-400 recipe reach the legend tick', () => {
    const rule = cssRule('.gantt .glegend .gdl');
    expect(rule).toContain('position: static'); // it must not stay absolute
    expect(rule).toContain('height: 12px');
    // declaring a width here is what forked the recipe — 3px vs the shared 2px
    expect(rule).not.toContain('width');
    expect(cssRule('.gantt .gdl')).toMatch(/width: 2px[\s\S]*background: var\(--slate-400\)/);
  });
});

describe('a key, not a filter, and not part of the scroller', () => {
  it('renders aria-hidden with nothing focusable or clickable inside it', () => {
    const legend = legendHtml();
    expect(legend).toContain('aria-hidden="true"');
    expect(legend).not.toMatch(/<button|<a\b|<input|tabindex|on-click|on-mouseover|on-mouseenter|on-focus/);
  });

  it('sits outside .pscroll, so it stays put while the timeline scrolls', () => {
    const html = renderGantt();
    const legendAt = html.indexOf('<div class="glegend"');
    const scrollAt = html.indexOf('pscrollwrap');
    expect(legendAt).toBeGreaterThan(-1);
    expect(scrollAt).toBeGreaterThan(legendAt);
    expect(legendHtml()).not.toContain('pscroll');
    // and the source keeps it a sibling of .gwrap inside .gantt
    expect(TEMPLATE).toMatch(/<div class="glegend"[\s\S]{0,900}<div class="pscrollwrap gwrap">/);
  });

  it('does not declare hover or cursor chrome on any legend part', () => {
    const legendCss = GANTT_CSS.slice(GANTT_CSS.indexOf('.glegend {'), GANTT_CSS.indexOf('/* ---- 2.'));
    expect(legendCss).not.toMatch(/:hover|cursor:|:focus/);
  });
});
