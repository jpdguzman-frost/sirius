/**
 * SUITE 5 (the bar), SUITE 6 (the capacity footer) and SUITE 7 (the bar is
 * display-only — block 9's withdrawal of the day controls), split out of
 * test/sprint-schedule-render.test.ts on 2026-09-05 (PLAN.md §C). The shared prelude and the groups harness `H()`
 * live in test/helpers/sprint-schedule-tab.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  GANTT_CSS,
  OFF_BOARD,
  PLOTTED,
  renderSprintSchedule,
  topDecl,
  type SprintScheduleRow,
} from './helpers/gantt-render.ts';
import { H, appSetArg, groupsOf, rulesFor, schedulesView } from './helpers/sprint-schedule-tab.ts';

/* ====================================================================== *
 * SUITE 5 — the bar: `itemBar` EXECUTED from the shipped file.
 * The MIN_GRAB and anchor-identity arithmetic ported from
 * test/gantt-run-geometry.test.ts (retired 2026-08-28) lives here now.
 * ====================================================================== */

interface Bar {
  left: string;
  width: string;
  cls: string;
  title: string;
}
interface GeoHarness {
  itemBar(row: Partial<SprintScheduleRow>): Bar[];
  itemPhase(row: { taskPrefix?: string | null }): string;
  /** the run's width in UNITS — the one owner of the MIN_GRAB widening */
  barWidthUnits(row: Partial<SprintScheduleRow>): number | null;
  /** the resting bar's left at a day — itemBar's own clamp, factored out (one owner) */
  barLeftAt(row: Partial<SprintScheduleRow> | null, day: string | null): string | null;
  /** rule 42's string, the ONE owner of it since PLAN.md block 9 amendment 11 */
  rowTitle(row: Partial<SprintScheduleRow> | null): string;
  dayIndex(iso: string): number;
  unitPct(u: number): string;
  TOTAL_UNITS: number;
  WEEK_PX: number;
  MIN_GRAB_PX: number;
  UNIT_PX: number;
  MIN_GRAB_UNITS: number;
}

/**
 * The geometry in DECLARATION order, so every const exists by the time
 * anything is called. A few name a helper declared below them — `itemBar`
 * reaches for `itemPhase` and `barLeftAt` — which is fine for arrows nothing
 * invokes at load. ONE list: the drag harness further down executes the same
 * recipe, and a second hand-copied list is how the two drift by a helper (the
 * block-4 lesson, `PIPE_RECIPE_NAMES`).
 */
const GEO_NAMES = [
  'WEEK_COUNT', 'WEEK_PX', 'WORKDAYS_PER_WEEK', 'TOTAL_UNITS', 'dayIndex', 'clampUnits', 'pctOf', 'unitPct',
  'MIN_GRAB_PX', 'UNIT_PX', 'MIN_GRAB_UNITS', 'barWidthUnits', 'rowTitle', 'itemBar', 'itemPhase', 'barLeftAt',
];
let geo: GeoHarness | undefined;
const G = (): GeoHarness => {
  if (!geo) {
    const src = GEO_NAMES.map((n) => topDecl(n)).join('\n');
    geo = new Function(`
      const app = { get: (k) => { if (k !== 'weekStart') throw new Error('geometry harness: unstubbed app.get(' + k + ')'); return '2026-08-03'; } };
      ${src}
      return { itemBar, itemPhase, barWidthUnits, barLeftAt, rowTitle, dayIndex, unitPct, TOTAL_UNITS, WEEK_PX, MIN_GRAB_PX, UNIT_PX, MIN_GRAB_UNITS };
    `)() as GeoHarness;
  }
  return geo;
};

/** ISO date of workday unit `u` (ported), so a sweep can address every column. */
function isoAtUnit(u: number): string {
  const days = Math.floor(u / 5) * 7 + (u % 5);
  return new Date(Date.UTC(2026, 7, 3) + days * 864e5).toISOString().slice(0, 10);
}

const bar = (startsOn: string | null, finish: string | null, rest: Partial<SprintScheduleRow> = {}): Bar[] =>
  G().itemBar({ startsOn, finish, taskPrefix: 'Render Asset', ...rest });

