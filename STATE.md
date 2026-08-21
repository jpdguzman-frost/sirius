# STATE.md — Sirius Build State

_Last updated: 2026-08-18 · Update at the end of every working session._

**Layer 1 — current state only.** Nothing settled, shipped, or narrated lives
here; it moves to an archive the session it closes. Archives, never loaded on
resume: `docs/history/phase-log.md` (every phase, verbatim) ·
`docs/history/decision-log.md` (answered questions) ·
`docs/history/state-log/` (session narratives, one file per day).

## Phase status

Open or not-yet-deployed only. Complete phases → `docs/history/phase-log.md`.

| # | Phase | Status | Gate |
|---|---|---|---|
| 0–8a | Setup · schema · auth+audit · `lib/` port · ARES read · intake · model refresh · five tabs · urgency write · conflict acks | **complete 2026-08-03/04** (T001–T068) | AC-10 gate ✅ · PM sign-off ✅ · TEST-board round-trip ✅ |
| 9 | Security testing + pilot | in progress — T069 anon half ✅, T072 backup/restore ✅, T086 ✅; **G7 ✅ 2026-08-12 (observation mode)**; T073/T091 ⏸ (team UI update), T075 sweep pending, non-member 403 parked | G7 passed; write-enable on rt-837 = next JP gate |
| 10–13k b13, ctx, t-split | Two-way sync · admin panel · Pipeline redesign · Gantt planner · batches 1–13 · context restructure · the expanded MC row · the stale-reconcile guard (decisions/0025) · the template split | **DEPLOYED + LIVE-VERIFIED through 2026-08-19** (T077–T178, ..`b401bac`) | per-batch detail: `docs/history/phase-log.md`; batch law: `specs/001-sirius-v1/pipeline-frame-notes.md` |
| 14 pf · 13k b14 | **Pipeline filter + sort** (owl #62) · owls #52–#61 | **DEPLOYED 2026-08-20** — shipped three defects, all fixed and redeployed 2026-08-21 |
| 15 | **owl #63** — "None" joins TYPE/DIFFICULTY/REQUESTOR (closes R-pf-i) · **owl #64** — **Deadlines tab rebuilt** to node 630:51389 (R-dl-a..n) | **DEPLOYED 2026-08-21** (`897c3dd`) — ⚠️ never seen in a browser |
| 15r | **Review pass, batches 13–15** — /simplify (15 of 20) + /code-review high (8 defects, all confirmed) | **DEPLOYED 2026-08-21** — healthz 200, host sha256 == local ✓ |

**Build health (2026-08-21):** 1078/1078 tests + 24 `it.todo`, 64 files — green
under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
`TZ=America/New_York`). Migrations applied through **008** (0025's guard
needs none — an absent stamp already means "never written by Sirius"). The
~1-run-in-5 loopback flake is ENVIRONMENTAL and ruled in `test/CLAUDE.md`
rule 5; its real fix is parked below. `--dir test` is RETIRED — no worktree.

## Live-verified 2026-08-21

Batches 15 + 15r deployed and **clicked through on rt-test** — every fix
confirmed, zero console errors (`docs/history/state-log/2026-08-21.md`).

⚠️ The lesson: those panels were inert on the live site for a day with the whole
suite green — nothing in the suite can open an overlay. **"Deployed" is not
"works".**

## Decisions needed from JP (blocking)

