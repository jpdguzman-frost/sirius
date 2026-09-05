/* Split out of frontend/scripts/10-constants.js on 2026-09-05 (part 3 of 3):
   the Pipeline sort and filter recipes, the work-card side of an axis, and
   the Sprint Schedules search-based add. Bytes below unchanged. */
/* ---- Pipeline sort + filter (owl #62; nodes 592:56850 / 592:56913 /
   592:56966 / 593:78434 / 593:74881) ------------------------------------
   Both are READ-ONLY VIEW operations over rows the client already holds, so
   they live here beside the search recipe rather than behind an endpoint —
   the same reason `reqFiltered` filters Requests client-side. Neither is
   gated by observation mode; neither writes anything. */

/* THE DIFFICULTY RANK — what Hardest first orders by, and why that order is
   Hard → Medium → Easy rather than the alphabet's Easy → Hard → Medium. Back
   with the Priority pair (owl #78 §5; PLAN.md B6): a labelled work card ranks
   here, an unlabelled one ranks null, which is keyless below. */
const DIFF_RANK = { Hard: 3, Medium: 2, Easy: 1 };

/* THE TEN SORTS, in the frame's own order and grouping (841:58731): Dates,
   Priority, Identity. `value(r, sel)` returns the comparable, or null for
   "keyless" — and keyless ALWAYS sorts last regardless of direction (owl #62:
   most cards on the real board lack a due date, and a nulls-first order would
   fill the top of the table with blanks). `dir` is the direction applied to
   keyed values only. Labels are the frame's own strings — plain descriptions
   of the resulting order, never column-plus-arrow. The sort button prints
   `Group: Label`, so an Identity item reads with two colons; the double colon
   is a question for Miles, not fixed here (PLAN.md B9).

   `derived: true` marks a sort keyed on the WORK CARDS under the row, not on
   the row itself — the four that read pipeWorkKeys. Owl #78 §5: deadline,
   urgency and difficulty are work-card values now, so a main row's key is
   AGGREGATED over its matching children (the ones every live work-card axis
   admits): the earliest child `due` — the parent's own deadline is ignored,
   main cards have no deadline of their own (#78 §2; PLAN.md B5, interim
   column mismatch recorded there) — any Urgent child, the hardest label. A
   row with no matching children is keyless; so is one with no labelled child
   under Hardest first. The same flag is what opens every reordered group
   (pipeAutoOpen, 40-app-state.js): an order the reader cannot see the basis
   for looks arbitrary, and the basis is inside the group. */
const PIPE_SORTS = [
  { key: 'due-near', group: 'Dates', label: 'Deadline closest to now', dir: 1, derived: true, value: (r, sel) => pipeWorkKeys(r, sel).due },
  { key: 'due-far', group: 'Dates', label: 'Deadline farthest from now', dir: -1, derived: true, value: (r, sel) => pipeWorkKeys(r, sel).due },
  { key: 'started', group: 'Dates', label: 'Recently started', dir: -1, value: (r) => r.workStartedTs || r.workStarted || null },
  { key: 'completed', group: 'Dates', label: 'Recently completed', dir: -1, value: (r) => r.workDoneTs || r.workDone || null },
  { key: 'urgent', group: 'Priority', label: 'Urgent first', dir: -1, derived: true, value: (r, sel) => pipeWorkKeys(r, sel).urgent },
  { key: 'hardest', group: 'Priority', label: 'Hardest first', dir: -1, derived: true, value: (r, sel) => pipeWorkKeys(r, sel).hard },
  { key: 'mc', group: 'Identity', label: 'MC Number: Low to High', dir: 1, value: (r) => mcRank(r.mcNumber) },
  { key: 'mc-desc', group: 'Identity', label: 'MC Number: High to Low', dir: -1, value: (r) => mcRank(r.mcNumber) },
  { key: 'name', group: 'Identity', label: 'Deliverable Name: A–Z', dir: 1, value: (r) => (r.name || '').toLowerCase() || null },
  { key: 'name-desc', group: 'Identity', label: 'Deliverable Name: Z–A', dir: -1, value: (r) => (r.name || '').toLowerCase() || null },
];

