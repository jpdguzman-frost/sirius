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
import { aresCard, label } from './helpers/ares-card.ts';
import { syncProject, upsertDeliverable, upsertWorkCard } from '../worker/syncAres.ts';
import { decl, fnBody } from './helpers/gantt-render.ts';
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

/** This suite's card identity, over the contract defaults in `fixtures.ts`. */
const card = (over: Partial<AresCard> = {}): AresCard =>
  aresCard({ name: 'MC-1 Hero banner', ...over });

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

const mapped = (over: Partial<AresCard> = {}) => mapTrello([card(over)], null).deliverables[0]!;

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


  it('a payload FETCHED BEFORE the write leaves all three written fields alone', async () => {
    /* The defect this guard shipped with, and the reason it changed clocks
       (2026-08-25). ARES never reads Trello at request time — it answers from
       a store filled by a 15-minute poll and by a webhook — so this sequence
       is ordinary, not exotic:

         10:00  ARES fetches the card
         10:05  the user edits urgency in Sirius; we write Trello and stamp
         10:06  a reconcile fires and asks ARES for the card

       Judged on the REQUEST instant (10:06) the guard passed — 10:05 < 10:06 —
       and wrote the 10:00 payload straight over the user's change. Judged on
       the FETCH instant (10:00) it holds, which is the whole correction. The
       request instant cannot be expressed here any more: the upserts take no
       clock, which is what made the bug unrepresentable rather than merely
       fixed. */
    const project = await makeProject();
    await writtenDeliverable(project._id, new Date('2026-08-18T10:05:00.000Z'));

    // ARES fetched this card five minutes BEFORE the user's write landed, so
    // the payload still carries the pre-write values.
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
    expect(doc?.urgency, 'the reconcile reverted the edit — the guard is on the wrong clock').toBe('Urgent');
    expect(doc?.difficulty).toBe('Hard'); // W3 held
    expect(doc?.trello_due).toBe('2026-08-25'); // W2 held
    expect(doc?.trello_due_at?.toISOString()).toBe('2026-08-25T09:00:00.000Z');
    // and the guard protects THOSE THREE ONLY — the rest of the card still reconciles
    expect(doc?.current_list).toBe('Render');
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

  it('an absent fetch instant still populates a card Sirius has NEVER written', async () => {
    /* The bug the first version of this fix shipped with (caught in review,
       2026-08-25). No fetch instant meant "skip the registry write" — but on a
       card Sirius has never touched there is nothing to protect, and skipping
       left urgency on the schema's `Non-Urgent` default with no difficulty and
       no deadline. That is the same class of failure the guard exists to
       prevent, manufactured by the guard itself: a value the user did not
       choose, on a card Trello marks Urgent.

       Unknown freshness now NARROWS the guard to never-written cards rather
       than disabling the write. */
    const project = await makeProject();
    await upsertDeliverable(
      project._id,
      mapped({
        lastPolledAt: undefined,
        labels: [label('Main Card'), label('Urgent'), label('Difficulty: Hard')],
        due: '2026-09-01T09:00:00.000Z',
      }),
      'MC-1',
    );

    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency, 'a new Urgent card landed on the schema default').toBe('Urgent');
    expect(doc?.difficulty).toBe('Hard');
    expect(doc?.trello_due).toBe('2026-09-01');
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
    /* ⚠️ This test went VACUOUS when the clock changed and the review caught it
       (2026-08-25): the shared fixture stamps a fixed 2026-08-18, the racing
       write stamps `new Date()`, so the guard held for the trivial reason that
       any fixture card predates today — moving the write BEFORE the sync gave
       the identical green. The stamp is now minted relative to the write, so
       the ordering under test is the only thing that decides the outcome. */
    const project = await makeProject();
    const polled = new Date(Date.now() - 60_000).toISOString(); // ARES fetched a minute ago
    await syncProject(
      stubClient([card({ lastPolledAt: polled, labels: [label('Main Card'), label('Difficulty: Easy')] })]),
      project,
    );

    // the user sets Hard while the NEXT sync's board read is in flight — the
    // write lands AFTER ARES fetched the payload that read returns
    const racing = {
      boardCards: async () => {
        await Deliverable.updateOne(
          { project_id: project._id, trello_card_id: 'c1' },
          { $set: { difficulty: 'Hard', registry_written_at: new Date() } },
        );
        return [card({ lastPolledAt: polled, labels: [label('Main Card'), label('Difficulty: Easy')] })];
      },
      boardMovements: async () => [],
      referenceWeeks: async () => ({ least: null, typical: null, most: null, effectiveWeeklyRate: null }),
    } as unknown as AresClient;
    await syncProject(racing, project);

    expect((await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' }))?.difficulty).toBe('Hard');

    // …and the mirror, which is what makes the above non-vacuous: a payload
    // ARES fetched AFTER the write reconciles normally.
    const fresh = {
      boardCards: async () => [card({
        lastPolledAt: new Date(Date.now() + 60_000).toISOString(),
        labels: [label('Main Card'), label('Difficulty: Easy')],
      })],
      boardMovements: async () => [],
      referenceWeeks: async () => ({ least: null, typical: null, most: null, effectiveWeeklyRate: null }),
    } as unknown as AresClient;
    await syncProject(fresh, project);
    expect((await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' }))?.difficulty).toBe('Easy');
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
    /* Sliced with `decl`/`fnBody` rather than `indexOf` plus a magic
       terminator. `handlerBody`'s own doc names why: a landmark like `'\n});'`
       silently truncates the moment the code it reads grows a nested object,
       and an assertion on a fragment passes for the wrong reason. These also
       slice past the doc comment above `fetchedAtOf`, which quotes `new Date()`
       while explaining why it must never be the fallback — a source guard reads
       raw text including comments (test/CLAUDE.md rule 3). */
    const guard = fnBody('staleGuard', SYNC);
    expect(guard).toContain('registry_written_at');
    expect(guard).not.toContain('new Date()');
    // an absent instant NARROWS the guard to never-written cards; it must not
    // skip the write, which would strand a new card on its schema defaults
    expect(guard).toContain('$exists: false');

    // the fetch instant is derived from the payload field, and the parse is
    // the module's ONE ISO parser rather than a second copy of it
    const derive = fnBody('fetchedAtOf', SYNC);
    expect(derive).toContain('trello_polled_at');
    expect(derive).toContain('dueInstant');
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
    /* The three assertions above read source text. A describe block of only
       source assertions is the vacuity risk test/CLAUDE.md rule 1 names — a
       shape can be right while the branch is dead — so this one runs it. It
       shares `writtenDeliverable`/`mapped` with the block above rather than
       re-declaring the fixture, which is what it used to do. */
    const project = await makeProject();
    await writtenDeliverable(project._id, new Date('2026-08-18T10:00:00.000Z'));
    const noStamp = mapped({ lastPolledAt: undefined });
    expect(noStamp.trello_polled_at, 'the mapper invented a stamp').toBeNull();
    await upsertDeliverable(project._id, noStamp, 'MC-1');
    const doc = await Deliverable.findOne({ project_id: project._id, trello_card_id: 'c1' });
    expect(doc?.urgency).toBe('Urgent');
  });
});
