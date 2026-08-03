import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';

const env = validateEnv({ NODE_ENV: 'test' });

describe('app shell', () => {
  const app = createApp({ env, redis: null, mongo: null });

  it('answers /healthz with component states', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.mongo).toBe('absent');
    expect(res.body.redis).toBe('absent');
  });

  it('answers unknown /api paths with JSON 404, not HTML', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('env validation', () => {
  it('is permissive in development', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('fails fast in production when required keys are missing', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/missing required env/);
  });
});
