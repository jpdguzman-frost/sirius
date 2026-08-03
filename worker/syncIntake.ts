/**
 * syncIntake (T037, T038) — read-only mirror of the project's intake tab
 * (FR-3.1): parse per intake-parser, upsert intake_requests, reserved rows
 * counted silently (FR-3.4), unparseable rows to intake_rejects (FR-3.5),
 * vanished rows inactive never deleted (FR-8.4, AC-9). Then the deadline
 * join: sheet-owned fields onto deliverables by (project_id, mc_number) —
 * BR-9 precedence itself lives in deliverables_v (AC-8).
 */

import type { Types } from 'mongoose';
import { parseIntake, type ParseResult } from '../src/services/intake-parser.ts';
import { Deliverable, IntakeReject, IntakeRequest, SyncRun } from '../src/models/index.ts';

export interface IntakeStats {
  imported: number;
  reserved: number;
  rejected: number;
  skipped: number;
  deactivated: number;
  joined: number;
  deadlineCoverage: { withDeadline: number; total: number };
}

export async function syncIntakeRows(
  projectId: Types.ObjectId,
  rows: string[][],
): Promise<IntakeStats> {
  const parsed: ParseResult = parseIntake(rows);
  const now = new Date();

  const seen = new Set<string>();
  for (const r of parsed.ok) {
    seen.add(r.mc_number);
    await IntakeRequest.updateOne(
      { project_id: projectId, mc_number: r.mc_number },
      {
        $set: {
          sheet_row: r.sheet_row,
          name: r.name,
          requestor: r.requestor,
          asset_type: r.asset_type,
          use_case: r.use_case,
          brief: r.brief,
          deadline: r.deadline,
          in_frost_prod: r.in_frost_prod,
          last_seen_at: now,
          active: true,
        },
        $setOnInsert: { project_id: projectId, first_seen_at: now },
      },
      { upsert: true },
    );
  }

  // Vanished rows: inactive, history intact — never deleted (FR-8.4, AC-9).
  const deactivated = await IntakeRequest.updateMany(
    { project_id: projectId, active: true, mc_number: { $nin: [...seen] } },
    { $set: { active: false, last_seen_at: now } },
  );

  // Rejects mirror the CURRENT sheet state (FR-3.5).
  await IntakeReject.deleteMany({ project_id: projectId });
  for (const rej of parsed.rejects) {
    await IntakeReject.updateOne(
      { project_id: projectId, sheet_row: rej.sheet_row },
      { $set: { raw: rej.raw, reason: rej.reason, seen_at: now }, $setOnInsert: { project_id: projectId } },
      { upsert: true },
    );
  }

  // The deadline join (BR-9 input; AC-8): sheet-owned fields only.
  let joined = 0;
  for (const r of parsed.ok) {
    const res = await Deliverable.updateMany(
      { project_id: projectId, mc_number: r.mc_number },
      {
        $set: {
          sheet_deadline: r.deadline,
          use_case: r.use_case,
          brief: r.brief,
          requestor: r.requestor,
          updated_at: now,
        },
      },
    );
    joined += res.modifiedCount;
  }

  const total = await Deliverable.countDocuments({ project_id: projectId, active: true });
  const withDeadline = await Deliverable.countDocuments({
    project_id: projectId,
    active: true,
    $or: [{ trello_due: { $ne: null } }, { sheet_deadline: { $ne: null } }],
  });

  return {
    imported: parsed.ok.length,
    reserved: parsed.reserved,
    rejected: parsed.rejects.length,
    skipped: parsed.skipped,
    deactivated: deactivated.modifiedCount,
    joined,
    deadlineCoverage: { withDeadline, total },
  };
}

/** Wrapper recording sync_runs on success AND failure (FR-8.5, FR-8.6, AC-19). */
export async function runIntakeSync(
  projectId: Types.ObjectId,
  fetchRows: () => Promise<string[][]>,
): Promise<void> {
  try {
    const rows = await fetchRows();
    const stats = await syncIntakeRows(projectId, rows);
    await SyncRun.create({ project_id: projectId, source: 'sheet', ok: true, stats });
  } catch (err) {
    await SyncRun.create({
      project_id: projectId,
      source: 'sheet',
      ok: false,
      error: (err as Error).message,
    });
  }
}