/* THE DEFAULT ORDER — by order of filing, most recently ingested first. NOT one
   of the listed sorts: it is the table's natural order, they are deviations
   from it, and Clear Sort returns to it (owl #62). `filedAt` is the Trello card's
   own creation instant, added in migration 008 — deliberately not the Sirius
   row's `created_at`, which stamps 289 of the live board's rows with the single
   day it was onboarded. A row not yet re-read has none and sorts last. */
const PIPE_SORT_DEFAULT = { key: null, dir: -1, value: (r) => r.filedAt || null };

/* NULLS LAST, THEN COMPARE — the one shape every Pipeline comparison takes.
   An unranked value sorts after a ranked one whichever way `dir` points, two
   unranked are a tie, two ranked compare in `dir`. Zero only on a tie, so a
   caller chains the next comparison with `||`. */
const cmpNullsLast = (av, bv, dir) => {
  const an = unranked(av);
  const bn = unranked(bv);
  if (an || bn) return an && bn ? 0 : an ? 1 : -1;
  return av === bv ? 0 : (av < bv ? -1 : 1) * dir;
};

/* THE TIEBREAK (PLAN.md B7 — owl #78 §5.B.4 taken as the build's reading, for
   all ten sorts). Two KEYLESS rows: MC number ascending, so the tail of the
   table reads in one order whichever sort put it there. Two EQUAL keys: the
   table's natural order — filedAt descending, never-read last — then MC
   ascending. Both arguments are DECORATED entries, see pipeSortRows; a row
   with no MC number sorts after the ones that have one. */
const pipeTiebreak = (a, b, keyless) => (keyless ? 0 : cmpNullsLast(a.f, b.f, -1)) || cmpNullsLast(a.m, b.m, 1);

/* Keyless last, always — before direction is applied, so it holds both ways.
   Compares two DECORATED entries `{ r, v, f, m }` — row, sort value, filedAt,
   MC rank — never two rows: see pipeSortRows. Every tie goes to pipeTiebreak,
   a keyless pair and an equal-key pair alike; only a pair equal on key,
   filedAt AND MC rank keeps the array's own order (2026-09-05 block 4 review,
   finding 2). */
const pipeCompare = (sort, a, b) => cmpNullsLast(a.v, b.v, sort.dir) || pipeTiebreak(a, b, unranked(a.v));

/* Decorate, sort, undecorate — `value()` runs ONCE PER ROW, not once per
   comparison. 480 rows is ~4,300 comparisons, so extracting inside the
   comparator meant ~8,600 calls per sort: for the name sort that is 8,600
   `toLowerCase()` allocations, and for the MC sort 8,600 regex matches, every
   time a filter toggles or a search key lands. The Requests table already
   states this rule at its own comparators ("computed once per load, never
   inside the comparator") and stamps `_mcRank` for it.

   `sel` is the live filter selection, and it goes into the key: a derived
   sort aggregates over the children the work-card axes admit (PLAN.md B5),
   so the same row keys differently under a different filter — and that
   aggregation, pipeWorkKeys, runs HERE, once per row, never in the
   comparator. The two tiebreak fields ride on the entry for the same reason. */
const pipeSortRows = (rows, sort, sel) => {
  // siblings of a shared MC (MC-825, 99 rows) share one `work` array, so a
  // derived key is aggregated once per array and read back for the rest
  const memo = sort.derived ? new Map() : null;
  const decorated = rows.map((r) => {
    let v;
    if (memo && memo.has(r.work)) v = memo.get(r.work);
    else {
      v = sort.value(r, sel);
      if (memo) memo.set(r.work, v);
    }
    return { r, v, f: r.filedAt || null, m: mcRank(r.mcNumber) };
  });
  decorated.sort((a, b) => pipeCompare(sort, a, b));
  return decorated.map((d) => d.r);
};

