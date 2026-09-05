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

_last-verified: 2026-09-05_

## 1. The drag contract

1. **A drag source must stay hit-testable in every state.** Chrome starts a
   drag from the draggable ancestor and hit-tests it; `pointer-events: none`,
   `visibility: hidden` or `display: none` on it or an ancestor — at rest or
   mid-drag — cancels the drag in the same tick it starts. Hit-testable at
   mousedown only is not enough. [R-g-1, batch 7]
2. **The drag source is `.grun`** — the coloured run's own box:
   `.gtrack > .gbar > .grun > .gseg × N` (`.gdl`/`.gghost` stay direct
   children of `.gtrack`). `.grun` carries all five directives (`draggable` +
   dragstart/dragend/dragover/drop) plus its inline `left`/`width`; `.gbar`
   carries none. Never the row, never the bar wrapper. [JP 2026-08-18,
   batch 8; state-log 2026-08-18]
3. **`.gantt .gbar` is `pointer-events: none`; `.gantt .grun` is
   `pointer-events: auto`, written out explicitly — the two rules ship
   together or not at all.** The transparent wrapper hands outside-the-run
   drops to the `.gweek` cells. [batch 8 §supersession; drag-hittest]
4. **One box over the whole coloured run**, never one handle per phase
   segment. [JP 2026-08-18, batch 8]
5. **Minimum grab width is 24px, done as arithmetic in `phaseRun`, never as
   CSS.** A CSS minimum widens the rendered box after the arithmetic and
   stretches every short bar; `sprint-schedule-render` (was `gantt-run-geometry`, retired 2026-08-28) bans the width properties
   by name. [batch 8 §minimum-grab]
6. **The box anchors left and grows its invisible part right; in the final
   column it extends LEFT** — `L = max(0, min(R0, TOTAL_UNITS − W))`, one
   expression, no branch — so the handle never leaves the track.
   [batch 8 §direction]
7. **Vertical extent is the 26px bar band**: `.grun` is `top: 50%;
   transform: translateY(-50%); height: var(--gbar-h)`; `.gseg` fills it
   (`top: 0; bottom: 0`). [JP 2026-08-18, batch 9]
8. **The drag ghost is the source's box.** Blink snapshots the source's
   bounds, painting what sits behind a transparent source — keep the source
   tight to what should be pictured. Chrome owns the ghost's translucency,
   shadow and grab offset. [JP 2026-08-18, batch 9]
9. **The invisible extension paints nothing and does not lie about the
   cursor**: `.grun` shows `cursor: default`; only `.gseg` shows `grab`
   (`grabbing` pressed). [batch 8 §invisible; T157]
10. **Drop mapping**: `weekAtX(clientX, rect, weeks)` — named, pure — maps
    the pointer to a week from the track's MEASURED width (equal columns,
    pinned by test), half-open, clamped; the handler measures
    `ctx.node.closest('.gtrack')`, never `ctx.event.target`. [batch 7]
11. **One write path**: `dropOnBar` runs the SAME `moveRows` as `dropOnWeek` —
    exactly two `POST …/replot` call sites in `90-events.js`, one audit path. The
    card id comes off `dataTransfer.getData('text/plain')`, never off the
    landing row. [batch 7 §one-write]
12. **`moveRows` refuses a non-change**: it declines only when EVERY member is
    a no-op, so a mixed multi-select still goes (invariant 10).
    [review sweep #2, state-log 2026-08-18]
13. **Pinned rows are fully frozen** (`draggable="false"`, `not-allowed` on
    the segments, keyboard path flashes *Pinned — unpin to move* with no
    POST, Calendar Remove disabled) — but the bar KEEPS its drop handlers:
    the pin freezes the row, not the column. One carve-out: a pinned row
    inside a keyboard multi-select neither flashes nor blocks — the POST
    goes and `/replot` skips the pinned member server-side, so only the
    unpinned members move. [JP ruling B 2026-08-17; batch 7; `rowKey` in
    90-events.js, FR-5.9]
14. **Unscheduled rows keep row-drag** (no bar): the gutter grip renders only
    there; targets are their week cells, another row's bar, and the
    Unscheduled block header (unslot). [R-drag-a, R-drag-b]
15. **Affordance = target**: grab cursor over the colour only, plain arrow
    over empty track, `not-allowed` over a pinned row's colour (resting AND
    `:active` clauses, segment-scoped). The bar carries no `title`; the drag
    instruction is standing `.fnnote` text, and the pinned message lives on
    `.growr`'s `title` (inherited) plus each segment's phase title.
    [JP 2026-08-18, T157]
16. **`ganttDragging` survives**: its `.gantt.gdragging .gdl` clause is
    load-bearing — the deadline tick paints above the bar and would swallow
    the drop at its own column — and `moveRows` clears the flag defensively.
    [batch 7]
