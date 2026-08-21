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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_JS, APP_JS_CODE, PIPELINE_CSS, TEMPLATE, cssRule, decl, fnBody, method } from './helpers/gantt-render.ts';

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
  ${decl(APP_JS, 'pipeValueLabel')}
  ${decl(APP_JS, 'PIPE_FILTERS_EMPTY')}
  ${decl(APP_JS, 'pipeMatches')}
  ${decl(APP_JS, 'pipeFacetList')}
  ${decl(APP_JS, 'pipeChipList')}
  ${decl(APP_JS, 'pipeSortLabel')}
  ${decl(APP_JS, 'mcRank')}
  return { pipeChipList, PIPE_SORTS, PIPE_SORT_DEFAULT, pipeSortRows, PIPE_FILTERS, PIPE_FILTERS_EMPTY, pipeMatches, pipeFacetList, pipeSortLabel };
`)() as {
  PIPE_SORTS: Sort[];
  PIPE_SORT_DEFAULT: Sort;
  pipeSortRows: (rows: unknown[], s: Sort) => unknown[];
  PIPE_FILTERS: Axis[];
  PIPE_FILTERS_EMPTY: () => Record<string, (string | null)[]>;
  pipeMatches: (r: unknown, sel: Record<string, (string | null)[]>, except: string | null) => boolean;
  pipeFacetList: (rows: unknown[], sel: Record<string, (string | null)[]>) => Facet[];
  pipeChipList: (sel: Record<string, (string | null)[]>) => Array<{ key: string; label: string; text: string; on: boolean }>;
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
    expect(recipe.PIPE_FILTERS.map((f) => f.label)).toEqual(['Type', 'Difficulty', 'Urgency', 'Status', 'Requestor']);
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
    // one partial serves both panels now — the row is written once
    expect(TEMPLATE).toContain("on-click=\"['togglePipeFilter', key, v.value]\"");
  });
});

/* ---------------------------------------------------------------------- */
/* F2 — the review pass, 2026-08-21: three defects the suite had not seen    */
/* ---------------------------------------------------------------------- */

describe('the panels can actually open, and stay open', () => {
  it('SHIELDS both triggers and the panel from the outside-click dismisser', () => {
    /* THE DEFECT: `pipeSortMenu`/`pipeFilterMenu` joined OVERLAY_KEYS but not
       the dismisser's hand-written selector string. Ractive's own click handler
       runs first, so by the time the document listener fired an overlay WAS
       open, nothing in the ignore list matched, and closeMenus() shut it again
       in the same event — neither panel could appear at all. Every checkbox
       click closed it too, against the explicit "the panel STAYS OPEN" rule. */
    const shields = decl(APP_JS, 'OVERLAY_SHIELDS');
    const keys = decl(APP_JS, 'OVERLAY_KEYS');
    for (const key of ['pipeSortMenu', 'pipeFilterMenu', 'warnPop', 'reqMenu', 'duePopover', 'urgencyMenu', 'diffMenu']) {
      expect(keys, `${key} is an overlay`).toContain(key);
      expect(shields, `${key} has no shield — its own click would dismiss it`).toContain(`${key}:`);
    }
    expect(shields).toContain('.sfbtn');
    expect(shields).toContain('.pipemenu');
  });

  it('derives the ignore list FROM that map, so the two cannot drift again', () => {
    // the whole failure was two lists that had to agree by hand
    expect(APP_JS).toContain('const OVERLAY_SHIELD = ');
    expect(fnBody('anyMenuOpen')).toContain('OVERLAY_KEYS');
    expect(APP_JS).toContain('e.target.closest(OVERLAY_SHIELD)');
  });

  it('does not let a scroll inside the STATUS group dismiss the panel', () => {
    /* the group is a deliberate internal scroller, so a wheel over it reached
       the capture-phase dismisser and shut the panel — the exact failure the
       due popover and the Requests select are already shielded from */
    expect(decl(APP_JS, 'OVERLAY_SELF_SCROLL')).toContain('.pipemenu');
    expect(cssRule('.pipemenu .pmscroll', PIPELINE_CSS)).toContain('overflow-y: auto');
  });
});

describe('the panels are ANCHORED to their trigger, never measured (JP, 2026-08-21)', () => {
  it('hangs BOTH panels off the container, not off either button', () => {
    /* THE RULE: one opening position, whichever button was pressed. Anchored to
       its own trigger instead, the filter panel travels up to 196px sideways —
       the sort button grows from 38px to as much as 240px when it names its
       selection, and drags the filter button along with it. Measured live
       before the change: the filter panel sat 4px from the window edge with no
       sort applied and 72px with one. A per-button wrapper is what would
       reintroduce that, so its absence is the assertion. */
    expect(TEMPLATE).not.toContain('sfwrap');
    const row = TEMPLATE.slice(TEMPLATE.indexOf('class="sortfilter"'));
    const rowEnd = row.indexOf('pscrollwrap');
    const inside = row.slice(0, rowEnd);
    expect(inside, 'the filter panel left the container').toContain('pipemenu filtermenu');
    expect(inside, 'the sort panel left the container').toContain('pipemenu sortmenu');
  });

  it('positions in CSS off the row whose right edge cannot move', () => {
    /* `.sortfilter` ends at the page inset, so `right: 0` on it is a fixed
       point — which is the whole reason this anchor was chosen over the two
       that were built first */
    /* `.pipemenu` is the SURFACE only — three panels wear it and they do not
       hang off the same thing, so each anchor is named by its own container. */
    expect(cssRule('.pipemenu', PIPELINE_CSS)).toContain('position: absolute');
    expect(cssRule('.sortfilter .pipemenu', PIPELINE_CSS)).toContain('right: 0');
    expect(cssRule('.sortfilter .pipemenu', PIPELINE_CSS)).toContain('top: 100%');
    expect(cssRule('.sortfilter', PIPELINE_CSS)).toContain('position: relative');
  });

  it('carries NO inline coordinates and asks for no placement', () => {
    // the whole point: nothing computes a left or a top for these two
    expect(TEMPLATE).not.toContain('pipeSortMenuPos');
    expect(TEMPLATE).not.toContain('pipeFilterMenuPos');
    expect(APP_JS).not.toContain('pipeSortMenuPos');
    expect(APP_JS).not.toContain('PIPE_FILTER_H');
    // the handlers are object methods, not top-level functions — read the
    // shipped call itself
    expect(APP_JS).toContain("openOverlay(ctx, 'filter', { key: 'pipeFilterMenu' })");
    expect(APP_JS).toContain("openOverlay(ctx, 'sort', { key: 'pipeSortMenu' })");
  });

  it('keeps placement OPTIONAL in the shared opener, not deleted from it', () => {
    /* the three overlays that float free of any wrapper still measure — the
       door stays one door, and `posKey` is what says "this one needs coords" */
    const opener = fnBody('openOverlay');
    expect(opener).toContain('opts.posKey');
    expect(opener).toContain('placeBox(');
    expect(fnBody('showWarnPop')).toContain('posKey');
  });
});

describe('the panels sit on the frame’s own geometry (JP, 2026-08-21)', () => {
  it('lands the item content FLUSH with its group heading', () => {
    /* Measured off nodes 592:56913 (sort) and 593:78434 (filter): the heading
       text sits 24px inside the group, and the item's content 16px inside an
       item box that is itself 8px inside the panel — so both land on the same
       left edge. At 8px the rows hung 8px left of every heading above them. */
    const head = cssRule('.pipemenu .pmhead', PIPELINE_CSS);
    const item = cssRule('.pipemenu .pmitem', PIPELINE_CSS);
    const items = cssRule('.pipemenu .pmitems', PIPELINE_CSS);
    expect(head).toContain('var(--space-24)');
    expect(items).toContain('padding: 0 var(--space-8) var(--space-8)');
    expect(item).toContain('var(--space-16)');
    // heading text = items-box 8 + heading 24 - the box's own 8 … both = 24
    // inside the group, which is the property this pins in one line
    const px = (v: string) => ({ '--space-8': 8, '--space-16': 16, '--space-24': 24 })[v]!;
    const headInset = px('--space-24');
    const itemInset = px('--space-8') + px('--space-16');
    expect(itemInset, 'the item content left the heading’s edge').toBe(headInset);
  });

  it('renders BOTH panels’ group headings in capitals, as the frame draws them', () => {
    /* the filter axes spell their labels in capitals in the data; the sort
       groups are `Dates`/`Priority`/`Identity`, which is what the comparator
       table wants to be read as — so the case is applied at display, once, and
       the sort panel stops disagreeing with the filter panel beside it */
    expect(cssRule('.pipemenu .pmhead', PIPELINE_CSS)).toContain('text-transform: uppercase');
    expect(recipe.PIPE_SORTS.map((s) => s.group)).toContain('Dates');
  });

  it('draws the SELECTED sort as a filled pill, not as bold text', () => {
    /* node 592:56954, the item's `State` variant `Selected`: slate-900 ground,
       white label, 6px radius — and the weight stays Regular. Bold is the
       obvious way to mark a choice and it is not what the frame does. */
    const on = cssRule('.sortmenu .pmitem.on', PIPELINE_CSS);
    expect(on).toContain('background: var(--slate-900)');
    expect(on).toContain('color: var(--white)');
    expect(on).toContain('border-radius: var(--radius-input)');
    expect(on).not.toContain('font-weight');
  });

  it('colours Clear by the button’s two variants — blue live, slate disabled', () => {
    /* Button-Small carries a `Color` variant: `Blue` #1d4ed8 while there is a
       sort to clear, `Disabled` #94a3b8 when there is not. It read slate in
       both states before. */
    /* de-scoped from `.pipemenu`: the chip row's Clear all wears the same
       recipe rather than a copy of it */
    expect(cssRule('.pmclear', PIPELINE_CSS)).toContain('color: var(--blue-700)');
    expect(cssRule('.pmclear[disabled]', PIPELINE_CSS)).toContain('color: var(--slate-400)');
    expect(TEMPLATE).toContain('class="pmclear fclearall"');
  });

  it('TICKS the checked box instead of just filling it', () => {
    /* the checked box was a plain dark square. The Checkbox component fills the
       box AND shows a white check inside it — without the tick the two states
       differ only by colour, which reads as a swatch rather than a checkbox. */
    const box = cssRule('.pipemenu .pmbox', PIPELINE_CSS);
    expect(box).toContain('border-radius: var(--radius-sm)'); // 4px, was 2
    expect(box).toContain('position: relative');
    const tick = cssRule('.pipemenu .pmitem.on .pmbox::after', PIPELINE_CSS);
    expect(tick).toContain('border-left: 2px solid var(--white)');
    expect(tick).toContain('rotate(-45deg)');
  });

  it('does NOT bold a checked filter value — the box is the whole signal', () => {
    /* checked and unchecked labels are identical in the frame: 14px, weight
       400, slate-900, and the row keeps its `Default` variant. Bolding is the
       intuitive move and it is not what the component does. */
    expect(PIPELINE_CSS).not.toContain('.filtermenu .pmitem.on { font-weight');
  });

  it('wraps a sort label at 160px, where a filter value ellipsises', () => {
    /* what makes `Due dates closest to now` the two-line 53px row the frame
       draws rather than a one-line 32px one */
    /* the cap earns its keep only in the sort panel, where it drives the wrap.
       On a filter value it truncated long Trello list names with empty space
       still to their right, so JP had it removed there. */
    expect(cssRule('.pipemenu .pmwrap', PIPELINE_CSS)).toContain('max-width: 160px');
    expect(cssRule('.pipemenu .pmval', PIPELINE_CSS)).toContain('text-overflow: ellipsis');
    expect(cssRule('.pipemenu .pmval', PIPELINE_CSS)).not.toContain('max-width');
    expect(TEMPLATE).toContain('<span class="pmwrap">{{it.label}}</span>');
  });

  it('spaces the groups and the footer the way the frame measures them', () => {
    /* 18px from the separator to the next heading (Content's 16px gap plus the
       group's own 2px), and 16px from the last row to the footer rule (the item
       list's 8px plus the content-to-button 8px). Both ran 8px short. */
    expect(cssRule('.pipemenu .pmitems + .pmhead', PIPELINE_CSS)).toContain('padding-top: 18px');
    /* the gap before the footer belongs to the SORT panel alone: its dropdown's
       auto-layout carries `spacing: 8` and the filter's carries `spacing: 0`.
       One shared component, two different numbers. */
    expect(cssRule('.sortmenu .pmfoot', PIPELINE_CSS)).toContain('margin-top: var(--space-8)');
    expect(cssRule('.pipemenu .pmfoot', PIPELINE_CSS)).not.toContain('margin-top');
    /* 6 above the text and 5 below is the frame's vertical asymmetry (a 32px
       row). The SIDES are symmetric at 16px and the frame's are not — JP ruled
       against the lopsided version, which stranded the count in a gap at the
       right edge; at 16/16 the content sits 25px inside both edges, level with
       the group heading. */
    expect(cssRule('.pipemenu .pmitem', PIPELINE_CSS)).toContain('padding: 6px var(--space-16) 5px var(--space-16)');
  });

  it('wears the CARD-ISSUE popover’s shadow, not the light chrome one', () => {
    /* The panels float over a dense table; the 1px stroke alone did not lift
       them off it. Same reasoning that gave the card-issue popover the heavier
       value in owl #53 — and the two must not drift apart again. */
    expect(cssRule('.pipemenu', PIPELINE_CSS)).toContain('box-shadow: var(--shadow-card)');
    expect(cssRule('.warnpop', PIPELINE_CSS)).toContain('box-shadow: var(--shadow-card)');
  });
});

describe('the search field keeps its own recipe', () => {
  it('declares the SHARED .searchbar base — three tabs wear it', () => {
    /* THE DEFECT: owl #62 wrapped the field in `.pipetools` and deleted this
       block in the same hunk. Without `display: flex` the icon and the input
       stacked vertically on Pipeline, Requests AND Deadlines, and the two
       modifier rules (`.reqsearch`, `.dlsearch`) were left modifying nothing. */
    const base = cssRule('.searchbar', PIPELINE_CSS);
    expect(base).toContain('display: flex');
    expect(base).toContain('align-items: center');
    expect(base).toContain('gap: var(--space-8)');
    expect(base).toContain('border-bottom');
  });
});

describe('the default order’s index survives the next syncIndexes', () => {
  it('is DECLARED ON THE SCHEMA, not only created by migration 008', () => {
    /* THE DEFECT: 008 created `project_filed_desc` with a raw createIndex while
       every other index in the codebase is declared on the schema and applied
       through `Model.syncIndexes()` — which DROPS anything it does not find
       there. It worked on a fresh run and would have been removed silently by
       the next migration that followed the established pattern. The name is
       matched so syncIndexes adopts the existing index instead of rebuilding
       it. */
    const models = readFileSync(new URL('../src/models/index.ts', import.meta.url), 'utf8');
    const mig = readFileSync(new URL('../scripts/migrate/migrations.ts', import.meta.url), 'utf8');
    expect(mig).toContain("name: 'project_filed_desc'");
    expect(models).toContain('trello_created_at: -1');
    expect(models).toContain("name: 'project_filed_desc'");
  });
});

describe('a picked filter value never disappears while it is still filtering', () => {
  it('keeps its checkbox at zero when a search eliminates every row carrying it', () => {
    /* seeded only from the searched rows, the value vanished from the panel:
       an empty table, a Filter button still reading "1 applied", and no way to
       un-pick it short of Clear */
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] };
    const values = facet([row({ cardId: 'a', assetType: 'UI' })], 'type', sel).values;
    const icon = values.find((v) => v.label === 'Icon');
    expect(icon, 'the picked value left the panel').toBeTruthy();
    expect([icon!.count, icon!.on]).toEqual([0, true]);
  });
});

/* ---------------------------------------------------------------------- */
/* F3 — the filter indicator (node 593:79380)                               */
/* ---------------------------------------------------------------------- */

describe('the filter indicator says what is filtered, in words', () => {
  const chips = (sel: Record<string, (string | null)[]>) =>
    recipe.pipeChipList({ ...recipe.PIPE_FILTERS_EMPTY(), ...sel });

  it('makes ONE CHIP PER AXIS, listing that axis’s values', () => {
    /* not one chip per value: the frame's `Number` variant counts the values
       INSIDE a chip, and its `2` variant is a single chip listing two of them
       under one axis name and one ✕ (node 566:52332). */
    expect(chips({ type: ['Icon', 'Asset'] })).toEqual([
      { key: 'type', label: 'Type', text: 'Icon, Asset', on: true },
    ]);
  });

  it('names the axis from the panel’s own heading, not a second list', () => {
    /* every axis label is one word, so the chip name is derived — a sixth axis
       needs no entry anywhere for its chip to read correctly */
    expect(chips({ difficulty: ['Hard'] })[0]!.label).toBe('Difficulty');
    expect(chips({ requestor: ['ana@frostdesigngroup.com'] })[0]!.label).toBe('Requestor');
    expect(recipe.PIPE_FILTERS.map((f) => f.label)).toContain('Difficulty');
  });

  it('shows the absence value as the word the panel draws it with', () => {
    expect(chips({ requestor: [null] })[0]!.text).toBe('None');
  });

  it('shows a chip for EVERY filtered axis, and none for the rest', () => {
    const out = chips({ type: ['Icon'], urgency: ['Urgent'], status: [] });
    expect(out.map((c) => c.key)).toEqual(['type', 'urgency']);
    expect(chips({})).toEqual([]);
  });

  it('renders nothing at all when nothing is filtered', () => {
    expect(TEMPLATE).toContain('{{#if pipeChips.length}}');
  });

  it('WRAPS the row rather than collapsing or scrolling it (JP)', () => {
    /* the frame only ever draws one chip; five axes can be filtered at once,
       and wrapping is what keeps each one separately removable */
    expect(cssRule('.fchips', PIPELINE_CSS)).toContain('flex-wrap: wrap');
  });

  it('TRIMS a long value instead of letting one chip take the row', () => {
    /* a real status value such as `Render: Ready for Client Review` would
       otherwise push every other chip onto its own line */
    const vals = cssRule('.fchip .fcvals', PIPELINE_CSS);
    expect(vals).toContain('max-width');
    expect(vals).toContain('text-overflow: ellipsis');
    expect(TEMPLATE).toContain('title="{{c.text}}"'); // the full text stays reachable
  });

  it('costs a walk of the SELECTION only, until a panel is actually open', () => {
    /* `pipeChips` is always live — the row's `{{#if}}` binds it — so reading
       `pipeFacets` unconditionally put the whole facet recount back on the
       search-keystroke path, even with no filter applied and no panel open.
       Values are joined on for the ONE open chip and no other. */
    const body = method('pipeChips');
    expect(body).toContain("this.get('pipeFilters')");
    expect(body).toContain("this.get('chipPop')");
    expect(body.indexOf("this.get('chipPop')")).toBeLessThan(body.indexOf("this.get('pipeFacets')"));
    expect(body).toMatch(/if \(!open\) return chips;/);
  });

  it('INVERTS the chip on hover, keeping the quiet/loud contrast', () => {
    /* JP, 2026-08-21. The axis stays the dimmer half against the dark ground
       and the values stay the bright one — flattening both to white would turn
       the chip into a block of text instead of a sentence. */
    expect(cssRule('.fchip:hover', PIPELINE_CSS)).toContain('background: var(--slate-900)');
    expect(cssRule('.fchip:hover .fcvals', PIPELINE_CSS)).toContain('var(--white)');
    expect(cssRule('.fchip:hover .fcaxis', PIPELINE_CSS)).toContain('var(--slate-400)');
  });

  it('keeps the row COMPACT — no margin of its own', () => {
    expect(cssRule('.fchips', PIPELINE_CSS)).not.toContain('margin');
  });

  it('opens the chip’s OWN group on hover, cut down as the frame sets it', () => {
    /* node 593:80073 is the same dropdown component with the footer button and
       the scrollbar switched OFF and the box clipped to one group — so the
       panel wears `.pipemenu` for its chrome and renders a single heading and
       one item list, with no `.pmfoot`. */
    const view = TEMPLATE.slice(TEMPLATE.indexOf('class="fchips"'));
    const chip = view.slice(0, view.indexOf('fclearall'));
    expect(chip).toContain('{{#if chipPop === c.key}}');
    expect(chip).toContain('class="pipemenu chipmenu"');
    expect(chip).not.toContain('pmfoot');
    // it anchors LEFT, to the chip — the shared rule anchors right, to the row
    /* two classes, because `.pipemenu` anchors right and is declared later —
       a single-class rule lost the cascade and only looked right because a box
       with left, right and width is over-constrained. `-1px` because `left`
       resolves against the chip's padding box, inside its 1px border. */
    expect(cssRule('.fchip .pipemenu', PIPELINE_CSS)).toContain('left: -1px');
    expect(cssRule('.fchip', PIPELINE_CSS)).toContain('position: relative');
  });

  it('lets the pointer REACH the panel — a bridge and a shared close delay', () => {
    /* the panel sits 4px clear of the chip, so without a bridge the pointer
       crosses dead space, mouseleave fires, and the close can run out before it
       arrives. The panel is also a DOM child of the chip, which is what makes
       the containment guard cover the whole journey. */
    // one bridge recipe, shared with the warning card's, in the gap's own token
    expect(cssRule('.warnpop::before, .chipmenu::before', PIPELINE_CSS)).toContain('height: var(--space-4)');
    const at = APP_JS.indexOf('chipPopOut(ctx)');
    const body = APP_JS.slice(at, at + 420);
    expect(body).toContain('relatedTarget');
    expect(body).toContain('ctx.node.contains(to)');
    expect(body).toContain('scheduleHoverClose(');
    expect(body.indexOf('relatedTarget')).toBeLessThan(body.indexOf('scheduleHoverClose('));
  });

  it('joins the overlay list, so Escape and an outside click dismiss it', () => {
    const keys = decl(APP_JS, 'OVERLAY_KEYS');
    const shields = decl(APP_JS, 'OVERLAY_SHIELDS');
    expect(keys).toContain('chipPop');
    expect(shields, 'chipPop has no shield — its own hover would dismiss it').toContain('chipPop:');
    expect(shields).toContain('.fchip');
  });

  it('REFUSES to open over another overlay, and is not a toggle on re-entry', () => {
    /* a chip merely grazed while the Filter panel is up must not replace it
       (R-warn-r's rule, from the other side), and re-entering the same chip is
       not a second click */
    /* both rules now live in ONE hover-open policy, and the cancel deliberately
       comes AFTER the refusal — cancelling first cancels somebody else's pending
       close and never reschedules it, stranding their overlay open. */
    const policy = fnBody('openHoverOverlay');
    expect(policy).toContain('k !== key && app.get(k)');
    expect(policy).toContain('app.get(key) === id');
    expect(policy.indexOf('app.get(k)')).toBeLessThan(policy.indexOf('warnPopCancelClose()'));
    expect(APP_JS).toContain("openHoverOverlay('chipPop', key)");
    expect(fnBody('showWarnPop')).toContain("openHoverOverlay('warnPop', cardId)");
  });

  it('ticks through the SAME handler the main panel uses', () => {
    // one way to change a filter, so the two panels cannot diverge
    // both panels render the same partial, so there is one row and one handler
    expect(TEMPLATE).toContain('{{>filterGroup f}}');
    expect(TEMPLATE).toContain('{{>filterGroup c}}');
  });

  it('shares ONE hover-close scheduler with the warning card', () => {
    // two timers is the shape that leaks: the older fires against state it was
    // never scheduled for
    expect([...APP_JS.matchAll(/warnCloseTimer\s*=\s*setTimeout\(/g)]).toHaveLength(1);
    expect(fnBody('scheduleHoverClose')).toContain('WARN_CLOSE_MS');
  });

  it('clears ONE AXIS from the ✕ and everything from Clear all', () => {
    /* the chip names an axis and lists its values, so its ✕ removes what it
       names; Clear all goes through the SAME handler the panel's own Clear
       uses, so there is one way to clear rather than two */
    // an object method, not a top-level function — read the shipped handler
    const at = APP_JS.indexOf('removePipeAxis(');
    expect(at, 'removePipeAxis is gone').toBeGreaterThan(-1);
    const body = APP_JS.slice(at, at + 200);
    expect(body).toContain('pipeFilters.${axis}');
    expect(body).toContain('[]');
    expect(body).toContain('pipeBackToTop()');
    expect(TEMPLATE).toContain("on-click=\"['clearPipeFilters']\">Clear all");
  });

  it('names the axis in each ✕’s accessible name', () => {
    // the icon carries no text, so this is the only route to which filter goes
    expect(TEMPLATE).toContain('aria-label="Remove the {{c.label}} filter"');
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

  it('HIDES a zero-count value rather than greying it (JP, 2026-08-21)', () => {
    /* It used to render disabled, which is what the frame asked for ("expose
       empty categories instead of hiding them") — and on a real board that
       filled STATUS with rows nobody could ever pick. Nothing is disabled now,
       because nothing unpickable is drawn. */
    expect(TEMPLATE).not.toContain('disabled="{{!v.count');
    const rows = [row({ cardId: 'a', difficulty: 'Easy' }), row({ cardId: 'b', difficulty: 'Hard' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] }; // matches nothing
    const diff = recipe.pipeFacetList(rows, sel).find((f) => f.key === 'difficulty');
    expect(diff, 'an axis with nothing left to offer is dropped whole').toBeUndefined();
  });

  it('KEEPS a ticked value that has fallen to zero — the only way back off it', () => {
    /* the case that makes this not a bare `count > 0`: a value already applied
       can fall to zero as other axes narrow, and hiding it would strand the
       reader with a filter they can neither see nor un-tick */
    const rows = [row({ cardId: 'a', assetType: 'UI', difficulty: 'Easy' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] };
    const type = recipe.pipeFacetList(rows, sel).find((f) => f.key === 'type')!;
    const icon = type.values.find((v) => v.label === 'Icon');
    expect(icon, 'the ticked value vanished').toBeTruthy();
    expect([icon!.count, icon!.on]).toEqual([0, true]);
  });

  it('keeps group headings out of the tab order — they are labels, not options', () => {
    const heads = [...TEMPLATE.matchAll(/<p class="pmhead"[^>]*>/g)].map((m) => m[0]);
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h).toContain('aria-hidden="true"');
  });

  it('scrolls STATUS inside its own group, not the whole panel', () => {
    /* the axis carries the flag; the template no longer names STATUS, so a
       sixth open-ended axis is one entry in the table rather than three edits */
    expect(TEMPLATE).toContain('{{#if scroll}}pmscroll{{/if}}');
    // rows, not an empty board: an axis with nothing to offer is dropped now
    const rows = [row({ currentList: 'Sketch: With Revision', assetType: 'Icon' })];
    const scrolling = recipe.pipeFacetList(rows, recipe.PIPE_FILTERS_EMPTY()).filter((f) => f.scroll);
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
