/**
 * Model refresh derivation (T040/T041; block 8 T181) — BR-2: the forecast is
 * empirical, rebuilt from measured movement data; BR-4: design time keyed on
 * difficulty AND lane. Pure functions; the worker orchestrates.
 *
 * BLOCK 8 (T181, JP "read Ares" 2026-09-09): the DESIGN cells are READ from
 * Ares's cycle-time model — `cellsFromAresModel` maps its lane-pooled cells
 * into the `GridCell` shape and the worker writes those (after the gate).
 * The list-dwell derivation that used to build them here (`deriveSamples`,
 * `computeModelGrid`, the review-list regex) was DELETED in the 2026-09-10
 * review-fix round (X7): nothing on our side classifies a list into a design
 * cell any more, and `test/model-refresh-lane-states.test.ts` pins that it
 * does not come back. Its method is recorded in the 2026-09-08 state log.
 *
 * Still derived locally, unchanged: throughput = cards completed per ISO
 * week (entered a `done`-classified list), percentiled p25/p50/p70 across
 * weeks with activity — `computeThroughput`; and the overnight delta check
 * `gridDelta` (§5.4 step 5).
 */

import { classifyList } from './status-rules.ts';
import type { ConfidenceKey, Difficulty, Lane } from '../../lib/model.ts';
import type { AresCycleTimeLaneCell, AresCycleTimeModel } from './ares.ts';

export interface EventLike {
  trello_card_id: string;
  to_list: string | null;
  occurred_at: Date;
}

