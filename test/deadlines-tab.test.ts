/**
 * The Deadlines tab, rebuilt on the WORK-CARD unit — owls miles→jp #74 and
 * #75, jp→miles #58/#59, nodes 731:100853 (container), 731:100859 (range
 * navigator), 731:100872 (collapsed lane), 810:121954 (expanded lane),
 * I…810:122333/122334/122394 (the three card states), and the two empty cards.
 * Build contract: PLAN.md block 3 (decisions B1–B16).
 *
 * This file REPLACES test/deadlines-frame.test.ts, which proved the milestone
 * tab: the stats strip, the conflict banners, the Model Constants legend, the
 * search and the day-drag planner. Every one of those is withdrawn (#74 §2,
 * #74 §3, PLAN.md B9), so its guards are not "failing" — they are describing a
 * screen that no longer exists. The withdrawal itself is guarded here, in
 * section F, so nothing can quietly grow back — with ONE reversal since block
 * 9 (owls #88/#89, JP 2026-09-10): the day-drag is UN-RETIRED, rebuilt as a
 * bounded pointer drag on the card (test/deadlines-drag.test.ts), so section
 * F's "writes nothing" became "writes only the bounded day move".
 *
 * WHAT IS PROVEN, AND HOW:
 *  - the week arithmetic and the formatters are EXECUTED out of the
 *    shipped scripts (test/CLAUDE.md rule 2) — `dlMonthWeeks` against
 *    `lib/calendar.ts monthWeeks` itself, so the tab and the planner cannot
 *    end up disagreeing about which Monday a week is;
 *  - `dlBuild` is EXECUTED, never restated: the counts, the opt-in gate and
 *    the day columns are arithmetic, and a source-text guard could show the
 *    function exists without showing it counts;
 *  - the markup goes through `renderDeadlines` (rule 6) — real Ractive over
 *    the SHIPPED template, with the shipped `dlCard` partial registered;
 *  - the stylesheet rules that carry a RULE rather than a colour (a fixed card
 *    height, one opacity, one horizontal scroller) are swept, not spot-checked.
 *
 * WHAT THIS FILE CANNOT PROVE: that the lanes actually scroll, that a card
 * clamps at three lines, that the chevron reads as pressable, or that the
 * quote bar clips to the card's radius. `toHTML()` has no layout, no pointer
 * and no clock — those belong to the live pass.
 */

import { describe, expect, it } from 'vitest';
import { monthWeeks } from '../lib/calendar.ts';
import {
  APP_JS,
  APP_JS_CODE,
  DEADLINES_CSS,
  ICONS_JS,
  TEMPLATE,
  type DlCard,
  type DlWeek,
  dlCardPartial,
  fnBody,
  handlerBody,
  renderDeadlines,
  tabViewCode,
  topDecl,
} from './helpers/gantt-render.ts';

/* ====================================================================== *
 * The shipped recipes, sliced and executed (`topDecl`, the helper's slicer
 * for a `function` or a `const` at column zero).
 * ====================================================================== */

/** A schedule row as the `/deliverables` payload carries it — only the fields `dlBuild` reads. */
interface DlRow {
  id: string;
  cardId: string;
  mcNumber: string;
  name: string;
  urgent?: boolean;
  difficulty?: string | null;
  assetType?: string | null;
  currentList?: string | null;
  status?: string | null;
  trelloUrl?: string | null;
  figmaUrl?: string | null;
  startsOn?: string | null;
  finish?: string | null;
}

interface Recipe {
  DL_MONTHS: string[];
  dlMonthWeeks(year: number, month: number): string[];
  dlRangeLabel(mondays: string[]): string;
  dlWeekRange(monday: string): string;
  dlBuild(rows: DlRow[], mondays: string[], cap: number): DlWeek[];
}

/* Sliced LAZILY: `topDecl` throws when a name is absent, and a throw at module
   scope would take every describe in the file down together — including the
   withdrawal sweep, which is exactly the guard you want to still read when the
   new helpers have not landed. Dependencies come FIRST: these are `const`
   arrows in the shipped bundle, so a consumer declared above its dependency
   would hit the temporal dead zone rather than the value. The Monday helpers
   (`mondayIso`, `mondayShift`, `fridayIso`) are the shared date recipes the
   week walk and the two range formatters call. */
let recipeCache: Recipe | undefined;
const R = (): Recipe =>
  (recipeCache ??= new Function(`
    ${topDecl('isoOf')}
    ${topDecl('MONTHS_SHORT')}
    ${topDecl('mondayIso')}
    ${topDecl('mondayShift')}
    ${topDecl('fridayIso')}
    ${topDecl('isoAddDays')}
    ${topDecl('addLabel')}
    ${topDecl('DL_MONTHS')}
    ${topDecl('DL_DAY_NAMES')}
    ${topDecl('dlMonthWeeks')}
    ${topDecl('dlRangeLabel')}
    ${topDecl('dlWeekRange')}
    ${topDecl('dlBuild')}
    return { DL_MONTHS, dlMonthWeeks, dlRangeLabel, dlWeekRange, dlBuild };
  `)() as Recipe);

/* ====================================================================== *
 * Fixtures
 * ====================================================================== */

/** August 2026: Mon 3rd–7th, 10th–14th, 17th–21st, 24th–28th, and 31st–Sept 4th. */
const AUG = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'];

const row = (over: Partial<DlRow> = {}): DlRow => ({
  id: 'i1',
  cardId: 'w1',
  mcNumber: 'MC-655',
  name: 'Sketch Asset: Hero render',
  urgent: false,
  difficulty: 'Hard',
  assetType: null,
  currentList: 'Working on design',
  status: 'ongoing',
  trelloUrl: 'https://trello.com/c/w1',
  figmaUrl: null,
  startsOn: '2026-08-03',
  finish: '2026-08-05',
  ...over,
});

const build = (rows: DlRow[], mondays: string[] = AUG, cap = 120): DlWeek[] => R().dlBuild(rows, mondays, cap);

/** The single week a one-row fixture lands in. */
const oneWeek = (rows: DlRow[], cap = 120): DlWeek => build(rows, [AUG[0]!], cap)[0]!;

const card = (over: Partial<DlCard> = {}): DlCard => ({
  id: 'i1',
  cardId: 'w1',
  mc: 'MC-655',
  label: 'MC-655: Sketch Asset: Hero render',
  urgent: false,
  difficulty: 'Hard',
  assetType: null,
  lane: 'Working on design',
  done: false,
  trelloUrl: 'https://trello.com/c/w1',
  figmaUrl: null,
  ...over,
});

const day = (over: Partial<DlWeek['days'][number]> = {}): DlWeek['days'][number] => ({
  day: '2026-08-03',
  name: 'Mon',
  cards: [],
  pending: 0,
  done: 0,
  ...over,
});

