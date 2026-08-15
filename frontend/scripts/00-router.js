/* Sirius URL routing — the PURE half (phase 13h, JP-approved 2026-08-15).
   Path shape below BASE: `/<project-code>/<tab>`.

   Everything here is a pure function: no window, no history, no Ractive. The
   impure glue (currentHref/normalizeUrl/the observers/popstate) lives in
   01-app.js, where `app` is declared — which is what lets this file be executed
   in a test with no globals at all (test/routing-client.test.ts).

   ROUTE_TABS + ROUTE_DEFAULT_TAB are duplicated from src/routing/paths.ts: the
   frontend has no module system (build.js concatenates plain scripts) and the
   server cannot import a browser script. test/routing-paths.test.ts asserts the
   two literals never drift apart. */

const ROUTE_TABS = ['requests', 'pipeline', 'schedules', 'deadlines', 'forecast', 'admin'];
const ROUTE_DEFAULT_TAB = 'pipeline';

/**
 * parseRoute(pathname, base) -> { project: string|null, tab: string|null }
 *
 * REPORTS what the URL says; it does not decide. An unknown project code comes
 * back verbatim and an unknown tab comes back null — the caller resolves both
 * against the loaded project list and the user's real tabs, falling back
 * silently (routing is navigation, never access control).
 *
 * A lone segment is the tab-only shorthand when it names a tab (`/schedules`)
 * and a project code otherwise (`/rt-test`).
 */
function parseRoute(pathname, base) {
  let rest = typeof pathname === 'string' ? pathname : '';
  const prefix = typeof base === 'string' ? base : '';
  if (prefix && rest.slice(0, prefix.length) === prefix) rest = rest.slice(prefix.length);

  const segments = rest.split('/').filter((s) => s.length > 0);
  const isTab = (s) => ROUTE_TABS.indexOf(s) >= 0;

  if (segments.length === 0) return { project: null, tab: null };
  if (segments.length === 1) {
    return isTab(segments[0])
      ? { project: null, tab: segments[0] }
      : { project: segments[0], tab: null };
  }
  return { project: segments[0], tab: isTab(segments[1]) ? segments[1] : null };
}

/**
 * buildPath(code, tab, base) -> string
 *
 * The canonical form is ALWAYS `${base}/${code}/${tab}` — never a bare project,
 * never a bare tab. Returns '' when there is no project code (no project
 * loaded yet); the caller must then leave the URL alone.
 */
function buildPath(code, tab, base) {
  if (!code) return '';
  const prefix = typeof base === 'string' ? base : '';
  const resolved = ROUTE_TABS.indexOf(tab) >= 0 ? tab : ROUTE_DEFAULT_TAB;
  return prefix + '/' + code + '/' + resolved;
}
