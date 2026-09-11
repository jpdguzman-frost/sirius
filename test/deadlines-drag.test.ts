/**
 * The Deadlines DAY-DRAG — the ONE day control in Sirius (block 9; owls
 * miles→jp #88, #89 and #90, JP's yes 2026-09-10; build spec v1.4 §6.5/§8;
 * PLAN.md block 9, frozen interfaces "Client geometry", "Client handlers",
 * "Template", "Styles").
 *
 * THE RULINGS, in one paragraph. The day belongs to the Design Lead, on this
 * tab and nowhere else (#88); the PM works Sprint Schedules at WEEK grain. A
 * card in an EXPANDED lane is a pointer drag source (and, for the keyboard
 * path v1.4 §8 asks for, an ArrowLeft/ArrowRight nudge): the drop day must
 * meet FOUR conditions at once — inside the assigned week · inside the
 * sprint's dates · no later than the card's deadline · a working day (#89 §1/
 * §3). Days that fail get the pale-wash-and-snap-back treatment and NOTHING
 * is written; a valid drop PATCHes `{ starts_on }` optimistically and a
 * server 422 rolls the card back with the server's own sentence (invariant
 * 8's shape). Escape cancels a live drag without writing. Only rollover
 * crosses a week (§6.2, untouched).
 *
 * WHAT IS PROVEN, AND HOW (test/CLAUDE.md rules 2 and 6):
 *  - `dlDayPlaceable`, the client half of the four bounds, is EXECUTED out
 *    of the shipped geometry file — the truth table, week bound included;
 *  - the handlers (`dlDragStart` / `dlDragMove` / `dlDragEnd` /
 *    `dlDragCancel` / `dlKey` / `dlNudge`, and the PM's `weekPlace` beside
 *    them because the two owners share one write path) are sliced out of
 *    the shipped client and RUN against a one-page stand-in for the app,
 *    the window and `document.elementFromPoint` — nothing is retyped;
 *  - the markup goes through `renderDeadlines` (rule 6): the card's
 *    bindings, its `tabindex` / `role` / accessible name, the `dragging` /
 *    `refused` dress and the `target` column, all from `dlDrag`;
 *  - the stylesheet rules that carry a RULE (grab only inside a lane, the
 *    lifted and refused treatments, the drop tint, the focus ring) are read
 *    by selector.
 *
 * HIT-TESTABILITY — the law that the card stays `pointer-events`-live in
 * every state, and no ancestor takes it out — lives in
 * test/drag-hittest.test.ts, the one home for that sweep (gantt-rules §5),
 * re-targeted to `.dlcard` in the same block.
 *
 * HONESTY NOTE: no browser runs here. What the executed harness models is the
 * ORDER a browser delivers events in (the window's capture keydown before a
 * focused element's own handler; pointermove/pointerup on the window while a
 * drag is live) and the values an event carries; a real pointer stays E2E's
 * (a valid drop, the four refusals, Escape, the arrow nudge — PLAN.md block 9
 * E2E). A synthetic `DragEvent` is never used and never may be.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import RactiveModule from 'ractive';
import { describe, expect, it } from 'vitest';
import {
  APP_JS_CODE,
  DEADLINES_CSS,
  GANTT_CSS,
  TEMPLATE,
  cssRule,
  dlCardPartial,
  fnBody,
  handlerBody,
  renderDeadlines,
  topDecl,
  type DlCard,
  type DlDrag,
  type DlWeek,
} from './helpers/gantt-render.ts';

/* ====================================================================== *
 * A — `dlDayPlaceable`: the client half of the four bounds, executed
 * ====================================================================== */

interface Placeable {
  (row: { sprintId?: string | null; deadline?: string | null } | null, day: string | null, weekKey: string | null, sprint: { start: string | null; end: string | null } | null): boolean;
}

/* Sliced LAZILY (the drag-hittest reasoning): `topDecl` throws when a name is
   absent, and a throw at module scope takes every describe down together. */
let placeableFn: Placeable | undefined;
const placeable: Placeable = (...args) =>
  (placeableFn ??= new Function(`
    ${topDecl('WORKDAYS_PER_WEEK')}
    ${topDecl('isoOf')}
    ${topDecl('isoAddDays')}
    ${topDecl('dlDayPlaceable')}
    return dlDayPlaceable;
  `)() as Placeable)(...args);

/** Sprint A runs Mon 3 Aug — Thu 6 Aug 2026 (ends MID-week on purpose). */
const SPRINT_A = { id: 's1', start: '2026-08-03', end: '2026-08-06' };
/** The assigned week: Mon 3 Aug. */
const WEEK = '2026-08-03';
const inA = (deadline: string | null = null) => ({ sprintId: 's1', deadline });

describe('dlDayPlaceable — the four bounds, week FIRST (#89 §1/§3; PLAN.md client geometry)', () => {
  it('takes every day of the assigned week that the sprint and the deadline also allow', () => {
    for (const day of ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06']) {
      expect(placeable(inA(), day, WEEK, SPRINT_A), day).toBe(true);
    }
  });

  it('refuses a day OUTSIDE the assigned week even when the sprint and the deadline would take it', () => {
    /* THE WEEK BOUND (#89 §1): "Don cannot move a card beyond a week". A
       sprint spanning two weeks and no deadline would allow the Friday
       before and the Monday after — the week says no first. */
    const twoWeeks = { id: 's1', start: '2026-07-27', end: '2026-08-14' };
    expect(placeable(inA(), '2026-07-31', WEEK, twoWeeks)).toBe(false); // the Friday before
    expect(placeable(inA(), '2026-08-10', WEEK, twoWeeks)).toBe(false); // the Monday after
    expect(placeable(inA(), '2026-08-02', WEEK, twoWeeks)).toBe(false); // the Sunday before
    expect(placeable(inA(), '2026-08-08', WEEK, twoWeeks)).toBe(false); // the Saturday after Friday
    // …and the week's own Monday and Friday are inside it
    expect(placeable(inA(), '2026-08-03', WEEK, twoWeeks)).toBe(true);
    expect(placeable(inA(), '2026-08-07', WEEK, twoWeeks)).toBe(true);
  });

  it('refuses a day the sprint does not cover, inside the week — both edges inclusive', () => {
    expect(placeable(inA(), '2026-08-07', WEEK, SPRINT_A)).toBe(false); // the Friday after a Thursday end
    expect(placeable(inA(), '2026-08-06', WEEK, SPRINT_A)).toBe(true); // the end day itself
    const lateStart = { id: 's1', start: '2026-08-05', end: '2026-08-07' };
    expect(placeable(inA(), '2026-08-04', WEEK, lateStart)).toBe(false); // the day before it starts
    expect(placeable(inA(), '2026-08-05', WEEK, lateStart)).toBe(true); // the start day itself
  });

  it('takes the DEADLINE DAY itself and refuses the day after it', () => {
    // §5.1 keeps a late FINISH legal and red; what is refused is a START after
    // the date the card was promised for — so the deadline day is in
    expect(placeable(inA('2026-08-05'), '2026-08-05', WEEK, SPRINT_A)).toBe(true);
    expect(placeable(inA('2026-08-05'), '2026-08-06', WEEK, SPRINT_A)).toBe(false);
    expect(placeable(inA('2026-08-05'), '2026-08-04', WEEK, SPRINT_A)).toBe(true);
  });

  it('lets a row with NO deadline have the whole sprint-in-week (BR-9: no deadline, no lateness)', () => {
    for (const day of ['2026-08-03', '2026-08-04', '2026-08-06']) {
      expect(placeable({ sprintId: 's1' }, day, WEEK, SPRINT_A), day).toBe(true); // absent key, not null
    }
  });

  it('skips the sprint check for a row OUTSIDE ANY SPRINT (sprintId null, owl #90) — the week and the deadline still bind', () => {
    // a displaced row keeps its day and its week; there is no range to judge
    expect(placeable({ sprintId: null, deadline: null }, '2026-08-07', WEEK, null)).toBe(true);
    expect(placeable({ sprintId: null, deadline: '2026-08-05' }, '2026-08-06', WEEK, null)).toBe(false);
    expect(placeable({ sprintId: null, deadline: null }, '2026-08-10', WEEK, null)).toBe(false);
  });

  it('refuses when there is nothing to measure against — no row, no day, no week, no sprint for a row that names one', () => {
    expect(placeable(null, '2026-08-04', WEEK, SPRINT_A)).toBe(false);
    expect(placeable(inA(), null, WEEK, SPRINT_A)).toBe(false);
    expect(placeable(inA(), '2026-08-04', null, SPRINT_A)).toBe(false);
    // a row naming a sprint the list no longer has: refused, not waved through
    expect(placeable(inA(), '2026-08-04', WEEK, null)).toBe(false);
    expect(placeable(inA(), '2026-08-04', WEEK, { start: null, end: null })).toBe(false);
  });

  it('reads the calendar as STRINGS — no Date and no timezone can shift a day (invariant 11)', () => {
    const src = topDecl('dlDayPlaceable');
    expect(src).not.toContain('new Date');
    expect(src).not.toContain('getTime');
    // the week's last day is derived by the shared string-arithmetic helper
    expect(src).toContain('isoAddDays');
  });

  it('leaves the WORKING-DAY check to the server — weekday by construction of the columns, holidays by the calendar', () => {
    // the client draws Mon–Fri columns and holds no holiday set (invariant
    // 11; the ARES calendar is canonical); a holiday is the server's 422,
    // rolled back and read out — so the helper never asks
    expect(topDecl('dlDayPlaceable')).not.toMatch(/holiday|getDay|isWeekend/i);
  });
});

/* ====================================================================== *
 * B — the markup: the card is the source, dressed from `dlDrag`
 * ====================================================================== */

const card = (over: Partial<DlCard> = {}): DlCard => ({
  id: 'i1', rowId: 'i1', cardId: 'w1', mc: 'MC-655', label: 'MC-655: Sketch Asset: Hero render', startsOn: '2026-08-04',
  urgent: false, difficulty: 'Hard', assetType: null, lane: 'Working on design', done: false,
  trelloUrl: null, figmaUrl: null,
  ...over,
});
const OTHER = card({ id: 'i2', rowId: 'i2', cardId: 'w2', mc: 'MC-656', label: 'MC-656: Render Asset: Hero render', startsOn: '2026-08-05' });

