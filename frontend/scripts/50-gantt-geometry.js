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

/* THE INVERSE OF THE AXIS ABOVE: a pointer's viewport X → the WORKDAY it is
   over. The bar owns its own pointer events, so something has to do the
   mapping the `.gweek` cells used to do by simply being hit (T153) — and
   since block seven (JP 2026-09-08) a row is placed and dragged at DAY grain,
   so the day is the only grain anything maps to. The week-column ancestor
   `weekAtX` went with the last of its callers (review 2026-09-09).

   Pure on purpose — the caller passes the track's MEASURED rect and the week
   list, which is what lets a test execute this exact source out of the shipped
   file, and what keeps `document`/`window` out of it.
   The columns are equal by construction: `--gw` is declared once on `.gantt`,
   `.gweek` is `flex: none` at `width: var(--gw)`, and the universal
   `box-sizing: border-box` absorbs the 1px border — so the measured width is
   divided by the unit COUNT rather than a hard-coded 18.4, and browser zoom /
   DPR rounding then spreads evenly instead of drifting a column at the far end.
   The track is `weeks.length` x WORKDAYS_PER_WEEK units wide, unit i belongs
   to week `floor(i / WORKDAYS_PER_WEEK)` and weekday `i % WORKDAYS_PER_WEEK`
   (Mon..Fri), so a weekend can never be named — the grid has no width for
   one. Half-open: unit i owns [left + i·w, left + (i+1)·w), so a pointer
   exactly on a boundary belongs to the RIGHT day. Clamped at both ends, so a
   drop can never fall off the track; null only when there is nothing to map
   onto.

   The date is derived with isoAddDays from the week's own Monday KEY: local
   calendar arithmetic on a 'YYYY-MM-DD' string, never a millisecond
   difference against a parsed date, which lands on the previous day west of
   UTC (invariant 11). */
const dayAtX = (clientX, rect, weeks) => {
  const n = weeks ? weeks.length : 0;
  if (!n || !(rect.width > 0)) return null;
  const units = n * WORKDAYS_PER_WEEK;
  const raw = Math.floor((clientX - rect.left) / (rect.width / units));
  const i = Math.min(units - 1, Math.max(0, raw));
  return isoAddDays(weeks[Math.floor(i / WORKDAYS_PER_WEEK)].key, i % WORKDAYS_PER_WEEK);
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
/* The run's width in UNITS, MIN_GRAB widening included — null when the run
   falls wholly outside the drawn window and nothing is drawn at all. ONE
   owner, because two things need this number: the box `itemBar` sizes, and
   the clamp `barLeftAt` applies to a preview of that same box at another day.
   Written twice, the preview and the resting bar could differ by the width of
   the widening and nothing would notice. */
const barWidthUnits = (row) => {
  const l = clampUnits(dayIndex(row.startsOn));
  const r = clampUnits(dayIndex(row.finish) + 1);
  return r <= l ? null : Math.max(r - l, MIN_GRAB_UNITS);
};

const itemBar = (row) => {
  if (!row.startsOn || !row.finish) return [];
  const width = barWidthUnits(row);
  if (width === null) return []; // fully clipped by the window
  return [{
    /* the resting left comes from `barLeftAt` below — ONE owner for the clamp,
       for the same reason `barWidthUnits` owns the width: written twice, the
       drag preview and the bar it previews could differ by the width of the
       MIN_GRAB slide and nothing would notice (review 2026-09-09). */
    left: barLeftAt(row, row.startsOn),
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
   and renders on whichever WORKDAY the pointer is over (#72 §6: it tracks the
   pointer, it is not fixed to the column the mock shows; block seven moved
   the grain from the week to the day). Left edge of that day's unit as a
   track %, through the SAME dayIndex the bar is drawn from — so the + and the
   bar it places cannot land a column apart — and the CSS sizes the circle to
   that one-unit column. The hovered cell's tint shares this left. A DRAGGED
   bar does not: a bar is wider than its column and has its own clamp, which
   is `barLeftAt` below (review 2026-09-09).
   Asymmetric at the window's edges, and for the same reasons deadlineTick is
   (JP 2026-08-28): a day BEFORE the window pins to the left edge, which is
   where itemBar has already clipped that row's bar to; a day BEYOND it
   returns null, because there is nothing drawn out there to point at — and a
   row starting past the window draws no bar at all, so nothing can be
   grabbed from it. */
const plusLeft = (day) => {
  if (!day) return null;
  const u = dayIndex(day);
  return u >= TOTAL_UNITS ? null : unitPct(Math.max(0, u));
};
app.set('plusLeft', plusLeft);

/* THE BAR'S LEFT ON A GIVEN DAY, MIN_GRAB's final-column slide included —
   the ONE owner of that clamp (review 2026-09-09, finding 1). `itemBar` above
   draws the resting bar through it, and the drag previews the same box at a
   day not yet written; the template stamps `left: dragLeft` with `itemBar`'s
   own `width`, so the two have to be the same arithmetic or the bar moves the
   instant it is grabbed. `plusLeft` is the RAW column left: right for the
   one-unit + and tint, which sit ON the column, and half a unit wrong for a
   box wider than one. Drawn at `plusLeft`, a bar starting on the last drawn
   day jumped right on mousedown and previewed with its right edge past the
   end of the track.
   Null wherever the row draws no bar: there is nothing to preview, and the
   drag never arms. */
const barLeftAt = (row, day) => {
  if (!row || !day || !row.startsOn || !row.finish) return null;
  const width = barWidthUnits(row);
  if (width === null) return null;
  return unitPct(Math.max(0, Math.min(clampUnits(dayIndex(day)), TOTAL_UNITS - width)));
};

/* THE AFFORDANCE GUARD (JP 2026-09-08, block seven): may this row be placed
   — or dragged — onto this day? Three rules, and the third is free:

     1. the day is inside the row's OWN sprint's dates, both ends included;
     2. it is not after the card's deadline (a row may FINISH late and turn
        red — §5.1's whole point — but it may not START after the date it
        was promised for);
     3. it is a working day, which the geometry gives for nothing: dayAtX
        names Mon..Fri only.

   This is the AFFORDANCE, never the authority. The server re-checks all
   three on every write path (plotIssue, src/services/sprint-items.ts) and
   answers 422 with its own message; holidays are refused THERE, since the
   ARES working-day calendar is canonical and the client holds no copy of it.
   A row whose sprint is missing or dateless is not placeable — the refusal
   is the safe direction, and the server would refuse it too.

   Rollover is exempt from all of this (§6.2): it moves a card the PM placed,
   out of the sprint and past the deadline, with no cap. It never comes
   through here or through the route. */
const placeable = (row, day) => {
  if (!row || !day) return false;
  const s = (app.get('sprints') || []).find((x) => x && x.id === row.sprintId);
  if (!s || !s.start || !s.end) return false;
  if (day < s.start || day > s.end) return false;
  return !(row.deadline && day > row.deadline);
};
app.set('placeable', placeable);

/* The sprints modal's LENGTH cell — DERIVED and read-only, never an input. It
   is the same counted-Mondays helper the sprint block headers print ('2 wk'),
   so the modal and the planner can never disagree about how long a sprint is. */
app.set('sprintLength', (s) => `${mondaysBetween(s && s.start, s && s.end)} wk`);

