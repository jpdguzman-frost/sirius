/* Search-match highlight (annotation 17:2057): escape first, then wrap the
   matches in <mark> — rendered via triple-mustache, so escaping is mandatory.
   The app.get(queryKey) read registers the Ractive dependency; the regex
   compiles once per distinct query, not once per cell. One factory, one
   cache per search box — Pipeline (hl) and Requests (hlr) never share a
   query, so they must not share the compiled regex either. */
const escHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function makeHighlighter(queryKey) {
  let cache = { q: '', rx: null };
  return (text) => {
    const q = (app.get(queryKey) || '').trim();
    const raw = String(text ?? '');
    if (!q) return escHtml(raw);
    if (cache.q !== q) {
      cache = { q, rx: new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig') };
    }
    // match on the RAW text, escape each segment — a regex over escaped HTML
    // splits '&amp;'-style entities (review finding 6)
    return raw
      .split(cache.rx)
      .map((part, i) => (i % 2 ? `<mark>${escHtml(part)}</mark>` : escHtml(part)))
      .join('');
  };
}
app.set({ hl: makeHighlighter('searchQ'), hlr: makeHighlighter('reqQ'), noteText });

/* Anything that invalidates a fixed-position overlay's anchor closes it;
   outside click and Escape dismiss it (review findings 3 + 8). The due-date
   popover rides the same dismissers. Mutual exclusion is separate — a click
   on any trigger is inside the ignore list below, so each opener nulls the
   other two itself. Dismissing DISCARDS the staged date: only Apply writes
   (W2), so the popover defends its own scrolling below. */
/* The overlays, named ONCE. `anyMenuOpen`, `closeMenus` and `openOverlay`'s
   mutual exclusion all derive from this list — an overlay used to mean three
   hand-edits that had to agree, and a fourth list (the focus-held selectors
   below) that nothing tied to them. Another overlay is one entry: the Requests
   sort and filter panels (owl #77 §1) replaced the four select menus here in
   one edit each way, and the incomplete-card hover card left in one (owl #81). */
const OVERLAY_KEYS = ['urgencyMenu', 'diffMenu', 'duePopover', 'pipeSortMenu', 'pipeFilterMenu', 'reqSortMenu', 'reqFilterMenu', 'chipPop'];
const NO_OVERLAYS = Object.fromEntries(OVERLAY_KEYS.map((k) => [k, null]));
/* WHAT MUST NOT DISMISS EACH OVERLAY — its own trigger and its own box, keyed
   by the state key so the two lists cannot drift apart. They already had:
   `pipeSortMenu` and `pipeFilterMenu` joined OVERLAY_KEYS in owl #62 and were
   never added to the hand-written selector string below, so the document click
   that opened a panel closed it again in the same event and neither panel could
   appear at all. A missing entry here is now a failing test, not a dead button.
   The list names TRIGGERS, never their wrappers: a wrapper spanning dead space
   would make that space a dead zone for dismissing. */
const OVERLAY_SHIELDS = {
  urgencyMenu: '.ubadge-wrap, .selectmenu',
  diffMenu: '.ubadge-wrap, .selectmenu',
  duePopover: '.duewrap, .duepop',
  pipeSortMenu: '.sfbtn, .pipemenu',
  pipeFilterMenu: '.sfbtn, .pipemenu',
  /* the Requests panels are the same component under their own toolbar, so the
     scope only says WHICH toolbar each entry means. It narrows nothing today:
     the one consumer is the union below, where the Pipeline pair's unscoped
     pair already covers these two — a scope is documentation until something
     reads an entry on its own. Kept because it is the honest answer to "whose
     trigger and whose box", which is what this map is a record of. */
  reqSortMenu: '.reqtools .sfbtn, .reqtools .pipemenu',
  reqFilterMenu: '.reqtools .sfbtn, .reqtools .pipemenu',
  /* the chip AND the panel it opens: the panel is a DOM child of the chip, so
     `.fchip` alone would cover it — naming both keeps the entry honest about
     what the reader can point at. */
  chipPop: '.fchip, .pipemenu',
};
/** One selector string, derived — the click dismisser's ignore list, and the
    ONLY reader of the map above: every entry's selectors are unioned, so a
    broader entry covers a narrower one and no entry can shield less than the
    whole set. */
const OVERLAY_SHIELD = [...new Set(OVERLAY_KEYS.flatMap((k) => OVERLAY_SHIELDS[k].split(',').map((x) => x.trim())))].join(', ');
/* The SCROLL dismisser shields only the boxes that can scroll INSIDE
   themselves — a scroll an overlay answers itself must not dismiss it. The
   Pipeline filter panel is here because its STATUS group is a deliberate
   internal scroller (R-pf-e), and the Requests one because it scrolls as a
   whole (PLAN D3) — a wheel over either would otherwise shut the panel. */
const OVERLAY_SELF_SCROLL = '.duepop, .selectmenu, .pipemenu';
/* ANCHORED overlays move WITH the page — they hang off an element in the flow
   rather than being pinned to the viewport, so a scroll cannot detach them from
   their trigger and there is nothing for the scroll dismisser to protect
   against. Dismissing them anyway made their lower half unreachable on a short
   viewport: the only way to reach it is to scroll, and scrolling closed it. */
const OVERLAY_ANCHORED = ['pipeSortMenu', 'pipeFilterMenu', 'reqSortMenu', 'reqFilterMenu', 'chipPop'];
function anyMenuOpen() {
  return OVERLAY_KEYS.some((k) => app.get(k));
}
/* The element that opened whatever overlay is up — captured in openOverlay,
   which is the ONE door in, so it can never be stale while an overlay is open.
   Escape hands focus back to it: a keyboard user who dismisses with the key
   would otherwise be dropped at the top of the document. So does ANY dismissal
   that unmounts the element currently holding focus — a scroll or a trackpad
   nudge while the user is tabbed onto `Open Card` would otherwise drop them at
   <body> and restart the next Tab from the top of the document. An outside
   click restores nothing: focus has already gone to whatever was clicked, and
   a re-click on the trigger is standing on it. */
let overlayTrigger = null;
/* The pending close every hover-dismissed overlay shares. ONE handle, not one
   per trigger: moving the pointer from chip A to chip B must not let A's close
   fire and shut B, and a per-trigger handle makes that a race between two
   timers nobody holds. Cleared on every open and every close (see openOverlay
   and closeMenus below), so a timer can never outlive the state it was
   scheduled against. Named for the incomplete-card hover card it was written
   for; that card is withdrawn (owl #81) and the filter chip's panel is the
   remaining user — see WARN_CLOSE_MS on the naming debt. */
let warnCloseTimer = null;
function closeMenus({ restoreFocus = false } = {}) {
  warnPopCancelClose(); // one door out: no pending close survives a close
  const t = overlayTrigger;
  const ae = document.activeElement;
  /* The dropdown panel class is here for the panels the toolbars open (the
     Requests pair, the Pipeline pair, and the chip's own panel, which are one
     component). They hold real controls, so Escape, a pick and either Clear
     can all fire while the reader is standing INSIDE the box about to unmount
     — and a list naming only the three older overlays dropped them at <body>,
     restarting the next Tab from the top of the document.
     [review H1; PLAN.md §Fix amendment 3] */
  const heldFocus = !!(ae && ae.closest && ae.closest('.selectmenu, .duepop, .pipemenu'));
  /* RETURNING focus, never STEALING it. Most overlays open on a CLICK of their
     own <button>, so the captured trigger is also what the browser had just
     focused and the restore is a no-op or a step back inside the overlay. A
     POINTER-opened overlay (the filter chip's panel) leaves focus wherever the
     user actually is — so Escape pressed in the search field would otherwise
     drag the caret onto a chip the pointer merely grazed, and swallow every
     keystroke after it. Restore only when focus is already on the trigger,
     inside the overlay being closed, or nowhere (an unmount, or a browser that
     does not focus a clicked button). */
  const focusIsOurs = heldFocus || !ae || ae === document.body || ae === t;
  overlayTrigger = null;
  app.set({ ...NO_OVERLAYS });
  /* preventScroll because this same path runs from the capture-phase scroll
     dismisser: without it, dismissing by scrolling yanks the viewport back to
     the trigger the user just scrolled away from — the focus return would undo
     the gesture that triggered it. */
  if ((restoreFocus || heldFocus) && focusIsOurs && t && t.isConnected) t.focus({ preventScroll: true });
}
document.addEventListener('click', (e) => {
  // the ignore list names the TRIGGERS, not their wrappers: a wrapper that
  // spans dead space would make that space a dead zone for dismissing.
  // Every entry is unconditional now — the one CONDITIONAL shield belonged to
  // the incomplete-card icon, which had no click handler of its own, and it
  // went with the card (owl #81).
  if (!anyMenuOpen()) return;
  if (e.target.closest(OVERLAY_SHIELD)) return;
  closeMenus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && anyMenuOpen()) closeMenus({ restoreFocus: true });
});
document.addEventListener('scroll', (e) => {
  // the popover scrolls INSIDE itself on a viewport shorter than it is —
  // that must not dismiss the multi-step edit it exists to hold; the
  // Requests filter panel scrolls itself for the same reason (D3).
  // the cheap state read comes FIRST: this fires on every scroll in the
  // document, including the horizontal .pscroll drag, and the DOM walk is
  // pointless when nothing is open
  if (!anyMenuOpen()) return;
  // every open overlay is anchored to the page — nothing detached, nothing to dismiss
  if (OVERLAY_KEYS.every((k) => !app.get(k) || OVERLAY_ANCHORED.indexOf(k) > -1)) return;
  if (e.target.closest && e.target.closest(OVERLAY_SELF_SCROLL)) return;
  closeMenus();
}, true);
/* A trackpad nudge with the pointer inside the popover would otherwise chain
   to the page and trip the dismisser above, discarding the staged date and
   the navigated month. Swallow it — unless the popover has its own overflow
   to scroll, in which case let it scroll itself. */
