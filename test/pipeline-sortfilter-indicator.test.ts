/**
 * Pipeline FILTER INDICATOR — the chips row that says what is filtered in
 * words, the two buttons that differ on purpose, and the one word per column
 * wherever it is spoken. Split 2026-09-05 out of
 * test/pipeline-sortfilter.test.ts (sections F3, G, H); the shared prelude —
 * recipe harness and fixtures — is test/helpers/pipeline-sortfilter.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  PIPELINE_CSS,
  TEMPLATE,
  cssRule,
  decl,
  fnBody,
  handlerBody,
  method,
  observerCalls,
  reqCols,
  tabView,
} from './helpers/gantt-render.ts';
import { type Axis, recipe, row, sel, toolbarComputeds } from './helpers/pipeline-sortfilter.ts';

/* the Pipeline view's chips row onward — two tabs now carry `.fchips` */
const pipeChipsView = () => { const v = tabView('pipeline'); return v.slice(v.indexOf('class="fchips"')); };

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
    /* every axis label is one word, so the chip name is derived — an axis
       restored by #78 §4 needs no entry anywhere for its chip to read
       correctly. Asserted as the DERIVATION rather than against two named
       axes, which is what survives the panel shrinking to two and growing
       back to four. */
    expect(chips({ status: ['Design'] })[0]!.label).toBe('Status');
    expect(chips({ type: ['Icon'] })[0]!.label).toBe('Type');
    for (const f of recipe.PIPE_FILTERS) {
      expect(f.label, f.key).toBe(recipe.PIPE_COLS.find((c) => c.cls === f.col)!.label);
    }
  });

  it('shows the absence value as the word the panel draws it with', () => {
    expect(chips({ type: [null] })[0]!.text).toBe('None');
  });

  it('shows a chip for EVERY filtered axis, and none for the rest', () => {
    expect(chips({ type: ['Icon'], status: [] }).map((c) => c.key)).toEqual(['type']);
    expect(chips({ type: ['Icon'], status: ['Design'] }).map((c) => c.key)).toEqual(['type', 'status']);
    expect(chips({})).toEqual([]);
  });

  it('renders nothing at all when nothing is filtered', () => {
    expect(TEMPLATE).toContain('{{#if pipeChips.length}}');
  });

  it('WRAPS the row rather than collapsing or scrolling it (JP)', () => {
    /* the frame only ever draws one chip; four axes can be filtered at once
       (block 4) and wrapping is what keeps each one separately removable */
    expect(cssRule('.fchips', PIPELINE_CSS)).toContain('flex-wrap: wrap');
  });

  it('names a WORK axis chip the way it names a main one — "Difficulty is Hard"', () => {
    // the chip derives from PIPE_FILTERS, so the restored axes need no entry;
    // asserted so a restore that forgot the label would show here, not in E2E
    expect(chips({ difficulty: ['Hard'] })).toEqual([{ key: 'difficulty', label: 'Difficulty', text: 'Hard', on: true }]);
    expect(chips({ urgency: ['Urgent'], type: ['Icon'] }).map((c) => c.key)).toEqual(['type', 'urgency']); // panel order, not tick order
    expect(chips({ difficulty: [null] })[0]!.text).toBe('None');
  });

  it('counts the axes in its prose the way the consts count them', () => {
    /* the template and the stylesheet both explain the wrap by saying how
       many axes can be filtered at once; the number is the axis table's, and
       "five" (owl #62's panel) survived block 1 unread. DERIVED from the
       table's length, not a ban on one word (2026-09-05 block 4 review,
       finding 10); both read RAW prose by design (test/CLAUDE.md rule 3). */
    expect(recipe.PIPE_FILTERS).toHaveLength(4);
    const word = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'][recipe.PIPE_FILTERS.length]!;
    expect(TEMPLATE).toContain(word + ' axes');
    expect(PIPELINE_CSS).toContain(word + ' axes');
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
    /* the PIPELINE view, not the first chips row in the composed template — views
       concatenate Requests before Pipeline, and Requests grew its own chips row
       in block 5 (owl #77 §1), so a bare slice would read the other tab. */
    const view = pipeChipsView();
    const chip = view.slice(0, view.indexOf('fclearall'));
    expect(chip).toContain('{{#if chipPop === c.key}}');
    expect(chip).toContain('class="pipemenu chipmenu {{#if chipPopFlip}}flip{{/if}}"');
    expect(chip).not.toContain('pmfoot');
    // it anchors LEFT, to the chip — the shared rule anchors right, to the row
    /* two classes, because `.pipemenu` anchors right and is declared later —
       a single-class rule lost the cascade and only looked right because a box
       with left, right and width is over-constrained. `-1px` because `left`
       resolves against the chip's padding box, inside its 1px border. */
    expect(cssRule('.fchip .pipemenu', PIPELINE_CSS)).toContain('left: -1px');
    expect(cssRule('.fchip', PIPELINE_CSS)).toContain('position: relative');
  });

  it('insets the chip panel 16px, and wins the cascade to do it', () => {
    /* One group and no footer, so the shared 20px reads as slack. Asserted on
       `.fchip .pipemenu` because a single-class `.chipmenu` override loses to
       the shared rules declared later in the file — that had already silently
       cost the list's zeroed bottom padding, under a comment claiming
       otherwise. Two classes cannot lose, whatever the order. */
    const rule = cssRule('.fchip .pipemenu', PIPELINE_CSS);
    expect(rule).toContain('padding-top: var(--space-16)');
    expect(rule).toContain('padding-bottom: var(--space-16)');
    expect(cssRule('.fchip .pipemenu .pmitems', PIPELINE_CSS)).toContain('padding-bottom: 0');
    // the shared panel keeps its own, larger inset
    expect(cssRule('.pipemenu', PIPELINE_CSS)).toContain('padding-top: 20px');
  });

  it('lets the pointer REACH the panel — a bridge and a shared close delay', () => {
    /* the panel sits 4px clear of the chip, so without a bridge the pointer
       crosses dead space, mouseleave fires, and the close can run out before it
       arrives. The panel is also a DOM child of the chip, which is what makes
       the containment guard cover the whole journey. */
    // one bridge recipe, shared with the warning card's, in the gap's own token
    expect(cssRule('.warnpop::before, .chipmenu::before', PIPELINE_CSS)).toContain('height: var(--space-4)');
    const body = handlerBody('chipPopOut');
    expect(body).toContain('relatedTarget');
    expect(body).toContain('ctx.node.contains(to)');
    expect(body).toContain('scheduleHoverClose(');
    expect(body.indexOf('relatedTarget')).toBeLessThan(body.indexOf('scheduleHoverClose('));
  });

  it('CLOSES ITSELF when the axis it names goes empty', () => {
    /* Clearing the last value unmounts the chip, but `chipPop` kept naming it —
       `anyMenuOpen()` then stayed true against a panel nobody could see, and
       every hover overlay refused to open until an unshielded click. Neither
       route out fires on its own: the ✕ and the panel are both inside
       OVERLAY_SHIELD. Stated once, as an observer, rather than in each handler
       that can empty an axis. */
    expect(APP_JS).toContain("app.observe('pipeFilters'");
    const at = APP_JS.indexOf("app.observe('pipeFilters'");
    const body = APP_JS.slice(at, at + 300);
    expect(body).toContain("app.get('chipPop')");
    expect(body).toContain("app.set('chipPop', null)");
  });

  it('does NOT let a page scroll dismiss an anchored panel', () => {
    /* An anchored panel moves WITH the page, so a scroll cannot detach it from
       its trigger — and dismissing anyway made its lower half unreachable on a
       short viewport, because the only way to reach it is to scroll. */
    const anchored = decl(APP_JS, 'OVERLAY_ANCHORED');
    for (const k of ['pipeSortMenu', 'pipeFilterMenu', 'chipPop']) expect(anchored).toContain(k);
    expect(APP_JS).toContain('OVERLAY_ANCHORED.indexOf(k) > -1');
  });

  it('FLIPS the chip panel rather than running it off the right edge', () => {
    /* the chips row wraps, so a chip can sit far enough right that a
       left-anchored 276px panel leaves the viewport — unreachable rows and a
       page scrollbar. The width is a constant, so the decision needs the chip's
       own box and nothing measured after render. */
    const body = handlerBody('chipPopIn');
    expect(body).toContain('PIPE_MENU_W');
    expect(body).toContain("app.set('chipPopFlip'");
    expect(cssRule('.fchip .pipemenu.flip', PIPELINE_CSS)).toContain('right: -1px');
  });

  it('opens on FOCUS as well as hover — the panel holds real controls', () => {
    // the warning card's own rule: a pointer-only overlay puts its contents out
    // of a keyboard user's reach
    const view = pipeChipsView(); // the Pipeline tab's own chips row (see above)
    expect(view).toContain("on-focusin=\"['chipPopIn', c.key]\"");
    expect(view).toContain("on-focusout=\"['chipPopOut']\"");
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

  it('carries the TABLE onto the open chip too, or its own panel cannot tick', () => {
    /* The partial dispatches on `table` (D10) and a chip is not a facet — the
       computed copies the facet's stamp across for the one chip whose panel is
       open. Miss it and the main panel ticks while the chip's panel throws on
       every click, which no markup assertion would show. */
    const h = toolbarComputeds();
    h.set('rows', [row({ cardId: 'a', assetType: 'Icon' }), row({ cardId: 'b', assetType: 'UI' })]);
    h.set('pipeFilters', sel({ type: ['Icon'] }));

    const closed = h.chips();
    expect(closed).toHaveLength(1);
    expect(closed[0]!.values, 'a closed chip pays for no recount').toBeUndefined();

    h.set('chipPop', 'type');
    const [open] = h.chips();
    expect(open!.values!.length, 'the open chip carries no values to draw').toBeGreaterThan(0);
    expect(open!.table).toBe('pipe');
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
    const body = handlerBody('removePipeAxis');
    expect(body).toContain('pipeFilters.${axis}');
    expect(body).toContain('[]');
    expect(TEMPLATE).toContain("on-click=\"['clearPipeFilters']\">Clear all");
  });

  it('returns the reader to the top on EVERY narrowing — filter, sort and search — from ONE observer (R-pf-h)', () => {
    /* I7 closed R-pf-h for search in block 4: the five filter and sort
       handlers each spelled `pipeBackToTop()`, and the search field — two-way
       bound, no handler — was the one narrowing that left the reader halfway
       down a list that was no longer the list. The simplify pass (PLAN.md
       B13) then lifted the rule to one altitude: an observer on the three
       keys owns it, so a handler cannot forget it and the project-switch
       reset gets it for free. Asserted as the RULE — which keys, what the
       body does, and that no handler still carries a private copy — never as
       a snapshot of the line. */
    const hit = observerCalls().find((o) => ['pipeFilters', 'pipeSort', 'searchQ'].every((k) => o.keys.includes(k)));
    expect(hit, 'no one observer on pipeFilters, pipeSort AND searchQ').toBeTruthy();
    expect(hit!.call).toContain('pipeBackToTop()');
    for (const h of ['pickPipeSort', 'clearPipeSort', 'togglePipeFilter', 'removePipeAxis', 'clearPipeFilters']) {
      expect(handlerBody(h), `${h} spells the rule on its own`).not.toContain('pipeBackToTop');
    }
  });

  it('returns the PAGE to the top — the page is the vertical scroller, the table box scrolls sideways', () => {
    /* 2026-09-05 block 4 review, finding 3: `.pscroll` has no vertical
       overflow (20-pipeline.css gives it overflow-x alone), so a reset of its
       scrollTop returned nobody anywhere; the page's scroller is the one that
       has to reach zero. The shipped body runs against a fake document — it
       needs nothing else — and that the page really lands at scrollY 0 is the
       live pass's to measure. */
    const run = (doc: Record<string, unknown>) =>
      new Function('document', `function pipeBackToTop() ${fnBody('pipeBackToTop')}\n pipeBackToTop();`)(doc);
    const page = { scrollTop: 900 };
    run({ scrollingElement: page, documentElement: { scrollTop: 1 } });
    expect(page.scrollTop, 'the page').toBe(0);
    // no scrollingElement (an older engine): the root element is the page
    const root = { scrollTop: 900 };
    run({ scrollingElement: null, documentElement: root });
    expect(root.scrollTop).toBe(0);
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
  it('formats the sort label as `Group: Item`, for every sort', () => {
    /* the group prefix does real work — 'Recently started' alone is ambiguous
       out of context, and the prefix says which axis is ordering the table.
       Block 4 keeps the format (B9): the Identity items carry a colon of their
       own, so the button reads 'Identity: MC Number: Low to High' — flagged to
       Miles as a question, built as the frame draws it, pinned as built. */
    expect(recipe.pipeSortLabel('started')).toBe('Dates: Recently started');
    expect(recipe.pipeSortLabel('urgent')).toBe('Priority: Urgent first');
    expect(recipe.pipeSortLabel('mc')).toBe('Identity: MC Number: Low to High');
    for (const s of recipe.PIPE_SORTS) expect(recipe.pipeSortLabel(s.key)).toBe(`${s.group}: ${s.label}`);
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
/* H — one word per column, wherever it is spoken                          */
/* ---------------------------------------------------------------------- */

describe('a column and the filter that narrows it use the SAME word', () => {
  /* Miles, owl #66: REQUESTOR everywhere. The header had said `Client` since
     the frame did (`70:10009` names Client in its column order), while the
     panel, the chip and the Requests table all said Requestor — over the same
     field, since the cell underneath had always rendered `row.requestor`. The
     values are people; on a single-client board a Client filter selects
     everything or nothing, which is why the axis was never built as one.

     ⚠️ The FIX is not this test. The header is now derived from `PIPE_COLS`
     and each filter takes its label from the column it narrows, so the word is
     spelt in one place and a second spelling cannot be typed. What is left to
     assert is the join that makes that true: every axis must name a column the
     table actually draws. An axis pointing at a `col-` that does not exist
     yields `undefined` as its label, which would render an empty filter
     heading — visible only here.

     AMENDED 2026-09-05 (owl #78 §3, frame `809:83486`): the column SET is now
     a ruling in its own right — three columns changed at once — so the ordered
     list is asserted here, once, out of the shipped `PIPE_COLS`. That is the
     rule (the frame's column order), not the count-pin rule 1 forbids: nothing
     hand-copies a NUMBER, and `test/pipeline-expanded-columns.test.ts` no longer keeps
     a second literal list — it now asserts both row kinds' cells AGAINST this
     same array, which is the "one column model by construction" promise made
     to Miles in jp→miles #40.

     Deliberately NOT asserted: the absence of the word `Client` across the
     table subtree (that reads raw text including comments — rule 3 — so one
     capital in a prose comment would fail it for a reason unrelated to the
     rule). */
  const COLS = recipe.PIPE_COLS as Array<{ cls: string; label: string }>;

  it('is the frame’s TEN columns, in the frame’s order (owl #78 §3)', () => {
    /* Three edits from one frame, and each one is a place the table could
       silently keep its old shape: REQUESTOR leaves Pipeline entirely (it stays
       on Requests, asserted below), URGENCY moves ahead of DIFFICULTY, and DUE
       is renamed DEADLINE — class and label together, because a class naming
       the old word is how the old word gets back into the markup (#66's own
       lesson, applied again). */
    expect(COLS.map((c) => c.cls)).toEqual([
      'col-mc', 'col-name', 'col-type', 'col-urgency', 'col-diff',
      'col-status', 'col-deadline', 'col-started', 'col-done', 'col-links',
    ]);
    expect(COLS.map((c) => c.label)).toEqual([
      'MC #', 'Card Name', 'Type', 'Urgency', 'Difficulty',
      'Status', 'Deadline', 'Started', 'Done', 'Links',
    ]);
  });

  it('draws its header FROM the column table, with nothing hand-typed', () => {
    const table = TEMPLATE.slice(TEMPLATE.indexOf('<table class="ptable">'));
    const head = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));
    expect(head).toContain('{{#each pipeCols as c}}');
    expect(head, 'a hand-typed header cell is back').not.toMatch(/<th class="[a-z-]+">[A-Za-z]/);
  });

  it('gives every filter axis a column that exists, and takes its label from it', () => {
    const axes = recipe.PIPE_FILTERS as Array<Axis & { col: string }>;
    expect(axes.length).toBeGreaterThan(0);
    for (const a of axes) {
      const col = COLS.find((c) => c.cls === a.col);
      expect(col, `axis "${a.key}" names column "${a.col}", which the table does not draw`).toBeTruthy();
      expect(a.label, `axis "${a.key}" has a label the column table did not supply`).toBe(col!.label);
    }
  });

  it('every column class it emits is one the stylesheet and the body both know', () => {
    /* The gap the review found in the derivation (2026-08-25): the HEADER now
       comes from `PIPE_COLS`, but the body `<td class="col-…">` cells and the
       `.ptable .col-…` width rules are still hand-typed. Rename a `cls` here —
       the exact edit this table was built to make safe — and the `<th>` renders
       a class the stylesheet has no rule for, so the header cell loses its
       width while its body cells keep theirs and the column visibly misaligns.
       Nothing else notices: pipeline-expanded-columns.test.ts pins the BODY classes as its own
       list, and the header test above only checks that the loop exists.

       So the join is asserted here in both directions: every emitted class is
       drawn by the body and measured by the stylesheet. */
    const table = TEMPLATE.slice(TEMPLATE.indexOf('<table class="ptable">'));
    const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
    const bodyClasses = new Set([...body.matchAll(/<td class="(col-[a-z-]+)"/g)].map((m) => m[1]!));

    // Rule blocks, comments stripped first — a source scan reads raw text and
    // a prose comment naming a class would otherwise satisfy this (rule 3).
    const css = PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const measured = new Set<string>();
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/width\s*:/.test(m[2]!)) continue;
      for (const cls of m[1]!.matchAll(/\.ptable\s+\.(col-[a-z-]+)/g)) measured.add(cls[1]!);
    }

    for (const c of COLS) {
      expect(bodyClasses, `header column "${c.cls}" has no body cell`).toContain(c.cls);
      expect(
        measured,
        `header column "${c.cls}" has no width rule — its header and body will misalign`,
      ).toContain(c.cls);
    }
  });

  it('says Requestor where the column lives — and Pipeline no longer has one', () => {
    /* SUPERSEDES the #66 pin that read "still says Requestor" on Pipeline.
       #66's ruling is untouched: the word is REQUESTOR and never CLIENT,
       because the values are people. What #78 §3 changed is WHERE the column
       is — off Pipeline, kept on Requests, where the row's own subject is the
       person who asked. So the guard holds both ends now, since dropping a
       column from one table is exactly how the word comes back misspelt in the
       other, with nothing left to compare it against. */
    expect(COLS.map((c) => c.label), 'Requestor came back to Pipeline').not.toContain('Requestor');
    expect(COLS.map((c) => c.cls)).not.toContain('col-requestor');
    expect(COLS.map((c) => c.label)).not.toContain('Client');

    /* Requests is where it went, and #66's spelling still binds there. The
       shipped `REQ_COLS` is EXECUTED, not grepped — through the one slicer the
       Requests render suites already read it with. */
    expect(reqCols().map((c) => c.label)).toContain('Requestor');
    expect(reqCols().map((c) => c.label)).not.toContain('Client');
  });
});
