/**
 * owl miles→jp #62 — Pipeline filter + sort (nodes 592:56850 · 592:56913 ·
 * 592:56966 · 593:78434 · 593:74881; answers in jp→miles #49).
 *
 * Both are READ-ONLY view operations over rows the client already holds, so
 * the whole feature lives in the shipped app scripts. The recipes below are
 * SLICED OUT OF THOSE SCRIPTS AND EXECUTED (the suggest-counts pattern) — a
 * source-text assertion could show a sort exists without showing it orders
 * anything.
 *
 * What this file cannot prove: that a click opens the panel, that arrow keys
 * walk the items, that Escape returns focus. `toHTML()` has no pointer, focus
 * or clock — those belong to the live pass.
 */

import { describe, expect, it } from 'vitest';
import { APP_JS, APP_JS_CODE, PIPELINE_CSS, TEMPLATE, cssRule, decl, fnBody } from './helpers/gantt-render.ts';

interface Sort { key: string; group: string; label: string; dir: number; value: (r: unknown) => unknown }
interface Axis { key: string; label: string; pick: (r: unknown) => unknown; order?: string[] }

const recipe = new Function(`
  ${decl(APP_JS, 'DIFF_RANK')}
  ${decl(APP_JS, 'PIPE_SORTS')}
  ${decl(APP_JS, 'PIPE_SORT_DEFAULT')}
  ${decl(APP_JS, 'pipeCompare')}
  ${decl(APP_JS, 'PIPE_FILTERS')}
  ${decl(APP_JS, 'PIPE_FILTERS_NONE')}
  ${decl(APP_JS, 'pipeMatches')}
  ${decl(APP_JS, 'pipeSortLabel')}
  function mcRank(mc) { return mc ? Number(String(mc).replace(/\\D/g, '')) : null; }
  return { PIPE_SORTS, PIPE_SORT_DEFAULT, pipeCompare, PIPE_FILTERS, PIPE_FILTERS_NONE, pipeMatches, pipeSortLabel };
`)() as {
  PIPE_SORTS: Sort[];
  PIPE_SORT_DEFAULT: Sort;
  pipeCompare: (s: Sort, a: unknown, b: unknown) => number;
  PIPE_FILTERS: Axis[];
  PIPE_FILTERS_NONE: () => Record<string, string[]>;
  pipeMatches: (r: unknown, sel: Record<string, string[]>, except: string | null) => boolean;
  pipeSortLabel: (k: string | null) => string;
};

const row = (over: Record<string, unknown> = {}) => ({
  cardId: 'c1', mcNumber: 'MC-800', name: 'A card', deadline: null, workStarted: null,
  workStartedTs: null, workDone: null, workDoneTs: null, urgency: 'Non-Urgent',
  difficulty: null, assetType: null, currentList: null, requestor: null, filedAt: null, ...over,
});
const sortBy = (key: string | null, rows: unknown[]) => {
  const s = key ? recipe.PIPE_SORTS.find((x) => x.key === key)! : recipe.PIPE_SORT_DEFAULT;
  return rows.slice().sort((a, b) => recipe.pipeCompare(s, a, b));
};

/* ---------------------------------------------------------------------- */
/* A — the eight sorts are the frame's, in the frame's order                */
/* ---------------------------------------------------------------------- */

