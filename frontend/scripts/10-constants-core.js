/* Split out of frontend/scripts/10-constants.js on 2026-09-05 (part 1 of 3):
   capacity fallbacks, planner geometry and the capacity band, the Requests
   constants and the date helpers. Bytes below unchanged. */
/* Sirius frontend — one Ractive instance, ARES conventions.
   Hard-mix constants mirror lib/planner.constants (HARD_MIX); load is BR-6c
   card-equivalents (row.weight from the server). */

/* Pre-payload fallbacks only. Every READ prefers capacity.hardIdeal /
   capacity.hardCeiling from the server, which carry lib/planner.constants
   HARD_MIX — these two exist so the first paint before /deliverables lands
   does not divide by undefined. */
const HARD_IDEAL = 0.083;
const HARD_CEILING = 0.129;
/* Planner geometry (node 95:5795). WEEK_COUNT drives the drawn columns, the
   range label AND the /suggest horizon — widening it to the frame's 12 widens
   all three, which is flagged to product.

   The LAYOUT numbers live in CSS, not here: 35-gantt.css sizes a week column
   from `--gw` (92px) and the pinned left block from `--gleft` (999px = 58
   gutter + 97 + 262 + 136 + 146 + 300), and every row lays its columns out
   end to end so the sheet measures itself. WEEK_PX is the one pixel value
   this file needs a copy of — a chevron scrolls exactly one column — and the
   left pane needs none, because nothing in JS positions it. */
const WEEK_COUNT = 12;
const WEEK_PX = 92; // mirrors --gw in 35-gantt.css
const WORKDAYS_PER_WEEK = 5; // the gantt x-axis unit — a week column is 5 workdays wide
const NUDGE_PX = 240; // one chevron step on the Pipeline / Requests tables
/* how recent a push receipt has to be for the app to claim the push channel is
   live (FR-8.6). The header chip and the Requests sync strip read the same
   window from here — two numbers would let the two disagree on screen. */
const PUSH_LIVE_MS = 30 * 60 * 1000;
/* Cards / week slider (build-spec §5.4). Bounds come from ARES
   deliveryForecast.referenceWeeks; these are the fallbacks for a project whose
   reference weeks have not landed yet. */
const CAP_MIN_FALLBACK = 1;
const CAP_MAX_FALLBACK = 367;
/* §5.4's five-band scale, computed against the reference weeks, not the
   slider's own ends: 'typical' is ±10% of the typical week, and the two outer
   bands are the bottom/top 5% of the least→most span. Any missing reference
   returns '' — the descriptor hides rather than name a band it cannot know. */
const CAP_TYPICAL_TOLERANCE = 0.1;
const CAP_EDGE_SHARE = 0.05;
function capacityBand(value, { least, typical, most }) {
  if (!Number.isFinite(value) || !Number.isFinite(least) || !Number.isFinite(typical) || !Number.isFinite(most)) return '';
  const span = most - least;
  if (span <= 0 || typical <= 0) return '';
  if (value <= least + CAP_EDGE_SHARE * span) return 'light';
  if (value >= most - CAP_EDGE_SHARE * span) return 'peak';
  if (Math.abs(value - typical) <= CAP_TYPICAL_TOLERANCE * typical) return 'typical';
  return value < typical ? 'below typical' : 'above typical';
}
/* Requests tab (build-spec v1.2 §3): the stat segments are a single-select
   filter on the DERIVED status (FR-11.3), the table pages ten rows at a
   time, and every filter runs client-side over one fetch. */
/* STATUS is TWO-valued and nothing else (owls #34/#35): 'In Pipeline' when the
   MC# is present in Trello, 'For Filing' when it is not. A clarification flag
   NEVER changes STATUS — it is a property of the NOTE, surfaced only in the
   Remarks cell. The client spells exactly ONE of the two, because it is the
   only one it tests against: the badge branches on `=== statusFiled` and the
   cell prints the server's own string. */
const STATUS_FILED = 'In Pipeline';
/* THE clarification predicate — one recipe, used by the segment filter AND by
   the template's Remarks branch, so the two can never drift (drift rule). It
   keeps owl #14 exactly: FOR CLARIFICATION stays a SUBSET of the unfiled set,
   so a filed row carrying the flag is 'In Pipeline' and matches neither. */
const clarified = (r) => r.status !== STATUS_FILED && Boolean(r.note && r.note.clarify);
/* Segment key → row predicate (owl #14, 2026-08-14). TO FILE is CROSS-CUTTING:
   it is every unfiled row, flagged ones included, so REQUESTS = IN PIPELINE +
   TO FILE and FOR CLARIFICATION is a SUBSET of TO FILE. That is why a segment
   is a predicate and not string equality against one status value. */
