/* Sirius frontend API helper — same-origin only; no credential ever lives here. */

const api = {
  async get(path) {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      window.location.href = '/auth/dev';
      throw new Error('unauthenticated');
    }
    const body = await res.json();
    if (!res.ok || body.ok === false) throw new Error((body.error && body.error.message) || 'Request failed');
    return body;
  },
  async send(method, path, payload) {
    const res = await fetch(path, {
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
