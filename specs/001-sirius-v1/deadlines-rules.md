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

_last-verified: 2026-09-11_

**Amended 2026-09-08.** Spec v1.3 §6.2 flips PLACEMENT from the forecast
finish to the plotted start (R-d2-c, R-d2-d); owl #86 rules the quote bar
amber-600 (R-d2-k), which settles its old disagreement with R-d2-m; owl #87
deletes the parked server half of the retired conflict machinery (R-d2-e).
Nothing else on this tab moved — the counts, the order, the holiday
treatment, the empty cards, the navigator and rollover are as they were.

**Amended 2026-09-11 (block 9).** Owls #88–#90 (JP yes, 2026-09-10) give this
tab the day control for real: the day-drag UN-RETIRES as §1a's own contract
(R-d2-t…z), and Sprint Schedules' day-grain gesture reverses to week-grain
(gantt-rules.md §1) to make room for it. R-d2-c's attribution corrects to
match — the WEEK is still the PM's, the DAY is now this tab's alone. A
re-dated sprint's displacement path (sprint-rules.md rule 30, new) reuses
this tab's *Outside any sprint* idiom (R-d2-q) but is documented there, not
here — displacement is a Sprint Schedules concern; only its DESTINATION
concept is shared.

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
- **R-d2-c A card's day is its plotted START** (`row.startsOn` =
  `sprint_items.starts_on`) — the day the team is slated to pick the work
  up. The WEEK is the PM's placement (Sprint Schedules, sprint-rules.md
  R10-a), defaulting to that week's FIRST WORKING DAY (owl #89 §2); the
  exact DAY within it is the Design Lead's, set by dragging on THIS tab
  (§1a, the day-drag contract, below) — that is the design lead's
  instrument and the reason this view runs on days. Both tabs write and
  read the ONE field (`sprint_items.starts_on`), so they can never
  disagree about where a card sits; Sprint Schedules only DISPLAYS it
  (gantt-rules.md rule 2). The finish (`WORKDAY(start, lead + design)`)
  keeps its other two jobs: half of R-d2-a's gate, and the condition
  rollover tests (R-d2-p). The WEEK a card counts toward follows the same
  key — a card that starts in one week and finishes in the next counts in
  the week it STARTS. **(reversed 2026-09-11 by owls #88/#89; was: "the
  PM's own click" — describing the block-7 reality where Sprint Schedules
  itself set the exact day; that mechanism is retired, gantt-rules.md
  §1.)** [spec v1.4 §6.5, 2026-09-11; `dlBuild` executed]
- **R-d2-d Weeks are the selected month's Mon–Fri weeks** — every week with
  at least one weekday inside the month, EXACTLY `lib/calendar.ts monthWeeks`
  (a straddling week shows under BOTH its months: Aug 31's week is August's
  fifth lane and September's first; the client helper `dlMonthWeeks` is
  executed against the engine over 24 months). The
  month is Manila's (`manilaToday` + `monthOffset`). The navigator's label is
  the first shown Monday → the month's last day: `Aug 31 – Sept 30, 2026`
  (the frame's `Sept`). Cards whose START falls outside the shown weeks are
  not drawn — so a card that starts in the last shown week and finishes in the
  next month is drawn here, and one that starts next month is not, whatever
  its finish says. [node 731:100859; PLAN B3/B16; spec v1.3 §6.2, 2026-09-08]
- **R-d2-e The tab reads the schedule's rows.** No `/deadlines` fetch; the old
  route, the conflict engine, acknowledgements and the day plan are DELETED
  server-side (owl #87, JP 2026-09-08 — overruling the 2026-09-05 park, and
  §6.3's own "parked, not deleted"; the stored acknowledgements were archived
  by migration 011, never dropped). [PLAN B1/B9; withdrawal sweep]

## 1a. The day-drag contract — Deadlines only (owls #88/#89, v1.4 §6.5;
    un-retired, block 9, JP 2026-09-11)

Owl #88 (JP yes, 2026-09-10) reverses block 7's day-grain gesture on Sprint
Schedules (gantt-rules.md §1) and moves the ONLY day control to this tab —
the card the Design Lead drags is no longer read-only or derived (R-d2-o,
above, is reversed to match). This section is deadlines-rules.md's own
version of gantt-rules.md §1: the drag contract for THIS surface.