describe('itemBar is the shipped recipe, on the shipped axis', () => {
  it('slices itemBar as a column-0 const — what makes executing it possible at all', () => {
    expect(APP_JS).toMatch(/\nconst itemBar = /);
    expect(typeof G().itemBar).toBe('function');
  });

  it('keeps the axis: 12 columns × 5 workdays = 60 units, ONE rounding rule', () => {
    expect(G().TOTAL_UNITS).toBe(60);
    expect(APP_JS).toMatch(/const unitPct = \(u\) => pctOf\(u, TOTAL_UNITS\);/);
  });

  it('lands the fixture dates on the units the assertions below assume', () => {
    expect(G().dayIndex('2026-08-03')).toBe(0);
    expect(G().dayIndex('2026-08-17')).toBe(10);
    expect(G().dayIndex('2026-08-21')).toBe(14);
    expect(G().dayIndex('2026-08-19')).toBe(12);
    expect(G().dayIndex('2026-10-23')).toBe(59); // the last workday drawn
    for (let u = 0; u <= 59; u++) expect(G().dayIndex(isoAtUnit(u))).toBe(u);
  });
});

describe('one row, one bar — start to finish, finish day INCLUSIVE', () => {
  it('covers the finish day: Mon→Fri is FIVE units wide, not four', () => {
    const [b] = bar('2026-08-17', '2026-08-21');
    expect(b!.left).toBe(G().unitPct(10));
    expect(b!.width).toBe(G().unitPct(5)); // dayIndex(finish) + 1
  });

  it('titles the bar with its own two dates, and says so when it runs late', () => {
    expect(bar('2026-08-17', '2026-08-21')[0]!.title).toBe('2026-08-17 → 2026-08-21');
    expect(bar('2026-08-17', '2026-08-21', { late: true })[0]!.title)
      .toBe('2026-08-17 → 2026-08-21 · past the client deadline');
  });

  it('spells rule 42’s string ONCE — `rowTitle` owns it and `itemBar` reads it (PLAN.md amendment 11)', () => {
    /* The string moved: the bar is pointer-transparent now (a multi-week run
       swallowed the week clicks it lay over), and a transparent box shows no
       tooltip, so the TRACK carries the title and the bar carries none. Two
       readers, one owner — asserted by RUNNING the two against each other
       (test/CLAUDE.md rule 2), never by comparing source text, because the
       defect this forbids is the two spellings drifting apart. */
    for (const row of [
      { startsOn: '2026-08-17', finish: '2026-08-21', late: false },
      { startsOn: '2026-08-17', finish: '2026-08-21', late: true },
      { startsOn: '2026-08-03', finish: '2026-08-03', late: true },
    ]) {
      expect(G().rowTitle(row), JSON.stringify(row)).toBe(bar(row.startsOn, row.finish, { late: row.late })[0]!.title);
    }
    // a row that draws NO bar names no dates — the track then has no tooltip
    expect(G().rowTitle({ startsOn: null, finish: null })).toBe('');
    expect(G().rowTitle({ startsOn: '2026-08-17', finish: null })).toBe('');
    expect(G().rowTitle(null)).toBe('');
    // …and it is shared with the template, which is how the track can read it
    expect(appSetArg('rowTitle')).toBe('rowTitle');
  });

  it('hands the template finished 2dp strings — no arithmetic in the markup', () => {
    const [b] = bar('2026-08-17', '2026-08-21');
    const twoDp = /^\d+\.\d{2}$/;
    expect(b!.left).toMatch(twoDp);
    expect(b!.width).toMatch(twoDp);
    // and the template multiplies nothing (the run-geometry law, re-pointed).
    // The bar is DISPLAY-ONLY on this tab since block 9 (owl #88): its left is
    // `b.left` and nothing else — the mid-drag `dragLeft` branch went with the
    // gesture, so no state key can move a bar the server has not moved.
    const tag = /<div class="gitem[^>]*>/.exec(schedulesView());
    expect(tag, 'no .gitem in the schedules view').not.toBeNull();
    const style = /style="([^"]*)"/.exec(tag![0])?.[1] ?? '';
    expect(style).toMatch(/^left:\{\{b\.left\}\}%;width:\{\{b\.width\}\}%;?$/);
  });

  it('returns [] for unplotted, unforecastable, and fully-clipped rows — no branch in the template', () => {
    expect(bar(null, null)).toEqual([]);
    expect(bar('2026-08-17', null)).toEqual([]); // no difficulty → no finish
    expect(bar(null, '2026-08-21')).toEqual([]);
    expect(bar('2026-07-13', '2026-07-17')).toEqual([]); // wholly before the window
    expect(bar('2026-11-09', '2026-11-13')).toEqual([]); // wholly after it
  });

  it('clips to the window at both edges', () => {
    const [left] = bar('2026-07-27', '2026-08-07'); // starts before the window
    expect(left!.left).toBe('0.00');
    const [right] = bar('2026-10-19', '2026-11-02'); // finishes after it
    expect(Number(right!.left) + Number(right!.width)).toBeCloseTo(100, 2);
  });
});

