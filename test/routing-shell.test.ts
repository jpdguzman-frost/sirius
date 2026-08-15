/**
 * T128 — the shell catch-all and the base stamp over HTTP (phase 13h,
 * JP-approved 2026-08-15).
 *
 * Two things are load-bearing here and both are regression-shaped:
 *
 *  1. The catch-all must never shadow a real route. It is registered last AND
 *     whitelisted, so this runs the whole matrix against both layers.
 *  2. The shell must NEVER be served without its base stamped in. An unstamped
 *     copy sets BASE='' in the browser, which 404s every API call under
 *     BASE_PATH — silent, and only reproducible with the prefix set. So the
 *     entire matrix runs at the domain root AND at /sirius.
 *
 * Each mount is bound to ONE listening server for the whole file rather than a
 * fresh app per request: the matrix is wide, and the suite runs files in
 * parallel, so per-request ephemeral servers are a resource flake waiting to
 * happen.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { ROUTE_TABS } from '../src/routing/paths.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');

const BASES = ['', '/sirius'] as const;
const servers = new Map<string, Server>();
const at = (base: string): Server => servers.get(base)!;

beforeAll(() => {
  // public/ is a build output and is gitignored, so a clean checkout has no
  // shell to serve. Build it once rather than fail with a confusing 500.
  if (!fs.existsSync(path.join(repo, 'public', 'index.html'))) {
    execFileSync('node', ['frontend/build.js'], { cwd: repo, stdio: 'ignore' });
  }
  for (const base of BASES) {
    const app = createApp({
      env: validateEnv(base ? { NODE_ENV: 'test', BASE_PATH: base } : { NODE_ENV: 'test' }),
      redis: null,
      mongo: null,
      trello: null,
    });
    servers.set(base, app.listen(0));
  }
}, 60_000);

afterAll(async () => {
  await Promise.all([...servers.values()].map((s) => new Promise<void>((done) => s.close(() => done()))));
});

describe.each([
  ['domain root', ''],
  ['prefixed mount', '/sirius'],
])('the shell at the %s', (_label, base) => {
  const url = (p: string) => `${base}${p}`;
  const stamp = `window.SIRIUS_BASE=${JSON.stringify(base)}`;

  it('serves a stamped shell for every one of the six tabs', async () => {
    for (const tab of ROUTE_TABS) {
      const res = await request(at(base)).get(url(`/rt-test/${tab}`));
      expect(res.status, `GET ${url(`/rt-test/${tab}`)}`).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain(stamp);
      expect(res.text).toContain('<div id="app">');
    }
  });

  it('serves the same stamped shell for the root, a bare project and a bare tab', async () => {
    for (const p of ['/', '/rt-test', '/schedules', '/zzz', '/zzz/schedules', '/admin']) {
      const res = await request(at(base)).get(url(p));
      expect(res.status, `GET ${url(p)}`).toBe(200);
      expect(res.text).toContain(stamp);
    }
  });

  /**
   * Grepping the body for the bare name `window.SIRIUS_BASE` is a FALSE
   * POSITIVE trap: the inlined 00-api.js source reads `window.SIRIUS_BASE ?? ''`,
   * so an unstamped shell matches it too. Only the injected <script> tag counts.
   */
  const isStamped = (body: string) => body.includes(`<script>${stamp}</script>`);

  it('never hands out an UNSTAMPED shell — every spelling of index.html redirects', async () => {
    // express.static sits in front of the catch-all and percent-decodes and
    // normalizes the path before it looks at disk, so guarding the literal
    // string was not enough: each of these served the raw 224 KB file with no
    // base stamp, i.e. BASE='' in the browser and a dead app under BASE_PATH.
    for (const p of [
      '/index.html',
      '/index%2Ehtml',
      '/index%2ehtml',
      '/%69ndex.html',
      '//index.html',
      '///index.html',
      '/%2findex.html',
      '/%2F%2Findex.html',
      '/%2e%2f%69ndex%2ehtml',
      '/INDEX.HTML',
      '/index.html/',
    ]) {
      const res = await request(at(base)).get(url(p));
      expect(res.status, `GET ${url(p)}`).toBe(302);
      expect(res.headers.location, `GET ${url(p)}`).toBe(`${base}/`);
      expect(isStamped(res.text), `GET ${url(p)} leaked a shell body`).toBe(false);
      expect(res.text.length, `GET ${url(p)} leaked a shell body`).toBeLessThan(1000);
    }
  });

  it('answers 200 ONLY with a stamped shell, never the raw file', async () => {
    for (const p of [
      '/',
      '/rt-test',
      '/rt-test/pipeline',
      '/index.html',
      '/index%2Ehtml',
      '//index.html',
      '/%2findex.html',
      '/favicon.ico',
      '/a/b/c',
    ]) {
      const res = await request(at(base)).get(url(p));
      expect(res.status === 200 && !isStamped(res.text), `GET ${url(p)} answered 200 UNSTAMPED`).toBe(false);
    }
  });

  it('does not shadow /api — unknown API paths still answer JSON 404', async () => {
    const res = await request(at(base)).get(url('/api/nope'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('does not shadow /api even when the path looks exactly like a tab', async () => {
    for (const p of ['/api/pipeline', '/api/admin', '/api/schedules']) {
      const res = await request(at(base)).get(url(p));
      expect(res.status, `GET ${url(p)}`).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('does not shadow auth or healthz', async () => {
    const health = await request(at(base)).get(url('/healthz'));
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const denied = await request(at(base)).get(url('/auth/failed?reason=nope'));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('SIGN_IN_DENIED');

    const projects = await request(at(base)).get(url('/api/projects'));
    expect(projects.status).toBe(401); // the route still owns it, session required
  });

  it('leaves everything outside the whitelist exactly as it was', async () => {
    for (const p of ['/a/b/c', '/favicon.ico', '/Rt-Test', '/rt-test/zzz', '/rt_test']) {
      const res = await request(at(base)).get(url(p));
      expect(res.status, `GET ${url(p)}`).toBe(404);
      expect(res.text).not.toContain('window.SIRIUS_BASE');
    }
  });

  it('answers GET and HEAD only — a POST to a tab path is not the shell', async () => {
    const post = await request(at(base)).post(url('/rt-test/pipeline')).send({});
    expect(post.status).toBe(404);
    expect(post.text).not.toContain('window.SIRIUS_BASE');
  });

  it('marks the shell no-cache so a redeploy is picked up', async () => {
    const res = await request(at(base)).get(url('/rt-test/pipeline'));
    expect(res.headers['cache-control']).toContain('no-cache');
  });
});

describe('the two mounts do not contaminate each other', () => {
  it('stamps each app with its OWN base, though both share one process', async () => {
    const root = await request(at('')).get('/rt-test/pipeline');
    const prefixed = await request(at('/sirius')).get('/sirius/rt-test/pipeline');
    expect(root.text).toContain('window.SIRIUS_BASE=""');
    expect(root.text).not.toContain('window.SIRIUS_BASE="/sirius"');
    expect(prefixed.text).toContain('window.SIRIUS_BASE="/sirius"');
  });

  it('a prefixed mount owns nothing at the domain root', async () => {
    await request(at('/sirius')).get('/rt-test/pipeline').expect(404);
    await request(at('/sirius')).get('/').expect(404);
  });
});
