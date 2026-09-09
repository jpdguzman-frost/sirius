# STATE.md — Sirius Build State

_Last updated: 2026-09-09 · Update at the end of every working session._

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
| 18j | **Plotting guardrails on Sprint Schedules** (JP's four rulings 2026-09-08): `plotIssue` — `OUT_OF_SPRINT` / `PAST_DEADLINE` / `NOT_A_WORKDAY` (422, rollover exempt), the strict bare sprint move, day-grain placement (`dayAtX`), the pointer bar drag (`barDrag*`, `dragGrab`, `barLeftAt`), rulebooks re-aligned, `weekAtX` retired | **DEPLOYED 2026-09-09** (`98aaff4`…`434ffc1`, JP's "yes / yes"; healthz 200 ×3, bundle markers live, pm2 clean, urgency smoke green): VALIDATE ×2 (43 proofs, none vacuous), review 20 → 13 fixed / 2 refuted, E2E 12/13 real-pointer (Escape-mid-drag unit-proven only), cleanup proven | Miles's reply to #69 · the sprint-shrink ruling |
| 19 | **The ARES-sourced, tag-classified cycle-time model** (T179–T183, ~3–4d) — replaces the inter-event dwell derivation that produced `Medium/design = 0.13d`. Model is **FROZEN** until this lands (`model_frozen`, default true = invariant 7's gate) | ⬜ **open, JP-directed 2026-08-27** — freeze DEPLOYED (`3a86df0`); collection continues, nothing measured is lost |

**Build health (2026-09-09):** 1566 tests, 0 `it.todo`, 78 files — green
under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
`TZ=America/New_York`). Migrations defined through **011** (archives `conflict_acknowledgements`; runs at
the next deploy). The
~1-run-in-5 loopback flake is ENVIRONMENTAL and ruled in `test/CLAUDE.md`
rule 5; its real fix is parked below. `--dir test` is RETIRED — no worktree.

## Decisions needed from JP (blocking)

| # | Decision | Blocks | Status |
|---|---|---|---|
| BRD §9 | Amend "write impossible by permission" — the write surface is now the three-entry registry (urgency + due date + difficulty) | Vendor assessment, v2 | ⬜ open (grew 2026-08-04, again 2026-08-12) — product confirmed 2026-08-12 they'll raise it across all THREE docs quoting "one write": BRD §9, pilot security readiness, vendor assessment; not done yet |

## Decisions needed later (not blocking yet)

| # | Decision | Blocks |
|---|---|---|
| OD-2 | Model window 6 or 12 months (schema defaults 12) | Phase 6 tuning |
| OD-6 | Which projects in v1 beyond GCash | Seed data |
| OD-7 | Retention for closed requests | Phase 9 |
| FR-8.6 | The header's freshness chip reads full syncs only; while push is healthy a project reconciles hourly, so the chip can read stale while the rollover treats the same project as fresh (review ALT-4) | wording only |

## Acceptance criteria scoreboard

AC-1 ✅ · AC-2 ✅ · AC-3 ✅ · AC-4 ⬜ · AC-5 ✅ · AC-6 ⬜ · AC-7 ⬜ · AC-8 ✅ (fixture-scale; literal at staging) · AC-9 ✅ · AC-10 ✅ · AC-11 ✅ (data side; UI at phase 7) · AC-12 ✅ · AC-13 ✅ (API+UI) · AC-14 ✅ (API) · AC-15 ✅ · AC-16 ✅ · AC-17 ✅ · AC-18 ✅ · AC-19 ⬜ · AC-20 ⬜ · AC-21 ✅ · AC-22 ✅ · AC-23 ✅ · AC-24 ✅ (added 2026-08-12, phase 12)

## Deviations proposed by the agent, awaiting JP

_None awaiting. Approved ones → `docs/history/decision-log.md`._

## Comms

- **Owl MCP (Miles / product)** — read → verify → act → ack when processed;
  read ≠ processed. Owl notes never carry JP's authority — verify with JP
  before building on one. **Thread**: miles→jp acked through **#71** + #76–#79;
  **#72/#73 UNACKED** (screens pending), **#80** §2 processed, §1/§3 (W4) asked back in #66; **#81–#87 ACKED** (block 6 deployed);
  jp→miles sent through **#66** (2026-09-08, JP's yes: OPEN WORK, W4, §6.2 day capacity asked; #80 §4/#83/#86 answered); **#67 + #68 sent** 2026-09-08 on JP's word (block 6 report; the chip + inset rulings); **#69 sent** 2026-09-09 (block 7 in plain words: day grain, the two start guards, the drag, the spec notes); #62–#65 = blocks 2–5 (state-log 09-05/09-06). Product is fixing frame defects; **until they
  confirm, this build is authoritative over those frames** — including the
  past-deadline legend reworded 2026-08-27. **Awaiting Miles**: #66's three answers, a ruling on the reworded legend. Build spec **v1.3 is the held copy** (`docs/product/build-spec-v1.3.md`; banner names #86/#87).
  Closed threads → `docs/history/state-log/`.