describe('the 24px minimum grab, ported intact (JP 2026-08-18 ruling 2)', () => {
  it('states the minimum in the units the box is measured in', () => {
    expect(G().MIN_GRAB_PX).toBe(24);
    expect(G().WEEK_PX).toBe(92);
    expect(G().UNIT_PX).toBe(92 / 5); // 18.4 — one workday column, mirroring --gw
    expect(G().MIN_GRAB_UNITS).toBe(24 / (92 / 5));
    expect(Number(G().unitPct(G().MIN_GRAB_UNITS))).toBe(2.17);
  });

  it('widens a one-day bar RIGHT: the box grows, its left edge does not move', () => {
    const [b] = bar('2026-08-19', '2026-08-19'); // unit 12, one day
    expect(Number(b!.width)).toBeGreaterThanOrEqual(2.17);
    expect(Number(G().unitPct(1))).toBeLessThan(2.17); // the day itself is 1.67%
    expect(b!.left).toBe(G().unitPct(12)); // anchored — the identity
  });

  it('leaves a bar already wider than the minimum exactly alone', () => {
    const [b] = bar('2026-09-07', '2026-09-18'); // units 25 → 34+1
    expect(b!.left).toBe(G().unitPct(25));
    expect(b!.width).toBe(G().unitPct(10));
  });

  it('slides LEFT in the final column rather than hanging off the track — one expression, no branch', () => {
    const [b] = bar('2026-10-23', '2026-10-23'); // unit 59, the last drawn
    expect(Number(b!.left) + Number(b!.width)).toBeCloseTo(100, 2);
    expect(Number(b!.left)).toBeLessThan(Number(G().unitPct(59)));
  });

  it('sweeps EVERY one-day bar in the window: anchored everywhere, clipped only at the end', () => {
    for (let u = 0; u < 60; u++) {
      const [b] = bar(isoAtUnit(u), isoAtUnit(u));
      expect(b, `unit ${u} drew no bar`).toBeDefined();
      const L = Number(b!.left);
      const W = Number(b!.width);
      expect(L, `unit ${u} left`).toBeGreaterThanOrEqual(0);
      expect(L + W, `unit ${u} right edge`).toBeLessThanOrEqual(100.02);
      if (u + G().MIN_GRAB_UNITS <= 60) {
        expect(b!.left, `unit ${u} moved off its anchor`).toBe(G().unitPct(u));
      }
    }
  });
});

/* ====================================================================== *
 * SUITE 5b — `barLeftAt`, the DRAG PREVIEW's left (review 2026-09-09,
 * confirmed finding 1; PLAN.md amendment).
 *
 * THE RULE (block 7, kept): `barLeftAt` is itemBar's clamp applied to a day
 * — ONE owner for the MIN_GRAB slide, so a bar drawn at any day is the same
 * box. Block 7 used it to preview a drag on this tab; block 9 (owl #88)
 * retired that drag — the bar is display-only here and the day moves on
 * Deadlines — so `barLeftAt` is now a display caller's helper alone (PLAN.md
 * block 9: KEPT verbatim). The identity it holds is still worth a guard: a
 * second copy of the clamp is how the block-7 defect shipped.
 * ====================================================================== */

