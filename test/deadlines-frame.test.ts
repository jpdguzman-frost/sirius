/**
 * owl miles→jp #64 — the redesigned Deadlines tab (node `630:51389`, five
 * categorized annotations, verified against the owl before building).
 *
 * Law: `specs/001-sirius-v1/deadlines-frame-notes.md` (R-dl-a … R-dl-n).
 *
 * The recipes below are SLICED OUT OF THE SHIPPED SOURCE AND EXECUTED wherever
 * executing them proves anything — a source-text assertion can show a formatter
 * exists without showing it formats. Structure that only exists as markup (the
 * absence of a table, which affordances are on the page) is asserted against
 * the composed template, which is the same file the browser gets.
 *
 * What this file cannot prove: that the horizontal scroller actually scrolls,
 * that the round week button reads as pressable, or that a dragged entry lands.
 * `toHTML()` has no layout, no pointer and no clock — those belong to the live
 * pass. `test/drag-hittest.test.ts` owns the day entry's hit-testability.
 */

import { describe, expect, it } from 'vitest';
import { detectConflicts } from '../src/services/conflicts.ts';
import { APP_JS, APP_JS_CODE, DEADLINES_CSS, TEMPLATE, cssRule, decl, fnBody, method } from './helpers/gantt-render.ts';

interface Rule { rule: string; word: string; chip: string; label: string; text: string }
interface Week { key: string; label: string; items: Array<{ displayId: string; name: string }>; due: number; urgent: number; load: number }

const recipe = new Function(`
  ${decl(APP_JS, 'isoOf')}
  function mondayIso(base) { ${fnBody('mondayIso')} }
  function fridayIso(base) { ${fnBody('fridayIso')} }
  ${decl(APP_JS, 'MONTHS_SHORT')}
  function fmtLongIso(iso) { ${fnBody('fmtLongIso')} }
  function fmtWeekRange(mondayIso) { ${fnBody('fmtWeekRange')} }
  function fmtDayMonth(iso) { ${fnBody('fmtDayMonth')} }
  function fmtDeadlineShort(iso, refIso) { ${fnBody('fmtDeadlineShort')} }
  ${decl(APP_JS, 'DL_RULES')}
  ${decl(APP_JS, 'dlRule')}
  ${decl(APP_JS, 'dlRuleWord')}
  return { fmtWeekRange, fmtDayMonth, fmtDeadlineShort, DL_RULES, dlRule, dlRuleWord };
`)() as {
  fmtWeekRange: (monday: string) => string;
  fmtDayMonth: (iso: string) => string;
  fmtDeadlineShort: (iso: string, ref: string | null) => string;
  DL_RULES: Rule[];
  dlRule: (rule: string) => Rule;
  dlRuleWord: (rule: string) => string;
};

/* `dlWeeks` reads only `dlQ` and `deadlineWeeks`, so a two-key stand-in for
   Ractive's `this` runs the shipped body unchanged. */
const dlWeeks = (q: string, weeks: Week[]): Week[] => {
  const host = new Function(`return { get(k) { return this.state[k]; }, state: null, ${method('dlWeeks').trim()} };`)() as {
    state: Record<string, unknown>;
    dlWeeks(): Week[];
  };
  host.state = { dlQ: q, deadlineWeeks: weeks };
  return host.dlWeeks();
};

const week = (over: Partial<Week> = {}): Week => ({
  key: '2026-08-03', label: 'Week 1', due: 2, urgent: 2, load: 8,
  items: [
    { displayId: 'MC-05', name: 'Investor Relations – Declaration' },
    { displayId: 'MC-06', name: 'GPO Plus – Verification State Icons' },
  ],
  ...over,
});

/* ---------------------------------------------------------------------- */
/* A — R-dl-a: this tab is NOT a table                                      */
/* ---------------------------------------------------------------------- */

