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
| 10–13k b10 | Two-way sync · admin panel · build-spec v1.1 adoptions · Pipeline redesign · Gantt planner · batches 1–10 | **DEPLOYED + LIVE-VERIFIED through 2026-08-18** (T077–T166) | per-batch detail: `docs/history/phase-log.md` |
| 13k b11 | Owls #42–#46: warning-card closing line · popover last-resort scroll · 24×24 hit target · Asset Type clip · T152 closed · #45 recon answered | **BUILT + COMMITTED 2026-08-18** (`5934c26`..`ef2874b`) — **NOT deployed** | live pass owed: closing line, sub-350px scroll, hit target, Asset Type tooltip |
| ctx | Context restructure stages 1–5 + doc workflows (state-log rotation · gantt-rules · MAP/skim · T-shape + `decisions/` · `01-app.js` → ten pieces, baseline `4dd5186…`) | **DONE 2026-08-18** (`0d5e3cb`..`f2d203a`, `96881a1`, `896c0a9`) | record: `docs/history/context-restructure.md`. **The script split is NOT yet deployed — the next feature deploy carries it** |

**Build health (2026-08-18, post-batch-11):** 911/911 tests + 24 `it.todo`,
60 files — green under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
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
  jp→miles sent through **#40**. **Awaiting Miles**: the childless-MC chevron
  proposal in #40 (render the expand chevron only when the MC has task cards)
  · the row-controls design pass incl. status-note placement · the gap-banner
  placement blessing. Closed threads → `docs/history/state-log/`.
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
  state · whether the stage-5 script split gets its own deploy, else the
  next feature deploy carries it · whether to draw a custom drag image so
  Chrome's translucency/shadow go away entirely (only `setDragImage` can).
- **Product (Miles)**: confirm the childless-MC chevron proposal (jp→miles
  #40) · month-encoding verify when the Sheets credential lands · the
  remaining tabs' frames (T073/T091 un-park).
- **Next build: #45 expanded MC row** (node `520:54192`, spec verified
  against the annotations 2026-08-18; W2 task-card scope ruled by JP and
  recorded in `contracts/trello-write.md`). Build-pass notes: keep both
  levels in the ONE `<table>` (one column model — promised to Miles in #40);
  fix the expansion-carryover-across-project-switch defect (expanded is
  keyed on mc_number alone — invariant-3 smell — add `expanded: {}` to
  `resetForProjectSwitch`); verify the SubTone element and the third
  annotation against the frame (the MCP output truncated at two, both
  matching the owl).
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

- 2026-08-18 — **Batch 11: owls #42–#46 processed end-to-end; four ruled changes BUILT + COMMITTED (`5934c26`..`ef2874b`), NOT deployed** (T167–T171). Warning-card closing line restored (R-warn-x) · last-resort popover scroll (R-warn-y, amends R-warn-h) · 24×24 hit target (R-warn-z) · Asset Type joins the clip recipe · T152 closed, tooltip stays pure-CSS · the 7 stale `01-app.js` comments repointed at the split pieces · #45 expanded-MC-row recon done and four answers sent (jp→miles #40), including a defect found: expansion survives a project switch because `expanded` is keyed on `mc_number` alone. JP ruled W2 covers task-card due dates — same registry entry, not a growth. 911 tests + 24 todo, dual-TZ green. **Owed**: the live pass for the four changes (after the deploy that also carries the stage-5 split), and the #45 build. → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Context restructure stages 1–5 + JP's doc workflows: state-log rotation, gantt-rules, T-shape, decisions/, script split (baseline `4dd5186…`), hygiene audit + archival rulings → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 10: Pipeline warning becomes icon + hover card, amber wash removed; four lens-caught defects (T163–T166, R-warn-u/v/w) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Review sweep over batches 5–9: five defects, three hot paths, six duplicated rules collapsed (T162) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 9 built: drag ghost shows only the coloured bars (T160; live pass owed as T161) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 built: drag handle becomes the coloured run (T158–T159); numbering note vs T157 → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 ruling built: the drag affordance is the coloured bars only (T157, closes T155h) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 7 built: Gantt fixes from JP's live-site report (T153–T155, ruling R-g-1) → docs/history/state-log/2026-08-18.md
- 2026-08-17 — Batch 6 built: Requestor cell no longer cuts long values mid-character (T150–T152) → docs/history/state-log/2026-08-17.md
- 2026-08-17 — Batch 5b built: two sprint-modal behaviour rulings R-f-10/R-f-11 (T146–T148); arrival pulse kept → docs/history/state-log/2026-08-17.md
