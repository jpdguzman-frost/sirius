/**
 * T129 — deep-link return through sign-in (phase 13h, JP-approved 2026-08-15).
 *
 * Before this, a 401 on /rt-test/schedules sent the user to Google and landed
 * them back on the default tab. Now the requested path rides along — which
 * makes the redirect target attacker-influenced, so the interesting assertions
 * here are the REFUSALS: every off-site form must fall back to the app root.
 *
 * Invariant 9 is untouched throughout — `returnTo` only decides where the
 * browser lands. Nothing here grants access to anything.
 *
 * One listening server per mount for the whole file: the refusal matrix is
 * wide, and per-request ephemeral servers flake under the parallel suite.
 */

import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Strategy } from 'passport';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import passport from '../src/auth/passport.ts';
import { User } from '../src/models/index.ts';

const EMAIL = 'pm@frostdesigngroup.com';

/** Every shape that must be refused, with why it exists. */
const HOSTILE: Array<[string, string]> = [
  ['http://evil.example/x', 'absolute url'],
  ['https://evil.example', 'absolute url, https'],
  ['//evil.example', 'protocol-relative'],
  ['/\\evil', 'backslash proto-relative'],
  ['javascript:alert(1)', 'script url'],
  ['/api/projects', 'a server route, not the shell'],
  ['/auth/google', 'a redirect loop'],
  ['/' + 'a'.repeat(200), 'over the length cap'],
];

const open: Server[] = [];
function serve(app: ReturnType<typeof createApp>): Server {
  const server = app.listen(0);
  open.push(server);
  return server;
}

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await Promise.all(open.map((s) => new Promise<void>((done) => s.close(() => done()))));
  await stopTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

describe.each([
  ['domain root', ''],
  ['prefixed mount', '/sirius'],
])('dev auto-login at the %s — no round trip, the path rides the query', (_label, base) => {
  let server: Server;

  beforeAll(() => {
    server = serve(
      createApp({
        env: validateEnv({
          NODE_ENV: 'development',
          DEV_AUTOLOGIN: EMAIL,
          ...(base ? { BASE_PATH: base } : {}),
        }),
        redis: null,
        mongo: null,
        trello: null,
      }),
    );
  });

  beforeEach(async () => {
    await User.create({ email: EMAIL, active: true });
  });

  const login = (returnTo?: string) =>
    request(server).get(
      `${base}/auth/dev${returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`,
    );

  it('lands on the deep link that was asked for', async () => {
    const res = await login('/rt-test/schedules');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${base}/rt-test/schedules`);
  });

  it('honours the shorter accepted forms too', async () => {
    for (const asked of ['/rt-test', '/schedules', '/']) {
      const res = await login(asked);
      expect(res.headers.location, `returnTo=${asked}`).toBe(`${base}${asked}`);
    }
  });

  it('falls back to the app root when no path was asked for', async () => {
    const res = await login();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${base}/`);
  });

  it('refuses every off-site and non-shell target, landing on the app root', async () => {
    for (const [value, why] of HOSTILE) {
      const res = await login(value);
      expect(res.status, `${value} — ${why}`).toBe(302);
      // Same-origin by construction: the redirect is always base + a
      // whitelisted in-app path, so it can never leave the site.
      expect(res.headers.location, `${value} — ${why}`).toBe(`${base}/`);
    }
  });

  it('never emits an absolute URL, even for a value that survives validation', async () => {
    const res = await login('/rt-test/forecast');
    expect(res.headers.location!.startsWith('/')).toBe(true);
    expect(res.headers.location).not.toMatch(/^https?:|^\/\//);
  });
});

describe('Google SSO — the target rides the session across the round trip', () => {
  let server: Server;

  beforeAll(() => {
    server = serve(
      createApp({
        env: validateEnv({
          NODE_ENV: 'test',
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
        }),
        redis: null,
        mongo: null,
        trello: null,
      }),
    );
  });

  it('persists a valid target before redirecting to Google', async () => {
    const res = await request(server).get(`/auth/google?returnTo=${encodeURIComponent('/rt-test/schedules')}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\//);
    // A session cookie on the way OUT is the proof the value was stored — with
    // saveUninitialized:false, nothing else on this route writes to the session.
    expect(String(res.headers['set-cookie'])).toMatch(/connect\.sid/);
  });

  it('stores NOTHING for a hostile target — no session is created at all', async () => {
    for (const [value, why] of HOSTILE) {
      const res = await request(server).get(`/auth/google?returnTo=${encodeURIComponent(value)}`);
      expect(res.status, `${value} — ${why}`).toBe(302);
      expect(res.headers.location, `${value} — ${why}`).toMatch(/^https:\/\/accounts\.google\.com\//);
      expect(res.headers['set-cookie'], `${value} — ${why}`).toBeUndefined();
    }
  });

  /**
   * The callback is the only reader of session.returnTo, and it is unreachable
   * without Google. Swapping in a stub strategy is what makes the consume-once
   * branch testable at all — so this runs LAST in the file: from here on the
   * shared passport instance no longer holds the real Google strategy.
   *
   * It also pins the reason the value is read BEFORE req.logIn: passport
   * regenerates the session on login (session-fixation guard), so a read inside
   * the logIn callback finds nothing and every deep link would silently land on
   * the default tab.
   */
  it('consumes the target exactly once, then falls back to the root', async () => {
    const user = await User.create({ email: EMAIL, active: true });
    const agent = request.agent(server);

    const start = await agent.get(`/auth/google?returnTo=${encodeURIComponent('/rt-test/deadlines')}`);
    expect(start.headers.location).toMatch(/^https:\/\/accounts\.google\.com\//);

    passport.use({
      name: 'google',
      authenticate(this: { success: (u: unknown) => void }) {
        this.success({ userId: String(user._id), email: user.email });
      },
    } as unknown as Strategy);

    const first = await agent.get('/auth/google/callback');
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe('/rt-test/deadlines');

    // Single-use: the same session replayed has nothing left to return to.
    const replay = await agent.get('/auth/google/callback');
    expect(replay.status).toBe(302);
    expect(replay.headers.location).toBe('/');
  });
});
