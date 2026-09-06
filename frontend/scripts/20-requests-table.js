/* ---- the comparators every Requests list shares ------------------------- */
const alphaSort = (a, b) => String(a).localeCompare(String(b));
const numCmp = (a, b) => a - b;
const ciCmp = (a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase());
/* A missing value is not "small" — it is UNRANKED, so it lands last whichever
   way a sort's direction points. Every comparator below routes its nulls here
   rather than inventing a sentinel that would flip with the direction. */
const unranked = (v) => v === null || v === undefined || v === '';

/* MC # sorts NATURALLY — on the number inside the label, so MC-9 precedes
   MC-10 where a string compare would not. 'MC-825' ranks 825; a human
   display_id ('MC-655.3') keeps its fractional part rather than truncating.
   Computed once per load (blobRequests), never inside the comparator.

   Takes the MC STRING, not the row. It used to take a request row and read
   `mc_number` off it, and the Pipeline's own MC sort (12-constants-pipeline.js) then
   called it with the string — so every row ranked null and that sort silently
   ordered nothing. One argument both tabs can spell is the fix; a row shape is
   not something a shared helper should have to know. */
const mcRank = (mc) => {
  const m = String(mc || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/* ---- Requests columns (owl #18; owl #77 §2, PLAN D1 / D6) -----------------
   ONE table drives the header cells AND the filter axes' words: `REQ_FILTERS`
   below reads each axis's `label` from here through reqColLabel, so the word
   above a column and the word on that column's filter heading and chip are one
   string, not two strings a guard compares — the Client/Requestor drift that
   PIPE_COLS closed for the Pipeline (2026-08-25). The `sort` keys stay on the
   entries, because the header-label guard reads them; no header click reads
   them any more — the sort panel is the ONE sort door (D6) and the headers
   render as plain cells. Widths live in 25-requests.css keyed on the same class.

   UNIT is a LABEL (D1). The sheet's own column reads "Business Unit", and the
   parser aliases that name, with "Use Case", onto the one stored field — so
   the entry keeps `use_case` as its accessor and changes only what the reader
   sees. The word (`Unit`), the class (`col-runit`) and the sort key (`unit`)
   moved together, so the header, the body cells and the width rule cannot
   drift apart over a rename only half of them received. */
const REQ_COLS = [
  { cls: 'col-ryear', label: 'Year', sort: 'year', val: (r) => r.year, cmp: numCmp },
  { cls: 'col-rmonth', label: 'Month', sort: 'month', val: (r) => r._monthIdx, cmp: numCmp },
  { cls: 'col-rmc', label: 'MC #', sort: 'mc', val: (r) => r._mcRank, cmp: numCmp },
  { cls: 'col-rname', label: 'Deliverable', sort: 'name', val: (r) => r.name, cmp: ciCmp },
  { cls: 'col-rtype', label: 'Type', sort: 'type', val: (r) => r.asset_type, cmp: ciCmp },
  { cls: 'col-runit', label: 'Unit', sort: 'unit', val: (r) => r.use_case, cmp: ciCmp },
  { cls: 'col-rwho', label: 'Requestor', sort: 'who', val: (r) => r.requestor, cmp: ciCmp },
  // ISO 'YYYY-MM-DD' compares chronologically as a plain string
  { cls: 'col-rdue', label: 'Deadline', sort: 'due', val: (r) => r.deadline, cmp: alphaSort },
  { cls: 'col-rbrief', label: 'Brief', sort: '' },
  { cls: 'col-rstatus', label: 'Status', sort: 'status', val: (r) => r.status, cmp: ciCmp },
  { cls: 'col-rnote', label: 'Frost Notes', sort: '' },
];
/** A column's human label, by class. Throws nothing: an axis naming a column
    that does not exist yields undefined, which the Requests header-label
    guard turns into a failing build. */
const reqColLabel = (cls) => (REQ_COLS.find((c) => c.cls === cls) || {}).label;

/* ---- the STATUS axis's vocabulary (owl #77 §2; PLAN D2) -------------------
   The badge stays TWO-valued (owls #34/#35): the client spells one status and
   prints the server's own string for the other. The FILTER axis is where a
   third word lives, and it is the tiles' vocabulary rather than a status: a
   row is worth every segment predicate it satisfies, so an unfiled row that
   carries the clarification flag is For Filing AND For Clarification — the
   subset rule the tiles have kept since owl #14, now readable as two ticks.
   ONE predicate table, REQUEST_SEGMENTS, decides membership. The list is the
   axis's three values in the node's own order (795:71554) — alphabetical,
   declared rather than relied on; the map puts the panel's word on each
   predicate key. Two literals, each spelled in both, five lines apart: the
   order and the mapping are different facts, and deriving one from the other
   by position would let a reordering silently swap the words. In Pipeline is
   STATUS_FILED itself, never a second spelling of it. */
const REQ_STATUS_VALUES = ['For Clarification', 'For Filing', STATUS_FILED];
const REQUEST_SEGMENT_STATUS = { filed: STATUS_FILED, filing: 'For Filing', clarification: 'For Clarification' };
/** A row's STATUS values — one or two — from the segment predicates, never from the string alone. */
const reqStatusOf = (r) => Object.keys(REQUEST_SEGMENTS).filter((k) => REQUEST_SEGMENTS[k](r)).map((k) => REQUEST_SEGMENT_STATUS[k]);

/* THE SIX FILTER AXES, in the node's order (795:71554 / 795:67981; PLAN §Node
   amendments): YEAR · MONTH · TYPE · UNIT · REQUESTOR · STATUS. PIPE_FILTERS'
   shape — `key` is the selection's slot, `col` the column the axis narrows,
   `label` READ from that column, `pick(r)` the row's value — with the two
   differences a flat, sheet-fed table forces:

   NONE IS A VALUE ON EVERY AXIS BUT STATUS (D11), with no `none` flag to say
   so. A sheet cell can be blank on any of the five, and the rows with a blank
   were the only rows no filter could reach. It is DERIVED — offered only when
   some loaded row lacks the value — stored as null, drawn as None, sorted
   last. STATUS has no residue: every row is filed or it is not.

   STATUS reads `values(r)`, a SET, in place of `pick`: a row can be worth two
   of its three words (D2). The matcher and the facet pass both read that one
   function, so they cannot disagree about what a row is worth there.

   `order` is the value order of a CLOSED vocabulary — the calendar for MONTH,
   the node's own order for STATUS; the open vocabularies read alphabetically.
   MONTH's values are the SHORT names the column itself draws (monthShort), so
   the chip and the cell say the same word, and 'August', 'Aug' and the number
   eight are one checkbox. REQUESTOR is the one open-ended axis: `scroll: true`
   gives it the in-group scroller (D3) so a long list cannot push the other
   five out of the panel. */
const REQ_FILTERS = [
  { key: 'year', col: 'col-ryear', label: reqColLabel('col-ryear'), pick: (r) => r.year },
  { key: 'month', col: 'col-rmonth', label: reqColLabel('col-rmonth'), pick: (r) => monthShort(r.month), order: MONTHS_SHORT },
  { key: 'type', col: 'col-rtype', label: reqColLabel('col-rtype'), pick: (r) => r.asset_type },
  { key: 'unit', col: 'col-runit', label: reqColLabel('col-runit'), pick: (r) => r.use_case },
  { key: 'requestor', col: 'col-rwho', label: reqColLabel('col-rwho'), pick: (r) => r.requestor, scroll: true },
  { key: 'status', col: 'col-rstatus', label: reqColLabel('col-rstatus'), values: reqStatusOf, order: REQ_STATUS_VALUES },
];
/** Empty SELECTION object — one array per axis, derived so a seventh axis is one entry. */
const REQ_FILTERS_EMPTY = () => Object.fromEntries(REQ_FILTERS.map((f) => [f.key, []]));

/** Does a row satisfy every axis EXCEPT the one named? (`null` = every axis.)
    Per axis: an empty selection constrains nothing; otherwise one of the row's
    values there must be picked — OR within, AND across (owl #62) — and a picked
    None matches the row whose value is missing (D11). The rows are flat, so
    "except axis j" is simply "skip j": there are no children for j to leak
    back in through, which is the whole of pipeMatches' `live` dance. */
const reqMatches = (r, sel, exceptKey) =>
  REQ_FILTERS.every((f) => {
    if (f.key === exceptKey) return true;
    const want = (sel && sel[f.key]) || [];
    if (!want.length) return true;
    // the same reading reqFacetList makes: a set on STATUS, one value — None
    // as null — everywhere else
    const vals = f.values ? f.values(r) : [unranked(f.pick(r)) ? null : f.pick(r)];
    return vals.some((v) => want.indexOf(v) > -1);
  });

/* THE FACET COUNTS — Pipeline's rule (jp->miles #49, adopted in owl #63;
   R-pf-c) over six flat axes. Each axis counts against the selections in the
   OTHER axes and ignores its own, so the counts stay honest as the reader
   narrows and usable for widening: counted against its own selection, every
   sibling value would drop to zero the moment one was ticked.

   ONE PASS over the rows, the arithmetic pipeFacetList states: a row no axis
   rejects counts in every axis; a row exactly one axis rejects counts in that
   axis alone, because that axis ignores its own selection; a row two or more
   reject counts nowhere. Every axis here is its own pool — flat rows have no
   work-card conjunction, so none of the shared-pool bookkeeping comes across.

   A STATUS row counts under EACH of its values (D2): the row is the unit, so
   an unfiled flagged row adds one to For Filing and one to For Clarification.
   A PICKED value keeps its checkbox at zero, or a search that removed every
   row carrying it would strand the reader with a filter they cannot see to
   un-tick. A ZERO IS HIDDEN, NOT GREYED (JP, 2026-08-21) unless it is that
   picked value, and an axis with nothing left to offer goes with it — a heading
   over no rows reads as a rendering fault. None sorts LAST on every axis (D11):
   it is the residue, and reading it first would push the real vocabulary down.
   A Map, not an object: `null` as an object key would become the string "null"
   and merge with a sheet value of that name. */
const reqFacetList = (rows, sel) => {
  const facets = REQ_FILTERS.map((f) => ({ f, counts: new Map(), picked: (sel && sel[f.key]) || [] }));
  for (const facet of facets) for (const v of facet.picked) facet.counts.set(v, 0);
  const vals = new Array(facets.length);
  for (const r of rows) {
    let fails = 0;
    let failed = -1;
    for (let i = 0; i < facets.length; i++) {
      const { f, picked, counts } = facets[i];
      // the same reading reqMatches makes
      const set = f.values ? f.values(r) : [unranked(f.pick(r)) ? null : f.pick(r)];
      vals[i] = set;
      // every value PRESENT in the rows is seeded, even at zero against the
      // other axes — an empty category is exposed, then hidden below, not lost
      for (const v of set) if (!counts.has(v)) counts.set(v, 0);
      // the test reqMatches makes: an empty axis constrains nothing, and a row
      // fails an axis when NONE of its values there is picked
      if (!picked.length || set.some((v) => picked.indexOf(v) > -1)) continue;
      fails++;
      failed = i;
    }
    if (fails > 1) continue;
    for (let i = 0; i < facets.length; i++) {
      // one failure: only the axis that failed counts the row — it is the one
      // axis whose own selection the row is allowed to escape
      if (fails === 1 && i !== failed) continue;
      const { counts } = facets[i];
      for (const v of vals[i]) counts.set(v, counts.get(v) + 1);
    }
  }
  return facets
    .map(({ f, counts, picked }) => {
      // a closed vocabulary reads in its declared order with a word it does
      // not know (a month name the sheet invents) after it; the open ones
      // read alphabetically, which is what an order of all-equal ranks yields
      const rank = (v) => {
        if (!f.order) return 0;
        const i = f.order.indexOf(v);
        return i < 0 ? f.order.length : i;
      };
      const names = [...counts.keys()];
      names.sort((a, b) => {
        if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
        return rank(a) - rank(b) || alphaSort(a, b);
      });
      return {
        key: f.key,
        label: f.label,
        scroll: !!f.scroll,
        values: names
          .map((v) => ({ value: v, label: v === null ? 'None' : v, count: counts.get(v), on: picked.indexOf(v) > -1 }))
          .filter((v) => v.count > 0 || v.on),
      };
    })
    .filter((f) => f.values.length > 0);
};

/* THE FILTER INDICATOR — ONE CHIP PER VALUE (D7; nodes 795:72905 / 841:37792,
   where `Type is Assets` and `Type is Lottie File` are two chips). Miles's
   explicit ruling for Requests, and the opposite of Pipeline's one chip per
   axis: one chip recipe, two list builders, so a chip's ✕ removes ITS value
   and nothing beside it. `axis` is the axis's human label (the quiet half),
   `label` the value or None (the bold half). Chips keep the axes' order and,
   inside an axis, the order the values were ticked in — the order the reader
   built them.

   `facets`, when given, are the axis groups a chip's HOVER panel draws (D7 /
   R-pf-m: hovering a chip opens its WHOLE axis, not its one value). A chip
   whose axis has a group here carries that group's `table`, `scroll` and
   `values`; the computed passes only the open axis's group, so a closed row
   costs no recount. The group's heading is the axis word — on a chip that is
   `axis`, never `label`. */
const reqChipList = (sel, facets) =>
  REQ_FILTERS.flatMap((f) => {
    const picked = (sel && sel[f.key]) || [];
    const group = (facets || []).find((x) => x.key === f.key);
    const extra = group ? { table: group.table, scroll: group.scroll, values: group.values } : {};
    return picked.map((v) => ({ key: f.key, axis: f.label, value: v, label: v === null ? 'None' : v, ...extra }));
  });

/* ---- Requests sort (owl #77 §2; nodes 809:87722 / 809:87697; PLAN D6, D12)
   THE EIGHT SORTS, in the node's order and grouping: Dates, Identity.
   PIPE_SORTS' shape — `value(r)` returns the comparable or null for keyless,
   keyless sorts LAST whichever way `dir` points, labels are the node's own
   strings — and no `derived` flag: a request row is flat and its deadline is
   its own. `recent` and `oldest` read the sheet's ROW NUMBER, not Year and
   Month: two rows filed in the same month tie on those, and the tie is the
   whole question (owl #77 §2). The node's hidden PRIORITY group is not built
   (§Node amendments). Group strings keep PIPE_SORTS' human case; the panel
   heading shouts them in CSS, and the sort button prints `Group: Label`. */
const REQ_SORTS = [
  { key: 'due-near', group: 'Dates', label: 'Deadline closest to now', dir: 1, value: (r) => r.deadline || null },
  { key: 'due-far', group: 'Dates', label: 'Deadline farthest from now', dir: -1, value: (r) => r.deadline || null },
  { key: 'recent', group: 'Dates', label: 'Recently requested', dir: -1, value: (r) => r.sheet_row },
  { key: 'oldest', group: 'Dates', label: 'Oldest request first', dir: 1, value: (r) => r.sheet_row },
  { key: 'mc', group: 'Identity', label: 'MC Number: Low to High', dir: 1, value: (r) => r._mcRank },
  { key: 'mc-desc', group: 'Identity', label: 'MC Number: High to Low', dir: -1, value: (r) => r._mcRank },
  { key: 'name', group: 'Identity', label: 'Deliverable Name: A–Z', dir: 1, value: (r) => (r.name || '').toLowerCase() || null },
  { key: 'name-desc', group: 'Identity', label: 'Deliverable Name: Z–A', dir: -1, value: (r) => (r.name || '').toLowerCase() || null },
];

/* THE DEFAULT ORDER — Recently requested: the sheet's own row order, latest
   row first (owl #77 §2). NOT one of the listed sorts (D12): it is the table's
   natural order, they are deviations from it, and Clear Sort returns to it.
   The listed option with the same effect is `recent`; this one carries no key,
   so nothing in the panel is highlighted at rest. It replaces the year-then-
   month-then-row order that shipped: rows filed the same month tied on the
   first two legs, and the sheet's row number already says which came later. */
const REQ_SORT_DEFAULT = { key: null, dir: -1, value: (r) => r.sheet_row };

/* Decorate, sort, undecorate — `value()` runs ONCE PER ROW, never once per
   comparison (the rule pipeSortRows states, and the one this table stamped
   `_mcRank` for). Keyless last before direction is applied, so it holds both
   ways; every tie — an equal key or two keyless rows — goes to the sheet's own
   row order ascending (S8), so the tail reads in one order whichever sort put
   it there. No def is the default order — a stale key never reaches here, the
   reqSortDef computed has already replaced it, so the table is never unordered. */
const reqSortRows = (rows, def) => {
  const sort = def || REQ_SORT_DEFAULT;
  const decorated = rows.map((r) => ({ r, v: sort.value(r), s: r.sheet_row }));
  decorated.sort((a, b) => cmpNullsLast(a.v, b.v, sort.dir) || cmpNullsLast(a.s, b.s, 1));
  return decorated.map((d) => d.r);
};

/** The sort button's label — `Group: Label`, Pipeline's format (R-pf-f); '' for the unlisted default (D12). */
const reqSortLabel = (def) => (def && def.key ? `${def.group}: ${def.label}` : '');
