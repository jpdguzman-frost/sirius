/* Sirius frontend — one Ractive instance, ARES conventions.
   Weighted-load constants mirror lib/planner.constants (WEIGHTS, HARD_MIX). */

const WEIGHTS = { Easy: 1, Medium: 2, Hard: 4, '': 2 };
const HARD_IDEAL = 0.083;
const HARD_CEILING = 0.129;

const app = new Ractive({
  target: '#app',
  template: '#tpl-app',
  data: {
    tabs: [
      { id: 'requests', label: 'Requests' },
      { id: 'pipeline', label: 'Pipeline' },
      { id: 'schedules', label: 'Sprint Schedules' },
      { id: 'deadlines', label: 'Deadlines' },
      { id: 'forecast', label: 'Forecast' },
    ],
    activeTab: 'pipeline',
    projects: [],
    activeProjectId: null,
    banner: '',
    sync: null,
    syncLabel: '…',
    // pipeline/schedules/forecast
    rows: [],
    workCardsByMc: {},
    corrections: [],
    sprints: [],
    capacity: { weekly: 0 },
    expanded: {},
    selected: {},
    weekCols: [],
    suggest: null,
    suggestCount: 0,
    sprintModal: false,
    sprintDraft: [],
    sprintError: '',
    hardIdeal: HARD_IDEAL,
    hardCeiling: HARD_CEILING,
    // requests
    requests: [],
    rejects: [],
    requestFilters: ['all', 'filed', 'unfiled', 'missing-deadline'],
    requestFilter: 'all',
    // deadlines
    monthOffset: 0,
    monthLabel: '',
    deadlineWeeks: [],
    deadlineConflicts: [],
    replot: [],
    // model
    modelProvenance: null,
    modelReview: null,
    // helpers used inside the template
    fmt: (iso) => fmtDate(iso),
    pct: (x) => `${Math.round((x || 0) * 1000) / 10}%`,
  },
  computed: {
    schedRows() {
      const rows = this.get('rows');
      const sprints = this.get('sprints');
      return rows
        .filter((r) => r.status !== 'done')
        .map((r) => {
          const s = r.slottedWeek ? sprints.find((sp) => r.slottedWeek >= sp.start && r.slottedWeek <= sp.end) : null;
          return { ...r, sprintName: r.slottedWeek ? (s ? s.name : 'Outside any sprint') : 'Unscheduled' };
        })
        .sort((a, b) => (a.sprintName + a.displayId).localeCompare(b.sprintName + b.displayId));
    },
    forecastRows() {
      return this.get('rows').filter((r) => r.status !== 'done');
    },
  },
});

