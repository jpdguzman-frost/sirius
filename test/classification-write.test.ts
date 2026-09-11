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

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import {
  BLOCKER_LABEL_PREFIX,
  DIFFICULTY_LABEL_PREFIX,
  MAIN_CARD_LABEL,
  TrelloClient,
  URGENT_LABEL_NAME,
  UnknownClassificationLabel,
  isReservedLabelName,
  resolveLabelIds,
} from '../lib/trello.ts';
import { mapTrello } from '../src/services/mapper.ts';
import { aresCard } from './helpers/ares-card.ts';
import { applyClassificationWrite } from '../src/services/classification-write.ts';
import { AuditLog, Deliverable, Project, SyncRun, WorkCard } from '../src/models/index.ts';

/* ---------------------------------------------------------------------- */
/* the board fixture — ONE object every case derives from                  */
/* ---------------------------------------------------------------------- */

/**
 * A board with a clean business-unit label, one that only matches after
 * trim + case-fold, a second clean one no card wears, an AMBIGUOUS pair (two
 * labels that normalise to the same name), the RESERVED taxonomy beside them
 * (W1's Urgent, W3's Difficulty pair, the Main Card kind label, a 🛑 blocker —
 * every name read out of lib/trello.ts, never spelled here), and a nameless
 * colour-only label — Trello boards carry those, and a blank tag must never
 * land on one.
 */
const BOARD = {
  id: 'b1',
  labels: [
    { id: 'l-cs', name: 'Client Services' },
    { id: 'l-mk', name: '  Marketing ' },
    { id: 'l-people', name: 'People' },
    { id: 'l-ops-a', name: 'Operations' },
    { id: 'l-ops-b', name: 'operations ' },
    { id: 'l-easy', name: `${DIFFICULTY_LABEL_PREFIX}Easy` },
    { id: 'l-hard', name: `${DIFFICULTY_LABEL_PREFIX}Hard` },
    { id: 'l-urgent', name: URGENT_LABEL_NAME },
    { id: 'l-main', name: MAIN_CARD_LABEL },
    { id: 'l-blocked', name: `${BLOCKER_LABEL_PREFIX} Blocked` },
    { id: 'l-blank', name: '' },
  ],
};
const labelId = (name: string) => {
  const hit = BOARD.labels.find((l) => l.name === name);
  if (!hit) throw new Error(`fixture has no label named ${JSON.stringify(name)}`);
  return hit.id;
};
/** the board's canonical spelling of a label, trimmed — what W4 stores (review F2) */
const canonicalOf = (id: string) => BOARD.labels.find((l) => l.id === id)!.name.trim();
const CS = labelId('Client Services');
const MK = labelId('  Marketing ');
const OPS_A = labelId('Operations');
const OPS_B = labelId('operations ');
const HARD = labelId(`${DIFFICULTY_LABEL_PREFIX}Hard`);
const URGENT = labelId(URGENT_LABEL_NAME);

/**
 * the card `c1` wears Client Services (the value a re-tag moves away from)
 * plus Urgent and Difficulty: Hard — both ON the card, so only the reserved
 * filter stands between a reserved previousTag and a DELETE
 */
