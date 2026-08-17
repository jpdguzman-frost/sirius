/**
 * T144 — Pipeline per-row warning + popover (owl #36, nodes 537:69131 /
 * 537:69135), and the deletion of the table banner it replaces.
 *
 * Two halves, both executed rather than grepped:
 *
 *   RECIPE — `WARN_LABEL`, `WARN_WHY` and `rowWarning` are sliced out of the
 *   SHIPPED `frontend/scripts/01-app.js` and evaluated (the
 *   test/suggest-counts.test.ts pattern). The label is a VARIABLE string in
 *   every place it appears, so the tests read it from the constant instead of
 *   re-typing 'Needs Info' — retyping it would be the drift the ruling exists
 *   to prevent.
 *
 *   MARKUP — the same function is then fed to `renderPipelineTable`, which
 *   renders the shipped template through Ractive's own `toHTML()`. That is
 *   what proves the recipe and the row actually meet: a source-text assertion
 *   can show a string is present without showing that it renders.
 *
 * The deletion guards matter as much as the feature: the aggregate signal did
 * not disappear with the panel, it moved to the OPEN WORK KPI, and `corrections`
 * must stay on the wire (test/schedule.test.ts:301 is the server half of that).
 */

import { describe, expect, it } from 'vitest';
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

/** The server's own tokens, in the order src/services/pipeline.ts pushes them. */
const SERVER_TOKENS = ['difficulty label', 'due date', 'Figma attachment'];

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
});

describe('the warned row (popover closed)', () => {
  const html = () => renderPipelineTable({ pipelineRows: [WARNED, CLEAN], rowWarning: recipe.rowWarning });

  it('marks the row .warn and leaves a complete card untouched', () => {
    const warned = rowHtml(html(), 'MC-655');
    expect(warned).toMatch(/class="prow\b[^"]*\bwarn\b/);
    const clean = rowHtml(html(), 'MC-712');
    expect(clean).not.toMatch(/\bwarn\b/);
    expect(clean).not.toContain('warnwrap');
    expect(clean).not.toContain('warnmsg');
  });

  it('puts exactly one message button in the row, wired for a dialog', () => {
    const warned = rowHtml(html(), 'MC-655');
    const buttons = [...warned.matchAll(/<button class="warnmsg"/g)];
    expect(buttons).toHaveLength(1);
    expect(warned).toContain('aria-haspopup="dialog"');
    expect(warned).toContain('aria-expanded="false"');
    const label = /aria-label="([^"]*)"[^>]*>\s*<svg class="i10"/.exec(warned)?.[1]
      ?? /<button class="warnmsg"[\s\S]*?aria-label="([^"]*)"/.exec(warned)![1]!;
    expect(label).toContain(recipe.WARN_LABEL);
    expect(label).toContain(WARNED.mcLabel);
    expect(label).toContain(WARNED.name);
  });

  it('takes the visible label from the recipe, never from a literal in the markup', () => {
    const warned = rowHtml(html(), 'MC-655');
    const shown = /<span class="warnlabel">([^<]*)<\/span>/.exec(warned)![1];
    expect(shown).toBe(recipe.rowWarning(WARNED)!.label);
    // the variable-string rule: renaming the label must be a one-line change
    expect(TEMPLATE).not.toContain(recipe.WARN_LABEL);
  });

  it('disables nothing — the warning is presentation, and the row stays operable', () => {
    const disabledIn = (html_: string) => [...html_.matchAll(/disabled/g)].length;
    expect(disabledIn(rowHtml(html(), 'MC-655'))).toBe(disabledIn(rowHtml(html(), 'MC-712')));
    // and the row itself gained no handler with the class
    expect(rowHtml(html(), 'MC-655')).toContain('tabindex="0"');
  });
});

