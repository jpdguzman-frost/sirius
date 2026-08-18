/* BR-6c: a row carries its MC group's work-card share, so the footer speaks
   the same unit as capacity (cards). Hard mix stays BR-6b's own test. */
const rowLoad = (rows) => rows.reduce((a, r) => a + (r.weight || 1), 0);

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
   mutual exclusion all derive from this list — adding `warnPop` used to mean
   three hand-edits that had to agree, and a fourth list (the focus-held
   selectors below) that nothing tied to them. A sixth overlay is one entry. */
const OVERLAY_KEYS = ['urgencyMenu', 'diffMenu', 'duePopover', 'reqMenu', 'warnPop'];
const NO_OVERLAYS = Object.fromEntries(OVERLAY_KEYS.map((k) => [k, null]));
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
/* The hover card's pending close. ONE handle for the whole table, not one per
   row: moving the pointer from row A's icon to row B's must not let A's close
   fire and shut B, and a per-row handle makes that a race between two timers
   nobody holds. Cleared on every open and every close (see openOverlay and
   closeMenus below), so a timer can never outlive the state it was scheduled
   against. */
let warnCloseTimer = null;
/* True only for the duration of closeMenus' programmatic focus return. The
   warning icon now OPENS on focus, so restoring focus to it after Escape (or
   after any dismissal that unmounted the element holding focus) would re-fire
   `focus` and re-open the card we just closed — Escape would look broken.
   `focus()` dispatches synchronously, so the flag is held across exactly one
   call and read by exactly one opener. */