const DAYS = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
const week = (cardsByDay: Record<string, DlCard[]> = {}): DlWeek => ({
  key: '2026-08-03', label: 'Week 1', range: '3 - 7 Aug 2026',
  cards: Object.values(cardsByDay).flat(), pending: 0, urgent: 0, done: 0, load: 0, capPct: '0.0',
  days: DAYS.map((day, i) => ({ day, name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i]!, cards: cardsByDay[day] ?? [], pending: 0, done: 0 })),
});
const LANE = week({ '2026-08-04': [card()], '2026-08-05': [OTHER] });
const open = (dlDrag: DlDrag | null = null): string => renderDeadlines({ dlWeeks: [LANE], expandedWeek: '2026-08-03', dlDrag });

/** Every `<article class="dlcard…">` open tag, in document order. */
const cardTags = (html: string): string[] => [...html.matchAll(/<article class="dlcard[^"]*"[^>]*>/g)].map((m) => m[0]);
/** Every `<div class="dlday…" data-day="…">` open tag. */
const dayTags = (html: string): string[] => [...html.matchAll(/<div class="dlday(?: [^"]*)?"[^>]*>/g)].map((m) => m[0]);

describe('the card in an EXPANDED lane is the drag source — bound, focusable, named (PLAN.md template)', () => {
  it('binds pointerdown to dlDragStart and keydown to dlKey, with the ROW id (source — directives never reach toHTML)', () => {
    const partial = dlCardPartial();
    expect(partial).toContain("on-pointerdown=\"['dlDragStart', c.rowId]\"");
    expect(partial).toContain("on-keydown=\"['dlKey', c.rowId]\"");
    // …and ONLY those two: no mousedown twin, no click, nothing HTML5
    expect(partial.replace(/\{\{!\s[\s\S]*?\}\}/g, ' ')).not.toMatch(/on-(mousedown|click|dragstart|drop|dragover)=/);
  });

  it('gates the bindings, the tabindex, the role and the name on the lane being OPEN — a collapsed card is inert', () => {
    /* Collapsed lanes: no drag (PLAN.md). The partial is called from both
       branches, so the gate is in the partial itself and the render proves
       it — the same card in a collapsed lane has nothing to press. */
    const partial = dlCardPartial();
    const gate = /\{\{#if expandedWeek === w\.key\}\}([\s\S]*?)\{\{\/if\}\}/.exec(partial)?.[1] ?? '';
    for (const bound of ['tabindex="0"', 'role="group"', 'aria-label=', "'dlDragStart'", "'dlKey'"]) {
      expect(gate, `${bound} is not inside the expanded-lane gate`).toContain(bound);
    }
    const collapsed = renderDeadlines({ dlWeeks: [LANE], expandedWeek: null });
    expect(cardTags(collapsed)).toHaveLength(2);
    for (const tag of cardTags(collapsed)) {
      expect(tag).not.toContain('tabindex');
      expect(tag).not.toContain('role=');
      expect(tag).not.toContain('aria-label');
    }
  });

  it('renders the card focusable as a GROUP, named with its label and the day it starts (v1.4 §8; PLAN.md amendment 15)', () => {
    /* THE ROLE IS `group`, NOT `button` (PLAN.md block 9 amendment 15). An
       ARIA button's children are PRESENTATIONAL: the Trello and Figma links
       inside the card would vanish from the accessibility tree, so the reader
       who most needs the keyboard path would lose two links to gain one. And
       a button promises Enter and Space, which this card does not answer —
       its keys are Left and Right, which the accessible name says out loud.
       `group` keeps the name, the tab stop and both links.

       Both halves are asserted, because dropping `role` altogether would also
       pass a bare "is not a button" check while losing the grouping the name
       is attached to. */
    const html = open();
    const [mine] = cardTags(html);
    expect(mine).toContain('tabindex="0"');
    expect(mine).toContain('role="group"');
    expect(mine).not.toContain('role="button"');
    expect(mine).toContain('aria-label="MC-655: Sketch Asset: Hero render, starts 2026-08-04; use left and right arrows to move the day within the week"');
    // …and the two links the role exists to protect are really in the card
    const withLinks = renderDeadlines({
      dlWeeks: [week({ '2026-08-04': [card({ trelloUrl: 'https://trello.com/c/w1', figmaUrl: 'https://figma.com/f/1' })] })],
      expandedWeek: '2026-08-03',
    });
    expect([...withLinks.matchAll(/<a [^>]*aria-label="Open MC-655 in (Trello|Figma)"/g)]).toHaveLength(2);
  });

  it('carries the drop bound in the markup — the lane its week, each column its day', () => {
    const html = open();
    expect(html).toContain('class="dldays dllane" data-week="2026-08-03"');
    expect(dayTags(html).map((t) => /data-day="([^"]*)"/.exec(t)?.[1])).toEqual(DAYS);
  });

  it('dresses the dragged card `dragging`, the column under the pointer `target`, and no other card or column', () => {
    const html = open({ rowId: 'i1', fromDay: '2026-08-04', day: '2026-08-05', refused: false, weekKey: '2026-08-03' });
    const [mine, other] = cardTags(html);
    expect(mine).toMatch(/class="dlcard[^"]*\bdragging\b/);
    expect(mine).not.toMatch(/\brefused\b/);
    expect(other).not.toMatch(/\bdragging\b|\brefused\b/);
    const targets = dayTags(html).filter((t) => /\btarget\b/.test(t));
    expect(targets).toHaveLength(1);
    expect(targets[0]).toContain('data-day="2026-08-05"');
  });

  it('dresses a REFUSED day as the pale wash and offers NO target column — both halves, so neither can pass alone', () => {
    const html = open({ rowId: 'i1', fromDay: '2026-08-04', day: '2026-08-07', refused: true, weekKey: '2026-08-03' });
    const [mine] = cardTags(html);
    expect(mine).toMatch(/class="dlcard[^"]*\bdragging\b[^"]*\brefused\b/);
    expect(dayTags(html).some((t) => /\btarget\b/.test(t))).toBe(false);
    // a pointer over NOTHING (day null) is also refused, also no target
    const nowhere = open({ rowId: 'i1', fromDay: '2026-08-04', day: null, refused: true, weekKey: '2026-08-03' });
    expect(cardTags(nowhere)[0]).toMatch(/\brefused\b/);
    expect(dayTags(nowhere).some((t) => /\btarget\b/.test(t))).toBe(false);
  });

  it('dresses nothing at rest — `dlDrag` null is the resting render', () => {
    const html = open(null);
    for (const tag of cardTags(html)) expect(tag).not.toMatch(/\bdragging\b|\brefused\b/);
    expect(dayTags(html).some((t) => /\btarget\b/.test(t))).toBe(false);
  });
});

/* ====================================================================== *
 * C — the gesture, EXECUTED out of the shipped client
 * ====================================================================== */

interface Sent {
  method: string;
  url: string;
  body: Record<string, unknown>;
  stagedStart: string | null;
  /** the row's sprint AT SEND — a week click can re-slot it (#90) */
  stagedSprint: string | null | undefined;
  /** what the card was WEARING when the request left — a legal write must not
      go out dressed `refused` (review 2026-09-12, L13) */
  dragAt: DlDrag | null;
}
interface Listener { type: string; fn: (e: unknown) => unknown; opts: unknown }
interface KeyEvent {
  key: string;
  stopped: boolean;
  prevented: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  stopPropagation(): void;
  preventDefault(): void;
}
interface Row { id: string; sprintId: string | null; startsOn: string | null; finish: string | null; deadline: string | null; late: boolean }
interface Harness {
  state: { sprintItems: { rows: Row[] }; dlDrag: DlDrag | null; expandedWeek: string | null; hoverRow: string | null; hoverWeek: number | null; holidays: string[] };
  sent: Sent[];
  banners: string[];
  fired: string[];
  listeners: Listener[];
  /** every row, as `loadAll` found it — the state the reload would have replaced */
  seen: Array<Array<{ id: string; startsOn: string | null; sprintId: string | null }>>;
  /** what `document.elementFromPoint` answers next: a day column in a lane, or nothing */
  hit(at: { day: string; week: string } | null): void;
  /** make the next PATCH fail with the server's sentence */
  failNext(message: string): void;
  /** what the next PATCH RESOLVES with — the server's 200 body (PLAN.md amendment 4) */
  answerNext(body: Record<string, unknown> | null): void;
  /** the ARES working-day calendar the payload ships (80-loaders.js) */
  holidays(days: string[]): void;
  row(id: string): Row;
  /** `ev.target` defaults to the card node itself; `link: true` starts the
      press on one of the card's own anchors instead (PLAN.md amendment 12) */
  start(rowId: string, ev?: Record<string, unknown>, from?: 'card' | 'link'): void;
  /** a pointermove delivered by the WINDOW listener */
  move(ev?: Record<string, unknown>): void;
  /** a pointerup delivered by the WINDOW listener — resolves when the write path has settled */
  up(ev?: Record<string, unknown>): Promise<void>;
  /** pointercancel from the window */
  lost(): void;
  /** a keydown as the DOM delivers one: window CAPTURE listeners first, then the focused card's own handler */
  press(key: string, focusedRowId: string | null, opts?: { from?: 'card' | 'link'; mods?: Partial<Record<'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey', boolean>> }): Promise<KeyEvent>;
  /** put focus on a row's card, or (null) drop it to `<body>` */
  focusOn(rowId: string | null): void;
  /** the `data-row` of whatever holds focus — null when nothing card-shaped does */
  focusedRow(): string | null;
  /** what the NEXT reload's re-render does with the focused `<article>`: hand
      it to this row (Ractive reuse), drop focus to `<body>` (null), or leave
      it on something outside the cards entirely ('elsewhere') */
  reuseFocusAs(rowId: string | null | 'elsewhere'): void;
  /** this row's card is not in the document at all */
  unrenderCard(rowId: string): void;
  /** a keydown delivered to whatever holds focus, bound to THAT card's row */
  pressFocused(key: string): Promise<KeyEvent>;
  weekPlace(rowId: string, weekIdx: number): Promise<void>;
  weekHover(rowId: string, weekIdx: number): void;
  saving(on: boolean): void;
}

/**
 * An `async function name(…) { … }` at column zero, braces balanced —
 * `topDecl` reads `const` and plain `function` only, and the one write path
 * both owners share (`placeRow`) is async because it writes.
 */
const asyncFn = (name: string, src: string = APP_JS_CODE): string => {
  const at = src.indexOf(`\nasync function ${name}(`);
  if (at < 0) throw new Error(`deadlines-drag: no \`async function ${name}\` in the shipped client`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`deadlines-drag: unterminated \`async function ${name}\``);
};

/** A `let` cell at column zero, sliced as text (`topDecl` reads `const` and `function` only). */
const letDecl = (name: string): string => {
  const m = new RegExp(`\\nlet ${name} = [^;]*;`).exec(APP_JS_CODE);
  if (!m) throw new Error(`deadlines-drag: no \`let ${name}\` in the shipped client`);
  return m[0];
};

let harnessSrc: string | undefined;
const harness = (rows: Row[], sprints: Array<{ id: string; name: string; start: string; end: string }>): Harness => {
  harnessSrc ??= [
    /* `MONTHS_SHORT`/`fmtLongIso` come along because the refusal sentences
       are written with them (PLAN.md amendment 14) — sliced, never retyped,
       so the client's '4 Aug 2026' is the shipped one. `weekFirstWorkday` is
       the week-offer mirror of the server's resolver (amendment 16). */
    ...['WORKDAYS_PER_WEEK', 'MONTHS_SHORT', 'fmtLongIso', 'isoOf', 'isoAddDays', 'mondayIso', 'weekFirstWorkday', 'dlDayPlaceable'].map((n) => topDecl(n)),
    letDecl('sprintItemSaving'),
    ...['sprintRow', 'sprintOf', 'calendarDaysBetween', 'stageStart', 'unstageStart'].map((n) => topDecl(n)),
    asyncFn('placeRow'),
    topDecl('weekOffered'),
    letDecl('dlDragPointer'),
    ...['dlOtherPointer', 'dlDragMoveWin', 'dlDragUpWin', 'dlDragLost', 'dlDragKeyWin', 'dlDragStop', 'dlHitDay', 'dlRefusalText', 'DL_REFUSE_MS'].map((n) => topDecl(n)),
    letDecl('dlRefuseTimer'),
    ...['dlRefuse', 'dlRefocus'].map((n) => topDecl(n)),
    `const handlers = {
       weekHover(_ctx, rowId, weekIdx) ${handlerBody('weekHover')},
       weekLeave() ${handlerBody('weekLeave')},
       async weekPlace(_ctx, rowId, weekIdx) ${handlerBody('weekPlace')},
       dlDragStart(ctx, rowId) ${handlerBody('dlDragStart')},
       dlDragMove(ctx) ${handlerBody('dlDragMove')},
       async dlDragEnd() ${handlerBody('dlDragEnd')},
       dlDragCancel() ${handlerBody('dlDragCancel')},
       dlKey(ctx, rowId) ${handlerBody('dlKey')},
       async dlNudge(_ctx, rowId, delta) ${handlerBody('dlNudge')},
     };`,
  ].join('\n');
  return new Function('ROWS', 'SPRINTS', `
    "use strict";
    const state = {
      activeProjectId: 'p1',
      sprintItems: { rows: ROWS },
      sprints: SPRINTS,
      plannerWeeks: [
        { key: '2026-08-03', fridayIso: '2026-08-07' },
        { key: '2026-08-10', fridayIso: '2026-08-14' },
      ],
      expandedWeek: '2026-08-03',
      dlDrag: null, hoverRow: null, hoverWeek: null,
      // the ARES-canonical calendar, shipped on the payload (80-loaders.js)
      holidays: [],
    };
    const sent = [];
    const banners = [];
    const fired = [];
    const listeners = [];
    const seen = [];
    let hitAt = null;
    let failWith = null;
    let answerWith = null;
    let reuse = undefined;
    const getPath = (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), state);
    const setPath = (k, v) => {
      const parts = k.split('.');
      let o = state;
      while (parts.length > 1) { const p = parts.shift(); if (o[p] == null) o[p] = {}; o = o[p]; }
      o[parts[0]] = v;
    };
    const app = {
      get: getPath,
      set: (a, b) => { if (typeof a === 'string') setPath(a, b); else for (const [k, v] of Object.entries(a)) setPath(k, v); },
      fire: (name, ...args) => { fired.push(name); return handlers[name] ? handlers[name](...args) : undefined; },
    };
    const api = {
      send: async (method, url, body) => {
        const row = state.sprintItems.rows.find((r) => url.endsWith('/' + r.id));
        sent.push({
          method, url, body,
          stagedStart: row ? row.startsOn : null,
          stagedSprint: row ? row.sprintId : null,
          dragAt: state.dlDrag,
        });
        if (failWith) { const err = failWith; failWith = null; throw err; }
        const answer = answerWith; answerWith = null;
        return answer;
      },
    };
    /* the reload the write awaits — it records what it FOUND, which is how a
       test can say a re-stamp happened BEFORE it rather than after */
    const loadAll = async () => {
      fired.push('loadAll');
      seen.push(state.sprintItems.rows.map((r) => ({ id: r.id, startsOn: r.startsOn, sprintId: r.sprintId })));
      /* THE RE-RENDER THE RELOAD CAUSES, as far as focus is concerned (block
         9 E2E, defect D1). Ractive re-renders the lane from the new rows and
         REUSES DOM elements: the <article> that held focus is handed to
         whichever row now renders in its place, or — when its column emptied
         — focus falls to <body>. A test says which of the two happened with
         reuseFocusAs(); nothing is assumed by default. */
      if (reuse !== undefined) {
        document.activeElement = reuse === null ? document.body : reuse === 'elsewhere' ? foreignNode : cardFor(reuse);
        reuse = undefined;
      }
    };
    const flashBanner = (t) => { banners.push(t); };
    const errText = (e) => (e && e.message) || String(e);
    const window = {
      addEventListener: (type, fn, opts) => { listeners.push({ type, fn, opts }); },
      removeEventListener: (type, fn, opts) => {
        const i = listeners.findIndex((l) => l.type === type && l.fn === fn && String(l.opts) === String(opts));
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    /* the card's own nodes: the article the handlers are bound to, and one of
       the two links inside it. closest() answers the way a browser's does —
       the link finds itself, the card finds nothing — which is what lets a
       press that began on a link be told from one that began on the card.
       (No backticks in here: this whole harness is a template literal.) */
    const cardNode = { focus() { fired.push('focus'); }, closest: () => null };
    const linkNode = { focus() {}, closest: (sel) => (/\ba\b|button/.test(sel) ? linkNode : null) };
    /* ONE <article> PER ROW, as 20-deadline-card.html renders them: the
       data-row hook (amendment 1), a browser-shaped closest(), and a
       focus()/blur() pair that MOVES activeElement the way a real one does.
       These are what document.querySelector answers with, so dlRefocus is
       executed against nodes that can tell whose card they are. */
    const cards = new Map();
    const gone = new Set();
    const cardFor = (rowId) => {
      if (!cards.has(rowId)) {
        const node = {
          dataset: { row: rowId },
          closest: (sel) => (sel.indexOf('.dlcard') === 0 ? node : null),
          focus() { fired.push('focus:' + rowId); document.activeElement = node; },
          blur() { fired.push('blur:' + rowId); document.activeElement = document.body; },
        };
        cards.set(rowId, node);
      }
      return cards.get(rowId);
    };
    // something with no card above it at all: the month navigator, the tab strip
    const foreignNode = { closest: () => null, focus() {}, blur() { fired.push('blur:foreign'); } };
    const lane = (weekKey) => ({ dataset: { week: weekKey } });
    const column = (at) => ({
      dataset: { day: at.day },
      closest: (sel) => (sel.startsWith('.dllane') ? lane(at.week) : null),
    });
    const document = {
      body: { closest: () => null },
      activeElement: null,
      querySelector: (sel) => {
        /* '.dlcard[data-row="r3"]' -> 'r3', by hand: this whole harness is a
           template literal, and a backslash inside one is eaten before the
           generated source ever sees it — so no regex may be written here. */
        const at = sel.indexOf('="');
        const rowId = at < 0 ? '' : sel.slice(at + 2, sel.indexOf('"', at + 2));
        return rowId && !gone.has(rowId) ? cardFor(rowId) : null;
      },
      elementFromPoint: () => (hitAt ? { closest: (sel) => (sel.startsWith('.dlday') ? column(hitAt) : null) } : null),
    };
    ${harnessSrc}
    const isCapture = (l) => l.opts === true || !!(l.opts && l.opts.capture);
    const pointer = (ev) => ({ clientX: 10, clientY: 10, button: 0, buttons: 1, pointerId: 1, preventDefault() {}, ...ev });
    const deliver = (type, ev) => listeners.filter((l) => l.type === type).map((l) => l.fn(ev));
    return {
      state, sent, banners, fired, listeners, seen,
      /* THE FOCUS HALF (block 9 E2E, defect D1): who holds focus now, who the
         reload's re-render hands the focused <article> to, and a row whose
         card the template does not render at all. */
      focusOn: (rowId) => { document.activeElement = rowId === null ? document.body : cardFor(rowId); },
      focusedRow: () => {
        const at = document.activeElement;
        return at && at.dataset ? at.dataset.row : null;
      },
      reuseFocusAs: (rowId) => { reuse = rowId; },
      unrenderCard: (rowId) => { gone.add(rowId); },
      hit: (at) => { hitAt = at; },
      failNext: (message) => { failWith = new Error(message); },
      answerNext: (bodyOut) => { answerWith = bodyOut; },
      holidays: (days) => { state.holidays = days; },
      row: (id) => state.sprintItems.rows.find((r) => r.id === id),
      start: (rowId, ev, from) => {
        const node = from === 'link' ? linkNode : cardNode;
        return handlers.dlDragStart({ event: pointer({ target: node, ...ev }), node: cardNode }, rowId);
      },
      move: (ev) => { deliver('pointermove', pointer(ev)); },
      up: async (ev) => { await Promise.all(deliver('pointerup', pointer(ev))); },
      lost: () => { deliver('pointercancel', {}); },
      press: async (key, focusedRowId, opts) => {
        const o = opts || {};
        const node = o.from === 'link' ? linkNode : cardNode;
        const e = {
          key, stopped: false, prevented: false, target: node,
          altKey: false, metaKey: false, ctrlKey: false, shiftKey: false, ...(o.mods || {}),
          stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; },
        };
        for (const l of listeners.filter((l) => l.type === 'keydown' && isCapture(l))) l.fn(e);
        if (!e.stopped && focusedRowId) handlers.dlKey({ event: e, node: cardNode }, focusedRowId);
        await new Promise((r) => setTimeout(r, 0));
        return e;
      },
      /* A KEY PRESSED AT WHATEVER HOLDS FOCUS, which is the only honest way
         to ask defect D1's question: the browser delivers the press to the
         focused <article>, and the row id the handler gets is the one THAT
         article is bound to — its data-row and its on-keydown argument are
         one and the same context, so a press cannot be aimed by hand. */
      pressFocused: async (key) => {
        const node = document.activeElement;
        const rowId = node && node.dataset ? node.dataset.row : null;
        const e = {
          key, stopped: false, prevented: false, target: node,
          altKey: false, metaKey: false, ctrlKey: false, shiftKey: false,
          stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; },
        };
        for (const l of listeners.filter((l) => l.type === 'keydown' && isCapture(l))) l.fn(e);
        if (!e.stopped && rowId) handlers.dlKey({ event: e, node }, rowId);
        await new Promise((r) => setTimeout(r, 0));
        return e;
      },
      weekPlace: (rowId, weekIdx) => handlers.weekPlace(null, rowId, weekIdx),
      weekHover: (rowId, weekIdx) => handlers.weekHover(null, rowId, weekIdx),
      saving: (on) => { sprintItemSaving = on; },
    };
  `)(rows, sprints) as Harness;
};

/** Sprint A: Mon 3 Aug – Thu 6 Aug (ends mid-week); Sprint B: Mon 10 – Fri 14 Aug. */
const SPRINTS = [
  { id: 's1', name: 'Sprint A', start: '2026-08-03', end: '2026-08-06' },
  { id: 's2', name: 'Sprint B', start: '2026-08-10', end: '2026-08-14' },
];
const ROWS = (): Row[] => [
  // Tue, deadline Wed — the card the drag cases move
  { id: 'r1', sprintId: 's1', startsOn: '2026-08-04', finish: '2026-08-06', deadline: '2026-08-05', late: false },
  // Tue, no deadline — the sprint's end is the only bound inside the week
  { id: 'r2', sprintId: 's1', startsOn: '2026-08-04', finish: '2026-08-05', deadline: null, late: false },
  // Mon of Sprint B, and Fri of Sprint B — the week's two edges, for the nudge
  { id: 'r3', sprintId: 's2', startsOn: '2026-08-10', finish: '2026-08-11', deadline: null, late: false },
  { id: 'r4', sprintId: 's2', startsOn: '2026-08-14', finish: '2026-08-14', deadline: null, late: false },
  // unplotted — no week, nothing to drag
  { id: 'r5', sprintId: 's2', startsOn: null, finish: null, deadline: null, late: false },
  // displaced — outside any sprint (owl #90), on a Wednesday
  { id: 'r6', sprintId: null, startsOn: '2026-08-05', finish: '2026-08-06', deadline: null, late: false },
];
const URL_OF = (id: string) => `/api/projects/p1/sprint-items/${id}`;
const dragTypes = (h: Harness): string[] => h.listeners.map((l) => l.type).sort();

describe('dlDragStart — arms the gesture on a PLACED card in the OPEN lane, and nothing else', () => {
  it('arms `dlDrag` with the row, its day, its week, and binds the four window listeners', () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    expect(h.state.dlDrag).toEqual({ rowId: 'r1', fromDay: '2026-08-04', day: '2026-08-04', refused: false, weekKey: '2026-08-03' });
    expect(dragTypes(h)).toEqual(['keydown', 'pointercancel', 'pointermove', 'pointerup']);
    // Escape rides the CAPTURE phase, so it is read before anything else on the page
    const key = h.listeners.find((l) => l.type === 'keydown')!;
    expect(key.opts === true || (key.opts as { capture?: boolean })?.capture === true).toBe(true);
    // and the pointer's own click is cancelled — the drag owns the gesture
    let prevented = false;
    const g = harness(ROWS(), SPRINTS);
    g.start('r1', { preventDefault() { prevented = true; } });
    expect(prevented).toBe(true);
  });

  it('does NOT arm on an unplotted row, a row the list lacks, a secondary button, a closed lane, or mid-write', () => {
    const cases: Array<[string, (h: Harness) => void]> = [
      ['an unplotted row', (h) => h.start('r5')],
      ['a row the list lacks', (h) => h.start('nope')],
      ['a secondary button', (h) => h.start('r1', { button: 2 })],
      ['a lane that is not open', (h) => { h.state.expandedWeek = '2026-08-10'; h.start('r1'); }],
      ['a collapsed tab', (h) => { h.state.expandedWeek = null; h.start('r1'); }],
      ['a write in flight', (h) => { h.saving(true); h.start('r1'); }],
    ];
    for (const [name, arm] of cases) {
      const h = harness(ROWS(), SPRINTS);
      arm(h);
      expect(h.state.dlDrag, `${name} armed a drag`).toBeNull();
      expect(h.listeners, `${name} bound listeners`).toEqual([]);
    }
  });

  it('arms a DISPLACED row too (sprintId null, owl #90) — its kept day still has a week to move inside', () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r6');
    expect(h.state.dlDrag).toMatchObject({ rowId: 'r6', fromDay: '2026-08-05', weekKey: '2026-08-03' });
  });

  it('leaves the card’s own LINKS their pointer — a press that begins on one arms nothing (PLAN.md amendment 12)', () => {
    /* The card holds a Trello mark and a Figma mark, and a press on one
       bubbles out to this handler. Armed from there, the gesture cancelled
       the link's own click (`preventDefault`) and, on release, wrote a day
       AND opened the tab — two acts from one press, neither asked for.
       The whole card is still the drag source (#89 §1) minus the two things
       that have a pointer act of their own. */
    const h = harness(ROWS(), SPRINTS);
    let prevented = false;
    h.start('r1', { preventDefault() { prevented = true; } }, 'link');
    expect(h.state.dlDrag, 'a press on a link armed the drag').toBeNull();
    expect(h.listeners).toEqual([]);
    expect(prevented, 'the link’s own click was cancelled').toBe(false);
    // IS NOT VACUOUS — the same press on the CARD arms it
    const g = harness(ROWS(), SPRINTS);
    g.start('r1');
    expect(g.state.dlDrag).toMatchObject({ rowId: 'r1' });
  });

  it('lets ONE pointer own the gesture — a second finger cannot take it over, and the first hand still lands it', async () => {
    /* `touch-action: none` on the card means two fingers can be on this tab
       at once. Without an owner, a second pointerdown on ANOTHER card re-armed
       `dlDrag` behind the first, and the FIRST finger's release then wrote the
       second card to the day the first hand was over — a write on a card
       nobody dragged. Both halves are here: the second press arms nothing, and
       a release carrying the other pointer's id is not the drop. */
    const h = harness(ROWS(), SPRINTS);
    h.start('r1', { pointerId: 1 });
    h.start('r2', { pointerId: 2 });
    expect(h.state.dlDrag).toMatchObject({ rowId: 'r1', fromDay: '2026-08-04' });
    h.hit({ day: '2026-08-03', week: '2026-08-03' });
    h.move({ pointerId: 1 });
    // the other hand's release is not this gesture's
    await h.up({ pointerId: 2 });
    expect(h.sent, 'a stray pointer ended the drag').toEqual([]);
    expect(h.state.dlDrag, 'a stray pointer cleared the gesture').not.toBeNull();
    // …and the hand that started it still lands the drop
    await h.up({ pointerId: 1 });
    expect(h.sent.map((x) => x.body)).toEqual([{ starts_on: '2026-08-03' }]);
    expect(h.state.dlDrag).toBeNull();
  });
});

describe('dlDragMove — names the column under the pointer INSIDE the lane, and dresses the card', () => {
  it('a day column of the SAME lane names the day; a placeable one is not refused', () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    h.hit({ day: '2026-08-03', week: '2026-08-03' });
    h.move();
    expect(h.state.dlDrag).toMatchObject({ day: '2026-08-03', refused: false });
  });

  it('the FOUR refusals dress the card `refused` — another week, outside the sprint, past the deadline, no column', () => {
    const refusals: Array<[string, string, { day: string; week: string } | null]> = [
      ['another week (a column of another lane)', 'r1', { day: '2026-08-10', week: '2026-08-10' }],
      ['outside the sprint (the Friday after a Thursday end)', 'r2', { day: '2026-08-07', week: '2026-08-03' }],
      ['past the deadline (Thursday after a Wednesday deadline)', 'r1', { day: '2026-08-06', week: '2026-08-03' }],
      ['no column under the pointer at all', 'r1', null],
    ];
    for (const [name, rowId, at] of refusals) {
      const h = harness(ROWS(), SPRINTS);
      h.start(rowId);
      h.hit(at);
      h.move();
      expect(h.state.dlDrag!.refused, `${name} was not refused`).toBe(true);
      // a column outside the lane, or none, names NO day; a day inside the
      // lane that fails the guard is named AND refused
      if (at && at.week === '2026-08-03') expect(h.state.dlDrag!.day).toBe(at.day);
      else expect(h.state.dlDrag!.day).toBeNull();
    }
  });

  it('a pointer resting on the card names the day it came from — not refused, and a no-op on release', async () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    h.hit({ day: '2026-08-04', week: '2026-08-03' });
    h.move();
    expect(h.state.dlDrag).toMatchObject({ day: '2026-08-04', refused: false });
    await h.up();
    expect(h.sent).toEqual([]); // invariant 10 logs changes, not attempts
  });

  it('cancels on a BUTTON-LESS pointer — a lost pointerup does not leave the card armed', () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    h.move({ buttons: 0 });
    expect(h.state.dlDrag).toBeNull();
    expect(h.listeners).toEqual([]);
    expect(h.fired).toContain('dlDragCancel');
  });

  it('does nothing when no drag is live', () => {
    const h = harness(ROWS(), SPRINTS);
    h.hit({ day: '2026-08-03', week: '2026-08-03' });
    h.move();
    expect(h.state.dlDrag).toBeNull();
  });
});

