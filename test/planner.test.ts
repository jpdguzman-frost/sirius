/**
 * T022 — lib/planner.ts (BR-5, BR-6b, BR-7, BR-7a, BR-8; AC-16 logic):
 * golden parity vs the verbatim oracle + rule-level expectations.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error verbatim minified extract, untyped by design
import * as O from './golden/original.mjs';
import { buildWeeks } from '../lib/calendar.ts';
import {
  HARD_MIX,
  WEIGHTS,
  reflowSprints,
  sprintFor,
  sprintIssues,
  suggestPlan,
  weekLoad,
  type PlannerCard,
  type SprintSpan,
} from '../lib/planner.ts';

const WEEKS = buildWeeks('2026-08-03', 6);

function card(i: number, over: Partial<PlannerCard> = {}): PlannerCard {
  const difficulties = ['Easy', 'Medium', 'Hard'];
  return {
    id: `c${i}`,
    difficulty: difficulties[i % 3],
    currentList: 'Design',
    labels: [],
    startDate: '2026-08-03',
    urgency: i % 4 === 0 ? 'Urgent' : 'Non-Urgent',
    deadline: i % 5 === 0 ? '2026-09-11' : i % 2 === 0 ? '2026-08-28' : null,
    pinned: false,
    week: 'Unscheduled',
    blocker: i % 7 === 0 ? 'On hold' : null,
    ...over,
  };
}

const BACKLOG: PlannerCard[] = Array.from({ length: 40 }, (_, i) => card(i));
const MOSTLY_HARD: PlannerCard[] = Array.from({ length: 20 }, (_, i) =>
  card(i, { difficulty: i < 15 ? 'Hard' : 'Easy' }),
);

describe('golden parity with the validated bundle', () => {
  it('weekLoad() matches the oracle', () => {
    for (const cards of [BACKLOG, MOSTLY_HARD, [], BACKLOG.slice(0, 7)]) {
      expect(weekLoad(cards)).toEqual(O.jh(cards));
    }
    expect(WEIGHTS).toEqual(O.zu);
    expect(HARD_MIX).toEqual(O.Ke);
  });

  it('suggestPlan() matches the oracle — plan, notes, quotas, strain', () => {
    for (const [cards, capacity] of [
      [BACKLOG, 120],
      [BACKLOG, 6],
      [MOSTLY_HARD, 120],
      [MOSTLY_HARD, 4],
    ] as Array<[PlannerCard[], number]>) {
      const ours = suggestPlan(cards, WEEKS, { capacity });
      const theirs = O.Eg(cards, WEEKS, { capacity });
      expect(ours.plan).toEqual(theirs.plan);
      expect(ours.notes).toEqual(theirs.notes);
      expect(ours.used).toEqual(theirs.used);
      expect(ours.hardQuota).toBe(theirs.hardQuota);
      expect(ours.strain).toEqual(theirs.strain);
      expect(ours.backlogHardShare).toBe(theirs.backlogHardShare);
      expect(ours.unavoidable).toBe(theirs.unavoidable);
    }
  });

  it('sprint helpers match the oracle', () => {
    const sprints: SprintSpan[] = [
      { id: 'a', name: 'S1', start: '2026-08-03', end: '2026-08-14' },
      { id: 'b', name: 'S2', start: '2026-08-24', end: '2026-09-04' },
      { id: 'c', name: 'S3', start: '2026-09-02', end: '2026-08-28' },
    ];
    expect(sprintIssues(sprints)).toEqual(O.Jh(sprints));
    expect(reflowSprints(sprints)).toEqual(O.eg(sprints));
    expect(sprintFor('2026-08-10', sprints)).toEqual(O.Yh('2026-08-10', sprints));
    expect(sprintFor('2026-08-19', sprints)).toBeNull(); // gap → Outside any sprint (BR-5)
  });
});

describe('business rules', () => {
  it('BR-7: pinned rows are never moved by a suggestion (AC-16 logic)', () => {
    const pinned = card(99, { pinned: true, week: WEEKS[2]!.key, difficulty: 'Medium' });
    const result = suggestPlan([pinned, ...BACKLOG.slice(0, 10)], WEEKS, { capacity: 6 });
    expect(result.plan[pinned.id]).toBeUndefined();
    expect(result.used[WEEKS[2]!.key]!.Medium).toBeGreaterThanOrEqual(1); // its load still counts
  });

  it('BR-7: blocked cards are not scheduled into the current week', () => {
    const blocked = card(3, { blocker: 'For clarification', difficulty: 'Medium' });
    const result = suggestPlan([blocked], WEEKS, { capacity: 120 });
    expect(result.plan[blocked.id]).not.toBe(WEEKS[0]!.key);
    expect(result.notes[blocked.id]).toMatch(/deferred — For clarification/);
  });

  it('BR-7a: an unachievable hard mix is spread and reported, never refused', () => {
    const result = suggestPlan(MOSTLY_HARD, WEEKS, { capacity: 120 });
    expect(result.unavoidable).toBe(true);
    expect(result.backlogHardShare).toBeGreaterThan(HARD_MIX.ceiling);
    for (const c of MOSTLY_HARD) expect(result.plan[c.id]).toBeDefined(); // everything placed
  });

  it('BR-6b: weekLoad flags amber over the ideal and red over the ceiling', () => {
    const tenPctHard = [...Array.from({ length: 9 }, (_, i) => card(i, { difficulty: 'Easy' })), card(9, { difficulty: 'Hard' })];
    expect(weekLoad(tenPctHard).warn).toBe(true);
    expect(weekLoad(tenPctHard).over).toBe(false);
    const twentyPctHard = [...Array.from({ length: 8 }, (_, i) => card(i, { difficulty: 'Easy' })), card(8, { difficulty: 'Hard' }), card(9, { difficulty: 'Hard' })];
    expect(weekLoad(twentyPctHard).over).toBe(true);
  });

  it('BR-5: reflow preserves each sprint length and re-flows from the earliest start', () => {
    const sprints: SprintSpan[] = [
      { id: 'a', name: 'S1', start: '2026-08-03', end: '2026-08-14' },
      { id: 'b', name: 'S2', start: '2026-08-17', end: '2026-08-28' },
    ];
    const swapped = reflowSprints([sprints[1]!, sprints[0]!], '2026-08-03');
    expect(swapped.map((s) => s.id)).toEqual(['b', 'a']); // order preserved
    // lengths preserved per sprint (TZ-neutral — output strings use the
    // shipped toISOString transform, which shifts a day east of UTC)
    const spanDays = (s: SprintSpan) =>
      Math.round((Date.parse(s.end) - Date.parse(s.start)) / 864e5) + 1;
    expect(spanDays(swapped[0]!)).toBe(12);
    expect(spanDays(swapped[1]!)).toBe(12);
    // the second re-flows after the first ends
    expect(swapped[1]!.start > swapped[0]!.end).toBe(true);
  });
});
