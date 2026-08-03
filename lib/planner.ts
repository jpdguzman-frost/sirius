/**
 * lib/planner.ts — suggestPlan, weekLoad, WEIGHTS, HARD_MIX and the sprint
 * helpers, ported VERBATIM from the validated prototype bundle (invariant 5;
 * BR-5, BR-6b, BR-7, BR-7a, BR-8). Golden parity vs test/golden/original.mjs.
 */

import { parseDate, toMonday, type Week } from './calendar.ts';
import { forecast, type ForecastCard } from './forecast.ts';
import { HARD_MIX as _HM } from './planner.constants.ts';

export { WEIGHTS, HARD_MIX, CAPACITY_SOURCE, weightOf } from './planner.constants.ts';
import { WEIGHTS, weightOf } from './planner.constants.ts';

export interface PlannerCard extends ForecastCard {
  id: string;
  difficulty?: string;
  deadline?: string | null;
  urgency?: string;
  pinned?: boolean;
  week?: string;
  blocker?: string | null;
}

export interface WeekLoad {
  points: number;
  hard: number;
  count: number;
  share: number;
  hardPointShare: number;
  over: boolean;
  warn: boolean;
}

/** Weighted load + hard-mix flags for one week's cards (source: jh; BR-6b, FR-5.13). */
export function weekLoad(cards: Array<{ difficulty?: string }>): WeekLoad {
  const t = cards.reduce((r, s) => r + weightOf(s), 0);
  const a = cards.filter((r) => r.difficulty === 'Hard').length;
  const l = cards.length ? a / cards.length : 0;
  const o = cards.filter((r) => r.difficulty === 'Hard').reduce((r, s) => r + weightOf(s), 0);
  return {
    points: t,
    hard: a,
    count: cards.length,
    share: l,
    hardPointShare: t ? o / t : 0,
    over: l > _HM.ceiling,
    warn: l > _HM.ideal && l <= _HM.ceiling,
  };
}

// ============ sprints (BR-5: data, not a cadence) ============

export interface SprintSpan {
  id: string;
  name: string;
  start: string;
  end: string;
}

/** Source: qu. */
export const sortSprints = (a: SprintSpan, b: SprintSpan): number =>
  a.start < b.start ? -1 : a.start > b.start ? 1 : 0;

/** Sprint containing a slotted week, else null → *Outside any sprint* (source: Yh). */
export function sprintFor(week: string | null | undefined, sprints: SprintSpan[]): SprintSpan | null {
  return !week || week === 'Unscheduled'
    ? null
    : sprints.find((a) => week >= a.start && week <= a.end) || null;
}

/** Source: Wu. */
export const sprintLengthDays = (s: SprintSpan): number =>
  Math.round((parseDate(s.end).getTime() - parseDate(s.start).getTime()) / 864e5) + 1;

export interface SprintIssue {
  id: string;
  kind: 'inverted' | 'overlap' | 'gap';
  text: string;
}

/** Inverted/overlap/gap detection (source: Jh; FR-5.15 — overlaps reject on save). */
export function sprintIssues(sprints: SprintSpan[]): SprintIssue[] {
  const t = [...sprints].sort(sortSprints);
  const a: SprintIssue[] = [];
  t.forEach((l, o) => {
    if (l.end < l.start) {
      a.push({ id: l.id, kind: 'inverted', text: `${l.name} ends before it starts` });
    }
    const r = t[o + 1];
    if (r) {
      if (r.start <= l.end) {
        a.push({ id: r.id, kind: 'overlap', text: `${r.name} overlaps ${l.name}` });
      } else {
        const s = Math.round((parseDate(r.start).getTime() - parseDate(l.end).getTime()) / 864e5) - 1;
        if (s > 2) {
          a.push({ id: r.id, kind: 'gap', text: `${s} days uncovered between ${l.name} and ${r.name}` });
        }
      }
    }
  });
  return a;
}

/**
 * Re-flow sprints after reordering: lengths preserved, calendar re-flows from
 * the set's earliest start, each next start on a Monday (source: eg; BR-5).
 */
export function reflowSprints(sprints: SprintSpan[], anchorStart?: string): SprintSpan[] {
  const a = [...sprints];
  if (!a.length) return a;
  const l = anchorStart || sprints.map((r) => r.start).sort()[0]!;
  let o = parseDate(l);
  return a.map((r) => {
    const s = sprintLengthDays(r);
    const u = new Date(o);
    const d = new Date(o);
    d.setDate(d.getDate() + s - 1);
    o = new Date(d);
    o.setDate(o.getDate() + 3);
    while (o.getDay() !== 1) o.setDate(o.getDate() + 1);
    return { ...r, start: u.toISOString().slice(0, 10), end: d.toISOString().slice(0, 10) };
  });
}

// ============ suggest plan (BR-7, BR-7a) ============

export interface SuggestOptions {
  capacity?: number;
  refWeeks?: unknown;
}

