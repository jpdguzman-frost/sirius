/**
 * T082 — ARES push receiver (FR-9.4; NFR-6; contracts/ares-push.md):
 * HMAC over "<timestamp>.<raw body>", ±5 min window, constant-time compare,
 * event_id dedupe, unknown-board drop, 401 leaks nothing — and NO sync work
 * in-request: events land as `pending`, deliverables untouched.
 */

import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { Deliverable, Project, PushEvent } from '../src/models/index.ts';

const SECRET = 'test-webhook-secret';

beforeAll(async () => {
  await startTestDb();
  await PushEvent.init(); // unique event_id index must exist before insertMany dedupe
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

function makeAppWithSecret(secret?: string) {
  const env = validateEnv({ NODE_ENV: 'test', ...(secret ? { ARES_WEBHOOK_SECRET: secret } : {}) });
  return createApp({ env, redis: null, mongo: null, trello: null });
}

const sign = (secret: string, timestamp: string, body: string) =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

function envelope(events: Array<Record<string, unknown>>) {
  return JSON.stringify({ delivery_id: 'd-1', sent_at: new Date().toISOString(), events });
}

const event = (over: Record<string, unknown> = {}) => ({
  event_id: 'evt-1',
  type: 'card.changed',
  board_id: 'b1',
  card_id: 'c1',
  occurred_at: new Date().toISOString(),
  ...over,
});

function deliver(app: ReturnType<typeof createApp>, body: string, headers: Record<string, string> = {}) {
  const timestamp = headers['X-Ares-Timestamp'] ?? new Date().toISOString();
  const signature = headers['X-Ares-Signature'] ?? sign(SECRET, timestamp, body);
  return request(app)
    .post('/api/webhooks/ares')
    .set('Content-Type', 'application/json')
    .set('X-Ares-Timestamp', timestamp)
    .set('X-Ares-Signature', signature)
    .set('X-Ares-Delivery', 'd-1')
    .send(body);
}

describe('the push receiver (FR-9.4)', () => {
  it('accepts a signed delivery, persists pending events, and does NO sync work in-request', async () => {
    await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'b1', weekly_capacity: 3 });
    const app = makeAppWithSecret(SECRET);
    const res = await deliver(app, envelope([event()]));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: 1, duplicates: 0, ignored: 0 });

    const doc = await PushEvent.findOne({ event_id: 'evt-1' });
    expect(doc?.status).toBe('pending'); // the WORKER drains — not the request
    expect(doc?.project_id).toBeTruthy(); // invariant 1
    expect(await Deliverable.countDocuments({})).toBe(0); // nothing reconciled here
  });

  it('dedupes on event_id across deliveries (at-least-once is safe)', async () => {
    await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'b1', weekly_capacity: 3 });
    const app = makeAppWithSecret(SECRET);
    await deliver(app, envelope([event()])).expect(202);
    const res = await deliver(app, envelope([event()])).expect(202);
    expect(res.body).toEqual({ accepted: 0, duplicates: 1, ignored: 0 });
    expect(await PushEvent.countDocuments({})).toBe(1);
  });

  it('acknowledges and drops events for boards no active project owns', async () => {
    const app = makeAppWithSecret(SECRET);
    const res = await deliver(app, envelope([event({ board_id: 'not-ours' })])).expect(202);
    expect(res.body).toEqual({ accepted: 0, duplicates: 0, ignored: 1 });
    expect(await PushEvent.countDocuments({})).toBe(0);
  });

  it('401 with an EMPTY body on a bad signature — nothing leaks', async () => {
    const app = makeAppWithSecret(SECRET);
    const body = envelope([event()]);
    const res = await deliver(app, body, { 'X-Ares-Signature': 'sha256=' + 'ab'.repeat(32) });
    expect(res.status).toBe(401);
    expect(res.text).toBe('');
  });

  it('401 on a tampered body (signature was for different content)', async () => {
    const app = makeAppWithSecret(SECRET);
    const timestamp = new Date().toISOString();
    const res = await deliver(app, envelope([event({ card_id: 'tampered' })]), {
      'X-Ares-Timestamp': timestamp,
      'X-Ares-Signature': sign(SECRET, timestamp, envelope([event()])),
    });
    expect(res.status).toBe(401);
  });

  it('401 outside the ±5 min timestamp window (replay protection)', async () => {
    const app = makeAppWithSecret(SECRET);
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const body = envelope([event()]);
    const res = await deliver(app, body, { 'X-Ares-Timestamp': stale, 'X-Ares-Signature': sign(SECRET, stale, body) });
    expect(res.status).toBe(401);
  });

  it('401 when headers are missing entirely', async () => {
    const app = makeAppWithSecret(SECRET);
    const res = await request(app).post('/api/webhooks/ares').set('Content-Type', 'application/json').send(envelope([event()]));
    expect(res.status).toBe(401);
  });

  it('503 when the secret is not configured — push disabled, poll carries everything', async () => {
    const app = makeAppWithSecret(undefined);
    const res = await deliver(app, envelope([event()]));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PUSH_NOT_CONFIGURED');
  });

  it('400 INVALID_BODY on a signed but malformed envelope', async () => {
    const app = makeAppWithSecret(SECRET);
    const res = await deliver(app, JSON.stringify({ nope: true }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });
});
