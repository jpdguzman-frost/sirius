/**
 * Redis connection — sessions (connect-redis) and caching.
 * In dev/test with no REDIS_URL the shell boots with an in-memory session
 * store (never acceptable in staging/production — env validation enforces).
 */

import { Redis } from 'ioredis';
import type { Env } from '../config/env.ts';

let client: Redis | null = null;

export async function connectRedis(env: Env): Promise<Redis | null> {
  if (!env.REDIS_URL) {
    if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
      throw new Error('[sirius] REDIS_URL is required');
    }
    console.warn('[sirius] no REDIS_URL — using in-memory sessions (dev shell only)');
    return null;
  }
  client = new Redis(env.REDIS_URL, { lazyConnect: true });
  await client.connect();
  return client;
}

export function redisState(): 'connected' | 'absent' {
  return client ? 'connected' : 'absent';
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