describe('the sort set matches the frame exactly', () => {
  it('carries the EIGHT items in three groups, in order', () => {
    expect(recipe.PIPE_SORTS.map((s) => `${s.group}: ${s.label}`)).toEqual([
      'Dates: Due dates closest to now',
      'Dates: Due dates farthest from now',
      'Dates: Recently started',
      'Dates: Recently completed',
      'Priority: Urgent first',
      'Priority: Hardest first',
      'Identity: MC number, low to high',
      'Identity: Card name A–Z',
    ]);
  });

  it('names sorts by the RESULTING ORDER, never column-plus-arrow', () => {
    /* the frame is explicit that the labels should read rather than need
       decoding — no '↑', no '↓', no 'Due (asc)' */
    for (const s of recipe.PIPE_SORTS) expect(s.label).not.toMatch(/[↑↓]|asc|desc/i);
  });

  it('leaves Type, Difficulty and Status OUT — they are filter axes', () => {
    const labels = recipe.PIPE_SORTS.map((s) => s.label.toLowerCase());
    expect(labels.some((l) => l.includes('type'))).toBe(false);
    expect(labels.some((l) => l.includes('status'))).toBe(false);
    // 'Hardest first' is a difficulty ORDER, not a difficulty axis — allowed
    expect(labels.some((l) => l.includes('difficulty'))).toBe(false);
  });

  it('has no phase-progression sort — considered and removed', () => {
    const labels = recipe.PIPE_SORTS.map((s) => s.label.toLowerCase());
    expect(labels.some((l) => l.includes('furthest') || l.includes('progress'))).toBe(false);
  });
});

/* ---------------------------------------------------------------------- */
/* B — EMPTY SORTS LAST, in every direction                                 */
/* ---------------------------------------------------------------------- */

describe('an absent value never displaces a real one', () => {
  const withDue = [row({ cardId: 'none' }), row({ cardId: 'far', deadline: '2026-12-01' }), row({ cardId: 'near', deadline: '2026-08-01' })];

  it('sorts empties last ASCENDING (due dates closest to now)', () => {
    expect(sortBy('due-near', withDue).map((r) => (r as { cardId: string }).cardId)).toEqual(['near', 'far', 'none']);
  });

  it('sorts empties last DESCENDING too — the direction must not flip them up', () => {
    /* this is the assertion that matters: on the real board most cards lack a
       due date, so a naive nulls-first descending order fills the top of the
       table with blanks and looks broken */
    expect(sortBy('due-far', withDue).map((r) => (r as { cardId: string }).cardId)).toEqual(['far', 'near', 'none']);
  });

  it('holds for started, completed, hardest and name', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['started', { workStartedTs: '2026-08-02T00:00:00Z' }],
      ['completed', { workDoneTs: '2026-08-02T00:00:00Z' }],
      ['hardest', { difficulty: 'Hard' }],
      ['name', { name: 'Zeta' }],
    ];
    for (const [key, real] of cases) {
      const rows = [row({ cardId: 'empty', name: '' }), row({ cardId: 'real', ...real })];
      expect(sortBy(key, rows).map((r) => (r as { cardId: string }).cardId), key).toEqual(['real', 'empty']);
    }
  });

  it('treats Non-Urgent as a VALUE, not an absence — nothing falls to the bottom', () => {
    const rows = [row({ cardId: 'plain' }), row({ cardId: 'hot', urgency: 'Urgent' })];
    expect(sortBy('urgent', rows).map((r) => (r as { cardId: string }).cardId)).toEqual(['hot', 'plain']);
  });

  it('orders difficulty Hard → Medium → Easy, not alphabetically', () => {
    const rows = [row({ cardId: 'e', difficulty: 'Easy' }), row({ cardId: 'h', difficulty: 'Hard' }), row({ cardId: 'm', difficulty: 'Medium' })];
    expect(sortBy('hardest', rows).map((r) => (r as { cardId: string }).cardId)).toEqual(['h', 'm', 'e']);
  });
});

/* ---------------------------------------------------------------------- */
/* C — the DEFAULT order                                                    */
/* ---------------------------------------------------------------------- */

