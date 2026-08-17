/**
 * T007 — schema rules (invariants 1, 3, 14; BR-9; FR-1.4).
 * Runs against a real mongod (memory server) with migrations applied, so
 * unique indexes and the deliverables_v view are the production mechanisms.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import {
  Project,
  Sprint,
  Deliverable,
  WorkCard,
  CardEvent,
  ConflictAcknowledgement,
} from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

const projectId = () => new Types.ObjectId();

function deliverable(overrides: Record<string, unknown> = {}) {
  return {
    project_id: projectId(),
    mc_number: 'MC-655',
    display_id: 'MC-655.1',
    trello_card_id: 'card-1',
    name: 'Test deliverable',
    ...overrides,
  };
}

describe('identity — invariant 3', () => {
  it('rejects a duplicate (project_id, trello_card_id)', async () => {
    const pid = projectId();
    await Deliverable.create(deliverable({ project_id: pid, trello_card_id: 'cardX' }));
    await expect(
      Deliverable.create(
        deliverable({ project_id: pid, trello_card_id: 'cardX', display_id: 'MC-655.2' }),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('allows the same trello_card_id in a different project', async () => {
    await Deliverable.create(deliverable({ trello_card_id: 'cardX' }));
    await expect(
      Deliverable.create(deliverable({ trello_card_id: 'cardX' })),
    ).resolves.toBeDefined();
  });

  it('mc_number is NOT unique — one MC carries many deliverables (MC-825 case)', async () => {
    const pid = projectId();
    for (let i = 1; i <= 5; i++) {
      await Deliverable.create(
        deliverable({
          project_id: pid,
          mc_number: 'MC-825',
          display_id: `MC-825.${i}`,
          trello_card_id: `card-${i}`,
        }),
      );
    }
    expect(await Deliverable.countDocuments({ project_id: pid, mc_number: 'MC-825' })).toBe(5);
  });
});

describe('project_id required everywhere — invariant 1, FR-1.4', () => {
  it('refuses a deliverable without project_id', async () => {
    const doc = deliverable();
    delete (doc as Record<string, unknown>).project_id;
    await expect(Deliverable.create(doc)).rejects.toThrow(/project_id/);
  });

  it('refuses a work card without project_id', async () => {
    await expect(
      WorkCard.create({ mc_number: 'MC-1', trello_card_id: 'c', name: 'n' }),
    ).rejects.toThrow(/project_id/);
  });

  it('refuses a sprint without project_id', async () => {
    await expect(
      Sprint.create({ name: 'S1', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 1 }),
    ).rejects.toThrow(/project_id/);
  });
});

describe('deliverables_v — BR-9 deadline precedence, invariant 14', () => {
  async function viewRow(cardId: string) {
    const db = mongoose.connection.db!;
    return db.collection('deliverables_v').findOne({ trello_card_id: cardId });
  }

  it('Trello due date wins where present', async () => {
    await Deliverable.create(
      deliverable({ trello_card_id: 'c1', trello_due: '2026-09-01', sheet_deadline: '2026-09-15' }),
    );
    const row = await viewRow('c1');
    expect(row?.deadline).toBe('2026-09-01');
    expect(row?.deadline_source).toBe('trello');
  });

  it('falls back to the sheet deadline', async () => {
    await Deliverable.create(deliverable({ trello_card_id: 'c2', sheet_deadline: '2026-09-15' }));
    const row = await viewRow('c2');
    expect(row?.deadline).toBe('2026-09-15');
    expect(row?.deadline_source).toBe('sheet');
  });

  it('yields null when neither exists — the card cannot raise a deadline conflict', async () => {
    await Deliverable.create(deliverable({ trello_card_id: 'c3' }));
    const row = await viewRow('c3');
    expect(row?.deadline).toBeNull();
    expect(row?.deadline_source).toBeNull();
  });
});

describe('sprints — BR-5', () => {
  it('rejects ends_on before starts_on', async () => {
    await expect(
      Sprint.create({
        project_id: projectId(),
        name: 'Backwards',
        starts_on: '2026-08-14',
        ends_on: '2026-08-03',
        position: 1,
      }),
    ).rejects.toThrow(/ends_on/);
  });

  it('rejects a duplicate position within a project', async () => {
    const pid = projectId();
    await Sprint.create({
      project_id: pid,
      name: 'S1',
      starts_on: '2026-08-03',
      ends_on: '2026-08-14',
      position: 1,
    });
    await expect(
      Sprint.create({
        project_id: pid,
        name: 'S2',
        starts_on: '2026-08-17',
        ends_on: '2026-08-28',
        position: 1,
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('idempotency & situation keys', () => {
  it('card_events dedupe on source_event_id', async () => {
    const base = {
      project_id: projectId(),
      trello_card_id: 'c1',
      source_event_id: 'evt-1',
      occurred_at: new Date(),
    };
    await CardEvent.create(base);
    await expect(CardEvent.create(base)).rejects.toThrow(/duplicate key/);
  });

  it('conflict acknowledgements are unique per (project, situation key) — invariant 13', async () => {
    const pid = projectId();
    const ack = {
      project_id: pid,
      conflict_key: '2026-08-17|urgent-overlap|120|c1:render,c2:render',
      acknowledged_by: 'PM@frostdesigngroup.com',
    };
    const created = await ConflictAcknowledgement.create(ack);
    expect(created.acknowledged_by).toBe('pm@frostdesigngroup.com'); // lowercased
    await expect(ConflictAcknowledgement.create(ack)).rejects.toThrow(/duplicate key/);
  });
});

describe('projects — FR-1.1', () => {
  it('requires code, board and capacity; defaults model window to 12', async () => {
    const p = await Project.create({
      code: 'rt-837',
      name: 'GCash: Design Support',
      trello_board_id: 'fixtureBoardA',
      weekly_capacity: 120,
    });
    expect(p.model_window_months).toBe(12);
    await expect(
      Project.create({ code: 'rt-838', name: 'No board', weekly_capacity: 10 }),
    ).rejects.toThrow(/trello_board_id/);
  });
});
