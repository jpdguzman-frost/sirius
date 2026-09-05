/**
 * "The project's latest read" — ONE query for a question two places ask.
 *
 * The rollover's sync gate (src/services/rollover.ts, R3-1) and the FR-8.6
 * freshness chip (src/routes/deliverables.ts) each want the newest `sync_runs`
 * row a READ of the board left, and each had written its own findOne + sort.
 * Two hand-rolled copies of the same probe are how the two came to answer the
 * question with DIFFERENT source lists without anyone deciding so — the gate
 * counts `ares_push` (FR-9.6 relaxes the full sync to hourly while push is
 * healthy, and a push-healthy project writes only push rows in between), the
 * chip counts `ares` alone. That divergence is real and is JP's to rule on
 * (simplification pass 2026-09-05, ALT-4); until then it is ONE named
 * argument here rather than two unrelated queries — and `READ_SOURCES` is the
 * list a caller passes when it means "any read of the board".
 *
 * Read-only: nothing here writes `sync_runs` (every run writes its own row;
 * contracts/worker.md).
 */

import type { Types } from 'mongoose';
import { SyncRun } from '../models/index.ts';

/**
 * The `sync_runs` sources that are READS of the board: the full sync and a
 * push drain, which re-reads the cards that changed (worker/syncAres.ts,
 * worker/drainPush.ts).
 */
export const READ_SOURCES: readonly string[] = ['ares', 'ares_push'];

/** What a caller reads off the latest run: its outcome, its instant, its message. */
export interface LatestRead {
  ok: boolean;
  at: Date;
  error?: string | null;
}

/**
 * The newest `sync_runs` row from any of `sources`, or null when the project
 * has none. The LATEST row of any outcome by default — a failure after a
 * success is the current state of the read; `okOnly` narrows to the latest
 * SUCCESS, which is what "the data on screen was read at" means (FR-8.6).
 * Served by the `{ project_id, at }` index (models/index.ts).
 */
export async function latestRead(
  projectId: Types.ObjectId,
  opts: { sources: readonly string[]; okOnly?: boolean },
): Promise<LatestRead | null> {
  const last = await SyncRun.findOne({
    project_id: projectId,
    source: { $in: [...opts.sources] },
    ...(opts.okOnly ? { ok: true } : {}),
  })
    .sort({ at: -1 })
    .select({ ok: 1, at: 1, error: 1 })
    .lean();
  return last ?? null;
}
