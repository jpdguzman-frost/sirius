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
    /* WHICH CHIP, when the axis alone cannot say. A Requests chip is one VALUE
       (PLAN.md D7), so an axis with two chips has two of them and the key above
       names both; this holds the one the pointer is actually on. Pipeline's
       chips are one per axis and never set it, and it is not an overlay key of
       its own — `chipPop` alone still says whether anything is open. */
    chipPopValue: null,
    /* the chip panel hangs off the chip's right edge instead, when its left
       edge would put it off screen (the chips row wraps) */
    chipPopFlip: false,
    sprints: [],
    capacity: { weekly: 0 },
    /* the slider's LIVE position (build-spec §5.4). It tracks the thumb on
       every input event so the value and the descriptor move while dragging;
       capacity.weekly is the committed number and only changes on release. */
    capDraft: 0,
    savingCapacity: false,
    expanded: {},
    /* owl #78 §4/§5 (PLAN.md B10): mcNumber → true = collapsed BY HAND while
       auto-open is on. `expanded` above is the reader's own map and stays the
       whole truth whenever no work-card axis and no derived sort is live;
       while one is, every group with tasks opens and this map holds the
       exceptions. Reset on every pipeFilters/pipeSort change (observer in
       80-loaders.js) and on a project switch, like `expanded`. */
    pipeShut: {},
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
    dowNames: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    pipeThumb: { needed: false, left: 0, width: 100 },
    iconSprite: ICON_SPRITE,
    weekStart: mondayIso(manilaToday()),
    /* ---- Sprint Schedules (owls #72/#73/#77, frame 731:98513) ----
       The tab body's unit is the WORK CARD: `sprintItems` is the server's
       {rows, addable} payload stored verbatim in loadAll (rows are
       position-sorted per sprint; addable = MC → its incomplete work cards).
       Everything below it is VIEW state for placement and the search-based
       add, never persisted. */
    sprintItems: { rows: [], addable: {} },
    /* the checkbox — a row HIGHLIGHT whose semantics are still with product
       (owl jp→miles #60); it gates nothing in placement */
    sprintSel: null,
    /* the WEEK hover (block nine, JP 2026-09-10 — owl #88 reversed block
       seven's day grain): `hoverRow` is the committed row whose track the
       pointer is on, and `hoverWeek` the INDEX into plannerWeeks of the week
       column under it — the cell the template tints. `hoverWeek` is null
       whenever the pointer is elsewhere, and also whenever the week under it
       is one this row may not be placed in at all (every day of it outside
       the sprint, or every day past the deadline): one key carries both "no
       hover" and "no offer", so the tint never advertises a write the server
       would refuse outright. The DAY inside the week is never chosen here —
       a click sends the week and the server lands the row on its first
       working day (#89 §2); the day belongs to the Design Lead, on Deadlines
       (#88). Only committed rows have a live track: the search row and its
       results draw nothing (owl #77 §0, node 840:31630; PLAN.md B5). */
    hoverRow: null,
    hoverWeek: null,
    /* the Deadlines day drag (block nine, owls #88/#89; PLAN.md "Client
       state"): null at rest, else the one live gesture — `rowId` the sprint
       item under the pointer (or under the arrow keys), `fromDay` the start
       the server holds, `day` the column the pointer currently names or null
       when it names none, `refused` when that day is one the row may not
       have (outside its assigned week, outside its sprint, past its deadline,
       or no column at all), and `weekKey` the Monday of the ASSIGNED week —
       the bound the whole gesture is judged against (#89 §1: the Design Lead
       rearranges days INSIDE the week the PM assigned, never across its
       edge). Cleared on release, on cancel and on a refusal, and clearing IS
       the snap-back: the card's column comes from the row's own `startsOn`,
       the value the server still holds. A brief `refused` marker with no
       pointer behind it is the keyboard nudge saying no (dlNudge). */
    dlDrag: null,
    /* owl #90: the cards a sprint re-date just moved to Outside any sprint,
       as the save's response named them — `[{ id, display_id, title,
       starts_on, from_sprint }]` — or null when the last save displaced
       nothing or the notice was dismissed. VIEW state: the rows themselves
       carry `sprintId: null` and render under the outside group on the next
       load; this list is only the notice that says which ones and why. */
    sprintDisplaced: null,
    /* owl #77 §0 (PLAN.md B10): sprintId → the text in that sprint's search
       field, two-way bound. A MAP, not one string: every sprint has its own
       always-visible field and several may hold text at once. Survives a
       reload — the pool is replaced under it and the list re-derives — and
       resets on a project switch, where the sprint ids stop meaning anything. */
    addQ: {},
    /* the sprint whose add (single or Add All) is in flight, else null: THAT
       sprint's Add links go inert for the flight while the others stay live.
       `sprintItemSaving` (90-events.js) still guards placement alongside it. */
    addBusy: null,
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
    /* owl #77 §1–2 — Requests sort + filter, in Pipeline's shape (PLAN D4,
       D12). `reqSort` is a key from REQ_SORTS, or null for the unlisted
       default (Recently requested); `reqFilters` is one array per axis
       (multi-select) and is the ONLY status filter — the tiles read and write
       its `status` slot (D4), so two controls over one field cannot disagree.
       The two panels are overlays (60-overlays.js). */
    reqQ: '',
    reqFilters: REQ_FILTERS_EMPTY(),
    reqSort: null,
    reqSortMenu: null,
    reqFilterMenu: null,
    reqCols: REQ_COLS,
    pipeCols: PIPE_COLS,
    reqPage: 1,
    reqThumb: { needed: false, left: 0, width: 100 },
    /* ---- Deadlines (owls #74/#75; PLAN.md block 3 B3, B7, B15) ----
       ONE view key here and nothing else: `monthOffset` is the navigator's
       distance from the Manila month (B3); its partner `expandedWeek`, the
       one open lane (B7), sits above beside the other per-tab view keys.
       Both reset on a project switch (B15). Everything the tab draws is
       derived from the schedule's own rows by the three computeds below —
       the milestone payload, the conflict and acknowledgement lists, the
       replot list, the month-scoped tallies, the rule table, the search
       query and the per-card formatters all left with the milestone tab
       (B9): a key that nothing renders is a key a reload can leave stale. */
    monthOffset: 0,
    /* Manila's calendar day as STATE, refreshed by every loadAll, so the
       month the tab shows follows the clock across midnight and a project
       switch. Read inside a computed, `manilaToday()` is a clock read Ractive
       cannot see, so the cached value would hold yesterday's month until
       `monthOffset` moved (review finding R1-1). */
    dlToday: manilaToday(),
    fmt: (iso) => fmtDate(iso),
    fmtLong: fmtLongIso,
    fmtLongIso, // the schedules cells call it by its own name (PLAN 2026-08-28)
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
       because Array.sort mutates and the source array is Ractive's own. The
       selection goes into the sort as well as the filter: a derived sort keys
       on the children the work-card axes admit (owl #78 §5; PLAN.md B5). */
    pipelineRows() {
      const sel = this.get('pipeFilters');
      const rows = this.get('pipeSearched').filter((r) => pipeMatches(r, sel, null));
      return pipeSortRows(rows, this.get('pipeSortDef'), sel);
    },
    /** THE ACTIVE SORT, as one derivation: the PIPE_SORTS entry `pipeSort`
        names, or the natural order — for null and for a key the list no
        longer carries alike, so a stale key can never leave the table unordered. */
    pipeSortDef() {
      return PIPE_SORTS.find((s) => s.key === this.get('pipeSort')) || PIPE_SORT_DEFAULT;
    },
    /* The facet counts live in `pipeFacetList` beside the axes and the matcher
       they depend on (12-constants-pipeline.js), so the panel and the table cannot disagree
       about what a value means. Rule and reasoning are documented there. */
    pipeFacets() {
      // `table` is the filter-group partial's dispatch key (PLAN D10): one
      // partial serves both tables and routes a tick by it
      return pipeFacetList(this.get('pipeSearched'), this.get('pipeFilters')).map((f) => ({ table: 'pipe', ...f }));
    },
    /* The filter indicator's chips — one per filtered axis. Derived where the
       axes live (12-constants-pipeline.js) so the chip and the panel cannot disagree about
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
      return chips.map((c) => (c.key === open && facet ? { ...c, table: facet.table, values: facet.values, scroll: facet.scroll } : c));
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
    /* The sorts as their frame groups, DERIVED from PIPE_SORTS in its own
       order — never a second hand-written list, or the popup and the
       comparator could disagree about what exists. Deriving is also why the
       Priority pair left and came back (#78 §5, block 4) with no edit here: a
       group exists exactly while the table produces it. Three today — Dates,
       Priority, Identity — in array order (frame 841:58731). */
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
    /* ---- auto-open (owl #78 §4/§5; PLAN.md B3, B10, B11) -----------------
       A work-card axis filters, and a derived sort orders, by values the
       table shows only INSIDE a group — so the groups open, or the reader is
       looking at a result with nothing on screen to explain it. Four
       questions, one computed each — is a work axis live, should the groups
       open, which are open, which children each draws; the template reads
       pipeOpen and pipeKids, never `expanded` or `workCardsByMc` directly. */
    /** Is any WORK-CARD axis filtering? */
    pipeWorkLive() {
      const sel = this.get('pipeFilters');
      return PIPE_FILTERS.some((f) => !!f.work && (sel[f.key] || []).length > 0);
    },
    /** Should the groups open on their own — a live work-card axis, or a derived sort. */
    pipeAutoOpen() {
      return this.get('pipeWorkLive') || this.get('pipeSortDef').derived === true;
    },
    /* WHICH GROUPS ARE OPEN, per MC, over the rows as rendered. Auto-open on:
       every group with tasks, minus the ones collapsed by hand (`pipeShut`);
       a childless MC never opens — R-exp-c's rule, kept. Auto-open off: the
       reader's own `expanded` map, untouched by anything that happened while
       it was on (B10). */
    pipeOpen() {
      const auto = this.get('pipeAutoOpen');
      const shut = this.get('pipeShut');
      const expanded = this.get('expanded');
      const open = {};
      for (const r of this.get('pipelineRows')) {
        if (!r.mcNumber || r.mcNumber in open) continue;
        open[r.mcNumber] = auto ? !!(r.hasTasks && !shut[r.mcNumber]) : !!expanded[r.mcNumber];
      }
      return open;
    },
    /* WHICH CHILDREN AN OPEN GROUP DRAWS, per MC (B3): under a live work-card
       axis, only the cards every live work-card axis admits — MC-825 has 99,
       and showing all of them to find the two urgent ones defeats the filter.
       With no work-card axis live this is the store's own map, arrays and
       all, so `{{#each}}` has nothing new to diff. It re-derives on the
       optimistic badge write too, because that write lands on a
       `workCardsByMc` keypath (B11). */
    pipeKids() {
      const byMc = this.get('workCardsByMc') || {};
      if (!this.get('pipeWorkLive')) return byMc;
      const sel = this.get('pipeFilters');
      const out = {};
      for (const [mc, kids] of Object.entries(byMc)) out[mc] = kids.filter((w) => pipeWorkMatch(w, sel, null));
      return out;
    },
    /* THE METRIC STRIP, over what the table is showing (build spec v1.4 §4.0;
       owls #91–#93, Miles, 2026-09-10). Four figures, every one of them
       counting task cards — ONE unit, so the four can be read against each
       other — over the MCs the search and the filters left on the table. It
       rescopes with the table because the reader cannot tell which control
       narrowed it, so a project-wide total sitting above a narrowed table
       would read as a contradiction of the rows beneath it rather than as a
       second scope. An empty table keeps the strip and reads zeroes: zero is
       a truthful answer, and a strip that vanished would take the
       explanation away with it.

       WALKED BY MC, ONCE EACH — never per row, and this is the one property
       to keep if any of it is ever rewritten. Every row of an MC holds the
       SAME array object its siblings hold (stamped once in loadAll, not
       copied), so totalling row by row multiplies an MC's cards by however
       many deliverables it carries — ninety-nine of them on the largest. The
       MC number is the identity here for the same reason the anchor above
       needs one: mc_number is not unique (invariant three), so the DISTINCT
       keys on the table are the population, and a row carrying no MC number
       contributes nothing.

       A card in an OPS lane (§7a's excluded state) is dropped BEFORE
       anything is counted, the cross-cutting figure included: ops work is
       not Frost's work, and an urgent ops card is the one way this strip
       could inflate a figure that claims to be Frost's.

       The cross-cutting figure counts the label over those same survivors
       and is never added to the other three — a card carrying it is also in
       one of the three states, never instead of one. The month lanes tally
       the same way (11-constants-deadlines.js).

       Under a live work-card axis only the cards that axis admits are
       counted, through the SAME predicate the open group draws its children
       with just above — a strip counting cards the table is actively hiding
       has stopped describing the table. The consequence is deliberate: the
       three states then describe the filtered work, not the MC's whole load.

       A task card whose MC has no row on the table is reachable from no key
       in this walk, so it falls out of every figure by construction. That is
       intended — §4.0 sends those to ingestion health, not here. */
    pipeTiles() {
      const byMc = this.get('workCardsByMc') || {};
      const sel = this.get('pipeFilters');
      const narrow = this.get('pipeWorkLive');
      const out = { pending: 0, ongoing: 0, done: 0, urgent: 0 };
      const counted = new Set();
      for (const r of this.get('pipelineRows')) {
        // ONCE PER MC, never once per row — see the array-sharing note above
        if (!r.mcNumber || counted.has(r.mcNumber)) continue;
        counted.add(r.mcNumber);
        /* `Object.hasOwn`, not a bare index: an MC number spelled `constructor`
           or `toString` reads a FUNCTION off the prototype, and `for…of` throws
           on it — taking the whole tab down, not one tile. Unreachable while the
           server builds this map on a bare object (it would die first), and the
           same idiom already guards DIFF_RANK. */
        const cards = Object.hasOwn(byMc, r.mcNumber) ? byMc[r.mcNumber] : null;
        for (const w of cards || []) {
          const state = w.status;
          /* An ALLOW-LIST, not a deny-list on `excluded` alone. A state the
             lane mapping does not produce today would otherwise fall past all
             three buckets and still reach the urgent line below — counted in no
             state and inflating the cross-cutting figure, which is precisely the
             invariant this strip rests on ("an urgent card is also counted in
             its state"). `classifyList` is total over the four today, so this
             changes nothing now and holds the day a fifth is added. */
          if (state !== 'pending' && state !== 'ongoing' && state !== 'done') continue; // ops work counts nowhere
          if (narrow && !pipeWorkMatch(w, sel, null)) continue;
          out[state] += 1;
          if (w.urgency === 'Urgent') out.urgent += 1; // cross-cutting, never instead of a state
        }
      }
      return out;
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
    /* ---- Deadlines (owls #74/#75/#78 §2; PLAN.md block 3 B1–B5) ----------
       Three derivations, each ONE step from the last, so the template reads
       plain keys and the recipe suite executes the pure helpers beneath them
       (11-constants-deadlines.js). The rows are the schedule's own — `sprintItems.rows`
       off the one `/deliverables` payload (B1) — so one source feeds both
       tabs, which is what keeps a bar on Sprint Schedules and a card here
       from ever disagreeing about the same work card (drift row forty-five).
       No search, no filter: navigation is the month arrows and scrolling
       (#74 §2). */
    /* THE MONDAYS of the shown month: the MANILA month (invariant 11 — a
       viewer whose calendar date differs from Manila's at the moment they
       look must not open on a different month; the retired tab had the same
       rule) shifted by the navigator, through the same week rule the engine
       keys on. */
    dlMondays() {
      const [y, m] = monthShiftYm(monthOf(this.get('dlToday')), this.get('monthOffset')).split('-').map(Number);
      return dlMonthWeeks(y, m - 1);
    },
    /** The navigator's label (731:100859) — first shown Monday → the month's end. */
    dlRange() {
      return dlRangeLabel(this.get('dlMondays'));
    },
    /* THE LANES: the pure builder over the rows, the Mondays and the
       COMMITTED capacity — `capacity.weekly`, never capDraft: the progress
       line states the number the server holds, as the footer does; the live
       thumb has capBand. A card's day, its counts and its badges are all
       decided in dlBuild, so the template stays a layout. The holiday
       calendar is not read: the frame draws no holiday state, and a calendar
       refresh must not rebuild every lane for a flag nothing renders. */
    dlWeeks() {
      const weeks = dlBuild(this.get('sprintItems.rows'), this.get('dlMondays'), this.get('capacity.weekly'));
      /* THE DRAG'S HANDLES (block nine, owls #88/#89; PLAN.md "Template"):
         the card partial binds `c.rowId` to the day drag and reads
         `c.startsOn` and `c.title` into the card's accessible name. All
         three are stamped here, once per build, rather than computed in the
         template (frontend/CLAUDE.md, performance law): `rowId` is the sprint
         item id the PATCH is addressed to — the same `id` dlBuild already
         carries, named for what the handler does with it; `startsOn` is the
         column's own day, which is the day the card was slotted into by
         construction; `title` is the card's printed label. A collapsed
         lane's `cards` are the same objects as its days', so one pass over
         the days stamps both views. */
      for (const w of weeks) {
        for (const d of w.days) {
          for (const c of d.cards) {
            c.rowId = c.id;
            c.startsOn = d.day;
            c.title = c.label;
          }
        }
      }
      return weeks;
    },
    /* ---- Requests (owl #77 §1–4; PLAN D2, D4, D5, D8, D12) ------------------
       Pipeline's chain over the one unfiltered payload: search → axes → sort →
       page, each computed ONE step from the last, so the facets, the chips,
       the footer and the no-results verdict all read the same set and cannot
       disagree about what "the table" is. The tiles' counts stay on
       requestCounts, which the server derives from the same unfiltered set —
       the tiles never rescope (owl #77 §3). */
    /** Search alone — the base the facets count against and the axes narrow. */
    reqSearched() {
      // the searchable text is precomputed per row in loadAll (r.blob);
      // trimmed so the filter and the highlighter agree
      const q = (this.get('reqQ') || '').trim().toLowerCase();
      const rows = this.get('requests');
      if (!q) return rows;
      return rows.filter((r) => (r.blob || '').includes(q));
    },
    /** Search AND every axis — OR within, AND across — the set the footer counts and the pager slices. */
    reqFiltered() {
      const sel = this.get('reqFilters');
      return this.get('reqSearched').filter((r) => reqMatches(r, sel, null));
    },
    /* Sorting runs over the FULL filtered set, never the visible page: the
       client holds every row of the project from the one unfiltered fetch, so
       sorting a page would order the page and not the table. filter → sort →
       paginate, in that order. reqSortRows decorates into its own array, so
       reqFiltered's — Ractive's cached value — is never sorted in place. */
    reqSorted() {
      return reqSortRows(this.get('reqFiltered'), this.get('reqSortDef'));
    },
    /** THE ACTIVE SORT, as one derivation: the REQ_SORTS entry `reqSort`
        names, or the natural order — for null and for a key the list no
        longer carries alike (D12), so a stale key can never leave the table unordered. */
    reqSortDef() {
      return REQ_SORTS.find((s) => s.key === this.get('reqSort')) || REQ_SORT_DEFAULT;
    },
    /** `Group: Label` for the sort button (R-pf-f); '' at the default. */
    reqSortLabelText() {
      return reqSortLabel(this.get('reqSortDef'));
    },
    /* The facet counts live in reqFacetList beside the axes and the matcher
       they depend on (20-requests-table.js), so the panel and the table cannot
       disagree about what a value means. `table` is the filter-group partial's
       dispatch key (D10): one partial serves both tables and routes a tick by it. */
    reqFacets() {
      return reqFacetList(this.get('reqSearched'), this.get('reqFilters')).map((f) => ({ table: 'req', ...f }));
    },
    /* The indicator's chips — one per VALUE (D7), and a walk of the SELECTION
       and nothing else. The open chip's own panel is drawn by the template
       looking its axis up in `reqFacets`, so joining that group onto the chip
       here was a second answer to the same question, free to disagree with the
       first and paid for on every search keystroke (this computed is always
       live). Pipeline's chip IS its axis, so pipeChips keeps its join.
       [review S3; PLAN.md §Fix amendment 3] */
    reqChips() {
      return reqChipList(this.get('reqFilters'));
    },
    /** How many filter VALUES are applied, across every axis — the Filter button's accessible number. */
    reqFilterCount() {
      const sel = this.get('reqFilters');
      return REQ_FILTERS.reduce((n, f) => n + (sel[f.key] || []).length, 0);
    },
    /* The no-results verdict, Pipeline's rule (owl #76; owl #77 §3): nothing
       left AND the reader caused it — a non-blank term or a live filter, read
       off reqChips so this and the indicator row cannot disagree about whether
       something is filtering. Fresh-empty keeps the plain table; the footer
       leaves with the table (D8), the tiles and the toolbar stay. */
    reqNoResults() {
      if (this.get('reqFiltered').length) return false;
      /* …and the table had something to empty. The outer gate lets a project
         through on its REJECTED rows alone, so `requests` can be empty while
         the tab is drawn: a term typed there would otherwise be offered the
         shared remedy — clear your filters — which cannot bring back a row the
         sheet never parsed. That project keeps its own dashed box whatever is
         typed. [review L2; PLAN.md §Fix amendment 3] */
      if (!this.get('requests').length) return false;
      return (this.get('reqQ') || '').trim() !== '' || this.get('reqChips').length > 0;
    },
    /* the four stat tiles — one row each, so the a11y attributes and the click
       wiring live in ONE place in the template. Labels literal-uppercase like
       the Pipeline metrics, and as ruled (frame notes ruling 21: TO FILE on
       the tile, For Filing on the badge). REQUESTS takes .metric's default
       colour, so it names no colourway: green/amber/red are the complete set.
       `on` DERIVES from the STATUS axis (D4): a tile is pressed exactly when
       the axis HOLDS its word, REQUESTS when the axis is empty — there is no
       second state to fall out of step with the panel. Membership, not sole
       occupancy: the STATUS group is multi-select like every other axis, and
       reading it as "the axis holds this and nothing else" left every tile
       unpressed the moment the reader ticked two — the two just ticked
       included, receding as though nobody had picked them.
       [review H2; PLAN.md §Fix amendment 3] */
    reqStats() {
      const c = this.get('requestCounts');
      const status = this.get('reqFilters.status') || [];
      const on = (key) => (key === 'all' ? status.length === 0 : status.indexOf(REQUEST_SEGMENT_STATUS[key]) > -1);
      return [
        { key: 'all', cls: '', label: 'REQUESTS', value: c.requests, on: on('all') },
        { key: 'filed', cls: 'green', label: 'IN PIPELINE', value: c.inPipeline, on: on('filed') },
        { key: 'filing', cls: 'amber', label: 'TO FILE', value: c.toFile, on: on('filing') },
        { key: 'clarification', cls: 'red', label: 'FOR CLARIFICATION', value: c.forClarification, on: on('clarification') },
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
    /** The footer's `Showing from–to of total` (node 809:85294): one-based, `to`
        clamped to the set; all zeros over an empty set, which draws no footer (D8). */
    reqPageRange() {
      const total = this.get('reqFiltered').length;
      const page = Math.max(1, Math.min(this.get('reqPage'), this.get('reqPageCount')));
      const from = total ? (page - 1) * REQ_PAGE_SIZE + 1 : 0;
      return { from, to: Math.min(page * REQ_PAGE_SIZE, total), total };
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
    /* THE DIVERGENCE GUARD (D5). Recently requested reads the sheet's row
       order; the sheet also carries Year and Month, and the two disagree when
       rows were inserted out of sequence. Counted here, client-side, over the
       WHOLE payload — the disagreement is the sheet's, not the filter's — as
       the adjacent dated pairs, along ascending row number, whose (year,
       month) go BACKWARDS. An undated row is skipped, never counted as a break:
       the pair is the dated row before it and the dated row after. Above zero,
       the sync strip says so in one sentence. */
    reqOrderDivergence() {
      const dated = this.get('requests')
        .filter((r) => !unranked(r.year) && !unranked(r._monthIdx))
        .sort((a, b) => cmpNullsLast(a.sheet_row, b.sheet_row, 1));
      let n = 0;
      for (let i = 1; i < dated.length; i++) {
        const a = dated[i - 1];
        const b = dated[i];
        if (Number(b.year) < Number(a.year) || (Number(b.year) === Number(a.year) && b._monthIdx < a._monthIdx)) n++;
      }
      return n;
    },
    /* The sorts as their node groups, DERIVED from REQ_SORTS in its own order
       (PIPE_SORT_GROUPS' rule) — never a second hand-written list, or the
       panel and the comparator could disagree about what exists. Two today,
       Dates and Identity (nodes 809:87722 / 809:87697). */
    REQ_SORT_GROUPS() {
      const out = [];
      for (const s of REQ_SORTS) {
        const last = out[out.length - 1];
        if (last && last.group === s.group) last.items.push(s);
        else out.push({ group: s.group, items: [s] });
      }
      return out;
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
       here would fight the persisted order). NO 'unscheduled' group: a work
       card either belongs to a sprint or it is not on this screen (#72 §2).

       ONE MORE group, and only when it has rows (owl #90, block nine;
       PLAN.md "Client state"): *Outside any sprint* — the rows a sprint
       re-date displaced. They keep the exact day they sat on and lose only
       their membership (`sprintId: null`), so they render here, last, with
       their bars where they were, until the PM re-slots them by hand. The
       group's id is the literal 'outside' — never a sprint id, so no search
       panel, no add and no capacity keys on it — and it is absent, not
       empty, whenever nothing is displaced: absence is still the design for
       everything that has a sprint.

       `meta` and `count` stay two strings because the frame gives them two
       tones (sprintHeader: '#duration' #64748b, '#items' #94a3b8). */
    sprintGroups() {
      const items = this.get('sprintItems').rows;
      const groups = this.get('sprints').map((s) => {
        const rows = items.filter((r) => r.sprintId === s.id);
        return {
          id: s.id,
          name: s.name,
          meta: `${fmtDate(s.start)} - ${fmtDate(s.end)}`,
          count: itemCount(rows.length),
          rows,
        };
      });
      const outside = items.filter((r) => r.sprintId === null);
      if (outside.length) {
        groups.push({
          id: 'outside',
          name: 'Outside any sprint',
          meta: 'no sprint dates',
          count: itemCount(outside.length),
          rows: outside,
        });
      }
      return groups;
    },
    /* THE SEARCH PANELS (owl #77 §0; PLAN.md "Computed"): sprintId → { items }
       for every sprint whose field holds a query, derived through addMatches
       and nowhere else. A key exists ONLY while addTokens(addQ[id]) is
       non-empty, so `{{#if addPanels[g.id]}}` is the resting/active switch —
       and an EMPTY items array is still active: that is the no-matches state
       (841:33668), not rest. Reads `sprints`, `addQ` and the pool; the pool
       is the server's own addable map, unchanged (B11), so a card that was
       scheduled elsewhere or completed leaves every list on the next load. */
    addPanels() {
      const q = this.get('addQ') || {};
      const addable = this.get('sprintItems.addable') || {};
      const out = {};
      for (const s of this.get('sprints')) {
        if (!addTokens(q[s.id]).length) continue;
        out[s.id] = { items: addMatches(q[s.id], addable) };
      }
      return out;
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