describe('barLeftAt — the resting bar is the SAME box at any day (one owner for the clamp)', () => {
  const oneDay = (day: string): Partial<SprintScheduleRow> => ({ startsOn: day, finish: day, taskPrefix: 'Render Asset' });
  const FIVE_DAY: Partial<SprintScheduleRow> = { startsOn: '2026-08-17', finish: '2026-08-21', taskPrefix: 'Render Asset' };

  it('takes its resting left FROM barLeftAt — one owner for the clamp (source)', () => {
    /* Since the simplification pass the identity below is STRUCTURAL, not a
       coincidence two copies happen to share: `itemBar` calls this helper for
       its own left, the way it already calls `barWidthUnits` for its width.
       This is the pin that keeps it that way — a second copy of the clamp
       inside itemBar is exactly the drift finding 1 came from. */
    const src = topDecl('itemBar');
    expect(src).toContain('barLeftAt(row, row.startsOn)');
    expect(src, 'itemBar grew a second copy of the MIN_GRAB clamp').not.toContain('TOTAL_UNITS - width');
  });

  it('gives the RESTING left on every one of the sixty days a bar can start', () => {
    /* executed against itemBar itself (rule 2), never against a retyped clamp.
       True by construction now (the pin above), and swept anyway: the VALUES
       are bounded by the two cases below, so a broken clamp still shows. */
    for (let u = 0; u < 60; u++) {
      const day = isoAtUnit(u);
      expect(G().barLeftAt(oneDay(day), day), `unit ${u}`).toBe(G().itemBar(oneDay(day))[0]!.left);
    }
  });

  it('never draws off the track, whatever day a five-day bar is asked at', () => {
    const width = Number(G().itemBar(FIVE_DAY)[0]!.width);
    for (let u = 0; u < 60; u++) {
      const left = Number(G().barLeftAt(FIVE_DAY, isoAtUnit(u)));
      expect(left, `unit ${u} left`).toBeGreaterThanOrEqual(0);
      expect(left + width, `unit ${u} right edge`).toBeLessThanOrEqual(100.02);
    }
  });

  it('parts from the raw column left exactly where the MIN_GRAB slide bites — the defect, in one column', () => {
    /* The raw column left is `unitPct(dayIndex(day))` — what block 7's
       `plusLeft` used to answer before it retired with the `+` (block 9). The
       slide is the point: at the last drawn unit a one-day bar is widened to
       MIN_GRAB and slid LEFT to stay on the track, so its left is NOT the
       column's. */
    const last = oneDay('2026-10-23'); // unit 59, the last drawn workday
    const rawLeft = (day: string): string => G().unitPct(G().dayIndex(day));
    expect(rawLeft('2026-10-23')).toBe(G().unitPct(59));
    expect(G().barLeftAt(last, '2026-10-23')).toBe(G().itemBar(last)[0]!.left);
    expect(G().barLeftAt(last, '2026-10-23'), 'the bar still opens at the raw column left')
      .not.toBe(rawLeft('2026-10-23'));
    expect(Number(G().barLeftAt(last, '2026-10-23')) + Number(G().itemBar(last)[0]!.width)).toBeLessThanOrEqual(100);
    // and mid-window the two agree, which is why 59 of 60 columns never showed it
    expect(G().barLeftAt(oneDay('2026-08-19'), '2026-08-19')).toBe(rawLeft('2026-08-19'));
  });

  it('sizes itself from the ONE width owner, so no two callers can draw the bar two widths', () => {
    // itemBar's width and barLeftAt's clamp are the same number, executed
    // twice rather than written twice
    for (const row of [oneDay('2026-08-19'), FIVE_DAY, oneDay('2026-10-23')]) {
      expect(G().itemBar(row)[0]!.width).toBe(G().unitPct(G().barWidthUnits(row)!));
    }
  });

  it('is null wherever no bar is drawn — there is nothing to place', () => {
    expect(G().barLeftAt(null, '2026-08-19')).toBeNull();
    expect(G().barLeftAt(oneDay('2026-08-19'), null)).toBeNull();
    expect(G().barLeftAt({ startsOn: null, finish: null }, '2026-08-19')).toBeNull();
    // wholly outside the window: itemBar returns []
    expect(G().barLeftAt({ startsOn: '2026-11-09', finish: '2026-11-13' }, '2026-08-19')).toBeNull();
  });
});

