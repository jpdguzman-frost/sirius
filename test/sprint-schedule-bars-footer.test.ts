/**
 * SUITE 5 (the bar), SUITE 6 (the capacity footer) and SUITE 7 (the drag
 * withdrawal sweep), split out of test/sprint-schedule-render.test.ts on
 * 2026-09-05 (PLAN.md §C). The shared prelude and the groups harness `H()`
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
import { H, appSetArg, groupsOf, schedulesView } from './helpers/sprint-schedule-tab.ts';

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
  dayIndex(iso: string): number;
  unitPct(u: number): string;
  TOTAL_UNITS: number;
  WEEK_PX: number;
  MIN_GRAB_PX: number;
  UNIT_PX: number;
  MIN_GRAB_UNITS: number;
}

/**
 * Declaration order matters for the consts; `dayIndex` hoists. `dayIndex`
 * reads the window origin off the app instance and NOTHING else does, so the
 * one-key stand-in is the whole surface the shipped bodies need. Window:
 * 2026-08-03 (a Monday) through 12 columns × 5 workdays = 60 units.
 *
 * Sliced LAZILY (the drag-hittest weekAtX precedent): `topDecl` throws when a
 * declaration is absent, and a throw at module scope would take the WHOLE
 * file down — render suites included — while the scripts land.
 */
let geo: GeoHarness | undefined;
const G = (): GeoHarness => {
  if (!geo) {
    const src = ['WEEK_COUNT', 'WEEK_PX', 'WORKDAYS_PER_WEEK', 'TOTAL_UNITS', 'dayIndex', 'clampUnits', 'pctOf', 'unitPct', 'MIN_GRAB_PX', 'UNIT_PX', 'MIN_GRAB_UNITS', 'itemBar', 'itemPhase']
      .map((n) => topDecl(n))
      .join('\n');
    geo = new Function(`
      const app = { get: (k) => { if (k !== 'weekStart') throw new Error('geometry harness: unstubbed app.get(' + k + ')'); return '2026-08-03'; } };
      ${src}
      return { itemBar, itemPhase, dayIndex, unitPct, TOTAL_UNITS, WEEK_PX, MIN_GRAB_PX, UNIT_PX, MIN_GRAB_UNITS };
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

  it('hands the template finished 2dp strings — no arithmetic in the markup', () => {
    const [b] = bar('2026-08-17', '2026-08-21');
    const twoDp = /^\d+\.\d{2}$/;
    expect(b!.left).toMatch(twoDp);
    expect(b!.width).toMatch(twoDp);
    // and the template multiplies nothing (the run-geometry law, re-pointed)
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
 * SUITE 7 — WITHDRAWN with the drag (owl #72). Source sweeps: the view
 * slice, the script bundle (comment-stripped — rule 3's kinder corpus),
 * and the stylesheet.
 * ====================================================================== */

describe('the schedules view carries no drag, no drop, no ghost, no Suggest', () => {
  it('has no draggable and no drag/drop directives anywhere in the subtree', () => {
    const view = schedulesView();
    expect(view).not.toMatch(/\bdraggable=/);
    expect(view).not.toMatch(/on-drag/);
    expect(view).not.toMatch(/on-drop/);
  });

  it('dropped the drag-era chrome: grip, ghost, unsched hint, gdragging, run box', () => {
    const view = schedulesView();
    for (const gone of ['ghandle', 'gghost', 'gunsched', 'gdragging', 'grun', 'gbar', 'ghostBar']) {
      expect(view, `\`${gone}\` survives in the schedules view`).not.toContain(gone);
    }
  });

  it('dropped the Suggest branch and both conflict banners', () => {
    const view = schedulesView();
    for (const gone of ['runSuggest', 'acceptSuggest', 'clearSuggest', 'sgbar', 'suggestOffWeeks', 'unavoidable']) {
      expect(view, `\`${gone}\` survives in the schedules view`).not.toContain(gone);
    }
  });

  it('teaches the CLICK, not the drag — the standing hint is the placement sentence', () => {
    expect(schedulesView()).toContain(
      'Hover a week on an unplotted row and click to place its bar — the finish is computed.',
    );
  });

  it('the retired handlers, computeds and state keys are out of the shipped bundle', () => {
    for (const gone of [
      'dragRow', 'dragEnd', 'dropOnWeek', 'dropOnBar', 'dragOverBlock', 'dropBlock',
      'moveRows', 'rowKey', 'togglePin', 'duplicateRow', 'unslotRow', 'editNote',
      'runSuggest', 'clearSuggest', 'acceptSuggest', 'suggestProposed', 'suggestFlagged',
      'suggestHardHeavy', 'suggestBlockedWhy', 'suggestOffWeeks', 'schedRows',
      'plannerGroups', 'phaseRun', 'ghostBar', 'perWeekLocal', "'arrived'",
    ]) {
      expect(APP_JS_CODE, `\`${gone}\` survives in the shipped scripts`).not.toContain(gone);
    }
    // `selected` is NOT swept by name: the token is too common to grep for —
    // its removal is proven by the checkbox suite reading `sprintSel` instead.
  });

  it('the stylesheet dropped the drag-era rules — including the review colours', () => {
    // comments stripped first (rule 3): the sheet may legitimately NAME a
    // retired rule while explaining what replaced it
    const css = GANTT_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const gone of ['.gseg.review', '.gseg.renderOverdue', '.grun', '.gbar', '.gghost', '.gunsched', '.gdragging', '.ghandle']) {
      expect(css, `\`${gone}\` survives in 35-gantt.css`).not.toContain(gone);
    }
  });
});
