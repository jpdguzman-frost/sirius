/**
 * BR-6 conflict detection (T058 backend) — per week on Deadlines:
 *   urgent overlap  ≥2 urgent milestones in one week   → the urgent items
 *   over capacity   cards due exceed the week's cap    → non-urgent, displaced
 *   past deadline   forecast date after client deadline → the breaching items
 *
 * conflict_key = week | rule | capacity | sorted card:phase pairs
 * (invariant 13, v4.3.0 — JP ruling A, 2026-08-17). Any change to the cards
 * involved OR to the project's weekly capacity produces a different key, so
 * the acknowledgement lapses automatically and the week re-surfaces. The
 * capacity component is uniform across all three rules: it is the planning
 * frame the whole week was acknowledged under, not an over-capacity detail.
 */

export interface Milestone {
  cardId: string;
  displayId: string;
  name: string;
  phase: 'sketch' | 'render';
  date: string; // YYYY-MM-DD (local calendar day)
  week: string; // Monday key of the week it lands in
  urgent: boolean;
  deadline: string | null;
  late: boolean; // forecast past deadline — card-level, NEVER suppressed (BR-9a)
  weight?: number; // BR-6c card-equivalents; absent = 1
  plannedDay?: string | null; // FR-12: valid day placement, else null = follow the forecast
  trelloUrl?: string | null;
  figmaUrl?: string | null;
  /* ---- the redesigned Deadlines card's badge row and subtitle (owl #64).
     Carried on the milestone rather than re-fetched per card: the row they
     come from is already loaded, and a second read could disagree with the
     first about what the card says. */
  difficulty?: string | null;
  currentList?: string | null;
  requestor?: string | null;
  /** Work cards attached to this milestone's MC GROUP (invariant 4), not to
      the deliverable — there is no task -> deliverable edge to count along. */
  cards?: number;
}

/** BR-6c/§5.4 display rule: fractions to one decimal, whole numbers plain. */
export const fmtLoad = (n: number): string => {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

export interface Conflict {
  key: string;
  week: string;
  rule: 'urgent-overlap' | 'over-capacity' | 'past-deadline';
  explanation: string;
  /* `urgent` rides along because the alert row draws an urgency badge for each
     item. It comes off the milestone the engine already holds while building
     these — the client used to re-join conflicts back to milestones to recover
     it, which is both a second definition of "which milestone this is" and a
     linear scan per item. */
  items: Array<{ cardId: string; displayId: string; name: string; phase: string; urgent: boolean }>;
}

const pairKey = (items: Array<{ cardId: string; phase: string }>) =>
  items.map((i) => `${i.cardId}:${i.phase}`).sort().join(',');

/**
 * The capacity token — String(n), deliberately NOT rounded or normalised.
 * PATCH /capacity enforces an integer, but seed scripts type the field freely;
 * rounding here would make the key disagree with the number the over-capacity
 * explanation below already prints.
 */
const CAP = (weeklyCapacity: number): string => String(weeklyCapacity);

/**
 * The ONE place the pipe layout is written, anywhere in the repo. Nothing
 * outside this module composes, splits or rebuilds a conflict key — the
 * routes and the client both treat it as an opaque string.
 */
const compose = (week: string, rule: string, weeklyCapacity: number, pairs: string): string =>
  `${week}|${rule}|${CAP(weeklyCapacity)}|${pairs}`;

/** The acknowledgement situation key (invariant 13). */
export const conflictKey = (
  week: string,
  rule: Conflict['rule'],
  weeklyCapacity: number,
  items: Array<{ cardId: string; phase: string }>,
): string => compose(week, rule, weeklyCapacity, pairKey(items));

/**
 * Pre-007 keys have 3 components, amended keys 4. Card ids and phases never
 * contain '|', and an empty pair list is legal (`week|over-capacity|50|`),
 * so the component count discriminates cleanly in both directions.
 */
export const KEY_PARTS = 4;
export const isLegacyConflictKey = (key: string): boolean => key.split('|').length === KEY_PARTS - 1;

/** Migration 007's one lift — the same recipe, applied to an existing key. */
export const upgradeConflictKey = (key: string, weeklyCapacity: number): string => {
  const p = key.split('|');
  if (p.length !== KEY_PARTS - 1) return key; // already amended, or unrecognised — leave it alone
  return compose(p[0]!, p[1]!, weeklyCapacity, p[2]!);
};

export function detectConflicts(milestones: Milestone[], weeklyCapacity: number): Conflict[] {
  const byWeek = new Map<string, Milestone[]>();
  for (const m of milestones) {
    if (!byWeek.has(m.week)) byWeek.set(m.week, []);
    byWeek.get(m.week)!.push(m);
  }

  const conflicts: Conflict[] = [];
  for (const [week, items] of byWeek) {
    const urgent = items.filter((m) => m.urgent);
    if (urgent.length >= 2) {
      conflicts.push({
        key: conflictKey(week, 'urgent-overlap', weeklyCapacity, urgent),
        week,
        rule: 'urgent-overlap',
        explanation: `${urgent.length} urgent milestones land in this week — they compete for the same attention.`,
        items: urgent.map(({ cardId, displayId, name, phase, urgent }) => ({ cardId, displayId, name, phase, urgent })),
      });
    }

    // BR-6c (2026-08-12): load is card-equivalents, not row count — a row
    // carries its MC group's work-card share, so the unit matches BR-6a's
    // cards-per-week capacity.
    const load = items.reduce((s, m) => s + (m.weight ?? 1), 0);
    if (load > weeklyCapacity) {
      const displaced = items.filter((m) => !m.urgent);
      conflicts.push({
        key: conflictKey(week, 'over-capacity', weeklyCapacity, displaced),
        week,
        rule: 'over-capacity',
        explanation: `${fmtLoad(load)} cards' worth of milestones against a capacity of ${weeklyCapacity} cards — the non-urgent items listed are displaced.`,
        items: displaced.map(({ cardId, displayId, name, phase, urgent }) => ({ cardId, displayId, name, phase, urgent })),
      });
    }

    const breaching = items.filter((m) => m.late);
    if (breaching.length > 0) {
      conflicts.push({
        key: conflictKey(week, 'past-deadline', weeklyCapacity, breaching),
        week,
        rule: 'past-deadline',
        // 2026-08-27 (JP): the review wait is out of this measure, so the
        // wording says WORK rather than "forecast dates" — the forecast date
        // on screen still carries the wait and can sit later than the deadline
        // without being listed here.
        explanation: 'The design work alone runs past the client deadline for the items listed.',
        items: breaching.map(({ cardId, displayId, name, phase, urgent }) => ({ cardId, displayId, name, phase, urgent })),
      });
    }
  }
  return conflicts;
}

/** The replot list: every deliverable named by any conflict, with why (FR-6.5). */
export function replotList(conflicts: Conflict[]): Array<{ cardId: string; displayId: string; name: string; reasons: string[] }> {
  const map = new Map<string, { cardId: string; displayId: string; name: string; reasons: string[] }>();
  for (const c of conflicts) {
    for (const item of c.items) {
      if (!map.has(item.cardId)) {
        map.set(item.cardId, { cardId: item.cardId, displayId: item.displayId, name: item.name, reasons: [] });
      }
      const entry = map.get(item.cardId)!;
      if (!entry.reasons.includes(c.rule)) entry.reasons.push(c.rule);
    }
  }
  return [...map.values()];
}
