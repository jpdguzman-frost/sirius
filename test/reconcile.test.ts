/**
 * T077 — reconcile of the WRITTEN fields from ARES reads (FR-9.5; invariant 8
 * as amended): the `Urgent` label and the due instant flow Trello → ARES →
 * Sirius on every sync, so a manual change made in Trello surfaces here.
 * Ownership stays safe — Sirius-owned planning fields are never touched —
 * and the echo of Sirius's own write is a same-value no-op with no audit row.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { syncProject } from '../worker/syncAres.ts';
import type { AresClient, AresCard } from '../src/services/ares.ts';
import { AuditLog, Deliverable, Project } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

const label = (name: string) => ({ id: `l-${name}`, name });

function card(over: Partial<AresCard> = {}): AresCard {
  return {
    cardId: 'c1',
    boardId: 'b1',
    name: 'MC-1 Hero banner',
    currentList: 'Design',
    labels: [label('Main Card')],
    due: null,
    ...over,
  } as AresCard;
}

const stubClient = (cards: AresCard[]): AresClient =>
  ({
    boardCards: async () => cards,
    boardMovements: async () => [],
    referenceWeeks: async () => ({ least: null, typical: null, most: null, effectiveWeeklyRate: null }),
  }) as unknown as AresClient;

async function makeProject() {
  return Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'b1', weekly_capacity: 3 });
}

describe('FR-9.5 — written fields reconcile from ARES reads', () => {
  it('the Urgent label and the raw due instant land on the deliverable', async () => {
    const project = await makeProject();
    await syncProject(
      stubClient([card({ labels: [label('Main Card'), label('Urgent')], due: '2026-08-20T09:00:00.000Z' })]),
      project,
    );
    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency).toBe('Urgent');
    expect(doc?.trello_due).toBe('2026-08-20');
    expect(doc?.trello_due_at?.toISOString()).toBe('2026-08-20T09:00:00.000Z');
  });

  it('a manual change in Trello (label removed, due cleared) surfaces on the next sync', async () => {
    const project = await makeProject();
    await syncProject(
      stubClient([card({ labels: [label('Main Card'), label('Urgent')], due: '2026-08-20T09:00:00.000Z' })]),
      project,
    );
    await syncProject(stubClient([card()]), project); // hand-edited in Trello
    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency).toBe('Non-Urgent');
    expect(doc?.trello_due).toBeNull();
    expect(doc?.trello_due_at).toBeNull();
  });

  it('Sirius-owned planning fields survive every reconcile untouched', async () => {
    const project = await makeProject();
    await syncProject(stubClient([card()]), project);
    await Deliverable.updateOne(
      { project_id: project._id, trello_card_id: 'c1' },
      { $set: { slotted_week: '2026-08-10', pinned: true, confidence: '0.85', status_note: 'manual note' } },
    );
    await syncProject(stubClient([card({ labels: [label('Main Card'), label('Urgent')] })]), project);
    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.slotted_week).toBe('2026-08-10');
    expect(doc?.pinned).toBe(true);
    expect(doc?.confidence).toBe('0.85');
    expect(doc?.status_note).toBe('manual note');
    expect(doc?.urgency).toBe('Urgent'); // the Trello-owned field DID reconcile
  });

  it('the echo of a same-value sync is a no-op: idempotent, and sync writes no audit rows', async () => {
    const project = await makeProject();
    const cards = [card({ labels: [label('Main Card'), label('Urgent')], due: '2026-08-20T09:00:00.000Z' })];
    await syncProject(stubClient(cards), project);
    await syncProject(stubClient(cards), project); // the echo
    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency).toBe('Urgent');
    expect(await Deliverable.countDocuments({ project_id: project._id })).toBe(1);
    expect(await AuditLog.countDocuments({})).toBe(0); // reconcile is silent
  });
});
