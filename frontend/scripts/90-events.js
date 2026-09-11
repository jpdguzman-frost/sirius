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
  // Requests view state is per-project. A Type or Requestor value from the
  // old project may not exist in the new one, leaving an unclearable empty
  // table. The sort resets with them so the new project opens on its own
  // newest-requested default rather than inheriting an order the reader chose
  // while looking at other data — and an open note editor is keyed on
  // mc_number ALONE, which is
  // unique per project and NOT globally (invariant 3), so leaving it open
  // re-attaches project A's draft to project B's same-numbered row and
  // Submit would write it there.
  //
  // Planner view state is per-project too (R-d, owl #25; re-based on the
  // work-card unit, #72): the search queries `addQ` are keyed on THIS
  // project's sprint ids — carried over, they would name sprints the next
  // project does not have — and `sprintSel` (the checkbox highlight), the
  // week hover pair `hoverRow`/`hoverWeek` and the Deadlines drag `dlDrag`
  // point at rows it does not have either. `sprintDisplaced` names cards of
  // this project's last sprint edit. `collapsedBlocks` is keyed on sprint
  // ids, which are per-project. `leftCollapsed` deliberately does NOT reset
  // — it is a reader preference about the pane, not project data.
  /* a Deadlines drag cannot survive a project switch — the pointer is held
     down on a card that is about to stop existing — but the window
     listeners it binds would, so they come down before the keys are cleared
     below (block nine; the same discipline block seven's bar drag had). */
  dlDragStop();
  app.set({
    /* the six axes, the sort, the search and the page — the whole narrowing,
       cleared through the recipe's own empty rather than a list of axis names
       written out a second time here (owl #77 §1). The tiles come with them:
       their pressed state IS the status axis now, so there is nothing else to
       clear. */
    reqFilters: REQ_FILTERS_EMPTY(),
    reqSort: null,
    reqQ: '',
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
    hoverRow: null,
    hoverWeek: null,
    dlDrag: null,
    sprintDisplaced: null,
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
    /* Deadlines view state (PLAN.md block 3 B15; drift row thirty-five, a
       pre-existing gap): the navigator's month and the one open lane are
       about THIS project's schedule. Carried over, the lane key would name a
       week the next project may have nothing in, and the month offset would
       open the new project wherever the last one was left. Both return to
       rest with the reload. */
    monthOffset: 0,
    expandedWeek: null,
  });
  await loadAll();
}

/* THE TILES AND THE STATUS AXIS ARE ONE STATE (PLAN.md D4, owl #77 §2). The
   tiles used to own a filter of their own, so a reader could tick a status in
   the panel, press a tile that disagreed with it, and neither control would
   describe what the table was actually showing. A tile now WRITES the status
   axis: pressing one narrows to exactly its value, pressing the pressed one
   clears the axis, and the show-all tile — which names no status at all —
   clears it too. Pressed state is read back OFF the axis, so there is no
   second copy to keep in step.

   The value a tile stands for comes from the one predicate table's own map: a
   literal spelled here would be a second vocabulary for the same three words,
   and the two would drift the first time one of them was reworded.

   `Object.hasOwn`, not truthiness — the guard `toggleFacetValue` already
   carries, for the same reason: the map is an object literal, so `toString`
   and `constructor` answer a bare lookup with a function nobody can un-tick.
   A key the vocabulary does not carry is a wiring mistake, and the axis it
   would write must not become a filter over one.
   [review H5; PLAN.md §Fix amendment 3] */
function applyRequestFilter(segKey) {
  const value = Object.hasOwn(REQUEST_SEGMENT_STATUS, segKey) ? REQUEST_SEGMENT_STATUS[segKey] : null;
  const cur = app.get('reqFilters.status') || [];
  const sole = Boolean(value) && cur.length === 1 && cur[0] === value;
  app.set('reqFilters.status', value && !sole ? [value] : []);
}

/* ONE TICK, BOTH TABLES (PLAN.md D10). The filter-group partial is a single
   copy serving the Pipeline and the Requests panels — and each table's chip
   panel as well — because it was typed out twice before and the copies
   drifted. A row it draws therefore carries the table it belongs to, and the
   write is chosen HERE rather than by a handler name the partial would have to
   compose out of a value in its own context.

   MULTI-select, and the panel STAYS OPEN: a filter is built from several
   values, and closing on each tick would hide the counts at the moment they
   matter most. An unknown table is a wiring mistake — it throws, because a
   silent no-op reads to the reader as a filter that simply does nothing. */
