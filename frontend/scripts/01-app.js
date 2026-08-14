/* Sirius frontend — one Ractive instance, ARES conventions.
   Hard-mix constants mirror lib/planner.constants (HARD_MIX); load is BR-6c
   card-equivalents (row.weight from the server). */

const HARD_IDEAL = 0.083;
const HARD_CEILING = 0.129;
const WEEK_COUNT = 8;
/* Requests tab (build-spec v1.2 §3): the stat segments are a single-select
   filter on the DERIVED status (FR-11.3), the table pages ten rows at a
   time, and every filter runs client-side over one fetch. */
const STATUS_FILED = 'In Pipeline';
const STATUS_TO_FILE = 'To File';
const STATUS_CLARIFY = 'For Clarification';
/* Segment key → row predicate (owl #14, 2026-08-14). TO FILE is CROSS-CUTTING:
   it is every unfiled row, flagged ones included, so REQUESTS = IN PIPELINE +
   TO FILE and FOR CLARIFICATION is a SUBSET of TO FILE. That is why a segment
   is a predicate and not string equality against one status value. */
const REQUEST_SEGMENTS = {
  filed: (r) => r.status === STATUS_FILED,
  filing: (r) => r.status !== STATUS_FILED,
  clarification: (r) => r.status === STATUS_CLARIFY,
};
/* A frost note is ONE freeform text (owl #15). Rows written before that ruling
   can still hold their text in clarify_reason with an empty remark, so every
   place that shows, searches or edits a note resolves it through this ONE
   helper — no call site has to remember the legacy fallback. */
const noteText = (n) => (n && (n.remark || n.clarify_reason)) || '';
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
/* 0-11 for anything monthShort recognises, -1 otherwise — the one place
   month order is decided, for both the option list and the row sort. */
const monthIndex = (raw) => MONTHS_SHORT.indexOf(monthShort(raw));

/* ONE table for the four Requests selects — the Ractive state key IS the def
   key, so nothing has to translate between them. Everything that would
   otherwise enumerate the four (initial data, the filter predicate, the
   option lists, the observer that resets the pager, the project-switch
   reset) is driven from here: a fifth filter is one row, not five edits that
   silently drift out of step. Options are always derived from the LOADED
   rows, never hardcoded, so a sheet that gains a type needs no code change. */
const alphaSort = (a, b) => String(a).localeCompare(String(b));
// months sort by CALENDAR order; a name the sheet invents falls to the end
const monthRank = (m) => {
  const i = monthIndex(m);
  return i < 0 ? MONTHS_SHORT.length : i;
};
/* `canon` normalises the raw cell into the value the option list SHOWS and the
   comparison tests, so an encoding change in the sheet cannot desynchronise
   the two. Identity everywhere the raw value is already canonical. */
const identity = (v) => v;
const REQ_FILTERS = [
  { key: 'reqYear', label: 'Year', pick: (r) => r.year, canon: identity, sort: (a, b) => a - b },
  { key: 'reqMonth', label: 'Month', pick: (r) => r.month, canon: monthShort, sort: (a, b) => monthRank(a) - monthRank(b) || alphaSort(a, b) },
  { key: 'reqType', label: 'Type', pick: (r) => r.asset_type, canon: identity, sort: alphaSort },
  { key: 'reqRequestor', label: 'Requestor', pick: (r) => r.requestor, canon: identity, sort: alphaSort },
];
const reqFilterKeys = REQ_FILTERS.map((f) => f.key);
const reqFiltersCleared = () => Object.fromEntries(reqFilterKeys.map((k) => [k, '']));

/* ---- Requests column sorting (owl #18) ----------------------------------
   ONE table drives the header cells AND the comparators: a column is sortable
   exactly when it names a sort key, so Brief and Frost Notes are unsortable by
   having none, and the template never enumerates columns twice. Widths live in
   25-requests.css keyed on the same class. */
