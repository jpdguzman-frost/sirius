/* Split out of frontend/scripts/10-constants.js on 2026-09-05 (part 2 of 3):
   the Deadlines tab helpers — the month table, the week ranges, the row
   builder and the month parsers. Bytes below unchanged. */
/* ---- Deadlines tab (owls #74/#75/#78 §2; nodes 731:100853, 731:100859,
   731:100872, 810:121954; PLAN.md block 3 B1–B7, B12–B16) ----------------
   The tab is a VIEW over the schedule's own rows: a work card appears only
   when it is added to a sprint AND plotted AND has a forecast finish (#74 §1
   — doubly opt-in, never reconciled against the board), on the day it STARTS
   — `startsOn`, the day the team is slated to pick the work up.

   PLACEMENT FLIPPED on 2026-09-08 (spec v1.3 §6.2, the answer to the question
   block 3 raised while it was still open): it was the forecast FINISH under
   B2. The day work begins is the design lead's own instrument, where a
   computed finish is not something the lead can choose or move. The finish is
   still half of the gate above, still what the card's own forecast reads and
   still what rollover tests — it is only no longer the placement key.

   Every helper below is PURE — no app access — so the
   recipe suite can execute it from shipped source against fixture rows, and
   the milestone tab's own recipes (a rule table, a week-range and two card
   formatters) left with the tab they described (B9).

   THE MONTH TABLE IS THE FRAME'S OWN, and it is a SECOND table on purpose:
   the Deadlines frame spells September the long way (731:100859 reads
   'Aug 31 – Sept 30, 2026'; the lane heading '31 Aug - 4 Sept 2026') where
   the planner and Pipeline frames spell 'Sep' and forbid the long form (the
   table above). Two frames, two spellings, neither derived from the other —
   deriving one from the other would make one of the two frames wrong. */
const DL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
/* The five day-column headings (810:121954), by index: a lane's days are the
   Monday plus zero to four, so the name is fixed by position and no Date is
   parsed to discover it. */
const DL_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/* THE WEEKS OF A MONTH — the same set `lib/calendar.ts monthWeeks` produces
   (B3; the recipe suite executes both across two years of months): walk the
   Mondays from the Monday of the first, stop after the month's last day, and
   skip a week whose Friday lands before the first. A week that straddles two
   months is therefore in BOTH — the Monday that is the last day of August
   starts August's fifth week and September's first — exactly as the engine
   keys it. The walk is the shared Monday helpers (mondayIso, mondayShift,
   fridayIso — local-midnight Date math, so only calendar fields move and
   nothing shifts under a browser in another zone) and the two tests are
   string comparisons; `m` is zero-based like the Date constructor. */
function dlMonthWeeks(y, m) {
  const firstIso = isoOf(new Date(y, m, 1));
  const lastIso = isoOf(new Date(y, m + 1, 0));
  const out = [];
  for (let key = mondayIso(firstIso); key <= lastIso; key = mondayShift(key, 1)) {
    if (fridayIso(key) >= firstIso) out.push(key);
  }
  return out;
}

/* THE NAVIGATOR LABEL (731:100859): first shown Monday → the month's last
   day, month-first, the year once at the end — 'Aug 31 – Sept 30, 2026'
   (B3, B16; en dash). The month is read off the FIRST Monday's Friday: that
   Friday is inside the month by construction — dlMonthWeeks keeps a week
   only when its Friday reaches the first, and the first kept Monday is never
   more than a week past it — where the LAST Monday's Friday can already be
   in the next month (September's last Monday in the frame's own year ends
   on the second of October). A January that opens on a December Monday reads
   'Dec 28 – Jan 31, 2027': the year is the month's own, once, per B16's
   shape. Empty input renders nothing. */
