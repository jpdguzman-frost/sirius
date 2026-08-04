/**
 * Redis connection — sessions (connect-redis) and caching.
 * Client is node-redis (the `redis` package): connect-redis v9 speaks its
 * command signature exclusively — ioredis got `ERR syntax error` on every
 * session write (found live at G5 first sign-in).
 * In dev/test with no REDIS_URL the shell boots with an in-memory session
 * store (never acceptable in staging/production — env validation enforces).
 */

import { createClient } from 'redis';
import type { Env } from '../config/env.ts';

export type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;

export async function connectRedis(env: Env): Promise<RedisClient | null> {
  if (!env.REDIS_URL) {
    if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
      throw new Error('[sirius] REDIS_URL is required');
    }
    console.warn('[sirius] no REDIS_URL — using in-memory sessions (dev shell only)');
    return null;
  }
  client = createClient({ url: env.REDIS_URL });
  // node-redis emits 'error' events; unhandled they crash the process
  client.on('error', (err) => console.error('[sirius] redis error:', (err as Error).message));
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
