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
| 17 | **One clock, Manila's** (invariant 11) · **Schedules + Deadlines off the unfinished-screen background** (both frames white) | **DEPLOYED 2026-08-22** (`3cfcd96`) |
| 18 | **The redesign** (owls #67–#74): Forecast tab withdrawn · OPEN WORK blue/500 · the client-review wait out of the past-deadline warning · **the scheduled unit becomes the WORK CARD** — `sprint_items`, migration 009, no backfill | **DEPLOYED 2026-08-27** (`2382bfb`) — server half only; the frontend for both rebuilt tabs is the next block of work |

**Build health (2026-08-25):** 1196/1196 tests + 32 `it.todo`, 68 files — green
under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
`TZ=America/New_York`). Migrations applied through **008** (0025's guard
needs none — an absent stamp already means "never written by Sirius"). The
~1-run-in-5 loopback flake is ENVIRONMENTAL and ruled in `test/CLAUDE.md`
rule 5; its real fix is parked below. `--dir test` is RETIRED — no worktree.

## Live 2026-08-25 — `40af172`

Requestor heading (`41cc2a0`) + the reconcile-clock fix (`40af172`). healthz
200, both restarted, page byte-identical to local. The worker fix has no page,
so it was verified by a LIVE SYNC: **`unstamped: 0` on 598 of 598 production
cards** — the path runs and ARES does send `lastPolledAt`.

⚠️ **NEVER OPENED IN A BROWSER**: the Forecast tab, and the white background on
Schedules + Deadlines. The filter panels were once inert on the live site for a
day under a green suite — nothing in the suite opens an overlay.

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
  before building on one. **Thread position**: miles→jp acked through **#66**; jp→miles sent through **#57**.
  **#66 (2026-08-24) closed #51–#55 in full**, every escalation confirmed.
  Product is fixing seven frame defects; **until they confirm, this build is
  authoritative over those frames.** **Still awaiting Miles**: only the
  Deadlines acknowledged-state design (R-dl-n) — **ARES caching ANSWERED 2026-08-25 by
  reading `../ares/`**: reads never touch Trello — a 15-min store plus a live
  Trello→ARES webhook (measured). Both writers stamp `lastPolledAt`, the true
  fetch time; `staleGuard` moved onto it and the probe guards it.
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
- **Agent backlog**: T075 AC sweep · non-member 403 check · `Last Synced`
  browser-TZ + col-done width · schedules-tab tokenization beyond the planner ·
  per-tab URL sub-state (raised to Miles in #40) · `worker/CLAUDE.md` unwritten
  (highest-consequence path) · pipeline/requests rulebook extraction from their
  frame-notes (Layer-2 law until extracted — `docs/README.md`).

## Session log

**Convention (2026-08-18, revised):** the FULL narrative goes straight into
`docs/history/state-log/YYYY-MM-DD.md`, never here. Here it gets one summary
line, newest first; older lines are deleted as the 10KB cap bites, and the
state log is self-indexing by date.

- 2026-08-27 — **Six owls (#67–#74) replace the scheduling unit**: a row is now one Trello TASK CARD, so sketch and render are separate rows and the Review bar leaves the drawing (not the arithmetic). **JP ruled**: Forecast tab OUT (screen only), REBUILD Schedules + Deadlines, and **past-deadline = the WORK runs past the date**. Answered product from code: the requestor rename needed no data change, and **ARES has no per-item forecast**. Server half shipped + **DEPLOYED `2382bfb`**. **/simplify + /code-review found three real defects in the same day's work** — a raw-string `workday()` invisible to a UTC+Manila suite, a rounding error that MISSED late warnings, and a design cell chosen by card TITLE. → docs/history/state-log/2026-08-27.md
- 2026-08-25 — **Owl #66** → the Pipeline header said **Client** while the filter, chip and Requests table said **Requestor**; renamed, then made impossible: the header now DERIVES from a column table. **ARES caching settled by reading `../ares/`, not by owl** — reads never touch Trello (15-min store + a live webhook, measured), so `staleGuard` was comparing our write against when we ASKED, not when ARES FETCHED, and a reconcile could revert a user's edit. Fixed, live, `unstamped: 0` on 598 cards. **/simplify + /code-review: 27 findings, 24 applied** — including a bug the fix itself introduced (no stamp skipped the registry write even on INSERT, stranding a new card on schema defaults), a vacuous race test, and three faults in guards written the same day. → docs/history/state-log/2026-08-25.md