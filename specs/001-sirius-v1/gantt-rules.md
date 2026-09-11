# Gantt planner — current law (drag, geometry, verification)

**Authority.** Current planner law for the Gantt's drag contract, geometry,
standing decisions and verification. Planner BEHAVIOURS — pins, capacity,
sprint membership, the sprints modal, Suggest, the row action cluster, the
chip grammar and the search-based add row — live in `sprint-rules.md` (split
out 2026-09-05 at the 20KB rulebook cap). Rule numbers are GLOBAL across the
two files, so a citation such as "rule 26" or "§5" still names exactly one
rule. History and mechanism narratives live in `gantt-frame-notes.md`. If a
rulebook and a narrative disagree, the rulebook wins — fix the narrative. Each
rule ends with a source tag pointing at the mechanism and evidence.
Pipeline-tab and Requests-tab rules (R-warn-*, the two-valued Requests STATUS,
the requestor clip) are out of scope — see `pipeline-frame-notes.md` and
`requests-frame-notes.md`.

_last-verified: 2026-09-11_

## 1. The drag contract — Sprint Schedules (week-grain) and Deadlines
   (day-grain) (block 9, JP 2026-09-11, owls #88/#89 — reverses block 7's
   day-grain gesture here and un-retires the day-drag on Deadlines)