describe('dlDragEnd — a valid drop writes `{ starts_on }` optimistically; every refusal writes NOTHING and snaps back', () => {
  it('PATCHes the row with the dropped day, the card already moved for the flight, and clears the gesture', async () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    h.hit({ day: '2026-08-03', week: '2026-08-03' });
    h.move();
    await h.up();
    expect(h.sent).toEqual([{
      method: 'PATCH', url: URL_OF('r1'), body: { starts_on: '2026-08-03' },
      stagedStart: '2026-08-03', stagedSprint: 's1', dragAt: null,
    }]);
    expect(h.row('r1').startsOn).toBe('2026-08-03'); // the optimistic stamp stays on success
    expect(h.state.dlDrag).toBeNull();
    expect(h.listeners).toEqual([]); // the listeners come down FIRST, on every path
    expect(h.fired).toContain('loadAll'); // the server's finish and holiday-aware day come with the reload
  });

  it('carries the finish along by the same distance for the flight — the bar keeps its width', async () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r2'); // Tue → Wed, a one-day move
    h.hit({ day: '2026-08-05', week: '2026-08-03' });
    h.move();
    await h.up();
    expect(h.row('r2')).toMatchObject({ startsOn: '2026-08-05', finish: '2026-08-06' });
  });

  it('the FOUR refusals leave the card in place and fire NO PATCH', async () => {
    const refusals: Array<[string, string, { day: string; week: string } | null]> = [
      ['another week', 'r1', { day: '2026-08-10', week: '2026-08-10' }],
      ['outside the sprint', 'r2', { day: '2026-08-07', week: '2026-08-03' }],
      ['past the deadline', 'r1', { day: '2026-08-06', week: '2026-08-03' }],
      ['no column', 'r1', null],
    ];
    for (const [name, rowId, at] of refusals) {
      const h = harness(ROWS(), SPRINTS);
      const before = h.row(rowId).startsOn;
      h.start(rowId);
      h.hit(at);
      h.move();
      await h.up();
      expect(h.sent, `${name} reached the wire`).toEqual([]);
      expect(h.row(rowId).startsOn, `${name} moved the card`).toBe(before);
      expect(h.state.dlDrag, `${name} left the gesture armed`).toBeNull();
      expect(h.listeners, `${name} left listeners bound`).toEqual([]);
      expect(h.banners, `${name} raised a banner for a client-side refusal`).toEqual([]);
    }
  });

  it('IS NOT VACUOUS about the refusals — the same drop on a day the guard allows DOES reach the wire', async () => {
    // the refusal cases above would all pass against a harness whose write
    // path is broken; this is the control that says the path is live
    const h = harness(ROWS(), SPRINTS);
    h.start('r2');
    h.hit({ day: '2026-08-06', week: '2026-08-03' }); // Thursday: in week, in sprint (ends Thu), no deadline
    h.move();
    await h.up();
    expect(h.sent.map((s) => s.body)).toEqual([{ starts_on: '2026-08-06' }]);
  });

  it('a drop the SERVER refuses rolls the card back and shows the server’s own sentence (invariant 8)', async () => {
    // the holiday is the server's to refuse (invariant 11): the client waved
    // the day through, the calendar did not — the stamp comes off, the
    // banner says why
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    h.hit({ day: '2026-08-03', week: '2026-08-03' });
    h.move();
    h.failNext('That day is not a working day.');
    await h.up();
    expect(h.sent).toHaveLength(1);
    expect(h.row('r1').startsOn).toBe('2026-08-04'); // snapped back to the start the server still holds
    expect(h.banners).toEqual(['That day is not a working day.']);
    expect(h.state.dlDrag).toBeNull();
  });

  it('writes nothing when another write is already in the air', async () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    h.hit({ day: '2026-08-03', week: '2026-08-03' });
    h.move();
    h.saving(true);
    await h.up();
    expect(h.sent).toEqual([]);
    expect(h.state.dlDrag).toBeNull();
  });
});

