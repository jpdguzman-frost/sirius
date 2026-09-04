/**
 * The shared fixture for the write-registry suites — W1 urgency, W2 deadline,
 * W3 difficulty (simplification pass 2026-09-05). All three had kept a
 * byte-identical copy of the same setup: one project on a test board, one main
 * card, one task card under it, a signed-in member of that project, and a
 * Trello stub. Three copies of a fixture is three places for the guards to
 * drift apart on what "a card" is.
 *
 * ONE stub records ALL THREE setters. Each private copy implemented only the
 * setter its own suite exercised and left the other two as no-ops, so a suite
 * could not have noticed a route calling the wrong one; here every call is
 * recorded on its own array and `fail` fails whichever setter runs, which is
 * what the rollback cases (invariant 8) ask for.
 *
 * The fixture builds only what it is asked for: pass `task` to get the work
 * card, leave it out for a group with none. What each suite still owns is its
 * own overrides — the difficulty suite seeds both cards Medium, the deadline
 * suite seeds dues — because those ARE the cases under test.
 */

import request from 'supertest';
import { createApp } from '../../src/app.ts';
import { validateEnv } from '../../src/config/env.ts';
import type { TrelloWriter } from '../../lib/trello.ts';
import { Deliverable, Project, User, UserProject, WorkCard } from '../../src/models/index.ts';

export class StubTrello implements TrelloWriter {
  urgencyCalls: Array<{ cardId: string; boardId: string; urgent: boolean }> = [];
  dueCalls: Array<{ cardId: string; dueIso: string | null }> = [];
  difficultyCalls: Array<{ cardId: string; boardId: string; difficulty: string }> = [];
  /** when set, the NEXT call of any setter throws — the Trello-failure half of invariant 8 */
  fail = false;

  async ensureUrgentLabel(): Promise<string> {
    return 'label-1';
  }

  async setUrgency(cardId: string, boardId: string, urgent: boolean): Promise<void> {
    if (this.fail) throw new Error('Trello POST /cards failed: HTTP 500');
    this.urgencyCalls.push({ cardId, boardId, urgent });
  }

  async setDue(cardId: string, dueIso: string | null): Promise<void> {
    if (this.fail) throw new Error('Trello PUT /cards failed: HTTP 500');
    this.dueCalls.push({ cardId, dueIso });
  }

  async setDifficulty(cardId: string, boardId: string, difficulty: 'Easy' | 'Medium' | 'Hard'): Promise<void> {
    if (this.fail) throw new Error('Trello POST /cards failed: HTTP 500');
    this.difficultyCalls.push({ cardId, boardId, difficulty });
  }
}

export interface WriteFixtureOptions {
  /** merged over `NODE_ENV: 'test'` — the board guard cases set PROD_TRELLO_BOARD_IDS */
  env?: Record<string, string>;
  /** merged over the project — the G7 cases set `writes_enabled: false` */
  project?: Record<string, unknown>;
  /** merged over the main card `card1` */
  deliverable?: Record<string, unknown>;
  /** merged over the task card `task1`; OMIT for an MC group with no work card */
  task?: Record<string, unknown>;
}

/**
 * One MC group: the main card `card1` and, when `task` is given, the task card
 * `task1` under it. Which of the two a registry entry may write is the thing
 * the suites assert, so both exist side by side and neither is a stand-in for
 * the other.
 */
export async function setupWriteFixture(opts: WriteFixtureOptions = {}) {
  const env = validateEnv({ NODE_ENV: 'test', ...(opts.env ?? {}) });
  const project = await Project.create({
    code: 'rt-837', name: 'Fx', trello_board_id: 'testBoardX', weekly_capacity: 3, ...(opts.project ?? {}),
  });
  const user = await User.create({ email: 'pm@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  await Deliverable.create({
    project_id: project._id, mc_number: 'MC-1', display_id: 'MC-1', trello_card_id: 'card1', name: 'D1',
    ...(opts.deliverable ?? {}),
  });
  if (opts.task) {
    await WorkCard.create({
      project_id: project._id, mc_number: 'MC-1', trello_card_id: 'task1',
      name: 'Render Asset: MC-1 exports', current_list: 'Backlogs', ...opts.task,
    });
  }
  const trello = new StubTrello();
  const app = createApp({ env, redis: null, mongo: null, trello });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, user, agent, trello, app };
}
