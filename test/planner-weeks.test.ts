/**
 * R2 week/month labels + §3.4 bar geometry — the CLIENT half of the Gantt
 * planner (owl #22, node 95:5795).
 *
 * Why this file is unlike every other test here: the frozen contract keeps the
 * visible window client-side on purpose (§0/§3.3) — it is pure calendar
 * arithmetic with no database input, so week nav stays fetch-free. That put
 * R2, the ruling that FIXES the frame's OCTOBER mislabel, outside the server
 * suite entirely, and the repo has no browser test runner. Rather than let the
 * ruling ship untested, this file executes the SHIPPED TEXT of the planner's
 * date helpers straight out of `frontend/scripts/*.js`. Nothing is retyped: if
 * `plannerWeeks()` regresses in the real file, these assertions fail.
 *
 * The extractor keys on declaration names. Rename `plannerWeeks`,
 * `plannerMonths`, `mondaysBetween` or `dayIndex` and this file fails loudly
 * with the missing name — which is correct, those names are contract §3.3–3.5.
 */

import { describe, expect, it } from 'vitest';
import { appScripts } from './helpers/source.ts';
import { method } from './helpers/gantt-render.ts';

// One corpus for every slice: `mondayShift` lives in 00-api.js and the rest in
// the app scripts, but the browser runs them in one scope — so does this harness.
const APP = appScripts();

/**
 * Slice one top-level declaration out of a source file. A `function` ends with
 * the brace that closes its body; a `const` ends with the first `;` outside
 * any bracket — which is what lets a multi-line arrow through in one piece.
 */
function decl(src: string, name: string): string {
  const fnAt = src.indexOf(`\nfunction ${name}(`);
  if (fnAt >= 0) {
    let depth = 0;
    for (let i = src.indexOf('{', fnAt); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return src.slice(fnAt, i + 1);
    }
    throw new Error(`planner-weeks: unterminated function \`${name}\``);
  }
  const at = src.indexOf(`\nconst ${name} =`);
  if (at < 0) throw new Error(`planner-weeks: no declaration of \`${name}\` in the shipped frontend source`);
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i]!;
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`planner-weeks: unterminated declaration \`${name}\``);
}


interface Week { key: string; fridayIso: string; wk: string; sub: string; monthKey: string; month: string }
interface Harness {
  setWeek(w: string): void;
  weeks(): Week[];
  months(): Array<{ month: string; monthKey: string; span: number }>;
  mondaysBetween(a: string, b: string): number;
  dayIndex(iso: string): number;
  dayAtX(clientX: number, rect: { left: number; width: number }, weeks: { key: string }[]): string | null;
  plusLeft(day: string | null): string | null;
  unitPct(u: number): string;
  TOTAL_UNITS: number;
  WEEK_COUNT: number;
}

const source = [
  decl(APP, 'WEEK_COUNT'),
  decl(APP, 'WORKDAYS_PER_WEEK'),
  decl(APP, 'MONTHS_LONG'),
  decl(APP, 'MONTHS_SHORT'),
  decl(APP, 'mondayShift'),
  decl(APP, 'isoOf'),
  decl(APP, 'isoAddDays'),
  decl(APP, 'mondayIso'),
  decl(APP, 'fmtMonthDay'),
  decl(APP, 'mondaysBetween'),
  decl(APP, 'TOTAL_UNITS'),
  decl(APP, 'dayIndex'),
  decl(APP, 'pctOf'),
  decl(APP, 'unitPct'),
  decl(APP, 'dayAtX'),
  decl(APP, 'plusLeft'),
  `const computed = { ${method('plannerWeeks')}, ${method('plannerMonths')} };`,
].join('\n');

// `dayIndex` reads the window origin off the Ractive instance; the harness is
// that instance's only surface, so the shipped body runs unmodified.
const harness = new Function(`
  const WEEK_START = { v: '2026-08-03' };
  const ctx = { get: (k) => (k === 'weekStart' ? WEEK_START.v : undefined) };
  const app = ctx;
  ${source}
  const self = { get: (k) => (k === 'plannerWeeks' ? computed.plannerWeeks.call(ctx) : ctx.get(k)) };
  return {
    setWeek: (w) => { WEEK_START.v = w; },
    weeks: () => computed.plannerWeeks.call(ctx),
    months: () => computed.plannerMonths.call(self),
    mondaysBetween, dayIndex, dayAtX, plusLeft, unitPct, TOTAL_UNITS, WEEK_COUNT,
  };
`)() as Harness;

