# Phase log — every phase and batch, append-only

ARCHIVE (Layer 3). Never loaded on resume. `STATE.md` carries only the phases
that are open or not yet deployed; a phase lands here the session after it
ships. Rows are verbatim — moved, never rewritten. Newest at the bottom.

Companion archives: `decision-log.md` (settled questions) ·
`state-log/` (session narratives, one file per day).

_last-verified: 2026-08-18_

| # | Phase | Status | Gate |
|---|---|---|---|
| 0 | Setup & infrastructure | **done 2026-08-03** (T001–T006) | |
| 1 | Schema + migrations + seed | **done 2026-08-03** (T007–T010) | |
| 2 | Auth + audit | **done 2026-08-03** (T011–T016) | |
| 3 | Port lib/ + golden tests | **done 2026-08-03** (T017–T026) | AC-10: ✅ gate passed by JP 2026-08-03 |
| 4 | ARES read + mapping | **done 2026-08-03** (T027–T033; T034 end-to-end measure at staging) | NFR-3: ARES cycle observed 15 min ✓; e2e at staging |
| 5 | Intake sync | **done 2026-08-03** (T035–T039; AC-6 literal counts at staging) | |
| 6 | Model refresh + validation | **done 2026-08-03** (T040–T045) | **PM sign-off: ✅ 2026-08-03** |
| 7 | UI — five tabs | **done 2026-08-03/04** (T046–T063; perf: 107ms/85ms @5k) | demoed on real 837 data |
| 8 | Urgency write | **done 2026-08-04** (T064–T066) | TEST board round-trip: ✅ (board tx8gDsTH, label add/remove verified live) |
| 8a | Conflict acknowledgements | **done 2026-08-04** (T067–T068) | audit-logged ✓ |
| 9 | Security testing + pilot | in progress — T069 anon half ✅, T072 backup/restore ✅, T086 ✅; **G7 ✅ 2026-08-12 (observation mode)**; T073/T091 ⏸ (team UI update), T075 sweep pending, non-member 403 parked | G7 passed; write-enable on rt-837 = next JP gate |
| 10 | Two-way sync (due-date write + ARES push) | **DONE 2026-08-04** — push LIVE, 37s Trello→Sirius, fallback drill passed (T077–T086) | FR-9.6 observed live |
| 11 | Admin panel (FR-10) | **DONE 2026-08-04** (T087–T090); T091 ⏸ with T073 | JP first admin; live |
| 12 | Build-spec v1.1 adoptions (frost notes FR-11, daily plotting FR-12, weighted load BR-6c) | **BUILT 2026-08-12** (T092–T099; 214/214 dual-TZ) | errata answered — BR-6c confirmed everywhere |
| 13 | Pipeline redesign to Figma frame 17:1015 | **DEPLOYED LIVE 2026-08-12** (T100–T110 + /simplify 15 fixes + /code-review 15 fixes; 219/219 dual-TZ) | live verified; team testing on TEST board |
| 13a–13f | Pipeline, Requests, planner toolbar | **DONE + DEPLOYED** | detail: the retired `docs/HANDOFF.md`, 2026-08-15 revision (git history only) |
| 13g–13j | Gantt planner (owl #22) · calendar amendment v4.2.0 · URL routing (13h) · batch-3 (capacity lock B, suggest bar, legend, collapses) · ack-key amendment v4.3.0 (T135) · batch-4 (sprints modal ×4 states, drag reversal, icon cluster) | **DEPLOYED + LIVE-VERIFIED 2026-08-15..17** (`9977f07`..`651b850`) | |
| 13k b5/5b | Requests STATUS two-valued + Pipeline row warning and popover (owls #34–#36) · Save gates on unsaved changes, blank sprint names rejected (owl #37) | **DEPLOYED + LIVE-VERIFIED 2026-08-17** (`788734a`..`c3fbfc3`) | |
| 13k b6–b9 | Requestor badge truncates + hover/focus tooltip (owls #39/#40) · the Gantt bar could not be dragged with a real mouse — affordance moved to the coloured bars · the drag handle IS the coloured run (JP) · the drag ghost shows only the bars | **DEPLOYED + LIVE-VERIFIED 2026-08-18, JP confirmed** (`c52d215`..`af0dd24`) | law: `specs/001-sirius-v1/gantt-rules.md` §1, the drag contract |
| 13k rev | Review sweep over batches 5–9 (JP: `/simplify` + `/code-review` on `646307b..HEAD`) — five defects, three hot paths, six duplicated rules collapsed | **DEPLOYED + LIVE-VERIFIED 2026-08-18** (`141b6df`; 794 → 821 tests dual-TZ) | defect CLASSES are standing law now: `test/CLAUDE.md` 1–3, `frontend/CLAUDE.md` §Performance law, gantt-rules 37/38/12. Digest: state-log 2026-08-18 (T162) |
| 13k b10 | Pipeline warning becomes a 14px icon + hover card; the amber row wash ruled away (owl #41) | **DEPLOYED + LIVE-VERIFIED 2026-08-18** (`7bdf6b4`; 821 → 865 tests + 22 `it.todo` dual-TZ) | four defects caught by the verify lenses pre-deploy — R-warn-u/v/w in `pipeline-frame-notes.md` |
| 13k b11 | Owls #42–#46 processed: closing line restored in the warning card (R-warn-x) · last-resort popover scroll (R-warn-y, amends R-warn-h) · 24×24 hit target (R-warn-z) · Asset Type joins the clip recipe · T152 closed (tooltip stays pure-CSS, ruled) · W2 scope clarified to task cards (JP) · #45 expanded-MC-row recon done, four answers sent (jp→miles #40) | **BUILT + COMMITTED 2026-08-18** (`5934c26`..`ef2874b`; 911 + 24 todo dual-TZ) — **NOT deployed; the deploy also carries the stage-5 script split** | live pass owed: closing line, sub-350px scroll, hit target, Asset Type tooltip |
| ctx | Context restructure stages 1–5 + JP's doc workflows (state-log rotation · gantt-rules extraction · MAP/skim + directory CLAUDE.md files + docs/README.md · T-shape architecture + `decisions/` + per-area maps · `01-app.js` split into ten numbered pieces, byte-proven, **new built baseline `4dd5186…`** · plain-language architecture guide · docs hygiene audit + JP's archival rulings) | **DONE 2026-08-18** (`0d5e3cb`..`f2d203a`, `96881a1`, `896c0a9`; docs/ reorganised + `docs/HANDOFF.md` retired 2026-08-18) | plan + record: `docs/history/context-restructure.md`. **The script split is NOT yet deployed — the next feature deploy carries it** (JP's call if sooner) |