const week = (over: Partial<DlWeek> = {}): DlWeek => ({
  key: '2026-08-03',
  label: 'Week 1',
  range: '3 - 7 Aug 2026',
  cards: [],
  pending: 0,
  urgent: 0,
  done: 0,
  load: 0,
  capPct: '0.0',
  days: ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'].map((d, i) =>
    day({ day: d, name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i]! }),
  ),
  ...over,
});

/** The deadlines view as shipped, with prose stripped: guards read CODE, not comments. */
const deadlinesView = (): string => tabViewCode('deadlines');

/** One `<article class="dlcard…">…</article>` per rendered card. */
const cards = (html: string): string[] =>
  [...html.matchAll(/<article class="dlcard[^"]*"[^>]*>[\s\S]*?<\/article>/g)].map((m) => m[0]);

/** One `<section class="dlweek…">` open tag per lane. */
const lanes = (html: string): string[] => [...html.matchAll(/<section class="dlweek[^"]*"[^>]*>/g)].map((m) => m[0]);

/* ====================================================================== *
 * A — the weeks the tab shows (PLAN.md B3, decision B16)
 * ====================================================================== */

/** Twenty-four consecutive months from December 2025, as `[year, monthIndex]`. */
const TWO_YEARS: Array<[number, number]> = Array.from({ length: 24 }, (_, i) => [
  2025 + Math.floor((11 + i) / 12),
  (11 + i) % 12,
]);

describe('the month’s weeks ARE the planner’s weeks (PLAN.md B3)', () => {
  it('agrees with lib/calendar.ts monthWeeks — the same Mondays, over two whole years', () => {
    /* THE RULE: Deadlines and Sprint Schedules must never disagree about which
       week a day belongs to. They read one set of rows (PLAN.md B1), so a
       second week-key derivation is the one place they could still drift —
       and `lib/calendar.ts` is frozen (invariant 5), which makes it the oracle
       rather than the other way round.

       EXECUTED against the engine, not compared as source (test/CLAUDE.md rule
       2), across twenty-four consecutive months so every month-start weekday
       and both year boundaries are covered. A hand-written expectation here
       would just be a third derivation to keep in step. */
    for (const [year, m] of TWO_YEARS) {
      expect(R().dlMonthWeeks(year, m), `${year}-${m + 1}`).toEqual(monthWeeks(year, m).map((w) => w.key));
    }
  });

  it('shows a straddling week under BOTH its months, and skips none', () => {
    /* The consequence of the engine's own rule, said out loud: a week whose
       Mon–Fri span touches two months belongs to both, so paging forward shows
       it twice — once at the end of one month and once at the start of the
       next. What must never happen is a week nobody can reach, so the union is
       checked for gaps: consecutive Mondays, seven days apart, end to end. */
    const seen = [...new Set(TWO_YEARS.flatMap(([year, m]) => R().dlMonthWeeks(year, m)))].sort();
    expect(seen.length).toBeGreaterThan(100);
    for (let i = 1; i < seen.length; i++) {
      // stated in DAYS, not as a formatted string — seven means the next
      // Monday, and anything else is a week nobody can page to
      const gap = Math.round(
        (new Date(`${seen[i]!}T00:00:00`).getTime() - new Date(`${seen[i - 1]!}T00:00:00`).getTime()) / 86400000,
      );
      expect(gap, `a week is missing between ${seen[i - 1]} and ${seen[i]}`).toBe(7);
    }
    // and the sharing is real, not an artefact of the union above
    const sept = R().dlMonthWeeks(2026, 8);
    expect(sept.at(-1)).toBe('2026-09-28');
    expect(R().dlMonthWeeks(2026, 9)[0]).toBe('2026-09-28');
  });

  it('every key is a Monday, whatever the host timezone', () => {
    // invariant 11 in its client half: these are LOCAL calendar strings, and a
    // UTC round-trip would slide the day for anyone east or west of the line
    for (const [year, m] of TWO_YEARS) {
      for (const key of R().dlMonthWeeks(year, m)) {
        expect(new Date(`${key}T00:00:00`).getDay(), key).toBe(1);
      }
    }
  });

  it('drops a leading week whose whole working span falls before the month', () => {
    // the front edge is NOT shared: a Monday–Friday that finishes in the
    // previous month has nothing of this month in it and is not shown
    for (const [year, m] of TWO_YEARS) {
      const first = new Date(`${R().dlMonthWeeks(year, m)[0]!}T00:00:00`);
      first.setDate(first.getDate() + 4); // its Friday
      expect(first >= new Date(year, m, 1), `${year}-${m + 1}`).toBe(true);
    }
  });
});

/* ====================================================================== *
 * B — the formatters (PLAN.md B16; node 731:100859)
 * ====================================================================== */

describe('the labels are written the way the frame writes them', () => {
  it('spells the ninth month `Sept`, which is the frame’s own spelling', () => {
    /* The month table is a SEPARATE one from `MONTHS_SHORT` for this single
       reason (node 731:100859 and the week headers alike). Asserted as the
       rule — this table says Sept, the app-wide one says Sep — so the two
       cannot be quietly merged back together. */
    expect(R().DL_MONTHS[8]).toBe('Sept');
    expect(R().DL_MONTHS).toHaveLength(12);
    expect(R().dlWeekRange('2026-08-31')).toContain('Sept');
  });

  it('labels the navigator from the first shown Monday to the month’s last day', () => {
    expect(R().dlRangeLabel(R().dlMonthWeeks(2026, 8))).toBe('Aug 31 – Sept 30, 2026');
    // a month whose first week starts inside it needs no borrowed Monday
    expect(R().dlRangeLabel(R().dlMonthWeeks(2025, 11))).toBe('Dec 1 – Dec 31, 2025');
  });

  it('names the month from the FIRST week’s Friday, never the last week’s', () => {
    /* THE TRAP: a straddling week is shown under both its months, so the LAST
       Monday's Friday can already be in the month after this one — September
       2026's last lane ends on the second of October. Read from that end, the
       navigator would announce October while showing September's weeks. The
       first week's Friday is inside the month by construction. */
    const sept = R().dlMonthWeeks(2026, 8);
    expect(sept.at(-1), 'the fixture stopped straddling — pick another month').toBe('2026-09-28');
    expect(R().dlRangeLabel(sept)).toContain('Sept 30');
    expect(R().dlRangeLabel(sept)).not.toContain('Oct');
  });

  it('renders nothing for an empty month rather than a half-written label', () => {
    expect(R().dlRangeLabel([])).toBe('');
  });

  it('names both years when the shown weeks straddle one', () => {
    /* Asserted by PARTS, not as a fixed string: PLAN.md B16 fixes the format
       for the ordinary case and is silent on where the second year goes, so
       pinning a spelling here would forbid a correct choice. What must be true
       is that neither end is left to be guessed. */
    const label = R().dlRangeLabel(R().dlMonthWeeks(2026, 0));
    expect(label.startsWith('Dec 29')).toBe(true);
    expect(label).toContain('Jan 31');
    expect(label).toContain('2026');
  });

  it('writes a week range day-first, and names both months or both years when it straddles', () => {
    expect(R().dlWeekRange('2026-08-03')).toBe('3 - 7 Aug 2026');
    expect(R().dlWeekRange('2026-08-31')).toBe('31 Aug - 4 Sept 2026');
    expect(R().dlWeekRange('2025-12-29')).toBe('29 Dec 2025 - 2 Jan 2026');
  });

  it('derives every one of them with no locale call, so no timezone can shift a day', () => {
    /* The lesson `fmtLongIso` and `fmtWeekRange` were both built on: pure
       string maths over a fixed month table cannot be moved by the host's
       clock, and `toLocaleDateString` under a non-Manila TZ once shipped a
       label a day out. The suites run TZ=UTC and TZ=Asia/Manila, which is what
       makes this assertion checkable rather than decorative. */
    for (const name of ['dlWeekRange', 'dlRangeLabel', 'DL_DAY_NAMES']) {
      expect(topDecl(name), `${name} reads the host locale`).not.toContain('toLocaleDateString');
    }
  });
});

/* ====================================================================== *
 * C — dlBuild: the opt-in gate, the day, the counts (PLAN.md B2/B4/B5)
 * ====================================================================== */

describe('a card is on this tab only because someone put it there (#74 §1)', () => {
  it('draws a row that is BOTH in a sprint list and plotted, and no other', () => {
    /* Doubly opt-in is the whole premise of the rebuild: the old tab
       reconciled against the entire board, so cards nobody had scheduled
       appeared as deadlines. A row with no `startsOn` has not been plotted; a
       row with no `finish` cannot be forecast (no difficulty label, or the
       card left the board) and has no forecast to gate on. Neither is drawn,
       and neither rolls.

       WHICH HALF EACH FIXTURE CATCHES CHANGED with the placement key (spec
       v1.3 §6.2, 2026-09-08). The `finish` half is now the load-bearing one:
       `w3` is plotted on a day the lane draws, so dropping `!r.finish` would
       put an unforecastable card on screen and this assertion is what stops
       it. The `startsOn` half is now held TWICE — by the gate and by the
       column lookup, which finds nothing for a null day — so `w2` can no
       longer fail alone, and it stays as the statement of the rule rather
       than as its only proof (it was the reverse under the finish-day key;
       block 3 VALIDATE, proof P4). It still carries a finish on purpose: the
       server never emits that shape. */
    const w = oneWeek([
      row(),
      row({ id: 'i2', cardId: 'w2', startsOn: null, finish: '2026-08-06' }),
      row({ id: 'i3', cardId: 'w3', startsOn: '2026-08-03', finish: null }),
    ]);
    expect(w.cards.map((c) => c.cardId)).toEqual(['w1']);
  });

  it('draws no card for a row whose lane sits OUTSIDE the pipeline, on a day it would otherwise fill', () => {
    /* THE RULE (PLAN.md frozen `excluded` rule, review ruling 2026-09-08):
       Deadlines never renders an excluded card. The server keeps sending the
       row on purpose — Sprint Schedules still lists what the PM added, and
       rollover deliberately leaves it where it is — so the ONLY thing that
       keeps ops, discarded and unused work off this board is this filter.

       The fixture is deliberately drawable: same start day, same shown week,
       same shape as `w1` beside it, differing in `status` alone. So the
       assertion cannot pass because the card fell outside the month or lost
       its forecast — it passes only while the state is read. All four
       consequences are pinned, because the row reaches four places: the day
       column, the week's card list, the week's counts, and the load that
       fills the progress bar against the project's capacity. */
    const w = oneWeek([
      row(),
      row({ id: 'i9', cardId: 'w9', currentList: 'Discarded Work', status: 'excluded' }),
      row({ id: 'i8', cardId: 'w8', currentList: 'Ops Work Complete', status: 'excluded', urgent: true }),
    ]);
    expect(w.days.find((d) => d.day === '2026-08-03')!.cards.map((c) => c.cardId)).toEqual(['w1']);
    expect(w.cards.map((c) => c.cardId)).toEqual(['w1']);
    expect([w.pending, w.urgent, w.done]).toEqual([0, 0, 0]);
    expect([w.load, w.capPct]).toEqual([1, '0.8']);
  });

  it('places a card on the day it STARTS, not on its forecast finish', () => {
    /* Spec v1.3 §6.2 (2026-09-08) reversing block 3's B2: the day work begins
       is the design lead's own instrument, and a computed finish is not a
       date the lead can choose or move. The finish keeps its two other jobs —
       half of the gate above, and rollover's test — and loses this one. */
    const w = oneWeek([row({ startsOn: '2026-08-03', finish: '2026-08-06' })]);
    expect(w.days.find((d) => d.day === '2026-08-03')!.cards.map((c) => c.cardId)).toEqual(['w1']);
    expect(w.days.find((d) => d.day === '2026-08-06')!.cards).toEqual([]);
  });

  it('counts a card in the week it STARTS, even when its finish lands in the next one', () => {
    /* The key decides the WEEK as well as the day, and a Friday start with
       the following Tuesday's finish is the only shape where the two answers
       differ. Every number below sat one lane to the right under the retired
       finish-day rule — the week's three counts, its load, and the day
       header's own pair. */
    const [first, second] = build([
      row({ startsOn: '2026-08-07', finish: '2026-08-11', status: 'pending', urgent: true }),
    ]);
    const fri = first!.days.find((d) => d.day === '2026-08-07')!;
    expect(fri.cards.map((c) => c.cardId)).toEqual(['w1']);
    expect([fri.pending, fri.done]).toEqual([1, 0]);
    expect([first!.pending, first!.urgent, first!.done, first!.load]).toEqual([1, 1, 0, 1]);
    expect(second!.cards).toEqual([]);
    expect([second!.pending, second!.urgent, second!.done, second!.load]).toEqual([0, 0, 0, 0]);
  });

  it('leaves a card whose START falls outside the shown weeks undrawn', () => {
    // the month is a SCOPE, as it always was (R-d2-d): a September start is
    // not smuggled into an August lane
    expect(build([row({ startsOn: '2026-09-09', finish: '2026-09-11' })]).flatMap((w) => w.cards)).toEqual([]);
    // …and the mirror, which is what the flip changed: a card that STARTS in
    // the shown weeks is drawn even though its finish has left the month
    expect(build([row({ startsOn: '2026-08-24', finish: '2026-09-02' })]).flatMap((w) => w.cards).map((c) => c.cardId))
      .toEqual(['w1']);
  });

  it('carries the card’s own fields through, label built by the ONE labeller', () => {
    const c = oneWeek([
      row({ urgent: true, assetType: 'Icon', figmaUrl: 'https://figma.com/f/1', difficulty: 'Easy' }),
    ]).cards[0]!;
    expect(c).toMatchObject({
      id: 'i1',
      cardId: 'w1',
      mc: 'MC-655',
      urgent: true,
      difficulty: 'Easy',
      assetType: 'Icon',
      lane: 'Working on design',
      done: false,
      trelloUrl: 'https://trello.com/c/w1',
      figmaUrl: 'https://figma.com/f/1',
    });
    // the label is `addLabel`'s, the same recipe the schedule's search shows —
    // built, not restated, so the two lists cannot start reading differently
    expect(c.label).toBe(new Function(`${topDecl('addLabel')} return addLabel('MC-655', 'Sketch Asset: Hero render');`)());
  });

  it('reads the lane VERBATIM — no translation, no keyword tidying (#75 §1)', () => {
    // the 50-lane mapping LANDED on 2026-09-08 as the LIST_STATES table
    // (src/services/status-rules.ts) — and what the card shows is still the
    // Trello list's own words, never the state it maps to
    expect(oneWeek([row({ currentList: 'For Client Review (Batch 2)' })]).cards[0]!.lane).toBe('For Client Review (Batch 2)');
    expect(oneWeek([row({ currentList: null })]).cards[0]!.lane).toBeNull();
  });
});

describe('the three counts are independent, and none is derived from another (#75 §1)', () => {
  const MIXED = [
    row({ id: 'a', cardId: 'a', status: 'pending', urgent: false }),
    row({ id: 'b', cardId: 'b', status: 'done', urgent: false }),
    row({ id: 'c', cardId: 'c', status: 'ongoing', urgent: true }),
    row({ id: 'd', cardId: 'd', status: 'pending', urgent: true }),
  ];

  it('counts pending and done as MAPPED states — an ongoing card is in neither', () => {
    /* THE DEFECT THIS FORBIDS: `done = total − pending`. Ongoing is a real
       third state, so any subtraction reports it as done and the week reads
       finished while the work is running. */
    const w = oneWeek(MIXED);
    expect([w.pending, w.done]).toEqual([2, 1]);
    expect(w.pending + w.done).toBeLessThan(w.cards.length);
  });

  it('counts urgent ACROSS the statuses, so it can exceed either of them', () => {
    const w = oneWeek(MIXED);
    expect(w.urgent).toBe(2); // one ongoing, one pending
    // …and an urgent DONE card is counted in both, which is the cross-cutting
    // rule stated as a case rather than as an implementation
    const both = oneWeek([row({ status: 'done', urgent: true })]);
    expect([both.urgent, both.done, both.pending]).toEqual([1, 1, 0]);
  });

  it('flags `done` on the card from the same state the count reads', () => {
    expect(oneWeek([row({ status: 'done' })]).cards[0]!.done).toBe(true);
    expect(oneWeek([row({ status: 'ongoing' })]).cards[0]!.done).toBe(false);
    expect(oneWeek([row({ status: null })]).cards[0]!.done).toBe(false);
  });

  it('gives each DAY the two counts its header shows, and the week the three (#75 §4)', () => {
    // the asymmetry is drawn, not an oversight: leave it. The rows are told
    // apart by `startsOn`, which is what puts a card in a column (§6.2)
    const w = oneWeek([
      row({ id: 'a', cardId: 'a', status: 'pending', startsOn: '2026-08-04' }),
      row({ id: 'b', cardId: 'b', status: 'done', startsOn: '2026-08-04' }),
      row({ id: 'c', cardId: 'c', status: 'ongoing', startsOn: '2026-08-05' }),
    ]);
    const tue = w.days.find((d) => d.day === '2026-08-04')!;
    const wed = w.days.find((d) => d.day === '2026-08-05')!;
    expect([tue.pending, tue.done]).toEqual([1, 1]);
    expect([wed.pending, wed.done]).toEqual([0, 0]);
    expect(wed.cards).toHaveLength(1);
  });
});

describe('the progress line counts work cards, not weighted load (PLAN.md B5)', () => {
  it('is a PLAIN count of the week’s cards, every status', () => {
    /* The retired tab showed BR-6c card-EQUIVALENTS here, which is a different
       number and reads as a mistake beside a lane you can count with your
       eyes. Three cards is three, whatever their difficulty. */
    const w = oneWeek([
      row({ id: 'a', cardId: 'a', difficulty: 'Hard' }),
      row({ id: 'b', cardId: 'b', difficulty: 'Easy', status: 'done' }),
      row({ id: 'c', cardId: 'c', difficulty: null, finish: '2026-08-06' }),
    ]);
    expect(w.load).toBe(3);
  });

  it('fills the bar by load over capacity, to one decimal', () => {
    expect(oneWeek([row()], 8).capPct).toBe('12.5');
    expect(oneWeek([], 8).capPct).toBe('0.0');
  });

  it('CAPS the fill at one hundred — an over-capacity week cannot overrun its track', () => {
    const heavy = Array.from({ length: 5 }, (_, i) => row({ id: `x${i}`, cardId: `x${i}` }));
    expect(oneWeek(heavy, 2).load).toBe(5);
    expect(oneWeek(heavy, 2).capPct).toBe('100.0');
  });
});

describe('the day columns are the working week (PLAN.md B7)', () => {
  it('draws Monday to Friday in order, named by position, and no weekend', () => {
    /* The frame draws no holiday state, so a column carries no flag and the
       builder reads no calendar (simplification pass, F-1): a day the PM
       plots on renders like any other, holiday or not, and the tab says
       nothing about it either way. The names are fixed by position
       — the Monday plus zero to four — never parsed from the date. */
    const w = oneWeek([]);
    expect(w.days.map((d) => d.name)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(w.days.map((d) => d.day)).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
    ]);
    // the same five names, whichever Monday the lane starts on
    expect(build([], ['2025-12-29'])[0]!.days.map((d) => d.name)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(build([], ['2025-12-29'])[0]!.days.map((d) => d.day)).toEqual([
      '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
    ]);
  });

  it('numbers and dates the lanes in shown order', () => {
    const built = build([]);
    expect(built.map((w) => w.key)).toEqual(AUG);
    expect(built.map((w) => w.label)).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4']);
    expect(built[0]!.range).toBe(R().dlWeekRange(AUG[0]!));
  });

  it('keeps the rows’ own order inside a lane and inside a day — nothing re-sorts', () => {
    /* Order is the schedule's (position), by decision at the gate. A silent
       re-sort here would make the two tabs list the same cards differently for
       no reason a reader could see. */
    const w = oneWeek([
      row({ id: 'z', cardId: 'z', startsOn: '2026-08-05' }),
      row({ id: 'a', cardId: 'a', startsOn: '2026-08-05' }),
      row({ id: 'm', cardId: 'm', startsOn: '2026-08-04' }),
    ]);
    expect(w.days.find((d) => d.day === '2026-08-05')!.cards.map((c) => c.cardId)).toEqual(['z', 'a']);
    // …and across days the lane reads by DAY first, then by row order
    expect(w.cards.map((c) => c.cardId)).toEqual(['m', 'z', 'a']);
  });

  it('is PURE — it reads no app state and no clock', () => {
    // it takes rows, weeks and capacity as arguments precisely so a test can
    // execute it; an `app.get` inside would make that impossible and would
    // put a second source of the month scope in the build
    const body = topDecl('dlBuild');
    for (const forbidden of ['app.get', 'app.set', 'manilaToday', 'new Date()']) {
      expect(body, `dlBuild reaches for ${forbidden}`).not.toContain(forbidden);
    }
  });
});

/* ====================================================================== *
 * D — the markup (renderDeadlines over the SHIPPED template)
 * ====================================================================== */

describe('the month navigator is the whole date control (node 731:100859)', () => {
  it('renders a previous and a next button around the range label', () => {
    const html = renderDeadlines({ dlRange: 'Aug 31 – Sept 30, 2026' });
    expect(html).toContain('class="dlnav"');
    expect(html).toMatch(/class="dlnavbtn prev"/);
    expect(html).toMatch(/class="dlnavbtn next"/);
    expect(html).toContain('Aug 31 – Sept 30, 2026');
    expect(html).toContain('data-icon="rowChevron"');
  });

  it('is NOT a calendar and NOT a search — both are withdrawn (#74 §2)', () => {
    const html = renderDeadlines({ dlWeeks: [week()] });
    expect(html).not.toContain('duegrid');
    expect(html).not.toContain('<input');
  });

  it('wires the arrows to monthShift (source — directives never reach toHTML)', () => {
    const view = deadlinesView();
    expect(view).toContain("['monthShift', -1]");
    expect(view).toContain("['monthShift', 1]");
  });
});

describe('a COLLAPSED lane stacks the week’s cards (node 731:100872)', () => {
  const WEEK = week({ cards: [card(), card({ id: 'i2', cardId: 'w2', mc: 'MC-656' })], load: 2, capPct: '1.7', pending: 1, urgent: 1, done: 0 });
  const html = renderDeadlines({ dlWeeks: [WEEK] });

  it('renders one lane, its title and its range', () => {
    expect(lanes(html)).toHaveLength(1);
    expect(html).toContain('Week 1');
    expect(html).toContain('3 - 7 Aug 2026');
  });

  it('stacks the cards and draws NO day columns', () => {
    expect(cards(html)).toHaveLength(2);
    expect(html).not.toContain('class="dldays');
    expect(html).not.toContain('class="dlday"');
  });

  it('withholds the three counts until the lane is open — the collapsed heading carries none', () => {
    // the frame gives the counts to the expanded heading only; a collapsed
    // lane shows title, range and the progress line
    expect(html).not.toContain('Pending');
    expect(html).not.toContain('Done');
  });

  it('shows the progress line as N over the project’s weekly capacity', () => {
    expect(html).toContain('2 / 120 Work Cards');
    expect(html).toMatch(/class="dlfill"[^>]*width:\s*1\.7%/);
  });

  it('draws the dashed empty card, in the week’s own words, when nothing is slated', () => {
    const empty = renderDeadlines({ dlWeeks: [week()] });
    expect(cards(empty)).toHaveLength(0);
    expect(empty).toContain('class="dlempty"');
    expect(empty).toContain('None slated this week');
    expect(empty).not.toContain('None slated today');
  });

  it('wires the chevron to toggleWeek with the lane’s own key (source)', () => {
    expect(deadlinesView()).toContain("['toggleWeek', w.key]");
  });
});

describe('an EXPANDED lane is five day columns (node 810:121954)', () => {
  const D = (over: Partial<DlWeek['days'][number]>) => day(over);
  const WEEK = week({
    cards: [card()],
    load: 1,
    capPct: '0.8',
    pending: 2,
    urgent: 1,
    done: 3,
    days: [
      D({ day: '2026-08-03', name: 'Mon', cards: [card()], pending: 1, done: 0 }),
      D({ day: '2026-08-04', name: 'Tue' }),
      D({ day: '2026-08-05', name: 'Wed' }),
      D({ day: '2026-08-06', name: 'Thu' }),
      D({ day: '2026-08-07', name: 'Fri' }),
    ],
  });
  const html = renderDeadlines({ dlWeeks: [WEEK], expandedWeek: '2026-08-03' });

  it('marks the lane open and draws exactly five day columns', () => {
    expect(lanes(html)[0]).toMatch(/class="dlweek[^"]*\bexpanded\b/);
    expect([...html.matchAll(/class="dlday"/g)]).toHaveLength(5);
    // the row of columns is also the drop LANE (block 9): it carries the week
    expect(html).toContain('class="dldays dllane" data-week="2026-08-03"');
  });

  it('names each day and gives it the TWO counts the frame draws', () => {
    for (const name of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) expect(html).toContain(`>${name}<`);
    expect([...html.matchAll(/class="dldhead"/g)]).toHaveLength(5);
    expect(html).toContain('1 Pending');
    expect(html).toContain('0 Done');
    // the day header carries no URGENT count — the asymmetry is drawn (#75 §4)
    const monHead = html.slice(html.indexOf('class="dldhead"'), html.indexOf('class="dlcards"', html.indexOf('class="dldhead"')));
    expect(monHead).not.toContain('Urgent');
  });

  it('gives the WEEK heading the three counts, in the frame’s order', () => {
    const head = html.slice(html.indexOf('dlwhead'), html.indexOf('dlprogress'));
    expect(head).toContain('2 Pending');
    expect(head).toContain('1 Urgent');
    expect(head).toContain('3 Done');
    expect(head.indexOf('Pending')).toBeLessThan(head.indexOf('Urgent'));
    expect(head.indexOf('Urgent')).toBeLessThan(head.indexOf('Done'));
  });

  it('draws the day’s own empty card in every column that has nothing', () => {
    expect([...html.matchAll(/None slated today/g)]).toHaveLength(4);
    expect(html).not.toContain('None slated this week');
  });

  it('opens ONE lane at a time — a second lane in the same render stays collapsed', () => {
    const two = renderDeadlines({
      dlWeeks: [WEEK, week({ key: '2026-08-10', label: 'Week 2' })],
      expandedWeek: '2026-08-03',
    });
    const open = lanes(two).filter((l) => /\bexpanded\b/.test(l));
    expect(open).toHaveLength(1);
  });
});

describe('the card is the frame’s card (nodes …810:122333 / 122334 / 122394)', () => {
  it('states urgency ONLY on an urgent card — the other state draws no chip (JP 2026-09-08)', () => {
    /* The card used to print urgency on every card, on the reading that an
       absent Trello label is itself a value. JP withdrew that: the chip is
       display noise unless it says Urgent, so the second state now renders
       nothing at all — not a paler chip, not an empty one. */
    const urgent = cards(renderDeadlines({ dlWeeks: [week({ cards: [card({ urgent: true })] })] }))[0]!;
    const not = cards(renderDeadlines({ dlWeeks: [week({ cards: [card({ urgent: false })] })] }))[0]!;
    expect(urgent).toMatch(/class="dlbadge b-urgent"/);
    expect(urgent).toContain('>Urgent<');
    // no badge of the family carries the word, and the retired class is gone
    expect(not).not.toMatch(/class="dlbadge[^"]*"[^>]*>[^<]*Urgent/);
    expect(not).not.toContain('b-nonurgent');
    // …while the badges that are not urgency are untouched by the withdrawal
    expect(not).toMatch(/class="dlbadge b-Hard"/);
    expect(not).toMatch(/class="dlbadge b-lane"/);
  });

  it('shows difficulty, asset type and lane ONLY when the card carries them', () => {
    const full = cards(renderDeadlines({
      dlWeeks: [week({ cards: [card({ difficulty: 'Medium', assetType: 'Icon', lane: 'Working on design' })] })],
    }))[0]!;
    expect(full).toMatch(/class="dlbadge b-Medium"/);
    expect(full).toMatch(/class="dlbadge b-asset"[^<]*>Asset: Icon</);
    expect(full).toMatch(/class="dlbadge b-lane"/);
    expect(full).toContain('Working on design');

    const bare = cards(renderDeadlines({
      dlWeeks: [week({ cards: [card({ difficulty: null, assetType: null, lane: null })] })],
    }))[0]!;
    expect(bare).not.toContain('b-Medium');
    // read by CLASS, not by the word: the fixture's own title carries the word
    // `Asset:` (real board titles read `Sketch Asset: …`), and a text search
    // would have passed on the title while the badge was missing
    expect(bare).not.toContain('b-asset');
    expect(bare).not.toContain('b-lane');
    // …and since 2026-09-08 a bare NON-URGENT card has no badge row content at
    // all: urgency is the one that used to never drop, and it drops now
    expect(bare).not.toContain('b-nonurgent');
    // the badges ROW survives and renders empty — read as `dlbadge` followed
    // by a boundary, or the container's own class satisfies the search
    expect(bare).not.toMatch(/class="dlbadge[ "]/);
  });

  it('shows the label and NO date — the column the card sits in IS the date', () => {
    const c = cards(renderDeadlines({ dlWeeks: [week({ cards: [card()] })] }))[0]!;
    expect(c).toContain('MC-655: Sketch Asset: Hero render');
    expect(c).not.toContain('2026-08-05');
  });

  it('links to Trello and to Figma, each only when the card has one', () => {
    const both = cards(renderDeadlines({ dlWeeks: [week({ cards: [card({ figmaUrl: 'https://figma.com/f/1' })] })] }))[0]!;
    expect(both).toContain('https://trello.com/c/w1');
    expect(both).toContain('https://figma.com/f/1');
    const one = cards(renderDeadlines({ dlWeeks: [week({ cards: [card({ trelloUrl: null })] })] }))[0]!;
    expect(one).not.toContain('trello.com');
    expect(one).not.toContain('figma.com');
  });

  it('gives the quote bar to URGENT cards and to nothing else (#74 §3)', () => {
    /* The retired card struck a plain accent stripe on EVERY card — blue when
       not urgent — so the mark said nothing. It is now the urgency mark
       itself: present or absent, never a second colour. */
    const urgent = cards(renderDeadlines({ dlWeeks: [week({ cards: [card({ urgent: true })] })] }))[0]!;
    const not = cards(renderDeadlines({ dlWeeks: [week({ cards: [card({ urgent: false })] })] }))[0]!;
    expect(urgent).toContain('class="dlquote"');
    expect(urgent).toContain('<path');
    expect(not).not.toContain('dlquote');
    expect(urgent).toMatch(/class="dlcard[^"]*\burgent\b/);
  });

  it('marks a finished card `done`, and marks nothing else about it (#75 §3)', () => {
    const done = cards(renderDeadlines({ dlWeeks: [week({ cards: [card({ done: true })] })] }))[0]!;
    expect(done).toMatch(/class="dlcard[^"]*\bdone\b/);
    // the frame restyles NOTHING else — same badges, same links, same title.
    // The urgency chip is not among them on THIS fixture: since 2026-09-08 it
    // is drawn only where the card is urgent, and this one is not.
    expect(done).toContain('b-Hard');
    expect(done).not.toContain('b-nonurgent');
    expect(done).toContain('MC-655');
  });
});