const CARD = {
  id: 'c1',
  labels: [
    { id: CS, name: 'Client Services' },
    { id: URGENT, name: URGENT_LABEL_NAME },
    { id: HARD, name: `${DIFFICULTY_LABEL_PREFIX}Hard` },
  ],
};

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
    // People resolves on the board (cleanly, not reserved); the card does not wear it
    expect(isReservedLabelName('People')).toBe(false);
    await client.setClassification(CARD.id, BOARD.id, 'Marketing', 'People');
    expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`]);
  });

  it('resolves to the board label\'s CANONICAL name, trimmed — the tag\'s own spelling is never what gets stored', async () => {
    const { client } = makeFetch();
    await expect(client.setClassification(CARD.id, BOARD.id, ' marketing ')).resolves.toBe(canonicalOf(MK));
    await expect(client.setClassification(CARD.id, BOARD.id, 'CLIENT SERVICES')).resolves.toBe(canonicalOf(CS));
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
/* reserved taxonomy — W4 writes the business-unit label and NOTHING else   */
/* (review F1, 2026-09-11; invariant 2)                                     */
/* ---------------------------------------------------------------------- */

describe('setClassification — reserved taxonomy is refused, never assigned or stripped through W4', () => {
  /**
   * The finding's own inputs, DERIVED from the constants the mapper and the
   * W1/W3 setters use — each is a tag a sheet cell could carry. Every one
   * resolves to EXACTLY ONE board label, so the refusal below can only be the
   * reserved filter (not unmatched, not ambiguous).
   */
  const RESERVED_TAGS = [
    URGENT_LABEL_NAME.toLowerCase(),
    ` ${DIFFICULTY_LABEL_PREFIX.toLowerCase()}easy `,
    MAIN_CARD_LABEL.toLowerCase(),
    `${BLOCKER_LABEL_PREFIX} blocked`,
  ];

  it('the reserved set is the mapper\'s taxonomy — executed against mapTrello, not compared as strings', () => {
    const taxonomy = [MAIN_CARD_LABEL, `${DIFFICULTY_LABEL_PREFIX}Hard`, URGENT_LABEL_NAME, `${BLOCKER_LABEL_PREFIX} awaiting brief`];
    const r = mapTrello(
      [aresCard({ cardId: 'k1', name: 'MC-1 / Main Card: x', labels: taxonomy.map((name, i) => ({ id: `l${i}`, name })) })],
      null,
    );
    // kind, difficulty, urgency and blocker are all READ from these names by the mapper
    expect(r.deliverables).toHaveLength(1);
    expect(r.deliverables[0]).toMatchObject({ difficulty: 'Hard', urgent: true, blocker: 'awaiting brief' });
    for (const l of taxonomy) expect(isReservedLabelName(l)).toBe(true);
    expect(isReservedLabelName('Client Services')).toBe(false);
    expect(isReservedLabelName('Marketing')).toBe(false);
  });

  for (const tag of RESERVED_TAGS) {
    it(`tag ${JSON.stringify(tag)} resolves to one board label yet is REFUSED with reason \`reserved\`; no POST`, async () => {
      expect(resolveLabelIds(BOARD.labels, tag)).toHaveLength(1);
      const { ops, client } = makeFetch();
      const err = await client.setClassification(CARD.id, BOARD.id, tag).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnknownClassificationLabel);
      expect(err).toMatchObject({ boardId: BOARD.id, tag, reason: 'reserved' });
      expect(writesOf(ops)).toEqual([]);
      expect(ops).not.toContain(CREATE_LABEL);
    });
  }

  for (const previousTag of [`${DIFFICULTY_LABEL_PREFIX}Hard`, URGENT_LABEL_NAME]) {
    it(`previousTag ${JSON.stringify(previousTag)} — resolves, ON the card — is skipped silently: no DELETE of a registry label`, async () => {
      const id = labelId(previousTag);
      expect(CARD.labels.some((l) => l.id === id)).toBe(true); // on the card: only the reserved filter prevents the DELETE
      const { ops, client } = makeFetch();
      await client.setClassification(CARD.id, BOARD.id, 'Marketing', previousTag);
      expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`]);
      expect(ops).not.toContain(`DELETE /cards/${CARD.id}/idLabels/${id}`);
    });
  }
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
  afterEach(() => {
    vi.restoreAllMocks();
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
        tag: ' marketing ', // the raw tag; the CANONICAL board name is what lands (review F2)
        actor: ACTOR,
      });
      expect(res).toEqual({ ok: true, noop: false, before: 'Client Services', after: canonicalOf(MK) });
      expect(writesOf(ops)).toEqual([`POST /cards/${CARD.id}/idLabels`, `DELETE /cards/${CARD.id}/idLabels/${CS}`]);

      const after = await reload(entity);
      expect(after?.unit_label).toBe(canonicalOf(MK));
      expect(after?.unit_label).not.toBe(' marketing ');
      expect(after?.registry_written_at).toBeInstanceOf(Date);

      const row = await AuditLog.findOne({ action: 'classification.set' });
      expect(row?.project_id?.toString()).toBe(project._id.toString());
      expect(row?.actor).toBe(ACTOR);
      expect(row?.entity).toBe(entity);
      expect(row?.entity_id).toBe(CARD.id);
      expect(row?.before).toEqual({ unit_label: 'Client Services' });
      expect(row?.after).toEqual({ unit_label: canonicalOf(MK) }); // the stored value, not the raw tag
      expect(await AuditLog.countDocuments()).toBe(1);

      const run = await SyncRun.findOne({ source: 'trello_write' });
      expect(run?.ok).toBe(true);
      expect(run?.project_id?.toString()).toBe(project._id.toString());
      expect(run?.stats).toMatchObject({ kind: 'classification', entity, cardId: CARD.id, unit_label: canonicalOf(MK) });
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

  it('no-op guard compares NORMALISED (trim + case-fold), as the resolver matches — a case/whitespace-only change is not an act (review F2)', async () => {
    const { project, doc } = await seed('work_card', 'Marketing');
    const { ops, client } = makeFetch();
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'work_card', doc, tag: ' marketing', actor: ACTOR,
    });
    // `after` is the STORED value — the document keeps its spelling
    expect(res).toEqual({ ok: true, noop: true, before: 'Marketing', after: 'Marketing' });
    expect(ops).toEqual([]);
    const after = await reload('work_card');
    expect(after?.unit_label).toBe('Marketing');
    expect(after?.registry_written_at).toBeUndefined(); // no phantom stamp shielding the other registry fields
    expect(await AuditLog.countDocuments()).toBe(0);
    expect(await SyncRun.countDocuments()).toBe(0);
  });

  it('a stored null is never "the same" as a blank tag — that goes to Trello and is refused as unmatched, as before', async () => {
    const { project, doc } = await seed('deliverable', null);
    const { ops, client } = makeFetch();
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'deliverable', doc, tag: '  ', actor: ACTOR,
    });
    expect(res.ok).toBe(false);
    expect(writesOf(ops)).toEqual([]);
    expect(await SyncRun.countDocuments({ source: 'trello_write', ok: false })).toBe(1);
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

  it('a reserved tag is REFUSED AND SURFACED through the commit half like any refusal: no write, no local change, reason in the rows', async () => {
    const { project, doc } = await seed('deliverable', null);
    const { ops, client } = makeFetch();
    const tag = URGENT_LABEL_NAME.toLowerCase();
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'deliverable', doc, tag, actor: ACTOR,
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/reserved/);
    expect(writesOf(ops)).toEqual([]);
    expect((await reload('deliverable'))?.unit_label).toBeNull();
    expect((await SyncRun.findOne({ source: 'trello_write' }))?.error).toMatch(/reserved/);
  });

  /* review F4: the failure branch must not depend on the store that just failed */

  it('audit_log down AFTER Trello + save succeeded: the promise RESOLVES ok:false, and the sync_runs row still lands (run row first)', async () => {
    const { project, doc } = await seed('work_card', 'Client Services');
    const { ops, client } = makeFetch();
    vi.spyOn(AuditLog, 'create').mockRejectedValue(new Error('audit down'));
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'work_card', doc, tag: 'Marketing', actor: ACTOR,
    });
    expect(res).toMatchObject({ ok: false, error: 'audit down', before: 'Client Services' });
    expect(writesOf(ops)).toHaveLength(2); // Trello did the swap; the header states this residual
    const run = await SyncRun.findOne({ source: 'trello_write' });
    expect(run?.ok).toBe(false);
    expect(run?.error).toBe('audit down');
    expect(run?.stats).toMatchObject({ cardId: CARD.id, kind: 'classification', entity: 'work_card' });
    expect(await SyncRun.countDocuments({ source: 'trello_write' })).toBe(1);
  });

  it('BOTH stores down: nothing escapes — ok:false, no throw (the residual the header states)', async () => {
    const { project, doc } = await seed('work_card', 'Client Services');
    const { client } = makeFetch({ failAdd: true });
    vi.spyOn(AuditLog, 'create').mockRejectedValue(new Error('audit down'));
    vi.spyOn(SyncRun, 'create').mockRejectedValue(new Error('runs down'));
    const res = await applyClassificationWrite({
      trello: client, projectId: project._id, boardId: BOARD.id, cardId: CARD.id, entity: 'work_card', doc, tag: 'Marketing', actor: ACTOR,
    });
    expect(res).toMatchObject({ ok: false, before: 'Client Services' });
    expect(res.ok === false && res.error).toMatch(/HTTP 500/); // the ORIGINAL failure is what surfaces, not a store's
    expect((await reload('work_card'))?.unit_label).toBe('Client Services');
  });
});
