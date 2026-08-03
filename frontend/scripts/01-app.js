/* Sirius frontend — one Ractive instance, ARES conventions.
   Weighted-load constants mirror lib/planner.constants (WEIGHTS, HARD_MIX). */

const WEIGHTS = { Easy: 1, Medium: 2, Hard: 4, '': 2 };
const HARD_IDEAL = 0.083;
const HARD_CEILING = 0.129;
const WEEK_COUNT = 8;

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

const app = new Ractive({
  target: '#app',
  template: '#tpl-app',
  data: {
    tabs: [
      { id: 'requests', label: 'Requests', icon: '🗂' },
      { id: 'pipeline', label: 'Pipeline', icon: '▦' },
      { id: 'schedules', label: 'Sprint Schedules', icon: '🗓' },
      { id: 'deadlines', label: 'Deadlines', icon: '⏰' },
      { id: 'forecast', label: 'Forecast', icon: '📈' },
    ],
    activeTab: 'pipeline',
    projects: [],
    activeProjectId: null,
    userName: '',
    userInitial: '',
    banner: '',
    sync: null,
    syncLabel: '…',
    rows: [],
    workCardsByMc: {},
    corrections: [],
    showAllCorrections: false,
    sprints: [],
    capacity: { weekly: 0 },
    expanded: {},
    selected: {},
    searchQ: '',
    weekStart: mondayIso(todayIso()),
    suggest: null,
    suggestCount: 0,
    sprintModal: false,
    sprintDraft: [],
    sprintError: '',
    hardIdeal: HARD_IDEAL,
    hardCeiling: HARD_CEILING,
    requests: [],
    rejects: [],
    requestFilters: ['all', 'filed', 'unfiled', 'missing-deadline'],
    requestFilter: 'all',
    monthOffset: 0,
    monthLabel: '',
    deadlinePayload: { milestones: [], conflicts: [], replot: [] },
    deadlineWeeks: [],
    deadlineConflicts: [],
    replot: [],
    dueThisMonth: 0,
    urgentThisMonth: 0,
    modelProvenance: null,
    modelReview: null,
    fmt: (iso) => fmtDate(iso),
    pct: (x) => `${Math.round((x || 0) * 1000) / 10}%`,
    ruleLabel: (r) =>
      r === 'urgent-overlap' ? '⚡ Urgent overlap' : r === 'past-deadline' ? '🛡 Past deadline' : '▤ Over capacity',
  },
  computed: {
    tabLabel() {
      const t = this.get('tabs').find((x) => x.id === this.get('activeTab'));
      return t ? t.label : '';
    },
    boardId() {
      const p = this.get('projects').find((x) => x._id === this.get('activeProjectId'));
      return p ? p.trello_board_id : '';
    },
    kpi() {
      const rows = this.get('rows');
      const byMc = this.get('workCardsByMc');
      const work = Object.values(byMc).reduce((a, l) => a + l.length, 0);
      const open = Object.values(byMc).reduce((a, l) => a + l.filter((w) => w.status !== 'done').length, 0);
      return {
        main: rows.length,
        work,
        open,
        urgent: rows.filter((r) => r.urgency === 'Urgent').length,
        atRisk: rows.filter((r) => r.forecast && r.forecast.late).length,
      };
    },
    pipelineRows() {
      const q = (this.get('searchQ') || '').toLowerCase();
      const rows = this.get('rows');
      if (!q) return rows;
      return rows.filter((r) => `${r.displayId} ${r.mcNumber} ${r.name}`.toLowerCase().includes(q));
    },
    visibleCorrections() {
      const c = this.get('corrections');
      return this.get('showAllCorrections') ? c : c.slice(0, 5);
    },
    weekCols() {
      const from = this.get('weekStart');
      return Array.from({ length: WEEK_COUNT }, (_, i) => ({ key: mondayShift(from, i) }));
    },
    rangeLabel() {
      const from = this.get('weekStart');
      const to = mondayShift(from, WEEK_COUNT - 1);
      return `${fmtDate(from)} – ${fmtDate(mondayShift(to, 1))}, ${new Date(from + 'T00:00:00').getFullYear()}`;
    },
    schedRows() {
      const sprints = this.get('sprints');
      return this.get('rows')
        .filter((r) => r.status !== 'done')
        .map((r) => {
          const s = r.slottedWeek ? sprints.find((sp) => r.slottedWeek >= sp.start && r.slottedWeek <= sp.end) : null;
          return { ...r, sprintName: r.slottedWeek ? (s ? s.name : 'Outside any sprint') : 'Unscheduled' };
        });
    },
    schedGroups() {
      const rows = this.get('schedRows');
      const sprints = this.get('sprints');
      const groups = [];
      for (const s of sprints) {
        const inSprint = rows.filter((r) => r.sprintName === s.name);
        if (inSprint.length) groups.push({ name: s.name, meta: `${fmtDate(s.start)} – ${fmtDate(s.end)}`, rows: inSprint });
      }
      const outside = rows.filter((r) => r.sprintName === 'Outside any sprint');
      if (outside.length) groups.push({ name: 'Outside any sprint', meta: 'weeks no sprint covers', rows: outside });
      const unsched = rows.filter((r) => r.sprintName === 'Unscheduled');
      if (unsched.length) groups.push({ name: 'Unscheduled', meta: 'not yet plotted', rows: unsched });
      return groups;
    },
    forecastRows() {
      return this.get('rows').filter((r) => r.status !== 'done');
    },
  },
});

