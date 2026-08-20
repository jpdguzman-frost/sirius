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
const thumbKeyOf = (node) => (node.closest('.gwrap') ? 'ganttThumb' : node.closest('.reqwrap') ? 'reqThumb' : 'pipeThumb');
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

/* Truncation sweep for the shared clip recipe (owl #39, corrected by #40 —
   the frames' `@handle` samples are longer than any production requestor).

   It MEASURES, it never guesses: a character count would clip "Andy" on one
   font and miss a long value on another.

   Deliberately NOT updateThumb's `+ 1` epsilon, and the difference is the point.
   `text-overflow: ellipsis` fires on ANY overflow, including a fraction of a
   pixel, so `scrollWidth === clientWidth + 1` is a value the user can SEE
   truncated — the ellipsis is drawn and 2-3 characters are gone. Under the
   epsilon that badge got no tooltip and no tab stop, i.e. the exact bug this
   sweep exists to fix, surviving in a ~1px band. The two costs are asymmetric:
   a false positive puts a harmless tooltip on a value that only just fits, a
   false negative hides data with no way to reach it. updateThumb's epsilon
   guards the opposite trade (suppress a useless slider for 1px of scroll), so
   it keeps its own. Both metrics are integer-rounded already, which absorbs the
   sub-pixel noise the epsilon was there for.

   It CLEARS as well as sets, and that half is not tidiness: `{{#each g.rows}}`
   is unkeyed, so Ractive reuses badge nodes by index and only rewrites their
   text — a node that held a long value and now holds a short one would keep a
   stale tab stop and a stale tooltip forever if the sweep only added. Neither
   attribute appears in the template, so Ractive does not own them and will not
   fight the sweep between renders.

   Collapsed left pane falls out for free: `.c-req` is `display: none` there, so
   both widths read 0, the test is false, and the hidden cell is stripped of its
   tab stop — which is what a hidden cell should have. Expanding re-runs it.

   NOT hooked to `resize`: every width in the pinned pane is a literal px with
   no responsive rule, so the viewport cannot change this verdict.

   MEASURE FIRST, THEN WRITE — never interleaved. `data-clipped` is a live
   selector (it turns the badge `position: relative` for the tooltip), so a
   write dirties layout and the NEXT badge's `scrollWidth` read has to flush a
   full style+layout pass over the whole Gantt to answer. Read-then-write costs
   one layout for the sweep instead of one per changed badge; the left-pane
   collapse, where every badge flips verdict at once, was the worst case. */
function refreshClips() {
  const badges = document.querySelectorAll('.clipbadge');
  const clipped = [];
  // pass 1 — reads only
  badges.forEach((el) => {
    const text = el.firstElementChild; // .cliptext is the badge's only child
    clipped.push(!!text && text.scrollWidth > text.clientWidth); // any overflow at all — the ellipsis is already drawn
  });
  // pass 2 — writes only
  badges.forEach((el, i) => {
    if (clipped[i]) {
      el.setAttribute('data-clipped', '');
      el.setAttribute('tabindex', '0'); // only a TRUNCATED badge is reachable
    } else {
      el.removeAttribute('data-clipped');
      el.removeAttribute('tabindex');
    }
  });
}
/* Every seam that remounts row nodes re-measures BOTH the scroll thumbs and
   the clip verdicts, on the frame after the render. One name, so a fifth seam
   cannot pick up half of it. */
const remeasure = () => requestAnimationFrame(() => { refreshThumbs(); refreshClips(); });
/* The webfont lands AFTER first paint (index.html loads Google Sans Flex with
   `display=swap`), so the first sweep can measure fallback metrics and be wrong
   in either direction. One re-measure when the real font is in. */
document.fonts.ready.then(refreshClips);

/* ---- capacity footer ----

   The totals are the SERVER's, computed over every slotted row rather than the
   twelve visible columns, so week nav never refetches and never re-sums. The
   only client-side arithmetic is the optimistic drop delta below, which writes
   into perWeekLocal; that override wins even when it is null, which is how a
   week that just emptied prints a dash instead of its stale server total. */
function weekTotal(weekKey) {
  const local = app.get('perWeekLocal');
  if (Object.prototype.hasOwnProperty.call(local, weekKey)) return local[weekKey];
  return app.get('perWeek')[weekKey] || null;
}
app.set('footText', (weekKey) => {
  const t = weekTotal(weekKey);
  return t ? app.get('fmtLoad')(t.cards) : '—';
});
/* R9: over capacity — or over the measured hard-mix ceiling — is red, the
   ideal-to-ceiling band is amber, and an empty week is a dimmed dash. */
app.set('footCls', (weekKey) => {
  const t = weekTotal(weekKey);
  if (!t) return 'empty';
  if (t.over || t.hardOver) return 'over';
  return t.hardWarn ? 'warn' : '';
});

