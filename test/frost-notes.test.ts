/**
 * T094 — frost notes (FR-11; AC-21), two-valued status model (owls #34–#35,
 * 2026-08-17): the one Sirius-owned annotation on an intake request.
 *
 * STATUS is the Trello join and nothing else (FR-11.3): 'In Pipeline' when the
 * MC group has deliverables, 'For Filing' when it does not. NEITHER a remark
 * NOR the clarification flag changes it (FR-11.4) — the flag is a property of
 * the NOTE, read from `note.clarify`, and it surfaces in the Remarks cell.
 * The former third value 'For Clarification' is retired; 'To File' is renamed
 * 'For Filing' (the tile keeps its own TO FILE wording, owl #35).
 *
 * Counts are unchanged in every input, and still CROSS-CUTTING: toFile is
 * every unfiled row INCLUDING the flagged ones, so requests = inPipeline +
 * toFile, and forClarification stays a subset of toFile — now derived from
 * (unfiled AND note.clarify), which is exactly the set the retired status
 * value described. A filed+flagged row is In Pipeline only (owl #14).
 *
 * The note is a SINGLE box (owl #15): the remark carries both notes and
 * clarifications, so clarify=true requires the remark (REMARK_REQUIRED) and new
 * writes store clarify_reason null. Legacy rows may still hold text there and
 * must round-trip untouched.
 *
 * Every change audits; notes never touch the sheet (there is no write path to
 * assert against — the module imports no Sheets client, which
 * log-hygiene/import tests enforce elsewhere).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { loggedInProjectFixture } from './helpers/fixtures.ts';
import { byMc, getRequests, mcsOf, putNote, type RequestsBody } from './helpers/requests.ts';
import { AuditLog, Deliverable, FrostNote, IntakeRequest } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

async function fixture() {
  const { p, agent } = await loggedInProjectFixture();
  await IntakeRequest.create({
    project_id: p._id, mc_number: 'MC-702', sheet_row: 3, name: 'Unfiled thing',
  });
  await IntakeRequest.create({
    project_id: p._id, mc_number: 'MC-655', sheet_row: 4, name: 'Filed thing',
  });
  await Deliverable.create({
    project_id: p._id, mc_number: 'MC-655', display_id: 'MC-655', trello_card_id: 'c1', name: 'Filed one',
  });
  return { p, agent };
}

const rowOf = (body: RequestsBody, mc: string) => byMc(body.requests, mc);
const statusOf = (body: RequestsBody, mc: string) => rowOf(body, mc)?.status;

describe('frost notes (FR-11)', () => {
  it('AC-21: neither a remark nor the flag moves status — the flag lands on the note', async () => {
    const { p, agent } = await fixture();

    await putNote(agent, p._id, 'MC-702', { remark: 'Asked for the brand kit', clarify: false }).expect(200);
    let res = await getRequests(agent, p._id);
    expect(statusOf(res, 'MC-702')).toBe('For Filing'); // remark alone: unchanged
    expect(rowOf(res, 'MC-702').note?.remark).toBe('Asked for the brand kit');
    const before = res.counts;

    await putNote(agent, p._id, 'MC-702', { remark: 'Asked for the brand kit', clarify: true }).expect(200);
    res = await getRequests(agent, p._id);
    // owls #34–#35: the flag no longer rewrites STATUS. It is readable only on
    // the note — which is where the Remarks cell renders it.
    expect(statusOf(res, 'MC-702')).toBe('For Filing');
    expect(rowOf(res, 'MC-702').note?.clarify).toBe(true);
    // cross-cutting: the flagged row is still unfiled, so it stays in toFile
    expect(res.counts).toMatchObject({ requests: 2, inPipeline: 1, toFile: 1, forClarification: 1 });
    // and the note save moved NOTHING but forClarification
    expect(before).toMatchObject({ requests: 2, inPipeline: 1, toFile: 1, forClarification: 0 });
  });

  it('counts are cross-cutting: an unfiled flagged row lands in BOTH toFile and forClarification', async () => {
    const { p, agent } = await fixture();
    await IntakeRequest.create({
      project_id: p._id, mc_number: 'MC-703', sheet_row: 5, name: 'Second unfiled thing',
    });

    await putNote(agent, p._id, 'MC-702', { remark: 'No target size given', clarify: true }).expect(200);
    const res = await getRequests(agent, p._id);

    // the flagged and the unflagged unfiled row now read IDENTICALLY in the
    // STATUS column — that is the point of owls #34–#35; only the note differs
    expect(statusOf(res, 'MC-702')).toBe('For Filing');
    expect(statusOf(res, 'MC-703')).toBe('For Filing');
    expect(rowOf(res, 'MC-702').note?.clarify).toBe(true);
    expect(rowOf(res, 'MC-703').note).toBeNull();
    // REQUESTS = IN PIPELINE + TO FILE; FOR CLARIFICATION is a subset of TO FILE
    expect(res.counts).toEqual({ requests: 3, inPipeline: 1, toFile: 2, forClarification: 1 });
    expect(res.counts.requests).toBe(res.counts.inPipeline + res.counts.toFile);

    // the To File card shows every unfiled row, flagged included
    const unfiled = await getRequests(agent, p._id, '?filter=unfiled');
    expect(mcsOf(unfiled.requests)).toEqual(['MC-702', 'MC-703']);
  });

  it('a filed request stays In Pipeline even when flagged — the pipeline wins', async () => {
    const { p, agent } = await fixture();
    await putNote(agent, p._id, 'MC-655', { remark: 'late clarification', clarify: true }).expect(200);
    const res = await getRequests(agent, p._id);

    expect(statusOf(res, 'MC-655')).toBe('In Pipeline');
    // FR-11.3: filed+flagged is NOT counted as clarification, and not as toFile
    expect(res.counts).toEqual({ requests: 2, inPipeline: 1, toFile: 1, forClarification: 0 });
    const clar = await getRequests(agent, p._id, '?filter=clarification');
    expect(mcsOf(clar.requests)).toEqual([]);
  });

  it('the clarify flag without a remark is refused (owl #15: one box, so the remark is the why)', async () => {
    const { p, agent } = await fixture();
    const res = await putNote(agent, p._id, 'MC-702', { clarify: true }).expect(400);
    expect(res.body.error.code).toBe('REMARK_REQUIRED');
    expect(await FrostNote.countDocuments({})).toBe(0);

    // whitespace-only, and a legacy reason with no remark, are equally refused
    const blank = await putNote(agent, p._id, 'MC-702', {
      remark: '   ', clarify: true, clarify_reason: 'no longer a substitute',
    }).expect(400);
    expect(blank.body.error.code).toBe('REMARK_REQUIRED');
    expect(await FrostNote.countDocuments({})).toBe(0);
  });

  it('clarify with a remark stores clarify_reason null, even when the field is sent', async () => {
    const { p, agent } = await fixture();
    const put = await putNote(agent, p._id, 'MC-702', {
      remark: 'Need the target size', clarify: true, clarify_reason: 'ignored by the single-box model',
    }).expect(200);
    expect(put.body.note).toEqual({ remark: 'Need the target size', clarify: true, clarify_reason: null });

    const row = await FrostNote.findOne({ project_id: p._id, mc_number: 'MC-702' }).lean();
    expect(row?.remark).toBe('Need the target size');
    expect(row?.clarify).toBe(true);
    expect(row?.clarify_reason ?? null).toBeNull();

    const res = await getRequests(agent, p._id);
    expect(rowOf(res, 'MC-702').note).toEqual({
      remark: 'Need the target size', clarify: true, clarify_reason: null,
    });
  });

  it('a legacy note (clarify_reason text, no remark) round-trips through GET untouched', async () => {
    const { p, agent } = await fixture();
    await FrostNote.create({
      project_id: p._id,
      mc_number: 'MC-702',
      clarify: true,
      clarify_reason: 'Legacy: no target size given',
      updated_by: 'legacy@frostdesigngroup.com',
    });

    const res = await getRequests(agent, p._id);
    expect(statusOf(res, 'MC-702')).toBe('For Filing');
    expect(rowOf(res, 'MC-702').note).toEqual({
      remark: null, clarify: true, clarify_reason: 'Legacy: no target size given',
    });
    expect(res.counts).toMatchObject({ toFile: 1, forClarification: 1 });
  });

  it('a legacy note carrying BOTH a remark and a reason keeps both', async () => {
    // The two-box editor could fill both fields, so this state exists in the
    // wild. The GET is the reader's ONLY source for the reason — collapsing it
    // to (remark || clarify_reason) anywhere would make the WHY invisible in
    // the tab, unsearchable, and lost on the next Submit.
    const { p, agent } = await fixture();
    await FrostNote.create({
      project_id: p._id,
      mc_number: 'MC-702',
      remark: 'Asked for the brand kit',
      clarify: true,
      clarify_reason: 'No target size given',
      updated_by: 'legacy@frostdesigngroup.com',
    });

    const res = await getRequests(agent, p._id);
    expect(statusOf(res, 'MC-702')).toBe('For Filing');
    expect(rowOf(res, 'MC-702').note).toEqual({
      remark: 'Asked for the brand kit', clarify: true, clarify_reason: 'No target size given',
    });
  });

  it('an unknown or inactive MC is 404', async () => {
    const { p, agent } = await fixture();
    await putNote(agent, p._id, 'MC-999', { remark: 'hello', clarify: false }).expect(404);
    await IntakeRequest.updateOne({ mc_number: 'MC-702' }, { $set: { active: false } });
    await putNote(agent, p._id, 'MC-702', { remark: 'hello', clarify: false }).expect(404);
  });

  it('clearing removes the row, leaves status For Filing, and audits both directions', async () => {
    const { p, agent } = await fixture();
    await putNote(agent, p._id, 'MC-702', { remark: 'missing sizes', clarify: true }).expect(200);
    await putNote(agent, p._id, 'MC-702', { remark: null, clarify: false }).expect(200);

    expect(await FrostNote.countDocuments({})).toBe(0);
    const res = await getRequests(agent, p._id);
    expect(statusOf(res, 'MC-702')).toBe('For Filing');
    expect(res.counts).toEqual({ requests: 2, inPipeline: 1, toFile: 1, forClarification: 0 });

    const trail = await AuditLog.find({ entity: 'request', entity_id: 'MC-702' }).sort({ at: 1 });
    expect(trail.map((a) => a.action)).toEqual(['frost_note.set', 'frost_note.cleared']);
    expect(trail[0]?.before).toBeNull();
    expect(trail[0]?.after).toMatchObject({ remark: 'missing sizes', clarify: true, clarify_reason: null });
    expect(trail[1]?.after).toBeNull();
  });

  it('an identical PUT is a no-op: no second audit row', async () => {
    const { p, agent } = await fixture();
    const body = { remark: 'same', clarify: false };
    await putNote(agent, p._id, 'MC-702', body).expect(200);
    const again = await putNote(agent, p._id, 'MC-702', body).expect(200);
    expect(again.body.noop).toBe(true);
    expect(await AuditLog.countDocuments({ entity: 'request', entity_id: 'MC-702' })).toBe(1);
  });

  it('unknown body fields are refused, not ignored', async () => {
    const { p, agent } = await fixture();
    // status is derived, never stored
    await putNote(agent, p._id, 'MC-702', { remark: 'x', clarify: false, status: 'In Pipeline' }).expect(400);
  });

  it('an unknown ?filter= value returns the unfiltered set, and never reaches Object.prototype', async () => {
    const { p, agent } = await fixture();
    for (const f of ['', 'nope', '__proto__', 'constructor', 'toString']) {
      const res = await getRequests(agent, p._id, `?filter=${encodeURIComponent(f)}`);
      expect(mcsOf(res.requests)).toEqual(['MC-702', 'MC-655']); // sheet_row order
    }
  });

  it('filter=clarification serves the tile, and a FILED flagged row never matches', async () => {
    const { p, agent } = await fixture();
    await putNote(agent, p._id, 'MC-702', { remark: 'r', clarify: true }).expect(200);
    // MC-655 is the FILED row in fixture(): flagging it must not enrol it in
    // the clarification segment, or forClarification stops being a subset of
    // the unfiled set (owl #14, preserved through the owl #34–#35 rewrite)
    await putNote(agent, p._id, 'MC-655', { remark: 'late', clarify: true }).expect(200);

    const res = await getRequests(agent, p._id, '?filter=clarification');
    expect(mcsOf(res.requests)).toEqual(['MC-702']);

    const all = await getRequests(agent, p._id);
    expect(statusOf(all, 'MC-655')).toBe('In Pipeline');
    expect(rowOf(all, 'MC-655').note?.clarify).toBe(true); // flag readable, status untouched
    expect(all.counts).toEqual({ requests: 2, inPipeline: 1, toFile: 1, forClarification: 1 });
  });
});
