/* Sirius frontend API helper — same-origin only; no credential ever lives here. */

/* Base-path awareness: the same built bundle serves at the domain root in dev
   and under /sirius on the platforms host. The server stamps the prefix into
   the shell at serve time (src/app.ts serveShell → injectBase), which is
   deterministic at ANY url depth — deriving it from our own pathname stopped
   working the moment the app gained client routing (/sirius/rt-test/schedules
   would have yielded the whole path as the base). */
const BASE = window.SIRIUS_BASE ?? '';

const api = {
  async get(path) {
    const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      // localhost bootstraps via the dev auto-login; everywhere else is Google
      // SSO. The deep link rides along so sign-in returns to the page that was
      // asked for; the server whitelists it before honouring it.
      const here = window.location.pathname.slice(BASE.length) || '/';
      window.location.href =
        BASE +
        (window.location.hostname === 'localhost' ? '/auth/dev' : '/auth/google') +
        '?returnTo=' + encodeURIComponent(here);
      throw new Error('unauthenticated');
    }
    const body = await res.json();
    if (!res.ok || body.ok === false) throw new Error((body.error && body.error.message) || 'Request failed');
    return body;
  },
  async send(method, path, payload) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    const body = await res.json();
    if (!res.ok || body.ok === false) {
      const err = new Error((body.error && body.error.code) || 'Request failed');
      err.detail = body.error;
      throw err;
    }
    return body;
  },
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function mondayShift(week, weeks) {
  const d = new Date(week + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
