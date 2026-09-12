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
  before building on one. **Acked through #71** + #76–#79 + #81–#87 + **#91–#93**. **UNACKED**:
  #72/#73 (screens pending) ·
  #91–#98 (tiles, W4) · #99–#113 (the full doc set) · **#114/#115 (09-11: the
  §5.1c toolbar; the §5.1d confidence picker, whose ARITHMETIC product is
  holding — a flat +3/+6/+9 ladder Miles put back to them — out of block 9 by
  their own wording)**. Bodies cached in `.claude/owls/`; history in the state
  logs. jp→miles through **#77** (#75 block 9 built, putting back the mid-week sprint-start gap, three undrawn surfaces and four node-vs-spec findings; **#76 it is LIVE** — those three questions still open, none blocking). Build spec **v1.4 is the held copy**
  (`docs/product/build-spec-v1.4.md`; v1.3 beside it). Product is fixing frame
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

- 2026-09-12 — **Block 10 BUILT + DEPLOYED** (`beca9bb`; JP's "go deploy", caveat put twice and reaffirmed): the Pipeline strip becomes PENDING · ONGOING · DONE · URGENT over WORK CARDS, rescoping to search + filter and walking DISTINCT MCs (siblings share one array — per-row counting inflates 99×); excluded lanes counted nowhere, urgent included. Requests UNTOUCHED (JP: "keep it as is") — §3.1 and §3.7 held together, since tiles that filter *and* rescope feed back on themselves. The stroke drift item was WITHDRAWN not fixed: nodes read `bottom 1`, other sides 0, so both spec sections were right and the CSS already drew it. VALIDATE ×2 green (1,806 UTC+Manila, 274 NY), 9/9 proofs discriminate; live healthz 200 ×3, wall 401, pm2 0 unstable, urgency round-trip green, W4 on host with no caller. **REVIEW and E2E still OWED.** Log: `docs/history/state-log/2026-09-12.md`.
- 2026-09-12 — **`w4-server` merged to main** (`55cf976`) now block 9 has shipped; still **INERT** — no route, no caller, `unit_label` outside `registryFields()`, verified again on the host after deploy. Log: `docs/history/state-log/2026-09-12.md`.
- 2026-09-11/12 — **Block 9 SHIPPED** (`e406141`, deployed 2026-09-12): the day moves to the Design Lead on Deadlines only; Sprint Schedules is week-grain. Survey → gate → 5 build agents → VALIDATE ×3 → 16 proofs → REVIEW → E2E 18/18, which found 2 defects (block 9's keyboard focus writing ANOTHER card; a pre-existing `PUT /sprints` 500 on any sprint REORDER that blocked the very edit #90 rules on) — both fixed and re-proven. Log: `docs/history/state-log/2026-09-11.md`.
- 2026-09-10 — **Block 8 built** (five JP yeses: the reversal accepted, re-date → *Outside any sprint*, model reader started, lane fold, Ares pools per lane + the `lib/model.ts` amendment): Ares model read + gated + provenance, work-card labels, label-first lane, lane reconcile; REVIEW 38 → 34 fixed; VALIDATE ×3 green; E2E green; **DEPLOYED 23:28 Manila**. Owls: #71 to Miles, #14–#16 to Ares. Log: `docs/history/state-log/2026-09-10.md`; plan+drift: `2026-09-10-plan-block8.md`.
