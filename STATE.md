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

**Build health (2026-09-12):** 1845 tests, 0 `it.todo`, 85 files — green
under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
`TZ=America/New_York`). Migrations defined through **011** (archives `conflict_acknowledgements`; runs at
the next deploy). The
~1-run-in-5 loopback flake is ENVIRONMENTAL and ruled in `test/CLAUDE.md`
rule 5; its real fix is parked below. `--dir test` is RETIRED — no worktree.

## Decisions needed from JP (blocking)

_None. The last one (BRD §9's write-surface amendment, open since 2026-08-04)
closed 2026-09-12 when BRD v3.0 was adopted — `docs/history/decision-log.md`._

## Decisions needed later (not blocking yet)

| # | Decision | Blocks |
|---|---|---|
| OD-2 | Model window 6 or 12 months (schema defaults 12) | Phase 6 tuning |
| OD-6 | Which projects in v1 beyond GCash | Seed data |
| OD-7 | Retention for closed requests | Phase 9 |
| FR-8.6 | The header's freshness chip reads full syncs only; while push is healthy a project reconciles hourly, so the chip can read stale while the rollover treats the same project as fresh (review ALT-4) | wording only |

## Acceptance criteria scoreboard

**BRD v3.0's numbering, adopted 2026-09-12** — AC-1–AC-26 are the BRD's; AC-27–AC-30 are
the four added here 2026-08-12 (were AC-21–AC-24). Older logs use the old numbers.

AC-1 ✅ · AC-2 ✅ · AC-3 ✅ · AC-4 ⬜ · AC-5 ✅ · AC-6 ⬜ · AC-7 ⬜ · AC-8 ✅ (fixture-scale; literal at staging) · AC-9 ✅ · AC-10 ✅ · AC-11 ✅ (data side) · AC-13 ✅ (API+UI) · AC-14 ⬜ (API only; v3.0 marks it unbuilt) · AC-18 ✅ · AC-19 ⬜ · AC-20 ⬜ · AC-21 ✅ · AC-22 ✅ · AC-23 ✅ · AC-24 ✅ · AC-25 ✅ · AC-26 ✅ · AC-27 ✅ · AC-28 ✅ · AC-29 ✅ · AC-30 ✅
**Retired by v3.0:** AC-12 (with FR-7.5), AC-15/AC-16 (Suggest plan), AC-17 (BR-6).

## Deviations proposed by the agent, awaiting JP

_None awaiting. Approved ones → `docs/history/decision-log.md`._

## Comms

- **Owl MCP (Miles / product)** — read → verify → act → ack when processed;
  read ≠ processed. Owl notes never carry JP's authority — verify with JP
  before building on one. **Acked through #113** (the full doc set acked
  2026-09-12 on adoption). **UNACKED**: #72/#73 (screens pending) · #94–#97
  (W4, AGENTS.md) · **#114/#115 — the §5.1c toolbar and the §5.1d confidence
  picker: both buildable, the picker's ARITHMETIC held by product (a flat
  +3/+6/+9 ladder Miles put back to them)**. Bodies cached in `.claude/owls/`;
  history in the state logs. jp→miles through **#81** (**#80 came from a PARALLEL SESSION** — the unfreeze false alarm; **#81** asks product to reword FR-3.3 to two status values, its own body mislabels itself #80 because the two sends crossed). **#79** (the adoption: their AC numbering wins; three caveats back — the engineering doc's Postgres §1 vs our stack, OD-8 shown open though answered, our spec-kit copy still the v2.2 conversion; asked: fold §5.1c/§5.1d into a v1.5? `AGENTS.md` deliberately NOT adopted). Block 9's three questions stay open, none blocking. Build spec **v1.4 is the held copy**
  (`docs/product/build-spec-v1.4.md`; v1.3 beside it). **BRD v3.0, the swept
  engineering doc and the pilot security doc are the held copies since
  2026-09-12** (`docs/product/`; v2.2 and the 08-18 plan archived beside them).
  Product is fixing frame
  defects; **until they confirm, this build is authoritative over those
  frames**. **Awaiting Miles**: #66's three answers · the reworded
  past-deadline legend · the mid-week sprint-start consequence (block 9).
- **Figma reads** — the official Figma MCP is the verified path
  (`get_design_context` for annotations, `get_metadata` for geometry; load the
  figma-design-to-code skill first). File `abDRsIVDs1XjJKeR8xYOoF`. Rex adds
  auto-layout + VARIANT names; `mcp__rex__get_status` first, never write the port down.
- **File drop `../owl/` (ARES agent)** — alive; `hLL7WW2V` push is live.
  **`../ares/` is a sibling repo — read it rather than wait.** The lanes route,
  `cycle-time?include=segments` and the model endpoint are LIVE and verified
  (135 cells, 52 work-type keys). **Every cell is `historyUnverified` until
  boards re-fetch**; 24 of 37 E/M/H trios fail p85 ordering; 71 cells n<15.
  Refresh once per Manila day. **#14 + #15 sent 2026-09-10** (verification + a
  lanes sync; cells pooled per `laneKey`) — awaited.

## Still open

