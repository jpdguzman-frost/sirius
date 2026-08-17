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
   Info' today, 'Incomplete'/'Action' later. The row message and the popover
   title both read it, so they cannot drift apart. */
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
   HEIGHT hugs its content (one wrapping list-item per missing field: ~202px
   for one problem, ~346px for all three), so this is the WORST case, the same
   way REQ_MENU_H is the select's cap — openWarnPop measures the box that
   actually rendered and places it a second time. Nothing in CSS pins it. */
const WARN_POP_W = 235;
const WARN_POP_H = 346;
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

/* ---- the comparators every Requests list shares ------------------------- */
const alphaSort = (a, b) => String(a).localeCompare(String(b));
const numCmp = (a, b) => a - b;
const ciCmp = (a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase());
/* A missing value is not "small" — it is UNRANKED, so it lands last whichever
   direction the arrow points. Every comparator below routes its nulls here
   rather than inventing a sentinel that would flip with the direction. */
const unranked = (v) => v === null || v === undefined || v === '';
// months sort by CALENDAR order; a name the sheet invents falls to the end
const monthRank = (m) => monthOrder(m) ?? MONTHS_SHORT.length;

/* ONE table for the four Requests selects — the Ractive state key IS the def
   key, so nothing has to translate between them. Everything that would
   otherwise enumerate the four (initial data, the filter predicate, the
   option lists, the observer that resets the pager, the project-switch
   reset) is driven from here: a fifth filter is one row, not five edits that
   silently drift out of step. Options are always derived from the LOADED
   rows, never hardcoded, so a sheet that gains a type needs no code change.
   `pick` returns the CANONICAL value — the one the option list shows AND the
   one the comparison tests — so an encoding change in the sheet cannot
   desynchronise the two, and 'August', 'Aug' and 8 are one option. */
const REQ_FILTERS = [
  { key: 'reqYear', label: 'Year', pick: (r) => r.year, sort: numCmp },
  { key: 'reqMonth', label: 'Month', pick: (r) => monthShort(r.month), sort: (a, b) => monthRank(a) - monthRank(b) || alphaSort(a, b) },
  { key: 'reqType', label: 'Type', pick: (r) => r.asset_type, sort: alphaSort },
  { key: 'reqRequestor', label: 'Requestor', pick: (r) => r.requestor, sort: alphaSort },
];
const reqFilterKeys = REQ_FILTERS.map((f) => f.key);
const reqFiltersCleared = () => Object.fromEntries(reqFilterKeys.map((k) => [k, '']));

/* MC # sorts NATURALLY — on the number inside the label, so MC-9 precedes
   MC-10 where a string compare would not. mc_number is 'MC-825'; a human
   display_id ('MC-655.3') keeps its fractional part rather than truncating.
   Computed once per load (blobRequests), never inside the comparator. */