- **R-d2-t Source and hit-test.** The drag source is `.dlcard` itself
  (`on-pointerdown="['dlDragStart', c.rowId]"`) — Deadlines has no bar to
  pick up (R-d2-j: fixed cards, not gantt bars). `dlDragStart`/`dlKey`
  ignore an event whose target is not the card node itself (amendment
  12) — a link inside keeps its own click and keys. Hit-testing is
  `document.elementFromPoint` → the closest `.dlday[data-day]` cell
  INSIDE the same `.dllane[data-week]` the card's own week lane renders;
  `.closest()` walks UP from wherever the pointer is, so landing on
  ANOTHER card resolves to that card's own column — accepted when the
  day is legal, refused only by the four conditions (R-d2-u), never by
  what else was there. A hit outside the lane (a different week, no
  `.dlday` ancestor) is `refused`, same as failing a bounds check.
  Collapsed lanes carry no drag — a card must be EXPANDED to be dragged.
  **(corrected REVIEW 2026-09-12; was: "another card" among refused
  hits — `.closest()` finds the same column regardless of which card
  sits on it.)** The card's `role` is `group`, not `button` (amendment
  15 — an ARIA button may not contain its own Trello/Figma links).
  [`frontend/scripts/90-events.js dlDragStart/dlDragMove`]
- **R-d2-u A valid drop satisfies FOUR conditions at once, checked in this
  order** — the Design Lead is told the first thing wrong with the day in
  the order they would fix it:
  1. `OUT_OF_WEEK` — inside the card's ASSIGNED week (the week the PM
     placed it in, sprint-rules.md R10-a) — checked FIRST, since only
     rollover may cross a week boundary (R-d2-p, below; sprint-rules.md
     R10-d);
  2. `OUT_OF_SPRINT` — inside the target sprint's own dates;
  3. `PAST_DEADLINE` — no later than the card's own deadline;
  4. `NOT_A_WORKDAY` — a working day on the ARES calendar
     (`lib/calendar.ts`, invariant 11) — the DROP never judges this
     client-side, the server is its sole backstop (sprint-rules.md
     R10-e's replacement, `dlDayPlaceable`); the keyboard nudge is the
     one client-side use of the loaded calendar (R-d2-x, amendment 13) —
     the drop still declines it.
  All four must hold; failing any one refuses with that condition's own
  frozen message, in the same voice as the other three (sprint-rules.md
  R10-b's replacement). [owl #89 §1/§3, v1.4 §6.5]
- **R-d2-v Refused previews pale and snaps back; nothing commits.** A drop
  that fails any condition renders `.dlcard.refused` (opacity .45 + a
  dashed outline — block 7's Sprint-Schedules refused treatment, reused
  here) and the card returns to its last saved day on release; no write,
  no audit row. A legal target lights `.dlday.target` (a violet tint)
  while the drag is live. [`40-deadlines.css`; `frontend/scripts/
  40-app-state.js dlDrag`]
- **R-d2-w Commit is on release, when the day changed and is legal.**
  `dlDragEnd` PATCHes `{ starts_on }` to the exact dropped day —
  optimistic, the card shown at the new day until the server answers,
  rolled back with the server's message on a 4xx (the existing error
  banner). Releasing back on the card's own day, or on a refused day,
  writes nothing. **Escape cancels** — `dlDragCancel`, bound on the window
  while a drag is live and captured (`{ capture: true }`, not bubbled —
  Deadlines has no add-search field to protect, R-d2-o, but the same
  capture discipline applies to whatever had focus when the drag started),
  snaps the card back to its last saved day and sends no write.
- **R-d2-x The keyboard path is the same instrument, not a separate one**
  (v1.4 §8: "NFR-9 is not optional decoration"). A focused `.dlcard`
  (`tabindex="0"`, `role="group"` — R-d2-t) answers ArrowLeft/ArrowRight
  with `dlNudge`; an Alt/Meta/Ctrl chord and every other key are ignored
  (amendment 12). **The nudge steps OVER a holiday** (amendment 13) — it
  walks the loaded calendar rather than landing on one and refusing, so
  the keyboard reaches every day the pointer's drop can (R-d2-u still
  declines the calendar for the DROP itself). Nudging past the week, the
  sprint or the deadline still refuses through the SAME write and
  conditions as the pointer (R-d2-u, one validator), same message — now
  flashed on the card too (`dlRefuse`, amendment 14), the shell's
  `.banner` carrying `role="status"` so a refusal reaches assistive
  technology by key and by pointer alike. Escape cancels. [v1.4 §8;
  `frontend/scripts/90-events.js dlKey/dlNudge/dlRefuse`]