/* THE PIPELINE COLUMN TABLE — one row per column, in draw order.

   Added 2026-08-25 for a reason the project paid for: this header was the only
   table header in the app still hand-typed, and it is the one that drifted. It
   read `Client` for months while the filter panel, its chip and the whole
   Requests table read `Requestor`, over the same field, and it took an owl
   round-trip to settle. Requests derives its header from `REQ_COLS`;
   Pipeline was the outlier.

   A test can only catch the second spelling AFTER someone types it. Deriving
   the header means there is no second place to type it. `PIPE_FILTERS` below
   takes its label from here too, so the word a reader sees above a column and
   the word the filter for that column shows are the same string, not two
   strings a guard compares.

   The BODY cells stay hand-written: their contents are bespoke per column, and
   `col-*` there is a class name rather than a human word. */
/* Owl #78 §3 re-cut the list to ten, in this order. Three edits at once, all
   from the same frame (809:83486): the Requestor column LEAVES Pipeline — it
   stays on Requests, where it is the row's own subject — URGENCY moves ahead of
   DIFFICULTY, and DUE is renamed DEADLINE to match the word Sprint Schedules
   uses for the same date. The class moved with the label (`col-due` →
   `col-deadline`) so the header, the cells and the width rule cannot drift
   apart over a name only half of them changed. */
const PIPE_COLS = [
  { cls: 'col-mc', label: 'MC #' },
  { cls: 'col-name', label: 'Card Name' },
  { cls: 'col-type', label: 'Type' },
  { cls: 'col-urgency', label: 'Urgency' },
  { cls: 'col-diff', label: 'Difficulty' },
  { cls: 'col-status', label: 'Status' },
  { cls: 'col-deadline', label: 'Deadline' },
  { cls: 'col-started', label: 'Started' },
  { cls: 'col-done', label: 'Done' },
  { cls: 'col-links', label: 'Links' },
];
/** A column's human label, by class. Throws nothing: an axis naming a column
    that does not exist yields undefined, which the guard in
    the pipeline-sortfilter-*.test.ts suites turns into a failing build. */
const pipeColLabel = (cls) => (PIPE_COLS.find((c) => c.cls === cls) || {}).label;

/* THE FOUR FILTER AXES, in the frame's order (841:53782; PLAN.md B1): TYPE ·
   DIFFICULTY · URGENCY · STATUS. Values are DERIVED FROM THE BOARD, never a
   fixed list (frame: "a type or status nobody uses simply does not appear").
   `order` sets the value order inside a closed vocabulary; the open ones read
   alphabetically. STATUS would ideally read in Trello's own list order, but
   the wire carries no list position — R-pf-e stands, and the list order is an
   ARES read-API question (PLAN.md B8). NO STATE FILTERS: blocked and
   missing-info were considered and declined; row state stays on the rows.

   TWO KINDS OF AXIS (owl #78 §4; PLAN.md B2). `pick` reads the MAIN row — TYPE
   and STATUS are the row's own. `work` names the WorkCardWire field a
   WORK-CARD axis reads — DIFFICULTY and URGENCY live on the work cards since
   #78 §1, so a main row matches such an axis THROUGH ITS CHILDREN: it is in
   when at least one child is, and a child is in when it satisfies EVERY live
   work-card axis at once (B3, child-level conjunction: Urgent plus Hard needs
   ONE card that is both, not one of each). Counts are counts of MAIN rows,
   the unit the table draws (B4). What a live work-card axis does to the
   groups — opens them, narrows the children drawn — is pipeOpen / pipeKids in
   40-app-state.js. Requestor left with its column (#78 §3).

   `none: true` marks an axis where ABSENCE is itself a selectable value (owl
   #63, closing R-pf-i). TYPE: the rows carrying no type were the only rows NO
   filter could reach. DIFFICULTY: a missing label is one of the Needs Info
   conditions, and None is how a reader finds the card — it appears only when
   a matching child lacks the label. URGENCY and STATUS are deliberately NOT
   marked: every card sits in a list, and Non-Urgent is the wire's own value
   for the absent label, so neither axis has a residue to collect. */
/* Labels in HUMAN case. The panel heading shouts them in CSS (`.pmhead` carries
   `text-transform: uppercase`) and the chip needs them unshouted — storing them
   shouted meant carrying a second, opposite case rule in JS to un-shout them.

   `label` is DERIVED from the column each axis narrows (`col`), so renaming a
   column renames its filter and its chip in the same edit. That is the fix for
   the Client/Requestor drift: not a guard that notices two spellings, but one
   place to spell it. */
