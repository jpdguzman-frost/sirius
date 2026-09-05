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

/* A work card, found by its Trello card id in the Pipeline's map (owl #45;
   contracts/trello-write.md §W2 scope — the work card, and since owl #78 §2
   nothing else). Returns the Ractive keypath alongside the card so callers
   can write optimistically to the one entry. The Sprint Schedules DEADLINE
   cell and the Deadlines popover both key on the same WORK card id the map
   holds, so this one locator serves every W2 caller; it only locates. */
function findWorkCard(cardId) {
  for (const [mc, cards] of Object.entries(app.get('workCardsByMc') || {})) {
    const i = cards.findIndex((w) => w.cardId === cardId);
    if (i >= 0) return { card: cards[i], keypath: `workCardsByMc.${mc}.${i}` };
  }
  return null;
}

/* patchRow's twin for the WORK CARD map (owl #78 §1: urgency and difficulty
   are written on the work card, so their optimistic set and their rollback
   both land here). Same rule as patchRow, for the same reason: the card is
   RE-FOUND at every step and never held as an index or a keypath across an
   await — a loadAll can replace the map while a PATCH is in flight, and a
   stale keypath would write into a different card, or into another project's
   map after a switch, fabricating an entry the server never sent.

   A card that is no longer there is a NO-OP, deliberately: the entry is gone
   or foreign — in another project's map, where writing the old keypath would
   fabricate an entry the server never sent — and the next load owns the truth.
   That is why the ROLLBACK side of every optimistic work-card write comes back
   through here rather than reusing the keypath it set on the way out. One
   app.set for the whole patch, so a two-field change is one render. */
function patchWorkCard(cardId, fields) {
  const found = findWorkCard(cardId);
  if (!found) return;
  const patch = {};
  for (const k of Object.keys(fields)) patch[`${found.keypath}.${k}`] = fields[k];
  app.set(patch);
}

/* W2 — THE DEADLINE WRITE, on the WORK CARD and nowhere else (owl #78 §2;
   PLAN.md block 3 B12/B13; contracts/trello-write.md §W2). Deadlines live
   only on work cards now — a main card has none, and Pipeline draws the
   em-dash — so the deliverable half this function used to dispatch to (a
   `kind` argument, a second endpoint, the sheet-deadline precedence and its
   own no-op rule) left with its route. One door, one endpoint, one shape.
   The Sprint Schedules DEADLINE cell is the only trigger (B13); Pipeline
   reflects the date read-only.

   Optimistic with rollback, the urgency/difficulty shape (FR-9.1, invariant
   8): the card is patched through `patchWorkCard` on the way out AND on the
   way back — the card is RE-FOUND at each step, never a keypath held across
   the await. Trello is written first server-side, so a failure reverts here
   and says so. The no-op guard compares against the card's own `due`: a
   work card has no sheet fallback and no precedence, its display field IS
   its Trello field, and a no-op sends nothing and audits nothing. The cell
   shows 'saving…' meanwhile, so no unconfirmed date is ever on screen.

   The reload after the commit is CORRECTNESS, not precedence (review pass
   2026-08-18, reversing the /simplify removal): with no client poll, a
   concurrent loadAll that read Mongo pre-commit and landed after the
   optimistic set would leave the OLD value on screen forever. It is also
   what re-derives the schedule row's `deadline`, its `late` flag and the
   tick (B13) — server-computed, and nothing the work-card map alone knows. */
