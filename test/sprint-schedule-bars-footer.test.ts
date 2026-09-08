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
  cssRule,
  fnBody,
  handlerBody,
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
  /** the run's width in UNITS — the one owner of the MIN_GRAB widening */
  barWidthUnits(row: Partial<SprintScheduleRow>): number | null;
  /** the drag preview's left: itemBar's own clamp, at a day not yet written */
  barLeftAt(row: Partial<SprintScheduleRow> | null, day: string | null): string | null;
  plusLeft(day: string | null): string | null;
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
  'MIN_GRAB_PX', 'UNIT_PX', 'MIN_GRAB_UNITS', 'barWidthUnits', 'itemBar', 'itemPhase', 'plusLeft', 'barLeftAt',
];
let geo: GeoHarness | undefined;
const G = (): GeoHarness => {
  if (!geo) {
    const src = GEO_NAMES.map((n) => topDecl(n)).join('\n');
    geo = new Function(`
      const app = { get: (k) => { if (k !== 'weekStart') throw new Error('geometry harness: unstubbed app.get(' + k + ')'); return '2026-08-03'; } };
      ${src}
      return { itemBar, itemPhase, barWidthUnits, barLeftAt, plusLeft, dayIndex, unitPct, TOTAL_UNITS, WEEK_PX, MIN_GRAB_PX, UNIT_PX, MIN_GRAB_UNITS };
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
    // and the template multiplies nothing (the run-geometry law, re-pointed).
    // Mid-drag the LEFT comes from `dragLeft` instead — a value the handler
    // already finished, through `barLeftAt`, which is itemBar's own clamp at
    // another day — and the WIDTH is untouched, which is what makes the drag a
    // translation rather than a resize (bar resizing is out of the pilot, §5.1b).
    const tag = /<div class="gitem[^>]*>/.exec(schedulesView());
    expect(tag, 'no .gitem in the schedules view').not.toBeNull();
    const style = /style="([^"]*)"/.exec(tag![0])?.[1] ?? '';
    expect(style).toMatch(/^left:\{\{ dragRow === row\.id \? dragLeft : b\.left \}\}%;width:\{\{b\.width\}\}%;?$/);
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
 * THE RULE: the template renders the previewed bar as `left: dragLeft` with
 * `width: b.width` — itemBar's own width. A left that is not itemBar's left
 * for that width is therefore a DIFFERENT box: at the last drawn unit the raw
 * column left (`plusLeft`) is half a unit right of where the bar rests, so the
 * bar jumped the instant it was grabbed and previewed with its right edge past
 * the end of the track. `barLeftAt` is itemBar's clamp applied to a day the
 * row has not been written to yet.
 * ====================================================================== */

describe('barLeftAt — the preview is the SAME box, one day over', () => {
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

  it('never previews off the track, whatever day a five-day bar is dragged to', () => {
    const width = Number(G().itemBar(FIVE_DAY)[0]!.width);
    for (let u = 0; u < 60; u++) {
      const left = Number(G().barLeftAt(FIVE_DAY, isoAtUnit(u)));
      expect(left, `unit ${u} left`).toBeGreaterThanOrEqual(0);
      expect(left + width, `unit ${u} right edge`).toBeLessThanOrEqual(100.02);
    }
  });

  it('parts from plusLeft exactly where the MIN_GRAB slide bites — the defect, in one column', () => {
    const last = oneDay('2026-10-23'); // unit 59, the last drawn workday
    expect(G().plusLeft('2026-10-23')).toBe(G().unitPct(59)); // the raw column left, unchanged
    expect(G().barLeftAt(last, '2026-10-23')).toBe(G().itemBar(last)[0]!.left);
    expect(G().barLeftAt(last, '2026-10-23'), 'the preview still opens at the raw column left')
      .not.toBe(G().plusLeft('2026-10-23'));
    expect(Number(G().barLeftAt(last, '2026-10-23')) + Number(G().itemBar(last)[0]!.width)).toBeLessThanOrEqual(100);
    // and mid-window the two agree, which is why 59 of 60 columns never showed it
    expect(G().barLeftAt(oneDay('2026-08-19'), '2026-08-19')).toBe(G().plusLeft('2026-08-19'));
  });

  it('sizes itself from the ONE width owner, so the preview and the bar cannot drift', () => {
    // itemBar's width and barLeftAt's clamp are the same number, executed
    // twice rather than written twice
    for (const row of [oneDay('2026-08-19'), FIVE_DAY, oneDay('2026-10-23')]) {
      expect(G().itemBar(row)[0]!.width).toBe(G().unitPct(G().barWidthUnits(row)!));
    }
  });

  it('is null wherever no bar is drawn — there is nothing to preview', () => {
    expect(G().barLeftAt(null, '2026-08-19')).toBeNull();
    expect(G().barLeftAt(oneDay('2026-08-19'), null)).toBeNull();
    expect(G().barLeftAt({ startsOn: null, finish: null }, '2026-08-19')).toBeNull();
    // wholly outside the window: itemBar returns [], so the drag cannot arm
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
 * SUITE 7 — THE DRAG CONTRACT (block 7, JP 2026-09-08). Was the drag
 * WITHDRAWAL sweep (owl #72, 2026-08-28); a placed bar drags again, by
 * POINTER, so this suite states what that means and keeps the HTML5
 * machinery — and the Suggest era it was swept alongside — gone for good.
 * Source sweeps: the view slice, the script bundle (comment-stripped —
 * rule 3's kinder corpus), and the stylesheet.
 * ====================================================================== */

describe('the drag is POINTER events on the coloured run — no HTML5 drag, no ghost', () => {
  it('carries no draggable attribute and no drag/drop directive anywhere in the subtree', () => {
    // §5.2's own reason, unchanged: HTML5 drag-and-drop fails inside sticky,
    // scrolling containers, and this layout is one. A `draggable` here would
    // hand the gesture to a machine that cancels it in the tick it starts.
    const view = schedulesView();
    expect(view).not.toMatch(/\bdraggable=/);
    expect(view).not.toMatch(/on-drag/);
    expect(view).not.toMatch(/on-drop/);
  });

  it('keeps the HTML5 drag API out of the shipped scripts too', () => {
    for (const gone of ['dragstart', 'dragover', 'dragend', 'dragenter', 'dragleave', 'dataTransfer', 'setDragImage']) {
      expect(APP_JS_CODE, `\`${gone}\` — the HTML5 drag machinery is back in the client`).not.toContain(gone);
    }
  });

  it('drags NO ghost: the bar itself moves, and nothing follows the cursor', () => {
    const view = schedulesView();
    for (const gone of ['ghandle', 'gghost', 'gunsched', 'gdragging', 'grun', 'gbar', 'ghostBar']) {
      expect(view, `\`${gone}\` survives in the schedules view`).not.toContain(gone);
    }
    expect(GANTT_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ')).not.toContain('gghost');
  });

  it('dropped the Suggest branch and both conflict banners', () => {
    const view = schedulesView();
    for (const gone of ['runSuggest', 'acceptSuggest', 'clearSuggest', 'sgbar', 'suggestOffWeeks', 'unavoidable']) {
      expect(view, `\`${gone}\` survives in the schedules view`).not.toContain(gone);
    }
  });

  it('teaches both acts — the click on an unplotted row, the drag on a placed one', () => {
    expect(schedulesView()).toContain(
      'Hover a day on an unplotted row and click to place its bar; drag a placed bar to move it. The finish is computed.',
    );
  });

  it('the retired handlers, computeds and state keys are still out of the shipped bundle', () => {
    /* The reinstated names left this list when the drag came back — `dragRow`
       is a STATE KEY now and `barDragEnd` contains the old `dragEnd` — so the
       sweep names what is genuinely retired and nothing that merely rhymes
       with it. A ban that outlives the thing it banned reads as law and is
       not one. */
    for (const gone of [
      'dropOnWeek', 'dropOnBar', 'dragOverBlock', 'dropBlock',
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

describe('the drag SOURCE is the coloured run of a PLACED row, and nothing else', () => {
  /** The one `.gitem` open tag in the shipped view. */
  const barTag = (): string => {
    const tag = /<div class="gitem[^>]*>/.exec(schedulesView());
    expect(tag, 'no .gitem in the schedules view').not.toBeNull();
    return tag![0];
  };

  it('starts the drag on the BAR, carrying the row it belongs to', () => {
    expect(barTag()).toContain(`on-mousedown="['barDragStart', row.id]"`);
  });

  it('leaves the track, the deadline tick and the row label inert to mousedown', () => {
    /* the standing hit-test principle in the other direction: the SOURCE is
       one element, so nothing around it may also answer the button. A
       mousedown on the track would arm a drag from empty grid, and one on the
       `.gdl` (which paints ABOVE the bar at its own column) would swallow the
       grab at exactly the day a late row is dragged away from. */
    const view = schedulesView();
    const mousedowns = [...view.matchAll(/<[a-z]+[^>]*on-mousedown="\[[^\]]*\][^>]*>/g)].map((m) => m[0]);
    expect(mousedowns, 'more than one element answers mousedown on this tab').toHaveLength(1);
    expect(mousedowns[0]!).toContain('class="gitem');
    expect(view).toMatch(/<div class="gdl"[^>]*>/);
    expect(/<div class="gdl"[^>]*>/.exec(view)![0]).not.toContain('on-mouse');
  });

  it('binds the MOVE on the track, and only on a row that already has a bar', () => {
    // the unplotted branch places; the placed branch drags. One `{{#if}}`,
    // two mutually exclusive wirings — a row can never offer both.
    const view = schedulesView();
    expect(view).toContain(
      `{{#if !row.startsOn}}on-mousemove="['plotHover', row.id]" on-mouseleave="['plotLeave']" on-click="['plotPlace', row.id]"{{else}}on-mousemove="['barDragMove', row.id]"{{/if}}`,
    );
    // and the inert tracks stay inert: the search row and its results (B5)
    const inert = [...view.matchAll(/<div class="gtrack"><div class="gweeks">/g)];
    expect(inert.length, 'the search/result tracks stopped being inert grid').toBeGreaterThanOrEqual(2);
  });

  it('renders the preview at dragLeft with the bar’s OWN width, wearing `dragging`', () => {
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED),
      dragRow: 'i1', dragDay: '2026-08-05', dragLeft: '5.00',
    });
    expect(html).toMatch(/class="gitem render dragging"/);
    expect(html).toMatch(/style="left:5\.00%;width:11\.67%;"/); // the stub bar's own width, unchanged
  });

  it('wears `refused` on a day the row may not have, and says so with the cursor', () => {
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED),
      dragRow: 'i1', dragDay: '2026-09-30', dragLeft: '90.00',
      placeable: () => false,
    });
    expect(html).toMatch(/class="gitem render dragging refused"/);
    expect(cssRule('.gantt .gitem.refused')).toContain('cursor: not-allowed');
    // colour is NOT how refusal is said: the phase→colour map stays the one
    // answer to what colour a bar is (the `late` red included)
    expect(cssRule('.gantt .gitem.refused')).not.toContain('background');
    expect(cssRule('.gantt .gitem.dragging')).not.toContain('background');
  });

  it('leaves every OTHER row’s bar at rest while one drags', () => {
    const html = renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED, OFF_BOARD),
      dragRow: 'i1', dragDay: '2026-08-05', dragLeft: '5.00',
    });
    expect(html).toMatch(/class="gitem render dragging"/);
    expect(html).toMatch(/class="gitem render late"/); // OFF_BOARD, untouched
    expect([...html.matchAll(/dragging/g)]).toHaveLength(1);
  });

  it('suppresses the bar’s own tooltip for the gesture, so it cannot fight the drag', () => {
    const dragging = renderSprintSchedule({
      sprintGroups: groupsOf(PLOTTED), dragRow: 'i1', dragDay: '2026-08-05', dragLeft: '5.00',
    });
    expect(dragging, 'the bar kept its resting tooltip mid-drag').not.toContain('title="2026-08-03');
    expect(dragging).toMatch(/class="gitem render dragging" style="left:5\.00%;width:11\.67%;" title>/);
    // …and it is back the moment the gesture ends
    expect(renderSprintSchedule({ sprintGroups: groupsOf(PLOTTED) })).toMatch(/title="2026-08-03 → 2026-08-12"/);
  });

  it('offers the grab cursor and refuses to select text under the pointer', () => {
    const rule = cssRule('.gantt .gitem');
    expect(rule).toContain('cursor: grab');
    expect(rule).toContain('user-select: none');
    expect(cssRule('.gantt .gitem.dragging')).toContain('cursor: grabbing');
  });
});