const REQ_COLS = [
  { cls: 'col-ryear', label: 'Year', sort: 'year' },
  { cls: 'col-rmonth', label: 'Month', sort: 'month' },
  { cls: 'col-rmc', label: 'MC #', sort: 'mc' },
  { cls: 'col-rname', label: 'Deliverable', sort: 'name' },
  { cls: 'col-rtype', label: 'Type', sort: 'type' },
  { cls: 'col-rcase', label: 'Use Case', sort: 'case' },
  { cls: 'col-rwho', label: 'Requestor', sort: 'who' },
  { cls: 'col-rdue', label: 'Deadline', sort: 'due' },
  { cls: 'col-rbrief', label: 'Brief', sort: '' },
  { cls: 'col-rstatus', label: 'Status', sort: 'status' },
  { cls: 'col-rnote', label: 'Frost Notes', sort: '' },
];

/* A missing value is not "small" — it is UNRANKED, so it lands last whichever
   direction the arrow points. Every comparator below routes its nulls here
   rather than inventing a sentinel that would flip with the direction. */
const unranked = (v) => v === null || v === undefined || v === '';
function cmpNullsLast(av, bv, cmp) {
  const an = unranked(av);
  const bn = unranked(bv);
  if (an || bn) return an && bn ? 0 : an ? 1 : -1;
  return cmp(av, bv);
}
const numCmp = (a, b) => a - b;
const ciCmp = (a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase());
/* MC # sorts NATURALLY — on the number inside the label, so MC-9 precedes
   MC-10 where a string compare would not. mc_number is 'MC-825'; a human
   display_id ('MC-655.3') keeps its fractional part rather than truncating. */
const mcRank = (r) => {
  const m = String(r.mc_number || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const REQ_SORT_COLS = {
  year: { val: (r) => r.year, cmp: numCmp },
  month: { val: (r) => (monthIndex(r.month) < 0 ? null : monthIndex(r.month)), cmp: numCmp },
  mc: { val: mcRank, cmp: numCmp },
  name: { val: (r) => r.name, cmp: ciCmp },
  type: { val: (r) => r.asset_type, cmp: ciCmp },
  case: { val: (r) => r.use_case, cmp: ciCmp },
  who: { val: (r) => r.requestor, cmp: ciCmp },
  // ISO 'YYYY-MM-DD' compares chronologically as a plain string
  due: { val: (r) => r.deadline, cmp: (a, b) => String(a).localeCompare(String(b)) },
  status: { val: (r) => r.status, cmp: ciCmp },
};
/* Final tiebreak for EVERY sort, so equal keys never reshuffle between renders
   — sheet_row is the intake sheet's own order and is unique per project. */
const sheetRowAsc = (a, b) => (a.sheet_row || 0) - (b.sheet_row || 0);
/* Default (and the 'clear' third click): newest-filed first — year desc, then
   calendar month desc, then the later sheet row. Rows the sheet left undated
   sit at the bottom instead of leading the list. */
const reqDefaultOrder = (a, b) =>
  cmpNullsLast(a.year, b.year, (x, y) => y - x) ||
  cmpNullsLast(REQ_SORT_COLS.month.val(a), REQ_SORT_COLS.month.val(b), (x, y) => y - x) ||
  (b.sheet_row || 0) - (a.sheet_row || 0);
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
    corrections: [],
    showAllCorrections: false,
    sprints: [],
    capacity: { weekly: 0 },
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
    dowNames: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    pipeThumb: { needed: false, left: 0, width: 100 },
    iconSprite: ICON_SPRITE,
    weekStart: mondayIso(todayIso()),
    suggest: null,
    suggestCount: 0,
    sprintModal: false,
    sprintDraft: [],
    sprintError: '',
    hardIdeal: HARD_IDEAL,
    hardCeiling: HARD_CEILING,
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
        // OPEN WORK mirrors the incomplete panel (annotation 31:2740)
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
    visibleCorrections() {
      const c = this.get('corrections');
      return this.get('showAllCorrections') ? c : c.slice(0, 5);
    },
    /* ---- Requests §3: segment + search + four selects, AND-combined, all
       client-side over the single unfiltered payload. The counts stay on
       requestCounts, which the server derives from the same unfiltered set. */
    reqFiltered() {
      const seg = REQUEST_SEGMENTS[this.get('requestFilter')] || null;
      const q = (this.get('reqQ') || '').trim().toLowerCase();
      // '' = All. Every other value came out of the option list built from
      // these same rows THROUGH THE SAME canon, so comparing string forms is
      // the same test as comparing the raw values — it covers the numeric year
      // and it is what makes a Month picked as 'Aug' match a row storing
      // 'August' or 8.
      const picks = REQ_FILTERS.map((f) => ({ pick: f.pick, canon: f.canon, want: this.get(f.key) })).filter(
        (p) => p.want !== '',
      );
      return this.get('requests').filter(
        (r) =>
          (!seg || seg(r)) &&
          (!q || (r.blob || '').includes(q)) &&
          picks.every((p) => String(p.canon(p.pick(r))) === String(p.want)),
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
      // labels literal-uppercase like the Pipeline metrics — one shared recipe
      return [
        { key: 'all', cls: 'all', label: 'REQUESTS', value: c.requests },
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
        // canonicalised BEFORE the dedupe, so 'August', 'Aug' and 8 collapse
        // into the one option the comparison will match
        options: [...new Set(rows.map((r) => f.canon(f.pick(r))))].filter((v) => !unranked(v)).sort(f.sort),
      }));
    },
    weekCols() {
      const from = this.get('weekStart');
      return Array.from({ length: WEEK_COUNT }, (_, i) => ({ key: mondayShift(from, i) }));
    },
    rangeLabel() {
      const from = this.get('weekStart');
      const to = mondayShift(from, WEEK_COUNT - 1);
      return `${fmtDate(from)} – ${fmtDate(mondayShift(to, 1))}, ${new Date(from + 'T00:00:00').getFullYear()}`;
    },
    schedRows() {
      const sprints = this.get('sprints');
      return this.get('rows')
        .filter((r) => r.status !== 'done')
        .map((r) => {
          const s = r.slottedWeek ? sprints.find((sp) => r.slottedWeek >= sp.start && r.slottedWeek <= sp.end) : null;
          return { ...r, sprintName: r.slottedWeek ? (s ? s.name : 'Outside any sprint') : 'Unscheduled' };
        });
    },
    schedGroups() {
      const rows = this.get('schedRows');
      const sprints = this.get('sprints');
      const groups = [];
      for (const s of sprints) {
        const inSprint = rows.filter((r) => r.sprintName === s.name);
        if (inSprint.length) groups.push({ name: s.name, meta: `${fmtDate(s.start)} – ${fmtDate(s.end)}`, rows: inSprint });
      }
      const outside = rows.filter((r) => r.sprintName === 'Outside any sprint');
      if (outside.length) groups.push({ name: 'Outside any sprint', meta: 'weeks no sprint covers', rows: outside });
      const unsched = rows.filter((r) => r.sprintName === 'Unscheduled');
      if (unsched.length) groups.push({ name: 'Unscheduled', meta: 'not yet plotted', rows: unsched });
      return groups;
    },
    forecastRows() {
      return this.get('rows').filter((r) => r.status !== 'done');
    },
  },
});