/** What throughput needs of a card: its id and its difficulty label. */
export interface CardMeta {
  trello_card_id: string;
  difficulty?: Difficulty | null;
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

/**
 * The grid's lane axis, as a runtime set. `satisfies Record<Lane, true>` ties
 * it to lib/model's union both ways at compile time: a lane added there
 * without a key here, or a key here the union lacks, fails `tsc`. Ares's
 * `laneKey` vocabulary is wider (dev / working-on-design on 837) — those are
 * counted, never guessed into a lane (§7a's rule, on this axis).
 */
const LANE_KEYS = { design: true, ops: true, assets: true, content: true } satisfies Record<Lane, true>;
const isLane = (key: string): key is Lane => Object.hasOwn(LANE_KEYS, key);

/** `Design: Refinement` → `Design`; a key with no colon is its own prefix. */
const workTypePrefix = (key: string): string => key.split(':')[0]!.trim();

export type CellSource = AresCycleTimeLaneCell['source'];

export interface MappedCells {
  cells: GridCell[];
  /** Ares keys that reached no lane → how many source cells each carried. */
  unmapped: Record<string, number>;
  /**
   * Per mapped lane, where its numbers came from: `project` only when every
   * chosen tier of the lane is the project's own pool; one firm-backed tier
   * marks the whole lane `firm`, so a firm-wide number written under a
   * project is never mistaken for a measured one (review A2-1).
   */
  laneSources: Record<string, CellSource>;
}

/**
 * T181 — Ares cells → GridCells (Q2-A, JP 2026-09-10).
 *
 * GridCells come ONLY from `model.laneCells`: `laneKey` → `Lane` 1:1 when the
 * key is a member of the union, else the key is counted in `unmapped`. Each
 * lane cell yields the four confidence cells the loader assembles — Average
 * from `meanWorkingDays`, 0.7/0.85/0.95 from p70/p85/p95 — with `sample_n`
 * = `n`. Values are copied, not converted: Ares already reports working days
 * (test/model.test.ts checks the magnitude against the snapshot).
 *
 * When `laneCells` is absent OR EMPTY there are NO cells: percentiles cannot
 * be pooled from per-work-type cells, only from samples, so pooling on our
 * side would be invention. The per-work-type cells are then summarised into
 * `unmapped` by prefix (`Design`, `Asset`, …) so the provenance says what
 * Ares sent and that none of it reached the grid (review A2-3: an empty
 * pooled table is not "Ares sent nothing" — the worker also records
 * `laneCellCount`).
 *
 * No review cells, ever: the client-review wait is a queue, not a cell (JP
 * via Ares; build-spec §7.1) — the loader keeps serving the snapshot's.
 *
 * A key present as both `project` and `firm` (none on 837 today) takes the
 * project cell — Ares's own override rule — so the upsert never sees two
 * values for one grid key.
 *
 * `unmapped` is prototype-free: Ares's keys are data, and a key named
 * `constructor` or `__proto__` must count like any other (review A2-4).
 *
 * `projectId` is the frozen signature's; the GridCell carries no project_id
 * (the worker scopes the write, as it always has), so it is unused here.
 */
export function cellsFromAresModel(model: AresCycleTimeModel, projectId: string): MappedCells {
  void projectId; // frozen signature; the worker scopes the write
  const unmapped = Object.create(null) as Record<string, number>;
  const count = (key: string) => {
    unmapped[key] = (unmapped[key] ?? 0) + 1;
  };

  if (!model.laneCells?.length) {
    for (const c of model.cells) count(workTypePrefix(c.workType));
    return { cells: [], unmapped, laneSources: {} };
  }

  const chosen = new Map<string, AresCycleTimeLaneCell>();
  for (const lc of model.laneCells) {
    if (!isLane(lc.laneKey)) {
      count(lc.laneKey);
      continue;
    }
    const key = `${lc.difficulty}|${lc.laneKey}`;
    const prev = chosen.get(key);
    if (!prev || (prev.source === 'firm' && lc.source === 'project')) chosen.set(key, lc);
  }

  const cells: GridCell[] = [];
  const laneSources: Record<string, CellSource> = {};
  for (const lc of chosen.values()) {
    const lane = lc.laneKey as Lane;
    if (lc.source === 'firm' || laneSources[lane] === undefined) laneSources[lane] = lc.source;
    const values: Array<[ConfidenceKey, number]> = [
      ['Average', lc.meanWorkingDays],
      ['0.7', lc.p70],
      ['0.85', lc.p85],
      ['0.95', lc.p95],
    ];
    for (const [confidence, value] of values) {
      cells.push({ difficulty: lc.difficulty, lane, metric: 'design', confidence, value, sample_n: lc.n });
    }
  }
  return { cells, unmapped, laneSources };
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
    /* `=== 'done'` and nothing else, so an EXCLUDED list is not a completion:
       `Ops Work Complete` used to end a card here (the keyword classifier read
       it as done) and inflated throughput with work that was never a
       deliverable. §7a, 2026-09-08. */
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
  /** null = the cell was served last night and is absent tonight (vanished). */
  after: number | null;
  ratio: number;
}

/**
 * §5.4 step 5 — a grid that shifts sharply overnight means the input changed.
 * A cell present before and ABSENT after is reported too (`after: null`,
 * ratio 1), regardless of threshold: a night on which every cell fails the
 * gate empties the grid, and that must be as loud as a doubled number
 * (review A2-2). New cells (absent before) are not a shift and are not
 * reported.
 */
export function gridDelta(before: GridCell[], after: GridCell[], threshold = 0.3): GridDelta[] {
  const key = (c: GridCell) => `${c.difficulty}|${c.lane}|${c.metric}|${c.confidence}`;
  const prev = new Map(before.map((c) => [key(c), c.value]));
  const seen = new Set<string>();
  const alerts: GridDelta[] = [];
  for (const c of after) {
    const k = key(c);
    seen.add(k);
    const b = prev.get(k);
    if (b === undefined || b === 0) continue;
    const ratio = Math.abs(c.value - b) / b;
    if (ratio > threshold) alerts.push({ cell: k, before: b, after: c.value, ratio: Number(ratio.toFixed(2)) });
  }
  for (const [k, b] of prev) {
    if (!seen.has(k)) alerts.push({ cell: k, before: b, after: null, ratio: 1 });
  }
  return alerts;
}
