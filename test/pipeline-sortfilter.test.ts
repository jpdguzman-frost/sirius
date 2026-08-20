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
interface Axis { key: string; label: string; pick: (r: unknown) => unknown; order?: string[]; none?: boolean }
interface FacetValue { value: string | null; label: string; count: number; on: boolean }
interface Facet { key: string; label: string; scroll: boolean; values: FacetValue[] }

const recipe = new Function(`
  ${decl(APP_JS, 'DIFF_RANK')}
  ${decl(APP_JS, 'PIPE_SORTS')}
  ${decl(APP_JS, 'PIPE_SORT_DEFAULT')}
  ${decl(APP_JS, 'pipeCompare')}
  ${decl(APP_JS, 'pipeSortRows')}
  ${decl(APP_JS, 'PIPE_FILTERS')}
  ${decl(APP_JS, 'unranked')}
  ${decl(APP_JS, 'alphaSort')}
  ${decl(APP_JS, 'pipePick')}
  ${decl(APP_JS, 'PIPE_FILTERS_EMPTY')}
  ${decl(APP_JS, 'pipeMatches')}
  ${decl(APP_JS, 'pipeFacetList')}
  ${decl(APP_JS, 'pipeSortLabel')}
  ${decl(APP_JS, 'mcRank')}
  return { PIPE_SORTS, PIPE_SORT_DEFAULT, pipeSortRows, PIPE_FILTERS, PIPE_FILTERS_EMPTY, pipeMatches, pipeFacetList, pipeSortLabel };
`)() as {
  PIPE_SORTS: Sort[];
  PIPE_SORT_DEFAULT: Sort;
  pipeSortRows: (rows: unknown[], s: Sort) => unknown[];
  PIPE_FILTERS: Axis[];
  PIPE_FILTERS_EMPTY: () => Record<string, (string | null)[]>;
  pipeMatches: (r: unknown, sel: Record<string, (string | null)[]>, except: string | null) => boolean;
  pipeFacetList: (rows: unknown[], sel: Record<string, (string | null)[]>) => Facet[];
  pipeSortLabel: (k: string | null) => string;
};

const row = (over: Record<string, unknown> = {}) => ({
  cardId: 'c1', mcNumber: 'MC-800', name: 'A card', deadline: null, workStarted: null,
  workStartedTs: null, workDone: null, workDoneTs: null, urgency: 'Non-Urgent',
  difficulty: null, assetType: null, currentList: null, requestor: null, filedAt: null, ...over,
});
const sortBy = (key: string | null, rows: unknown[]) => {
  const s = key ? recipe.PIPE_SORTS.find((x) => x.key === key)! : recipe.PIPE_SORT_DEFAULT;
  // the SHIPPED sort path, decorate-sort-undecorate and all — not a
  // re-implementation of it around the bare comparator
  return recipe.pipeSortRows(rows, s);
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
    rows.filter((r) => recipe.pipeMatches(r, { ...recipe.PIPE_FILTERS_EMPTY(), ...sel }, null)).map((r) => r.cardId);

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
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] };
    const forType = rows.filter((r) => recipe.pipeMatches(r, sel, 'type'));
    expect(forType.map((r) => r.cardId)).toEqual(['a', 'b']); // UI still countable
    const forOthers = rows.filter((r) => recipe.pipeMatches(r, sel, 'urgency'));
    expect(forOthers.map((r) => r.cardId)).toEqual(['a']); // …but urgency sees the narrowing
  });
});

describe('the MC-number sort actually orders by the MC number', () => {
  it('puts 9 before 10, and keeps a fraction rather than truncating it', () => {
    /* this sort shipped ordering NOTHING: `mcRank` took a request ROW and read
       `mc_number` off it, the Pipeline handed it the STRING, and every row
       ranked null. The suite could not see it because it carried a hand-written
       stub of `mcRank` instead of slicing the shipped one — so the guard now
       executes the real helper, and this case is what the stub was hiding. */
    const rows = [row({ cardId: 'a', mcNumber: 'MC-10' }), row({ cardId: 'b', mcNumber: 'MC-9' }), row({ cardId: 'c', mcNumber: 'MC-655.3' })];
    expect(sortBy('mc', rows).map((r) => (r as { cardId: string }).cardId)).toEqual(['b', 'a', 'c']);
    // a row with no MC number is empty, and empty still sorts last
    expect(sortBy('mc', [row({ cardId: 'x' }), row({ cardId: 'y', mcNumber: 'MC-1' })]).map((r) => (r as { cardId: string }).cardId)).toEqual(['y', 'x']);
  });
});

/* ---------------------------------------------------------------------- */
/* F — "None" is a value (owl #63, closing R-pf-i)                          */
/* ---------------------------------------------------------------------- */

const facet = (rows: unknown[], key: string, sel: Record<string, (string | null)[]> = recipe.PIPE_FILTERS_EMPTY()) =>
  recipe.pipeFacetList(rows, sel).find((f) => f.key === key)!;

