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
  REQUESTS_CSS,
  TEMPLATE,
  TOKENS_CSS,
  type ReqNote,
  type ReqRow,
  cssRule,
  decl,
  renderRequestsTable,
} from './helpers/gantt-render.ts';

interface Client {
  STATUS_FILED: string;
  clarified: (r: ReqRow) => boolean;
  noteText: (n: ReqNote | null) => string;
}

const client = new Function(`
  ${decl(APP_JS, 'STATUS_FILED')}
  ${decl(APP_JS, 'clarified')}
  ${decl(APP_JS, 'noteText')}
  return { STATUS_FILED, clarified, noteText };
`)() as Client;

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
  it('narrows YEAR, MONTH and USE CASE, and leaves every other width alone', () => {
    /* These three were specced in a revision and never landed, which is how
       the drift was found: every OTHER column already matched the frame to
       the pixel, so three misses in a row could not be coincidence. Pinned
       with their frame nodes — 101106 / 101107 / 101111. */
    expect(cssRule('.rtable .col-ryear', REQUESTS_CSS)).toContain('width: 80px');
    expect(cssRule('.rtable .col-rmonth', REQUESTS_CSS)).toContain('width: 80px');
    expect(cssRule('.rtable .col-rcase', REQUESTS_CSS)).toContain('width: 160px');
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
    /* The whole block was a single 6px column. The frame is 4 between the
       field and the checkbox, 4 between the label and its helper, and 16
       before the buttons. One gap value cannot express that, so the miss was
       structural rather than numeric — hence the wrapper element. */
    expect(editor()).toContain('gap: var(--space-16)');
    expect(cssRule('.noteedit .nefield', REQUESTS_CSS)).toContain('gap: var(--space-4)');
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
       Filing, including the flagged one); only its prose is stale. */
    const declared = REQUESTS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declared).not.toContain('.sbadge.clar');
    expect(APP_JS).not.toContain('For Clarification');
  });
});