const PIPE_FILTERS = [
  { key: 'type', col: 'col-type', label: pipeColLabel('col-type'), pick: (r) => r.assetType, none: true },
  { key: 'difficulty', col: 'col-diff', label: pipeColLabel('col-diff'), work: 'difficulty', order: ['Easy', 'Medium', 'Hard'], none: true },
  { key: 'urgency', col: 'col-urgency', label: pipeColLabel('col-urgency'), work: 'urgency', order: ['Non-Urgent', 'Urgent'] },
  { key: 'status', col: 'col-status', label: pipeColLabel('col-status'), pick: (r) => r.currentList, scroll: true },
];
/** The WORK-CARD axes alone — the two a card is tested against, derived so a fifth axis is one entry above. */
const PIPE_WORK_FILTERS = PIPE_FILTERS.filter((f) => f.work);
/** Absence is DRAWN as the word None — one rule, so the chip and the panel
    cannot disagree about it (owl #63). */
const pipeValueLabel = (v) => (v === null ? 'None' : v);

/* "None" is stored as the VALUE null, never as the string `None`: a Trello
   label or a board value could legitimately BE that word, and the two must
   never collapse into one checkbox. Nothing renders it - the panel draws
   `label`, which is where the word None lives. */
/** A row's value on an axis; absence becomes null, which only a `none` axis
    offers. Absence is `unranked` — the same test every Requests comparator
    routes its nulls through, rather than a second definition of "missing". */
const pipePick = (f, row) => {
  const v = f.pick(row);
  return unranked(v) ? null : v;
};
/** A work card's value on a work-card axis — the same absence rule, read off the card field the axis names. */
const pipeWorkPick = (f, w) => (unranked(w[f.work]) ? null : w[f.work]);
/** Empty SELECTION object - one array per axis, derived so another axis is one entry. */
const PIPE_FILTERS_EMPTY = () => Object.fromEntries(PIPE_FILTERS.map((f) => [f.key, []]));
/* ---- the work-card side of an axis (owl #78 §4; PLAN.md B3) ----------------
   Top-level consts, every one, so the recipe suite can slice and EXECUTE them
   by name. `exceptKey` is the ignore-own-axis rule (R-pf-c) carried down to
   the children: a facet counts its own values against the OTHER axes'
   selections, so the children it reads are the ones every OTHER live
   work-card axis admits. */
/** Does a work card satisfy every LIVE work-card axis except the one named? (`null` = every axis.) */
const pipeWorkMatch = (w, sel, exceptKey) =>
  PIPE_WORK_FILTERS.every((f) => {
    if (f.key === exceptKey) return true;
    const want = sel[f.key] || [];
    if (!want.length) return true; // an empty axis constrains nothing
    const v = pipeWorkPick(f, w);
    // an axis that offers no None cannot match a card that has no value there
    if (v === null && !f.none) return false;
    return want.indexOf(v) > -1; // OR within, AND across (owl #62)
  });
/** The row's work cards that pipeWorkMatch admits — `row.work` is stamped in loadAll. */
const pipeWorkKids = (row, sel, exceptKey) => (row.work || []).filter((w) => pipeWorkMatch(w, sel, exceptKey));
/* A row's VALUES on an axis — a SET, because a main row can answer a work-card
   axis several times over (MC-825 has 99 work cards). A main-row axis yields
   one value, or nothing when the row has none and the axis offers no None; a
   work-card axis yields the DISTINCT values of the children the other live
   work-card axes admit, null standing in for a missing label only where the
   axis offers None. The matcher and the facet pass both read this one recipe,
   so they cannot disagree about what a row is worth on an axis. */
const pipeValues = (f, row, sel) => {
  if (!f.work) {
    const v = pipePick(f, row);
    return v === null && !f.none ? [] : [v];
  }
  const out = [];
  for (const w of pipeWorkKids(row, sel, f.key)) {
    const v = pipeWorkPick(f, w);
    if (v === null && !f.none) continue;
    if (out.indexOf(v) < 0) out.push(v);
  }
  return out;
};
/* THE DERIVED SORT KEYS, aggregated over the children EVERY live work-card
   axis admits (PLAN.md B5/B6): `due` is the earliest child deadline — Manila
   day strings compared as strings, never as Dates; `urgent` is 1 when any
   child carries the label and 0 when none does — a VALUE, so the quiet groups
   rank rather than fall to the bottom; `hard` is the highest DIFF_RANK among
   labelled children. null in a slot is keyless for that sort: no matching
   children, or (for `hard`) none labelled. Called once per row per sort, from
   pipeSortRows's decorate step, never from the comparator. */
