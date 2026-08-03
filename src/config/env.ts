/**
 * Environment validation — fail fast in production, permissive in dev/test
 * so the empty shell boots without infrastructure.
 *
 * Secrets live here and nowhere else: server-side env only, never the repo,
 * never the client bundle, never logs (invariant 15).
 */

import { z } from 'zod';

const base = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.string().optional(),

  MONGODB_URI: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SESSION_SECRET: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ALLOWED_HD: z.string().default('frostdesigngroup.com'),

  ARES_URL: z.string().optional(),
  ARES_API_KEY: z.string().optional(),

  TRELLO_API_KEY: z.string().optional(),
  // Canonical name matches ARES's convention; TRELLO_WRITE_TOKEN accepted as
  // a fallback so older env files keep working.
  TRELLO_TOKEN: z.string().optional(),
  TRELLO_WRITE_TOKEN: z.string().optional(),

  GOOGLE_SHEETS_CREDENTIALS: z.string().optional(),
  INTAKE_SHEET_IDS: z.string().optional(),

  APP_BASE_URL: z.string().optional(),

  // Dev-only auto-login (email). Honoured EXCLUSIVELY when NODE_ENV=development;
  // the allow-list check still applies. Never set outside a laptop.
  DEV_AUTOLOGIN: z.string().optional(),

  // Invariant 17 guardrail: comma-separated production Trello board ids.
  // Outside production, any configured board matching this list refuses to run.
  PROD_TRELLO_BOARD_IDS: z.string().optional(),
});

/** Keys that must be present before production will boot. */
const REQUIRED_IN_PRODUCTION = [
  'MONGODB_URI',
  'REDIS_URL',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'ARES_URL',
  'ARES_API_KEY',
] as const;

export type Env = z.infer<typeof base>;

export function validateEnv(raw: NodeJS.ProcessEnv): Env {
  const env = base.parse(raw);
  if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
    const missing = REQUIRED_IN_PRODUCTION.filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(`[sirius] missing required env in ${env.NODE_ENV}: ${missing.join(', ')}`);
    }
  }
  return env;
}