describe('itemPhase — colour only, never data (the lane-by-title lesson)', () => {
  it('maps the two known prefixes and dresses everything else neutral', () => {
    expect(G().itemPhase({ taskPrefix: 'Sketch Asset' })).toBe('sketch');
    expect(G().itemPhase({ taskPrefix: 'Render Asset' })).toBe('render');
    expect(G().itemPhase({ taskPrefix: 'sketch thing' })).toBe('sketch'); // case-blind
    expect(G().itemPhase({ taskPrefix: 'Icon Clean Up' })).toBe('work');
    expect(G().itemPhase({ taskPrefix: null })).toBe('work');
    expect(G().itemPhase({})).toBe('work');
  });

  it('feeds the bar class, and the late tint rides the ROW flag on top', () => {
    expect(bar('2026-08-17', '2026-08-21')[0]!.cls).toBe('render');
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(OFF_BOARD),
      itemBar: () => [{ left: '0.00', width: '10.00', cls: 'work', title: 't' }],
    });
    expect(html).toMatch(/class="gitem work late"/);
    // late overrides the phase fill to red — the rule, not a snapshot
    expect(GANTT_CSS).toMatch(/\.gitem[^{]*\.late[^{]*\{[^}]*var\(--red-600\)/);
  });
});

describe('the deadline tick — dress per 731:98733; a PAST deadline pins LEFT (JP 2026-08-28)', () => {
  it('renders through deadlineTick at the position it names', () => {
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED),
      deadlineTick: () => '41.67',
    });
    expect(html).toMatch(/class="gdl"[^>]*style="left:41\.67%/);
  });

  it('is 1px of red-500 now — was 2px slate-400; the legend swatch follows automatically', () => {
    expect(GANTT_CSS).toMatch(/\.gdl[^,{]*\{[^}]*width: 1px/);
    expect(GANTT_CSS).toMatch(/\.gdl[^,{]*\{[^}]*var\(--red-500\)/);
  });

  /** The shipped recipe, EXECUTED (rule 2) — the same stand-in app as `G()`. */
  const tick = (): ((row: { deadline?: string | null }) => string | null) =>
    new Function(`
      const app = { get: (k) => { if (k !== 'weekStart') throw new Error('tick harness: unstubbed app.get(' + k + ')'); return '2026-08-03'; } };
      ${['WEEK_COUNT', 'WORKDAYS_PER_WEEK', 'TOTAL_UNITS', 'dayIndex', 'pctOf', 'unitPct'].map((n) => topDecl(n)).join('\n')}
      return (${appSetArg('deadlineTick')});
    `)() as (row: { deadline?: string | null }) => string | null;

  it('pins a PAST deadline to the window LEFT EDGE instead of vanishing — the F1 fix', () => {
    // every real row's deadline predates the window; a late row must always
    // show its rule LEFT of the bar (bar-right-of-tick is the late signal)
    expect(tick()({ deadline: '2026-07-20' })).toBe('0.00');
  });

  it('keeps an in-window deadline on its own workday, and the RIGHT-edge clip', () => {
    const t = tick();
    expect(t({ deadline: '2026-08-17' })).toBe(G().unitPct(10));
    expect(t({ deadline: '2026-11-09' })).toBeNull(); // a beyond-window FUTURE tick signals nothing
    expect(t({ deadline: null })).toBeNull();
    expect(t({})).toBeNull();
  });

  it('carries the frozen left-pin, and the old before-window clip is gone (source)', () => {
    const tickSrc = appSetArg('deadlineTick');
    expect(tickSrc).toContain('Math.max(0, dayIndex(row.deadline))');
    expect(tickSrc, 'the u >= 0 clip regressed — a late row loses its rule (F1 ruling, 2026-08-28)')
      .not.toContain('u >= 0');
  });
});

/* ====================================================================== *
 * SUITE 6 — the capacity footer: overlap counts, executed from 70-measure
 * ====================================================================== */

interface FootHarness {
  set(rows: Array<Partial<SprintScheduleRow>>, weekly: number): void;
  text(weekKey: string): string;
  cls(weekKey: string): string;
}

let foot: FootHarness | undefined;
const F = (): FootHarness =>
  (foot ??= new Function(`
    ${topDecl('isoOf')}
    ${topDecl('isoAddDays')}
    ${topDecl('sprintWeekLoad')}
    const DATA = { sprintItems: { rows: [] }, capacity: { weekly: 8 } };
    const app = {
      get: (k) => { if (!(k in DATA)) throw new Error('foot harness: unstubbed app.get(' + k + ')'); return DATA[k]; },
    };
    const text = (${appSetArg('sprintFootText')});
    const cls = (${appSetArg('sprintFootCls')});
    return {
      set: (rows, weekly) => { DATA.sprintItems = { rows }; DATA.capacity = { weekly }; },
      text, cls,
    };
  `)() as FootHarness);

