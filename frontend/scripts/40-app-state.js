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
    mcDeliverables: {}, // owl #52: MC number → how many deliverables share it
    unattachedWork: { cards: 0, mcNumbers: [] }, // owl #61: work with no MC row
    /* owl #62 — Pipeline sort + filter. `pipeSort` is a key from PIPE_SORTS or
       null for the default order (single-select: choosing replaces, never
       stacks). `pipeFilters` is one array per axis (multi-select). Both are
       VIEW state, so they live here and nowhere on the server. */
    pipeSort: null,
    pipeFilters: PIPE_FILTERS_EMPTY(),
    pipeSortMenu: null,
    pipeFilterMenu: null,
    pipeSortMenuPos: { left: 0, top: 0 },
    pipeFilterMenuPos: { left: 0, top: 0 },
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
    warnPop: null, // cardId whose incomplete-card hover card is open (node 537:69135)
    // `up` is the FLIP decision, and the markup needs it: the squared corner
    // and the hover bridge both sit on the gap side of the card (R-warn-p)
    warnPopPos: { left: 0, top: 0, up: false },
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
    /* true from dragstart to dragend. The ONLY thing it does is make the
       DEADLINE TICK transparent to hit-testing for the duration
       (`.gantt.gdragging .gdl`): the tick paints over the bar and carries no
       dragover handler, so left solid it refuses the drop across its own
       column. It no longer touches the bar or its segments — those are the drag
       source, and a source that is not hit-testable makes Chrome cancel the
       drag in the same tick (T153). View state, never persisted. */
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
    /* owl #64 — one badge per rule broken, for the summary banner. */
    deadlineRuleTotals: [],
    deadlineAlerts: [],
    /* the legend renders FROM the rule table, so the copy on screen and the
       words the engine detects cannot drift apart (owl #64) */
    DL_RULES,
    /* the tab's own search box; the frame gives Deadlines a Search Field and
       NOT the filter/sort pair Pipeline gained (R-dl-h) */
    dlQ: '',
    modelProvenance: null,
    modelReview: null,
    fmt: (iso) => fmtDate(iso),
    fmtLong: fmtLongIso,
    /* the Deadlines card's two dates, which mean different things and are
       formatted differently on purpose (owl #64) */
    dlDate: fmtDayMonth,
    dlDeadline: fmtDeadlineShort,
    dlRuleWord,
    fmtInstant,
    monthShort,
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
      const unattached = this.get('unattachedWork') || { cards: 0, mcNumbers: [] };
      return {
        main: rows.length,
        work,
        /* owl #61. `work` above ALREADY counts these — the server keys work
           cards by MC and orphans get a key like any other — so the strip has
           always reported a total that included cards no row could ever show.
           Naming them turns a quiet inaccuracy into a stated one. */
        unattached: unattached.cards,
        unattachedMcs: unattached.mcNumbers.length,
        // OPEN WORK is the AGGREGATE incomplete-card signal now that the
        // table banner is gone (owl #36) — the same corrections the per-row
        // warnings render one at a time
        open: this.get('corrections').length,
        urgent: rows.filter((r) => r.urgency === 'Urgent').length,
      };
    },
    /* Search alone — the set every filter axis counts against, and the base
       both `pipelineRows` and `pipeFacets` build on so they cannot disagree
       about what "the table" is. */
    pipeSearched() {
      // annotation 17:2057 — the searchable text is precomputed per row in
      // loadAll (r.blob); trimmed so the filter and highlighter agree
      const q = (this.get('searchQ') || '').trim().toLowerCase();
      const rows = this.get('rows');
      if (!q) return rows;
      return rows.filter((r) => (r.blob || '').includes(q));
    },
    /* owl #62: search, filter and sort all apply together (AND). Sort runs over
       the whole filtered set, never the visible page — the client holds every
       row, so sorting a page would order the page and not the table. `slice()`
       because Array.sort mutates and the source array is Ractive's own. */
    pipelineRows() {
      const sel = this.get('pipeFilters') || PIPE_FILTERS_EMPTY();
      const rows = this.get('pipeSearched').filter((r) => pipeMatches(r, sel, null));
      const key = this.get('pipeSort');
      const sort = key ? PIPE_SORTS.find((s) => s.key === key) : PIPE_SORT_DEFAULT;
      return sort ? rows.slice().sort((a, b) => pipeCompare(sort, a, b)) : rows;
    },
    /* The facet counts live in `pipeFacetList` beside the axes and the matcher
       they depend on (10-constants), so the panel and the table cannot disagree
       about what a value means. Rule and reasoning are documented there. */
    pipeFacets() {
      return pipeFacetList(this.get('pipeSearched'), this.get('pipeFilters') || PIPE_FILTERS_EMPTY());
    },
    /** How many filter VALUES are applied, across every axis — the accessible name's number. */
    pipeFilterCount() {
      const sel = this.get('pipeFilters') || PIPE_FILTERS_EMPTY();
      return PIPE_FILTERS.reduce((n, f) => n + (sel[f.key] || []).length, 0);
    },
    /** `Group: Item` for the active sort button (node 592:56966); '' when default. */
    pipeSortLabelText() {
      return pipeSortLabel(this.get('pipeSort'));
    },
    /* The eight sorts as their three frame groups, DERIVED from PIPE_SORTS in
       its own order — never a second hand-written list, or the popup and the
       comparator could disagree about what exists. */
    PIPE_SORT_GROUPS() {
      const out = [];
      for (const s of PIPE_SORTS) {
        const last = out[out.length - 1];
        if (last && last.group === s.group) last.items.push(s);
        else out.push({ group: s.group, items: [s] });
      }
      return out;
    },
    /* ---- Deadlines (owl #64, node 630:51389) ----------------------------
       Search filters the CARDS by MC number or deliverable name, and a week the
       search empties is DROPPED rather than left standing empty — the frame's
       own instruction. A week that is empty because nothing is due is a
       different state entirely and keeps its place: the frame draws it a card
       that says so.

       The week's own summary — due, urgent, load against capacity — is NOT
       recomputed against the search. It describes the week, and a capacity line
       that moved when you typed would be reporting the search, not the load. */
    dlWeeks() {
      const q = (this.get('dlQ') || '').trim().toLowerCase();
      const weeks = this.get('deadlineWeeks');
      if (!q) return weeks;
      const out = [];
      for (const w of weeks) {
        const items = w.items.filter(
          (m) => (m.displayId || '').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q),
        );
        if (items.length) out.push({ ...w, items });
      }
      return out;
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
    /* BLOCKING. Clearing a date input leaves `''` (snapSprintStart), and NO
       other validator could see it: `sprintOrder` filters a row with no start
       or end straight out, so overlaps and gaps never met it, and blank names
       only read the name. Save stayed live, the PUT failed the route's
       DATE_ONLY shape check, and the modal printed the raw envelope code at
       the user — the same unreadable failure blank names were fixed to avoid
       (owl #37 item 2). The route needs no change: it already refuses the
       shape, and now the modal never asks it to.

       Copy follows the blank-name sentence's shape; PROVISIONAL, flagged to
       Miles. One banner per ROW, naming the row by whichever identity it has
       left. */
    sprintMissingDates() {
      const draft = this.get('sprintDraft');
      const out = [];
      draft.forEach((s, i) => {
        const start = (s && s.start) || '';
        const end = (s && s.end) || '';
        if (start && end) return;
        const named = String((s && s.name) || '').trim();
        const which = !start && !end ? 'start and end dates' : !start ? 'start date' : 'end date';
        out.push({
          after: i,
          variant: 'err',
          title: 'Sprint dates required',
          text: `${named ? `"${named}"` : 'This sprint'} has no ${which}. Every sprint needs a start and an end to save.`,
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
    /* The row banners in READING ORDER, assembled ONCE. The template used to
       concatenate the lists inside the per-row loop, so the arrays were rebuilt
       for every draft row, and each new error class meant editing the markup.
       Outward from the row: this row's own problems first (no name, no dates),
       then the pair it overlaps, then the advisory gap. */
    sprintRowBanners() {
      return this.get('sprintBlankNames')
        .concat(this.get('sprintMissingDates'), this.get('sprintOverlaps'), this.get('sprintGaps'));
    },
    /* "Save would be refused" — ONE name for the whole class. It was spelled
       out three times (the disabled binding, the tooltip condition and the
       handler's own lock), so every new error class was three edits that had to
       agree and any one missed silently unlocked Save. Gaps are absent on
       purpose: they are legal (BR-5) and advisory. */
    sprintBlocked() {
      return this.get('sprintDupNames').length > 0
        || this.get('sprintBlankNames').length > 0
        || this.get('sprintMissingDates').length > 0
        || this.get('sprintOverlaps').length > 0;
    },
    sprintDirty() {
      const draft = this.get('sprintDraft') || [];
      const base = this.get('sprintBaseline') || [];
      if (draft.length !== base.length) return true;
      return draft.some((s, i) => {
        // the SAME projection the baseline and the PUT use, so a fourth
        // persisted field is compared without a second edit here
        const a = sprintPayload(s || {});
        const b = base[i] || {};
        return Object.keys(a).some((k) => a[k] !== b[k]);
      });
    },
  },
});

