/* ---- gantt geometry: a WORKDAY-indexed x-axis across the visible window ----

   A week column is five workdays wide, so the axis counts workdays, not
   calendar days: one unit = --gw ÷ 5 = 18.4px. Every phase endpoint the
   forecast produces is a Mon–Fri day (lib/calendar workday() skips weekends),
   so the weekend clamp below is defensive only. Percentages are of the track,
   whose width is exactly WEEK_COUNT columns, so % and px agree. */

const TOTAL_UNITS = WEEK_COUNT * WORKDAYS_PER_WEEK;
/* workday ordinal of `iso` relative to the first drawn Monday; a Sat/Sun date
   clamps forward to the next Monday so it can never land mid-weekend */
function dayIndex(iso) {
  const d = new Date(iso + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun..6=Sat
  const base = new Date(app.get('weekStart') + 'T00:00:00');
  let days = Math.round((d - base) / 864e5);
  if (dow === 6) days += 2;
  else if (dow === 0) days += 1;
  const w = Math.floor(days / 7);
  const wd = Math.min(WORKDAYS_PER_WEEK - 1, Math.max(0, ((days % 7) + 7) % 7));
  return w * WORKDAYS_PER_WEEK + wd;
}
const clampUnits = (u) => Math.max(0, Math.min(TOTAL_UNITS, u));
/* ONE rounding rule for the whole of the gantt geometry: n as a percentage of
   d, two decimals. Two denominators use it — the run box is a percentage of the
   TRACK, and each segment inside it is a percentage of the BOX — and having a
   single formatter is what keeps those two roundings from drifting apart. */
const pctOf = (n, d) => ((n / d) * 100).toFixed(2);
const unitPct = (u) => pctOf(u, TOTAL_UNITS);
/* The minimum GRAB width of the run box (JP, 2026-08-18, ruling 2). A one-day
   phase draws a single unit — 18.4px — which is a fiddly thing to catch with a
   mouse, so the box is never narrower than 24px. Stated in px for the same
   reason WEEK_PX is: it mirrors a CSS px number, and the track is exactly
   WEEK_COUNT columns wide (12 x 92 = 1104px), so the px/percent map is exact
   and stable — 24px is 2.17% of the track, whatever the zoom. The widening is
   arithmetic, never CSS: a `min-width` on the box would widen the RENDERED box
   and every percentage-positioned segment inside it would visibly stretch. */
const MIN_GRAB_PX = 24;
const UNIT_PX = WEEK_PX / WORKDAYS_PER_WEEK; // 18.4 — mirrors --gw divided by 5
const MIN_GRAB_UNITS = MIN_GRAB_PX / UNIT_PX; // 1.3043478260869565

/* The inverse of the geometry above (T153): a pointer's viewport X → the week
   COLUMN it is over. The bar owns its own drop now, so something has to do this
   mapping that the `.gweek` cells used to do by simply being hit.
   Pure on purpose — the caller passes the track's MEASURED rect and the week
   list, which is what lets a test execute this exact source out of the shipped
   file, and what keeps `document`/`window` out of it.
   The columns are equal by construction: `--gw` is declared once on `.gantt`,
   `.gweek` is `flex: none` at `width: var(--gw)`, and the universal
   `box-sizing: border-box` absorbs the 1px border — so the measured width is
   divided by the COUNT rather than a hard-coded 92, and browser zoom / DPR
   rounding then spreads evenly instead of drifting a column at the far end.
   Half-open: column i owns [left + i·w, left + (i+1)·w), so a pointer exactly on
   a boundary belongs to the RIGHT column. Clamped at both ends, so a drop can
   never fall off the track; null only when there is nothing to map onto. */
const weekAtX = (clientX, rect, weeks) => {
  const n = weeks ? weeks.length : 0;
  if (!n || !(rect.width > 0)) return null;
  const col = Math.floor((clientX - rect.left) / (rect.width / n));
  return weeks[Math.min(n - 1, Math.max(0, col))].key;
};

/* R3 — the bar IS the server's phase segments (absolute, half-open ISO dates
   built from lib/forecast output). No forecast math runs here: the same
   dayIndex/clampUnits pair is applied to the same server-supplied startIso and
   endIso, in the same order, with the same drop rule for a segment the window
   clips to nothing. Only the DENOMINATOR of the final division moved.

   JP's structural ruling, 2026-08-18: the coloured run gets its own box inside
   the track-wide wrapper, and THAT box is the drag source. One box over the
   whole run, not one per segment — the segments touch, so it looks identical
   and the handle cannot flicker across a seam. This helper therefore returns
   the box AND its segments re-based to it, in one shape, so the template does
   no arithmetic and no second helper exists to drift out of step with it.

   The box: left is the leftmost segment edge, right is the rightmost, widened
   to MIN_GRAB_UNITS if the run is narrower than that. The one-line clamp
       L = max(0, min(R0, TOTAL_UNITS - W))
   reads as: anchor the box at the run's left edge and let the invisible part
   grow RIGHT; if the grown right edge would pass the end of the track, slide
   the whole box left until its right edge sits exactly on the last unit; never
   let the left edge go negative. One expression, no branch, no second path.

   Why the widening is visually free. Composing the two percentages back gives
       left + left'_i * width / 100
         = 100*L/T + (100*(sL_i - L)/W) * (100*W/T) / 100
         = 100*sL_i/T
   which is exactly the percentage this helper emitted before the box existed —
   W cancels identically, and so it does for the widths. The identity holds
   whatever MIN_GRAB_UNITS is, whichever branch of the clamp fired, and however
   many segments there are. After the shipped two-decimal rounding — on both
   sides, since the position it is compared against was rounded too — the
   residue measured across every fixture is at most 0.0075 percentage points,
   under a tenth of a pixel on the 1104px track.
   test/gantt-run-geometry.test.ts holds it to 0.02pp and shows the arithmetic.
   (Do not restate that pixel figure as a decimal here: the drift guard in
   test/suggest-counts.test.ts counts bare shares in this file and a stray
   bare share reads as a second copy of one of them.)

   An empty return means no segment survived the window — so the template emits
   no box, no handle and no draggable at all, exactly as ghostBar's empty return
   emits no ghost. There is no conditional anywhere in the geometry path. */
const phaseRun = (row) => {
  const phases = Array.isArray(row.phases) ? row.phases : [];
  const segs = [];
  for (const p of phases) {
    const l = clampUnits(dayIndex(p.startIso));
    const r = clampUnits(dayIndex(p.endIso));
    if (r <= l) continue; // zero-width, or clipped fully outside the window
    segs.push({ cls: p.phase, left: l, width: r - l, title: `${p.phase} → ${fmtDate(p.endIso)}` });
  }
  if (!segs.length) return []; // nothing visible -> no box, no handle
  const r0 = Math.min(...segs.map((s) => s.left));
  const r1 = Math.max(...segs.map((s) => s.left + s.width));
  const width = Math.max(r1 - r0, MIN_GRAB_UNITS);
  const left = Math.max(0, Math.min(r0, TOTAL_UNITS - width));
  return [{
    left: unitPct(left),
    width: unitPct(width),
    segs: segs.map((s) => ({ cls: s.cls, title: s.title, left: pctOf(s.left - left, width), width: pctOf(s.width, width) })),
  }];
};
app.set('phaseRun', phaseRun);
app.set('deadlineTick', (row) => {
  if (!row.deadline) return null;
  const u = dayIndex(row.deadline);
  return u >= 0 && u <= TOTAL_UNITS ? unitPct(u) : null;
});
/* R8 — a pending suggestion draws an outline over the PROPOSED week alongside
   the row's current bar. Returns 0 or 1 entries so the template resolves it in
   one call; a proposal outside the drawn window draws nothing. */
app.set('ghostBar', (row) => {
  const s = app.get('suggest');
  const week = s && s.plan ? s.plan[row.cardId] : null;
  if (!week) return [];
  const at = app.get('plannerWeeks').findIndex((w) => w.key === week);
  if (at < 0) return [];
  return [{ left: unitPct(at * WORKDAYS_PER_WEEK), width: unitPct(WORKDAYS_PER_WEEK) }];
});
/* The sprints modal's LENGTH cell — DERIVED and read-only, never an input. It
   is the same counted-Mondays helper the sprint block headers print ('2 wk'),
   so the modal and the planner can never disagree about how long a sprint is. */
app.set('sprintLength', (s) => `${mondaysBetween(s && s.start, s && s.end)} wk`);

