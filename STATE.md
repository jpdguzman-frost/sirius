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
| 13k b14 | Owls #52–#53: a shared MC stops attributing its tasks (R-exp-g..k — no structural edge exists, measured) · hover-card shadow + its clamp bleed (R-warn-p/q) | **DEPLOYED + LIVE 2026-08-20** (`74f95b0`; 994 + 24 todo dual-TZ) | healthz 200 · host bundle sha256 == local ✓ · live DB matches the probe (37 MC / 19 shared / max 60) ✓ |

**Build health (2026-08-20):** 996/996 tests + 24 `it.todo`, 62 files — green
under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
`TZ=America/New_York`). Migrations applied through **007** (0025's guard
needs none — an absent stamp already means "never written by Sirius"). The
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
  before building on one. **Thread position**: miles→jp acked through **#61**; jp→miles sent through **#47**.
  **Awaiting Miles**: ONLY the ARES read-path caching answer. Everything else
  they owed closed 2026-08-20 — row-controls #59, Smoke pass #60 (clean, incl.
  the task due write BY HAND), caption #55/#58, underline withdrawn #57.
  Closed threads → `docs/history/state-log/`.
- **Figma reads** — Rex MCP is OFFLINE. **The official Figma MCP is the
  verified path**: `get_design_context` returns categorized annotations as
  `data-*-annotations` plus exact pixel facts (load the figma-design-to-code
  skill first). File `abDRsIVDs1XjJKeR8xYOoF`. Verify annotation count and
  content against the owl BEFORE building — delegable to a recon agent with a
  halt-on-mismatch rule. Rex (channel 7782) is needed only for plugin-API
  introspection (component-set walks) or writing into the file.
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
  profile): the task-due picker by hand · the sub-350px last-resort scroll ·
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

- 2026-08-20 — **Owls #54–#56 + JP's styling pass**: #55 inverted my caption emphasis (tasks lead, count trails at every N, no threshold — R-exp-l); Miles accepted both corrections and wrote the Figma codegen trap into the annotation; JP ruled the frame beats its own annotation on the `Open Card` underline (R-warn-r) and labels are sentence-cased at display (R-warn-s). → docs/history/state-log/2026-08-20.md
- 2026-08-20 — **Batch 14: owls #52 + #53** — a shared MC stops attributing its tasks. Probed the real board: NO structural task→deliverable edge exists (checklists 0/218, links 0, list 0/279, members 36/279, best name segment 60 unique vs 117 mis-resolving), so invariant 4 is confirmed, not broken. Correction sent to Miles: the ambiguous case is 78.4% of tasks, not the minority. Hover-card shadow + its clamp bleed. 982 → 993 + 24 todo. → docs/history/state-log/2026-08-20.md
- 2026-08-19 — **Leftover sweep + template split DEPLOYED** (`b401bac`): the second session's worktree was already gone and merged — branch deleted, the `--dir test` workaround retired. Deploy aborted once on STATE.md's own 10KB cap, then green: healthz 200, host bundle sha256 == local. Corrected a wrong claim — `public/` is gitignored, so a `git diff` over it proves nothing. `build.js` byte count was under-reporting by 1.4KB (UTF-16 length vs bytes). → docs/history/state-log/2026-08-19.md
- 2026-08-18 — **Template split** (ARES pattern): `00-app.html` → `layout.html` + `partials/` + `views/`; composed output = the single file byte-for-byte; new guard for the nested-`{{#partial}}` hazard it creates. 976 → 982 + 24 todo. Not deployed. → docs/history/state-log/2026-08-18.md
- 2026-08-18 — **Batch 13: owls #47–#51** — the stale-reconcile guard (`decisions/0025`) stops an older ARES read reverting a registry write; product's other three cadence worries were impossible (no client refresh loop). Note chip carries the note, neutral; clarification note → left accent. 962 → 976 + 24 todo. → docs/history/state-log/2026-08-18.md
- 2026-08-18 — **Review pass over batches 11+12** (/simplify: 14 findings applied, `47c65e0` · /code-review high: 15 defects fixed, ten CONFIRMED — the worst: task lists rendering once per sibling row under multi-deliverable MCs, a stale-overwrite race the sweep itself introduced, one malformed ARES date aborting a project's sync). Manila-true due slice on both W2 halves is the one deliberate behaviour change; suite 947 → 962 + 24 todo. → docs/history/state-log/2026-08-18.md
