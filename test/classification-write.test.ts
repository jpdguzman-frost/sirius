/**
 * W4 — business-unit classification label, the SERVER HALF only (JP
 * 2026-09-10; contracts/trello-write.md §W4; BRD v3.0 §9 / FR-4.11; build-spec
 * v1.4 §4.3a "Server-side work can proceed on the rule above. The control
 * cannot."). No route, no caller, no UI: these cases drive the primitive
 * (`TrelloClient.setClassification`) and the commit half
 * (`applyClassificationWrite`) directly.
 *
 * The rule under test, in one line: assign or remove a label that ALREADY
 * EXISTS on the board, matched exactly after trim + case-fold, never fuzzy,
 * never created. Unmatched is refused; ambiguous (two board labels that
 * normalise to the same name) is refused too — a wrong business unit is worse
 * than a missing one (BRD §9: "it silently misattributes work"). Re-tagging
 * follows W3's add-then-remove, with W3's restore-on-partial-failure.
 *
 * Every expectation below is DERIVED from the fixture (test/CLAUDE.md rule 2):
 * the board fixture is one object, and each case reads the id it expects out
 * of it rather than repeating the string. The `never POST /boards/{id}/labels`
 * guard is asserted from the ops log in EVERY primitive case, because the
 * absence of an `ensureClassificationLabel` helper is the control the contract
 * names — the type system lacking a method proves nothing about the HTTP calls.
 *
 * The bottom describe of test/difficulty-write.test.ts is the template for the
 * fetch stub; the route-level half of that file becomes function-level here
 * (there is no route to `supertest`).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { TrelloClient, UnknownClassificationLabel, resolveLabelIds } from '../lib/trello.ts';
import { applyClassificationWrite } from '../src/services/classification-write.ts';
import { AuditLog, Deliverable, Project, SyncRun, WorkCard } from '../src/models/index.ts';

/* ---------------------------------------------------------------------- */
/* the board fixture — ONE object every case derives from                  */
/* ---------------------------------------------------------------------- */

/**
 * A board with a clean business-unit label, one that only matches after
 * trim + case-fold, an AMBIGUOUS pair (two labels that normalise to the same
 * name), the W1/W3 taxonomy beside them, and a nameless colour-only label —
 * Trello boards carry those, and a blank tag must never land on one.
 */
const BOARD = {
  id: 'b1',
  labels: [
    { id: 'l-cs', name: 'Client Services' },
    { id: 'l-mk', name: '  Marketing ' },
    { id: 'l-ops-a', name: 'Operations' },
    { id: 'l-ops-b', name: 'operations ' },
    { id: 'l-easy', name: 'Difficulty: Easy' },
    { id: 'l-urgent', name: 'Urgent' },
    { id: 'l-blank', name: '' },
  ],
};
const labelId = (name: string) => {
  const hit = BOARD.labels.find((l) => l.name === name);
  if (!hit) throw new Error(`fixture has no label named ${JSON.stringify(name)}`);
  return hit.id;
};
const CS = labelId('Client Services');
const MK = labelId('  Marketing ');
const OPS_A = labelId('Operations');
const OPS_B = labelId('operations ');

/** the card `c1` wears Client Services (the value a re-tag moves away from) plus Urgent */
const CARD = { id: 'c1', labels: [{ id: CS, name: 'Client Services' }, { id: labelId('Urgent'), name: 'Urgent' }] };

/**
 * fetch stub over BOARD and CARD, recording every call as `METHOD path`.
 * `failRemoval` makes the stale DELETE fail (the W3 partial-failure shape);
 * `failAdd` makes the POST fail (the Trello-first rollback shape).
 */
