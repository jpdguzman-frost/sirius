/**
 * Model refresh derivation (T040/T041) — BR-2: the forecast is empirical,
 * rebuilt from measured movement data; BR-4: design time keyed on
 * difficulty AND lane. Pure functions; the worker orchestrates.
 *
 * Method (documented for the T045 gate):
 *  - a card's dwell intervals come from its ordered card_events: it enters
 *    `to_list` at occurred_at and leaves at the next event; open intervals
 *    (still in the list) are excluded — completed dwell only;
 *  - review time = dwell in lists matching /sent for client review/i,
 *    pooled GLOBALLY (the Appendix review row is one pool — the client is
 *    the client regardless of lane);
 *  - design time = dwell in lists classified `ongoing` by BR-10 rules that
 *    are not review lists, keyed by the LANE OF THE LIST DWELLED IN
 *    (BR-2 "working-lane dwell" — not the card's current list);
 *  - dwell is fractional days (§1.4 — coarser data would break comparability);
 *  - percentiles: Average = mean; 0.7/0.85/0.95 by linear interpolation on
 *    the sorted sample;
 *  - throughput = cards completed per ISO week (entered a `done`-classified
 *    list), percentiled p25/p50/p70 across weeks with activity.
 */

import { classifyList } from './status-rules.ts';
import { laneOf } from '../../lib/model.ts';
import type { ConfidenceKey, Difficulty, Lane } from '../../lib/model.ts';

const REVIEW_RE = /sent for client review/i;
const DAY_MS = 864e5;

export interface EventLike {
  trello_card_id: string;
  to_list: string | null;
  occurred_at: Date;
}

export interface CardMeta {
  trello_card_id: string;
  difficulty?: Difficulty | null;
  lane?: Lane | null;
}

export interface Sample {
  trello_card_id: string;
  difficulty: Difficulty;
  lane: Lane;
  metric: 'design' | 'review';
  days: number;
  completed_at: Date;
}

/** Dwell samples from a card's ordered events + its difficulty/lane. */
export function deriveSamples(events: EventLike[], cards: CardMeta[]): Sample[] {
  const meta = new Map(cards.map((c) => [c.trello_card_id, c]));
  const byCard = new Map<string, EventLike[]>();
  for (const e of events) {
    if (!byCard.has(e.trello_card_id)) byCard.set(e.trello_card_id, []);
    byCard.get(e.trello_card_id)!.push(e);
  }

  const samples: Sample[] = [];
  for (const [cardId, list] of byCard) {
    const m = meta.get(cardId);
    if (!m?.difficulty) continue; // difficulty is required for the key (BR-4)
    const ordered = [...list].sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());
    for (let i = 0; i < ordered.length - 1; i++) {
      const cur = ordered[i]!;
      const next = ordered[i + 1]!;
      const listName = cur.to_list ?? '';
      const days = (next.occurred_at.getTime() - cur.occurred_at.getTime()) / DAY_MS;
      if (days <= 0) continue;
      if (REVIEW_RE.test(listName)) {
        samples.push({ trello_card_id: cardId, difficulty: m.difficulty, lane: 'design', metric: 'review', days, completed_at: next.occurred_at });
      } else if (classifyList(listName) === 'ongoing') {
        const lane = laneOf({ currentList: listName, labels: [] }); // the list dwelled in
        samples.push({ trello_card_id: cardId, difficulty: m.difficulty, lane, metric: 'design', days, completed_at: next.occurred_at });
      }
    }
  }
  return samples;
}