describe('Escape cancels a live drag without writing — and only Escape, and only while a drag is live', () => {
  it('claims Escape on the window’s capture phase: the gesture ends, nothing is sent, nothing else sees the key', async () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    h.hit({ day: '2026-08-03', week: '2026-08-03' });
    h.move();
    const e = await h.press('Escape', null);
    expect(e.stopped).toBe(true);
    expect(h.state.dlDrag).toBeNull();
    expect(h.listeners).toEqual([]);
    expect(h.sent).toEqual([]);
    expect(h.row('r1').startsOn).toBe('2026-08-04');
    // a later pointerup — the button coming up after the cancel — writes nothing
    await h.up();
    expect(h.sent).toEqual([]);
  });

  it('leaves every OTHER key alone mid-drag', async () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    for (const key of ['a', 'Enter', 'Tab', 'ArrowLeft']) {
      const e = await h.press(key, null);
      expect(e.stopped, key).toBe(false);
    }
    expect(h.state.dlDrag).not.toBeNull();
  });

  it('claims nothing when no drag is live — the window listener is not even bound', async () => {
    const h = harness(ROWS(), SPRINTS);
    const e = await h.press('Escape', null);
    expect(e.stopped).toBe(false);
    expect(h.listeners).toEqual([]);
  });

  it('pointercancel ends the gesture the same way', () => {
    const h = harness(ROWS(), SPRINTS);
    h.start('r1');
    h.lost();
    expect(h.state.dlDrag).toBeNull();
    expect(h.listeners).toEqual([]);
  });
});

