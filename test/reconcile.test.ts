/**
 * T077 — reconcile of the WRITTEN fields from ARES reads (FR-9.5; invariant 8
 * as amended): the `Urgent` label and the due instant flow Trello → ARES →
 * Sirius on every sync, so a manual change made in Trello surfaces here.
 * Ownership stays safe — Sirius-owned planning fields are never touched —
 * and the echo of Sirius's own write is a same-value no-op with no audit row.
 */

import { readFileSync } from 'node:fs';
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
    // Every real ARES card carries this — it is how ARES reports when IT last
    // fetched the card from Trello, and the guard below compares against it.
    // Defaulted late so a test not about staleness reconciles normally;
    // staleness tests override it, which is the only way they can now.
    lastPolledAt: '2026-08-18T12:00:00.000Z',
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
 * The stale-reconcile guard (product owl #50, 2026-08-18; **clock corrected
 * 2026-08-25**). A reconcile is read-then-write, so it can be holding a
 * payload older than a registry write that has since landed. Applying it
 * reverts the value the user just set — the only failure in the push/poll
 * area that shows a WRONG value.
 *
 * The rule under test, stated once: a registry-owned field is written only
 * when Sirius's own last write to that card is strictly older than the
 * instant **ARES FETCHED THE CARD FROM TRELLO** — not the instant Sirius
 * issued its request. ARES answers from its own store, so those two are
 * different clocks and only the first bounds the data. Everything else on the
 * card reconciles regardless: the guard protects three fields, not the row.
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

  it('a payload FETCHED BEFORE the write leaves all three written fields alone', async () => {
    const project = await makeProject();
    await writtenDeliverable(project._id, new Date('2026-08-18T10:00:01.000Z'));

    // ARES fetched this card one second BEFORE the user's write landed, so the
    // payload still carries the pre-write values.
    await upsertDeliverable(
      project._id,
      mapped({
        lastPolledAt: '2026-08-18T10:00:00.000Z',
        labels: [label('Main Card'), label('Difficulty: Easy')],
        due: null,
        currentList: 'Render',
      }),
      'MC-1',
    );

    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency).toBe('Urgent'); // W1 held
    expect(doc?.difficulty).toBe('Hard'); // W3 held
    expect(doc?.trello_due).toBe('2026-08-25'); // W2 held
    expect(doc?.trello_due_at?.toISOString()).toBe('2026-08-25T09:00:00.000Z');
    // and the guard protects THOSE THREE ONLY — the rest of the card still reconciles
    expect(doc?.current_list).toBe('Render');
  });

  it('THE BUG: a payload fetched before the write, requested after it, is still held', async () => {
    /* The defect this guard shipped with, and the reason it moved clocks
       (2026-08-25). ARES never reads Trello at request time — it answers from
       a store filled by a 15-minute poll and by a webhook. So this sequence is
       ordinary, not exotic:

         10:00  ARES fetches the card
         10:05  the user edits urgency in Sirius; we write Trello and stamp
         10:06  a reconcile fires and asks ARES for the card

       Judged on the REQUEST instant (10:06) the guard passed — 10:05 < 10:06 —
       and wrote the 10:00 payload straight over the user's change. Judged on
       the FETCH instant (10:00) it holds, which is the whole correction.

       Asserted with the request instant LATER than the write, so this test can
       only pass on the fetch clock: on the old code it failed. */
    const project = await makeProject();
    await writtenDeliverable(project._id, new Date('2026-08-18T10:05:00.000Z'));

    await upsertDeliverable(
      project._id,
      mapped({ lastPolledAt: '2026-08-18T10:00:00.000Z', labels: [label('Main Card')], due: null }),
      'MC-1',
    );

    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency, 'the push reverted the edit — the guard is on the wrong clock').toBe('Urgent');
    expect(doc?.difficulty).toBe('Hard');
    expect(doc?.trello_due).toBe('2026-08-25');
  });

  it('a payload FETCHED AFTER the write applies it — invariant 8 keeps its promise', async () => {
    const project = await makeProject();
    await writtenDeliverable(project._id, new Date('2026-08-18T10:00:00.000Z'));

    // someone then edited the card by hand in Trello, and ARES fetched it after
    await upsertDeliverable(
      project._id,
      mapped({
        lastPolledAt: '2026-08-18T10:00:01.000Z',
        labels: [label('Main Card'), label('Difficulty: Easy')],
        due: null,
      }),
      'MC-1',
    );

    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency).toBe('Non-Urgent');
    expect(doc?.difficulty).toBe('Easy');
    expect(doc?.trello_due).toBeNull();
    expect(doc?.trello_due_at).toBeNull();
  });

  it('NO fetch stamp means SKIP, never fall back to a clock', async () => {
    /* ARES's own audit calls `lastPolledAt` "written in three places and read
       by none", so a cleanup could remove it. The tempting fallback — use the
       read instant — is the exact defect above, reinstated silently. Absence
       must therefore behave like infinite staleness: hold our value.
       `scripts/ares-probe.mjs` is the loud half, failing the build on drift. */
    const project = await makeProject();
    await writtenDeliverable(project._id, new Date('2026-08-18T10:00:00.000Z'));

    await upsertDeliverable(
      project._id,
      mapped({ lastPolledAt: undefined, labels: [label('Main Card'), label('Difficulty: Easy')], due: null }),
      'MC-1',
    );

    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency, 'an absent fetch stamp was treated as fresh').toBe('Urgent');
    expect(doc?.difficulty).toBe('Hard');
    // the UNGUARDED half still reconciles — skipping is scoped to the registry
    expect(doc?.current_list).toBe('Design');
  });

  it('an unparseable fetch stamp is treated as absent, not as epoch zero', async () => {
    const project = await makeProject();
    await writtenDeliverable(project._id, new Date('2026-08-18T10:00:00.000Z'));
    await upsertDeliverable(
      project._id,
      mapped({ lastPolledAt: 'not-a-date', labels: [label('Main Card')], due: null }),
      'MC-1',
    );
    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency).toBe('Urgent');
  });

  it('a card Sirius has never written carries no stamp and reconciles normally', async () => {
    const project = await makeProject();
    await upsertDeliverable(project._id, mapped({ labels: [label('Main Card'), label('Urgent')] }), 'MC-1');
    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.registry_written_at).toBeUndefined();
    expect(doc?.urgency).toBe('Urgent');
  });

  it('the task-card due is guarded the same way (W2 task half)', async () => {
    const project = await makeProject();
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
      [card({
        cardId: 'w1',
        name: 'Render Asset: MC-1 exports',
        labels: [],
        due: null,
        currentList: 'Render',
        lastPolledAt: '2026-08-18T10:00:00.000Z',
      })],
      null,
    ).workCards[0]!;
    await upsertWorkCard(project._id, w);

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

/* ---------------------------------------------------------------------- */
/* The clock itself — asserted so it cannot quietly move back              */
/* ---------------------------------------------------------------------- */

describe('the guard reads a MEASURED fetch instant, never a local clock', () => {
  /* The defect was not a wrong comparison, it was the wrong INPUT: a clock the
     caller happened to have. The old signature took `readAt` and warned in its
     own doc comment that "a caller that passed `new Date()` here would disable
     the guard silently" — and both callers passed exactly that, because a read
     instant was the only clock they had. The warning was correct and it did not
     help.

     So these assert the SHAPE that removed the option, not the fix: the upserts
     accept no clock, and the sync paths mint no `new Date()` to compare against.
     Reintroducing either fails here before it can reach a user's board. */

  const SYNC = readFileSync(new URL('../worker/syncAres.ts', import.meta.url), 'utf8');
  const DRAIN = readFileSync(new URL('../worker/drainPush.ts', import.meta.url), 'utf8');

  it('neither upsert takes a caller-supplied instant', () => {
    for (const fn of ['upsertDeliverable', 'upsertWorkCard']) {
      const sig = SYNC.slice(SYNC.indexOf(`export async function ${fn}(`));
      const params = sig.slice(sig.indexOf('('), sig.indexOf('): Promise'));
      expect(params, `${fn} takes a date argument again — that is the shape of the bug`).not.toMatch(/:\s*Date/);
    }
  });

  it('the guard compares against the field ARES stamps, not against now', () => {
    /* Sliced to the FUNCTION BODIES, not to the next declaration: the doc
       comment above `fetchedAtOf` quotes `new Date()` while explaining why it
       must never be the fallback, and a source guard reads raw text including
       comments (test/CLAUDE.md rule 3). The guard was right and the scope was
       wrong — the same resolution that rule records twice already. */
    const bodyOf = (decl: string) => {
      const from = SYNC.indexOf(decl);
      return SYNC.slice(from, SYNC.indexOf('\n});', from));
    };
    const guard = bodyOf('const staleGuard');
    expect(guard).toContain('registry_written_at');
    expect(guard).not.toContain('new Date()');

    // and the fetch instant is derived from the payload field, nowhere else
    const from = SYNC.indexOf('export function fetchedAtOf');
    const derive = SYNC.slice(from, SYNC.indexOf('\n}', from));
    expect(derive).toContain('trello_polled_at');
    expect(derive).not.toContain('new Date()');
  });

  it('no sync path mints a clock to reconcile against', () => {
    /* Both files still use `new Date()` legitimately — `updated_at`,
       `trello_synced_at`, `created_at` — so this asserts the ABSENCE of the
       specific shape that was removed, a read instant stamped before the fetch
       and carried into the upserts. */
    for (const [name, src] of [['syncAres', SYNC], ['drainPush', DRAIN]] as const) {
      expect(src, `${name} stamps a read instant again`).not.toMatch(/const readAt\s*=/);
    }
  });

  it('is executed, not just read: an absent stamp holds the value', async () => {
    /* The source assertions above prove the shape. This proves the behaviour,
       because a shape can be right while the branch is dead. */
    const project = await makeProject();
    await Deliverable.create({
      project_id: project._id,
      mc_number: 'MC-2',
      display_id: 'MC-2',
      trello_card_id: 'c2',
      name: 'MC-2 Banner',
      urgency: 'Urgent',
      registry_written_at: new Date('2026-08-18T10:00:00.000Z'),
    });
    const noStamp = mapTrello([card({ cardId: 'c2', name: 'MC-2 Banner', lastPolledAt: undefined })], null)
      .deliverables[0]!;
    expect(noStamp.trello_polled_at, 'the mapper invented a stamp').toBeNull();
    await upsertDeliverable(project._id, noStamp, 'MC-2');
    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c2' });
    expect(doc?.urgency).toBe('Urgent');
  });
});