document.addEventListener('wheel', (e) => {
  if (!app.get('duePopover') || !e.target.closest) return;
  const pop = e.target.closest('.duepop');
  if (pop && pop.scrollHeight <= pop.clientHeight) e.preventDefault();
}, { passive: false });

/* Fixed-position placement for a box of KNOWN size: fixed positioning escapes
   the .pscroll clip, so the flip-up near the viewport bottom (review finding
   3) and the on-screen clamp are ours to do. `h`/`clampW` are the box, not
   the trigger. */
function placeBox(rect, opts) {
  /* ONE clamp margin, the shared edge. The per-box `bleed` that used to be
     added to it (owl #53) went with the incomplete-card hover card in owl #81:
     it was the only overlay whose shadow painted far enough outside its own
     box to be sliced at the viewport edge, and the only one that could ever be
     taller than the viewport (`over`, the last-resort scroll verdict, went with
     it for the same reason). */
  const up = rect.bottom + opts.h + opts.gap > window.innerHeight;
  let left = rect.left;
  let top = up ? rect.top - opts.h - opts.gap : rect.bottom + opts.gap;
  if (opts.clampW) {
    left = Math.max(OVERLAY_EDGE, Math.min(left, window.innerWidth - opts.clampW - OVERLAY_EDGE));
    top = Math.max(OVERLAY_EDGE, Math.min(top, window.innerHeight - opts.h - OVERLAY_EDGE));
  }
  /* `up` rides out with the coordinates because it is a fact the MARKUP can
     need, not just the placer's: a flipped box squares the corner on the gap
     side. Recomputing it anywhere else would be a second copy of a comparison
     that could disagree with the one that actually moved the box. No overlay
     reads it today; it costs one key and it is the placer's own verdict. */
  return { left: Math.round(left), top: Math.round(top), up };
}