describe('dlKey — ArrowLeft / ArrowRight route to dlNudge; Escape cancels; every other key is left alone (v1.4 §8)', () => {
  it('ArrowLeft nudges one weekday back and ArrowRight one forward, through the same write', async () => {
    const h = harness(ROWS(), SPRINTS);
    let e = await h.press('ArrowLeft', 'r1'); // Tue → Mon
    expect(e.prevented).toBe(true);
    expect(h.fired).toContain('dlNudge');
    expect(h.sent.map((s) => [s.url, s.body])).toEqual([[URL_OF('r1'), { starts_on: '2026-08-03' }]]);
    expect(h.row('r1').startsOn).toBe('2026-08-03');
    e = await h.press('ArrowRight', 'r1'); // Mon → Tue
    expect(e.prevented).toBe(true);
    expect(h.sent.map((s) => s.body)).toEqual([{ starts_on: '2026-08-03' }, { starts_on: '2026-08-04' }]);
  });

  it('refuses the nudge at the week’s edges — Monday left and Friday right go NOWHERE (#89 §1)', async () => {
    const h = harness(ROWS(), SPRINTS);
    await h.press('ArrowLeft', 'r3'); // Mon 10 Aug → Sunday: outside the week
    await h.press('ArrowRight', 'r4'); // Fri 14 Aug → Saturday: outside the week
    expect(h.sent).toEqual([]);
    expect(h.row('r3').startsOn).toBe('2026-08-10');
    expect(h.row('r4').startsOn).toBe('2026-08-14');
  });

  it('refuses a nudge past the deadline and one out of the sprint, and shows the refused wash for a beat', async () => {
    const h = harness(ROWS(), SPRINTS);
    await h.press('ArrowRight', 'r1'); // Tue → Wed, the deadline day: allowed
    expect(h.sent).toHaveLength(1);
    await h.press('ArrowRight', 'r1'); // Wed → Thu, past the deadline: refused
    expect(h.sent).toHaveLength(1);
    expect(h.row('r1').startsOn).toBe('2026-08-05');
    expect(h.state.dlDrag).toMatchObject({ rowId: 'r1', refused: true, day: null }); // the marker, cleared by its own timer
    const g = harness(ROWS(), SPRINTS);
    await g.press('ArrowRight', 'r2'); // Tue → Wed: allowed
    await g.press('ArrowRight', 'r2'); // Wed → Thu (the sprint's last day): allowed
    await g.press('ArrowRight', 'r2'); // Thu → Fri: outside the sprint, refused
    expect(g.sent.map((s) => s.body)).toEqual([{ starts_on: '2026-08-05' }, { starts_on: '2026-08-06' }]);
    expect(g.row('r2').startsOn).toBe('2026-08-06');
  });

  it('ignores every other key — no nudge, no preventDefault, so the browser keeps Tab and Space', async () => {
    const h = harness(ROWS(), SPRINTS);
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab', 'a']) {
      const e = await h.press(key, 'r1');
      expect(e.prevented, key).toBe(false);
    }
    expect(h.fired).not.toContain('dlNudge');
    expect(h.sent).toEqual([]);
  });

  it('Escape on the card cancels a live pointer drag, and does nothing when none is live', async () => {
    const h = harness(ROWS(), SPRINTS);
    await h.press('Escape', 'r1');
    expect(h.fired).not.toContain('dlDragCancel');
    h.start('r1');
    await h.press('Escape', 'r1');
    expect(h.state.dlDrag).toBeNull();
    expect(h.sent).toEqual([]);
  });

  it('nudges nothing on an unplotted row, and nothing mid-write', async () => {
    const h = harness(ROWS(), SPRINTS);
    await h.press('ArrowRight', 'r5');
    h.saving(true);
    await h.press('ArrowRight', 'r1');
    expect(h.sent).toEqual([]);
  });

  it('a server refusal of the nudge rolls the row back with the sentence (invariant 8)', async () => {
    const h = harness(ROWS(), SPRINTS);
    h.failNext("That day is outside the card's assigned week (Mon 3 Aug 2026 – Fri 7 Aug 2026).");
    await h.press('ArrowLeft', 'r1');
    expect(h.sent).toHaveLength(1);
    expect(h.row('r1').startsOn).toBe('2026-08-04');
    expect(h.banners).toEqual(["That day is outside the card's assigned week (Mon 3 Aug 2026 – Fri 7 Aug 2026)."]);
  });

  it('STEPS OVER a holiday — the keyboard reaches every day the pointer reaches (PLAN.md amendment 13; v1.4 §8)', async () => {
    /* THE DEFECT, found at REVIEW. The nudge moved one CALENDAR day, so a
       holiday in the middle of the week was a wall: the arrow sent the
       holiday, the server refused it as NOT_A_WORKDAY, the row rolled back,
       and pressing again sent the same closed day for ever. The day beyond it
       was reachable by pointer and unreachable by key — which is NFR-9 failing
       exactly where v1.4 §8 says it may not ("not optional decoration").

       The calendar is the payload's own ARES set (80-loaders.js), which is the
       set the server judges by, so the two cannot disagree about which day the
       key meant. */
    const h = harness(ROWS(), SPRINTS);
    h.holidays(['2026-08-13']); // the Thursday of Sprint B's week
    await h.press('ArrowLeft', 'r4'); // Fri 14 → Thu 13 is closed → Wed 12
    await h.press('ArrowLeft', 'r4'); // Wed 12 → Tue 11
    expect(h.sent.map((x) => x.body)).toEqual([{ starts_on: '2026-08-12' }, { starts_on: '2026-08-11' }]);
    expect(h.row('r4').startsOn).toBe('2026-08-11');
    // IS NOT VACUOUS — with the Thursday open, the same first press lands on it
    const g = harness(ROWS(), SPRINTS);
    await g.press('ArrowLeft', 'r4');
    expect(g.sent.map((x) => x.body)).toEqual([{ starts_on: '2026-08-13' }]);
  });

  it('STOPS at the week’s edge even with the rest of the week closed — a step over never wraps (#89 §1)', async () => {
    /* The bound is the week, and stepping over holidays must not reach past
       it: a Monday whose Tue–Fri are all closed has nowhere to go RIGHT, and
       the answer is the refusal, never next Monday. The two halves together
       are what say "skip, don't wander". */
    const h = harness(ROWS(), SPRINTS);
    h.holidays(['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']);
    await h.press('ArrowRight', 'r3'); // Mon 10 Aug, the rest of its week closed
    expect(h.sent, 'the nudge wandered out of the week').toEqual([]);
    expect(h.row('r3').startsOn).toBe('2026-08-10');
    expect(h.state.dlDrag).toMatchObject({ rowId: 'r3', refused: true });
    // IS NOT VACUOUS — open one of those days and the same press lands on it
    const g = harness(ROWS(), SPRINTS);
    g.holidays(['2026-08-11', '2026-08-12', '2026-08-14']);
    await g.press('ArrowRight', 'r3');
    expect(g.sent.map((x) => x.body)).toEqual([{ starts_on: '2026-08-13' }]);
  });

  it('ignores an arrow whose target is one of the card’s own LINKS (PLAN.md amendment 12)', async () => {
    /* The links are inside the card, so a keydown on a focused link bubbles to
       the card's handler. Left and Right belong to the link while it holds
       focus — a reader moving through the card's contents must not move the
       card's DAY by doing so. */
    const h = harness(ROWS(), SPRINTS);
    const e = await h.press('ArrowRight', 'r1', { from: 'link' });
    expect(e.prevented, 'the link lost its own arrow key').toBe(false);
    expect(h.sent).toEqual([]);
    expect(h.fired).not.toContain('dlNudge');
    expect(h.row('r1').startsOn).toBe('2026-08-04');
    // IS NOT VACUOUS — the same press from the CARD moves the day
    const g = harness(ROWS(), SPRINTS);
    await g.press('ArrowRight', 'r1');
    expect(g.sent.map((x) => x.body)).toEqual([{ starts_on: '2026-08-05' }]);
  });

  it('ignores a MODIFIER chord — Alt, Meta and Ctrl arrows belong to the browser (PLAN.md amendment 12)', async () => {
    /* Alt+Left is Back, Cmd+Left is Home on a Mac, Ctrl+Left steps a word:
       every one of them is a chord the browser or the OS owns. Swallowing
       them moved the card's day AND cancelled a navigation the reader asked
       for. Shift is not in the list: it modifies nothing here, so a stray
       Shift+Arrow is an ordinary nudge rather than a dead key. */
    const h = harness(ROWS(), SPRINTS);
    for (const mod of ['altKey', 'metaKey', 'ctrlKey'] as const) {
      const e = await h.press('ArrowRight', 'r1', { mods: { [mod]: true } });
      expect(e.prevented, `${mod} was swallowed`).toBe(false);
    }
    expect(h.sent).toEqual([]);
    expect(h.row('r1').startsOn).toBe('2026-08-04');
    // IS NOT VACUOUS — the same press with no chord writes
    const plain = await h.press('ArrowRight', 'r1');
    expect(plain.prevented).toBe(true);
    expect(h.sent.map((x) => x.body)).toEqual([{ starts_on: '2026-08-05' }]);
  });

  it('SAYS why a refused nudge was refused, and says nothing on one that lands (PLAN.md amendment 14; NFR-9)', async () => {
    /* The pointer's refusal shows itself — the column under the hand never
       tints, the card washes pale. A key press has no column under it, so the
       refusal has to be SAID, and in the same voice as the server's for the
       same bound (#89 §3). Nothing is flashed when the nudge lands: a banner
       on success would teach the reader to ignore banners. */
    const edge = harness(ROWS(), SPRINTS);
    await edge.press('ArrowLeft', 'r3'); // Mon → Sunday: outside the assigned week
    expect(edge.sent).toEqual([]);
    expect(edge.banners).toHaveLength(1);
    expect(edge.banners[0], 'the week refusal does not name the week').toMatch(/assigned week/i);
    expect(edge.banners[0]).toContain('10 Aug 2026'); // the week's Monday, in the server's register
    expect(edge.banners[0]).toContain('14 Aug 2026'); // …and its Friday

    const late = harness(ROWS(), SPRINTS);
    await late.press('ArrowRight', 'r1'); // Tue → Wed, the deadline day: lands
    expect(late.banners, 'a nudge that landed flashed a sentence').toEqual([]);
    await late.press('ArrowRight', 'r1'); // Wed → Thu, past the deadline
    expect(late.banners).toHaveLength(1);
    expect(late.banners[0], 'the deadline refusal does not name the deadline').toMatch(/deadline/i);

    const out = harness(ROWS(), SPRINTS);
    await out.press('ArrowRight', 'r2'); // Tue → Wed
    await out.press('ArrowRight', 'r2'); // Wed → Thu, the sprint's last day
    await out.press('ArrowRight', 'r2'); // Thu → Fri, outside the sprint
    expect(out.banners).toHaveLength(1);
    expect(out.banners[0], 'the sprint refusal does not name the sprint').toMatch(/sprint/i);
  });

  it('does not dress a LEGAL nudge as refused — the wash belongs to the press that earned it (review 2026-09-12)', async () => {
    /* The refused marker clears itself after a beat. Press the other arrow
       inside that beat and the write went out while `dlDrag` still held the
       marker, so the card wore the pale `refused` wash for the whole flight of
       a move that was perfectly legal — the screen saying "no" to something it
       was in the middle of doing. */
    const h = harness(ROWS(), SPRINTS);
    await h.press('ArrowLeft', 'r3'); // Mon → Sunday: refused, marker up
    expect(h.state.dlDrag).toMatchObject({ rowId: 'r3', refused: true });
    await h.press('ArrowRight', 'r3'); // Mon → Tue: legal, inside the same beat
    expect(h.sent.map((x) => x.body)).toEqual([{ starts_on: '2026-08-11' }]);
    // what the card was WEARING when the request left
    expect(h.sent[0]!.dragAt, 'a legal write went out dressed refused').toBeNull();
    expect(h.state.dlDrag).toBeNull();
  });
});
/**
 * D1 — WHOSE CARD HOLDS FOCUS AFTER A NUDGE (block 9's browser pass,
 * `.claude/block9/e2e.md`).
 *
 * THE DEFECT THIS PINS: two cards on one Monday. The reader focuses one and
 * presses ArrowRight; it moves, correctly. But the reload re-renders the lane
 * and Ractive REUSES the focused `<article>` for the card that stayed — so
 * focus is never "lost", `dlRefocus`'s old test ("does anything hold it?")
 * says yes, and focus has silently become the OTHER row's. The natural second
 * press — "move it two days" — then moved a card the reader never touched and
 * banked an audit row naming them for it.
 *
 * THE RULE: focus is compared BY ROW. It goes back to the row that moved
 * whenever the element holding it is another row's card or nothing at all,
 * and is never taken from something outside the cards. A press cannot be
 * aimed by hand here (`pressFocused`): the row id the handler receives is the
 * one the FOCUSED article is bound to, exactly as the template binds it —
 * which is why a guard inside `dlNudge` comparing the two could not have
 * caught this. Ractive re-stamps `data-row` and the `on-keydown` argument
 * from the same context, so on the reused article they AGREE, both naming
 * the wrong row.
 */
