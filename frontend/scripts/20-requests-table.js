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
   MC-10 where a string compare would not. 'MC-825' ranks 825; a human
   display_id ('MC-655.3') keeps its fractional part rather than truncating.
   Computed once per load (blobRequests), never inside the comparator.

   Takes the MC STRING, not the row. It used to take a request row and read
   `mc_number` off it, and the Pipeline's own MC sort (10-constants.js) then
   called it with the string — so every row ranked null and that sort silently
   ordered nothing. One argument both tabs can spell is the fix; a row shape is
   not something a shared helper should have to know. */
const mcRank = (mc) => {
  const m = String(mc || '').match(/\d+(?:\.\d+)?/);
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

