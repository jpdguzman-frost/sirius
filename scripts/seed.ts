/**
 * Seed — fixtures ONLY, never a production dump (invariant 16). Real briefs
 * never touch a developer laptop. Refuses to run in production.
 *
 * Fixture shape exercises the cases the ACs need:
 *  - two projects, one sharing a Trello board disambiguated by label (AC-4, AC-5)
 *  - a multi-deliverable MC group (invariant 3) with work cards attached to
 *    the group (invariant 4)
 *  - sprints with a gap between them (BR-5)
 *  - one row slotted INTO that gap, so the planner's "Outside any sprint"
 *    block (R5, invariant 12) is reachable without hand-editing a database
 *  - a late Hard row (renderOverdue) and rows with / without requestor+type,
 *    so every planner badge and phase colour has a live example
 *  - a CSV intake fixture consumed by the phase-5 sheet-sync tests
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import {
  Project,
  Sprint,
  User,
  UserProject,
  Deliverable,
  WorkCard,
} from '../src/models/index.ts';
import { runMigrations } from './migrate/migrations.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function seedDatabase(): Promise<{ projects: number; deliverables: number }> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] refusing to seed production (invariant 16)');
  }

  const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'seed.json'), 'utf8'),
  );

  await Promise.all([
    Project.deleteMany({}),
    Sprint.deleteMany({}),
    User.deleteMany({}),
    UserProject.deleteMany({}),
    Deliverable.deleteMany({}),
    WorkCard.deleteMany({}),
  ]);

  const projectIds = new Map<string, mongoose.Types.ObjectId>();
  for (const p of fixtures.projects) {
    const doc = await Project.create(p);
    projectIds.set(p.code, doc._id);
  }

  for (const s of fixtures.sprints) {
    await Sprint.create({ ...s, project_id: projectIds.get(s.project) });
  }

  for (const u of fixtures.users) {
    const user = await User.create({ email: u.email, name: u.name });
    for (const code of u.projects) {
      await UserProject.create({ user_id: user._id, project_id: projectIds.get(code) });
    }
  }

  for (const d of fixtures.deliverables) {
    await Deliverable.create({ ...d, project_id: projectIds.get(d.project), project: undefined });
  }

  for (const w of fixtures.work_cards) {
    await WorkCard.create({ ...w, project_id: projectIds.get(w.project), project: undefined });
  }

  return {
    projects: await Project.countDocuments(),
    deliverables: await Deliverable.countDocuments(),
  };
}

// CLI entry — skipped when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[seed] MONGODB_URI is required');
    process.exit(1);
  }
  await mongoose.connect(uri);
  await runMigrations(mongoose.connection);
  const stats = await seedDatabase();
  console.log(`[seed] done — ${stats.projects} projects, ${stats.deliverables} deliverables`);
  await mongoose.disconnect();
}
