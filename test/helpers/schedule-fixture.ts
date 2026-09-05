/**
 * The shared fixture for the schedule suites — test/sprint-items.test.ts and
 * test/rollover.test.ts (simplification pass 2026-09-05, R4). Both had kept
 * their own copy of the same two things: #73's sample task card (Medium, in a
 * design lane, a Sketch Asset) and the second project every cross-project
 * guard needs (invariant 1). Two definitions of "a schedulable work card" is
 * two places for the suites to drift apart on what they are testing — the
 * test/helpers/write-fixture.ts lesson, one build later.
 *
 * What each suite still owns is its own overrides and its own scaffolding:
 * rollover seeds the sync_runs row and the sprint its gate cases need; the
 * items suite seeds the MC group's main card and signs a member in. Neither
 * belongs here — a shared fixture that couples the gate cases to the route
 * cases would be the wrong kind of sharing.
 */

import type { Types } from 'mongoose';
import { Project, WorkCard } from '../../src/models/index.ts';

/**
 * #73's sample card: Medium, in a design lane, sketch phase. The LANE comes
 * from the list alone (sprint-items.ts `laneInputs`) — the prefix is a title
 * habit and is here because real card names carry one.
 */
export const SAMPLE_CARD = { difficulty: 'Medium', current_list: 'Working on Design', task_prefix: 'Sketch Asset' };

/** One task card under MC-07 — the sample card with the suite's overrides on top. */
export const mkWorkCard = (projectId: Types.ObjectId, id: string, over: Record<string, unknown> = {}) =>
  WorkCard.create({
    project_id: projectId, mc_number: 'MC-07', trello_card_id: id, name: `Sketch Asset: ${id}`,
    ...SAMPLE_CARD, ...over,
  });

/** A SECOND project, on its own board — every cross-project guard needs one (invariant 1). */
export const otherProject = (over: Record<string, unknown> = {}) =>
  Project.create({ code: 'rt-999', name: 'Other', trello_board_id: 'fxB', weekly_capacity: 22, ...over });
