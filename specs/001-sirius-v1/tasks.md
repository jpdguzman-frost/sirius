# Tasks: Sirius v1 — Delivery Pipeline & Forecasting Platform

**Input**: [plan.md](./plan.md) (sequence, gates, estimates) · [spec.md](./spec.md) (FR/BR/NFR/AC) · [data-model.md](./data-model.md) · [contracts/](./contracts/) · constitution v2.0.0

**Organization**: Grouped by the plan's build sequence (phases 0–9), NOT by user story — the phase ladder is load-bearing (gates, dependencies). Story labels map tasks to spec user stories: US1 Pipeline · US2 Scheduling · US3 Deadlines · US4 Forecast · US5 Requests · US6 Urgency · US7 Multi-project. Every task cites the requirement it satisfies; a task with no ID would be scope creep. `lib/` and business-rule tasks are test-first: the test task precedes the implementation task. Tasks are sized 0.5–1 day; sanity bound ~60–63 dev-days.

**Gates** (JP only — the agent can NEVER check these off): T026 (AC-10, end of phase 3) and T045 (model validation, end of phase 6). Phase 7 must not start before T045 passes. Phase 8 is BLOCKED until the staging duplicate Trello board is confirmed.

---

## Phase 0 — Setup & infrastructure (~4d)

- [x] T001 Scaffold repository per plan.md layout — `server.js`, `src/{auth,routes,models,services}/`, `lib/`, `worker/`, `frontend/{templates,scripts,styles}/`, `scripts/migrate/`, `test/`; package.json with Express 5, Mongoose, ioredis, connect-redis, passport, passport-google-oauth20, zod, ractive, vitest; TypeScript `strict` config covering server/worker/lib (constitution stack; NFR-6 groundwork)
- [x] T002 [P] docker-compose.yml (mongo, redis) + `.env.example` with every variable from quickstart.md, values empty (invariant 15, NFR-5)
- [x] T003 [P] `frontend/build.js` concatenation pipeline with Ractive template parse-check, ARES conventions (NFR-1; plan.md frontend structure)
- [x] T004 CI workflow: typecheck · lint · `vitest run` · dual-TZ run (`TZ=UTC` + `TZ=Asia/Manila`) · dependency audit · frontend build (invariant 11, NFR-10; plan.md pipeline)
- [x] T005 [P] ARES contract probe in CI — verify documented shapes in `contracts/ares-read.md` against `openapi.yaml`, fail build on drift (FR-8.1)
- [x] T006 Deploy scripts targeting the ARES host pattern, staging + production configs; staging env asserts duplicate-board IDs only (invariant 17; NFR-4; OD-8 resolution)

**Checkpoint**: `npm run dev` boots an empty shell; CI green on an empty test suite.

---

## Phase 1 — Schema, migrations, seed (~3d)

- [x] T007 Tests for schema rules in `test/models.test.ts`: `(project_id, trello_card_id)` unique while `mc_number` duplicates freely (99-deliverable MC-825 case); `deliverables_v` precedence trello_due → sheet_deadline → none; sprint `ends_on ≥ starts_on`; every collection requires `project_id` (invariants 1, 3, 14; BR-9; FR-1.4)
- [x] T008 Mongoose models for all 15 collections in `src/models/`, fields/defaults/validators exactly per data-model.md ownership groups (FR-1.1, FR-1.4; invariants 1, 3, 4)
- [x] T009 Migration runner + `scripts/migrate/001-indexes.js` (unique compounds, secondary indexes) + `scripts/migrate/002-deliverables-view.js` (`deliverables_v` MongoDB view implementing BR-9) — version-controlled, never hand-applied (invariant 14; constitution)
- [x] T010 `scripts/seed.js` + fixtures: two projects (one sharing a Trello board via `trello_label`), deliverables incl. a multi-deliverable MC group, work cards, sprints, CSV intake fixture — fixtures only, never production data (invariant 16; enables AC-4, AC-5, AC-6 tests)

**Checkpoint**: T007 green; seeded db passes scope queries.

---

## Phase 2 — Auth, allow-list, audit (~4d)

