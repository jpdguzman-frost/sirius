/* ---------- data loading ---------- */

async function loadShell() {
  const [me, projects] = await Promise.all([api.get('/api/me'), api.get('/api/projects')]);
  const name = me.user.name || me.user.email || '';
  const tabs = app.get('tabs').filter((t) => t.id !== 'admin');
  if (me.user.admin) tabs.push({ id: 'admin', label: 'Admin', icon: 'tabAdmin' });
  // URL-first selection (phase 13h, JP 2026-08-15). An unknown project code, a
  // project the caller is not a member of, and `admin` for a non-admin ALL fall
  // through to the defaults silently — no error page. `tabs` below already
  // excludes admin for a non-admin, so no new access check is introduced here
  // and none is implied: the data still 403s server-side (invariant 9).
  // The route's project MUST be chosen BEFORE `projects` renders: the header
  // <select> is two-way bound to activeProjectId, so rendering the options
  // against a null selection makes the browser pick option one and the binding
  // write it back — which is why this is ONE set, not projects-then-choose
  // (live defect found 2026-08-17: /rt-837/... always settled on projects[0]).
  const byCode = initialRoute.project
    ? projects.projects.find((p) => p.code === initialRoute.project)
    : null;
  const chosen = byCode || projects.projects[0] || null;
  // Suppressed: boot pushes no history entry — it normalizes once, below.
  withRouterSuppressed(() => {
    app.set({
      projects: projects.projects,
      activeProjectId: chosen ? chosen._id : null,
      userName: name,
      userInitial: (name[0] || '?').toUpperCase(),
      isAdmin: !!me.user.admin,
      tabs,
    });
  });
  const wantTab = tabs.some((t) => t.id === initialRoute.tab) ? initialRoute.tab : ROUTE_DEFAULT_TAB;

  await loadAll();

  // After the load, so a deep link into a tab has its data — and through the
  // real selectTab, so the per-tab resets fire exactly as they do on a click.
  withRouterSuppressed(() => selectTab(wantTab));
  normalizeUrl();
}

async function loadAdmin() {
  try {
    const res = await api.get('/api/admin/users');
    app.set({ adminUsers: res.users, adminProjects: res.projects, adminEditing: null });
  } catch (err) {
    app.set('adminError', errText(err));
  }
}

/* §3 stat bar: with a status filter on, every card but the active one drops
   to 45% opacity (REQUESTS included — it is the show-all, not a status) */
app.set('statOff', (f) => {
  const cur = app.get('requestFilter');
  return cur !== 'all' && cur !== f;
});

/* The MC# provenance line links into the intake sheet only when the project
   payload carries the sheet id. /api/projects does not select it today, so
   this returns '' and the template renders plain dim text — never a dead
   link. It starts working the moment the field is exposed. */
app.set('sheetRowUrl', (row) => {
  const p = (app.get('projects') || []).find((x) => x._id === app.get('activeProjectId'));
  const id = p && p.intake_sheet_id;
  if (!id || !row) return '';
  return `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${p.intake_sheet_gid || 0}&range=A${row}`;
});

app.set('projCode', (pid) => {
  const p = (app.get('adminProjects') || []).find((x) => x.id === pid);
  return p ? p.code : '?';
});
app.set('fmtWhen', (iso) => (iso ? new Date(iso).toLocaleString() : 'never'));

/* Calendar cells for the visible month — a fixed 6×7 grid including the
   leading and trailing days, so the popover never changes height. month and
   staged arrive as ARGUMENTS so Ractive registers them as dependencies and
   re-renders the grid when either moves; a closure read would not. */
app.set('dueGrid', (month, staged) => {
  if (!month) return [];
  const [y, m] = month.split('-').map(Number);
  const today = manilaToday();
  const lead = new Date(y, m - 1, 1).getDay(); // 0 = Sunday, matching dowNames
  return Array.from({ length: 42 }, (_, i) => {
    // the constructor normalises out-of-range day fields, so no leading or
    // trailing cell needs its own Date to walk from
    const d = new Date(y, m - 1, 1 - lead + i);
    const iso = isoOf(d);
    return { iso, day: d.getDate(), out: d.getMonth() !== m - 1, today: iso === today, on: iso === staged };
  });
});
app.set('dueMonthLabel', (month) => {
  if (!month) return '';
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
});

/* W2 deadline write (FR-9.1): optimistic with revert, same pattern as urgency
   and difficulty; Trello is written first server-side, so a failure reverts
   here. The no-op guard compares against trelloDue because W2 owns only the
   TRELLO due date — a sheet-sourced deadline is not Sirius's to clear, which
   is why the popover disables Clear on those rows. The cell shows 'saving…'
   meanwhile, so no unconfirmed date is ever on screen (invariant 8). */
