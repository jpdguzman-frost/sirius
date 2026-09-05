/**
 * T144 → T165 — the Pipeline per-row warning. Batch 10 (owl miles → jp #41,
 * nodes 578:56516 / I578:56516;484:27906 / 537:69135) REVISES what batch 5
 * shipped: the underlined "Needs Info" message line under the card name becomes
 * a 14×14 alert ICON in the MC# cell, the amber-50 row wash is deleted, and the
 * click popover becomes a HOVER CARD that also opens on keyboard focus.
 *
 * Two halves, both executed rather than grepped:
 *
 *   RECIPE — `WARN_LABEL`, `WARN_WHY` and `rowWarning` are sliced out of the
 *   SHIPPED the shipped app scripts and evaluated (the
 *   executed-computed pattern, now homed across
 *   the sprint-schedule-*.test.ts suites). The label is a VARIABLE string in
 *   every place it appears, so the tests read it from the constant instead of
 *   re-typing 'Needs Info' — retyping it would be the drift the ruling exists
 *   to prevent. Batch 10 moves the icon's accessible NAME into the same recipe
 *   (label + pluralised missing-field count + card identity, R-warn-m), because
 *   pluralising a count is arithmetic and the template must not do arithmetic.
 *
 *   MARKUP — the same function is then fed to `renderPipelineTable`, which
 *   renders the shipped template through Ractive's own `toHTML()`. That is
 *   what proves the recipe and the row actually meet: a source-text assertion
 *   can show a string is present without showing that it renders.
 *
 * ─── WHAT THIS FILE CANNOT PROVE ────────────────────────────────────────────
 *
 * There is no jsdom and no browser runner in this repo. `toHTML()` is a string,
 * not a document: it has no pointer, no focus, no layout and no clock. So NONE
 * of the behaviour this batch is actually about is provable here —
 *
 *   · that hovering the icon opens the card;
 *   · that the transparent `::before` bridge lets the pointer cross the 4px gap
 *     without the card closing under it;
 *   · that the 150ms close delay feels right, or that row A's pending close
 *     cannot shut row B;
 *   · that `focusout` with a `relatedTarget` inside the card does not dismiss;
 *   · that Escape from inside the card closes it and hands focus back;
 *   · that the bridge and the squared corner really do flip together at the
 *     bottom of the viewport.
 *
 * Dispatching a synthetic `mouseenter` at a detached Ractive fragment would
 * demonstrate that a handler is WIRED, not that the hover card works, and its
 * greenness must never be allowed to stand in for the live pass. So this file
 * asserts two things and refuses to pretend to a third: the STRUCTURE that
 * makes the behaviour possible (DOM order, one timer handle, one close path,
 * the bridge rule, the flip carrier) and the WIRING (which directive sits on
 * which node). The behaviour itself is the orchestrator's live pass after
 * deploy — exactly as the drag was in batch 8. See the `it.todo` block at the
 * foot of this file: it is the checklist that pass owes.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The deletion guards matter as much as the feature: the aggregate signal did
 * not disappear with the panel, it moved to the OPEN WORK KPI, and `corrections`
 * must stay on the wire (test/schedule.test.ts:301 is the server half of that).
 */

import { expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_JS,
  APP_JS_CODE,
  PIPELINE_CSS,
  TEMPLATE,
  TOKENS_CSS,
  type PipeRow,
  decl,
} from './gantt-render.ts';

interface Warning {
  label: string;
  /** batch 10: the icon's accessible name, composed in the recipe (R-warn-m) */
  srLabel: string;
  items: Array<{ field?: string; label: string; why: string }>;
}
interface Recipe {
  WARN_LABEL: string;
  WARN_WHY: Record<string, string>;
  rowWarning: (row: unknown) => Warning | null;
}

export const recipe = new Function(`
  ${decl(APP_JS, 'WARN_LABEL')}
  ${decl(APP_JS, 'WARN_WHY')}
  ${decl(APP_JS, 'rowWarning')}
  return { WARN_LABEL, WARN_WHY, rowWarning };
`)() as Recipe;

