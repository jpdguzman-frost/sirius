# PLAN — Sprint Schedules spot-check fixes (JP, 2026-08-28)

**EPHEMERAL** — rotates into the day's state-log at CLOSE. Mode: **Full**
(design-heavy; ~7 files). Source: JP's spot check of the shipped Sprint
Schedules against Figma nodes 733:108505 (deadline marker) and 731:100230
(Add Sprint Item Row), frame 731:99816 `Sprint Schedules/Default/Add Item`.

## The two findings

### F1 — Client deadline marker never visible in practice
The marker is BUILT and proven correct in-browser (1px, red-500 `#ef4444`,
full 120px track height, positioned at the deadline's workday, title carries
the date — measured live 2026-08-28). It never shows because `deadlineTick`
returns null for any deadline **before the visible window's first Monday**
(`u >= 0` clip), and every real row's client deadline is in the past. The
legend renders unconditionally, promising a marker that cannot appear. The
annotation on 733:108556 gives the marker the late-signal job ("a bar sitting
to the RIGHT of its marker is late") — which fails silently off-window.

**Fix**: pin a PAST deadline to the window's left edge (`u < 0 → 0`) so a
late row always shows the rule left of its bar; tooltip keeps the true date.
Right-edge clip stays (a beyond-window FUTURE deadline signals nothing —
the bar is left of it by construction). Decided by main thread, veto cheap.

### F2 — Week-block placement is checkbox-gated; design says hover
Shipped: the violet + appears only when the row's checkbox is selected
(`sprintSel === row.id`) and the row is unplotted; no cell response.
Design (Miles's note on 731:100277): "Add button for items that have no
plotted schedules yet. This appears when the user hovers over the week/cell."
Node 731:100271: hovered week cell fills slate-50. The + also lives inside
the Add Sprint Item Row's gantt in the mock — placement is offered on the
DRAFT once MC + work card are chosen; the + is "deliberately identical to
the Add Sprint Item Button's + since both mean 'add something here'".

**Fix**:
- The + and placement handlers ride HOVER on any unplotted row's track —
  the checkbox no longer gates placement (the control itself stays; the mock
  keeps it, its semantics are still with Miles from #60).
- Hovered week cell tints slate-50 under the + (a cell-sized highlight at
  the same left%, behind the bar layer).
- Draft placement: once `addRow` has MC + card, the draft row's track is
  hover-placeable; the click COMMITS AND PLACES in one act. Server: the
  add route's strict body gains optional `starts_on` (one audit row records
  the add with its placement). The Add Item button still commits unplotted.

## Agent split — exclusive file ownership

| Agent | Files | Work |
|---|---|---|
| A scripts | `frontend/scripts/40-app-state.js`, `50-gantt-geometry.js`, `90-events.js` | `plotRow` state; `deadlineTick` left-pin; hover handlers un-gated from `sprintSel`, gain rowId; draft-place handler |
| B template | `frontend/templates/views/40-schedules.html` | track handlers on every unplotted row + the draft row; + and hover-cell render off `plotRow`/`plotWeek`; checkbox keeps only `.sel` highlight |
| C styles | `frontend/styles/35-gantt.css` | `.ghovcell` slate-50 week tint; stacking under bars/over `gweeks` |
| D server+tests | `src/routes/schedule.ts`, `test/schedule.test.ts`, `test/sprint-schedule-render.test.ts` | optional `starts_on` in add body + audit shape + guard; render-suite anchors for hover-gated +, draft place, left-pinned tick |

## Frozen interfaces (amended only via main thread)

- State: `plotRow` (string|null — row id under the pointer; null when none).
  `plotWeek` unchanged. `sprintSel` remains but gates NOTHING in placement.
- Handlers: `plotHover(ctx, rowId)`, `plotLeave()`, `plotPlace(ctx, rowId)`
  (committed rows), `draftPlace(ctx)` (commit+place from the draft; reads
  `addRow` + `plotWeek`).
- CSS: `.ghovcell` (the slate-50 week tint), positioned like `.gplus` with
  cell width. `.gplus` itself unchanged.
- API: `POST …/sprint-items` body `{ sprint_id, card_id, starts_on? }`
  (`starts_on` DATE_ONLY optional; audited on the add row).

## Law pointers
- Geometry from nodes, never annotation prose (both misses were re-measured
  from nodes 733:108556 / 731:100277 / 731:100271).
- Every new guard proven non-vacuous; anchor commit BEFORE revert proofs;
  /tmp snapshots, never `git checkout`.
- VALIDATE dual-TZ in full after ANY post-validate edit. E2E in a real
  browser (placement by real pointer). No owls from inside a workflow.
