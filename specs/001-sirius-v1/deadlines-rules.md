# Deadlines — current law (the work-card tab, owls #74 + #75, 2026-09-05)

**Authority.** Current law for the Deadlines tab rebuilt on the WORK-CARD unit
(JP ruling 2026-08-27; owls miles→jp #74, #75, #78 §2, #80 §2/§5; nodes
731:100853 · 731:100872 (collapsed lane) · 810:121954 (expanded lane) · the
Deadline Card instances under 731:100872's Card Content slot). The old
milestone-unit tab's law (`deadlines-frame-notes.md`, R-dl-a…n, owl #64) is an
ARCHIVE — where it and this file disagree, this file wins. Each rule names its
source and the guard that asserts it (`test/deadlines-tab.test.ts` unless the
rule says otherwise). Rollover law is here too, because the tab is where it
shows; the job itself lives in `src/services/rollover.ts`.

_last-verified: 2026-09-05_

## 1. What appears

- **R-d2-a Doubly opt-in.** A card appears ONLY when its work card has a
  `sprint_items` row (added to a sprint) AND that row is plotted (`starts_on`)
  AND the engine can give it a finish (a difficulty label, an active card).
  On the board but not added → absent; added but not plotted → absent; plotted
  without a finish → absent and never rolled. The tab reconciles NOTHING
  against the board and never warns about unscheduled work — an empty week
  is the plan, not a sync failure. [#74 §1; PLAN B1/B2; `dlBuild` executed]
- **R-d2-b The unit is the work card.** Sketch and render are separate cards,
  exactly as they are separate rows in Sprint Schedules (supersedes FR-6.3).
  The card's title is `MC-NNN: <full name>` (`addLabel`, the search row's
  label) clamped to three lines; the card carries NO date — the column it
  sits in is its date. [#74 §1/§3; node 810:122333]
- **R-d2-c A card's day is its forecast FINISH** (`row.finish` =
  `WORKDAY(start, lead + design)` from the engine). That is the day rollover
  moves and the day "slated for" means for a delivery. Both tabs read the ONE
  row (`sprintItems.rows`), so they cannot disagree about where a card sits.
  [PLAN B2 — decided, raised with Miles; `dlBuild` executed]
- **R-d2-d Weeks are the selected month's Mon–Fri weeks** — every week with
  at least one weekday inside the month, EXACTLY `lib/calendar.ts monthWeeks`
  (a straddling week shows under BOTH its months: Aug 31's week is August's
  fifth lane and September's first; the client helper `dlMonthWeeks` is
  executed against the engine over 24 months). The
  month is Manila's (`manilaToday` + `monthOffset`). The navigator's label is
  the first shown Monday → the month's last day: `Aug 31 – Sept 30, 2026`
  (the frame's `Sept`). Cards whose finish falls outside the shown weeks are
  not drawn. [node 731:100859; PLAN B3/B16]
- **R-d2-e The tab reads the schedule's rows.** No `/deadlines` fetch; the old
  route, the conflict engine, acknowledgements and the day plan are PARKED
  server-side with no caller (JP 2026-09-05, ask 1). [PLAN B1/B9; withdrawal
  sweep]

## 2. Counting

- **R-d2-f Three independent counts.** Pending = `status === 'pending'`,
  Done = `'done'`, Urgent = the card's own `Urgent` label at ANY status.
  Ongoing sits in neither Pending nor Done, so the two never sum to the
  total and neither is ever derived from the other. The week header shows all
  three (`2 Pending • 1 Urgent • 1 Done`); a day header shows two
  (`0 Pending • 0 Done`) — leave the asymmetry. [#74 §2; #75 §1/§4; node
  810:121954 counters]
- **R-d2-g The progress line is a plain count**: `N / C Work Cards`, N = the
  week's cards at any status, C = `capacity.weekly`; the 6px bar fills
  min(100, N/C). Not BR-6c card-equivalents — the unit is the card. [node
  `#label` "0 / 120 Work Cards"; PLAN B5]
- **R-d2-h Lane states come from `classifyList`** (keyword) as JP's INTERIM
  (jp→miles #59: "keyword classification retires when the mapping lands").
  The real mapping is per-project from Apollo via ARES; it needs Miles's rule
  over Apollo's `group × type` (asked in #59, unanswered) AND an ARES read
  endpoint (none exists — the Apollo config is admin-only). When it lands an
  unmapped lane is SURFACED, never guessed (#75 §1). [drift row 26]

## 3. The lane and the card

- **R-d2-i Lanes.** Collapsed: 350×799, slate-50, r8, shadow
  `0 1px 2px rgba(0,0,0,.05)`; heading (Week N 16/600 · range 14/400
  slate-500 · chevron-circle 20) · progress · the week's cards stacked at
  16px gaps in a lane that scrolls vertically. Expanded (one at a time,
  `expandedWeek`): 1830 wide, slate-100; heading gains the three counts; five
  day columns Mon–Fri, 350×683, slate-50, r6, 12px gaps, each clipping and
  scrolling on its own. The week row scrolls sideways inside `.dlscroll`; the
  page body never does. A month shift and a project switch close the open
  week. [nodes 731:100872 · 810:121954; PLAN B7/B15]
- **R-d2-j The card is 308×180 FIXED** (a `height`, never a floor); white, r8,
  the 2px-blur shadow (the codegen panel reports 1px — the raw effect says
  blur 2). Badges in order: urgency (always), difficulty (when labelled),
  asset (`Asset: X` when EVERY deliverable of the MC group carries the same
  asset type — one missing or differing value means no badge; a work card
  carries none of its own), lane (the verbatim
  Trello list). Links row pinned to the bottom: Trello, Figma, each when
  present. [#74 §3; node 810:122333; PLAN B6/B17]
- **R-d2-k The quote bar means Urgent and nothing else.** A 4px red-500 band
  on the LEFT edge only, drawn as the frame's curved path (an inline SVG
  clipped by the card's own radius), never `border-left` — the corners
  square off and "shipped wrong twice". Non-Urgent cards get NO bar, not a
  grey one, not a pale one. It is not a conflict, past-deadline or at-risk
  signal; there is no second accent colour and NO conflict indicator on this
  tab at all — that is the design, not a gap. [#74 §3; SVG export; guard:
  no `border-left` on `.dlcard`; the bar only under `.urgent`]
- **R-d2-l A done card is the whole card at opacity 0.4** — one property,
  nothing underneath restyled, the only `opacity` rule in the stylesheet.
  A done card does not roll. [#75 §3; node opacity 0.4; guard]
- **R-d2-m Badges are 19px, radius 2, 10px/600, padding 4×8.** Urgent is
  amber-600 with amber-50 ink (the NODE; #74's prose said red — #79 rules
  "URGENT is amber-600 everywhere"); Non-Urgent keeps the DASH (slate-50 fill,
  1px dashed slate-400, slate-500 ink) because Trello has no label meaning
  not-urgent; Hard/Medium/Easy as Pipeline's set; asset slate-100/300/500;
  lane blue-50/blue-500. [#74 §3 table; nodes 724:50684 · 724:50654 ·
  724:50604 · 724:50605]
- **R-d2-n Empty states come from the NODES**: `None slated today` (a day) and
  `None slated this week` (a collapsed lane with no cards) — a 310×104 white
  r4 card holding a 286×80 box, 1px dashed [6,3] slate-200, r4, padding 16,
  text 14/400 slate-300 centred. The copy and the tokens differ from #74's
  prose ("Nothing slated…") and from #80 §5's pattern A (slate-50, radius-md,
  32px) — raised with Miles; the node wins until he re-rules. [nodes
  810:121579 · 810:121571]
- **R-d2-o Removed on purpose, never reintroduced**: the stats strip, the
  week-level conflict badges, the notice banners and the Model Constants
  legend, the search field (no search, no filters — navigation is the month
  navigator and scrolling), the acknowledge/restore controls, the day-drag
  planner (card fields are read-only and derived; the card writes nothing),
  the requestor chip. [#74 §2/§3; JP 2026-09-05; withdrawal sweep]

## 4. Rollover (server law, shown here)

- **R-d2-p Unfinished work rolls forward by itself.** After every ARES sync
  tick (15 min — so a card that went done in Trello is seen before it would
  roll), every plotted row whose card is active, carries a difficulty and does
  not classify done: while its finish is before Manila's today, `starts_on`
  advances one WORKING day (`workday(d, 1)`, weekends and the ARES calendar's
  holidays skipped) and the finish is recomputed by the engine. The bar
  translates WHOLE — never stretched to cover the delay. A Friday finish
  lands on Monday at Saturday's first tick. [#75 §2; `src/services/rollover.ts`;
  `test/rollover.test.ts`]
- **R-d2-q Sprint membership follows the card's day.** The sprint holding the
  NEW finish day becomes the row's `sprint_id` (tail position, the PATCH
  route's rule); when no sprint covers it the row stays listed where it is
  (a gap is legal, invariant 12). [#75 §2; PLAN B10 — the no-sprint case
  decided, raised with Miles]
- **R-d2-r Audited, unmarked, unstoppable.** One `audit_log` row per moved
  card (`sprintItem.rollover`, actor `system`, before/after `starts_on` +
  `sprint_id`) — the constitution audits every schedule move (invariant 10) —
  and NO marker, badge, count or date-changed cue on any screen (Miles). A
  card that never completes keeps moving indefinitely; a card in a
  client-review lane classifies ongoing and therefore rolls (#80 §2 watch
  item). Catch-up after downtime happens in one pass; a second pass writes
  and audits nothing. [jp→miles #59 §3; #75 §2; #80 §2]

## 5. Verification law

- **R-d2-s** The render suite proves markup, counts, strings and the CSS
  rules above from shipped source (test/CLAUDE.md rules 1, 2, 6, 8). Only a
  browser proves the lanes' own scrolling, the fixed card height under a
  three-line title, the quote bar's curve and the 40% card — screenshot them
  on the local rt-test rig before CLOSE. Rollover is proven by running the
  job against the local db with a future `today` and reading the audit row.