describe('the drag lifecycle — four handlers, and what each one refuses (source)', () => {
  it('arms only a PLACED row, and only when nothing else is in flight', () => {
    const body = handlerBody('barDragStart');
    expect(body).toContain('if (sprintItemSaving) return;');
    expect(body, 'an unplotted row has no bar to drag').toContain('if (!row || !row.startsOn) return;');
    // the PRIMARY button only: a right-click's own mouseup would otherwise end
    // a drag the user never started, behind the context menu
    expect(body).toContain('if (ctx.event && ctx.event.button) return;');
    // and a row whose start is beyond the drawn window has no preview offset —
    // it draws no bar either, which is what makes this unreachable by pointer
    expect(body).toContain('if (left === null) return;');
    // the mousedown's default is a text selection that follows the pointer
    expect(body).toContain('preventDefault()');
    /* it opens ON the row's own start, at the left the BAR is resting at
       (review 2026-09-09, finding 1: `plusLeft` is the raw column left, which
       is half a unit right of the resting bar in the final column) — so a
       mousedown with no movement is a no-op by arithmetic rather than by a
       special case at the other end */
    expect(body).toMatch(/const left = barLeftAt\(row, row\.startsOn\);/);
    expect(body).toMatch(/dragRow: rowId,\s*dragDay: row\.startsOn,\s*dragLeft: left/);
  });

  it('binds mouseup and Escape on the WINDOW, and only while a drag is live', () => {
    const start = handlerBody('barDragStart');
    expect(start).toContain("window.addEventListener('mouseup', barDragUp)");
    /* CAPTURE (review 2026-09-09, finding 3): the mousedown's preventDefault
       leaves focus wherever it was — a sprint's add-search field, whose own
       Escape empties the query — so the drag has to claim the key on the way
       DOWN, before the focused element sees it, and let it go again with the
       same flag or the listener is never removed. */
    expect(start).toContain("window.addEventListener('keydown', barDragKey, true)");
    // a release outside the track must still land; Escape must reach from
    // wherever the pointer wandered
    const stop = fnBody('barDragStop');
    expect(stop).toContain("window.removeEventListener('mouseup', barDragUp)");
    expect(stop).toContain("window.removeEventListener('keydown', barDragKey, true)");
    // and every exit goes through it — commit, cancel, project switch
    for (const via of ['barDragEnd', 'barDragCancel']) {
      expect(handlerBody(via), `${via} leaves the window listeners bound`).toContain('barDragStop();');
    }
    expect(fnBody('resetForProjectSwitch')).toContain('barDragStop();');
    // the key is Escape and nothing else — a stray keystroke must not cancel,
    // and must not be swallowed on its way to the field either
    const key = topDecl('barDragKey');
    expect(key).toContain("e.key !== 'Escape'");
    expect(key).toContain('e.stopPropagation();');
    expect(key).toContain("app.fire('barDragCancel')");
  });

  it('the MOVE steers only its own row, and holds its day when it cannot measure', () => {
    const body = handlerBody('barDragMove');
    // every placed row's track binds this: a pointer crossing a NEIGHBOUR's
    // track mid-drag must not steer the bar being dragged
    expect(body).toContain("if (app.get('dragRow') !== rowId) return;");
    // a release the window listener never saw leaves the gesture armed; the
    // buttons bitmask is the live truth about what is still held down
    expect(body).toContain('ctx.event.buttons === 0');
    expect(body).toContain("app.fire('barDragCancel')");
    expect(body).toContain('dayAtX(');
    expect(body).toContain('if (!day) return;');
    expect(body).toMatch(/dragDay: day, dragLeft: left/);
  });

  it('writes on release ONLY when the day changed and the row may have it', () => {
    const body = handlerBody('barDragEnd');
    /* invariant 10 logs CHANGES, not attempts: a bar dropped on the day it
       started must send nothing, or the audit log grows a row for a gesture
       that moved nothing. The refused day is refused here too — the client
       does not ask the server a question it already knows the answer to. */
    expect(body).toContain("if (!row || !day || day === row.startsOn || !placeable(row, day) || sprintItemSaving) {");
    expect(body).toContain('barDragClear();');
    expect(body).toContain('starts_on: day');
    expect(body).toContain('/sprint-items/');
    expect(body).toContain('loadAll();');
  });

  it('is OPTIMISTIC with a snap-back: the keys clear AFTER the flight, on both paths', () => {
    const body = handlerBody('barDragEnd');
    const clearAt = body.lastIndexOf('barDragClear();');
    const finallyAt = body.indexOf('} finally {');
    expect(finallyAt, 'the clear moved out of finally — a thrown request would strand the preview').toBeGreaterThan(-1);
    expect(clearAt, 'the preview is cleared before the reload — the bar rewinds and then jumps').toBeGreaterThan(finallyAt);
    // the refusal surfaces the SERVER's own sentence (OUT_OF_SPRINT /
    // PAST_DEADLINE / NOT_A_WORKDAY), and clearing the keys IS the snap-back
    expect(body).toContain('flashBanner(errText(err));');
    // all FOUR keys go together — the grab offset is as much a part of the
    // gesture as the day is, and a stale one would offset the next drag
    expect(fnBody('barDragClear')).toMatch(/dragRow: null,\s*dragDay: null,\s*dragLeft: null,\s*dragGrab: null/);
  });

  it('cancels on Escape without writing anything at all', () => {
    const body = handlerBody('barDragCancel');
    expect(body).toContain('barDragStop();');
    expect(body).toContain('barDragClear();');
    for (const forbidden of ['api.send', 'starts_on', 'loadAll']) {
      expect(body, `Escape reached the wire via \`${forbidden}\``).not.toContain(forbidden);
    }
  });

  it('has exactly these four handlers and no fifth', () => {
    // the frozen names (PLAN.md block 7). A fifth would be a second place the
    // gesture can end, which is how a listener gets left bound.
    const names = [...APP_JS_CODE.matchAll(/\n  (?:async )?(barDrag\w+)\([^)]*\) \{/g)].map((m) => m[1]!).sort();
    expect(names).toEqual(['barDragCancel', 'barDragEnd', 'barDragMove', 'barDragStart']);
  });
});