/** Linear-interpolation percentile on an unsorted sample. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export interface GridCell {
  difficulty: Difficulty | 'all';
  lane: Lane | 'all';
  metric: 'design' | 'review';
  confidence: ConfidenceKey;
  value: number;
  sample_n: number;
}

const CONFIDENCES: Array<{ key: ConfidenceKey; p: number | 'mean' }> = [
  { key: 'Average', p: 'mean' },
  { key: '0.7', p: 0.7 },
  { key: '0.85', p: 0.85 },
  { key: '0.95', p: 0.95 },
];

/** Group samples by difficulty × lane × metric and percentile each cell (BR-2/BR-4). */
export function computeModelGrid(samples: Sample[]): GridCell[] {
  const groups = new Map<string, { difficulty: string; lane: string; metric: 'design' | 'review'; days: number[] }>();
  for (const s of samples) {
    // review dwell is a property of the client, not the lane or difficulty:
    // one global pool, stored as all/all (the Appendix review row).
    const key = s.metric === 'review' ? 'all|all|review' : `${s.difficulty}|${s.lane}|design`;
    if (!groups.has(key)) {
      const [d, l] = key.split('|');
      groups.set(key, { difficulty: d!, lane: l!, metric: s.metric, days: [] });
    }
    groups.get(key)!.days.push(s.days);
  }
  const cells: GridCell[] = [];
  for (const g of groups.values()) {
    for (const c of CONFIDENCES) {
      const value =
        c.p === 'mean' ? g.days.reduce((a, b) => a + b, 0) / g.days.length : percentile(g.days, c.p);
      cells.push({
        difficulty: g.difficulty as GridCell['difficulty'],
        lane: g.lane as GridCell['lane'],
        metric: g.metric,
        confidence: c.key,
        value: Number(value.toFixed(2)),
        sample_n: g.days.length,
      });
    }
  }
  return cells;
}

export interface ThroughputRow {
  difficulty: Difficulty;
  p25: number;
  p50: number;
  p70: number;
  weeks: number;
}

/** Cards completed per ISO week per difficulty, percentiled across weeks. */
export function computeThroughput(events: EventLike[], cards: CardMeta[]): ThroughputRow[] {
  const meta = new Map(cards.map((c) => [c.trello_card_id, c]));
  const done = new Map<string, Date>(); // card → first time it entered a done list
  const ordered = [...events].sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());
  for (const e of ordered) {
    if (!done.has(e.trello_card_id) && classifyList(e.to_list ?? '') === 'done') {
      done.set(e.trello_card_id, e.occurred_at);
    }
  }
  const perWeek = new Map<Difficulty, Map<string, number>>();
  for (const [cardId, at] of done) {
    const d = meta.get(cardId)?.difficulty;
    if (!d) continue;
    const monday = new Date(at);
    const day = monday.getUTCDay() === 0 ? 7 : monday.getUTCDay();
    monday.setUTCDate(monday.getUTCDate() - (day - 1));
    const week = monday.toISOString().slice(0, 10);
    if (!perWeek.has(d)) perWeek.set(d, new Map());
    const w = perWeek.get(d)!;
    w.set(week, (w.get(week) ?? 0) + 1);
  }
  const rows: ThroughputRow[] = [];
  for (const [difficulty, weeks] of perWeek) {
    const counts = [...weeks.values()];
    rows.push({
      difficulty,
      p25: Math.round(percentile(counts, 0.25)),
      p50: Math.round(percentile(counts, 0.5)),
      p70: Math.round(percentile(counts, 0.7)),
      weeks: counts.length,
    });
  }
  return rows;
}

export interface GridDelta {
  cell: string;
  before: number;
  after: number;
  ratio: number;
}

/** §5.4 step 5 — a grid that shifts sharply overnight means the input changed. */
export function gridDelta(before: GridCell[], after: GridCell[], threshold = 0.3): GridDelta[] {
  const key = (c: GridCell) => `${c.difficulty}|${c.lane}|${c.metric}|${c.confidence}`;
  const prev = new Map(before.map((c) => [key(c), c.value]));
  const alerts: GridDelta[] = [];
  for (const c of after) {
    const b = prev.get(key(c));
    if (b === undefined || b === 0) continue;
    const ratio = Math.abs(c.value - b) / b;
    if (ratio > threshold) alerts.push({ cell: key(c), before: b, after: c.value, ratio: Number(ratio.toFixed(2)) });
  }
  return alerts;
}
