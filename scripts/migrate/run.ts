/**
 * Migration CLI — `npm run migrate`. Requires MONGODB_URI.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { runMigrations } from './migrations.ts';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('[migrate] MONGODB_URI is required');
  process.exit(1);
}

await mongoose.connect(uri);
const ran = await runMigrations(mongoose.connection);
console.log(ran.length > 0 ? `[migrate] applied: ${ran.join(', ')}` : '[migrate] up to date');
await mongoose.disconnect();