describe('the footer counts every week a bar TOUCHES — workday-window overlap', () => {
  const WK = '2026-08-10'; // Monday; its Friday is 2026-08-14
  const row = (startsOn: string | null, finish: string | null) => ({ startsOn, finish });

  it('counts a bar spanning the week, and one that merely clips either end', () => {
    F().set([row('2026-08-03', '2026-08-21')], 8); // spans it whole
    expect(F().text(WK)).toBe('1');
    F().set([row('2026-08-14', '2026-08-21')], 8); // STARTS on the Friday
    expect(F().text(WK)).toBe('1');
    F().set([row('2026-08-03', '2026-08-10')], 8); // FINISHES on the Monday
    expect(F().text(WK)).toBe('1');
  });

  it('does not count a bar that misses the window on either side, or an unplotted row', () => {
    F().set([row('2026-08-17', '2026-08-21')], 8); // starts the Monday after
    expect(F().text(WK)).toBe('—');
    F().set([row('2026-08-03', '2026-08-07')], 8); // finishes the Friday before
    expect(F().text(WK)).toBe('—');
    F().set([row(null, null), row('2026-08-10', null)], 8); // unplotted / unforecastable
    expect(F().text(WK)).toBe('—');
  });

  it('a two-week bar weighs on BOTH weeks — the flagged default, asserted', () => {
    F().set([row('2026-08-05', '2026-08-12')], 8);
    expect(F().text('2026-08-03')).toBe('1');
    expect(F().text('2026-08-10')).toBe('1');
  });

  it('classes: over above capacity, empty at zero, nothing in between', () => {
    const rows = Array.from({ length: 3 }, () => row('2026-08-10', '2026-08-12'));
    F().set(rows, 2);
    expect(F().cls(WK)).toBe('over');
    F().set(rows, 3);
    expect(F().cls(WK)).toBe('');
    F().set([], 3);
    expect(F().cls(WK)).toBe('empty');
    expect(F().text(WK)).toBe('—'); // em-dash at zero, never a 0
  });
});

describe('the footer caption — the committed capacity through the one band recipe', () => {
  it('prints Capacity: N with the band the slider itself would name', () => {
    const h = H();
    h.set('capacity', { weekly: 8, least: 6, typical: 8, most: 10 });
    expect(h.caption()).toBe('Capacity: 8 (typical)');
    // no references → capacityBand hides the band rather than inventing one
    h.set('capacity', { weekly: 8 });
    expect(h.caption()).toBe('Capacity: 8');
  });

  it('renders the label and per-week cells through the two shipped helpers', () => {
    const html = renderSprintSchedule({
      sprintFootText: (k) => `N(${k})`,
      sprintFootCls: () => 'over',
    });
    expect(html).toMatch(/WORK CARDS \/ WEEK/i);
    expect(html).toContain('N(2026-08-03)');
    expect(html).toContain('N(2026-08-10)');
    expect(html).toMatch(/class="[^"]*\bover\b/);
  });
});

/* ====================================================================== *
 * SUITE 7 — THE BAR IS DISPLAY-ONLY (block 9, owls #88/#89, JP 2026-09-10;
 * PLAN.md block 9). Was the drag CONTRACT (block 7) and before that the drag
 * WITHDRAWAL sweep (owl #72, 2026-08-28). The day belongs to the Design
 * Lead, on Deadlines, and nowhere else: the PM works this tab at WEEK grain
 * (hover a week, click — test/drag-hittest.test.ts holds the `.gweek`
 * bindings), the start day is DISPLAYED on the bar and not editable, and
 * every piece of block 7's day machinery — the pointer bar drag, the hovered
 * day's `+`, the one-day hover cell, their state keys, handlers, geometry
 * and CSS — is gone whole. Source sweeps: the view slice, the script bundle
 * (comment-stripped — rule 3's kinder corpus), and the stylesheet.
 * ====================================================================== */

/** The COMMITTED row's track — the one that draws a bar — as one open tag. */
const barTag = (): string => {
  const tag = /<div class="gitem[^>]*>/.exec(schedulesView());
  expect(tag, 'no .gitem in the schedules view').not.toBeNull();
  return tag![0];
};

