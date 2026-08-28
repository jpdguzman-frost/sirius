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

/* ---- the sprint-item bar (owls #72/#73, frame 731:98513) -----------------

   One row = one task card = one bar. The bar spans the PM's click
   (`startsOn`) to the computed finish (`finish`), finish day INCLUSIVE —
   the finish is the day the work delivers, so the bar covers it rather than
   stopping at its midnight. Both dates come off the server row; no forecast
   math runs here, which is what keeps the bar and the FORECASTED column
   incapable of disagreeing (#72 §6: "if those two can ever disagree,
   something is wrong" — they are one field).

   MIN_GRAB widening carried over from phaseRun (JP 2026-08-18 ruling 2, same
   arithmetic): a short card draws down to one unit (18.4px), fiddly to read
   and to click, so the box is never narrower than 24px, slid left if the
   window's end would clip it. The mock's bars are 28×31 fixed — that is the
   look of a short card under this rule, not a rule that bars are 28px.

   An empty return means unplotted, unforecastable (no difficulty), or fully
   outside the drawn window — the template emits nothing and the violet +
   (placement) takes over on hover. */
const itemBar = (row) => {
  if (!row.startsOn || !row.finish) return [];
  const l = clampUnits(dayIndex(row.startsOn));
  const r = clampUnits(dayIndex(row.finish) + 1);
  if (r <= l) return []; // fully clipped by the window
  const width = Math.max(r - l, MIN_GRAB_UNITS);
  const left = Math.max(0, Math.min(l, TOTAL_UNITS - width));
  return [{
    left: unitPct(left),
    width: unitPct(width),
    cls: itemPhase(row),
    title: `${row.startsOn} → ${row.finish}${row.late ? ' · past the client deadline' : ''}`,
  }];
};
app.set('itemBar', itemBar);

/* COLOUR ONLY — never data. The lane-by-title defect (2026-08-27) is exactly
   this match promoted into arithmetic; here the prefix picks a swatch and a
   wrong guess costs a colour, not a forecast. Unknown prefixes wear the
   neutral swatch rather than borrowing a phase they may not be. */
const itemPhase = (row) => {
  const p = (row.taskPrefix || '').toLowerCase();
  if (p.startsWith('sketch')) return 'sketch';
  if (p.startsWith('render')) return 'render';
  return 'work';
};

/* The client-deadline tick (owl #72, node 731:98733: 1px red-500, a RULE not
   a bar). Position is the deadline's workday ordinal — except that a PAST
   deadline pins to the window's LEFT edge (JP ruling 2026-08-28): the
   bar-right-of-tick relationship is the row's whole late signal, and every
   real row's deadline predates the visible window, so the old before-window
   clip meant a late row never showed its rule. Pinned, the rule always sits
   left of a late bar; the tooltip keeps the true date. The RIGHT-edge clip
   stays — a bar cannot sit right of a beyond-window FUTURE deadline, so an
   off-window future tick would signal nothing. */
app.set('deadlineTick', (row) => {
  if (!row.deadline) return null;
  const u = Math.max(0, dayIndex(row.deadline));
  return u <= TOTAL_UNITS ? unitPct(u) : null;
});

/* The violet + rides HOVER over any UNPLOTTED row's track (node 731:100277)
   and renders in whichever week column the pointer is over (#72 §6: it tracks
   the pointer, it is not fixed to the column the mock shows). Left edge of
   that column as a track %; the CSS centres the 24px circle inside the --gw
   column, and the hovered cell's tint shares this same left. */
app.set('plusLeft', (weekKey) => {
  const at = app.get('plannerWeeks').findIndex((w) => w.key === weekKey);
  return at < 0 ? null : unitPct(at * WORKDAYS_PER_WEEK);
});

/* The sprints modal's LENGTH cell — DERIVED and read-only, never an input. It
   is the same counted-Mondays helper the sprint block headers print ('2 wk'),
   so the modal and the planner can never disagree about how long a sprint is. */
app.set('sprintLength', (s) => `${mondaysBetween(s && s.start, s && s.end)} wk`);

