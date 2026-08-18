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

## Decisions needed from JP (blocking)

| # | Decision | Blocks | Status |
|---|---|---|---|
| OD-1 | ARES interface: DB role / read API / replication | Phase 4 | ✅ **Resolved 2026-08-03: ARES read API** (`/api/v1/trello/*`, read-only key; contract in `specs/001-sirius-v1/contracts/ares-read.md`) |
| OD-8 | Hosting: Frost GCP or elsewhere | Infra work | ✅ **Resolved 2026-08-03: beside ARES, same pattern; shared Mongo server, own `sirius` db** |
| BRD §9 | Amend "write impossible by permission" — write surface is now the two-entry registry (urgency + due date) | Vendor assessment, v2 | ⬜ open (grew 2026-08-04) — product confirmed 2026-08-12 they'll raise it across all THREE docs quoting "one write": BRD §9, pilot security readiness, vendor assessment; not done yet |
| — | TEST board | Phase 8 | ✅ created: tx8gDsTH (structure-mirroring, 12 synthetic cards) |
| T085 | Hand `docs/ARES_PUSH_BUILD_SPEC.md` to the ARES build agent + provision `ARES_WEBHOOK_SECRET` on both hosts | T086 (e2e push verify) | ✅ done 2026-08-04 — ARES built it, push LIVE |
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
| errata Q | Deadlines count basis | ✅ **answered 2026-08-12** (`docs/sirus_errata-reply-v1.2.md`): §5.4 weight everywhere — built default is final; §6.1 was their doc error |
| — | Build spec **v1.2** + **AGENTS.md** | ✅ received 2026-08-12, verified, filed in docs/ (v1.2 renamed to `sirius-build-spec_v1.2.md`). All 6 errata corrections confirmed in the diff. AGENTS.md §2 already says two writes; its §7/§8/§9 are historical (OD-1/OD-8 shown open, "Postgres") — do not treat as current |

## Acceptance criteria scoreboard

AC-1 ✅ · AC-2 ✅ · AC-3 ✅ · AC-4 ⬜ · AC-5 ✅ · AC-6 ⬜ · AC-7 ⬜ · AC-8 ✅ (fixture-scale; literal at staging) · AC-9 ✅ · AC-10 ✅ · AC-11 ✅ (data side; UI at phase 7) · AC-12 ✅ · AC-13 ✅ (API+UI) · AC-14 ✅ (API) · AC-15 ✅ · AC-16 ✅ · AC-17 ✅ · AC-18 ✅ · AC-19 ⬜ · AC-20 ⬜ · AC-21 ✅ · AC-22 ✅ · AC-23 ✅ · AC-24 ✅ (added 2026-08-12, phase 12)

## Deviations proposed by the agent, awaiting JP

_None awaiting. Approved:_

- **2026-08-03 — Port source is the compiled bundle, not the JSX.** The original `frost-sirius-v1.jsx` is not available; the team supplied only the built prototype `docs/frost-sirius-v1.html` (single minified 272 KB script block, identifiers mangled). JP approved inferring `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` from the bundle. Consequence: Invariant 5's "verbatim port" becomes a faithful reconstruction, and the AC-10 golden tests are the sole proof of fidelity — they gate Phase 3 exactly as before. If the original `.jsx` surfaces, it supersedes the bundle.

## Session log

**Convention (2026-08-18):** STATE.md carries only the NEWEST session entry in full. When a session adds a new entry, the previous one MOVES (never copies) to docs/state-log/YYYY-MM-DD.md and gains an index line below. Keep new entries as complete as ever — length is fine; the archive is the home for history.

