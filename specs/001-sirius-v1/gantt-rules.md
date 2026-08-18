# Gantt planner — current law

**Authority.** Current planner law. History and mechanism narratives live in
`gantt-frame-notes.md`. If this file and a narrative disagree, this file wins —
fix the narrative. Each rule ends with a source tag pointing at the mechanism
and evidence. Pipeline-tab and Requests-tab rules (R-warn-*, the two-valued
Requests STATUS, the requestor clip) are out of scope — see
`pipeline-frame-notes.md` and `requests-frame-notes.md`.

_last-verified: 2026-08-18_

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
   stretches every short bar; `gantt-run-geometry` bans the width properties
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
    count; `test/gantt-run-geometry.test.ts` — both axes against a frozen
    oracle (horizontal within the 0.02 pp bound, vertical by exact equality)
    plus the `.grun` CSS bans; `test/gantt-legend.test.ts` — each phase
    colour declared once. Guards assert the RULE, never a snapshot.
    [batch 8–9; review sweep]

## 3. Planner behaviours

26. **Pins = Option B, fully frozen.** A pin blocks Suggest AND manual
    action; FR-5.9 stands; `/replot` skips pinned rows server-side. "Pins
    block Suggest only" is superseded wherever it still appears (stale owls
    and Figma annotations). [JP ruling B 2026-08-17]
27. **The conflict-ack key recipe lives in `src/services/conflicts.ts`
    `conflictKey()`** — `week | rule | capacity | sorted card:phase pairs`,
    never retyped. Invalidation is a NON-match (no audit row); hard-mix is a
    planner FLAG, not ackable; card-level indicators are never suppressed by
    an ack. [invariant 13 v4.3.0]
