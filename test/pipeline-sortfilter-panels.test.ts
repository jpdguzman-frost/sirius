/**
 * Pipeline PANELS — the sort and filter menus: opening, anchoring, the
 * frame's own geometry, the search field, the default order's index, the
 * still-filtering value, and overlay behaviour. Split 2026-09-05 out of
 * test/pipeline-sortfilter.test.ts (sections F2 and H); the shared prelude —
 * recipe harness and row fixture — is test/helpers/pipeline-sortfilter.ts.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  PIPELINE_CSS,
  TEMPLATE,
  cssRule,
  decl,
  fnBody,
  handlerBody,
  method,
} from './helpers/gantt-render.ts';
import { type Sort, facet, recipe, row } from './helpers/pipeline-sortfilter.ts';

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
    /* block 5 swapped the Requests select's `reqMenu` for that table's own
       two panels — the same door, twice as many overlays through it. */
    for (const key of ['pipeSortMenu', 'pipeFilterMenu', 'reqSortMenu', 'reqFilterMenu', 'duePopover', 'urgencyMenu', 'diffMenu']) {
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
    // 2026-09-08: showWarnPop left with the §4.4 withdrawal (owl #81); the due
    // popover is the surviving caller of the shared posKey placement.
    expect(handlerBody('openDuePopover')).toContain('posKey');
  });
});

describe('the panels sit on the frame’s own geometry (JP, 2026-08-21)', () => {
  it('lands the item content FLUSH with its group heading', () => {
    /* Measured off nodes 592:56913 (sort) and 593:78434 (filter): the heading
       text sits 24px inside the group, and the item's content 16px inside an
       item box that is itself 8px inside the panel — so both land on the same
       left edge. At 8px the rows hung 8px left of every heading above them. */
    const head = cssRule('.pipemenu .pmhead', PIPELINE_CSS);
    const items = cssRule('.pipemenu .pmitems', PIPELINE_CSS);
    expect(head).toContain('padding: 2px var(--space-16) var(--space-8)');
    expect(items).toContain('padding: 0 var(--space-8) var(--space-8)');
    /* THE PROPERTY: the checkbox and the heading share a left edge. The heading
       is inset once, by its own padding; the checkbox twice, by the list's and
       the row's. JP revised both on 2026-08-21 so the two sums agree at 16 —
       17px from the panel edge once the border is counted. */
    const px = (v: string) => ({ '--space-8': 8, '--space-16': 16, '--space-24': 24 })[v]!;
    expect(px('--space-8') + px('--space-8'), 'the item content left the heading’s edge').toBe(px('--space-16'));
  });

  it('renders BOTH panels’ group headings in capitals, as the frame draws them', () => {
    /* the filter axes spell their labels in capitals in the data; the sort
       groups are spelt in title case (`Dates`, `Identity`), which is what the
       comparator table wants to be read as — so the case is applied at
       display, once, and the sort panel stops disagreeing with the filter
       panel beside it */
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
       row). The SIDES are 16 right / 8 left — with the list's own 8, that lands
       the checkbox on 17px, level with the heading above it. Deliberately not
       symmetric: aligning the checkbox to the heading and evening the two
       insets cannot both hold with these two rules. */
    expect(cssRule('.pipemenu .pmitem', PIPELINE_CSS)).toContain('padding: 6px var(--space-16) 5px var(--space-8)');
  });

  it('wears the CARD-ISSUE popover’s shadow, not the light chrome one', () => {
    /* The panels float over a dense table; the 1px stroke alone did not lift
       them off it. Same reasoning that gave the card-issue popover the heavier
       value in owl #53 — and the two must not drift apart again. */
    expect(cssRule('.pipemenu', PIPELINE_CSS)).toContain('box-shadow: var(--shadow-card)');
  });
});

describe('the search field keeps its own recipe', () => {
  it('declares the SHARED .searchbar base — every tab with a field wears it', () => {
    /* THE DEFECT: owl #62 wrapped the field in `.pipetools` and deleted this
       block in the same hunk. Without `display: flex` the icon and the input
       stacked vertically on every tab that had a search field, and the two
       per-tab classes that were supposed to modify this rule matched nothing
       at all — they were dropped in the block-five simplification. */
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
    // read on STATUS, a main-row axis: the rows carry their own values, so the
    // fixture needs no work cards to put an axis on the panel and then empty it
    const rows = [row({ cardId: 'a', currentList: 'Design' }), row({ cardId: 'b', currentList: 'Backlogs: Icon' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] }; // matches nothing
    const status = recipe.pipeFacetList(rows, sel).find((f) => f.key === 'status');
    expect(status, 'an axis with nothing left to offer is dropped whole').toBeUndefined();
  });

  it('KEEPS a ticked value that has fallen to zero — the only way back off it', () => {
    /* the case that makes this not a bare `count > 0`: a value already applied
       can fall to zero as other axes narrow, and hiding it would strand the
       reader with a filter they can neither see nor un-tick */
    const rows = [row({ cardId: 'a', assetType: 'UI', currentList: 'Design' })];
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

  it('groups the sort panel as Dates, Priority, Identity — derived from the sort array, in its order', () => {
    /* the panel's headings come from the `PIPE_SORT_GROUPS` computed, which
       walks PIPE_SORTS and opens a group at every change of `group`. Executed
       out of the shipped scripts; the items are asserted to be the sorts
       themselves, flattened back, so a group cannot hold a sort the array
       does not, and the Priority group sits where the frame draws it. */
    const groups = new Function(`
      ${decl(APP_JS, 'PIPE_SORTS')}
      const computed = { ${method('PIPE_SORT_GROUPS')} };
      return computed.PIPE_SORT_GROUPS.call({ get: () => undefined });
    `)() as Array<{ group: string; items: Sort[] }>;
    expect(groups.map((g) => g.group)).toEqual(['Dates', 'Priority', 'Identity']);
    expect(groups.flatMap((g) => g.items.map((s) => s.key))).toEqual(recipe.PIPE_SORTS.map((s) => s.key));
    expect(groups.map((g) => g.items.length)).toEqual([4, 2, 4]);
  });

  it('resets both on project switch, like the planner’s expansion state', () => {
    /* `resetForProjectSwitch` is a `function`, not a sliceable `const`, so read
       its BODY — the same reason fnBody exists beside decl. A Type or a Status
       carried into another project names values that project may not have,
       which would silently show an empty table (R-exp-f's reasoning). */
    const reset = fnBody('resetForProjectSwitch');
    expect(reset).toContain('pipeSort');
    expect(reset).toContain('pipeFilters');
  });
});