describe('R2 — planner week + month labels derive from the real dates', () => {
  it('draws the frame\'s 12 columns from consecutive Mondays', () => {
    harness.setWeek('2026-08-03');
    expect(harness.WEEK_COUNT).toBe(12);
    expect(harness.weeks().map((w) => w.key)).toEqual([
      '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07',
      '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19',
    ]);
  });

  it('numbers wkN as the Monday\'s ordinal within ITS OWN month', () => {
    harness.setWeek('2026-08-03');
    expect(harness.weeks().map((w) => w.wk)).toEqual([
      'wk1', 'wk2', 'wk3', 'wk4', 'wk5', 'wk1', 'wk2', 'wk3', 'wk4', 'wk1', 'wk2', 'wk3',
    ]);
  });

  it('assigns a week to its MONDAY\'s month, so Aug 31–Sep 4 stays AUGUST', () => {
    harness.setWeek('2026-08-03');
    const w = harness.weeks();
    expect(w[4]).toMatchObject({ key: '2026-08-31', month: 'AUGUST', monthKey: '2026-08', wk: 'wk5', sub: 'Aug 31–4' });
  });

  it('fixes the frame\'s OCTOBER mislabel by construction (spans 5 / 4 / 3)', () => {
    harness.setWeek('2026-08-03');
    expect(harness.months()).toEqual([
      { month: 'AUGUST', monthKey: '2026-08', span: 5 },
      { month: 'SEPTEMBER', monthKey: '2026-09', span: 4 },
      { month: 'OCTOBER', monthKey: '2026-10', span: 3 }, // the frame reads SEPTEMBER here
    ]);
  });

  it('formats the sub-label with the shared 13f helpers, never "Sept"', () => {
    harness.setWeek('2026-08-03');
    const w = harness.weeks();
    expect(w.slice(0, 2).map((x) => x.sub)).toEqual(['Aug 3–7', 'Aug 10–14']);
    expect(w.map((x) => x.month + x.sub).join(' ')).not.toMatch(/Sept\b/);
  });

  it('numbers a month whose first Monday is the 1st, and one whose first is the 7th', () => {
    harness.setWeek('2026-06-01'); // Mondays 1, 8, 15, 22, 29
    expect(harness.weeks().slice(0, 5).map((w) => w.wk)).toEqual(['wk1', 'wk2', 'wk3', 'wk4', 'wk5']);
    harness.setWeek('2026-12-07'); // Mondays 7, 14, 21, 28
    const dec = harness.weeks();
    expect(dec[0]).toMatchObject({ wk: 'wk1', month: 'DECEMBER' });
    expect(dec[3]).toMatchObject({ key: '2026-12-28', month: 'DECEMBER', wk: 'wk4' });
    expect(dec[4]).toMatchObject({ key: '2027-01-04', month: 'JANUARY', wk: 'wk1' });
  });
});

describe('§3.5 — the sprint header\'s "N wk" counts Mondays', () => {
  it('reads Aug 3 – Aug 14 as 2 wk (counted, not divided)', () => {
    expect(harness.mondaysBetween('2026-08-03', '2026-08-14')).toBe(2);
    expect(harness.mondaysBetween('2026-07-20', '2026-07-31')).toBe(2);
  });

  it('gives a sprint that starts mid-week only the Mondays inside it', () => {
    expect(harness.mondaysBetween('2026-08-05', '2026-08-14')).toBe(1);
  });

  it('is 0 for an inverted or absent range', () => {
    expect(harness.mondaysBetween('2026-08-14', '2026-08-03')).toBe(0);
    expect(harness.mondaysBetween('', '2026-08-03')).toBe(0);
  });
});

describe('§3.4 — the bar axis counts WORKDAYS, so a phase boundary is day-resolution', () => {
  it('lays 5 units per week column and 60 across the window', () => {
    harness.setWeek('2026-08-03');
    expect(harness.TOTAL_UNITS).toBe(60);
    expect(harness.dayIndex('2026-08-03')).toBe(0); // Mon
    expect(harness.dayIndex('2026-08-06')).toBe(3); // Thu — mid-column, not week-blocked
    expect(harness.dayIndex('2026-08-07')).toBe(4); // Fri
    expect(harness.dayIndex('2026-08-10')).toBe(5); // next Mon — the weekend has no width
  });

  it('clamps a weekend date forward to the next Monday (defensive; forecasts never emit one)', () => {
    harness.setWeek('2026-08-03');
    expect(harness.dayIndex('2026-08-08')).toBe(5); // Sat
    expect(harness.dayIndex('2026-08-09')).toBe(5); // Sun
  });

  it('runs negative before the window and past 60 after it, so the caller can clamp', () => {
    harness.setWeek('2026-08-03');
    expect(harness.dayIndex('2026-07-31')).toBeLessThan(0);
    expect(harness.dayIndex('2026-10-26')).toBeGreaterThanOrEqual(60);
  });
});