describe('the default order is by filing, newest first', () => {
  it('is not one of the eight — it is the order they deviate FROM', () => {
    expect(recipe.PIPE_SORTS.some((s) => s.key === null)).toBe(false);
    expect(recipe.PIPE_SORT_DEFAULT.key).toBe(null);
  });

  it('orders newest filed first, with never-read rows last', () => {
    const rows = [
      row({ cardId: 'old', filedAt: '2026-07-01T00:00:00Z' }),
      row({ cardId: 'unread' }),
      row({ cardId: 'new', filedAt: '2026-08-19T00:00:00Z' }),
    ];
    expect(sortBy(null, rows).map((r) => (r as { cardId: string }).cardId)).toEqual(['new', 'old', 'unread']);
  });

  it('reads filedAt and NOT the Sirius row timestamp', () => {
    /* `created_at` is when the SIRIUS row was made: on the live board it stamps
       289 rows with the single day the board was onboarded, so ordering by it
       would be a meaningless tie dressed as an order (migration 008). */
    const src = recipe.PIPE_SORT_DEFAULT.value.toString();
    expect(src).toContain('filedAt');
    expect(src).not.toContain('created_at');
    expect(src).not.toContain('createdAt');
  });
});

/* ---------------------------------------------------------------------- */
/* D — the five filter axes, OR within / AND across                         */
/* ---------------------------------------------------------------------- */

describe('filtering is OR within a category and AND across them', () => {
  const rows = [
    row({ cardId: 'a', assetType: 'Icon', urgency: 'Urgent' }),
    row({ cardId: 'b', assetType: 'UI', urgency: 'Non-Urgent' }),
    row({ cardId: 'c', assetType: 'Icon', urgency: 'Non-Urgent' }),
  ];
  const pick = (sel: Record<string, string[]>) =>
    rows.filter((r) => recipe.pipeMatches(r, { ...recipe.PIPE_FILTERS_NONE(), ...sel }, null)).map((r) => r.cardId);

  it('carries the five axes the frame names, in order', () => {
    expect(recipe.PIPE_FILTERS.map((f) => f.label)).toEqual(['TYPE', 'DIFFICULTY', 'URGENCY', 'STATUS', 'REQUESTOR']);
  });

  it('REQUESTOR, not CLIENT — every row on a board shares one client', () => {
    expect(recipe.PIPE_FILTERS.some((f) => f.label === 'CLIENT')).toBe(false);
  });

  it('ORs within a category — Icon plus UI shows both', () => {
    expect(pick({ type: ['Icon', 'UI'] })).toEqual(['a', 'b', 'c']);
  });

  it('ANDs across categories — Icon plus Urgent shows only urgent icons', () => {
    expect(pick({ type: ['Icon'], urgency: ['Urgent'] })).toEqual(['a']);
  });

  it('an empty axis constrains nothing', () => {
    expect(pick({})).toEqual(['a', 'b', 'c']);
    expect(pick({ type: [] })).toEqual(['a', 'b', 'c']);
  });

  it('has NO state axes — blocked and missing-info were declined', () => {
    const keys = recipe.PIPE_FILTERS.map((f) => f.key);
    expect(keys).not.toContain('blocker');
    expect(keys).not.toContain('missing');
  });
});

/* ---------------------------------------------------------------------- */
/* E — the facet counts (jp→miles #49)                                      */
/* ---------------------------------------------------------------------- */

describe('a category counts against the OTHER categories, never its own', () => {
  it('ignoring its own selection is what keeps a second value reachable', () => {
    /* the whole reason for the third option: counted against ALL filters
       including its own, picking Icon drops UI to zero and it can never be
       added without clearing first — accurate and unusable. */
    const rows = [row({ cardId: 'a', assetType: 'Icon' }), row({ cardId: 'b', assetType: 'UI' })];
    const sel = { ...recipe.PIPE_FILTERS_NONE(), type: ['Icon'] };
    const forType = rows.filter((r) => recipe.pipeMatches(r, sel, 'type'));
    expect(forType.map((r) => r.cardId)).toEqual(['a', 'b']); // UI still countable
    const forOthers = rows.filter((r) => recipe.pipeMatches(r, sel, 'urgency'));
    expect(forOthers.map((r) => r.cardId)).toEqual(['a']); // …but urgency sees the narrowing
  });
});

/* ---------------------------------------------------------------------- */
/* F — the two buttons differ on purpose                                    */
/* ---------------------------------------------------------------------- */

