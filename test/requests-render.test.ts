/**
 * T144 — the Requests row, rendered (owls #34–#35).
 *
 * test/requests-status.test.ts proves the SERVER only ever emits the two
 * status literals. This is the other half: that the two-valued status and the
 * clarification signal land on the row as two SEPARATE things — an amber
 * `For Filing` badge in the STATUS column and a red `With Clarification` pill
 * in Remarks — and that the clarification colourway now dresses exactly one
 * element per row, because `.sbadge.clar` went away with the third status.
 *
 * Both the status test and the clarification test are the SHIPPED functions,
 * sliced out of the shipped app scripts and evaluated: `STATUS_FILED` and
 * `clarified()`. The template asks `clarified(r)` and the segment filter asks
 * `clarified(r)`, so executing the real one is what proves the ONE recipe the
 * drift rule requires. Nothing here retypes 'For Filing' as a client literal —
 * the server sends it and the cell prints it.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  REQUESTS_CSS,
  TEMPLATE,
  TOKENS_CSS,
  type ReqNote,
  type ReqRow,
  cssRule,
  decl,
  fnBody,
  handlerBody,
  renderRequests,
  renderRequestsTable,
  reqClient,
  reqCols,
  tabViewCode,
} from './helpers/gantt-render.ts';

/* the shipped status literal, clarification predicate and note resolver,
   executed out of the app scripts by the harness (test/CLAUDE.md rule 2) */
const client = reqClient();

/** What the server sends for an unfiled row — the client never spells it. */
const FOR_FILING = 'For Filing';

const flagged = (remark: string): ReqNote => ({ remark, clarify: true, clarify_reason: null });

const req = (over: Partial<ReqRow>): ReqRow => ({
  mc_number: 'MC-000',
  sheet_row: 4,
  name: 'A deliverable',
  status: FOR_FILING,
  note: null,
  ...over,
});

/** filed × flagged, the same four rows the server guard uses. */
const ROWS: ReqRow[] = [
  req({ mc_number: 'MC-A', status: client.STATUS_FILED }),
  req({ mc_number: 'MC-B' }),
  req({ mc_number: 'MC-C', note: flagged('needs the target size') }),
  req({ mc_number: 'MC-D', status: client.STATUS_FILED, note: flagged('flagged after filing') }),
];

const html = () =>
  renderRequestsTable({
    reqRows: ROWS,
    statusFiled: client.STATUS_FILED,
    clarified: client.clarified,
    noteText: client.noteText,
  });

/** One `<tr>…</tr>`, anchored on the rendered MC number. */
function rowHtml(mc: string): string {
  const out = html();
  const anchor = out.indexOf(`<span class="mcval">${mc}</span>`);
  expect(anchor, `no row for ${mc} rendered`).toBeGreaterThan(-1);
  const start = out.lastIndexOf('<tr>', anchor);
  const end = out.indexOf('</tr>', anchor);
  return out.slice(start, end + '</tr>'.length);
}

const badgeOf = (rowMarkup: string) =>
  /<span class="sbadge ([a-z]+)">([^<]*)<\/span>/.exec(rowMarkup)!;

describe('the STATUS column is two-valued and says what the server said', () => {
  /* The ONE literal both sides must spell identically — `STATUS.filed` in
     src/routes/requests.ts and `STATUS_FILED` here. Every other assertion in
     this file builds its filed rows FROM the client constant, so without this
     pin a one-sided edit would leave the suite green while the shipped table
     put the amber For Filing badge on every In Pipeline row and `clarified()`
     started matching filed+flagged rows. */
  it('spells In Pipeline exactly as the route does', () => {
    expect(client.STATUS_FILED).toBe('In Pipeline');
  });

  it('gives an unfiled row the amber For Filing badge, verbatim from the payload', () => {
    const [, cls, text] = badgeOf(rowHtml('MC-B'));
    expect(cls).toBe('file');
    expect(text).toBe(FOR_FILING);
  });

  it('gives a filed row the In Pipeline badge', () => {
    const [, cls, text] = badgeOf(rowHtml('MC-A'));
    expect(cls).toBe('pipe');
    expect(text).toBe(client.STATUS_FILED);
  });

  it('never emits a third badge class, whatever the note says', () => {
    const classes = [...html().matchAll(/<span class="sbadge ([a-z]+)">/g)].map((m) => m[1]);
    expect(classes).toEqual(['pipe', 'file', 'file', 'pipe']);
    expect(html()).not.toContain('sbadge clar');
  });

  it('spells no status literal in the template — the badge branches, the cell prints', () => {
    expect(TEMPLATE).not.toContain(FOR_FILING);
    expect(TEMPLATE).not.toContain('For Clarification');
    expect(TEMPLATE).not.toContain('To File');
  });
});

