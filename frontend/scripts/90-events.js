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
  // work-card unit, #72): a half-built `addRow` names THIS project's card
  // and sprint ids — carried over, the next click would write them into
  // another project — and `sprintSel` (the checkbox highlight) plus the
  // hover pair `plotRow`/`plotWeek` point at rows the next project does not
  // have. `collapsedBlocks` is keyed on sprint ids,
  // which are per-project. `leftCollapsed` deliberately does NOT reset — it
  // is a reader preference about the pane, not project data.
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
    /* Sprint Schedules placement + Add row (#72) — `addMenu` needs no entry
       of its own: it is an overlay key, so NO_OVERLAYS above already nulls it. */
    sprintSel: null,
    plotRow: null,
    plotWeek: null,
    addRow: null,
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

/* ONE placement write in flight (the savingUrgency discipline, invariant 8's
   shape): a double-click on the track — or on the calendar icon — would send
   the same PATCH twice, and the second would bank an audit row for a
   non-change. A single flag, not per-item chrome: both writes end in loadAll,
   which replaces the rows before a second gesture can mean anything. */
let sprintItemSaving = false;

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
       the TRACK's measured rect. `rowId` is whose track the pointer is on —
       a committed row's id, or 'add' for the draft row — so the + and the
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

  /* ---- the Add row (#72 §3, #73) ----
     ONE pending row per screen — `addRow` is a single object, not a map, so
     opening a zone in another sprint replaces a half-built row rather than
     accumulating drafts. Nothing is written until Add Item posts. */
  openAddRow(_ctx, sprintId) {
    // plot state clears with the draft's lifecycle — a stale 'add' hover
    // must never survive into (or past) a draft it was not pointed at
    app.set({ addRow: { sprintId, mc: null, cardId: null, saving: false }, plotRow: null, plotWeek: null });
  },
  /* THE one owner of "discard the draft" — Escape (60-overlays fires this)
     and the pane collapse both route here, so the discard cannot fork
     (review 2026-08-28b, finding 3: a direct addRow-null elsewhere left
     this cleanup unreachable). The hover clear is identity-guarded: a live
     hover on a COMMITTED row while the draft dies is the user's, not ours. */
  cancelAddRow() {
    app.set('addRow', null);
    if (app.get('plotRow') === 'add') app.set({ plotRow: null, plotWeek: null });
  },
  openAddMenu(ctx, which) {
    /* 'card' is INERT until an MC is picked (#73): its options are keyed by
       MC, so opening it early would show a list that belongs to nobody.
       Through openOverlay for the shared lifecycle — outside click, Escape,
       mutual exclusion — and openOverlay's toggle is what closes an open
       menu on a second click of its control. */
    if (which === 'card' && !app.get('addRow.mc')) return;
    /* UPWARD IS THE DEFAULT, FLIP ON COLLISION (#73's own allowance). The
       menu is CSS-anchored 5px above the control at up to 218px tall, and
       .gwrap clips it: above an EMPTY first sprint there is ~161px of sheet,
       so the top options — the alphabetically FIRST MCs — rendered outside
       reach (review 2026-08-28, finding 11). Measured at open against the
       scroller's visible top, because the clip is the scroller's, not the
       viewport's. */
    const wrap = ctx.node.closest('.gwrap');
    const headroom = wrap ? ctx.node.getBoundingClientRect().top - wrap.getBoundingClientRect().top : Infinity;
    app.set('addMenuFlip', headroom < 218 + 5);
    openOverlay(ctx, which, { key: 'addMenu' });
  },
  pickAddMc(_ctx, mc) {
    closeMenus({ restoreFocus: true });
    /* ALWAYS clears the card — even re-picking the same MC (#73: never
       re-match a work card by name; the stored id is the only identity). */
    app.set({ 'addRow.mc': mc, 'addRow.cardId': null });
  },
  pickAddCard(_ctx, cardId) {
    closeMenus({ restoreFocus: true });
    app.set('addRow.cardId', cardId);
  },
  /* review finding 15: the add zone is a div with role=button, and that role
     is a PROMISE of Enter/Space activation the element cannot keep by itself.
     preventDefault stops Space scrolling the pane it just activated in. */
  addZoneKey(ctx, sprintId) {
    if (ctx.event.key !== 'Enter' && ctx.event.key !== ' ') return;
    ctx.event.preventDefault();
    // through the ONE open owner, the same routing the discard side uses
    // (cancelAddRow, finding 3): the spot-fix had to grow the open's state
    // change here and in openAddRow in lockstep — duplication is exactly
    // how a "key" drifts from a "click"
    app.fire('openAddRow', sprintId);
  },
  async submitAddItem() {
    const add = app.get('addRow');
    // the button is already disabled in these states; this is the second lock
    if (!add || !add.cardId || add.saving) return;
    app.set('addRow.saving', true);
    try {
      await api.send('POST', `/api/projects/${app.get('activeProjectId')}/sprint-items`, {
        sprint_id: add.sprintId, card_id: add.cardId,
      });
    } catch (err) {
      /* the 409s (CARD_COMPLETE / ALREADY_SCHEDULED) land here — errText
         prefers the server's own message, so it is shown verbatim. The row
         stays open with its picks intact for another try.
         `addRow` IS RE-READ (review 2026-08-28, finding 3): Escape or another
         zone's + can have replaced or nulled the draft during the await, and
         a keypath write into a nulled addRow makes Ractive conjure a phantom
         `{saving:false}` that matches no sprint. Only THIS draft is touched. */
      if (app.get('addRow') === add) app.set('addRow.saving', false);
      flashBanner(errText(err));
      return;
    }
    // same identity rule on success: never clobber a draft the user has
    // since opened in another sprint — the POSTed row arrives via loadAll.
    // The draft's own hover (if the pointer sat on its track) dies with it.
    if (app.get('addRow') === add) app.set('addRow', null);
    if (app.get('plotRow') === 'add') app.set({ plotRow: null, plotWeek: null });
    await loadAll();
  },
  /* one click = commit AND place (#72 §6 + node 731:100277): the draft's +
     and the Add Item button both mean "add", and this click also sets the
     start — the Add Item button remains the add-without-placement path.
     Both sibling disciplines apply: submitAddItem's identity guard (only
     THIS draft is touched after the await) and plotPlace's lock spanning
     the reload. */
  async draftPlace() {
    const add = app.get('addRow');
    const week = app.get('plotWeek');
    /* `plotRow === 'add'` for the same reason plotPlace checks its own id
       (finding 7): the week must be THIS track's hover, not a stale global
       from some committed row's. */
    if (!add || !add.cardId || add.saving || !week || app.get('plotRow') !== 'add' || sprintItemSaving) return;
    app.set('addRow.saving', true);
    sprintItemSaving = true;
    try {
      await api.send('POST', `/api/projects/${app.get('activeProjectId')}/sprint-items`, {
        sprint_id: add.sprintId, card_id: add.cardId, starts_on: week,
      });
      if (app.get('addRow') === add) app.set('addRow', null);
      /* the finding-4 discipline on the hover pair too (review 2026-08-28b,
         finding 2): a hover the user established on another row during the
         await is THEIRS — only this draft's own hover is this cleanup's. */
      if (app.get('plotRow') === 'add') app.set({ plotRow: null, plotWeek: null });
      await loadAll();
    } catch (err) {
      if (app.get('addRow') === add) app.set('addRow.saving', false);
      /* the saving gate detached the draft track's mouseleave for the whole
         flight (finding 12) — so a pointer that left during the await has no
         event left to clear the chrome. Same identity guard: only the
         draft's own hover dies. */
      if (app.get('plotRow') === 'add') app.set({ plotRow: null, plotWeek: null });
      flashBanner(errText(err));
    } finally {
      sprintItemSaving = false;
    }
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
    /* the collapsed pane cannot show the add row (its controls live in
       hidden columns — review finding 10), so an open draft is discarded
       rather than left standing invisibly with Add Item unreachable —
       through the ONE discard owner, so its hover cleanup rides along */
    if (app.get('addRow')) app.fire('cancelAddRow');
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


