/**
 * Migrations — version-controlled from the first line, applied in order,
 * recorded in the `migrations` collection. Never applied by hand against
 * production (constitution: no schema/index changes by hand).
 *
 * Run via `npm run migrate` (scripts/migrate/run.ts) or from tests.
 */

import type { Connection } from 'mongoose';
import { ALL_MODELS, SprintItem } from '../../src/models/index.ts';

export interface Migration {
  id: string;
  up: (conn: Connection) => Promise<void>;
}

/** BR-9 deadline precedence lives in the deliverables_v view (invariant 14). */
export const DELIVERABLES_V_PIPELINE = [
  {
    $addFields: {
      deadline: { $ifNull: ['$trello_due', { $ifNull: ['$sheet_deadline', null] }] },
      deadline_source: {
        $switch: {
          branches: [
            { case: { $ne: [{ $ifNull: ['$trello_due', null] }, null] }, then: 'trello' },
            { case: { $ne: [{ $ifNull: ['$sheet_deadline', null] }, null] }, then: 'sheet' },
          ],
          default: null,
        },
      },
    },
  },
];

export const MIGRATIONS: Migration[] = [
  {
    id: '001-indexes',
    up: async () => {
      for (const model of ALL_MODELS) {
        await model.createCollection();
        await model.syncIndexes();
      }
    },
  },
  {
    id: '002-deliverables-view',
    up: async (conn) => {
      const db = conn.db;
      if (!db) throw new Error('no database on connection');
      const existing = await db.listCollections({ name: 'deliverables_v' }).toArray();
      if (existing.length === 0) {
        await db.createCollection('deliverables_v', {
          viewOn: 'deliverables',
          pipeline: DELIVERABLES_V_PIPELINE,
        });
      }
    },
  },
  {
    // push_events (contracts/ares-push.md): unique event_id + drain index +
    // 7-day TTL. 001 already ran on existing databases, so the new collection
    // gets its own migration.
    id: '003-push-events',
    up: async () => {
      const { PushEvent } = await import('../../src/models/index.ts');
      await PushEvent.createCollection();
      await PushEvent.syncIndexes();
    },
  },
  {
    // frost_notes (FR-11) + milestone_day_plan (FR-12), phase 12 — both keyed
    // with project_id (invariant 1), unique per request / per milestone.
    id: '004-frost-notes-day-plan',
    up: async () => {
      const { FrostNote, MilestoneDayPlan } = await import('../../src/models/index.ts');
      await FrostNote.createCollection();
      await FrostNote.syncIndexes();
      await MilestoneDayPlan.createCollection();
      await MilestoneDayPlan.syncIndexes();
    },
  },
  {
    // Amendment 2026-08-15: buildWeeks() keys used to shift to the SUNDAY
    // before on hosts east of UTC, and /suggest Accept persisted them.
    // slotted_week is documented as a Monday (models/index.ts) — normalize
    // every non-Monday value to the Monday of its week (string math, no TZ).
    // Every change writes to audit_log (invariant 10), before/after included.
    id: '005-monday-slotted-week',
    up: async (conn) => {
      const db = conn.db;
      if (!db) throw new Error('no database on connection');
      const { audit } = await import('../../src/services/audit.ts');
      const mondayOf = (s: string): string => {
        const [y, m, d] = s.split('-').map(Number);
        const t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
        const dow = new Date(t).getUTCDay();
        const back = dow === 0 ? 6 : dow - 1;
        return new Date(t - back * 86_400_000).toISOString().slice(0, 10);
      };
      const rows = await db
        .collection('deliverables')
        .find({ slotted_week: { $ne: null } })
        .project({ slotted_week: 1, project_id: 1, mc_number: 1 })
        .toArray();
      for (const r of rows) {
        const cur = String(r.slotted_week).slice(0, 10);
        const mon = mondayOf(cur);
        if (mon === cur) continue;
        await db
          .collection('deliverables')
          .updateOne({ _id: r._id }, { $set: { slotted_week: mon } });
        await audit({
          project_id: r.project_id ? String(r.project_id) : null,
          actor: 'migration:005-monday-slotted-week',
          action: 'schedule.normalize',
          entity: 'deliverable',
          entity_id: String(r._id),
          before: { slotted_week: cur },
          after: { slotted_week: mon },
        });
      }
    },
  },
  {
    // Owl #23 (JP-endorsed 2026-08-17): rt-837's capacity is JP-held
    // calibration (120 vs the live 92) and must not be nudged from the
    // toolbar. Locks that ONE project by code; rt-test stays unlocked.
    // Idempotent, and every change writes to audit_log (invariant 10),
    // before/after included — same shape as 005.
    id: '006-capacity-lock-rt837',
    up: async (conn) => {
      const db = conn.db;
      if (!db) throw new Error('no database on connection');
      const { audit } = await import('../../src/services/audit.ts');
      const doc = await db.collection('projects').findOne({ code: 'rt-837' });
      if (!doc) return; // fresh/empty db (tests) — nothing to lock
      if (doc.capacity_locked === true) return; // idempotent
      await db.collection('projects').updateOne({ _id: doc._id }, { $set: { capacity_locked: true } });
      await audit({
        project_id: String(doc._id),
        actor: 'migration:006-capacity-lock-rt837',
        action: 'capacity.lock',
        entity: 'project',
        entity_id: String(doc._id),
        before: { capacity_locked: doc.capacity_locked === true },
        after: { capacity_locked: true },
      });
    },
  },
  {
    // JP ruling A (2026-08-17), invariant 13 v4.3.0: the ack situation key
    // gains the project's weekly capacity — week | rule | capacity | pairs.
    // Existing acks are lifted to their own project's CURRENT capacity, which
    // preserves today's suppression state exactly: nothing that is silenced
    // today un-silences on deploy, and the NEXT capacity change is what
    // re-surfaces the week. Idempotent by key shape (legacy keys have 3
    // components, amended keys 4) and audited per changed row (invariant 10),
    // before/after included — same shape as 005 and 006.
    id: '007-ack-capacity',
    up: async (conn) => {
      const db = conn.db;
      if (!db) throw new Error('no database on connection');
      const { audit } = await import('../../src/services/audit.ts');
      const { isLegacyConflictKey, upgradeConflictKey } = await import('../../src/services/conflicts.ts');

      const rows = await db
        .collection('conflict_acknowledgements')
        .find({})
        .project({ conflict_key: 1, project_id: 1 })
        .toArray();
      const capByProject = new Map<string, number>();

      for (const r of rows) {
        const key = String(r.conflict_key);
        if (!isLegacyConflictKey(key)) continue; // already amended — idempotent
        if (!r.project_id) continue; // invariant 1: never guess a project
        const pid = String(r.project_id);
        if (!capByProject.has(pid)) {
          const p = await db
            .collection('projects')
            .findOne({ _id: r.project_id }, { projection: { weekly_capacity: 1 } });
          if (!p || typeof p.weekly_capacity !== 'number') continue; // project gone — leave the row alone
          capByProject.set(pid, p.weekly_capacity); // EACH project's OWN capacity (invariant 1)
        }
        const next = upgradeConflictKey(key, capByProject.get(pid)!);
        if (next === key) continue;
        await db
          .collection('conflict_acknowledgements')
          .updateOne({ _id: r._id }, { $set: { conflict_key: next } });
        await audit({
          project_id: pid,
          actor: 'migration:007-ack-capacity',
          action: 'ack.backfill-capacity',
          entity: 'conflict_ack',
          entity_id: String(r._id),
          before: { conflict_key: key },
          after: { conflict_key: next },
        });
      }
    },
  },
  {
    /**
     * owl #62 — the Pipeline's default order is "by order of filing, most
     * recently ingested first", and the field it needs did not exist.
     *
     * `created_at` is NOT it: that is when the SIRIUS row was created, and on
     * the live board it stamps 289 of the rows with 2026-08-12, the day the
     * board was onboarded — an ordering that looks plausible and is a
     * meaningless tie for the bulk of the table. ARES carries the card's own
     * creation instant on every card (verified 100/100 sampled, spanning 13
     * distinct days), so the sync now stores it.
     *
     * This migration only creates the INDEX. There is no backfill to write:
     * the value comes from ARES, so the next full sync populates every card
     * as a side effect of reading it. Until then a row has no value and sorts
     * LAST, which is the same rule every other empty follows (owl #62).
     */
    id: '008-trello-created-at',
    up: async (conn) => {
      const db = conn.db;
      if (!db) throw new Error('no database on connection');
      await db
        .collection('deliverables')
        .createIndex({ project_id: 1, trello_created_at: -1 }, { name: 'project_filed_desc' });
    },
  },
  {
    /**
     * owl #72 — the scheduled unit becomes the WORK CARD. `sprint_items` is a
     * new, empty collection: the PM's hand-placed rows.
     *
     * THERE IS NO BACKFILL, and that is the ruling rather than an omission.
     * The obvious migration — turn every `deliverables.slotted_week` into two
     * sprint items, sketch and render — would auto-populate the schedule on
     * day one, and #72 §2 forbids exactly that: "work cards enter only when
     * the PM adds them", an empty schedule is the correct starting state, and
     * a row that is absent is not a sync failure. Backfilling would also have
     * to invent a render start, which BR-1a hands to the PM.
     *
     * `slotted_week` stays on `deliverables` and is untouched. The Pipeline
     * gantt still reads it; only Sprint Schedules moves off it.
     */
    id: '009-sprint-items',
    up: async () => {
      /* `syncIndexes` off the schema, not hand-written `createIndex` calls:
         the indexes are declared on `sprintItemSchema` and this applies THAT,
         so there is one definition rather than two that can disagree. Writing
         them out here also collided with 001 on an existing database — 001
         syncs every model in ALL_MODELS, so it had already created the same
         keys under mongoose's own names. */
      await SprintItem.createCollection();
      await SprintItem.syncIndexes();
    },
  },
];

/** Applies pending migrations in order; records each in `migrations`. */
export async function runMigrations(conn: Connection): Promise<string[]> {
  const db = conn.db;
  if (!db) throw new Error('no database on connection');
  const appliedDocs = await db.collection('migrations').find().toArray();
  const applied = new Set(appliedDocs.map((d) => d.id as string));
  const ran: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await m.up(conn);
    await db.collection('migrations').insertOne({ id: m.id, at: new Date() });
    ran.push(m.id);
  }
  return ran;
}
