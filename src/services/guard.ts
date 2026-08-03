/**
 * Invariant 17 guardrail: staging (and any non-production environment) must
 * point at a DUPLICATE Trello board. The urgency write path is real — a test
 * against a live board would relabel real cards.
 *
 * PROD_TRELLO_BOARD_IDS lists the production boards. Outside production,
 * configuring any of them is a refusal to start, not a warning.
 */

import type { Env } from '../config/env.ts';

export function assertNotProductionBoards(env: Env, configuredBoardIds: string[]): void {
  if (env.NODE_ENV === 'production') return;
  const prodIds = (env.PROD_TRELLO_BOARD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const offending = configuredBoardIds.filter((id) => prodIds.includes(id));
  if (offending.length > 0) {
    throw new Error(
      `[sirius] REFUSING TO START: ${env.NODE_ENV} is configured with PRODUCTION Trello board(s) ` +
        `${offending.join(', ')} — staging must use a duplicate board (invariant 17)`,
    );
  }
}