- [x] T011 Authz matrix tests in `test/auth.test.ts`: non-Frost denied with reason (AC-1); Frost off allow-list denied (AC-2); unverified email denied; cross-project API call → 403 (AC-3) (FR-2.1–2.4)
- [x] T012 Passport Google strategy in `src/auth/` — the four server-side checks: email_verified, `hd` = ALLOWED_HD, matching email domain, active `users` document (FR-2.1–2.4; invariant 9)
- [x] T013 Redis session store (connect-redis) + httpOnly cookie in `server.js`; `ensureAuthenticated` middleware in `src/auth/session.js`, applied to every route (FR-2.3; NFR-6)
- [x] T014 `ensureProjectMember` middleware in `src/auth/membership.js` — session AND `user_projects` membership re-checked per project-scoped route (FR-1.2, AC-3, AC-4; invariant 9)
- [x] T015 [P] Append-only audit writer in `src/services/audit.js` (insert-only surface) + tests proving no update/delete path and before/after capture (FR-2.6; invariant 10; NFR-7)
- [x] T016 [P] [US7] Project switcher scoping in `src/routes/` handlers: project context resolution + every query filtered by `project_id` (FR-1.2, FR-1.4, AC-4)

**Checkpoint**: authz matrix green against a running server.

---

## Phase 3 — Port `lib/` + golden tests (~4d)

- [x] T017 Golden fixture set in `test/golden/` — bundle oracle + 40 sanitized workbook rows from JP's export — inputs + expected dates extracted from the Delivery Forecast workbook rows (AC-10 basis; BR-1)
- [x] T018 Tests for `lib/calendar.ts` in `test/calendar.test.ts`: `workday()`, `toFriday()`, holidays, Manila timezone, dual-TZ identical results (invariant 11; BR-1)
- [x] T019 Port `lib/calendar.ts` verbatim from the prototype bundle (invariant 5; STATE.md deviation)
- [x] T020 Golden tests for `lib/forecast.legacy.ts` — BR-1 mechanics + workbook WORKDAY cross-validation (old-model export; render rule superseded by BR-1, noted for gate) in `test/forecast.legacy.test.ts`: identical dates to the workbook for identical inputs across the full golden set — `WORKDAY` arithmetic, Friday render start, `1.28 × review + 2.96` (AC-10; BR-1)
- [x] T021 Port `lib/forecast.legacy.ts` verbatim — tests only, never imported by UI code (invariant 6; FR-7.2)
- [x] T022 Tests for `lib/planner.ts` in `test/planner.test.ts`: urgency → deadline → difficulty ordering, throughput ceiling fill, blocked-card exclusion, pinned immovable, WEIGHTS (1/2/4) only for hard-mix, unachievable-mix spread-and-report, multi-row relative shift (BR-6b, BR-7, BR-7a, BR-8; AC-16)
- [x] T023 Port `lib/planner.ts` (`suggestPlan`, `weekLoad`, WEIGHTS, HARD_MIX) verbatim (invariant 5)
- [x] T024 Tests for `lib/forecast.ts` (empirical) in `test/forecast.test.ts`: difficulty × lane grid lookup, confidence selection (Average/0.7/0.85/0.95), SLA override replaces modelled review and cascades (BR-2, BR-4; FR-7.3–7.5; AC-12 logic)
- [x] T025 Port `lib/forecast.ts` + `lib/model.ts` grid lookup verbatim (invariant 5; FR-7.3)
- [x] T026 **GATE — PASSED by JP 2026-08-03** (evidence accepted: oracle parity ~3,600 cases, BR-1 mechanics, workbook rows 84/84): AC-10 confirmed — golden tests prove the port; phase gate for everything that consumes `lib/` (AC-10)

**Checkpoint**: `lib/` fully green incl. golden set; JP sign-off recorded in STATE.md.

---

## Phase 4 — ARES read + mapping (~6d) — UNBLOCKED (OD-1 resolved 2026-08-03)

