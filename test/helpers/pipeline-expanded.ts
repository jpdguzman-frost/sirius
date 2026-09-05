/*
 * Shared prelude for the three files split out of
 * test/pipeline-expanded.test.ts (split 2026-09-05). Moved verbatim;
 * the only edits are the import path and the `export` keywords.
 */

/**
 * T172–T178 — the expanded MC row (owl miles→jp #45, node 520:54192; answers
 * in jp→miles #40; W2 task-card scope ruled by JP 2026-08-18 —
 * contracts/trello-write.md §W2 scope clarification).
 *
 * The structural promise this suite defends is the one made to Miles in #40:
 * parent and child are rows of the SAME table, so both levels share one
 * column model BY CONSTRUCTION and nothing can drift when the table scrolls.
 * Everything else follows the annotation: the tint is the nesting cue
 * (parent white, children slate-50 — inverted from the earlier version) and
 * the empty first cell is the indent (the MC# is not repeated).
 *
 * AMENDED 2026-09-05 — owls miles→jp #78 §1/§3 and #79 (frame `809:83486`,
 * badge `842:125808`, metric strip `843:125889`). #45's "the child shows NO
 * type/difficulty/urgency/requestor" is superseded in three of its four
 * terms. Urgency and difficulty are NOT MC-level: a website request can carry
 * an urgent screen and non-urgent assets, so the values live on the WORK CARD
 * and the editable badge+chevron moved from the parent row down to the task
 * rows, where W1 and W3 now write. The main row draws an em-dash in both
 * cells. REQUESTOR left Pipeline altogether (#78 §3). TYPE is the one term of
 * R-exp-b that survives, and it survives unchanged.
 *
 * BLOCK 4, same day (owl #78 §4/§5): expansion is no longer the reader's
 * hand alone. A work-card filter axis or a work-card-DERIVED sort opens every
 * group it explains (`pipeOpen`), a hand-collapse survives until the trigger
 * changes (`pipeShut`, B10), a childless MC never opens, and inside an
 * auto-opened group only the MATCHING children are drawn (`pipeKids`, B3).
 * The template gates on those two computeds now, not on `expanded` and
 * `workCardsByMc` — section E executes the computeds out of the shipped
 * scripts and renders the gate both ways.
 *
 * BLOCK 3, 2026-09-05 (owl #78 §2, PLAN.md block 3 B12): the DEADLINE cell is
 * READ-ONLY on both row kinds now. Pipeline reflects the work card's Trello
 * due date and cannot set it; the main row draws the em-dash beside the two
 * cells #78 §1 already dimmed. Section D was the task-card half of W2 and is
 * now the guard that no picker survives here — the setter moved to the
 * DEADLINE cell of a work-card row on Sprint Schedules, where the red tick
 * gives the date something to be compared against.
 *
 * Like every suite here: `toHTML()` has no layout, no pointer and no clock,
 * so widths, row heights and the live due write are the live pass's to
 * prove. This file proves structure, wiring and recipes.
 */

import { expect } from 'vitest';
import {
  APP_JS_CODE,
  type PipeRow,
  type WorkCardRow,
  renderPipelineTable,
} from './gantt-render.ts';

const jsCode = APP_JS_CODE;

export const row = (over: Partial<PipeRow> = {}): PipeRow => ({
  cardId: 'main-1',
  mcNumber: 'MC-837',
  mcLabel: 'MC-837',
  displayId: 'MC-837',
  name: 'MC-837 Main Card: GBox Nav Icons',
  missing: [],
  trelloUrl: 'https://trello.com/c/main-1',
  ...over,
});

export const task = (over: Partial<WorkCardRow> = {}): WorkCardRow => ({
  cardId: 'task-1',
  name: 'MC-837 Render Icon: APIs — Filled',
  currentList: 'Backlogs: Icon',
  status: 'pending',
  trelloUrl: 'https://trello.com/c/task-1',
  figmaUrl: null,
  /* owl #78 §1: the work card carries its own urgency and difficulty now, so
     the fixture carries the wire's own defaults — `Non-Urgent` is a VALUE (the
     absence of the Urgent label), `difficulty` is genuinely absent until a
     label says otherwise. */
  urgency: 'Non-Urgent',
  difficulty: null,
  due: '2026-08-07',
  started: '2026-08-02',
  startedTs: '2026-08-02T01:00:00.000Z',
  done: null,
  ...over,
});

export const PARENT = row();
/** a second MC with NO task cards — the childless half of every assertion */
export const CHILDLESS = row({ cardId: 'main-2', mcNumber: 'MC-901', mcLabel: 'MC-901', displayId: 'MC-901', name: 'Lone deliverable' });
export const TASKS: Record<string, WorkCardRow[]> = { 'MC-837': [task(), task({ cardId: 'task-2', name: 'MC-837 Render Icon: My Groups', due: null, started: null, startedTs: null })] };

export const rowWarning = () => null;

const collapsed = () =>
  renderPipelineTable({ pipelineRows: [PARENT, CHILDLESS], rowWarning, workCardsByMc: TASKS });
const open = (over: Record<string, unknown> = {}) =>
  renderPipelineTable({ pipelineRows: [PARENT, CHILDLESS], rowWarning, workCardsByMc: TASKS, expanded: { 'MC-837': true }, ...over });
/* the three recurring renders, hoisted once (a hoist pattern from the
   retired gantt-requestor-clip suite, 2026-08-28); fresh calls remain only
   where options differ */
export const COLLAPSED = collapsed();
export const OPEN = open();
export const WRITABLE = open({ writesEnabled: true });

/** All `<tr class="ptask">…</tr>` blocks of a render. */
export const taskRows = (html: string): string[] =>
  [...html.matchAll(/<tr class="ptask">([\s\S]*?)<\/tr>/g)].map((m) => m[1]!);

/** One `<td class="…">…</td>`; task-row cells never nest tables. */
export function cell(rowMarkup: string, cls: string): string {
  const at = rowMarkup.indexOf(`<td class="${cls}"`);
  expect(at, `no .${cls} cell in the task row`).toBeGreaterThan(-1);
  return rowMarkup.slice(at, rowMarkup.indexOf('</td>', at) + '</td>'.length);
}
