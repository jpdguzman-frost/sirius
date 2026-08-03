/**
 * Test database helper — real mongod via mongodb-memory-server so unique
 * indexes and the deliverables_v view behave exactly as production.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { runMigrations } from '../../scripts/migrate/migrations.ts';

let server: MongoMemoryServer | null = null;

export async function startTestDb(): Promise<typeof mongoose> {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri('sirius-test'));
  await runMigrations(mongoose.connection);
  return mongoose;
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (server) {
    await server.stop();
    server = null;
  }
}

export async function clearCollections(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.listCollections({ type: 'collection' }).toArray();
  for (const c of collections) {
    if (c.name === 'migrations' || c.name.startsWith('system.')) continue;
    await db.collection(c.name).deleteMany({});
  }
}
