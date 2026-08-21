/**
 * The Forecast tab, rebuilt to build-spec v1.2 §7.2/§7.3 and nodes
 * `279:22602` / `279:16649` — the last of the six tabs still on its
 * pre-redesign markup.
 *
 * Law: `specs/001-sirius-v1/forecast-frame-notes.md` (R-fc-a … R-fc-y).
 *
 * This tab is the only one in the project with NO owl and NO Figma
 * annotations, so several rules here are the build spec and the frames
 * disagreeing. Every such rule is asserted on BOTH sides — what shipped, and
 * what did not.
 *
 * The column model is executed, not described: `FC_COLS` and `fcGroupCells`
 * are sliced out of the shipped client and run, and the header this file reads
 * is rendered by real Ractive from those same values. So "the spans cover the
 * columns" is proven by folding the one list two ways, not by comparing two
 * numbers somebody typed.
 *
 * WHAT THIS FILE CANNOT PROVE. `toHTML()` is a string with no layout, no
 * pointer and no clock. It cannot show that the header sticks, that the two
 * tiers stay in column alignment through a horizontal scroll, that 2704px of
 * table scrolls inside its own box and never the page body, or that a rejected
 * SLA value visibly snaps back. Those are the `it.todo` block at the bottom and
 * they belong to the live pass.
 */

import { describe, expect, it } from 'vitest';
import { forecast } from '../lib/forecast.ts';
import { LEGACY_CYCLE } from '../lib/model.ts';
import {
  APP_JS,
  APP_JS_CODE,
  FC_COLS,
  FC_GROUPS,
  FORECAST_CSS,
  TEMPLATE,
  TOKENS_CSS,
  UI_CSS,
  decl,
  forecastCells,
  method,
  handlerBody,
  leakedMustacheText,
  renderForecastTable,
  type ForecastRow,
} from './helpers/gantt-render.ts';

const COLS = FC_COLS();
const GROUPS = FC_GROUPS();

/* Comments stripped BEFORE the flat rule walker runs: a `/* … *\/` block reads
   as a selector otherwise, and the repo has been bitten by prose tripping a
   source-regex guard twice (test/CLAUDE.md rule 3). */
const CSS = FORECAST_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
const rules = (): Array<[string, string]> =>
  [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!]);

/* The Forecast view's own slice of the composed template — everything between
   its opening guard and the next view's. Assertions about what this tab does
   and does not carry read THIS, not the whole page. */
const VIEW = (() => {
  const at = TEMPLATE.indexOf("{{#if activeTab === 'forecast'}}");
  if (at < 0) throw new Error('forecast-frame: the Forecast view is not in the composed template');
  const next = TEMPLATE.indexOf("{{#if activeTab === ", at + 10);
  return next < 0 ? TEMPLATE.slice(at) : TEMPLATE.slice(at, next);
})();

/** One row as the tab consumes it, with the shipped stamp loop run over it. */
function row(over: Partial<ForecastRow> = {}): ForecastRow {
  const base = {
    cardId: 'c1',
    displayId: 'MC-328.1',
    name: 'Fully Verified Asset',
    difficulty: 'Hard',
    confidence: '0.7',
    slaSketch: null,
    slaRender: null,
    slottedWeek: '2026-08-03',
    trelloUrl: 'https://trello.com/c/abc',
    ...over,
  } as ForecastRow;
  if (base.forecast === undefined) {
    const f = forecast({
      difficulty: base.difficulty ?? 'Hard',
      currentList: 'Design',
      labels: [],
      startDate: base.slottedWeek ?? '2026-08-03',
      confidence: base.confidence,
      slaSketch: base.slaSketch,
      slaRender: base.slaRender,
    });
    base.forecast = {
      ...f,
      sketchDelivery: '2026-08-06',
      sketchApproved: '2026-08-13',
      renderDelivery: '2026-08-19',
      renderApproved: '2026-08-24',
      startDate: base.slottedWeek ?? '2026-08-03',
      late: false,
    };
  }
  base.fcCells = forecastCells(base as unknown as { forecast: Record<string, unknown> | null });
  return base;
}

const HEAD = (html: string) => html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
const thClasses = (tr: string): string[] =>
  [...tr.matchAll(/<th\b[^>]*class="([^"]*)"/g)].map((m) => m[1]!.trim());

/* ========================================================================== *
 * R-fc-a — ONE column table, folded two ways
 * ========================================================================== */

