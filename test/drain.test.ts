/**
 * T083/T084 — the worker half of the push channel (FR-9.4–9.6): pending
 * events become targeted ARES reads and ownership-safe reconciles;
 * board.resync runs a full sync; the poll policy relaxes to hourly while
 * push is healthy and reverts (with ONE alert) when the channel goes silent.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { aresCard as baseAresCard, label } from './helpers/ares-card.ts';
import { drainPushEvents, reconcileCard, shouldRunFullSync } from '../worker/drainPush.ts';
import type { AresClient, AresCard, AresMovement } from '../src/services/ares.ts';
import { validateEnv } from '../src/config/env.ts';
import { CardEvent, Deliverable, Project, PushEvent, SyncRun, WorkCard } from '../src/models/index.ts';

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

/** This suite's card identity, over the contract defaults in `fixtures.ts`. */
const aresCard = (over: Partial<AresCard> = {}): AresCard =>
  baseAresCard({
    cardId: 'c9',
    name: 'MC-9 Poster',
    labels: [label('Main Card'), label('Urgent')],
    due: '2026-08-22T09:00:00.000Z',
    ...over,
  });

const stubClient = (over: Partial<Record<'cardWithMovements' | 'boardCards', unknown>> = {}): AresClient =>
  ({
    cardWithMovements: async () => ({ card: aresCard(), movements: [] as AresMovement[] }),
    boardCards: async () => [aresCard()],
    boardMovements: async () => [],
    referenceWeeks: async () => ({ least: null, typical: null, most: null, effectiveWeeklyRate: null }),
    ...over,
  }) as unknown as AresClient;

/** The push read hands back {card, movements} — the drain needs both halves. */
const pushRead = (card: AresCard | null, movements: AresMovement[] = []) => ({
  cardWithMovements: async () => ({ card, movements }),
});

const movement = (over: Partial<AresMovement> = {}): AresMovement => ({
  cardId: 'c9',
  fromList: 'Production Backlog',
  toList: 'Working on Design',
  detectedAt: '2026-08-04T01:00:00.000Z',
  ...over,
});

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

  it('records an unstamped push reconcile, so the quieter path is not the silent one', async () => {
    /* `worker/syncAres.ts` documents that BOTH callers must consume the
       upserts' return. Only the full sync had a test for it, so deleting the
       drain's `if (outcome.unstamped)` left the suite green while the push
       path lost its only signal (review, 2026-08-25) — and this is the path
       FR-9.6 leaves running at ~37s while the full sync relaxes to hourly, so
       it is the one that would go quiet first and the one that matters. */
    const project = await makeProject();
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-bare' }));
    await drainPushEvents(
      env,
      stubClient(pushRead(aresCard({ lastPolledAt: undefined }))),
    );

    const run = await SyncRun.findOne({ project_id: project._id, source: 'ares_push', ok: true });
    expect(run?.stats, 'the push path swallowed an unstamped reconcile').toMatchObject({ unstamped: 1 });
  });

  it('records nothing when every pushed card carries a stamp — the steady state', async () => {
    const project = await makeProject();
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-ok' }));
    await drainPushEvents(env, stubClient());
    const run = await SyncRun.findOne({ project_id: project._id, source: 'ares_push', ok: true });
    expect((run?.stats as Record<string, unknown>)?.unstamped).toBeUndefined();
  });

  it('many events for one card coalesce into a single read', async () => {
    const project = await makeProject();
    let reads = 0;
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-1' }));
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-2' }));
    await PushEvent.create(pushEvent(project._id, { event_id: 'evt-3' }));
    await drainPushEvents(env, stubClient({
      cardWithMovements: async () => (reads++, { card: aresCard(), movements: [] }),
    }));
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
    await drainPushEvents(env, stubClient({ cardWithMovements: async () => { throw new Error('Ares HTTP 500'); } }));
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
      stubClient(pushRead(aresCard({ labels: [label('Main Card')] }))), // no ProjectX label
      project,
      'c9',
    );
    expect(outcome.kind).toBe('descoped');
    expect((await Deliverable.findOne({ trello_card_id: 'c9' }))?.active).toBe(false);
  });

  it('a card that FLIPPED kind deactivates its twin in the other collection (2026-08-18 review)', async () => {
    /* Removing/adding the Main Card label used to leave the old doc active
       for up to an hour (the full sync's healthy-push cadence), during which
       the same trello_card_id was served — and writable — as both kinds. */
    const project = await Project.create({ code: 'rt-x', name: 'X', trello_board_id: 'b1', weekly_capacity: 3 });
    await Deliverable.create({ project_id: project._id, mc_number: 'MC-9', display_id: 'MC-9', trello_card_id: 'c9', name: 'was a main card', active: true });
    // the card now reads as a TASK (no Main Card label, verb prefix + MC#)
    const client = stubClient({
      cardWithMovements: async () => ({ card: aresCard({ name: 'Render Asset: MC-9 exports', labels: [] }), movements: [] as AresMovement[] }),
    });
    const kind = await reconcileCard(client, (await Project.findById(project._id))!, 'c9');
    expect(kind.kind).toBe('work_card');
    expect((await WorkCard.findOne({ trello_card_id: 'c9' }))?.active).toBe(true);
    expect((await Deliverable.findOne({ trello_card_id: 'c9' }))?.active).toBe(false);

    // and the mirror: it regains the Main Card label
    const back = stubClient({
      cardWithMovements: async () => ({ card: aresCard(), movements: [] as AresMovement[] }),
    });
    expect((await reconcileCard(back, (await Project.findById(project._id))!, 'c9')).kind).toBe('deliverable');
    expect((await Deliverable.findOne({ trello_card_id: 'c9' }))?.active).toBe(true);
    expect((await WorkCard.findOne({ trello_card_id: 'c9' }))?.active).toBe(false);
  });

  it('a malformed due instant degrades to no-due instead of aborting the reconcile (2026-08-18 review)', async () => {
    /* new Date(garbage) is Invalid Date and Mongoose's cast throws — one bad
       ARES string then re-fails the whole loop every tick. It must store as
       null and heal on the next good read. */
    const project = await Project.create({ code: 'rt-y', name: 'Y', trello_board_id: 'b1', weekly_capacity: 3 });
    const client = stubClient({
      cardWithMovements: async () => ({ card: aresCard({ name: 'Render Asset: MC-9 exports', labels: [], due: 'not-a-date' }), movements: [] as AresMovement[] }),
    });
    expect((await reconcileCard(client, (await Project.findById(project._id))!, 'c9')).kind).toBe('work_card');
    const doc = await WorkCard.findOne({ trello_card_id: 'c9' });
    expect(doc?.trello_due ?? null).toBeNull();
    expect(doc?.trello_due_at ?? null).toBeNull();
  });

  it('a card ARES no longer knows is left to the full board sync', async () => {
    const project = await makeProject();
    const outcome = await reconcileCard(stubClient(pushRead(null)), project, 'gone');
    expect(outcome.kind).toBe('missing');
  });
});

