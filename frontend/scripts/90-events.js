/* ---------- events ---------- */

/* Shared by click and the tablist arrow keys (WAI tabs pattern). */
function selectTab(id) {
  closeMenus();
  app.set('activeTab', id);
  if (id === 'admin' && app.get('isAdmin')) loadAdmin();
  if (id === 'pipeline' || id === 'requests' || id === 'schedules' || id === 'forecast') {
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
  // Planner view state is per-project too (R-d, owl #25): a pending suggestion
  // is a plan for THIS project's cards — its cardIds mean nothing in the next
  // one, and Accept would post them to /replot regardless. `collapsedBlocks` is
  // keyed on sprint ids, which are per-project, and on 'outside'/'unscheduled',
  // which would otherwise carry over. `leftCollapsed` deliberately does NOT
  // reset — it is a reader preference about the pane, not project data.
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
    suggest: null,
    collapsedBlocks: {},
    // owl #45 recon finding: `expanded` is keyed on mc_number, which repeats
    // ACROSS projects (invariant 3) — carried over, project A's expanded
    // MC-655 arrived pre-expanded in project B. Per-project view state, so it
    // resets with the rest.
    expanded: {},
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
   jp→miles #50. */
function pipeBackToTop() {
  // `scrollerOf` is the codebase's single "which scroller" resolver; querying
  // `.pscroll` here was a second way to find the same element today and a way
  // to find a different one tomorrow.
  const el = scrollerOf(null);
  if (el) el.scrollTop = 0;
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
  },
  noteKeydown(ctx) {
    ctx.event.stopPropagation(); // textareas own their keys
    if (ctx.event.key === 'Escape') app.set({ noteEditing: null, noteError: '' });
  },
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
  toggleGroup(_ctx, mc) { app.toggle(`expanded.${mc}`); },


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
    pipeBackToTop();
    closeMenus({ restoreFocus: true });
  },
  clearPipeSort() {
    app.set('pipeSort', null);
    pipeBackToTop();
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
    pipeBackToTop();
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
     the top is the same rule every other narrowing follows (R-pf-h). */
  removePipeAxis(_ctx, axis) {
    app.set(`pipeFilters.${axis}`, []);
    pipeBackToTop();
  },
  clearPipeFilters() {
    app.set('pipeFilters', PIPE_FILTERS_EMPTY());
    pipeBackToTop();
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
    app.toggle(`expanded.${mcNumber}`);
  },
  openUrgencyMenu(ctx, cardId) {
    openOverlay(ctx, cardId, { key: 'urgencyMenu', posKey: 'urgencyMenuPos', saving: 'savingUrgency', h: 92, gap: 3 });
  },
  // annotations 169:26364/26074: optimistic write with 'saving…' chrome and
  // rollback — Sirius never shows a state Trello does not hold (FR-4.7).
  async chooseUrgency(_ctx, cardId, next, current) {
    /* through the SHARED close path, not `app.set(key, null)`: committing a
       choice unmounts the menu exactly as Escape does, so a keyboard user who
       presses Enter on an option must land back on the trigger rather than at
       <body>. Nulling the key directly also left `overlayTrigger` pinning a
       detached node until the next open. Same for the four handlers below. */
    closeMenus({ restoreFocus: true });
    if (next === current || app.get(`savingUrgency.${cardId}`)) return;
    patchRow(cardId, { urgency: next });
    app.set(`savingUrgency.${cardId}`, true);
    try {
      await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/urgency`, { urgent: next === 'Urgent' });
    } catch (err) {
      patchRow(cardId, { urgency: current });
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
    patchRow(cardId, { difficulty: next });
    app.set(`savingDifficulty.${cardId}`, true);
    try {
      await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/difficulty`, { difficulty: next });
      await loadAll(); // difficulty re-keys the forecast (difficulty × lane) and the hard-mix numbers
    } catch (err) {
      patchRow(cardId, { difficulty: current });
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
  /* the drag flag hides ONE thing for the duration: the deadline tick. `.gdl`
     paints over the bar (later sibling, same absolute containing block) and
     carries no dragover handler, so left solid it refuses the drop across its
     own 2px column; it cannot be transparent at rest because it owns a real
     `title` there. It is a class toggle only (no geometry, no text), so the
     drag image the browser snapshots at dragstart is unaffected. dragend always
     fires, drop or cancel, and moveRows clears it a second time for the case
     where a re-render eats the source node first. The SEGMENTS left that rule
     because nothing needs them transparent any more — the solid run box beneath
     them takes the drop — and they stay solid so that no pixel inside the drag
     source can be blanked, which is what brings back Chrome's same-tick cancel
     the moment anyone moves `draggable` down onto a segment (T153). */
  dragRow(ctx, cardId) {
    ctx.event.dataTransfer.setData('text/plain', cardId);
    ctx.event.dataTransfer.effectAllowed = 'move';
    app.set('ganttDragging', true);
  },
  dragEnd() { app.set('ganttDragging', false); },
  dragOver(ctx) { ctx.event.preventDefault(); },
  async dropOnWeek(ctx, weekKey) {
    ctx.event.preventDefault();
    await moveRows(ctx.event.dataTransfer.getData('text/plain'), weekKey);
  },
  /* the run box is the drag source AND its own drop target (T153, re-seated on
     `.grun` in batch 8). Chrome aborts a drag whose source is not hit-testable,
     so the source can never go transparent — it maps the pointer to a week
     column from the TRACK's own geometry and then runs the SAME `moveRows`
     recipe `dropOnWeek` runs: one write, one audit row, no second path.
     The body is unchanged by the move because it never measured the element it
     is bound to. `ctx.node` is now the run's own box rather than the track-wide
     wrapper, and `closest('.gtrack')` makes that a non-event: the rect that
     gets measured is the TRACK's either way, so the column arithmetic is
     identical whether this directive sits on a 1104px box or a 24px one.
     `ctx.node`, never `ctx.event.target`: with the segments hit-testable the
     event fires on a 26px `.gseg` and bubbles up to the box carrying this
     directive, and measuring the target would map a fraction of a column.
     Outside the run the track is transparent again, so the `.gweek` cells take
     those drops themselves through `dropOnWeek` — the same `moveRows`.
     The id comes off the dataTransfer and never off this row, because an
     UNSCHEDULED row dragged across a scheduled row lands here. */
  async dropOnBar(ctx) {
    ctx.event.preventDefault();
    /* the WHOLE track is the geometry, never the run box: the run is as narrow
       as 24px, so measuring it would map the pointer to the wrong week and
       move the card somewhere the user did not point. No fallback for that
       reason — a run outside a track is a broken render, and refusing the drop
       is the only safe answer. */
    const track = ctx.node.closest('.gtrack');
    if (!track) return;
    const week = weekAtX(ctx.event.clientX, track.getBoundingClientRect(), app.get('plannerWeeks'));
    if (!week) return;
    await moveRows(ctx.event.dataTransfer.getData('text/plain'), week);
  },
  /* the Unscheduled block's bar is the one unslot target — the sprint bars
     take the same handlers and refuse the drop, so the markup has one path
     (the pattern dayDragOver already uses for holidays) */
  dragOverBlock(ctx, kind) {
    if (kind === 'unscheduled') ctx.event.preventDefault();
  },
  async dropBlock(ctx, kind) {
    if (kind !== 'unscheduled') return;
    ctx.event.preventDefault();
    await moveRows(ctx.event.dataTransfer.getData('text/plain'), null);
  },
  async rowKey(ctx, cardId) {
    /* THE ROW ITSELF, never a descendant. `.growr` is the keydown listener but
       it holds seven other focusable controls — the select checkbox, the note
       button, and the three row-action buttons — and an arrow key on any of
       them bubbled here and RESLOTTED the deliverable a week, an audited data
       change from a keystroke that should have done nothing. The requestor
       badge was immunised individually in batch 6, which hid how wide this
       was; the guard belongs here, the way `pipeRowKey` has always had it. */
    if (ctx.event.target !== ctx.node) return;
    const key = ctx.event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    ctx.event.preventDefault();
    const row = app.get('schedRows').find((r) => r.cardId === cardId);
    if (!row) return;
    /* the keyboard path says what the drag path says. /replot skips pinned
       rows server-side (FR-5.9), so without this an arrow key on a pinned row
       is a round trip that changes nothing and reports nothing — the same
       silent no-op that made pinned rows non-draggable (contract §3.8). A
       multi-select still goes through: /replot applies the unpinned members. */
    const sel = app.get('selected');
    const inMulti = Object.keys(sel).filter((id) => sel[id]).length > 1 && sel[cardId];
    if (row.pinned && !inMulti) {
      flashBanner('Pinned — unpin to move.');
      return;
    }
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
  /* owl #27's Calendar Remove — unslot. It is the SAME audited path a drop on
     the Unscheduled block header takes (`moveRows(id, null)` → POST /replot →
     one `schedule.replot` audit row with `after.slotted_week = null`), not a
     new endpoint and not a new audit action. The pinned guard is belt and
     braces: the button is already `disabled` (JP's ruling B — pins stay fully
     frozen), and /replot would skip the row server-side anyway. */
  async unslotRow(_ctx, cardId) {
    const row = app.get('schedRows').find((r) => r.cardId === cardId);
    if (!row) return;
    if (row.pinned) {
      flashBanner('Pinned — unpin to move.');
      return;
    }
    // a row with no slotted week is already off the schedule: /replot would
    // still audit the no-op, and a non-change must not reach the audit log
    if (!row.slottedWeek) return;
    await moveRows(cardId, null);
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
    // the whole SuggestResult is the state; every count in the bar is a
    // computed over it, so there is no second number to keep in step
    app.set('suggest', res);
  },
  clearSuggest() { app.set('suggest', null); },
  async acceptSuggest() {
    const s = app.get('suggest');
    if (!s) return;
    /* see the suggestOffWeeks note — the button is already disabled in this
       state; this is the second lock, because a persisted non-Monday week
       corrupts the slot silently and is not recoverable from the UI */
    if (app.get('suggestOffWeeks').length) {
      flashBanner(`Suggestion not applied — ${app.get('suggestOffWeeksText')}. Accepting would corrupt the slotted weeks.`);
      return;
    }
    if (app.get('suggestProposed') === 0) return; // R-e: nothing to apply, and no empty /replot
    const moves = Object.entries(s.plan).map(([cardId, week]) => ({ cardId, week }));
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/replot`, { moves });
    app.set('suggest', null);
    await loadAll();
  },
  /* owl #24 — collapse is PRESENTATION only: plannerGroups, the block header's
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
    app.set('leftCollapsed', !app.get('leftCollapsed'));
    // collapsing hides .c-req entirely, so its badges measure 0 and lose the tab
    // stop; expanding has to re-measure to give it back
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
  /* Miles's ruling (#30): a sprint covering slotted deliverables warns with the
     COUNT before it goes. The count is read off the rows already loaded — the
     same `slottedWeek ∈ [start, end]` test that derives membership — so it is
     the real number, not an estimate. Zero covered rows removes it outright. */
  removeSprint(_ctx, idx) {
    const s = app.get('sprintDraft')[idx];
    if (!s) return;
    const covered = app.get('schedRows').filter(
      (r) => r.slottedWeek && s.start && s.end && r.slottedWeek >= s.start && r.slottedWeek <= s.end,
    ).length;
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

  /* ---- Forecast planning writes (§7.3, R-fc-t) ----

     Both of these used to be two unguarded lines: send whatever the control
     holds, then reload. The server refuses a review SLA outside 0..60 with a
     400, `api.send` throws, neither handler caught it, and there is no
     unhandled-rejection handler anywhere in this app — so a refused number sat
     on screen indefinitely with no banner, no revert and no reload. They now
     do what the four neighbouring writes have always done.

     These are Sirius-owned planning fields, not registry writes, so they are
     not gated on `writesEnabled` — an observation-mode project still plans. */
  async setConfidence(ctx, cardId) {
    const row = app.get('rows').find((r) => r.cardId === cardId);
    if (!row) return;
    const next = ctx.node.value;
    const prev = row.confidence;
    if (next === prev) return; // no-op guard — no call, no audit row
    patchRow(cardId, { confidence: next });
    try {
      await api.send('PATCH', patchUrl(cardId), { confidence: next });
      await loadAll(); // every date and duration to the right of it re-derives server-side
    } catch (err) {
      patchRow(cardId, { confidence: prev });
      flashBanner(`Confidence write failed — reverted. ${errText(err)}`);
    }
  },
  /* §7.3: "Decimals accepted; negative and non-numeric rejected without
     clearing the field."

     A `type="number"` input reports non-numeric text as the empty string, and
     the empty string is ALSO how a reader clears an override — so the two
     cases are indistinguishable at the node and the old code resolved the
     ambiguity the destructive way, deleting the override on a typo. `validity
     .badInput` is the one signal that separates them: it is true only when the
     control holds something it could not parse. That case snaps the model back
     to the last committed value, which re-renders the field with the good
     number instead of an empty one — the house's snap-back pattern, the same
     one the capacity slider uses.

     A negative or out-of-range number is refused the same way, locally, so the
     reader never has to learn the 0..60 bound from a red banner. */
  async setSla(ctx, cardId, field) {
    const row = app.get('rows').find((r) => r.cardId === cardId);
    if (!row) return;
    const key = field === 'sla_sketch' ? 'slaSketch' : 'slaRender';
    const prev = row[key] ?? null;
    const raw = ctx.node.value;
    const bad = ctx.node.validity && ctx.node.validity.badInput;
    const next = raw === '' ? null : Number(raw);
    if (bad || (next !== null && (!Number.isFinite(next) || next < 0 || next > SLA_MAX))) {
      /* THE NODE, not the model. `{{#each forecastRows}}` iterates a COMPUTED,
         so `forecastRows.N.slaSketch` is a read-only computation child: the
         typing never reached the model in the first place, and writing `prev`
         back is a write of the value the model already holds — which Ractive
         drops on an equality check, so nothing re-renders and the refused
         number stays on screen under a banner claiming it was kept.
         A `badInput` field cannot be fixed by any model write at all, because
         it reports its own value as the empty string. Setting the control is
         the only thing that puts the last good number back in front of the
         reader, which is what §7.3's "without clearing the field" asks for. */
      ctx.node.value = prev === null ? '' : prev;
      flashBanner(bad ? 'Review SLA must be a number — kept the last value.' : `Review SLA must be between 0 and ${SLA_MAX} days — kept the last value.`);
      return;
    }
    if (next === prev) return; // no-op guard — no call, no audit row
    patchRow(cardId, { [key]: next });
    try {
      await api.send('PATCH', patchUrl(cardId), { [field]: next });
      await loadAll();
    } catch (err) {
      patchRow(cardId, { [key]: prev });
      flashBanner(`Review SLA write failed — reverted. ${errText(err)}`);
    }
  },
  forecastScrolled(ctx) { updateThumb(ctx.node, 'fcThumb'); },
});

function patchUrl(cardId) {
  return `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/planning`;
}

/* One week's total, moved by one row (§3.6). The base is the CURRENT view of
   the week — the optimistic override if this drop already touched it, else the
   server's — because a delta applied to zero would erase every row the server
   counted. `null` means the week has no rows left and renders a dash. */
function bumpWeek(map, weekKey, row, sign) {
  if (!weekKey) return;
  const seen = Object.prototype.hasOwnProperty.call(map, weekKey);
  const cur = (seen ? map[weekKey] : app.get('perWeek')[weekKey]) || { cards: 0, rows: 0, hard: 0 };
  const rows = cur.rows + sign;
  if (rows <= 0) {
    map[weekKey] = null;
    return;
  }
  const hard = cur.hard + (row.difficulty === 'Hard' ? sign : 0);
  const cards = Math.max(0, Math.round((cur.cards + sign * (row.weight || 1)) * 1000) / 1000);
  const hardShare = hard / rows;
  const cap = app.get('capacity');
  const ideal = app.get('capHardIdeal');
  const ceiling = app.get('capHardCeiling');
  map[weekKey] = {
    cards,
    rows,
    hard,
    hardShare,
    over: cards > cap.weekly,
    hardOver: hardShare > ceiling,
    hardWarn: hardShare > ideal && hardShare <= ceiling,
  };
}

/* ---- the arrival affordance (owl #31) ----

   The row does NOT travel with the pointer any more: the bar moves, the write
   lands, and the row's relocation into another block is an OUTCOME of
   re-deriving `schedRows` — so something has to say where it went. A brief
   background pulse plus a scroll into view is that something.

   `loadAll()` re-renders the whole block, so the moved row's node identity
   changes and any reference captured before the reload is stale. The class
   therefore lives in Ractive state (it survives the re-render by construction)
   and the DOM is re-queried by cardId inside a frame, the way refreshThumbs
   already does. `block: 'nearest'` cannot disturb the timeline's own
   horizontal scroller: a row is wider than the scrollport, so both its edges
   are outside it and the inline axis is left alone. */
const ARRIVAL_MS = 1200;
let arrivalTimer = null;
function announceArrival(cardIds) {
  if (!cardIds.length) return;
  const map = {};
  for (const id of cardIds) map[id] = true;
  app.set('arrived', map);
  if (arrivalTimer) clearTimeout(arrivalTimer);
  arrivalTimer = setTimeout(() => {
    arrivalTimer = null;
    app.set('arrived', {});
  }, ARRIVAL_MS);
  requestAnimationFrame(() => {
    const node = [...document.querySelectorAll('.gantt .growr')].find((n) => cardIds.includes(n.dataset.card));
    if (!node) return;
    const box = node.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) node.scrollIntoView({ block: 'nearest' });
  });
}

/* BR-8: a multi-select drag applies the grabbed row's interval to every
   selected row. A null target unslots instead — /replot takes `week: null`,
   and an interval has no meaning when there is no week to land on. */
async function moveRows(grabbedId, targetWeek) {
  /* the drop has landed, so the deadline ticks can stop hiding from hit-testing
     even if dragend has not fired yet (a re-render that eats the source node
     would swallow it, and a stuck flag would leave every tick's tooltip dead).
     Harmless on the keyboard path, where the flag was never set. */
  app.set('ganttDragging', false);
  const selected = app.get('selected');
  const rows = app.get('schedRows');
  const grabbed = rows.find((r) => r.cardId === grabbedId);
  if (!grabbed) return;
  const ids = Object.keys(selected).filter((id) => selected[id]);
  const group = ids.length > 1 && ids.includes(grabbedId) ? ids : [grabbedId];
  const from = grabbed.slottedWeek || targetWeek;
  const deltaWeeks = targetWeek === null ? 0 : Math.round((Date.parse(targetWeek) - Date.parse(from)) / (7 * 864e5));
  const moves = group.map((cardId) => {
    const row = rows.find((r) => r.cardId === cardId);
    if (targetWeek === null) return { cardId, week: null };
    return { cardId, week: row.slottedWeek ? mondayShift(row.slottedWeek, deltaWeeks) : targetWeek };
  });
  /* A NON-CHANGE MUST NOT REACH THE AUDIT LOG — the rule `unslotRow` and
     `saveSprints` already keep. Releasing the bar inside the column it is
     already in is now an easy gesture (batch 8 made the coloured run itself
     the handle, so the pointer barely has to travel), and it used to POST
     /replot and write a `schedule.replot` row that recorded nothing. Only when
     EVERY member is a no-op: a mixed multi-select still goes, and /replot
     skips the members that have not moved. */
  if (moves.every((mv) => {
    const row = rows.find((r) => r.cardId === mv.cardId);
    return !!row && (row.slottedWeek || null) === mv.week;
  })) return;
  /* the footer moves with the rows, before the round trip. Pinned rows are
     skipped server-side (FR-5.9), so counting them here would show a total the
     server will never agree with. */
  const local = { ...app.get('perWeekLocal') };
  for (const mv of moves) {
    const row = rows.find((r) => r.cardId === mv.cardId);
    if (!row || row.pinned) continue;
    bumpWeek(local, row.slottedWeek, row, -1);
    bumpWeek(local, mv.week, row, 1);
  }
  app.set('perWeekLocal', local);
  try {
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/replot`, { moves });
  } catch (err) {
    app.set('perWeekLocal', {}); // the optimistic totals are void — fall back to the server's
    flashBanner(`Replot failed — the plan is unchanged. ${errText(err)}`);
    return;
  }
  await loadAll();
  /* pinned members are skipped server-side, so they never arrive anywhere and
     must not be pulsed as though they had */
  announceArrival(moves.map((mv) => mv.cardId).filter((id) => {
    const row = rows.find((r) => r.cardId === id);
    return row && !row.pinned;
  }));
}

