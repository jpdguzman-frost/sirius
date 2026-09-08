/**
 * Migration 011 — `archive-conflict-acknowledgements` (owl #87, JP,
 * 2026-09-08). Acknowledgements are retired; JP's word on the stored rows is
 * "archived, not dropped", so this proves the archive exists, that it carries
 * the documents unchanged, and that NOTHING is ever deleted — including on a
 * second pass over a database that has already been archived.
 *
 * Own MongoMemoryServer rather than `test/helpers/db.ts`: `startTestDb()` runs
 * the migrations the moment it connects, and the interesting case is a
 * database that ALREADY HOLDS acknowledgements when the runner reaches 011.
 * Isolated db per test/CLAUDE.md rule 7.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { MIGRATIONS, runMigrations } from '../scripts/migrate/migrations.ts';

const SOURCE = 'conflict_acknowledgements';
const ARCHIVE = 'conflict_acknowledgements_archive';

let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri('migration-011'));
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

afterEach(async () => {
  await mongoose.connection.db!.dropDatabase();
});

/** The migration under test, taken from the shipped list by id — never a copy. */
const migration011 = MIGRATIONS.find((m) => m.id === '011-archive-conflict-acknowledgements')!;

async function names(): Promise<string[]> {
  return (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name);
}

async function seedAcks(rows = 2): Promise<void> {
  await mongoose.connection.db!.collection(SOURCE).insertMany(
    Array.from({ length: rows }, (_, i) => ({
      project_id: new mongoose.Types.ObjectId(),
      conflict_key: `2026-08-1${i}|urgent-overlap|120|c${i}:render`,
      acknowledged_by: 'pm@frostdesigngroup.com',
      at: new Date(),
    })),
  );
}

describe('011-archive-conflict-acknowledgements', () => {
  it('is the last migration, numbered in sequence after 010', () => {
    expect(MIGRATIONS.at(-1)!.id).toBe('011-archive-conflict-acknowledgements');
    expect(MIGRATIONS.at(-2)!.id).toBe('010-freeze-model');
  });

  it('renames the collection, keeping every stored acknowledgement', async () => {
    await seedAcks(2);
    const before = await mongoose.connection.db!.collection(SOURCE).find({}).sort({ conflict_key: 1 }).toArray();

    await migration011.up(mongoose.connection);

    expect(await names()).toContain(ARCHIVE);
    expect(await names()).not.toContain(SOURCE);
    const after = await mongoose.connection.db!.collection(ARCHIVE).find({}).sort({ conflict_key: 1 }).toArray();
    expect(after).toEqual(before); // same _ids, same keys, same actors — a rename, not a rewrite
  });

  it('is idempotent: a second and third pass change nothing and drop nothing', async () => {
    await seedAcks(3);
    await migration011.up(mongoose.connection);
    const archived = await mongoose.connection.db!.collection(ARCHIVE).find({}).sort({ conflict_key: 1 }).toArray();

    await migration011.up(mongoose.connection);
    await migration011.up(mongoose.connection);

    expect(await mongoose.connection.db!.collection(ARCHIVE).find({}).sort({ conflict_key: 1 }).toArray()).toEqual(archived);
    expect(await names()).not.toContain(SOURCE);
  });

  it('no-ops on a database that never had acknowledgements', async () => {
    await migration011.up(mongoose.connection);
    expect(await names()).not.toContain(ARCHIVE); // an empty archive is not created
    expect(await names()).not.toContain(SOURCE);
  });

  /* The one branch that must NEVER destroy anything: both names present. A
     copy-then-drop, or a rename with dropTarget, would delete one of the two
     sets of rows. This leaves both for a human to reconcile. */
  it('leaves BOTH alone when an archive already exists — it never drops', async () => {
    await seedAcks(1);
    await mongoose.connection.db!.collection(ARCHIVE).insertOne({ conflict_key: 'archived-earlier' });

    await migration011.up(mongoose.connection);

    expect(await mongoose.connection.db!.collection(SOURCE).countDocuments()).toBe(1);
    expect(await mongoose.connection.db!.collection(ARCHIVE).countDocuments()).toBe(1);
    expect(await mongoose.connection.db!.collection(ARCHIVE).findOne({})).toMatchObject({ conflict_key: 'archived-earlier' });
  });

  it('runs from the runner, once, and is recorded in the ledger', async () => {
    await seedAcks(1);
    const first = await runMigrations(mongoose.connection);
    expect(first).toContain('011-archive-conflict-acknowledgements');
    expect(await names()).toContain(ARCHIVE);
    expect(await names()).not.toContain(SOURCE);

    const second = await runMigrations(mongoose.connection);
    expect(second).toEqual([]); // ledger, so it does not run twice
    expect(await mongoose.connection.db!.collection(ARCHIVE).countDocuments()).toBe(1);
  });

  /* 001 syncs every model in ALL_MODELS, and ConflictAcknowledgement left that
     list with this change — so a database created today never grows the
     collection at all and 011 has nothing to move. This is the assertion that
     fails if the model is put back. */
  it('a fresh database never creates the collection in the first place', async () => {
    await runMigrations(mongoose.connection);
    expect(await names()).not.toContain(SOURCE);
    expect(await names()).not.toContain(ARCHIVE);
  });

  /* Migration 007 lifts legacy 3-part keys to 4-part ones, and its two helpers
     used to be imported from `src/services/conflicts.ts`, which is deleted.
     They are inlined verbatim now, so 007 must still do exactly this. */
  it('007 still upgrades a legacy key after its helpers were inlined', async () => {
    const projectId = new mongoose.Types.ObjectId();
    await mongoose.connection.db!.collection('projects').insertOne({ _id: projectId, weekly_capacity: 50 });
    await mongoose.connection.db!.collection(SOURCE).insertMany([
      { project_id: projectId, conflict_key: '2026-08-17|urgent-overlap|c1:render,c2:render', acknowledged_by: 'pm@frostdesigngroup.com' },
      { project_id: projectId, conflict_key: '2026-08-24|over-capacity|50|c3:sketch', acknowledged_by: 'pm@frostdesigngroup.com' },
    ]);

    await runMigrations(mongoose.connection); // 007 then 011, in order

    const rows = await mongoose.connection.db!.collection(ARCHIVE).find({}).sort({ conflict_key: 1 }).toArray();
    expect(rows.map((r) => r.conflict_key)).toEqual([
      '2026-08-17|urgent-overlap|50|c1:render,c2:render', // lifted to the project's capacity
      '2026-08-24|over-capacity|50|c3:sketch', // already amended — untouched
    ]);
  });
});
