# Sprint Schedules — deliverables table + Gantt planner, frame notes (2026-08-15)

> **BATCH-HISTORY ARCHIVE** — mechanisms, defects and verification
> narratives, in build order. Current planner law lives in `gantt-rules.md`;
> where this file and `gantt-rules.md` disagree, `gantt-rules.md` wins — fix
> the narrative here, never the law there.

The Figma annotations are the spec (product owl #22, 8 categorized annotations
on `95:5795`), read via Rex. This file records the node map, the rulings the
build made where the frame was silent or wrong, and where the shipped view
deviates — the schedules-tab counterpart of `pipeline-frame-notes.md` and
`requests-frame-notes.md`.

Build inputs, for provenance: `gantt-build-brief.md` (annotations + measured
pixel facts), `gantt-contract.md` (the frozen server/client contract both
builders implemented against), `gantt-recon.md` (state of the code before the
pass). Server half `src/services/pipeline.ts`; client half
`frontend/styles/35-gantt.css` + `frontend/scripts/01-app.js` +
`frontend/templates/00-app.html`.

## Canonical node map (product, owl #22 — read annotations ONLY from these)

| Component | Node |
|---|---|
| deliverables-table-gantt (the planner frame, 2103×719) | `95:5795` |
| Deliverable row + composite bar (sample instance) | `95:5881` |
| Phase Bar component set — Row scope | `251:27897` |
| Phase Bar variant — render past deadline (`#dc2626`) | `251:28043` |
| Phase Bar variants — further scopes | `251:28196`, `251:28829` |
| Planner toolbar (13f, untouched this pass) | `94:4828` |

Sections of `95:5795`, addressed by name because the recon captured their
geometry rather than their ids — vertical stack, top to bottom:
month-header 29px · table-headers 45px · sprint-block(s) · unscheduled-sprint-block
(whose last child is the capacity footer, 63px) · horizontal-slider 24px.
Left column block 999px = 58 gutter + MC NO. 97 + SCOPE 262 + REQUESTOR 136 +
TYPE 146 + STATUS 300; timeline 1104px = 12 week cells × 92px.

## Annotation source

Eight annotations, all on `95:5795`, categorized DESIGN SPECS (4) / FUNCTIONALITY
(2) / INTERACTION (2). Count and content match owl #22 1:1, verified live via
Rex before build per the standing Rex-first rule. Two of the eight explicitly
say "CONFIRM with product" — those became R6, R7 and R8 below rather than
silent defaults.

## Rulings and defaults (R1–R11 as issued in the build brief, with what shipped)