describe('the sort button names its selection; the filter button never does', () => {
  it('formats the sort label as `Group: Item`', () => {
    /* the group prefix does real work — 'Urgent first' alone is ambiguous out
       of context, and the prefix says which axis is ordering the table */
    expect(recipe.pipeSortLabel('urgent')).toBe('Priority: Urgent first');
    expect(recipe.pipeSortLabel(null)).toBe('');
  });

  it('renders NO count on the filter button — declined, and not to be re-added', () => {
    const btn = /<button class="sfbtn[^>]*openPipeFilter[^>]*>[\s\S]*?<\/button>/.exec(TEMPLATE)?.[0] ?? '';
    expect(btn).toBeTruthy();
    expect(btn).not.toContain('sflabel');
    expect(btn).not.toMatch(/>\{\{pipeFilterCount\}\}</);
  });

  it('puts the applied count ONLY in the filter button’s accessible name', () => {
    /* with no label and no count, that name is the single route to the
       information for someone who cannot see the fill change */
    expect(TEMPLATE).toContain('aria-label="Filter{{#if pipeFilterCount}}, {{pipeFilterCount}} applied{{/if}}"');
  });

  it('caps the sort label so the search row cannot be pushed around', () => {
    expect(cssRule('.sfbtn .sflabel', PIPELINE_CSS)).toMatch(/max-width: \d+px/);
    expect(cssRule('.sfbtn .sflabel', PIPELINE_CSS)).toContain('text-overflow: ellipsis');
  });

  it('gives both buttons the same active fill, and only sort a label', () => {
    expect(cssRule('.sfbtn.on', PIPELINE_CSS)).toContain('var(--slate-900)');
    expect(TEMPLATE).toContain('{{#if pipeSort}}<span class="sflabel">{{pipeSortLabelText}}</span>{{/if}}');
  });
});

/* ---------------------------------------------------------------------- */
/* G — panel behaviour that IS provable without a browser                   */
/* ---------------------------------------------------------------------- */

describe('the panels behave like every other overlay', () => {
  it('joins OVERLAY_KEYS, so mutual exclusion is not re-implemented', () => {
    /* "opening one closes the other" is what openOverlay already does to every
       key in this list — a second rule here could disagree with it */
    const keys = decl(APP_JS_CODE, 'OVERLAY_KEYS');
    expect(keys).toContain('pipeSortMenu');
    expect(keys).toContain('pipeFilterMenu');
  });

  it('disables Clear when there is nothing to clear, in BOTH panels', () => {
    expect(TEMPLATE).toContain('disabled="{{!pipeSort}}"');
    expect(TEMPLATE).toContain('disabled="{{!pipeFilterCount}}"');
  });

  it('disables a zero-count value rather than leaving it silently selectable', () => {
    expect(TEMPLATE).toContain('disabled="{{!v.count && !v.on}}"');
  });

  it('keeps group headings out of the tab order — they are labels, not options', () => {
    const heads = [...TEMPLATE.matchAll(/<p class="pmhead"[^>]*>/g)].map((m) => m[0]);
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h).toContain('aria-hidden="true"');
  });

  it('scrolls STATUS inside its own group, not the whole panel', () => {
    expect(TEMPLATE).toContain(`{{#if f.key === 'status'}}pmscroll{{/if}}`);
    expect(cssRule('.pipemenu .pmscroll', PIPELINE_CSS)).toContain('overflow-y: auto');
    expect(cssRule('.pipemenu', PIPELINE_CSS)).not.toContain('overflow-y');
  });

  it('resets both on project switch, like the planner’s expansion state', () => {
    /* `resetForProjectSwitch` is a `function`, not a sliceable `const`, so read
       its BODY — the same reason fnBody exists beside decl. A Requestor or a
       Status carried into another project names values that project may not
       have, which would silently show an empty table (R-exp-f's reasoning). */
    const reset = fnBody('resetForProjectSwitch');
    expect(reset).toContain('pipeSort');
    expect(reset).toContain('pipeFilters');
  });
});