export interface SuggestResult {
  plan: Record<string, string>;
  notes: Record<string, string>;
  used: Record<string, { Easy: number; Medium: number; Hard: number; pts: number }>;
  cardCap: number;
  hardQuota: number;
  strain: string[];
  backlogHardShare: number;
  unavoidable: boolean;
}

/**
 * Propose slots from empirical throughput, ordered urgency → deadline →
 * difficulty; pinned rows immovable; blocked cards never into the current
 * week; unachievable hard mixes spread evenly and reported, never refused
 * (source: Eg — verbatim, including placement heuristics and note strings).
 */
export function suggestPlan(
  cards: PlannerCard[],
  weeks: Week[],
  { capacity = 120 }: SuggestOptions = {},
): SuggestResult {
  const o = Math.max(1, Math.round(capacity));
  const r = cards.filter((C) => C.pinned && C.week !== 'Unscheduled');
  const s = cards.filter((C) => !C.pinned);
  const u: SuggestResult['used'] = {};
  weeks.forEach((C) => {
    u[C.key] = { Easy: 0, Medium: 0, Hard: 0, pts: 0 };
  });
  const d = (C: string, A: string) => {
    (u[C]![A as 'Easy' | 'Medium' | 'Hard'] as number) += 1;
    u[C]!.pts += WEIGHTS[A] ?? 2;
  };
  r.forEach((C) => {
    if (u[C.week!]) d(C.week!, C.difficulty || 'Medium');
  });
  const c = (C: PlannerCard): [number, number] => {
    const A = C.deadline ? parseDate(C.deadline).getTime() : 1 / 0;
    return [C.urgency === 'Urgent' ? 0 : 1, A];
  };
  const h = (C: PlannerCard, A: PlannerCard) => {
    const D = c(C);
    const U = c(A);
    return D[0] - U[0] || D[1] - U[1];
  };
  const g = s.filter((C) => C.difficulty === 'Hard').sort(h);
  const p = s.filter((C) => C.difficulty !== 'Hard').sort(h);
  const y = Math.max(1, Math.min(o, Math.ceil(s.length / Math.max(1, weeks.length))));
  const v = s.length ? s.filter((C) => C.difficulty === 'Hard').length / s.length : 0;
  const L = v > _HM.ceiling;
  const T = L
    ? Math.max(1, Math.ceil(g.length / Math.max(1, weeks.length)))
    : Math.max(1, Math.round(y * _HM.ceiling));
  const m: Record<string, string> = {};
  const i: Record<string, string> = {};
  const f = (C: string) => u[C]!.Easy + u[C]!.Medium + u[C]!.Hard;
  const x = o;
  g.forEach((C) => {
    const A = weeks
      .filter((D) => u[D.key]!.Hard < T)
      .filter((D) => f(D.key) < o)
      .filter((D) => f(D.key) < Math.max(1, y * 2))
      .filter((D) => !(C.blocker && D === weeks[0]))
      .sort((D, U) => u[D.key]!.Hard - u[U.key]!.Hard || f(D.key) - f(U.key))[0];
    if (!A) {
      const D = [...weeks].filter((U) => f(U.key) < o).sort((U, B) => f(U.key) - f(B.key))[0];
      if (!D) {
        i[C.id] = 'no week has capacity in the visible horizon';
        return;
      }
      d(D.key, 'Hard');
      m[C.id] = D.key;
      i[C.id] = 'placed beyond the hard-item ceiling';
      return;
    }
    d(A.key, 'Hard');
    m[C.id] = A.key;
    if (C.blocker) i[C.id] = `deferred — ${C.blocker}`;
  });
  p.forEach((C) => {
    const A = C.difficulty || 'Medium';
    let D: string | null = null;
    for (const U of [0, 1]) {
      if (D) break;
      for (const B of weeks) {
        const G = u[B.key]!;
        const Ce = G.Easy + G.Medium + G.Hard;
        if ((U === 0 && Ce >= y) || Ce >= x || (C.blocker && B === weeks[0])) continue;
        const E = { ...C, startDate: B.key, week: B.key };
        const le = forecast(E);
        const Ie = C.deadline && parseDate(C.deadline) < le.renderDelivery;
        if (!(Ie && B !== weeks[weeks.length - 1])) {
          D = B.key;
          if (Ie) i[C.id] = 'cannot meet deadline from any week in view';
          break;
        }
      }
    }
    if (!D) {
      i[C.id] = i[C.id] || 'no capacity in the visible horizon';
      return;
    }
    d(D, A);
    m[C.id] = D;
    if (C.blocker && !i[C.id]) i[C.id] = `deferred — ${C.blocker}`;
  });
  const k = weeks
    .filter((C) => {
      const A = u[C.key]!;
      const D = A.Easy + A.Medium + A.Hard;
      return D > 0 && A.Hard / D > _HM.ceiling;
    })
    .map((C) => C.key);
  return {
    plan: m,
    notes: i,
    used: u,
    cardCap: o,
    hardQuota: T,
    strain: k,
    backlogHardShare: v,
    unavoidable: L,
  };
}

export { toMonday };