const pipeWorkKeys = (row, sel) => {
  const kids = pipeWorkKids(row, sel, null);
  let due = null;
  let hard = null;
  let urgent = false;
  for (const w of kids) {
    if (w.due && (due === null || w.due < due)) due = w.due;
    if (w.urgency === 'Urgent') urgent = true;
    // own keys only (2026-09-05 block 4 review, finding 1): the mapper and W3 hold the wire
    // vocabulary; this holds the key to number|null as B6 promises, never an inherited function
    const rank = Object.hasOwn(DIFF_RANK, w.difficulty) ? DIFF_RANK[w.difficulty] : null;
    if (rank !== null && (hard === null || rank > hard)) hard = rank;
  }
  return { due, urgent: kids.length ? (urgent ? 1 : 0) : null, hard };
};

/** Does a row satisfy every axis EXCEPT the one named? (`null` = every axis.)
    Per axis: an empty selection constrains nothing; otherwise one of the row's
    values there (pipeValues) must be picked — OR within, AND across (owl #62).
    On a work-card axis that is B3's child-level conjunction by construction:
    the values come from the children the OTHER live work-card axes admit. */
const pipeMatches = (row, sel, exceptKey) => {
  // "except axis j" IS "the selection with j removed" (R-pf-c) — removed from
  // what the OTHER work-card axes read too, or j leaks back in through their
  // child filter and the row is asked for a child that satisfies j after all
  const live = exceptKey ? { ...sel, [exceptKey]: [] } : sel;
  return PIPE_FILTERS.every((f) => {
    const want = live[f.key] || [];
    if (!want.length) return true; // an empty axis constrains nothing
    return pipeValues(f, row, live).some((v) => want.indexOf(v) > -1);
  });
};

/* THE FACET COUNTS (jp->miles #49, adopted in owl #63). Each axis counts against
   the filters applied in the OTHER axes, ignoring its own - the third option,
   neither of the two the frame offered. Counting against ALL filters including
   its own drops every sibling value to zero the moment one is picked, so a
   second value could never be added without clearing first: accurate and
   unusable. Ignoring its own keeps the counts honest as you narrow AND usable
   for widening.

   "None" is DERIVED like every other value: it appears on an axis only when some
   row on the board actually lacks a value there — on a work-card axis, when a
   matching child lacks the label — so a board where every card carries a type
   shows no None under TYPE.

   None sorts LAST in its category, ahead of neither the natural progression nor
   the alphabet. It is the residue; reading it first would push the real
   vocabulary down.

   A Map, not an object: object keys stringify, and `null` as a key would become
   the string "null" and merge with a board value of that name. */