/* ====================================================================== *
 * E — the stylesheet rules that are rules, not colours
 * ====================================================================== */

/** Every rule of one sheet as `{ selector, body }`, comments stripped first. */
const cssRules = (css: string): Array<{ selector: string; body: string }> =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('}')
    .map((chunk) => {
      const at = chunk.indexOf('{');
      return at < 0 ? null : { selector: chunk.slice(0, at).trim(), body: chunk.slice(at + 1) };
    })
    .filter((r): r is { selector: string; body: string } => r !== null && r.selector.length > 0);

describe('the deadlines stylesheet keeps the rules the frame is made of', () => {
  const RULES = cssRules(DEADLINES_CSS);

  /* Rules are found by the class TOKEN, never by an exact selector line: which
     ancestors a rule names is the stylesheet author's business, and a guard
     that pinned `.dlcard {` would fail a correct `.dlweek .dlcard {`. What is
     frozen is the class name (PLAN.md), so that is what is matched. */
  const rulesFor = (cls: string) => RULES.filter((r) => new RegExp(`\\.${cls}(?![\\w-])`).test(r.selector));
  const bodyOf = (cls: string): string => {
    const found = rulesFor(cls);
    expect(found.length, `no rule anywhere for .${cls}`).toBeGreaterThan(0);
    return found.map((r) => r.body).join('\n');
  };

  it('parses the sheet at all — a flattener that saw nothing would pass every sweep below', () => {
    expect(RULES.length).toBeGreaterThan(15);
    expect(rulesFor('dlcard').length).toBeGreaterThan(0);
    expect(rulesFor('dlweek').length).toBeGreaterThan(0);
  });

  it('IS NOT VACUOUS — the sweeps below fire on a fixture wearing the same defects', () => {
    /* The three sweeps are only as good as this flattener and these matchers.
       Pointed at a sheet that DOES fade a second thing, DOES stroke the card's
       left edge and DOES add a second sideways scroller, each has to fire —
       and the comment stripper must not be what saves it. */
    const bad = cssRules(`
      /* a comment mentioning opacity and border-left and overflow-x */
      .dlcard { height: 180px; border-left: 4px solid red; }
      .dlweek { opacity: .5; }
      .dlcards { overflow-x: auto; }
    `);
    expect(bad.filter((r) => /(^|[^-])opacity\s*:/.test(r.body)).map((r) => r.selector)).toEqual(['.dlweek']);
    expect(bad.filter((r) => /\.dlcard(?![\w-])/.test(r.selector) && r.body.includes('border-left'))).toHaveLength(1);
    expect(bad.filter((r) => /overflow(-x)?\s*:\s*(auto|scroll)/.test(r.body))).toHaveLength(1);
    // …and `.dlcards` is NOT `.dlcard`: the token boundary is load-bearing
    expect(bad.filter((r) => /\.dlcard(?![\w-])/.test(r.selector)).map((r) => r.selector)).toEqual(['.dlcard']);
  });

  it('fixes the card’s HEIGHT — it does not grow with its badges', () => {
    /* Node: three hundred and eight by one hundred and eighty, FIXED. A
       `min-height` reads the same in the one fixture whose card happens to be
       short, and lets a four-badge card push the lane out of alignment. The
       rule is the fixed height, so that is what is asserted — and the growable
       spellings are asserted absent. */
    const body = bodyOf('dlcard');
    expect(body).toMatch(/(?<![\w-])height:\s*\d+px/);
    expect(body).not.toContain('min-height');
  });

  it('fixes the card’s WIDTH too, and fades the done card to exactly four tenths', () => {
    /* Review finding R5-5: the height guard alone let the width go fluid and
       the opacity drift to anything, both green. The node is three hundred
       and eight wide; #75 §3 says four tenths, not "faded". */
    expect(bodyOf('dlcard')).toMatch(/(?<![\w-])width:\s*308px/);
    const faded = RULES.filter((r) => /(^|[^-])opacity\s*:/.test(r.body));
    expect(faded[0]!.body).toMatch(/opacity\s*:\s*0?\.4(?![\d])/);
  });

  it('paints the quote bar amber-600, FOUR pixels from the card’s edge (owl #86; R2-1 / R5-1)', () => {
    /* THE COLOUR is owl #86's ruling (2026-09-08): the bar carries the same
       amber as the Urgent badge above it, so the two say urgency in one
       voice. It was red until then, which had the badge and the bar
       disagreeing about the same input — the absence assertion below is what
       stops the old hue coming back beside the new one.
       THE GEOMETRY is untouched by that ruling. The frame's export carries a
       two-pixel inset — the card's left edge is path x = 2 — so a view box
       that starts at minus two paints eight. The box starts at two, is eight
       wide (the inner curve reaches x = 10), and the band is the four pixels
       from the edge to the inner curve. */
    const quote = bodyOf('dlquote');
    expect(quote).toContain('fill: var(--amber-600)');
    expect(quote, 'the retired red is still painted somewhere on the bar').not.toContain('--red-500');
    expect(quote).toMatch(/(?<![\w-])width:\s*8px/);
    expect(TEMPLATE).toContain('class="dlquote" viewBox="2 1 8 180"');
  });

  it('gives the DONE card the only opacity AT REST on the tab — the two gesture states are the ruled exceptions', () => {
    /* #75 §3: a done card is the whole card at four tenths and nothing else.
       Swept rather than spot-checked — a second faded thing anywhere on this
       tab would make the done state stop meaning done. Since block 9 (owl
       #89) the live drag adds exactly two, both worn only mid-gesture and
       never at rest: `dragging` (lifted, .9) and `refused` (the pale wash
       that says "not a drop target"). Anything else faded is a defect. */
    const faded = RULES.filter((r) => /(^|[^-])opacity\s*:/.test(r.body));
    expect(faded.map((r) => r.selector).sort()).toEqual(['.dlcard.done', '.dlcard.dragging', '.dlcard.refused']);
    for (const r of faded) expect(r.selector).toContain('dlcard');
  });

  it('draws NO left border on the card — the bar is the SVG, not a stripe', () => {
    // the retired `::before` stripe is what this replaces; a border-left would
    // put the old grammar back beside the new one
    for (const rule of rulesFor('dlcard')) {
      expect(rule.body, `${rule.selector} strokes a left border`).not.toContain('border-left');
    }
    expect(DEADLINES_CSS).not.toContain('.dlcard::before');
  });

  it('has NO rule left for the withdrawn urgency variant — one urgency chip, not two (JP 2026-09-08)', () => {
    /* The dash was that variant's whole identity (#74 §3). With the variant
       withdrawn the recipe is dead CSS, and dead CSS is exactly what a later
       edit lands on by mistake. Read through the flattener, which strips
       comments first, so the dated note left in the sheet cannot mask this. */
    expect(rulesFor('b-nonurgent')).toHaveLength(0);
    // the one that survives is still declared, and still not dashed
    expect(bodyOf('b-urgent')).not.toContain('dashed');
  });

  it('draws the empty state as a dashed box inside a plain card', () => {
    expect(bodyOf('dlemptybox')).toContain('dashed');
    expect(rulesFor('dlempty').length).toBeGreaterThan(0);
  });

  it('scrolls the WEEK ROW sideways, and nothing else on the tab', () => {
    /* R-dl-a, carried forward: the page body must never scroll sideways. Stated
       as a sweep — exactly one horizontal scroller in this sheet, and it is the
       week row — because a second one is how the body starts scrolling. */
    const sideways = RULES.filter((r) => /overflow(-x)?\s*:\s*(auto|scroll)/.test(r.body));
    expect(sideways.map((r) => r.selector), 'a second horizontal scroller joined the tab').toHaveLength(1);
    expect(sideways[0]!.selector).toContain('dlscroll');
    expect(bodyOf('dlweeks')).toContain('display: flex');
  });

  it('gives the card lists their own vertical scroll, so a long week does not stretch the row', () => {
    expect(bodyOf('dlcards')).toMatch(/overflow-y\s*:\s*auto/);
  });
});