/* ---- gantt helpers: percentage positions across the visible week range ---- */

function rangeDays() {
  return WEEK_COUNT * 7;
}
function pctOf(dateIso) {
  const start = Date.parse(app.get('weekStart') + 'T00:00:00');
  const days = (Date.parse(dateIso + 'T00:00:00') - start) / 864e5;
  return (days / rangeDays()) * 100;
}
const clamp = (x) => Math.max(0, Math.min(100, x));

app.set('ganttBars', (row) => {
  if (!row.slottedWeek || !row.forecast) return [];
  const f = row.forecast;
  const bars = [];
  const seg = (fromIso, toIso, cls, title) => {
    const left = clamp(pctOf(fromIso));
    const right = clamp(pctOf(toIso) + 100 / rangeDays());
    if (right <= 0 || left >= 100 || right <= left) return;
    bars.push({ cls, left: left.toFixed(2), width: (right - left).toFixed(2), title });
  };
  seg(row.slottedWeek, f.sketchDelivery, 'sketch', `sketch → ${fmtDate(f.sketchDelivery)}`);
  seg(f.sketchDelivery, f.sketchApproved, 'review', `review → ${fmtDate(f.sketchApproved)}`);
  seg(f.sketchApproved, f.renderDelivery, f.late ? 'render red' : 'render', `render → ${fmtDate(f.renderDelivery)}`);
  return bars;
});
app.set('deadlineTick', (row) => {
  if (!row.deadline) return null;
  const p = pctOf(row.deadline);
  return p >= 0 && p <= 100 ? p.toFixed(2) : null;
});
app.set('ghostLeft', (row) => {
  const s = app.get('suggest');
  if (!s || !s.plan[row.cardId]) return 0;
  return clamp(pctOf(s.plan[row.cardId])).toFixed(2);
});
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
  return app.get('urgencyMenu') || app.get('diffMenu') || app.get('duePopover') || app.get('reqMenu');
}
function closeMenus() {
  app.set({ urgencyMenu: null, diffMenu: null, duePopover: null, reqMenu: null });
}
document.addEventListener('click', (e) => {
  if (anyMenuOpen() && !e.target.closest('.ubadge-wrap, .selectmenu, .duewrap, .duepop, .selwrap')) closeMenus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && anyMenuOpen()) closeMenus();
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

/* One opener for all four overlays. They differ only in state keys, box
   height and gap, and whether the box is big enough to need clamping: the two
   row select menus are fixed-length lists, the due popover is a 354×420
   dialog that must stay fully on screen. Mutual exclusion lives here —
   opening any one nulls the others. */
function openOverlay(ctx, cardId, opts) {
  // one write in flight per card (invariant 8); the read-only Requests
  // selects have no write to guard, so they pass no `saving` key
  if (opts.saving && app.get(`${opts.saving}.${cardId}`)) return;
  if (app.get(opts.key) === cardId) {
    app.set(opts.key, null);
    return;
  }
  app.set({
    urgencyMenu: null,
    diffMenu: null,
    duePopover: null,
    reqMenu: null,
    ...opts.extra,
    [opts.key]: cardId,
    [opts.posKey]: placeBox(ctx.node.getBoundingClientRect(), opts),
  });
}

/* The Requests select is the one overlay whose height is DATA-derived (1..N
   options, capped by CSS), so the constant can only ever be its cap: place it
   a second time against the box that actually rendered. Without this a short
   menu flips up to a spot 150px above its trigger, and a capped one opens 24px
   past the viewport edge. Returns false only if the element is not in the DOM
   yet, which is the caller's cue to retry on the next frame. */
function placeReqMenu(trigger, key) {
  if (app.get('reqMenu') !== key) return true; // the click closed it — nothing to place
  const el = document.querySelector('.selectmenu.reqmenu');
  if (!el) return false;
  app.set('reqMenuPos', placeBox(trigger.getBoundingClientRect(), { h: el.offsetHeight, gap: 4, clampW: el.offsetWidth }));
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
const thumbKeyOf = (node) => (node.closest('.reqwrap') ? 'reqThumb' : 'pipeThumb');
const scrollerOf = (node) => {
  const wrap = node.closest('.pscrollwrap');
  return wrap ? wrap.querySelector('.pscroll') : document.querySelector('.pscroll');
};
// only one tab is mounted at a time, but the sweep is key-driven either way
function refreshThumbs() {
  document.querySelectorAll('.pscroll').forEach((el) => updateThumb(el, thumbKeyOf(el)));
}
window.addEventListener('resize', refreshThumbs);

app.set('footClass', (weekKey) => {
  const rows = app.get('schedRows').filter((r) => r.slottedWeek === weekKey);
  const cap = app.get('capacity').weekly || 1;
  const hard = rows.filter((r) => r.difficulty === 'Hard').length;
  const share = rows.length ? hard / rows.length : 0;
  if (rowLoad(rows) > cap || share > HARD_CEILING) return 'red';
  if (share > HARD_IDEAL) return 'amber';
  return '';
});
app.set('footLabel', (weekKey) => {
  const rows = app.get('schedRows').filter((r) => r.slottedWeek === weekKey);
  const cap = app.get('capacity').weekly || 0;
  const hard = rows.filter((r) => r.difficulty === 'Hard').length;
  const share = rows.length ? hard / rows.length : 0;
  const fmtLoad = app.get('fmtLoad');
  return rows.length ? `${fmtLoad(rowLoad(rows))}/${cap} · ${hard}H · ${Math.round(share * 1000) / 10}%` : '';
});

/* ---------- data loading ---------- */

async function loadShell() {
  const [me, projects] = await Promise.all([api.get('/api/me'), api.get('/api/projects')]);
  const name = me.user.name || me.user.email || '';
  const tabs = app.get('tabs').filter((t) => t.id !== 'admin');
  if (me.user.admin) tabs.push({ id: 'admin', label: 'Admin', icon: 'tabAdmin' });
  app.set({
    projects: projects.projects,
    userName: name,
    userInitial: (name[0] || '?').toUpperCase(),
    isAdmin: !!me.user.admin,
    tabs,
  });
  if (!app.get('activeProjectId') && projects.projects.length) {
    app.set('activeProjectId', projects.projects[0]._id);
  }
  await loadAll();
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
    app.set({
      rows: pipeline.rows,
      writesEnabled: pipeline.writesEnabled !== false,
      workCardsByMc: pipeline.workCardsByMc,
      corrections: pipeline.corrections,
      sprints: pipeline.sprints,
      capacity: pipeline.capacity,
      sync: pipeline.sync,
      syncLabel: pipeline.sync
        ? pipeline.sync.ok
          ? `Last Synced ${new Date(pipeline.sync.at).toLocaleTimeString()}${pipeline.sync.push_at && Date.now() - new Date(pipeline.sync.push_at).getTime() < 30 * 60 * 1000 ? ' · push live' : ''}`
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

/* §3 search: one blob per request row, computed once per load — MC#, name,
   use case, requestor, type, brief and the frost note's ONE resolved text, so
   the filter and the highlighter agree on what counts as a match. */
function blobRequests(rows) {
  rows.forEach((r) => {
    r.blob = `${r.mc_number || ''} ${r.name || ''} ${r.use_case || ''} ${r.requestor || ''} ${r.asset_type || ''} ${r.brief || ''} ${noteText(r.note)}`.toLowerCase();
  });
  return rows;
}

/* Any filter OR sort change starts the pager over — page 4 of the old order is
   not page 4 of the new one. One observer owns that rule, so the sort handler
   does not repeat it. A reload only clamps the pager, so saving a note does not
   yank the reader back to page 1. */
app.observe(`reqQ requestFilter reqSortKey reqSortDir ${reqFilterKeys.join(' ')}`, () => app.set('reqPage', 1), {
  init: false,
});
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
  if (id === 'pipeline' || id === 'requests') {
    // returning to the tab remounts .pscroll at scrollLeft 0 — recompute the
    // slider so the affordance is never stale (review finding 5)
    requestAnimationFrame(refreshThumbs);
  }
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
    // Requests view state is per-project. A Type/Requestor value from the old
    // project may not exist in the new one, leaving an unclearable empty
    // table. The sort resets with them so the new project opens on its own
    // newest-filed default rather than inheriting a column the reader chose
    // while looking at other data — and an open note editor is keyed on
    // mc_number ALONE, which is
    // unique per project and NOT globally (invariant 3), so leaving it open
    // re-attaches project A's draft to project B's same-numbered row and
    // Submit would write it there.
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
    });
    await loadAll();
  },
  signOut() { api.send('POST', '/auth/logout').then(() => window.location.reload()); },
  toggleCorrections() { app.toggle('showAllCorrections'); },
  /* ---- Requests §3: stat segments, selects, pager — no round-trip ---- */
  setRequestFilter(_ctx, f) { applyRequestFilter(f); },
  openReqMenu(ctx, key) {
    openOverlay(ctx, key, { key: 'reqMenu', posKey: 'reqMenuPos', h: REQ_MENU_H, gap: 4, clampW: REQ_MENU_W });
    if (!placeReqMenu(ctx.node, key)) requestAnimationFrame(() => placeReqMenu(ctx.node, key));
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
    // a legacy clarify_reason opens IN the single box, so Submit rewrites it
    // as the remark instead of dropping it
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
    const prev = { note: row.note, status: row.status };
    // clarify_reason is legacy-only — a new write always nulls it
    const note = remark === null && !d.clarify ? null : { remark, clarify: d.clarify, clarify_reason: null };
    // optimistic: status is derived — mirror the server's derivation (FR-11.3)
    app.set(`requests.${idx}.note`, note);
    if (row.status !== STATUS_FILED) {
      app.set(`requests.${idx}.status`, d.clarify ? STATUS_CLARIFY : STATUS_TO_FILE);
    }
    app.set({ noteEditing: null, noteError: '' });
    // ONLY the write is inside the rollback: once the PUT resolves the server
    // holds the note and has audited it (invariant 10), so a failed refresh is
    // staleness, never a reason to revert a row the database already has.
    try {
      await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/requests/${mc}/note`, {
        remark, clarify: d.clarify,
      });
    } catch (err) {
      app.set(`requests.${idx}.note`, prev.note);
      app.set(`requests.${idx}.status`, prev.status);
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
  nudgeScroll(ctx, dir) {
    const el = scrollerOf(ctx.node);
    if (!el) return;
    el.scrollLeft += dir * 240;
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
  dragRow(ctx, cardId) {
    ctx.event.dataTransfer.setData('text/plain', cardId);
    ctx.event.dataTransfer.effectAllowed = 'move';
  },
  dragOver(ctx) { ctx.event.preventDefault(); },
  async dropOnWeek(ctx, weekKey) {
    ctx.event.preventDefault();
    await moveRows(ctx.event.dataTransfer.getData('text/plain'), weekKey);
  },
  async rowKey(ctx, cardId) {
    const key = ctx.event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    ctx.event.preventDefault();
    const row = app.get('schedRows').find((r) => r.cardId === cardId);
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
    app.set({ suggest: res, suggestCount: Object.keys(res.plan).length });
  },
  clearSuggest() { app.set({ suggest: null, suggestCount: 0 }); },
  async acceptSuggest() {
    const s = app.get('suggest');
    if (!s) return;
    const moves = Object.entries(s.plan).map(([cardId, week]) => ({ cardId, week }));
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/replot`, { moves });
    app.set({ suggest: null, suggestCount: 0 });
    await loadAll();
  },

  openSprints() {
    app.set('sprintDraft', app.get('sprints').map((s) => ({ ...s })));
    app.set({ sprintModal: true, sprintError: '' });
  },
  closeSprints() { app.set('sprintModal', false); },
  addSprint() { app.push('sprintDraft', { name: `Sprint ${app.get('sprintDraft').length + 1}`, start: todayIso(), end: todayIso() }); },
  removeSprint(_ctx, idx) { app.splice('sprintDraft', idx, 1); },
  async saveSprints() {
    try {
      await api.send('PUT', `/api/projects/${app.get('activeProjectId')}/sprints`, {
        sprints: app.get('sprintDraft').map((s) => ({ name: s.name, start: s.start, end: s.end })),
      });
      app.set('sprintModal', false);
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
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/conflicts/acknowledge`, { conflict_key: key, ...(reason ? { reason } : {}) });
    const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
    app.set('deadlinePayload', res);
    computeDeadlines();
  },
  async restoreConflict(_ctx, key) {
    await api.send('POST', `/api/projects/${app.get('activeProjectId')}/conflicts/restore`, { conflict_key: key });
    const res = await api.get(`/api/projects/${app.get('activeProjectId')}/deadlines`);
    app.set('deadlinePayload', res);
    computeDeadlines();
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

/* BR-8: a multi-select drag applies the grabbed row's interval to every selected row. */
async function moveRows(grabbedId, targetWeek) {
  const selected = app.get('selected');
  const rows = app.get('schedRows');
  const grabbed = rows.find((r) => r.cardId === grabbedId);
  if (!grabbed) return;
  const ids = Object.keys(selected).filter((id) => selected[id]);
  const group = ids.length > 1 && ids.includes(grabbedId) ? ids : [grabbedId];
  const from = grabbed.slottedWeek || targetWeek;
  const deltaWeeks = Math.round((Date.parse(targetWeek) - Date.parse(from)) / (7 * 864e5));
  const moves = group.map((cardId) => {
    const row = rows.find((r) => r.cardId === cardId);
    return { cardId, week: row.slottedWeek ? mondayShift(row.slottedWeek, deltaWeeks) : targetWeek };
  });
  await api.send('POST', `/api/projects/${app.get('activeProjectId')}/replot`, { moves });
  await loadAll();
}

loadShell().catch((err) => app.set('banner', `Boot failed: ${err.message}`));
