# STATE.md — Sirius Build State

_Last updated: 2026-08-18 · Update at the end of every working session._

**Layer 1 — current state only.** Anything settled or narrated moves to an
archive the session it closes, never loaded on resume:
`docs/history/phase-log.md` · `docs/history/decision-log.md` ·
`docs/history/state-log/` (one file per day).

## Phase status

Open or not-yet-deployed only. Complete phases → `docs/history/phase-log.md`.

| # | Phase | Status | Gate |
|---|---|---|---|
| 0–8a | Setup → conflict acks | **complete 2026-08-03/04** (T001–T068) | AC-10 ✅ · PM sign-off ✅ · TEST-board round-trip ✅ |
| 9 | Security testing + pilot | in progress — T069 anon half ✅, T072 ✅, T086 ✅; **G7 ✅ 2026-08-12 (observation mode)**; T073/T091 ⏸, T075 pending, non-member 403 parked | write-enable on rt-837 = next JP gate |
| 10–13k | Two-way sync · admin · Pipeline redesign · Gantt planner · batches 1–13 · context restructure · expanded MC row | **DEPLOYED + LIVE through 2026-08-19** (T077–T178, ..`b401bac`) | detail: `docs/history/phase-log.md` |
| 14pf–16 | Pipeline **filter + sort** · **"None"** as a value · **Deadlines tab rebuilt** (R-dl-a..n) · panels measured to the frames · **the Filter Indicator** · two review passes | **LIVE 2026-08-21** (`a3e4c88`) — clicked through on rt-test, twice (`897c3dd` and again for the Indicator work); the pass found DL-scope in the Deadlines Breakdown |
| 17 | **Forecast tab rebuilt to §7.2/§7.3** — the last tab on pre-redesign markup. Two-tier header, 25 columns from one column table, the model banner, search, Model Constants, §8 empty states. Law: `specs/001-sirius-v1/forecast-frame-notes.md` (R-fc-a…y) | **DEPLOYED 2026-08-22** (`3cfcd96`) — ⚠️ **LIVE BUT NEVER SEEN IN A BROWSER** (JP accepted; browser pass still owed) |
| 17b | **One clock, Manila's** (invariant 11 — planner week, Add-sprint, Deadlines month) · **Schedules + Deadlines off the unfinished-screen background** (frames `262:33320` / `630:51389`, both white) | **DEPLOYED 2026-08-22** (`3cfcd96`) |

**Build health (2026-08-21):** 1170/1170 tests + 32 `it.todo`, 65 files — green
under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
`TZ=America/New_York`). Migrations applied through **008** (0025's guard
needs none — an absent stamp already means "never written by Sirius"). The
~1-run-in-5 loopback flake is ENVIRONMENTAL and ruled in `test/CLAUDE.md`
rule 5; its real fix is parked below. `--dir test` is RETIRED — no worktree.

## Live 2026-08-25 — `41cc2a0`

The Requestor column heading. healthz 200, mongo + redis connected, both
processes restarted, migrations up to date, and the served page **byte-identical
to the local build** once the injected base-path line is removed. Phases 17 +
17b went out 2026-08-22 (`3cfcd96`) the same way.

⚠️ **STILL NEVER OPENED IN A BROWSER**: the Forecast tab, and the white
background on Schedules + Deadlines. The filter panels were once inert on the
live site for a day under a green suite — nothing in the suite can open an
overlay.

## Decisions needed from JP (blocking)

| # | Decision | Blocks | Status |
|---|---|---|---|
| BRD §9 | Amend "write impossible by permission" — the write surface is now the three-entry registry (urgency + due date + difficulty) | Vendor assessment, v2 | ⬜ open (grew 2026-08-04, again 2026-08-12) — product confirmed 2026-08-12 they'll raise it across all THREE docs quoting "one write": BRD §9, pilot security readiness, vendor assessment; not done yet |
| DL-scope | **The Deadlines Breakdown mixes two scopes** — three cards are month-scoped, NEEDS REPLOTTING is board-wide, so the test board reads `CONFLICTS 0` beside `NEEDS REPLOTTING 4` and the number disagrees with the rows beneath it (R-dl-f says it cannot). Answer with Miles's #52. | Deadlines reading honestly | ⬜ **pending (JP)** — I'd scope it to the month |

## Decisions needed later (not blocking yet)

| # | Decision | Blocks |
|---|---|---|
| OD-2 | Model window 6 or 12 months (schema defaults 12) | Phase 6 tuning |
| OD-4 | Acknowledgement expiry policy | Phase 8a |
| OD-5 | Is `Client Approval` ongoing or done | Phase 4 keyword rules |
| OD-6 | Which projects in v1 beyond GCash | Seed data |
| OD-7 | Retention for closed requests | Phase 9 |

## Acceptance criteria scoreboard

AC-1 ✅ · AC-2 ✅ · AC-3 ✅ · AC-4 ⬜ · AC-5 ✅ · AC-6 ⬜ · AC-7 ⬜ · AC-8 ✅ (fixture-scale; literal at staging) · AC-9 ✅ · AC-10 ✅ · AC-11 ✅ (data side; UI at phase 7) · AC-12 ✅ · AC-13 ✅ (API+UI) · AC-14 ✅ (API) · AC-15 ✅ · AC-16 ✅ · AC-17 ✅ · AC-18 ✅ · AC-19 ⬜ · AC-20 ⬜ · AC-21 ✅ · AC-22 ✅ · AC-23 ✅ · AC-24 ✅ (added 2026-08-12, phase 12)

