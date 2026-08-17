/**
 * T141 — the STATUS vocabulary guard (owls #34–#35, 2026-08-17).
 *
 * STATUS on the requests payload is TWO-valued and derives from the Trello
 * join alone: 'In Pipeline' when the MC group has deliverables, 'For Filing'
 * when it does not. The clarification flag is NOTE state; it never appears in
 * — and never rewrites — the status field.
 *
 * frost-notes.test.ts proves the note behaviour case by case. This suite
 * proves the SHAPE of the vocabulary across all four combinations of
 * (filed | unfiled) × (flagged | not) at once, so a third literal cannot creep
 * back in through one branch that no other test happens to exercise:
 *
 *   MC-A  filed,   no note      → In Pipeline
 *   MC-B  unfiled, no note      → For Filing
 *   MC-C  unfiled, flagged      → For Filing   (and in the clarification set)
 *   MC-D  filed,   flagged      → In Pipeline  (and in NEITHER unfiled set)
 *
 * MC-D is the owl #14 invariant that survived the rewrite: forClarification is
 * a strict SUBSET of the unfiled set, so a filed row can never enter it however
 * it is flagged. The counts are the same numbers the three-state model produced
 * for every input — the rename is a vocabulary change, not a counting change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { loggedInProjectFixture } from './helpers/fixtures.ts';
import { byMc, getRequests, mcsOf, putNote } from './helpers/requests.ts';
import { Deliverable, IntakeRequest } from '../src/models/index.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ROUTE_SRC = fs.readFileSync(path.join(dir, '..', 'src', 'routes', 'requests.ts'), 'utf8');

/** The two literals the payload may carry, and nothing else. */
const VOCABULARY = ['In Pipeline', 'For Filing'];

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

/** All four (filed × flagged) combinations in ONE project, in sheet_row order. */
async function fourWays() {
  const { p, agent } = await loggedInProjectFixture();
  const rows: [string, number, string][] = [
    ['MC-A', 1, 'Filed, unflagged'],
    ['MC-B', 2, 'Unfiled, unflagged'],
    ['MC-C', 3, 'Unfiled, flagged'],
    ['MC-D', 4, 'Filed, flagged'],
  ];
  for (const [mc_number, sheet_row, name] of rows) {
    await IntakeRequest.create({ project_id: p._id, mc_number, sheet_row, name });
  }
  for (const mc of ['MC-A', 'MC-D']) {
    await Deliverable.create({
      project_id: p._id, mc_number: mc, display_id: mc, trello_card_id: `c-${mc}`, name: `${mc} card`,
    });
  }
  return { p, agent };
}

type Fixture = Awaited<ReturnType<typeof fourWays>>;

/** Flag one unfiled row and one filed row — the pair the rule turns on. */
const flagBoth = async ({ p, agent }: Fixture) => {
  await putNote(agent, p._id, 'MC-C', { remark: 'needs the target size', clarify: true }).expect(200);
  await putNote(agent, p._id, 'MC-D', { remark: 'flagged after filing', clarify: true }).expect(200);
};