const FACET_FILTER_ROOT = { pipe: 'pipeFilters', req: 'reqFilters' };
function toggleFacetValue(table, key, value) {
  // `typeof`, not truthiness: `constructor` and `toString` are names every
  // object literal answers to, and neither is a filter table
  const root = FACET_FILTER_ROOT[table];
  if (typeof root !== 'string') throw new Error(`toggleFacet: no filter table named ${String(table)}`);
  const cur = (app.get(`${root}.${key}`) || []).slice();
  const at = cur.indexOf(value);
  if (at > -1) cur.splice(at, 1);
  else cur.push(value);
  app.set(`${root}.${key}`, cur);
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

/* ONE row of the schedule by its item id — the rows the server sent, which is
   where `startsOn`, `finish`, `deadline` and `sprintId` live. The week click
   and the Deadlines drag both need the row they are acting on, and neither
   can read it off the DOM: the template hands a handler an id, never the
   row. */
const sprintRow = (itemId) => (app.get('sprintItems.rows') || []).find((r) => r.id === itemId) || null;
/* The row's OWN sprint off the list, or null — null both for a row that sits
   outside any sprint (`sprintId: null`, owl #90) and for one naming a sprint
   the list no longer has; `dlDayPlaceable` tells those two apart by the
   row's `sprintId`, so the second is refused rather than waved through. */
const sprintOf = (row) => (row && row.sprintId ? (app.get('sprints') || []).find((x) => x && x.id === row.sprintId) || null : null);

/* ---- THE OPTIMISTIC HALF of a placement (invariant 8's shape, block nine)
   ------------------------------------------------------------------------
   Block seven kept a drag's preview in its own state keys and let the row
   stand until the reload. Block nine moves the ROW: the week click and the
   Deadlines drop both re-stamp the row's own `startsOn` before the request
   leaves, so the bar sits on its new week and the card in its new column
   for the whole flight — and on a refusal the stamp is reversed, which IS
   the snap-back to the start the server still holds (PLAN.md: "optimistic
   with rollback"). The ROW OBJECT is replaced, never mutated, for two
   reasons: Ractive re-runs every computed and expression that reads it, and
   the replacement is the token the rollback checks — a reload that lands
   in between (a push, another tab) replaces the rows wholesale, and a
   rollback over the reloaded truth would be a second lie. `finish` is
   carried along by the same calendar-day distance the start moved, so the
   bar keeps its width for the flight; no forecast runs here (invariants
   5–7) — the reload brings the server's finish, and its holiday-aware start
   for a week placement (#89 §2). `late` is the one comparison the server
   makes (finish after deadline, either absent = not late), re-made on the
   stamped pair so the red bar follows the move. */
const calendarDaysBetween = (fromIso, toIso) =>
  Math.round((new Date(toIso + 'T00:00:00') - new Date(fromIso + 'T00:00:00')) / 864e5);
function stageStart(rowId, day, sprintId) {
  const rows = app.get('sprintItems.rows') || [];
  const i = rows.findIndex((r) => r.id === rowId);
  if (i < 0) return null;
  const was = rows[i];
  const finish = was.finish && was.startsOn ? isoAddDays(was.finish, calendarDaysBetween(was.startsOn, day)) : day;
  /* The sprint half rides along only when the caller was TOLD one (the
     server's answer below): a row re-slotted by a week click joins the
     sprint covering the day it landed on, and a row that joined none stays
     outside (#90). Omitted, the row keeps the membership it has. */
  const staged = {
    ...was, startsOn: day, finish, late: !!(was.deadline && finish > was.deadline),
    ...(sprintId === undefined ? {} : { sprintId }),
  };
  app.set(`sprintItems.rows.${i}`, staged);
  return { was, staged };
}
function unstageStart(token) {
  const rows = app.get('sprintItems.rows') || [];
  const i = rows.indexOf(token.staged);
  if (i >= 0) app.set(`sprintItems.rows.${i}`, token.was);
}
/* ONE WRITE PATH for both placements — the week click (`{ week }`, Sprint
   Schedules) and the day drop or nudge (`{ starts_on }`, Deadlines). The
   lock spans the reload on both paths (review 2026-08-28, finding 2), the
   optimistic stamp goes on before the request and comes off only on a
   failure, and the banner is the server's own sentence (errText prefers
   it): OUT_OF_WEEK, OUT_OF_SPRINT, PAST_DEADLINE or NOT_A_WORKDAY names what
   refused and why. Resolves true when the server took the write. */
async function placeRow(rowId, day, body) {
  const token = stageStart(rowId, day);
  if (!token) return false;
  sprintItemSaving = true;
  try {
    const res = await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/sprint-items/${rowId}`, body);
    /* THE SERVER NAMES THE DAY, AND THE CLIENT TAKES IT (PLAN.md block nine
       amendment 17; invariant 8). A week click is staged on the week's
       Monday, but the day is the week's first WORKING day and only the
       server knows the calendar — so the answer carries `starts_on` and
       `sprint_id` back, and the row is re-stamped from them before the
       reload rather than after it. The reload is not a second chance at
       this: `loadAll` catches its own failures into a banner, so a reload
       that never lands would have left the Monday standing as a day nobody
       gave. Same stage-and-replace as the optimistic stamp — a new row
       object, never a mutation — so every computed re-runs on it. */
    if (res && res.starts_on) stageStart(rowId, res.starts_on, res.sprint_id);
    await loadAll();
    return true;
  } catch (err) {
    unstageStart(token);
    flashBanner(errText(err));
    return false;
  } finally {
    sprintItemSaving = false;
  }
}

/* THE WEEK-GRAIN AFFORDANCE (block nine, owl #88; PLAN.md "Client
   handlers", amendment 16): may this row be offered this week at all?

   THE OFFER IS JUDGED ON THE DAY THE WEEK RESOLVES TO, exactly as the route
   judges it: a week placement lands on the week's FIRST WORKING DAY (#89
   §2), so that day — not the week's span, and not its Monday — is what has
   to be inside the sprint and on or before the deadline. Judged on the span,
   the tint offered a sprint's own first week whenever the sprint began
   mid-week, and the server then refused every day of it; judged on the bare
   Monday, a holiday Monday moved the real day past a deadline the offer had
   already cleared. `weekFirstWorkday` (30-dates.js) is the mirror of the
   server's own resolver, over the payload's ARES-canonical calendar.

   Still the AFFORDANCE and never the authority: the server re-resolves and
   re-judges, and a 422 rolls the stamp back with its own sentence. A row
   outside any sprint (#90) has no sprint half — the server derives its
   membership from the day it lands on — and a row naming a sprint the list
   no longer has is offered nothing, the safe direction. */
const weekOffered = (row, week) => {
  if (!row || !week) return false;
  const s = sprintOf(row);
  if (row.sprintId && !s) return false;
  const day = weekFirstWorkday(week.key, app.get('holidays'));
  if (!day) return false; // a week that is closed end to end has no day to offer
  if (s && (!s.start || !s.end || day < s.start || day > s.end)) return false;
  return !(row.deadline && day > row.deadline);
};

/* ---- the Deadlines day drag: pointer events, and no ghost (block nine,
   owls #88/#89; PLAN.md "Client handlers") -------------------------------
   A card in an EXPANDED lane is the drag source. Pointerdown on the card
   arms the gesture, pointermove names the day column under the pointer by
   hit-test, and pointerup writes `starts_on`. Nothing else moves: the card
   stays in its column wearing `dragging`, the column under the pointer
   wears `target`, and NO HTML5 drag API is involved — no `draggable`, no
   dragstart/dragover/drop anywhere. That API dies inside sticky, scrolling
   containers, which this tab is, and the card is then the only element the
   browser has to keep hit-testable (gantt-rules §1; never `pointer-events:
   none` on a card or an ancestor).

   `pointermove`, `pointerup`, `pointercancel` and `keydown` ride the WINDOW,
   and only while a drag is live: a release outside the lane has to land
   somewhere, and Escape has to cancel from wherever the pointer has
   wandered. All four come off on every exit — the drop, the cancel and a
   project switch — so nothing listens at rest. The handlers are fired by
   name with the event folded into the context, the shape every template-
   bound handler already reads. */
/* ONE POINTER OWNS THE GESTURE (review 2026-09-12, finding 2). The card
   turns the browser's own touch gestures off, so two fingers can be on the
   tab at once: without this, a second finger landing on another card re-armed
   `dlDrag` behind the first, and the FIRST finger's release then wrote the
   second card to a day nobody chose. The id is the pointer's own, kept here
   rather than on `dlDrag` because nothing renders it — the template reads the
   gesture, the window listeners read the pointer — and it is dropped with the
   listeners in `dlDragStop`, on every exit. An event carrying no id is
   nothing a browser fires, and is left alone rather than filtered out. */
let dlDragPointer = null;
const dlOtherPointer = (e) => dlDragPointer !== null && e && e.pointerId !== undefined && e.pointerId !== dlDragPointer;
const dlDragMoveWin = (e) => { if (!dlOtherPointer(e)) app.fire('dlDragMove', { event: e }); };
const dlDragUpWin = (e) => { if (!dlOtherPointer(e)) app.fire('dlDragEnd', { event: e }); };
const dlDragLost = () => app.fire('dlDragCancel');
/* ESCAPE IS THE DRAG'S WHILE IT IS LIVE (review 2026-09-09, finding 3, kept
   from block seven): CAPTURE puts this first, on the way down, and
   stopPropagation ends the key there, so nothing else on the page reads an
   Escape that was meant for the gesture. Bound only while a drag runs. */
const dlDragKeyWin = (e) => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  app.fire('dlDragCancel');
};
function dlDragStop() {
  dlDragPointer = null;
  window.removeEventListener('pointermove', dlDragMoveWin);
  window.removeEventListener('pointerup', dlDragUpWin);
  window.removeEventListener('pointercancel', dlDragLost);
  // the SAME capture flag it was bound with, or the listener never comes off
  window.removeEventListener('keydown', dlDragKeyWin, true);
}
/* THE HIT-TEST (PLAN.md, frozen): the element under the pointer, up to the
   nearest day column, and that column must sit INSIDE THE SAME LANE as the
   card — the lane carrying the row's assigned week. A column in another
   lane, the gap between columns, the lane header, the page beside it: all
   name nothing, and nothing is refused (#89 §1: days outside the assigned
   week are not a drop target). The card itself is inside its own column,
   so a pointer resting on it names the day it came from. */
const dlHitDay = (ev, weekKey) => {
  if (!ev || !Number.isFinite(ev.clientX) || typeof document.elementFromPoint !== 'function') return null;
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const col = el && el.closest ? el.closest('.dlday[data-day]') : null;
  if (!col) return null;
  const lane = col.closest('.dllane[data-week]');
  return lane && lane.dataset.week === weekKey ? col.dataset.day || null : null;
};
/* WHY THE KEY WAS REFUSED, IN THE SERVER'S OWN WORDS (PLAN.md block nine
   amendment 14). The pointer's refusal SHOWS itself — the column under the
   hand never tints and the card washes pale — but a key press has no column
   under it, so the refusal has to be said, and said in the same voice the
   route would have used for the same day (`plotIssue`,
   src/services/sprint-items.ts): the assigned week, the sprint's dates, the
   deadline, the calendar, asked in that order. Same order, same sentences,
   so a refusal reads identically whether the client caught it or the server
   did — and `fmtLongIso` is the same '4 Aug 2026' the server's `longDate`
   writes.

   The one sentence with no twin on the wire is the missing sprint: the route
   answers that stale row a bare not-found, having no copy for a list the
   reader can no longer see. */
const dlRefusalText = (row, dayIso, weekKey, sprint) => {
  if (!dayIso || dayIso < weekKey || dayIso > isoAddDays(weekKey, WORKDAYS_PER_WEEK - 1)) {
    return `That day is outside the card's assigned week (Mon ${fmtLongIso(weekKey)} – Fri ${fmtLongIso(isoAddDays(weekKey, WORKDAYS_PER_WEEK - 1))}).`;
  }
  if (row.sprintId && (!sprint || !sprint.start || !sprint.end)) return "That card's sprint is no longer on the schedule.";
  if (sprint && (dayIso < sprint.start || dayIso > sprint.end)) return `That day is outside the sprint's dates (${fmtLongIso(sprint.start)} – ${fmtLongIso(sprint.end)}).`;
  if (row.deadline && dayIso > row.deadline) return `That day is after the card's deadline (${fmtLongIso(row.deadline)}).`;
  return 'That day is not a working day.';
};

/* THE KEYBOARD'S NO (v1.4 §8, NFR-9): a nudge onto a day the row may not
   have shows the same pale `refused` wash the pointer drag shows, for a
   beat, says why, and writes nothing. The marker is a `dlDrag` with no
   pointer behind it, told apart from a live gesture by this timer; it clears
   itself, and only itself — a real drag armed in the meantime is left alone.
   `dayIso` is the day the KEY ASKED FOR — one step, before any holiday the
   nudge would have skipped — because that is the day the reader pressed
   towards and the day the sentence has to be about. */
const DL_REFUSE_MS = 400;
let dlRefuseTimer = 0;
function dlRefuse(row, weekKey, dayIso) {
  const marker = { rowId: row.id, fromDay: row.startsOn, day: null, refused: true, weekKey };
  clearTimeout(dlRefuseTimer);
  app.set('dlDrag', marker);
  flashBanner(dlRefusalText(row, dayIso, weekKey, sprintOf(row)));
  dlRefuseTimer = setTimeout(() => {
    dlRefuseTimer = 0;
    if (app.get('dlDrag') === marker) app.set('dlDrag', null);
  }, DL_REFUSE_MS);
}
/* After a nudge's reload the card that held focus is a NEW element in
   another column, and the browser has dropped focus to <body> — the next
   arrow would go nowhere. Focus is RETURNED to the same row's card.

   BY ROW, NOT BY PRESENCE (block 9 E2E, defect D1). Asking only whether
   anything still holds focus was wrong whenever the origin column kept a
   second card: Ractive REUSES the focused <article> for the row that stayed,
   so focus is never lost — it silently becomes that row's, and the reader's
   next arrow moves a card they never touched and banks an audit row naming
   them for it. So the element holding focus is asked WHOSE it is: a card of
   another row gives it back to the row just moved; nothing at all does too
   (the <body> case this always handled). Focus is still never STOLEN from
   outside the cards — a reader who tabbed away mid-write keeps it (the
   addRefocus discipline, review 2026-09-05, B2-R7).

   And if the moved row's card cannot be found — a template without the
   `data-row` hook, a row the reload dropped — the wrongly-focused card is
   BLURRED rather than left aimed at the wrong row: the next arrow then does
   nothing, which is the safe half of the same rule. */
function dlRefocus(rowId) {
  const at = document.activeElement;
  const held = at && at.closest ? at.closest('.dlcard[data-row]') : null;
  if (held && held.dataset.row === rowId) return; // the moved row still has it
  if (at && at !== document.body && !held) return; // something outside the cards has it
  const card = document.querySelector(`.dlcard[data-row="${rowId}"]`);
  if (card && card.focus) card.focus();
  else if (held && held.blur) held.blur();
}

/* HOW AN ADD FAILS — one owner for both adds, because the policy is one
   policy: a refusal that means the LIST ON SCREEN is stale (the card is
   already on the schedule, complete, moved into a lane outside the pipeline,
   gone from the board, or its sprint is
   gone) is answered with a reload BEFORE the banner, so the pool the server
   just refused is replaced, the refused row leaves the list, and the same
   click cannot refuse twice (review 2026-09-05, B2-R6). Any other failure
   (network, a server fault) leaves the list standing for another try. */
const ADD_STALE = new Set(['NOT_FOUND', 'CARD_COMPLETE', 'CARD_EXCLUDED', 'ALREADY_SCHEDULED', 'SPRINT_GONE']);
const addFailed = async (err) => {
  if (err && err.detail && ADD_STALE.has(err.detail.code)) await loadAll();
  // errText prefers the server's own message — the refusals all carry one
  flashBanner(errText(err));
};

/* THE PARTIAL-RESULT BANNER for Add All (PLAN.md B3): one sentence, shown
   only when the server skipped something — 'Added N of M — K already on the
   schedule, J complete.' The codes are the server's own; one this map does
   not know reads as itself, lowercased, rather than dropping out of the count. */
const ADD_SKIP_WHY = { ALREADY_SCHEDULED: 'already on the schedule', CARD_COMPLETE: 'complete', CARD_EXCLUDED: 'outside the pipeline', NOT_FOUND: 'no longer on the board' };
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
  /* ---- Requests §3: stat tiles, sort + filter, pager — no round-trip ------
     Owl #77 §1: the select boxes and the sortable column headers are gone,
     replaced by the Pipeline's own pair of panels. Nothing here talks to the
     server — every request row is already loaded, so a narrowing is a read of
     what the client already holds. */
  setRequestFilter(_ctx, f) { applyRequestFilter(f); },
  /* Both panels ride openOverlay, so mutual exclusion, the outside click, the
     scroll dismisser and Escape-with-focus-return come from the one door every
     other overlay uses, and neither panel restates them. They are anchored in
     CSS to the toolbar row (R-pf-j) and so carry NO coordinates: the sort
     button grows when it names its selection, which drags anything anchored to
     a button sideways with it. */
  openReqSort(ctx) {
    openOverlay(ctx, 'sort', { key: 'reqSortMenu' });
  },
  openReqFilter(ctx) {
    openOverlay(ctx, 'filter', { key: 'reqFilterMenu' });
  },
  /* the one door the shared filter-group partial knocks on, for either table,
     from either panel; the per-table doors below and on the Pipeline side are
     the same write under the name each table's own code uses */
  toggleFacet(_ctx, table, key, value) { toggleFacetValue(table, key, value); },
  toggleReqFilter(_ctx, key, value) { toggleFacetValue('req', key, value); },
  /* SINGLE-select: choosing replaces, never stacks, and choosing the applied
     sort again returns the table to rest — the same "click it off" the
     Pipeline sort and the urgency menu use, so the panel can always undo
     itself. Rest is not "no order": it is the newest-requested order the table
     opens on, which the listed option of the same name also produces. */
  pickReqSort(_ctx, key) {
    app.set('reqSort', app.get('reqSort') === key ? null : key);
    closeMenus({ restoreFocus: true });
  },
  clearReqSort() {
    app.set('reqSort', null);
    closeMenus({ restoreFocus: true });
  },
  /* HERE A CHIP IS ONE VALUE, not one axis (owl #77 §1) — so its ✕ removes the
     value it names and leaves the rest of that axis standing. The Pipeline's ✕
     clears a whole axis because its chip names a whole axis; same recipe, two
     compositions, and each ✕ removes exactly what the reader can see it
     naming. */
  removeReqChip(_ctx, key, value) {
    app.set(`reqFilters.${key}`, (app.get(`reqFilters.${key}`) || []).filter((v) => v !== value));
  },
  /* the panel's own Clear and the chips row's Clear all are the SAME door, so
     there is one way to clear rather than two that can disagree */
  clearReqFilters() {
    app.set('reqFilters', REQ_FILTERS_EMPTY());
    closeMenus({ restoreFocus: true });
  },
  /* THE CHIP'S HOVER PANEL — the Pipeline pair's twin. What differs is which
     facets the panel under the chip is drawn from, and that is read in the
     template, not here; the policy is shared. Opening goes through the one
     hover-open door (refuse over another overlay, cancel a pending close,
     re-entry is not a toggle) and leaving through the one close scheduler, so
     no second timer exists to fire against state it was not scheduled for.
     `chipPop` itself is one key for both tables: only one tab is mounted at a
     time, so two chip panels can never be open at once.

     THE VALUE TRAVELS WITH THE AXIS (PLAN.md §Fix amendment 1). A Requests
     chip is one VALUE, so the axis alone names every chip on that axis: the
     panel would be drawn under all of them, and the ✕ on the hovered one would
     leave the axis naming a chip that had gone. `chipPopValue` is what tells
     them apart, and `null` — the absence value — is a real answer, so it is
     written on every open rather than only when there is something to write. */
  reqChipPopIn(ctx, key, value) {
    /* A REFUSAL FROM THE SHARED DOOR MEANS TWO THINGS HERE, and only one of
       them is a no. The door is keyed on the axis, and a Requests chip is one
       value: crossing from a chip to its SIBLING re-enters an axis that is
       already open, so the door calls it re-entry and refuses — right for
       everyone else, and half an answer for this row. The panel is a DOM child
       of whichever chip the template matches, so leaving the pair as it stands
       leaves it hanging under the chip the pointer has left. On re-entry the
       anchor still moves; on a refusal over anything ELSE nothing does, and the
       door stays exactly as it is — this is the one caller that can tell the
       two apart. */
    const refused = !openHoverOverlay('chipPop', key);
    if (refused && app.get('chipPop') !== key) return;
    /* the chips row WRAPS, so a chip can sit anywhere along it, and the panel
       is a known width hanging off the chip's LEFT edge. Far enough right and
       it runs past the viewport, where its rows are unreachable and the page
       grows a horizontal scrollbar; flip it onto the right edge instead. The
       width is a constant, so this reads the chip's own box and needs nothing
       measured after render. Computed HERE, once, for both journeys in: the
       sibling arrives at a different place along the row than the chip before
       it, so a flip settled only on the first entry would describe the wrong
       chip for the rest of the hover. */
    const box = ctx.node.getBoundingClientRect();
    app.set('chipPopFlip', box.left + PIPE_MENU_W > document.documentElement.clientWidth - OVERLAY_EDGE);
    /* set in the same breath as the flip above, which is what keeps the pair
       describing one chip; the leave path leaves it alone, because a value with
       nothing open is inert and the next open overwrites it. */
    app.set('chipPopValue', value);
    // the axis was already open, so the pair above is the whole move — going
    // through the door again would TOGGLE the panel shut under the pointer
    if (refused) return;
    openOverlay(ctx, key, { key: 'chipPop' });
  },
  reqChipPopOut(ctx) {
    if (!leaveHoverOverlay('chipPop')) return;
    /* where the pointer (or focus) actually went; still inside this chip means
       nothing left. The panel is a DOM child of the chip, so this covers the
       whole journey down into it — including tabbing from the ✕ into a row. */
    const to = ctx.event.relatedTarget;
    if (to && ctx.node.contains(to)) return;
    scheduleHoverClose(() => closeMenus());
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
  /* MULTI-select: OR within a category, AND across (owl #62). The tick itself
     — and the panel staying open through it — is the shared facet write, which
     the Requests table now ticks through as well; this is the Pipeline's own
     name for it. */
  togglePipeFilter(_ctx, axis, value) { toggleFacetValue('pipe', axis, value); },
  /* THE CHIP'S HOVER PANEL (node 593:80073) — the chip's own filter group,
     opened under it so a reader can see and change what the chip names without
     going back to the Filter button.

     It opens on POINTER and leaves through the shared hover-close scheduler:
     the panel sits 4px clear of the chip, so without a delay the
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
     and its rollback go through patchWorkCard, never a write against the
     deliverable rows: the main row's own stored values are read-only in
     Sirius now, reconciled from that card's own Trello labels. Annotations 169:26074 / 169:26364 drew these controls
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
     WORK CARD's own Trello due and remembers it as dueBaseline, so Apply on
     an untouched popover writes nothing. Work card ONLY since owl #78 §2
     (PLAN.md block 3 B12/B13): deadlines live on work cards, a main card has
     none, so the `kind` the template used to pass — parent row vs the task
     each-block, each with its own store and precedence — has nothing left to
     choose between. The trigger is the Sprint Schedules DEADLINE cell
     (`row.cardId` there is the work card's Trello id); Pipeline shows the
     date read-only. A work card's shown date IS its Trello due — no sheet,
     no precedence (owl #45) — and the locator is the same `findWorkCard`
     the write itself re-finds the card through. */
  openDuePopover(ctx, cardId) {
    const current = findWorkCard(cardId)?.card.due || null;
    openOverlay(ctx, cardId, {
      key: 'duePopover', posKey: 'duePopPos', saving: 'savingDeadline',
      h: DUE_POP_H, gap: 4, clampW: DUE_POP_W, // clamped both ways — the box stays fully on screen
      extra: { dueStaged: current, dueBaseline: current, dueMonth: monthOf(current || manilaToday()) },
    });
  },
  /* WITHDRAWN 2026-09-07 (owl #81, Miles): `warnPopIn`, `warnPopOut` and
     `warnPopFocusOut` — the incomplete-card hover card's open, hover-leave and
     focus-leave handlers — are gone with build-spec §4.4. The shared machinery
     they exercised stays and is now the filter chip panel's alone:
     `openHoverOverlay` / `leaveHoverOverlay` (the refuse-over-an-active-edit
     and re-entry rules) and `scheduleHoverClose` (the one close timer). */
  duePick(_ctx, iso) { app.set('dueStaged', iso); }, // stages only — Apply writes
  dueNav(_ctx, dir) { app.set('dueMonth', monthShiftYm(app.get('dueMonth'), dir)); },
  // shortcuts are Manila-relative (invariant 11) and move the visible month
  // so the staged day is always in view
  dueShortcut(_ctx, which) {
    const today = manilaToday();
    const iso = which === 'week' ? isoAddDays(today, 7) : which === 'monday' ? isoNextMonday(today) : today;
    app.set({ dueStaged: iso, dueMonth: monthOf(iso) });
  },
  async dueApply(_ctx, cardId) {
    const staged = app.get('dueStaged') || null;
    const baseline = app.get('dueBaseline') || null;
    closeMenus({ restoreFocus: true });
    if (staged === baseline) return; // nothing staged — no call, no audit
    await writeDeadline(cardId, staged);
  },
  async dueClear(_ctx, cardId) {
    closeMenus({ restoreFocus: true });
    await writeDeadline(cardId, null); // confirm-free; a work card has no sheet date to fall back to
  },

  weekShiftView(_ctx, dir) { app.set('weekStart', mondayShift(app.get('weekStart'), dir)); },
  /* the slider reads its own node rather than a two-way binding: 'input' is
     the live drag (value + descriptor only, no call) and 'change' is the
     release, which is the ONE event that writes. Keyboard arrows fire both,
     so they commit too. */
  capSlide(ctx) { app.set('capDraft', Number(ctx.node.value)); },
  async capCommit(ctx) { await writeCapacity(Number(ctx.node.value)); },
  /* ---- Sprint Schedules placement at WEEK grain (owls #72/#73 as amended
     by #88/#89, JP 2026-09-10; PLAN.md "Client handlers") ---------------
     Hover, then click: the pointer over a week cell of any committed row's
     track tints that WEEK (never a day), and the click sends `{ week }` —
     the Monday key of that plannerWeeks column. The server lands the row on
     the week's first WORKING day through the canonical calendar (#89 §2) and
     computes the finish; no calendar and no forecast math runs here
     (invariants 5–7, 11). Placed rows take the same click: the PM owns the
     week and re-places by week (#88), and the Design Lead's day is then set
     again on Deadlines. The bar itself is display only on this tab — no
     mousedown, no drag, no day-precise anything (block seven reversed). */
  sprintSelect(_ctx, itemId) {
    /* toggle only — the checkbox is a row HIGHLIGHT whose semantics are
       still with product (owl jp→miles #60); it does not arm placement,
       which rides hover on every committed row's week cells. */
    app.set('sprintSel', app.get('sprintSel') === itemId ? null : itemId);
  },
  weekHover(_ctx, rowId, weekIdx) {
    /* NOT during a placement's awaited reload (review 2026-08-28b, finding
       1): the stale DOM still binds this handler on the row being placed,
       so a hand drifting inside the track would re-arm `hoverRow` after
       weekPlace's cleanup — and the fresh render then strips the only
       mouseleave that could ever clear it. */
    if (sprintItemSaving) return;
    /* `hoverWeek` carries the OFFER, not merely the pointer: a week this
       row may be offered nowhere in stores null, so the tint never appears
       where the server would refuse every day of it. `hoverRow` is still
       set, so leaving the track clears a real pair rather than a half one. */
    const week = (app.get('plannerWeeks') || [])[weekIdx];
    app.set({
      hoverWeek: weekOffered(sprintRow(rowId), week) ? weekIdx : null,
      hoverRow: rowId,
    });
  },
  weekLeave() { app.set({ hoverWeek: null, hoverRow: null }); },
  async weekPlace(_ctx, rowId, weekIdx) {
    if (sprintItemSaving) return;
    const row = sprintRow(rowId);
    const week = (app.get('plannerWeeks') || [])[weekIdx];
    /* the same gate the hover shows: a click on a week the tint never
       offered writes nothing — and nothing here needs the hover to have
       run first (a tap, or a click racing the first mouseenter, lands the
       same as a hovered click, because the week comes with the click) */
    if (!row || !week || !weekOffered(row, week)) return;
    /* optimistic at the week's MONDAY — the server's first working day is
       that Monday on every week without a holiday on it, and the reload
       inside placeRow replaces the guess with the day the server chose */
    await placeRow(rowId, week.key, { week: week.key });
    /* Clear the hover ONLY if it still points at this row (the finding-4
       discipline): a hover that moved onto another row during the await
       belongs to the USER'S next placement, not to this one's cleanup. A
       row that changed group in the reload (outside → a sprint, #90) was
       re-rendered and its mouseleave will never fire, which is why this
       runs after the await at all. */
    if (app.get('hoverRow') === rowId) app.set({ hoverRow: null, hoverWeek: null });
  },

  /* ---- the Deadlines day drag, four handlers and no more (block nine,
     owls #88/#89 — the ONLY day control in Sirius) -------------------------
     dlDragStart   pointerdown on a card in an EXPANDED lane
     dlDragMove    pointermove, from the window — names the column, dresses the card
     dlDragEnd     pointerup, from the window — writes, or snaps back
     dlDragCancel  Escape or pointercancel, from the window — snaps back, writes nothing

     The card wears `dragging` for the whole gesture — and `refused` over a
     day the row may not have, which is a state the drop then declines to
     commit rather than a state the server has to answer for. A drop on a
     valid day writes `{ starts_on }` optimistically through placeRow; the
     server's four checks (OUT_OF_WEEK first) are the authority and a 422
     rolls the card back with the server's sentence. */
  dlDragStart(ctx, rowId) {
    /* a placement or a previous drop is still in the air: this card is
       about to be replaced by the reload, so the gesture would drag a corpse */
    if (sprintItemSaving) return;
    /* ONE GESTURE AT A TIME (review 2026-09-12, finding 2): a second pointer
       landing on another card while one is held must not take the gesture
       over — the first pointer's release would then write THIS card to the
       day the first hand was over. The refused marker is not a live gesture,
       told apart by its timer, exactly as `dlNudge` tells them apart. */
    if (app.get('dlDrag') && !dlRefuseTimer) return;
    /* the PRIMARY button only: a right-click opens the context menu, and its
       own pointerup would then end a drag the user never started */
    if (ctx.event && ctx.event.button) return;
    /* THE CARD'S OWN LINKS KEEP THEIR POINTER (PLAN.md block nine amendment
       12): the Trello and Figma marks are links, and a press that starts on
       one bubbles out to this handler — which cancelled the link's click,
       armed a drag from it, and on release both wrote a day and opened the
       tab. A press anywhere else on the card is still the drag: the whole
       card is the drag source (#89 §1), minus the two things that have a
       pointer act of their own. */
    const from = ctx.event && ctx.event.target;
    if (from && from.closest && from.closest('a, button')) return;
    const row = sprintRow(rowId);
    if (!row || !row.startsOn) return; // only a PLACED row is on this tab at all
    /* THE ASSIGNED WEEK is derived, never stored: the local Monday of the
       row's current start (invariant 11 — a date string, never a
       millisecond difference), the same derivation the server makes
       (`weekKeyOf`). Every guarded write stays inside it by construction,
       so the two cannot drift apart. */
    const weekKey = mondayIso(row.startsOn);
    /* COLLAPSED LANES HAVE NO DRAG (PLAN.md "Template"): the day columns
       exist only in the open lane, so there is nothing to drop on anywhere
       else — and one lane is open at a time, so the check is one key. */
    if (app.get('expandedWeek') !== weekKey) return;
    /* the pointerdown's default is a text selection that follows the
       pointer across the lane; the drag owns the gesture now. Cancelling it
       also cancels the click's focus, so focus is given by hand — the
       arrow keys then work on the card the pointer just held. */
    if (ctx.event && ctx.event.preventDefault) ctx.event.preventDefault();
    if (ctx.node && ctx.node.focus) ctx.node.focus();
    // the hand that armed it is the only one the window listeners will hear
    dlDragPointer = ctx.event && ctx.event.pointerId !== undefined ? ctx.event.pointerId : null;
    window.addEventListener('pointermove', dlDragMoveWin);
    window.addEventListener('pointerup', dlDragUpWin);
    window.addEventListener('pointercancel', dlDragLost);
    window.addEventListener('keydown', dlDragKeyWin, true);
    clearTimeout(dlRefuseTimer);
    dlRefuseTimer = 0;
    /* opens ON the row's own day, so a pointerdown with no movement is a
       no-op by arithmetic rather than by a special case in dlDragEnd */
    app.set('dlDrag', { rowId, fromDay: row.startsOn, day: row.startsOn, refused: false, weekKey });
  },
  dlDragMove(ctx) {
    const d = app.get('dlDrag');
    if (!d) return;
    /* A LOST POINTERUP (review 2026-09-09, finding 1's second half): a
       release the window listener never saw — over a native drag layer, at
       a devtools break, outside the frame — leaves the gesture armed, the
       card dressed for a button-less pointer, and the next stray pointerup
       committing a day nobody chose. `buttons` is the live truth about what
       is still held, for a mouse, a pen and a finger alike. */
    if (ctx.event && ctx.event.buttons === 0) {
      app.fire('dlDragCancel');
      return;
    }
    const day = dlHitDay(ctx.event, d.weekKey);
    const row = sprintRow(d.rowId);
    const refused = !day || !dlDayPlaceable(row, day, d.weekKey, sprintOf(row));
    // per-pointermove is fine — nothing is set until something changes
    if (d.day !== day || d.refused !== refused) app.set({ 'dlDrag.day': day, 'dlDrag.refused': refused });
  },
  async dlDragEnd() {
    const d = app.get('dlDrag');
    dlDragStop(); // the listeners go FIRST, on every path below
    if (!d) return;
    /* the lift ends here on every path: clearing the gesture IS the
       snap-back, because the card's column comes from the row's own
       `startsOn` — and on a valid drop placeRow re-stamps that before the
       request leaves, so the card lands in its new column with no rewind */
    app.set('dlDrag', null);
    const row = sprintRow(d.rowId);
    /* Five ways a release writes nothing, all snapping the card back to
       where the row already is: the day named nothing or was refused as it
       was shown, the card was dropped on the day it came from (invariant 10
       logs changes, not attempts — a no-op PATCH would bank an audit row
       for one), the row moved under the gesture (a reload mid-drag, so the
       week the drag was bounded by is no longer the row's), the day fails
       the guard against the row as it stands NOW, or another write is in
       the air. */
    if (
      !row || !d.day || d.refused || d.day === row.startsOn || sprintItemSaving
      || mondayIso(row.startsOn) !== d.weekKey
      || !dlDayPlaceable(row, d.day, d.weekKey, sprintOf(row))
    ) return;
    await placeRow(d.rowId, d.day, { starts_on: d.day });
  },
  dlDragCancel() {
    dlDragStop();
    app.set('dlDrag', null);
  },
  /* THE KEYBOARD PATH (v1.4 §8: "NFR-9 is not optional decoration"; PLAN.md
     item 11, smallest form): a focused card takes ArrowLeft / ArrowRight as
     one weekday back or forward INSIDE its lane, through the same write and
     the same four refusals as the pointer. Escape cancels a live pointer
     drag; every other key is left to the browser. */
  dlKey(ctx, rowId) {
    /* THE CARD'S OWN KEYS ONLY (PLAN.md block nine amendment 12, the same
       read `pipeRowKey` makes): the card holds two links, and a key pressed
       with one of them focused bubbles here — an arrow then wrote a day
       while the reader was tabbing through the card's links. The card is the
       tab stop for the gesture; anything focused inside it keeps its own
       keys. */
    if (ctx.event.target !== ctx.node) return;
    /* A CHORD IS THE BROWSER'S (same amendment): Alt+Left is Back, and
       cancelling it to move a card by one day is a key the reader did not
       press. Shift is not listed — it selects, and selection is already
       cancelled on the gesture. */
    if (ctx.event.altKey || ctx.event.metaKey || ctx.event.ctrlKey) return;
    const key = ctx.event.key;
    if (key === 'Escape') {
      if (app.get('dlDrag')) app.fire('dlDragCancel');
      return;
    }
    const delta = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
    if (!delta) return;
    ctx.event.preventDefault(); // or the arrow scrolls the pane under the card
    app.fire('dlNudge', ctx, rowId, delta);
  },
  async dlNudge(_ctx, rowId, delta) {
    // a live pointer drag owns the card; the refused marker is not one
    if (sprintItemSaving || (app.get('dlDrag') && !dlRefuseTimer)) return;
    const row = sprintRow(rowId);
    if (!row || !row.startsOn || !delta) return;
    const weekKey = mondayIso(row.startsOn);
    /* ONE WORKING DAY PER PRESS, HOLIDAYS STEPPED OVER (PLAN.md block nine
       amendment 13; v1.4 §8 — "NFR-9 is not optional decoration"). A single
       calendar step stopped dead at a closed day: the pointer could drop a
       card on the Thursday after a closed Wednesday, and the keyboard could
       not reach it at all — it sent the closed day, the server refused it,
       and the card came back. So the press walks on in the direction it was
       given until it finds an open day, and the WEEK is still the stop: a
       Monday nudged left names Sunday, a Friday nudged right names Saturday,
       and both fall outside Monday to Friday of `weekKey`, which is the
       bound the whole gesture lives inside (#89 §1). The calendar is the
       payload's own, the ARES-canonical set the server resolves weeks with;
       the server is still the authority on the day that leaves here. */
    const holiday = new Set(app.get('holidays') || []);
    const weekEnd = isoAddDays(weekKey, WORKDAYS_PER_WEEK - 1);
    const asked = isoAddDays(row.startsOn, delta);
    let day = asked;
    while (holiday.has(day) && day >= weekKey && day <= weekEnd) day = isoAddDays(day, delta);
    if (!dlDayPlaceable(row, day, weekKey, sprintOf(row))) {
      dlRefuse(row, weekKey, asked);
      return;
    }
    /* A REFUSAL IS NOT THIS PRESS'S STATE (review 2026-09-12, finding 6):
       the wash from a press a beat ago outlived its own refusal and dressed
       the card `refused` right through a write that succeeded — a treatment
       whose whole meaning is "nothing was written". It comes off, with its
       timer, before the write goes out. */
    clearTimeout(dlRefuseTimer);
    dlRefuseTimer = 0;
    app.set('dlDrag', null);
    await placeRow(rowId, day, { starts_on: day });
    dlRefocus(rowId);
  },
  /* owl #90's notice: the list of cards a re-date displaced stays up until
     the reader closes it; the rows themselves already sit under Outside
     any sprint, so dismissing changes nothing but the banner. */
  dismissDisplaced() { app.set('sprintDisplaced', null); },

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
      await addFailed(err);
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
    if (app.get('addBusy')) return;
    const panel = app.get('addPanels')[sprintId];
    const ids = panel ? panel.items.map((m) => m.cardId) : [];
    if (!ids.length) return;
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
      await addFailed(err);
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
      const res = await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/sprints`, {
        sprints: app.get('sprintDraft').map(sprintPayload),
      });
      /* owl #90 (block nine): a re-date that left placed rows outside their
         sprint's new dates is NOT refused — the server nulls their
         membership, keeps their day, and names them in `displaced[]`. That
         list becomes the notice above the groups; the rows themselves come
         back under Outside any sprint with the reload. Optional on the
         wire: an older server, or a save that displaced nothing, clears it. */
      const displaced = res && Array.isArray(res.displaced) && res.displaced.length ? res.displaced : null;
      app.set({ sprintModal: false, sprintDeleteConfirm: null, sprintDisplaced: displaced });
      await loadAll();
    } catch (err) {
      /* The refusals that carry a LIST speak through it; every other refusal
         speaks through the server's own sentence, which is what `errText`
         prefers — `api.send` puts the CODE in `err.message`, so reading that
         first printed `SPRINTS_STALE` (and, once this route stopped answering
         an uncaught throw with an HTML page, `SPRINTS_NOT_SAVED`) at a person.
         Block 9 E2E, D2's second half. */
      const issues = err.detail && err.detail.issues;
      app.set('sprintError', issues && issues.length ? issues[0].text : errText(err));
    }
  },

  /* ---- Deadlines (owls #74/#75; node 731:100859; PLAN.md block 3 B3, B7)
     The navigator is a month scope: one step moves `monthOffset`, and the
     dlMondays → dlRange → dlWeeks chain re-derives from it — nothing to
     recompute by hand, which is why the old explicit rebuild call is gone.
     The open lane closes with the month: its key is a Monday the new month
     may not show. */
  monthShift(_ctx, dir) {
    app.set('monthOffset', app.get('monthOffset') + dir);
    app.set('expandedWeek', null);
  },
  /* ONE lane open at a time (B7; the shipped semantics — the frame cannot
     say): the chevron-circle expands a week into its five day columns and a
     second click collapses it. Presentation only — the cards are read-only
     and derived (#74 §3: "the card writes nothing"); the day-drag planner,
     its keyboard moves, its clear and the conflict acknowledge/restore pair
     that used to follow this handler retired with the milestone tab (B9; the
     rollover job is the only thing that moves a card's day now, #75 §2). */
  toggleWeek(_ctx, key) {
    app.set('expandedWeek', app.get('expandedWeek') === key ? null : key);
  },
});