| # | Ruling (verbatim from the brief) | Shipped / adjustment |
|---|---|---|
| R1 | **Placement**: This is the schedules-tab planner body, replacing the legacy week-board. The 13f toolbar is untouched. Suggest/Accept/Discard must keep working (see R8). | As issued. The legacy `.grid.sched` week-board and its CSS (`.gtrack/.gweek/.gbar*/.gdl/.gunsched/.ganttcell/.footcell*`, `.grid tr.grouphead`, `.gmeta`, `.latenote`, `.grid tr.sel`) are deleted, not left dormant — a second phase→colour map is the drift this ruling exists to prevent. Toolbar, capacity slider, Sprints modal, Accept/Discard all unchanged and verified working. |
| R2 | **Month + wk labels derive from real week dates.** A week belongs to its Monday's month; wkN = ordinal of the week within that month (wk1..wk5). Months group contiguous owned weeks. This fixes the frame's OCTOBER mislabel by construction and supersedes the frame's inconsistent Sep numbering (sample filler, like the requests pager precedent). Date ranges use the existing 13f `fmtRange` format helpers — shared, not duplicated. | As issued, client-side (`plannerWeeks()` / `plannerMonths()`, contract §0/§3.3 — the window is pure calendar arithmetic with no database input, so week nav stays fetch-free). `wkN` is computed as `floor((dayOfMonth − 1) / 7) + 1`, which is provably identical to "ordinal among the Mondays of that month" because Mondays are 7 days apart and the first falls on days 1–7. Verified live: AUGUST 5 / SEPTEMBER 4 / OCTOBER 3, and the third month reads **OCTOBER**. Now covered by `test/planner-weeks.test.ts`. |
| R3 | **Bar span = empirical forecast phases.** Bar starts at the deliverable's slotted week; phase segments (design/review/render waits) come from `lib/forecast.ts` output at workday resolution via `lib/calendar.ts`. NO new forecast math; NO edits to lib/*. | As issued. Segments are built server-side in `toRow` as the differences between the forecast's four dates, half-open `[startIso, endIso)`, zero/negative-width dropped; the client only maps them onto a workday-indexed axis (1 unit = 92px ÷ 5 = 18.4px). `git diff --stat lib/` is empty. |
| R4 | **Phase palette**: Sketch #f59e0b · Review #bfdbfe · Render #2563eb · RenderOverdue #dc2626 (the component set's Row-scope palette; the Board-scope Review=amber variant contradicts it and is judged a stale copy). ONE phase→color map, single source. FLAG to product. | As issued, as four CSS classes (`--amber-500 / --blue-200 / --blue-600 / --red-600`) that the legend swatches reuse, so a retune cannot leave the key disagreeing with the chart. The stale-copy judgement is corroborated by the extracted facts: every Board-scope bar dump (`251:27897`, `251:28043`, `251:28196`) paints its second segment `#f59e0b`, i.e. sketch and review the same colour, which reads as an unmerged copy rather than a decision. **Still flagged.** |
| R5 | **Sprint membership is DERIVED**: slotted week ∈ sprint date range (invariant 12). Dragging a row to a week in another sprint's range *is* the sprint move; there is no separate sprint-assignment write. Weeks outside any sprint group under an "Outside any sprint" block (same sub-header recipe) — invariant 12 requires surfacing gaps. Unscheduled = no slotted week. | As issued. No row on the wire carries any sprint reference (asserted in `test/planner-payload.test.ts` and in the integrate probe). Group order: each sprint in `position` order → Outside any sprint → Unscheduled; empty groups dropped. |
| R6 | **Not built, flagged**: sprint-header Checkbox (no annotation explains it) · block collapse/expand (annotation says confirm) · dragging the bar itself (rows drag; bar is display-only). | As issued at the time — none of the three built. A click-to-open range picker is also not built (contract §3.11). **Partly closed 2026-08-17 (owl #24, phase 13i): block collapse/expand IS now built** — see the batch-3 section below. The header checkbox and bar-dragging stay not built, by product. |
| R7 | **Drag mechanics default**: whole row drags (HTML5 DnD, consistent with the current board), drop targets = week columns (and the unscheduled zone to unslot if the current board supports it — recon decides), snap = per week, persistence = the EXISTING Sirius-internal slot-move API with its audit_log entry. Pinned rows still drag manually (pins only block Suggest). Capacity footer recomputes optimistically on drop. | **Adjusted in two places.** (a) *Pinned rows do not drag.* `POST /replot` skips pinned rows server-side (`src/routes/schedule.ts:108`, FR-5.9), so a draggable pinned row would be a silent no-op; they render `draggable="false"`, `cursor: not-allowed`, `title="Pinned — unpin to move"`. R7's "pins only block Suggest" is false against the code as built — **this needs a product decision: change FR-5.9, or keep pins immovable.** (b) *The unslot zone is the Unscheduled block's header bar*, not the unscheduled rows' tracks — those tracks keep their 12 week drop targets so an unscheduled row can be slotted by dropping on its own row, which is what its hint text tells the user to do. Everything else as issued; persistence is the existing audited `POST /replot`, one `audit_log` row per applied move. |
| R8 | **Suggest proposals**: while a suggestion is pending, affected rows render a ghost/outline bar (violet #8b5cf6 outline, no fill) in the proposed week alongside the current bar; Accept persists, Discard clears. Minimal, preserves the 13f Accept/Discard flow. FLAG treatment to product. | Built as issued (`--violet-500`, the only new token). **It cannot render against real data today** — see "Live defect" below. Kept strict (exact week-key match) rather than snapping the key, which would mask the bug and could paint the wrong week; the fix pass added a loud guard so Accept can no longer persist the bad weeks. Treatment still flagged. |
| R9 | **Footer warnings default**: per-week total > capacity → total cell red #dc2626; hard-mix share > 12.9% → amber #d97706; both → red. Ceiling label renders "13%" (rounded from the real 12.9% constant — do not hardcode a separate 13). | As issued, with the threshold semantics made explicit: over capacity **or** over the 12.9% ceiling → red; the ideal (8.3%) to ceiling band → amber; empty week → dimmed `—`. `hardIdeal` / `hardCeiling` ride down in the `capacity` block from `HARD_MIX` (`lib/planner.constants.ts`) on both `GET /deliverables` and the `PATCH /capacity` echo, so the optimistic re-seat cannot strip them and "13%" is always `Math.round(hardCeiling * 100)`. |
| R10 | **REQUESTOR/TYPE** come from the intake request row joined by (project_id, mc_number) — empty ("—", no badge) until the Sheets credential lands. STATUS derives from the deliverable card's ARES state via the same mapping the pipeline tab uses (shared helper — drift-proofing). | As issued. STATUS reuses the shared `.pbadge.s-*` map (`20-pipeline.css:172`–`174`) and difficulty the shared `.pbadge.d-*` map — no second status or difficulty map anywhere. See "Data reality". |
| R11 | **MC-cell chevron** renders as the drag handle affordance (cursor: grab) since rows are draggable; no other behavior. | As issued (`#i-rowChevron`, `cursor: grab`; `not-allowed` on a pinned row), with two colour/glyph deviations recorded below. |

## Beyond the frame — controls preserved, and where the glyphs differ

The legacy week-board was the only UI for four row-level controls, so they were
kept rather than silently removed: the BR-8 multi-select checkbox and the R11
drag handle sit in the 58px gutter, and pin (FR-5.9) / duplicate (FR-5.12) /
status-note (FR-11) form a cluster in the STATUS cell. Without them, unpinning,
duplicating, noting and multi-row drags become unreachable.

Two of those four are genuinely beyond the frame, and two are the frame's own
controls drawn differently. Stated precisely, because the earlier version of
this paragraph claimed the frame draws no row-level controls, and the raw dump
says otherwise:

| Control | Frame (`gantt-row-facts.json`) | Shipped | Why |
|---|---|---|---|
| multi-select checkbox | not present | 14px checkbox in the gutter | BR-8 multi-row drag has no other entry point. |
| drag handle | 16px chevron stroked `#0f172a` **and** a separate 14px six-dot grip stroked `#cbd5e1`, both in the MC cell | the chevron only, tinted `--slate-400`, `cursor: grab` | R11 ruled the chevron *is* the handle; it did not rule its colour. Two glyphs for one affordance read as two controls, and at `#0f172a` a chevron that expands nothing (R6: collapse/expand not built) reads as a disclosure triangle. The dimmer tint says "grip", not "control". **Deliberate — flagged.** |
| pin / duplicate / note | present: a `badge-icons-container → icons` group of three 13px monoline icons stroked `#94a3b8`, always visible, right of the STATUS badge (identical in `row99_details`) | three emoji glyphs (📌 ⧉ ✎) revealed on hover or keyboard focus, always visible on a pinned row | The *placement* matches the frame. The deviations are the glyph medium and the reveal. Hover-reveal keeps the resting row as quiet as the frame's; a pinned row keeps them visible because state must never hide behind a hover, and `opacity: 0` leaves every button in the tab order. **Flagged — swapping the emoji for `#i-` sprite icons at `--slate-400` would close half the gap and is the obvious next move if product wants the frame's look.** |

## Live defect found at integrate — blocks R8, corrupts slotted weeks

> **RESOLVED 2026-08-15 — JP chose option (a), plus ARES-canonical calendar.**
> Constitution amended to v4.2.0 (invariant 5): `lib/calendar.ts` week keys
> are now the local Monday in every timezone and `isHoliday` matches the
> local calendar date; the holiday set is injectable via `setHolidays()` and
> the **ARES working-day calendar is canonical** (worker `calendarTick`
> derives non-working weekdays from `/api/workload?mode=daily`, cross-checks
> `/api/portfolio/capacity` `workingDays[]`, persists to `calendar_days`;
> both processes load it at boot + interval). Migration
> `005-monday-slotted-week` normalized existing non-Monday `slotted_week`
> values with audit rows. The Accept guard below stays in place as an inert
> tripwire. Golden tests amended: TZ-true reference everywhere, oracle
> parity kept where the oracle is correct (UTC), suites also green
> west-of-UTC. The section below is preserved as the historical record.

`buildWeeks().key` in `lib/calendar.ts:93` yields **Sundays** on an Asia/Manila
host (recon §E.1, contract flag 1). `POST /suggest` is the only planner path
that returns those keys. Reproduced end to end on the seeded isolated database,
Manila host:

1. `POST /suggest` returns `plan` values `2026-08-02`, `2026-08-09`,
   `2026-10-18` — the Sundays before the Mondays the planner draws.
2. No ghost bar renders, because R8 matches the proposed week against the drawn
   Monday keys exactly. Symptom: **"Accept 4 moves" with zero visible proposals.**
3. Clicking Accept persists those Sundays as `slotted_week`. Observed after:
   four of five rows carry Sunday weeks; `perWeek` is keyed on Sundays, so the
   capacity footer reads `—` in **11 of 12 columns while 5 rows are slotted**;
   and rows fall out of their sprint block (a row at `2026-08-09` is outside
   Sprint 13's Aug 10–21 range), so "Outside any sprint" silently swells.
   The bars still draw — `dayIndex` clamps a Sunday forward — so the screen
   looks plausible while the totals are blank.

Pre-existing and out of scope this pass (`lib/**` is frozen), but the 12-week
planner makes it materially worse: the capacity footer is the point of the new
view and it silently zeroes. **Recommend fixing `lib/calendar.ts:93` before
this view goes to a PM**, as a scoped change with its own golden test.

**Guard shipped at fix (not the repair).** Step 3 above — Accept silently
persisting Sunday weeks — is now blocked rather than merely documented. A
computed `suggestOffWeeks` (`01-app.js`) lists any proposed week where
`mondayIso(w) !== w`; when it is non-empty the planner renders a
**Suggestion blocked** strip naming the offending weeks, the Accept button
renders disabled ("Accept blocked"), and `acceptSuggest` refuses as a second
lock. Discard is unaffected. On a host where the keys are already Mondays the
guard is inert and nothing changes. This buys safety, not function: **Suggest
still produces no usable plan on the Manila host, and that is JP's call.**
The three options, unchanged:

| Option | Where | Cost |
|---|---|---|
| Fix `buildWeeks`' key derivation | `lib/calendar.ts:93` | Constitution amendment (invariant 5, `lib/` is frozen and validated); needs a golden test. Fixes every caller at once. |
| Normalise `/suggest`'s plan weeks to Mondays | `src/routes/schedule.ts` | Outside frozen `lib/`. Fixes this route only; the defect stays live for any future caller. |
| Snap client-side in `ghostBar` + `acceptSuggest` | `01-app.js` | Cheapest, but the client would be papering over a server value — and the same wrong keys still reach any other consumer. |

A second, distinct `lib/calendar.ts` defect was found by Builder A and is
confirmed here: `isHoliday` (`:36`) compares a local-midnight `Date` against
`toISOString()` (UTC), so PH holidays exclude under `TZ=UTC` but **not** on a
Manila host — i.e. production (Manila, invariant 11) ignores every PH holiday
in every forecast date. Same file, same fix window.

## Other flags for product

| # | Point |
|---|---|
| 1 | **12 columns do not fit.** Measured at integrate: at a 1600px viewport the scroller is 1470px, so the 999px pinned block leaves **5.1 of 12** week columns visible; at 1180px, 0.6 of a column. The page body correctly never scrolls horizontally and the left block stays pinned, but the view needs a call — narrower left pane, a collapsible column block, or a minimum supported width. — **CLOSED 2026-08-17 (owl #24): collapsible left pane.** `--gleft` 999 → 417 (MC# + Scope only), ~5 → ~11 visible columns at 1600px. Neither a narrower default pane nor a minimum width was adopted. |
| 2 | **`WEEK_COUNT` 8 → 12** also widens the `/suggest` horizon, which changes `suggestPlan` output. No code change needed (`POST /suggest` already accepts up to 26 weeks); the behavioural change is real and unaddressed. — **CLOSED 2026-08-17 (owl #24): 12 kept.** Product accepts the wider horizon as the intended planning window; the suggest bar's counts (below) are what makes its effect legible. |
| 3 | **MC NO. renders `mcLabel` (the control number)**, per contract §2 — so MC-825's 99 deliverables all read "MC-825" in the column, with `display_id` only in the tooltip. Correct against invariant 3, but on a real board it will read as 99 identical rows. Worth a product look at showing `display_id` in the cell. — **CLOSED 2026-08-17 (owl #24): MC stays bare.** `display_id` remains tooltip-only; no code change. |
| 4 | **Board-scope Review = amber** in the component set contradicts the Row-scope `#bfdbfe`; judged a stale copy (R4). — **CLOSED 2026-08-17 (owl #26): the Row-scope palette is correct**, i.e. the build was already right and the Board-scope variant is stale. No code change; the legend now states the four colours on screen. |
| 5 | **Medium difficulty fill** is absent from the extracted facts; the build uses the existing `.pbadge.d-Medium` token pair (`--amber-50` / `--amber-500`). |
| 5b | **Easy difficulty fill disagrees with the frame.** The frame measures Easy at `#dcfce7` / `#16a34a` (= `--green-100` / `--green-600`); the shared `.pbadge.d-Easy` recipe — product's W3 tokens, Miles owl #04 — is `--green-50` / `--green-500`. Contract §3.10 mandates the ONE shared `.pbadge.d-*` map, so the build follows W3 and no CSS changed. Hard matches the frame exactly, so Easy is the only difficulty value where the frame and W3 disagree. **Product owns the call: retune W3, or accept the frame value as stale.** |
| 6 | **`.pbadge.s-ongoing` text** is `--blue-500`; the frame shows `--blue-700`. Left unchanged to avoid re-tinting the verified Pipeline tab. |
| 7 | Ghost-bar treatment (R8), footer warning treatment (R9) and the not-built list (R6) all need a product decision. — **Partly closed 2026-08-17: R6 (collapse/expand built, checkbox skipped) and the ghost treatment (R-b: ghosts stay violet) are settled; footer warning treatment (R9) is still open.** |

## Data reality

`REQUESTOR` and `TYPE` are denormalised onto the deliverable by the intake
worker from the request row, joined `(project_id, mc_number)` (R10). Production
intake is empty — `GOOGLE_SHEETS_CREDENTIALS` is still deferred — so **both live
projects render `—` with no badge in those two columns** until the sheet
credential lands. Nothing else on the view depends on the sheet: MC NO., SCOPE,
STATUS, the urgency and difficulty badges, the bars, the sprint blocks and the
capacity footer are all ARES- or Sirius-owned and are live today.

The empty state is deliberate and is exercised both ways: the seed fixture gives
MC-655's rows and MC-712 a requestor and type, and leaves MC-701 with neither,
so a local dev board and the E2E probe both show the populated and the empty
rendering side by side.

## What was verified at integrate

- Gates: `npx tsc --noEmit`, `npx eslint .`, `node frontend/build.js`,
  `npx vitest run` (41 files / 293 tests) under the host TZ, `TZ=UTC` and
  `TZ=Asia/Manila`.
- Constitution: `git diff --stat lib/` empty; no Trello or Sheets write anywhere
  in the diff; no new database query at all (the per-week totals are an
  in-memory pass over rows already filtered on `project_id`).
- A seeded **isolated** in-memory database with the real server process
  (dev autologin, never the dev db): 74 assertions over sprint grouping,
  Outside-any-sprint, Unscheduled, per-week BR-6c totals, the hard-share flag,
  day-resolution phase segments, `renderOverdue`, the §2 field mapping including
  the null-requestor empty state, cross-project isolation, and a slot move whose
  `audit_log` row and follow-up payload both reflect the change while the pinned
  row is skipped and writes no audit row.
- The same seeded server driven in Chrome at 1600×1000: R2 labels correct on
  screen, left block pinned while the timeline scrolls, page body free of
  horizontal scroll, sheet exactly 2103px, a real drag-and-drop that moved the
  bar, updated the footer optimistically and settled on the server's totals.
- One defect fixed at integrate: the legend's "Client deadline" swatch declared
  `position: static` at the same specificity as `.gantt .gdl` but earlier in the
  file, so it lost and escaped to the top-left corner of the page. Now
  `.gantt .glegend .gdl`.

## Fixed at review — frame fidelity and three behaviour defects

A review pass against the raw dump (`gantt-row-facts.json`) found six places
where the build carried a legacy week-board recipe forward instead of the
frame's value, plus three behaviour defects. All are corrected; none needed a
ruling change, and no shared recipe moved.

| # | Was | Now | Evidence |
|---|---|---|---|
| 1 | Capacity footer and horizontal slider rendered on the row/white surface | both painted `--slate-50`, matching the two headers; slider padding `4px 0` | dump: `footerNote.total-header` and every footer `Cell` `bg #f8fafc`; `horizontal- slider` `bg #f8fafc`, `p4,0,4,0` |
| 2 | Client-deadline tick `--slate-700`, 2.5px (the deleted week-board recipe, darkened) | `--slate-400`, 2px | dump `row84 → Deadline Marker → mark`: stroke `#94a3b8`, stroke-width 2. The legend swatch follows automatically — it reuses the class. |
| 3 | Row-track and footer gridlines `--slate-100`, so the vertical rules lightened below the header boundary | `--slate-200`, continuous | dump: every `row-weeks` Cell and every footer Cell carries stroke `#e2e8f0` |
| 4 | `.gpin`'s right border and the first timeline cell's left border stacked into a 2px (and in rows, two-tone) divider at x=999 | the first cell of every strip drops its left border; the pin's stays, since it doubles as the sticky-scroll cover | dump: `row-details` has no stroke of its own — the boundary is one 1px hairline |
| 5 | Sprint meta was one `.gbmeta` string at `--slate-500`, and printed "1 items" | two spans — `.gbmeta` (duration, `--slate-500`) + `.gbcount` (count, `--slate-400`) — pluralised by one shared helper for all three block kinds | dump `sprintHeader`: `#duration` `#64748b`, `#items` `#94a3b8`. Contract §3.5's recipe line asked for two tones while its meta shape was a single string; the two-tone recipe wins, and the concatenation is still the contract string character for character. |
| 6 | A null difficulty rendered nothing in the SCOPE chips row | dimmed `—`, sized onto the badges' 19px baseline, matching the requestor/type empty state | contract §2 (`difficulty null → '—'`) and the replaced week-board's `{{row.difficulty \|\| '—'}}`. Those rows carry no bar either, so the dash is the only cue that the missing label is why. |
| 7 | `plannerGroups` joined rows to sprint blocks by **name** | joined by sprint **id** (`schedRows` stamps `sprintKey`) | Names are free text and `addSprint` auto-names by count, so two sprints can share one. A name join made each collect the union of both ranges — every affected row rendered twice with doubled counts. Not newly introduced (the deleted `schedGroups` did the same), but re-implemented verbatim when `s.id` was already at hand. |
| 8 | Arrow keys on a focused **pinned** row fired a `/replot` that the server skipped, with no audit row and no feedback | the keyboard path flashes "Pinned — unpin to move" and skips the POST, mirroring the drag path; a multi-select still goes through | Contract §3.8 removed exactly this silent no-op for drag; the keyboard path contradicted it. |
| 9 | Accept could persist `/suggest`'s non-Monday weeks silently | blocked and explained — see the guard under "Live defect" above | Reproduced: `buildWeeks('2026-08-03', 3)` returns `2026-08-02/09/16` under `TZ=Asia/Manila`, `2026-08-03/10/17` under `TZ=UTC`. |

Also corrected: the toolbar comment in `00-app.html` still said the phase legend
was on the legacy recipe, which stopped being true when this pass deleted the
legacy `.legend` rules and rebuilt it as `.glegend`.

---

# Batch 3 — capacity lock, suggest bar, legend, collapse (phase 13i, 2026-08-17)

Owls #23–#26. Node map: the suggest bar is `262:34499`, the work-phase legend is
`262:33342`; the capacity lock and both collapse features carry no frame and are
product-specified in the owls. Two items were explicitly **excluded pending JP**
and are NOT built: the FR-5.9 change (pins block Suggest only, allow manual
drag) and the conflict-ack key gaining capacity (invariant 13 amendment).

## Rulings R-a … R-e (verbatim from the build brief, with what shipped)

| # | Ruling (verbatim) | Shipped |
|---|---|---|
| R-a | "flagged" and "hard-heavy" are INDEPENDENT counts (different units — proposals vs weeks); the frame's 1-vs-2 sample is filler. | As issued. Two computeds over two different sources — `plan ∩ notes` (proposals) and `strain` (weeks) — with no cross-check, no clamp and no derived total. Proved both ways: a fixture where hard-heavy *exceeds* proposed (`test/suggest-counts.test.ts`), and a seeded board where flagged is 2 while hard-heavy is 0 (`scripts/batch3-probe.ts` fixture B). |
| R-b | Ghost bars STAY violet (bar = chrome, ghosts = content); Miles rules after seeing. | As issued — `.gghost` untouched. Still awaiting Miles's look. |
| R-c | Rows CAN still be dragged while a proposal is pending; a manual drag does not mutate the proposal. | As issued. `dragRow` / `dropOnWeek` / `rowKey` / `moveRows` are untouched and never read or write `suggest`. |
| R-d | Proposal does NOT survive a project switch; surviving tab switches within the project is fine. | **Was not true — fixed this pass.** `resetForProjectSwitch` now clears `suggest` (its cardIds are meaningless in the next project, and Accept would post them to `/replot` regardless) and `collapsedBlocks` (keyed on per-project sprint ids). A *tab* switch still clears nothing, as before. |
| R-e | A suggestion returning 0 proposed shows the bar with "0 proposed", Accept disabled, Discard reverts. | As issued, via one computed — `suggestBlockedWhy` drives both the `disabled` attribute and the tooltip, so the button can never be dead without a stated reason. The off-week (non-Monday) tripwire keeps precedence over the empty-plan reason. `acceptSuggest` re-guards both, so a 0-proposal Accept can never fire an empty `/replot`. |

## Count definitions — the rulings behind the three numbers

| count | source | why |
|---|---|---|
| **N proposed** | `Object.keys(suggest.plan).length` | The number the Accept button *acts on*. The alternative ("only rows whose week actually changes") would print a figure Accept does not honour and would need a row join. **Flagged for Miles.** |
| **N flagged** | `plan ∩ notes` | `notes` is `suggestPlan`'s own per-card exception channel, and its four strings map exactly onto over-capacity, the BR-6b hard ceiling, past-deadline and 🛑 blocker. `detectConflicts` is NOT reusable here: it consumes forecast *milestones* for the **persisted** plan, so scoring a proposal would need a re-forecast the client is forbidden to run (invariants 5–7). Intersecting with `plan` makes the unit *proposals* — a card the planner could not place at all is not a proposal. |
| **N hard-heavy** | `suggest.strain.length` | The server's own answer to "which weeks exceed the measured ceiling **under the proposed plan**", computed inside `lib/planner.ts` against `HARD_MIX.ceiling`. The client never recomputes a hard share for this bar, so 12.9% is never retyped. |

**Cards carrying a note but absent from `plan` (unplaceable) are surfaced
nowhere in the UI.** That was already true and stays true this pass — flagged.

**No `/suggest` response field was added.** All three counts are client-side
reads of a payload the planner already holds; `test/schedule.test.ts` pins
`plan`, `notes` and `strain` to the wire so they cannot quietly leave it.

## Capacity lock (owl #23, Option B)

- `projects.capacity_locked` (default false). **Polarity is deliberately the
  mirror of `writes_enabled`:** absent means *unlocked*, so every read is
  `=== true`, never `!== false`. The two are not symmetric and must not be
  copy-pasted onto each other.
- `PATCH /api/projects/:id/capacity` answers **403 `CAPACITY_LOCKED`** as the
  first statement of the handler. **Ruling: the lock precedes the Zod parse, so
  a locked project plus a malformed body answers 403, not 400** — a locked
  project has no valid capacity write whatever the payload says, which is how
  `writeGuards` already treats project-level refusals. **Flagged.**
- **No audit row on a refusal.** Invariant 10 logs state *changes*; a refusal
  changed nothing.
- Admin toggle `PATCH /api/admin/projects/:projectId/capacity-lock`, audited
  `capacity.lock` / `capacity.unlock` with actor and before/after. A no-op
  toggle answers 200 and writes nothing.
- **Ruling: the admin route deliberately omits `ensureProjectMember`.** The
  admin surface is global by construction — `PUT /api/admin/users/:id/memberships`
  already writes membership rows for projects the admin need not belong to — and
  requiring membership would lock out the very admin who has to unlock a
  project. Invariant 9's membership half applies to `/api/projects/:projectId/…`
  routes, which this is not. **Flagged.**
- Migration `006-capacity-lock-rt837` locks **rt-837 only** (its 120 is JP-held
  calibration against the live 92), idempotent, audited. rt-test stays unlocked,
  and because the test runner applies migrations to an empty database, no
  existing fixture is retro-locked.
- The pin is **visible, not tribal knowledge** (Miles): the control dims, the
  rail refuses the cursor, a padlock states the reason, and the same string
  rides the input's `title`. A second guard sits at the top of `writeCapacity`
  because a lock can flip in another tab.

## Known consequences and treatments still owed

| # | Point |
|---|---|
| 1 | **The row action cluster is unavailable while the left pane is collapsed.** Pin / duplicate / status-note live in `c-status`, which the collapsed pane hides — expand to use them. Accepted this pass; if it bites, the cluster moves to `c-mc`. |
| 2 | **The left-pane toggle is a placeholder treatment** — a 20×20 transparent button with a 16px slate-400 chevron, no resting chrome. Flagged for Miles's design pass. |
| 3 | **Accept keeps the label "Accept"**; the frame says "Apply". Miles delegated naming to the build. Flagged. |
| 4 | **`.sgbar .pbadge.sgheavy` measures 23px, not the frame's ~25.** The shared `.pbadge` geometry is authoritative (drift rule) and only the colour trio is local, so no height override was added. Flagged — 2px. |
| 5 | **`leftCollapsed` survives a project switch; `collapsedBlocks` and `suggest` do not.** Deliberate: the pane is a reader preference, the other two are per-project data. Documented inline at `resetForProjectSwitch`. |
| 6 | Rows inside a collapsed block leave the tab order because they are not rendered — intended. The toggles are real `<button>`s, so Enter/Space work without a handler. |

## Ractive comment hazard — a build gate that does not exist

`{{! … }}` terminates at the **first** `}}`, so a comment that quotes a mustache
leaks the rest of itself into the DOM as literal text — and
`Ractive.parse` accepts it happily, which means `node frontend/build.js` cannot
catch it. Builder B hit exactly this and reworded the comment in prose.

Two things now guard it: `test/gantt-collapse.test.ts` walks the parsed template
for text nodes still carrying `{{`/`}}` (with a negative control, so an
always-empty scan cannot pass silently). Note that a blanket grep for `{{!` is
wrong — in **attribute** position `{{!x}}` is a negation, not a comment
(`disabled="{{!row.trelloDue}}"` at `00-app.html:320` is correct and
pre-existing). The hazard is element-content position only.

## What was verified at integrate (batch 3)

- Gates: `npx tsc --noEmit`, `npx eslint .`, `node frontend/build.js`,
  `npx vitest run` **and** `TZ=UTC npx vitest run` — 50 files / **443** tests,
  from the 375 this batch started at.
- Constitution: `git diff --stat lib/` empty; no Trello or Sheets write path in
  the diff; the write registry is unchanged at three entries; every new query is
  either on `projects` (the tenant root) or already project-filtered; both
  toggle directions audited with actor and before/after.
- `scripts/batch3-probe.ts` — 28 checks against an **isolated** in-memory
  mongod (never a real database, no Trello call): migration 006 locks rt-837
  idempotently; the 403 writes nothing; the admin unlock is audited and the
  write then lands; re-locking closes it; a non-admin is refused. Both suggest
  fixtures assert **hand-computed** counts, not inequalities — fixture A
  (20 cards, 7 Hard, capacity 14, 4 weeks) must read proposed 20 / flagged 0 /
  hard-heavy 4, and fixture B (4 Medium cards, 2 blocked) must read 4 / 2 / 0.
- Template behaviour is rendered, not grepped: `test/helpers/gantt-render.ts`
  runs the shipped template through Ractive's own `toHTML()`, which is what
  proves the legend's five entries and their classes, that a collapsed block
  keeps its header meta byte-for-byte while dropping its rows, that the
  Unscheduled drop zone survives collapse, and that
  `disabled="{{suggestBlockedWhy}}"` really drops the attribute when the reason
  is empty — the whole R-e mechanism.
- **Not run: a browser pass against the running app.** Builder B measured
  geometry, computed styles, sticky/footer alignment and chevron rotation in
  Chrome against a standalone harness built from the shipped CSS, but live
  drag-and-drop, `ArrowLeft`/`ArrowRight` reslot and the real slider thumb ratio
  in both pane states are still owed.

---

# Batch 4 — sprints modal, drag reversal, row action icons (phase 13j, 2026-08-17)

Owls #27–#31. Figma file `abDRsIVDs1XjJKeR8xYOoF`, six nodes verified via the
official Figma MCP before any code was written: `528:113433` (empty),
`322:30031` (filled), `328:38162` (alert/gap), `328:38454` (error/duplicates),
`I262:33396;251:27040` (icon cluster), `262:33397` (row-weeks). No node
materially mismatched its owl.

## The precedence override — pins stay FULLY frozen

Owls #27 and #31 both say *"a pin blocks Suggest, not deliberate action (per
#24)"*, and **two live Figma annotations still carry that line**
(`I262:33396;251:27040` interaction, `262:33397` interaction). All of it
predates **JP's ruling B of 2026-08-17: pins stay fully frozen, FR-5.9
unchanged.** The build follows JP:

- a pinned row is **not draggable** — not by its bar, not by the row;
- **Calendar Remove is `disabled`** on a pinned row, not merely warned about,
  because `/replot` skips pinned rows server-side and an enabled control would
  be a round trip that changes nothing;
- the keyboard guard (`rowKey` → *Pinned — unpin to move.*) is untouched.

**Flag the supersession in the deploy owl.** Miles was informed in jp→miles #18;
the two annotations still need correcting at source.

## Rulings R-f-1 … R-f-11, R-drag-a/b — R-f-1…8 and R-drag-a/b issued in the contract, R-f-9 at review, R-f-10/11 by Miles in owl #37; with what shipped

| ID | Ruling | Shipped |
|---|---|---|
| **R-f-1** | Copy is **"Add Sprint"** in both states; the empty state's frame label "Add a Sprint" is dropped (the frame flags its own inconsistency). | Yes — a render test asserts `Add a Sprint` appears in neither state |
| **R-f-2** | START snaps to the Monday of the picked week, END to that week's Friday — **snap on pick, never reject**. | Yes — new `fridayIso()` beside `mondayIso()`, bound to `change` and **not** `input` (some engines fire `input` per keystroke and would rewrite a half-typed year) |
| **R-f-3** | Overlap: **constitution invariant 12 already answers #28.4.** The server rejects overlaps on save (`sprintIssues` → 422 `SPRINT_CONFLICT`, nothing written) and did before this batch. The modal surfaces them as an **error-variant banner**, red and blocking, symmetric with duplicates. **Error treatment flagged to Miles.** | Yes — no server change; one strengthened test plus two probe legs |
| **R-f-4** | The gap banner renders **between the two rows it names**, one banner **per gap**. | Yes — each banner carries the draft index of the row it follows, so placement is data, not a second layout rule |
| **R-f-5** | **No CTAs in either banner** — Miles removed the frame's "Delete sprint" / "Keep it" buttons. | Yes — asserted per banner variant, and both strings are absent from every state |
| **R-f-6** | Column 1 holds the **remove ✕**; there is **no grip** and **no manual reordering** (`position` is derived from the sorted start dates on save). Resolves recon defect D-1, where the frame draws a six-dot grip in col 1 and the ✕ at the right of LENGTH while every annotation and the owl say col 1 removes the row. **Flagged to Miles.** | Yes — build the annotation, not the pixels. A grip would also be a control that drags nothing, which is exactly what R-drag-b deletes from the Gantt gutter |
| **R-f-7** | **No SubTone hint strip.** Resolves recon defect D-2: the frame's `offset-subtone` layer is `hidden` in all three table states and the stated 812×416 only adds up without it. **Flagged to Miles.** | Yes — nothing matching `subtone` renders in any state |
| **R-f-8** | Gap detection counts **working days** against the active ARES calendar (`getHolidays()`), never raw weekdays. | Yes — `holidays` joins the `GET /deliverables` payload (read-only, no new collection) and the client skips weekends + that set. `lib/planner.ts`'s own raw-calendar `> 2 days` gap rule is untouched (frozen, and the route filters gap issues out anyway) |
| **R-drag-a** | Unscheduled rows have **no bar**, so they keep the current **row-drag** onto week cells. A necessary asymmetry. **Flagged.** | Yes — and the hint line already said so |
| **R-drag-b** | The gutter **grip is removed for scheduled rows** and kept **only on unscheduled** ones; the BR-8 multi-select checkbox stays on both and the keyboard arrows still reslot. Answers #31's confirm. **Flagged.** | Yes |
| **R-f-9** | The contract's three `#000` facts — the modal title, "No sprints yet" and the enabled Save fill — ship as **tokens**, not as a raw hex: text takes `--surface-foreground` (`#0f172a`), the Save fill takes `--neutral-950` (`#0a0a0a`). A raw hex in component CSS is a declared defect in this repo and there is no `#000` token. A ~1–2% luminance departure from the frame, deliberate. **Flagged to Miles** — add a true black token if the frame's `#000` is load-bearing. | Yes — no raw hex anywhere in the modal's CSS |
| **R-f-10** | Save gates on **unsaved changes**, not on empty-vs-not. It is live when there is something to persist and nothing blocking it. **Supersedes R7** and retires `sprintOpenedEmpty` outright. | Yes — a `sprintDirty` computed over a baseline captured at open; the flag is gone from both shipped files and a test asserts its absence |
| **R-f-11** | A sprint name is **required**: trim, then reject `''` and whitespace alike, surfaced like the duplicate-name error (red blocking banner, Save gated). A blank reports **once, as a blank**, and never also as a duplicate. | Yes — `sprintBlankNames` beside `sprintDupNames`, and a matching `blankNameIssues` on the route's existing 422; the server's duplicate check gained the blank guard the client already had |

## Owl #37 — the two sprints-modal rulings (batch 5b)

Miles answered the three questions the batch-4 deploy owl put to her. Item 3
(the arrival pulse) she ruled **keep as built** — 1.2s plus `scrollIntoView`,
including the reduced-motion fallback — so nothing changed there. The other two
are R-f-10 and R-f-11.

### R-f-10 — Save gates on unsaved changes, superseding R7

Her ruling: *"Don't decide empty vs not, decide **unsaved changes vs not**: Save
is enabled when there's something to persist. Opening an empty modal = nothing
changed = dead. Deleting every sprint = a real change = saveable. Both of your
current behaviours then fall out correctly, and it fixes the whole class rather
than this one case."*

This **reframes** the question the R7 note flagged rather than settling it.
`openSprints` now captures a `sprintBaseline` beside the draft — a fresh copy of
the three fields a save PUTs (`{name, start, end}`), mapped off the stored list
so an edit can never drag the baseline with it — and `sprintDirty` compares the
two. Save is live iff `sprintDirty && no blocking banner`.

Both R7 behaviours survive as **consequences**, and a third case comes free:

| State | Dirty? | Save | Was it reachable before? |
|---|---|---|---|
| Opened with no sprints | no — `[]` vs `[]` | dead | yes, via the flag |
| Emptied by the user | yes — length changed | live | yes, via the flag |
| A field edited and put back | no — fields match again | dead | **no** — the flag said "live" |

The third row is the whole point: it is the class the flag could not see, and it
is why the reframe is worth more than a fix. Comparison is on the three
persisted fields, in **draft order**, with **no trimming** — a name the user
changed to `"Sprint 1 "` is an edit they made; whether the route trims on store
is a separate question and was not touched. A length change is dirty.

`sprintOpenedEmpty` is **deleted outright** — state, the set at open, and the
template reference. A leftover key expressing a case the dirty check subsumes is
exactly the drift the rule forbids, so a test asserts the identifier appears
nowhere in either shipped file, and the probe leg checks the built output too.

Cancel's `dim` (`!sprintDraft.length`) was **left alone**: it tracks the rendered
empty branch, not Save's state, and dim-Cancel beside live-Save was already the
shipped pairing for emptied-by-the-user in batch 4. No contradiction is
introduced; verified by render, not by reading.

### R-f-11 — a sprint name is required

Her ruling: *"Trim and reject empty, surfaced like the duplicate-name error (red
blocking banner, Save gated). A nameless sprint is unidentifiable in the Gantt's
sprint headers, and two blanks already collide as duplicates — so it's
half-enforced by accident today."*

Blank is `String(name || '').trim() === ''` on both sides. It follows the
existing banner recipe — `variant: 'err'`, carrying the draft index of its row so
placement stays data (R-f-4), no CTA (R-f-5) — with title **"Sprint name
required"**. One banner **per blank ROW**, unlike duplicates which are one per
NAME: there is no shared name to collapse them onto, and each row is its own fix.

**The copy, verbatim, and identical on both sides:**

> A sprint starting 17 Aug 2026 has no name. Name every sprint to save.

Only the date interpolates. It keeps the duplicate-name copy's two-clause house
shape — *[the problem in the user's own data]. [imperative fix] **to save.*** —
and the "to save" tail that explains the dead button. It points at the row by the
one identity a nameless row still has: its start date. `fmtLongIso` renders
`17 Aug 2026` from a fixed month table, never `toLocaleDateString` (en-GB emits
"Sept"); the route's `longDate` reproduces it with the same pure string math, so
no `Date` is constructed on either side and the two strings are byte-identical
for the same input (invariant 11). A test asserts the shared sentence exists
exactly once per interpolated form, so a third copy cannot drift in.

**Client-only fallback**, when the row's start has been cleared:

> This sprint has no name. Name every sprint to save.

This is **not** the parity sentence — only its second clause is shared. It is
reachable on the client because `snapSprintStart` sets `start` to `''` when the
picker is cleared, which would otherwise render "A sprint starting␣␣has no
name."; it is unreachable on the server by construction, where `start` is
`DATE_ONLY`-required. The asymmetry is deliberate and pinned by test.

**The two sides disagreed, and the server was wrong.** `duplicateNameIssues`
did not skip blanks, so two unnamed rows collided on the key `''` and were
reported as `Multiple sprints are named ""` — wrong and unreadable. The client's
`if (key)` guards already skipped them. The server now mirrors the client: a
blank reports once, as a blank, and never also as a duplicate.

**One Zod constraint was relaxed**: `name` lost its `.min(1)` and kept `.max(80)`.
An empty name is a user mistake with a friendly fix, not a malformed body — Zod
answered `400 INVALID_BODY`, an envelope carrying **no `issues[]` at all**, so
the modal's `issues[0].text` fallback would have printed a raw developer string
at the user. The 422 now owns the whole blank class. A test pins that `''`
returns `SPRINT_CONFLICT` and never `INVALID_BODY`, and another pins that an
81-character name is still a 400.

Rejection **writes nothing and audits nothing** — the 422 returns before
`deleteMany`, exactly as the duplicate path does.

### One judgement call taken at build, recorded here

`saveSprints` gained a second lock: `if (!app.get('sprintDirty')) return;`
alongside the blocking-issue lock. A no-op PUT would write a `sprints.replace`
audit row for a non-change, which is precisely the defect batch 4 fixed for
Calendar Remove — **invariant 10 logs changes, not attempts.** The button is
already dead in that state, so this is belt-and-braces on the same rule.

## #27's divergence, answered

The build being replaced had **pin / duplicate / status-note**; the design
specifies **Copy / Pin / Calendar Remove**. An exhaustive search for
`status_note` / `statusNote` / `editNote` found that the cluster's pencil is the
**only status-note edit surface anywhere in the app** — every other site is
display-only (the "manual" chip's `title`, the two status-badge tooltips, the
row search blob).

So it was **preserved outside `badge-icons-container`**, not dropped: with a
note, the `.gchips` chip that already announces one *becomes* the edit button
(same pixels, zero new chrome); without one, a ghost pencil appears in the same
chips row on the same hover/focus rule. The cluster is left at exactly the three
specified icons. **Placement flagged to Miles.**

## Two contract deviations, both deliberate and both flagged

1. **`.gbar` spans the whole track** (`position:absolute; inset:0`) rather than
   the contract's `min(left)` → `max(left+width)` of `phaseBars(row)`. `.gseg`
   offsets are percentages **of the track**, so a narrower wrapper re-bases every
   one of them and moves the shipped bars. `pointer-events: none` on the wrapper
   and `auto` on the segments (the `.gunsched` pattern) makes the **segments**
   the only hit area, so the grab target is exactly the bar the user sees and the
   `.gweek` cells stay droppable. Side effect: the browser's default drag image
   is the transparent full-track box, so the ghost reads as the bar floating but
   is not tight. Reversible with a `barGroup(row)` helper that re-bases the
   segments, at the cost of a new harness stub.
2. **The banner markup appears at two sites** (leading duplicates; in-loop
   overlaps + gaps) instead of once through a Ractive partial. Ractive accepts
   partial *definitions* only at the top level of a template, and the render
   harness slices the modal out as a subtree — a top-level definition would fall
   outside the slice and `{{>sbanner}}` would not resolve in tests. Both copies
   are byte-identical and read `.variant`; the styling is a **single** `.sbanner`
   recipe with three modifiers, which is what the one-recipe rule asks for.

## Two defects fixed at integrate

- **Calendar Remove was live on a row that had no slotted week.** `/replot`
  audits every move it *applies*, and a `null → null` move is applied — so a
  single click wrote a `schedule.replot` row for a non-change. Invariant 10 logs
  **changes**, not attempts, so the affordance now carries the rule: the button
  is `disabled` (title *Already off the schedule*) and `unslotRow` returns before
  writing. The route stays a dumb applier. A probe leg proves the route's
  behaviour is what makes the guard necessary.
- **R7 was shipped as a dead end.** Save was disabled while `sprintDraft` was
  empty, which meant a user who removed every sprint could never persist that
  removal — with no other route to an empty list in the UI. The contract's own
  risk row states the intended behaviour ("deleting the last row from a filled
  table must keep Save enabled"), so the two states are now distinguished by one
  flag set at open (`sprintOpenedEmpty`): **opened with none** → Save dead (the
  frame's own empty-state treatment); **emptied by the user** → Save live. The
  route already accepted an empty list and audits the replace like any other;
  a probe leg proves it end to end. **Flag to Miles** — this is the one place the
  build reads the contract's risk row over its §3.2.4 rule.

  > **SUPERSEDED by R-f-10 (owl #37 item 1, batch 5b).** The flag it describes,
  > `sprintOpenedEmpty`, no longer exists anywhere in the build. Miles answered
  > the flag by reframing the question rather than picking a side of it — see
  > *Owl #37 — the two sprints-modal rulings* below. Both behaviours recorded
  > here still hold; they are now consequences of the dirty rule, not cases in
  > their own right.

## Two defects fixed at review (batch 4)

- **The bar drop was refused for every short reslot.** The drag reversal made
  `.gbar` the source with `pointer-events: none` on the wrapper and `auto` on the
  `.gseg` children, so a drag can only *start* on a segment. During an HTML5 drag
  the drop target is hit-tested under the pointer and hit-testing honours
  pointer-events, so `dragover` kept firing on `.gseg` and bubbling
  gseg → gbar → gtrack → growr → gbrows — a path with **no** dragover handler
  (the only two in the planner are `.gweek` and `.gblockhead`). Nothing called
  `preventDefault`, so the location was not a valid drop target and the drag
  snapped back with no `moveRows` call. The dragged row's own segments stay
  painted during the drag, so **any** horizontal move shorter than the distance
  from the grab point to the bar's edge — the ±1-week reslot the bar's own title
  advertises — always failed; only wandering vertically off the 26px strip onto
  bare `.gweek` worked, which contradicts "horizontal only". The `.gdl` deadline
  tick (`pointer-events` auto, full row height) intercepted the same way. Fix:
  `dragRow` sets `ganttDragging` and dragend clears it, `.gantt.gdragging` makes
  `.gbar .gseg` **and** `.gdl` transparent to hit-testing for the duration, so the
  `.gweek` columns underneath keep receiving the drag. One drop recipe still —
  the week cell. `moveRows` clears the flag a second time so a re-render that
  eats the source node cannot leave the bars permanently un-grabbable. It also
  fixes the unscheduled row-drag, whose pointer crosses other rows' bars on its
  way to a week. Verification is a **live-browser** case (a 1-week drag on a
  multi-week bar), folded into the still-open T134.

  > **SUPERSEDED by R-g-1 (batch 7, T153).** The diagnosis above is right about
  > the symptom and wrong about the cause, and the fix it describes made the
  > feature worse rather than better: it left `pointer-events: none` on the drag
  > SOURCE and then blanked the source's own children mid-drag. Chrome hit-tests
  > the draggable ancestor when a drag begins and abandons the drag in the same
  > tick if that ancestor cannot be hit, so from batch 4 onwards the bar could
  > not be dragged at all — no `drag`, no `dragenter`, no `dragover`, no `drop`.
  > The reasoning was never tested against a real pointer; every check since drove
  > the path with synthetic `DragEvent`s, which call the app's handlers directly
  > and never enter Chrome's drag machinery. See *Batch 7* below. `ganttDragging`
  > survives, with `.gdl` as its only subject.
- **The empty state's Cancel shipped at full strength.** Contract §1.1 draws
  Cancel's label `--slate-400` in the empty state and `--slate-900` in the other
  three; `.smbtn.ghost` was `--slate-900` unconditionally with no state modifier
  on the button. The earlier reading — that dimming it would make a live control
  look dead — over-read the frame: it dims the **label only**, leaving the
  border, fill, hover and click untouched, which is de-emphasis behind
  "Add Sprint", not a disabled treatment. Now `.smbtn.ghost.dim`, applied on
  `!sprintDraft.length` so the modifier tracks the rendered branch exactly.

## Known consequences and treatments still owed (batch 4)

| # | Point |
|---|---|
| 7 | **R11 widened.** `.gantt.lpc` hides `c-status` **and** `.gchips`, so a collapsed left pane now hides the action cluster *and* the status-note affordance. Pre-existing shape recorded at T133; not widened in scope, but the surface it costs grew |
| 8 | The `label-offset` 1px paddings inside the table header cells are folded away into the cells' own padding — one declaration instead of a wrapper per label |
| 9 | **Whitespace-only sprint names are still acceptable.** Zod's `min(1)` lets `" "` through and a single such row saves with a blank-looking name; two of them *do* collide as duplicates (both trim to the same empty key). No rule was specified, so none was invented — flag if a non-blank rule is wanted |
| 10 | **Gap and overlap pairs are detected in START order** (the order the route persists in) but each banner sits after the **draft** index of its earlier-starting member. If a user reorders rows so draft order diverges from start order, a banner can sit somewhere other than literally between its two rows. Matches R-f-4's intent for every normal case — the server returns sprints sorted by start, and `addSprint` appends after the last end |
| 11 | **The explainer's double space before "its"** is verbatim in the template source, but Ractive collapses whitespace in text nodes (`preserveWhitespace` defaults to false), so `toHTML()` and the browser both render one space. A render test asserting the double space would fail |
| 12 | **Overlap copy is new** — the frame supplies no string. It reads *"&lt;A&gt; and &lt;B&gt; cover the same weeks. Sprints cannot overlap, so this list will be rejected on save."* The deletion confirm reads *Remove &lt;name&gt;?* / *N deliverables will move to Outside any sprint.* with **Cancel** / **Remove sprint** — deliberately not "Keep it" / "Delete sprint", which R-f-5 requires to be absent everywhere |
| 13 | **The DB-backed suite flakes roughly 1 run in 5, and did so before this batch.** Measured at review: a clean `HEAD` worktree failed once in six full runs (`acks.test.ts`, *socket hang up*), and the working tree failed once each on three *different* files (`schedule.test.ts`, `dayplan`, `authz-matrix.test.ts`) over the same number. Always a different test, always one of the `MongoMemoryServer` + supertest files, never a render test, and never reproducible when the file is run alone (6/6 green). It reads as parallel-startup contention in `mongodb-memory-server`, not a logic defect — but the gate is not deterministic today, and a red run should be re-run before it is believed. **Not this batch's to fix; worth a `vitest` pool/isolation setting** |

## What was verified at integrate (batch 4)

- Gates: `npx tsc --noEmit`, `npx eslint .`, `node frontend/build.js`, and
  `npx vitest run` under **three** timezones (default, `TZ=UTC`,
  `TZ=Asia/Manila`) — 52 files / **564** tests (557 at integrate, +7 for the two
  review fixes), from the 463 this batch started at. `scripts/batch4-probe.ts`
  passes under all three as well.
- Constitution: `git diff lib/` **empty**; `CLAUDE.md` and `.specify/`
  untouched; the write registry unchanged at **W1 / W2 / W3** and no route
  touched by this batch imports `lib/trello.ts` or any sheets client (asserted
  in the probe, not claimed); every sprint query filters `project_id` and
  uniqueness is per project by construction (proved by a cross-project save);
  **membership stays derived** — a probe leg asserts no key matching `/sprint/i`
  ever lands on a deliverable; both rejection classes write **nothing** and audit
  **nothing**, because a refusal is not a state change.
- Template behaviour is **rendered, not grepped**: `renderSprintModal()` joins
  the harness beside `renderGantt()`/`renderSuggestBar()`, and the two Ractive
  **directives** in this batch (`on-dragstart`, `on-drop`) are asserted against
  source with that stated in the test, because they never reach `toHTML()` for
  any row kind.
- The three sprint validators are **executed out of the shipped
  `frontend/scripts/01-app.js`**, the `test/suggest-counts.test.ts` precedent.
  That matters most for R-f-8: `lib/**` is frozen, so the working-day rule is a
  second date-math site with no golden test behind it. The probe pins the wire
  contract (S4) and the rule's behaviour against an injected holiday calendar;
  the client expression is executed directly.
- **Not run: a live-browser pass.** The drag reversal replaces the planner's
  primary interaction and the repo still has no browser test runner. A real bar
  drag, a drop past the covered weeks, a drop on the Unscheduled header, a
  multi-select bar drag, the pinned refusal and the arrival pulse + scroll are
  **owed before deploy** and are folded into the still-open T134. The review fix
  above widens that pass by one **load-bearing** case: a **±1-week drag on a
  multi-week bar**, where the pointer never leaves the row's own segment. That is
  exactly the drop the hit-testing defect refused, and no `toHTML()` assertion
  can prove the browser now takes it — only a real drag can.

---

# Batch 6 — Requestor cell truncation (phase 13k cont., 2026-08-17)

Owl **#39 as corrected by #40**, node `262:33394` (file `abDRsIVDs1XjJKeR8xYOoF`),
two annotations — Design Specs (marked BUG FIX) and Interaction. One cell,
frontend only: no server, no wire, no schema, no migration, no write registry
anywhere near it. T150 / T151. Requirements: **FR-5.1** (the fixed list pane)
and **NFR-9** (WCAG 2.1 AA — the keyboard half of the tooltip is not optional).

## The defect — two of them, in one cell

`.gantt .gdetails .c-req` is a fixed **136px** box and the badge inside it hugs
its text. `.gcell` carried `overflow: hidden`, so:

1. a long requestor was cut **mid-character**, with no visual sign it was cut; and
2. because the clip belonged to the CELL and not to the badge, roughly **8px of
   text painted outside the badge's own 1px stroke** before the cell cut it.

Both have the same cause: `text-overflow: ellipsis` can only act on the box that
owns the overflow, and the badge did not own it.

## Miles's ruling (both owls), and what shipped

| # | Ruling | Shipped |
|---|---|---|
| 1 | Truncate with a trailing ellipsis at the badge's max width; never exceed the cell's inner width | `.clipbadge .cliptext { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }` — the cap is `.pbadge`'s **existing** `max-width: 100%` |
| 2 | Full value in a tooltip, on hover **and** on keyboard focus | one CSS rule, two selectors: `:hover::after` + `:focus-visible::after`, `content: attr(aria-label)` |
| 3 | Truncate by AVAILABLE WIDTH, not character count | `refreshClips()` measures `scrollWidth > clientWidth` after render; a value that fits gets no ellipsis, no tooltip and no tab stop |
| 4 | Do NOT wrap | `white-space: nowrap` kept; the tooltip is `position: absolute`, so it is not a flex item and adds no layout — row heights stay aligned to the timeline bars |
| 5 | Do NOT widen the column | `.c-req` is still `width: 136px`; the only change to it is `overflow: visible` |

**#40's correction, recorded because it is the reason not to widen:** production
requestors are short names — "Andy", "Chev". The clipped value in the frames is a
fixture `@handle`, longer than anything the intake sheet produces. The bug is
real (the app must not cut a name mid-glyph) but it is a *robustness* fix, not a
sizing fix, and treating it as a sizing fix would have cost 100+px of the pinned
pane and fought the collapsible left pane for nothing.

## The design question, and why the clip moved INWARD

`.gcell { overflow: hidden }` clips anything a tooltip could be. Three ways past
it; two were rejected.

| Option | Verdict |
|---|---|
| `position: fixed` overlay placed by JS, reusing `openOverlay`/`placeBox` and the `.selectmenu, .duepop, .warnpop` recipe | **Rejected.** It is the house clip-escape, but it needs Ractive state, per-row hover handlers and a positioner — for a static string in an informational cell. |
| Anchor the tooltip to `.gpin` (sticky, so a positioned descendant escapes the cell's clip) | **Rejected.** Correct, but placement then needs `left: 417px` — a pane-width constant in a stylesheet that deliberately keeps none, and `test/gantt-collapse.test.ts` already forbids the number in JS. |
| **Release the clip on `.c-req` alone and move it into the badge** | **Chosen.** |

**This does not weaken the fixed-box rule.** What holds the pinned block to
`--gleft` is `flex: none` + the column's own `width`, not the overflow — and both
are unchanged. The cell's clip only ever prevented visual spill; once the badge
clips its own text the cell has nothing left to spill, so the clip is redundant
where it stood and useful one level in. The other four columns keep `.gcell`'s
clip untouched. `.gantt .gdetails .c-req` and `.gantt .gdetails .gcell` are the
same specificity (0,3,0), so the fix wins on **source order** with no new
selector — asserted, because a tidy-up that moves the rule above `.gcell`
silently restores the bug.

## The measurement, and where it runs

`refreshClips()` sits beside `refreshThumbs()` in `frontend/scripts/01-app.js`
and mirrors its shape. Three properties matter:

- It is a **measurement**, never a string-length guess. A character count clips
  "Andy" on one font and misses a long value on another.
- The comparison is **strict** — `scrollWidth > clientWidth`, deliberately *not*
  `updateThumb()`'s `+ 1` epsilon. It shipped with the epsilon and a review
  caught it in a real browser: `text-overflow: ellipsis` fires on **any**
  overflow, so `scrollWidth === clientWidth + 1` is a badge the user can see
  truncated (ellipsis drawn, 2–3 characters gone) that got no tooltip and no tab
  stop — this exact bug surviving inside a ~1px band. The costs are asymmetric,
  which is why the two sweeps differ: a false positive here is a harmless
  tooltip on a value that only just fits, a false negative hides the identifying
  part of a name with no way to reach it. `updateThumb()` guards the opposite
  trade (do not draw a useless slider for 1px of scroll) and keeps its epsilon.
  Both metrics are integer-rounded anyway, which absorbs the sub-pixel noise the
  epsilon was there for.
- It **clears as well as sets**. `{{#each g.rows as row}}` is unkeyed, so Ractive
  reuses badge nodes by index and only rewrites their text — a node that held a
  long value and now holds a short one would keep a stale tab stop and a stale
  tooltip forever if the sweep only added. Neither `data-clipped` nor `tabindex`
  appears in the template, so Ractive does not own them and will not fight the
  sweep between renders.

It rides the rAF seams that already existed — no observer was added, and the
codebase still contains no `ResizeObserver`, `MutationObserver` or
`IntersectionObserver`:

| Seam | Covers |
|---|---|
| `loadAll()` | every reload **and** the project switch — `resetForProjectSwitch()` and `popstate` both end there |
| `selectTab(id)` | returning to Sprint Schedules remounts the whole sheet |
| `toggleBlock` | an expanded block's rows did not exist a frame ago |
| `toggleLeftPane` | collapse strips the tab stop, expand restores it |
| `document.fonts.ready` (module level, once) | `frontend/index.html` loads Google Sans Flex with `display=swap`, so the FIRST paint measures fallback metrics and every width shifts when the real font lands |

Deliberately **not** hooked to `resize`: every width in the pinned pane is a
literal px with no responsive rule, so the viewport cannot change this verdict.

**The left-pane collapse needs no special case.** `.gantt.lpc` changes only
`--gleft` (999 → 417) and `display`; it never touches `.c-req`'s 136px. Collapsed,
`.c-req` is `display: none`, both widths read 0, `0 > 0` is false, and the hidden
cell is stripped of its tab stop — which is what a hidden cell should have.
Expanding re-measures and gives it back.

## No tab stop on a badge that is not truncated

The template emits **no `tabindex`**. The measurement is the only thing that
grants one, and only to a badge that is actually clipped. Both the tab stop and
the tooltip hang off the same `data-clipped` attribute, so ruling 3 and the
"do not add a tab stop to every row" constraint are one mechanism, not two.

The badge also carries `on-keydown="['noop']"` — the **existing** handler, whose
whole body is `stopPropagation`. `.growr` carries `on-keydown="['rowKey', …]"`,
and `rowKey` **reslots the deliverable a week** on ArrowLeft/ArrowRight through
`POST /replot`. Keydown bubbles, so without the guard, tabbing to a purely
informational badge and pressing an arrow would move data. (The hazard is
pre-existing for `.gact` and `.gsel`, but this batch adds the first
*informational* focus target, where a destructive side effect is indefensible.)

## The accessible name needs a role to be legal

The badge is a `<span>`, i.e. **`role=generic`**, and ARIA 1.2 lists
name-from-author as **prohibited** on generic. Chrome exposes the `aria-label`
anyway (verified in its accessibility tree), and the full value is the element's
text content regardless, so nothing was ever *lost* — but a conforming AT stack
may drop the label, and the badge enters the tab order once truncated. It
therefore carries **`role="note"`**: the weakest role that permits an author
name, on both branches (focusable or not), so the markup never varies with a
measurement. `aria-label` stays because `content: attr(aria-label)` is the
anti-drift mechanism — one attribute is the accessible name and the tooltip
text, and they cannot disagree.

## Known gaps, recorded rather than built around

**WCAG 1.4.13 (Content on Hover or Focus)** asks for three things. Two are met:
the tooltip is **hoverable and persistent** — `top: 100%` leaves no dead zone, so
the pointer can travel onto it, and hovering a pseudo-element keeps `:hover` on
its originating element. The third, **dismissible with Escape**, a pure-CSS
`:hover`/`:focus-visible` tooltip cannot do. Answering it means putting JS state
and a keydown listener behind an informational cell — more machinery than the
ruling asked for, on the element least likely to need it. **Flagged to Miles as
open, not fixed.** If she wants Escape dismissal, it is a deliberate second
change, not a patch. **T152 carries it as an explicit question for Miles/JP** so
the decision is made rather than left sitting in a CSS comment — NFR-9 names
WCAG 2.1 AA, which makes 1.4.13 a requirement and not polish.

**Touch has no reveal path.** No hover, no Tab, so a truncated value cannot be
read on a touch device. Not a 1.4.13 failure (the criterion governs hover and
focus content where it exists), and Sirius is a desktop tool, but it is the same
question in a different input mode and goes to Miles with the Escape gap rather
than being answered here.

## What was verified at integrate (batch 6)

- Gates: `npx tsc --noEmit` ✅ · `npx eslint .` ✅ · `node frontend/build.js` ✅ ·
  `npx vitest run` **682 / 682, 56 files** ✅ · `TZ=UTC npx vitest run` **682 /
  682** ✅. Suite **645 → 682** (+37, one new file).
- **Flake honesty (T149).** One `TZ=UTC` run out of six went red with **3**
  supertest *transport* failures in server files this batch does not touch;
  three default runs and the other three `TZ=UTC` runs were 682/682, and
  `test/gantt-requestor-clip.test.ts` is 37/37 on both timezones in isolation.
  A fifth file, `test/schedule.test.ts`, was seen failing in setup with
  `POST /__test/login` → `404` during this review and is now on T149's list.
- Constitution: `git diff lib/` **empty**; `CLAUDE.md`, `.specify/` and every
  `src/**` file untouched; the write registry unchanged at **W1 / W2 / W3**; no
  Trello or Sheets path exists in this batch by construction — it is four
  frontend files and one test.
- Template behaviour is **rendered, not grepped**: `test/gantt-requestor-clip.test.ts`
  drives the SHIPPED template through the harness's `toHTML()`. The two Ractive
  **directives** (`on-keydown` on the badge, `on-keydown` on the row) are
  asserted against source with that stated in the test name, because directives
  never reach `toHTML()`.
- **The measurement itself is not exercised.** There is no vitest config and no
  jsdom in this repo, so vitest runs in `node` and nothing has a layout. Every
  assertion about `refreshClips()` reads the shipped `frontend/scripts/01-app.js`,
  and the suite's header says so.
- The suite was proved to **bite**: ten negative controls, each reverted —
  dropping `min-width: 0` (1 red), restoring the cell's clip (1), dropping the
  `noop` guard (1), adding a `tabindex` to every badge (2), swapping the
  measurement for a character count (1), making the sweep add-only (1), removing
  the webfont re-measure (1), drifting `aria-label` away from the visible
  text (1), reinstating the `+ 1` epsilon (1), and dropping `role="note"` (1).

### One test-plan assertion relaxed, deliberately

The plan asked for `expect(APP_JS).not.toContain('136')`. It fails on
**pre-existing prose**: `frontend/scripts/01-app.js:17` has documented the column
arithmetic (`58 gutter + 97 + 262 + 136 + 146 + 300`) since phase 13i, and that
comment points AT the stylesheet rather than duplicating a constant. Deleting a
correct comment to satisfy a substring match makes the codebase worse, so the
ban is enforced **where it means something** — a `widthInCode()` scanner ignores
block and line comments and asserts no *executable* line carries the number, with
its own negative control proving the scanner is not vacuous. The standing
`expect(APP_JS).not.toMatch(/\b(999|417)\b/)` is re-asserted untouched.

## Owed: a live-browser pass (T152)

Nothing below can be proved without a DOM, and all of it is load-bearing:

- (a) a short name ("Andy") renders in full — no ellipsis, no focus ring, and
  **no tab stop**;
- (b) the fixture `@handle` renders with an ellipsis, is reachable by Tab, and
  shows the full value on `:focus-visible` as well as on hover;
- (c) the tooltip is not clipped by the cell, does not cover the row-action
  cluster, and clears the sheet's bottom edge on the LAST row (it occupies
  y≈41–63 inside an 84px row, and `.gfoot` sits below the last block in the same
  scroller — checked on paper, not in a browser);
- (d) collapsing the left pane removes the tab stop and expanding restores it;
- (e) the verdict is correct **after** the webfont swaps, not only before;
- (f) an arrow key on a focused badge does **not** move the row;
- (g) the **boundary**: a value whose text lands 1px past the badge's inner box
  (the review found `efnnbggtgubwkidx` sits in that band at the shipped
  geometry) shows the ellipsis **and** gets the tooltip and the tab stop — the
  case the `+ 1` epsilon used to miss;
- (h) Miles/JP rule on the two recorded gaps: Escape dismissal (WCAG 1.4.13) and
  touch having no reveal path.

---

# Batch 7 — the bar owns its drop (phase 13k cont., 2026-08-18)

JP reported against the live site that the phase bar can no longer be dragged
along its row. Root-caused by the orchestrator with **real mouse input** (CDP)
before any code was written, and the diagnosis handed to the builders as fact to
verify rather than re-derive.

## R-g-1 — a drag source must stay hit-testable, in every state

**The ruling.** `.gbar` is `pointer-events: auto` at rest and stays `auto` for
the whole life of a drag, and the bar therefore **owns its own drop**. The
strategy of making the bar transparent so hit-testing falls through to the
`.gweek` cells underneath is withdrawn; it could never have worked.

**Why it could never have worked.** The wrapper carries `draggable="true"`; its
`.gseg` children carry the pixels. Chrome begins a drag from the draggable
**ancestor**, and hit-tests that ancestor — not the child the pointer happened
to be over. An ancestor that cannot be hit is a drag Chrome creates and cancels
in the same tick. With real input the shipped code produced exactly:

    mousedown:.gseg → mousemove → dragstart:.gbar → dragend:.gbar   (dropEffect "none")

No `drag`, no `dragenter`, no `dragover`, no `drop`. At `dragstart` everything
looked correct — `dataTransfer` carried `text/plain`, `effectAllowed: "move"`,
`.gantt.gdragging` was applied, the source node was still connected, nothing
called `preventDefault`. The app's handlers were never the problem; they were
never reached.

Three controls, all with real input, close it:

| # | Control | Result |
|---|---|---|
| 1 | The unscheduled **row** drag, same tool, `.growr` is `pointer-events: auto` | Full sequence, `dropEffect: "move"`, the row slotted — the tooling and the app are both sound |
| 2 | Force `pointer-events: auto` onto `.gbar` | `dragstart → drag → dragenter → dragover ×N → dragend` — the drag lives (it still did not drop: nothing on that path called `preventDefault` yet) |
| 3 | Force `.gantt.gdragging .gbar { pointer-events: none }` | The instant-cancel signature returns — "hit-testable at mousedown only" is **not** enough |

Control 3 is why the minimal patch fails and why moving `draggable` onto `.gseg`
was also ruled out: the shipped `.gantt.gdragging .gbar .gseg { pointer-events:
none }` would then blank the source mid-drag and abort it the same way.

**What shipped.**

- `35-gantt.css` — `.gantt .gbar { … pointer-events: auto … }`, written out
  explicitly rather than merely omitted: `pointer-events` **inherits**, so the
  stated value also defends the source against any future ancestor rule, and it
  is what the new guard reads as its positive assertion. `.gseg` is deleted from
  the `.gdragging` rule; `.gantt.gdragging .gdl { pointer-events: none; }` stands
  alone. Nothing was restyled — segment geometry, the phase→colour map and the
  legend are byte-unchanged.
- `00-app.html` — the `.gbar` open tag gains a third attribute line,
  `on-dragover="['dragOver']" on-drop="['dropOnBar']"`. The existing `dragOver`
  is reused (it is already exactly `preventDefault()`); no `on-dragenter`, which
  mirrors the shipped `.gweek` recipe. Lines 1 and 2 of the tag and the `title`
  line are byte-identical, so the render tests that pin them keep matching.
- `01-app.js` — one named pure function `weekAtX(clientX, rect, weeks)` beside
  the other gantt geometry helpers, and one handler `dropOnBar(ctx)` beside
  `dropOnWeek`.

## Why `ganttDragging` was NOT deleted

The brief allowed deleting the flag if the transparency rule left it with no
consumer. It has one, and it is load-bearing. `.gdl` is a **later sibling** of
`.gbar` inside the same `position: relative` `.gtrack`, both `position:
absolute` at `z-index: auto`, so the deadline tick paints **over** the bar and
wins hit-testing across its 2px column. Left solid for the duration it takes the
`dragover` there, carries no handler, calls no `preventDefault`, and the drop is
refused at exactly the deadline — the one column a user is most likely to aim
for. Making it permanently transparent is not a free swap: at rest it owns a real
`title="deadline …"` affordance. So the flag stays; only its `.gseg` clause is
gone, and `moveRows`' defensive clear stays too (a re-render that eats the source
node swallows `dragend`, and a stuck flag now costs every tick its tooltip).

## The X→week mapping

With the bar solid, the `.gweek` cells beneath a **scheduled** row no longer see
the drag, so the mapping they used to do by simply being hit has to be done in
code:

```js
const weekAtX = (clientX, rect, weeks) => {
  const n = weeks ? weeks.length : 0;
  if (!n || !(rect.width > 0)) return null;
  const col = Math.floor((clientX - rect.left) / (rect.width / n));
  return weeks[Math.min(n - 1, Math.max(0, col))].key;
};
```

- **Named and pure**, not an expression inside the handler, so a test can
  execute *this exact source* out of the shipped file. No `document`, no
  `window`, no `app.get`, no `WEEK_PX`, no `WEEK_COUNT` — the caller passes the
  measured rect and the week list in.
- **Divides the measured width by the count**, never the hard-coded 92px. Zoom
  and DPR rounding then spread evenly instead of drifting a column at the far
  end, and the function survives a retune of `--gw`.
- **Half-open**: column *i* owns `[left + i·w, left + (i+1)·w)`, so a pointer
  exactly on a boundary belongs to the **right** column.
- **Clamped both ends**, so a drop can never fall off the track; `null` only when
  there is nothing to measure, and the handler bails without writing.
- The equal-column premise is real, not assumed — `--gw` is declared once on
  `.gantt`, `.gweek` is `flex: none` at `width: var(--gw)`, `.gtrack` is
  `flex: none`, and the universal `box-sizing: border-box` absorbs the 1px
  border so the first column costs the same as the rest. It is **pinned by a
  test**, so a future variable-width layout fails loudly instead of silently
  skewing every drop.
- `ctx.node.closest('.gtrack')`, never `ctx.event.target`: with `.gseg`
  hit-testable again the event fires on a 26px segment and bubbles to the bar
  carrying the directive, and measuring the target would map a fraction of a
  column.

## One write recipe, unchanged

`dropOnBar` calls the same `moveRows` `dropOnWeek` calls. No second endpoint, no
second audit path: `01-app.js` still holds exactly the two pre-existing
`POST …/replot` call sites (Accept-suggestions and `moveRows`) it held at
`1e13088`, and BR-8 group resolution, the optimistic footer, the rollback banner
and the arrival pulse are byte-unchanged. `lib/**` is untouched and the write
registry stands at W1 / W2 / W3.

The card id comes off `dataTransfer.getData('text/plain')`, **never** off the
bar's own `row.cardId` — an unscheduled row dragged across a scheduled row now
lands on that row's bar, and reading the landing row would move the wrong card.

## Three consequences, all intended

| # | Consequence |
|---|---|
| 1 | On a **scheduled** row the `.gweek` cells no longer receive the drag — the bar covers the whole 1104px track. Their handlers stay live exactly where there is no bar: an **unscheduled** row renders `.gunsched` (`pointer-events: none`) instead, so week cells still serve it. `.gweek` markup is untouched |
| 2 | A **pinned** row's bar keeps `draggable="false"` and its refusal title, but **does** carry the drop handlers. The pin freezes the pinned ROW, not the column; suppressing them would carve a dead 1104px strip that silently refuses every drop. The directives sit outside any pinned conditional, which is what makes that true for every row state at once |
| 3 | ~~Cosmetic, and true after the fix: `cursor: grab` and the bar's `title` now apply across the whole track rather than only on a coloured segment. The whole wrapper really is the drag source and the drop target, so both statements are honest. Moving `cursor: grab` to `.gseg` would restore pixel-identical hover at the cost of making the cursor lie — not taken~~ — **OVERRULED by JP, 2026-08-18. See "The affordance is the coloured bars only" below.** The batch-7 reasoning was sound about the *mechanism* and wrong about the *user*: the hit area is honest at 1104px, the invitation is not |

## Why no test in this repo could see this, and the guard that answers it

There is **no jsdom and no browser runner** in Sirius — no vitest config, no
`environment` anywhere. Every planner test is Ractive `toHTML()` or a regex over
the shipped source. A synthetic `DragEvent` dispatched in a test runner calls the
app's handlers **directly** and never enters Chrome's drag machinery, so it
proves the handlers are wired and proves nothing about whether a drag can start.
That is the entire reason this bug shipped past every check from 13g/13j to
batch 6 while the live feature was dead. **Say so in the test names**: this class
of defect is invisible to synthetic events, and pretending otherwise is how it
comes back.

`test/drag-hittest.test.ts` (44 tests) is the standing answer. It does not
simulate a drag; it asserts the **conditions Chrome needs**:

- Drag sources are enumerated **from the shipped template** — every element open
  tag carrying a `draggable` directive, with its conditional class tokens — and
  the count is pinned at 3, so a fourth drag source joins the guard
  automatically instead of slipping past a hard-coded list.
- Every `pointer-events: none` rule in **all seven stylesheets**, read off disk
  so the bug cannot move to a new file, with `@media`/`@supports` walked into.
  For each selector the **rightmost compound** is the subject; if its class-token
  set is a subset of any drag source's possible tokens, the guard fails.
- An **ancestor sweep**, because `pointer-events` inherits; a **class-less
  subject** check, because `* { pointer-events: none }` names no class and would
  slip a subset test while disabling everything; and **parser self-tests**,
  because a guard whose parser silently matches nothing is worse than no guard.
- **Proven non-vacuous twice**: by permanent in-file fixtures (the shipped rule,
  the mid-drag variant of control 3, a state-scoped `.growr.pinned` variant, an
  `:active` variant, plus negative controls that must *not* fire), and — at
  integrate — by reintroducing `pointer-events: none` on `.gantt .gbar` in the
  real tree and confirming the guard goes red with
  ``35-gantt.css: `.gantt .gbar` makes the .gbar drag source un-hit-testable``.
  The line was restored immediately.

## Owed: a live-browser pass (T155)

Nothing in the suite can close this. With a real mouse, on the deployed build:

- (a) dragging a bar produces `dragstart → drag → dragenter → dragover ×N →
  drop → dragend` with `dropEffect: "move"`, and the row lands;
- (b) a **±1-week** move — the reslot the bar's own title advertises, and the
  case batch 4 could never do — lands rather than snapping back;
- (c) a drop **at the deadline tick's column** lands (this is the `.gdl` clause
  earning its keep);
- (d) an **unscheduled** row still drops onto a bare `.gweek` cell, **and** onto
  another row's bar, moving the dragged card and not the landing row;
- (e) a **pinned** row still refuses the grab and shows its message, while
  remaining a valid landing strip for someone else's drag;
- (f) the Unscheduled block header still unslots, and the keyboard ±1-week
  reslot is unaffected;
- (g) BR-8 multi-select still moves the whole group through one `/replot`;
- (h) ~~the cosmetic spread of `cursor: grab` and the bar `title` across the full
  track reads as acceptable to JP, or consequence 3 above is revisited.~~
  **RULED 2026-08-18 — revisited. Closed by T157; see below.** (a)–(g) remain
  open and still owe a real mouse.

## The affordance is the coloured bars only (JP, 2026-08-18)

**The ruling.** The pointer affordance belongs to the coloured runs. Batch 7 had
made `.gbar` span the whole 1104px track — correctly, and it must keep doing so
— and `cursor: grab` plus `title="Drag along the timeline to reslot"` rode along
with it, so the empty air to the right of a two-week run advertised itself as
grabbable. Consequence 3 above argued that was honest because the wrapper really
is the drag source. It is honest about the *mechanism* and wrong about the
*user*: what the user calls "the bar" is the colour, and an invitation printed
over blank track promises a handle that is not drawn there.

**The hit area did not move.** This is a cursor-and-title change and nothing
else. `pointer-events: auto` on `.gbar` and on `.gseg` is byte-unchanged, the
five directives on the open tag are byte-unchanged, `weekAtX`, `dropOnBar`,
`moveRows`, the geometry, the colours, the z-order and `.gantt.gdragging .gdl`
are all untouched. **Nothing may put `pointer-events` back on a drag source** —
that is the batch-7 bug, and `test/drag-hittest.test.ts` still bans it.

**Cursor.**

| Selector | Before | After |
|---|---|---|
| `.gantt .gbar` | `cursor: grab` | `cursor: default` |
| `.gantt .gbar .gseg` | `cursor: inherit` (this is *how* it inherited `grab`) | `cursor: grab` |
| `.gantt .gbar .gseg:active` | `cursor: grabbing` | unchanged |
| `.gantt .growr.pinned .gbar,`<br>`.gantt .growr.pinned .gbar .gseg:active` | `cursor: not-allowed` | subject moves off the wrapper: `.gantt .growr.pinned .gbar .gseg,`<br>`.gantt .growr.pinned .gbar .gseg:active` |

`default` is chosen over `auto` deliberately: `.growr` declares no cursor at all,
so the track now reads exactly like the rest of the row. `.gseg` names its own
value instead of `inherit`, so the two can never quietly re-merge. The pinned
rule needs **both** clauses — the resting one to beat `.gseg`'s new `grab`, the
`:active` one to beat `grabbing`; and it is scoped to the segments for the same
reason `grab` was, since a refusal is an affordance too and a 1104px
`not-allowed` would withhold a track that never offered anything.

**Title — deleted from `.gbar`, in both branches.** Where the two sentences went,
and why nothing new was invented:

| What it said | Where it lives now | Why that is enough |
|---|---|---|
| "Drag along the timeline to reslot" | the standing hint above the Gantt — `.fnnote`: *"Drag a bar along its row to reslot it — an unscheduled row drags onto a week. Pinned rows never move."* | It was already there, it is **not hover-gated**, and a tooltip that only appears once the pointer is already on the bar teaches nobody how to find the bar. Standing text is strictly the better home |
| "Pinned — unpin to move" (pinned branch) | `.growr`'s own `title="Pinned — unpin to move"`, plus each `.gseg`'s phase title with `· Pinned — unpin to move` appended | `title` is inherited by a title-less descendant, so the row's attribute covers the `.gtrack` and `.gbar` inside it. Deleting the bar's copy therefore removed a **duplicate**, not the message |

Nothing was added to the segment titles: they name the phase and its end date
(`Sketch → Aug 5`), and restating the drag mechanic on every run would make the
one tooltip that carries real information noisy.

**What a pinned row hovers as after the change — verified against the render:**

| Where the pointer is | Cursor | Tooltip |
|---|---|---|
| empty track | `default` | **"Pinned — unpin to move"**, inherited from `.growr` |
| a coloured segment | `not-allowed` (at rest **and** while pressed) | "Sketch · Pinned — unpin to move" |
| pressing a segment | `not-allowed` — and `draggable="false"`, so no drag starts | — |

An unpinned scheduled row, for contrast: empty track is `default` and **silent**;
a segment is `grab`, `grabbing` while pressed, and shows its phase title only.
The pinned row's bar keeps carrying the drop directives, unchanged — it is still
a valid landing strip for someone else's drag (consequence 2 stands).

**Tests moved, not weakened** (`test/gantt-rowactions.test.ts`). The old
`expect(r).toContain('title="Drag along the timeline to reslot"')` is not
softened, it is *wrong now* and was replaced by four assertions at the new
homes: the wrapper emits no `title=` at all and the string is absent from the
row; `.gbar` is `cursor: default` and **not** `grab` while `.gseg` is `grab` /
`grabbing`; the instruction is present as standing template text; and the
segment titles still carry a title with no `reslot` in it. The pinned block gains
the same treatment plus a **negative subject guard** — no rule may name
`.gantt .growr.pinned .gbar` as a subject again (`.gbar,` / `.gbar {`, but not
`.gbar .gseg`). Every one of them was re-run against the pre-ruling CSS and
flips, so none is vacuous.


---

# Batch 8 — the handle becomes the coloured run (phase 13k cont., 2026-08-18)

Batch 7 made the drag work by making `.gbar` hit-testable, and batch 7b moved the
*cursor* onto the coloured segments. Both left the *drag source* spanning the
whole 1104px track. This batch moves the source itself.

## JP's structural ruling, 2026-08-18 (verbatim)

> "gbar is a draggable element, inside that is the actual bars. The issue is gbar
> spans across the whole of the timeline so dragging it makes the whole thing
> draggable. What I would like to be draggable are only the bars inside the
> colored ones. However, for that to happen, those colored bars should be
> wrapped into a draggable container instead. Gbar stays, but the colored bars
> wrapped in a draggable container can now be dragged."

Two shape rulings came with it and were not re-litigated:

1. **ONE box over the whole coloured run**, not one handle per phase segment.
   The segments touch, so it looks identical and the handle cannot flicker
   across a seam.
2. **A minimum grab width with an invisible extension.** A one-day phase draws
   ~18px. The extra width must not paint, tint or outline anything.

## The structure that shipped

```
.gtrack                 positioning context, unchanged
  .gbar                 spans the track, pointer-events: none  ← wrapper only
    .grun               NEW — the drag source, one box over the run
      .gseg × N         re-based to .grun
  .gdl                  deadline tick, unchanged
  .gghost               suggest ghost, unchanged (still a child of .gtrack)
```

`.grun` carries all five directives — `draggable`, `on-dragstart`, `on-dragend`,
`on-dragover`, `on-drop` — plus its own inline `left`/`width`. `.gbar` keeps its
element and its class and carries **none** of them. Neither box carries a
`title`.

## SUPERSEDES the batch-7 line "`pointer-events: auto` on `.gbar` … is byte-unchanged"

`.gantt .gbar` is now `pointer-events: none`, deliberately, and that is not a
regression to the 13g/13j bug. The bug was a **drag source** that could not be
hit. `.gbar` is no longer a drag source; it is the source's parent. It has to be
transparent, because at 1104px it swallows every drop landing on the track
outside the coloured run and the `.gweek` columns beneath never see them.

That is legal only because `pointer-events` **inherits and a child's explicit
value overrides an inherited one**: `.gantt .grun { pointer-events: auto }` is
written out rather than omitted precisely so the wrapper's `none` cannot reach
the source. **The two rules ship together or not at all**, and
`test/drag-hittest.test.ts` now says so in an assertion that fails if either is
deleted — plus one that strips the `auto` out of the *real* rule set and proves
the sweep fires, so the escape is shown to be load-bearing on the shipped sheet
rather than only on fixtures.

## Why the geometry had to be recomputed — and why nothing moved

`phaseBars(row)` emitted each segment as `left`/`width` **in percent of the
60-workday window**. Put those numbers inside a narrower box and every one of
them re-bases: the bars move on screen. So the geometry moved into **one**
helper, `phaseRun(row)`, which returns the box *and* its segments already
re-based, and `phaseBars` was **deleted** — no second helper, nothing to drift.

All of it in units, one rounding at the end:

```
segments   sL = clampUnits(dayIndex(startIso))   sW = clampUnits(dayIndex(endIso)) − sL,  keep sW > 0
raw run    R0 = min(sL)                          R1 = max(sL + sW)
grab width W  = max(R1 − R0, MIN_GRAB_UNITS)
box left   L  = max(0, min(R0, TOTAL_UNITS − W))
box out    left = unitPct(L)                     width = unitPct(W)
seg out    left' = pctOf(sL − L, W)              width' = pctOf(sW, W)
```

The invariant, exact in reals, is that composing the two percentages back gives
today's number:

```
left + left'ᵢ · width / 100
  = 100·L/T + (100·(sLᵢ − L)/W)·(100·W/T)/100
  = 100·sLᵢ/T                        — exactly what phaseBars emitted
```

**W cancels.** That is the whole reason the minimum-width extension is free of
visual consequence: it does not matter how wide the invisible box is, or which
branch of the clamp fired, or how many segments there are.

`unitPct` was redefined as `pctOf(u, TOTAL_UNITS)` so the file has exactly one
rounding rule. Its output is byte-identical.

**No forecast math changed.** `dayIndex`/`clampUnits` run on the same
server-supplied `startIso`/`endIso`, in the same order, with the same drop rule.
Only the denominator of the final division moved. `lib/**` untouched.

## The minimum grab width is ARITHMETIC, never CSS — this was the trap

`MIN_GRAB_PX = 24`, expressed as units inside the helper:
`24 / (92 / 5) = 1.3043478…` units = **2.17% of the track**. The map is exact
because `--gw` is declared once (`35-gantt.css:19`, pinned by two tests) and
`.gtrack` is content-sized at 12 columns, so the track is exactly 1104px.

A CSS `min-width: 24px` would have looked equivalent and been wrong. `.grun` is
positioned in percent and its `.gseg` children resolve **their** percentages
against its **rendered** box — so a CSS minimum widens the box *after* the
arithmetic has run and every short bar visibly stretches. Same for `padding`, a
`border`, or `min-inline-size`. Doing it in units means the re-basing divides by
the already-widened width and the segments land unmoved. `test/gantt-run-geometry.test.ts`
bans all five properties on the rule by name.

## Direction, and the final column — one rule, one line

```js
L = Math.max(0, Math.min(R0, TOTAL_UNITS - W))
```

Anchor the box's left edge at the run's left edge and let the invisible part
grow **right**; if the grown right edge would pass the end of the track, slide
the whole box left until its right edge sits exactly on `TOTAL_UNITS`; never let
the left edge go negative. One expression, no branch, no second path to test.

A one-day run on the last workday (unit 59) gives `W = 1.3043`,
`L = 58.6957` → box `left="97.83" width="2.17"`, right edge exactly `100.00%`.
The left-edge mirror needs no special case: `R0 = 0` → `min(0, …) = 0` →
`max(0, 0) = 0`.

## Vertical extent: `top: 0; bottom: 0`, not a 26px box — **SUPERSEDED by batch 9**

> **Reversed 2026-08-18 by JP, after seeing it live.** The row-tall box is what
> put the week gridlines in the drag ghost. Batch 9 makes `.grun` the 26px bar
> strip and moves the centring onto it. The paragraph below is kept as the
> reasoning that was correct about the bars and wrong about the ghost.

`.gantt .gtrack .gseg` centres each segment with `top: 50%; transform:
translateY(-50%)` against its nearest positioned ancestor. That ancestor was
`.gbar` (`inset: 0`, full track height) and is now `.grun`. Giving `.grun`
`top: 0; bottom: 0` keeps the containing block the same height, so that rule is
**byte-identical** and the segments provably cannot move vertically. It also
makes `.grun` a purely horizontal box — one axis of geometry, one axis of CSS —
and yields an 84px-tall grab target instead of 26px, free because the box paints
nothing.

## The invisible part stays invisible, and does not lie about the cursor

`.grun` paints nothing: no background, border, outline, radius, shadow, opacity,
transition, z-index, `::before`/`::after`, no hover rule. Only `.gseg` paints.
The stylesheet gained exactly one rule.

`cursor: default` on the box and `cursor: grab` on the segments is JP's own
2026-08-18 affordance ruling applied at 24px instead of 1104px. The ~6px
invisible extension is empty track to the eye, so it shows the plain arrow while
still being grabbable — the same honest-hit-area / honest-cursor split, moved
down one level. `.gbar` names no cursor now and needs none: a
`pointer-events: none` box never receives hover.

**Specificity is preserved exactly** by the substitution: the pinned rule stays
(0,5,0) resting, still out-ranking `.gantt .grun .gseg` grab (0,3,0) and
`.gantt .grun .gseg:active` grabbing (0,4,0).

## A row with no visible phases has no handle

`phaseRun` returns `[]` — the same idiom `ghostBar` already uses — so
`{{#each}}` emits nothing and the row renders `<div class="gbar"></div>`: no
box, no `draggable`, no segment, no directives. **There is no `{{#if}}` anywhere
in the geometry path**; the absence falls out of the empty-array shape rather
than a second code branch.

## What "no visual change" was measured to mean

Not asserted — **measured**, at integrate, by rendering the same fixture row
through the OLD template + `phaseBars` at `1c571f1` and the NEW template +
`phaseRun`, with real Ractive, and reading the absolute percent-of-track
position back out of both HTML strings.

| Fixture | segs | run box | right edge | worst Δ | on a 1104px track |
|---|---|---|---|---|---|
| F1 one segment mid-window | 1 | 16.67% w 6.67% | 23.34 | 0.0000 pp | 0.000 px |
| F2 three touching segments | 3 | 8.33% w 25.00% | 33.33 | **0.0075 pp** | **0.083 px** |
| F3 clipped at the LEFT edge | 2 | 0.00% w 15.00% | 15.00 | 0.0040 pp | 0.044 px |
| F4 clipped at the RIGHT edge | 2 | 83.33% w 16.67% | 100.00 | 0.0050 pp | 0.055 px |
| F5a/F5b all clipped away | 0 | *no box at all* | — | — | — |
| F6 one-day run, FINAL column | 1 | 97.83% w 2.17% | 100.00 | 0.0063 pp | 0.069 px |
| F7 one-day run mid-window | 1 | 20.00% w 2.17% | 22.17 | 0.0063 pp | 0.069 px |
| F8 wider than the minimum | 1 | 41.67% w 15.00% | 56.67 | 0.0000 pp | 0.000 px |
| F10 zero-width segment mixed in | 1 | 25.00% w 6.67% | 31.67 | 0.0000 pp | 0.000 px |

Every fixture was rendered **pinned and unpinned**; segment count, `cls` and
`title` strings are identical to the old render in every one. Plus the
exhaustive statement: **every one-day run at every start unit 0…59, rendered
both ways** — worst drift 0.0063 pp = 0.069px, **0** boxes off the end of the
track, **0** boxes narrower than 2.17%.

**The worst case is F2, not F6** — the build brief's arithmetic predicted F6, and
the reason it is wrong is worth keeping. Three roundings feed the composed
error, not two: the box's `left` (≤ 0.005 pp), the segment's `left'` scaled by
W/T, and — the one the prediction omitted — **the 1c571f1 value being compared
against, which was rounded too** (≤ 0.005 pp, and it does not cancel). A wide
run lets the second through at full scale, which is why three touching segments
beat the single-column case. The analytic bound is ≈0.02 pp; the test's
tolerance is 0.02 pp and is therefore the bound, not a fudge. Both the helper's
comment and the test's were corrected at integrate to the measured numbers.

## The guard moved with the source — it did not shrink

`test/drag-hittest.test.ts` pins the drag-source **count at 3** and their class
names. The count is **unchanged**: `['entry', 'growr', 'grun']`. The source
moved, it did not multiply — one handle per phase segment is the variant JP
rejected, and this is what would catch it.

The ban itself **grew a rule it did not have**: the ancestor sweep now knows that
an inherited `none` is cured by the source's own explicit `auto`, and it applies
that **per source** — `.gantt` and `.gbrows` are ancestors of both `.grun` and
`.growr`, and `.growr` declares no `auto`, so a `none` up there is still caught.
`declaresAuto` is evaluated against the same rule set being swept, so a fixture
holding only a `none` still fires. The **source** sweep takes no exemption at
all: a source's own `none` is banned outright, in any state or spelling. The
`.gdragging` sweep takes no exemption either, and the reason is written down —
`display: none` on an ancestor cannot be undone from inside it.

Six fixtures pin the semantics, including the one that proves it is an exemption
and not a hole:

| Fixture | Offenders |
|---|---|
| `.gtrack { pointer-events: none }` | 1 |
| `.gantt .gbar { pointer-events: none }` | 1 — uncured |
| `.gantt .gbar { none } .gantt .grun { auto }` | **0** — the shipped shape |
| `.gbrows { none } .gantt .grun { auto }` | 1 — still caught *for `.growr`* |
| `.gscroll { pointer-events: none }` | 1 |
| `.gseg { pointer-events: none }` | 0 — a child, not an ancestor |

## Three contract deviations at build, all forced, none weakening

1. **Sorted source names.** The contract wrote `['entry','grun','growr']`.
   `.sort()` gives `['entry','growr','grun']` — `'o'(0x6F) < 'u'(0x75)`. The
   contract was wrong about JS, not about the pin. Count still 3.
2. **`draggable` adjacency is not assertable.** Ractive 1.4.4's `toHTML()` emits
   `style` before `draggable` **whatever order the template writes them in** —
   verified at integrate across three template variants including a fully static
   one. So `'<div class="grun" draggable="false"'` can never match a render.
   Three assertions read the extracted open tag instead
   (`/<div class="grun"[^>]*>/`) and then `.toContain('draggable="false"')` —
   same claim, order-independent. The **template source** assertions are
   unaffected and keep the contract's exact form.
3. **The ancestor sweep is a de-duplicated union** of the non-exempt sources'
   chains, not a per-source concatenation. The contract's own fixture table
   requires this: `.gscroll` is an ancestor of two sources, and concatenation
   would report 2 where the table says 1. It is also what the pre-batch guard
   already did — `dedupe()` is unchanged — so the shape is preserved, with the
   per-source filter added in front of it.

## What was verified at integrate (batch 8)

- **`node frontend/build.js`** — `public/index.html`, 333,049 bytes. Run first,
  because the rewritten Ractive `{{! … }}` block is the likeliest break; its
  first `}}` is its own terminator and `leakedMustacheText()` gates it in four
  suites.
- **`npx tsc --noEmit`** clean · **`npx eslint .`** clean.
- **`npx vitest run`** — **58 files / 783 tests**, and the same under
  **`TZ=UTC`**. Baseline was 57 / 735. (780 at integrate; the fix pass added
  three guard tests — see *Fix pass* below.)
- The first run went red on **one** test in `test/dayplan-api.test.ts`
  (`/__test/login` → 404), a file this batch does not touch — the T149
  parallel-startup signature. Rerun clean, nothing retried, capped or adjusted.
  The fix pass hit the same signature once more, in a different file again
  (`test/routing-returnto.test.ts`, 3 tests, `location` header undefined);
  green alone and green on the very next full run, both TZs. This is the
  environmental flake documented in `test/CLAUDE.md` rule 5 (loopback-port collision,
  ~1 full run in 5, random file), not batch 8.

### Fix pass (post-integrate review) — two guard hardenings, one doc correction

- **The `.gweek` cells got their own sweep.** The T158 exemption is correct for
  a drag SOURCE — `.grun` cures itself, so its whole chain leaves the ancestor
  sweep — but `.gtrack` is an ancestor of `.grun` and of nothing else that
  drags, so the chain that also carries the week cells stopped being swept the
  moment the source moved. Before T158 the cells were protected by accident;
  after it they were protected by nothing, and T158 is what made them
  load-bearing (`.gbar` is transparent precisely so a drop outside the coloured
  run reaches a cell). A future `.gantt .gtrack { pointer-events: none }` would
  have kept all three sources dragging, kept 780 tests green, and silently
  refused every drop outside the run — check (j), reaching the browser
  undetected. `WEEK_CELLS` (derived from the `dropOnWeek` handler, never
  listed) + `weekCellOffenders()` now sweep the cell and its ancestors with the
  same per-target `auto` cure, and the cells ride along in the `.gdragging`
  sweep. Mutation-probed on the real sheet: appending
  `.gantt .gtrack { pointer-events: none }` to `35-gantt.css` fails the new
  test and **nothing else** — proof the old guard could not see it. Scoped to
  the planner's week cells on purpose; `.gblockhead` and `.daycol` are other
  people's drop zones and are left alone.
- **A cure must hold for the whole drag.** `declaresAuto()` accepted any
  `pointer-events: auto` whose subject matched, including a state-scoped one
  (`subjectClasses` strips pseudo-classes, so `.growr:hover` read as `.growr`)
  and one inside an `@media` block (the flattener walks those in). Either would
  have exempted a source's entire ancestor chain on a cure that evaporates
  mid-drag — control 2's signature wearing a cure's clothes. The cure now
  requires a top-level rule (`CssRule.conditional === false`) with a state-free
  subject compound. The asymmetry is deliberate and is stated in the test: a
  BAN still counts `:active` and `@media`, because a rule that bites sometimes
  is a bug sometimes.
- **`node frontend/build.js` byte count corrected** to 333,049 across
  `docs/history/state-log/2026-08-18.md`, `tasks.md` and this file: the 332,828
  recorded at integrate predated the comment corrections made at integrate
  itself. The build is
  deterministic — two consecutive runs give the same bytes and the same sha1.
  The "all six directives" count is corrected to **five** in the same three
  places (`draggable`, `on-dragstart`, `on-dragend`, `on-dragover`, `on-drop`),
  matching `test/drag-hittest.test.ts`'s own wording.
- `test/gantt-legend.test.ts` and `test/planner-weeks.test.ts` **untouched and
  green**, which is itself the check: the phase→colour map did not fork (each
  `.gseg.<phase>` still declared exactly once, legend swatches untouched, and
  `.glegend` sits outside `.gtrack` so no new selector reaches it) and
  `TOTAL_UNITS`/`dayIndex` survived verbatim.
- Every `dropOnBar` body assertion in `test/drag-hittest.test.ts` **unchanged and
  green** — the proof that the drop path did not move. Both `weekAtX` suites
  likewise.
- `pointer-events` inventory across all seven stylesheets is now **8**
  declarations: `20-pipeline.css:230, 276` + `.gbar` (none), `.grun` (auto),
  `.grun .gseg` (auto), `.gdragging .gdl` (none), `.gghost` (none),
  `.gunsched` (none).
- `grep` confirms `phaseBars` appears **nowhere** in `frontend/` or `public/`.

## One defect found at integrate, by an unrelated guard

Correcting the helper's comment to the measured numbers turned
`test/suggest-counts.test.ts` red on *"the client declares the hard-mix
fallbacks exactly once and nowhere else"*. That drift guard strips lines
beginning `/*`, `*` or `//` and then requires `0.083` to appear on **exactly
one** line of `01-app.js`, matching `const HARD_IDEAL = 0.083;`. The block
comments in this file are indented continuation lines with no leading `*`, so
the prose measurement `0.083px` survived the strip and read as a second copy of
the share.

**The guard was right and the comment was changed**, not the guard: the pixel
figure is now spelled in words ("under a tenth of a pixel"), with a note beside
it saying why a bare decimal must not go back. Worth recording because it is a
live constraint on this file that no comment declares — a prose number in
`01-app.js` can collide with a drift guard reading it as code — and because it
is the one thing in this batch that a green suite would have hidden had the
comment not been corrected at all. The percentage figure is quoted precisely in
this document and in `docs/history/state-log/2026-08-18.md`, which the guard does not
read.

## Owed: a live-browser pass (folds into T155)

**Nothing here proves a drag works, and the tests say so in two file headers.**
There is no jsdom and no browser runner in this repo; every assertion is Ractive
`toHTML()` or a read of the shipped source text, and a synthetic `DragEvent`
never enters Chrome's drag machinery — it calls the app's own handlers directly,
which is exactly why every automated check from 13g/13j to batch 6 passed while
the live bar was un-draggable. **No synthetic DragEvents were added, and none may
be.** What the suite proves is that the conditions Chrome needs are present in
the shipped files and cannot silently regress, and that the coloured bars did not
move by a pixel.

The real-mouse pass owed on top of T155(a)–(g):

- (i) the drag now starts **only** from the coloured run — pressing empty track
  in the same row starts nothing;
- (j) a drop on empty track **outside** the run still lands, through the
  `.gweek` cell and the same `moveRows`;
- (k) a **one-day** phase is catchable at the 24px minimum, including one in the
  **final** column, where the handle must not hang off the track;
- (l) a **pinned** row still refuses the grab on its colour and still accepts
  someone else's drop, both on its run and on its empty track;
- (m) a **before/after screenshot** that is identical apart from the cursor.

---

# Batch 9 — the drag ghost is the coloured bars (phase 13k cont., 2026-08-18)

## JP's ruling, from the live build

> While dragging, the ghost that follows the pointer shows a background with the
> week grid lines and a drop shadow. I want only the coloured bars.

## The measured cause

`.gantt .grun` — the drag source since batch 8 — was `top: 0; bottom: 0`: the
**full row height** (99px measured on the live page) by the run's width (184px
measured), and transparent.

The browser's default drag image is **a snapshot of the source element's box**.
A row-tall source therefore hands Chrome a row-tall picture. Blink paints that
snapshot starting at the nearest stacking context and clips it to the source's
own bounds — its own source comment says the snapshot "will also paint the
contents behind the object if the object contains transparency and there are
other elements in the same stacking context which stacked below" — so the
`.gweek` gridlines and the row surface crossing that 99×184 rectangle came with
it, and the shadow wrapped the tall silhouette rather than the bars.

Nothing was wrong with the bars. The wrong thing was the **box**.

## The fix: the drag source IS the bar strip

Two rules, in `frontend/styles/35-gantt.css`. No JavaScript, no template change.

| | before (`79c1ad3`) | after |
|---|---|---|
| `.gantt .grun` | `position: absolute; top: 0; bottom: 0` | `position: absolute; top: 50%; transform: translateY(-50%); height: var(--gbar-h)` |
| `.gantt .gtrack .gseg` | `position: absolute; top: 50%; transform: translateY(-50%); height: var(--gbar-h); border-radius: …` | `position: absolute; top: 0; bottom: 0; border-radius: …` |

**The centring did not disappear — it moved up one level.** The identical triple
came off the segment and went onto the strip, and its `50%` resolves against the
**same containing block it always did**: `.gbar`, which is `inset: 0` of
`.gtrack` and is untouched by this batch. So the strip's top edge lands on the
pixel the segment's top edge landed on, and the segment then fills the strip
edge to edge. The bars are in the same place on screen, in exact reals — there
is no rounding on this axis at all, unlike the horizontal one.

Horizontal geometry is **byte-for-byte untouched**: `phaseRun`'s arithmetic, the
percent `left`/`width` on both boxes, and the 24px minimum grab clamp.
`frontend/scripts/01-app.js` was not edited.

## The one rule above all, unmoved

`pointer-events: auto` stays on `.grun` and on `.grun .gseg`, in every state.
Chrome cancels a drag whose source cannot be hit — proven with real mouse input
in batch 7 — and `test/drag-hittest.test.ts` bans the alternative outright. **No
`pointer-events` declaration anywhere in the app changed**; the inventory is
still 8. The source moved boxes in batch 8 and changed shape in batch 9; it has
never once stopped being hit-testable.

## The corollary is the ruling, not a regression

The vertical grab area shrinks from the whole 99px row to the 26px band. That is
**exactly what JP ruled** — only the coloured bars are the handle — and it is the
same ruling T157 applied to the cursor, now applied to the hit area itself, so
the affordance and the target finally agree on both axes. Nothing was added to
widen it back, and nothing should be. Horizontally the ~6px invisible
minimum-grab extension survives unchanged: a one-day phase is still catchable.

## Two side effects of `transform`, both accounted for

1. `.grun` becomes a **stacking context**. Paint order is unchanged: `.gdl` and
   `.gghost` are later siblings of `.gbar` at `z-index: auto` and still paint on
   top. It may also help the ghost — a stacking context is a smaller thing for
   the snapshot painter to start from — but that is not what the fix rests on.
2. `.grun` becomes a **containing block** for absolutely positioned descendants.
   It already was one, by virtue of `position: absolute`.

`--gbar-h` now has exactly **one owner inside the track** (`.grun`). `.gseg`
deliberately does not restate it: a second copy would over-constrain the box
(CSS drops `bottom` when `top`, `bottom` and `height` all appear) and could then
be re-tuned on its own.

## What the legend does — and why this rule cannot reach it

Checked before editing, quoted here because the batch brief asked for it:

| selector | what it is | touched? |
|---|---|---|
| `.gantt .gtrack .gseg` | the run segments — the rule that changed | **yes** |
| `.glegend .gseg` | the legend swatch: `display: inline-block; width: 20px; height: 10px; border-radius: var(--radius-sm)` | no |
| `.gseg.sketch` / `.review` / `.render` / `.renderOverdue` | colour only, no box — the single phase→colour map both share | no |
| `.gantt .grun .gseg` / `…:active` | the T157 cursor affordance | no |
| `.gantt .growr.pinned .grun .gseg` / `…:active` | the pinned refusal, (0,5,0) | no |

`.glegend` is a sibling of `.gwrap` and sits **outside** every `.gtrack`, so the
changed rule cannot select it. That is why the swatch keeps its own 20×10 box
while sharing the colour classes. `test/gantt-legend.test.ts` is untouched and
green, which is the check.

## Verification (T160)

`test/gantt-run-geometry.test.ts` grows **SUITE 6 — the vertical position
invariant**, built the way SUITE 1 was built for the horizontal one:

- a **frozen transcription** of the `79c1ad3` declarations as the oracle (frozen
  as a fixed point, not a mirror that tracks the source);
- the **shipped** declarations sliced out of `35-gantt.css` on the other side —
  `.gbar` read from the sheet on both sides, since it is the frame both hang
  from;
- a small, **total** CSS resolver between them that throws rather than
  defaulting on anything it does not model, so a future declaration it does not
  understand fails the suite instead of being silently ignored. It encodes the
  one subtlety the batch turns on: a percentage in `translateY` resolves against
  the element's **own** height, which is what makes the triple mean "centred"
  for any height.

Both sides are exact reals, so the assertion is **equality, not a tolerance**,
across four row heights: 84 (frame nominal), 99 (measured live), 120, and the
degenerate 26.

SUITE 5's two `.grun` shape tests were **repointed, not weakened**. The box must
now name `top: 50%`, `translateY(-50%)` and `height: var(--gbar-h)`, and must
**not** name `top: 0` or any `bottom` — restoring either restores the ghost
silently, with the bars still perfectly correct, which is precisely the failure a
test has to catch. The `.gseg` rule must restate neither a height nor a
translate. `transform` is explicitly kept off the "paints nothing" ban list, with
the reason written beside it: here it is geometry, not ink.

**Mutation-probed on the real sheet**: putting `top: 0; bottom: 0` back on
`.grun` fails **7 named tests**. A `not vacuous` case pins the two shapes that
could have shipped instead — a top-aligned strip (36.5px wrong on a 99px row)
and segments left double-centring inside the strip.

Suite **783 → 794** (58 files), green on default TZ and on `TZ=UTC`;
`npx tsc --noEmit` and `npx eslint .` clean; `node frontend/build.js`
335,370 bytes.

## One defect found at build, by an unrelated guard

A new CSS comment named the four phase colour classes while explaining which
`.gseg` users the batch must not touch. That turned `test/gantt-legend.test.ts`
red on *"declares each phase colour exactly once in the whole stylesheet"* — the
drift guard counts `.gseg.<phase>` occurrences in the **raw stylesheet text**,
comments included, so prose about the map read as a second copy of it.

**The guard was right and the comment was reworded**, not the guard, with a note
beside it saying why the classes are described rather than named. This is the
second time a comment in this codebase has collided with a drift guard reading it
as code (batch 8's was `0.083` in `01-app.js`); it is worth stating as a standing
constraint: **a guard that counts occurrences in a source file counts your
comments too.**

## What is ours and what is Chrome's — be honest about the line

**Ours (CSS controls it):** the **size and content of the snapshot**. It is now
a 26px-tall box the width of the run, containing the coloured segments, instead
of a 99px-tall box containing the gridlines behind them.

**Chrome's (CSS cannot touch it):**

- the **translucency** the drag image is composited at — the browser picks it;
- the **drop shadow** drawn around the drag image — macOS/Chrome's, applied to
  whatever bitmap is handed over;
- the **grab offset** of the pointer within the image;
- the fact that the source element **stays painted in place** during the drag.

There is exactly one lever over any of that, and this batch deliberately did not
pull it: `event.dataTransfer.setDragImage(node, x, y)` in `dragRow`, which would
replace the snapshot with an element or canvas of our choosing. That is a
JavaScript change to a drag handler the brief put out of scope, and it is the
right next step **only if** the live check still shows something unwanted.

**Residual risk, stated rather than hidden [likely]:** the snapshot is clipped to
the source's bounds but paints what is behind a transparent source within those
bounds. The vertical gridlines run the full height of the row, so they still
cross the 26px band — the opaque segments cover them across the run's own extent,
but two slivers remain where the segments do not paint: the `--radius-xs`
rounded corners, and the up-to-6px invisible minimum-grab extension on a short
run. Expect a ghost that is bars; do not be shocked by a hairline at a corner.
T161 is the check, and `setDragImage()` is the answer if it fails.

## Owed: a live-browser pass (T161, folds into T155)

Nothing here proves a drag works and **nothing here can see a repaint**. There is
no jsdom and no browser runner; every assertion is a read or an execution of
shipped source text. **No synthetic `DragEvent` was added and none may be.** With
a real mouse: the ghost is the coloured bars only; a before/after screenshot of
the resting planner is identical to batch 8's to the pixel; the grab still starts
anywhere on the band; the 26px vertical target is comfortable in practice (JP's
call); and whatever Chrome still adds of its own is recorded rather than fought.
