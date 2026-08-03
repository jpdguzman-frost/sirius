/**
 * T015 — append-only audit writer (invariant 10, FR-2.6, NFR-7).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import * as auditModule from '../src/services/audit.ts';
import { AuditLog } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

describe('audit writer', () => {
  it('records actor, action, entity and before/after snapshots', async () => {
    const pid = new Types.ObjectId();
    await auditModule.audit({
      project_id: pid,
      actor: 'pm@frostdesigngroup.com',
      action: 'schedule.slot',
      entity: 'deliverable',
      entity_id: 'fxCard655a',
      before: { slotted_week: null },
      after: { slotted_week: '2026-08-10' },
    });

    const rows = await AuditLog.find({ project_id: pid });
    expect(rows.length).toBe(1);
    expect(rows[0]?.actor).toBe('pm@frostdesigngroup.com');
    expect(rows[0]?.action).toBe('schedule.slot');
    expect(rows[0]?.before).toEqual({ slotted_week: null });
    expect(rows[0]?.after).toEqual({ slotted_week: '2026-08-10' });
    expect(rows[0]?.at).toBeInstanceOf(Date);
  });

  it('exposes insert only — no update or delete surface (invariant 10)', () => {
    const exported = Object.keys(auditModule);
    expect(exported).toEqual(['audit']);
  });

  it('accepts entries without a project (system-level events per source schema)', async () => {
    await auditModule.audit({ action: 'system.boot', entity: 'system' });
    expect(await AuditLog.countDocuments({ action: 'system.boot' })).toBe(1);
  });
});