describe('R-fc-a — the header is derived from the column table, so it cannot shear off the body', () => {
  it('renders both tiers and at least one body row (nothing here is vacuous)', () => {
    const html = renderForecastTable({ rows: [row()] });
    expect(html).toContain('fctier1');
    expect(html).toContain('fctier2');
    expect([...html.matchAll(/<tr class="prow fcrow"/g)]).toHaveLength(1);
  });

  it('tier one covers exactly the leaf columns, both sides read off the same render', () => {
    const head = HEAD(renderForecastTable({ rows: [row()] }));
    const [tier1 = '', tier2 = ''] = head.split('</tr>');
    const spanned = [...tier1.matchAll(/<th\b[^>]*\bcolspan="(\d+)"/g)].reduce((n, m) => n + Number(m[1]), 0);
    const bare = [...tier1.matchAll(/<th\b(?![^>]*\bcolspan=)/g)].length;
    const leaves = [...tier2.matchAll(/<th\b/g)].length;
    expect(leaves, 'the leaf header row rendered empty').toBeGreaterThan(0);
    expect(spanned + bare, 'tier one does not cover the leaf columns — the header has sheared').toBe(leaves);
  });

  /* The spans are arithmetic, so they are exercised on column sets this build
     does not ship — a fold that happened to work on today's list and not on a
     rearranged one would pass a single-case assertion. */
  it('the fold covers any column list, not just the shipped one', () => {
    const fold = new Function(`${decl(APP_JS, 'fcGroupCells')} return fcGroupCells;`)() as (
      cols: Array<{ group: string; key: string }>,
    ) => Array<{ label: string; span: number }>;
    const cases: Array<Array<{ group: string; key: string }>> = [
      [],
      [{ group: 'A', key: 'a' }],
      [{ group: '', key: 'a' }, { group: '', key: 'b' }, { group: 'A', key: 'c' }],
      // the same group name twice, non-adjacent — two cells, not one span of two
      [{ group: 'A', key: 'a' }, { group: 'B', key: 'b' }, { group: 'A', key: 'c' }],
    ];
    for (const cols of cases) {
      const folded = fold(cols);
      expect(folded.reduce((n, g) => n + g.span, 0)).toBe(cols.length);
    }
    expect(fold(cases[3]!).map((g) => g.label)).toEqual(['A', 'B', 'A']);
  });

  /* The two header tiers fold from FC_COLS; the twenty-five BODY cells are
     hand-typed, so this is the seam where the body can drift off the header.
     Class order alone is not enough — a cell can sit in the right position
     carrying the wrong alignment or reading the wrong field. */
  it('the body row carries one cell per column, in the column table’s order', () => {
    const html = renderForecastTable({ rows: [row()] });
    const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
    const cells = [...body.matchAll(/<td\b[^>]*class="([^"]*)"/g)].map((m) => m[1]!.trim().split(/\s+/)[0]!);
    expect(cells).toEqual(COLS.map((c) => c.cls));
    expect(body, 'a forecastable row must not span cells').not.toContain('colspan');
  });

  it('each body cell carries the alignment its column declares', () => {
    const html = renderForecastTable({ rows: [row()] });
    const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
    const classes = [...body.matchAll(/<td\b[^>]*class="([^"]*)"/g)].map((m) => m[1]!.split(/\s+/));
    expect(classes).toHaveLength(COLS.length);
    COLS.forEach((col, i) => {
      expect(classes[i]!.includes('fcnum'), `${col.cls} disagrees with its column’s alignment`).toBe(Boolean(col.num));
    });
  });

  /* Read the TEMPLATE for this one: the render stubs fmtLong to identity, so a
     cell wired to the wrong field would still print a plausible string. */
  it('each figure cell reads its own column’s stamped value', () => {
    const tds = [...VIEW.matchAll(/<td class="(fc-[a-z]+)[^"]*"[^>]*>([\s\S]*?)<\/td>/g)];
    expect(tds.length, 'the body cells are not where this guard looks').toBeGreaterThan(15);
    const byCls = new Map(tds.map((m) => [m[1]!, m[2]!]));
    for (const col of COLS) {
      const cell = byCls.get(col.cls as string);
      if (cell === undefined) continue; // the four `always` cells read the row directly
      if (!cell.includes('fcCells')) continue;
      expect(cell, `${col.cls} renders a value from another column`).toContain(`fcCells.${col.key}`);
    }
    /* Every printed column IS read somewhere in the row. A `control` column is
       exempt because a form field must bind the RAW value — an input holding
       the string `4.80` is not a number the browser can step or validate. */
    for (const col of COLS.filter((c) => !c.always && !c.control)) {
      expect(VIEW, `${col.key} is stamped but never rendered`).toContain(`fcCells.${col.key}`);
    }
    for (const col of COLS.filter((c) => c.control)) {
      expect(VIEW, `${col.key} is a control and must bind the raw value`).toContain(`value="{{row.${col.key}}}"`);
    }
  });

  it('the leaf headers are the column table’s classes and labels, in order', () => {
    const head = HEAD(renderForecastTable({ rows: [row()] }));
    const tier2 = head.split('</tr>')[1] ?? '';
    expect(thClasses(tier2).map((c) => c.split(/\s+/)[0])).toEqual(COLS.map((c) => c.cls));
    const labels = [...tier2.matchAll(/<th\b[^>]*>([^<]*)</g)].map((m) => m[1]!.trim());
    expect(labels).toEqual(COLS.map((c) => c.label));
  });

  it('the tier-one cells and spans are the fold’s own output', () => {
    const head = HEAD(renderForecastTable({ rows: [row()] }));
    const tier1 = head.split('</tr>')[0] ?? '';
    const spans = [...tier1.matchAll(/<th\b[^>]*\bcolspan="(\d+)"/g)].map((m) => Number(m[1]));
    expect(spans).toEqual(GROUPS.map((g) => g.span));
    const labels = [...tier1.matchAll(/<th\b[^>]*>([^<]*)</g)].map((m) => m[1]!.trim());
    expect(labels).toEqual(GROUPS.map((g) => g.label));
  });

  /* Group MEMBERSHIP, not group count (test/CLAUDE.md rule 1): a fifth group,
     or a column joining one, is a legitimate change and must not go red. */
  it('each breakdown column sits under the group that names it', () => {
    const groupOf = (key: string) => COLS.find((c) => c.key === key)?.group;
    expect(groupOf('sketchLead')).toBe('SKETCH');
    expect(groupOf('renderLead')).toBe('RENDER');
    expect(groupOf('slaSketch')).toBe('REVIEW SLA');
    expect(groupOf('slaRender')).toBe('REVIEW SLA');
    expect(groupOf('sketchDelivery')).toBe('FORECASTED DATES');
    expect(groupOf('renderApproved')).toBe('FORECASTED DATES');
  });
});

/* ========================================================================== *
 * R-fc-c — the blank spacer, R-fc-b — the seven leading columns
 * ========================================================================== */

describe('R-fc-b / R-fc-c — the identity columns and the cell above them', () => {
  it('the first tier-one cell carries no label', () => {
    expect(GROUPS[0]!.label).toBe('');
    expect(GROUPS[0]!.span).toBeGreaterThan(1);
    const tier1 = HEAD(renderForecastTable({ rows: [row()] })).split('</tr>')[0] ?? '';
    // `<thead` also starts with `<th`, so the cell is found by a word boundary
    const first = tier1.slice(/<th\b(?!ead)/.exec(tier1)!.index, tier1.indexOf('</th>'));
    expect(first).toContain('fcspacer');
    expect(first.slice(first.indexOf('>') + 1).trim(), 'the spacer must render no glyphs').toBe('');
  });

  it('the frame’s hidden "MC #" string is not resurrected as a group label', () => {
    expect(GROUPS.map((g) => g.label)).not.toContain('MC #');
  });

  it('the spec’s single Request column is drawn as two, so seven lead', () => {
    expect(COLS.slice(0, GROUPS[0]!.span).map((c) => c.key)).toEqual([
      'displayId', 'name', 'difficulty', 'confidence', 'startDate', 'startWeek', 'cards',
    ]);
  });
});

/* ========================================================================== *
 * R-fc-d — the retired formula never reaches a screen
 * ========================================================================== */

describe('R-fc-d — the Model Constants panel states the SHIPPED engine, not the retired workbook', () => {
  /* SC-3, in the spec's own words: the spreadsheet formula "is never exposed"
     (BR-2, BR-3). The frame's own footer banner quotes both of its constants. */
  it('neither legacy coefficient appears in the template, the client or the stylesheet', () => {
    for (const n of [LEGACY_CYCLE.coef, LEGACY_CYCLE.constant]) {
      expect(String(n), 'a retired workbook constant is on screen').not.toBe('');
      expect(VIEW).not.toContain(String(n));
      expect(FORECAST_CSS).not.toContain(String(n));
    }
    const constantsSrc = decl(APP_JS, 'FC_CONSTANTS');
    expect(constantsSrc).not.toContain(String(LEGACY_CYCLE.coef));
    expect(constantsSrc).not.toContain(String(LEGACY_CYCLE.constant));
    expect(constantsSrc.toLowerCase()).not.toContain('forecast.legacy');
  });

  it('the panel renders FROM the rule table, so its words and the engine cannot drift', () => {
    expect(VIEW).toContain('{{#each FC_CONSTANTS as k}}');
    expect(VIEW).toContain('{{k.label}}');
    expect(VIEW).toContain('{{k.text}}');
  });

  it('the three constants quoted from the frame say what the engine does', () => {
    const table = new Function(`${decl(APP_JS, 'FC_CONSTANTS')} return FC_CONSTANTS;`)() as Array<{ key: string; text: string }>;
    const text = (k: string) => table.find((e) => e.key === k)?.text ?? '';
    expect(text('render')).toMatch(/Friday/);
    expect(text('calendar')).toMatch(/WORKDAY/);
    expect(text('week')).toMatch(/WEEKNUM/);
    // and the one that replaces the retired formula names the SLA's effect
    expect(text('total')).toMatch(/Review SLA/);
  });

  it('the model banner is the only place the overstatement is stated, and it survives', () => {
    expect(VIEW).toContain('{{#if modelProvenance}}');
    expect(VIEW).toMatch(/12\.5–22 days/);
  });
});

/* ========================================================================== *
 * R-fc-e / R-fc-f / R-fc-g — three frame typos, shipped corrected
 * ========================================================================== */

describe('R-fc-e / R-fc-f / R-fc-g — what the frame draws and what shipped', () => {
  it('the second breakdown group is RENDER, and SKETCH names exactly one group', () => {
    const groups = GROUPS.map((g) => g.label);
    expect(groups).toContain('RENDER');
    expect(groups.filter((g) => g === 'SKETCH'), 'the frame’s duplicate SKETCH group has come back').toHaveLength(1);
  });

  it('CYLCE is nowhere', () => {
    expect(COLS.map((c) => c.label).join(' ')).not.toContain('CYLCE');
    expect(VIEW).not.toContain('CYLCE');
  });

  it('the percentile select is headed CONFIDENCE, not the frame’s TYPE', () => {
    const conf = COLS.find((c) => c.key === 'confidence')!;
    expect(conf.label).toBe('CONFIDENCE');
    expect(COLS.map((c) => c.label)).not.toContain('TYPE');
  });
});

/* ========================================================================== *
 * R-fc-h — difficulty is read-only on this tab
 * ========================================================================== */

describe('R-fc-h — difficulty is read-only here, against a frame that draws a chevron', () => {
  it('the view opens no difficulty menu and carries no difficulty write', () => {
    expect(VIEW).not.toContain('openDiffMenu');
    expect(VIEW).not.toContain('chooseDifficulty');
    expect(VIEW).not.toContain('bchev');
    expect(VIEW).not.toContain('ubadge');
  });

  it('and the tab still says so in words', () => {
    expect(VIEW).toMatch(/can’t be edited here/);
  });
});

/* ========================================================================== *
 * R-fc-i / R-fc-j / R-fc-k — rules, alignment, figures
 * ========================================================================== */

describe('R-fc-i / R-fc-j / R-fc-k — what the table draws around its numbers', () => {
  /* The frame draws no vertical rule and no table in this app ever has. Read
     as "nothing declares a left/right border", not as one rule's body — a
     second rule elsewhere in the sheet would satisfy the narrower reading. */
  it('no rule in the sheet draws a vertical border', () => {
    const decls = rules();
    expect(decls.length, 'the rule walker found nothing').toBeGreaterThan(10);
    for (const [sel, body] of decls) {
      expect(body.replace(/border-radius[^;]*;?/g, ''), `${sel} draws a vertical rule`).not.toMatch(
        /border-(left|right)\s*:\s*(?!none)/,
      );
    }
  });

  it('the one per-row rule is the underline beneath Total Cycle Time', () => {
    expect(FORECAST_CSS).toMatch(/tr\.fcrow td\.fc-total\s*\{[^}]*border-bottom/);
  });

  it('the right-aligned block is a contiguous tail starting at Total Cycle Time', () => {
    const flags = COLS.map((c) => Boolean(c.num));
    const first = flags.indexOf(true);
    expect(COLS[first]!.key).toBe('totalCycleTime');
    expect(flags.slice(first).every(Boolean), 'the numeric block has a gap in it').toBe(true);
    // …and W, CARDS and the four dates stay left, as drawn
    for (const k of ['startWeek', 'cards', 'sketchDelivery', 'sketchApproved', 'renderDelivery', 'renderApproved']) {
      expect(COLS.find((c) => c.key === k)!.num, `${k} should be left-aligned`).toBeUndefined();
    }
  });

  it('one rule owns the alignment and the tabular figures, and it is the numeric class', () => {
    const owners = rules().filter(([, body]) => /font-variant-numeric/.test(body));
    expect(owners.map(([sel]) => sel)).toEqual(['.fctable .fcnum']);
    expect(owners[0]![1]).toMatch(/text-align:\s*right/);
  });
});

/* ========================================================================== *
 * R-fc-m / R-fc-o / R-fc-p — the header band and the scroller
 * ========================================================================== */

describe('R-fc-m / R-fc-o / R-fc-p — one band per tier, and a real scroll container', () => {
  /* THE DEFECT THIS GUARD ENCODES, and the reason it computes rather than
     greps: `.fctable .fcslagroup { background }` was written to tint the Review
     SLA group and never rendered, because the band rule above it is
     `.fctable .fctier1 th` — two classes AND a type, which out-specifies two
     classes no matter where either sits in the file. That is the third time in
     this project an override read correctly and lost in the browser, and the
     first two were caught only by measuring a live page.

     So: for every rule in this sheet that paints a HEADER cell, compare its
     specificity against the tier band it is trying to beat. A tie loses, and a
     tie is what a reader's eye reports as a win. */
  it('every header override out-specifies the tier band it means to beat', () => {
    const spec = (sel: string): [number, number, number] => [
      (sel.match(/#[\w-]+/g) ?? []).length,
      (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length,
      (sel.replace(/::?[\w-]+/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length,
    ];
    const beats = (a: [number, number, number], b: [number, number, number]) =>
      a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

    // the classes that actually appear on a header cell, read off the render
    const head = HEAD(renderForecastTable({ rows: [row()] }));
    const [t1 = '', t2 = ''] = head.split('</tr>');
    const headerClasses = new Map<string, string>();
    for (const [tier, tr] of [['.fctable .fctier1 th', t1], ['.fctable .fctier2 th', t2]] as const) {
      for (const m of tr.matchAll(/<th\b[^>]*class="([^"]*)"/g)) {
        for (const c of m[1]!.split(/\s+/).filter(Boolean)) headerClasses.set(c, tier);
      }
    }
    expect(headerClasses.size, 'no header classes found — the render moved').toBeGreaterThan(5);

    let checked = 0;
    for (const [sel, body] of rules()) {
      for (const one of sel.split(',').map((x) => x.trim())) {
        const last = one.split(/[\s>+~]+/).pop() ?? '';
        // a rule whose final compound names a NON-th element cannot reach a
        // header cell at all — `.fctable td.fc-total` shares its class with a
        // header cell and is nonetheless a body rule
        const type = /^[a-z][\w-]*/.exec(last)?.[0];
        if (type && type !== 'th') continue;
        const cls = (last.match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1)).find((c) => headerClasses.has(c));
        if (!cls) continue;
        const band = headerClasses.get(cls)!;
        if (one === band) continue; // the band rule itself
        for (const prop of ['background', 'color']) {
          if (!new RegExp(`(^|;|\\s)${prop}\\s*:`).test(body)) continue;
          checked++;
          expect(
            beats(spec(one), spec(band)),
            `\`${one}\` sets ${prop} on a header cell but does not out-specify \`${band}\` — it will not render`,
          ).toBe(true);
        }
      }
    }
    expect(checked, 'the walker found no header overrides to check').toBeGreaterThan(0);
  });

  it('each header tier declares its background exactly once', () => {
    for (const tier of ['.fctable .fctier1 th', '.fctable .fctier2 th']) {
      const owners = rules().filter(([sel, body]) => sel === tier && /(^|;|\s)background\s*:/.test(body));
      expect(owners, `${tier} has no single background owner`).toHaveLength(1);
    }
  });

  it('no rule pins a column — this build claims no frozen first column', () => {
    expect(FORECAST_CSS).not.toMatch(/position:\s*sticky/);
  });

  it('the table lives in the house scroller, with its own wrapper class and thumb key', () => {
    expect(VIEW).toContain('<div class="pscrollwrap fcwrap">');
    expect(VIEW).toContain(`on-scroll="['forecastScrolled']"`);
    expect(VIEW).toContain('fcThumb.needed');
    // the width goes on the TABLE, never the wrapper, or the page body scrolls
    expect(FORECAST_CSS).toMatch(/\.fctable\s*\{[^}]*min-width/);
    expect(FORECAST_CSS).not.toMatch(/\.fcwrap\s*\{[^}]*width/);
  });

  /* Without a branch of its own the Forecast scroller falls through to the
     Pipeline's thumb key and the two sliders overwrite each other. */
  it('the scroller resolver knows this wrapper, and the tab remeasures on arrival', () => {
    /* EXECUTED, not grepped: two independent substrings anywhere in the bundle
       would also be satisfied by an `.fcwrap` branch wired to the wrong key. */
    const thumbKeyOf = new Function(`${decl(APP_JS, 'thumbKeyOf')} return thumbKeyOf;`)() as (
      node: { closest(sel: string): unknown },
    ) => string;
    const node = (match: string | null) => ({ closest: (sel: string) => (sel === match ? {} : null) });
    expect(thumbKeyOf(node('.fcwrap'))).toBe('fcThumb');
    // …and the three that were already there still resolve to themselves
    expect(thumbKeyOf(node('.gwrap'))).toBe('ganttThumb');
    expect(thumbKeyOf(node('.reqwrap'))).toBe('reqThumb');
    expect(thumbKeyOf(node(null))).toBe('pipeThumb');
    const selectTab = APP_JS_CODE.slice(APP_JS_CODE.indexOf('function selectTab('));
    expect(selectTab.slice(0, selectTab.indexOf('}\n'))).toContain("id === 'forecast'");
  });
});

/* ========================================================================== *
 * R-fc-q — the empty states
 * ========================================================================== */

describe('R-fc-q — §8’s empty state, which no frame draws', () => {
  it('uses the shipped recipe rather than a third variant', () => {
    expect(VIEW).toContain('class="rempty"');
    expect(FORECAST_CSS).not.toContain('rempty');
  });

  it('the two causes get two states, and neither says "No data"', () => {
    const empties = [...VIEW.matchAll(/<div class="rempty"><strong>([^<]+)<\/strong><span>([^<]+)</g)];
    expect(empties.length).toBe(2);
    for (const [, head, body] of empties) {
      expect(head!.toLowerCase()).not.toBe('no data');
      expect(body!.length, 'an empty state must name the next action').toBeGreaterThan(20);
    }
    expect(empties.map(([, h]) => h)).toEqual(['No forecast rows match', 'Nothing to forecast']);
  });

  /* The two states are only worth two blocks of markup if the code that PICKS
     between them is right. Nothing else in this file runs it. */
  it('the cause is chosen by running the shipped computeds, not by reading them', () => {
    const host = new Function(`
      ${decl(APP_JS, 'fcMatch')}
      const DATA = { rows: [], fcQ: '' };
      const self = {
        get: (k) => (k === 'forecastRows' ? computed.forecastRows.call(self) : DATA[k]),
      };
      const computed = { ${method('forecastRows').trim()}, ${method('forecastEmpty').trim()} };
      return {
        set: (rows, q) => { DATA.rows = rows; DATA.fcQ = q; },
        rows: () => computed.forecastRows.call(self),
        empty: () => computed.forecastEmpty.call(self),
      };
    `)() as { set(rows: unknown[], q: string): void; rows(): unknown[]; empty(): string | null };

    const live = { displayId: 'MC-328', name: 'Hero render', status: 'ongoing' };
    const done = { displayId: 'MC-900', name: 'Old thing', status: 'done' };

    host.set([live, done], '');
    expect(host.rows()).toHaveLength(1); // done rows never reach this tab
    expect(host.empty()).toBeNull();

    host.set([live], 'hero');
    expect(host.rows(), 'the search does not match on card name').toHaveLength(1);
    host.set([live], 'MC-328');
    expect(host.rows(), 'the search does not match on MC number').toHaveLength(1);
    host.set([live], 'mc-328');
    expect(host.rows(), 'the search is case-sensitive').toHaveLength(1);

    host.set([live], 'nothing-matches-this');
    expect(host.empty(), 'a search that hid every row must name the search').toBe('search');
    host.set([done], '');
    expect(host.empty(), 'a board with nothing to forecast must not blame the search').toBe('none');
    host.set([], '');
    expect(host.empty()).toBe('none');
  });

  it('the empty state REPLACES the table — a header over an empty body is not one', () => {
    const at = VIEW.indexOf('{{#if forecastEmpty}}');
    const table = VIEW.indexOf('<div class="pscrollwrap fcwrap">');
    expect(at).toBeGreaterThan(-1);
    expect(table).toBeGreaterThan(at);
    expect(VIEW.slice(at, table)).toContain('{{else}}');
  });

  it('the per-row no-forecast case spans exactly the columns it must', () => {
    const html = renderForecastTable({ rows: [row({ difficulty: null, forecast: null }) as ForecastRow] });
    const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
    const before = [...body.matchAll(/<td\b(?![^>]*\bcolspan=)/g)].length;
    const span = Number(/<td[^>]*\bcolspan="(\d+)"/.exec(body)?.[1]);
    expect(before + span, 'the fallback row no longer covers the table').toBe(COLS.length);
  });
});

/* ========================================================================== *
 * R-fc-r / R-fc-s — the link, and the three things kept
 * ========================================================================== */

describe('R-fc-r / R-fc-s — the link resolves, and nothing already earned is lost', () => {
  it('“How this forecast works” points at a target that exists in this view', () => {
    const href = /<a class="fcmhow" href="#([^"]+)"/.exec(VIEW)?.[1];
    expect(href, 'the link the frame draws has no destination').toBeTruthy();
    expect(VIEW).toContain(`id="${href}"`);
  });

  /* AC-11 and FR-7.7 in their own words: "provenance and sample size visible". */
  it('AC-11: the provenance panel and the per-row sample size both render', () => {
    expect(COLS.some((c) => c.key === 'sampleSize'), 'AC-11’s sample-size column is gone').toBe(true);
    const html = renderForecastTable({ rows: [row()] });
    expect(html).toContain('fc-n');
    expect(VIEW).toContain('modelProvenance.cells');
    expect(VIEW).toContain('modelProvenance.fallback');
  });

  it('AC-18: a render past the deadline still says so', () => {
    expect(VIEW).toContain('row.forecast.late');
    expect(FORECAST_CSS).toContain('.fclate');
  });
});

/* ========================================================================== *
 * R-fc-t — the writes have a failure path
 * ========================================================================== */

describe('R-fc-t — the SLA and confidence writes reject, revert and say so', () => {
  const sla = handlerBody('setSla');
  const conf = handlerBody('setConfidence');

  /* THE DEFECT THIS GUARD ENCODES: the reject branch used to write the model
     back to the value it already held. `{{#each forecastRows}}` iterates a
     COMPUTED, so the input's keypath is a read-only computation child — the
     typing never reached the model, the write was a no-op, Ractive dropped it
     on an equality check, and the refused number stayed on screen under a
     banner saying it had been kept. Only setting the control itself can undo
     it, and a `badInput` field cannot be reached by any model write at all
     because it reports its own value as the empty string. */
  it('a value the control could not parse restores the CONTROL, before anything is sent', () => {
    expect(sla).toContain('badInput');
    const restore = sla.indexOf('ctx.node.value =');
    const send = sla.indexOf('api.send');
    expect(restore, 'the reject branch no longer restores the field itself').toBeGreaterThan(-1);
    expect(restore, 'a refused value would reach the server before being refused').toBeLessThan(send);
    expect(sla, 'the restore must put back the last committed value, not blank the field').toMatch(
      /ctx\.node\.value = prev/,
    );
  });

  it('an out-of-range number is refused locally, against the server’s own bound', () => {
    const max = new Function(`${decl(APP_JS, 'SLA_MAX')} return SLA_MAX;`)() as number;
    // the HANDLER must spend the constant — asserting it exists somewhere in
    // the bundle would pass with the bound wired nowhere
    expect(sla, 'setSla does not check the upper bound').toMatch(/next > SLA_MAX/);
    expect(sla, 'setSla does not refuse a negative').toMatch(/next < 0/);
    // derive the server's bound rather than retyping it
    const schedule = readServerRoute();
    const bound = /sla_sketch:\s*z\.number\(\)\.min\((\d+)\)\.max\((\d+)\)/.exec(schedule);
    expect(bound, 'the planning route no longer bounds sla_sketch').toBeTruthy();
    expect(max).toBe(Number(bound![2]));
    expect(Number(bound![1])).toBe(0);
  });

  it('both handlers revert and flash a banner when the server refuses', () => {
    for (const body of [sla, conf]) {
      expect(body).toContain('catch');
      expect(body).toContain('flashBanner');
      const revert = body.lastIndexOf('patchRow');
      expect(revert).toBeGreaterThan(body.indexOf('api.send'));
    }
  });

  it('both refuse a no-op, so no audit row records nothing', () => {
    expect(sla).toContain('next === prev');
    expect(conf).toContain('next === prev');
  });
});

/* ========================================================================== *
 * R-fc-u / R-fc-v — the wire, and the two breakdowns
 * ========================================================================== */

describe('R-fc-u / R-fc-v — every column has data, and the two blocks are separate', () => {
  /* The strongest available form: run the SHIPPED engine and prove each column
     resolves to something it computed, rather than reading a type that does
     not exist at runtime. */
  it('every forecast column names a field the engine actually returns', () => {
    const f = forecast({ difficulty: 'Hard', currentList: 'Design', labels: [], startDate: '2026-08-03', confidence: '0.7' });
    const rowFields = new Set(['displayId', 'name', 'difficulty', 'confidence', 'slaSketch', 'slaRender']);
    const addedByTheProjection = new Set(['startDate']);
    for (const col of COLS) {
      if (rowFields.has(col.key as string) || addedByTheProjection.has(col.key as string)) continue;
      expect(Object.prototype.hasOwnProperty.call(f, col.key as string), `${col.key} is not on the engine’s result`).toBe(true);
    }
  });

  it('the projection carries the whole engine result, not a hand-picked subset', () => {
    const pipeline = readPipelineService();
    expect(pipeline, 'the projection no longer spreads the forecast').toMatch(/fc\s*=\s*\{\s*\.\.\.f,/);
    expect(pipeline).toMatch(/startDate,/);
  });

  it('the template no longer retypes the engine’s own arithmetic', () => {
    expect(VIEW).not.toContain('* 2');
    expect(VIEW).not.toContain('toFixed');
    /* INTERPOLATIONS only — `{{/if}}` carries a slash and `{{! … }}` carries
       prose, and neither is arithmetic. What is banned is a value expression
       doing sums on its way to the page. */
    const interpolations = [...VIEW.matchAll(/\{\{(?![#/!>^])([^{}]*)\}\}/g)].map((m) => m[1]!);
    expect(interpolations.length, 'the view renders no values at all').toBeGreaterThan(10);
    for (const expr of interpolations) {
      expect(expr, 'arithmetic in markup re-runs per row on every render').not.toMatch(/[*+]| - |\/(?!\*)/);
    }
  });

  it('the render block reads its own four fields and never the sketch ones', () => {
    const render = COLS.filter((c) => c.group === 'RENDER').map((c) => c.key);
    const sketch = COLS.filter((c) => c.group === 'SKETCH').map((c) => c.key);
    expect(render).toHaveLength(4);
    expect(render.filter((k) => sketch.includes(k)), 'the two blocks share a field').toHaveLength(0);
    for (const k of render) expect(String(k).startsWith('render')).toBe(true);
    for (const k of sketch) expect(String(k).startsWith('sketch')).toBe(true);
  });

  /* Today they are equal by construction. That is a fact about the engine, not
     about the table, and it is asserted so a reader who notices the duplicate
     figures finds the reason here instead of "simplifying" four columns away. */
  it('the two blocks are numerically equal today, by construction in the engine', () => {
    const f = forecast({ difficulty: 'Medium', currentList: 'Design', labels: [], startDate: '2026-08-03', confidence: '0.7' });
    expect(f.renderDesign).toBe(f.sketchDesign);
    expect(f.renderReview).toBe(f.sketchReview);
    expect(f.renderCycle).toBe(f.sketchCycle);
  });

  it('the stamp loop formats durations to two places and counts to none', () => {
    const cells = row().fcCells!;
    expect(cells.totalCycleTime).toMatch(/^\d+\.\d{2}$/);
    expect(cells.sketchLead).toMatch(/^\d+\.\d{2}$/);
    expect(cells.startWeek).toMatch(/^\d+$/);
    expect(cells.cards).toBe('1');
  });

  it('an absent figure reads as a dash, never as a blank cell', () => {
    const fake = { forecast: { totalCycleTime: null, cards: null, startWeek: null } } as unknown as {
      forecast: Record<string, unknown> | null;
    };
    const cells = forecastCells(fake)!;
    expect(cells.totalCycleTime).toBe('—');
    expect(cells.cards).toBe('—');
    expect(cells.startWeek).toBe('—');
  });
});

/* ========================================================================== *
 * Housekeeping — tokens, the retired sheet, the comment hazard
 * ========================================================================== */

describe('the rebuild leaves nothing of the legacy sheet behind', () => {
  it('the Forecast-only legacy recipes are gone from 10-ui.css', () => {
    for (const gone of ['.greenpanel', '.grid {', '.scroll {', '.sla {', 'th.slahead', '.explain {', '.provenance {']) {
      expect(UI_CSS, `${gone} survived the rebuild`).not.toContain(gone);
    }
  });

  it('and nothing in the app still asks for them', () => {
    for (const gone of ['greenpanel', 'class="grid', 'class="scroll', 'class="sla', 'slahead']) {
      expect(TEMPLATE, `${gone} is still rendered`).not.toContain(gone);
    }
  });

  it('the important-flagged header tint is gone, not overridden', () => {
    expect(UI_CSS).not.toContain('!important');
    expect(FORECAST_CSS).not.toContain('!important');
  });

  it('every value in the new sheet binds to a token', () => {
    const body = FORECAST_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(body, 'a raw hex colour is in the new sheet').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(body, 'rem units are the legacy sheet’s habit').not.toMatch(/\d+rem/);
  });

  it('the two new tokens are declared where every token is', () => {
    for (const t of ['--amber-200', '--green-300', '--green-700']) {
      expect(TOKENS_CSS).toContain(`${t}:`);
      expect(FORECAST_CSS).toContain(`var(${t})`);
    }
  });

  it('no Ractive comment leaks its tail into the page', () => {
    expect(leakedMustacheText()).toEqual([]);
  });
});

/* ========================================================================== *
 * What only a browser can answer
 * ========================================================================== */

describe('owed to the live pass — none of this is provable from a string', () => {
  it.todo('the two header tiers stay in column alignment through a full horizontal scroll');
  it.todo('2704px of table scrolls inside .pscroll and the page body never moves sideways');
  it.todo('the sticky header actually sticks, or is inert — .pscroll has no height, so top:0 may pin to a box that never moves');
  it.todo('the Forecast slider and the Pipeline slider do not fight after switching between the tabs');
  it.todo('a non-numeric keystroke in a review SLA field leaves the previous number visible, not an empty box');
  it.todo('an out-of-range SLA shows the bound in the banner and the field keeps its old value');
  it.todo('the group boundaries land on the right columns at real rendered widths');
  it.todo('the amber tier-one tint reads as one group with the lighter tier-two cells beneath it');
});

/* ---- readers kept at the bottom: they touch the filesystem, not the app ---- */

function readServerRoute(): string {
  return readRepo('src/routes/schedule.ts');
}
function readPipelineService(): string {
  return readRepo('src/services/pipeline.ts');
}
function readRepo(rel: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const { fileURLToPath } = require('node:url') as typeof import('node:url');
  return fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', rel), 'utf8');
}
