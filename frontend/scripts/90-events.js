/* ---------- events ---------- */

/* Shared by click and the tablist arrow keys (WAI tabs pattern). */
function selectTab(id) {
  closeMenus();
  app.set('activeTab', id);
  if (id === 'admin' && app.get('isAdmin')) loadAdmin();
  if (id === 'pipeline' || id === 'requests' || id === 'schedules') {
    // returning to the tab remounts .pscroll at scrollLeft 0 — recompute the
    // slider so the affordance is never stale (review finding 5). The tab
    // remounts the whole sheet, so the requestor badges are new nodes too.
    remeasure();
  }
}

/* The project-switch reset. Extracted from the `switchProject` handler verbatim
   so back/forward across a project boundary (popstate) behaves identically to
   using the switcher — same clears, same reload. */
async function resetForProjectSwitch() {
  // Requests view state is per-project. A Type/Requestor value from the old
  // project may not exist in the new one, leaving an unclearable empty
  // table. The sort resets with them so the new project opens on its own
  // newest-filed default rather than inheriting a column the reader chose
  // while looking at other data — and an open note editor is keyed on
  // mc_number ALONE, which is
  // unique per project and NOT globally (invariant 3), so leaving it open
  // re-attaches project A's draft to project B's same-numbered row and
  // Submit would write it there.
  //
  // Planner view state is per-project too (R-d, owl #25; re-based on the
  // work-card unit, #72): the search queries `addQ` are keyed on THIS
  // project's sprint ids — carried over, they would name sprints the next
  // project does not have — and `sprintSel` (the checkbox highlight) plus
  // the hover pair `plotRow`/`plotWeek` point at rows it does not have
  // either. `collapsedBlocks` is keyed on sprint ids, which are
  // per-project. `leftCollapsed` deliberately does NOT reset — it is a
  // reader preference about the pane, not project data.
  app.set({
    ...reqFiltersCleared(),
    requestFilter: 'all',
    reqQ: '',
    reqSortKey: '',
    reqSortDir: '',
    reqPage: 1,
    /* every overlay closes, by the DERIVED list — a hand-written one here was a
       fourth place that had to agree with OVERLAY_KEYS, which is the exact
       three-hand-edit failure that list was introduced to end. A sixth overlay
       now closes on a project switch without anyone remembering to add it. */
    ...NO_OVERLAYS,
    /* owl #62 — filter and sort RESET on project switch, like the planner's
       expansion state (R-exp-f). The frame raised persistence and the owl did
       not answer it, so this is a default, flagged in jp→miles #50: a Requestor
       or a Status carried into another project names values that project may
       not have, which would silently show an empty table. */
    pipeSort: null,
    pipeFilters: PIPE_FILTERS_EMPTY(),
    noteEditing: null,
    noteDraft: { remark: '', clarify: false },
    noteError: '',
    /* Sprint Schedules placement + the search-based add (#72, #77 §0;
       PLAN.md B10): the per-sprint queries and the in-flight sprint go with
       the sprint ids they are keyed on. */
    sprintSel: null,
    plotRow: null,
    plotWeek: null,
    addQ: {},
    addBusy: null,
    collapsedBlocks: {},
    // owl #45 recon finding: `expanded` is keyed on mc_number, which repeats
    // ACROSS projects (invariant 3) — carried over, project A's expanded
    // MC-655 arrived pre-expanded in project B. Per-project view state, so it
    // resets with the rest.
    expanded: {},
    // the hand-collapse overrides go with it (PLAN.md B10): keyed on the same
    // per-project mc_number, and meaningless against another project's groups
    pipeShut: {},
  });
  await loadAll();
}

/* clicking the active segment clears it; REQUESTS is always the show-all */
function applyRequestFilter(f) {
  app.set('requestFilter', f === app.get('requestFilter') && f !== 'all' ? 'all' : f);
}

/* owl #62 asks that any of search/filter/sort changing "reset pagination to
   page one". The PIPELINE HAS NO PAGINATION — it renders every row inside a
   scroller, and only Requests pages (REQ_PAGE_SIZE). So the requirement's
   intent maps to returning the reader to the TOP: after the set changes, being
   left halfway down a list that is no longer the list you scrolled into is the
   same disorientation paging was protecting against. Inventing a `pipePage`
   nobody reads would have satisfied the words and nothing else. Raised in
   jp→miles #50. WHEN it runs is stated once, as the observer on the three
   narrowing keys in 80-loaders.js — no handler calls this on its own. */
function pipeBackToTop() {
  // the page is the vertical scroller; the table box scrolls x only
  const doc = document.scrollingElement || document.documentElement;
  if (doc) doc.scrollTop = 0;
}

/* THE ONE DOOR FOR A GROUP TOGGLE — the chevron and the row's Enter both come
   here (owl #78 §4/§5; PLAN.md B10). While auto-open is on, a click is a
   hand-collapse (or its undo) recorded in `pipeShut`, and the reader's own
   `expanded` map is left exactly as it was; with nothing live it is the plain
   toggle it always was. The template reads `pipeOpen`, which is where the two
   maps are reconciled. */
function toggleMc(mc) {
  app.toggle(app.get('pipeAutoOpen') ? `pipeShut.${mc}` : `expanded.${mc}`);
}

/* ONE sprint-items write in flight (the savingUrgency discipline, invariant
   8's shape): a double-click on the track — or on the calendar icon, or on
   Add — would send the same request twice, and the second would bank an audit
   row for a non-change. A single flag, not per-item chrome: every write ends
   in loadAll, which replaces the rows before a second gesture can mean
   anything. The adds also raise `addBusy` (state), which is what the
   template reads to make ONE sprint's links inert (PLAN.md B10). */
