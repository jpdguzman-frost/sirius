/**
 * Audit writer — the ONLY way state changes are recorded, and the only
 * surface this module exposes is INSERT. There is no update or delete code
 * path anywhere for audit_log; the log is immutable (invariant 10, FR-2.6,
 * NFR-7: 24-month retention).
 *
 * Log hygiene (NFR-11): callers pass structured before/after snapshots;
 * never put brief text or credentials in them.
 */

import { Types } from 'mongoose';
import { AuditLog } from '../models/index.ts';

export interface AuditEntry {
  project_id?: string | Types.ObjectId | null;
  actor?: string | null;
  action: string; // e.g. 'schedule.slot', 'urgency.set', 'sprint.update'
  entity: string; // e.g. 'deliverable', 'sprint', 'project'
  entity_id?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function audit(entry: AuditEntry): Promise<void> {
  await AuditLog.create({
    project_id: entry.project_id ? new Types.ObjectId(String(entry.project_id)) : undefined,
    actor: entry.actor ?? undefined,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entity_id ?? undefined,
    before: entry.before,
    after: entry.after,
    at: new Date(),
  });
}