const mcRank = (r) => {
  const m = String(r.mc_number || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/* ---- Requests columns + sorting (owl #18) -------------------------------
   ONE table drives the header cells AND the comparators — the sort-key lookup
   is DERIVED from this list, so a key can never exist in one and not the
   other. A column is sortable exactly when it names a sort key, so Brief and
   Frost Notes are unsortable by having none, and the template never
   enumerates columns twice. Widths live in 25-requests.css keyed on the same
   class. `val` reads the row's precomputed sort keys where deriving one costs
   string work (see blobRequests) — the comparator itself allocates nothing. */
const REQ_COLS = [
  { cls: 'col-ryear', label: 'Year', sort: 'year', val: (r) => r.year, cmp: numCmp },
  { cls: 'col-rmonth', label: 'Month', sort: 'month', val: (r) => r._monthIdx, cmp: numCmp },
  { cls: 'col-rmc', label: 'MC #', sort: 'mc', val: (r) => r._mcRank, cmp: numCmp },
  { cls: 'col-rname', label: 'Deliverable', sort: 'name', val: (r) => r.name, cmp: ciCmp },
  { cls: 'col-rtype', label: 'Type', sort: 'type', val: (r) => r.asset_type, cmp: ciCmp },
  { cls: 'col-rcase', label: 'Use Case', sort: 'case', val: (r) => r.use_case, cmp: ciCmp },
  { cls: 'col-rwho', label: 'Requestor', sort: 'who', val: (r) => r.requestor, cmp: ciCmp },
  // ISO 'YYYY-MM-DD' compares chronologically as a plain string
  { cls: 'col-rdue', label: 'Deadline', sort: 'due', val: (r) => r.deadline, cmp: alphaSort },
  { cls: 'col-rbrief', label: 'Brief', sort: '' },
  { cls: 'col-rstatus', label: 'Status', sort: 'status', val: (r) => r.status, cmp: ciCmp },
  { cls: 'col-rnote', label: 'Frost Notes', sort: '' },
];
const REQ_SORT_COLS = Object.fromEntries(REQ_COLS.filter((c) => c.sort).map((c) => [c.sort, c]));

/* Final tiebreak for EVERY sort, so equal keys never reshuffle between renders
   — sheet_row is the intake sheet's own order and is unique per project. */
const sheetRowAsc = (a, b) => (a.sheet_row || 0) - (b.sheet_row || 0);
/* Descending, with the unranked sinking either way — the shape the default
   order needs on both of its legs. */
function descNullsLast(av, bv) {
  const an = unranked(av);
  const bn = unranked(bv);
  if (an || bn) return an && bn ? 0 : an ? 1 : -1;
  return bv - av;
}
/* Default (and the 'clear' third click): newest-filed first — year desc, then
   calendar month desc, then the later sheet row. Rows the sheet left undated
   sit at the bottom instead of leading the list. */
const reqDefaultOrder = (a, b) =>
  descNullsLast(a.year, b.year) || descNullsLast(a._monthIdx, b._monthIdx) || -sheetRowAsc(a, b);
/* asc/desc flips the VALUE comparison only. The nulls-last verdict and the
   sheet_row tiebreak are computed outside the sign, which is the whole reason
   an empty cell cannot rise to the top when the arrow turns over. An unknown
   key (nothing sorted) is the default order. */
function reqComparator(key, dir) {
  const def = REQ_SORT_COLS[key];
  if (!def) return reqDefaultOrder;
  const sign = dir === 'desc' ? -1 : 1;
  return (a, b) => {
    const av = def.val(a);
    const bv = def.val(b);
    const an = unranked(av);
    const bn = unranked(bv);
    if (an || bn) return an && bn ? sheetRowAsc(a, b) : an ? 1 : -1;
    return sign * def.cmp(av, bv) || sheetRowAsc(a, b);
  };
}

/* Invariant 11: the today-marker, the shortcuts and the Started/Done tooltips
   are MANILA days whatever the browser's timezone (en-CA gives YYYY-MM-DD). */
const MANILA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
const MANILA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
const manilaToday = () => MANILA_DAY.format(new Date());
/* tooltip for the read-only Started/Done cells: the exact source instant, in
   the timezone the whole app computes in. The Manila DAY arrives from the
   payload (the cell beside it already renders that string) — only the
   clock time is derived here. */
function fmtInstant(day, ts) {
  if (!day || !ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : `${fmtLongIso(day)}, ${MANILA_TIME.format(d)} PHT`;
}

/* calendar arithmetic on 'YYYY-MM-DD' — local midnight, so only the calendar
   fields move and the string round-trips unchanged */
function isoAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
function isoNextMonday(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // strictly after `iso`
  return isoOf(d);
}
const monthOf = (iso) => iso.slice(0, 7);
function monthShiftYm(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  return monthOf(isoOf(new Date(y, m - 1 + delta, 1)));
}

function mondayIso(base) {
  const d = new Date(base + 'T00:00:00');
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (day - 1));
  return isoOf(d);
}

/* the dimmer half of a block header's meta line — one pluralisation rule for
   all three block kinds, so a sprint can never read '1 items' */
const itemCount = (n) => `· ${n} item${n === 1 ? '' : 's'}`;

/* The Friday of the week `base` falls in — the sprints modal's END snap target
   (R-f-2). START snaps to the same week's Monday, so a sprint always covers
   whole working weeks and the derived LENGTH counts what it claims to count.
   Snapping happens on PICK, never as a rejection. */
function fridayIso(base) {
  const d = new Date(mondayIso(base) + 'T00:00:00');
  d.setDate(d.getDate() + 4);
  return isoOf(d);
}

/* Working days STRICTLY between two ISO dates — R-f-8. The sprints modal's gap
   warning counts the days the studio could actually have worked, so Saturdays,
   Sundays and the ACTIVE holiday calendar all drop out; a "gap" that is only a
   weekend, or a weekend plus a public holiday, is not a gap and draws nothing.
   `lib/planner.ts`'s own gap rule counts RAW calendar days over a >2 threshold
   and is frozen (invariant 5) — and the server filters gap issues out anyway,
   so this is the first place the rule is expressed for a reader. The holiday
   set is not a second calendar: it is `getHolidays()` itself, ARES-canonical,
   shipped on the deliverables payload, so only the weekend skip is local. */
function workingDaysBetween(startIso, endIso, holidays) {
  if (!startIso || !endIso || endIso <= startIso) return 0;
  const holiday = holidays instanceof Set ? holidays : new Set(holidays || []);
  const d = new Date(startIso + 'T00:00:00');
  let open = 0;
  for (let step = 0; step < 3700; step += 1) { // ~10 years, a hard stop on a junk date
    d.setDate(d.getDate() + 1);
    const iso = isoOf(d);
    if (iso >= endIso) break;
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !holiday.has(iso)) open += 1;
  }
  return open;
}

/* how many Mondays a sprint covers — the '2 wk' in a sprint header. Counted,
   not divided: Aug 3–Aug 14 is 2 weeks even though it spans 12 days, and a
   sprint that starts mid-week owns only the Mondays inside it. */
function mondaysBetween(startIso, endIso) {
  if (!startIso || !endIso || endIso < startIso) return 0;
  let m = mondayIso(startIso);
  if (m < startIso) m = mondayShift(m, 1);
  let n = 0;
  while (m <= endIso) {
    n += 1;
    m = mondayShift(m, 1);
  }
  return n;
}

/* Where the URL says to start. Captured BEFORE anything can touch history, and
   read once the project list has loaded (loadShell) — a later location change
   cannot race it. */
const initialRoute = parseRoute(window.location.pathname, BASE);

const app = new Ractive({
  target: '#app',
  template: '#tpl-app',
  data: {
    icon: ICONS,
    // dynamic member access ({{{icon[t.icon]}}}) renders empty in Ractive
    // triples — a function call resolves reliably
    tabIcon: (key) => ICONS[key] || '',
    tabs: [
      { id: 'requests', label: 'Requests', icon: 'tabRequests' },
      { id: 'pipeline', label: 'Pipeline', icon: 'tabPipeline' },
      { id: 'schedules', label: 'Sprint Schedules', icon: 'tabSchedules' },
      { id: 'deadlines', label: 'Deadlines', icon: 'tabDeadlines' },
      { id: 'forecast', label: 'Forecast', icon: 'tabForecast' },
    ],
    activeTab: 'pipeline',
    projects: [],
    activeProjectId: null,
    userName: '',
    userInitial: '',
    banner: '',
    sync: null,
    syncLabel: '…',
    rows: [],
    writesEnabled: true, // G7 observation mode: false = read-only project, W1/W2 controls disabled
    workCardsByMc: {},
    /* still on the wire and still counted — OPEN WORK (kpi.open) is the
       aggregate signal now that the table banner is gone (owl #36) */
    corrections: [],
    sprints: [],
    capacity: { weekly: 0 },
    /* the slider's LIVE position (build-spec §5.4). It tracks the thumb on
       every input event so the value and the descriptor move while dragging;
       capacity.weekly is the committed number and only changes on release. */
    capDraft: 0,
    savingCapacity: false,
    expanded: {},
    selected: {},
    searchQ: '',
    urgencyMenu: null, // cardId whose urgency select is open (annotation 169:26074)
    urgencyMenuPos: { left: 0, top: 0 }, // fixed-position anchor — escapes the scroll clip
    savingUrgency: {}, // per-card in-flight write chrome (annotation 169:26364)
    diffMenu: null, // cardId whose difficulty select is open (W3 — BRD-§9-A1)
    diffMenuPos: { left: 0, top: 0 },
    savingDifficulty: {},
    duePopover: null, // cardId whose due-date popover is open (node 415:54979)
    duePopPos: { left: 0, top: 0 }, // fixed-position anchor, flipped and clamped on open
    dueMonth: '', // 'YYYY-MM' the calendar is showing
    dueStaged: null, // clicked day — STAGED only; Apply is what writes (W2)
    dueBaseline: null, // value the popover opened on — the Apply no-op guard
    savingDeadline: {},
    warnPop: null, // cardId whose incomplete-card popover is open (node 537:69135)
    warnPopPos: { left: 0, top: 0 }, // fixed-position anchor, flipped and clamped on open
    dowNames: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    pipeThumb: { needed: false, left: 0, width: 100 },
    iconSprite: ICON_SPRITE,
    weekStart: mondayIso(todayIso()),
    suggest: null,
    /* owl #24: block id → true = collapsed. VIEW state only, no persistence —
       keyed on plannerGroups' `id` (a sprint's _id, or 'outside'/'unscheduled'),
       never the sprint NAME, and cleared on a project switch because sprint ids
       are per-project. */
    collapsedBlocks: {},
    // owl #24: view state; SURVIVES a project switch — it is a reader
    // preference about the pane, not project data.
    leftCollapsed: false,
    sprintModal: false,
    sprintDraft: [],
    /* the draft exactly as it stood when the modal OPENED, held in the same
       three persisted fields a save PUTs ({name, start, end}). `sprintDirty`
       compares the two, and Save is live only when they differ. A deep copy —
       never a reference to `sprints`, or an edit would drag the baseline with
       it and nothing would ever read as changed. */
    sprintBaseline: [],
    sprintError: '',
    /* Miles's ruling (#30): removing a sprint that covers slotted deliverables
       warns with the count first. `{ idx, name, count }` while the confirm is
       open, null otherwise. Draft-only — nothing persists until Save. */
    sprintDeleteConfirm: null,
    /* the ACTIVE working-day calendar, straight off the deliverables payload
       (getHolidays() — ARES-canonical). Only the sprints modal's gap warning
       reads it; an empty array simply means weekends are the only skip. */
    holidays: [],
    /* owl #31 — cardId → true for the rows a drop just moved, cleared after the
       pulse. View state, never persisted. */
    arrived: {},
    /* true from dragstart to dragend. The ONLY thing it does is make the bar
       overlay transparent to hit-testing for the duration (`.gantt.gdragging`),
       so the `.gweek` cells underneath keep receiving `dragover` while the
       pointer is still over the segment it was grabbed by. Without it every
       short reslot is refused. View state, never persisted. */
    ganttDragging: false,
    ganttThumb: { needed: false, left: 0, width: 100 },
    /* per-week capacity totals, keyed by slotted-week Monday. `perWeek` is the
       server's (window-independent, every slotted row); `perWeekLocal` is the
       optimistic override a drop writes and loadAll clears. A key present with
       a null value means "this week emptied" and must beat the server's stale
       entry, which is why the lookup tests hasOwnProperty rather than ??. */
    perWeek: {},
    perWeekLocal: {},
    requests: [],
    rejects: [],
    requestCounts: { requests: 0, inPipeline: 0, toFile: 0, forClarification: 0 },
    noteEditing: null,
    /* one freeform box for notes AND clarifications (owl #15) — the flag is a
       tick, never a second field */
    noteDraft: { remark: '', clarify: false },
    noteError: '',
    expandedWeek: null,
    isAdmin: false,
    adminUsers: [],
    adminProjects: [],
    adminForm: { email: '', name: '', projectIds: {} },
    adminEditing: null,
    adminEditSel: {},
    adminError: '',
    requestFilter: 'all', // 'all' | key of REQUEST_SEGMENTS — the stat segments
    reqQ: '',
    ...reqFiltersCleared(), // reqYear / reqMonth / reqType / reqRequestor, '' = All
    reqMenu: null, // which select's overlay is open — shares the Pipeline recipe
    reqMenuPos: { left: 0, top: 0 },
    reqCols: REQ_COLS,
    /* owl #18: '' = the default newest-filed order, which is also where the
       third click on a header lands. Two flat keys, not an object, so the
       header expressions depend on exactly what they read. */
    reqSortKey: '',
    reqSortDir: '',
    reqPage: 1,
    reqThumb: { needed: false, left: 0, width: 100 },
    monthOffset: 0,
    monthLabel: '',
    deadlinePayload: { milestones: [], conflicts: [], replot: [] },
    deadlineWeeks: [],
    deadlineConflicts: [],
    acknowledged: [],
    replot: [],
    dueThisMonth: 0,
    urgentThisMonth: 0,
    modelProvenance: null,
    modelReview: null,
    fmt: (iso) => fmtDate(iso),
    fmtLong: fmtLongIso,
    fmtInstant,
    monthShort,
    // the Pipeline row's incomplete-card state — one recipe, read three times
    // per row (the .warn class, the message, the popover)
    rowWarning,
    /* the derived-status names the template compares against — the constants
       above, never re-typed as literals in the markup (owls #13–#15). The
       clarification test is the SHARED predicate, not a second status name:
       the markup asks the same question the segment filter asks. */
    statusFiled: STATUS_FILED,
    clarified,
    // §3 brief cell: the STRING truncates at 180, the full text stays in title=
    clip180: (s) => {
      const t = String(s ?? '');
      return t.length > 180 ? `${t.slice(0, 180)}…` : t;
    },
    pct: (x) => `${Math.round((x || 0) * 1000) / 10}%`,
    // BR-6c/§5.4 display rule: fractions to one decimal, whole numbers plain
    fmtLoad: (n) => {
      const r = Math.round((n || 0) * 1000) / 1000;
      return Number.isInteger(r) ? String(r) : r.toFixed(1);
    },
    dayName: (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
    ruleLabel: (r) =>
      r === 'urgent-overlap' ? '⚡ Urgent overlap' : r === 'past-deadline' ? '🛡 Past deadline' : '▤ Over capacity',
  },
  computed: {
    tabLabel() {
      const t = this.get('tabs').find((x) => x.id === this.get('activeTab'));
      return t ? t.label : '';
    },
    boardId() {
      const p = this.get('projects').find((x) => x._id === this.get('activeProjectId'));
      return p ? p.trello_board_id : '';
    },
    kpi() {
      const rows = this.get('rows');
      const byMc = this.get('workCardsByMc');
      const work = Object.values(byMc).reduce((a, l) => a + l.length, 0);
      return {
        main: rows.length,
        work,
        // OPEN WORK is the AGGREGATE incomplete-card signal now that the
        // table banner is gone (owl #36) — the same corrections the per-row
        // warnings render one at a time
        open: this.get('corrections').length,
        urgent: rows.filter((r) => r.urgency === 'Urgent').length,
      };
    },
    pipelineRows() {
      // annotation 17:2057 — the searchable text is precomputed per row in
      // loadAll (r.blob); trimmed so the filter and highlighter agree
      const q = (this.get('searchQ') || '').trim().toLowerCase();
      const rows = this.get('rows');
      if (!q) return rows;
      return rows.filter((r) => (r.blob || '').includes(q));
    },
    /* ---- Requests §3: segment + search + four selects, AND-combined, all
       client-side over the single unfiltered payload. The counts stay on
       requestCounts, which the server derives from the same unfiltered set. */
    reqFiltered() {
      const seg = REQUEST_SEGMENTS[this.get('requestFilter')] || null;
      const q = (this.get('reqQ') || '').trim().toLowerCase();
      // '' = All. Every other value came out of the option list built from
      // these same rows THROUGH THE SAME pick, so comparing string forms is
      // the same test as comparing the raw values — it covers the numeric year
      // and it is what makes a Month picked as 'Aug' match a row storing
      // 'August' or 8.
      const picks = REQ_FILTERS.map((f) => ({ pick: f.pick, want: this.get(f.key) })).filter((p) => p.want !== '');
      return this.get('requests').filter(
        (r) =>
          (!seg || seg(r)) &&
          (!q || (r.blob || '').includes(q)) &&
          picks.every((p) => String(p.pick(r)) === String(p.want)),
      );
    },
    /* Sorting runs over the FULL filtered set, never the visible page: the
       client already holds every row of the project from the one unfiltered
       fetch, so a client-side sort here IS the annotation's "sort the whole
       dataset" semantic — a server round-trip would return the same order.
       filter → sort → paginate, in that order. reqFiltered's array is Ractive's
       cached value, so it is copied before sorting, never sorted in place. */
    reqSorted() {
      return this.get('reqFiltered').slice().sort(reqComparator(this.get('reqSortKey'), this.get('reqSortDir')));
    },
    // the four stat segments — one row each, so the a11y attributes and the
    // click wiring live in ONE place in the template
    reqStats() {
      const c = this.get('requestCounts');
      // labels literal-uppercase like the Pipeline metrics — one shared recipe.
      // REQUESTS takes .metric's default colour, so it names no colourway:
      // green/amber/red are the complete set.
      return [
        { key: 'all', cls: '', label: 'REQUESTS', value: c.requests },
        { key: 'filed', cls: 'green', label: 'IN PIPELINE', value: c.inPipeline },
        { key: 'filing', cls: 'amber', label: 'TO FILE', value: c.toFile },
        { key: 'clarification', cls: 'red', label: 'FOR CLARIFICATION', value: c.forClarification },
      ];
    },
    reqPageCount() {
      return Math.max(1, Math.ceil(this.get('reqFiltered').length / REQ_PAGE_SIZE));
    },
    reqRows() {
      const page = Math.max(1, Math.min(this.get('reqPage'), this.get('reqPageCount')));
      const from = (page - 1) * REQ_PAGE_SIZE;
      return this.get('reqSorted').slice(from, from + REQ_PAGE_SIZE);
    },
    // first and last always, current ±1, an ellipsis marker for each gap
    reqPages() {
      const total = this.get('reqPageCount');
      const cur = Math.max(1, Math.min(this.get('reqPage'), total));
      if (total <= 7) return Array.from({ length: total }, (_, i) => ({ n: i + 1 }));
      const want = [...new Set([1, cur - 1, cur, cur + 1, total])]
        .filter((n) => n >= 1 && n <= total)
        .sort((a, b) => a - b);
      const out = [];
      want.forEach((n, i) => {
        if (i && n - want[i - 1] > 1) out.push({ gap: true });
        out.push({ n });
      });
      return out;
    },
    reqFilterDefs() {
      const rows = this.get('requests');
      return REQ_FILTERS.map((f) => ({
        key: f.key,
        label: f.label,
        value: this.get(f.key),
        // pick canonicalises BEFORE the dedupe, so 'August', 'Aug' and 8
        // collapse into the one option the comparison will match
        options: [...new Set(rows.map((r) => f.pick(r)))].filter((v) => !unranked(v)).sort(f.sort),
      }));
    },
    /* R2 — the drawn window: WEEK_COUNT weeks from weekStart, labelled from the
       real dates. A week belongs to its MONDAY's month and wkN is that Monday's
       ordinal among the Mondays of that month (Aug 3 → wk1 … Aug 31 → wk5,
       Sep 7 → wk1), which reproduces the frame and fixes its OCTOBER mislabel
       by construction. Pure string/local-midnight math through the existing
       13f helpers — never buildWeeks(), whose key is a Sunday on a Manila host
       (recon §E.1), and never toLocaleDateString, which can emit 'Sept'. */
    plannerWeeks() {
      const from = this.get('weekStart');
      return Array.from({ length: WEEK_COUNT }, (_, i) => {
        const key = mondayShift(from, i);
        const fridayIso = isoAddDays(key, 4);
        const month = Number(key.slice(5, 7));
        return {
          key,
          fridayIso,
          wk: `wk${Math.floor((Number(key.slice(8, 10)) - 1) / 7) + 1}`,
          sub: `${fmtMonthDay(key)}–${Number(fridayIso.slice(8, 10))}`,
          monthKey: key.slice(0, 7),
          month: MONTHS_LONG[month - 1].toUpperCase(),
        };
      });
    },
    /* contiguous runs over plannerWeeks — the header cell spans span×--gw */
    plannerMonths() {
      const out = [];
      for (const w of this.get('plannerWeeks')) {
        const last = out[out.length - 1];
        if (last && last.monthKey === w.monthKey) last.span += 1;
        else out.push({ month: w.month, monthKey: w.monthKey, span: 1 });
      }
      return out;
    },
    /* the window the gantt actually draws: WEEK_COUNT weeks starting at
       weekStart, so the label's right end is the LAST day shown, not the
       Monday after it — the old label named a week the board never drew. */
    rangeLabel() {
      const from = this.get('weekStart');
      return fmtRange(from, isoAddDays(from, WEEK_COUNT * 7 - 1));
    },
    /* §5.4: bounded by the reference weeks. A committed capacity outside those
       bounds widens the end it exceeds — a slider that cannot reach the number
       printed beside it would be lying about where the thumb sits. */
    capMin() {
      const c = this.get('capacity');
      const least = Number.isFinite(c.least) ? c.least : CAP_MIN_FALLBACK;
      return Math.min(least, c.weekly || least);
    },
    capMax() {
      const c = this.get('capacity');
      const most = Number.isFinite(c.most) ? c.most : CAP_MAX_FALLBACK;
      return Math.max(most, c.weekly || most, this.get('capMin') + 1);
    },
    /* the filled portion of the rail, as a percentage — WebKit has no native
       ::-moz-range-progress, so the track paints it from this custom property */
    capFill() {
      const min = this.get('capMin');
      const max = this.get('capMax');
      const v = this.get('capDraft');
      if (!(max > min) || !Number.isFinite(v)) return 0;
      return Math.round(Math.max(0, Math.min(1, (v - min) / (max - min))) * 1000) / 10;
    },
    capBand() {
      return capacityBand(this.get('capDraft'), this.get('capacity'));
    },
    /* Requests sync strip (owl #20 §3.2) — the SAME sync state the header chip
       renders, in Manila time (invariant 11). It reads lastSuccessAt, not the
       last ATTEMPT: the chip owns the failure state ("sync failing — showing
       last good data"), and the strip says when that last good data was read.
       Keying off the attempt instead would print 'not yet synced' beside a
       screenful of synced data the moment one poll blipped. 'not yet synced'
       is reserved for what it claims — no successful read, ever, so there is
       no time to name and no channel to call live. */
    syncStripLabel() {
      const s = this.get('sync');
      if (!s || !s.lastSuccessAt) return 'not yet synced';
      const at = new Date(s.lastSuccessAt);
      if (Number.isNaN(at.getTime())) return 'not yet synced';
      const live = s.push_at && Date.now() - new Date(s.push_at).getTime() < PUSH_LIVE_MS;
      return `synced ${MANILA_TIME.format(at)}${live ? ' · push live' : ''}`;
    },
    /* Each row is stamped with the KEY of the block it belongs to — the
       sprint's id, or the two derived tails. Never the sprint NAME: names are
       free text (the modal edits them, and addSprint can auto-name a duplicate
       'Sprint 2'), so a name join makes two same-named sprints each collect the
       union of both ranges and every affected row render twice. */
    schedRows() {
      const sprints = this.get('sprints');
      return this.get('rows')
        .filter((r) => r.status !== 'done')
        .map((r) => {
          const s = r.slottedWeek ? sprints.find((sp) => r.slottedWeek >= sp.start && r.slottedWeek <= sp.end) : null;
          return { ...r, sprintKey: r.slottedWeek ? (s ? s.id : 'outside') : 'unscheduled' };
        });
    },
    /* R5 — sprint membership is DERIVED from the slotted week, so dragging a
       row into another sprint's date range IS the sprint move; there is no
       sprint-assignment write. Invariant 12 wants the gaps surfaced, hence the
       'Outside any sprint' block between the sprints and the unscheduled tail.
       Empty groups are dropped.

       `meta` and `count` are two strings because the frame gives them two
       tones (dump sprintHeader: '#duration' #64748b, '#items' #94a3b8); their
       concatenation is the contract §3.5 string, character for character. */
    plannerGroups() {
      const rows = this.get('schedRows');
      const groups = [];
      for (const s of this.get('sprints')) {
        const inSprint = rows.filter((r) => r.sprintKey === s.id);
        if (!inSprint.length) continue;
        groups.push({
          kind: 'sprint',
          id: s.id,
          name: s.name,
          meta: `${fmtDate(s.start)} - ${fmtDate(s.end)} · ${mondaysBetween(s.start, s.end)} wk`,
          count: itemCount(inSprint.length),
          rows: inSprint,
        });
      }
      const outside = rows.filter((r) => r.sprintKey === 'outside');
      if (outside.length) {
        groups.push({ kind: 'outside', id: 'outside', name: 'Outside any sprint', meta: 'weeks no sprint covers', count: itemCount(outside.length), rows: outside });
      }
      const unsched = rows.filter((r) => r.sprintKey === 'unscheduled');
      if (unsched.length) {
        groups.push({ kind: 'unscheduled', id: 'unscheduled', name: 'Unscheduled', meta: 'Not yet plotted', count: itemCount(unsched.length), rows: unsched });
      }
      return groups;
    },
    /* GUARD, not a fix — the live defect recorded in gantt-frame-notes.md.
       `POST /suggest` keys its plan off lib/calendar's buildWeeks(), whose
       `key` is derived with toISOString() from a LOCAL-midnight Monday: on an
       Asia/Manila host (invariant 11, i.e. production) every key comes back as
       the SUNDAY before. Those keys match no drawn column, so R8's ghost bars
       render nothing, and Accept would persist them as slotted_week — the rows
       then fall outside their sprint and the capacity footer, keyed on
       Mondays, silently blanks. `lib/**` is frozen and the repair is JP's
       call, so until it lands a proposal whose weeks are not Mondays is
       refused loudly instead of applied silently. Empty on a correct host. */
    suggestOffWeeks() {
      const s = this.get('suggest');
      if (!s || !s.plan) return [];
      return [...new Set(Object.values(s.plan).filter((w) => w && mondayIso(w) !== w))].sort();
    },
    suggestOffWeeksText() {
      const off = this.get('suggestOffWeeks');
      return off.length === 1
        ? `the plan proposes ${off[0]}, which is not a Monday`
        : `the plan proposes ${off.length} weeks that are not Mondays (${off.join(', ')})`;
    },
    /* ---- owl #25 expanded-bar counts (node 262:34499) ----

       All three read the /suggest payload the client ALREADY holds — no second
       request, no re-forecast (invariants 5–7: no forecast math runs here), and
       the measured hard-mix ceiling stays inside lib/planner — it is never
       retyped here, not even to check a share. `strain` is the server's
       own answer to "which weeks are hard-heavy UNDER THE PROPOSED PLAN", so it
       is read, never recomputed. Deriving from `suggest` rather than banking a
       count at fetch time means the numbers can never drift from the proposal.

       R-a: flagged and hard-heavy are INDEPENDENT counts in different units
       (proposals vs weeks) — separate sources, no cross-check, no total. */
    suggestProposed() {
      const s = this.get('suggest');
      return s && s.plan ? Object.keys(s.plan).length : 0;
    },
    /* `notes` is suggestPlan's own per-card exception channel — over-capacity,
       past the hard ceiling, unmeetable deadline, or a 🛑 blocker. Intersected
       with `plan` so the unit is PROPOSALS: a note on a card the planner could
       not place at all is not a proposal and does not count. (detectConflicts
       is not reusable here — it consumes forecast milestones for the PERSISTED
       plan, so a proposal would need a re-forecast the client must not do.) */
    suggestFlagged() {
      const s = this.get('suggest');
      if (!s || !s.plan || !s.notes) return 0;
      return Object.keys(s.plan).filter((id) => s.notes[id]).length;
    },
    suggestHardHeavy() {
      const s = this.get('suggest');
      return s && Array.isArray(s.strain) ? s.strain.length : 0;
    },
    /* One computed drives both the Accept button's disabled state and its
       reason — a non-empty string is truthy. R-e: nothing to apply is not an
       error, so the bar still shows and Discard still reverts; the off-week
       tripwire keeps precedence because a non-Monday week corrupts silently. */
    suggestBlockedWhy() {
      if (this.get('suggestOffWeeks').length) return 'The proposed weeks are not Mondays — accepting would corrupt the slotted weeks.';
      return this.get('suggestProposed') === 0 ? 'Nothing to apply — this suggestion proposes no moves.' : '';
    },
    /* the hard-mix thresholds the server measured (lib/planner.constants
       HARD_MIX), with the module constants as the pre-payload fallback */
    capHardIdeal() {
      const c = this.get('capacity');
      return Number.isFinite(c.hardIdeal) ? c.hardIdeal : HARD_IDEAL;
    },
    capHardCeiling() {
      const c = this.get('capacity');
      return Number.isFinite(c.hardCeiling) ? c.hardCeiling : HARD_CEILING;
    },
    /* '13%' is ROUNDED from the measured 12.9% ceiling, never a second literal */
    footCaption() {
      const c = this.get('capacity');
      const typical = Number.isFinite(c.typical) ? c.typical : '—';
      return `capacity ${c.weekly} · typical ${typical} · hard ceiling ${Math.round(this.get('capHardCeiling') * 100)}%`;
    },
    forecastRows() {
      return this.get('rows').filter((r) => r.status !== 'done');
    },

    /* ---- sprints modal validation (owls #28–#30, #37) ----

       Four live computeds over the DRAFT, so a banner appears — and Save locks
       or unlocks — as the user types, without a round trip. They are not the
       truth: `PUT /sprints` rejects duplicate names and overlaps with a 422 and
       writes nothing (invariant 12). They are the same rules said EARLY, and
       the modal never claims a save will succeed that the server would refuse.

       Each banner carries the DRAFT INDEX of the row it follows, so placement
       is data rather than a second layout rule (R-f-4), and each one names the
       pair it is about. Pairs are read in START order — the order the route
       persists in — so a draft the user has not re-sorted still reads correctly
       against what will be saved. */
    sprintOrder() {
      return this.get('sprintDraft')
        .map((s, i) => ({ s, i }))
        .filter((e) => e.s && e.s.start && e.s.end)
        .sort((a, b) => (a.s.start < b.s.start ? -1 : a.s.start > b.s.start ? 1 : a.i - b.i));
    },
    /* BLOCKING. Names are unique per project, compared trimmed and
       case-insensitively — the same comparison the route makes — and one banner
       is emitted per clashing NAME, not per row, so three "Sprint 46"s say it
       once. */
    sprintDupNames() {
      const draft = this.get('sprintDraft');
      const counts = new Map();
      for (const s of draft) {
        const key = String((s && s.name) || '').trim().toLowerCase();
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      }
      const out = [];
      for (const s of draft) {
        const key = String((s && s.name) || '').trim().toLowerCase();
        if (!key || counts.get(key) < 2 || out.some((b) => b.key === key)) continue;
        out.push({
          key,
          variant: 'err',
          title: 'Duplicate sprint names found',
          text: `Multiple sprints are named "${String(s.name).trim()}". Give each sprint a unique name to save.`,
        });
      }
      return out;
    },
    /* BLOCKING (Miles, #37): a nameless sprint is unidentifiable in the Gantt's
       sprint headers, so trim-and-reject. One banner per blank ROW — unlike
       duplicates, which are one per NAME — because there is no shared name to
       collapse them onto, and each row needs its own pointer. The row is named
       by the one thing a nameless row still has: its start date. The blank test
       and the copy are byte-shared with the route's `blankNameIssues`, so the
       422 the server would return says the same words as this banner.

       `sprintDupNames` skips blanks (the guards at `if (key)` / `if (!key`), so
       a blank reports here ONCE and never also as a duplicate. */
    sprintBlankNames() {
      const draft = this.get('sprintDraft');
      const out = [];
      draft.forEach((s, i) => {
        if (String((s && s.name) || '').trim() !== '') return;
        /* clearing the date input sets `start` to '' (snapSprintStart), and a
           nameless row with no start has nothing left to point at — so the
           fallback drops the clause rather than rendering "starting  has". The
           route never needs it: its `start` is DATE_ONLY-required. */
        const when = fmtLongIso(s && s.start);
        out.push({
          after: i,
          variant: 'err',
          title: 'Sprint name required',
          text: when
            ? `A sprint starting ${when} has no name. Name every sprint to save.`
            : 'This sprint has no name. Name every sprint to save.',
        });
      });
      return out;
    },
    /* BLOCKING, and symmetric with duplicates by ruling (R-f-3): constitution
       invariant 12 already rejects overlapping sprints on save, so the modal
       says so in the error treatment rather than letting the PUT be the first
       the user hears of it. */
    sprintOverlaps() {
      const order = this.get('sprintOrder');
      const out = [];
      for (let k = 1; k < order.length; k += 1) {
        const l = order[k - 1];
        const r = order[k];
        if (r.s.start > l.s.end) continue;
        out.push({
          after: l.i,
          variant: 'err',
          title: 'Overlapping sprints',
          text: `${l.s.name || 'This sprint'} and ${r.s.name || 'the next sprint'} cover the same weeks. Sprints cannot overlap, so this list will be rejected on save.`,
        });
      }
      return out;
    },
    /* NON-blocking — gaps are legal (invariant 12 surfaces them as *Outside any
       sprint*), so this warns and never disables Save. One banner PER gap,
       between the two sprints it names, and only when at least one WORKING day
       is left unallocated (R-f-8). */
    sprintGaps() {
      const order = this.get('sprintOrder');
      const holidays = new Set(this.get('holidays') || []);
      const out = [];
      for (let k = 1; k < order.length; k += 1) {
        const l = order[k - 1];
        const r = order[k];
        if (r.s.start <= l.s.end) continue; // an overlap is not a gap
        if (workingDaysBetween(l.s.end, r.s.start, holidays) < 1) continue;
        out.push({
          after: l.i,
          variant: 'warn',
          title: 'Unscheduled Gap Detected',
          text: `There are unallocated working days between ${l.s.name} and ${r.s.name}. Deliverables scheduled during this period won't belong to any sprint.`,
        });
      }
      return out;
    },
    /* Miles's ruling (#37), superseding R7: Save decides on UNSAVED CHANGES,
       not on empty-vs-not. The draft is compared against the baseline captured
       at open, on the three PERSISTED fields in DRAFT ORDER, and a length
       change is a change. All three cases then fall out of one rule: opened
       empty = nothing changed = dead; every sprint deleted = a real change =
       live; a field edited and put back = nothing changed = dead again.

       No trimming — a name the user changed to 'Sprint 1 ' is an edit they
       made. Whether the route trims on store is a separate question. */
    sprintDirty() {
      const draft = this.get('sprintDraft') || [];
      const base = this.get('sprintBaseline') || [];
      if (draft.length !== base.length) return true;
      return draft.some((s, i) => {
        const b = base[i] || {};
        return (s && s.name) !== b.name || (s && s.start) !== b.start || (s && s.end) !== b.end;
      });
    },
  },
});

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
const unitPct = (u) => ((u / TOTAL_UNITS) * 100).toFixed(2);

/* R3 — the bar IS the server's phase segments (absolute, half-open ISO dates
   built from lib/forecast output). No forecast math runs here: a segment that
   the window clips to nothing is dropped, and that is the whole of it. */
app.set('phaseBars', (row) => {
  const phases = Array.isArray(row.phases) ? row.phases : [];
  const bars = [];
  for (const p of phases) {
    const left = clampUnits(dayIndex(p.startIso));
    const right = clampUnits(dayIndex(p.endIso));
    if (right <= left) continue; // zero-width, or clipped fully outside the window
    bars.push({ cls: p.phase, left: unitPct(left), width: unitPct(right - left), title: `${p.phase} → ${fmtDate(p.endIso)}` });
  }
  return bars;
});
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
function anyMenuOpen() {
  return app.get('urgencyMenu') || app.get('diffMenu') || app.get('duePopover') || app.get('reqMenu') || app.get('warnPop');
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
function closeMenus({ restoreFocus = false } = {}) {
  const t = overlayTrigger;
  const ae = document.activeElement;
  const heldFocus = !!(ae && ae.closest && ae.closest('.selectmenu, .duepop, .warnpop'));
  overlayTrigger = null;
  app.set({ urgencyMenu: null, diffMenu: null, duePopover: null, reqMenu: null, warnPop: null });
  if ((restoreFocus || heldFocus) && t && t.isConnected) t.focus();
}
document.addEventListener('click', (e) => {
  // the ignore list names the TRIGGERS, not their wrappers: `.warnwrap` is a
  // block spanning the whole fluid name column, so listing it would make the
  // blank strip beside `Needs Info` a dead zone for dismissing
  if (anyMenuOpen() && !e.target.closest('.ubadge-wrap, .selectmenu, .duewrap, .duepop, .selwrap, .warnmsg, .warnpop')) closeMenus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && anyMenuOpen()) closeMenus({ restoreFocus: true });
});
document.addEventListener('scroll', (e) => {
  // the popover scrolls INSIDE itself on a viewport shorter than it is —
  // that must not dismiss the multi-step edit it exists to hold; a long
  // Requests select scrolls itself for the same reason
  if (e.target.closest && e.target.closest('.duepop, .selectmenu')) return;
  if (anyMenuOpen()) closeMenus();
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
  return { left: Math.round(left), top: Math.round(top) };
}

/* One opener for all five overlays. They differ only in state keys, box
   height and gap, and whether the box is big enough to need clamping: the two
   row select menus are fixed-length lists, the due popover is a 354×420
   dialog and the warning popover a 235-wide one, both of which must stay fully
   on screen. Mutual exclusion lives here — opening any one nulls the others —
   and so does the focus capture the shared close path restores from. */
function openOverlay(ctx, cardId, opts) {
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
    urgencyMenu: null,
    diffMenu: null,
    duePopover: null,
    reqMenu: null,
    warnPop: null,
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
const scrollerOf = (node) => {
  const wrap = node.closest('.pscrollwrap');
  return wrap ? wrap.querySelector('.pscroll') : document.querySelector('.pscroll');
};
// only one tab is mounted at a time, but the sweep is key-driven either way
function refreshThumbs() {
  document.querySelectorAll('.pscroll').forEach((el) => updateThumb(el, thumbKeyOf(el)));
}
window.addEventListener('resize', refreshThumbs);

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

/* ---------- data loading ---------- */

async function loadShell() {
  const [me, projects] = await Promise.all([api.get('/api/me'), api.get('/api/projects')]);
  const name = me.user.name || me.user.email || '';
  const tabs = app.get('tabs').filter((t) => t.id !== 'admin');
  if (me.user.admin) tabs.push({ id: 'admin', label: 'Admin', icon: 'tabAdmin' });
  // URL-first selection (phase 13h, JP 2026-08-15). An unknown project code, a
  // project the caller is not a member of, and `admin` for a non-admin ALL fall
  // through to the defaults silently — no error page. `tabs` below already
  // excludes admin for a non-admin, so no new access check is introduced here
  // and none is implied: the data still 403s server-side (invariant 9).
  // The route's project MUST be chosen BEFORE `projects` renders: the header
  // <select> is two-way bound to activeProjectId, so rendering the options
  // against a null selection makes the browser pick option one and the binding
  // write it back — which is why this is ONE set, not projects-then-choose
  // (live defect found 2026-08-17: /rt-837/... always settled on projects[0]).
  const byCode = initialRoute.project
    ? projects.projects.find((p) => p.code === initialRoute.project)
    : null;
  const chosen = byCode || projects.projects[0] || null;
  // Suppressed: boot pushes no history entry — it normalizes once, below.
  withRouterSuppressed(() => {
    app.set({
      projects: projects.projects,
      activeProjectId: chosen ? chosen._id : null,
      userName: name,
      userInitial: (name[0] || '?').toUpperCase(),
      isAdmin: !!me.user.admin,
      tabs,
    });
  });
  const wantTab = tabs.some((t) => t.id === initialRoute.tab) ? initialRoute.tab : ROUTE_DEFAULT_TAB;

  await loadAll();

  // After the load, so a deep link into a tab has its data — and through the
  // real selectTab, so the per-tab resets fire exactly as they do on a click.
  withRouterSuppressed(() => selectTab(wantTab));
  normalizeUrl();
}

async function loadAdmin() {
  try {
    const res = await api.get('/api/admin/users');
    app.set({ adminUsers: res.users, adminProjects: res.projects, adminEditing: null });
  } catch (err) {
    app.set('adminError', errText(err));
  }
}

/* §3 stat bar: with a status filter on, every card but the active one drops
   to 45% opacity (REQUESTS included — it is the show-all, not a status) */
app.set('statOff', (f) => {
  const cur = app.get('requestFilter');
  return cur !== 'all' && cur !== f;
});

/* The MC# provenance line links into the intake sheet only when the project
   payload carries the sheet id. /api/projects does not select it today, so
   this returns '' and the template renders plain dim text — never a dead
   link. It starts working the moment the field is exposed. */
app.set('sheetRowUrl', (row) => {
  const p = (app.get('projects') || []).find((x) => x._id === app.get('activeProjectId'));
  const id = p && p.intake_sheet_id;
  if (!id || !row) return '';
  return `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${p.intake_sheet_gid || 0}&range=A${row}`;
});

app.set('projCode', (pid) => {
  const p = (app.get('adminProjects') || []).find((x) => x.id === pid);
  return p ? p.code : '?';
});
app.set('fmtWhen', (iso) => (iso ? new Date(iso).toLocaleString() : 'never'));

/* Calendar cells for the visible month — a fixed 6×7 grid including the
   leading and trailing days, so the popover never changes height. month and
   staged arrive as ARGUMENTS so Ractive registers them as dependencies and
   re-renders the grid when either moves; a closure read would not. */
app.set('dueGrid', (month, staged) => {
  if (!month) return [];
  const [y, m] = month.split('-').map(Number);
  const today = manilaToday();
  const lead = new Date(y, m - 1, 1).getDay(); // 0 = Sunday, matching dowNames
  return Array.from({ length: 42 }, (_, i) => {
    // the constructor normalises out-of-range day fields, so no leading or
    // trailing cell needs its own Date to walk from
    const d = new Date(y, m - 1, 1 - lead + i);
    const iso = isoOf(d);
    return { iso, day: d.getDate(), out: d.getMonth() !== m - 1, today: iso === today, on: iso === staged };
  });
});
app.set('dueMonthLabel', (month) => {
  if (!month) return '';
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
});

/* W2 deadline write (FR-9.1): optimistic with revert, same pattern as urgency
   and difficulty; Trello is written first server-side, so a failure reverts
   here. The no-op guard compares against trelloDue because W2 owns only the
   TRELLO due date — a sheet-sourced deadline is not Sirius's to clear, which
   is why the popover disables Clear on those rows. The cell shows 'saving…'
   meanwhile, so no unconfirmed date is ever on screen (invariant 8). */
async function writeDeadline(cardId, value) {
  const row = app.get('rows').find((r) => r.cardId === cardId);
  if (!row) return;
  if ((value || null) === (row.trelloDue || null)) return; // no-op guard — no call, no audit
  const prev = { deadline: row.deadline, deadlineSource: row.deadlineSource, trelloDue: row.trelloDue };
  patchRow(cardId, { deadline: value, deadlineSource: value ? 'trello' : null, trelloDue: value });
  app.set(`savingDeadline.${cardId}`, true);
  try {
    await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/deadline`, { date: value });
    await loadAll(); // precedence may fall back to the sheet deadline (BR-9)
  } catch (err) {
    patchRow(cardId, prev);
    flashBanner(`Deadline write failed — reverted. ${errText(err)}`);
  } finally {
    app.set(`savingDeadline.${cardId}`, false);
  }
}

/* Cards / week (build-spec §5.4). Sirius-INTERNAL planning data — no source
   system is touched, so this is not a registry write; it is the same class as
   a slotted week or a pin, and the server audits it. Optimistic all the same:
   capacity.weekly drives the footer's over-capacity tint and the suggester's
   quota, so the whole board must move with the thumb or not at all.

   Commits are SERIALISED: one PATCH in flight at a time, the newest value
   queued behind it. A held arrow key fires a 'change' per step and a drag can
   be released twice in a second, so parallel commits are the normal case, not
   the exotic one — and two in flight race. The loser's rollback would revert
   the winner's value, an out-of-order response would re-seat the thumb from a
   stale echo, and every intermediate step would bank its own capacity.set
   audit row. The queue collapses a burst to at most two writes and leaves the
   last value the user asked for as the one that lands.

   capServer is the last value the SERVER confirmed. It is the only safe
   rollback target: capacity.weekly is optimistic mid-burst, so reverting to it
   would restore another pending commit's guess. */
let capServer = null;
let capQueued = null;
let capFlushing = false;

async function writeCapacity(next) {
  /* owl #23 — the SECOND lock. The disabled input fires no events, but the
     write path is shared (a queued commit, another tab flipping the lock), and
     the server refuses with 403 CAPACITY_LOCKED anyway; snapping the thumb back
     here means the reader never sees a number the server would not accept. */
  if (app.get('capacity').locked) {
    app.set('capDraft', app.get('capacity').weekly);
    return;
  }
  const prev = app.get('capacity').weekly;
  if (!Number.isInteger(next) || next === prev) {
    app.set('capDraft', prev); // snap the thumb back to the committed number
    return;
  }
  app.set({ 'capacity.weekly': next, capDraft: next });
  capQueued = next;
  if (capFlushing) return; // the running flush picks the new value up
  capFlushing = true;
  app.set('savingCapacity', true);
  let landed = false;
  try {
    while (capQueued !== null) {
      const want = capQueued;
      capQueued = null;
      if (want === capServer) continue; // the server already holds it
      try {
        const res = await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/capacity`, { weekly: want });
        if (res.capacity) {
          capServer = res.capacity.weekly;
          landed = true;
          // a newer value is already queued: re-seating here would flash the
          // superseded number, so let the next pass land the server's shape
          if (capQueued === null) app.set({ capacity: res.capacity, capDraft: res.capacity.weekly });
        }
      } catch (err) {
        capQueued = null; // the queue is void once a commit fails
        const revert = Number.isInteger(capServer) ? capServer : prev;
        app.set({ 'capacity.weekly': revert, capDraft: revert });
        flashBanner(`Capacity write failed — reverted. ${errText(err)}`);
      }
    }
  } finally {
    capFlushing = false;
    app.set('savingCapacity', false);
  }
  /* Invariant 13 v4.3.0: a capacity change invalidates matching acks, so the
     deadlines banners can RE-SURFACE right now — refetch once after the queue
     settles or the payload is stale until the next reload. */
  if (landed) {
    try {
      const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
      app.set('deadlinePayload', res);
      computeDeadlines();
    } catch {
      /* stale-until-reload is the pre-amendment behavior — never worse */
    }
  }
}

async function loadAll() {
  const pid = app.get('activeProjectId');
  if (!pid) return;
  try {
    const [pipeline, requests, deadlines, model] = await Promise.all([
      api.get(`/api/projects/${pid}/deliverables`),
      api.get(`/api/projects/${pid}/requests`), // §3: one unfiltered fetch — every filter is client-side
      api.get(`/api/projects/${pid}/deadlines`),
      api.get(`/api/projects/${pid}/model`),
    ]);
    // searchable text per row, computed once per load (annotation 17:2057).
    // The MC# cell shows the bare mcLabel (JP ruling 2026-08-13), but typing
    // 'MC-655.3' must still find its row — displayId and mcNumber both stay
    // searchable, and mcLabel is by construction one of the two.
    pipeline.rows.forEach((r) => {
      r.blob = `${r.displayId} ${r.mcNumber || ''} ${r.name} ${r.assetType || ''} ${r.requestor || ''} ${r.currentList || ''} ${r.statusNote || ''}`.toLowerCase();
    });
    capServer = pipeline.capacity.weekly; // server truth — the capacity rollback target
    app.set({
      rows: pipeline.rows,
      writesEnabled: pipeline.writesEnabled !== false,
      workCardsByMc: pipeline.workCardsByMc,
      corrections: pipeline.corrections,
      sprints: pipeline.sprints,
      // R-f-8: the ARES-canonical working-day calendar, so the sprints modal's
      // gap warning counts the same open days the server's forecast does
      holidays: pipeline.holidays || [],
      capacity: pipeline.capacity,
      capDraft: pipeline.capacity.weekly, // server truth re-seats the thumb
      perWeek: pipeline.perWeek || {},
      perWeekLocal: {}, // server truth supersedes every optimistic drop delta
      sync: pipeline.sync,
      syncLabel: pipeline.sync
        ? pipeline.sync.ok
          ? `Last Synced ${new Date(pipeline.sync.at).toLocaleTimeString()}${pipeline.sync.push_at && Date.now() - new Date(pipeline.sync.push_at).getTime() < PUSH_LIVE_MS ? ' · push live' : ''}`
          : 'sync failing — showing last good data'
        : 'no sync yet',
      banner: pipeline.sync && !pipeline.sync.ok ? `Sync error: ${pipeline.sync.error || 'unknown'} — data below is the last good state.` : '',
      requests: blobRequests(requests.requests),
      rejects: requests.rejects,
      requestCounts: requests.counts || app.get('requestCounts'),
      deadlinePayload: deadlines,
      modelProvenance: model.provenance,
      modelReview: model.model.review,
    });
    computeDeadlines();
    requestAnimationFrame(refreshThumbs);
  } catch (err) {
    app.set('banner', `Load failed: ${err.message} — the app stays usable with what it has.`);
  }
}

/* §3 search text for one request row — MC#, name, use case, requestor, type,
   brief and the frost note's ONE resolved text, so the filter and the
   highlighter agree on what counts as a match. Anything that changes a row's
   note rebuilds this, or the two stop agreeing. */
const requestBlob = (r) =>
  `${r.mc_number || ''} ${r.name || ''} ${r.use_case || ''} ${r.requestor || ''} ${r.asset_type || ''} ${r.brief || ''} ${noteText(r.note)}`.toLowerCase();
/* One pass per load: the search blob plus the two sort keys whose derivation
   costs string work (month canonicalisation, the MC# regex). Both are pure
   functions of payload fields the client never edits, so computing them here
   is O(n) instead of O(n log n) inside the comparator — and EVERY assignment
   to `requests` goes through this function, so no row reaches a comparator
   without them. */
function blobRequests(rows) {
  rows.forEach((r) => {
    r.blob = requestBlob(r);
    r._monthIdx = monthOrder(r.month);
    r._mcRank = mcRank(r);
  });
  return rows;
}

/* An open note editor is keyed on mc_number ALONE and renders only where its
   row is on the VISIBLE page, so a sort, a filter or the search can carry that
   row off-screen while noteEditing stays set: the editor silently disappears
   and the NEXT openNote overwrites the draft with another row's text.
   Dismissing it here keeps "open" and "visible" the same thing, and an unsaved
   draft says so rather than vanishing. switchProject clears the same three
   keys, for the neighbouring reason (a draft must not follow the reader into
   another project's same-numbered row). */
function closeNoteEditor() {
  const mc = app.get('noteEditing');
  if (!mc) return;
  const d = app.get('noteDraft') || {};
  const row = app.get('requests').find((x) => x.mc_number === mc);
  const saved = (row && row.note) || null;
  const dirty = (d.remark || '').trim() !== noteText(saved) || !!d.clarify !== !!(saved && saved.clarify);
  app.set({ noteEditing: null, noteDraft: { remark: '', clarify: false }, noteError: '' });
  if (dirty) flashBanner(`The note on ${mc} was not saved — the table re-ordered before Submit.`);
}

/* Any filter OR sort change starts the pager over — page 4 of the old order is
   not page 4 of the new one — and closes the note editor, which the new order
   may have moved out of sight. One observer owns both rules, so the sort
   handler repeats neither. A reload only clamps the pager, so saving a note
   does not yank the reader back to page 1. */
app.observe(
  `reqQ requestFilter reqSortKey reqSortDir ${reqFilterKeys.join(' ')}`,
  () => {
    app.set('reqPage', 1);
    closeNoteEditor();
  },
  { init: false },
);
app.observe('requests', () => {
  const last = app.get('reqPageCount');
  if (app.get('reqPage') > last) app.set('reqPage', last);
}, { init: false });

function computeDeadlines() {
  const payload = app.get('deadlinePayload');
  const offset = app.get('monthOffset');
  const base = new Date();
  base.setMonth(base.getMonth() + offset, 1);
  const y = base.getFullYear();
  const m = base.getMonth();
  app.set('monthLabel', base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

  const inMonth = payload.milestones.filter((ms) => {
    const d = new Date(ms.date + 'T00:00:00');
    return d.getFullYear() === y && d.getMonth() === m;
  });
  const byWeek = {};
  for (const ms of inMonth) (byWeek[ms.week] = byWeek[ms.week] || []).push(ms);
  const cap = app.get('capacity').weekly || 1;
  const keys = Object.keys(byWeek).sort();
  app.set({
    deadlineWeeks: keys.map((key, i) => {
      const items = byWeek[key];
      const urgent = items.filter((x) => x.urgent).length;
      const load = rowLoad(items); // BR-6c card-equivalents
      return {
        key,
        label: `Week ${i + 1}`,
        sub: fmtDate(key),
        items,
        urgent,
        load,
        // §6.1: the week tints ONLY when over capacity — warnings have banners
        flagged: load > cap,
        capPct: Math.min(100, (load / cap) * 100).toFixed(1),
      };
    }),
    deadlineConflicts: payload.conflicts.filter((c) => keys.includes(c.week)),
    acknowledged: (payload.acknowledged || []).filter((c) => keys.includes(c.week)),
    replot: payload.replot,
    dueThisMonth: inMonth.length,
    urgentThisMonth: inMonth.filter((x) => x.urgent).length,
  });
}

/* FR-12: day columns for an expanded week — capacities from the server
   (largest remainder, exact sum), entries placed on plannedDay ?? forecast. */
app.set('dayCols', (weekKey) => {
  const payload = app.get('deadlinePayload');
  const cols = (payload.days && payload.days[weekKey]) || [];
  const weekItems = (payload.milestones || []).filter((m) => m.week === weekKey);
  return cols.map((c) => {
    const items = weekItems.filter((m) => (m.plannedDay || m.date) === c.day);
    return { ...c, items, load: rowLoad(items) };
  });
});

/* FR-12.5: optimistic with rollback, same shape as the W2 deadline write. */
async function writeDayPlan(cardId, phase, day) {
  const payload = app.get('deadlinePayload');
  const idx = (payload.milestones || []).findIndex((m) => m.cardId === cardId && m.phase === phase);
  if (idx < 0) return;
  const prev = payload.milestones[idx].plannedDay || null;
  if ((day || null) === prev) return; // no-op — no call, no audit
  app.set(`deadlinePayload.milestones.${idx}.plannedDay`, day);
  computeDeadlines();
  try {
    await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/deadlines/day`, { cardId, phase, day });
  } catch (err) {
    app.set(`deadlinePayload.milestones.${idx}.plannedDay`, prev);
    computeDeadlines();
    const code = err.detail && err.detail.error && err.detail.error.code;
    const why = code === 'HOLIDAY' ? 'that day is a holiday — it takes no work' : code === 'DAY_OUTSIDE_WEEK' ? 'that day is outside the milestone’s week' : err.message;
    flashBanner(`Day move failed — reverted. ${why}`);
  }
}

/* ---------- events ---------- */

/* Shared by click and the tablist arrow keys (WAI tabs pattern). */
function selectTab(id) {
  closeMenus();
  app.set('activeTab', id);
  if (id === 'admin' && app.get('isAdmin')) loadAdmin();
  if (id === 'pipeline' || id === 'requests' || id === 'schedules') {
    // returning to the tab remounts .pscroll at scrollLeft 0 — recompute the
    // slider so the affordance is never stale (review finding 5)
    requestAnimationFrame(refreshThumbs);
  }
}

/* The project-switch reset. Extracted from the `switchProject` handler verbatim
   so back/forward across a project boundary (popstate) behaves identically to
   using the switcher — same clears, same reload. */
async function resetForProjectSwitch() {
  // Requests view state is per-project. A Type/Requestor value from the old
  // project may not exist in the new one, leaving an unclearable empty
  // table. The sort resets with them so the new project opens on its own
  // newest-filed default rather than inheriting a column the reader chose
  // while looking at other data — and an open note editor is keyed on
  // mc_number ALONE, which is
  // unique per project and NOT globally (invariant 3), so leaving it open
  // re-attaches project A's draft to project B's same-numbered row and
  // Submit would write it there.
  //
  // Planner view state is per-project too (R-d, owl #25): a pending suggestion
  // is a plan for THIS project's cards — its cardIds mean nothing in the next
  // one, and Accept would post them to /replot regardless. `collapsedBlocks` is
  // keyed on sprint ids, which are per-project, and on 'outside'/'unscheduled',
  // which would otherwise carry over. `leftCollapsed` deliberately does NOT
  // reset — it is a reader preference about the pane, not project data.
  app.set({
    ...reqFiltersCleared(),
    requestFilter: 'all',
    reqQ: '',
    reqSortKey: '',
    reqSortDir: '',
    reqPage: 1,
    reqMenu: null,
    noteEditing: null,
    noteDraft: { remark: '', clarify: false },
    noteError: '',
    suggest: null,
    collapsedBlocks: {},
  });
  await loadAll();
}

/* clicking the active segment clears it; REQUESTS is always the show-all */
function applyRequestFilter(f) {
  app.set('requestFilter', f === app.get('requestFilter') && f !== 'all' ? 'all' : f);
}

app.on({
  noop(ctx) { ctx.event && ctx.event.stopPropagation(); },
  switchTab(_ctx, id) { selectTab(id); },
  tabKey(ctx) {
    const key = ctx.event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    ctx.event.preventDefault();
    const tabs = app.get('tabs');
    const at = tabs.findIndex((t) => t.id === app.get('activeTab'));
    const next = tabs[(at + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    selectTab(next.id);
    requestAnimationFrame(() => {
      const btn = document.getElementById('tab-' + next.id);
      if (btn) btn.focus();
    });
  },
  async switchProject() {
    await resetForProjectSwitch();
  },
  signOut() { api.send('POST', '/auth/logout').then(() => window.location.reload()); },
  /* ---- Requests §3: stat segments, selects, pager — no round-trip ---- */
  setRequestFilter(_ctx, f) { applyRequestFilter(f); },
  openReqMenu(ctx, key) {
    openOverlay(ctx, key, { key: 'reqMenu', posKey: 'reqMenuPos', h: REQ_MENU_H, gap: 4, clampW: REQ_MENU_W });
    const m = { key: 'reqMenu', posKey: 'reqMenuPos', sel: '.selectmenu.reqmenu' };
    if (!placeMeasured(ctx.node, key, m)) requestAnimationFrame(() => placeMeasured(ctx.node, key, m));
  },
  pickReqFilter(_ctx, key, value) {
    app.set({ reqMenu: null, [key]: value }); // '' = All, which clears that filter
  },
  /* owl #18: asc → desc → clear on the same column; a different column starts
     that cycle over at asc. Clearing is not "no sort" — it is the newest-filed
     default the table opens on. The pager reset is the observer's job. */
  reqSortBy(_ctx, key) {
    const dir = app.get('reqSortKey') !== key ? 'asc' : app.get('reqSortDir') === 'asc' ? 'desc' : '';
    app.set({ reqSortKey: dir ? key : '', reqSortDir: dir });
  },
  reqGoPage(_ctx, n) { app.set('reqPage', n); },
  reqPageStep(_ctx, dir) {
    app.set('reqPage', Math.max(1, Math.min(app.get('reqPage') + dir, app.get('reqPageCount'))));
  },
  reqScrolled(ctx) { updateThumb(ctx.node, 'reqThumb'); },

  /* ---- frost notes (FR-11): inline editor, only Submit persists ---- */
  openNote(_ctx, mc) {
    const r = app.get('requests').find((x) => x.mc_number === mc);
    const n = (r && r.note) || null;
    // legacy text opens IN the single box — reason, remark, or the two joined
    // — so Submit rewrites all of it as the remark instead of dropping half
    app.set({
      noteEditing: mc,
      noteDraft: { remark: noteText(n), clarify: !!(n && n.clarify) },
      noteError: '',
    });
  },
  noteKeydown(ctx) {
    ctx.event.stopPropagation(); // textareas own their keys
    if (ctx.event.key === 'Escape') app.set({ noteEditing: null, noteError: '' });
  },
  cancelNote() { app.set({ noteEditing: null, noteError: '' }); },
  async submitNote(_ctx, mc) {
    const d = app.get('noteDraft');
    const remark = (d.remark || '').trim() || null;
    // the flag has no field of its own any more (owl #15): the box IS the
    // clarification, so an empty box cannot carry one (server: REMARK_REQUIRED)
    if (d.clarify && !remark) {
      app.set('noteError', 'The flag needs a note');
      return;
    }
    const idx = app.get('requests').findIndex((x) => x.mc_number === mc);
    const row = app.get(`requests.${idx}`);
    const prev = { note: row.note, blob: row.blob };
    // clarify_reason is legacy-only — a new write always nulls it
    const note = remark === null && !d.clarify ? null : { remark, clarify: d.clarify, clarify_reason: null };
    /* Optimistic, in ONE set — two keypaths, one runloop flush, so the filter,
       the sort and the option lists recompute once instead of twice and no
       frame renders the new note against the old cell. STATUS IS NOT PATCHED
       (owls #34/#35): a note never moves status, so the only thing a note save
       can change is the note itself. The badge is unaffected; the Remarks cell
       and the FOR CLARIFICATION segment both re-derive from `clarified()`,
       which reads the note this set just wrote. The search blob is REBUILT, or
       the filter (which reads blob) and the cell (which reads the note)
       disagree until the next successful load — and the refetch below is
       explicitly allowed to fail. */
    app.set({
      [`requests.${idx}.note`]: note,
      [`requests.${idx}.blob`]: requestBlob({ ...row, note }),
      noteEditing: null,
      noteError: '',
    });
    // ONLY the write is inside the rollback: once the PUT resolves the server
    // holds the note and has audited it (invariant 10), so a failed refresh is
    // staleness, never a reason to revert a row the database already has.
    try {
      await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/requests/${mc}/note`, {
        remark, clarify: d.clarify,
      });
    } catch (err) {
      app.set({
        [`requests.${idx}.note`]: prev.note,
        [`requests.${idx}.blob`]: prev.blob,
      });
      flashBanner(`Note save failed — reverted. ${errText(err)}`);
      return;
    }
    try {
      const res = await api.get(`/api/projects/${app.get('activeProjectId')}/requests`);
      app.set({ requests: blobRequests(res.requests), requestCounts: res.counts || app.get('requestCounts') });
    } catch (err) {
      flashBanner(`Note saved. The refresh failed, so the counts may be stale until the next load. ${errText(err)}`);
    }
  },
  toggleGroup(_ctx, mc) { app.toggle(`expanded.${mc}`); },
  // annotation 70:10024: row focusable, Enter toggles the MC group's tasks
  pipeRowKey(ctx, mcNumber) {
    if (ctx.event.key !== 'Enter' || ctx.event.target !== ctx.node) return;
    ctx.event.preventDefault();
    app.toggle(`expanded.${mcNumber}`);
  },
  openUrgencyMenu(ctx, cardId) {
    openOverlay(ctx, cardId, { key: 'urgencyMenu', posKey: 'urgencyMenuPos', saving: 'savingUrgency', h: 92, gap: 3 });
  },
  // annotations 169:26364/26074: optimistic write with 'saving…' chrome and
  // rollback — Sirius never shows a state Trello does not hold (FR-4.7).
  async chooseUrgency(_ctx, cardId, next, current) {
    app.set('urgencyMenu', null);
    if (next === current || app.get(`savingUrgency.${cardId}`)) return;
    patchRow(cardId, { urgency: next });
    app.set(`savingUrgency.${cardId}`, true);
    try {
      await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/urgency`, { urgent: next === 'Urgent' });
    } catch (err) {
      patchRow(cardId, { urgency: current });
      flashBanner(`Urgency write failed — reverted. ${errText(err)}`);
    } finally {
      app.set(`savingUrgency.${cardId}`, false);
    }
  },
  // W3 (BRD-§9-A1): same optimistic-with-rollback shape as urgency; the box
  // is taller — head + THREE options
  openDiffMenu(ctx, cardId) {
    openOverlay(ctx, cardId, { key: 'diffMenu', posKey: 'diffMenuPos', saving: 'savingDifficulty', h: 116, gap: 3 });
  },
  async chooseDifficulty(_ctx, cardId, next, current) {
    app.set('diffMenu', null);
    if (next === current || app.get(`savingDifficulty.${cardId}`)) return;
    patchRow(cardId, { difficulty: next });
    app.set(`savingDifficulty.${cardId}`, true);
    try {
      await api.send('PATCH', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/difficulty`, { difficulty: next });
      await loadAll(); // difficulty re-keys the forecast (difficulty × lane) and the hard-mix numbers
    } catch (err) {
      patchRow(cardId, { difficulty: current });
      flashBanner(`Difficulty write failed — reverted. ${errText(err)}`);
    } finally {
      app.set(`savingDifficulty.${cardId}`, false);
    }
  },
  pipeScrolled(ctx) { updateThumb(ctx.node, 'pipeThumb'); },
  ganttScrolled(ctx) { updateThumb(ctx.node, 'ganttThumb'); },
  /* on the planner a chevron is worth exactly one week column — the timeline
     has a unit and the affordance should speak it; the two data tables have
     none, so they keep the fixed step */
  nudgeScroll(ctx, dir) {
    const el = scrollerOf(ctx.node);
    if (!el) return;
    el.scrollLeft += dir * (ctx.node.closest('.gwrap') ? WEEK_PX : NUDGE_PX);
    updateThumb(el, thumbKeyOf(ctx.node));
  },
  trackJump(ctx) {
    const el = scrollerOf(ctx.node);
    if (!el) return;
    const rect = ctx.node.getBoundingClientRect();
    const frac = (ctx.event.clientX - rect.left) / rect.width;
    el.scrollLeft = Math.max(0, frac * el.scrollWidth - el.clientWidth / 2);
    updateThumb(el, thumbKeyOf(ctx.node));
  },
  /* ---- Admin tab (FR-10): allow-listing from a screen ---- */
  adminDismiss() { app.set('adminError', ''); },
  async adminAdd() {
    const f = app.get('adminForm');
    const projectIds = Object.keys(f.projectIds || {}).filter((k) => f.projectIds[k]);
    const payload = { email: (f.email || '').trim(), projectIds };
    if ((f.name || '').trim()) payload.name = f.name.trim();
    try {
      await api.send('POST', '/api/admin/users', payload);
      app.set({ adminForm: { email: '', name: '', projectIds: {} }, adminError: '' });
      await loadAdmin();
    } catch (err) {
      app.set('adminError', errText(err));
    }
  },
  async adminToggleActive(_ctx, id, current) {
    try {
      await api.send('PATCH', `/api/admin/users/${id}`, { active: !current });
      await loadAdmin();
    } catch (err) {
      app.set('adminError', errText(err));
    }
  },
  /* owl #23 — capacity lock. The server audits both directions and refuses a
     no-op silently, so this only has to re-read. When the toggled project is
     the ACTIVE one, loadAll re-seats `capacity` in the same click, so the
     planner slider shows its new lock state without a reload. */
  async adminSetCapacityLock(_ctx, id, locked) {
    try {
      await api.send('PATCH', `/api/admin/projects/${id}/capacity-lock`, { locked });
      await loadAdmin();
      if (id === app.get('activeProjectId')) await loadAll();
    } catch (err) {
      app.set('adminError', errText(err));
    }
  },
  adminEdit(_ctx, id) {
    const u = app.get('adminUsers').find((x) => x.id === id);
    const sel = {};
    (u.projectIds || []).forEach((p) => { sel[p] = true; });
    app.set({ adminEditing: id, adminEditSel: sel });
  },
  adminCancelEdit() { app.set('adminEditing', null); },
  async adminSaveEdit(_ctx, id) {
    const sel = app.get('adminEditSel') || {};
    try {
      await api.send('PUT', `/api/admin/users/${id}/memberships`, { projectIds: Object.keys(sel).filter((k) => sel[k]) });
      app.set('adminEditing', null);
      await loadAdmin();
    } catch (err) {
      app.set('adminError', errText(err));
    }
  },

  /* ---- due-date popover (node 415:54979, write registry W2) ----
     Commit-on-Apply: clicking a day only stages it. The popover opens on the
     value the CELL shows (BR-9 precedence — Trello due first, else the sheet)
     and remembers it as dueBaseline, so Apply on an untouched popover writes
     nothing — including the case where the shown date came from the sheet. */
  openDuePopover(ctx, cardId) {
    const row = app.get('rows').find((r) => r.cardId === cardId);
    const current = (row && row.deadline) || null;
    openOverlay(ctx, cardId, {
      key: 'duePopover', posKey: 'duePopPos', saving: 'savingDeadline',
      h: DUE_POP_H, gap: 4, clampW: DUE_POP_W, // clamped both ways — the box stays fully on screen
      extra: { dueStaged: current, dueBaseline: current, dueMonth: monthOf(current || manilaToday()) },
    });
  },
  /* ---- incomplete-card popover (owl #36, node 537:69135) ----
     Read-only: it explains what Trello is missing and links out. Same placer,
     same dismissers, same focus return as every other overlay — the only thing
     it brings of its own is its box size. */
  openWarnPop(ctx, cardId) {
    openOverlay(ctx, cardId, { key: 'warnPop', posKey: 'warnPopPos', h: WARN_POP_H, gap: 4, clampW: WARN_POP_W });
    // the height is one list-item per missing field, each wrapping — measure
    // the rendered box and place it again, exactly as the Requests select does
    const m = { key: 'warnPop', posKey: 'warnPopPos', sel: '.warnpop' };
    if (!placeMeasured(ctx.node, cardId, m)) requestAnimationFrame(() => placeMeasured(ctx.node, cardId, m));
  },
  duePick(_ctx, iso) { app.set('dueStaged', iso); }, // stages only — Apply writes
  dueNav(_ctx, dir) { app.set('dueMonth', monthShiftYm(app.get('dueMonth'), dir)); },
  // shortcuts are Manila-relative (invariant 11) and move the visible month
  // so the staged day is always in view
  dueShortcut(_ctx, which) {
    const today = manilaToday();
    const iso = which === 'week' ? isoAddDays(today, 7) : which === 'monday' ? isoNextMonday(today) : today;
    app.set({ dueStaged: iso, dueMonth: monthOf(iso) });
  },
  async dueApply(_ctx, cardId) {
    const staged = app.get('dueStaged') || null;
    const baseline = app.get('dueBaseline') || null;
    app.set('duePopover', null);
    if (staged === baseline) return; // nothing staged — no call, no audit
    await writeDeadline(cardId, staged);
  },
  async dueClear(_ctx, cardId) {
    app.set('duePopover', null);
    await writeDeadline(cardId, null); // confirm-free; the sheet deadline (if any) takes over
  },

  weekShiftView(_ctx, dir) { app.set('weekStart', mondayShift(app.get('weekStart'), dir)); },
  /* the slider reads its own node rather than a two-way binding: 'input' is
     the live drag (value + descriptor only, no call) and 'change' is the
     release, which is the ONE event that writes. Keyboard arrows fire both,
     so they commit too. */
  capSlide(ctx) { app.set('capDraft', Number(ctx.node.value)); },
  async capCommit(ctx) { await writeCapacity(Number(ctx.node.value)); },
  /* the drag flag is what keeps the drop reachable: `.gbar`'s segments are the
     grab area, so the pointer starts ON one, and a solid segment would be the
     hit-test winner for every dragover on a short horizontal move — a path with
     no dragover handler, hence no preventDefault, hence a refused drop. It is a
     class toggle only (no geometry, no text), so the drag image the browser
     snapshots at dragstart is unaffected. dragend always fires, drop or cancel,
     and moveRows clears it a second time for the case where a re-render eats
     the source node first. */
  dragRow(ctx, cardId) {
    ctx.event.dataTransfer.setData('text/plain', cardId);
    ctx.event.dataTransfer.effectAllowed = 'move';
    app.set('ganttDragging', true);
  },
  dragEnd() { app.set('ganttDragging', false); },
  dragOver(ctx) { ctx.event.preventDefault(); },
  async dropOnWeek(ctx, weekKey) {
    ctx.event.preventDefault();
    await moveRows(ctx.event.dataTransfer.getData('text/plain'), weekKey);
  },
  /* the Unscheduled block's bar is the one unslot target — the sprint bars
     take the same handlers and refuse the drop, so the markup has one path
     (the pattern dayDragOver already uses for holidays) */
  dragOverBlock(ctx, kind) {
    if (kind === 'unscheduled') ctx.event.preventDefault();
  },
  async dropBlock(ctx, kind) {
    if (kind !== 'unscheduled') return;
    ctx.event.preventDefault();
    await moveRows(ctx.event.dataTransfer.getData('text/plain'), null);
  },
  async rowKey(ctx, cardId) {
    const key = ctx.event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    ctx.event.preventDefault();
    const row = app.get('schedRows').find((r) => r.cardId === cardId);
    if (!row) return;
    /* the keyboard path says what the drag path says. /replot skips pinned
       rows server-side (FR-5.9), so without this an arrow key on a pinned row
       is a round trip that changes nothing and reports nothing — the same
       silent no-op that made pinned rows non-draggable (contract §3.8). A
       multi-select still goes through: /replot applies the unpinned members. */
    const sel = app.get('selected');
    const inMulti = Object.keys(sel).filter((id) => sel[id]).length > 1 && sel[cardId];
    if (row.pinned && !inMulti) {
      flashBanner('Pinned — unpin to move.');
      return;
    }
    const from = row.slottedWeek || app.get('weekStart');
    await moveRows(cardId, mondayShift(from, key === 'ArrowRight' ? 1 : -1));
  },
  async togglePin(_ctx, cardId, pinned) {
    await api.send('PATCH', patchUrl(cardId), { pinned: !pinned });
    await loadAll();
  },
  async duplicateRow(_ctx, cardId) {
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/duplicate`);
    await loadAll();
  },
  /* owl #27's Calendar Remove — unslot. It is the SAME audited path a drop on
     the Unscheduled block header takes (`moveRows(id, null)` → POST /replot →
     one `schedule.replot` audit row with `after.slotted_week = null`), not a
     new endpoint and not a new audit action. The pinned guard is belt and
     braces: the button is already `disabled` (JP's ruling B — pins stay fully
     frozen), and /replot would skip the row server-side anyway. */
  async unslotRow(_ctx, cardId) {
    const row = app.get('schedRows').find((r) => r.cardId === cardId);
    if (!row) return;
    if (row.pinned) {
      flashBanner('Pinned — unpin to move.');
      return;
    }
    // a row with no slotted week is already off the schedule: /replot would
    // still audit the no-op, and a non-change must not reach the audit log
    if (!row.slottedWeek) return;
    await moveRows(cardId, null);
  },
  async editNote(_ctx, cardId, current) {
    const note = window.prompt('Status override note (empty to clear — reverts to the Trello status):', current || '');
    if (note === null) return;
    await api.send('PATCH', patchUrl(cardId), { status_note: note || null });
    await loadAll();
  },
  async runSuggest() {
    const res = await api.send('POST', `/api/projects/${app.get('activeProjectId')}/suggest`, {
      from: app.get('weekStart'),
      weeks: WEEK_COUNT,
    });
    // the whole SuggestResult is the state; every count in the bar is a
    // computed over it, so there is no second number to keep in step
    app.set('suggest', res);
  },
  clearSuggest() { app.set('suggest', null); },
  async acceptSuggest() {
    const s = app.get('suggest');
    if (!s) return;
    /* see the suggestOffWeeks note — the button is already disabled in this
       state; this is the second lock, because a persisted non-Monday week
       corrupts the slot silently and is not recoverable from the UI */
    if (app.get('suggestOffWeeks').length) {
      flashBanner(`Suggestion not applied — ${app.get('suggestOffWeeksText')}. Accepting would corrupt the slotted weeks.`);
      return;
    }
    if (app.get('suggestProposed') === 0) return; // R-e: nothing to apply, and no empty /replot
    const moves = Object.entries(s.plan).map(([cardId, week]) => ({ cardId, week }));
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/replot`, { moves });
    app.set('suggest', null);
    await loadAll();
  },
  /* owl #24 — collapse is PRESENTATION only: plannerGroups, the block header's
     meta/count and the capacity footer all keep reading every row, so a hidden
     row still counts against capacity (the footer is data, not visibility). */
  toggleBlock(_ctx, id) {
    app.set(`collapsedBlocks.${id}`, !app.get(`collapsedBlocks.${id}`));
    requestAnimationFrame(refreshThumbs); // the sheet just changed height
  },
  /* owl #24 — collapsing the pane narrows --gleft, so the sheet's scrollWidth
     moves with it; without the refresh the timeline thumb keeps the old ratio
     and lies about how much timeline is off-screen. */
  toggleLeftPane() {
    app.set('leftCollapsed', !app.get('leftCollapsed'));
    requestAnimationFrame(refreshThumbs);
  },

  /* ---- sprints modal (owls #28–#30) ----
     Every edit lands in `sprintDraft` and NOTHING is written per row: Save PUTs
     the whole list once (a full replace the route audits as one
     `sprints.replace`), and Cancel discards simply by not saving — openSprints
     re-copies from `sprints` on the next open. */
  openSprints() {
    const stored = app.get('sprints');
    app.set('sprintDraft', stored.map((s) => ({ ...s })));
    /* the dirty baseline (#37): a fresh copy of the three fields a save PUTs,
       mapped off `stored` so it can never be a reference the draft edits reach.
       Same shape saveSprints sends, so `sprintDirty` compares exactly what
       would be persisted and nothing else. */
    app.set('sprintBaseline', stored.map((s) => ({ name: s.name, start: s.start, end: s.end })));
    app.set({ sprintModal: true, sprintError: '', sprintDeleteConfirm: null });
  },
  closeSprints() { app.set({ sprintModal: false, sprintDeleteConfirm: null }); },
  /* a new sprint starts the Monday AFTER the last one ends and runs to that
     week's Friday — so the first thing the user sees is a valid whole week that
     neither overlaps nor gaps, rather than a zero-length sprint on today */
  addSprint() {
    const draft = app.get('sprintDraft');
    const lastEnd = draft.reduce((a, s) => (s && s.end && s.end > a ? s.end : a), '');
    const start = lastEnd ? mondayShift(mondayIso(lastEnd), 1) : mondayIso(todayIso());
    app.push('sprintDraft', { name: `Sprint ${draft.length + 1}`, start, end: fridayIso(start) });
    app.set({ sprintDeleteConfirm: null, sprintError: '' });
  },
  /* R-f-2 — snap on PICK, never reject: START to the Monday of the week the
     user chose, END to that week's Friday. Bound to `change`, not `input`:
     some engines fire `input` per keystroke and would rewrite a half-typed
     year. `ctx.node.value` is read rather than the model so the snap is applied
     to what the picker actually committed. */
  snapSprintStart(ctx, idx) {
    const v = ctx.node.value;
    app.set(`sprintDraft.${idx}.start`, v ? mondayIso(v) : v);
  },
  snapSprintEnd(ctx, idx) {
    const v = ctx.node.value;
    app.set(`sprintDraft.${idx}.end`, v ? fridayIso(v) : v);
  },
  /* Miles's ruling (#30): a sprint covering slotted deliverables warns with the
     COUNT before it goes. The count is read off the rows already loaded — the
     same `slottedWeek ∈ [start, end]` test that derives membership — so it is
     the real number, not an estimate. Zero covered rows removes it outright. */
  removeSprint(_ctx, idx) {
    const s = app.get('sprintDraft')[idx];
    if (!s) return;
    const covered = app.get('schedRows').filter(
      (r) => r.slottedWeek && s.start && s.end && r.slottedWeek >= s.start && r.slottedWeek <= s.end,
    ).length;
    if (!covered) {
      app.splice('sprintDraft', idx, 1);
      app.set('sprintDeleteConfirm', null);
      return;
    }
    app.set('sprintDeleteConfirm', { idx, name: s.name, count: covered });
  },
  cancelRemoveSprint() { app.set('sprintDeleteConfirm', null); },
  confirmRemoveSprint() {
    const c = app.get('sprintDeleteConfirm');
    if (!c) return;
    app.splice('sprintDraft', c.idx, 1);
    app.set('sprintDeleteConfirm', null);
  },
  async saveSprints() {
    // the button is already disabled in these states; this is the second lock,
    // because the server rejects all three and would write nothing either way
    if (app.get('sprintDupNames').length || app.get('sprintOverlaps').length || app.get('sprintBlankNames').length) return;
    // and nothing to commit is not a save: a no-op PUT would write a
    // `sprints.replace` audit row for a non-change, which invariant 10 does not
    // ask for — it logs changes, not attempts (the batch-4 Calendar Remove fix)
    if (!app.get('sprintDirty')) return;
    try {
      await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/sprints`, {
        sprints: app.get('sprintDraft').map((s) => ({ name: s.name, start: s.start, end: s.end })),
      });
      app.set({ sprintModal: false, sprintDeleteConfirm: null });
      await loadAll();
    } catch (err) {
      const issues = err.detail && err.detail.issues;
      app.set('sprintError', issues && issues.length ? issues[0].text : err.message);
    }
  },

  monthShift(_ctx, dir) {
    app.set('monthOffset', app.get('monthOffset') + dir);
    app.set('expandedWeek', null);
    computeDeadlines();
  },

  /* ---- daily plotting (FR-12): one week open at a time ---- */
  toggleWeek(_ctx, key) {
    app.set('expandedWeek', app.get('expandedWeek') === key ? null : key);
  },
  dragMilestone(ctx, cardId, phase) {
    ctx.event.dataTransfer.setData('text/plain', `${cardId}|${phase}`);
    ctx.event.dataTransfer.effectAllowed = 'move';
  },
  dayDragOver(ctx, holiday) {
    if (!holiday) ctx.event.preventDefault(); // holidays reject drops (FR-12.4)
  },
  async dropOnDay(ctx, day, holiday) {
    ctx.event.preventDefault();
    if (holiday) return;
    const [cardId, phase] = ctx.event.dataTransfer.getData('text/plain').split('|');
    if (cardId && phase) await writeDayPlan(cardId, phase, day);
  },
  async milestoneKey(ctx, cardId, phase, currentDay, weekKey) {
    const key = ctx.event.key;
    if (key === 'Backspace' || key === 'Delete') {
      ctx.event.preventDefault();
      await writeDayPlan(cardId, phase, null);
      return;
    }
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    ctx.event.preventDefault();
    const cols = app.get('dayCols')(weekKey);
    const open = cols.filter((c) => !c.holiday).map((c) => c.day); // arrows skip holidays
    const at = open.indexOf(currentDay);
    const next = open[(at < 0 ? 0 : at) + (key === 'ArrowRight' ? 1 : -1)];
    if (next) await writeDayPlan(cardId, phase, next);
  },
  async clearDayPlan(_ctx, cardId, phase) { await writeDayPlan(cardId, phase, null); },
  async ackConflict(_ctx, key) {
    const reason = window.prompt('Acknowledge this conflict — optional reason (it goes to the audit log):', '');
    if (reason === null) return;
    try {
      await api.send('POST', `/api/projects/${app.get('activeProjectId')}/conflicts/acknowledge`, { conflict_key: key, ...(reason ? { reason } : {}) });
      const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
      app.set('deadlinePayload', res);
      computeDeadlines();
    } catch (err) {
      flashBanner(`Acknowledge failed — the conflict stays visible. ${errText(err)}`);
    }
  },
  async restoreConflict(_ctx, key) {
    try {
      await api.send('POST', `/api/projects/${app.get('activeProjectId')}/conflicts/restore`, { conflict_key: key });
      const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
      app.set('deadlinePayload', res);
      computeDeadlines();
    } catch (err) {
      flashBanner(`Restore failed. ${errText(err)}`);
    }
  },

  async setConfidence(ctx, cardId) {
    await api.send('PATCH', patchUrl(cardId), { confidence: ctx.node.value });
    await loadAll();
  },
  async setSla(ctx, cardId, field) {
    const v = ctx.node.value === '' ? null : Number(ctx.node.value);
    await api.send('PATCH', patchUrl(cardId), { [field]: v });
    await loadAll();
  },
});

function patchUrl(cardId) {
  return `/api/projects/${app.get('activeProjectId')}/deliverables/${cardId}/planning`;
}

/* One week's total, moved by one row (§3.6). The base is the CURRENT view of
   the week — the optimistic override if this drop already touched it, else the
   server's — because a delta applied to zero would erase every row the server
   counted. `null` means the week has no rows left and renders a dash. */
function bumpWeek(map, weekKey, row, sign) {
  if (!weekKey) return;
  const seen = Object.prototype.hasOwnProperty.call(map, weekKey);
  const cur = (seen ? map[weekKey] : app.get('perWeek')[weekKey]) || { cards: 0, rows: 0, hard: 0 };
  const rows = cur.rows + sign;
  if (rows <= 0) {
    map[weekKey] = null;
    return;
  }
  const hard = cur.hard + (row.difficulty === 'Hard' ? sign : 0);
  const cards = Math.max(0, Math.round((cur.cards + sign * (row.weight || 1)) * 1000) / 1000);
  const hardShare = hard / rows;
  const cap = app.get('capacity');
  const ideal = app.get('capHardIdeal');
  const ceiling = app.get('capHardCeiling');
  map[weekKey] = {
    cards,
    rows,
    hard,
    hardShare,
    over: cards > cap.weekly,
    hardOver: hardShare > ceiling,
    hardWarn: hardShare > ideal && hardShare <= ceiling,
  };
}

/* ---- the arrival affordance (owl #31) ----

   The row does NOT travel with the pointer any more: the bar moves, the write
   lands, and the row's relocation into another block is an OUTCOME of
   re-deriving `schedRows` — so something has to say where it went. A brief
   background pulse plus a scroll into view is that something.

   `loadAll()` re-renders the whole block, so the moved row's node identity
   changes and any reference captured before the reload is stale. The class
   therefore lives in Ractive state (it survives the re-render by construction)
   and the DOM is re-queried by cardId inside a frame, the way refreshThumbs
   already does. `block: 'nearest'` cannot disturb the timeline's own
   horizontal scroller: a row is wider than the scrollport, so both its edges
   are outside it and the inline axis is left alone. */
const ARRIVAL_MS = 1200;
let arrivalTimer = null;
function announceArrival(cardIds) {
  if (!cardIds.length) return;
  const map = {};
  for (const id of cardIds) map[id] = true;
  app.set('arrived', map);
  if (arrivalTimer) clearTimeout(arrivalTimer);
  arrivalTimer = setTimeout(() => {
    arrivalTimer = null;
    app.set('arrived', {});
  }, ARRIVAL_MS);
  requestAnimationFrame(() => {
    const node = [...document.querySelectorAll('.gantt .growr')].find((n) => cardIds.includes(n.dataset.card));
    if (!node) return;
    const box = node.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) node.scrollIntoView({ block: 'nearest' });
  });
}

/* BR-8: a multi-select drag applies the grabbed row's interval to every
   selected row. A null target unslots instead — /replot takes `week: null`,
   and an interval has no meaning when there is no week to land on. */
async function moveRows(grabbedId, targetWeek) {
  /* the drop has landed, so the bar overlay can stop hiding from hit-testing
     even if dragend has not fired yet (a re-render that eats the source node
     would swallow it, and a stuck flag means no bar can be grabbed again).
     Harmless on the keyboard path, where the flag was never set. */
  app.set('ganttDragging', false);
  const selected = app.get('selected');
  const rows = app.get('schedRows');
  const grabbed = rows.find((r) => r.cardId === grabbedId);
  if (!grabbed) return;
  const ids = Object.keys(selected).filter((id) => selected[id]);
  const group = ids.length > 1 && ids.includes(grabbedId) ? ids : [grabbedId];
  const from = grabbed.slottedWeek || targetWeek;
  const deltaWeeks = targetWeek === null ? 0 : Math.round((Date.parse(targetWeek) - Date.parse(from)) / (7 * 864e5));
  const moves = group.map((cardId) => {
    const row = rows.find((r) => r.cardId === cardId);
    if (targetWeek === null) return { cardId, week: null };
    return { cardId, week: row.slottedWeek ? mondayShift(row.slottedWeek, deltaWeeks) : targetWeek };
  });
  /* the footer moves with the rows, before the round trip. Pinned rows are
     skipped server-side (FR-5.9), so counting them here would show a total the
     server will never agree with. */
  const local = { ...app.get('perWeekLocal') };
  for (const mv of moves) {
    const row = rows.find((r) => r.cardId === mv.cardId);
    if (!row || row.pinned) continue;
    bumpWeek(local, row.slottedWeek, row, -1);
    bumpWeek(local, mv.week, row, 1);
  }
  app.set('perWeekLocal', local);
  try {
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/replot`, { moves });
  } catch (err) {
    app.set('perWeekLocal', {}); // the optimistic totals are void — fall back to the server's
    flashBanner(`Replot failed — the plan is unchanged. ${errText(err)}`);
    return;
  }
  await loadAll();
  /* pinned members are skipped server-side, so they never arrive anywhere and
     must not be pulsed as though they had */
  announceArrival(moves.map((mv) => mv.cardId).filter((id) => {
    const row = rows.find((r) => r.cardId === id);
    return row && !row.pinned;
  }));
}

