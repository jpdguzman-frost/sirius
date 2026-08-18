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
