/* loadAll may have replaced the rows array while a PATCH was in flight, so a
   row is re-found by cardId at every step and never held as an index. */
function patchRow(cardId, fields) {
  const i = app.get('rows').findIndex((r) => r.cardId === cardId);
  if (i < 0) return;
  const patch = {};
  for (const k of Object.keys(fields)) patch[`rows.${i}.${k}`] = fields[k];
  app.set(patch);
}

const errText = (err) => (err.detail && err.detail.message) || err.message;
/* After an add's reload the element that held focus can be GONE — the Add
   the user clicked left with its row, Add All left with the emptied panel —
   and the browser drops focus to <body>, restarting the next Tab from the top
   of the document (the hazard 60-overlays.js names for a dismissed overlay).
   Focus is RETURNED to that sprint's field, never stolen: only when nothing
   holds it (review 2026-09-05, B2-R7). */
function addRefocus(sprintId) {
  if (document.activeElement && document.activeElement !== document.body) return;
  const field = document.getElementById(`gaddq-${sprintId}`);
  if (field) field.focus();
}
function flashBanner(msg) {
  app.set('banner', msg);
  setTimeout(() => app.set('banner', ''), 6000);
}

/* Custom horizontal scroll for the wide tables (annotation 251:6758) —
   rAF-throttled; handlers resolve their scroller from the event node, and the
   thumb state key comes with it, so Pipeline and Requests drive two
   independent sliders without fighting over one thumb. */
const thumbRaf = {};
function updateThumb(el, key) {
  if (thumbRaf[key]) return;
  thumbRaf[key] = requestAnimationFrame(() => {
    thumbRaf[key] = 0;
    const needed = el.scrollWidth > el.clientWidth + 1; // slider only when the table actually overflows
    const width = Math.max(8, (el.clientWidth / el.scrollWidth) * 100);
    const denom = el.scrollWidth - el.clientWidth;
    const left = denom > 0 ? (el.scrollLeft / denom) * (100 - width) : 0;
    app.set(key, { needed, left: Math.round(left * 100) / 100, width: Math.round(width * 100) / 100 });
  });
}
const thumbKeyOf = (node) =>
  node.closest('.gwrap') ? 'ganttThumb' : node.closest('.reqwrap') ? 'reqThumb' : 'pipeThumb';
/* The ONE "which scroller" resolver. `node` is optional: a caller with no
   element in hand (a keyboard or state-driven scroll, not a pointer one) gets
   the document-wide fallback this already had, rather than reaching for
   `document.querySelector('.pscroll')` itself and becoming a second answer. */
const scrollerOf = (node) => {
  const wrap = node && node.closest('.pscrollwrap');
  return wrap ? wrap.querySelector('.pscroll') : document.querySelector('.pscroll');
};
// only one tab is mounted at a time, but the sweep is key-driven either way
function refreshThumbs() {
  document.querySelectorAll('.pscroll').forEach((el) => updateThumb(el, thumbKeyOf(el)));
}
window.addEventListener('resize', refreshThumbs);

/* refreshClips WITHDRAWN 2026-08-28: its selector left every template with
   the Sprint Schedules rebuild (the requestor/type cells retired — owls
   #72/#73), so the sweep measured zero nodes every frame. The recipe left
   20-pipeline.css in the same change; the ruled tooltip gaps (owl #42, T152)
   live in the state log. `remeasure` keeps its ONE name and its thumb half —
   a fifth seam must still not pick up half of it. */
/* Every seam that remounts row nodes re-measures BOTH the scroll thumbs and
   the clip verdicts, on the frame after the render. One name, so a fifth seam
   cannot pick up half of it. */
const remeasure = () => requestAnimationFrame(() => { refreshThumbs(); });
/* The webfont lands AFTER first paint (index.html loads Google Sans Flex with
   `display=swap`), so the first sweep can measure fallback metrics and be wrong
   in either direction. One re-measure when the real font is in. */

/* ---- capacity footer (owls #72/#73) ----

   The counts are CLIENT-side now and OVERLAP-based: a plotted row weighs on
   every week its [startsOn..finish] window touches, so a bar spanning two
   weeks counts in both (default taken, flagged at CLOSE). Workday-window
   overlap — the week runs from its Monday key to the Friday four days on —
   because both endpoints are Mon–Fri days by construction (lib/calendar
   workday math), so a weekend touch cannot exist to argue about.

   No server total and no optimistic delta any more: the rows in `sprintItems`
   are the whole population, and every placement write ends in loadAll
   replacing them, so the footer cannot drift from the bars above it. */
function sprintWeekLoad(weekKey) {
  const friday = isoAddDays(weekKey, 4);
  return app.get('sprintItems').rows.filter(
    (r) => r.startsOn && r.finish && r.startsOn <= friday && r.finish >= weekKey,
  ).length;
}
app.set('sprintFootText', (weekKey) => {
  const n = sprintWeekLoad(weekKey);
  return n ? String(n) : '—';
});
/* over capacity is red, an empty week is a dimmed dash. The hard-mix bands
   left with the deliverable-week footer (#72: the unit is work cards now,
   and a work card carries no difficulty share to band on). */
app.set('sprintFootCls', (weekKey) => {
  const n = sprintWeekLoad(weekKey);
  if (!n) return 'empty';
  return n > app.get('capacity').weekly ? 'over' : '';
});

/* ---- the note field hugs its text (frame 731:101140) ----------------------
   The Field in that frame is HUG vertically and its text auto-resizes by
   HEIGHT, so its 75px is the outcome of three lines at 288 wide, not a size
   to pin. Hugging is also why the build offers no drag handle: `resize` was
   ours, and a handle for something that already fits is an affordance that
   does nothing.
   The height is CLEARED before scrollHeight is read — scrollHeight reports
   the greater of the content and the box, so measuring without clearing
   makes the field one-way: it would grow and never come back. */
const noteGrow = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};
