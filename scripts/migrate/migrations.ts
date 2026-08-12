/**
 * Migrations — version-controlled from the first line, applied in order,
 * recorded in the `migrations` collection. Never applied by hand against
 * production (constitution: no schema/index changes by hand).
 *
 * Run via `npm run migrate` (scripts/migrate/run.ts) or from tests.
 */

import type { Connection } from 'mongoose';
import { ALL_MODELS } from '../../src/models/index.ts';

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