/* ---------- URL routing — the impure half (phase 13h, JP 2026-08-15) ---------- */

/* A COUNTER, not a boolean, so nesting is safe. While it is above zero the
   observer below writes no history entry — which is how boot, popstate and
   normalization avoid pushing states the user never navigated to. Only
   SYNCHRONOUS app.set calls belong inside: Ractive fires observers inside set,
   so an await in `fn` would leak the suppression. */
let routerDepth = 0;
function withRouterSuppressed(fn) {
  routerDepth++;
  try {
    fn();
  } finally {
    routerDepth--;
  }
}

function currentUrl() {
  return window.location.pathname + window.location.search + window.location.hash;
}

/* The canonical URL for the state on screen, or null when no project has
   resolved yet (nothing to name — leave the URL untouched). search/hash ride
   along so a future query parameter survives normalization. */
function currentHref() {
  const project = (app.get('projects') || []).find((p) => p._id === app.get('activeProjectId'));
  if (!project) return null;
  return buildPath(project.code, app.get('activeTab'), BASE) + window.location.search + window.location.hash;
}

/* Rewrite the address bar IN PLACE. Used on boot (so `/rt-test`, `/schedules`
   and `/` grow into their canonical form without a history entry) and after a
   popstate (so a junk entry is corrected where it sits, and pressing back again
   does not walk into it a second time). */