describe('a flagged UNFILED row (MC-C) carries both signals, in different columns', () => {
  const row = () => rowHtml('MC-C');

  it('shows For Filing in STATUS and With Clarification in Remarks', () => {
    const [, cls, text] = badgeOf(row());
    expect(cls).toBe('file');
    expect(text).toBe(FOR_FILING);
    expect(row()).toContain('<span class="clarpill">With Clarification</span>');
    expect(row()).toContain('needs the target size');
  });

  it('takes the clarification branch from the SHARED predicate', () => {
    expect(client.clarified(ROWS[2]!)).toBe(true);
    expect(row()).toContain('class="notebox flagged"');
    // and the accessible name still reads the note, not just the affordance
    expect(row()).toMatch(/aria-label="Edit note for MC-C — with clarification: needs the target size"/);
  });

  it('wears exactly ONE red badge — the pill, never the status', () => {
    expect([...row().matchAll(/clarpill/g)]).toHaveLength(1);
    expect(row()).not.toContain('sbadge clar');
    // the whole table, not just this row: the third recipe is gone everywhere
    expect([...html().matchAll(/clarpill/g)]).toHaveLength(1);
  });
});

describe('a flagged FILED row (MC-D) keeps the plain remark — R-req-a default', () => {
  it('stays In Pipeline and shows no clarification pill', () => {
    const row = rowHtml('MC-D');
    expect(badgeOf(row)[1]).toBe('pipe');
    expect(client.clarified(ROWS[3]!)).toBe(false);
    expect(row).not.toContain('clarpill');
    expect(row).toContain('class="notebox"');
    expect(row).toContain('flagged after filing');
  });

  it('offers Add Remarks on a row with no note at all', () => {
    expect(rowHtml('MC-B')).toContain('>Add Remarks</button>');
    expect(rowHtml('MC-A')).toContain('>Add Remarks</button>');
  });
});

describe('the clarification colourway dresses one element (CSS)', () => {
  it('narrows to the note-cell pill — the status badge no longer shares it', () => {
    // comments stripped first: the sheet legitimately NAMES the retired rule
    // while explaining why it went, and that prose is not a declaration
    const declared = REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declared).not.toContain('.sbadge.clar');
    const pill = cssRule('.notewrap .clarpill', REQUESTS_CSS);
    expect(pill).toContain('var(--red-50)');
    expect(pill).toContain('var(--red-500)');
    // ...and the three reds are three SEPARATE roles — see the frame guard at
    // the bottom of this file. A bare `toContain('--red-500')` passed while
    // the stroke was the wrong red, because the LABEL is red-500 too.
  });

  it('leaves the two surviving status recipes exactly as owl #17 tuned them', () => {
    expect(cssRule('.rtable .sbadge.file', REQUESTS_CSS)).toContain('var(--amber-100)');
    expect(cssRule('.rtable .sbadge.file', REQUESTS_CSS)).toContain('var(--amber-500)');
    expect(cssRule('.rtable .sbadge.pipe', REQUESTS_CSS)).toContain('var(--green-50)');
    expect(cssRule('.rtable .sbadge.pipe', REQUESTS_CSS)).toContain('var(--green-500)');
  });

  it('keeps the note text red-600, per the verified render', () => {
    expect(cssRule('.notewrap .clarnote', REQUESTS_CSS)).toContain('var(--red-600)');
  });

  /* Product correction, owl #51, verified from the frame's SVG: the container
     holds one red element, a 4px bar at x=0 running full height. "Border" in
     the annotation meant an edge accent — the same word, the same wrong build,
     as the Pipeline row's amber. */
  it('draws the clarification note as a 4px left accent and nothing else', () => {
    const rule = cssRule('.notewrap .clarnote', REQUESTS_CSS);
    expect(rule).toContain('border-left: 4px solid var(--red-500)');
    // no four-sided outline anywhere in the rule — the defect being corrected
    expect(rule).not.toMatch(/[^-]border:\s/);
  });

  it('holds the text 11px in from the container edge — the accent plus its gap', () => {
    const rule = cssRule('.notewrap .clarnote', REQUESTS_CSS);
    const accent = Number(/border-left: (\d+)px/.exec(rule)![1]);
    const pad = Number(/padding:[^;]*?\s(\d+)px;/.exec(rule)![1]);
    // border-box, so the accent counts toward the inset rather than adding to it
    expect(rule).toContain('box-sizing: border-box');
    expect(accent + pad).toBe(11);
  });

  it('still hugs its content — nothing here truncates or pins a height', () => {
    const rule = cssRule('.notewrap .clarnote', REQUESTS_CSS);
    expect(rule).not.toMatch(/(?:^|[\s;])height:/); // line-height is not a fixed height
    expect(rule).not.toContain('max-height');
    expect(rule).not.toContain('text-overflow');
    expect(rule).toContain('overflow-wrap: anywhere');
  });
});