/**
 * The push path must be able to MOVE a span, not only clear one: the movement
 * that triggered the push is ingested from the same read, so Started/Done
 * follow the list change immediately instead of waiting up to an hour for the
 * relaxed full sync (FR-9.6).
 */
describe('push-path Started/Done spans (FR-9.4 + the 2026-08-13 span spec)', () => {
  const drainOne = async (card: AresCard, movements: AresMovement[], projectId: Types.ObjectId) => {
    await PushEvent.create(pushEvent(projectId, { event_id: `evt-${Math.random()}` }));
    await drainPushEvents(env, stubClient(pushRead(card, movements)));
  };

  it('a move INTO an ongoing list sets Started from the pushed movement', async () => {
    const project = await makeProject();
    await drainOne(aresCard({ currentList: 'Working on Design' }), [movement()], project._id);

    const doc = await Deliverable.findOne({ trello_card_id: 'c9' }).orFail();
    expect(doc.work_started_at?.toISOString()).toBe('2026-08-04T01:00:00.000Z');
    expect(doc.work_done_at).toBeNull();
    expect(await CardEvent.countDocuments({ project_id: project._id, trello_card_id: 'c9' })).toBe(1);
  });

  it('a reopened card re-completed by push gets the NEW done date, never the stale one', async () => {
    const project = await makeProject();
    const start = movement();
    const done1 = movement({ fromList: 'Working on Design', toList: 'Done', detectedAt: '2026-08-07T01:00:00.000Z' });
    await drainOne(aresCard({ currentList: 'Done' }), [start, done1], project._id);
    expect((await Deliverable.findOne({ trello_card_id: 'c9' }).orFail()).work_done_at?.toISOString())
      .toBe('2026-08-07T01:00:00.000Z');

    // reopened — done clears, start survives
    const reopen = movement({ fromList: 'Done', toList: 'Working on Design', detectedAt: '2026-08-10T01:00:00.000Z' });
    await drainOne(aresCard({ currentList: 'Working on Design' }), [start, done1, reopen], project._id);
    expect((await Deliverable.findOne({ trello_card_id: 'c9' }).orFail()).work_done_at).toBeNull();

    // re-completed — the Aug 14 move, not the Aug 7 one
    const done2 = movement({ fromList: 'Working on Design', toList: 'Done', detectedAt: '2026-08-14T01:00:00.000Z' });
    await drainOne(aresCard({ currentList: 'Done' }), [start, done1, reopen, done2], project._id);
    const doc = await Deliverable.findOne({ trello_card_id: 'c9' }).orFail();
    expect(doc.work_started_at?.toISOString()).toBe('2026-08-04T01:00:00.000Z');
    expect(doc.work_done_at?.toISOString()).toBe('2026-08-14T01:00:00.000Z');
    // the repeated movements dedupe on the synthesized key, same as the full sync
    expect(await CardEvent.countDocuments({ project_id: project._id, trello_card_id: 'c9' })).toBe(4);
  });

  it('a read without a movements half is tolerated — no throw, no span', async () => {
    const project = await makeProject();
    await drainOne(aresCard({ currentList: 'Working on Design' }), [], project._id);
    expect((await Deliverable.findOne({ trello_card_id: 'c9' }).orFail()).work_started_at).toBeFalsy();
    expect(await SyncRun.countDocuments({ project_id: project._id, source: 'ares_push', ok: true })).toBe(1);
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