/* One opener for every overlay. They differ only in state keys, box height
   and gap, and whether the box is big enough to need clamping: the two row
   select menus are fixed-length lists and the due popover is a 354×420 dialog
   that must stay fully on screen; the four toolbar panels are anchored in CSS
   and carry no box at all. Mutual exclusion lives here — opening any one nulls
   the others — and so does the focus capture the shared close path restores
   from. */
function openOverlay(ctx, cardId, opts) {
  // one door in: opening ANY overlay kills a pending hover close, or the timer
  // fires after the next overlay is already up and shuts it
  warnPopCancelClose();
  // one write in flight per card (invariant 8); the read-only sort and filter
  // panels have no write to guard, so they pass no `saving` key
  if (opts.saving && app.get(`${opts.saving}.${cardId}`)) return;
  if (app.get(opts.key) === cardId) {
    // toggling off with a second click: focus is already on the trigger, so
    // the capture is dropped without being replayed
    overlayTrigger = null;
    app.set(opts.key, null);
    return;
  }
  overlayTrigger = ctx.node;
  /* `posKey` is OPTIONAL: an overlay anchored in CSS to its own trigger has no
     coordinates to carry, and asking placeBox for some would compute a position
     nothing reads. The Pipeline and Requests filter and sort panels are anchored
     that way (JP, 2026-08-21); the three that float free of any wrapper still measure. */
  app.set({
    ...NO_OVERLAYS,
    ...opts.extra,
    [opts.key]: cardId,
    ...(opts.posKey ? { [opts.posKey]: placeBox(ctx.node.getBoundingClientRect(), opts) } : {}),
  });
}