const pipeFacetList = (rows, sel) => {
  /* ONE PASS over the rows for every facet. Filtering the row set once per axis
     meant axes × rows × axis tests — with the five axes this shipped with, at
     480 rows, twelve thousand axis evaluations and one throwaway array per
     axis, on every checkbox click — and the panel deliberately stays open while
     you build a filter, so it fires repeatedly. Counting failures instead is
     one pass, one axis test per axis.

     The arithmetic that makes it work: a row rejected by NO axis belongs to
     every pool; a row rejected by EXACTLY ONE belongs only to that axis's pool,
     because an axis ignores its own selection (R-pf-c); a row rejected by two
     or more belongs to none.

     A row's values on an axis are a SET since owl #78 §4 (pipeValues): a main
     row answers a work-card axis once per distinct child value, and it seeds
     and counts EVERY value in its set — the count is still of MAIN rows
     (PLAN.md B4), one per value the row carries. The ignore-own-axis rule
     reaches the children too: a work-card axis reads the cards the OTHER live
     work-card axes admit, which is what keeps a second Difficulty value
     reachable while one is ticked.

     The WORK-CARD axes fail together or not at all: a row fails any live
     work-card axis exactly when no child satisfies the whole conjunction
     (B3), so they are ONE failure in the count — and, because each work-card
     axis's set already ignores its own selection, a row that fails the
     conjunction still counts, with those sets, in every WORK-CARD pool while
     counting in no MAIN pool. Counted per axis instead, a group with an
     Urgent Easy card and a quiet Hard card fell out of both pools the moment
     Urgent and Hard were both ticked, and Easy read zero on a panel where
     ticking it would have widened the table. */
  const facets = PIPE_FILTERS.map((f) => ({ f, counts: new Map(), picked: sel[f.key] || [] }));
  /* A PICKED value always keeps its checkbox, even at zero. Seeding only from
     the rows meant a search that eliminated every row carrying a selected value
     removed that value from the panel — leaving an empty table, a Filter button
     still reporting "1 applied", and no way to un-pick it short of Clear. The
     template already draws a zero-count-but-picked value as enabled. */
  for (const facet of facets) for (const v of facet.picked) facet.counts.set(v, 0);
  /* WHICH POOL an axis failure lands in: each MAIN axis is its own pool, and
     the WORK-CARD axes share one, because they fail as a single conjunction
     (B3/B12) — so a row's failures are counted per pool, not per axis. */
  const pool = facets.map(({ f }, i) => (f.work ? 'work' : i));
  /* a work-card axis's value set is a function of the row's `work` array and
     the selection alone, and siblings of a shared MC (MC-825, 99 rows) share
     one array — so each set is read once per array per pass, not per row */
  const wmemo = facets.map((x) => (x.f.work ? new Map() : null));
  const vals = new Array(facets.length);
  for (const r of rows) {
    let fails = 0;
    let failed = null;
    for (let i = 0; i < facets.length; i++) {
      const { f, picked, counts } = facets[i];
      // the row's VALUES on this axis, read once per row per axis
      let set;
      if (wmemo[i] && wmemo[i].has(r.work)) set = wmemo[i].get(r.work);
      else {
        set = pipeValues(f, r, sel);
        if (wmemo[i]) wmemo[i].set(r.work, set);
      }
      vals[i] = set;
      // every value PRESENT on the board is seeded, even at zero against this
      // pool — the frame wants empty categories exposed, not hidden
      for (const v of set) if (!counts.has(v)) counts.set(v, 0);
      // the same test pipeMatches makes: an empty axis constrains nothing, and
      // a row fails an axis when NONE of its values there is picked — a row
      // with no value on an axis that offers no None has no values, so it fails
      if (!picked.length || set.some((v) => picked.indexOf(v) > -1)) continue;
      if (pool[i] !== failed) {
        fails++;
        failed = pool[i];
      }
    }
    if (fails > 1) continue;
    for (let i = 0; i < facets.length; i++) {
      // one failure: only the pool that failed counts the row — a MAIN axis's
      // own, or every WORK-CARD axis when it was the conjunction
      if (fails === 1 && pool[i] !== failed) continue;
      const { counts } = facets[i];
      for (const v of vals[i]) counts.set(v, counts.get(v) + 1);
    }
  }
  return facets.map(({ f, counts, picked }) => {
    const names = [...counts.keys()];
    names.sort((a, b) => {
      if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
      /* DIFFICULTY and URGENCY declare their own order — Easy → Medium → Hard,
         Non-Urgent → Urgent — the natural progression of a closed vocabulary,
         back with the axes themselves (owl #78 §4; the branch lay dormant
         while they were parked). The open vocabularies read alphabetically. */
      return f.order ? f.order.indexOf(a) - f.order.indexOf(b) : alphaSort(a, b);
    });
    return {
      key: f.key,
      label: f.label,
      // the one open-ended axis scrolls inside its own group; the flag is on
      // the axis so another one is still a single entry (R-pf-e)
      scroll: !!f.scroll,
      values: names
        .map((v) => ({
          value: v,
          label: pipeValueLabel(v),
          count: counts.get(v),
          on: picked.indexOf(v) > -1,
        }))
        /* A ZERO IS HIDDEN, NOT GREYED (JP, 2026-08-21) — it used to render
           disabled, which the frame asked for ("expose empty categories instead
           of hiding them"), and on a real board that filled STATUS with rows
           nobody could ever pick. ⚠️ UNLESS IT IS TICKED: a value already
           applied can fall to zero as other axes narrow, and hiding it would
           strand the reader with a filter they cannot see or un-tick — the
           table empty, the button still counting it. That case is the whole
           reason this is not a bare `count > 0`. */
        .filter((v) => v.count > 0 || v.on),
    };
  })
  /* …and an axis with nothing left to offer goes with them. A heading standing
     alone over no rows reads as a rendering fault, not as an empty category. */
  .filter((f) => f.values.length > 0);
};

