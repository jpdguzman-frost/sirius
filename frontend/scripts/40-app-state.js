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
    unattachedWork: { cards: 0, mcNumbers: [] }, // owl #61: work with no MC row
    /* owl #62 — Pipeline sort + filter. `pipeSort` is a key from PIPE_SORTS or
       null for the default order (single-select: choosing replaces, never
       stacks). `pipeFilters` is one array per axis (multi-select). Both are
       VIEW state, so they live here and nowhere on the server. */
    pipeSort: null,
    pipeFilters: PIPE_FILTERS_EMPTY(),
    pipeSortMenu: null,
    pipeFilterMenu: null,
    /* which chip's panel is open on hover — an overlay key like the rest */
    chipPop: null,
    /* the chip panel hangs off the chip's right edge instead, when its left
       edge would put it off screen (the chips row wraps) */
    chipPopFlip: false,
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
    searchQ: '',
    /* The four urgency/difficulty keys are all keyed on a WORK CARD id since
       owl #78 §1 — the controls left the main row, the state keys did not
       change shape. Annotations 169:26074 / 169:26364 drew these on the main
       row; #78 supersedes that placement, not the chrome they describe. */
    urgencyMenu: null, // work cardId whose urgency select is open
    urgencyMenuPos: { left: 0, top: 0 }, // fixed-position anchor — escapes the scroll clip
    savingUrgency: {}, // per-card in-flight write chrome
    diffMenu: null, // work cardId whose difficulty select is open (W3 — BRD-§9-A1)
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
    weekStart: mondayIso(manilaToday()),
    /* ---- Sprint Schedules (owls #72/#73, frame 731:98513) ----
       The tab body's unit is the WORK CARD: `sprintItems` is the server's
       {rows, addable} payload stored verbatim in loadAll (rows are
       position-sorted per sprint; addable = MC → its incomplete work cards).
       Everything below it is VIEW state for placement and the Add row,
       never persisted. */
    sprintItems: { rows: [], addable: {} },
    /* the checkbox — a row HIGHLIGHT whose semantics are still with product
       (owl jp→miles #60); it gates nothing in placement */
    sprintSel: null,
    /* the hover pair (node 731:100277): `plotRow` is whose track the pointer
       is on — a committed row's id, or the literal 'add' for the draft row —
       and `plotWeek` the week column under it, where the cell tints and the
       violet + renders. Both null whenever the pointer is elsewhere. */
    plotRow: null,
    plotWeek: null,
    /* the one pending Add row: { sprintId, mc, cardId, saving } while open.
       Nothing in it is written until Add Item posts (#72 §3). */
    addRow: null,
    /* which Add dropdown is open ('mc' | 'card') — an overlay key like the
       rest, registered in OVERLAY_KEYS with the `.gdd` shield. */
    addMenu: null,
    addMenuFlip: false, // finding 11: upward hits the sheet top → open downward
    /* owl #24: block id → true = collapsed. VIEW state only, no persistence —
       keyed on sprintGroups' `id` (a sprint's own id, never the sprint NAME:
       names are free text), and cleared on a project switch because sprint
       ids are per-project. */
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
    /* Miles's ruling (#30): removing a sprint that holds work cards warns
       with the count first (#72 re-based the count on sprint_items rows).
       `{ idx, name, count }` while the confirm is open, null otherwise.
       Draft-only — nothing persists until Save. */
    sprintDeleteConfirm: null,
    /* the ACTIVE working-day calendar, straight off the deliverables payload
       (getHolidays() — ARES-canonical). Only the sprints modal's gap warning
       reads it; an empty array simply means weekends are the only skip. */
    holidays: [],
    ganttThumb: { needed: false, left: 0, width: 100 },
    /* per-week capacity totals off the payload, keyed by slotted-week Monday.
       UNREAD since the footer went overlap-based over sprintItems (#72) —
       kept only because the payload still carries it and this build touches
       no server file; it leaves with the server field. */
    perWeek: {},
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
    pipeCols: PIPE_COLS,
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
    fmt: (iso) => fmtDate(iso),
    fmtLong: fmtLongIso,
    fmtLongIso, // the schedules cells call it by its own name (PLAN 2026-08-28)
    /* the Deadlines card's two dates, which mean different things and are
       formatted differently on purpose (owl #64) */
    dlDate: fmtDayMonth,
    dlDeadline: fmtDeadlineShort,
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
    /* The acknowledged strip's label, read out of the SAME rule table the
       legend and the badges render from. It used to be a ternary chain whose
       else-branch labelled any unknown rule 'Over capacity' — so a fourth rule
       would have shipped mislabelled, on the one screen where the wording is
       supposed to match the engine exactly. */
    ruleLabel: (r) => dlRule(r).chip,
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
        /* owl #78 §1: urgency lives on the WORK CARD now, so the tile counts
           urgent WORK cards — the same population `work` above totals, orphans
           included. It counted main rows before, which was the only number on
           this screen still reading a main card's Urgent label after the
           column stopped showing one.

           WHICH population the tile means has never been ruled — the frame
           gives it no definition beyond the word — so project-wide is the
           reading that matches what the column shows. Asked of Miles; this is
           the one line that changes if he wants attached cards only. */
        urgent: Object.values(byMc).reduce((a, l) => a + l.filter((w) => w.urgency === 'Urgent').length, 0),
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
      const sel = this.get('pipeFilters');
      const rows = this.get('pipeSearched').filter((r) => pipeMatches(r, sel, null));
      const key = this.get('pipeSort');
      const sort = key ? PIPE_SORTS.find((s) => s.key === key) : PIPE_SORT_DEFAULT;
      return sort ? pipeSortRows(rows, sort) : rows;
    },
    /* The facet counts live in `pipeFacetList` beside the axes and the matcher
       they depend on (10-constants), so the panel and the table cannot disagree
       about what a value means. Rule and reasoning are documented there. */
    pipeFacets() {
      return pipeFacetList(this.get('pipeSearched'), this.get('pipeFilters'));
    },
    /* The filter indicator's chips — one per filtered axis. Derived where the
       axes live (10-constants) so the chip and the panel cannot disagree about
       what an axis is called or which values are on. */
    pipeChips() {
      /* The chips themselves cost a walk of the SELECTION and nothing else.
         Values are joined on only for the ONE chip whose panel is open, from
         the same facets the main panel renders — so the two cannot disagree
         about a count or a tick, and a closed row costs no recount.

         Reading `pipeFacets` unconditionally put the whole facet pass back on
         the search-keystroke path: this computed is always live (the row's
         `{{#if}}` binds it), so every keystroke recounted every axis even with
         no panel open and, in the common case, no chips at all. */
      const chips = pipeChipList(this.get('pipeFilters'));
      const open = this.get('chipPop');
      if (!open) return chips;
      const facet = this.get('pipeFacets').find((f) => f.key === open);
      return chips.map((c) => (c.key === open && facet ? { ...c, values: facet.values, scroll: facet.scroll } : c));
    },
    /** How many filter VALUES are applied, across every axis — the accessible name's number. */
    pipeFilterCount() {
      const sel = this.get('pipeFilters');
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
    /* WHICH ROW THE TASK LIST HANGS UNDER, per MC — derived from the rows as
       RENDERED, not from the order the server sent.

       It used to be stamped once in `loadAll` while walking the server's order
       (`firstOfMc`). Filtering broke it: filter to a Requestor who owns the
       SECOND deliverable under MC-825 and the stamped row is hidden, so the
       visible row shows no chevron and, even with the group expanded, no task
       rows — the MC's work cards become unreachable. Sorting broke it more
       quietly, parking the task list under whichever row happened to carry the
       stamp rather than under the first one on screen.

       mc_number is NOT unique (invariant 3), which is why this is needed at
       all: rendered under every sibling the list would repeat up to 99 times. */
    pipeMcAnchor() {
      const first = {};
      for (const r of this.get('pipelineRows')) {
        if (r.mcNumber && !(r.mcNumber in first)) first[r.mcNumber] = r.cardId;
      }
      return first;
    },
    /* owl #76, frame 748:18444 — the table's no-results verdict: the filtered
       row set is empty AND the reader caused it, with a non-blank search term
       or a live filter. "A filter is live" is read off `pipeChips` — the SAME
       derivation the indicator row and its Clear all button render from — so
       this verdict and the chips can never disagree about whether something
       is filtering. Fresh-empty (a project with no rows, nothing typed,
       nothing ticked) is deliberately FALSE: the message prescribes adjusting
       the term or clearing filters, remedies that reader would not have, so
       that path keeps the plain table. */
    pipeNoResults() {
      if (this.get('pipelineRows').length) return false;
      return (this.get('searchQ') || '').trim() !== '' || this.get('pipeChips').length > 0;
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
    /* ---- Sprint Schedules groups (owls #72/#73, frame 731:98513) ----
       ONE group per sprint, INCLUDING empty sprints — the add affordance
       needs a home, and an empty sprint that vanished would leave nowhere to
       put its first card. Rows are the server's sprint_items filtered by
       sprintId, in the server's own order (position-sorted there; re-sorting
       here would fight the persisted order). NO 'outside' and NO
       'unscheduled' group: absence is the design (#72 §2) — a work card
       either belongs to a sprint or it is not on this screen.

       `meta` and `count` stay two strings because the frame gives them two
       tones (sprintHeader: '#duration' #64748b, '#items' #94a3b8). */
    sprintGroups() {
      const items = this.get('sprintItems').rows;
      return this.get('sprints').map((s) => {
        const rows = items.filter((r) => r.sprintId === s.id);
        return {
          id: s.id,
          name: s.name,
          meta: `${fmtDate(s.start)} - ${fmtDate(s.end)}`,
          count: itemCount(rows.length),
          rows,
        };
      });
    },
    /* the Add row's MC dropdown — the addable map's keys, alphabetical. The
       map itself is server-shaped (#73): MC → its incomplete work cards. */
    addMcOptions() {
      return Object.keys(this.get('sprintItems').addable).sort();
    },
    /* the Work Card dropdown for the picked MC — server-sorted alphabetically
       (#73's provisional rule; DO NOT re-sort client-side). Empty until an MC
       is picked, which is the same state that keeps the control inert
       (openAddMenu refuses 'card' without one). */
    addCardOptions() {
      const add = this.get('addRow');
      if (!add || !add.mc) return [];
      return this.get('sprintItems').addable[add.mc] || [];
    },
    /* the footer caption beside WORK CARDS / WEEK — the committed capacity
       plus its band against the reference weeks, through the same
       capacityBand recipe the slider's descriptor uses so the two cannot
       disagree about what a number means. capacity.weekly, not capDraft: the
       footer states the committed number; the live thumb has capBand. */
    footCaption() {
      const c = this.get('capacity');
      const band = capacityBand(c.weekly, c);
      return `Capacity: ${c.weekly}${band ? ` (${band})` : ''}`;
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