/* ---------- helpers ---------- */

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayIso(base) {
  const d = new Date(base + 'T00:00:00');
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (day - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

app.set('footClass', (weekKey) => {
  const rows = app.get('schedRows').filter((r) => r.slottedWeek === weekKey);
  const cap = app.get('capacity').weekly || 1;
  const hard = rows.filter((r) => r.difficulty === 'Hard').length;
  const share = rows.length ? hard / rows.length : 0;
  if (rows.length > cap || share > HARD_CEILING) return 'red';
  if (share > HARD_IDEAL) return 'amber';
  return '';
});
app.set('footLabel', (weekKey) => {
  const rows = app.get('schedRows').filter((r) => r.slottedWeek === weekKey);
  const pts = rows.reduce((a, r) => a + (WEIGHTS[r.difficulty || ''] || 2), 0);
  const hard = rows.filter((r) => r.difficulty === 'Hard').length;
  return rows.length ? `${rows.length} (${pts}pt · ${hard}H)` : '';
});

/* ---------- data loading ---------- */

async function loadShell() {
  const me = await api.get('/api/projects');
  app.set('projects', me.projects);
  if (!app.get('activeProjectId') && me.projects.length) {
    app.set('activeProjectId', me.projects[0]._id);
  }
  await loadAll();
}

async function loadAll() {
  const pid = app.get('activeProjectId');
  if (!pid) return;
  try {
    const [pipeline, requests, deadlines, model] = await Promise.all([
      api.get(`/api/projects/${pid}/deliverables`),
      api.get(`/api/projects/${pid}/requests${filterQuery()}`),
      api.get(`/api/projects/${pid}/deadlines`),
      api.get(`/api/projects/${pid}/model`),
    ]);
    const from = mondayIso(todayIso());
    app.set({
      rows: pipeline.rows,
      workCardsByMc: pipeline.workCardsByMc,
      corrections: pipeline.corrections,
      sprints: pipeline.sprints,
      capacity: pipeline.capacity,
      sync: pipeline.sync,
      syncLabel: pipeline.sync ? (pipeline.sync.ok ? `synced ${new Date(pipeline.sync.at).toLocaleTimeString()}` : 'sync failing — showing last good data') : 'no sync yet',
      banner: pipeline.sync && !pipeline.sync.ok ? `Sync error: ${pipeline.sync.error || 'unknown'} — data below is the last good state.` : '',
      requests: requests.requests,
      rejects: requests.rejects,
      weekCols: Array.from({ length: 8 }, (_, i) => ({ key: mondayShift(from, i) })),
      modelProvenance: model.provenance,
      modelReview: model.model.review,
    });
    computeDeadlines(deadlines);
  } catch (err) {
    app.set('banner', `Load failed: ${err.message} — the app stays usable with what it has.`);
  }
}

function filterQuery() {
  const f = app.get('requestFilter');
  return f && f !== 'all' ? `?filter=${f}` : '';
}

function computeDeadlines(payload) {
  const offset = app.get('monthOffset');
  const base = new Date();
  base.setMonth(base.getMonth() + offset, 1);
  const y = base.getFullYear();
  const m = base.getMonth();
  app.set('monthLabel', base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

  const inMonth = payload.milestones.filter((ms) => {
    const d = new Date(ms.date + 'T00:00:00');
    return d.getFullYear() === y && d.getMonth() === m;
  });
  const byWeek = {};
  for (const ms of inMonth) {
    (byWeek[ms.week] = byWeek[ms.week] || []).push(ms);
  }
  app.set({
    deadlineWeeks: Object.keys(byWeek).sort().map((key) => ({ key, items: byWeek[key] })),
    deadlineConflicts: payload.conflicts.filter((c) => inMonth.some((ms) => ms.week === c.week)),
    replot: payload.replot,
  });
}

/* ---------- events ---------- */

app.on({
  noop(ctx) { ctx.event && ctx.event.stopPropagation(); },
  switchTab(_ctx, id) { app.set('activeTab', id); },
  async switchProject() { await loadAll(); },
  async setRequestFilter(_ctx, f) {
    app.set('requestFilter', f);
    const pid = app.get('activeProjectId');
    const res = await api.get(`/api/projects/${pid}/requests${filterQuery()}`);
    app.set({ requests: res.requests, rejects: res.rejects });
  },
  toggleGroup(_ctx, mc) { app.toggle(`expanded.${mc}`); },

  /* schedules */
  dragRow(ctx, cardId) {
    ctx.event.dataTransfer.setData('text/plain', cardId);
    ctx.event.dataTransfer.effectAllowed = 'move';
  },
  dragOver(ctx) { ctx.event.preventDefault(); },
  async dropOnWeek(ctx, weekKey) {
    ctx.event.preventDefault();
    const grabbed = ctx.event.dataTransfer.getData('text/plain');
    await moveRows(grabbed, weekKey);
  },
  async rowKey(ctx, cardId) {
    const key = ctx.event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    ctx.event.preventDefault();
    const row = app.get('schedRows').find((r) => r.cardId === cardId);
    const from = row.slottedWeek || mondayIso(todayIso());
    await moveRows(cardId, mondayShift(from, key === 'ArrowRight' ? 1 : -1));
  },
  async togglePin(_ctx, cardId, pinned) {
    await api.send('PATCH', patchUrl(cardId), { pinned: !pinned });
    await loadAll();
  },
  async duplicateRow(_ctx, cardId) {
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/duplicate`);
    await loadAll();
  },
  async editNote(_ctx, cardId, current) {
    const note = window.prompt('Status override note (empty to clear — reverts to the Trello status):', current || '');
    if (note === null) return;
    await api.send('PATCH', patchUrl(cardId), { status_note: note || null });
    await loadAll();
  },
  async runSuggest() {
    const pid = app.get('activeProjectId');
    const res = await api.send('POST', `/api/projects/${pid}/suggest`, { from: mondayIso(todayIso()), weeks: 8 });
    app.set('suggest', res);
    app.set('suggestCount', Object.keys(res.plan).length);
  },
  clearSuggest() { app.set({ suggest: null, suggestCount: 0 }); },
  async acceptSuggest() {
    const s = app.get('suggest');
    if (!s) return;
    const moves = Object.entries(s.plan).map(([cardId, week]) => ({ cardId, week }));
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/replot`, { moves });
    app.set({ suggest: null, suggestCount: 0 });
    await loadAll();
  },

  /* sprints */
  openSprints() {
    app.set('sprintDraft', app.get('sprints').map((s) => ({ ...s })));
    app.set({ sprintModal: true, sprintError: '' });
  },
  closeSprints() { app.set('sprintModal', false); },
  addSprint() { app.push('sprintDraft', { name: `Sprint ${app.get('sprintDraft').length + 1}`, start: todayIso(), end: todayIso() }); },
  removeSprint(_ctx, idx) { app.splice('sprintDraft', idx, 1); },
  async saveSprints() {
    try {
      await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/sprints`, {
        sprints: app.get('sprintDraft').map((s) => ({ name: s.name, start: s.start, end: s.end })),
      });
      app.set('sprintModal', false);
      await loadAll();
    } catch (err) {
      const issues = err.detail && err.detail.issues;
      app.set('sprintError', issues && issues.length ? issues[0].text : err.message);
    }
  },

  /* deadlines */
  async monthShift(_ctx, dir) {
    app.set('monthOffset', app.get('monthOffset') + dir);
    const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
    computeDeadlines(res);
  },

  /* forecast */
  async setConfidence(ctx, cardId) {
    await api.send('PATCH', patchUrl(cardId), { confidence: ctx.node.value });
    await loadAll();
  },
  async setSla(ctx, cardId, field) {
    const v = ctx.node.value === '' ? null : Number(ctx.node.value);
    await api.send('PATCH', patchUrl(cardId), { [field]: v });
    await loadAll();
  },
});

function patchUrl(cardId) {
  return `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/planning`;
}

/* BR-8: a multi-select drag applies the grabbed row's interval to every selected row. */
async function moveRows(grabbedId, targetWeek) {
  const selected = app.get('selected');
  const rows = app.get('schedRows');
  const grabbed = rows.find((r) => r.cardId === grabbedId);
  if (!grabbed) return;
  const ids = Object.keys(selected).filter((id) => selected[id]);
  const group = ids.length > 1 && ids.includes(grabbedId) ? ids : [grabbedId];
  const from = grabbed.slottedWeek || targetWeek;
  const deltaWeeks = Math.round((Date.parse(targetWeek) - Date.parse(from)) / (7 * 864e5));
  const moves = group.map((cardId) => {
    const row = rows.find((r) => r.cardId === cardId);
    const base = row.slottedWeek || targetWeek;
    return { cardId, week: row.slottedWeek ? mondayShift(base, deltaWeeks) : targetWeek };
  });
  await api.send('POST', `/api/projects/${app.get('activeProjectId')}/replot`, { moves });
  await loadAll();
}

loadShell().catch((err) => app.set('banner', `Boot failed: ${err.message}`));