let sprintItemSaving = false;

/* THE PARTIAL-RESULT BANNER for Add All (PLAN.md B3): one sentence, shown
   only when the server skipped something — 'Added N of M — K already on the
   schedule, J complete.' The codes are the server's own; one this map does
   not know reads as itself, lowercased, rather than dropping out of the count. */
/* A refusal that means the LIST ON SCREEN is stale — the card is already on
   the schedule, complete, gone from the board, or its sprint is gone — is
   answered with a reload before the banner: the pool the server just refused
   is replaced, so the row that was refused leaves the list and the same click
   cannot refuse twice (review 2026-09-05, B2-R6). Any other failure (network,
   a 500) leaves the list standing for another try. */
const ADD_STALE = new Set(['NOT_FOUND', 'CARD_COMPLETE', 'ALREADY_SCHEDULED', 'SPRINT_GONE']);
const addStale = (err) => Boolean(err && err.detail && ADD_STALE.has(err.detail.code));
const ADD_SKIP_WHY = { ALREADY_SCHEDULED: 'already on the schedule', CARD_COMPLETE: 'complete', NOT_FOUND: 'no longer on the board' };
function addSkipSummary(added, asked, skipped) {
  const counts = new Map();
  for (const s of skipped) counts.set(s.code, (counts.get(s.code) || 0) + 1);
  const parts = [...counts].map(([code, n]) => `${n} ${ADD_SKIP_WHY[code] || String(code || 'skipped').toLowerCase().replace(/_/g, ' ')}`);
  return `Added ${added} of ${asked} — ${parts.join(', ')}.`;
}