function makeFetch(opts: { failRemoval?: boolean; failAdd?: boolean; cardLabels?: typeof CARD.labels } = {}) {
  const ops: string[] = [];
  const cardLabels = opts.cardLabels ?? CARD.labels;
  const fetchImpl = (async (url: unknown, init?: { method?: string }) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    const path = u.split('?')[0]!.replace('https://api.trello.com/1', '');
    ops.push(`${method} ${path}`);
    if (method === 'GET' && path === `/boards/${BOARD.id}/labels`) {
      return new Response(JSON.stringify(BOARD.labels), { status: 200 });
    }
    if (method === 'GET' && path === `/cards/${CARD.id}/labels`) {
      return new Response(JSON.stringify(cardLabels), { status: 200 });
    }
    if (method === 'POST' && path === `/cards/${CARD.id}/idLabels`) {
      if (opts.failAdd) return new Response('boom', { status: 500 });
      return new Response('{}', { status: 200 });
    }
    if (method === 'DELETE' && path.startsWith(`/cards/${CARD.id}/idLabels/`)) {
      if (opts.failRemoval && path.endsWith(`/${CS}`)) return new Response('boom', { status: 500 });
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return { ops, fetchImpl, client: new TrelloClient('k', 't', fetchImpl) };
}

const writesOf = (ops: string[]) => ops.filter((o) => !o.startsWith('GET'));
const CREATE_LABEL = `POST /boards/${BOARD.id}/labels`;

/* ---------------------------------------------------------------------- */
/* resolveLabelIds — the pure resolver                                     */
/* ---------------------------------------------------------------------- */

describe('resolveLabelIds — exact match after trim + case-fold, every match returned', () => {
  it('matches a board label whose name differs only by surrounding whitespace and case', () => {
    expect(resolveLabelIds(BOARD.labels, 'marketing')).toEqual([MK]);
    expect(resolveLabelIds(BOARD.labels, '  CLIENT services ')).toEqual([CS]);
  });

  it('never fuzzy: a prefix, a substring, or a typo is no match at all', () => {
    expect(resolveLabelIds(BOARD.labels, 'Client')).toEqual([]);
    expect(resolveLabelIds(BOARD.labels, 'Client Service')).toEqual([]);
    expect(resolveLabelIds(BOARD.labels, 'Client  Services')).toEqual([]); // inner whitespace is part of the name
    expect(resolveLabelIds(BOARD.labels, 'Difficulty')).toEqual([]);
  });

  it('returns EVERY match, so the caller can see ambiguity rather than take the first', () => {
    expect(resolveLabelIds(BOARD.labels, 'Operations')).toEqual([OPS_A, OPS_B]);
  });

  it('a blank tag names nothing — it must not land on a colour-only label', () => {
    // the fixture DOES carry a nameless label, so this is not vacuous
    expect(BOARD.labels.some((l) => l.name === '')).toBe(true);
    expect(resolveLabelIds(BOARD.labels, '')).toEqual([]);
    expect(resolveLabelIds(BOARD.labels, '   ')).toEqual([]);
  });
});

/* ---------------------------------------------------------------------- */
/* TrelloClient.setClassification — the primitive                          */
/* ---------------------------------------------------------------------- */

describe('TrelloClient.setClassification — lookup-only label assign/swap', () => {
  it('an unmatched tag is refused with reason `unmatched`; nothing is written and no label is created', async () => {
    const { ops, client } = makeFetch();
    const err = await client.setClassification(CARD.id, BOARD.id, 'Finance').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnknownClassificationLabel);
    expect(err).toMatchObject({ boardId: BOARD.id, tag: 'Finance', reason: 'unmatched' });
    expect(writesOf(ops)).toEqual([]);
    expect(ops).not.toContain(CREATE_LABEL);
  });

  it('an AMBIGUOUS tag (two board labels normalise to the same name) is refused with reason `ambiguous`; nothing is written', async () => {
    const { ops, client } = makeFetch();
    const err = await client.setClassification(CARD.id, BOARD.id, 'operations').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnknownClassificationLabel);
    expect(err).toMatchObject({ boardId: BOARD.id, tag: 'operations', reason: 'ambiguous' });
    expect(writesOf(ops)).toEqual([]);
    expect(ops).not.toContain(CREATE_LABEL);
  });

  it('the error message names the board and the tag but is safe to surface (no credential)', async () => {
    const { client } = makeFetch();
    const err = (await client.setClassification(CARD.id, BOARD.id, 'Finance').catch((e: unknown) => e)) as Error;
    expect(err.message).toContain('Finance');
    expect(err.message).toContain(BOARD.id);
    expect(err.message).not.toMatch(/key=|token=/);
  });

  it('a blank tag is refused as unmatched even though the board has a nameless label', async () => {
    const { ops, client } = makeFetch();
    const err = await client.setClassification(CARD.id, BOARD.id, '   ').catch((e: unknown) => e);
    expect(err).toMatchObject({ reason: 'unmatched' });
    expect(writesOf(ops)).toEqual([]);
  });

  it('assigns a matched label with one POST of the EXISTING id — trim + case-fold on the tag', async () => {
    const { ops, client } = makeFetch();
    await client.setClassification(CARD.id, BOARD.id, ' marketing');
    expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`]);
    expect(ops).not.toContain(CREATE_LABEL);
  });

  it('re-tag = add-then-remove: the new label is on the card BEFORE the previous one leaves it', async () => {
    const { ops, client } = makeFetch();
    await client.setClassification(CARD.id, BOARD.id, 'Marketing', 'Client Services');
    expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`, `DELETE /cards/${CARD.id}/idLabels/${CS}`]);
    expect(ops).not.toContain(CREATE_LABEL);
  });

  it('a previousTag that no longer resolves on the board is skipped silently — the add still lands', async () => {
    const { ops, client } = makeFetch();
    await client.setClassification(CARD.id, BOARD.id, 'Marketing', 'Finance');
    expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`]);
  });

  it('a previousTag that resolves AMBIGUOUSLY is skipped too — never guess which one to strip', async () => {
    // the card WEARS one of the ambiguous pair, so only the ambiguity check
    // stands between it and a DELETE — the not-on-card check cannot mask this
    const { ops, client } = makeFetch({ cardLabels: [{ id: OPS_A, name: 'Operations' }, ...CARD.labels] });
    await client.setClassification(CARD.id, BOARD.id, 'Marketing', 'Operations');
    expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`]);
    for (const id of [OPS_A, OPS_B]) expect(ops).not.toContain(`DELETE /cards/${CARD.id}/idLabels/${id}`);
  });

  it('a previousTag that resolves but is NOT on the card is skipped — nothing to remove', async () => {
    const { ops, client } = makeFetch();
    // Difficulty: Easy resolves on the board; the card wears Client Services + Urgent only
    await client.setClassification(CARD.id, BOARD.id, 'Marketing', 'Difficulty: Easy');
    expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`]);
  });

  it('idempotent: a tag already on the card makes no POST, and a same-value previousTag makes no DELETE', async () => {
    const { ops, client } = makeFetch();
    await client.setClassification(CARD.id, BOARD.id, 'client services', 'Client Services');
    expect(writesOf(ops)).toEqual([]);
    // the reads still happened — the no-write is a decision, not a skipped call
    expect(ops).toContain(`GET /boards/${BOARD.id}/labels`);
    expect(ops).toContain(`GET /cards/${CARD.id}/labels`);
  });

  it('a failed stale removal restores the just-added label, then reports failure', async () => {
    const { ops, client } = makeFetch({ failRemoval: true });
    await expect(client.setClassification(CARD.id, BOARD.id, 'Marketing', 'Client Services')).rejects.toThrow(/HTTP 500/);
    expect(writesOf(ops)).toEqual([
      `POST /cards/${CARD.id}/idLabels`,
      `DELETE /cards/${CARD.id}/idLabels/${CS}`,
      `DELETE /cards/${CARD.id}/idLabels/${MK}`, // the restore
    ]);
  });

  it('a failed add throws before any removal is attempted — the previous label stays', async () => {
    const { ops, client } = makeFetch({ failAdd: true });
    await expect(client.setClassification(CARD.id, BOARD.id, 'Marketing', 'Client Services')).rejects.toThrow(/HTTP 500/);
    expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`]);
  });

  it('reads the board labels FRESH on every call — no cache to go stale when Frost renames a label', async () => {
    const { ops, client } = makeFetch();
    await client.setClassification(CARD.id, BOARD.id, 'Marketing');
    await client.setClassification(CARD.id, BOARD.id, 'Marketing');
    expect(ops.filter((o) => o === `GET /boards/${BOARD.id}/labels`)).toHaveLength(2);
  });
});