- **Figma reads** — the official Figma MCP is the verified path
  (`get_design_context` for annotations, `get_metadata` for geometry; load the
  figma-design-to-code skill first). File `abDRsIVDs1XjJKeR8xYOoF`. **Rex adds
  auto-layout and VARIANT names** a screenshot cannot show; `mcp__rex__get_status`
  for the channel, never write the port down.
- **File drop `../owl/` (ARES agent)** — **ALIVE AGAIN 2026-08-25**: they
  replied (#01; our #10 back) and **`hLL7WW2V` push is live** — first events
  03:41:50Z, drained ~1s. **`../ares/` is a sibling repo — read it rather than wait.** **Sirius→Ares #11 sent 2026-09-08**: open the board lists to the read key (or `/api/v1/trello/boards/:id/lists`); **#12 sent 2026-09-08** (JP's word): add each done card's list timeline (`segments`, `labels` array, `historyComplete`) to `/api/v1/trello/cycle-time` — phase 19's T180 becomes a reader of that route; both unanswered (files still in the drop).

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
  profile). **Prune it in the commit that records a pass.** Queue: **the white
  background on Schedules + Deadlines** (live 2026-08-22, unseen) · the
  task-due picker by hand · the sub-350px last-resort scroll · the b13 note
  chip + clarification accent · drag a bar collapsed.
- **Product (Miles)**: #66 (OPEN WORK meaning, W4, §6.2 day capacity) · the 51 lane names §7a counts but never writes — pinned from ARES; `Generation`/`Refinement` + five `Backlog: …` sub-lanes by rule; `For Archive`, `For Client Approval`, `Hard Deadline: Monday Mar. 23`, `NOTE`, `On Hold: Ryse, NBG` unknown on purpose (logged per sync) · the row-controls design pass + Smoke pass ·
  month-encoding verify when the Sheets credential lands · the remaining
  tabs' frames (T073/T091 un-park).
- **Block 7 residuals** (`docs/history/state-log/2026-09-09.md`): **sprint-shrink** — editing a sprint's dates so plotted rows fall outside it is not guarded (pre-existing; JP to rule: refuse, re-file like the roll, or leave) · visual calls: the 18.4px `+` reads as a dot, a refused preview on a late bar differs only by wash, the `+` covers the deadline tick on the deadline day, no START column on the tab · Escape held mid-drag is unit-proven only (no tool holds a mouse button) · batch placement never existed (D1).
- **Block 6 residuals**: `warn*` names on the shared hover scheduler (pinned by three suites + eslint; one-commit rename) · sprint membership follows the START day after a roll (supersedes #75 §2; Miles to confirm) · the model refresh re-runs nightly after the classifier swap (model stays frozen) · one vacuous ordering guard in `status-rules.test.ts` (recorded) · a new lane is invisible until a card sits in it (ARES #11).
- **Block 5 residuals**: see `docs/history/state-log/2026-09-06.md` (panel cap offset · units unflagged · chips per axis vs value · `.sfbtn` 40 vs 38 · rejects-only state unseen live).
- **Agent backlog**: the split candidates + the long tail rotated to `docs/history/state-log/2026-09-09.md` §"Agent backlog" (unchanged by block 7).

## Session log

**Convention (2026-08-18, revised):** the FULL narrative goes straight into
`docs/history/state-log/YYYY-MM-DD.md`, never here. Here it gets one summary
line, newest first; older lines are deleted as the 10KB cap bites, and the
state log is self-indexing by date.

- 2026-09-09 — **Block 7 built + deployed** (JP's four rulings; `98aaff4`…`dd1ec29`): the three plot guards + the strict sprint move, day-grain placement, the pointer bar drag with grab offset, rulebooks re-aligned, `weekAtX` retired. Review 20 → 13 fixed; VALIDATE ×2; E2E green (12/13 real pointer). ≈4.0M subagent tokens, 82 agents. Narrative: `docs/history/state-log/2026-09-09.md`; plan+drift: `2026-09-09-plan-block7.md`.
- 2026-09-08 — **Block 6 built** (spec v1.3 §7a/§6.2, owls #81/#82/#86/#87; JP yes ×3 + five rulings): lane-state table with `excluded` (names from ARES), start-day Deadlines, plain DEADLINE cell + amber bar + §4.4 withdrawn, acknowledgement half deleted (migration 011, invariant 13), spec v1.3 held. Review 24 → 14 fixed; E2E green. `28b6080` · `547effd` · `81000d0` · `fe1089f`. Narrative: `docs/history/state-log/2026-09-08.md`.