/* ====================================================================== *
 * §3.4b — the axis has an INVERSE now (block 7, JP 2026-09-08): the
 * pointer names a workday, and the same helper that draws the bar puts
 * the + on it. These are round-trips, not copies of the arithmetic —
 * each side is executed against the other out of the shipped file.
 * ====================================================================== */

describe('dayAtX is dayIndex read backwards — one axis, two directions', () => {
  const WEEKS = Array.from({ length: 12 }, (_, i) => ({
    key: new Date(Date.UTC(2026, 7, 3) + i * 7 * 864e5).toISOString().slice(0, 10),
  }));
  const RECT = { left: 1000, width: 1104 }; // 12 × --gw, the shipped track
  const UNIT = 1104 / 60;

  it('round-trips every one of the sixty units: dayIndex(dayAtX(x)) is the unit x fell in', () => {
    /* THE PROPERTY THAT MATTERS. The bar is drawn from `dayIndex`; the
       placement and the drag both name their day through `dayAtX`. If these
       two ever disagreed by a unit, a bar would land one day away from where
       the pointer was — silently, and only for some columns. */
    harness.setWeek('2026-08-03');
    for (let u = 0; u < 60; u++) {
      const iso = harness.dayAtX(RECT.left + u * UNIT + UNIT / 2, RECT, WEEKS)!;
      expect(harness.dayIndex(iso), `unit ${u} (${iso})`).toBe(u);
    }
  });

  it('puts the + exactly on the unit the pointer named — the tint, the + and the bar share one left', () => {
    harness.setWeek('2026-08-03');
    for (let u = 0; u < 60; u++) {
      const iso = harness.dayAtX(RECT.left + u * UNIT + UNIT / 2, RECT, WEEKS)!;
      expect(harness.plusLeft(iso), `unit ${u} (${iso})`).toBe(harness.unitPct(u));
    }
    expect(harness.plusLeft('2026-08-03')).toBe('0.00');
  });

  it('follows the window when it scrolls — the same X names a different day', () => {
    // the axis is relative to `weekStart`; a chevron step must move the whole
    // mapping, not just the labels above it
    harness.setWeek('2026-08-03');
    const before = harness.dayAtX(RECT.left + 3 * UNIT + 1, RECT, WEEKS);
    expect(before).toBe('2026-08-06');
    expect(harness.plusLeft(before)).toBe(harness.unitPct(3));
    harness.setWeek('2026-08-10');
    // the WEEKS list the caller passes is what names the date, and the origin
    // the helper reads is what turns it back into a unit — one step apart, the
    // same date now falls before the window and pins to its left edge
    expect(harness.plusLeft('2026-08-06')).toBe('0.00');
    expect(harness.plusLeft('2026-08-13')).toBe(harness.unitPct(3));
  });

  it('is asymmetric at the window’s edges, exactly as the deadline tick is', () => {
    /* A day BEFORE the window pins LEFT — which is where `itemBar` has already
       clipped that row's bar to, so a dragged bar's preview opens where the
       bar visibly sits rather than jumping off the track. A day BEYOND it is
       null: nothing is drawn out there to point at, and a row starting past
       the window draws no bar to grab in the first place. Same shape as
       `deadlineTick`'s left-pin ruling (JP 2026-08-28). */
    harness.setWeek('2026-08-03');
    expect(harness.plusLeft('2026-07-31')).toBe('0.00'); // the Friday before, pinned
    expect(harness.plusLeft('2026-06-15')).toBe('0.00'); // and one far outside
    expect(harness.plusLeft('2026-10-26')).toBeNull(); // the Monday after
    expect(harness.plusLeft('2026-10-23')).toBe(harness.unitPct(59)); // the last drawn
    expect(harness.plusLeft(null)).toBeNull();
    expect(harness.plusLeft('')).toBeNull();
  });
});