let restoringFocus = false;
function closeMenus({ restoreFocus = false } = {}) {
  warnPopCancelClose(); // one door out: no pending close survives a close
  const t = overlayTrigger;
  const ae = document.activeElement;
  const heldFocus = !!(ae && ae.closest && ae.closest('.selectmenu, .duepop, .warnpop'));
  /* RETURNING focus, never STEALING it. Every overlay before this batch opened
     on a CLICK of its own <button>, so the captured trigger was also what the
     browser had just focused and the restore was a no-op or a step back inside
     the overlay. The hover card is the first that a POINTER opens, with focus
     left wherever the user actually is — so Escape pressed in the search field
     would otherwise drag the caret onto a warning icon the pointer merely
     grazed, and swallow every keystroke after it. Restore only when focus is
     already on the trigger, inside the overlay being closed, or nowhere (an
     unmount, or a browser that does not focus a clicked button). */
  const focusIsOurs = heldFocus || !ae || ae === document.body || ae === t;
  overlayTrigger = null;
  app.set({ ...NO_OVERLAYS });
  /* preventScroll because this same path runs from the capture-phase scroll
     dismisser: without it, dismissing by scrolling yanks the viewport back to
     the trigger the user just scrolled away from — the focus return would undo
     the gesture that triggered it. */
  if ((restoreFocus || heldFocus) && focusIsOurs && t && t.isConnected) {
    restoringFocus = true;
    t.focus({ preventScroll: true });
    restoringFocus = false;
  }
}
document.addEventListener('click', (e) => {
  // the ignore list names the TRIGGERS, not their wrappers: `.warnhost` is a
  // tight inline box now, but the rule is unchanged — a wrapper that spans
  // dead space would make that space a dead zone for dismissing
  if (!anyMenuOpen()) return;
  if (e.target.closest('.ubadge-wrap, .selectmenu, .duewrap, .duepop, .selwrap, .warnpop')) return;
  /* `.warnbtn` is shielded CONDITIONALLY, and it is the only entry that is.
     The other four triggers own a click handler that toggles their overlay, so
     the dismisser has to keep its hands off them. The warning icon has no
     click handler at all — hover and focus open it — so it is shielded only
     while ITS card is what is open, which is what keeps a click (and a touch
     tap, R-warn-l) from dismissing the card the pointer is standing on. While
     some OTHER overlay holds the screen the icon is ordinary outside-click
     territory: shielding it there would make the click do nothing whatsoever —
     showWarnPop refuses to open over an active edit (R-warn-r) and the
     dismisser would refuse to close the thing that is actually open. A
     deliberate click is not the passive mouse path R-warn-r exists to guard. */
  if (app.get('warnPop') && e.target.closest('.warnbtn')) return;
  closeMenus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && anyMenuOpen()) closeMenus({ restoreFocus: true });
});
document.addEventListener('scroll', (e) => {
  // the popover scrolls INSIDE itself on a viewport shorter than it is —
  // that must not dismiss the multi-step edit it exists to hold; a long
  // Requests select scrolls itself for the same reason
  // the cheap state read comes FIRST: this fires on every scroll in the
  // document, including the horizontal .pscroll drag, and the DOM walk is
  // pointless when nothing is open
  if (!anyMenuOpen()) return;
  if (e.target.closest && e.target.closest('.duepop, .selectmenu')) return;
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
  const up = rect.bottom + opts.h + opts.gap > window.innerHeight;
  let left = rect.left;
  let top = up ? rect.top - opts.h - opts.gap : rect.bottom + opts.gap;
  if (opts.clampW) {
    left = Math.max(4, Math.min(left, window.innerWidth - opts.clampW - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - opts.h - 4));
  }
  /* `up` rides out with the coordinates because the flip is a fact the MARKUP
     needs, not just the placer: the hover card's squared corner and its hover
     bridge both have to sit on the gap side. Recomputing it anywhere else
     would be a second copy of this comparison that could disagree with the
     one that actually moved the box. The other four overlays gain an unread
     key; nothing reads it. */
  return { left: Math.round(left), top: Math.round(top), up };
}

/* One opener for all five overlays. They differ only in state keys, box
   height and gap, and whether the box is big enough to need clamping: the two
   row select menus are fixed-length lists, the due popover is a 354×420
   dialog and the warning popover a 235-wide one, both of which must stay fully
   on screen. Mutual exclusion lives here — opening any one nulls the others —
   and so does the focus capture the shared close path restores from. */
function openOverlay(ctx, cardId, opts) {
  // one door in: opening ANY overlay kills a pending hover-card close, or the
  // warning card's timer fires after the next overlay is already up and shuts it
  warnPopCancelClose();
  // one write in flight per card (invariant 8); the read-only Requests
  // selects have no write to guard, so they pass no `saving` key
  if (opts.saving && app.get(`${opts.saving}.${cardId}`)) return;
  if (app.get(opts.key) === cardId) {
    // toggling off with a second click: focus is already on the trigger, so
    // the capture is dropped without being replayed
    overlayTrigger = null;
    app.set(opts.key, null);
    return;
  }
  overlayTrigger = ctx.node;
  app.set({
    ...NO_OVERLAYS,
    ...opts.extra,
    [opts.key]: cardId,
    [opts.posKey]: placeBox(ctx.node.getBoundingClientRect(), opts),
  });
}

/* Two overlays have a DATA-derived height that no constant can state: the
   Requests select (1..N options, capped by CSS) and the warning popover (one
   list-item per missing field, each wrapping to as many lines as its rationale
   needs — a three-problem card is ~346px against the 220 a one-problem card
   measures). Their constants are therefore a pre-measure for the FIRST flip
   decision only; this places the box a SECOND time against what actually
   rendered. Without it a short select flips up to a spot 150px above its
   trigger, and a tall popover runs off the bottom of the viewport with its
   separator and `Open Card` unreachable. Same placeBox, no second positioner.
   Returns false only if the element is not in the DOM yet, which is the
   caller's cue to retry on the next frame. */
function placeMeasured(trigger, id, opts) {
  if (app.get(opts.key) !== id) return true; // the click closed it — nothing to place
  const el = document.querySelector(opts.sel);
  if (!el) return false;
  app.set(opts.posKey, placeBox(trigger.getBoundingClientRect(), { h: el.offsetHeight, gap: 4, clampW: el.offsetWidth }));
  return true;
}

/* ---- the warning hover card's opener (owl #41, node 537:69135) ----
   Hoisted on purpose: openOverlay and closeMenus above both call the canceller,
   and the pair belongs beside the placer it uses rather than beside them. */
function warnPopCancelClose() {
  if (warnCloseTimer) { clearTimeout(warnCloseTimer); warnCloseTimer = null; }
}

/* The hover card opens on pointer-enter AND on keyboard focus, so opening has
   to be IDEMPOTENT: openOverlay TOGGLES, and re-entering an already-open icon
   would shut it. Guarded here rather than in openOverlay, whose toggle the
   other four overlays depend on. */
function showWarnPop(node, cardId) {
  /* closeMenus hands focus back to the trigger, and the trigger is this icon:
     without this the Escape that closed the card would immediately re-open it.
     Checked BEFORE the cancel because closeMenus has already cancelled. */
  if (restoringFocus) return;
  warnPopCancelClose();
  if (app.get('warnPop') === cardId) return;
  /* A passive hover must not destroy an ACTIVE edit. openOverlay nulls every
     other overlay, and the due popover holds a staged date that only Apply
     writes (W2) — moving the pointer across the table is not consent to
     discard it. Derived from OVERLAY_KEYS so a sixth overlay is one entry. */
  if (OVERLAY_KEYS.some((k) => k !== 'warnPop' && app.get(k))) return;
  openOverlay({ node }, cardId, { key: 'warnPop', posKey: 'warnPopPos', h: WARN_POP_H, gap: 4, clampW: WARN_POP_W });
  // the height is one list-item per missing field, each wrapping — measure the
  // rendered box and place it again, exactly as the Requests select does. The
  // second placement is also what settles the FLIP the bridge rides on.
  const m = { key: 'warnPop', posKey: 'warnPopPos', sel: '.warnpop' };
  if (!placeMeasured(node, cardId, m)) requestAnimationFrame(() => placeMeasured(node, cardId, m));
}