function dlRangeLabel(mondays) {
  if (!mondays || !mondays.length) return '';
  const [, fm, fd] = mondays[0].slice(0, 10).split('-').map(Number);
  const [y, m] = fridayIso(mondays[0]).split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${DL_MONTHS[fm - 1]} ${fd} – ${DL_MONTHS[m - 1]} ${lastDay}, ${y}`;
}

/* THE LANE'S RANGE (731:100872): day-first, a spaced hyphen, the year once —
   '31 Aug - 4 Sept 2026'; the month once when both ends share it,
   '3 - 7 Aug 2026'; both years when the week straddles them,
   '29 Dec 2025 - 2 Jan 2026' (B16). The right-hand end is always whole and
   the left end sheds first the year and then the month as the two ends
   converge — the retired formatter's shape in the frame's new spelling and
   spacing. Pure string math over the Monday and its fridayIso. */
function dlWeekRange(monday) {
  if (!monday) return '';
  const [y1, m1, d1] = monday.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = fridayIso(monday).split('-').map(Number);
  const right = `${d2} ${DL_MONTHS[m2 - 1]} ${y2}`;
  if (y1 !== y2) return `${d1} ${DL_MONTHS[m1 - 1]} ${y1} - ${right}`;
  if (m1 !== m2) return `${d1} ${DL_MONTHS[m1 - 1]} - ${right}`;
  return `${d1} - ${right}`;
}

/* THE TAB'S WHOLE DATA, in one pass (B2, B4, B5, B7). Takes the schedule's
   rows as the server sends them (`sprintItems.rows`, position-sorted per
   sprint), the Mondays of the shown month and the week's capacity; returns
   one DlWeek per Monday, in order:
     { key, label: 'Week N', range, cards, pending, urgent, done, load,
       capPct, days: [{ day, name, cards, pending, done }] }
   and inside them one DlCard per drawn row:
     { id, cardId, mc, label, urgent, difficulty, assetType, lane, done,
       trelloUrl, figmaUrl }.

   THE OPT-IN GATE (#74 §1, B2): a row without `startsOn` (listed, not
   plotted) or without `finish` (no difficulty label, or the card has left
   the board) is skipped — nothing to draw, and the rollover never moves it
   either. Both halves of the gate still hold; only the placement key moved.
   A START outside the shown weeks is not drawn: month scope.

   THE DAY is the plotted START, `startsOn` (spec v1.3 §6.2, 2026-09-08 —
   supersedes B2's forecast finish). A card lands in its start day's column,
   and the collapsed lane stacks the days in order with each day's cards in
   the rows' own order (B7) — nothing here re-sorts. The WEEK follows the same
   key, so a card that starts in one week and finishes in the next counts in
   the week it starts. A holiday column renders like any other and carries no
   flag: the frame draws no holiday state, and a start plotted on one draws
   there like on any other day — no calendar is read here, then or now.

   THE COUNTS are three INDEPENDENT tallies (#75 §1, B4): pending is the
   pending lane, done the done lane, urgent the label on ANY status. An
   ongoing card is in neither of the first two, and none of the three is
   derived from another. The week header reads all three, a day header the
   first and the last (#75 §4 — the asymmetry is drawn; leave it).

   THE PROGRESS LINE is a PLAIN count over `capacity.weekly` (B5; the node's
   'N / C Work Cards') — not BR-6c card-equivalents, which were the retired
   tab's unit. The bar caps at one hundred percent; a capacity of zero (a
   project whose slider was never set, or the first paint before the payload
   lands) divides by one rather than printing NaN into a width. */
function dlBuild(rows, mondays, cap) {
  // `cards`, `load` and `capPct` are set in the closing loop, off the days
  const weeks = (mondays || []).map((key, i) => ({
    key,
    label: `Week ${i + 1}`,
    range: dlWeekRange(key),
    pending: 0,
    urgent: 0,
    done: 0,
    days: [0, 1, 2, 3, 4].map((n) => ({ day: isoAddDays(key, n), name: DL_DAY_NAMES[n], cards: [], pending: 0, done: 0 })),
  }));
  // day → its column, so each row is placed by one lookup rather than a scan
  const slot = new Map();
  for (const w of weeks) for (const d of w.days) slot.set(d.day, { w, d });
  for (const r of rows || []) {
    if (!r.startsOn || !r.finish) continue; // the gate: listed but unplotted, or no forecast
    // An EXCLUDED lane (ops, discarded, unused) is treated exactly like a missing
    // start: not drawn, not counted in any tally, and no weekly load. The server
    // keeps sending the row — Sprint Schedules still lists what the PM added —
    // so the filter belongs here. (PLAN.md frozen rule, review ruling 2026-09-08.)
    if (r.status === 'excluded') continue;
    const at = slot.get(r.startsOn); // the START day places the card (spec v1.3 §6.2)
    if (!at) continue; // outside the shown month
    const card = {
      id: r.id,
      cardId: r.cardId,
      mc: r.mcNumber,
      label: addLabel(r.mcNumber, r.name),
      urgent: !!r.urgent,
      difficulty: r.difficulty || null,
      assetType: r.assetType || null,
      lane: r.currentList || null,
      done: r.status === 'done',
      trelloUrl: r.trelloUrl || null,
      figmaUrl: r.figmaUrl || null,
    };
    at.d.cards.push(card);
    if (r.status === 'pending') {
      at.d.pending += 1;
      at.w.pending += 1;
    }
    if (card.done) {
      at.d.done += 1;
      at.w.done += 1;
    }
    if (card.urgent) at.w.urgent += 1;
  }
  const denom = cap > 0 ? cap : 1;
  for (const w of weeks) {
    w.cards = w.days.flatMap((d) => d.cards);
    w.load = w.cards.length;
    w.capPct = Math.min(100, (w.load / denom) * 100).toFixed(1);
  }
  return weeks;
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

