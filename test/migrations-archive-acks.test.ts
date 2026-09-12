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

/* Vitest's DEFAULT budget is five seconds a test and ten a hook, and this file
   is the one suite that cannot live inside it. Every case here runs the whole
   migration list against a real in-memory server and drops the database again
   afterwards, while eighty-three other files compete for the machine. Under
   that load a case would blow the five seconds and abort MID-FLIGHT, and the
   half-torn-down database it left behind then failed a LATER case in this file
   — which is why a different test went red each run while the suite passed
   alone and passed on the re-run every time (state-log 2026-09-12).

   This is a REALISTIC budget for the work, not a retry and not a mask: a case
   that genuinely hangs still fails, a minute later. If these ever approach a
   minute the answer is to look at why, not to raise this again. */
const DB_MS = 60_000;

let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri('migration-011'));
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
}, DB_MS);

afterEach(async () => {
  await mongoose.connection.db!.dropDatabase();
}, DB_MS);

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

describe('011-archive-conflict-acknowledgements', { timeout: DB_MS }, () => {
  /* Ordering asserted RELATIVELY, not as a position pin: `.at(-1)` said "011 is
     last", which is a snapshot of the list rather than the rule (test/CLAUDE.md
     rule 1) and made every later migration a red. The rule is that 011 runs
     directly after 010 — 011 archives rows 010 has already stopped anything
     from reading. */
  it('is numbered in sequence, directly after 010', () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids.indexOf('011-archive-conflict-acknowledgements')).toBe(ids.indexOf('010-freeze-model') + 1);
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

/**
 * T179 (2026-09-10) — `work_cards.labels` is new and required, and mongoose
 * does not backfill a default onto STORED documents. 012 makes the state
 * explicit on rows written before the field existed.
 */
describe('012-work-card-labels', { timeout: DB_MS }, () => {
  const migration012 = MIGRATIONS.find((m) => m.id === '012-work-card-labels')!;
  const workCards = () => mongoose.connection.db!.collection('work_cards');

  it('is numbered in sequence, directly after 011', () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids.indexOf('012-work-card-labels')).toBe(
      ids.indexOf('011-archive-conflict-acknowledgements') + 1,
    );
  });

  it('backfills an empty array onto every row missing the field, and nothing else', async () => {
    const projectId = new mongoose.Types.ObjectId();
    await workCards().insertMany([
      { project_id: projectId, trello_card_id: 'old-1', mc_number: 'MC-1', name: 'a' },
      { project_id: projectId, trello_card_id: 'old-2', mc_number: 'MC-1', name: 'b' },
      { project_id: projectId, trello_card_id: 'new-1', mc_number: 'MC-2', name: 'c', labels: ['Asset: Icons'] },
    ]);

    await migration012.up(mongoose.connection);

    const rows = await workCards().find({}).sort({ trello_card_id: 1 }).toArray();
    expect(rows.map((r) => [r.trello_card_id, r.labels])).toEqual([
      ['new-1', ['Asset: Icons']], // a row that already has labels is NEVER reset to []
      ['old-1', []],
      ['old-2', []],
    ]);
  });

  it('is idempotent — a second pass matches nothing and rewrites nothing', async () => {
    const projectId = new mongoose.Types.ObjectId();
    await workCards().insertOne({ project_id: projectId, trello_card_id: 'w1', mc_number: 'MC-1', name: 'a' });

    await migration012.up(mongoose.connection);
    // labels arrive from the next sync, between the two passes
    await workCards().updateOne({ trello_card_id: 'w1' }, { $set: { labels: ['Ops: Board Management'] } });
    await migration012.up(mongoose.connection);

    expect((await workCards().findOne({ trello_card_id: 'w1' }))!.labels).toEqual([
      'Ops: Board Management',
    ]);
  });

  it('runs from the runner once and is recorded in the ledger', async () => {
    const projectId = new mongoose.Types.ObjectId();
    await workCards().insertOne({ project_id: projectId, trello_card_id: 'w1', mc_number: 'MC-1', name: 'a' });

    const first = await runMigrations(mongoose.connection);
    expect(first).toContain('012-work-card-labels');
    expect((await workCards().findOne({ trello_card_id: 'w1' }))!.labels).toEqual([]);

    expect(await runMigrations(mongoose.connection)).toEqual([]);
  });
});