/* WITHDRAWN 2026-09-07 (owl #81): `placeMeasured` and `openMeasured` — open,
   then place a SECOND time against what actually rendered — had exactly one
   caller left, the incomplete-card hover card, whose height was one list-item
   per missing field and so could not be stated as a constant. Every surviving
   overlay either states its box (the two select menus, the due popover) or is
   anchored in CSS with no box at all (the four toolbar panels and the chip's),
   so `openOverlay` places all of them once and correctly. Removed rather than
   left callerless: dead machinery reads as a live path to the next person
   pricing a change. (The Requests select menus went through it until owl #77
   §1; the Pipeline panels never passed a bleed.) */

/* THE HOVER-OPEN POLICY, once, for every overlay a POINTER opens. Three rules
   that used to be re-typed per overlay:

   1. a passive hover must not destroy an ACTIVE edit — the due popover holds a
      staged date only Apply writes (W2), and moving the pointer across the
      table is not consent to discard it. Derived from OVERLAY_KEYS, so another
      overlay is one entry.
   2. re-entering what is already open is not a toggle.
   3. ⚠️ THE CANCEL COMES AFTER THE REFUSAL, and that ordering is load-bearing.
      The close timer is SHARED, so cancelling before knowing whether we will
      open cancels somebody else's pending close and never reschedules it:
      graze one hover-dismissed overlay while another is closing and the second
      is stranded open with no pointer on it. The copy this replaces had that
      bug, found when a second overlay joined the timer.

   Returns false when it declined, so the caller can skip its own opening. */
function openHoverOverlay(key, id) {
  if (OVERLAY_KEYS.some((k) => k !== key && app.get(k))) return false;
  warnPopCancelClose();
  if (app.get(key) === id) return false; // already open; its close is now cancelled
  return true;
}

/* THE HOVER-LEAVE POLICY, the mirror of the opener above.

   ⚠️ THE CANCEL COMES AFTER THE OWNERSHIP CHECK, for the same reason it comes
   after the refusal on the way in: the close timer is SHARED, so cancelling
   before knowing whether the overlay being left is OURS cancels somebody
   else's pending close and never reschedules it. Both leave-handlers had the
   cancel first — harmless while one overlay owned the timer, a stranded-open
   overlay the moment a second one joined it, reachable from either direction.

   Returns false when nothing of ours is open, so the caller schedules nothing. */
function leaveHoverOverlay(key) {
  if (!app.get(key)) return false;
  warnPopCancelClose();
  return true;
}

/* ---- the shared hover-close timer ----
   Hoisted on purpose: openOverlay and closeMenus above both call the canceller.
   Named for the incomplete-card hover card it was written for (owl #41); that
   card is withdrawn (owl #81) and the filter chip's panel is the remaining
   user. See WARN_CLOSE_MS in 10-constants-core.js on why the name stays. */
function warnPopCancelClose() {
  if (warnCloseTimer) { clearTimeout(warnCloseTimer); warnCloseTimer = null; }
}

/* THE ONE SCHEDULER for every hover-dismissed overlay — the Pipeline and
   Requests filter chips' panels leave through here. A second `setTimeout`
   beside this one is the shape that leaks: two handles, and the older one fires
   against state it was never scheduled for. The delay is named once
   (WARN_CLOSE_MS) so it stays tunable in one place, and the caller supplies
   only what to do when it runs out. */
function scheduleHoverClose(onFire) {
  warnCloseTimer = setTimeout(() => {
    warnCloseTimer = null;
    onFire();
  }, WARN_CLOSE_MS);
}