| # | Decision | Blocks | Status |
|---|---|---|---|
| BRD §9 | Amend "write impossible by permission" — the write surface is now the three-entry registry (urgency + due date + difficulty) | Vendor assessment, v2 | ⬜ open (grew 2026-08-04, again 2026-08-12) — product confirmed 2026-08-12 they'll raise it across all THREE docs quoting "one write": BRD §9, pilot security readiness, vendor assessment; not done yet |
| DL-scope | **The Deadlines Breakdown mixes two scopes.** DUE THIS MONTH / URGENT / CONFLICTS are month-scoped, NEEDS REPLOTTING is board-wide — the test board reads `CONFLICTS 0` beside `NEEDS REPLOTTING 4` (its conflicts are all Sep–Nov), so the number disagrees with the rows beneath it, which R-dl-f says cannot happen. Found in the live pass; answer with Miles's open "does it narrow to deadline breaches" (#52) — same number, two questions. | Deadlines reading honestly | ⬜ **pending (JP, 2026-08-21)** — I'd scope it to the month |

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
  before building on one. **Thread position**: miles→jp acked through **#64**; jp→miles sent through **#52**.
  **Awaiting Miles**: the ARES read-path caching answer · the Deadlines
  acknowledged-state design (R-dl-n) · NEEDS REPLOTTING's meaning (see DL-scope) · whether the conflict detail rows navigate, and where ·
  whether the round week button was meant to collapse the group (#52).
  Closed threads → `docs/history/state-log/`.
- **Figma reads** — **the official Figma MCP is the verified path**:
  `get_design_context` for annotations + pixel facts, `get_metadata` for
  geometry (load the figma-design-to-code skill first). File
  `abDRsIVDs1XjJKeR8xYOoF`. Verify annotation count and content against the owl
  BEFORE building. Rex is needed only for plugin-API introspection or writing
  into the file. ⚠️ **Never write Rex's channel down** — it takes a free port at
  start, so any number here goes stale on the next restart (7782 was recorded
  and was 7780 on 2026-08-21, which cost JP a failed connect). Run
  `mcp__rex__get_status`; it returns the number to type into the plugin.
- **File drop `../owl/` (ARES agent)** — **CLOSED 2026-08-19** (JP: don't
  chase, wait for new status). `hLL7WW2V` push subscription: #07/#08/#09, no
  reply file, zero events in 7 days. No fourth note; rt-837 rides the poll.

## Still open

- **JP gates**: flip `writes_enabled` on rt-837 (+ the pre-pilot security
  review) · `GOOGLE_SHEETS_CREDENTIALS` — lights up Requests plus
  requestor/type on real data · ALT-9 sheet-row link (expose
  `intake_sheet_id` or drop the sub-label) · ALT-1 (dead server `?filter=`
  param) · OD-4's non-capacity remainder — the capacity slice was ruled
  2026-08-17, the broader expiry question stays OPEN (`decisions/0019`) ·
  two pre-existing host-local `todayIso()` sites · loopback-listen test
  hardening (~21 files) · whether to draw a custom drag image so Chrome's
  translucency/shadow go away entirely (only `setDragImage` can).
- **Live browser passes owed** (JP's browser is shared — use an isolated
  profile): **the Pipeline filter + sort panels — a day inert on the live site
  under a green suite; opening them is the first thing to check** · **the whole
  Deadlines tab v2, never seen in a browser** · the task-due picker by hand · the sub-350px last-resort scroll ·
  the b13 note chip + clarification accent · drag a bar in the collapsed pane.
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

**Convention (2026-08-18, revised):** the FULL session narrative is written
straight into `docs/history/state-log/YYYY-MM-DD.md` — never into this file,
not even for one session. Here it gets one summary line, newest first. Keep
archive entries as complete as ever; length there is fine. This window holds
the newest 10 lines and older ones are deleted — `docs/history/state-log/`
is self-indexing by date.

- 2026-08-21 — **Review pass, batches 13–15 + DEPLOY + live pass**: /simplify (15 of 20, `2d5a017`) + /code-review high (**8 defects, all confirmed**, `54471b5`), deployed `897c3dd` and clicked through on rt-test. Both dismisser shields now derive from one keyed map. The live pass found the Breakdown scope mismatch (DL-scope, above). 1068 → 1078 + 24 todo. → docs/history/state-log/2026-08-21.md
- 2026-08-21 — **Owls #63 + #64**: "None" is now a filter value on the three axes that can lack one (closes R-pf-i) and the **Deadlines tab was rebuilt to node 630:51389** (R-dl-a..n). Corrected product twice — order-of-filing had already landed, and STATUS still cannot keep Trello's order. Kept the acknowledge action and the day planner the frame omits: this tab is the only route to either. 1035 → 1068 + 24 todo. Not deployed. → docs/history/state-log/2026-08-21.md