/* ====================================================================== *
 * SUITE 5d — the drag EXECUTED (review 2026-09-09: findings 1, 3 and 5).
 *
 * The source pins above say which door calls which. These three defects were
 * about what the doors DO with a pointer, so the shipped `barDragStart`,
 * `barDragMove`, `barDragCancel` and `addKey` are sliced out of the client and
 * RUN against the shipped geometry — nothing here is retyped.
 *
 * HONESTY NOTE: this is still not a browser. What it models is the ORDER a
 * browser delivers a keydown in (capture listeners on the window, then the
 * focused element's own handler, then bubble listeners) and the values a
 * mouse event carries; a real pointer stays E2E's.
 * ====================================================================== */

/** The 12 drawn weeks, their Mondays derived from the same unit walker. */
const WEEKS12 = Array.from({ length: 12 }, (_, i) => ({ key: isoAtUnit(i * 5) }));
/** The shipped track: 12 × --gw, so one unit is exactly 18.4px. */
const DRAG_RECT = { left: 1000, width: 1104 };
const DRAG_UNIT = DRAG_RECT.width / 60;
/** Viewport X at the middle of unit `u` — never on a boundary. */
const xAt = (u: number): number => DRAG_RECT.left + (u + 0.5) * DRAG_UNIT;

interface KeyResult { key: string; stopped: boolean }
interface Drag {
  state: Record<string, unknown>;
  fired: string[];
  listeners: Array<{ type: string; opts: unknown }>;
  start(rowId: string, clientX: number, ev?: Record<string, unknown>): void;
  move(rowId: string, clientX: number, ev?: Record<string, unknown>): void;
  /** a keydown delivered the way the DOM delivers one, to a focused field */
  press(key: string, sprintId: string | null): KeyResult;
}