describe('a note save cannot move the status any more', () => {
  it('leaves the optimistic patch touching the note and the search blob only', () => {
    const at = APP_JS.indexOf('async submitNote(');
    expect(at).toBeGreaterThan(-1);
    const handler = APP_JS.slice(at, APP_JS.indexOf('\n  },', at));
    expect(handler).toContain('.note`]: note');
    expect(handler).toContain('.blob`]: requestBlob');
    // neither the optimistic set nor the rollback may name a status keypath
    expect(handler).not.toMatch(/\.status`\]/);
    expect(handler).not.toContain('prev.status');
  });

  it('holds no clarification status name at all', () => {
    expect(APP_JS).not.toContain('STATUS_CLARIFY');
    expect(APP_JS).not.toContain('STATUS_TO_FILE');
    expect(APP_JS).not.toContain('statusClarify');
  });
});

/* ---------------------------------------------------------------------- */
/* Frame 731:101090 — the fifteen specs validated on 2026-08-27            */
/*                                                                         */
/* Thirteen were applied; JP pulled two (the tick box and the button pair). */
/* This block guards BOTH outcomes, because the dangerous move here is not  */
/* undoing an applied spec — it is a later pass "finishing the job" from a  */
/* frame whose remaining items were declined on purpose.                    */
/*                                                                         */
/* Every value below was read from the NODE through Rex, never from the     */
/* annotation prose. That distinction is not pedantry on this file: the     */
/* frame's own annotation states the badge's stroke and label as the same   */
/* red when the design draws them differently, and states the tick box's    */
/* corner as 4 when the design draws 2 — the third and fourth time          */
/* annotation text has disagreed with its own geometry here (see owl #51    */
/* and the Pipeline row's amber).                                           */
/* ---------------------------------------------------------------------- */

describe('frame 731:101090 — the three narrowed columns', () => {
  it('narrows YEAR, MONTH and UNIT, and leaves every other width alone', () => {
    /* These three were specced in a revision and never landed, which is how
       the drift was found: every OTHER column already matched the frame to
       the pixel, so three misses in a row could not be coincidence. Pinned
       with their frame nodes — 101106 / 101107 / 101111. The third column is
       UNIT since block 5 (D1, node 809:85709): the same 160px, the class
       renamed `col-rcase` → `col-runit` with the label. */
    expect(cssRule('.rtable .col-ryear', REQUESTS_CSS)).toContain('width: 80px');
    expect(cssRule('.rtable .col-rmonth', REQUESTS_CSS)).toContain('width: 80px');
    expect(cssRule('.rtable .col-runit', REQUESTS_CSS)).toContain('width: 160px');
    // the untouched ones, so a future sweep cannot "tidy" them to match
    expect(cssRule('.rtable .col-rmc', REQUESTS_CSS)).toContain('width: 120px');
    expect(cssRule('.rtable .col-rdue', REQUESTS_CSS)).toContain('width: 128px');
    expect(cssRule('.rtable .col-rstatus', REQUESTS_CSS)).toContain('width: 136px');
    expect(cssRule('.rtable .col-rnote', REQUESTS_CSS)).toContain('width: 320px');
  });
});

describe('frame 731:101090 — the clarification badge wears THREE reds', () => {
  it('fills red-50, strokes red-600 and labels red-500 — all different', () => {
    /* The stroke was red-500 until 2026-08-27. It survived a green suite
       because the old guard asked whether the rule CONTAINED red-500, and the
       label satisfied that on its own. Each role is now asserted where it
       lives, so no single wrong colour can hide behind a right one. */
    const pill = cssRule('.notewrap .clarpill', REQUESTS_CSS);
    expect(pill).toMatch(/background:\s*var\(--red-50\)/);
    expect(pill).toMatch(/border:\s*1px solid var\(--red-600\)/);
    expect(pill).toMatch(/color:\s*var\(--red-500\)/);
  });

  it('keeps the note text and the quote bar on the OTHER two reds', () => {
    /* The frame's annotation has these two backwards as well; the build was
       already right and following the prose would have swapped a correct
       pair. Bar red-500, text red-600 — the inverse of the badge. */
    const note = cssRule('.notewrap .clarnote', REQUESTS_CSS);
    expect(note).toContain('border-left: 4px solid var(--red-500)');
    expect(note).toContain('color: var(--red-600)');
  });
});

describe('frame 731:101090 — the note editor', () => {
  const editor = () => cssRule('.noteedit', REQUESTS_CSS);

  it('carries THREE distinct gaps, not one uniform gap', () => {
    /* The whole block was a single 6px column. One gap value cannot express
       three numbers, so the miss was structural rather than numeric — hence
       the wrapper element.

       Field -> checkbox is 12 and NOT the frame's 4: JP overruled it on
       2026-08-27 after seeing it built. At our column width the field hugs to
       two lines rather than the frame's three, and 4px read as the checkbox
       being stuck to the box instead of following it. The other two are the
       frame's own — 4 label -> helper, 16 before the buttons. */
    expect(editor()).toContain('gap: var(--space-16)');
    expect(cssRule('.noteedit .nefield', REQUESTS_CSS)).toContain('gap: var(--space-12)');
    expect(cssRule('.noteedit .nchktext', REQUESTS_CSS)).toContain('gap: var(--space-4)');
    expect(cssRule('.noteedit .nchk', REQUESTS_CSS)).toContain('gap: var(--space-8)');
  });

  it('nests the helper INSIDE the label, which is what aligns it', () => {
    /* The alignment is a consequence of the nesting, so the nesting is what
       gets asserted — an indent measured in px would be a second statement of
       the same fact and would drift from the gap beside it. */
    const at = TEMPLATE.indexOf('class="nchktext"');
    expect(at).toBeGreaterThan(-1);
    const block = TEMPLATE.slice(at, TEMPLATE.indexOf('</label>', at));
    expect(block).toContain('class="nlabel"');
    expect(block).toContain('class="nsub"');
    // and the helper is no longer a sibling of the row
    expect(TEMPLATE).not.toMatch(/<\/label>\s*<div class="nsub">/);
  });

  it('dresses the two label lines in the frame’s own blues, via tokens', () => {
    expect(cssRule('.noteedit .nlabel', REQUESTS_CSS)).toContain('var(--checkbox-label)');
    expect(cssRule('.noteedit .nsub', REQUESTS_CSS)).toContain('var(--checkbox-sublabel)');
    // they are NOT slate — aliasing them to the nearest slate is the
    // "close enough" that would quietly undo the spec
    expect(TOKENS_CSS).toContain('--checkbox-label: #445c85');
    expect(TOKENS_CSS).toContain('--checkbox-sublabel: #6780a9');
    expect(cssRule('.noteedit .nlabel', REQUESTS_CSS)).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(cssRule('.noteedit .nsub', REQUESTS_CSS)).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('restates the helper’s weight, because its inheritance changed', () => {
    /* It used to inherit `normal` from the editor. Nested inside the label it
       would inherit 600 and silently render SemiBold — the frame's helper is
       Regular. A restructure that changes what a rule inherits is exactly
       where a correct-looking move breaks a value nobody was editing. */
    expect(cssRule('.noteedit .nsub', REQUESTS_CSS)).toContain('font-weight: 400');
  });

  it('pads the field 12 and pins no height — the frame’s 75 is the outcome', () => {
    const ta = cssRule('.noteedit textarea', REQUESTS_CSS);
    expect(ta).toContain('padding: 12px');
    expect(ta).toContain('box-sizing: border-box');
    expect(ta).not.toMatch(/(?:^|[\s;])height:/); // line-height is not a height
  });

  it('pads the resting box 12 at the sides', () => {
    expect(cssRule('.notewrap .addremark', REQUESTS_CSS)).toContain('padding: 0 12px');
  });

  it('does NOT recolour the field when the flag is ticked', () => {
    /* Withdrawn 2026-08-27. Node 731:101140 IS the ticked state — the
       component reads `isClicked: Yes` and the box draws ticked — and its
       text is slate-900 at 12/140%, identical to unticked. The build turned
       it red, which also pre-announced a treatment that belongs to the SAVED
       state, where the badge and the quote bar carry it.

       Owl #15's ruling (ONE box: the remark carries both the note and the
       clarification, so there is no second field) is UNAFFECTED and is what
       the single textarea still implements — the recolour was an affordance
       laid on top of it. Asserted on the class as well as the colour, so the
       template cannot re-stamp a hook for a rule that no longer exists. */
    const declared = REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declared).not.toContain('textarea.flagged');
    const at = TEMPLATE.indexOf('class="noteedit"');
    const editor = TEMPLATE.slice(at, TEMPLATE.indexOf('</div>', TEMPLATE.indexOf('nchktext', at)));
    expect(editor).toContain('<textarea');
    expect(editor).not.toContain('flagged');
    // the saved state keeps its own flagged hook — a different element
    expect(declared).toContain('.notebox.flagged');
  });

  it('lets the field HUG its text instead of offering a drag handle', () => {
    /* The frame's Field is HUG vertically and its text auto-resizes by
       HEIGHT, so its 75px is what three lines at 288 wide happen to make —
       not a size. The build pinned three rows and offered `resize: vertical`,
       which showed a drag handle the frame does not have and left visible
       slack whenever the text wrapped to fewer lines than the pin.

       Only a browser proves the sizing (test/CLAUDE.md 4); measured live on
       2026-08-27 at the built column width: 1 line 41px, 2 lines 58px, a long
       note 108px with no scrollbar, and back to 41px on delete. Three lines
       at the frame's own 288 would be 76 — the frame's 75 plus the border. */
    const ta = cssRule('.noteedit textarea', REQUESTS_CSS);
    expect(ta).toContain('resize: none');
    expect(ta).toContain('overflow: hidden'); // hugging means nothing to scroll
    expect(ta).not.toMatch(/(?:^|[\s;])height:/);
    expect(TEMPLATE).toContain("on-input=\"['noteGrow']\"");
    expect(TEMPLATE).not.toContain('rows="3"');
  });

  it('clears the height BEFORE measuring, so the field can shrink again', () => {
    /* The one-way-growth trap: scrollHeight reports the greater of the
       content and the box, so a field measured without clearing grows and
       never comes back. Executed, not read — the shipped function is run
       against a stub that records the order of writes. */
    const grow = new Function(`${decl(APP_JS, 'noteGrow')} return noteGrow;`)() as (
      el: unknown,
    ) => void;
    const writes: string[] = [];
    grow({
      scrollHeight: 96,
      style: {
        set height(v: string) {
          writes.push(v);
        },
      },
    });
    expect(writes).toEqual(['auto', '96px']);
    expect(() => grow(null)).not.toThrow();
  });
});

describe('frame 731:101090 — the two specs JP DECLINED (2026-08-27)', () => {
  it('leaves the tick box as the browser draws it', () => {
    /* The frame draws a 12x12 #0f172a box, radius 2, with a 1.5px white tick.
       JP ruled the platform default stays. Only the user-agent MARGIN is
       zeroed, so the 8px gap beside it is the real gap — that is layout, not
       appearance, and it is the one thing this rule may set. */
    const box = cssRule('.noteedit .nchk input', REQUESTS_CSS);
    expect(box).toContain('margin: 0');
    expect(box).not.toContain('appearance');
    expect(box).not.toContain('background');
    expect(box).not.toMatch(/border-radius|width:|height:/);
  });

  it('leaves Cancel and Submit exactly as built', () => {
    /* The frame has them at 66x25 and 70x27, one pixel apart vertically, and
       its annotation pre-emptively says the mismatch is deliberate. JP kept
       the built pair instead: same height, level, and Submit outlined in its
       own fill rather than slate-200. Guarded so the annotation's "reproduce
       it" does not get honoured by a later reader. */
    const shared = cssRule('.noteedit .nghost, .noteedit .nsubmit', REQUESTS_CSS);
    expect(shared).toContain('padding: 8px 12px 7px'); // ONE padding, so ONE height
    expect(shared).not.toMatch(/(?:^|[\s;])height:/);
    expect(cssRule('.noteedit .nsubmit', REQUESTS_CSS)).toContain('border: 1px solid var(--neutral-950)');
    expect(cssRule('.noteedit .nbtns', REQUESTS_CSS)).toContain('justify-content: flex-end');
  });
});

describe('frame 731:101090 — what the annotations get WRONG about the build', () => {
  it('does not resurrect For Clarification as a status', () => {
    /* Two of the frame's functionality annotations still describe the retired
       three-valued model: "Submit ... sets the request's status to 'For
       Clarification'" and "clearing the flag must ... revert the status".
       Owls #34/#35 retired that on 2026-08-17 — the flag is NOTE state. The
       frame's own DRAWING agrees with the build (every sample row reads For
       Filing, including the flagged one); only its prose is stale.

       BLOCK 5 (D2) gave the words a SECOND, separate home: the STATUS filter
       axis offers three DERIVED values, and `For Clarification` is one of
       them. The rule the old blanket `not.toContain` was defending is the one
       asserted here instead — the string may exist only in the filter axis's
       own vocabulary, never anywhere the badge could reach it. */
    const declared = REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declared).not.toContain('.sbadge.clar');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
    const occurrences = (s: string) => s.split('For Clarification').length - 1;
    const vocabulary = strip(decl(APP_JS, 'REQUEST_SEGMENT_STATUS') + decl(APP_JS, 'REQ_STATUS_VALUES'));
    expect(occurrences(vocabulary), 'the filter axis no longer names the value it derives').toBeGreaterThan(0);
    expect(
      occurrences(APP_JS_CODE),
      'For Clarification is spelled somewhere other than the STATUS filter vocabulary',
    ).toBe(occurrences(vocabulary));
  });
});

/* ---------------------------------------------------------------------- */
/* BLOCK 5 — the table's own chrome, rebuilt (owl #77 §1–§4; nodes         */
/* 809:85709 header + toolbar, 809:85294 footer, 809:111116 no-results).    */
/*                                                                         */
/* Four selects and an inline pager became one toolbar, one footer and a    */
/* shared empty state. These render the WHOLE tab (`renderRequests`)        */
/* rather than the table's own div: the footer is a SIBLING of the          */
/* scroller and the empty state REPLACES the branch that holds both, so a   */
/* renderer that started inside the table could not see either.             */
/* ---------------------------------------------------------------------- */

/** the tab with rows — one page of the four fixtures, the footer's own state */
const view = (over: Parameters<typeof renderRequests>[0] = {}) =>
  renderRequests({
    reqRows: ROWS,
    reqPageRange: { from: 1, to: 4, total: 4 },
    reqPageCount: 1,
    reqPages: [{ n: 1 }],
    ...over,
  });

/** the substring between two markers — placement, asserted on the render */
const between = (html: string, from: string, to: string) => {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a);
  expect(a, `no ${from} in the render`).toBeGreaterThan(-1);
  expect(b, `no ${to} after ${from}`).toBeGreaterThan(a);
  return html.slice(a, b);
};

describe('D1 — the UNIT column is one rename, spelled in one place', () => {
  it('renames the class and the label together, and keeps the 160px width', () => {
    /* `reqCols()` is the SHIPPED REQ_COLS, executed — not a copy of it — so
       this reads the table the browser draws. The old spelling is asserted
       gone from all three of its homes (defs, markup, stylesheet), because a
       rename that lands in two of them is exactly the half-landing D1 names. */
    const unit = reqCols().find((c) => c.cls === 'col-runit');
    expect(unit, 'no col-runit column in the shipped REQ_COLS').toBeDefined();
    expect(unit!.label).toBe('Unit');
    expect(reqCols().map((c) => c.cls)).not.toContain('col-rcase');
    expect(reqCols().map((c) => c.label)).not.toContain('Use Case');
    const html = view();
    expect(html).toContain('<th class="col-runit">Unit</th>');
    expect(html).toContain('<td class="col-runit">');
    expect(html).not.toContain('col-rcase');
    expect(REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('col-rcase');
  });

  it('keeps the WIRE on use_case — the screen renamed, storage did not', () => {
    /* D1's whole reason: `use_case` also lives on Deliverable and the schedule
       duplicate flow, so a storage rename would be a migration for a word.
       The cell must therefore still read the payload's own field. */
    const html = view({ reqRows: [req({ mc_number: 'MC-U', use_case: 'Brand' })] });
    expect(html).toContain('<td class="col-runit"><span class="rtext">Brand</span></td>');
  });

  it('draws every column the defs name, in their order, and nothing else', () => {
    const drawn = [...view().matchAll(/<th class="(col-r[a-z]+)">([^<]*)<\/th>/g)].map((m) => [m[1], m[2]]);
    expect(drawn).toEqual(reqCols().map((c) => [c.cls, c.label]));
  });
});

describe('D6 — the sort panel is the one sort door, so the headers are plain', () => {
  it('renders no button, no arrow and no aria-sort in the header row', () => {
    const thead = between(view(), '<thead>', '</thead>');
    expect(thead).not.toContain('<button');
    expect(thead).not.toContain('aria-sort');
    expect(thead).not.toContain('sarrow');
  });

  it('leaves no header-click sort wiring in the view at all', () => {
    /* prose stripped: the template RECORDS why the headers went plain, and
       an absence guard must not fire on the record (test/CLAUDE.md rule 3) */
    const src = tabViewCode('requests');
    for (const gone of ['reqSortBy', 'sortbtn', 'reqSortKey', 'reqSortDir']) {
      expect(src, `the retired header-sort wiring still names ${gone}`).not.toContain(gone);
    }
  });
});

describe('the toolbar replaced the four selects (node 809:85709)', () => {
  it('renders one search field and the two icon buttons in a .reqtools row', () => {
    const html = view();
    expect(html).toContain('class="reqtools"');
    expect(html).toContain('class="searchbar reqsearch"');
    expect([...html.matchAll(/class="sfbtn[^"]*"/g)]).toHaveLength(2);
    expect(html).toContain('title="Filter"');
    expect(html).toContain('title="Sort"');
  });

  it('names what each button holds, and names the panels for THIS table', () => {
    /* R-pf-f: the face of the sort button says its one selection, the filter
       button says how many values are applied — the count has no other route
       for a reader who cannot see the fill change. The panels are the shared
       Pipeline recipe, so only their accessible names say which table. */
    const html = view({
      reqFilterCount: 2,
      reqSort: 'recent',
      reqSortLabelText: 'Dates: Recently requested',
      reqFilterMenu: 'filter',
    });
    expect(html).toContain('aria-label="Filter, 2 applied"');
    expect(html).toContain('aria-label="Sort, Dates: Recently requested"');
    expect(html).toContain('<span class="sflabel">Dates: Recently requested</span>');
    expect(html).toContain('aria-label="Filter the requests"');
    expect(view({ reqSortMenu: 'sort' })).toContain('aria-label="Sort the requests"');
  });

  it('leaves no select markup, handler or recipe behind', () => {
    const src = tabViewCode('requests');
    for (const gone of ['filterbar', 'rfilter', 'selwrap', 'seltrigger', 'openReqMenu', 'pickReqFilter', 'reqFilterDefs']) {
      expect(src, `the retired select filter bar still names ${gone}`).not.toContain(gone);
    }
    const css = REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const gone of ['.filterbar', '.rfilter', '.selwrap', '.reqmenu']) {
      expect(css, `${gone} outlived the controls it dressed`).not.toContain(gone);
    }
  });
});

describe('D8 — the footer sits inside the rows branch, under the table', () => {
  it('renders the range and the pager together, after the table, at ONE page', () => {
    const html = view();
    const foot = between(html, '<div class="reqfoot">', '</nav>');
    expect(html.indexOf('<div class="reqfoot">')).toBeGreaterThan(html.indexOf('</table>'));
    expect(foot).toContain('Showing <b>1-4</b> of <b>4</b> requests');
    expect(foot).toContain('<nav class="pager"');
    expect(foot).toContain('class="pbtn on"'); // the active page, inside the footer
  });

  it('draws the pager ONCE — the inline one above the table is gone', () => {
    expect([...view().matchAll(/<nav class="pager"/g)]).toHaveLength(1);
  });

  it('sits UNDER the scroller, not inside it — it must not scroll with the table', () => {
    /* `renderRequestsTable` renders exactly the scroll wrapper. The footer is
       1784 wide against a table that is wider than its viewport, so a footer
       inside the scroller would slide out of sight sideways. */
    expect(html()).not.toContain('reqfoot');
    expect(view()).toContain('reqfoot');
  });

  it('leaves with the table: no rows, no footer', () => {
    /* the count and the pager describe rows; with the empty state up there is
       nothing for them to count, which is why they live in the rows branch */
    expect(view({ reqFiltered: [], reqNoResults: true })).not.toContain('reqfoot');
  });
});

describe('D9 — the filtered-empty state is the SHARED no-results block', () => {
  it('replaces the table with the shared partial, tiles and toolbar surviving', () => {
    const html = view({
      reqFiltered: [],
      reqNoResults: true,
      reqStats: [{ key: 'requests', label: 'REQUESTS', value: 4, cls: 'all', on: false }],
    });
    expect(html).toContain('class="pnores"');
    expect(html).toContain('No results found');
    expect(html).toContain('Try adjusting your search term or clearing active filters');
    // the whole table goes, thead included — not a header row over an empty body
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<thead');
    // ...and the way back stays: the tiles, the strip and the toolbar
    expect(html).toContain('class="metrics rstats"');
    expect(html).toContain('class="reqtools"');
    expect(html).toContain('class="syncstrip"');
  });

  it('retired its own copy rather than keeping two wordings', () => {
    expect(TEMPLATE).not.toContain('No requests match');
    expect(TEMPLATE).not.toContain('Clear the search, the status card or a filter');
  });

  it('keeps the two empty states that are NOT the reader’s doing', () => {
    /* D9 moves the FILTERED empty state only. A sheet whose every row was
       rejected, and a project with nothing loaded, still say so in their own
       words — "adjust your search term" would be advice for a filter the
       reader never set. */
    expect(view({ reqFiltered: [], reqNoResults: false })).toContain('No usable requests');
    expect(renderRequests({ requests: [], rejects: [] })).toContain('No requests loaded');
  });
});

describe('D4 — the tiles and the filter panel are ONE state', () => {
  it('writes the STATUS axis on a tile click, through the segment vocabulary', () => {
    /* EXECUTED, not read: the mapping is the whole of D4, and a source-text
       assertion could show the keypath without showing what lands on it. The
       segment→value table is the shipped one, so a tile can never set a value
       the axis does not offer. */
    expect(handlerBody('setRequestFilter')).toContain('applyRequestFilter');
    expect(fnBody('applyRequestFilter')).toContain('REQUEST_SEGMENT_STATUS');
    const store: Record<string, unknown> = { 'reqFilters.status': [] };
    const app = { get: (k: string) => store[k], set: (k: string, v: unknown) => { store[k] = v; } };
    const apply = new Function('app', `
      ${decl(APP_JS, 'STATUS_FILED')}
      ${decl(APP_JS, 'REQUEST_SEGMENT_STATUS')}
      ${decl(APP_JS, 'applyRequestFilter')}
      return applyRequestFilter;
    `)(app) as (segKey: string) => void;
    const axis = () => store['reqFilters.status'];

    apply('filing');
    expect(axis(), 'a tile sets the axis to exactly its own value').toEqual(['For Filing']);
    apply('filing');
    expect(axis(), 'the pressed tile clears the axis').toEqual([]);
    apply('clarification');
    expect(axis()).toEqual(['For Clarification']);
    apply('filed');
    expect(axis(), 'a second tile REPLACES the first — the tiles are single-select').toEqual([client.STATUS_FILED]);
    apply('requests');
    expect(axis(), 'REQUESTS is the show-all, so it clears the axis').toEqual([]);
  });

  it('retired the second state key, so the two doors cannot disagree', () => {
    /* `requestFilter` was the tiles' own single-select. Two controls over one
       field is the drift D4 removes — asserted on the client AND the view,
       because either half surviving alone re-opens it. */
    expect(APP_JS_CODE).not.toMatch(/\brequestFilter\b/);
    expect(tabViewCode('requests')).not.toMatch(/\brequestFilter\b/);
  });

  it('derives the pressed tile from the axis, never from a second flag', () => {
    const stats = [
      { key: 'requests', label: 'REQUESTS', value: 4, cls: 'all', on: false },
      { key: 'filing', label: 'FOR FILING', value: 2, cls: 'file', on: true },
    ];
    const html = view({ reqStats: stats, reqFilters: { year: [], month: [], type: [], unit: [], requestor: [], status: ['For Filing'] } });
    const tiles = [...html.matchAll(/<button class="metric rstat ([^"]*)"[^>]*aria-pressed="(true|false)"/g)];
    expect(tiles.map((m) => [m[1]!.split(' ')[0], m[2]])).toEqual([['all', 'false'], ['file', 'true']]);
    // the unpressed tile dims only because SOME status is picked — the axis again
    expect(tiles[0]![1], 'the unpressed tile is not dimmed while a status is picked').toContain('off');
    expect(tiles[1]![1], 'the pressed tile dimmed itself').not.toContain('off');
    // ...and with the axis empty, nothing dims
    const clear = view({ reqStats: stats.map((s) => ({ ...s, on: false })) });
    expect(clear).not.toContain('rstat all off');
  });
});
