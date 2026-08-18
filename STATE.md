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
| 10–13k b11, ctx | Two-way sync · admin panel · Pipeline redesign · Gantt planner · batches 1–11 · context restructure (script split shipped with b11's deploy) | **DEPLOYED + LIVE-VERIFIED through 2026-08-18** (T077–T171) | per-batch detail: `docs/history/phase-log.md` |
| ctx t-split | Template split: `00-app.html` → `layout.html` + `partials/` + `views/`; no behaviour change | **COMMITTED, NOT DEPLOYED** (968 + 24 todo dual-TZ) | built page proven unchanged (hash + browser A/B); next deploy carries it |
| 13k b12 | The expanded MC row to spec (owl #45) + the same-evening review pass: one-table column model · task due = W2's task-card half · first-sibling render (invariant 3) · Manila-true due slice both halves · sync hardening · kind-flip deactivation | **DEPLOYED 2026-08-18, review-pass fixes pending deploy** (`8765083`..; 962 + 24 todo dual-TZ) | `due-roundtrip.ts` on tx8gDsTH ✓; owed: task-due UI round-trip · sub-350px scroll check · Miles's confirms on the two defaults (jp→miles #41) |

**Build health (2026-08-18, post-template-split):** 968/968 tests + 24 `it.todo`,
62 files — green under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
`TZ=America/New_York`). Migrations applied through **007**. The ~1-run-in-5
loopback flake is ENVIRONMENTAL and ruled in `test/CLAUDE.md` rule 5; its
real fix is parked below.

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
  before building on one. **Thread position**: miles→jp acked through **#46**;
  jp→miles sent through **#41** (batch-12 live report). **Awaiting Miles**:
  confirms on the two batch-12 defaults — childless-MC chevron removed and
  SubTone expanded-only (both one-line flips, jp→miles #41) · a Sirius Smoke
  pass over the expanded row incl. a task due set/clear · the row-controls
  design pass incl. status-note placement · the gap-banner placement
  blessing. Closed threads → `docs/history/state-log/`.
- **Figma reads** — Rex MCP is OFFLINE (server disconnected). **The official
  Figma MCP is the verified path**: `get_design_context` returns the
  categorized annotations as `data-*-annotations` attributes plus exact pixel
  facts (load the figma-design-to-code skill first). File
  `abDRsIVDs1XjJKeR8xYOoF`. Verify annotation count and content against the
  owl BEFORE building — delegable to a recon agent with a halt-on-mismatch
  rule. Rex (channel 7782) is needed again only for plugin-API introspection
  (component-set walks) or writing into the file.
- **File drop `../owl/` (ARES agent)** — still outstanding: add `hLL7WW2V` to
  `PUSH_SUBSCRIBER_BOARDS` (#07, nudged #08 — no reply file yet).

## Still open

- **JP gates**: flip `writes_enabled` on rt-837 (+ the pre-pilot security
  review) · `GOOGLE_SHEETS_CREDENTIALS` — lights up Requests plus
  requestor/type on real data · ALT-9 sheet-row link (expose
  `intake_sheet_id` or drop the sub-label) · ALT-1 (dead server `?filter=`
  param) · OD-4's non-capacity remainder — the capacity slice was ruled
  2026-08-17, the broader expiry question stays OPEN (`decisions/0019`) ·
  two pre-existing host-local `todayIso()` sites · loopback-listen test
  hardening (~21 files) · manual pass: drag a bar in the collapsed-pane
  state · whether to draw a custom drag image so
  Chrome's translucency/shadow go away entirely (only `setDragImage` can).
- **Product (Miles)**: the batch-12 confirms + Smoke pass (see Comms) ·
  month-encoding verify when the Sheets credential lands · the remaining
  tabs' frames (T073/T091 un-park).
- **ARES agent**: push subscription for `hLL7WW2V`.
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

- 2026-08-18 — **Template split** (ARES's compiled-partials convention): `00-app.html` 1,229 lines → `layout.html` + `partials/` + `views/`; `composeTemplate()` exported so tests derive the shipped template. Built page proven unchanged (hash + browser A/B). New guard `test/template-partials.test.ts`: a nested `{{#partial}}` renders empty and the build cannot see it. 962 → 968 + 24 todo, 62 files. Not deployed. → docs/history/state-log/2026-08-18.md
- 2026-08-18 — **Review pass over batches 11+12** (/simplify: 14 findings applied, `47c65e0` · /code-review high: 15 defects fixed, ten CONFIRMED — the worst: task lists rendering once per sibling row under multi-deliverable MCs, a stale-overwrite race the sweep itself introduced, one malformed ARES date aborting a project's sync). Manila-true due slice on both W2 halves is the one deliberate behaviour change; suite 947 → 962 + 24 todo. → docs/history/state-log/2026-08-18.md
- 2026-08-18 — **Batches 11 + 12 DEPLOYED LIVE** (T167–T178, `5934c26`..`5cd662e`): batch 11's four ruled changes live-verified (closing line ✓, 24×24 ✓; sub-350 scroll check owed — the pass discovered the browser was shared with JP); the #45 expanded MC row built to spec same-day and deployed — one-table column model, task due = W2's task-card half (route + sync chain + client), childless chevron and expanded-only SubTone as flagged defaults, expansion resets on project switch; `due-roundtrip.ts` smoke ✓ zero net change; 947 + 24 todo dual-TZ. The two deploys also carried the stage-5 script split into production. → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 11 build detail: owls #42–#46 processed end-to-end; R-warn-x/y/z; Asset Type clip; T152 closed; the 7 stale `01-app.js` comments repointed; #45 recon + jp→miles #40; JP's W2 task-card scope ruling → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Context restructure stages 1–5 + JP's doc workflows: state-log rotation, gantt-rules, T-shape, decisions/, script split (baseline `4dd5186…`), hygiene audit + archival rulings → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 10: Pipeline warning becomes icon + hover card, amber wash removed; four lens-caught defects (T163–T166, R-warn-u/v/w) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Review sweep over batches 5–9: five defects, three hot paths, six duplicated rules collapsed (T162) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 9 built: drag ghost shows only the coloured bars (T160; live pass owed as T161) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 built: drag handle becomes the coloured run (T158–T159); numbering note vs T157 → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 ruling built: the drag affordance is the coloured bars only (T157, closes T155h) → docs/history/state-log/2026-08-18.md