/* THE FILTER INDICATOR (node 593:79380). One chip per FILTERED AXIS, reading
   `Type is Icon, Asset` — the axis in slate-500 regular, its values in
   slate-900 semibold, comma-separated. Not one chip per value: the frame's
   `Number` variant counts the VALUES INSIDE a chip, and its `2` variant is a
   single chip listing two of them under one axis name and one ✕.

   The axis name is the axis's OWN label, which is why those are stored in human
   case: the panel heading shouts them in CSS and the chip does not. Another axis
   needs no entry here.

   Values keep the order they were ticked in, which is the order the reader built
   them in, and `null` reads as None through the one helper both this and the
   facet list use. */
const pipeChipList = (sel) =>
  PIPE_FILTERS.map((f) => {
    const picked = (sel && sel[f.key]) || [];
    return { key: f.key, label: f.label, text: picked.map(pipeValueLabel).join(', '), on: picked.length > 0 };
  }).filter((c) => c.on);

/** The sort button's label — `Group: Item`, the frame's format (node 592:56966). */
const pipeSortLabel = (key) => {
  const s = PIPE_SORTS.find((x) => x.key === key);
  return s ? `${s.group}: ${s.label}` : '';
};

/* ---- Sprint Schedules: the search-based add (owl #77 §0; nodes 840:31597,
   841:33668, 833:68629) -------------------------------------------------
   The field at the end of every sprint lists the addable work cards its
   query matches, and Add All adds exactly that list — "the list on screen IS
   the set" (Miles). So ONE recipe derives the list: the addPanels computed
   (40-app-state.js) reads these three and nothing else derives one. Pure on
   purpose — no app access — so the recipe suite can execute them from shipped
   source against a fixture pool. The pool itself is the server's `addable`,
   unchanged (PLAN.md B11): MC → its incomplete, unscheduled work cards, in
   the server's own order. */

/** The line a card is matched on and shown as: `MC-655: Illustrate hero`. */
const addLabel = (mc, name) => `${mc}: ${name}`;
/** Query → tokens: trim, lowercase, split on whitespace; blank → `[]`. */
const addTokens = (q) => String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
/* THE MATCH (PLAN.md B1/B2). A card matches when EVERY token is a substring
   of its lowercased label — token-AND, not one raw substring: the annotation's
   own example, "MC-06 Illustrate" listing the five Illustrate cards of MC-06,
   has no colon after the number, so a raw substring of `MC-06: Illustrate …`
   would find nothing. Order is MC number ascending by mcRank (the rank the
   Requests and Pipeline tables already sort by; unrankable last, ties by plain
   string compare), then the server's own card order INSIDE an MC — #73's
   provisional alphabetical, kept server-side and never re-sorted here. No
   cap and no minimum length: "M" listing every addable card is the honest
   output of the rule, raised with Miles. */
function addMatches(q, addable) {
  const tokens = addTokens(q);
  if (!tokens.length) return [];
  const pool = addable || {};
  const byMc = (a, b) => cmpNullsLast(mcRank(a), mcRank(b), 1) || (a < b ? -1 : a > b ? 1 : 0);
  const out = [];
  for (const mc of Object.keys(pool).sort(byMc)) {
    for (const c of pool[mc] || []) {
      const label = addLabel(mc, c.name);
      const hay = label.toLowerCase();
      if (tokens.every((t) => hay.includes(t))) out.push({ cardId: c.cardId, mc, name: c.name, label });
    }
  }
  return out;
}