Owls #88/#89 (JP yes, 2026-09-10) reverse block 7's day-grain pointer-drag
on `.gitem`: **the day belongs to the Design Lead, on Deadlines only.**
Sprint Schedules returns to week-grain placement (pre-block-7, corrected
for the first-working-day default — owl #89 §2). The Deadlines-side
contract (four conditions, keyboard, audit) is documented in full in
`deadlines-rules.md` §1a — this file states only what changes HERE, plus
the parts (Escape, no ghost, no HTML5 DnD) that bind both surfaces.

1. **A drag source must stay hit-testable in every state, on whichever tab
   owns the gesture.** Source is `.gitem` here (rule 2), `.dlcard` on
   Deadlines (deadlines-rules.md §1a, R-d2-t). `pointer-events: none`,
   `visibility: hidden` or `display: none` on the source or an ancestor
   must never make it unclickable, in any state. Each tab's own suite
   proves its own states: `test/drag-hittest.test.ts` here (rule 25),
   `test/deadlines-drag.test.ts` there. [R-g-1, batch 7; principle
   carried, wording generalised block 9]
2. **The placement source is `.gweek`, not `.gitem`.** `.gitem` is
   DISPLAY-ONLY from block 9 on — it still draws the row's placed bar
   (`itemBar`, colour, `late`, a `title`, rule 42) but takes no pointer
   handler: no `mousedown`, no `dragging`/`refused` class, `cursor:
   default`. The gesture lives on every row's `.gweek` track cells
   (placed rows included): `weekHover`/`weekLeave` light `.gweek.hover`;
   `weekPlace` on click PATCHes `{ week }` (rule 6). **(reversed
   2026-09-11 by owl #88; was: "The drag source is `.gitem`" — picked up
   by `barDragStart` on `mousedown`, driven day-grain by
   `barDragMove`/`barDragEnd`, block 7.)** [`90-events.js
   weekHover/weekLeave/weekPlace`; `40-schedules.html`]
3. **No HTML5 drag-and-drop, on either surface.** `draggable` stays
   absent from shipped source on both tabs — swept as an EMPTY set.
   Pointer events were chosen because HTML5 DnD fails inside sticky and
   scrolling containers, which both layouts have (build-spec v1.4
   §5.2/§6.5). [unaffected]
4. **Sprint Schedules snaps to WEEKS — day-grain snap is retired.**
   `weekHover`/`weekPlace` read the `.gweek` column by its own index
   (`@index` into `plannerWeeks`); no day-level read remains on this tab.
   `dayAtX`, `plusLeft` and `placeable` are DELETED —
   `50-gantt-geometry.js` keeps only `itemBar`, `deadlineTick`,
   `dayIndex` and `barLeftAt` (display caller only, rule 13). Deadlines'
   own day-level read is a different geometry problem (a fixed 5-column
   lane, not a track) — deadlines-rules.md §1a, R-d2-t. **(reversed
   2026-09-11 by owls #88/#89; was: `barDragMove` read the day via
   `dayAtX`, block 7.)**
5. **A week click either lands or is a no-op — no drag preview to
   refuse.** `weekPlace` always resolves to a day inside the clicked week
   (rule 6); this tab carries no per-day guard (sprint-rules.md R10-a) and
   so nothing to preview refused. The refused-preview idiom (pale wash,
   snap-back) moves whole to Deadlines, where a drop CAN fail —
   deadlines-rules.md §1a, R-d2-v, reusing this tab's visual treatment.
   **(reversed 2026-09-11 by owls #88/#89; was: the bar previewed
   `refused` via `dragLeft`/`barLeftAt`, gated by `placeable`, block 7 —
   all retired.)**
6. **Commit is `weekPlace`'s click** — PATCHes `{ week }` (the clicked
   week's Monday ISO); the server resolves `starts_on` to that week's
   FIRST WORKING DAY (`firstWorkdayOfWeek`, owl #89 §2 — never a bare
   Monday) and judges the sprint check against the target (sprint-rules.md
   rule 30). The bar draws optimistically at the week's Monday until the
   server answers, rolling back on a 4xx. A click on the row's own week is
   a no-op (rule 38, sprint-rules.md). Deadlines commits on release —
   deadlines-rules.md §1a, R-d2-w. **(reversed 2026-09-11 by owls #88/#89;
   was: "Commit is `mouseup`" on `.gitem`'s day-grain drag, block 7.)**
   [`schedule.ts`; `sprint-items.ts firstWorkdayOfWeek`]
7. **Escape cancels, on both surfaces.** Deadlines' `dlDragCancel`
   (deadlines-rules.md §1a) snaps back and sends no write; this tab has no
   mid-gesture state to cancel — a hover leaving `.gweek` before a click
   just clears `hoverRow`/`hoverWeek`. Matches build-spec v1.4 §6.5's
   Escape rule. [unaffected in principle]
8. **No ghost element, on either surface.** The bar or the card is the
   only thing that moves; no `.gghost` layer exists. [unaffected]
9. **No drag-lifetime listeners remain on Sprint Schedules to bind.**
   `weekHover`/`weekLeave`/`weekPlace` are plain per-cell handlers, no
   armed/disarmed state — no `mousemove`/`mouseup`/`keydown` window
   binding on this tab any more. Deadlines' own lifetime binding
   (`dlDragMove`/`dlDragEnd` on the window while live; `dlKey` per-card,
   focus-gated) is deadlines-rules.md §1a's rule. **(reversed 2026-09-11
   by owls #88/#89; was: `mousemove` bound unconditionally on every
   `.gtrack`, `mouseup`/`keydown` armed only during a drag, block 7 — all
   deleted with `barDragStart`/`barDragMove`/`barDragEnd`/`barDragCancel`/
   `barDragUp`/`barDragKey`/`barDragStop`.)**
10. **Multi-row relative-shift drag (build-spec v1.3/v1.4 §5.2) is not
    built.** Unaffected — still Sprint-Schedules-only, still week-grain
    when built (PLAN.md "Not built"; owl #88 "Not affected").
11. **Cross-sprint drag is not built, on either tab.** A week click's
    valid targets are confined to weeks within the row's own sprint
    (sprint-rules.md rule 30); Deadlines' week bound (deadlines-rules.md
    §1a, R-d2-u) plus sprints' always-Mon/Fri-aligned boundaries (rule 33)
    exclude it there too, structurally, not merely by omission.
    **(reversed 2026-09-11 by owls #88/#89; was: keyed off
    `placeable(row, day)`, R10-e, retired with the day-grain gesture.)**
12. **The grab offset (`dragGrab`) is RETIRED — moot on both surfaces.** A
    week click has no sub-week pixel precision to preserve; Deadlines'
    day-drag drops into discrete cells under the pointer
    (deadlines-rules.md §1a, R-d2-t), not a continuous track — nearest
    cell at release IS the mechanic. **(reversed 2026-09-11 by owls
    #88/#89; was: `barDragStart` stored the pointer's offset from
    `row.startsOn` as `dragGrab`, block 7.)**
13. **`barLeftAt(row, day)` is kept, DISPLAY-CALLER ONLY** — it positions
    the resting `.gitem` bar (rule 19) but is no longer called by any drag
    preview on either tab. `dragLeft` (state) is DELETED. **(reversed
    2026-09-11 by owls #88/#89; was: `barLeftAt` fed the drag preview's
    `dragLeft`, block 7.)**
14. **A lost pointerup cancels rather than commits — Deadlines only.**
    `dlDragMove` checks the event's buttons on every move; a release the
    window never saw fires `dlDragCancel` on the next move rather than
    arming for a later unrelated commit (deadlines-rules.md §1a). Sprint
    Schedules has no drag-lifetime state left to corrupt (rule 9).
15. **No drag lock remains on Sprint Schedules to stand down for.**
    `weekHover`/`weekLeave` are plain hover handlers, inert under
    `sprintItemSaving` same as any control here — nothing else competes.
    Deadlines' `dlDrag` names one `rowId` at a time, so a neighbouring
    card mid-drag is a no-op by construction. **(reversed 2026-09-11 by
    owls #88/#89; was: `plotHover` gated on `app.get('dragRow')`, block 7
    — both deleted.)**
16. **Escape is captured, not bubbled — where it still matters.**
    Deadlines' window Escape handler (deadlines-rules.md §1a) is bound
    `{ capture: true }`, stopping propagation so a bubble-phase Escape
    never reaches whatever had focus first. Sprint Schedules keeps this
    rule's ORIGINAL hazard for its add-search field (sprint-rules.md
    R8-h), unaffected — though no `.gitem` drag remains to capture ahead
    of it.