/* ---- gantt helpers: percentage positions across the visible week range ---- */

function rangeDays() {
  return WEEK_COUNT * 7;
}
function pctOf(dateIso) {
  const start = Date.parse(app.get('weekStart') + 'T00:00:00');
  const days = (Date.parse(dateIso + 'T00:00:00') - start) / 864e5;
  return (days / rangeDays()) * 100;
}
const clamp = (x) => Math.max(0, Math.min(100, x));

app.set('ganttBars', (row) => {
  if (!row.slottedWeek || !row.forecast) return [];
  const f = row.forecast;
  const bars = [];
  const seg = (fromIso, toIso, cls, title) => {
    const left = clamp(pctOf(fromIso));
    const right = clamp(pctOf(toIso) + 100 / rangeDays());
    if (right <= 0 || left >= 100 || right <= left) return;
    bars.push({ cls, left: left.toFixed(2), width: (right - left).toFixed(2), title });
  };
  seg(row.slottedWeek, f.sketchDelivery, 'sketch', `sketch → ${fmtDate(f.sketchDelivery)}`);
  seg(f.sketchDelivery, f.sketchApproved, 'review', `review → ${fmtDate(f.sketchApproved)}`);
  seg(f.sketchApproved, f.renderDelivery, f.late ? 'render red' : 'render', `render → ${fmtDate(f.renderDelivery)}`);
  return bars;
});
app.set('deadlineTick', (row) => {
  if (!row.deadline) return null;
  const p = pctOf(row.deadline);
  return p >= 0 && p <= 100 ? p.toFixed(2) : null;
});
app.set('ghostLeft', (row) => {
  const s = app.get('suggest');
  if (!s || !s.plan[row.cardId]) return 0;
  return clamp(pctOf(s.plan[row.cardId])).toFixed(2);
});
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
  const [me, projects] = await Promise.all([api.get('/api/me'), api.get('/api/projects')]);
  const name = me.user.name || me.user.email || '';
  app.set({
    projects: projects.projects,
    userName: name,
    userInitial: (name[0] || '?').toUpperCase(),
  });
  if (!app.get('activeProjectId') && projects.projects.length) {
    app.set('activeProjectId', projects.projects[0]._id);
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
    app.set({
      rows: pipeline.rows,
      workCardsByMc: pipeline.workCardsByMc,
      corrections: pipeline.corrections,
      sprints: pipeline.sprints,
      capacity: pipeline.capacity,
      sync: pipeline.sync,
      syncLabel: pipeline.sync
        ? pipeline.sync.ok
          ? `synced ${new Date(pipeline.sync.at).toLocaleTimeString()}`
          : 'sync failing — showing last good data'
        : 'no sync yet',
      banner: pipeline.sync && !pipeline.sync.ok ? `Sync error: ${pipeline.sync.error || 'unknown'} — data below is the last good state.` : '',
      requests: requests.requests,
      rejects: requests.rejects,
      deadlinePayload: deadlines,
      modelProvenance: model.provenance,
      modelReview: model.model.review,
    });
    computeDeadlines();
  } catch (err) {
    app.set('banner', `Load failed: ${err.message} — the app stays usable with what it has.`);
  }
}