const deadlinesView = (): string => {
  const at = TEMPLATE.indexOf("{{#if activeTab === 'deadlines'}}");
  expect(at).toBeGreaterThan(-1);
  const end = TEMPLATE.indexOf("{{#if activeTab === 'forecast'}}", at);
  return TEMPLATE.slice(at, end > at ? end : undefined);
};

describe('the tab is a search over week groups, not a column table', () => {
  it('inherits NONE of the Requests/Pipeline table recipes', () => {
    /* the Figma component is still called 'Request Tab Table' — the name is a
       leftover, and following it would have produced the wrong tab entirely */
    const view = deadlinesView();
    expect(view).not.toContain('ptable');
    expect(view).not.toContain('<table');
    expect(view).not.toContain('col-');
  });

  it('scrolls the WEEK ROW sideways, never the page body', () => {
    expect(cssRule('.dlscroll', DEADLINES_CSS)).toContain('overflow-x: auto');
    expect(cssRule('.dlweeks', DEADLINES_CSS)).toContain('display: flex');
    // the columns must not shrink to fit, or "scrolls sideways" becomes
    // "squeezes five weeks into the viewport and scrolls nothing"
    expect(cssRule('.dlweek', DEADLINES_CSS)).toMatch(/flex: 0 0 \d+px/);
  });
});

/* ---------------------------------------------------------------------- */
/* B — R-dl-b + R-dl-c: the dates                                           */
/* ---------------------------------------------------------------------- */

describe('the card carries two dates that mean different things', () => {
  it('formats the forecast milestone day-first and year-less', () => {
    expect(recipe.fmtDayMonth('2026-08-06')).toBe('6 Aug');
    expect(recipe.fmtDayMonth('2026-09-01')).toBe('1 Sep');
    expect(recipe.fmtDayMonth('')).toBe('');
  });

  it('shows the deadline’s year ONLY when it leaves the milestone’s year', () => {
    /* the frame drops the year, which reads fine while both dates sit in one
       year and misleads the moment they do not — and these two dates being
       comparable IS the past-deadline rule */
    expect(recipe.fmtDeadlineShort('2026-08-28', '2026-08-06')).toBe('28 Aug');
    expect(recipe.fmtDeadlineShort('2027-01-04', '2026-12-28')).toBe('4 Jan 2027');
  });

  it('places them separately and labels them separately in the markup', () => {
    /* never collapsed into one date: different elements, different titles */
    const view = deadlinesView();
    expect(view).toContain('{{dlDate(m.plannedDay || m.date)}}');
    expect(view).toContain('deadline {{dlDeadline(m.deadline, m.date)}}');
    expect(view).toContain('title="Forecast milestone');
    expect(view).toContain("title=\"The client's stated deadline");
  });

  it('writes the week range day-first, and names both months or both years when it straddles', () => {
    expect(recipe.fmtWeekRange('2026-08-03')).toBe('3-7 Aug 2026');
    expect(recipe.fmtWeekRange('2026-08-31')).toBe('31 Aug-4 Sep 2026');
    expect(recipe.fmtWeekRange('2026-12-28')).toBe('28 Dec 2026-1 Jan 2027');
  });

  it('derives the range with no Date, so no timezone can shift the day', () => {
    // pure string math on the fixed month table — the same premise fmtLongIso
    // rests on, and the reason 'Sept' can never appear
    expect(fnBody('fmtWeekRange')).not.toContain('toLocaleDateString');
    expect(fnBody('fmtLongIso')).not.toContain('toLocaleDateString');
    expect(fnBody('fmtDayMonth')).not.toContain('new Date');
  });
});

/* ---------------------------------------------------------------------- */
/* C — R-dl-d: the legend cannot drift from the engine                      */
/* ---------------------------------------------------------------------- */

