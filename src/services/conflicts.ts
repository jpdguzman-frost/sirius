/**
 * BR-6 conflict detection (T058 backend) — per week on Deadlines:
 *   urgent overlap  ≥2 urgent milestones in one week   → the urgent items
 *   over capacity   cards due exceed the week's cap    → non-urgent, displaced
 *   past deadline   forecast date after client deadline → the breaching items
 *
 * conflict_key = week | rule | sorted card:phase pairs (invariant 13) — any
 * change to the cards involved produces a different key, so a phase-8a
 * acknowledgement lapses automatically.
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
  items: Array<{ cardId: string; displayId: string; name: string; phase: string }>;
}

const pairKey = (items: Array<{ cardId: string; phase: string }>) =>
  items.map((i) => `${i.cardId}:${i.phase}`).sort().join(',');

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
        key: `${week}|urgent-overlap|${pairKey(urgent)}`,
        week,
        rule: 'urgent-overlap',
        explanation: `${urgent.length} urgent milestones land in this week — they compete for the same attention.`,
        items: urgent.map(({ cardId, displayId, name, phase }) => ({ cardId, displayId, name, phase })),
      });
    }

    // BR-6c (2026-08-12): load is card-equivalents, not row count — a row
    // carries its MC group's work-card share, so the unit matches BR-6a's
    // cards-per-week capacity.
    const load = items.reduce((s, m) => s + (m.weight ?? 1), 0);
    if (load > weeklyCapacity) {
      const displaced = items.filter((m) => !m.urgent);
      conflicts.push({
        key: `${week}|over-capacity|${pairKey(displaced)}`,
        week,
        rule: 'over-capacity',
        explanation: `${fmtLoad(load)} cards' worth of milestones against a capacity of ${weeklyCapacity} cards — the non-urgent items listed are displaced.`,
        items: displaced.map(({ cardId, displayId, name, phase }) => ({ cardId, displayId, name, phase })),
      });
    }

    const breaching = items.filter((m) => m.late);
    if (breaching.length > 0) {
      conflicts.push({
        key: `${week}|past-deadline|${pairKey(breaching)}`,
        week,
        rule: 'past-deadline',
        explanation: 'Forecast dates fall after the client deadline for the items listed.',
        items: breaching.map(({ cardId, displayId, name, phase }) => ({ cardId, displayId, name, phase })),
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
