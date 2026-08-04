/**
 * T083/T084 — the worker half of the push channel (FR-9.4–9.6): pending
 * events become targeted ARES reads and ownership-safe reconciles;
 * board.resync runs a full sync; the poll policy relaxes to hourly while
 * push is healthy and reverts (with ONE alert) when the channel goes silent.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { drainPushEvents, reconcileCard, shouldRunFullSync } from '../worker/drainPush.ts';
import type { AresClient, AresCard } from '../src/services/ares.ts';
import { validateEnv } from '../src/config/env.ts';
import { Deliverable, Project, PushEvent, SyncRun } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

const env = validateEnv({ NODE_ENV: 'test', ARES_WEBHOOK_SECRET: 's3cret', ARES_URL: 'http://ares.test', ARES_API_KEY: 'k' });
const envNoPush = validateEnv({ NODE_ENV: 'test' });

const label = (name: string) => ({ id: `l-${name}`, name });

function aresCard(over: Partial<AresCard> = {}): AresCard {
  return {
    cardId: 'c9',
    boardId: 'b1',
    name: 'MC-9 Poster',
    currentList: 'Design',
    labels: [label('Main Card'), label('Urgent')],
    due: '2026-08-22T09:00:00.000Z',
    ...over,
  } as AresCard;
}

const stubClient = (over: Partial<Record<'card' | 'boardCards', unknown>> = {}): AresClient =>
  ({
    card: async () => aresCard(),
    boardCards: async () => [aresCard()],
    boardMovements: async () => [],
    referenceWeeks: async () => ({ least: null, typical: null, most: null, effectiveWeeklyRate: null }),
    ...over,
  }) as unknown as AresClient;

async function makeProject(over: Record<string, unknown> = {}) {
  return Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'b1', weekly_capacity: 3, ...over });
}

const pushEvent = (projectId: Types.ObjectId, over: Record<string, unknown> = {}) => ({
  project_id: projectId,
  event_id: `evt-${Math.floor(Math.random() * 1e9)}`,
  type: 'card.changed',
  board_id: 'b1',
  card_id: 'c9',
  occurred_at: new Date(),
  ...over,
});

describe('drainPushEvents — notification, then read (FR-9.4)', () => {
  it('a card.changed event becomes a targeted read + reconcile; the event completes; the run is logged', async () => {
    const project = await makeProject();
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-a' }));
    await drainPushEvents(env, stubClient());

    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c9' });
    expect(doc?.urgency).toBe('Urgent');
    expect(doc?.trello_due).toBe('2026-08-22');
    expect((await PushEvent.findOne({ event_id: 'evt-a' }))?.status).toBe('done');
    const run = await SyncRun.findOne({ project_id: project._id, source: 'ares_push', ok: true });
    expect(run?.stats).toMatchObject({ events: 1, cards: 1, deliverable: 1 });
  });

  it('many events for one card coalesce into a single read', async () => {
    const project = await makeProject();
    let reads = 0;
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-1' }));
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-2' }));
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-3' }));
    await drainPushEvents(env, stubClient({ card: async () => (reads++, aresCard()) }));
    expect(reads).toBe(1);
    expect(await PushEvent.countDocuments({ status: 'done' })).toBe(3);
  });

  it('board.resync runs the full board sync instead of per-card reads', async () => {
    const project = await makeProject();
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-r', type: 'board.resync', card_id: null }));
    await drainPushEvents(env, stubClient());
    expect(await Deliverable.countDocuments({ project_id: project._id, trello_card_id: 'c9' })).toBe(1);
    const run = await SyncRun.findOne({ project_id: project._id, source: 'ares_push', ok: true });
    expect(run?.stats).toMatchObject({ resync: 1 });
  });

  it('a failing ARES read marks events failed and logs the failure — last good data stays', async () => {
    const project = await makeProject();
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-f' }));
    await drainPushEvents(env, stubClient({ card: async () => { throw new Error('Ares HTTP 500'); } }));
    expect((await PushEvent.findOne({ event_id: 'evt-f' }))?.status).toBe('failed');
    expect(await SyncRun.countDocuments({ project_id: project._id, source: 'ares_push', ok: false })).toBe(1);
  });
});

describe('reconcileCard edges (FR-9.5)', () => {
  it('a card that lost the project label is descoped: inactive, never deleted', async () => {
    const project = await makeProject({ trello_label: 'ProjectX' });
    await Deliverable.create({
      project_id: project._id, mc_number: 'MC-9', display_id: 'MC-9', trello_card_id: 'c9', name: 'Poster',
    });
    const outcome = await reconcileCard(
      stubClient({ card: async () => aresCard({ labels: [label('Main Card')] }) }), // no ProjectX label
      project,
      'c9',
    );
    expect(outcome).toBe('descoped');
    expect((await Deliverable.findOne({ trello_card_id: 'c9' }))?.active).toBe(false);
  });

  it('a card ARES no longer knows is left to the full board sync', async () => {
    const project = await makeProject();
    const outcome = await reconcileCard(stubClient({ card: async () => null }), project, 'gone');
    expect(outcome).toBe('missing');
  });
});

describe('shouldRunFullSync — the poll fallback policy (FR-9.6)', () => {
  it('push not configured, or configured but never seen: poll as always', async () => {
    const project = await makeProject();
    expect(await shouldRunFullSync(envNoPush, project._id)).toBe(true);
    expect(await shouldRunFullSync(env, project._id)).toBe(true);
  });

  it('healthy push + fresh full sync: skip; healthy push + stale full sync: hourly reconcile runs', async () => {
    const project = await makeProject();
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-h' })); // received_at = now
    await SyncRun.create({ project_id: project._id, source: 'ares', ok: true, at: new Date() });
    expect(await shouldRunFullSync(env, project._id)).toBe(false);

    await SyncRun.updateMany({ source: 'ares' }, { $set: { at: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    expect(await shouldRunFullSync(env, project._id)).toBe(true);
  });

  it('silent channel: reverts to polling and alerts exactly ONCE per silence period', async () => {
    const project = await makeProject();
    await PushEvent.create(pushEvent(project._id, {
      event_id: 'evt-old',
      received_at: new Date(Date.now() - 45 * 60 * 1000), // silent 45 min
    }));
    expect(await shouldRunFullSync(env, project._id)).toBe(true);
    expect(await shouldRunFullSync(env, project._id)).toBe(true);
    const alerts = await SyncRun.find({ project_id: project._id, source: 'ares_push', ok: false });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.error).toMatch(/push silent/);
  });
});
