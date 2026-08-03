# STATE.md — Sirius Build State

_Last updated: 2026-08-03 · Update at the end of every working session._

## Phase status

| # | Phase | Status | Gate |
|---|---|---|---|
| 0 | Setup & infrastructure | **done 2026-08-03** (T001–T006) | |
| 1 | Schema + migrations + seed | **done 2026-08-03** (T007–T010) | |
| 2 | Auth + audit | **done 2026-08-03** (T011–T016) | |
| 3 | Port lib/ + golden tests | **done 2026-08-03** (T017–T026) | AC-10: ✅ gate passed by JP 2026-08-03 |
| 4 | ARES read + mapping | **done 2026-08-03** (T027–T033; T034 end-to-end measure at staging) | NFR-3: ARES cycle observed 15 min ✓; e2e at staging |
| 5 | Intake sync | **done 2026-08-03** (T035–T039; AC-6 literal counts at staging) | |
| 6 | Model refresh + validation | not started | **PM sign-off: ⬜** |
| 7 | UI — five tabs | not started | |
| 8 | Urgency write | not started | Staging duplicate board confirmed: ⬜ |
| 8a | Conflict acknowledgements | not started | |
| 9 | Security testing + pilot | not started | |

## Decisions needed from JP (blocking)

| # | Decision | Blocks | Status |
|---|---|---|---|
| OD-1 | ARES interface: DB role / read API / replication | Phase 4 | ✅ **Resolved 2026-08-03: ARES read API** (`/api/v1/trello/*`, read-only key; contract in `specs/001-sirius-v1/contracts/ares-read.md`) |
| OD-8 | Hosting: Frost GCP or elsewhere | Infra work | ✅ **Resolved 2026-08-03: beside ARES, same pattern; shared Mongo server, own `sirius` db** |
| BRD §9 | Amend "write impossible by permission" to reflect the urgency write | Vendor assessment, v2 | ⬜ open |
| — | Create duplicate Trello board for staging | Phase 8 | ⬜ open |
| NFR-3 | Guide documents a 30-min ARES cache cycle; JP: new ARES is realtime, so < 15 min stands | Phase 4 exit verification | ⬜ verify end-to-end |

## Decisions needed later (not blocking yet)

| # | Decision | Blocks |
|---|---|---|
| OD-2 | Model window 6 or 12 months (schema defaults 12) | Phase 6 tuning |
| OD-4 | Acknowledgement expiry policy | Phase 8a |
| OD-5 | Is `Client Approval` ongoing or done | Phase 4 keyword rules |
| OD-6 | Which projects in v1 beyond GCash | Seed data |
| OD-7 | Retention for closed requests | Phase 9 |

## Acceptance criteria scoreboard

AC-1 ✅ · AC-2 ✅ · AC-3 ✅ · AC-4 ⬜ · AC-5 ✅ · AC-6 ⬜ · AC-7 ⬜ · AC-8 ✅ (fixture-scale; literal at staging) · AC-9 ✅ · AC-10 ✅ · AC-11 ⬜ · AC-12 ⬜ · AC-13 ⬜ · AC-14 ⬜ · AC-15 ⬜ · AC-16 ⬜ · AC-17 ⬜ · AC-18 ⬜ · AC-19 ⬜ · AC-20 ⬜

## Deviations proposed by the agent, awaiting JP

_None awaiting. Approved:_

- **2026-08-03 — Port source is the compiled bundle, not the JSX.** The original `frost-sirius-v1.jsx` is not available; the team supplied only the built prototype `docs/frost-sirius-v1.html` (single minified 272 KB script block, identifiers mangled). JP approved inferring `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` from the bundle. Consequence: Invariant 5's "verbatim port" becomes a faithful reconstruction, and the AC-10 golden tests are the sole proof of fidelity — they gate Phase 3 exactly as before. If the original `.jsx` surfaces, it supersedes the bundle.

## Session log