function filterQuery() {
  const f = app.get('requestFilter');
  return f && f !== 'all' ? `?filter=${f}` : '';
}

function computeDeadlines() {
  const payload = app.get('deadlinePayload');
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
  for (const ms of inMonth) (byWeek[ms.week] = byWeek[ms.week] || []).push(ms);
  const cap = app.get('capacity').weekly || 1;
  const keys = Object.keys(byWeek).sort();
  app.set({
    deadlineWeeks: keys.map((key, i) => {
      const items = byWeek[key];
      const urgent = items.filter((x) => x.urgent).length;
      return {
        key,
        label: `Week ${i + 1}`,
        sub: fmtDate(key),
        items,
        urgent,
        flagged: urgent >= 2 || items.some((x) => x.late),
        capPct: Math.min(100, (items.length / cap) * 100).toFixed(1),
      };
    }),
    deadlineConflicts: payload.conflicts.filter((c) => keys.includes(c.week)),
    replot: payload.replot,
    dueThisMonth: inMonth.length,
    urgentThisMonth: inMonth.filter((x) => x.urgent).length,
  });
}

/* ---------- events ---------- */

app.on({
  noop(ctx) { ctx.event && ctx.event.stopPropagation(); },
  switchTab(_ctx, id) { app.set('activeTab', id); },
  async switchProject() { await loadAll(); },
  signOut() { api.send('POST', '/auth/logout').then(() => window.location.reload()); },
  toggleCorrections() { app.toggle('showAllCorrections'); },
  async setRequestFilter(_ctx, f) {
    app.set('requestFilter', f);
    const res = await api.get(`/api/projects/${app.get('activeProjectId')}/requests${filterQuery()}`);
    app.set({ requests: res.requests, rejects: res.rejects });
  },
  toggleGroup(_ctx, mc) { app.toggle(`expanded.${mc}`); },

  weekShiftView(_ctx, dir) { app.set('weekStart', mondayShift(app.get('weekStart'), dir)); },
  dragRow(ctx, cardId) {
    ctx.event.dataTransfer.setData('text/plain', cardId);
    ctx.event.dataTransfer.effectAllowed = 'move';
  },
  dragOver(ctx) { ctx.event.preventDefault(); },
  async dropOnWeek(ctx, weekKey) {
    ctx.event.preventDefault();
    await moveRows(ctx.event.dataTransfer.getData('text/plain'), weekKey);
  },
  async rowKey(ctx, cardId) {
    const key = ctx.event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    ctx.event.preventDefault();
    const row = app.get('schedRows').find((r) => r.cardId === cardId);
    const from = row.slottedWeek || app.get('weekStart');
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
    const res = await api.send('POST', `/api/projects/${app.get('activeProjectId')}/suggest`, {
      from: app.get('weekStart'),
      weeks: WEEK_COUNT,
    });
    app.set({ suggest: res, suggestCount: Object.keys(res.plan).length });
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

  monthShift(_ctx, dir) {
    app.set('monthOffset', app.get('monthOffset') + dir);
    computeDeadlines();
  },

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
    return { cardId, week: row.slottedWeek ? mondayShift(row.slottedWeek, deltaWeeks) : targetWeek };
  });
  await api.send('POST', `/api/projects/${app.get('activeProjectId')}/replot`, { moves });
  await loadAll();
}

loadShell().catch((err) => app.set('banner', `Boot failed: ${err.message}`));
