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

import { describe, expect, it } from 'vitest';
import {
  APP_JS_CODE,
  DEADLINES_CSS,
  cssRule,
  dlCardPartial,
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
    for (const bound of ['tabindex="0"', 'role="button"', 'aria-label=', "'dlDragStart'", "'dlKey'"]) {
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

  it('renders the card focusable as a BUTTON, named with its label and the day it starts (v1.4 §8)', () => {
    const [mine] = cardTags(open());
    expect(mine).toContain('tabindex="0"');
    expect(mine).toContain('role="button"');
    expect(mine).toContain('aria-label="MC-655: Sketch Asset: Hero render, starts 2026-08-04; use left and right arrows to move the day within the week"');
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

interface Sent { method: string; url: string; body: Record<string, unknown>; stagedStart: string | null }
interface Listener { type: string; fn: (e: unknown) => unknown; opts: unknown }
interface KeyEvent { key: string; stopped: boolean; prevented: boolean; stopPropagation(): void; preventDefault(): void }
interface Row { id: string; sprintId: string | null; startsOn: string | null; finish: string | null; deadline: string | null; late: boolean }
interface Harness {
  state: { sprintItems: { rows: Row[] }; dlDrag: DlDrag | null; expandedWeek: string | null; hoverRow: string | null; hoverWeek: number | null };
  sent: Sent[];
  banners: string[];
  fired: string[];
  listeners: Listener[];
  /** what `document.elementFromPoint` answers next: a day column in a lane, or nothing */
  hit(at: { day: string; week: string } | null): void;
  /** make the next PATCH fail with the server's sentence */
  failNext(message: string): void;
  row(id: string): Row;
  start(rowId: string, ev?: Record<string, unknown>): void;
  /** a pointermove delivered by the WINDOW listener */
  move(ev?: Record<string, unknown>): void;
  /** a pointerup delivered by the WINDOW listener — resolves when the write path has settled */
  up(ev?: Record<string, unknown>): Promise<void>;
  /** pointercancel from the window */
  lost(): void;
  /** a keydown as the DOM delivers one: window CAPTURE listeners first, then the focused card's own handler */
  press(key: string, focusedRowId: string | null): Promise<KeyEvent>;
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
    ...['WORKDAYS_PER_WEEK', 'isoOf', 'isoAddDays', 'mondayIso', 'dlDayPlaceable'].map((n) => topDecl(n)),
    letDecl('sprintItemSaving'),
    ...['sprintRow', 'sprintOf', 'calendarDaysBetween', 'stageStart', 'unstageStart'].map((n) => topDecl(n)),
    asyncFn('placeRow'),
    topDecl('weekOffered'),
    ...['dlDragMoveWin', 'dlDragUpWin', 'dlDragLost', 'dlDragKeyWin', 'dlDragStop', 'dlHitDay', 'DL_REFUSE_MS'].map((n) => topDecl(n)),
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
    };
    const sent = [];
    const banners = [];
    const fired = [];
    const listeners = [];
    let hitAt = null;
    let failWith = null;
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
        sent.push({ method, url, body, stagedStart: row ? row.startsOn : null });
        if (failWith) { const err = failWith; failWith = null; throw err; }
      },
    };
    const loadAll = async () => { fired.push('loadAll'); };
    const flashBanner = (t) => { banners.push(t); };
    const errText = (e) => (e && e.message) || String(e);
    const window = {
      addEventListener: (type, fn, opts) => { listeners.push({ type, fn, opts }); },
      removeEventListener: (type, fn, opts) => {
        const i = listeners.findIndex((l) => l.type === type && l.fn === fn && String(l.opts) === String(opts));
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    const lane = (weekKey) => ({ dataset: { week: weekKey } });
    const column = (at) => ({
      dataset: { day: at.day },
      closest: (sel) => (sel.startsWith('.dllane') ? lane(at.week) : null),
    });
    const document = {
      body: {},
      activeElement: null,
      querySelector: () => null,
      elementFromPoint: () => (hitAt ? { closest: (sel) => (sel.startsWith('.dlday') ? column(hitAt) : null) } : null),
    };
    ${harnessSrc}
    const isCapture = (l) => l.opts === true || !!(l.opts && l.opts.capture);
    const pointer = (ev) => ({ clientX: 10, clientY: 10, button: 0, buttons: 1, preventDefault() {}, ...ev });
    const deliver = (type, ev) => listeners.filter((l) => l.type === type).map((l) => l.fn(ev));
    return {
      state, sent, banners, fired, listeners,
      hit: (at) => { hitAt = at; },
      failNext: (message) => { failWith = new Error(message); },
      row: (id) => state.sprintItems.rows.find((r) => r.id === id),
      start: (rowId, ev) => handlers.dlDragStart({ event: pointer(ev), node: { focus() {} } }, rowId),
      move: (ev) => { deliver('pointermove', pointer(ev)); },
      up: async (ev) => { await Promise.all(deliver('pointerup', pointer(ev))); },
      lost: () => { deliver('pointercancel', {}); },
      press: async (key, focusedRowId) => {
        const e = { key, stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
        for (const l of listeners.filter((l) => l.type === 'keydown' && isCapture(l))) l.fn(e);
        if (!e.stopped && focusedRowId) handlers.dlKey({ event: e }, focusedRowId);
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
    expect(h.sent).toEqual([{ method: 'PATCH', url: URL_OF('r1'), body: { starts_on: '2026-08-03' }, stagedStart: '2026-08-03' }]);
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
});

describe('the OTHER owner — the PM’s week click sends `{ week }`, through the same write path (#88; PLAN.md handlers)', () => {
  it('weekPlace PATCHes the WEEK key, never a day, with the bar staged on the Monday for the flight', async () => {
    const h = harness(ROWS(), SPRINTS);
    await h.weekPlace('r5', 1); // an unplotted row into Sprint B's week
    expect(h.sent).toEqual([{ method: 'PATCH', url: URL_OF('r5'), body: { week: '2026-08-10' }, stagedStart: '2026-08-10' }]);
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
