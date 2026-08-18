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
/* the filter select box (25-requests.css .selectmenu.reqmenu) — its WIDTH is
   fixed but its height is content-derived, so 264 is the max-height cap, not
   the box: the opener measures the rendered element and places it again */
const REQ_MENU_W = 180;
const REQ_MENU_H = 264;
/* due-date popover box (node 415:54979) — used to decide flip-up and the
   horizontal clamp before the element exists to measure */
const DUE_POP_W = 354;
const DUE_POP_H = 420;

/* ---- Pipeline row warning (owl #36, nodes 537:69131 / 537:69135) ----
   Replaces the old incomplete-card table banner: the three read-only conditions
   the server already computes per row (`missing`, src/services/pipeline.ts)
   now speak on the row they belong to. The aggregate signal did not go away —
   it is the OPEN WORK KPI, which still counts `corrections`.

   WARN_LABEL is a VARIABLE string, not a literal at the render site: 'Needs
   Info' today, 'Incomplete'/'Action' later. The icon's accessible name and the
   popover title both read it, so they cannot drift apart. */
const WARN_LABEL = 'Needs Info';
/* WHY each missing field matters — the payload of the popover, and the whole
   reason it exists. Keyed by the SERVER's own `missing` tokens, so the copy
   lives in exactly one place; a token this map does not know renders an empty
   rationale rather than throwing. The first two are the deleted banner's own
   wording, carried over verbatim; the Figma line is new copy (R-warn-b). */
const WARN_WHY = {
  'difficulty label': 'Without a difficulty label the card cannot forecast.',
  'due date': 'Without a due date the card cannot raise a deadline conflict.',
  'Figma attachment': 'Without the Figma attachment the deliverable cannot be opened from the plan.',
};
/* warning popover box (node 537:69135) — the pre-measure placeBox needs to
   decide flip-up and the horizontal clamp before the element exists. The
   HEIGHT hugs its content (one wrapping list-item per missing field, plus the
   restored closing sentence — owl #43 item B: ~245px for one problem, ~390px
   for all three), so this is the WORST case, the same way REQ_MENU_H is the
   select's cap — showWarnPop measures the box that actually rendered and
   places it a second time. Nothing in CSS pins it. */
const WARN_POP_W = 235;
const WARN_POP_H = 390;
/* The hover card's close DELAY. Not specified by the annotation — 150ms is
   long enough to cross the 4px gap and short enough not to feel sticky
   (R-warn-j, flagged to Miles as a number he may want to tune). */
const WARN_CLOSE_MS = 150;
/* ONE recipe for the warning, derived from the row the server already sends.
   Returns null for a complete card — the template's only test — or
   { label, items:[{ label, why }] }. items[0] is ALWAYS the card's OWN
   identity (the frame's 'MC-821' is stale filler), then one item per missing
   field IN THE SERVER'S ORDER. */
const rowWarning = (row) => {
  const miss = (row && row.missing) || [];
  if (!miss.length) return null;
  return {
    label: WARN_LABEL,
    /* The icon is now the ONLY textual carrier of the warning — the message
       line is gone — so a screen-reader user has nothing else on the row that
       announces it. Composed HERE and never in the markup: pluralising a count
       is arithmetic, and the template must not do arithmetic. `miss.length` is
       `items.length - 1` by construction — items[0] is the card's own identity
       (R-warn-m). */
    srLabel: `${WARN_LABEL} — ${miss.length} missing field${miss.length === 1 ? '' : 's'} — ${row.mcLabel} ${row.name}`,
    items: [
      { label: row.mcLabel, why: row.name },
      ...miss.map((f) => ({ label: f, why: WARN_WHY[f] || '' })),
    ],
  };
};

const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function todayIso() {
  return isoOf(new Date());
}

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

/* The intake sheet's MONTH encoding is not known until the credential lands —
   the fixtures carry full names ('August'), the column could equally arrive as
   1-12 or already abbreviated. ONE canonical helper absorbs all three so no
   call site has to guess: the cell, the filter's option labels and the filter's
   comparison all go through it, which is also what makes 'August', 8 and 'Aug'
   the SAME option instead of three. Anything it cannot recognise is returned
   untouched — a sheet that invents a value still renders what it says. */
function monthShort(raw) {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const n = Number(s); // Sheets hands numbers back as floats — 8.0 is August
  if (Number.isInteger(n) && n >= 1 && n <= 12) return MONTHS_SHORT[n - 1];
  // prefix match at >=3 chars is unambiguous for English months and covers
  // 'Sep'/'Sept'/'September' alike (en-GB really does emit 'Sept')
  const lower = s.toLowerCase();
  if (lower.length >= 3) {
    const i = MONTHS_LONG.findIndex((m) => m.toLowerCase().startsWith(lower));
    if (i >= 0) return MONTHS_SHORT[i];
  }
  const short = MONTHS_SHORT.findIndex((m) => m.toLowerCase() === lower);
  return short >= 0 ? MONTHS_SHORT[short] : s;
}
/* 0-11 for anything monthShort recognises, null otherwise — THE one place
   month order is decided, for the option list, the row sort and the default
   order alike. null rather than a sentinel, because an unreadable month is
   UNRANKED, which every comparator below already knows how to place. */
const monthOrder = (raw) => {
  const i = MONTHS_SHORT.indexOf(monthShort(raw));
  return i < 0 ? null : i;
};

