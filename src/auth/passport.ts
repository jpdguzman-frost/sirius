/**
 * Passport Google OAuth — the four server-side checks (invariant 9, FR-2.1–2.4):
 *
 *   1. verified email
 *   2. `hd` claim = ALLOWED_HD
 *   3. matching email domain (belt and braces with #2)
 *   4. an ACTIVE allow-list document in `users`
 *
 * All four live here, server-side, against the session. The browser never
 * decides anything (FR-2.3). Deactivating the allow-list row cuts access on
 * the next request — deserializeUser re-checks `active` every time (FR-2.5
 * companion; Google refuses deactivated Workspace accounts upstream).
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/index.ts';
import type { Env } from '../config/env.ts';

export interface SignInProfile {
  email?: string;
  email_verified?: boolean | string;
  hd?: string;
  name?: string;
}

export type SignInResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: string };

/** The four checks, in order. Pure decision logic — the tests' target. */
export async function evaluateSignIn(profile: SignInProfile, env: Env): Promise<SignInResult> {
  const verified = profile.email_verified === true || profile.email_verified === 'true';
  if (!verified) {
    return { ok: false, reason: 'Google account email is not verified.' };
  }
  if (profile.hd !== env.ALLOWED_HD) {
    return { ok: false, reason: `Access is limited to ${env.ALLOWED_HD} Google Workspace accounts.` };
  }
  const domain = profile.email?.split('@')[1];
  if (!profile.email || domain !== env.ALLOWED_HD) {
    return { ok: false, reason: `Access is limited to @${env.ALLOWED_HD} email addresses.` };
  }
  const user = await User.findOne({ email: profile.email.toLowerCase() });
  if (!user || !user.active) {
    return { ok: false, reason: 'This account is not on the Sirius allow-list.' };
  }
  user.last_login_at = new Date();
  await user.save();
  return { ok: true, userId: user._id.toString(), email: user.email };
}

export function configurePassport(env: Env): void {
  passport.serializeUser((user, done) => {
    done(null, (user as { userId: string }).userId);
  });

  // Re-checks the allow-list on EVERY request — a deactivated row revokes
  // the session immediately, no manual step.
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await User.findById(id);
      if (!user || !user.active) return done(null, false);
      done(null, { userId: user._id.toString(), email: user.email, name: user.name });
    } catch (err) {
      done(err);
    }
  });

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${env.APP_BASE_URL ?? ''}/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const json = profile._json as SignInProfile;
            const result = await evaluateSignIn(json, env);
            if (!result.ok) return done(null, false, { message: result.reason });
            done(null, { userId: result.userId, email: result.email });
          } catch (err) {
            done(err as Error);
          }
        },
      ),
    );
  }
}

export default passport;