describe('dlRefocus — a nudge leaves focus on the row that MOVED (block 9 E2E, defect D1)', () => {
  /** Two cards on the same Monday of Sprint B — the shape that produced it. */
  const TWO_ON_MONDAY = (): Row[] => [
    ...ROWS(),
    { id: 'r7', sprintId: 's2', startsOn: '2026-08-10', finish: '2026-08-11', deadline: null, late: false },
  ];

  it('takes focus back from the card Ractive reused, so the NEXT arrow moves the row the reader moved', async () => {
    const h = harness(TWO_ON_MONDAY(), SPRINTS);
    h.focusOn('r3');
    // the reload hands the focused <article> to r7, the card that stayed on
    // Monday — the browser reports no lost focus at any point
    h.reuseFocusAs('r7');
    h.answerNext({ ok: true, starts_on: '2026-08-11', sprint_id: 's2' });
    await h.pressFocused('ArrowRight');
    expect(h.sent.map((s) => s.url)).toEqual([URL_OF('r3')]);
    expect(h.row('r3').startsOn).toBe('2026-08-11');
    expect(h.focusedRow(), 'focus stayed on the card that did not move').toBe('r3');

    // the second press: the gesture the defect turned into someone else's edit
    h.answerNext({ ok: true, starts_on: '2026-08-12', sprint_id: 's2' });
    await h.pressFocused('ArrowRight');
    expect(h.sent.map((s) => s.url)).toEqual([URL_OF('r3'), URL_OF('r3')]);
    expect(h.row('r3').startsOn).toBe('2026-08-12');
    expect(h.row('r7').startsOn, 'the card that stayed was written by a press meant for another row').toBe('2026-08-10');
    expect(h.focusedRow()).toBe('r3');
  });

  it('still returns focus when the origin column emptied and the browser dropped it to <body>', async () => {
    // the half that always worked, and must keep working
    const h = harness(TWO_ON_MONDAY(), SPRINTS);
    h.focusOn('r3');
    h.reuseFocusAs(null);
    h.answerNext({ ok: true, starts_on: '2026-08-11', sprint_id: 's2' });
    await h.pressFocused('ArrowRight');
    expect(h.focusedRow()).toBe('r3');
    expect(h.fired).toContain('focus:r3');
  });

  it('leaves focus alone when the moved row still holds it — no needless re-focus', async () => {
    const h = harness(TWO_ON_MONDAY(), SPRINTS);
    h.focusOn('r3');
    h.answerNext({ ok: true, starts_on: '2026-08-11', sprint_id: 's2' });
    await h.pressFocused('ArrowRight');
    expect(h.focusedRow()).toBe('r3');
    expect(h.fired, 'focus was taken and given back for nothing').not.toContain('focus:r3');
  });

  it('never STEALS focus from something outside the cards (the addRefocus discipline, B2-R7)', async () => {
    const h = harness(TWO_ON_MONDAY(), SPRINTS);
    h.focusOn('r3');
    // the reader tabbed to the month navigator while the write was in the air
    h.reuseFocusAs('elsewhere');
    h.answerNext({ ok: true, starts_on: '2026-08-11', sprint_id: 's2' });
    await h.pressFocused('ArrowRight');
    expect(h.row('r3').startsOn).toBe('2026-08-11'); // the move itself stands
    expect(h.focusedRow()).toBeNull();
    expect(h.fired).not.toContain('focus:r3');
    expect(h.fired).not.toContain('blur:foreign');
  });

  it('blurs the reused card when the moved row has none to give focus back to — the next arrow then writes NOTHING', async () => {
    /* The safe half of the same rule: if the moved row's card cannot be
       found, focus must not be left sitting on another row's card, where the
       reader's next arrow would move that row. */
    const h = harness(TWO_ON_MONDAY(), SPRINTS);
    h.focusOn('r3');
    h.unrenderCard('r3');
    h.reuseFocusAs('r7');
    h.answerNext({ ok: true, starts_on: '2026-08-11', sprint_id: 's2' });
    await h.pressFocused('ArrowRight');
    expect(h.fired).toContain('blur:r7');
    expect(h.focusedRow()).toBeNull();

    await h.pressFocused('ArrowRight');
    expect(h.sent, 'an arrow with no focused card wrote something').toHaveLength(1);
    expect(h.row('r7').startsOn).toBe('2026-08-10');
    expect(h.banners).toEqual([]);
  });

  it('a REFUSED nudge writes nothing and moves no focus — the card that was pressed keeps it', async () => {
    const h = harness(TWO_ON_MONDAY(), SPRINTS);
    h.focusOn('r3');
    await h.pressFocused('ArrowLeft'); // Monday → the Sunday before: outside the week
    expect(h.sent).toEqual([]);
    expect(h.focusedRow()).toBe('r3');
    expect(h.state.dlDrag).toMatchObject({ rowId: 'r3', refused: true });
  });
});

