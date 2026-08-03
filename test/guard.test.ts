import { describe, expect, it } from 'vitest';
import { assertNotProductionBoards } from '../src/services/guard.ts';
import { validateEnv } from '../src/config/env.ts';

// Invariant 17: staging points at a DUPLICATE Trello board. A non-production
// environment configured with a production board id refuses to start.
describe('production-board guard (invariant 17)', () => {
  const prodIds = 'boardProd1,boardProd2';

  it('refuses to start when staging is configured with a production board', () => {
    const env = validateEnv({
      NODE_ENV: 'development',
      PROD_TRELLO_BOARD_IDS: prodIds,
    });
    expect(() => assertNotProductionBoards(env, ['boardProd1'])).toThrow(/REFUSING TO START/);
  });

  it('allows duplicate boards outside production', () => {
    const env = validateEnv({
      NODE_ENV: 'development',
      PROD_TRELLO_BOARD_IDS: prodIds,
    });
    expect(() => assertNotProductionBoards(env, ['duplicateBoardX'])).not.toThrow();
  });

  it('does not restrict production itself', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      PROD_TRELLO_BOARD_IDS: prodIds,
      MONGODB_URI: 'mongodb://x',
      REDIS_URL: 'redis://x',
      SESSION_SECRET: 's',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'sec',
      ARES_URL: 'https://ares.example',
      ARES_API_KEY: 'k',
    });
    expect(() => assertNotProductionBoards(env, ['boardProd1'])).not.toThrow();
  });
});