describe('the bar on Sprint Schedules is DISPLAY-ONLY — the day is set on Deadlines (#88)', () => {
  it('draws the bar with no pointer binding of any kind — mousedown, pointerdown, click, or HTML5 drag', () => {
    /* NOT a drag source any more, and not a click target either: a binding
       here would be a second door to the day, and #88 gives the PM none. The
       week click rides the `.gweek` cells, never the run. */
    const tag = barTag();
    expect(tag).not.toMatch(/\son-[a-z]+=/);
    expect(tag).not.toContain('draggable');
    // negative control for the directive sweep: the cells DO bind
    expect(schedulesView()).toContain("['weekPlace', row.id, @index]");
  });

  it('wears no mid-gesture state — `dragging` and `refused` are not classes the bar can carry', () => {
    const tag = barTag();
    expect(tag).not.toContain('dragging');
    expect(tag).not.toContain('refused');
    // …and its class list is the phase plus the late flag, exactly (the two
    // that colour it; test/drag-hittest.test.ts reads them the same way)
    expect(/class="([^"]*)"/.exec(tag)?.[1]).toBe('gitem {{b.cls}}{{#if row.late}} late{{/if}}');
  });

  it('DISPLAYS the start day on the ROW’S TRACK — rule 42’s string, moved off the transparent bar (PLAN.md amendment 11)', () => {
    /* gantt-rules rule 42 (PLAN.md block 9 amendments 2 and 11): the string is
       `startsOn → finish`, plus "· past the client deadline" when late, and it
       is still DISPLAYED (#88: displayed, not editable) — but not by the bar.
       The bar is `pointer-events: none` now, because a multi-week run lay over
       the `.gweek` cells after its own and swallowed their click; a box the
       pointer passes through can never show a tooltip. The track still takes
       the pointer and is one per row, so the title rides it.

       Both halves are asserted: the bar carries NO title, the track carries
       the recipe's. Without the first, the two could ship together and the
       tooltip would be the transparent one on top — the defect, invisible. */
    expect(barTag()).not.toContain('title=');
    expect(barTag()).not.toContain('Starts ');
    const trackTag = /<div class="gtrack[^>]*>/.exec(schedulesView());
    expect(trackTag, 'no .gtrack in the schedules view').not.toBeNull();
    expect(trackTag![0]).toContain('title="{{rowTitle(row)}}"');
    // rendered: the row's own two dates, on the track, once
    const html = renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) });
    expect(html).toContain('class="gtrack" title="2026-08-03 → 2026-08-12"');
    expect([...html.matchAll(/2026-08-03 →/g)]).toHaveLength(1);
    // a row that draws no bar draws no dates either — an empty title attribute
    // is the recipe's own empty string, never a stale one
    const none = renderSprintSchedule({ sprintGroups: groupsOf({ ...PLOTTED, startsOn: null, finish: null }) });
    expect(none).not.toContain('2026-08-03 →');
    expect(none).not.toContain('class="gitem');
  });

  it('offers no grab — the bar’s cursor is default, and the drag-era cursors are out of the sheet', () => {
    /* Block 7 dressed the run `cursor: grab` and its two states `grabbing`
       / `not-allowed`. A grab cursor on a bar nobody may drag is a promise
       the tab cannot keep, so the resting rule says `default` and no rule
       on `.gitem` names a grab. */
    const rules = rulesFor('gitem');
    expect(rules.length, 'the stylesheet lost the bar').toBeGreaterThan(0);
    expect(rules.some((r) => /cursor:\s*default/.test(r.body)), 'the bar no longer says cursor: default').toBe(true);
    for (const r of rules) expect(r.body, `\`${r.selector}\``).not.toMatch(/cursor:\s*(grab|grabbing|not-allowed)/);
  });

  it('teaches the WEEK act in the hint, and never the retired day acts', () => {
    const hint = /<span class="fnnote">([^<]*)<\/span>/.exec(schedulesView())?.[1] ?? '';
    expect(hint).toBe('Hover a week and click to place the card on that week; the day is set on Deadlines.');
  });

  it('carries no HTML5 drag directive, attribute or API anywhere on the tab or in the scripts', () => {
    // §5.2's own reason, unchanged: HTML5 drag-and-drop fails inside sticky,
    // scrolling containers, and this layout is one. Kept from the block-7
    // sweep because the Deadlines drag is pointer events too (#89) and this
    // is the corpus a stray `draggable` would land in.
    const view = schedulesView().replace(/\{\{!\s[\s\S]*?\}\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    for (const banned of ['draggable', 'on-dragstart', 'on-dragover', 'on-drop', 'on-dragend', 'dropzone']) {
      expect(view, `\`${banned}\` came back to the schedules view`).not.toContain(banned);
    }
    for (const banned of ['dataTransfer', 'setDragImage', 'effectAllowed', 'dropEffect', 'DragEvent']) {
      expect(APP_JS_CODE, `\`${banned}\` came back to the shipped scripts`).not.toContain(banned);
    }
  });
});

