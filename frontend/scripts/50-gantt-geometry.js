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

/* There is deliberately NO pointer→workday mapper on this axis any more.
   Block seven put one here so a bar could be placed and dragged at DAY grain
   on Sprint Schedules; owl #88 (JP yes, 2026-09-10) reversed that: the PM
   works this tab at WEEK grain and nothing smaller, and the week is named
   by the `.gweek` cell the pointer is in — simply by being hit, no
   arithmetic — so the click sends the week and the server lands the row on
   its first working day (#89 §2, lib/calendar's own holidays). The day is
   set on the Deadlines tab alone, where the columns are discrete elements
   and hit-testing is `dlDayPlaceable`'s caller's job (90-events.js). */

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
   outside the drawn window — the template emits nothing, and the row's
   track offers the week-grain placement on hover instead (block nine). */
/* The run's width in UNITS, MIN_GRAB widening included — null when the run
   falls wholly outside the drawn window and nothing is drawn at all. ONE
   owner, because two things need this number: the box `itemBar` sizes, and
   the clamp `barLeftAt` applies to that same box at a given day. Written
   twice, the two could differ by the width of the widening and nothing would
   notice. */
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
       for the same reason `barWidthUnits` owns the width (review 2026-09-09).
       Since block nine the bar is DISPLAY ONLY on this tab (#88): it is drawn
       from the row's own start and nothing here previews it anywhere else. */
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

/* THE BAR'S LEFT ON A GIVEN DAY, MIN_GRAB's final-column slide included —
   the ONE owner of that clamp (review 2026-09-09, finding 1). `itemBar` above
   draws the resting bar through it; a box wider than one unit that starts on
   the last drawn day slides left so its right edge stays on the track. Kept
   as `(row, day)` rather than folded into `itemBar`: the clamp is a fact
   about a box at a day, and `itemBar` is merely its only caller now that
   nothing on this tab previews a bar at a day not yet written (#88).
   Null wherever the row draws no bar. */
const barLeftAt = (row, day) => {
  if (!row || !day || !row.startsOn || !row.finish) return null;
  const width = barWidthUnits(row);
  if (width === null) return null;
  return unitPct(Math.max(0, Math.min(clampUnits(dayIndex(day)), TOTAL_UNITS - width)));
};

/* THE AFFORDANCE GUARD FOR THE DEADLINES DAY DRAG (block nine — owls #88,
   #89 §1/§3; PLAN.md "Client geometry"): may this row have this day? A valid
   drop day meets FOUR conditions at once, and this is the client half of
   them:

     1. the day is inside the row's ASSIGNED week — `weekKey` is that week's
        Monday, so Monday through Friday of it and nothing else. The Design
        Lead rearranges days inside the week the PM assigned and cannot
        carry a card past either edge (#89 §1); only rollover crosses a week,
        as a system action (§6.2). Checked FIRST, as the server checks it;
     2. it is inside the row's OWN sprint's dates, both ends included — when
        the row HAS a sprint. `sprint` is null for a row that sits outside
        any sprint (owl #90: a re-date displaces rows there, day kept), and
        such a row is judged on the other three alone, as the server judges
        it. A row that NAMES a sprint the list no longer has may be placed
        nowhere: the refusal is the safe direction, and the server would
        refuse it too;
     3. it is not after the card's deadline (a row may FINISH late and turn
        red — §5.1's whole point — but it may not START after the date it was
        promised for);
     4. it is a working day, and the weekday half of that is free: the lane
        draws Monday through Friday only, so a pointer can name no weekend,
        and the week bound above keeps an arrow-key nudge off one too.
        Holidays are the server's — the ARES working-day calendar is
        canonical and the client holds no copy of it (invariant 11).

   This is the AFFORDANCE, never the authority. The server re-checks all four
   on the write (`plotIssue`, src/services/sprint-items.ts — OUT_OF_WEEK,
   OUT_OF_SPRINT, PAST_DEADLINE, NOT_A_WORKDAY, in that order) and answers 422
   with its own sentence. Rollover is exempt from all of it (§6.2): it moves
   a card the PM placed, out of the sprint and past the deadline, with no
   cap. It never comes through here or through the route.

   Pure on purpose — the row, the day, the week and the sprint all come in as
   arguments, so a test can execute this exact source out of the shipped
   file with no `app` behind it. */
const dlDayPlaceable = (row, dayIso, weekKey, sprint) => {
  if (!row || !dayIso || !weekKey) return false;
  if (dayIso < weekKey || dayIso > isoAddDays(weekKey, WORKDAYS_PER_WEEK - 1)) return false;
  if (row.sprintId) {
    if (!sprint || !sprint.start || !sprint.end) return false;
    if (dayIso < sprint.start || dayIso > sprint.end) return false;
  }
  return !(row.deadline && dayIso > row.deadline);
};
app.set('dlDayPlaceable', dlDayPlaceable);

/* The sprints modal's LENGTH cell — DERIVED and read-only, never an input. It
   is the same counted-Mondays helper the sprint block headers print ('2 wk'),
   so the modal and the planner can never disagree about how long a sprint is. */
app.set('sprintLength', (s) => `${mondaysBetween(s && s.start, s && s.end)} wk`);

