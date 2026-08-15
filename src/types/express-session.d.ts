/**
 * `returnTo` — the deep link a user asked for before being sent to Google.
 * Stored server-side on the session (never in the OAuth `state`, which the
 * strategy has no store to validate) and consumed once, in the callback.
 */

import 'express-session';

declare module 'express-session' {
  interface SessionData {
    returnTo?: string;
  }
}