async function writeDeadline(cardId, value) {
  const row = app.get('rows').find((r) => r.cardId === cardId);
  if (!row) return;
  if ((value || null) === (row.trelloDue || null)) return; // no-op guard — no call, no audit
  const prev = { deadline: row.deadline, deadlineSource: row.deadlineSource, trelloDue: row.trelloDue };
  patchRow(cardId, { deadline: value, deadlineSource: value ? 'trello' : null, trelloDue: value });
  app.set(`savingDeadline.${cardId}`, true);
  try {
    await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/deadline`, { date: value });
    await loadAll(); // precedence may fall back to the sheet deadline (BR-9)
  } catch (err) {
    patchRow(cardId, prev);
    flashBanner(`Deadline write failed — reverted. ${errText(err)}`);
  } finally {
    app.set(`savingDeadline.${cardId}`, false);
  }
}

/* Cards / week (build-spec §5.4). Sirius-INTERNAL planning data — no source
   system is touched, so this is not a registry write; it is the same class as
   a slotted week or a pin, and the server audits it. Optimistic all the same:
   capacity.weekly drives the footer's over-capacity tint and the suggester's
   quota, so the whole board must move with the thumb or not at all.

   Commits are SERIALISED: one PATCH in flight at a time, the newest value
   queued behind it. A held arrow key fires a 'change' per step and a drag can
   be released twice in a second, so parallel commits are the normal case, not
   the exotic one — and two in flight race. The loser's rollback would revert
   the winner's value, an out-of-order response would re-seat the thumb from a
   stale echo, and every intermediate step would bank its own capacity.set
   audit row. The queue collapses a burst to at most two writes and leaves the
   last value the user asked for as the one that lands.

   capServer is the last value the SERVER confirmed. It is the only safe
   rollback target: capacity.weekly is optimistic mid-burst, so reverting to it
   would restore another pending commit's guess. */
let capServer = null;
let capQueued = null;
let capFlushing = false;

async function writeCapacity(next) {
  /* owl #23 — the SECOND lock. The disabled input fires no events, but the
     write path is shared (a queued commit, another tab flipping the lock), and
     the server refuses with 403 CAPACITY_LOCKED anyway; snapping the thumb back
     here means the reader never sees a number the server would not accept. */
  if (app.get('capacity').locked) {
    app.set('capDraft', app.get('capacity').weekly);
    return;
  }
  const prev = app.get('capacity').weekly;
  if (!Number.isInteger(next) || next === prev) {
    app.set('capDraft', prev); // snap the thumb back to the committed number
    return;
  }
  app.set({ 'capacity.weekly': next, capDraft: next });
  capQueued = next;
  if (capFlushing) return; // the running flush picks the new value up
  capFlushing = true;
  app.set('savingCapacity', true);
  let landed = false;
  try {
    while (capQueued !== null) {
      const want = capQueued;
      capQueued = null;
      if (want === capServer) continue; // the server already holds it
      try {
        const res = await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/capacity`, { weekly: want });
        if (res.capacity) {
          capServer = res.capacity.weekly;
          landed = true;
          // a newer value is already queued: re-seating here would flash the
          // superseded number, so let the next pass land the server's shape
          if (capQueued === null) app.set({ capacity: res.capacity, capDraft: res.capacity.weekly });
        }
      } catch (err) {
        capQueued = null; // the queue is void once a commit fails
        const revert = Number.isInteger(capServer) ? capServer : prev;
        app.set({ 'capacity.weekly': revert, capDraft: revert });
        flashBanner(`Capacity write failed — reverted. ${errText(err)}`);
      }
    }
  } finally {
    capFlushing = false;
    app.set('savingCapacity', false);
  }
  /* Invariant 13 v4.3.0: a capacity change invalidates matching acks, so the
     deadlines banners can RE-SURFACE right now — refetch once after the queue
     settles or the payload is stale until the next reload. */
  if (landed) {
    try {
      const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
      app.set('deadlinePayload', res);
      computeDeadlines();
    } catch {
      /* stale-until-reload is the pre-amendment behavior — never worse */
    }
  }
}