describe('the OTHER owner — the PM’s week click sends `{ week }`, through the same write path (#88; PLAN.md handlers)', () => {
  it('weekPlace PATCHes the WEEK key, never a day, with the bar staged on the Monday for the flight', async () => {
    const h = harness(ROWS(), SPRINTS);
    await h.weekPlace('r5', 1); // an unplotted row into Sprint B's week
    expect(h.sent).toEqual([{
      method: 'PATCH', url: URL_OF('r5'), body: { week: '2026-08-10' },
      stagedStart: '2026-08-10', stagedSprint: 's2', dragAt: null,
    }]);
  });

  it('re-places a PLACED row by week too — the day is the PM’s to overwrite by week (drift report §H)', async () => {
    const h = harness(ROWS(), SPRINTS);
    await h.weekPlace('r3', 1);
    expect(h.sent.map((s) => s.body)).toEqual([{ week: '2026-08-10' }]);
  });

  it('offers and sends nothing for a week the row’s sprint cannot cover, or a week past its deadline', async () => {
    const h = harness(ROWS(), SPRINTS);
    h.weekHover('r1', 1); // Sprint A ends 6 Aug; week 2 is 10–14 Aug
    expect(h.state.hoverRow).toBe('r1');
    expect(h.state.hoverWeek).toBeNull(); // hovered, not OFFERED
    await h.weekPlace('r1', 1);
    expect(h.sent).toEqual([]);
    h.weekHover('r2', 0);
    expect(h.state.hoverWeek).toBe(0);
  });

  it('judges the offer on the week’s FIRST WORKING DAY, exactly as the route does (PLAN.md amendment 16)', async () => {
    /* THE DEFECT, found at REVIEW. A week placement lands on the week's first
       WORKING day (#89 §2), so that day is what the route judges — but the
       offer was judged on the week's SPAN. A sprint beginning mid-week (a
       Wednesday start) therefore tinted its own first week, the PM clicked,
       and the server refused on Monday, which is not a day the PM chose or
       could see. The tint now asks the same question the route will.

       Mirrored, not duplicated: `weekFirstWorkday` reads the payload's own
       ARES calendar, which is the calendar the server resolves with, and the
       server re-judges regardless — this only decides what to OFFER. */
    const midWeek = [{ id: 's1', name: 'Sprint A', start: '2026-08-05', end: '2026-08-14' }];
    const rows: Row[] = [{ id: 'x1', sprintId: 's1', startsOn: '2026-08-05', finish: '2026-08-06', deadline: null, late: false }];
    const h = harness(rows, midWeek);
    h.weekHover('x1', 0); // week 1 is 3–7 Aug; its Monday is before the sprint
    expect(h.state.hoverWeek, 'a week whose first working day is outside the sprint was offered').toBeNull();
    await h.weekPlace('x1', 0);
    expect(h.sent, 'a week the route would refuse on every day was sent').toEqual([]);

    /* …and the SAME week IS offered once its Monday and Tuesday are closed:
       the first working day is then the Wednesday the sprint starts on. That
       is the half a span test can never show, and it is why this is the first
       WORKING day and not merely the Monday. */
    const g = harness(rows, midWeek);
    g.holidays(['2026-08-03', '2026-08-04']);
    g.weekHover('x1', 0);
    expect(g.state.hoverWeek).toBe(0);
    await g.weekPlace('x1', 0);
    expect(g.sent.map((x) => x.body)).toEqual([{ week: '2026-08-03' }]);

    // a week closed end to end has no day to offer, whatever the sprint says
    const dead = harness(rows, [{ id: 's1', name: 'Sprint A', start: '2026-08-03', end: '2026-08-14' }]);
    dead.holidays(['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']);
    dead.weekHover('x1', 0);
    expect(dead.state.hoverWeek).toBeNull();
    await dead.weekPlace('x1', 0);
    expect(dead.sent).toEqual([]);
  });

  it('re-stamps the row from the SERVER’S answer before the reload (PLAN.md amendment 17; invariant 8)', async () => {
    /* A week click stages the bar on the week's MONDAY, because only the
       server knows which day of that week is open. The 200 carries the day it
       chose — and the sprint the row landed in, which a re-slot can change
       (#90) — and the row takes both BEFORE `loadAll` runs. It has to be
       before: `loadAll` swallows its own failure into a banner, so a reload
       that never landed would have left the optimistic Monday standing as a
       day the server never gave, which is the one thing invariant 8 forbids. */
    const h = harness(ROWS(), SPRINTS);
    h.answerNext({ ok: true, starts_on: '2026-08-11', sprint_id: 's2' });
    await h.weekPlace('r5', 1); // an unplotted row, staged on Mon 10 Aug
    expect(h.sent.map((x) => [x.body, x.stagedStart])).toEqual([[{ week: '2026-08-10' }, '2026-08-10']]);
    // the reload FOUND the server's day, which is what says "before"
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0]!.find((r) => r.id === 'r5')).toEqual({ id: 'r5', startsOn: '2026-08-11', sprintId: 's2' });
    expect(h.row('r5').startsOn).toBe('2026-08-11');
    expect(h.row('r5').sprintId).toBe('s2');

    /* IS NOT VACUOUS about the sprint half: an answer that names no sprint
       leaves the membership the row already had — a day move on Deadlines
       never re-files a card. */
    const g = harness(ROWS(), SPRINTS);
    g.answerNext({ ok: true, starts_on: '2026-08-03' });
    g.start('r1');
    g.hit({ day: '2026-08-03', week: '2026-08-03' });
    g.move();
    await g.up();
    expect(g.row('r1').startsOn).toBe('2026-08-03');
    expect(g.row('r1').sprintId).toBe('s1');
  });

  it('leaves the optimistic day standing when the answer names none — and rolls it back on a refusal', async () => {
    // the re-stamp is a CORRECTION, not the only writer: a 200 with no day
    // (an older server, a noop shape that lost its fields) must not blank the
    // bar, and a 4xx still rolls the whole stage back with the sentence
    const h = harness(ROWS(), SPRINTS);
    h.answerNext(null);
    await h.weekPlace('r5', 1);
    expect(h.row('r5').startsOn).toBe('2026-08-10'); // the staged Monday, kept
    const g = harness(ROWS(), SPRINTS);
    g.failNext('That week has no working day.');
    await g.weekPlace('r5', 1);
    expect(g.row('r5').startsOn).toBeNull();
    expect(g.banners).toEqual(['That week has no working day.']);
  });
});

/* ====================================================================== *
 * C2 — what a PROJECT SWITCH must take down with it
 * ====================================================================== */

describe('a project switch ends the gesture and clears block 9’s keys (the block 7 guard, re-pointed)', () => {
  it('stops the drag FIRST, then clears hoverRow, hoverWeek, dlDrag and sprintDisplaced', () => {
    /* Block 7 proved this for its own bar drag; that test went with the
       gesture and nothing replaced it. The hazard is unchanged and it is the
       LISTENERS: a Deadlines drag cannot survive a project switch — the
       pointer is held on a card that is about to stop existing — but the four
       window listeners it bound would, and a later release would then fire
       handlers against another project's rows. So `dlDragStop()` runs BEFORE
       the keys are cleared, which is the order asserted here.

       The keys go for the ordinary reason every per-project key goes: they
       name rows, weeks and sprints of the project being left. */
    const body = fnBody('resetForProjectSwitch');
    expect(body).toContain('dlDragStop()');
    for (const cleared of ['hoverRow: null', 'hoverWeek: null', 'dlDrag: null', 'sprintDisplaced: null']) {
      expect(body, `\`${cleared}\` is not cleared on a project switch`).toContain(cleared);
    }
    // the listeners come down before the state they belong to goes
    expect(body.indexOf('dlDragStop()')).toBeLessThan(body.indexOf('dlDrag: null'));
    // IS NOT VACUOUS — the reader preference this block deliberately KEEPS is
    // absent from the same body, so "contains" is doing real work here
    expect(body).not.toContain('leftCollapsed');
  });
});

