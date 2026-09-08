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

_last-verified: 2026-09-09_

## 1. The drag contract (pointer-drag, block 7, JP 2026-09-08 — supersedes the
   HTML5 drag-and-drop contract this section held through 2026-08-28)

The HTML5 `draggable`/dragstart/dragover/drop contract rules 2–18 once
described here (`.grun`, `.growr`, `dropOnBar`/`dropOnWeek`, `ganttDragging`,
the phase-segment run box) died with the phase-segment gantt on 2026-08-28 —
`test/sprint-schedule-bars-footer.test.ts` and `test/drag-hittest.test.ts`
assert every one of those names GONE from the shipped source. Between
2026-08-28 and block 7 (2026-09-08) Sprint Schedules had click-to-place only
and no drag at all. Block 7 rebuilds dragging as pointer events on the single
urgency-coloured bar (`.gitem`) that replaced the phase-segment run. The
numbering below keeps rule 1's principle — that survived every rebuild — and
replaces the rest with what is actually wired in `frontend/scripts/90-events.js`
and `frontend/scripts/50-gantt-geometry.js`.

1. **A drag source must stay hit-testable in every state.** The source is
   picked up and driven by `mousedown`/`mousemove`/`mouseup` handlers, not by
   the browser's own HTML5 drag machinery, but the principle is unchanged:
   `pointer-events: none`, `visibility: hidden` or `display: none` on the
   source or an ancestor — at rest, hovered, dragging, refused, late or
   saving — must never make it unclickable. `test/drag-hittest.test.ts`
   enumerates `.gitem`, `.gitem.late`, `.gitem.dragging`, `.gitem.refused`,
   `.gitem.dragging.refused`, `.gitem.work` and the `:hover`/`:active`
   states and proves each stays hit-testable. [R-g-1, batch 7; rebuilt block
   7, `test/drag-hittest.test.ts`]
2. **The drag source is `.gitem`** — the row's one coloured bar
   (`frontend/templates/views/40-schedules.html`), the same element `itemBar`
   draws and the PM already reads as the row's placement. There is no
   separate run/segment box: a work card shows one phase class (`work`,
   `sketch` or `render`, colour only — `itemPhase`) plus `late` when it
   qualifies, and `dragging`/`refused` are added only for the gesture's
   duration. No `.grun`, no per-segment handle — never built for the single-
   bar model. [`on-mousedown="['barDragStart', ...]"` on `.gitem`; block 7]
3. **No HTML5 drag-and-drop, anywhere in this contract.** `draggable` stays
   absent from the shipped source — `test/drag-hittest.test.ts` sweeps it as
   a set that must stay EMPTY, separately from the pointer sources. Pointer
   events were chosen because HTML5 DnD fails inside sticky and scrolling
   containers, which this layout has (build-spec-v1.3 §5.2). [block 7]
4. **Day-grain snap, not week-grain.** `barDragMove` reads the day under the
   pointer through `dayAtX(clientX, rect, weeks)` — the same workday-indexed
   axis `dayAtX` gives the click-to-place `+` (sprint-rules.md R10-a) — and
   stores it as `dragDay`; the bar's preview position comes from `plusLeft`
   at that day. Snapping to a week column, and the mid-drag chip showing a
   week and a delta, described the retired contract and are not built.
5. **The bar previews at the dragged day with its OWN width unchanged** —
   `dragLeft` repositions the same box `itemBar` already sized; nothing
   stretches or shrinks it mid-drag. A day the row may not have (outside its
   sprint, past its deadline, not a working day — sprint-rules.md R10-b/e)
   still previews, wearing `refused`, and does not commit on release.
6. **Commit is `mouseup`**, and only when the day changed and is placeable:
   `barDragEnd` PATCHes `starts_on` to `dragDay`, optimistic — the bar stays
   at the dropped day until the row reloads — and rolls back with the
   server's message shown in the existing error banner on a 422
   (sprint-rules.md R10-b). Releasing on the day the row already sits on, or
   on a refused day, writes nothing.
7. **Escape cancels** — `barDragCancel` snaps the bar back to its last saved
   position and sends no write, matching build-spec-v1.3 §5.2's Escape rule
   for the retired multi-row shift.
8. **No ghost element.** The bar itself is the only thing that moves; there
   is nothing behind it to snapshot and nothing painted in a `.gghost`
   layer — that class does not exist in the shipped template.
9. **`mousemove` and the release/cancel handlers bind only while a drag is
   live** — attached in `barDragStart`, removed in `finally` — so an idle
   pointer never carries drag listeners and a stray `mouseup` elsewhere on
   the page cannot commit a drag that never started.
10. **Multi-row relative-shift drag (build-spec-v1.3 §5.2) is not built.**
    One row drags at a time; dragging several rows a week apart and
    preserving that spacing is out of this pilot (PLAN.md "Not built").
11. **Cross-sprint drag by dropping on another sprint's rows is not built.**
    A row moves sprints only by landing on a day inside a different sprint's
    own range (sprint-rules.md rule 30, R10-a); there is no drop target that
    reassigns a sprint independent of the day.

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
    of every enumerated `.gitem` source and state, the empty `draggable` set,
    ancestor sweeps; `test/sprint-schedule-bars-footer.test.ts` — bar and
    deadline-tick geometry on both axes against a frozen oracle (horizontal
    within the 0.02 pp bound, vertical by exact equality), the dead-class
    bans (`.grun`, `.gbar`, `.gseg.review`, `.gdragging`, …), footer capacity;
    `test/gantt-legend.test.ts` — each phase colour declared once. Guards
    assert the RULE, never a snapshot. [supersedes batch 8–9; review sweep]

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
    cross-sprint drag of build-spec-v1.3 §5.2 (§1 rules 10–11); dimming
    out-of-range weeks; hiding holiday days client-side (the server refuses
    them — sprint-rules.md R10-e); keyboard nudging of a bar. Accept keeps
    the label "Accept". Cards carrying a suggest note but absent from `plan`
    surface nowhere — flagged, stands. [R6; batch 3; PLAN.md block 7 "Not
    built"]
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

