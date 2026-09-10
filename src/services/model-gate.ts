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
 *  - 'unverified' — historyUnverified / dropped.sampled ≥ opts.unverifiedRatioFail
 *                   (Ares: "treat the model as provisional"): every cell fails.
 */

import type { GridCell } from './model-refresh.ts';
import type { AresCycleTimeModel } from './ares.ts';
import type { Difficulty } from '../../lib/model.ts';

export interface GateOptions {
  minN: number;
  minWindowDays: number;
  unverifiedRatioFail: number; // 1.0 = fail only when every sample is unverified
}

export type GateReason = 'ordering' | 'min_n' | 'window' | 'unverified';

export interface GateFailure {
  cell: GridCell;
  reasons: GateReason[];
}

/** The slice of the Ares envelope the gate reads (PLAN.md frozen interface). */
export type GateModel = Pick<AresCycleTimeModel, 'window' | 'historyUnverified' | 'dropped'>;

export const DEFAULT_GATE: GateOptions = { minN: 15, minWindowDays: 60, unverifiedRatioFail: 1.0 };

const DAY_MS = 864e5;
const TIERS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const ORDERED_KEYS = ['0.85', 'Average'] as const;

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
