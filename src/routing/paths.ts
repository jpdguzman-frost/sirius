/**
 * URL routing — the shell whitelist, the login return-to validator, and the
 * base-path stamp (JP-approved 2026-08-15, phase 13h).
 *
 * The app serves ONE html shell for every in-app URL. This module decides which
 * paths that shell owns, and nothing else: routing is navigation, never access
 * control. `/admin` as a URL grants nothing — every admin route still carries
 * ensureAuthenticated + ensureAdmin (invariant 9).
 *
 * Deliberately NOT in lib/ — lib/ is reserved for the ported forecast, planner
 * and calendar engines (invariant 5).
 *
 * `ROUTE_TABS` / `ROUTE_DEFAULT_TAB` are duplicated in
 * `frontend/scripts/00-router.js`: the frontend has no module system (build.js
 * concatenates plain scripts) and the server cannot import a browser script, so
 * the duplication is structural. `test/routing-paths.test.ts` asserts the two
 * literals stay identical.
 */

import { posix } from 'node:path';

/** The six main tabs. Identical to the frontend `activeTab` keys. */
export const ROUTE_TABS = ['requests', 'pipeline', 'schedules', 'deadlines', 'forecast', 'admin'] as const;

export type RouteTab = (typeof ROUTE_TABS)[number];

/** The tab a URL without one resolves to. */
export const ROUTE_DEFAULT_TAB: RouteTab = 'pipeline';

/**
 * First segments the server owns. The shell whitelist rejects these
 * independently of registration order, so a route added AFTER the catch-all
 * still cannot be shadowed by it.
 */
export const ROUTE_RESERVED: ReadonlySet<string> = new Set(['api', 'auth', 'healthz', '__test']);

/** A project code or a tab name: lower-case, digits, hyphens. Never a dot. */
const SEGMENT = /^[a-z0-9-]+$/;

const TABS: readonly string[] = ROUTE_TABS;

/**
 * True when the shell (public/index.html) should answer this BASE-RELATIVE path.
 *
 * Accepts exactly: `/` · `/<seg>` · `/<seg>/<tab>` — one trailing slash
 * tolerated. `<seg>` matches SEGMENT and is not reserved; `<tab>` is a known
 * tab. A single `<seg>` may be either a project code or the accepted
 * tab-only shorthand — the client decides which and normalizes the URL.
 */
export function isShellPath(pathname: string): boolean {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return false;
  if (pathname === '/') return true;

  const trimmed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const segments = trimmed.slice(1).split('/');
  if (segments.length > 2) return false;

  const first = segments[0]!;
  if (!SEGMENT.test(first) || ROUTE_RESERVED.has(first)) return false;
  if (segments.length === 1) return true;

  return TABS.includes(segments[1]!);
}

/** The one file in public/ — the shell, which must never be served unstamped. */
const SHELL_FILE = '/index.html';

/**
 * True when `express.static` would resolve this BASE-RELATIVE path to the shell
 * file itself, under ANY spelling.
 *
 * `index: false` closes the directory door (`/`); this closes the filename one.
 * It cannot be a literal string match: serve-static percent-decodes and
 * normalizes before it looks at disk, so `/index%2Ehtml`, `/%69ndex.html`,
 * `//index.html` and `/foo/../index.html` all reach the same file. Guarding only
 * the literal `/index.html` left those doors open — and an UNSTAMPED shell
 * leaves `window.SIRIUS_BASE` undefined, so `BASE` falls back to `''`: under
 * BASE_PATH every API call 404s and the 401 redirect lands on the wrong mount.
 *
 * Mirrors send.js: decodeURIComponent, reject a NUL byte, then normalize. The
 * comparison is case-insensitive because dev runs on a case-insensitive
 * filesystem (macOS), where `/INDEX.HTML` reaches the file too — deciding here
 * rather than in the filesystem keeps dev and the Linux host identical.
 */
export function resolvesToShellFile(pathname: string): boolean {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false; // malformed escape — serve-static answers 400, never the file
  }
  if (decoded.includes('\0')) return false; // send.js rejects these with 400
  // Trailing slashes stripped last: `/index.html/` survives Express's
  // non-strict routing today, so it must keep redirecting rather than 404.
  return posix.normalize(decoded).replace(/\/+$/, '').toLowerCase() === SHELL_FILE;
}

/**
 * The post-login landing path, or null.
 *
 * A WHITELIST, not a sanitiser: the value must survive `isShellPath`, so
 * `/api/…`, `/auth/…`, `/healthz`, `../`, and every absolute or
 * protocol-relative form are rejected structurally. The result is path-only and
 * same-origin by construction — the caller always prefixes it with BASE_PATH,
 * so no absolute URL is ever built and an open redirect is not expressible.
 */
export function safeReturnTo(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 128) return null;
  if (!raw.startsWith('/')) return null; // absolute URL, bare word, "javascript:"
  if (raw.startsWith('//')) return null; // protocol-relative //evil.example
  if (/[\\\r\n\t\0]/.test(raw)) return null; // "/\evil" (legacy proto-relative), header splitting
  const pathOnly = raw.split(/[?#]/)[0]!; // query + hash discarded, never echoed
  return isShellPath(pathOnly) ? pathOnly : null;
}

/**
 * Stamp `window.SIRIUS_BASE` into the shell so the frontend knows its mount
 * prefix at any URL depth. Deriving it from `location.pathname` stopped being
 * possible the moment the app gained client routing.
 *
 * The anchor is the literal `<head>` on line 3 of frontend/index.html, which
 * build.js never rewrites (it only replaces the three `inject:*` markers), so
 * the stamp always lands before the inlined bundle. `JSON.stringify` is the
 * escape; BASE_PATH is additionally constrained by env.ts to a character set
 * with no quote, `<`, or tag terminator.
 */
export function injectBase(html: string, base: string): string {
  const tag = `<script>window.SIRIUS_BASE=${JSON.stringify(base)}</script>`;
  return html.replace('<head>', `<head>\n${tag}`);
}