- 2026-08-03 — Phase 5 complete (T035–T039): intake parser (three §5.2 gotchas; reserved requires valid MC; duplicates reject first-wins), AC-6 counting proven on a 998-row synthetic (495/495/8), lib/sheets service-account reader (google-auth-library, REST v4, serial dates), syncIntake (mirror, inactive-not-deleted AC-9, rejects, deadline join to the whole MC group with coverage measurement AC-8, sync_runs incl. AC-7 403 path AC-19), requests route with join status + filters + sync freshness. Worker intake tick every 15 min. 106/106 tests green UTC + Manila. Live-sheet run needs GOOGLE_SHEETS_CREDENTIALS + sheet shared to the service account (flag: needed before staging).

- 2026-08-03 — Phase 4 complete (T027–T033; T034 partial): ARES client (envelope/pagination/429), taxonomy mapper (AC-5 passes as a test), stable display_id assignment, BR-10 rules (oracle parity), syncAres with ownership-safe upserts + idempotent card_events + capacity copy + sync_runs, 15-min worker loop with healthz gate. Live-shape discovery: movements carry NO event id (synthesized key: cardId|from|to|detectedAt); steering rowKey is bare '837'; referenceWeeks uses .total not .cards (adapter handles both); live typical week now 2026-W07/116 vs BRD snapshot W21/120 — the scheduled refresh supersedes the snapshot as designed. NFR-3: ARES live refresh cycle observed at 15 min (healthz last/next timestamps); Trello→Sirius end-to-end measurement deferred to staging. 95/95 tests green UTC + Manila.

- 2026-08-03 — GATE T026 PASSED by JP (AC-10): port fidelity accepted on the three-way evidence (verbatim oracle parity, BR-1 formula tests, workbook cross-validation 84/84). Phase 3 closed.

- 2026-08-03 — Workbook export processed: real Delivery Forecast sheet (3,243 rows, 2025, OLD cycle model per JP). Raw CSV gitignored (BRD §9); 40 sanitized formula-driven rows extracted to test/golden/workbook-rows.json (MC numbers only, no titles/briefs). WORKDAY core cross-validated: 84/84 formula-driven holiday-free rows reproduce the sheet's dates exactly; the 12 excluded rows land on Saturdays = hand-edited cells, impossible WORKDAY outputs. Old model's render rule differs from BR-1 (predates it) — noted for the T026 gate; BR-1 + prototype remain the current-model authority. JP decision: holiday TZ quirk KEPT AS-IS. 72/72 tests green in UTC + Manila. T017/T020 now complete.

- 2026-08-03 — Phase 3 built (T017–T025; T026 gate open): lib/calendar, model, forecast, planner ported verbatim from the bundle with a verbatim-extracted oracle (test/golden/original.mjs) and parity tests (~3,600-card forecast matrix; planner/quota/note-string parity). forecast.legacy reconstructed from BR-1 (bundle retired executable spreadsheet mode) with BR-3 seed grids — Workbook export received (docs/forecasting-block.csv, gitignored — client roadmap data). Quirks found & preserved (extraction-notes.md): toFriday Fri/Sat/Sun→next Monday; holiday matching TZ-dependent (validated dates computed WITHOUT holiday exclusion in Manila); renderApproved from sketchApproved; week keys shift east of UTC; COLUMN_MAP undefined in bundle sheet parser. 68/68 tests green in UTC + Manila.

- 2026-08-03 — Phase 2 complete (T011–T016): Passport Google SSO with the four checks in evaluateSignIn (tested incl. spoofed-hd case), per-request allow-list re-check (deactivation revokes live sessions), Redis sessions httpOnly, ensureProjectMember 403 on cross-project (AC-3), /api/projects membership-scoped (AC-4 basis), append-only audit writer. AC-1, AC-2, AC-3 pass as automated tests. 39/39 green in UTC + Manila. Note: Google OAuth client credentials still needed from JP before live sign-in works (tests inject sessions).