describe('the popover (open on one row)', () => {
  const html = () =>
    renderPipelineTable({ pipelineRows: [WARNED, CLEAN], warnPop: WARNED.cardId, rowWarning: recipe.rowWarning });

  /**
   * Attribute-wise, not by literal substring: Ractive's `toHTML()` hoists the
   * inline `style` ahead of the attributes that follow it in source, so
   * `<div class="warnpop" role="dialog"` never appears verbatim.
   */
  function popover(): string {
    const at = html().indexOf('<div class="warnpop"');
    expect(at, 'the popover never rendered').toBeGreaterThan(-1);
    const open = html().slice(at);
    let depth = 0;
    for (const m of open.matchAll(/<div\b|<\/div>/g)) {
      if (m[0] === '</div>') {
        if (--depth === 0) return open.slice(0, m.index + '</div>'.length);
      } else depth++;
    }
    throw new Error('pipeline-warning: the popover never closes');
  }

  it('is a dialog named by the recipe AND by the card, with the trigger reporting it open', () => {
    const pop = popover();
    expect(pop).toContain('role="dialog"');
    // several rows can be warned at once, so the dialog's accessible name has
    // to say WHICH card — the same composed name its trigger carries
    // attribute-wise for the reason the slicer above documents
    const name = /<div class="warnpop"[^>]*\saria-label="([^"]*)"/.exec(pop)![1]!;
    expect(name).toContain(recipe.rowWarning(WARNED)!.label);
    expect(name).toContain(WARNED.mcLabel);
    expect(name).toContain(WARNED.name);
    expect(rowHtml(html(), 'MC-655')).toContain('aria-expanded="true"');
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
    expect(out).toContain('class="warnpop"');
    expect(out).not.toContain('wpopen');
    // the separator exists to divide the details from the link; with no link
    // it would be a bare 1px rule under the last detail
    expect(out).not.toContain('wpsep');
  });

  it('opens exactly one popover even when several rows are warned', () => {
    const second = row({ cardId: 'card-9', mcLabel: 'MC-900', name: 'Second warned', missing: ['due date'] });
    const out = renderPipelineTable({
      pipelineRows: [WARNED, second], warnPop: WARNED.cardId, rowWarning: recipe.rowWarning,
    });
    expect([...out.matchAll(/class="warnpop"/g)]).toHaveLength(1);
    expect([...out.matchAll(/<button class="warnmsg"/g)]).toHaveLength(2);
  });
});

describe('one recipe per visual (CSS)', () => {
  it('joins the shared fixed-box popover base rather than forking it', () => {
    expect(PIPELINE_CSS).toMatch(/\.selectmenu, \.duepop, \.warnpop \{/);
    // the fork is the annotation's slate-100 stroke and nothing else
    const own = cssRule('.warnpop', PIPELINE_CSS);
    expect(own).toContain('width: 235px');
    expect(own).toContain('border-color: var(--slate-100)');
    expect(own).not.toContain('position:');
    expect(own).not.toContain('box-shadow');
  });

  it('dresses the message as an underlined amber-600 button', () => {
    const rule = cssRule('.warnmsg', PIPELINE_CSS);
    expect(rule).toContain('text-decoration: underline');
    expect(rule).toContain('cursor: pointer');
    expect(rule).toContain('color: var(--amber-600)');
  });

  it('underlines Open Card in blue-700 and titles the popover amber-700/600', () => {
    expect(cssRule('.wpopen', PIPELINE_CSS)).toMatch(/text-decoration: underline/);
    expect(cssRule('.wpopen', PIPELINE_CSS)).toContain('var(--blue-700)');
    expect(cssRule('.wptitle', PIPELINE_CSS)).toContain('var(--amber-700)');
    expect(cssRule('.wptitle', PIPELINE_CSS)).toContain('font-weight: 600');
  });

  it('declares the R-warn-a left accent exactly once, over an amber-50 row', () => {
    expect([...PIPELINE_CSS.matchAll(/inset 3px 0 0/g)]).toHaveLength(1);
    expect(PIPELINE_CSS).toContain('var(--amber-300)');
    expect(cssRule('.ptable tr.prow.warn > td', PIPELINE_CSS)).toContain('var(--amber-50)');
    // the frame's 280px name column and 113px row height are NOT hardcoded —
    // the table is fluid and the row height is content-derived (recorded as a
    // measurement-context divergence under R-warn-a)
    expect(cssRule('.ptable .col-name', PIPELINE_CSS)).not.toContain('280px');
  });

  it('serves the message from the table\'s one shared focus ring', () => {
    const at = PIPELINE_CSS.indexOf('.datefield:focus-visible');
    const selector = PIPELINE_CSS.slice(at, PIPELINE_CSS.indexOf('{', at));
    expect(selector).toContain('.warnmsg:focus-visible');
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
    expect(leakedMustacheText()).toEqual([]);
  });
});
