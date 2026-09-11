/**
 * The shared prelude of test/sprint-items.test.ts, split 2026-09-11 (block 9,
 * PLAN.md: the file was 73KB and its plot-guard half — section G — moved to
 * test/sprint-items-plot.test.ts, where the fourth guard, the week helpers
 * and the re-date cases join it). Moved here VERBATIM so the two halves keep
 * one definition of "a member signed into a project with one sprint and one
 * MC group", one way of reading the schedule, and one way of turning a day
 * into a holiday — a second copy is how two halves of one suite drift on what
 * they are testing (the test/helpers/schedule-fixture.ts lesson).
 *
 * Each half still owns what is its own: the race seam (`interruptFirstInsert`)
 * and Sprint 13 stay with the CRUD/membership half; the plot half owns nothing
 * shared. The DB lifecycle (`startTestDb` / `clearCollections`) is each
 * file's, because vitest scopes hooks per file.
 */

import { expect } from 'vitest';
import request from 'supertest';
import type { Types } from 'mongoose';
import { createApp } from '../../src/app.ts';
import { validateEnv } from '../../src/config/env.ts';
import { loadPipeline } from '../../src/services/pipeline.ts';
import { getHolidays, setHolidays } from '../../lib/calendar.ts';
import { firstWorkdayOfWeek, weekKeyOf } from '../../src/services/sprint-items.ts';
import { Deliverable, Project, Sprint, User, UserProject } from '../../src/models/index.ts';

const env = validateEnv({ NODE_ENV: 'test' });

export async function setup() {
  const project = await Project.create({
    code: 'rt-837', name: 'Fx', trello_board_id: 'fxA', weekly_capacity: 22,
  });
  const user = await User.create({ email: 'ops@frostdesigngroup.com' });
  await UserProject.create({ user_id: user._id, project_id: project._id });
  const sprint = await Sprint.create({
    project_id: project._id, name: 'Sprint 12', starts_on: '2026-08-03', ends_on: '2026-08-14', position: 0,
  });
  // the MC group: one main card with a client date — which a row does NOT
  // inherit since owl #78 §2, any more than it inherits the group's urgency
  // (#78 §1). The asset badge is the one thing a row reads off the group,
  // and only when the group agrees (section E).
  await Deliverable.create({
    project_id: project._id, mc_number: 'MC-07', display_id: 'MC-07', trello_card_id: 'main07',
    name: 'GCat Twirling', difficulty: 'Medium', lane: 'design', current_list: 'Design',
    sheet_deadline: '2026-12-31',
  });
  const app = createApp({ env, redis: null, mongo: null });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: String(user._id), email: user.email }).expect(200);
  return { project, sprint, agent };
}

/* Through `loadPipeline`, not `loadSprintItems` directly — sprint items are
   opt-in on that call, so going the real route also proves the one caller that
   asks for them actually gets them. */
export const load = async (projectId: Types.ObjectId) =>
  (await loadPipeline(projectId, '2026-08-03', 22, { withSprintItems: true })).sprintItems;

export const itemUrl = (pid: unknown, id: string) => `/api/projects/${pid}/sprint-items/${id}`;
export const add = (agent: ReturnType<typeof request.agent>, pid: unknown, body: Record<string, unknown>) =>
  agent.post(`/api/projects/${pid}/sprint-items`).send(body);
/** Add All — the search row's one request carrying the listed ids (owl #77 §0). */
export const batch = (agent: ReturnType<typeof request.agent>, pid: unknown, body: Record<string, unknown>) =>
  agent.post(`/api/projects/${pid}/sprint-items/batch`).send(body);
/**
 * add + plot, the pair almost every case needs. Returns the item id.
 *
 * TWO OWNERS SINCE BLOCK 9 (owls #88/#89; PLAN.md "Server"): a row with no
 * day cannot take one from a day write — that is the Design Lead's act, on
 * Deadlines, which lists placed rows only (the route answers 422 NOT_PLACED).
 * So the fixture performs the two legal acts in order: the PM's week click
 * (`{ week }`, landing on the week's first WORKING day — #89 §2) and then,
 * only when the day asked for is not that day, the Design Lead's day move
 * inside the week (`{ starts_on }`). A Monday on an ordinary week is ONE
 * write and one `sprintItem.plot` audit row, as before; a mid-week day is
 * two. Callers that count audit rows read the count AFTER this returns.
 */
export const addAndPlot = async (
  agent: ReturnType<typeof request.agent>,
  pid: unknown,
  cardId: string,
  sprintId: string,
  day: string,
) => {
  const res = await add(agent, pid, { sprint_id: sprintId, card_id: cardId }).expect(201);
  const week = weekKeyOf(day);
  await agent.patch(itemUrl(pid, res.body.id)).send({ week }).expect(200);
  if (firstWorkdayOfWeek(week) !== day) {
    await agent.patch(itemUrl(pid, res.body.id)).send({ starts_on: day }).expect(200);
  }
  return res.body.id as string;
};

/**
 * Runs `body` with `day` added to the ACTIVE working-day calendar, restoring
 * whatever was loaded before on every path. That is the shape an ARES calendar
 * refresh has mid-session — a day nobody touched becomes a holiday — and the
 * only way to reach `NOT_A_WORKDAY` on a weekday. The restore has to be a
 * `finally`: leak a holiday and the next suite's Wednesday stops being a
 * working day.
 */
export const withHoliday = async (day: string, body: () => Promise<void>) => {
  const restore = getHolidays();
  try {
    setHolidays([...restore, day]);
    /* the three cases below all expect a 200, so a calendar that quietly
       failed to take the day would leave every one of them passing while
       proving nothing. One assertion here covers all three. */
    expect(getHolidays(), `${day} never reached the active working-day calendar`).toContain(day);
    await body();
  } finally {
    setHolidays(restore);
  }
};
