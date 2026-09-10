/**
 * T182 — the sanity gate over Ares-read cycle-time cells (block 8, phase 19).
 *
 * Pure: no I/O, no clock, no imports beyond types. The worker runs it at
 * WRITE time; a cell that fails is simply not written, so the loader's
 * existing absent-cell → snapshot fill is the fallback (drift item 5). A
 * failing cell never ships a number nobody believes; a green gate never
 * unfreezes anything (invariant 7 — unfreeze is JP's, per project).
 *
 * Reasons, in the stable order they are reported:
 *  - 'ordering'   — within one lane, Easy ≤ Medium ≤ Hard must hold on BOTH
 *                   the '0.85' and the 'Average' values across the tiers
 *                   present. A mixed lane is what froze the model, so the
 *                   whole lane fails — the good tier is not kept.
 *  - 'min_n'      — sample_n below opts.minN.
 *  - 'window'     — the model window spans fewer than opts.minWindowDays
 *                   calendar days (or is unparseable): every cell fails.
 *                   NOTE (review A3-4/X5, 2026-09-10): Ares's `window` is the
 *                   REQUEST window — 12 months by default, and Sirius never
 *                   passes dates — not the span of the samples behind a cell.
 *                   So on a live read this rule only catches a malformed or
 *                   short window; T182's "samples actually span the window"
 *                   waits on an Ares field (per-cell span; owl ask, not code).
 *  - 'unverified' — historyUnverified / dropped.sampled ≥ opts.unverifiedRatioFail
 *                   (Ares: "treat the model as provisional"): every cell fails.
 */

import type { GridCell } from './model-refresh.ts';
import type { AresCycleTimeModel } from './ares.ts';
import type { Difficulty } from '../../lib/model.ts';

export interface GateOptions {
  minN: number;
  minWindowDays: number;
  unverifiedRatioFail: number; // share of sampled history that is unverified at which every cell fails
}

export type GateReason = 'ordering' | 'min_n' | 'window' | 'unverified';

export interface GateFailure {
  cell: GridCell;
  reasons: GateReason[];
}

/** The slice of the Ares envelope the gate reads (PLAN.md frozen interface). */
export type GateModel = Pick<AresCycleTimeModel, 'window' | 'historyUnverified' | 'dropped'>;

// unverifiedRatioFail 0.5 (review A3-1, 2026-09-10): at 1.0 the live rt-837 read — 8337 of
// 8376 samples unverified — cleared the gate and the design lane would have been written.
export const DEFAULT_GATE: GateOptions = { minN: 15, minWindowDays: 60, unverifiedRatioFail: 0.5 };

const DAY_MS = 864e5;
const TIERS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const ORDERED_KEYS = ['0.85', 'Average'] as const;

/** Calendar days of the envelope's (request) window — see the 'window' note above. */
function windowDays(model: GateModel): number {
  return (Date.parse(model.window.to) - Date.parse(model.window.from)) / DAY_MS;
}

/** Lanes whose present tiers are not non-decreasing on '0.85' or on 'Average'. */
function misorderedLanes(cells: GridCell[]): Set<string> {
  // lane → confidence → difficulty → value (last write wins; duplicates are the mapper's bug)
  const byLane = new Map<string, Map<string, Map<string, number>>>();
  for (const c of cells) {
    if (!(TIERS as string[]).includes(c.difficulty)) continue;
    let lane = byLane.get(c.lane);
    if (!lane) byLane.set(c.lane, (lane = new Map()));
    let conf = lane.get(c.confidence);
    if (!conf) lane.set(c.confidence, (conf = new Map()));
    conf.set(c.difficulty, c.value);
  }
  const bad = new Set<string>();
  for (const [lane, confs] of byLane) {
    for (const key of ORDERED_KEYS) {
      const tiers = confs.get(key);
      if (!tiers) continue;
      const present = TIERS.filter((t) => tiers.has(t)).map((t) => tiers.get(t)!);
      for (let i = 1; i < present.length; i += 1) {
        if (present[i]! < present[i - 1]!) bad.add(lane);
      }
    }
  }
  return bad;
}

export function gateCells(
  cells: GridCell[],
  model: Pick<AresCycleTimeModel, 'window' | 'historyUnverified' | 'dropped'>,
  opts: GateOptions,
): { passed: GridCell[]; failed: GateFailure[] } {
  const badLanes = misorderedLanes(cells);
  // fail closed: an unparseable window is NaN, and NaN never satisfies ≥
  const windowFails = !(windowDays(model) >= opts.minWindowDays);
  const unverifiedFails =
    model.dropped.sampled > 0 && model.historyUnverified / model.dropped.sampled >= opts.unverifiedRatioFail;

  const passed: GridCell[] = [];
  const failed: GateFailure[] = [];
  for (const cell of cells) {
    const reasons: GateReason[] = [];
    if (badLanes.has(cell.lane)) reasons.push('ordering');
    if (cell.sample_n < opts.minN) reasons.push('min_n');
    if (windowFails) reasons.push('window');
    if (unverifiedFails) reasons.push('unverified');
    if (reasons.length === 0) passed.push(cell);
    else failed.push({ cell, reasons });
  }
  return { passed, failed };
}
