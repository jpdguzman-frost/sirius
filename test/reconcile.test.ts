/**
 * T077 — reconcile of the WRITTEN fields from ARES reads (FR-9.5; invariant 8
 * as amended): the `Urgent` label and the due instant flow Trello → ARES →
 * Sirius on every sync, so a manual change made in Trello surfaces here.
 * Ownership stays safe — Sirius-owned planning fields are never touched —
 * and the echo of Sirius's own write is a same-value no-op with no audit row.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { syncProject, upsertDeliverable, upsertWorkCard } from '../worker/syncAres.ts';
import { mapTrello } from '../src/services/mapper.ts';
import type { AresClient, AresCard } from '../src/services/ares.ts';
import { AuditLog, Deliverable, Project, WorkCard } from '../src/models/index.ts';

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
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0); // reconcile is silent
  });
});

/**
 * The stale-reconcile guard (product owl #50, 2026-08-18). A reconcile is
 * read-then-write, so it can be holding a payload older than a registry write
 * that has since landed. Applying it reverts the value the user just set —
 * the only failure in the push/poll area that shows a WRONG value.
 *
 * The rule under test, stated once: a registry-owned field is written only
 * when Sirius's own last write to that card is strictly older than the
 * instant the read was ISSUED. Everything else on the card reconciles
 * regardless — the guard protects three fields, not the row.
 */
describe('stale reconcile cannot revert a registry write (owl #50)', () => {
  const mapped = (over: Partial<AresCard> = {}) =>
    mapTrello([card(over)], null).deliverables[0]!;

  /** A card Sirius wrote to at `writtenAt`, holding the user's chosen values. */
  async function writtenDeliverable(projectId: Types.ObjectId, writtenAt: Date) {
    return Deliverable.create({
      project_id: projectId,
      mc_number: 'MC-1',
      display_id: 'MC-1',
      trello_card_id: 'c1',
      name: 'MC-1 Hero banner',
      urgency: 'Urgent',
      difficulty: 'Hard',
      trello_due: '2026-08-25',
      trello_due_at: new Date('2026-08-25T09:00:00.000Z'),
      registry_written_at: writtenAt,
    });
  }

  it('a read ISSUED BEFORE the write leaves all three written fields alone', async () => {
    const project = await makeProject();
    const readAt = new Date('2026-08-18T10:00:00.000Z');
    await writtenDeliverable(project._id, new Date('2026-08-18T10:00:01.000Z')); // one second later

    // the payload that read returned still carries the pre-write values
    await upsertDeliverable(
      project._id,
      mapped({ labels: [label('Main Card'), label('Difficulty: Easy')], due: null, currentList: 'Render' }),
      'MC-1',
      readAt,
    );

    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency).toBe('Urgent'); // W1 held
    expect(doc?.difficulty).toBe('Hard'); // W3 held
    expect(doc?.trello_due).toBe('2026-08-25'); // W2 held
    expect(doc?.trello_due_at?.toISOString()).toBe('2026-08-25T09:00:00.000Z');
    // and the guard protects THOSE THREE ONLY — the rest of the card still reconciles
    expect(doc?.current_list).toBe('Render');
  });

  it('a read ISSUED AFTER the write applies it — invariant 8 keeps its promise', async () => {
    const project = await makeProject();
    await writtenDeliverable(project._id, new Date('2026-08-18T10:00:00.000Z'));
    const readAt = new Date('2026-08-18T10:00:01.000Z'); // the read came later

    // someone then edited the card by hand in Trello
    await upsertDeliverable(
      project._id,
      mapped({ labels: [label('Main Card'), label('Difficulty: Easy')], due: null }),
      'MC-1',
      readAt,
    );

    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency).toBe('Non-Urgent');
    expect(doc?.difficulty).toBe('Easy');
    expect(doc?.trello_due).toBeNull();
    expect(doc?.trello_due_at).toBeNull();
  });

  it('a card Sirius has never written carries no stamp and reconciles normally', async () => {
    const project = await makeProject();
    await upsertDeliverable(
      project._id,
      mapped({ labels: [label('Main Card'), label('Urgent')] }),
      'MC-1',
      new Date('2026-08-18T10:00:00.000Z'),
    );
    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.registry_written_at).toBeUndefined();
    expect(doc?.urgency).toBe('Urgent');
  });

  it('the task-card due is guarded the same way (W2 task half)', async () => {
    const project = await makeProject();
    const readAt = new Date('2026-08-18T10:00:00.000Z');
    await WorkCard.create({
      project_id: project._id,
      mc_number: 'MC-1',
      trello_card_id: 'w1',
      name: 'Render Asset: MC-1 exports',
      trello_due: '2026-08-25',
      trello_due_at: new Date('2026-08-25T09:00:00.000Z'),
      registry_written_at: new Date('2026-08-18T10:00:01.000Z'),
    });

    const w = mapTrello(
      [card({ cardId: 'w1', name: 'Render Asset: MC-1 exports', labels: [], due: null, currentList: 'Render' })],
      null,
    ).workCards[0]!;
    await upsertWorkCard(project._id, w, readAt);

    const doc = await WorkCard.findOne({ project_id: project._id, trello_card_id: 'w1' });
    expect(doc?.trello_due).toBe('2026-08-25');
    expect(doc?.current_list).toBe('Render'); // unguarded field still reconciled
  });

  it('the real race: a write landing DURING the board read survives that sync', async () => {
    const project = await makeProject();
    await syncProject(
      stubClient([card({ labels: [label('Main Card'), label('Difficulty: Easy')] })]),
      project,
    );

    // the user sets Hard while the NEXT sync's board read is in flight — the
    // write lands after that sync stamped its read instant
    const racing = {
      boardCards: async () => {
        await Deliverable.updateOne(
          { project_id: project._id, trello_card_id: 'c1' },
          { $set: { difficulty: 'Hard', registry_written_at: new Date() } },
        );
        return [card({ labels: [label('Main Card'), label('Difficulty: Easy')] })]; // pre-write payload
      },
      boardMovements: async () => [],
      referenceWeeks: async () => ({ least: null, typical: null, most: null, effectiveWeeklyRate: null }),
    } as unknown as AresClient;
    await syncProject(racing, project);

    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.difficulty).toBe('Hard');
  });
});