describe('the Model Constants legend and the engine state the same three rules', () => {
  it('names EXACTLY the rules detectConflicts can raise', () => {
    /* one urgent-overlap week and one over-capacity week, so the engine emits
       two of the three from real detection rather than from a list */
    const ms = (over: Record<string, unknown>) => ({
      cardId: 'c1', displayId: 'MC-05', name: 'A', phase: 'sketch' as const,
      date: '2026-08-06', week: '2026-08-03', urgent: true, deadline: null, late: false, ...over,
    });
    const found = detectConflicts(
      [ms({ cardId: 'a' }), ms({ cardId: 'b' }), ms({ cardId: 'c', urgent: false, late: true, deadline: '2026-08-01' })],
      1,
    );
    for (const c of found) expect(recipe.DL_RULES.map((r) => r.rule)).toContain(c.rule);
    expect(recipe.DL_RULES.map((r) => r.rule)).toEqual(['urgent-overlap', 'over-capacity', 'past-deadline']);
  });

  it('quotes the frame’s wording verbatim', () => {
    const byRule = Object.fromEntries(recipe.DL_RULES.map((r) => [r.rule, r]));
    expect(byRule['urgent-overlap']!.label).toBe('URGENT OVERLAP');
    expect(byRule['urgent-overlap']!.text).toBe('Two or more urgent milestones in one week.');
    expect(byRule['past-deadline']!.text).toBe("the forecast date falls after the client's stated deadline.");
    expect(byRule['over-capacity']!.text).toContain('taken from the project’s typical week in ARES'.replace('’', "'"));
  });

  it('renders the legend FROM the rule table, so the two cannot be edited apart', () => {
    const view = deadlinesView();
    expect(view).toContain('{{#each DL_RULES as r}}');
    expect(view).toContain('{{r.label}}');
    expect(view).toContain('{{r.text}}');
  });

  it('gives each rule the badge word the summary and the week header both use', () => {
    expect(recipe.dlRuleWord('urgent-overlap')).toBe('overlap');
    expect(recipe.dlRuleWord('past-deadline')).toBe('past deadline');
    // an unknown rule falls back to its own key rather than to a blank badge
    expect(recipe.dlRuleWord('replot')).toBe('replot');
    /* the acknowledged strip reads `chip` out of this SAME table. It used to be
       a ternary chain whose else-branch labelled every unknown rule 'Over
       capacity', so a fourth rule would have shipped mislabelled on the one
       screen whose wording has to match the engine. */
    expect(recipe.dlRule('urgent-overlap').chip).toBe('⚡ Urgent overlap');
    expect(recipe.dlRule('nonesuch').chip).toBe('nonesuch');
  });
});

/* ---------------------------------------------------------------------- */
/* D — R-dl-e/f: what the badges and the Breakdown count                    */
/* ---------------------------------------------------------------------- */

describe('the counts say what they count', () => {
  it('names the rule AND the cards on the week badge, never a bare count', () => {
    const view = deadlinesView();
    expect(view).toContain('{{b.count}} {{b.word}} • {{b.cards.join(\', \')}}');
  });

  it('counts CONFLICTS, not weeks in conflict', () => {
    /* the frame's own arithmetic settles it: '2 conflicts' covers two weeks
       holding one each, broken out as one badge per rule */
    const view = deadlinesView();
    expect(view).toContain('{{deadlineConflicts.length}} conflict');
    expect(view).toContain('{{#each deadlineRuleTotals as t}}');
  });

  it('reports NEEDS REPLOTTING from the same list the detail rows enumerate', () => {
    /* the number above the rows and the rows themselves cannot disagree if
       they read one source — which is the point of stating the definition */
    const view = deadlinesView();
    expect(view).toContain('{{replot.length}}');
    expect(APP_JS_CODE).toContain('replotMcs');
  });
});

/* ---------------------------------------------------------------------- */
/* E — R-dl-g/h: search                                                     */
/* ---------------------------------------------------------------------- */