- [x] T027 ARES client in `src/services/ares.js` per contracts/ares-read.md — envelope unwrap by surface, `X-API-Key` header, 60 req/min pacing + `retryAfter` honor, pagination; recorded-fixture tests (FR-8.1)
- [x] T028 [P] Taxonomy mapper tests in `test/mapper.test.ts`: `Main Card` label → deliverable, verb-prefix titles → work cards attached to MC group (never a deliverable edge), `trello_label` board filtering, MC number extraction from titles, `display_id` assignment (`MC-655.3`) (invariants 3, 4; FR-1.3; AC-5; spec §Card taxonomy)
- [x] T029 [US1] `worker/syncAres.ts`: boards → cards sync, upsert on `(project_id, trello_card_id)`, blockers from 🛑 labels, `card_events` append idempotent on `source_event_id`; `sync_runs` written success or failure, last good data preserved (FR-4.1, FR-4.5, FR-8.5; AC-19)
- [x] T030 [P] [US4] Steering adapter: `referenceWeeks` + `effectiveWeeklyRate` via internal-tier endpoint behind `src/services/` adapter, copied into `projects` each run (BR-6a; FR-5.16)
- [x] T031 [P] [US1] BR-10 status classification in `src/services/status-rules.js`: configurable keyword rules mapping free-text list names → Pending/Ongoing/Done, tests in `test/status-rules.test.ts` (BR-10; OD-5 default documented as open)
- [x] T032 [US1] Movements backfill for the model window + cycle-time derivation from activity timestamps, cross-checked against `/api/v1/trello/cycle-time` (FR-4.5; BR-2 raw material)
- [x] T033 Worker scheduler loop in `worker/index.js` — 15-min cadences, health job with ARES `/healthz` freshness gate, alerting on failure (FR-8.5, FR-8.6; NFR-3)
- [ ] T034 ⚠ PARTIAL (ARES-side 15-min live cycle observed + healthz gate wired; Trello→Sirius end-to-end measurement needs staging) — NFR-3 freshness evidence in `STATE.md`: Trello change → Sirius visible, evidence recorded for JP (< 15 min per JP's realtime statement; STATE.md exit check)

**Checkpoint**: real board syncs into fixtures-shaped collections; re-running sync is idempotent.

---

## Phase 5 — Intake sheet sync (~4d)

- [x] T035 Parser tests in `test/intake.test.ts`: ragged-row padding, 1899-12-30 serial-date conversion, two `Type` columns disambiguated by position, current-data fixture yields **495 imported / 495 reserved / 8 rejected** (AC-6; §5.2 gotchas)
- [x] T036 [US5] `lib/sheets.ts` service-account read, `spreadsheets.readonly`, credential from server-side env only (FR-8.2, FR-8.3; invariant 15)
- [x] T037 [US5] `worker/syncIntake.ts`: mirror rows, skip pre-allocated MC rows silently + count, unparseable rows → `intake_rejects` with row/reason, vanished rows → inactive never deleted (FR-3.1, FR-3.4, FR-3.5, FR-8.4; AC-9)
- [x] T038 [US1] Deadline join tests in `test/intake.test.ts` then implementation in `worker/syncIntake.ts`: sheet deadline joined on `mc_number`, `deliverables_v` precedence live, coverage measurably rises ~1/269 → ~169/269 on fixture (BR-9; AC-8)
- [x] T039 [P] [US5] Sync status surfacing in `src/routes/requests.js`: last-success time + failure state from `sync_runs`, queryable for the UI (FR-8.6; AC-19)

**Checkpoint**: AC-6 counts exact on fixture; AC-8 join measured; AC-9 verified.

---

## Phase 6 — Model refresh + validation (~4d) — RELEASE GATE at end

- [x] T040 Percentile math tests in `test/model.test.ts` with fixture `card_events`: design dwell by difficulty × lane, review dwell in *Sent for Client Review*, Average/70/85/95, sample_n recorded; spot-check against Appendix constants (BR-2, BR-4; FR-7.6)
- [x] T041 [US4] `worker/refreshModel.ts`: nightly per project over `model_window_months` (default 12, OD-2 open) → `model_grid` + `throughput_grid` in worker code (BR-2; FR-7.6)
- [x] T042 [P] [US4] Delta recording vs previous run + alert on sharp shift, in `worker/refreshModel.ts` (§5.4 step 5; FR-8.5)
- [x] T043 [US4] Model provenance + sample sizes exposed for the UI via `src/routes/deliverables.js` (grid read) (FR-7.7; AC-11)
- [x] T044 [US4] Run refresh against real ARES data; produce the grid + a dates sample for PM review, sample saved under `specs/001-sirius-v1/` evidence (BR-3; gate preparation)
- [x] T045 **GATE — PASSED by JP + PM 2026-08-03** (evidence: per-project grid from 6 months / 257 samples, values tracking the Appendix shape): forecast dates recognised. **No forecast UI ships before this passes** (invariant 7; BR-3; Sequence item 6)

**Checkpoint**: recomputed grid within expected range of Appendix snapshot; PM sign-off recorded in STATE.md.

---

## Phase 7 — UI, five tabs (~15–18d) — do NOT start before T045

- [x] T046 Frontend shell: `frontend/index.html` + `frontend/scripts/app.js` Ractive instance, tab nav, project switcher wired to scoped APIs (FR-1.2; AC-4)
- [x] T047 [P] [US5] Requests tab in `frontend/templates/requests.html` + `frontend/scripts/requests.js`: mirror columns, source-row link, *In pipeline*/*Not yet filed* status, filed/unfiled/missing-deadline filters (FR-3.2, FR-3.3, FR-3.6)
- [x] T048 [US1] Pipeline tab in `frontend/templates/pipeline.html` + `frontend/scripts/pipeline.js`: deliverable list with FR-4.1 fields, read-only Trello fields, expandable MC group work cards (FR-4.1–4.3; AC-4)
- [x] T049 [P] [US1] Corrections list in `frontend/templates/pipeline.html`: cards missing difficulty/deadline/Figma link, with links to fix at source (FR-4.4)
- [x] T050 [US2] Schedules layout in `frontend/templates/schedules.html` + `frontend/scripts/schedules.js`: fixed list pane + scrolling gantt grouped by sprint, three segments (sketch/review/render) + deadline marker, late row red render bar (FR-5.1–5.3; AC-18 visual)
- [x] T051 [US2] Drag slotting in `frontend/scripts/schedules.js` with < 100 ms feedback; gantt is output only; dates/sprint group/load update on drop (FR-5.4; AC-13; NFR-2)
- [x] T052 [US2] Multi-select (checkbox, shift-range, whole sprint) + relative-shift drag via `lib/planner`, in `frontend/scripts/schedules.js` (FR-5.5, FR-5.6; BR-8; AC-14)
- [x] T053 [P] [US2] Pin, duplicate-without-links, manual status override with note in `frontend/scripts/schedules.js` + `src/routes/schedule.js` — visibly manual, reversible, audited (FR-5.9, FR-5.11, FR-5.12; invariant 10)
- [x] T054 [US2] Suggest plan in `frontend/scripts/schedules.js`: ghost previews, explicit accept, pinned rows never move, unachievable mix stated plainly; throughput setting conservative/typical/stretch (FR-5.7, FR-5.8, FR-5.10; BR-7, BR-7a; AC-15, AC-16)
- [x] T055 [US2] Sprint editor in `frontend/scripts/sprints.js` + `src/routes/schedule.js`: add/rename/re-date/reorder/delete, overlap rejected on save, gaps surfaced as *Outside any sprint* (FR-5.14, FR-5.15; BR-5)
- [x] T056 [P] [US2] Weekly footer in `frontend/templates/schedules.html`: cards vs capacity, weighted load, Hard share amber/red per BR-6b thresholds (FR-5.13, FR-5.16, FR-5.17; BR-6a, BR-6b)
- [x] T057 [US3] Deadlines tab in `frontend/templates/deadlines.html` + `frontend/scripts/deadlines.js`: month weeks navigable, two entries per deliverable (sketch + render), Trello/Figma links, read-only (FR-6.1–6.3, FR-6.6)
- [x] T058 [US3] Conflict detection display per BR-6 in `frontend/templates/deadlines.html` + `frontend/scripts/deadlines.js`: urgent overlap, over capacity, past deadline — on-screen explanation + replot list naming every affected deliverable and why (FR-6.4, FR-6.5; AC-17, AC-18)
- [x] T059 [US4] Forecast tab in `frontend/templates/forecast.html` + `frontend/scripts/forecast.js`: Delivery Forecast column names, single empirical forecast, difficulty read-only, confidence per card, provenance + sample sizes visible (FR-7.1–7.4, FR-7.7; AC-11; invariant 6 — legacy never imported)
- [x] T060 [US4] Review SLA override input in `frontend/scripts/forecast.js` + `src/routes/schedule.js` → replaces modelled review, cascades downstream, audited (FR-7.5; AC-12)
- [x] T061 Keyboard-only scheduling path in `frontend/scripts/schedules.js` — a row slottable without a pointer (NFR-9; AC-20)
- [x] T062 [P] Sync status indicator + degraded mode in `frontend/scripts/app.js`: last good data shown, error surfaced, app usable (FR-8.6; AC-19)
- [x] T063 Performance pass at 5,000 fixture cards — pipeline 107ms / deadlines 85ms server-side (test/perf.test.ts) in `server.js` + `frontend/scripts/pipeline.js`/`schedules.js`: server-rendered shell + list virtualization as needed, p95 < 2 s (NFR-1)

**Checkpoint**: five tabs demonstrable end-to-end on staging data; AC-13–AC-18, AC-20 pass.

---

## Phase 8 — Urgency write (~2d) — built; live round-trip pending the TEST board (invariant 17 as amended)

- [x] T064 [US6] Tests first in `test/urgency.test.ts`: optimistic update rolls back on failed write; `audit_log` + `sync_runs` documents on success AND failure; absence-means-non-urgent round-trip (FR-4.6, FR-4.7; invariant 8)
- [x] T065 [US6] `lib/trello.ts`: `setUrgency()` + `ensureUrgentLabel()` — direct Trello API, dedicated integration-account token from server env, board-ID safety check refusing production boards outside production (FR-4.6; invariants 2, 15, 17)
- [x] T066 [US6] `src/routes/urgency.js` + Pipeline toggle UI: optimistic with rollback, audited, urgency visible in list (FR-4.6, FR-4.7; invariant 10)

**Checkpoint**: on the duplicate board only — label round-trip, forced-failure rollback, audit trail complete.

---

## Phase 8a — Conflict acknowledgements (~1d)

- [x] T067 [US3] Key computation tests then implementation: `conflict_key` = week | rule | sorted card:phase pairs; any card change lapses the ack; card-level indicators never suppressed (invariant 13; BR-9a; FR-6.7)
- [x] T068 [US3] Ack endpoints + Deadlines UI in `src/routes/schedule.js` + `frontend/scripts/deadlines.js`: dismiss removes from banner + replot list, acknowledged count + restore, every ack/restore audited (FR-6.7, FR-6.8; invariant 10; AC-17 interplay)

**Checkpoint**: ack lapses on replot; audit trail shows who/when/why.

---

## Phase 9 — Security testing + pilot (~13d incl. migration/pilot support)

- [ ] T069 ⚠ LOCAL HALF DONE (13 routes, 401/403, test/authz-matrix.test.ts) — staging smoke authz matrix: non-Frost + off-list + cross-project against every endpoint → denied/403 (AC-1, AC-2, AC-3; NFR-6)
- [ ] T070 [P] Sheet un-share drill: service account removed → clean failure surfaced, re-share restores (AC-7)
- [ ] T071 ⚠ STATIC HALF DONE (test/log-hygiene.test.ts) — [P] Log hygiene audit: no brief text, no credentials in any log path (NFR-11; invariant 15)
- [x] T072 [P] Backup + restore drill on the shared Mongo server (`sirius` db), documented (NFR-8)
- [ ] T073 ⏸ ON HOLD (JP 2026-08-04: team UI update in flight — audit after it lands) — Accessibility audit: WCAG 2.1 AA incl. the keyboard scheduling path (NFR-9; AC-20)
- [x] T074 `scripts/migrate-open-cards.ts`: migrate open cards/requests into production data per deadline-precedence and taxonomy rules (AC-8; BR-9; plan.md layout)
- [ ] T075 Full AC sweep on staging: AC-1..AC-20 recorded in STATE.md scoreboard with evidence links (Definition of done)
- [ ] T076 Pilot support window: triage, fixes, STATE.md session logs; retention decision recorded when OD-7 lands (NFR-7; OD-7)

**Checkpoint**: AC scoreboard complete; pilot go/no-go per *Pilot Security Readiness*.

---

## Phase 10 — Two-way sync (~5–6d Sirius-side) — added 2026-08-04 (JP; constitution v4.0.0, FR-9)

Ships **before** the pilot per JP's sequencing decision — the pre-pilot security review widens
to cover the due-date write and the webhook receiver. The ARES half is built separately from
`docs/ARES_PUSH_BUILD_SPEC.md`; only T086 depends on it.

- [x] T077 [P] Reconcile tests FIRST: sync reads the `Urgent` label + due date from ARES card data into Sirius fields; ownership matrix proven safe (Sirius planning fields untouched); echo of a Sirius-originated write is a no-op with no audit row (FR-9.5; invariant 8)
- [x] T078 Reconcile implementation in `worker/syncAres.ts` + `src/services/mapper.ts` (FR-9.5)
- [x] T079 [P] W2 write tests FIRST: `setDue` add/change/clear, existing time-of-day preserved, 17:00 Manila default, rollback on Trello failure, audit `due_set`, board guard, no-op guard (FR-9.1; FR-9.3; invariants 14, 17)
- [x] T080 `lib/trello.ts` `setDue()` + deadline write route in `src/routes/` per `contracts/trello-write.md` W2 (FR-9.1; BR-9 preserved)
- [x] T081 Deadline edit in the Pipeline UI with optimistic revert, matching the urgency toggle pattern (FR-9.1; FR-4.7)
- [x] T082 [P] Receiver tests FIRST: HMAC over `timestamp.body`, ±5 min window, constant-time compare, `event_id` dedupe, 202-fast with `{accepted, duplicates, ignored}`, unknown-board drop, 401 leaks nothing, no sync work in-request; `ARES_WEBHOOK_SECRET` added to the log-hygiene forbidden list (FR-9.4; NFR-6; NFR-11)
- [x] T083 `POST /api/webhooks/ares` receiver + `push_events` collection (unique `event_id`, TTL 7d) + worker drain with per-card coalescing → targeted `GET /api/v1/trello/cards/{id}` reconcile per `contracts/ares-push.md` (FR-9.4; FR-9.5)
- [x] T084 Poll fallback adaptation: hourly reconcile while push healthy, revert to 15-min + alerting `sync_runs` row after 30 min push silence with ARES healthy; push freshness surfaced in the sync status UI (FR-9.6; FR-8.5; FR-8.6)
- [ ] T085 **JP**: hand `docs/ARES_PUSH_BUILD_SPEC.md` to the ARES build agent; provision `ARES_WEBHOOK_SECRET` on both hosts; confirm subscriber config points staging at the TEST board first
- [x] T086 End-to-end on staging once ARES push is live: manual Trello change (incl. a hand-removed `Urgent` label and a hand-set due date) reflected in Sirius in < 1 min; fallback drill — push disabled → 15-min poll takes over with the alert (NFR-3 as amended; FR-9.5; FR-9.6)

**Checkpoint**: registry writes + reconcile proven on the TEST board; pilot go/no-go (T076) now includes phase 10.

---

## Phase 11 — Admin panel (~2d) — added 2026-08-05 (JP; FR-10)

- [x] T087 [P] Admin authz tests FIRST: every `/api/admin` route walked mechanically — 401 anonymous, 403 active non-admin, 200 admin; domain validation; last-admin guard; deactivation revokes the live session on next request; audit rows per action (FR-10.2–10.7; NFR-6)
- [x] T088 `users.is_admin` + `ensureAdmin` middleware (`src/auth/`) + `src/routes/admin.ts` (list/add/activate/memberships, Zod-strict) (FR-10.1–10.7)
- [x] T089 `GET /api/me` + Admin tab in the frontend (admin-visible, prototype design language): user table, add form with project checkboxes, activate/deactivate, membership editing — optimistic with revert (FR-10.1–10.4)
- [x] T090 `scripts/allowlist.ts` `ADMIN=1` flag; seed JP as first admin on the host; deploy (FR-10.8)
- [ ] T091 ⏸ ON HOLD with T073 — Fold the new screens into the keyboard/WCAG AA pass (T073 scope grows) (NFR-9)

**Checkpoint**: JP manages a real account end-to-end from the UI.

---

## Phase 12 — Build-spec v1.1 adoptions (~6d) — added 2026-08-12 (JP; FR-11, FR-12, BR-6c) — BUILT 2026-08-12

- [x] T092 Migration 004: `frost_notes` + `milestone_day_plan` collections with unique indexes, both carrying `project_id` (invariant 1; FR-11.1, FR-12.3)
- [x] T093 [P] Day-capacity tests FIRST in `test/dayplan.test.ts` (largest-remainder exact sum incl. 22-over-4-days, holiday zero + redistribute + reject, all-holiday week) then `lib/dayplan.ts` — a NEW module over `lib/calendar.ts` holidays; calendar and planner untouched (invariant 5; FR-12.4; AC-22)
- [x] T094 [P] Frost-notes route under `/api/projects/:projectId` (Zod-strict, audit rows) + three-state status derivation in the requests assembler; tests: remark-only invariance, flag flip, membership 403, audit both ways (FR-11.1–11.4, 11.6–11.7; AC-21)
- [x] T095 Requests UI: FOR CLARIFICATION tile + inline note editor (remark → checkbox → reason; Escape/Cancel discard; optimistic with revert) + three-state pills (FR-11.3–11.6)
- [x] T096 Day-plan routes: GET week plan, PUT placement (day inside the milestone's week, non-holiday; audit) + lapse-on-week-change in schedule writes; tests (FR-12.3–12.6; AC-23)
- [x] T097 Deadlines UI: week expand to Mon–Fri (one open at a time), pointer drag between days + keyboard equivalent, day-capacity footers and tints (FR-12.1–12.2; NFR-9 basics — the full WCAG audit stays with T073)
- [x] T098 BR-6c weighted load in the schedule/deadlines assemblers: weekly footers, over-capacity tint and BR-6 *over capacity* conflict switch to card-equivalents; fixture proves 478 on the mirrored board shape; `lib/planner.ts` untouched (BR-6c; AC-24; FR-5.13, FR-5.17)
- [x] T099 Sync-strip copy: replace "every 15 minutes" with push-aware wording in `frontend/templates/00-app.html` (FR-8.6, FR-9.6)

**Checkpoint**: AC-21–AC-24 pass as tests. Errata answer received 2026-08-12 (`docs/sirus_errata-reply-v1.2.md`): BR-6c weight applies everywhere — the built default is final, their §6.1 was a documentation error. Phase closed.

---

## Phase 13 — Pipeline redesign to Figma frame 17:1015 (~4–5d) — added 2026-08-12 (JP; 32 annotations = the spec, `pipeline-frame-notes.md`)

Scope: the Pipeline tab + the shell it carries (top nav, tabs, stats). Other tabs keep today's design inside the new shell. Difficulty stays READ-ONLY (settled by the complete annotation set, 2026-08-12 — superseded the same day by BRD-§9-A1; see Phase 13a). "Simulate Trello sync" is dev-only — omitted. Success criterion: 1:1 against the frame at 1600px; every value binds to a token.

- [x] T100 Token layer: `frontend/styles/05-tokens.css` — CSS custom properties named per the Figma variables (slate/red/amber/blue/green scales, text/caption..display, radius, space, shadow) + the semantic aliases the annotations use (`--surface-*`, `--border-border`, `--status-*`, `--font-sans`); Google Sans Flex 400–700 via Google Fonts CDN (JP override of the self-host note) (frame §0; annotations 17:1015, 70:10522)
- [x] T101 Icon set exported clean from the file via Rex (`exportAsync SVG_STRING`) and inlined as Ractive partials — tab icons, chevrons, search, calendar, warning, external-link, Trello/Figma marks; no runtime Figma dependency (asset-fidelity rule)
- [x] T102 Shell rebuild app-wide: breadcrumb (`nav aria-label="Breadcrumb"`, aria-current), PROJECT selector + board link, Last Synced stamp, user chip, tab bar with icons + `role="tab"`/`aria-selected`/tabindex + hover states; Admin tab styled to match (annotations 17:1438, 19:920–949; v1.2 six-tab note)
- [x] T103 Stats row: four equal columns, overline+display type, URGENT red; OPEN WORK = incomplete-card count (mirrors the panel) (annotations 28:3683, 31:2736–2744)
- [x] T104 Incomplete panel: Row-N chip + bold MC + name + amber reason + right-aligned Open Card (new tab) + consequence copy; hidden when empty (annotations 70:1358, 70:970, 70:914)
- [x] T105 Search + callout: realtime substring over MC #, name, type, client, status with `<mark>` amber highlight; callout copy verbatim; NO simulate button (annotations 17:2057, 70:1211)
- [x] T106 Table per the header annotation (13 columns as first framed; trimmed to 11 the same day — Cycle Time + Weeks cut by the team, Links 94px): expandable rows (chevron + Enter + focusable), Type/Client badges, Difficulty read-only badge, Urgency select-menu write with "saving…" state (opacity .5, pointer-events none) + rollback, Status keyword badge with list name verbatim, Due date-picker chrome on the W2 write-through (annotation 251:7925 carries stale v1.1 precedence — v1.2 governs) with missing/overdue states (251:23859), Work Started/Done/Cycle Time read-only, Weeks display, source-icon links (annotations 70:10008/9/24, 169:26364/26074/26426, 70:10030/10037)
- [x] T107 Backend: `asset_type` joined onto the MC group (closes the FR-4.1 "type" gap) + row derivations for Work Started / Work Done / Cycle Time (min started / max done across the MC group's work cards; workdays between) + tests
- [x] T108 Horizontal scroll: custom slider (track/thumb/chevron nudge) — below 1600px the table scrolls, never collapses (annotation 251:6758); task rows restyled to the kit
- [x] T109 Regression pass: remaining five tabs render correctly inside the new shell; full suite dual-TZ, typecheck, lint, build
- [x] T110 Fidelity check at 1600px against the frame screenshot; STATE update; deploy on JP go

## Phase 13a — W3 difficulty writeback (~1d) — added 2026-08-12 (JP go; product approval BRD-§9-A1 via Miles, owl #01–#03; build target cell 415:54974)

Scope: the write registry grows two → three (constitution 4.1.0, `contracts/trello-write.md` W3, FR-4.8). The frame's GOVERNANCE BLOCKER annotation is superseded by product's APPROVED one. Label-swap mechanics assumed (`Difficulty: …` taxonomy) pending Miles's label-vs-custom-field confirmation.

- [x] T111 Tests-first write layer + route: `setDifficulty()` label swap in `lib/trello.ts` (add-first ordering, stale-label removal, restore-on-partial-failure, taxonomy bootstrap with cache) + `PATCH /deliverables/:cardId/difficulty` mirroring W1/W2 (no-op guard, audit `difficulty.set`/`set_failed` + sync_runs per attempt, WRITES_DISABLED gate inherited) — 8 new tests, writes-disabled suite extended to all three routes (invariants 2, 8, 17; FR-4.8)
## Phase 13b — Pipeline cells batch 2 (~1–2d) — added 2026-08-13 (JP go; product specs via owl #06–#10, Rex-verified on nodes 415:54979 / 431:17015 / 431:17016 / 431:17017 / 432:17733)

Scope: five cell specs, zero new writes. Built via end-to-end workflow (Opus build/test agents, Fable verification), JP-directed. Supersedes the phase-13 group-derived Started/Done assumption.

- [x] T113 Per-card Started/Done: deriveWorkSpans extended to deliverable cards (own card_events; started = first into ongoing/done, survives backlog bounce; done = latest into done, held only while currently done; idempotent); drainPush main-card branch; row payload workStarted/Done (Manila) + workStartedTs/DoneTs (tooltips) + mcLabel; spanByMc + cycleDays removed (no consumers); tests rewritten to per-card semantics (Figma 431:17015/16; invariant 11)
- [x] T114 Frontend: due-date popover w/ commit-on-Apply + baseline guard (415:54979; W2 route untouched), Started/Done plain cells + exact-instant tooltips, links off-state (30%, truly disabled, independent — 431:17017), MC# bare label w/ displayId kept in search blob (432:17733, JP decimal ruling), fixed 3-letter month formatter; dismissers unified across menus + popover; browser-verified incl. staged→Apply→rollback chain
- [x] T115 Quality: 235/235 dual-TZ, typecheck/lint/build clean, perf 117ms/89ms @5k; 36-assertion date harness in 4 host TZs; three-lens verification (invariants / spec fidelity / regression)

## Phase 13a (continued)

- [x] T112 Pipeline difficulty dropdown per product's build spec: badge-chip trigger keeps the phase-13 `d-*` recipes (Hard red-50/red-500 = the spec's #fef2f2/#ef4444; Easy green / Medium amber pending product tokens), select menu mirrors urgency (fixed flip-up, unified dismissers, menu mutual exclusion, per-card saving chrome, optimistic set + rollback banner, `loadAll` re-keys forecast + hard-mix), unset chip settable on missing-difficulty rows, disabled with read-only tooltip when `writes_enabled` is false; browser-verified incl. rollback (FR-4.8; cell 415:54974)

**Assumptions taken (annotation-silent, flagged to JP):** Weeks column = slotted week (dash when unscheduled) · Work Started/Done = earliest start / latest done across the MC group's work cards · Cycle Time = workdays between them. Difficulty badge keeps its chevron chrome (1:1 rule) despite being read-only — flagged to the design team.

---

## Dependencies

```
Phase 0 ─► 1 ─► 2 ─► 3 ─►(GATE T026: JP)─┐
                │                        ├─► 6 ─►(GATE T045: JP+PM)─► 7 ─► 8a ─► 9
                └─► 4 ─────► 6           │
                └─► 5 (independent of 4)─┘
Phase 8: after 2 + 7 + duplicate-board confirmation (JP) — its own review
```

- Phase 5 is independent of phase 4 — parallelizable with it.
- Phases 3's gate (T026) blocks 6; 6's gate (T045) blocks 7. Gates do not parallelise.
- Phase 8 additionally requires the duplicate staging board (JP) — currently **BLOCKED**.

## Parallel opportunities

- Phase 0: T002, T003, T005 alongside T001/T004.
- Phases 4 + 5 concurrently (two developers compress the middle, per plan estimates).
- Within phase 7: T047, T049, T053, T056, T062 are parallel-safe against the tab they don't touch.
- Phase 9: T070–T072 concurrently after T069.

## MVP scope

First demonstrable value = **US1 Pipeline read-only** on real data: phases 0–2 + T027–T033 (ARES sync) + T048 (Pipeline tab shell — behind the gate discipline, forecast columns absent). Each later phase is an independent increment per the ladder.

## Day-count sanity check

0: ~4 · 1: ~3 · 2: ~4 · 3: ~4 · 4: ~6 · 5: ~4 · 6: ~4 · 7: ~15–18 · 8: ~2 · 8a: ~1 · 9: ~13 → **~60–63 days** — matches the amended plan bound; phase 7 is the biggest block, as expected. Phase 10 (added 2026-08-04) adds ~5–6 Sirius-side days; the ARES half is a separate build outside this bound. Phase 12 (added 2026-08-12) adds ~6 days.