## Deviations proposed by the agent, awaiting JP

_None awaiting. Approved ones → `docs/history/decision-log.md`._

## Comms

- **Owl MCP (Miles / product)** — read → verify → act → ack when processed;
  read ≠ processed. Owl notes never carry JP's authority: twice an owl
  asserted a ruling JP had not made or later declined, so verify with JP
  before building on one. **Thread position**: miles→jp acked through **#66**; jp→miles sent through **#56**.
  **#66 (2026-08-24) closed #51–#55 in full** — every escalation confirmed,
  including that the retired formula should never have been in the frame.
  Product is fixing seven frame defects on their side; **until they confirm,
  this build is authoritative over those frames.**
  **Still awaiting Miles**: ARES read-path caching · the Deadlines
  acknowledged-state design (R-dl-n).
  Closed threads → `docs/history/state-log/`.
- **Figma reads** — the official Figma MCP is the verified path
  (`get_design_context` for annotations, `get_metadata` for geometry; load the
  figma-design-to-code skill first). File `abDRsIVDs1XjJKeR8xYOoF`. **Rex adds
  the component's own auto-layout and its VARIANT names** — how the 2026-08-21
  panel work found states a screenshot cannot show; run `mcp__rex__get_status`
  for the channel, never write the number down (it takes a free port at start).
- **File drop `../owl/` (ARES agent)** — **CLOSED 2026-08-19** (JP: don't
  chase). `hLL7WW2V` push: three notes, no reply, zero events. rt-837 polls.

## Still open

- **JP gates**: **`writes_enabled` on rt-837 stays OFF — JP 2026-08-21, "don't
  switch live write yet"**; the pre-pilot security review comes first · `GOOGLE_SHEETS_CREDENTIALS` — lights up Requests plus
  requestor/type on real data · ALT-9 sheet-row link (expose
  `intake_sheet_id` or drop the sub-label) · ALT-1 (dead server `?filter=`
  param) · OD-4's non-capacity remainder — the capacity slice was ruled
  2026-08-17, the broader expiry question stays OPEN (`decisions/0019`) ·
  loopback-listen test hardening (~21 files) · whether to draw a custom drag image so Chrome's
  translucency/shadow go away entirely (only `setDragImage` can).
- **Live browser passes owed** (JP's browser is shared — use an isolated
  profile). **JP 2026-08-21: the Forecast build is accepted WITHOUT browser
  validation for now — deferred deliberately, not skipped.** Do not read its
  green suite as "it works"; the 8 `it.todo` in `test/forecast-frame.test.ts`
  are the unanswered list. ⚠️ **PRUNED 2026-08-25 — this queue had gone stale
  and was reported to JP as fact.** The Pipeline panels and Deadlines v2 were
  clicked through on 2026-08-21; `56569fc` recorded that pass and left this
  list untouched. **Prune it in the same commit that records a pass.** Queue:
  **Forecast** · **the white background on Schedules + Deadlines** (both live
  2026-08-22, unseen) · the task-due picker by hand · the sub-350px last-resort
  scroll · the b13 note chip + clarification accent · drag a bar collapsed.
- **Product (Miles)**: the row-controls design pass + Smoke pass (see Comms) ·
  month-encoding verify when the Sheets credential lands · the remaining
  tabs' frames (T073/T091 un-park).
- **Agent backlog**: T075 AC sweep · non-member 403 check · `Last Synced`
  browser-TZ + col-done width leftovers · schedules-tab full tokenization
  beyond the planner · per-tab URL sub-state (filters/week/sort as query
  params; expansion state could join it — raised to Miles in #40) ·
  `worker/CLAUDE.md` still to write (traced pass — highest-consequence
  path) · pipeline/requests rulebook extraction from their frame-notes
  (Layer-2 law until extracted — `docs/README.md` §Where law lives).

## Session log

**Convention (2026-08-18, revised):** the FULL narrative goes straight into
`docs/history/state-log/YYYY-MM-DD.md`, never here. Here it gets one summary
line, newest first; older lines are deleted as the 10KB cap bites, and the
state log is self-indexing by date.

- 2026-08-25 — **Owl #66 processed: every escalation confirmed**. One code change fell out — the Pipeline table header said **Client** while the filter, the chip and the whole Requests table said **Requestor**, over one field; renamed, class with it. Guarded as the RULE — every filter axis label must appear verbatim in the header row, so a sixth axis is covered free. Product is fixing seven frame defects; until they land, **this build is authoritative over those frames**. R-fc-r closed. → docs/history/state-log/2026-08-25.md
- 2026-08-21 — **The Forecast tab, built to §7.2/§7.3** (`9a0f817`): the only tab with **no owl and no Figma annotations** — build spec + two frames were the whole source, so every disagreement had to be ruled (R-fc-a…y). ⚠️ The frame's Model Constants panel quotes the **RETIRED workbook formula**; building it verbatim breaches SC-3. Three frame typos corrected, difficulty kept read-only against a chevron, eleven engine fields were being dropped before the browser. ⚠️ **THE CASCADE TRAP, A THIRD TIME** — first one a test catches: the guard COMPUTES SPECIFICITY and found a second instance the moment it ran. → docs/history/state-log/2026-08-21.md