17. **The `.gweek` cells are swept as drop targets in their own right —
    unchanged, now load-bearing for PLACEMENT itself, not only the drag it
    sat beside.** A `pointer-events: none` on their chain (e.g. `.gtrack`)
    is banned even though `.gitem` carries no handler. `.gtrack` takes
    `weekHover`/`weekLeave`/`weekPlace` for every row, placed or not.
    `test/drag-hittest.test.ts`'s week-cell sweep proves this non-vacuous
    against `.gweek` and `.gantt .gtrack` directly. [unaffected in
    substance, rewired to the new handlers]
18. **The placement affordance fills the whole `.gweek` cell — no
    separate `+` element.** Block 7's `.gplus`/`.ghovcell` are REMOVED;
    the week's own cell is both hover and click target, tinted
    `.gweek.hover` (block 7's `.ghovcell` colour, carried over). No
    unit-width arithmetic remains to get wrong at either clipped edge —
    the cell IS the target. **(reversed 2026-09-11 by owl #88; was: a
    unit-wide `.gplus`, `var(--gu)` square, filling a `.ghovcell` day
    column, block 7.)** [`35-gantt.css`; `40-schedules.html`]

## 2. Geometry

19. **`itemBar(row)` is the ONE geometry helper for the bar** — a work card
    draws exactly one box (start to computed finish, finish day inclusive),
    never a run of phase segments: `phaseRun`/`phaseBars`/`.gseg` belong to
    the phase-segment gantt retired 2026-08-28 and do not exist in the
    shipped source. The template does no arithmetic and no `{{#if}}` on
    geometry — `left`/`width` arrive as 2dp strings, `cls` names one phase
    class for colour only (`itemPhase`, below). [supersedes batch 8
    §geometry; `frontend/scripts/50-gantt-geometry.js`]
20. **Minimum grab width is 24px (`MIN_GRAB_PX`/`MIN_GRAB_UNITS`), done as
    arithmetic in `itemBar`, never as CSS.** A CSS minimum would widen the
    rendered box after the arithmetic and visibly stretch every short bar;
    `test/sprint-schedule-bars-footer.test.ts` bans the width properties by
    name. The box anchors left and, in the final column, extends LEFT so the
    widened box never leaves the track — `left = max(0, min(l, TOTAL_UNITS −
    width))`, carried over unchanged from the retired `phaseRun`'s rule
    [batch 8 §minimum-grab, §direction].
21. **A row with no `startsOn`/`finish` (unplotted, unforecastable, or fully
    clipped by the window) draws no bar at all** — `itemBar` returns `[]` and
    the template emits nothing; the violet `+` (or the row's own drag, if
    already placed) is what a PM acts on instead. [`itemBar`]
22. **Colour is `itemPhase(row)` only — the row's OWN task-title prefix,
    never a second source of truth**: `sketch`/`render` by prefix match,
    `work` for everything else and for an unrecognised prefix (a wrong guess
    costs a swatch, not a forecast — the 2026-08-27 lane-by-title defect was
    this exact match promoted into arithmetic elsewhere). There is no
    `.review`/`renderOverdue` class and no per-segment colour map: one bar,
    one phase class, plus `late` layered on top when the row qualifies
    (R9-c). The legend swatches reuse these same classes. [supersedes R4,
    batch 9 §legend; corrects the retired `.gseg.review`/`renderOverdue` map]
23. **Month and wk labels derive from real week dates**: a week belongs to
    its Monday's month, wkN is its ordinal within it, and week keys are the
    local Monday (invariant 5, v4.2.0). [R2]
24. **Bar span = empirical forecast phases** from `lib/forecast.ts` via
    `lib/calendar.ts` — no new forecast math, no edits to `lib/**`; the row
    carries `startsOn`/`finish` off the server, so the bar and the
    FORECASTED column are one field and cannot disagree. [R3]
25. **Which tests guard what**: `test/drag-hittest.test.ts` — hit-testability
    of `.gweek` cells and the week-cell sweep (rule 17), the display-only
    `.gitem` states (late; `dragging`/`refused` removed — rule 2), the
    empty `draggable` set; `test/deadlines-drag.test.ts` (new, block 9) —
    hit-testability and states of `.dlcard`/`.dlday` on Deadlines, the
    four-condition refusal sweep, Escape and the arrow-key nudge
    (deadlines-rules.md §1a); `test/sprint-schedule-bars-footer.test.ts` —
    bar and deadline-tick geometry on both axes against a frozen oracle
    (horizontal within the 0.02 pp bound, vertical by exact equality), the
    dead-class bans (`.grun`, `.gbar`, `.gseg.review`, `.gdragging`,
    `.gplus`, `.ghovcell`, `.gitem.dragging`, `.gitem.refused`, …), footer
    capacity; `test/sprint-items-plot.test.ts` (new, block 9 — split of
    `test/sprint-items.test.ts` at the plot-guard tests) — `OUT_OF_WEEK`,
    `weekKeyOf`, `firstWorkdayOfWeek` alongside the three carried guards;
    `test/gantt-legend.test.ts` — each phase colour declared once. Guards
    assert the RULE, never a snapshot. **(reversed 2026-09-11 by owls
    #88/#89: the day-grain sweeps `test/sprint-schedule-
    deadline.test.ts:379-637` and part of `test/sprint-schedule-bars-
    footer.test.ts:436-890` (incl. Escape-mid-drag) and the `.gitem`
    drag-source sweep `test/drag-hittest.test.ts:554-840` are deleted;
    their behaviour's test coverage moved to Deadlines' own suite.)**
    [supersedes batch 8–9; review sweep; block 9]

## 4. Standing decisions — deliberately not done

40. **`.gitem`'s CSS carries the bar's whole visual contract alone** — there
    is no second `.grun`/`.gghost` declaration to keep in step with it; those
    selectors are swept by name in `test/sprint-schedule-bars-footer.test.ts`
    and `test/drag-hittest.test.ts` as classes that must NOT appear.
    [supersedes review sweep 2026-08-18, T162]
41. **The bar's vertical band is deliberate and unchanged by block 7** —
    affordance and target agree on both axes; nothing widens it back. [JP
    2026-08-18, batch 9]
42. **The bar DOES carry a `title`** — `` `${startsOn} → ${finish}` ``, plus
    "· past the client deadline" when `late` — this is the resting state;
    block 7 blanks it to an empty attribute only for the duration of a drag
    so the native tooltip cannot fight the gesture, and restores it after.
    [supersedes the retired no-title rule that named `.grun`/rule 15 — that
    rule and its numbering no longer exist; `itemBar`]
43. **No ghost, no `setDragImage()`** — there is no HTML5 drag to snapshot a
    ghost from (§1 rule 3); the bar's own box is the only thing that moves.
    [supersedes batch 9 §honest-line]
44. **Not built, by product**: the sprint-header checkbox; a click-to-open
    range picker on the bar; the multi-row relative-shift drag and
    cross-sprint drag of build-spec v1.3/v1.4 §5.2 (§1 rules 10–11);
    dimming out-of-range weeks; hiding holiday days client-side (the
    server refuses them — deadlines-rules.md §1a, relocated from
    sprint-rules.md R10-e). Accept keeps the label "Accept". Cards
    carrying a suggest note but absent from `plan` surface nowhere —
    flagged, stands. **Keyboard nudging of a bar is BUILT, block 9 — not
    on this tab.** v1.4 §8 ("NFR-9 is not optional decoration") and owls
    #88/#89 put the only day control, keyboard included, on Deadlines: a
    focused `.dlcard`'s ArrowLeft/ArrowRight nudge the day one working day
    at a time through the same write and the same four conditions as the
    pointer drag (deadlines-rules.md §1a, R-d2-x). Sprint Schedules' own
    week-grain placement has no keyboard equivalent and none is owed by
    v1.4 §8 (the day-drag is named as the instrument needing one, not the
    week click) — that gap is unchanged and still stands as not-built.
    **(reversed 2026-09-11 by owls #88/#89, v1.4 §8; was: "keyboard
    nudging of a bar" listed here as a deliberate non-build, batch 3.)**
    [R6; batch 3; PLAN.md block 7 "Not built" / block 9]
45. **`.gitem` does not restate `--gbar-h` or a translate anywhere else** — a
    second copy can be re-tuned alone. [supersedes batch 9, which said the
    same of the retired `.gseg`]

## 5. Verification law

46. **A drag interaction ships only after a real-pointer pass.** There is no
    jsdom and no browser runner in this repo; every planner test is Ractive
    `toHTML()` or a read/execution of shipped source — none of it proves a
    pointer gesture can start and drive `.gitem`. [batch 7 §why-no-test;
    state-log 2026-08-18]
47. **No synthetic mouse events, ever, for a drag test.** Calling
    `barDragStart`/`barDragMove`/`barDragEnd` directly proves wiring, not
    that a real pointer down-move-up sequence drives them — say so in test
    names and file headers. (The retired contract said this of synthetic
    `DragEvent`s; block 7 has no HTML5 drag left to avoid, but the same gap
    exists for MouseEvents and the same rule applies.) [supersedes batch
    7–9; state-log 2026-08-18]
48. **Real-pointer procedure**: chrome-devtools MCP — `take_snapshot` for
    uids, then a real down/move/up sequence over the `.gitem` source and the
    target day (`drag(from_uid, to_uid)` where the tool's drag maps to that,
    else discrete pointer calls covering the same path). Attach event
    listeners BEFORE dragging; read back only summarised counts. [supersedes
    batch 7 root-cause pass; test/CLAUDE.md rule 4]
49. **Live verification writes are real**: passes run against the deployed
    site on rt-test (`tx8gDsTH`, synthetic fixtures only). Record every
    touched row's `starts_on` before touching anything and restore it after —
    zero net change. [supersedes JP 2026-08-18 ("slottedWeek"); STATE.md
    §Still open]
50. **Comments can trip source-regex guards**: a drift guard counting
    occurrences in raw source counts comments too. When a guard fires on
    prose, reword the prose — the guard is right. [batch 8 §defect; batch 9
    §defect]
51. **Ractive `{{! … }}` in element-content position terminates at the FIRST
    `}}`** and leaks the remainder as text; `build.js` cannot catch it — an
    AST-scan test does. `{{!expr}}` in attribute position is a negation and
    fine. [batch 3 §hazard]
52. **A hit-testability cure must hold for the whole drag**: only a
    top-level, state-free `pointer-events: auto` exempts an ancestor — a
    `:hover` or `@media`-scoped cure evaporates mid-drag. Bans still count
    state-scoped rules. [batch 8 fix pass; drag-hittest]