async function writeDeadline(cardId, value) {
  const found = findWorkCard(cardId);
  if (!found) return;
  if ((value || null) === (found.card.due || null)) return; // no-op guard — no call, no audit
  const prev = found.card.due || null;
  patchWorkCard(cardId, { due: value });
  app.set(`savingDeadline.${cardId}`, true);
  try {
    await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/workcards/${cardId}/deadline`, { date: value });
    await loadAll();
  } catch (err) {
    patchWorkCard(cardId, { due: prev });
    flashBanner(`Deadline write failed — reverted. ${errText(err)}`);
  } finally {
    app.set(`savingDeadline.${cardId}`, false);
  }
}

/* Cards / week (build-spec §5.4). Sirius-INTERNAL planning data — no source
   system is touched, so this is not a registry write; it is the same class as
   a slotted week or a pin, and the server audits it. Optimistic all the same:
   capacity.weekly drives the footer's over-capacity tint (#72: sprintFootCls
   reads it), so the whole board must move with the thumb or not at all.

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
  try {
    while (capQueued !== null) {
      const want = capQueued;
      capQueued = null;
      if (want === capServer) continue; // the server already holds it
      try {
        const res = await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/capacity`, { weekly: want });
        if (res.capacity) {
          capServer = res.capacity.weekly;
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
  /* No refetch after the queue settles any more: the post-queue read of the
     milestone payload existed so a silenced conflict could re-surface
     (invariant 13) on a screen that no longer draws them (PLAN.md block 3
     B9 — the machinery is parked server-side). The Deadlines progress line
     reads `capacity.weekly` straight off this state, so it moved with the
     thumb already. */
}

/* Monotonic guard on the ONE payload-apply (review 2026-08-28, finding 5):
   plotPlace / unplotItem / addOne / addAll each end in their own loadAll and
   nothing serialized them, so two quick gestures could land their responses
   out of order and the OLDER snapshot — read before the second write
   committed — would win the final app.set and re-draw a bar the server no
   longer has. There is no poll and no push re-render on this screen, so the
   stale rows would have stood until the next user action. The counter makes
   application last-CALLER-wins instead of last-RESPONSE-wins: a superseded
   load returns without touching state. */
let loadGen = 0;

async function loadAll() {
  const pid = app.get('activeProjectId');
  if (!pid) return;
  const gen = ++loadGen;
  try {
    /* The `/model` fetch left with the Forecast tab (owl #67): the empirical
       model is applied SERVER-side in the pipeline route, so the browser never
       needed it except to print the provenance banner. The endpoint itself
       stays — the model refresh is still a release gate (invariant 7), and the
       gate script reads the model through `loadProjectModel` directly. */
    /* The `/deadlines` fetch left with the milestone tab (owls #74/#75;
       PLAN.md block 3 B1): the rebuilt Deadlines tab is a view over
       `sprintItems.rows`, which this same payload already carries, so the
       one `/deliverables` read feeds all three tabs and they cannot disagree
       about a card. The route parks server-side with no caller. */
    const [pipeline, requests] = await Promise.all([
      api.get(`/api/projects/${pid}/deliverables`),
      api.get(`/api/projects/${pid}/requests`), // §3: one unfiltered fetch — every filter is client-side
    ]);
    // searchable text per row, computed once per load (annotation 17:2057).
    // The MC# cell shows the bare mcLabel (JP ruling 2026-08-13), but typing
    // 'MC-655.3' must still find its row — displayId and mcNumber both stay
    // searchable, and mcLabel is by construction one of the two.
    // The requestor left the blob with its column (owl #78 §3): search here
    // reaches what the table shows, and a term that matches nothing visible
    // returns rows for a reason the reader cannot see. It is still searchable
    // on Requests, where the column lives.
    /* `warning` rides along for the same reason: the template asked
       `rowWarning(row)` in SEVEN places, so the recipe ran seven times per row
       on every re-render — and the table re-renders on every search keystroke,
       every urgency/difficulty/due write and every load. Stamped once here it
       is a plain keypath, which also gives `{{#each row.warning.items}}` a
       stable array identity instead of a fresh one to diff each pass. */
    pipeline.rows.forEach((r) => {
      r.blob = `${r.displayId} ${r.mcNumber || ''} ${r.name} ${r.assetType || ''} ${r.currentList || ''} ${r.statusNote || ''}`.toLowerCase();
      r.warning = rowWarning(r);
      /* the row's own WORK CARDS (owl #78 §4/§5; PLAN.md B2/B5): the two
         work-card filter axes and the four derived sorts read them per row
         through pipeWorkKids, so the list is stamped here once rather than
         looked up by MC inside every match and every sort key. The SAME
         array the map holds, not a copy — rows and workCardsByMc land in the
         same app.set below, so the two cannot desync. The childless-chevron
         test (owl #45 / R-exp-c) derives from it: stamped, not asked in the
         template (performance law). */
      r.work = pipeline.workCardsByMc[r.mcNumber] || [];
      r.hasTasks = r.work.length > 0;
      /* WHICH row the task list hangs under is NOT stamped here. It depends
         on the rows as rendered, and a filter or a sort changes them — see the
         `pipeMcAnchor` computed, which derives it from the visible order. A
         stamp taken from the server's order left an MC's work cards
         unreachable whenever a filter hid the row carrying it. */
      /* owl #52: how many deliverables share this MC. 1 → the task list is
         genuinely this card's and is attributed to it. >1 → the board does
         not record which main a task belongs to (probed 2026-08-20: no
         checklists, no card links, no list or member signal, and the best
         name segment resolves 1 task in 5 while silently mis-resolving 117),
         so the list stays MC-level and SAYS it is shared. Stamped, not asked
         in the template — the same performance law as hasTasks above. */
      r.mcDeliverables = (pipeline.mcDeliverables || {})[r.mcNumber] || 1;
      r.sharedMc = r.mcDeliverables > 1;
    });
    if (gen !== loadGen) return; // a newer loadAll owns the screen — drop this snapshot whole
    capServer = pipeline.capacity.weekly; // server truth — the capacity rollback target
    app.set({
      rows: pipeline.rows,
      writesEnabled: pipeline.writesEnabled !== false,
      workCardsByMc: pipeline.workCardsByMc,
      unattachedWork: pipeline.unattachedWork || { cards: 0, mcNumbers: [] },
      corrections: pipeline.corrections,
      sprints: pipeline.sprints,
      /* stored VERBATIM off the payload (#72): {rows, addable} is the whole
         Sprint Schedules body — rows are position-sorted per sprint and
         addable is MC → its incomplete work cards, both server-shaped. The
         fallback only covers a payload from before the sprint_items routes. */
      sprintItems: pipeline.sprintItems || { rows: [], addable: {} },
      // R-f-8: the ARES-canonical working-day calendar, so the sprints modal's
      // gap warning counts the same open days the server's forecast does
      holidays: pipeline.holidays || [],
      capacity: pipeline.capacity,
      capDraft: pipeline.capacity.weekly, // server truth re-seats the thumb
      perWeek: pipeline.perWeek || {}, // unread since the overlap footer (#72) — see the state key's note
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
    });
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
    r._mcRank = mcRank(r.mc_number);
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
/* AN OVERLAY WHOSE SUBJECT IS GONE MUST CLOSE. Clearing the last value of an
   axis unmounts its chip, but `chipPop` kept naming it — `anyMenuOpen()` then
   stayed true against a panel nobody could see, and every hover overlay refused
   to open until an unshielded click happened to clear it. Neither route out
   fires on its own: the chip's ✕ and the panel are both inside OVERLAY_SHIELD,
   so the outside-click dismisser never sees them. Stated once, here, rather
   than in each handler that can empty an axis. */
app.observe('pipeFilters', () => {
  const open = app.get('chipPop');
  if (open && !(app.get(`pipeFilters.${open}`) || []).length) app.set('chipPop', null);
}, { init: false });
/* THE HAND-COLLAPSE OVERRIDES RESET WITH THEIR TRIGGER (owl #78 §4/§5;
   PLAN.md B10). `pipeShut` means something only while a work-card axis or a
   derived sort is live; a change to either is a new question, and a group the
   reader folded under the last one reopens under this one. Once nothing is
   live any more, `expanded` is the whole truth again, with nothing carried
   over from the auto-open spell. A search is NOT a trigger change, so this
   stays apart from the back-to-top observer below; and an already-empty map
   is left alone rather than replaced, so a plain filter click re-renders
   nothing that reads `pipeShut`. */
app.observe('pipeFilters pipeSort', () => {
  if (Object.keys(app.get('pipeShut') || {}).length) app.set('pipeShut', {});
}, { init: false });
/* R-pf-h AT ONE ALTITUDE: any narrowing — a filter, a sort, a search term —
   returns the reader to the top. The five filter and sort handlers used to
   spell the call each, and the search box, two-way bound with no handler,
   needed an observer of its own; one observer on the three keys now owns the
   rule, a handler cannot forget it, and the project-switch reset (which
   writes two of these keys) gets it without an edit. */
app.observe('pipeFilters pipeSort searchQ', () => pipeBackToTop(), { init: false });

app.observe('requests', () => {
  const last = app.get('reqPageCount');
  if (app.get('reqPage') > last) app.set('reqPage', last);
}, { init: false });

/* The no-results swap (owl #76) unmounts .pscrollwrap whole — slider
   included — while `pipeThumb` keeps its last values. On the table's RETURN
   the thumb would draw those stale pixels over a fresh node at scrollLeft 0
   (review 2026-08-30, finding 1): a remount fires no scroll event, so no
   other seam recomputes it. Same rule as the selectTab seam — the scroll
   affordance is never left stale. remeasure() already defers a frame, so
   the sweep runs after the swap renders; the entry flip sweeps zero nodes
   and costs nothing. */
app.observe('pipeNoResults', () => { remeasure(); }, { init: false });
