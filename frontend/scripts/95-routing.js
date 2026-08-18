/* ---------- URL routing — the impure half (phase 13h, JP 2026-08-15) ---------- */

/* A COUNTER, not a boolean, so nesting is safe. While it is above zero the
   observer below writes no history entry — which is how boot, popstate and
   normalization avoid pushing states the user never navigated to. Only
   SYNCHRONOUS app.set calls belong inside: Ractive fires observers inside set,
   so an await in `fn` would leak the suppression. */
let routerDepth = 0;
function withRouterSuppressed(fn) {
  routerDepth++;
  try {
    fn();
  } finally {
    routerDepth--;
  }
}

function currentUrl() {
  return window.location.pathname + window.location.search + window.location.hash;
}

/* The canonical URL for the state on screen, or null when no project has
   resolved yet (nothing to name — leave the URL untouched). search/hash ride
   along so a future query parameter survives normalization. */
function currentHref() {
  const project = (app.get('projects') || []).find((p) => p._id === app.get('activeProjectId'));
  if (!project) return null;
  return buildPath(project.code, app.get('activeTab'), BASE) + window.location.search + window.location.hash;
}

/* Rewrite the address bar IN PLACE. Used on boot (so `/rt-test`, `/schedules`
   and `/` grow into their canonical form without a history entry) and after a
   popstate (so a junk entry is corrected where it sits, and pressing back again
   does not walk into it a second time). */
function normalizeUrl() {
  const href = currentHref();
  if (href && href !== currentUrl()) window.history.replaceState(null, '', href);
}

/* One observer over both keypaths: the action is identical for each, and the
   href guard collapses the double fire if a single set changes both. */
app.observe('activeTab activeProjectId', () => {
  if (routerDepth > 0) return;
  const href = currentHref();
  if (!href || href === currentUrl()) return;
  window.history.pushState(null, '', href);
}, { init: false });

/* Back / forward: restore the entry WITHOUT pushing a new one. */
window.addEventListener('popstate', () => {
  const route = parseRoute(window.location.pathname, BASE);
  const projects = app.get('projects') || [];
  const target = (route.project && projects.find((p) => p.code === route.project)) || projects[0] || null;
  const tabs = app.get('tabs') || [];
  const tab = tabs.some((t) => t.id === route.tab) ? route.tab : ROUTE_DEFAULT_TAB;

  const projectChanged = !!target && target._id !== app.get('activeProjectId');
  withRouterSuppressed(() => {
    if (projectChanged) app.set('activeProjectId', target._id);
    if (tab !== app.get('activeTab')) selectTab(tab);
  });
  normalizeUrl();
  if (projectChanged) resetForProjectSwitch(); // async on purpose — same as the switcher
});

loadShell().catch((err) => app.set('banner', `Boot failed: ${err.message}`));