describe('block 7’s day machinery is gone whole from Sprint Schedules (#88; PLAN.md block 9 REMOVED lists)', () => {
  /** A whole-word identifier test — a property access or a longer name does not count. */
  const declares = (name: string, src: string = APP_JS_CODE): boolean =>
    new RegExp(`(?<![\\w$.])${name.replace(/[$]/g, '\\$&')}(?![\\w$])`).test(src);

  it('IS NOT VACUOUS — the matcher finds a name that IS shipped (negative control)', () => {
    expect(declares('weekPlace')).toBe(true);
    expect(declares('itemBar')).toBe(true);
    expect(declares('nosuchthinginthisbundle')).toBe(false);
  });

  it('the seven handlers and the four private helpers are out of the shipped scripts', () => {
    for (const gone of [
      'plotHover', 'plotLeave', 'plotPlace',
      'barDragStart', 'barDragMove', 'barDragEnd', 'barDragCancel',
      'barDragUp', 'barDragKey', 'barDragStop', 'barDragClear',
    ]) {
      expect(declares(gone), `\`${gone}\` outlived the day controls`).toBe(false);
    }
  });

  it('the six state keys are out — including their project-switch reset', () => {
    for (const gone of ['plotRow', 'plotDay', 'dragRow', 'dragDay', 'dragLeft', 'dragGrab']) {
      expect(declares(gone), `\`${gone}\` outlived the day controls`).toBe(false);
    }
    // and the WEEK pair took their place (PLAN.md block 9 NEW keys)
    expect(declares('hoverRow')).toBe(true);
    expect(declares('hoverWeek')).toBe(true);
  });

  it('the three geometry helpers are out — `dayAtX`, `plusLeft`, `placeable`', () => {
    for (const gone of ['dayAtX', 'plusLeft', 'placeable']) {
      expect(declares(gone), `\`${gone}\` outlived the day controls`).toBe(false);
    }
    // KEPT verbatim (PLAN.md): the display recipe and its one clamp owner
    for (const kept of ['itemBar', 'deadlineTick', 'dayIndex', 'barLeftAt', 'barWidthUnits']) {
      expect(declares(kept), `\`${kept}\` was supposed to stay`).toBe(true);
    }
  });

  it('the + and the hover cell are out of the view, and their rules out of the sheet', () => {
    const view = schedulesView().replace(/\{\{!\s[\s\S]*?\}\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    for (const gone of ['gplus', 'ghovcell', 'plusLeft(', 'placeable(', 'dragLeft', 'dragRow', 'plotDay', 'plotRow']) {
      expect(view, `\`${gone}\` outlived the day controls in the view`).not.toContain(gone);
    }
    expect(rulesFor('gplus')).toEqual([]);
    expect(rulesFor('ghovcell')).toEqual([]);
    for (const r of rulesFor('gitem')) {
      expect(r.selector, 'a mid-gesture rule outlived the gesture').not.toMatch(/\.(dragging|refused)\b/);
    }
    // the WEEK tint took the hover cell's place (PLAN.md styles: `.gweek.hover`)
    expect(rulesFor('gweek').some((r) => /\.gweek\.hover\b/.test(r.selector)), 'no `.gweek.hover` rule').toBe(true);
    // `.gtrack.placing` stays — the track still says "a click lands here"
    expect(rulesFor('gtrack').some((r) => /\.gtrack\.placing\b/.test(r.selector))).toBe(true);
  });

  it('dropped the Suggest branch and both conflict banners (owl #72 — still gone)', () => {
    const view = schedulesView().replace(/\{\{!\s[\s\S]*?\}\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    for (const gone of ['suggestPlan', 'applyPlan', 'planOverflow', 'planHardMix', 'strain']) {
      expect(view, `\`${gone}\` came back`).not.toContain(gone);
      expect(declares(gone), `\`${gone}\` came back to the scripts`).toBe(false);
    }
  });
});