describe('requests STATUS vocabulary (owls #34–#35; FR-11.3)', () => {
  it('only ever emits the two literals, across all four filed × flagged combinations', async () => {
    const fx = await fourWays();
    const { p, agent } = fx;
    await flagBoth(fx);
    const res = await getRequests(agent, p._id);

    // asserted over the WHOLE payload, not row by row: a third literal
    // reintroduced on any branch fails here
    expect([...new Set(res.requests.map((r) => r.status))].sort()).toEqual([...VOCABULARY].sort());
    for (const r of res.requests) expect(VOCABULARY).toContain(r.status);

    const statusOf = (mc: string) => byMc(res.requests, mc).status;
    expect(statusOf('MC-A')).toBe('In Pipeline');
    expect(statusOf('MC-B')).toBe('For Filing');
    expect(statusOf('MC-C')).toBe('For Filing'); // flag does NOT move it
    expect(statusOf('MC-D')).toBe('In Pipeline'); // flag does NOT move it
  });

  it('every row still carries a note key — the client predicate reads it, not the status', async () => {
    const fx = await fourWays();
    const { p, agent } = fx;
    await flagBoth(fx);
    const res = await getRequests(agent, p._id);

    for (const r of res.requests) expect(r).toHaveProperty('note');
    expect(byMc(res.requests, 'MC-A').note).toBeNull();
    expect(byMc(res.requests, 'MC-B').note).toBeNull();
    expect(byMc(res.requests, 'MC-C').note).toEqual({
      remark: 'needs the target size', clarify: true, clarify_reason: null,
    });
    expect(byMc(res.requests, 'MC-D').note).toEqual({
      remark: 'flagged after filing', clarify: true, clarify_reason: null,
    });
  });

  it('counts hold the cross-cutting invariants and the filed+flagged row is excluded', async () => {
    const fx = await fourWays();
    const { p, agent } = fx;
    await flagBoth(fx);
    const { counts } = await getRequests(agent, p._id);

    expect(counts).toEqual({ requests: 4, inPipeline: 2, toFile: 2, forClarification: 1 });
    expect(counts.requests).toBe(counts.inPipeline + counts.toFile);
    expect(counts.forClarification).toBeLessThanOrEqual(counts.toFile);
  });

  it('a note save moves no count but forClarification', async () => {
    const { p, agent } = await fourWays();
    const before = (await getRequests(agent, p._id)).counts;
    expect(before).toEqual({ requests: 4, inPipeline: 2, toFile: 2, forClarification: 0 });

    // a plain remark changes NOTHING — all four counts identical
    await putNote(agent, p._id, 'MC-B', { remark: 'chased the requestor', clarify: false }).expect(200);
    expect((await getRequests(agent, p._id)).counts).toEqual(before);

    // flagging a FILED row changes nothing either (owl #14)
    await putNote(agent, p._id, 'MC-D', { remark: 'flagged after filing', clarify: true }).expect(200);
    expect((await getRequests(agent, p._id)).counts).toEqual(before);

    // flagging an UNFILED row moves forClarification and only forClarification
    await putNote(agent, p._id, 'MC-C', { remark: 'needs the target size', clarify: true }).expect(200);
    const after = (await getRequests(agent, p._id)).counts;
    expect(after).toEqual({ ...before, forClarification: 1 });
  });

  it('the ?filter= segments partition on the same rule the counts do', async () => {
    const fx = await fourWays();
    const { p, agent } = fx;
    await flagBoth(fx);

    const filed = await getRequests(agent, p._id, '?filter=filed');
    expect(mcsOf(filed.requests)).toEqual(['MC-A', 'MC-D']);

    const unfiled = await getRequests(agent, p._id, '?filter=unfiled');
    expect(mcsOf(unfiled.requests)).toEqual(['MC-B', 'MC-C']);

    // MC-D is filed AND flagged: it must not reach the clarification tile
    const clar = await getRequests(agent, p._id, '?filter=clarification');
    expect(mcsOf(clar.requests)).toEqual(['MC-C']);
    expect(mcsOf(clar.requests).every((mc) => mcsOf(unfiled.requests).includes(mc))).toBe(true);
  });

  it('the retired literals are gone from the route source, so the rename cannot half-land', () => {
    // comments are stripped first: the header legitimately NAMES the retired
    // values while explaining the change, and that prose must not read as code
    const code = ROUTE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const dead of ['To File', 'For Clarification']) {
      expect(code).not.toContain(`'${dead}'`);
      expect(code).not.toContain(`"${dead}"`);
    }
    // and the surviving two are spelled ONCE each — the STATUS table
    expect(code.match(/'In Pipeline'/g)).toHaveLength(1);
    expect(code.match(/'For Filing'/g)).toHaveLength(1);
  });
});