let dragSrc: string | undefined;
const dragHarness = (rows: Array<Partial<SprintScheduleRow>>): Drag => {
  dragSrc ??= [
    ...GEO_NAMES.map((n) => topDecl(n)),
    ...['isoOf', 'isoAddDays', 'dayAtX', 'sprintRow', 'barDragUp', 'barDragKey', 'barDragStop', 'barDragClear'].map((n) => topDecl(n)),
    `const handlers = {
       barDragStart(ctx, rowId) ${handlerBody('barDragStart')},
       barDragMove(ctx, rowId) ${handlerBody('barDragMove')},
       barDragCancel() ${handlerBody('barDragCancel')},
       addKey(ctx, sprintId) ${handlerBody('addKey')},
     };`,
  ].join('\n');
  return new Function('ROWS', 'WEEKS', 'RECT', `
    "use strict";
    const state = {
      weekStart: '2026-08-03', plannerWeeks: WEEKS, sprintItems: { rows: ROWS },
      dragRow: null, dragDay: null, dragLeft: null, dragGrab: null,
      addQ: { s1: 'illustrate' },
    };
    const fired = [];
    const listeners = [];
    let sprintItemSaving = false;
    const app = {
      get: (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), state),
      set: (a, b) => {
        if (typeof a !== 'string') { Object.assign(state, a); return; }
        const parts = a.split('.');
        let o = state;
        while (parts.length > 1) o = o[parts.shift()];
        o[parts[0]] = b;
      },
      /* the window listeners fire handlers by name; barDragEnd is not in the
         map on purpose — it writes, and a write is the other suites' business */
      fire: (name) => { fired.push(name); if (handlers[name]) handlers[name](); },
    };
    const window = {
      addEventListener: (type, fn, opts) => { listeners.push({ type, fn, opts }); },
      removeEventListener: (type, fn, opts) => {
        const i = listeners.findIndex((l) => l.type === type && l.fn === fn && String(l.opts) === String(opts));
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    ${dragSrc}
    const track = { getBoundingClientRect: () => RECT };
    const ctxOf = (clientX, ev, node) => ({
      event: { clientX, button: 0, buttons: 1, preventDefault() {}, ...ev },
      node,
    });
    const isCapture = (l) => l.opts === true || !!(l.opts && l.opts.capture);
    return {
      state, fired, listeners,
      start: (rowId, clientX, ev) => handlers.barDragStart(
        ctxOf(clientX, ev, { closest: (s) => (s === '.gtrack' ? track : null), getBoundingClientRect: () => RECT }),
        rowId,
      ),
      move: (rowId, clientX, ev) => handlers.barDragMove(ctxOf(clientX, ev, track), rowId),
      press: (key, sprintId) => {
        const e = { key, stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {} };
        for (const l of listeners.filter((l) => l.type === 'keydown' && isCapture(l))) l.fn(e);
        if (!e.stopped && sprintId) handlers.addKey({ event: e }, sprintId);
        if (!e.stopped) for (const l of listeners.filter((l) => l.type === 'keydown' && !isCapture(l))) l.fn(e);
        return { key, stopped: e.stopped };
      },
    };
  `)(rows, WEEKS12, DRAG_RECT) as Drag;
};

