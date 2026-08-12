/* Sirius frontend — one Ractive instance, ARES conventions.
   Hard-mix constants mirror lib/planner.constants (HARD_MIX); load is BR-6c
   card-equivalents (row.weight from the server). */

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
    icon: ICONS,
    tabs: [
      { id: 'requests', label: 'Requests', icon: 'tabRequests' },
      { id: 'pipeline', label: 'Pipeline', icon: 'tabPipeline' },
      { id: 'schedules', label: 'Sprint Schedules', icon: 'tabSchedules' },
      { id: 'deadlines', label: 'Deadlines', icon: 'tabDeadlines' },
      { id: 'forecast', label: 'Forecast', icon: 'tabForecast' },
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
    urgencyMenu: null, // cardId whose urgency select is open (annotation 169:26074)
    savingUrgency: {}, // per-card in-flight write chrome (annotation 169:26364)
    pipeThumb: { left: 0, width: 100 },
    todayKey: todayIso(),
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
    requestCounts: { requests: 0, inPipeline: 0, forFiling: 0, forClarification: 0 },
    noteEditing: null,
    noteDraft: { remark: '', clarify: false, reason: '' },
    noteError: '',
    expandedWeek: null,
    isAdmin: false,
    adminUsers: [],
    adminProjects: [],
    adminForm: { email: '', name: '', projectIds: {} },
    adminEditing: null,
    adminEditSel: {},
    adminError: '',
    requestFilters: ['all', 'filed', 'unfiled', 'missing-deadline'],
    requestFilter: 'all',
    monthOffset: 0,
    monthLabel: '',
    deadlinePayload: { milestones: [], conflicts: [], replot: [] },
    deadlineWeeks: [],
    deadlineConflicts: [],
    acknowledged: [],
    replot: [],
    dueThisMonth: 0,
    urgentThisMonth: 0,
    modelProvenance: null,
    modelReview: null,
    fmt: (iso) => fmtDate(iso),
    // frame date format: '7 Aug 2026' (annotation 251:23859)
    fmtLong: (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''),
    // frame vocabulary for the incomplete panel: 'due date', 'Figma attachment'
    missingText: (missing) =>
      'Missing ' + missing.map((m) => (m === 'deadline' ? 'due date' : m === 'Figma link' ? 'Figma attachment' : m + ' label')).join(' and '),
    pct: (x) => `${Math.round((x || 0) * 1000) / 10}%`,
    // BR-6c/§5.4 display rule: fractions to one decimal, whole numbers plain
    fmtLoad: (n) => {
      const r = Math.round((n || 0) * 1000) / 1000;
      return Number.isInteger(r) ? String(r) : r.toFixed(1);
    },
    dayName: (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
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
      return {
        main: rows.length,
        work,
        // OPEN WORK mirrors the incomplete panel (annotation 31:2740)
        open: this.get('corrections').length,
        urgent: rows.filter((r) => r.urgency === 'Urgent').length,
      };
    },
    pipelineRows() {
      // annotation 17:2057: MC #, card name, type, client, status and other loaded fields
      const q = (this.get('searchQ') || '').toLowerCase();
      const rows = this.get('rows');
      if (!q) return rows;
      return rows.filter((r) =>
        `${r.displayId} ${r.mcNumber} ${r.name} ${r.assetType || ''} ${r.requestor || ''} ${r.currentList || ''} ${r.statusNote || ''}`
          .toLowerCase()
          .includes(q),
      );
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
/* BR-6c: a row carries its MC group's work-card share, so the footer speaks
   the same unit as capacity (cards). Hard mix stays BR-6b's own test. */
const rowLoad = (rows) => rows.reduce((a, r) => a + (r.weight || 1), 0);

/* Search-match highlight (annotation 17:2057): escape first, then wrap the
   matches in <mark> — rendered via triple-mustache, so escaping is mandatory. */
const escHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
app.set('hl', (text) => {
  const q = (app.get('searchQ') || '').trim();
  const safe = escHtml(text);
  if (!q) return safe;
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
  return safe.replace(rx, (m) => `<mark>${m}</mark>`);
});

/* Custom horizontal scroll for the pipeline table (annotation 251:6758). */
function updateThumb(el) {
  const width = Math.max(8, (el.clientWidth / el.scrollWidth) * 100);
  const denom = el.scrollWidth - el.clientWidth;
  const left = denom > 0 ? (el.scrollLeft / denom) * (100 - width) : 0;
  app.set('pipeThumb', { left: Math.round(left * 100) / 100, width: Math.round(width * 100) / 100 });
}

app.set('footClass', (weekKey) => {
  const rows = app.get('schedRows').filter((r) => r.slottedWeek === weekKey);
  const cap = app.get('capacity').weekly || 1;
  const hard = rows.filter((r) => r.difficulty === 'Hard').length;
  const share = rows.length ? hard / rows.length : 0;
  if (rowLoad(rows) > cap || share > HARD_CEILING) return 'red';
  if (share > HARD_IDEAL) return 'amber';
  return '';
});
app.set('footLabel', (weekKey) => {
  const rows = app.get('schedRows').filter((r) => r.slottedWeek === weekKey);
  const cap = app.get('capacity').weekly || 0;
  const hard = rows.filter((r) => r.difficulty === 'Hard').length;
  const share = rows.length ? hard / rows.length : 0;
  const fmtLoad = app.get('fmtLoad');
  return rows.length ? `${fmtLoad(rowLoad(rows))}/${cap} · ${hard}H · ${Math.round(share * 1000) / 10}%` : '';
});

/* ---------- data loading ---------- */

async function loadShell() {
  const [me, projects] = await Promise.all([api.get('/api/me'), api.get('/api/projects')]);
  const name = me.user.name || me.user.email || '';
  const tabs = app.get('tabs').filter((t) => t.id !== 'admin');
  if (me.user.admin) tabs.push({ id: 'admin', label: 'Admin', icon: '🔐' });
  app.set({
    projects: projects.projects,
    userName: name,
    userInitial: (name[0] || '?').toUpperCase(),
    isAdmin: !!me.user.admin,
    tabs,
  });
  if (!app.get('activeProjectId') && projects.projects.length) {
    app.set('activeProjectId', projects.projects[0]._id);
  }
  await loadAll();
}

async function loadAdmin() {
  try {
    const res = await api.get('/api/admin/users');
    app.set({ adminUsers: res.users, adminProjects: res.projects, adminEditing: null });
  } catch (err) {
    app.set('adminError', (err.detail && err.detail.message) || err.message);
  }
}

/* §3.1 tiles: unselected tiles drop to 45% opacity, never an underline */
app.set('tileOff', (f) => {
  const cur = app.get('requestFilter');
  return cur !== 'all' && cur !== f;
});

app.set('projCode', (pid) => {
  const p = (app.get('adminProjects') || []).find((x) => x.id === pid);
  return p ? p.code : '?';
});
app.set('fmtWhen', (iso) => (iso ? new Date(iso).toLocaleString() : 'never'));

/* W2 deadline write (FR-9.1): optimistic with revert, same pattern as
   urgency; Trello is written first server-side, so a failure reverts here. */
async function writeDeadline(cardId, value) {
  const idx = app.get('rows').findIndex((r) => r.cardId === cardId);
  const row = app.get(`rows.${idx}`);
  app.set('editingDeadline', null);
  if ((value || null) === (row.trelloDue || null)) return; // no-op guard — no call, no audit
  const prev = { deadline: row.deadline, deadlineSource: row.deadlineSource, trelloDue: row.trelloDue };
  app.set(`rows.${idx}.deadline`, value);
  app.set(`rows.${idx}.deadlineSource`, value ? 'trello' : null);
  app.set(`rows.${idx}.trelloDue`, value);
  try {
    await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/deadline`, { date: value });
    await loadAll(); // precedence may fall back to the sheet deadline (BR-9)
  } catch (err) {
    app.set(`rows.${idx}.deadline`, prev.deadline);
    app.set(`rows.${idx}.deadlineSource`, prev.deadlineSource);
    app.set(`rows.${idx}.trelloDue`, prev.trelloDue);
    app.set('banner', `Deadline write failed — reverted. ${err.detail && err.detail.message ? err.detail.message : err.message}`);
    setTimeout(() => app.set('banner', ''), 6000);
  }
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
          ? `Last Synced ${new Date(pipeline.sync.at).toLocaleTimeString()}${pipeline.sync.push_at && Date.now() - new Date(pipeline.sync.push_at).getTime() < 30 * 60 * 1000 ? ' · push live' : ''}`
          : 'sync failing — showing last good data'
        : 'no sync yet',
      banner: pipeline.sync && !pipeline.sync.ok ? `Sync error: ${pipeline.sync.error || 'unknown'} — data below is the last good state.` : '',
      requests: requests.requests,
      rejects: requests.rejects,
      requestCounts: requests.counts || app.get('requestCounts'),
      deadlinePayload: deadlines,
      modelProvenance: model.provenance,
      modelReview: model.model.review,
    });
    computeDeadlines();
    requestAnimationFrame(() => {
      const el = document.querySelector('.pscroll');
      if (el) updateThumb(el);
    });
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
      const load = rowLoad(items); // BR-6c card-equivalents
      return {
        key,
        label: `Week ${i + 1}`,
        sub: fmtDate(key),
        items,
        urgent,
        load,
        // §6.1: the week tints ONLY when over capacity — warnings have banners
        flagged: load > cap,
        capPct: Math.min(100, (load / cap) * 100).toFixed(1),
      };
    }),
    deadlineConflicts: payload.conflicts.filter((c) => keys.includes(c.week)),
    acknowledged: (payload.acknowledged || []).filter((c) => keys.includes(c.week)),
    replot: payload.replot,
    dueThisMonth: inMonth.length,
    urgentThisMonth: inMonth.filter((x) => x.urgent).length,
  });
}

/* FR-12: day columns for an expanded week — capacities from the server
   (largest remainder, exact sum), entries placed on plannedDay ?? forecast. */
app.set('dayCols', (weekKey) => {
  const payload = app.get('deadlinePayload');
  const cols = (payload.days && payload.days[weekKey]) || [];
  const weekItems = (payload.milestones || []).filter((m) => m.week === weekKey);
  return cols.map((c) => {
    const items = weekItems.filter((m) => (m.plannedDay || m.date) === c.day);
    return { ...c, items, load: rowLoad(items) };
  });
});

/* FR-12.5: optimistic with rollback, same shape as the W2 deadline write. */
async function writeDayPlan(cardId, phase, day) {
  const payload = app.get('deadlinePayload');
  const idx = (payload.milestones || []).findIndex((m) => m.cardId === cardId && m.phase === phase);
  if (idx < 0) return;
  const prev = payload.milestones[idx].plannedDay || null;
  if ((day || null) === prev) return; // no-op — no call, no audit
  app.set(`deadlinePayload.milestones.${idx}.plannedDay`, day);
  computeDeadlines();
  try {
    await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/deadlines/day`, { cardId, phase, day });
  } catch (err) {
    app.set(`deadlinePayload.milestones.${idx}.plannedDay`, prev);
    computeDeadlines();
    const code = err.detail && err.detail.error && err.detail.error.code;
    const why = code === 'HOLIDAY' ? 'that day is a holiday — it takes no work' : code === 'DAY_OUTSIDE_WEEK' ? 'that day is outside the milestone’s week' : err.message;
    app.set('banner', `Day move failed — reverted. ${why}`);
    setTimeout(() => app.set('banner', ''), 6000);
  }
}

/* ---------- events ---------- */

app.on({
  noop(ctx) { ctx.event && ctx.event.stopPropagation(); },
  switchTab(_ctx, id) {
    app.set('activeTab', id);
    if (id === 'admin' && app.get('isAdmin')) loadAdmin();
  },
  async switchProject() { await loadAll(); },
  signOut() { api.send('POST', '/auth/logout').then(() => window.location.reload()); },
  toggleCorrections() { app.toggle('showAllCorrections'); },
  async setRequestFilter(_ctx, f) {
    app.set('requestFilter', f === app.get('requestFilter') && f !== 'all' ? 'all' : f); // clicking the active tile clears it
    const res = await api.get(`/api/projects/${app.get('activeProjectId')}/requests${filterQuery()}`);
    app.set({ requests: res.requests, rejects: res.rejects, requestCounts: res.counts || app.get('requestCounts') });
  },

  /* ---- frost notes (FR-11): inline editor, only Submit persists ---- */
  openNote(_ctx, mc) {
    const r = app.get('requests').find((x) => x.mc_number === mc);
    const n = (r && r.note) || {};
    app.set({
      noteEditing: mc,
      noteDraft: { remark: n.remark || '', clarify: !!n.clarify, reason: n.clarify_reason || '' },
      noteError: '',
    });
  },
  noteKeydown(ctx) {
    ctx.event.stopPropagation(); // textareas own their keys
    if (ctx.event.key === 'Escape') app.set({ noteEditing: null, noteError: '' });
  },
  cancelNote() { app.set({ noteEditing: null, noteError: '' }); },
  async submitNote(_ctx, mc) {
    const d = app.get('noteDraft');
    const remark = (d.remark || '').trim() || null;
    const reason = (d.reason || '').trim() || null;
    if (d.clarify && !reason) {
      app.set('noteError', 'The flag needs a reason');
      return;
    }
    const idx = app.get('requests').findIndex((x) => x.mc_number === mc);
    const row = app.get(`requests.${idx}`);
    const prev = { note: row.note, status: row.status };
    const note = remark === null && !d.clarify ? null : { remark, clarify: d.clarify, clarify_reason: reason };
    // optimistic: status is derived — mirror the server's derivation (FR-11.3)
    app.set(`requests.${idx}.note`, note);
    if (row.status !== 'In Pipeline') {
      app.set(`requests.${idx}.status`, d.clarify ? 'With Clarification' : 'For Filing');
    }
    app.set({ noteEditing: null, noteError: '' });
    try {
      await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/requests/${mc}/note`, {
        remark, clarify: d.clarify, ...(d.clarify ? { clarify_reason: reason } : {}),
      });
      const res = await api.get(`/api/projects/${app.get('activeProjectId')}/requests${filterQuery()}`);
      app.set({ requests: res.requests, requestCounts: res.counts || app.get('requestCounts') });
    } catch (err) {
      app.set(`requests.${idx}.note`, prev.note);
      app.set(`requests.${idx}.status`, prev.status);
      app.set('banner', `Note save failed — reverted. ${(err.detail && err.detail.message) || err.message}`);
      setTimeout(() => app.set('banner', ''), 6000);
    }
  },
  toggleGroup(_ctx, mc) { app.toggle(`expanded.${mc}`); },
  // annotation 70:10024: row focusable, Enter toggles the MC group's tasks
  pipeRowKey(ctx, mcNumber) {
    if (ctx.event.key !== 'Enter' || ctx.event.target !== ctx.node) return;
    ctx.event.preventDefault();
    app.toggle(`expanded.${mcNumber}`);
  },
  openUrgencyMenu(_ctx, cardId) {
    app.set('urgencyMenu', app.get('urgencyMenu') === cardId ? null : cardId);
  },
  // annotations 169:26364/26074: optimistic write with 'saving…' chrome and
  // rollback — Sirius never shows a state Trello does not hold (FR-4.7)
  async chooseUrgency(_ctx, cardId, next, current) {
    app.set('urgencyMenu', null);
    if (next === current) return;
    const idx = app.get('rows').findIndex((r) => r.cardId === cardId);
    app.set(`rows.${idx}.urgency`, next);
    app.set(`savingUrgency.${cardId}`, true);
    try {
      await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/urgency`, { urgent: next === 'Urgent' });
    } catch (err) {
      app.set(`rows.${idx}.urgency`, current);
      app.set('banner', `Urgency write failed — reverted. ${err.detail && err.detail.message ? err.detail.message : err.message}`);
      setTimeout(() => app.set('banner', ''), 6000);
    } finally {
      app.set(`savingUrgency.${cardId}`, false);
    }
  },
  pipeScrolled(ctx) { updateThumb(ctx.node); },
  nudgeScroll(_ctx, dir) {
    const el = document.querySelector('.pscroll');
    if (!el) return;
    el.scrollLeft += dir * 240;
    updateThumb(el);
  },
  trackJump(ctx) {
    const el = document.querySelector('.pscroll');
    if (!el) return;
    const rect = ctx.node.getBoundingClientRect();
    const frac = (ctx.event.clientX - rect.left) / rect.width;
    el.scrollLeft = Math.max(0, frac * el.scrollWidth - el.clientWidth / 2);
    updateThumb(el);
  },
  /* ---- Admin tab (FR-10): allow-listing from a screen ---- */
  adminDismiss() { app.set('adminError', ''); },
  async adminAdd() {
    const f = app.get('adminForm');
    const projectIds = Object.keys(f.projectIds || {}).filter((k) => f.projectIds[k]);
    const payload = { email: (f.email || '').trim(), projectIds };
    if ((f.name || '').trim()) payload.name = f.name.trim();
    try {
      await api.send('POST', '/api/admin/users', payload);
      app.set({ adminForm: { email: '', name: '', projectIds: {} }, adminError: '' });
      await loadAdmin();
    } catch (err) {
      app.set('adminError', (err.detail && err.detail.message) || err.message);
    }
  },
  async adminToggleActive(_ctx, id, current) {
    try {
      await api.send('PATCH', `/api/admin/users/${id}`, { active: !current });
      await loadAdmin();
    } catch (err) {
      app.set('adminError', (err.detail && err.detail.message) || err.message);
    }
  },
  adminEdit(_ctx, id) {
    const u = app.get('adminUsers').find((x) => x.id === id);
    const sel = {};
    (u.projectIds || []).forEach((p) => { sel[p] = true; });
    app.set({ adminEditing: id, adminEditSel: sel });
  },
  adminCancelEdit() { app.set('adminEditing', null); },
  async adminSaveEdit(_ctx, id) {
    const sel = app.get('adminEditSel') || {};
    try {
      await api.send('PUT', `/api/admin/users/${id}/memberships`, { projectIds: Object.keys(sel).filter((k) => sel[k]) });
      app.set('adminEditing', null);
      await loadAdmin();
    } catch (err) {
      app.set('adminError', (err.detail && err.detail.message) || err.message);
    }
  },

  editDeadline(_ctx, cardId) { app.set('editingDeadline', cardId); },
  // the clear button fires on mousedown, before this blur handler lands
  cancelDeadline() { setTimeout(() => app.set('editingDeadline', null), 150); },
  async setDeadline(ctx, cardId) { await writeDeadline(cardId, ctx.node.value || null); },
  async clearDeadline(_ctx, cardId) { await writeDeadline(cardId, null); },

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
    app.set('expandedWeek', null);
    computeDeadlines();
  },

  /* ---- daily plotting (FR-12): one week open at a time ---- */
  toggleWeek(_ctx, key) {
    app.set('expandedWeek', app.get('expandedWeek') === key ? null : key);
  },
  dragMilestone(ctx, cardId, phase) {
    ctx.event.dataTransfer.setData('text/plain', `${cardId}|${phase}`);
    ctx.event.dataTransfer.effectAllowed = 'move';
  },
  dayDragOver(ctx, holiday) {
    if (!holiday) ctx.event.preventDefault(); // holidays reject drops (FR-12.4)
  },
  async dropOnDay(ctx, day, holiday) {
    ctx.event.preventDefault();
    if (holiday) return;
    const [cardId, phase] = ctx.event.dataTransfer.getData('text/plain').split('|');
    if (cardId && phase) await writeDayPlan(cardId, phase, day);
  },
  async milestoneKey(ctx, cardId, phase, currentDay, weekKey) {
    const key = ctx.event.key;
    if (key === 'Backspace' || key === 'Delete') {
      ctx.event.preventDefault();
      await writeDayPlan(cardId, phase, null);
      return;
    }
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    ctx.event.preventDefault();
    const cols = app.get('dayCols')(weekKey);
    const open = cols.filter((c) => !c.holiday).map((c) => c.day); // arrows skip holidays
    const at = open.indexOf(currentDay);
    const next = open[(at < 0 ? 0 : at) + (key === 'ArrowRight' ? 1 : -1)];
    if (next) await writeDayPlan(cardId, phase, next);
  },
  async clearDayPlan(_ctx, cardId, phase) { await writeDayPlan(cardId, phase, null); },
  async ackConflict(_ctx, key) {
    const reason = window.prompt('Acknowledge this conflict — optional reason (it goes to the audit log):', '');
    if (reason === null) return;
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/conflicts/acknowledge`, { conflict_key: key, ...(reason ? { reason } : {}) });
    const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
    app.set('deadlinePayload', res);
    computeDeadlines();
  },
  async restoreConflict(_ctx, key) {
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/conflicts/restore`, { conflict_key: key });
    const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
    app.set('deadlinePayload', res);
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