/* ---------------------------------------------------------------------- */
/* applyClassificationWrite — the commit half                              */
/* ---------------------------------------------------------------------- */

describe('applyClassificationWrite — Trello-first, audit + sync_runs both ways, no-op guard', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 120_000);
  afterAll(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearCollections();
  });

  const ACTOR = 'jp@frostdesigngroup.com';

  async function seed(entity: 'deliverable' | 'work_card', unit_label: string | null) {
    const project = await Project.create({ code: 'rt-837', name: 'Fixture', trello_board_id: BOARD.id, weekly_capacity: 120 });
    const base = { project_id: project._id, mc_number: 'MC-1', trello_card_id: CARD.id, name: 'MC-1 fixture', unit_label };
    const doc =
      entity === 'deliverable'
        ? await Deliverable.create({ ...base, display_id: 'MC-1.1' })
        : await WorkCard.create({ ...base, current_list: 'Backlogs' });
    return { project, doc };
  }

  const reload = (entity: 'deliverable' | 'work_card') =>
    entity === 'deliverable' ? Deliverable.findOne({ trello_card_id: CARD.id }) : WorkCard.findOne({ trello_card_id: CARD.id });

  for (const entity of ['deliverable', 'work_card'] as const) {
    it(`${entity}: persists after Trello succeeded, stamps registry_written_at, audits before/after, records the run`, async () => {
      const { project, doc } = await seed(entity, 'Client Services');
      const { ops, client } = makeFetch();
      const res = await applyClassificationWrite({
        trello: client,
        projectId: project._id,
        boardId: BOARD.id,
        cardId: CARD.id,
        entity,
        doc,
        tag: 'Marketing',
        actor: ACTOR,
      });
      expect(res).toEqual({ ok: true, noop: false, before: 'Client Services', after: 'Marketing' });
      expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`, `DELETE /cards/${CARD.id}/idLabels/${CS}`]);

      const after = await reload(entity);
      expect(after?.unit_label).toBe('Marketing');
      expect(after?.registry_written_at).toBeInstanceOf(Date);

      const row = await AuditLog.findOne({ action: 'classification.set' });
      expect(row?.project_id?.toString()).toBe(project._id.toString());
      expect(row?.actor).toBe(ACTOR);
      expect(row?.entity).toBe(entity);
      expect(row?.entity_id).toBe(CARD.id);
      expect(row?.before).toEqual({ unit_label: 'Client Services' });
      expect(row?.after).toEqual({ unit_label: 'Marketing' });
      expect(await AuditLog.countDocuments()).toBe(1);

      const run = await SyncRun.findOne({ source: 'trello_write' });
      expect(run?.ok).toBe(true);
      expect(run?.project_id?.toString()).toBe(project._id.toString());
      expect(run?.stats).toMatchObject({ kind: 'classification', entity, cardId: CARD.id });
      expect(await SyncRun.countDocuments({ source: 'trello_write' })).toBe(1);
    });
  }

  it('a first tag (no previous value) audits before as null and passes no previousTag to Trello', async () => {
    const { project, doc } = await seed('deliverable', null);
    const { ops, client } = makeFetch();
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'deliverable', doc, tag: 'Marketing', actor: ACTOR,
    });
    expect(res).toEqual({ ok: true, noop: false, before: null, after: 'Marketing' });
    // the card's existing Client Services label is NOT stripped: Sirius never wrote it, so nothing tells it to
    expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`]);
    expect((await AuditLog.findOne({ action: 'classification.set' }))?.before).toEqual({ unit_label: null });
  });

  it('no-op guard: a same-value write makes no Trello call and writes no audit or sync_runs row', async () => {
    const { project, doc } = await seed('work_card', 'Marketing');
    const { ops, client } = makeFetch();
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'work_card', doc, tag: 'Marketing', actor: ACTOR,
    });
    expect(res).toEqual({ ok: true, noop: true, before: 'Marketing', after: 'Marketing' });
    expect(ops).toEqual([]);
    expect(await AuditLog.countDocuments()).toBe(0);
    expect(await SyncRun.countDocuments()).toBe(0);
    expect((await reload('work_card'))?.registry_written_at).toBeUndefined();
  });

  it('Trello-first: a failed write leaves the document untouched (no value, no stamp) and records the failure both ways', async () => {
    const { project, doc } = await seed('work_card', 'Client Services');
    const { client } = makeFetch({ failAdd: true });
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'work_card', doc, tag: 'Marketing', actor: ACTOR,
    });
    expect(res).toMatchObject({ ok: false, before: 'Client Services' });
    expect(res.ok === false && res.error).toMatch(/HTTP 500/);

    const after = await reload('work_card');
    expect(after?.unit_label).toBe('Client Services'); // never diverges from Trello
    expect(after?.registry_written_at).toBeUndefined(); // nothing changed, nothing to shield

    const failRow = await AuditLog.findOne({ action: 'classification.set_failed' });
    expect(failRow?.actor).toBe(ACTOR);
    expect(failRow?.entity).toBe('work_card');
    expect(failRow?.entity_id).toBe(CARD.id);
    expect(failRow?.before).toEqual({ unit_label: 'Client Services' });
    expect(failRow?.after).toMatchObject({ attempted: 'Marketing' });
    expect(String((failRow?.after as { error?: unknown })?.error)).toMatch(/HTTP 500/);
    expect(await AuditLog.countDocuments({ action: 'classification.set' })).toBe(0);
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: false })).toBe(1);
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: true })).toBe(0);
  });

  it('an unmatched tag is REFUSED AND SURFACED: no Trello write, no local change, the refusal recorded with its reason', async () => {
    const { project, doc } = await seed('deliverable', null);
    const { ops, client } = makeFetch();
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'deliverable', doc, tag: 'Finance', actor: ACTOR,
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('Finance');
    expect(writesOf(ops)).toEqual([]);
    expect((await reload('deliverable'))?.unit_label).toBeNull();
    const failRow = await AuditLog.findOne({ action: 'classification.set_failed' });
    expect(failRow?.after).toMatchObject({ attempted: 'Finance' });
    const run = await SyncRun.findOne({ source: 'trello_write' });
    expect(run?.ok).toBe(false);
    expect(run?.error).toContain('Finance');
  });

  it("actor 'system' round-trips verbatim — the ingestion-triggered tag build-spec §4.3a describes is a primitive this already supports", async () => {
    const { project, doc } = await seed('deliverable', null);
    const { client } = makeFetch();
    await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'deliverable', doc, tag: 'Marketing', actor: 'system',
    });
    expect((await AuditLog.findOne({ action: 'classification.set' }))?.actor).toBe('system');
  });

  it('a rolled-back swap (stale removal failed) reports failure and leaves the local value at its before', async () => {
    const { project, doc } = await seed('deliverable', 'Client Services');
    const { ops, client } = makeFetch({ failRemoval: true });
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'deliverable', doc, tag: 'Marketing', actor: ACTOR,
    });
    expect(res.ok).toBe(false);
    expect(ops).toContain(`DELETE /cards/${CARD.id}/idLabels/${MK}`); // restored
    expect((await reload('deliverable'))?.unit_label).toBe('Client Services');
    expect(await AuditLog.countDocuments({ action: 'classification.set_failed' })).toBe(1);
  });
});