describe('search drops an emptied week but never rewrites a week’s own numbers', () => {
  it('matches on MC number and on deliverable name', () => {
    expect(dlWeeks('mc-05', [week()]).map((w) => w.items.map((i) => i.displayId))).toEqual([['MC-05']]);
    expect(dlWeeks('verification', [week()]).map((w) => w.items.map((i) => i.displayId))).toEqual([['MC-06']]);
  });

  it('DROPS a week the search empties, rather than leaving it standing empty', () => {
    expect(dlWeeks('nothing-matches-this', [week()])).toEqual([]);
  });

  it('keeps a week with NOTHING DUE — a different state, and the frame draws it a card', () => {
    /* an empty week is not a searched-away week: with no query it keeps its
       place, and the view says so in words */
    const empty = week({ items: [], due: 0, urgent: 0, load: 0 });
    expect(dlWeeks('', [empty])).toHaveLength(1);
    expect(deadlinesView()).toContain('Nothing due this week');
  });

  it('does NOT recompute due / urgent / load against the search', () => {
    /* the summary describes the WEEK; a capacity line that moved when you
       typed would be reporting the search instead of the load */
    const [only] = dlWeeks('mc-05', [week()]);
    expect(only!.items).toHaveLength(1);
    expect([only!.due, only!.urgent, only!.load]).toEqual([2, 2, 8]);
  });

  it('is search-ONLY — the filter and sort buttons Pipeline gained stay off this tab', () => {
    const view = deadlinesView();
    expect(view).toContain('deadlines-search');
    expect(view).not.toContain('openPipeFilter');
    expect(view).not.toContain('openPipeSort');
    expect(view).not.toContain('sfbtn');
  });
});

/* ---------------------------------------------------------------------- */
/* F — R-dl-i/j/k/l: what the frame omits and the build keeps               */
/* ---------------------------------------------------------------------- */

describe('shipped capabilities the frame does not draw are kept, not deleted', () => {
  it('keeps the ONLY acknowledge route in the UI, with its situation-key wording intact', () => {
    /* invariant 13: the key is week + rule + capacity + card:phase pairs, so
       any change to the cards or the capacity brings the week back. The title
       is the only place that is explained to a planner. */
    const view = deadlinesView();
    expect(view).toContain("['ackConflict', a.key]");
    expect(view).toContain("['restoreConflict', a.key]");
    expect(view).toContain("any change to the cards involved, or to the project's weekly capacity, brings it back");
  });

  it('keeps the day planner — FR-12, and the write path behind it', () => {
    const view = deadlinesView();
    expect(view).toContain("['toggleWeek', w.key]");
    expect(view).toContain("['dropOnDay', d.day, d.holiday]");
    expect(view).toContain("['milestoneKey', m.cardId, m.phase, d.day, w.key]");
    expect(view).toContain("['clearDayPlan', m.cardId, m.phase]");
  });

  it('keeps the month control the frame never showed', () => {
    /* the Breakdown says DUE THIS MONTH, so a month scope exists and needs
       steering — deleting the steering would strand the tab */
    const view = deadlinesView();
    expect(view).toContain("['monthShift', -1]");
    expect(view).toContain('{{monthLabel}}');
  });

  it('builds the banners AS DRAWN, with the deferral written down where it happened', () => {
    /* the conversion to Pipeline's row-warning pattern is deferred; without
       this note the old pattern here reads as drift by the next reader */
    expect(cssRule('.dlalert', DEADLINES_CSS)).toContain('background: var(--status-destructive-light)');
    expect(DEADLINES_CSS).toContain('deferred');
  });

  it('accents the card by URGENCY, so the accent cannot be read as a conflict', () => {
    /* every card carries one — red urgent, blue not. The week badge and the
       banner are where a conflict is stated; a third quieter voice saying it
       would only weaken them. */
    expect(cssRule('.dlcard::before', DEADLINES_CSS)).toContain('background: var(--blue-500)');
    expect(cssRule('.dlcard.urgent::before', DEADLINES_CSS)).toContain('background: var(--red-500)');
  });

  it('tints the WEEK only when it is over capacity, unchanged from v1', () => {
    expect(cssRule('.dlweek.flagged', DEADLINES_CSS)).toContain('var(--status-warning-light)');
  });
});