- **R-d2-y Audited on success, silent on refusal; gated by SURFACE only.**
  One `audit_log` row per committed day-drag or nudge (before/after
  `starts_on`), same shape as any other schedule move (invariant 10); a
  refusal (any of the four conditions) writes and audits nothing — a
  refusal is not a state change. **Who may drag: gated by SURFACE only**
  (JP, 2026-09-11) — any project member may PATCH a card's `starts_on`
  from this route; the route re-checks session and project membership
  like every route (invariant 9) and adds no per-user or role check. "The
  Design Lead" names who in practice uses this tab, not a permission
  Sirius enforces — Sirius has an allow-list, not roles.
- **R-d2-z Rollover stays exempt, as always.** `rollUnfinished` (§4,
  R-d2-p) never calls the day-drag's validator and is not bound by the
  week (or any other) condition here — it is the one gesture, system
  actor, that DOES cross a week boundary. This section governs a PERSON's
  drag/nudge only.

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
- **R-d2-h Lane states come from the static `LIST_STATES` table**
  (`src/services/status-rules.ts`), not the keyword interim — spec v1.3 §7a,
  owl #82, 2026-09-08. `excluded` cards never render on the board.

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
- **R-d2-k The quote bar means Urgent and nothing else.** A 4px amber-600 band
  (owl #86, 2026-09-08 — the node's red was wrong on hue and right on
  geometry; this is now the SAME amber R-d2-m gives the Urgent badge, where
  the two rules used to contradict each other) on the LEFT edge only, drawn as
  the frame's curved path (an inline SVG
  clipped by the card's own radius), never `border-left` — the corners
  square off and "shipped wrong twice". Non-Urgent cards get NO bar, not a
  grey one, not a pale one. It is not a conflict, past-deadline or at-risk
  signal; there is no second accent colour and NO conflict indicator on this
  tab at all — that is the design, not a gap. **Re-checked 2026-09-11, block
  9 survey: amber-600 still stands** — no owl or v1.4 section touches the
  quote bar's colour; the day-drag contract (§1a, below) adds no accent of
  its own to the card, refused/dragging states included (deadlines-rules.md
  §1a, R-d2-v — a refused drag wears a wash, never a second bar colour).
  [#74 §3; SVG export; guard: no `border-left` on `.dlcard`; the bar only
  under `.urgent`]