/* ====================================================================== *
 * F — the withdrawal (PLAN.md B9; #74 §2/§3)
 * ====================================================================== */

describe('the milestone tab is gone whole, not hidden', () => {
  /* Read from the COMMENT-FREE corpus on purpose (test/CLAUDE.md rule 3, in
     the kind direction): the rebuilt scripts and template explain what they
     retired and why, naming the retired things — that prose is the record, and
     a guard that tripped on it would force the record to be deleted. What must
     be absent is the CODE. */
  const GONE_JS = [
    'computeDeadlines', 'deadlinePayload', 'deadlineWeeks', 'deadlineConflicts', 'deadlineAlerts',
    'deadlineRuleTotals', 'dueThisMonth', 'urgentThisMonth', 'acknowledged', 'replot',
    'dlQ', 'dlDate', 'dlDeadline', 'ruleLabel', 'monthLabel', 'dayName', 'fmtLoad',
    'DL_RULES', 'dlRule', 'dlRuleWord', 'fmtWeekRange', 'fmtDayMonth', 'fmtDeadlineShort',
    'ackConflict', 'restoreConflict', 'writeDayPlan', 'dayCols',
    'dragMilestone', 'dayDragOver', 'dropOnDay', 'milestoneKey', 'clearDayPlan',
  ];

  /** The identifier test used below — a whole word, never a property access. */
  const declaresName = (name: string, src: string = APP_JS_CODE): boolean =>
    new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(src);

  it('IS NOT VACUOUS — the same test finds a name that IS there (negative control)', () => {
    /* A list of absences is only as good as the matcher underneath it: a regex
       that matched nothing would pass all thirty-two below while every retired
       thing was still shipping. */
    expect(declaresName('writeDeadline')).toBe(true);
    expect(declaresName('dlBuild')).toBe(true);
    expect(declaresName('nosuchthinginthisbundle')).toBe(false);
  });

  it('leaves no retired state, computed, helper or handler in the shipped client', () => {
    for (const name of GONE_JS) {
      expect(declaresName(name), `\`${name}\` outlived the tab it belonged to`).toBe(false);
    }
  });

  it('leaves no retired markup or class in the deadlines view', () => {
    const view = deadlinesView();
    for (const gone of [
      'dlstats', 'dltoolbar', 'dlalert', 'dldetail', 'dlack', 'dlsearch', 'dlwbadge', 'dlwsum',
      'capbar', 'daygrid', 'daycol', 'dllegend', 'dlformula', 'dlchip', 'metric', 'draggable',
    ]) {
      expect(view, `\`${gone}\` outlived the tab it belonged to`).not.toContain(gone);
    }
  });

  it('leaves no retired recipe in the deadlines stylesheet', () => {
    for (const gone of [
      '.dlstats', '.dltoolbar', '.dlalert', '.dldetail', '.dlack', '.dlsearch', '.dlwbadge',
      '.dlwsum', '.capbar', '.dlwload', '.daygrid', '.daycol', '.dhead', '.dcap', '.entry',
      '.dlcapt', '.dlmc', '.dlmilestone', '.dlphase', '.dlname', '.dlurg', '.dlstatus',
      '.dlwho', '.dlsub', '.dldl', '.dlnohits', '.dllegend', '.dlformula', '.dlweek.flagged',
    ]) {
      expect(DEADLINES_CSS.replace(/\/\*[\s\S]*?\*\//g, ' '), `${gone} outlived its markup`).not.toContain(gone);
    }
  });

  it('writes ONLY the bounded day move — never HTML5 drag, never an inline edit (#88/#89; block 9)', () => {
    /* INVERTED 2026-09-11. #74 §3's "the card writes nothing" held until owl
       #88 UN-RETIRED §6.5's day-drag here: the Deadlines card is now the ONE
       day control in Sirius — a pointer drag (and an arrow-key nudge) inside
       the card's own week lane, writing `starts_on` through the same
       sprint-item PATCH, refused by the server's four checks. What stays true
       is HOW it writes: pointer events, never the HTML5 drag API (it dies
       inside sticky, scrolling containers — build-spec §5.2), and never an
       inline edit. The gesture itself is test/deadlines-drag.test.ts's;
       hit-testability is test/drag-hittest.test.ts's. */
    const view = deadlinesView();
    for (const verb of ['on-drop', 'on-dragover', 'on-dragstart', 'on-dragend', 'draggable', 'contenteditable']) {
      expect(view).not.toContain(verb);
      expect(dlCardPartial()).not.toContain(verb);
    }
    // the ONE write path, on the card, by pointer and by key — and nothing on
    // the view itself (the lane header and the day header bind no write)
    expect(dlCardPartial()).toContain("on-pointerdown=\"['dlDragStart', c.rowId]\"");
    expect(dlCardPartial()).toContain("on-keydown=\"['dlKey', c.rowId]\"");
    expect(view).not.toMatch(/on-(pointerdown|mousedown|keydown)=/);
  });

  it('stops fetching the retired payload on every load', () => {
    // PLAN.md B1: the tab reads the rows it already has. The old route had no
    // caller from the rebuild onwards and is deleted outright on 2026-09-08
    // (owl #87), so there is nothing left to fetch even by accident.
    expect(fnBody('loadAll')).not.toContain('/deadlines');
  });

  it('names only the ONE chevron the sprite carries', () => {
    // the sprite gains nothing for this tab (PLAN.md, frozen icons): the same
    // glyph turns by class in both the navigator and the lane heading
    expect(ICONS_JS).toContain('rowChevron:');
    expect(ICONS_JS).toContain('trello:');
    expect(ICONS_JS).toContain('figma:');
    const view = deadlinesView();
    expect(view).toContain('icon.rowChevron');
    expect(view).not.toContain('icon.chevronDown');
  });
});

/* ====================================================================== *
 * G — per-project view state (drift row 35)
 * ====================================================================== */

describe('the month and the open lane are per-project view state', () => {
  it('reads the Manila day from STATE the reload refreshes, never from a clock inside the computed', () => {
    /* Review finding R1-1: `manilaToday()` inside a cached computed is a clock
       read Ractive cannot see — the month shown at 23:59 stayed at 00:01 until
       `monthOffset` moved. The day is state (`dlToday`), set with the rest of
       the payload in loadAll, so the label follows the clock across midnight
       and a project switch. */
    const m = APP_JS.match(/dlMondays\(\)\s*\{([\s\S]*?)\n\s{4}\},/);
    expect(m, 'the dlMondays computed is not where the state file keeps its computeds').not.toBeNull();
    expect(m![1]).toContain("this.get('dlToday')");
    expect(m![1]).not.toContain('manilaToday(');
    expect(fnBody('loadAll')).toContain('dlToday: manilaToday()');
  });

  it('resets both on a project switch', () => {
    /* The pre-existing gap: neither reset, so switching projects left the
       reader on another project's month with a lane open that names a week
       this project may have nothing in. The reset block is the same one every
       other per-project view state uses. */
    const body = fnBody('resetForProjectSwitch');
    expect(body).toContain('monthOffset: 0');
    expect(body).toContain('expandedWeek: null');
  });

  it('closes the open lane when the month moves', () => {
    // an open lane names a Monday the new month may not show at all
    const body = handlerBody('monthShift');
    expect(body).toContain('monthOffset');
    expect(body).toContain('expandedWeek');
  });

  it('opens and closes ONE lane through the same door', () => {
    // `toggleWeek` is the only writer of the open key, so two lanes cannot
    // both believe they are open
    expect(handlerBody('toggleWeek')).toContain('expandedWeek');
  });
});

/* ====================================================================== *
 * H — the template renders what the computeds are named
 * ====================================================================== */

describe('the view reads the computeds the state file declares', () => {
  it('binds the range, the lanes and the open key by their frozen names', () => {
    const view = deadlinesView();
    for (const key of ['dlRange', 'dlWeeks', 'expandedWeek', 'capacity.weekly']) {
      expect(view, `the view stopped reading \`${key}\``).toContain(key);
    }
  });

  it('renders the card through ONE partial, defined once', () => {
    /* Cards appear in two places — stacked in a collapsed lane and inside a day
       column — and they must be the same card. One partial is what makes that
       true by construction; two copies is how the day column silently loses
       the quote bar. */
    expect([...TEMPLATE.matchAll(/\{\{#partial dlCard\}\}/g)]).toHaveLength(1);
    expect([...TEMPLATE.matchAll(/\{\{>dlCard\}\}/g)]).toHaveLength(2);
  });

  it('really renders that partial — an unresolved call would fail SILENTLY', () => {
    // Ractive swallows `{{>name}}` when nothing is registered, so without this
    // every card assertion above could be reading an empty string
    const html = renderDeadlines({ dlWeeks: [week({ cards: [card()] })] });
    expect(html).toContain('class="dlbadges"');
    expect(html).toContain('class="dltitle"');
  });
});