28. **Capacity lock is Option B**: `projects.capacity_locked`, default
    false, every read `=== true` (deliberately the mirror of
    `writes_enabled`). The 403 `CAPACITY_LOCKED` precedes the Zod parse; a
    refusal writes and audits nothing; the admin toggle is audited both ways
    and omits `ensureProjectMember`. rt-837 stays LOCKED at 120 — JP-held
    calibration, never auto-correct. [owl #23, batch 3; MEMORY rt-837]
29. **Capacity footer**: total over capacity OR hard-mix share over the
    12.9% ceiling → red; ideal (8.3%) to ceiling → amber.
    `hardIdeal`/`hardCeiling` ride the `capacity` block from `HARD_MIX`
    (`lib/planner.constants.ts`) on GET and the PATCH echo; "13%" is
    `Math.round(hardCeiling * 100)`, never retyped. [R9]
30. **Sprint membership is DERIVED**: slotted week ∈ sprint range; a drag
    into another sprint's range IS the sprint move; no row carries a sprint
    reference on the wire. Group order: sprints by `position` → Outside any
    sprint → Unscheduled, empty groups dropped. [R5; invariant 12]
31. **Sprints modal — blocking (red) classes, both sides, byte-identical
    copy where both speak**: duplicate names (trimmed/case-insensitive, 422
    `SPRINT_CONFLICT`), blank/whitespace-only names (one banner per blank
    ROW), missing dates (`sprintMissingDates` blocks Save; the route stays a
    dumb refuser), and overlaps. `name` carries no Zod `.min(1)` on purpose —
    the friendly 422 owns the blank class. [R-f-3, R-f-11; review sweep
    #3–4]
32. **Sprints modal — non-blocking**: gap banners are amber, render between
    the two rows they name (one per gap, placement carried as data), and count
    WORKING days against the wire's `holidays` field, never raw weekdays. No
    banner carries a CTA. [R-f-4, R-f-5, R-f-8]
33. **Sprints modal — mechanics**: START snaps to the picked week's Monday,
    END to its Friday, on `change` never `input` (snap on pick, never
    reject); column 1 holds the remove ✕ — no grip, no manual reordering
    (`position` derives from sorted starts on save); deletion warns with the
    displaced count; copy is "Add Sprint" in both states; save is one audited
    batch PUT. [R-f-1, R-f-2, R-f-6; batch 4]
34. **Save gates on UNSAVED CHANGES, not empty-vs-not**: `sprintDirty`
    compares a baseline captured at open against the draft over the three
    persisted fields, draft order, untrimmed; Save is live iff dirty and
    nothing blocks. `saveSprints` re-checks, so a no-op PUT can never audit.
    [R-f-10, owl #37]
35. **Suggest bar counts**: proposed = `Object.keys(suggest.plan).length`;
    flagged = `plan ∩ notes` (unit: proposals); hard-heavy =
    `suggest.strain.length` (unit: weeks) — independent counts, no
    cross-check, no client hard-share recomputation, no new `/suggest` field.
    [R-a; batch 3 §counts]
36. **Suggest behaviours**: ghost bars stay violet, exact week-key match;
    rows still drag while a proposal is pending and a manual drag does not
    mutate it; a proposal does NOT survive a project switch (`suggest` and
    `collapsedBlocks` clear; `leftCollapsed` survives); a 0-proposal Accept
    can never fire; the off-Monday tripwire stays, inert while keys are
    Mondays. [R-b, R-c, R-d, R-e; batch 3]
37. **A handler on a container guards its target**: `rowKey` acts only when
    `ctx.event.target === ctx.node`. Never immunise a descendant against its
    ancestor's handler — fix the ancestor. [review sweep #1]
38. **Non-changes never audit** (invariant 10): Calendar Remove is `disabled`
    on an unslotted row and `unslotRow` returns before writing; the
    sprint-save dirty lock and the `moveRows` guard apply the same rule.
    [batch 4; review sweep]
39. **The left pane collapses 999px → 417px** (MC# + Scope only); the row
    action cluster and status-note affordance are unavailable while collapsed
    — expand to use them. Sprint blocks (including *Outside any sprint* and
    *Unscheduled*) collapse/expand per block via `collapsedBlocks`, which
    clears on project switch (rule 36). [owl #24, batch 3; 13g/13i]

## 4. Standing decisions — deliberately not done

40. **The four shared `.grun`/`.gghost` CSS declarations stay duplicated**:
    `gantt-run-geometry` and `drag-hittest` look those selectors up by name.
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

## 6. Carried over at the 2026-08-18 rewire

Rules that lived only in the session handoff (`docs/HANDOFF.md`, retired
2026-08-18) when this file became authoritative; moved here so the planner has
one home instead of two.

53. **Capacity footer totals are computed with the BR-6c weights** — rule
    29's red/amber thresholds apply to that weighted load, never to a raw
    card count. [13g]
54. **A drag is horizontal only; the vertical outcome is derived.** A drop
    changes the slotted week and nothing else — the row's relocation to
    another block follows from rule 30 and is announced with the arrival
    pulse + `scrollIntoView`. [13j]
55. **The row action cluster is Copy · Pin · Calendar Remove** — 13px
    sprites, aria-labelled and keyboard-operable; Calendar Remove is
    disabled on pinned and on unslotted rows (rules 13, 38).
    [13j]
56. **The status-note affordance is the note chip** (ghost pencil when
    empty). Placement in the scope cell is CONFIRMED (owl #48); the chip's
    treatment may still change in the row-controls design pass.
    [carried over 2026-08-18; amended by owls #48/#49]

## 7. The chip grammar (product ruling, owls #48 + #49, 2026-08-18)

57. **Coloured chips carry STATE, neutral chips carry CONTENT.** Urgency and
    difficulty are coloured; requestor and the status note wear the base
    badge — slate-100 fill, slate-300 stroke, slate-500 ink. A content chip
    therefore declares no colourway of its own; it inherits the rule the
    other content chip uses, so the family cannot drift by copying. A guard
    fails if any `.gnote` rule declares a background. [owl #49]
58. **A content chip shows its value, never a word standing in for it.** The
    note chip renders the note; the fixed word it shipped with told the
    reader a note existed but not what it said, so the note had to be opened
    to be read — defeating the point of putting it on the row. [owl #48]
59. **Truncation is MEASURED, never counted** — the shared `.clipbadge` /
    `.cliptext` recipe plus the one post-render sweep, for every clipped
    value. Same guards, same hover-and-focus reveal. [owls #39/#40, #43-C,
    #48]
60. **Where a clipped value is also a control, the accessible name and the
    tooltip are two different strings.** The non-interactive badges feed
    their tooltip from `aria-label`, which is correct while name and value
    are the same thing. A button's name must say what pressing it does, so
    the note chip's tooltip reads `data-note` instead — both still written
    from the one template expression, so they cannot drift.
61. **The chips line never wraps.** It is held to one row and only the note
    may shrink: a second line grows the row past its 84px floor and the
    pinned pane stops lining up with the timeline bars. Urgency and
    difficulty carry fixed vocabularies and are never cut; the note's real
    truncation budget is the cell minus those two chips.
62. **A freeform value's tooltip wraps and is capped.** The shared recipe's
    single nowrap line is right for a person or an asset type and wrong for
    a note, which can be any length — uncapped, a long one runs off the
    viewport where no pointer can reach it. This is the note chip's one
    documented deviation from the shared recipe.