/**
 * The server's own tokens, READ OUT OF the server, in the order
 * `src/services/pipeline.ts toRow()` pushes them.
 *
 * Deliberately not a hand-copied list. `WARN_WHY` is keyed on these strings and
 * `rowWarning` renders `WARN_WHY[f] || ''` — so a reworded token on the server
 * ships a popover with the field name and a BLANK rationale, and a snapshot
 * here would have agreed with the client copy and stayed green while the app
 * explained nothing.
 */
/* One custom property, read out of the shipped token sheet. Several values in
   this file have a JS twin, and a test that retypes either side proves nothing
   about the pair (test/CLAUDE.md rule 2). */
export function cssVar(name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(TOKENS_CSS);
  if (!m) throw new Error(`no ${name} in the token sheet`);
  return m[1]!.trim();
}

export const SERVER_TOKENS: string[] = (() => {
  const src = fs.readFileSync(
    /* one '..' per directory between here and the repo root: this file moved
       from test/ into test/helpers/ with the 2026-09-05 split */
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'services', 'pipeline.ts'),
    'utf8',
  );
  const fn = src.slice(src.indexOf('function toRow('));
  const found = [...fn.slice(0, fn.indexOf('const startDate')).matchAll(/missing\.push\('([^']+)'\)/g)]
    .map((m) => m[1] as string);
  if (found.length === 0) throw new Error('pipeline-warning: no missing.push() tokens found in toRow()');
  return found;
})();

export const row = (over: Partial<PipeRow> = {}): PipeRow => ({
  cardId: 'card-1',
  mcNumber: 'MC-655',
  mcLabel: 'MC-655',
  displayId: 'MC-655.1',
  name: 'Hero render',
  missing: [],
  trelloUrl: 'https://trello.com/c/card-1',
  ...over,
});

export const WARNED = row({ missing: [...SERVER_TOKENS] });
export const CLEAN = row({ cardId: 'card-2', mcNumber: 'MC-712', mcLabel: 'MC-712', name: 'Loft plan', missing: [] });
/** one problem only — the singular half of the pluralisation rule */
export const ONE = row({ cardId: 'card-5', mcNumber: 'MC-901', mcLabel: 'MC-901', name: 'Thin card', missing: ['due date'] });
/** R-warn-g, now held BY CONSTRUCTION: blocked wins the fill, warned keeps the accent */
export const BOTH = row({
  cardId: 'card-4', mcNumber: 'MC-800', mcLabel: 'MC-800', name: 'Blocked and thin',
  missing: ['due date'], blocker: 'Awaiting brief',
});

/**
 * The `<tr class="prow …">` of one row, up to (not including) the next `<tr`.
 * Anchored on the rendered MC label, because Ractive directives (`on-click`)
 * never reach `toHTML()` — the cardId is not in the emitted markup at all.
 */
export function rowHtml(html: string, mcLabel: string): string {
  const anchor = html.indexOf(`<span class="mcnum">${mcLabel}</span>`);
  expect(anchor, `no row for ${mcLabel} rendered`).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<tr', anchor);
  const next = html.indexOf('<tr', anchor);
  return html.slice(start, next < 0 ? html.length : next);
}

/** One `<td class="…">…</td>` of a rendered row. Table cells do not nest here. */
export function cell(rowMarkup: string, cls: string): string {
  const at = rowMarkup.indexOf(`<td class="${cls}"`);
  expect(at, `no .${cls} cell in the row`).toBeGreaterThan(-1);
  const end = rowMarkup.indexOf('</td>', at);
  return rowMarkup.slice(at, end + '</td>'.length);
}

/** One start tag, from its opening marker to the `>` that closes it. */
export function tag(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `no \`${marker}\``).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf('>', at) + 1);
}

export const attr = (tagText: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tagText);
  return m ? m[1]! : null;
};

/* Comments are prose and may legitimately quote a deleted class or a frame
   measurement — R-warn-a's block still records that the frame drew 113px. The
   rules below are about what the sheet DECLARES and what the page RENDERS, so
   they read a comment-free copy. */
export const cssCode = PIPELINE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
export const tplCode = TEMPLATE.replace(/<!--[\s\S]*?-->/g, ' ');
/* the comment-free corpus and the top-level-function slicer are the helper's
   (APP_JS_CODE / fnBody) — one copy, shared with the pipeline-expanded-*.test.ts suites */
export const jsCode = APP_JS_CODE;

/** The body of an `on:` object member `NAME(…) { … }`, same contract. */