const REQUEST_SEGMENTS = {
  filed: (r) => r.status === STATUS_FILED,
  filing: (r) => r.status !== STATUS_FILED,
  clarification: clarified,
};
/* A frost note is ONE freeform text (owl #15). Rows written before that ruling
   can still hold their text in clarify_reason — with an empty remark OR
   alongside one, because the two-box editor let a writer fill both — so every
   place that shows, searches or edits a note resolves it through this ONE
   helper, which JOINS what it finds rather than picking a winner. Dropping to
   (remark || clarify_reason) would hide the legacy reason, keep it out of the
   search blob, and let the next Submit overwrite it with the remark alone. */
const noteText = (n) => {
  if (!n) return '';
  const parts = [n.remark, n.clarify_reason].map((t) => String(t || '').trim()).filter(Boolean);
  return [...new Set(parts)].join(' — ');
};
const REQ_PAGE_SIZE = 10;
/* due-date popover box (node 415:54979) — used to decide flip-up and the
   horizontal clamp before the element exists to measure */
const DUE_POP_W = 354;
const DUE_POP_H = 420;

/* The one viewport margin every fixed overlay honours: placeBox's on-screen
   clamp holds this much clear on each side, and the last-resort scroll verdict
   asks whether a box fits inside BOTH margins — the same number, so the
   anti-oscillation `>=` in placeBox can never disagree with the clamp.

   The `bleed` an overlay could add on top of this went out with the
   incomplete-card hover card (owl #81, 2026-09-07): it was the only overlay
   that painted a shadow wide enough to be clipped at the viewport edge. The
   parameter itself stays in placeBox, defaulting to nothing. */
const OVERLAY_EDGE = 4;
/* The hover-dismissed overlays' close DELAY. Not specified by the annotation —
   150ms is long enough to cross the 4px gap between a chip and its panel and
   short enough not to feel sticky.

   Naming debt, flagged not fixed (and now the last of it): the constant, the
   timer handle and its canceller in 60-overlays.js still carry the `warn`
   prefix from the day the incomplete-card hover card was the only overlay
   using them. That card is withdrawn (owl #81); the filter chip's panel is the
   remaining user, and the shared scheduler is deliberately NOT renamed here —
   the guards that pin it by name live in suites this build does not own. */
const WARN_CLOSE_MS = 150;
/* THE PANEL WIDTH — the one geometric fact the CSS-anchored panels still need in
   JS, and only for the chip panel's edge flip: the row wraps, so a chip can sit
   far enough right that a left-anchored 276px panel runs off screen. Everything
   else about their placement is CSS.

   The filter and sort panels carry no pre-measured HEIGHT: they are anchored to
   their container (JP, 2026-08-21), so there is nothing to guess and nothing to
   clamp. The three constants that used to live here — a menu
   width and two panel heights — were inputs to a placement that no longer
   happens. The overlays that DO float free of a wrapper still pre-measure; see
   placeBox in 60-overlays.js. */
const PIPE_MENU_W = 276;

const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* frame date format: '4 Aug 2026' (annotation 251:23859). A fixed month table,
   NOT Intl: en-GB — the one English locale with the frame's day-first order —
   renders September as 'Sept', which the frame forbids. Pure string math, so
   no Date and no timezone can shift the day. */
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function fmtLongIso(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]} ${y}`;
}

/* Planner range picker (node 94:4828): 'Aug 3' — month-first, no year, same
   fixed table and the same pure string math as fmtLongIso. fmtDate's
   toLocaleDateString stays where it is (the gantt tooltips and sprint metas
   use it); the toolbar label is the one place the frame fixes the wording, so
   it does not go through a locale that could render 'Sept' or reorder it. */
function fmtMonthDay(iso) {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${MONTHS_SHORT[Number(m) - 1]} ${Number(d)}`;
}
/* 'Aug 3 – Oct 23, 2026' when the window stays inside one year, and
   'Dec 28, 2026 – Feb 22, 2027' when it straddles two — a single trailing
   year would name the wrong one for the left end. En dash, per the frame. */
function fmtRange(fromIso, toIso) {
  const fy = fromIso.slice(0, 4);
  const ty = toIso.slice(0, 4);
  const left = fmtMonthDay(fromIso);
  const right = `${fmtMonthDay(toIso)}, ${ty}`;
  return fy === ty ? `${left} – ${right}` : `${left}, ${fy} – ${right}`;
}
