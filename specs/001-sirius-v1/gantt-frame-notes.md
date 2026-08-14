# Sprint Schedules — deliverables table + Gantt planner, frame notes (2026-08-15)

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
| R6 | **Not built, flagged**: sprint-header Checkbox (no annotation explains it) · block collapse/expand (annotation says confirm) · dragging the bar itself (rows drag; bar is display-only). | As issued — none of the three built. A click-to-open range picker is also not built (contract §3.11). |
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
| 1 | **12 columns do not fit.** Measured at integrate: at a 1600px viewport the scroller is 1470px, so the 999px pinned block leaves **5.1 of 12** week columns visible; at 1180px, 0.6 of a column. The page body correctly never scrolls horizontally and the left block stays pinned, but the view needs a call — narrower left pane, a collapsible column block, or a minimum supported width. |
| 2 | **`WEEK_COUNT` 8 → 12** also widens the `/suggest` horizon, which changes `suggestPlan` output. No code change needed (`POST /suggest` already accepts up to 26 weeks); the behavioural change is real and unaddressed. |
| 3 | **MC NO. renders `mcLabel` (the control number)**, per contract §2 — so MC-825's 99 deliverables all read "MC-825" in the column, with `display_id` only in the tooltip. Correct against invariant 3, but on a real board it will read as 99 identical rows. Worth a product look at showing `display_id` in the cell. |
| 4 | **Board-scope Review = amber** in the component set contradicts the Row-scope `#bfdbfe`; judged a stale copy (R4). |
| 5 | **Medium difficulty fill** is absent from the extracted facts; the build uses the existing `.pbadge.d-Medium` token pair (`--amber-50` / `--amber-500`). |
| 5b | **Easy difficulty fill disagrees with the frame.** The frame measures Easy at `#dcfce7` / `#16a34a` (= `--green-100` / `--green-600`); the shared `.pbadge.d-Easy` recipe — product's W3 tokens, Miles owl #04 — is `--green-50` / `--green-500`. Contract §3.10 mandates the ONE shared `.pbadge.d-*` map, so the build follows W3 and no CSS changed. Hard matches the frame exactly, so Easy is the only difficulty value where the frame and W3 disagree. **Product owns the call: retune W3, or accept the frame value as stale.** |
| 6 | **`.pbadge.s-ongoing` text** is `--blue-500`; the frame shows `--blue-700`. Left unchanged to avoid re-tinting the verified Pipeline tab. |
| 7 | Ghost-bar treatment (R8), footer warning treatment (R9) and the not-built list (R6) all need a product decision. |

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
