/**
 * Allow-list a user and grant project membership (FR-2.4; invariant 9).
 * Auth is four checks — the active allow-list row is the fourth; this is the
 * ONLY way rows are created (no self-signup path exists).
 *
 * Usage: EMAIL=jp@frostdesigngroup.com [NAME="JP"] [CODE=rt-test] npx tsx scripts/allowlist.ts
 *        CODE grants membership to that project; omit for allow-list only.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { validateEnv } from '../src/config/env.ts';
import { Project, User, UserProject } from '../src/models/index.ts';

const env = validateEnv(process.env);
const EMAIL = process.env.EMAIL?.toLowerCase();
if (!env.MONGODB_URI || !EMAIL) {
  console.error('[allowlist] MONGODB_URI and EMAIL are required');
  process.exit(1);
}

await mongoose.connect(env.MONGODB_URI);

const user = await User.findOneAndUpdate(
  { email: EMAIL },
  { $set: { active: true, ...(process.env.NAME ? { name: process.env.NAME } : {}) }, $setOnInsert: { email: EMAIL } },
  { upsert: true, new: true },
);
console.log(`[allowlist] ${EMAIL} active`);

if (process.env.CODE) {
  const project = await Project.findOne({ code: process.env.CODE });
  if (!project) {
    console.error(`[allowlist] no project with code ${process.env.CODE}`);
    process.exit(1);
  }
  await UserProject.updateOne(
    { user_id: user._id, project_id: project._id },
    { $setOnInsert: { user_id: user._id, project_id: project._id } },
    { upsert: true },
  );
  console.log(`[allowlist] member of ${process.env.CODE}`);
}
await mongoose.disconnect();