function normalizeUrl() {
  const href = currentHref();
  if (href && href !== currentUrl()) window.history.replaceState(null, '', href);
}

/* One observer over both keypaths: the action is identical for each, and the
   href guard collapses the double fire if a single set changes both. */
app.observe('activeTab activeProjectId', () => {
  if (routerDepth > 0) return;
  const href = currentHref();
  if (!href || href === currentUrl()) return;
  window.history.pushState(null, '', href);
}, { init: false });

/* Back / forward: restore the entry WITHOUT pushing a new one. */
window.addEventListener('popstate', () => {
  const route = parseRoute(window.location.pathname, BASE);
  const projects = app.get('projects') || [];
  const target = (route.project && projects.find((p) => p.code === route.project)) || projects[0] || null;
  const tabs = app.get('tabs') || [];
  const tab = tabs.some((t) => t.id === route.tab) ? route.tab : ROUTE_DEFAULT_TAB;

  const projectChanged = !!target && target._id !== app.get('activeProjectId');
  withRouterSuppressed(() => {
    if (projectChanged) app.set('activeProjectId', target._id);
    if (tab !== app.get('activeTab')) selectTab(tab);
  });
  normalizeUrl();
  if (projectChanged) resetForProjectSwitch(); // async on purpose — same as the switcher
});

loadShell().catch((err) => app.set('banner', `Boot failed: ${err.message}`));