- 2026-08-18 — **CONTEXT RESTRUCTURE stages 1–3 — DONE + COMMITTED (`0d5e3cb` · `e8d14db` · `cdc31bb`)** (JP-approved staged plan + gates in `docs/CONTEXT_RESTRUCTURE.md`; owl record jp→miles #28/#29/#31 + closing note; workflows wf_63080de1 / wf_5cd98be4 / wf_0f3b8602, 13 agents, every stage independently verified before its gate). **Docs-only: no code, no build-output change, no deploy; write registry untouched at W1 / W2 / W3.** Motive: agent navigation and token burn — session-start anchors cost ~34k tokens and STATE.md alone (123KB, ~49k tokens) exceeded a single tool read. **Stage 1**: the session log rotated to `docs/state-log/YYYY-MM-DD.md` — 60 entries, 59 archived byte-verbatim (sha256-multiset conservation proven three times: builder abort-on-mismatch, independent verifier rebuild, gate re-run), STATE.md 123,191 → 22,123 bytes, rotation convention written into the section header; the concurrent batch-10 session followed it unprompted, and JP confirmed the restructure to that session (`03da2dd`). **Stage 2**: `specs/001-sirius-v1/gantt-rules.md` = ONE home for current planner law, 56 numbered source-tagged rules; the completeness verifier traced all 56 to sources (zero of the old sections' 39 normative statements lost, zero invented); the drift verifier FAILED its first pass on a real duplicate — HANDOFF's sprints-modal paragraph still stated rules 31/34 — fixed at the gate, plus two source-verified additions (rule 13's pinned-row-in-multi-select carve-out per `rowKey` in `01-app.js`; rule 39's sprint-block collapse made explicit). HANDOFF's two planner sections → pointer stubs (25.2 → 20.3KB, imperative force kept); `gantt-frame-notes.md` banner declares it the batch-history archive with gantt-rules winning on disagreement; four stale "in STATE.md" pointers repointed at `docs/state-log/`. **Stage 3**: `docs/MAP.md` (one line per source file, every line from an opened file; test-guard index), `frontend/CLAUDE.md` + `test/CLAUDE.md` (directory-scoped law that auto-loads only for agents working under those directories; every claim traced), `docs/README.md` (authority index — governing vs historical, AGENTS.md §2 wording corrected against the three-entry registry; where-law-lives table closes the R-warn-* pointer gap). The accuracy verifier checked 28 MAP lines against the real files with zero omissions; the trace/drift verifier confirmed law is pointed at, never restated; six nits fixed at the gate (model name, 401 wording, suite count, golden-suite location, a circular citation retagged, the index now lists itself and MAP). **Graphify assessed and SKIPPED** — code-graph MCPs pay off at hundreds of source files; Sirius is 12.3k source lines and the weight was prose; revisit at 50–100k lines or sustained cross-repo ARES work. **Stage 4 PARKED for JP's explicit go**: split `01-app.js` (2,942 lines) into numbered concat files behind a `test/helpers/source.ts` migration of the source-regex guards; gate = built JS byte-identical modulo build banners + tsc/eslint/vitest dual-TZ. Net effect: session-start anchor cost ~34k → ~10k tokens; planner law readable in one 16KB file instead of a 172KB history; code discovery via an 8KB map instead of exploration.

### Older sessions — index

- 2026-08-18 — Batch 10: Pipeline warning becomes icon + hover card, amber wash removed; four lens-caught defects (T163–T166, R-warn-u/v/w) → docs/state-log/2026-08-18.md
- 2026-08-18 — Review sweep over batches 5–9: five defects, three hot paths, six duplicated rules collapsed (T162) → docs/state-log/2026-08-18.md
- 2026-08-18 — Batch 9 built: drag ghost shows only the coloured bars (T160; live pass owed as T161) → docs/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 built: drag handle becomes the coloured run (T158–T159); numbering note vs T157 → docs/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 ruling built: the drag affordance is the coloured bars only (T157, closes T155h) → docs/state-log/2026-08-18.md
- 2026-08-18 — Batch 7 built: Gantt fixes from JP's live-site report (T153–T155, ruling R-g-1) → docs/state-log/2026-08-18.md
- 2026-08-17 — Batch 6 built: Requestor cell no longer cuts long values mid-character (T150–T152) → docs/state-log/2026-08-17.md
- 2026-08-17 — Batch 5b built: two sprint-modal behaviour rulings R-f-10/R-f-11 (T146–T148); arrival pulse kept → docs/state-log/2026-08-17.md
- 2026-08-17 — Batch 5 built: Requests STATUS reduced to two values, In Pipeline / For Filing (T141–T144) → docs/state-log/2026-08-17.md
- 2026-08-17 — Batch 4 deployed live: sprints modal with four states, batch save on the audited PUT (T136–T140) → docs/state-log/2026-08-17.md
- 2026-08-17 — Invariant 13 amended v4.3.0: capacity joins the conflict-ack key; pins stay fully frozen → docs/state-log/2026-08-17.md
- 2026-08-17 — Batch 3 deployed live: capacity lock plus four more features (T130–T133, rulings R-a to R-e) → docs/state-log/2026-08-17.md
- 2026-08-15 — URL routing for main tabs deployed: /sirius/<project-code>/<tab> scheme (T127–T129) → docs/state-log/2026-08-15.md
- 2026-08-15 — Calendar amendment v4.2.0 deployed: TZ-safe week keys and holidays, ARES calendar canonical → docs/state-log/2026-08-15.md
- 2026-08-15 — Deliverables table + phase-segmented Gantt planner built and deployed (owl #22) → docs/state-log/2026-08-15.md
- 2026-08-14 — Planner toolbar, capacity slider with the first weekly-capacity write, sync strip deployed (T123–T124) → docs/state-log/2026-08-14.md
- 2026-08-14 — Review+simplify over 13d+13e: 5 bugs fixed incl. the inert Year/Month seed, 17 cleanups, deployed → docs/state-log/2026-08-14.md
- 2026-08-14 — Requests sorting + filed Year/Month columns deployed (T121–T122); header sort on most columns → docs/state-log/2026-08-14.md
- 2026-08-14 — Corrected status model (Trello presence) + Frost remarks restyle deployed (T119–T120) → docs/state-log/2026-08-14.md
- 2026-08-14 — Review+simplify over 13c: 5 bugs fixed incl. a cross-project draft leak, 10 cleanups, deployed → docs/state-log/2026-08-14.md
- 2026-08-14 — Requests tab v2 built and deployed from product owls #11–#12 (T116–T118) → docs/state-log/2026-08-14.md
- 2026-08-14 — Review+simplify over batch-2 deployed: 7 bugs fixed, 21 cleanups; push-drain ingests movement history → docs/state-log/2026-08-14.md
- 2026-08-14 — Review+simplify applied to the batch-2 diff: the push path can now move a span, not only clear one → docs/state-log/2026-08-14.md
- 2026-08-13 — Hotfix: live 500 on rt-test pipeline GET from a sparse model grid; fixed and deployed within the hour → docs/state-log/2026-08-13.md
- 2026-08-13 — Batch-2 pipeline cells deployed: due popover, start/done cells, links cell, MC# fix (T113–T115) → docs/state-log/2026-08-13.md
- 2026-08-12 — W3 difficulty writeback approved and built (T111–T112); owl MCP registered → docs/state-log/2026-08-12.md
- 2026-08-12 — G7 passed: real board live in observation mode; writes_enabled safety rail shipped first → docs/state-log/2026-08-12.md
- 2026-08-12 — Phase 13 deployed live after /simplify and /code-review gates; 15 findings applied → docs/state-log/2026-08-12.md
- 2026-08-12 — Phase 13 built: Pipeline redesigned to the Figma frame (T100–T110); awaiting JP go → docs/state-log/2026-08-12.md
- 2026-08-12 — Phase 12 deployed live for team testing; migration applied on host, live checks green → docs/state-log/2026-08-12.md
- 2026-08-12 — Errata reply received: all 6 corrections accepted; weight basis stands; no flicker risk → docs/state-log/2026-08-12.md
- 2026-08-12 — Phase 12 built same day (T092–T099): frost notes, day plan, weighted load; 214 tests dual-TZ → docs/state-log/2026-08-12.md
- 2026-08-12 — Build spec v1.1 processed and diffed against the live system; W2 stands, errata sent → docs/state-log/2026-08-12.md
- 2026-08-04 — Go-live session: G3–G6 executed, first deploy, SSO live; port 3955; TEST board registered → docs/state-log/2026-08-04.md
- 2026-08-04 — Phase 10 Sirius side built (T077–T084): reconcile reads urgency and due back; W2 due-date writes → docs/state-log/2026-08-04.md
- 2026-08-04 — Two-way sync decided and specced (phase 10): write registry v4.0.0, freshness via ARES push → docs/state-log/2026-08-04.md
- 2026-08-04 — Pre-staging batch: perf pass done at 5,000 cards, authz matrix test, deploy runbook for JP → docs/state-log/2026-08-04.md
- 2026-08-04 — TEST board created and the live urgency round-trip verified; phases 8 and 8a done → docs/state-log/2026-08-04.md
- 2026-08-04 — Invariant 17 amended v3.0.0: mirrored TEST board; phase 8 built with rollback urgency writes → docs/state-log/2026-08-04.md
- 2026-08-03 — UI aligned to the prototype design: Poppins, tabs, gantt, forecast panel; verified on 837 data → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 7 built (T046–T062): pipeline assembler, schedule writes, conflicts, five Ractive tabs → docs/state-log/2026-08-03.md
- 2026-08-03 — JP decision: urgency writes go direct to Trello with a dedicated account; phase 7 go → docs/state-log/2026-08-03.md
- 2026-08-03 — Release gate T045 passed: empirical model dates recognised as reality; forecast UI unlocked → docs/state-log/2026-08-03.md
- 2026-08-03 — T044 evidence regenerated for project 837: 257 samples across six months of movements → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 6 built (T040–T044): model refresh derivation, nightly job, grid loader; gate T045 open → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 5 complete (T035–T039): intake parser, sheets reader, syncIntake with deadline join → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 4 complete (T027–T033): ARES client, mapper, BR-10 rules, syncAres, 15-min worker loop → docs/state-log/2026-08-03.md
- 2026-08-03 — Gate T026 passed by JP: port fidelity accepted on three-way evidence; phase 3 closed → docs/state-log/2026-08-03.md
- 2026-08-03 — Workbook export processed: 84/84 formula-driven rows reproduce the sheet's dates exactly → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 3 built (T017–T025): calendar, model, forecast, planner ported verbatim with oracle parity → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 2 complete (T011–T016): Google SSO four checks, allow-list re-check, audit writer → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 1 complete (T007–T010): 15 collections, migration runner, fixture seed; ARES key verified → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 0 complete (T001–T006): scaffold, CI, deploy script, board guard; dual-TZ green → docs/state-log/2026-08-03.md
- 2026-08-03 — Kit created; no code exists yet → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 4 complete: tasks.md generated — 76 tasks on the phase ladder, gates assigned JP-only → docs/state-log/2026-08-03.md
- 2026-08-03 — Stack amendment by JP (v2.0.0): Mongo + Redis + Express 5 + Ractive beside ARES; OD-1/OD-8 resolved → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 3 complete: Implementation Plan converted to specs/001-sirius-v1 with contracts → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 2 complete: BRD v2.2 converted to spec.md; traceability verified programmatically → docs/state-log/2026-08-03.md
- 2026-08-03 — CLAUDE.md amended by JP: reply format added; constitution regenerated v1.1.0 → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 1 complete: constitution ratified v1.0.0, CLAUDE.md adopted verbatim → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 0 complete: Spec Kit installed and scaffolded; repo initialised, first commit pushed → docs/state-log/2026-08-03.md
