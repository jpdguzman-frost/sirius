/**
 * Mongo connection — shared ARES Mongo server, Sirius's own `sirius` database.
 * In dev/test with no MONGODB_URI the shell boots without a database;
 * anything needing persistence fails loudly instead of silently.
 */

import mongoose from 'mongoose';
import type { Env } from '../config/env.ts';

let connected = false;

export async function connectMongo(env: Env): Promise<typeof mongoose | null> {
  if (!env.MONGODB_URI) {
    if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
      throw new Error('[sirius] MONGODB_URI is required');
    }
    console.warn('[sirius] no MONGODB_URI — booting without a database (dev shell only)');
    return null;
  }
  await mongoose.connect(env.MONGODB_URI);
  connected = true;
  return mongoose;
}

export function mongoState(): 'connected' | 'absent' {
  return connected ? 'connected' : 'absent';
}

export async function disconnectMongo(): Promise<void> {
  if (connected) {
    await mongoose.disconnect();
    connected = false;
  }
}