- **R-d2-l A done card is the whole card at opacity 0.4** — one property,
  nothing underneath restyled, the only `opacity` rule in the stylesheet.
  A done card does not roll. [#75 §3; node opacity 0.4; guard]
- **R-d2-m Badges are 19px, radius 2, 10px/600, padding 4×8.** Urgent is
  amber-600 with amber-50 ink (the NODE; #74's prose said red — #79 rules
  "URGENT is amber-600 everywhere"). **The non-urgent state draws NO chip at
  all** (JP 2026-09-08) — it was display noise, so the card is silent about
  urgency unless it is urgent; the dashed slate variant this rule used to
  carry, and its stylesheet recipe, are withdrawn. Hard/Medium/Easy as
  Pipeline's set; asset slate-100/300/500;
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
  legend, the search field (no search, no filters — navigation is the
  month navigator and scrolling), the acknowledge/restore controls, the
  requestor chip. **(reversed 2026-09-11 by owls #88/#89, v1.4 §6.5; was:
  "the day-drag planner (card fields are read-only and derived; the card
  writes nothing)" also listed here as removed-on-purpose — it is
  UN-RETIRED, built in this block as the tab's day-drag contract, §1a
  below; the card is no longer read-only.)** [#74 §2/§3; JP 2026-09-05;
  withdrawal sweep; un-retired block 9, owls #88/#89]

## 4. Rollover (server law, shown here)

- **R-d2-p Unfinished work rolls forward by itself.** After every ARES sync
  tick (15 min — so a card that went done in Trello is seen before it would
  roll), and only for a project whose LATEST read (a full sync or a push
  drain) succeeded within the last 65 minutes — a failed or missing read
  sits the tick out, its rows counted as skipped (review R3-1) — every
  plotted row whose card is active, carries a difficulty and does not
  classify done: while its finish is before Manila's today, `starts_on`
  advances one WORKING day (`workday(d, 1)`, weekends and the ARES calendar's
  holidays skipped) and the finish is recomputed by the engine. The bar
  translates WHOLE — never stretched to cover the delay. A Friday finish
  lands on Monday at Saturday's first tick. **This move is exempt from the
  plotting guards** (sprint-rules.md §10, R10-d): `rollUnfinished` never
  calls `plotIssue`, so a roll can and does carry a row outside its sprint's
  range and past its own deadline — the whole point of "no cap and nothing
  on screen recording it." [#75 §2; `src/services/rollover.ts`;
  `test/rollover.test.ts`; block 7, JP 2026-09-08]
- **R-d2-q Sprint membership follows the card's day, which is its START.** The
  sprint holding the NEW `starts_on` becomes the row's `sprint_id` (tail
  position, the PATCH route's rule); when no sprint covers it the row stays
  listed where it is (a gap is legal, invariant 12). A row whose start stays
  put while its forecast finish crosses a boundary does NOT change sprint —
  it is filed where its Deadlines column and the head of its bar are, per
  R-d2-c. #75 §2 read this off the finish because the finish was then the
  card's day; spec v1.3 §6.2 (2026-09-08) makes the start the card's day and
  supersedes that half. [spec v1.3 §6.2; #75 §2 superseded; PLAN B10 — the
  no-sprint case decided, raised with Miles]
- **R-d2-r Audited, unmarked, unstoppable.** One `audit_log` row per moved
  card (`sprintItem.rollover`, actor `system`, before/after `starts_on` +
  `sprint_id`) — the constitution audits every schedule move (invariant 10) —
  and NO marker, badge, count or date-changed cue on any screen (Miles). A
  card that never completes keeps moving indefinitely; a card in a
  client-review lane classifies ongoing and therefore rolls (#80 §2 watch
  item). Catch-up after downtime happens in one pass; a second pass writes
  and audits nothing. The move is ONE conditional update keyed on what the
  job read, so a row a PM rewrote in between is left alone (raced) and
  re-read next tick; a move whose audit row does not land is taken back
  (failed); a walk past the step cap leaves the row (capped); every project
  gets one `sync_runs` row per run (source `rollover`, the five counts)
  (review R3-2/R3-3/R3-5/R5-6). [jp→miles #59 §3; #75 §2; #80 §2]

## 5. Verification law

- **R-d2-s** The render suite proves markup, counts, strings and the CSS
  rules above from shipped source (test/CLAUDE.md rules 1, 2, 6, 8). Only a
  browser proves the lanes' own scrolling, the fixed card height under a
  three-line title, the quote bar's curve and the 40% card — screenshot them
  on the local rt-test rig before CLOSE. Rollover is proven by running the
  job against the local db with a future `today` and reading the audit row.
  **The day-drag contract (§1a) ships only after a real-pointer pass, same
  discipline as gantt-rules.md rules 46–49** (new, block 9): no synthetic
  pointer event proves a real down/move/up sequence drives `.dlcard`;
  `test/deadlines-drag.test.ts` names its own gap the same way — calling
  `dlDragStart`/`dlDragMove`/`dlDragEnd` directly proves wiring, not the
  gesture. Escape mid-drag is proven by executed handler only (no available
  tool holds a pointer button mid-gesture); the pointer drop, the four
  refusals and the arrow-key nudge are proven live on rt-test before CLOSE.
