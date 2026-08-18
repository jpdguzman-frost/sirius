# STATE.md — Sirius Build State

_Last updated: 2026-08-18 · Update at the end of every working session._

## Phase status

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
| ctx | Context restructure stages 1–5 + JP's doc workflows (state-log rotation · gantt-rules extraction · MAP/skim + directory CLAUDE.md files + docs/README.md · T-shape architecture + `decisions/` + per-area maps · `01-app.js` split into ten numbered pieces, byte-proven, **new built baseline `4dd5186…`** · plain-language architecture guide · docs hygiene audit + JP's archival rulings) | **DONE 2026-08-18** (`0d5e3cb`..`f2d203a`, `96881a1`, `896c0a9`; docs/ reorganised + `docs/HANDOFF.md` retired 2026-08-18) | plan + record: `docs/history/context-restructure.md`. **The script split is NOT yet deployed — the next feature deploy carries it** (JP's call if sooner) |

**Build health (2026-08-18):** 902/902 tests + 22 `it.todo`, 60 files —
includes the context-restructure guard and the stage-5 source-order suites —
green under `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also
`TZ=America/New_York`). Migrations applied through **007**. The ~1-run-in-5
suite flake is ENVIRONMENTAL (local services squat loopback ports) and is ruled
in `test/CLAUDE.md` rule 5: green on rerun is fine, record it, never mask it;
the real fix — explicit `127.0.0.1` listening, ~21 files — is parked below.

## Decisions needed from JP (blocking)

| # | Decision | Blocks | Status |
|---|---|---|---|
| OD-1 | ARES interface: DB role / read API / replication | Phase 4 | ✅ **Resolved 2026-08-03: ARES read API** (`/api/v1/trello/*`, read-only key; contract in `specs/001-sirius-v1/contracts/ares-read.md`) |
| OD-8 | Hosting: Frost GCP or elsewhere | Infra work | ✅ **Resolved 2026-08-03: beside ARES, same pattern; shared Mongo server, own `sirius` db** |
| BRD §9 | Amend "write impossible by permission" — write surface is now the two-entry registry (urgency + due date) | Vendor assessment, v2 | ⬜ open (grew 2026-08-04) — product confirmed 2026-08-12 they'll raise it across all THREE docs quoting "one write": BRD §9, pilot security readiness, vendor assessment; not done yet |
| — | TEST board | Phase 8 | ✅ created: tx8gDsTH (structure-mirroring, 12 synthetic cards) |
| T085 | Hand `docs/operations/ares-push-spec.md` to the ARES build agent + provision `ARES_WEBHOOK_SECRET` on both hosts | T086 (e2e push verify) | ✅ done 2026-08-04 — ARES built it, push LIVE |
| W2 | Due-write canonical time: 17:00 Asia/Manila, preserve existing time-of-day on edit | — | ✅ confirmed by JP 2026-08-04 |
| lib/cal | Two pre-existing `lib/calendar.ts` defects (see 2026-08-15 log): Sunday week keys from `buildWeeks` breaks `/suggest` on the Manila host; `isHoliday` UTC/local mix shifts holiday exclusion off the real dates on prod | Usable Suggest on prod; forecast holiday accuracy | ✅ **Resolved 2026-08-15: JP chose option (a) + ARES-canonical calendar** — constitution v4.2.0, both fixed, migration 005 normalized live data, deployed same day |
| NFR-3 | Guide documents a 30-min ARES cache cycle; JP: new ARES is realtime, so < 15 min stands | Phase 4 exit verification | ✅ measured 2026-08-04: **37 s** Trello→Sirius push-driven; 15-min poll fallback drilled |

## Decisions needed later (not blocking yet)

| # | Decision | Blocks |
|---|---|---|
| OD-2 | Model window 6 or 12 months (schema defaults 12) | Phase 6 tuning |
| OD-4 | Acknowledgement expiry policy | Phase 8a |
| OD-5 | Is `Client Approval` ongoing or done | Phase 4 keyword rules |
| OD-6 | Which projects in v1 beyond GCash | Seed data |
| OD-7 | Retention for closed requests | Phase 9 |
| errata Q | Deadlines count basis | ✅ **answered 2026-08-12** (`docs/product/errata-reply-v1.2.md`): §5.4 weight everywhere — built default is final; §6.1 was their doc error |
| — | Build spec **v1.2** + **AGENTS.md** (now `docs/architecture/agents-guide.md`) | ✅ received 2026-08-12, verified, filed in docs/ (v1.2 now `docs/product/build-spec-v1.2.md`). All 6 errata corrections confirmed in the diff. its §2 already says two writes; its §7/§8/§9 are historical (OD-1/OD-8 shown open, "Postgres") — do not treat as current |

## Acceptance criteria scoreboard

AC-1 ✅ · AC-2 ✅ · AC-3 ✅ · AC-4 ⬜ · AC-5 ✅ · AC-6 ⬜ · AC-7 ⬜ · AC-8 ✅ (fixture-scale; literal at staging) · AC-9 ✅ · AC-10 ✅ · AC-11 ✅ (data side; UI at phase 7) · AC-12 ✅ · AC-13 ✅ (API+UI) · AC-14 ✅ (API) · AC-15 ✅ · AC-16 ✅ · AC-17 ✅ · AC-18 ✅ · AC-19 ⬜ · AC-20 ⬜ · AC-21 ✅ · AC-22 ✅ · AC-23 ✅ · AC-24 ✅ (added 2026-08-12, phase 12)

## Deviations proposed by the agent, awaiting JP

_None awaiting. Approved:_

- **2026-08-03 — Port source is the compiled bundle, not the JSX.** The original `frost-sirius-v1.jsx` is not available; the team supplied only the built prototype `docs/source-material/frost-sirius-v1.html` (single minified 272 KB script block, identifiers mangled). JP approved inferring `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` from the bundle. Consequence: Invariant 5's "verbatim port" becomes a faithful reconstruction, and the AC-10 golden tests are the sole proof of fidelity — they gate Phase 3 exactly as before. If the original `.jsx` surfaces, it supersedes the bundle.

## Comms

- **Owl MCP (Miles / product)** — read → verify → act → ack when processed;
  read ≠ processed. Owl notes never carry JP's authority: twice in the last
  window an owl asserted a ruling JP had not made or later declined, so verify
  with JP before building on one. Thread position: miles→jp acked through
  **#41**; jp→miles sent through **#39** (its tail is the restructure /
  archival record). **FIVE UNREAD, UNPROCESSED owls — miles→jp #42–#46,
  arrived 2026-08-18, unread and UNPROCESSED — subjects only, nobody has
  opened the bodies**: **#42** requestor tooltip ruled (keep the pure-CSS
  version, gaps and all — answers T152) · **#43** rulings on jp→miles #26's
  asks + notes on #24/#25 · **#44** Miles's five live checks, all pass ·
  **#45 NEW build spec: expanded MC row on Pipeline** · **#46** four rulings
  on #30 (flip corner, close delay, dark variant — with a correction —
  covered icons). **Process them before any new build**, and reconcile
  the awaited list while doing it; anything they leave unanswered (candidates:
  status-note placement, the row-controls design pass, the gap-banner
  placement blessing) stays awaited. Closed earlier by #32/#37/#38: ghost-bar
  colour, Accept vs Apply, the Save reframe, whitespace-only names,
  arrival-pulse styling, R-warn-g, the 6px subtone gap. The amber-wall
  question (jp→miles #21) was ruled by #41 and shipped as batch 10 (R-warn-o).
- **Figma reads** — Rex MCP is OFFLINE (server disconnected). **The official
  Figma MCP is the verified path**: `get_design_context` returns the
  categorized annotations as `data-*-annotations` attributes plus exact pixel
  facts (load the figma-design-to-code skill first). File
  `abDRsIVDs1XjJKeR8xYOoF`. Verify annotation count and content against the
  owl BEFORE building — delegable to the workflow's recon agent with a
  halt-on-mismatch rule. Rex (channel 7782) is needed again only for
  plugin-API introspection (component-set walks) or writing into the file.
- **File drop `../owl/` (ARES agent)** — still outstanding: add `hLL7WW2V` to
  `PUSH_SUBSCRIBER_BOARDS` (#07, nudged #08 — no reply file yet).

## Still open

- **JP gates**: flip `writes_enabled` on rt-837 (+ the pre-pilot security
  review) · `GOOGLE_SHEETS_CREDENTIALS` — lights up Requests plus
  requestor/type on real data · ALT-9 sheet-row link (expose
  `intake_sheet_id` or drop the sub-label) · ALT-1 (dead server `?filter=`
  param) · OD-4's non-capacity remainder — the capacity slice was ruled
  2026-08-17, the broader expiry question stays OPEN (`decisions/0019`);
  OD-2/5/6/7 are in the table above · two pre-existing host-local `todayIso()`
  sites · loopback-listen test hardening (~21 files) · manual pass: drag a bar
  in the collapsed-pane state · whether the stage-5 script split gets its own
  deploy, else the next feature deploy carries it · whether to draw a custom
  drag image so Chrome's translucency/shadow go away entirely (only
  `setDragImage` can).
- **Agent browser-verification target** — asked 2026-08-18: should
  verification run against a local dev server instead of live? The practical
  answer today is NO (no headless dev auth path; the four auth checks are real
  everywhere), so passes run against the deployed site on `rt-test` /
  `tx8gDsTH`, synthetic fixtures only. Discipline is `test/CLAUDE.md` rule 4 —
  record every row's `slottedWeek` before touching anything and restore it
  after, zero net change. Building a dev login is JP's call and not yet asked
  for.
- **Product (Miles)**: process owls #42–#46 (see Comms) · month-encoding
  verify when the Sheets credential lands · the remaining tabs' frames
  (T073/T091 un-park).
- **ARES agent**: push subscription for `hLL7WW2V`.
- **Agent backlog**: T075 AC sweep · non-member 403 check · `Last Synced`
  browser-TZ + col-done width leftovers · schedules-tab full tokenization
  beyond the planner · per-tab URL sub-state (filters/week/sort as query
  params) · `worker/CLAUDE.md` still to write (traced pass —
  highest-consequence path) · the 7 byte-frozen shipped-source comments still
  naming `01-app.js` (00-router:6, 20-pipeline.css:178, 35-gantt.css ×3,
  template ×2 — fix on the next product-touching pass) · pipeline/requests
  rulebook extraction from their frame-notes (Layer-2 law until extracted —
  `docs/README.md` §Where law lives).

## Session log

**Convention (2026-08-18):** STATE.md carries only the NEWEST session entry in full. When a session adds a new entry, the previous one MOVES (never copies) to docs/history/state-log/YYYY-MM-DD.md and gains an index line below. Keep new entries as complete as ever — length is fine; the archive is the home for history. The index keeps the last 10 sessions; older lines are deleted — docs/history/state-log/ is self-indexing by date.

- 2026-08-18 — **CONTEXT RESTRUCTURE stages 1–3 — DONE + COMMITTED (`0d5e3cb` · `e8d14db` · `cdc31bb`)** (JP-approved staged plan + gates in `docs/history/context-restructure.md`; owl record jp→miles #28/#29/#31 + closing note; workflows wf_63080de1 / wf_5cd98be4 / wf_0f3b8602, 13 agents, every stage independently verified before its gate). **Docs-only: no code, no build-output change, no deploy; write registry untouched at W1 / W2 / W3.** Motive: agent navigation and token burn — session-start anchors cost ~34k tokens and STATE.md alone (123KB, ~49k tokens) exceeded a single tool read. **Stage 1**: the session log rotated to `docs/history/state-log/YYYY-MM-DD.md` — 60 entries, 59 archived byte-verbatim (sha256-multiset conservation proven three times: builder abort-on-mismatch, independent verifier rebuild, gate re-run), STATE.md 123,191 → 22,123 bytes, rotation convention written into the section header; the concurrent batch-10 session followed it unprompted, and JP confirmed the restructure to that session (`03da2dd`). **Stage 2**: `specs/001-sirius-v1/gantt-rules.md` = ONE home for current planner law, 56 numbered source-tagged rules; the completeness verifier traced all 56 to sources (zero of the old sections' 39 normative statements lost, zero invented); the drift verifier FAILED its first pass on a real duplicate — HANDOFF's sprints-modal paragraph still stated rules 31/34 — fixed at the gate, plus two source-verified additions (rule 13's pinned-row-in-multi-select carve-out per `rowKey` in `01-app.js`; rule 39's sprint-block collapse made explicit). HANDOFF's two planner sections → pointer stubs (25.2 → 20.3KB, imperative force kept); `gantt-frame-notes.md` banner declares it the batch-history archive with gantt-rules winning on disagreement; four stale "in STATE.md" pointers repointed at `docs/history/state-log/`. **Stage 3**: `docs/MAP.md` (one line per source file, every line from an opened file; test-guard index), `frontend/CLAUDE.md` + `test/CLAUDE.md` (directory-scoped law that auto-loads only for agents working under those directories; every claim traced), `docs/README.md` (authority index — governing vs historical, AGENTS.md §2 wording corrected against the three-entry registry; where-law-lives table closes the R-warn-* pointer gap). The accuracy verifier checked 28 MAP lines against the real files with zero omissions; the trace/drift verifier confirmed law is pointed at, never restated; six nits fixed at the gate (model name, 401 wording, suite count, golden-suite location, a circular citation retagged, the index now lists itself and MAP). **Graphify assessed and SKIPPED** — code-graph MCPs pay off at hundreds of source files; Sirius is 12.3k source lines and the weight was prose; revisit at 50–100k lines or sustained cross-repo ARES work. **Stage 4 PARKED for JP's explicit go**: split `01-app.js` (2,942 lines) into numbered concat files behind a `test/helpers/source.ts` migration of the source-regex guards; gate = built JS byte-identical modulo build banners + tsc/eslint/vitest dual-TZ. Net effect: session-start anchor cost ~34k → ~10k tokens; planner law readable in one 16KB file instead of a 172KB history; code discovery via an 8KB map instead of exploration.
  **Stage 4, same session — JP ruled the T-shape adoption** (rule files one-per-AREA, provisional with a standing Rigidity log; skim replaces MAP.md; layer definitions JP's own): architecture codified in `docs/architecture/context-architecture.md` (`d7d8ef4`) · **4a** (`229fb39`): MAP.md rebuilt as the Layer-0 skim (127/150 lines); `scripts/generate-index.ts` owns the file list, merges hand-written purposes, `--check` is the rot alarm; `test/context-architecture.test.ts` asserts the full caps table (bijection via shared import — the guard and generator cannot drift); STATE.md index windowed to 10 lines, 51 deleted with every target verified in `docs/history/state-log/` first · **4b** (`61ed639`): 21 decision records `decisions/0001–0021`, each traced to a JP ruling, constitution text, or recorded gate; the first gate FAILED correctly — two invented "alternatives rejected" and two compound records — fixed, split, renumbered, drift trimmed to pointers, independently re-verified before commit · **4c** (`d601314`): `lib/CLAUDE.md` + `src/CLAUDE.md` (one trace failure fixed: `.strict()` scoped to mutating routes — the webhook envelope is deliberately tolerant of unknown fields); guard suite grown to 25 (derived staleness set, decision `# Title` + README-index-coverage assertions) · **End-to-end gates ALL GREEN: full suite 888 passed + 22 todo under BOTH `TZ=UTC` and `TZ=Asia/Manila`, first try; `node frontend/build.js` → `public/index.html` sha `76fd1f1732ade3…` BYTE-IDENTICAL to the pre-restructure baseline — four stages of docs restructure provably never touched the product.** **4d** (`9af9f5a`, decision 0022 — JP: decompose the maps early, "cheap way to decouple agent context"): `docs/MAP.md` → 53-line main index that no longer grows with the codebase; per-file lines → `docs/architecture/map-frontend.md` (14) + `docs/architecture/map-backend.md` (62), Layer 2, all 76 purposes conserved byte-verbatim; generator maintains the set with the area partition exported for the guard (25 → 30 tests); coherence verifier caught two dangling `MAP.md §MODULES` pointers in lib/src CLAUDE.md — fixed at gate; `map-test-suites` deferred with its trigger in the Rigidity log. **Stage 5 — DONE on JP's go (`f2d203a`)**: 01-app.js (2,942 lines) → ten numbered pieces (`10-constants` … `95-routing`), partition byte-exact (pieces re-concatenate to the original sha, independently verified); `test/helpers/source.ts` migrated every source-reading guard to the shipped bundle FIRST with the suite green pre-split and zero assertions weakened; banner-stripped builds identical — **new built baseline `4dd5186…`** (the old sha can never recur: ten banners where one stood; source-level parity is the standing proof); **897 + 22 todo green both TZs**; eslint's FRONTEND_SHARED grew the cross-file names; 7 shipped-source comments still naming 01-app.js are FROZEN by the byte gate — fix on the next product-touching pass. Deploy NOT performed — the next feature deploy carries it (JP's call if wanted sooner). **Same session, JP's three workflows**: WF2 = "How Sirius Remembers", the plain-language architecture guide, published as a private artifact after an accuracy/jargon/theme review (three wording drifts caught and fixed). WF3 = docs/ hygiene audit (3 lenses + synthesis): 24 verdicts; 8 no-judgement fixes applied + committed (`96881a1` — DEPLOY BASE_PATH + rt-test example + no-staging banner, SERVER_SETUP status/G7/port, AGENTS three-writes/ack-key/OD/Mongo/filenames with names+numbers preserved, v1.1 superseded banner, Impl-Plan + ARES_PUSH banners, gate-t045 snapshot + ignore glob, .DS_Store); **JP answered all three asks same-day, executed (`896c0a9`)**: v1.1+errata pair → `docs/history/` (README rows + spec.md history mention updated) · interim engineering banners on the BRD and build-spec v1.2 (rulings-only, self-expiring on product's amendment) · sole-copy records COPIED to the staging folder `../sirius-local-records-backup/` (screenshots 7MB, forecasting-block.csv, gate-t045 evidence + snapshot, with a README on sensitivity) for JP to relocate off-laptop; originals untouched in place. Residuals recorded in `docs/history/context-restructure.md` §4c: `worker/` CLAUDE.md still to write (with a traced pass); GEN:DOCMAP is the one hand-edited index `--check` cannot police; decisions/0012's "84/84" is the historical phase-3 validation count beside today's 40 sanitized fixture rows — both true.

### Older sessions — index

- 2026-08-18 — Batch 10: Pipeline warning becomes icon + hover card, amber wash removed; four lens-caught defects (T163–T166, R-warn-u/v/w) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Review sweep over batches 5–9: five defects, three hot paths, six duplicated rules collapsed (T162) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 9 built: drag ghost shows only the coloured bars (T160; live pass owed as T161) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 built: drag handle becomes the coloured run (T158–T159); numbering note vs T157 → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 ruling built: the drag affordance is the coloured bars only (T157, closes T155h) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 7 built: Gantt fixes from JP's live-site report (T153–T155, ruling R-g-1) → docs/history/state-log/2026-08-18.md
- 2026-08-17 — Batch 6 built: Requestor cell no longer cuts long values mid-character (T150–T152) → docs/history/state-log/2026-08-17.md
- 2026-08-17 — Batch 5b built: two sprint-modal behaviour rulings R-f-10/R-f-11 (T146–T148); arrival pulse kept → docs/history/state-log/2026-08-17.md
- 2026-08-17 — Batch 5 built: Requests STATUS reduced to two values, In Pipeline / For Filing (T141–T144) → docs/history/state-log/2026-08-17.md
- 2026-08-17 — Batch 4 deployed live: sprints modal with four states, batch save on the audited PUT (T136–T140) → docs/history/state-log/2026-08-17.md
