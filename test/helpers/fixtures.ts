/**
 * Shared route-test fixture: one project, one allow-listed member, a logged-in
 * supertest agent. Every suite that exercises a `/api/projects/:id/...` route
 * needs exactly this preamble — keeping it in one place stops the project and
 * auth shape drifting between suites.
 */

import request from 'supertest';
import { createApp } from '../../src/app.ts';
import { validateEnv } from '../../src/config/env.ts';
import { Project, User, UserProject } from '../../src/models/index.ts';
import type { AresCard, AresLabel } from '../../src/services/ares.ts';

const env = validateEnv({ NODE_ENV: 'test' });

export type TestAgent = ReturnType<typeof request.agent>;

export async function loggedInProjectFixture(over: Record<string, unknown> = {}) {
  const p = await Project.create({
    code: 'rt-837',
    name: 'Fx',
    trello_board_id: 'fxA',
    weekly_capacity: 120,
    ...over,
  });
  const user = await User.create({ email: 'member@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: p._id });
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { p, user, agent };
}

/* ---------------------------------------------------------------------- */
/* ARES card shape — one definition, so a contract field is one edit       */
/* ---------------------------------------------------------------------- */

/**
 * A label as ARES sends it. Was hand-copied byte-for-byte in two suites.
 */
export const label = (name: string): AresLabel => ({ id: `l-${name}`, name });

/**
 * An ARES card carrying everything the CONTRACT guarantees, ready to override.
 *
 * Added 2026-08-25, and the change that prompted it is the argument for it:
 * adding one field (`lastPolledAt`) to the ARES card shape took four edits
 * across three suites, each carrying its own wording of the same explanation.
 * The next contract field would have repeated that, and the three rationales
 * would have drifted apart while nothing kept them honest.
 *
 * `lastPolledAt` is the instant ARES fetched the card from Trello, and the
 * reconcile guard in `worker/syncAres.ts` compares every registry write
 * against it. **Every real ARES card carries one** — it is stamped by both of
 * ARES's writers through one shared `buildCardDoc` (contracts/ares-read.md
 * §Freshness). A fixture WITHOUT it therefore exercises the skip path, not the
 * reconcile: pass `{ lastPolledAt: undefined }` when that is what you mean,
 * and `test/reconcile.test.ts` owns those cases.
 *
 * Defaults are deliberately neutral. A suite with its own card identity layers
 * over them (`const card = (o) => aresCard({ cardId: 'c1', ...o })`) rather
 * than restating the contract fields.
 */
export function aresCard(over: Partial<AresCard> = {}): AresCard {
  return {
    cardId: 'c1',
    boardId: 'b1',
    name: 'MC-1 A card',
    currentList: 'Design',
    labels: [label('Main Card')],
    due: null,
    lastPolledAt: '2026-08-18T12:00:00.000Z',
    ...over,
  } as AresCard;
}