- 2026-08-03 — Phase 1 complete (T007–T010): 15 Mongoose collections 1:1 from §1.3, migration runner (001-indexes, 002-deliverables_v view) recorded in a migrations collection, fixture seed (two projects incl. shared-board label, MC-655 ×3 group, gap between sprints, intake CSV). 25/25 tests green in UTC and Asia/Manila on real mongod (memory server). ARES key from JP verified live (200; ARES Trello refresh cycle observed at 15 min — good for NFR-3). gh CLI installed but unauthenticated — repo secret ARES_API_KEY still pending JP login.

- 2026-08-03 — Phase 0 complete (T001–T006): Express 5 + Ractive scaffold per ARES conventions, docker-compose (mongo 8, redis 7), frontend build pipeline with Ractive parse-check, CI (typecheck · lint · vitest · dual-TZ · audit · build · ARES probe), deploy.sh (ARES pattern, host vars pending from JP), invariant-17 board guard with tests. 7/7 tests green in UTC and Asia/Manila; shell boots and serves healthz + built frontend; live ARES probe validates all 8 endpoints. Deviations: none applied; two judgment notes reported to JP (tsx runtime; dev-only infra-less boot).

- 2026-08-03 — Kit created. No code exists.
- 2026-08-03 — Step 4 complete: `specs/001-sirius-v1/tasks.md` generated — 76 tasks grouped by the phase ladder (0–9), every task requirement-ID-cited (verified programmatically), test-first pairs for `lib/` and BRs, gates T026 (AC-10) and T045 (PM dates) assigned JP-only, phase 4 unblocked, phase 8 BLOCKED on duplicate board. Day-count ~60–63 matches amended estimates; phase 7 is the biggest block (18 tasks).
- 2026-08-03 — Stack amendment by JP (constitution v2.0.0): MongoDB (shared ARES server, own `sirius` db) + Redis · Express 5 + Ractive frontend (ARES conventions) · Passport Google OAuth (four checks unchanged) · deployed beside ARES. OD-1 resolved (ARES read API, verified live incl. movements endpoint — all `stable`). OD-8 resolved. NFR-3 kept at < 15 min per JP (new ARES is realtime; verify at phase 4 exit). Phase 4 unblocked. Plan artifacts reworked (plan, research, data-model as collections + verbatim SQL authority appendix, contracts incl. new ares-read.md, quickstart). UI estimate 12 → 15–18 days (React prototype no longer ports as code); total ~60–63 days.
- 2026-08-03 — Step 3 complete: Implementation Plan converted to `specs/001-sirius-v1/` — plan.md (constitution check PASS, sequence + both gates intact, phase 4 BLOCKED-OD1), research.md (12 recorded decisions, OD-1 held open), data-model.md (§1.3 SQL byte-identical), contracts/ (http-api, worker, trello-write), quickstart.md. Verified programmatically.
- 2026-08-03 — Step 2 complete: BRD v2.2 converted to `specs/001-sirius-v1/spec.md`. Traceability verified programmatically: 62 FR, 14 BR, 11 NFR, 20 AC preserved with IDs; all measured constants exact; ODs marked [NEEDS CLARIFICATION], unresolved. Quality checklist at `specs/001-sirius-v1/checklists/requirements.md`.
- 2026-08-03 — CLAUDE.md amended by JP: added "Reply format — always" (communication protocol). Constitution regenerated verbatim → v1.1.0. Invariants untouched.
- 2026-08-03 — Step 1 complete: constitution ratified at `.specify/memory/constitution.md` v1.0.0 — CLAUDE.md adopted verbatim (byte-identical body, all 17 invariants verified programmatically), Governance section added (CLAUDE.md stays authoritative; amendments enter CLAUDE.md first; gates never self-certified).
- 2026-08-03 — Step 0 complete: installed `uv` + `specify-cli` 0.15.2 (official github/spec-kit); scaffolded Spec Kit with Claude integration (`.specify/`, `.claude/skills/speckit-*`); renamed docs to match CLAUDE.md references (`Sirius__BRD.md`, `Sirius__Implementation_Plan.md`, `frost-sirius-v1.html`); git repo initialised, first commit pushed to `jpdguzman-frost/sirius`. Deviation above approved by JP.