async function loadAll() {
  const pid = app.get('activeProjectId');
  if (!pid) return;
  try {
    const [pipeline, requests, deadlines, model] = await Promise.all([
      api.get(`/api/projects/${pid}/deliverables`),
      api.get(`/api/projects/${pid}/requests`), // §3: one unfiltered fetch — every filter is client-side
      api.get(`/api/projects/${pid}/deadlines`),
      api.get(`/api/projects/${pid}/model`),
    ]);
    // searchable text per row, computed once per load (annotation 17:2057).
    // The MC# cell shows the bare mcLabel (JP ruling 2026-08-13), but typing
    // 'MC-655.3' must still find its row — displayId and mcNumber both stay
    // searchable, and mcLabel is by construction one of the two.
    /* `warning` rides along for the same reason: the template asked
       `rowWarning(row)` in SEVEN places, so the recipe ran seven times per row
       on every re-render — and the table re-renders on every search keystroke,
       every urgency/difficulty/due write and every load. Stamped once here it
       is a plain keypath, which also gives `{{#each row.warning.items}}` a
       stable array identity instead of a fresh one to diff each pass. */
    pipeline.rows.forEach((r) => {
      r.blob = `${r.displayId} ${r.mcNumber || ''} ${r.name} ${r.assetType || ''} ${r.requestor || ''} ${r.currentList || ''} ${r.statusNote || ''}`.toLowerCase();
      r.warning = rowWarning(r);
    });
    capServer = pipeline.capacity.weekly; // server truth — the capacity rollback target
    app.set({
      rows: pipeline.rows,
      writesEnabled: pipeline.writesEnabled !== false,
      workCardsByMc: pipeline.workCardsByMc,
      corrections: pipeline.corrections,
      sprints: pipeline.sprints,
      // R-f-8: the ARES-canonical working-day calendar, so the sprints modal's
      // gap warning counts the same open days the server's forecast does
      holidays: pipeline.holidays || [],
      capacity: pipeline.capacity,
      capDraft: pipeline.capacity.weekly, // server truth re-seats the thumb
      perWeek: pipeline.perWeek || {},
      perWeekLocal: {}, // server truth supersedes every optimistic drop delta
      sync: pipeline.sync,
      syncLabel: pipeline.sync
        ? pipeline.sync.ok
          ? `Last Synced ${new Date(pipeline.sync.at).toLocaleTimeString()}${pipeline.sync.push_at && Date.now() - new Date(pipeline.sync.push_at).getTime() < PUSH_LIVE_MS ? ' · push live' : ''}`
          : 'sync failing — showing last good data'
        : 'no sync yet',
      banner: pipeline.sync && !pipeline.sync.ok ? `Sync error: ${pipeline.sync.error || 'unknown'} — data below is the last good state.` : '',
      requests: blobRequests(requests.requests),
      rejects: requests.rejects,
      requestCounts: requests.counts || app.get('requestCounts'),
      deadlinePayload: deadlines,
      modelProvenance: model.provenance,
      modelReview: model.model.review,
    });
    computeDeadlines();
    // one frame, both post-render measurements. loadAll is also the project
    // switch (resetForProjectSwitch and popstate both end here), so the clip
    // sweep needs no separate hook for it.
    remeasure();
  } catch (err) {
    app.set('banner', `Load failed: ${err.message} — the app stays usable with what it has.`);
  }
}

/* §3 search text for one request row — MC#, name, use case, requestor, type,
   brief and the frost note's ONE resolved text, so the filter and the
   highlighter agree on what counts as a match. Anything that changes a row's
   note rebuilds this, or the two stop agreeing. */
const requestBlob = (r) =>
  `${r.mc_number || ''} ${r.name || ''} ${r.use_case || ''} ${r.requestor || ''} ${r.asset_type || ''} ${r.brief || ''} ${noteText(r.note)}`.toLowerCase();
/* One pass per load: the search blob plus the two sort keys whose derivation
   costs string work (month canonicalisation, the MC# regex). Both are pure
   functions of payload fields the client never edits, so computing them here
   is O(n) instead of O(n log n) inside the comparator — and EVERY assignment
   to `requests` goes through this function, so no row reaches a comparator
   without them. */
function blobRequests(rows) {
  rows.forEach((r) => {
    r.blob = requestBlob(r);
    r._monthIdx = monthOrder(r.month);
    r._mcRank = mcRank(r);
  });
  return rows;
}

/* An open note editor is keyed on mc_number ALONE and renders only where its
   row is on the VISIBLE page, so a sort, a filter or the search can carry that
   row off-screen while noteEditing stays set: the editor silently disappears
   and the NEXT openNote overwrites the draft with another row's text.
   Dismissing it here keeps "open" and "visible" the same thing, and an unsaved
   draft says so rather than vanishing. switchProject clears the same three
   keys, for the neighbouring reason (a draft must not follow the reader into
   another project's same-numbered row). */
function closeNoteEditor() {
  const mc = app.get('noteEditing');
  if (!mc) return;
  const d = app.get('noteDraft') || {};
  const row = app.get('requests').find((x) => x.mc_number === mc);
  const saved = (row && row.note) || null;
  const dirty = (d.remark || '').trim() !== noteText(saved) || !!d.clarify !== !!(saved && saved.clarify);
  app.set({ noteEditing: null, noteDraft: { remark: '', clarify: false }, noteError: '' });
  if (dirty) flashBanner(`The note on ${mc} was not saved — the table re-ordered before Submit.`);
}

/* Any filter OR sort change starts the pager over — page 4 of the old order is
   not page 4 of the new one — and closes the note editor, which the new order
   may have moved out of sight. One observer owns both rules, so the sort
   handler repeats neither. A reload only clamps the pager, so saving a note
   does not yank the reader back to page 1. */
app.observe(
  `reqQ requestFilter reqSortKey reqSortDir ${reqFilterKeys.join(' ')}`,
  () => {
    app.set('reqPage', 1);
    closeNoteEditor();
  },
  { init: false },
);
app.observe('requests', () => {
  const last = app.get('reqPageCount');
  if (app.get('reqPage') > last) app.set('reqPage', last);
}, { init: false });

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
    flashBanner(`Day move failed — reverted. ${why}`);
  }
}