17. **The `.gweek` cells are swept as drop targets in their own right** —
    `pointer-events: none` on their chain (e.g. `.gtrack`) is banned even
    when every source still drags, because drops outside the run land through
    them. [batch 8 fix pass; drag-hittest]
18. **The drag-source count is pinned at 3** — `entry`, `growr`, `grun`: a
    fourth joins the guard automatically; one-handle-per-segment fails
    loudly. [batch 8 §guard; drag-hittest]

## 2. Geometry

19. **`phaseRun(row)` is the ONE geometry helper**: it returns the run box
    plus its segments already re-based; the template does no arithmetic and
    no `{{#if}}` on geometry — every value arrives as a 2dp string.
    `phaseBars` does not exist and must not return. [batch 8 §geometry]
20. **Anything that re-wraps the segments re-bases every one.** Positions are
    percentages of the 60-workday window (`TOTAL_UNITS`); W cancels in the
    composition, so the minimum-grab extension is visually free. One rounding
    rule: `unitPct(u) = pctOf(u, TOTAL_UNITS)`. [batch 8 §geometry]
21. **A row with no visible phases has no handle**: `phaseRun` returns `[]`
    → `<div class="gbar"></div>` — no box, no `draggable`, no branch.
    [batch 8 §no-phases]
22. **One phase→colour map**: `.gseg.sketch` amber / `.review` blue-200 /
    `.render` blue-600 / `.renderOverdue` red-600, each declared exactly
    once; the legend swatches reuse the classes from outside `.gtrack`.
    [R4; batch 9 §legend]
23. **Month and wk labels derive from real week dates**: a week belongs to
    its Monday's month, wkN is its ordinal within it, and week keys are the
    local Monday (invariant 5, v4.2.0). [R2]
24. **Bar span = empirical forecast phases** from `lib/forecast.ts` via
    `lib/calendar.ts` — no new forecast math, no edits to `lib/**`; segments
    built server-side in `toRow`, half-open, zero widths dropped. [R3]
25. **Which tests guard what**: `test/drag-hittest.test.ts` — hit-testability
    of every enumerated source, ancestor/week-cell/`.gdragging` sweeps, source
    count; `test/sprint-schedule-render.test.ts` (which absorbed the retired gantt-run-geometry suite, 2026-08-28) — both axes against a frozen
    oracle (horizontal within the 0.02 pp bound, vertical by exact equality)
    plus the `.grun` CSS bans; `test/gantt-legend.test.ts` — each phase
    colour declared once. Guards assert the RULE, never a snapshot.
    [batch 8–9; review sweep]

## 4. Standing decisions — deliberately not done

40. **The four shared `.grun`/`.gghost` CSS declarations stay duplicated**:
    `sprint-schedule-render` and `drag-hittest` look those selectors up by name (the former absorbed gantt-run-geometry, 2026-08-28).
    [review sweep 2026-08-18, T162]
41. **The 26px vertical grab band is deliberate** — affordance and target
    agree on both axes; nothing widens it back. [JP 2026-08-18, batch 9]
42. **No `title` on the bar or the run box** — the standing hint is the home
    for the instruction (rule 15). [T157]
43. **`setDragImage()` stays unpulled** unless a live check shows an
    unwanted ghost artefact; hairlines at the rounded corners and the
    invisible extension are accepted. [batch 9 §honest-line]
44. **Not built, by product**: the sprint-header checkbox; a click-to-open
    range picker on the bar. Accept keeps the label "Accept". Cards carrying
    a suggest note but absent from `plan` surface nowhere — flagged, stands.
    [R6; batch 3]
45. **`.gseg` does not restate `--gbar-h` or a translate** — a second copy
    can be re-tuned alone. [batch 9]

## 5. Verification law

46. **A drag interaction ships only after a real-pointer pass.** There is no
    jsdom and no browser runner in this repo; every planner test is Ractive
    `toHTML()` or a read/execution of shipped source — none of it proves a
    drag can start. [batch 7 §why-no-test; state-log 2026-08-18]
47. **No synthetic `DragEvent`s, ever.** A synthetic event calls the app's
    handlers directly and never enters Chrome's drag machinery — it proves
    wiring, not draggability. Say so in test names and file headers.
    [batch 7–9; state-log 2026-08-18]
48. **Real-pointer procedure**: chrome-devtools MCP — `take_snapshot` for
    uids, then `drag(from_uid, to_uid)`. Attach event listeners BEFORE
    dragging; read back only summarised counts. [batch 7 root-cause pass;
    test/CLAUDE.md rule 4]
49. **Live verification writes are real**: passes run against the deployed
    site on rt-test (`tx8gDsTH`, synthetic fixtures only). Record every row's
    `slottedWeek` before touching anything and restore it after — zero net
    change. [JP 2026-08-18; STATE.md §Still open]
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

