# STATE.md — Sirius Build State

_Last updated: 2026-09-05 · Update at the end of every working session._

**Layer 1 — current state only.** Anything settled or narrated moves to an
archive the session it closes, never loaded on resume:
`docs/history/phase-log.md` · `docs/history/decision-log.md` ·
`docs/history/state-log/` (one file per day).

## Phase status

Open or not-yet-deployed only. Complete phases → `docs/history/phase-log.md`.

| # | Phase | Status | Gate |
|---|---|---|---|
| 0–8a | Setup → conflict acks | **complete 2026-08-03/04** (T001–T068) | AC-10 ✅ · PM sign-off ✅ · TEST-board round-trip ✅ |
| 9 | Security testing + pilot | in progress — T069 anon half ✅, T072 ✅, T086 ✅; **G7 ✅ 2026-08-12**; T073/T091 ⏸, T075 pending | write-enable on rt-837 = next JP gate |
| 19 | **The ARES-sourced, tag-classified cycle-time model** (T179–T183, ~3–4d) — replaces the inter-event dwell derivation that produced `Medium/design = 0.13d`. Model is **FROZEN** until this lands (`model_frozen`, default true = invariant 7's gate) | ⬜ **open, JP-directed 2026-08-27** — freeze DEPLOYED (`3a86df0`); collection continues, nothing measured is lost |
| 18f | **Sprint Schedules search-based add + Add All** (owl #77 §0, nodes 840:31597 · 841:33668 · 841:33689 · 833:68629): the 08-28 dropdown flow retired whole; always-visible search row per sprint, token-AND matching, Add All = one batch request (`POST …/sprint-items/batch`, per-row audit, skips never fatal, sprint re-asserted after the act) | **DEPLOYED 2026-09-05** (`1533788`, JP's ship; build `0cbbe60` · review `55f572f` · simplify `b435ac1`): 37 proofs, review 12/21 stood, simplify 9/17, E2E real pointer on the local rt-test copy; live healthz 200 ×3, bundle carries the search row, old flow absent, urgency smoke green. Queue: #74/#75 + #78 §2 → #77 §1–4 → W4 |
| 18 | **The redesign** (owls #67–#74): Forecast tab withdrawn · OPEN WORK blue/500 · the client-review wait out of the past-deadline warning · **the scheduled unit becomes the WORK CARD** — `sprint_items`, migration 009, no backfill | **DEPLOYED 2026-08-27** (`2382bfb`) — server half only; the frontend for both rebuilt tabs is the next block of work |

**Build health (2026-09-05):** 1230/1230 tests + 24 `it.todo`, 63 files — green
under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
`TZ=America/New_York`). Migrations applied through **008** (0025's guard
needs none — an absent stamp already means "never written by Sirius"). The
~1-run-in-5 loopback flake is ENVIRONMENTAL and ruled in `test/CLAUDE.md`
rule 5; its real fix is parked below. `--dir test` is RETIRED — no worktree.

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
  read ≠ processed. Owl notes never carry JP's authority — verify with JP
  before building on one. **Thread**: miles→jp acked through **#71** + #76, #78, #79;
  **#72–#74 UNACKED** (screens pending), **#75/#77/#80 open** until their blocks;
  jp→miles sent through **#63**; **#62 sent** 2026-09-05 on JP's yes (block 4); **#63 sent** 2026-09-05 on JP's yes (block 2: five calls to veto, three held, the §4 checks answered). Product is fixing frame defects; **until they
  confirm, this build is authoritative over those frames** — including the
  past-deadline legend reworded 2026-08-27. **Awaiting Miles**: the Deadlines
  acknowledged-state design (R-dl-n), and a ruling on the reworded legend.
  Closed threads → `docs/history/state-log/`.
- **Figma reads** — the official Figma MCP is the verified path
  (`get_design_context` for annotations, `get_metadata` for geometry; load the
  figma-design-to-code skill first). File `abDRsIVDs1XjJKeR8xYOoF`. **Rex adds
  auto-layout and VARIANT names** a screenshot cannot show; `mcp__rex__get_status`
  for the channel, never write the port down.
- **File drop `../owl/` (ARES agent)** — **ALIVE AGAIN 2026-08-25**: they
  replied (#01; our #10 back) and **`hLL7WW2V` push is live** — first events
  03:41:50Z, drained ~1s. **`../ares/` is a sibling repo — read it rather than wait.**

## Still open

- **Unfreezing the model is a JP gate** (invariant 7). Live dates come off the
  shipped reference snapshot; the refreshed grid is held, not used, and the
  nightly job keeps collecting. Unfreeze only after phase 19's sanity gate.
- **JP gates**: **`writes_enabled` on rt-837 stays OFF — JP 2026-08-21, "don't
  switch live write yet"**. ⚠️ **Blocker found 2026-08-25: `staleGuard` compares
  our write against the instant we ISSUED the ARES read, never against when ARES
  actually fetched, so a reconcile could revert a user's edit. **FIXED + LIVE
  2026-08-25**; the TEST-board edit-and-reconcile check is what remains.**
  Security review also precedes · `GOOGLE_SHEETS_CREDENTIALS` (lights up
  Requests + requestor/type on real data) · ALT-9 sheet-row link · ALT-1 (dead
  server `?filter=`) · OD-4's non-capacity remainder (`decisions/0019`) ·
  loopback-listen test hardening (~21 files) · a custom drag image.
- **Live browser passes owed** (JP's browser is shared — use an isolated
  profile). **Prune this queue in the same commit that records a pass** — it
  once went stale and was reported to JP as fact. Queue: **the white
  background on Schedules + Deadlines** (live 2026-08-22, unseen) · the
  task-due picker by hand · the sub-350px last-resort scroll · the b13 note
  chip + clarification accent · drag a bar collapsed. *(The Forecast entry
  left with the tab, 2026-08-27.)*
- **Product (Miles)**: the row-controls design pass + Smoke pass (see Comms) ·
  month-encoding verify when the Sheets credential lands · the remaining
  tabs' frames (T073/T091 un-park).
- **Agent backlog**: the single add's own sprint-gone window (same shape as the batch's S1, narrower) · Enter as Add All (suggestion to Miles) · #77 §4 answers ride to block 5 (sheet_row exists; no Business Unit column in code — Use Case only; no Requests header pin) · arrow keys through the Pipeline popovers (owl #62, never built) · Trello list order for STATUS needs an ARES list position (own slice, R-pf-e) · parent DEADLINE cell vs the child-keyed sort until block 3 (B5) · `pipeWorkLive` → PIPE_WORK_FILTERS once eslint lists it · badge writes drop keyboard focus after the reload · W1 has no
  server no-op guard (contract rule 4, pre-existing) · T075 AC sweep · non-member 403 check · `Last Synced`
  browser-TZ + col-done width · schedules-tab tokenization beyond the planner ·
  per-tab URL sub-state (raised to Miles in #40) · `worker/CLAUDE.md` unwritten
  (highest-consequence path) · pipeline/requests rulebook extraction from their
  frame-notes (Layer-2 law until extracted — `docs/README.md`).

## Session log

**Convention (2026-08-18, revised):** the FULL narrative goes straight into
`docs/history/state-log/YYYY-MM-DD.md`, never here. Here it gets one summary
line, newest first; older lines are deleted as the 10KB cap bites, and the
state log is self-indexing by date.

- 2026-09-05 (later still) — **Sprint Schedules search-based add + Add All** (owl #77 §0): 31-row drift, gate on JP's yes; review found the partial banner wiped by the reload and the per-sprint disable lying against a global guard; server re-asserts the sprint after the batch. Real pointer on the local rt-test copy. DEPLOYED 2026-09-05. → docs/history/state-log/2026-09-05.md
- 2026-09-05 (later) — **Pipeline filter + sort rework** (owl #78 §4/§5): 49-row drift, gate on JP's yes; the STATE agent stopped on the facet arithmetic (two work axes ticked → under-count, B12) and the plan was amended; review found the back-to-top rule had never scrolled the page since #62; simplify put R-pf-h in one observer. Real round trip on rt-test. DEPLOYED 2026-09-05. → docs/history/state-log/2026-09-05.md
