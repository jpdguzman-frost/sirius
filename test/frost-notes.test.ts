/**
 * T094 — frost notes (FR-11; AC-21): the one Sirius-owned annotation on an
 * intake request. Remark alone never changes status; the clarification flag
 * flips an unfiled request to 'With Clarification'; a filed request stays
 * 'In Pipeline' regardless. Every change audits; notes never touch the sheet
 * (there is no write path to assert against — the module imports no Sheets
 * client, which log-hygiene/import tests enforce elsewhere).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import {
  AuditLog,
  Deliverable,
  FrostNote,
  IntakeRequest,
  Project,
  User,
  UserProject,
} from '../src/models/index.ts';

const env = validateEnv({ NODE_ENV: 'test' });

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
  const p = await Project.create({ code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 120 });
  const user = await User.create({ email: 'member@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: p._id });
  await IntakeRequest.create({
    project_id: p._id, mc_number: 'MC-702', sheet_row: 3, name: 'Unfiled thing',
  });
  await IntakeRequest.create({
    project_id: p._id, mc_number: 'MC-655', sheet_row: 4, name: 'Filed thing',
  });
  await Deliverable.create({
    project_id: p._id, mc_number: 'MC-655', display_id: 'MC-655', trello_card_id: 'c1', name: 'Filed one',
  });
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { p, agent };
}

const statusOf = (body: { requests: Array<{ mc_number: string; status: string }> }, mc: string) =>
  body.requests.find((r) => r.mc_number === mc)?.status;

describe('frost notes (FR-11)', () => {
  it('AC-21: a remark alone leaves status unchanged; the flag flips it', async () => {
    const { p, agent } = await fixture();

    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'Asked for the brand kit', clarify: false })
      .expect(200);
    let res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    expect(statusOf(res.body, 'MC-702')).toBe('For Filing'); // remark alone: unchanged
    expect(res.body.requests.find((r: { mc_number: string }) => r.mc_number === 'MC-702').note.remark)
      .toBe('Asked for the brand kit');

    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: 'Asked for the brand kit', clarify: true, clarify_reason: 'No target size given' })
      .expect(200);
    res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    expect(statusOf(res.body, 'MC-702')).toBe('With Clarification');
    expect(res.body.counts).toMatchObject({ requests: 2, inPipeline: 1, forFiling: 0, forClarification: 1 });
  });

  it('a filed request stays In Pipeline even when flagged — the pipeline wins', async () => {
    const { p, agent } = await fixture();
    await agent
      .put(`/api/projects/${p._id}/requests/MC-655/note`)
      .send({ clarify: true, clarify_reason: 'late clarification' })
      .expect(200);
    const res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    expect(statusOf(res.body, 'MC-655')).toBe('In Pipeline');
  });

  it('the clarify flag without a reason is refused', async () => {
    const { p, agent } = await fixture();
    const res = await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ clarify: true })
      .expect(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(await FrostNote.countDocuments({})).toBe(0);
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

  it('clearing removes the row, restores For Filing, and audits both directions', async () => {
    const { p, agent } = await fixture();
    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ clarify: true, clarify_reason: 'missing sizes' })
      .expect(200);
    await agent
      .put(`/api/projects/${p._id}/requests/MC-702/note`)
      .send({ remark: null, clarify: false })
      .expect(200);

    expect(await FrostNote.countDocuments({})).toBe(0);
    const res = await agent.get(`/api/projects/${p._id}/requests`).expect(200);
    expect(statusOf(res.body, 'MC-702')).toBe('For Filing');

    const trail = await AuditLog.find({ entity: 'request', entity_id: 'MC-702' }).sort({ at: 1 });
    expect(trail.map((a) => a.action)).toEqual(['frost_note.set', 'frost_note.cleared']);
    expect(trail[0]?.before).toBeNull();
    expect(trail[0]?.after).toMatchObject({ clarify: true, clarify_reason: 'missing sizes' });
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
      .send({ clarify: true, clarify_reason: 'r' })
      .expect(200);
    const res = await agent.get(`/api/projects/${p._id}/requests?filter=clarification`).expect(200);
    expect(res.body.requests.map((r: { mc_number: string }) => r.mc_number)).toEqual(['MC-702']);
  });
});