describe('absence is selectable on the three axes that can lack a value', () => {
  it('offers None on TYPE, DIFFICULTY and REQUESTOR, and never on URGENCY or STATUS', () => {
    /* every card sits in a list and `Non-Urgent` is a value rather than an
       absence, so those two axes have no residue to collect */
    const rows = [row({ cardId: 'a' }), row({ cardId: 'b', assetType: 'Icon', difficulty: 'Hard', requestor: 'Ana', currentList: 'Design' })];
    const labels = (k: string) => facet(rows, k).values.map((v) => v.label);
    expect(labels('type')).toContain('None');
    expect(labels('difficulty')).toContain('None');
    expect(labels('requestor')).toContain('None');
    expect(labels('urgency')).not.toContain('None');
    expect(labels('status')).not.toContain('None');
  });

  it('DERIVES None like every other value — a complete board never shows it', () => {
    /* the axes are built from what the board carries, so None is not a fixed
       sixth checkbox that sits there reading zero */
    const rows = [row({ cardId: 'a', assetType: 'Icon' }), row({ cardId: 'b', assetType: 'UI' })];
    expect(facet(rows, 'type').values.map((v) => v.label)).toEqual(['Icon', 'UI']);
  });

  it('selects exactly the rows with no value there', () => {
    const rows = [
      row({ cardId: 'a', difficulty: 'Hard' }),
      row({ cardId: 'b' }),
      row({ cardId: 'c', difficulty: '' }), // empty string is absence too
    ];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), difficulty: [null] };
    const hit = rows.filter((r) => recipe.pipeMatches(r, sel, null)).map((r) => r.cardId);
    expect(hit).toEqual(['b', 'c']);
  });

  it('THE POINT — every row is now reachable, which is what R-pf-i said was broken', () => {
    /* before this, the rows carrying no type were the only rows no filter could
       select, and they are the incomplete rows most needing attention. Stated
       as a sum: on an axis that admits absence, the values account for the
       whole board. (URGENCY and STATUS are NOT asserted to reconcile — owl #63
       retracted that, and on a real board they do not.) */
    const rows = [
      row({ cardId: 'a', assetType: 'Icon' }),
      row({ cardId: 'b', assetType: 'UI' }),
      row({ cardId: 'c' }),
      row({ cardId: 'd' }),
    ];
    for (const key of ['type', 'difficulty', 'requestor']) {
      const total = facet(rows, key).values.reduce((n, v) => n + v.count, 0);
      expect(total).toBe(rows.length);
    }
  });

  it('stores None as null, so a board value that IS the word stays separate', () => {
    /* a Trello label or a sheet requestor could legitimately be called None;
       merging the two into one checkbox would silently mis-count both */
    const rows = [
      row({ cardId: 'a', requestor: 'None' }),
      row({ cardId: 'b' }),
    ];
    const values = facet(rows, 'requestor').values;
    expect(values.map((v) => v.label)).toEqual(['None', 'None']);
    expect(values.map((v) => v.value)).toEqual(['None', null]);
    expect(values.map((v) => v.count)).toEqual([1, 1]);

    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), requestor: ['None'] };
    expect(rows.filter((r) => recipe.pipeMatches(r, sel, null)).map((r) => r.cardId)).toEqual(['a']);
  });

  it('sorts None LAST, in both the ordered and the alphabetical axes', () => {
    /* it is the residue: alphabetically None would land mid-list and push the
       real vocabulary down, and it has no place in Easy/Medium/Hard at all */
    const rows = [
      row({ cardId: 'a', difficulty: 'Hard', assetType: 'Zeppelin' }),
      row({ cardId: 'b', difficulty: 'Easy', assetType: 'Animation' }),
      row({ cardId: 'c' }),
    ];
    expect(facet(rows, 'difficulty').values.map((v) => v.label)).toEqual(['Easy', 'Hard', 'None']);
    expect(facet(rows, 'type').values.map((v) => v.label)).toEqual(['Animation', 'Zeppelin', 'None']);
  });

  it('still ignores its own axis when None is the selection', () => {
    /* R-pf-c has to hold for None as well, or picking it would strip every
       sibling value to zero and there would be no way back without clearing */
    const rows = [row({ cardId: 'a' }), row({ cardId: 'b', assetType: 'Icon' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: [null] };
    expect(facet(rows, 'type', sel).values.map((v) => [v.label, v.count])).toEqual([['Icon', 1], ['None', 1]]);
  });

  it('draws the label and toggles the value — they differ for exactly this item', () => {
    expect(TEMPLATE).toContain('<span class="pmval">{{v.label}}</span>');
    expect(TEMPLATE).toContain("on-click=\"['togglePipeFilter', f.key, v.value]\"");
  });
});

/* ---------------------------------------------------------------------- */
/* G — the two buttons differ on purpose                                    */
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
/* H — panel behaviour that IS provable without a browser                   */
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
    /* the axis carries the flag; the template no longer names STATUS, so a
       sixth open-ended axis is one entry in the table rather than three edits */
    expect(TEMPLATE).toContain('{{#if f.scroll}}pmscroll{{/if}}');
    const scrolling = recipe.pipeFacetList([], recipe.PIPE_FILTERS_EMPTY()).filter((f) => f.scroll);
    expect(scrolling.map((f) => f.key)).toEqual(['status']);
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