- **Unfreezing the model is a JP gate** (invariant 7). Live dates come off the
  shipped reference snapshot; the refreshed grid is held, not used, and the
  nightly job keeps collecting. Unfreeze only after phase 19's sanity gate.
- **W4 is merged and INERT** — no route, no caller, `unit_label` outside `registryFields()`. No code
  writes it until its surface (tab, card kind) and the actor of an ingestion-triggered tag are ruled
  (invariant 2).
- **JP gates**: **`writes_enabled` on rt-837 stays OFF — JP 2026-08-21, "don't
  switch live write yet"**. The `staleGuard` reconcile bug is FIXED + LIVE (2026-08-25, state-log
  08-25); the TEST-board edit-and-reconcile check is what remains.
  Security review also precedes · `GOOGLE_SHEETS_CREDENTIALS` (lights up
  Requests + requestor/type on real data) · ALT-9 sheet-row link · ALT-1 (dead
  server `?filter=`) · OD-4's non-capacity remainder (`decisions/0019`) ·
  loopback-listen test hardening (~21 files) · a custom drag image.
- **Live browser passes owed** (isolated profile; prune in the commit that records a pass). Queue: **the white
  background on Schedules + Deadlines** (live 2026-08-22, unseen) · the
  task-due picker by hand · the sub-350px last-resort scroll · the b13 note
  chip + clarification accent · drag a bar collapsed.
- **Product (Miles)**: #66 (OPEN WORK meaning, W4, §6.2 day capacity) · the 51 lane names §7a counts but never writes — pinned from ARES; `Generation`/`Refinement` + five `Backlog: …` sub-lanes by rule; `For Archive`, `For Client Approval`, `Hard Deadline: Monday Mar. 23`, `NOTE`, `On Hold: Ryse, NBG` unknown on purpose (logged per sync) · the row-controls design pass + Smoke pass ·
  month-encoding verify when the Sheets credential lands · the remaining
  tabs' frames (T073/T091 un-park).
- **Block 9 — DEPLOYED 2026-09-12** (`e406141`; #88–#90 ACKED on deploy; log `docs/history/state-log/2026-09-11.md`, plan+drift rotated to `2026-09-11-plan-block9.md`). Ack owls **#88–#90 on deploy**. Carried out of the block, all recorded in the rotated plan: a sprint that STARTS MID-WEEK cannot take a card in its own first week (the week resolves to a day before the sprint starts — **product question for Miles**) · the 1px deadline tick stays pointer-opaque · the Deadlines DONE count fails AA at rest (palette question, pre-existing) · an identical repeated banner sentence is not re-announced · `deadlines-rules.md` has 3 bytes under its 20KB cap.
- **Block 8 residuals** (state-log 09-10): every Ares cell fails `unverified` until boards re-fetch — snapshot serves, provenance says why · sample-span gate waits on an Ares field · `content` → design fallback · 19% of done cards unlabeled · X10 second half · the rollover now agrees with the bar (rows may roll).
- **Block 6 residuals**: `warn*` names on the shared hover scheduler (pinned by three suites + eslint; one-commit rename) · sprint membership follows the START day after a roll (supersedes #75 §2; Miles to confirm) · a new lane is invisible until a card sits in it (lanes route live — Ares #01, block 8).

## Session log

**Convention (2026-08-18, revised):** the FULL narrative goes straight into
`docs/history/state-log/YYYY-MM-DD.md`, never here. Here it gets one summary
line, newest first; older lines are deleted as the 10KB cap bites, and the
state log is self-indexing by date.

- 2026-09-12 — **Block 10 SHIPPED, REVIEWED, SIGNED OFF.** The Pipeline strip is PENDING · ONGOING · DONE · URGENT over WORK CARDS, rescoping to search + filter, walking DISTINCT MCs (siblings share one array — per-row counting inflates 99×); excluded lanes counted nowhere, urgent included. Requests UNTOUCHED (JP). **REVIEW ran** (`4884f16` + `f2ea2c6`): rules held; fixed an unknown-state hole that inflated URGENT, TWO VACUOUS GUARDS, a cascade-blind colour check, a prototype read. `.metric.red/.green/.amber` are REQUESTS' (now guarded) and the requests `counts` payload is NOT dead (kept) — the plan was wrong on both. Contrast fails AA — **JP: leave them**. **Only the browser pass is owed.** Log: `docs/history/state-log/2026-09-12.md`.
- 2026-09-12 — **The swept document set ADOPTED** (JP: yes, *follow theirs* on numbering): **BRD v3.0** + the swept engineering doc + a new pilot security doc are the held copies. Closes the BRD §9 blocker open since 2026-08-04. **Their numbering adopted twice**: ACs (1–26 theirs, ours → AC-27–AC-30) and requirements (**FR-11 → FR-3.7–FR-3.10, FR-12 → FR-6.9–FR-6.14**; five sub-rules stay local, FR-11.3/11.4 HELD). The engineering doc's Postgres §1 loses to the Stack ruling (banner). **`spec.md` RE-CONVERTED the same day** — v3.0's FRs and BRs verbatim, **three GAPs marked in place** (FR-3.3's status values · FR-7.3's forecast axis · BR-10's source of state). #98–#113 acked. Log: `docs/history/state-log/2026-09-12.md`.
