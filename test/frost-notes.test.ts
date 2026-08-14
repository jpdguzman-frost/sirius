/**
 * T094 — frost notes (FR-11; AC-21), corrected status model (owls #13–#15,
 * 2026-08-14): the one Sirius-owned annotation on an intake request.
 *
 * Remark alone never changes status (FR-11.4); the clarification flag flips an
 * unfiled request to 'For Clarification'; a filed request stays 'In Pipeline'
 * regardless (FR-11.3 — the pipeline wins over the flag). Counts are
 * CROSS-CUTTING: toFile is every unfiled row INCLUDING the flagged ones, so
 * requests = inPipeline + toFile, and forClarification is a subset of toFile.
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

interface RequestRow {
  mc_number: string;
  status: string;
  note: { remark: string | null; clarify: boolean; clarify_reason: string | null } | null;
}
interface RequestsBody {
  requests: RequestRow[];
  counts: { requests: number; inPipeline: number; toFile: number; forClarification: number };
}

const rowOf = (body: RequestsBody, mc: string) => body.requests.find((r) => r.mc_number === mc)!;
const statusOf = (body: RequestsBody, mc: string) => rowOf(body, mc)?.status;

describe('frost notes (FR-11)', () => {
  it('AC-21: a remark alone leaves status unchanged; the flag flips it', async () => {
    const { p, agent } = await fixture();

    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'Asked for the brand kit', clarify: false })
      .expect(200);
    let res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    expect(statusOf(res.body, 'MC-702')).toBe('To File'); // remark alone: unchanged
    expect(rowOf(res.body, 'MC-702').note?.remark).toBe('Asked for the brand kit');

    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'Asked for the brand kit', clarify: true })
      .expect(200);
    res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    expect(statusOf(res.body, 'MC-702')).toBe('For Clarification');
    // cross-cutting: the flagged row is still unfiled, so it stays in toFile
    expect(res.body.counts).toMatchObject({ requests: 2, inPipeline: 1, toFile: 1, forClarification: 1 });
  });

  it('counts are cross-cutting: an unfiled flagged row lands in BOTH toFile and forClarification', async () => {
    const { p, agent } = await fixture();
    await IntakeRequest.create({
      project_id: p._id, mc_number: 'MC-703', sheet_row: 5, name: 'Second unfiled thing',
    });

    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'No target size given', clarify: true })
      .expect(200);
    const res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);

    expect(statusOf(res.body, 'MC-702')).toBe('For Clarification');
    expect(statusOf(res.body, 'MC-703')).toBe('To File');
    // REQUESTS = IN PIPELINE + TO FILE; FOR CLARIFICATION is a subset of TO FILE
    expect(res.body.counts).toEqual({ requests: 3, inPipeline: 1, toFile: 2, forClarification: 1 });
    expect(res.body.counts.requests).toBe(res.body.counts.inPipeline + res.body.counts.toFile);

    // the To File card shows every unfiled row, flagged included
    const unfiled = await agent.get(`/api/projects/${p._id}/requests?filter=unfiled`).expect(200);
    expect(unfiled.body.requests.map((r: RequestRow) => r.mc_number)).toEqual(['MC-702', 'MC-703']);
  });

  it('a filed request stays In Pipeline even when flagged — the pipeline wins', async () => {
    const { p, agent } = await fixture();
    await agent
      .put(`/api/projects/${p._id}/requests/MC-655/note`)
      .send({ remark: 'late clarification', clarify: true })
      .expect(200);
    const res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);

    expect(statusOf(res.body, 'MC-655')).toBe('In Pipeline');
    // FR-11.3: filed+flagged is NOT counted as clarification, and not as toFile
    expect(res.body.counts).toEqual({ requests: 2, inPipeline: 1, toFile: 1, forClarification: 0 });
    const clar = await agent.get(`/api/projects/${p._id}/requests?filter=clarification`).expect(200);
    expect(clar.body.requests.map((r: RequestRow) => r.mc_number)).toEqual([]);
  });

  it('the clarify flag without a remark is refused (owl #15: one box, so the remark is the why)', async () => {
    const { p, agent } = await fixture();
    const res = await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ clarify: true })
      .expect(400);
    expect(res.body.error.code).toBe('REMARK_REQUIRED');
    expect(await FrostNote.countDocuments({})).toBe(0);

    // whitespace-only, and a legacy reason with no remark, are equally refused
    const blank = await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: '   ', clarify: true, clarify_reason: 'no longer a substitute' })
      .expect(400);
    expect(blank.body.error.code).toBe('REMARK_REQUIRED');
    expect(await FrostNote.countDocuments({})).toBe(0);
  });

  it('clarify with a remark stores clarify_reason null, even when the field is sent', async () => {
    const { p, agent } = await fixture();
    const put = await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'Need the target size', clarify: true, clarify_reason: 'ignored by the single-box model' })
      .expect(200);
    expect(put.body.note).toEqual({ remark: 'Need the target size', clarify: true, clarify_reason: null });

    const row = await FrostNote.findOne({ project_id: p._id, mc_number: 'MC-702' }).lean();
    expect(row?.remark).toBe('Need the target size');
    expect(row?.clarify).toBe(true);
    expect(row?.clarify_reason ?? null).toBeNull();

    const res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    expect(rowOf(res.body, 'MC-702').note).toEqual({
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

    const res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    expect(statusOf(res.body, 'MC-702')).toBe('For Clarification');
    expect(rowOf(res.body, 'MC-702').note).toEqual({
      remark: null, clarify: true, clarify_reason: 'Legacy: no target size given',
    });
    expect(res.body.counts).toMatchObject({ toFile: 1, forClarification: 1 });
  });

  it('an unknown or inactive MC is 404', async () => {
    const { p, agent } = await fixture();
    await agent
      .put(`/api/projects/${p._id}/requests/MC-999/note`)
      .send({ remark: 'hello', clarify: false })
      .expect(404);
    await IntakeRequest.updateOne({ mc_number: 'MC-702' }, { $set: { active: false } });
    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'hello', clarify: false })
      .expect(404);
  });

  it('clearing removes the row, restores To File, and audits both directions', async () => {
    const { p, agent } = await fixture();
    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'missing sizes', clarify: true })
      .expect(200);
    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: null, clarify: false })
      .expect(200);

    expect(await FrostNote.countDocuments({})).toBe(0);
    const res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    expect(statusOf(res.body, 'MC-702')).toBe('To File');

    const trail = await AuditLog.find({ entity: 'request', entity_id: 'MC-702' }).sort({ at: 1 });
    expect(trail.map((a) => a.action)).toEqual(['frost_note.set', 'frost_note.cleared']);
    expect(trail[0]?.before).toBeNull();
    expect(trail[0]?.after).toMatchObject({ remark: 'missing sizes', clarify: true, clarify_reason: null });
    expect(trail[1]?.after).toBeNull();
  });

  it('an identical PUT is a no-op: no second audit row', async () => {
    const { p, agent } = await fixture();
    const body = { remark: 'same', clarify: false };
    await agent.put(`/api/projects/${p._id}/requests/MC-702/note`).send(body).expect(200);
    const again = await agent.put(`/api/projects/${p._id}/requests/MC-702/note`).send(body).expect(200);
    expect(again.body.noop).toBe(true);
    expect(await AuditLog.countDocuments({ entity: 'request', entity_id: 'MC-702' })).toBe(1);
  });

  it('unknown body fields are refused, not ignored', async () => {
    const { p, agent } = await fixture();
    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'x', clarify: false, status: 'In Pipeline' }) // status is derived, never stored
      .expect(400);
  });

  it('filter=clarification serves the tile', async () => {
    const { p, agent } = await fixture();
    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'r', clarify: true })
      .expect(200);
    const res = await agent.get(`/api/projects/${p._id}/requests?filter=clarification`).expect(200);
    expect(res.body.requests.map((r: RequestRow) => r.mc_number)).toEqual(['MC-702']);
  });
});