app.on({
  noop(ctx) { ctx.event && ctx.event.stopPropagation(); },
  switchTab(_ctx, id) { selectTab(id); },
  tabKey(ctx) {
    const key = ctx.event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    ctx.event.preventDefault();
    const tabs = app.get('tabs');
    const at = tabs.findIndex((t) => t.id === app.get('activeTab'));
    const next = tabs[(at + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    selectTab(next.id);
    requestAnimationFrame(() => {
      const btn = document.getElementById('tab-' + next.id);
      if (btn) btn.focus();
    });
  },
  async switchProject() {
    await resetForProjectSwitch();
  },
  signOut() { api.send('POST', '/auth/logout').then(() => window.location.reload()); },
  /* ---- Requests §3: stat segments, selects, pager — no round-trip ---- */
  setRequestFilter(_ctx, f) { applyRequestFilter(f); },
  openReqMenu(ctx, key) {
    openMeasured(ctx, key, { key: 'reqMenu', posKey: 'reqMenuPos', sel: '.selectmenu.reqmenu', h: REQ_MENU_H, gap: 4, clampW: REQ_MENU_W });
  },
  pickReqFilter(_ctx, key, value) {
    closeMenus({ restoreFocus: true });
    app.set(key, value); // '' = All, which clears that filter
  },
  /* owl #18: asc → desc → clear on the same column; a different column starts
     that cycle over at asc. Clearing is not "no sort" — it is the newest-filed
     default the table opens on. The pager reset is the observer's job. */
  reqSortBy(_ctx, key) {
    const dir = app.get('reqSortKey') !== key ? 'asc' : app.get('reqSortDir') === 'asc' ? 'desc' : '';
    app.set({ reqSortKey: dir ? key : '', reqSortDir: dir });
  },
  reqGoPage(_ctx, n) { app.set('reqPage', n); },
  reqPageStep(_ctx, dir) {
    app.set('reqPage', Math.max(1, Math.min(app.get('reqPage') + dir, app.get('reqPageCount'))));
  },
  reqScrolled(ctx) { updateThumb(ctx.node, 'reqThumb'); },

  /* ---- frost notes (FR-11): inline editor, only Submit persists ---- */
  openNote(_ctx, mc) {
    const r = app.get('requests').find((x) => x.mc_number === mc);
    const n = (r && r.note) || null;
    // legacy text opens IN the single box — reason, remark, or the two joined
    // — so Submit rewrites all of it as the remark instead of dropping half
    app.set({
      noteEditing: mc,
      noteDraft: { remark: noteText(n), clarify: !!(n && n.clarify) },
      noteError: '',
    });
    // the field is created by the set above, so it can only be sized on the
    // next frame — same rAF-after-render idiom the overlays use
    requestAnimationFrame(() => noteGrow(document.querySelector('.noteedit textarea')));
  },
  noteKeydown(ctx) {
    ctx.event.stopPropagation(); // textareas own their keys
    if (ctx.event.key === 'Escape') app.set({ noteEditing: null, noteError: '' });
  },
  /* The field HUGS its text (frame 731:101140 — the Field is HUG vertically
     and its text auto-resizes by HEIGHT; the frame's 75px is what three lines
     at that width happen to make, not a size). So there is no scrollbar and
     no drag handle to offer: `noteGrow` is what replaces `resize: vertical`.
     Height is cleared before it is read, because scrollHeight never shrinks
     below the height already set. */
  noteGrow(ctx) { noteGrow(ctx.node); },
  cancelNote() { app.set({ noteEditing: null, noteError: '' }); },
  async submitNote(_ctx, mc) {
    const d = app.get('noteDraft');
    const remark = (d.remark || '').trim() || null;
    // the flag has no field of its own any more (owl #15): the box IS the
    // clarification, so an empty box cannot carry one (server: REMARK_REQUIRED)
    if (d.clarify && !remark) {
      app.set('noteError', 'The flag needs a note');
      return;
    }
    const idx = app.get('requests').findIndex((x) => x.mc_number === mc);
    const row = app.get(`requests.${idx}`);
    const prev = { note: row.note, blob: row.blob };
    // clarify_reason is legacy-only — a new write always nulls it
    const note = remark === null && !d.clarify ? null : { remark, clarify: d.clarify, clarify_reason: null };
    /* Optimistic, in ONE set — two keypaths, one runloop flush, so the filter,
       the sort and the option lists recompute once instead of twice and no
       frame renders the new note against the old cell. STATUS IS NOT PATCHED
       (owls #34/#35): a note never moves status, so the only thing a note save
       can change is the note itself. The badge is unaffected; the Remarks cell
       and the FOR CLARIFICATION segment both re-derive from `clarified()`,
       which reads the note this set just wrote. The search blob is REBUILT, or
       the filter (which reads blob) and the cell (which reads the note)
       disagree until the next successful load — and the refetch below is
       explicitly allowed to fail. */
    app.set({
      [`requests.${idx}.note`]: note,
      [`requests.${idx}.blob`]: requestBlob({ ...row, note }),
      noteEditing: null,
      noteError: '',
    });
    // ONLY the write is inside the rollback: once the PUT resolves the server
    // holds the note and has audited it (invariant 10), so a failed refresh is
    // staleness, never a reason to revert a row the database already has.
    try {
      await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/requests/${mc}/note`, {
        remark, clarify: d.clarify,
      });
    } catch (err) {
      app.set({
        [`requests.${idx}.note`]: prev.note,
        [`requests.${idx}.blob`]: prev.blob,
      });
      flashBanner(`Note save failed — reverted. ${errText(err)}`);
      return;
    }
    try {
      const res = await api.get(`/api/projects/${app.get('activeProjectId')}/requests`);
      app.set({ requests: blobRequests(res.requests), requestCounts: res.counts || app.get('requestCounts') });
    } catch (err) {
      flashBanner(`Note saved. The refresh failed, so the counts may be stale until the next load. ${errText(err)}`);
    }
  },
  toggleGroup(_ctx, mc) { toggleMc(mc); },


  /* ---- owl #62: Pipeline sort + filter ------------------------------------
     Both panels ride openOverlay, so mutual exclusion, the outside click, the
     scroll dismisser and Escape-with-focus-return all come from the one door
     every other overlay uses. "Opening one closes the other" is not written
     here: it is what openOverlay already does to every key in OVERLAY_KEYS,
     and re-implementing it would be a second rule that could disagree. */
  openPipeSort(ctx) {
    openOverlay(ctx, 'sort', { key: 'pipeSortMenu' });
  },
  openPipeFilter(ctx) {
    openOverlay(ctx, 'filter', { key: 'pipeFilterMenu' });
  },
  /* SINGLE-select: choosing replaces, never stacks (node 592:56913). Choosing
     the applied sort again returns to the default — the same "click it off"
     the urgency menu uses, and it means the popup can always undo itself. */
  pickPipeSort(_ctx, key) {
    app.set('pipeSort', app.get('pipeSort') === key ? null : key);
    closeMenus({ restoreFocus: true });
  },
  clearPipeSort() {
    app.set('pipeSort', null);
    closeMenus({ restoreFocus: true });
  },
  /* MULTI-select: OR within a category, AND across (owl #62). The panel STAYS
     OPEN — a filter is built from several values, and closing on each toggle
     would make the counts unreadable at the moment they matter most. */
  togglePipeFilter(_ctx, axis, value) {
    const cur = (app.get(`pipeFilters.${axis}`) || []).slice();
    const at = cur.indexOf(value);
    if (at > -1) cur.splice(at, 1);
    else cur.push(value);
    app.set(`pipeFilters.${axis}`, cur);
  },
  /* THE CHIP'S HOVER PANEL (node 593:80073) — the chip's own filter group,
     opened under it so a reader can see and change what the chip names without
     going back to the Filter button.

     It opens on POINTER, like the warning card, and leaves through the same
     scheduler: the panel sits 4px clear of the chip, so without a delay the
     pointer crossing that gap would close what it is reaching for. It is a DOM
     CHILD of the chip, which is what makes the containment guard below cover
     the panel too — moving onto a checkbox never leaves `.fchip`. */
  chipPopIn(ctx, key) {
    // the shared hover-open policy: refuse over an active edit, cancel any
    // pending close, and treat re-entry as a no-op rather than a toggle
    if (!openHoverOverlay('chipPop', key)) return;
    /* The chips row WRAPS, so a chip can sit anywhere along it — and the panel
       is a known 276px hanging off the chip's LEFT edge. Far enough right and
       it runs past the viewport, where its rows are unreachable and the page
       grows a horizontal scrollbar. Flip it onto the chip's right edge instead.
       The width is a constant, so this reads the chip's own box and needs
       nothing measured after render. */
    const box = ctx.node.getBoundingClientRect();
    app.set('chipPopFlip', box.left + PIPE_MENU_W > document.documentElement.clientWidth - OVERLAY_EDGE);
    openOverlay(ctx, key, { key: 'chipPop' });
  },
  chipPopOut(ctx) {
    if (!leaveHoverOverlay('chipPop')) return;
    /* where the pointer (or focus) actually went; still inside this chip means
       nothing left. The panel is a DOM child of the chip, so this covers the
       whole journey down into it — including tabbing from the ✕ into a row. */
    const to = ctx.event.relatedTarget;
    if (to && ctx.node.contains(to)) return;
    scheduleHoverClose(() => closeMenus());
  },
  /* The indicator's ✕ clears ONE AXIS, not one value: the chip names an axis
     and lists its values, so removing it removes what it names. Returning to
     the top follows from the write, like every other narrowing (R-pf-h, the
     observer in 80-loaders.js). */
  removePipeAxis(_ctx, axis) {
    app.set(`pipeFilters.${axis}`, []);
  },
  clearPipeFilters() {
    app.set('pipeFilters', PIPE_FILTERS_EMPTY());
    closeMenus({ restoreFocus: true });
  },
  // annotation 70:10024: row focusable, Enter toggles the MC group's tasks
  pipeRowKey(ctx, mcNumber) {
    if (ctx.event.key !== 'Enter' || ctx.event.target !== ctx.node) return;
    ctx.event.preventDefault();
    // a childless MC has no expansion to toggle (R-exp-c): the keyboard path
    // must refuse exactly where the chevron refuses to render, or Enter sets
    // a stale flag that pre-expands the group when tasks later arrive
    const row = app.get('rows').find((r) => r.mcNumber === mcNumber);
    if (!row || !row.hasTasks) return;
    toggleMc(mcNumber);
  },
  /* ---- W1 / W3: urgency and difficulty, on the WORK CARD -------------------
     Owl #78 §1, from the 3 September alignment: throughput is a property of
     the work card; a main card is tracking. One website request can hold an
     urgent screen and non-urgent assets, so a single value on the parent
     cannot be true — and the shipped build was writing both onto the parent,
     which is why this is a defect fix and not a feature. `cardId` here is a
     WORK card id in every one of these four handlers, and the optimistic set
     and its rollback go through patchWorkCard, never patchRow: the main row's
     own stored values are read-only in Sirius now, reconciled from that card's
     own Trello labels. Annotations 169:26074 / 169:26364 drew these controls
     on the main row; #78 supersedes that placement, not the chrome. */
  openUrgencyMenu(ctx, cardId) {
    openOverlay(ctx, cardId, { key: 'urgencyMenu', posKey: 'urgencyMenuPos', saving: 'savingUrgency', h: 92, gap: 3 });
  },
  // optimistic write with 'saving…' chrome and rollback — Sirius never shows a
  // state Trello does not hold (FR-4.7, invariant 8).
  async chooseUrgency(_ctx, cardId, next, current) {
    /* through the SHARED close path, not `app.set(key, null)`: committing a
       choice unmounts the menu exactly as Escape does, so a keyboard user who
       presses Enter on an option must land back on the trigger rather than at
       <body>. Nulling the key directly also left `overlayTrigger` pinning a
       detached node until the next open. Same for the four handlers below. */
    closeMenus({ restoreFocus: true });
    if (next === current || app.get(`savingUrgency.${cardId}`)) return;
    patchWorkCard(cardId, { urgency: next });
    app.set(`savingUrgency.${cardId}`, true);
    try {
      await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/workcards/${cardId}/urgency`, { urgent: next === 'Urgent' });
      await loadAll(); // the sprint row chip and the urgent tile read server-derived values (2026-09-05 review finding 1)
    } catch (err) {
      patchWorkCard(cardId, { urgency: current });
      flashBanner(`Urgency write failed — reverted. ${errText(err)}`);
    } finally {
      app.set(`savingUrgency.${cardId}`, false);
    }
  },
  // W3 (BRD-§9-A1): same optimistic-with-rollback shape as urgency; the box
  // is taller — head + THREE options
  openDiffMenu(ctx, cardId) {
    openOverlay(ctx, cardId, { key: 'diffMenu', posKey: 'diffMenuPos', saving: 'savingDifficulty', h: 116, gap: 3 });
  },
  async chooseDifficulty(_ctx, cardId, next, current) {
    closeMenus({ restoreFocus: true });
    if (next === current || app.get(`savingDifficulty.${cardId}`)) return;
    patchWorkCard(cardId, { difficulty: next });
    app.set(`savingDifficulty.${cardId}`, true);
    try {
      await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/workcards/${cardId}/difficulty`, { difficulty: next });
      await loadAll(); // the Sprint Schedules bar re-keys on difficulty × lane
    } catch (err) {
      patchWorkCard(cardId, { difficulty: current });
      flashBanner(`Difficulty write failed — reverted. ${errText(err)}`);
    } finally {
      app.set(`savingDifficulty.${cardId}`, false);
    }
  },
  pipeScrolled(ctx) { updateThumb(ctx.node, 'pipeThumb'); },
  ganttScrolled(ctx) { updateThumb(ctx.node, 'ganttThumb'); },
  /* on the planner a chevron is worth exactly one week column — the timeline
     has a unit and the affordance should speak it; the two data tables have
     none, so they keep the fixed step */
  nudgeScroll(ctx, dir) {
    const el = scrollerOf(ctx.node);
    if (!el) return;
    el.scrollLeft += dir * (ctx.node.closest('.gwrap') ? WEEK_PX : NUDGE_PX);
    updateThumb(el, thumbKeyOf(ctx.node));
  },
  trackJump(ctx) {
    const el = scrollerOf(ctx.node);
    if (!el) return;
    const rect = ctx.node.getBoundingClientRect();
    const frac = (ctx.event.clientX - rect.left) / rect.width;
    el.scrollLeft = Math.max(0, frac * el.scrollWidth - el.clientWidth / 2);
    updateThumb(el, thumbKeyOf(ctx.node));
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
      app.set('adminError', errText(err));
    }
  },
  async adminToggleActive(_ctx, id, current) {
    try {
      await api.send('PATCH', `/api/admin/users/${id}`, { active: !current });
      await loadAdmin();
    } catch (err) {
      app.set('adminError', errText(err));
    }
  },
  /* owl #23 — capacity lock. The server audits both directions and refuses a
     no-op silently, so this only has to re-read. When the toggled project is
     the ACTIVE one, loadAll re-seats `capacity` in the same click, so the
     planner slider shows its new lock state without a reload. */
  async adminSetCapacityLock(_ctx, id, locked) {
    try {
      await api.send('PATCH', `/api/admin/projects/${id}/capacity-lock`, { locked });
      await loadAdmin();
      if (id === app.get('activeProjectId')) await loadAll();
    } catch (err) {
      app.set('adminError', errText(err));
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
      app.set('adminError', errText(err));
    }
  },

  /* ---- due-date popover (node 415:54979, write registry W2) ----
     Commit-on-Apply: clicking a day only stages it. The popover opens on the
     value the CELL shows (BR-9 precedence — Trello due first, else the sheet)
     and remembers it as dueBaseline, so Apply on an untouched popover writes
     nothing — including the case where the shown date came from the sheet. */
  openDuePopover(ctx, cardId, kind) {
    // `kind` arrives from the template, which knows it BY CONSTRUCTION
    // (parent row vs the task each-block) — the client never re-derives the
    // card kind from set-membership, so `rows` being the complete deliverable
    // store is not load-bearing. A task's shown date IS its Trello due — no
    // sheet, no precedence (owl #45).
    const current = kind === 'task'
      ? findWorkCard(cardId)?.card.due || null
      : app.get('rows').find((r) => r.cardId === cardId)?.deadline || null;
    openOverlay(ctx, cardId, {
      key: 'duePopover', posKey: 'duePopPos', saving: 'savingDeadline',
      h: DUE_POP_H, gap: 4, clampW: DUE_POP_W, // clamped both ways — the box stays fully on screen
      extra: { dueStaged: current, dueBaseline: current, dueMonth: monthOf(current || manilaToday()) },
    });
  },
  /* ---- incomplete-card HOVER CARD (owl #41, node 537:69135) ----
     Read-only: it explains what Trello is missing and links out. Same placer,
     same dismissers, same focus return as every other overlay — the only thing
     it brings of its own is its box size and the fact that a POINTER, not a
     click, opens it. It is still a card and not a tooltip because it contains
     `Open Card`, which a pointer-only overlay would put out of reach.
     `warnPopIn` is bound to the icon AND to the card itself: the card's own
     enter is what cancels the pending close while the pointer crosses the 4px
     gap, so there is no separate "hold" handler. */
  warnPopIn(ctx, cardId) { showWarnPop(ctx.node, cardId); },
  warnPopOut(ctx) {
    /* Nothing of OURS is open, so nothing of ours is leaving. showWarnPop
       REFUSES to open over another overlay (R-warn-r) — without the same rule
       on this side, a pointer that merely grazed a warning icon while a due
       popover was up would schedule a close that discards a staged date only
       Apply writes (W2). The refusal to open has to be matched by a refusal to
       close, or the guard only holds one way. */
    if (!leaveHoverOverlay('warnPop')) return;
    /* Ractive delegates an each-block's events from the <tbody> with a CAPTURE
       listener and then simulates bubbling by walking up from `ev.target` — so
       a child's mouseleave is re-dispatched to this ancestor's handler even
       though mouseleave does not bubble. Moving the pointer off the 14px glyph
       onto the button's own padding, or between two lines inside the card,
       would otherwise schedule a close while the pointer never left anything.
       `relatedTarget` is where the pointer actually went; if that is still
       inside the node this directive sits on, nothing left. Same shape as
       warnPopFocusOut's guard, for the same reason. */
    const to = ctx.event.relatedTarget;
    if (to && ctx.node.contains(to)) return;
    scheduleHoverClose(() => {
      /* A card the KEYBOARD opened is not the pointer's to close: the icon can
         be focused with the mouse resting on it, and a nudge off the glyph
         would otherwise strand a focused trigger with nothing open and no key
         that reopens it. Focus-out and Escape own that card's dismissal.
         Scoped to the host of the card that is ACTUALLY open, not to any host:
         every warned row has one, so `closest('.warnhost')` alone stands down
         for a card focus was never in — Tab to row A's icon, then hover row
         B's and leave, and B is stranded open with no pointer on it and no
         focus in it. `overlayTrigger` is the open card's own icon. */
      const ae = document.activeElement;
      const host = ae && ae.closest && ae.closest('.warnhost');
      if (host && overlayTrigger && host.contains(overlayTrigger)) return;
      closeMenus();
    });
  },
  /* Dismiss only when focus leaves the icon AND the card — focus moving from
     the icon INTO `Open Card` is a Tab we exist to allow, and `.warnhost`
     contains both, which is the whole reason the host element exists.
     Nulling `overlayTrigger` first is load-bearing: closeMenus' heldFocus
     branch would otherwise yank focus straight back to the icon the moment the
     user Tabs off `Open Card` — a focus trap. It is the same idiom
     openOverlay's toggle branch uses. A null relatedTarget (window blur, a
     click on non-focusable chrome) does NOT close: the document click
     dismisser owns that case, and closing here would fight it. */
  warnPopFocusOut(ctx) {
    /* Only OUR card is this handler's to dismiss, and `.warnhost` renders on
       EVERY warned row — so "is a card open" is not the question, "is the open
       card inside this host" is. The icon is tabbable on all 247 of them, so
       Tab can carry focus through one while a due popover is open (closeMenus
       would discard that staged date, W2, for nothing — R-warn-r from the
       focus side) or while a card the POINTER opened on another row is up
       (closing it here would discard a trigger this host never captured). The
       card is rendered inside this host exactly when it is ours. */
    if (!ctx.node.querySelector('.warnpop')) return;
    const to = ctx.event.relatedTarget;
    if (!to || ctx.node.contains(to)) return;
    overlayTrigger = null;
    closeMenus();
  },
  duePick(_ctx, iso) { app.set('dueStaged', iso); }, // stages only — Apply writes
  dueNav(_ctx, dir) { app.set('dueMonth', monthShiftYm(app.get('dueMonth'), dir)); },
  // shortcuts are Manila-relative (invariant 11) and move the visible month
  // so the staged day is always in view
  dueShortcut(_ctx, which) {
    const today = manilaToday();
    const iso = which === 'week' ? isoAddDays(today, 7) : which === 'monday' ? isoNextMonday(today) : today;
    app.set({ dueStaged: iso, dueMonth: monthOf(iso) });
  },
  async dueApply(_ctx, cardId, kind) {
    const staged = app.get('dueStaged') || null;
    const baseline = app.get('dueBaseline') || null;
    closeMenus({ restoreFocus: true });
    if (staged === baseline) return; // nothing staged — no call, no audit
    await writeDeadline(cardId, staged, kind);
  },
  async dueClear(_ctx, cardId, kind) {
    closeMenus({ restoreFocus: true });
    await writeDeadline(cardId, null, kind); // confirm-free; the sheet deadline (if any) takes over
  },

  weekShiftView(_ctx, dir) { app.set('weekStart', mondayShift(app.get('weekStart'), dir)); },
  /* the slider reads its own node rather than a two-way binding: 'input' is
     the live drag (value + descriptor only, no call) and 'change' is the
     release, which is the ONE event that writes. Keyboard arrows fire both,
     so they commit too. */
  capSlide(ctx) { app.set('capDraft', Number(ctx.node.value)); },
  async capCommit(ctx) { await writeCapacity(Number(ctx.node.value)); },
  /* ---- Sprint Schedules placement (owls #72/#73, node 731:100277) --------
     Hover, then click: the pointer over any UNPLOTTED row's track names a
     week (the cell tints, the violet + rides the column), and the click
     writes `starts_on` — the drag era's five-handler dance replaced by one
     PATCH. The finish is computed server-side, so no forecast math runs here
     (invariants 5–7), and the bar and the FORECASTED column read the same
     field back. */
  sprintSelect(_ctx, itemId) {
    /* toggle only — the checkbox is a row HIGHLIGHT whose semantics are
       still with product (owl jp→miles #60); it no longer arms placement,
       which rides hover on every unplotted row (node 731:100277). */
    app.set('sprintSel', app.get('sprintSel') === itemId ? null : itemId);
  },
  plotHover(ctx, rowId) {
    /* NOT during a placement's awaited reload (review 2026-08-28b, finding
       1): the stale DOM still binds this handler on the row being placed,
       so a hand drifting inside the track would re-arm `plotRow` after
       plotPlace's cleanup — and the fresh render then strips the only
       mouseleave that could ever clear it. The lock is already up for the
       whole flight, so it is the one fact that separates a live hover from
       this ghost. */
    if (sprintItemSaving) return;
    /* the same pure mapper the drop path used (weekAtX): pointer X against
       the TRACK's measured rect. `rowId` is the committed row whose track
       the pointer is on — only committed rows bind this; the search row and
       its results have inert tracks (#77 §0, PLAN.md B5) — so the + and the
       cell tint render on that row alone. Per-mousemove is fine — Ractive
       no-ops the set until something actually changes. */
    app.set({
      plotWeek: weekAtX(ctx.event.clientX, ctx.node.getBoundingClientRect(), app.get('plannerWeeks')),
      plotRow: rowId,
    });
  },
  plotLeave() { app.set({ plotWeek: null, plotRow: null }); },
  async plotPlace(_ctx, itemId) {
    const week = app.get('plotWeek');
    /* no week means no mousemove ran before the click (a tap, or a click
       racing the first hover) — nothing to place, so nothing to send. And
       the week must be THIS track's hover (review 2026-08-28b, finding 7):
       `plotWeek` is a single global, so a click that outran its own first
       mousemove could otherwise place this row at a week hovered on some
       OTHER row's track. */
    if (!week || app.get('plotRow') !== itemId || sprintItemSaving) return;
    /* THE LOCK SPANS THE RELOAD (review 2026-08-28, finding 2). Released in
       the old `finally`, it dropped while loadAll was still fetching — the
       row on screen still looked placeable/clearable and a second gesture
       sent a PATCH the server would now no-op but the click should never
       make. `finally` runs before code after the try, so the release lives
       after the awaited reload, on both paths. */
    sprintItemSaving = true;
    try {
      /* #72 §6: placement is by hovered WEEK, and the week's Monday is the
         start — `plotWeek` IS that Monday (plannerWeeks keys are Mondays).
         Day-granular placement is #75's rollover territory. */
      await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/sprint-items/${itemId}`, { starts_on: week });
      /* Clear the hover state ONLY if it still points at this row (the
         finding-4 discipline): a hover that moved onto another row during
         the await belongs to the USER'S next placement, not to this one's
         cleanup. */
      if (app.get('plotRow') === itemId) app.set({ plotRow: null, plotWeek: null });
      await loadAll();
    } catch (err) {
      // nothing was optimistic and the selection survives, so the user can
      // re-click once the banner explains what refused
      flashBanner(errText(err));
    } finally {
      sprintItemSaving = false;
    }
  },
  /* the calendar icon: clear the placement, the row stays (#72). Three locks
     against a no-op reaching the audit log (invariant 10 logs changes, not
     attempts): the button is disabled without a `startsOn`; this in-flight
     lock now spans the reload (review 2026-08-28, finding 2 — released
     early, it left a stale-enabled button clickable mid-fetch); and the
     server's own before==after guard, the backstop the first two cannot be. */
  async unplotItem(_ctx, itemId) {
    if (sprintItemSaving) return;
    sprintItemSaving = true;
    try {
      await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/sprint-items/${itemId}`, { starts_on: null });
      await loadAll();
    } catch (err) {
      flashBanner(errText(err));
    } finally {
      sprintItemSaving = false;
    }
  },

  /* ONE add in flight per screen (B10, amended at review 2026-09-05, B2-R2):
     `addBusy` names the sprint whose act is in the air, and while it is set
     EVERY sprint's links render inert — the template disables on the same
     truth this guard reads, so a link never renders live and then answers a
     click with nothing. The adds do NOT take the placement lock
     (`sprintItemSaving`): that lock exists for the hover ghost a PLACEMENT
     reload can strand on the row whose track just lost its handlers, and an
     add's reload strips no track. Two writes racing is what `loadGen` is for.
     The lock spans the reload: released early, the links would re-arm while
     the pool on screen is still the old one, and a second click would POST a
     card the server now refuses. */
  async addOne(_ctx, sprintId, cardId) {
    if (app.get('addBusy')) return;
    app.set('addBusy', sprintId);
    try {
      await api.send('POST', `/api/projects/${app.get('activeProjectId')}/sprint-items`, {
        sprint_id: sprintId, card_id: cardId,
      });
      /* the query STAYS (B4): the added card leaves the list when the reload
         replaces the pool, and the rest of the set is still what was asked for */
      await loadAll();
      addRefocus(sprintId);
    } catch (err) {
      if (addStale(err)) await loadAll();
      // errText prefers the server's own message — the 409s and 404s carry one
      flashBanner(errText(err));
    } finally {
      app.set('addBusy', null);
    }
  },
  /* ONE batch request carrying exactly the visible ids, in list order (B3):
     the list on screen IS the set. No confirmation, no count-check, no review
     pass (Miles). The server SKIPS what it cannot add — already scheduled,
     complete, gone — with a code per card and never fails the batch for it,
     so a partial result is reported in a banner, not thrown. The banner comes
     AFTER the reload (review 2026-09-05, B2-R1): the reload writes the banner
     slot itself, and a summary flashed before it lived only as long as the
     fetch. */
  async addAll(_ctx, sprintId) {
    const panel = app.get('addPanels')[sprintId];
    const ids = panel ? panel.items.map((m) => m.cardId) : [];
    if (!ids.length) return;
    if (app.get('addBusy')) return;
    app.set('addBusy', sprintId);
    /* the query as SENT: the field stays typeable during the flight, and the
       clear below must never wipe text the user typed while the batch was in
       the air — it clears the query that was consumed, not whatever the field
       holds by the time the answer lands (review 2026-09-05, B2-R4) */
    const sent = app.get(`addQ.${sprintId}`);
    try {
      const res = await api.send('POST', `/api/projects/${app.get('activeProjectId')}/sprint-items/batch`, {
        sprint_id: sprintId, card_ids: ids,
      });
      const added = Number(res.added) || 0;
      const skipped = Array.isArray(res.skipped) ? res.skipped : [];
      /* the set was consumed, so the field returns to rest (B4) — and only
         when something landed: a query that added nothing is still the
         user's, and clearing it would hide the list that explains why */
      if (added >= 1 && app.get(`addQ.${sprintId}`) === sent) app.set(`addQ.${sprintId}`, '');
      await loadAll();
      if (skipped.length) flashBanner(addSkipSummary(added, ids.length, skipped));
      addRefocus(sprintId);
    } catch (err) {
      if (addStale(err)) await loadAll();
      flashBanner(errText(err));
    } finally {
      app.set('addBusy', null);
    }
  },
  /* Escape empties THAT sprint's query (B6) — the resting state, not a
     dismissal: nothing closes, and focus stays where it was, in the field,
     which the template keeps mounted in every state. Enter is inert
     (Enter-as-Add-All went to Miles as a suggestion, not a rule), and every
     other key falls through to the two-way binding. */
  addKey(ctx, sprintId) {
    if (ctx.event.key !== 'Escape') return;
    ctx.event.preventDefault();
    app.set(`addQ.${sprintId}`, '');
  },
  /* owl #24 — collapse is PRESENTATION only: sprintGroups, the block header's
     meta/count and the capacity footer all keep reading every row, so a hidden
     row still counts against capacity (the footer is data, not visibility). */
  toggleBlock(_ctx, id) {
    app.set(`collapsedBlocks.${id}`, !app.get(`collapsedBlocks.${id}`));
    // the sheet just changed height, and an expanded block's rows did not exist
    // a frame ago — so their badges have never been measured
    remeasure();
  },
  /* owl #24 — collapsing the pane narrows --gleft, so the sheet's scrollWidth
     moves with it; without the refresh the timeline thumb keeps the old ratio
     and lies about how much timeline is off-screen. */
  toggleLeftPane() {
    /* the search field survives the collapse (PLAN.md B9): it is pane-wide,
       so it flexes to the narrow pane rather than hiding — nothing to discard */
    app.set('leftCollapsed', !app.get('leftCollapsed'));
    // the collapsed pane hides the three detail columns (#72 layout), so the
    // sheet's width and the thumb's ratio both change — re-measure next frame
    remeasure();
  },

  /* ---- sprints modal (owls #28–#30) ----
     Every edit lands in `sprintDraft` and NOTHING is written per row: Save PUTs
     the whole list once (a full replace the route audits as one
     `sprints.replace`), and Cancel discards simply by not saving — openSprints
     re-copies from `sprints` on the next open. */
  openSprints() {
    const stored = app.get('sprints');
    app.set('sprintDraft', stored.map((s) => ({ ...s })));
    /* the dirty baseline (#37): a fresh copy of the three fields a save PUTs,
       mapped off `stored` so it can never be a reference the draft edits reach.
       Same shape saveSprints sends, so `sprintDirty` compares exactly what
       would be persisted and nothing else. */
    app.set('sprintBaseline', stored.map(sprintPayload));
    app.set({ sprintModal: true, sprintError: '', sprintDeleteConfirm: null });
  },
  closeSprints() { app.set({ sprintModal: false, sprintDeleteConfirm: null }); },
  /* a new sprint starts the Monday AFTER the last one ends and runs to that
     week's Friday — so the first thing the user sees is a valid whole week that
     neither overlaps nor gaps, rather than a zero-length sprint on today */
  addSprint() {
    const draft = app.get('sprintDraft');
    const lastEnd = draft.reduce((a, s) => (s && s.end && s.end > a ? s.end : a), '');
    const start = lastEnd ? mondayShift(mondayIso(lastEnd), 1) : mondayIso(manilaToday());
    app.push('sprintDraft', { name: `Sprint ${draft.length + 1}`, start, end: fridayIso(start) });
    app.set({ sprintDeleteConfirm: null, sprintError: '' });
  },
  /* R-f-2 — snap on PICK, never reject: START to the Monday of the week the
     user chose, END to that week's Friday. Bound to `change`, not `input`:
     some engines fire `input` per keystroke and would rewrite a half-typed
     year. `ctx.node.value` is read rather than the model so the snap is applied
     to what the picker actually committed. */
  snapSprintStart(ctx, idx) {
    const v = ctx.node.value;
    app.set(`sprintDraft.${idx}.start`, v ? mondayIso(v) : v);
  },
  snapSprintEnd(ctx, idx) {
    const v = ctx.node.value;
    app.set(`sprintDraft.${idx}.end`, v ? fridayIso(v) : v);
  },
  /* Miles's ruling (#30): a sprint holding work warns with the COUNT before
     it goes. Re-based on the work-card unit (#72): membership is EXPLICIT now
     (sprint_items.sprintId), so the count is the sprint's own rows — a
     filter, not a date-range estimate. A draft-added sprint has no id yet and
     so no rows: it removes outright, as before. */
  removeSprint(_ctx, idx) {
    const s = app.get('sprintDraft')[idx];
    if (!s) return;
    const covered = app.get('sprintItems').rows.filter((r) => r.sprintId === s.id).length;
    if (!covered) {
      app.splice('sprintDraft', idx, 1);
      app.set('sprintDeleteConfirm', null);
      return;
    }
    app.set('sprintDeleteConfirm', { idx, name: s.name, count: covered });
  },
  cancelRemoveSprint() { app.set('sprintDeleteConfirm', null); },
  confirmRemoveSprint() {
    const c = app.get('sprintDeleteConfirm');
    if (!c) return;
    app.splice('sprintDraft', c.idx, 1);
    app.set('sprintDeleteConfirm', null);
  },
  async saveSprints() {
    // the button is already disabled in these states; this is the second lock,
    // because the server rejects every one of them and would write nothing
    if (app.get('sprintBlocked')) return;
    // and nothing to commit is not a save: a no-op PUT would write a
    // `sprints.replace` audit row for a non-change, which invariant 10 does not
    // ask for — it logs changes, not attempts (the batch-4 Calendar Remove fix)
    if (!app.get('sprintDirty')) return;
    try {
      await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/sprints`, {
        sprints: app.get('sprintDraft').map(sprintPayload),
      });
      app.set({ sprintModal: false, sprintDeleteConfirm: null });
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
    try {
      await api.send('POST', `/api/projects/${app.get('activeProjectId')}/conflicts/acknowledge`, { conflict_key: key, ...(reason ? { reason } : {}) });
      const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
      app.set('deadlinePayload', res);
      computeDeadlines();
    } catch (err) {
      flashBanner(`Acknowledge failed — the conflict stays visible. ${errText(err)}`);
    }
  },
  async restoreConflict(_ctx, key) {
    try {
      await api.send('POST', `/api/projects/${app.get('activeProjectId')}/conflicts/restore`, { conflict_key: key });
      const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
      app.set('deadlinePayload', res);
      computeDeadlines();
    } catch (err) {
      flashBanner(`Restore failed. ${errText(err)}`);
    }
  },
});