describe('the drag, executed: the grab, the lost mouseup and the key it claims', () => {
  /** units 10–14, five days — the bar the E2E script drags. */
  const FIVE: Partial<SprintScheduleRow> = { id: 'r1', startsOn: '2026-08-17', finish: '2026-08-21', taskPrefix: 'Render Asset' };
  /** unit 59: the one column where the MIN_GRAB slide moves the resting bar. */
  const LAST: Partial<SprintScheduleRow> = { id: 'r2', startsOn: '2026-10-23', finish: '2026-10-23', taskPrefix: 'Render Asset' };

  it('opens the preview where the bar RESTS — mousedown moves nothing (finding 1)', () => {
    const d = dragHarness([LAST]);
    const resting = G().itemBar(LAST)[0]!;
    d.start('r2', xAt(59));
    expect(d.state.dragLeft, 'the bar jumped on mousedown').toBe(resting.left);
    expect(Number(d.state.dragLeft) + Number(resting.width), 'the preview hung off the end of the track')
      .toBeLessThanOrEqual(100);
  });

  it('carries the grab offset: a five-day bar taken by its THIRD day moves one day per day (finding 5)', () => {
    const d = dragHarness([FIVE]);
    d.start('r1', xAt(12)); // the bar covers units 10–14; the pointer is on 12
    expect(d.state.dragGrab, 'the offset between the bar’s left and the pointer’s column').toBe(-2);
    expect(d.state.dragDay).toBe('2026-08-17'); // opens on the row's own start
    d.move('r1', xAt(13)); // one unit right
    expect(d.state.dragDay, 'the bar teleported its left edge under the pointer').toBe('2026-08-18');
    expect(d.state.dragLeft).toBe(G().unitPct(11));
  });

  it('does not move while the pointer stays inside the day it was pressed on', () => {
    const d = dragHarness([FIVE]);
    d.start('r1', xAt(12));
    d.move('r1', xAt(12) + 2);
    expect(d.state.dragDay).toBe('2026-08-17');
    expect(d.state.dragLeft).toBe(G().itemBar(FIVE)[0]!.left);
  });

  it('is unchanged for a bar grabbed by its first day — offset zero, pointer’s own day', () => {
    const d = dragHarness([FIVE]);
    d.start('r1', xAt(10));
    expect(d.state.dragGrab).toBe(0);
    d.move('r1', xAt(20));
    expect(d.state.dragDay).toBe(isoAtUnit(20));
  });

  it('clamps the offset pointer to the window rather than naming a day off the axis', () => {
    const d = dragHarness([FIVE]);
    d.start('r1', xAt(12));
    d.move('r1', DRAG_RECT.left + DRAG_RECT.width + 5000);
    // the offset is applied FIRST and the clamp then holds the start on the
    // last drawn day, exactly as an unoffset drag to the same place would
    expect(d.state.dragDay).toBe(isoAtUnit(59));
    d.move('r1', -5000);
    expect(d.state.dragDay).toBe(isoAtUnit(0));
  });

  it('cancels on a BUTTON-LESS pointer — a lost mouseup does not leave the bar armed (finding 1, second half)', () => {
    const d = dragHarness([FIVE]);
    d.start('r1', xAt(10));
    d.move('r1', xAt(20), { buttons: 0 });
    expect(d.fired).toContain('barDragCancel');
    expect(d.state, 'the drag survived a release the window never saw').toMatchObject({
      dragRow: null, dragDay: null, dragLeft: null, dragGrab: null,
    });
    expect(d.listeners, 'the window listeners outlived the cancelled drag').toHaveLength(0);
    d.move('r1', xAt(30)); // and a further move steers nothing
    expect(d.state.dragDay).toBeNull();
  });

  it('claims Escape while it is live — the focused sprint search keeps its query (finding 3)', () => {
    const d = dragHarness([FIVE]);
    d.start('r1', xAt(10)); // mousedown preventDefaults, so focus stays in the field
    const e = d.press('Escape', 's1');
    expect(e.stopped, 'Escape ran on to the focused field').toBe(true);
    expect((d.state.addQ as Record<string, string>).s1, 'the drag’s Escape wiped a typed query').toBe('illustrate');
    expect(d.fired).toContain('barDragCancel');
    expect(d.state.dragRow).toBeNull();
  });

  it('leaves Escape alone when no drag is live — the field clears as it always did', () => {
    const d = dragHarness([FIVE]);
    const e = d.press('Escape', 's1');
    expect(e.stopped).toBe(false);
    expect((d.state.addQ as Record<string, string>).s1).toBe('');
    expect(d.fired).toEqual([]);
  });

  it('claims Escape and nothing else — every other key reaches the field mid-drag', () => {
    const d = dragHarness([FIVE]);
    d.start('r1', xAt(10));
    const e = d.press('a', 's1');
    expect(e.stopped).toBe(false);
    expect(d.fired).toEqual([]);
    expect(d.state.dragRow).toBe('r1');
  });
});