/* ====================================================================== *
 * D — the stylesheet: the rules that carry a RULE
 * ====================================================================== */

describe('40-deadlines.css dresses the gesture the way the rulings say (PLAN.md styles)', () => {
  it('offers the grab ONLY inside a lane — a collapsed card has the default cursor', () => {
    expect(cssRule('.dllane .dlcard', DEADLINES_CSS)).toMatch(/cursor:\s*grab\b/);
    expect(cssRule('.dlcard', DEADLINES_CSS)).not.toMatch(/cursor:/);
  });

  it('turns the browser’s touch gestures off on the source, so a finger drags the card and not the page', () => {
    expect(cssRule('.dllane .dlcard', DEADLINES_CSS)).toMatch(/touch-action:\s*none/);
  });

  it('lifts the dragged card and washes a refused one pale with a dashed outline (block 7’s treatment, reused)', () => {
    const dragging = cssRule('.dlcard.dragging', DEADLINES_CSS);
    expect(dragging).toMatch(/cursor:\s*grabbing/);
    expect(dragging).toMatch(/opacity:\s*0?\.9\b/);
    expect(dragging).toMatch(/box-shadow/);
    const refused = cssRule('.dlcard.refused', DEADLINES_CSS);
    expect(refused).toMatch(/cursor:\s*not-allowed/);
    expect(refused).toMatch(/opacity:\s*0?\.45\b/);
    expect(refused).toMatch(/outline:\s*1px dashed/);
  });

  it('tints the drop column, and rings the focused card for the keyboard path', () => {
    expect(cssRule('.dlday.target', DEADLINES_CSS)).toMatch(/background/);
    expect(cssRule('.dllane .dlcard:focus-visible', DEADLINES_CSS)).toMatch(/outline:\s*2px solid/);
  });

  it('never takes the card or a column out of hit-testing — the sweep’s home is drag-hittest, this is the local read', () => {
    // rule 3: raw text, comments included — the sheet may DISCUSS the law in
    // prose, so the read is of declarations only
    const code = DEADLINES_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(code).not.toMatch(/pointer-events\s*:\s*none/i);
  });
});

/* ====================================================================== *
 * E — the live region: a refusal reaches assistive technology
 * ====================================================================== */

/**
 * The shell, rendered the way the browser renders it. `40-app-state.js` hands
 * Ractive `template: '#tpl-app'`, so what runs is the script element's INNER
 * html — the wrapper tag is never part of the template (the same slice
 * test/template-partials.test.ts takes, for the same reason).
 *
 * The WHOLE composed template goes in, not a subtree chosen by hand: the claim
 * under test is that the region is there with NO view state at all, and a
 * slice picked by a human could only beg that question. With no `activeTab`
 * every view guard is false, so what comes back is the chrome alone.
 */
const Ractive = RactiveModule as unknown as {
  new (opts: { template: string; data: Record<string, unknown> }): { toHTML(): string };
};

const SHELL_TEMPLATE = (() => {
  const inner = /<script id="tpl-app"[^>]*>([\s\S]*)<\/script>/.exec(TEMPLATE);
  if (!inner) throw new Error('deadlines-drag: no <script id="tpl-app"> wrapper in the composed template');
  return inner[1]!;
})();

const renderShell = (banner: string | null): string =>
  new Ractive({ template: SHELL_TEMPLATE, data: { banner } }).toHTML();

/**
 * Every live region in a rendered fragment, with the text it would announce.
 * Text-only elements by design: a region announces a SENTENCE, and both of the
 * nodes this section is about hold nothing else. Read as "live region", not as
 * `role="status"`, so a rewrite to `aria-live` is still seen.
 */
const liveRegions = (html: string): { tag: string; text: string }[] =>
  [...html.matchAll(/<(span|div)\b([^>]*)>([^<]*)<\/\1>/g)]
    .filter((m) => /\brole="(?:status|alert|log)"|\baria-live=/.test(m[2]!))
    .map((m) => ({ tag: m[1]!, text: m[3]! }));

/** The region's own open tag — identity, for the "same node" read. */
const regionTag = (html: string): string | null => /<span[^>]*\brole="status"[^>]*>/.exec(html)?.[0] ?? null;

/**
 * Every shipped stylesheet as one string, in build.js's own order. The helper
 * in gantt-render.ts reads sheets ONE at a time because its guards are each
 * about one sheet; this one is about all of them — the shell's hidden-region
 * rule must be declared exactly once in what the page actually loads, and
 * naming its home file would pin the guard to today's split.
 */
const ALL_CSS = (() => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'styles');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
})();

/** `{ selector, body }` for every rule in a corpus, comments stripped (rule 3). */
const rulesOf = (css: string): { selector: string; body: string }[] =>
  /* One match per `selector { … }`. Neither group can cross a brace, so each
     selector starts where the previous rule's `}` left off and an `@media`
     wrapper never matches as a rule of its own. */
  [...css.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));

/** A rule's declarations, normalised and sorted — for comparing two recipes. */
const decls = (body: string): string[] =>
  body
    .split(';')
    .map((d) => d.trim().replace(/\s*:\s*/, ': '))
    .filter(Boolean)
    .sort();

/** The body of a `cssRule()` slice, which carries its selector line. */
const bodyOf = (rule: string): string => rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}'));

describe('a flashed sentence reaches a screen reader (PLAN.md amendment 14; the always-present region, main thread 2026-09-12)', () => {
  /* WHY THE REGION IS NOT THE VISIBLE BANNER. The four refusals are FLASHED,
     and a flashed sentence nothing announces is not the accessible path v1.4
     §8 asks for — it is the same silence, moved. The amber node cannot be the
     announcer: Ractive creates it together with its text, and a region that
     arrives already populated is announced unreliably — the FIRST sentence,
     the one a refusal most needs heard, is the one most often dropped. So the
     region is always in the document, empty at rest, and a flash is a text
     CHANGE inside something the screen reader is already watching.

     Asserted by rendering the shell rather than by reading the template, and
     at rest as well as populated: "present when there is nothing to say" is
     the whole of the ruling, and no source regex can state it. */
  const SENTENCE = 'That day is outside the card’s week.';

  it('carries the region AT REST — it is in the shell before any sentence exists', () => {
    const rest = renderShell(null);
    const regions = liveRegions(rest);
    expect(regions, 'the shell has no live region until a sentence exists — the first one will be missed').toHaveLength(
      1,
    );
    expect(regions[0]!.text, 'the region at rest is not empty').toBe('');
    // and nothing visible was added by it: the amber node still exists only
    // when there is something to show
    expect(rest, 'the visible banner renders with no sentence to carry').not.toContain('class="banner"');
  });

  it('flashes into that SAME node — the region is never created with its text', () => {
    const flashed = renderShell(SENTENCE);
    const regions = liveRegions(flashed);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.text).toBe(SENTENCE);
    // identity: the same open tag is already there with `banner` null, so the
    // sentence arrives as a change inside an existing region, not with one
    expect(regionTag(renderShell(null))).not.toBeNull();
    expect(regionTag(flashed)).toBe(regionTag(renderShell(null)));
  });

  it('announces it ONCE — the visible banner keeps the text and is no longer a region', () => {
    const flashed = renderShell(SENTENCE);
    const visible = /<div class="banner"[^>]*>([^<]*)<\/div>/.exec(flashed);
    expect(visible, 'the shell lost its visible banner').not.toBeNull();
    expect(visible![1], 'the eye no longer gets the sentence').toBe(SENTENCE);
    expect(visible![0], 'the sentence is announced twice').not.toContain('role=');
    expect(visible![0]).not.toContain('aria-live');
    // exactly one element carries the sentence in a live region…
    expect(liveRegions(flashed).filter((r) => r.text === SENTENCE)).toHaveLength(1);
    // …and the shell ships exactly one region, politely
    expect(flashed.match(/role="status"/g) ?? []).toHaveLength(1);
    expect(flashed).not.toContain('role="alert"'); // polite, never assertive
  });

  it('and the render WOULD see the arrangement this replaced (negative control)', () => {
    /* The region created together with its text: at rest there is nothing for
       a screen reader to be watching. If the reads above could not tell the
       two apart they would pass on either, which is how this shipped. */
    const old = (banner: string | null): string =>
      new Ractive({
        template: '{{#if banner}}<div class="banner" role="status">{{banner}}</div>{{/if}}',
        data: { banner },
      }).toHTML();
    expect(liveRegions(old(null))).toHaveLength(0);
    expect(liveRegions(old(SENTENCE))).toHaveLength(1);
  });

  it('hides the region OFF-SCREEN, never out of the box tree — the house recipe, unscoped for the shell', () => {
    const tag = regionTag(renderShell(null));
    expect(tag, 'the region is not a span any more — re-point this read').not.toBeNull();
    const cls = /class="([^"]*)"/.exec(tag!)?.[1]?.trim();
    expect(cls, 'the region carries no class, so nothing hides it').toBeTruthy();

    const rules = rulesOf(ALL_CSS);
    // non-vacuous: the corpus read really did parse the shell's own sheet
    expect(rules.filter((r) => r.selector === '.banner'), 'the stylesheet read found nothing').toHaveLength(1);

    const hiding = rules.filter((r) => r.selector === `.${cls}`);
    expect(hiding, `the app ships no unscoped rule for \`${cls}\` — the region is visible on every screen`).toHaveLength(
      1,
    );
    // derive, don't copy: the recipe IS the gantt sheet's hidden status line,
    // declaration for declaration, with the tab scope taken off
    expect(decls(hiding[0]!.body)).toEqual(decls(bodyOf(cssRule('.gantt .gvh', GANTT_CSS))));
    expect(hiding[0]!.body).toMatch(/position:\s*absolute/);
    expect(hiding[0]!.body).toMatch(/clip:\s*rect\(/);
    // a region taken out of the box tree is announced by nothing at all
    expect(hiding[0]!.body).not.toMatch(/display\s*:\s*none/i);
    expect(hiding[0]!.body).not.toMatch(/visibility\s*:\s*hidden/i);
  });
});
