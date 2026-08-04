/* Sirius frontend API helper — same-origin only; no credential ever lives here. */

/* Base-path awareness: the same built bundle serves at the domain root in dev
   and under /sirius on the platforms host — derive the prefix from our own
   URL (the app always lives at the BASE_PATH root, there is no client routing). */
const BASE = window.location.pathname.replace(/\/(index\.html)?$/, '');

const api = {
  async get(path) {
    const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      // localhost bootstraps via the dev auto-login; everywhere else is Google SSO
      window.location.href = BASE + (window.location.hostname === 'localhost' ? '/auth/dev' : '/auth/google');
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
