# MAP — the Sirius skim (Layer 0)

_Read first, instead of exploring: live status · one line per source file · the doc layers (ruled in docs/CONTEXT_ARCHITECTURE.md). last-verified: 2026-08-18 · regenerate: `npx tsx scripts/generate-index.ts` (`--check` exits 1 on drift)._

## Standing rules

- Code decides FACTS: where a doc describes behaviour and the code disagrees, code wins — flag the contradiction in your task output, never silently work around it. Obligations bind the other way: the constitution (root CLAUDE.md), the write registry (specs/001-sirius-v1/contracts/trello-write.md), and the area rulebooks bind code — code contradicting them is a defect to flag.
- Before changing a module, read its entries in decisions/ and its area rulebook (planner: specs/001-sirius-v1/gantt-rules.md). Do not re-decide settled choices.

## Status

<!-- GEN:STATUS -->
- In progress: phase 9 — Security testing + pilot → STATE.md §Phase status · history: docs/state-log/
- Open blocking decision BRD §9: Amend "write impossible by permission" → STATE.md §Decisions needed from JP (blocking)
- ACs: 19 ✅ · 5 ⬜ (of 24) → STATE.md §Acceptance criteria scoreboard
<!-- /GEN:STATUS -->

## Modules

<!-- GEN:MODULES -->
- `frontend/build.js` — injects styles/templates/scripts at index.html markers; parse-checks every Ractive template.
- `frontend/index.html` — the shell build.js injects into (Google Sans Flex + Ractive CDN + the three inject markers).
- `frontend/scripts/00-api.js` — fetch helper; BASE from window.SIRIUS_BASE; 401 → redirect to sign-in (returnTo preserved).
- `frontend/scripts/00-icons.js` — inlined SVG icon set (ICONS).
- `frontend/scripts/00-router.js` — PURE routing half (path ⇄ {project, tab}); ROUTE_TABS mirrored from src/routing/paths.ts.
- `frontend/scripts/01-app.js` — everything else, one Ractive instance (2.9k lines): constants (WEEK_COUNT/WEEK_PX, capacity bands, segments); Requests columns/sorting; app ~l.426 with computeds; gantt geometry ~l.1101 (workday x-axis, phaseRun/ghostBar); warning hover card; capacity footer; data loading ~l.1620; app.on ~l.2017 (tabs, filters, notes, admin, menus, drag, suggest, sprints modal, daily plotting); arrival affordance; impure routing.
- `frontend/styles/00-base.css` — legacy aliases onto tokens.
- `frontend/styles/05-tokens.css` — Figma tokens (raw hex = defect).
- `frontend/styles/10-ui.css` — legacy recipes for unmigrated tabs.
- `frontend/styles/20-pipeline.css` — shell nav + Pipeline.
- `frontend/styles/25-requests.css` — Requests v2.
- `frontend/styles/30-planner.css` — schedules toolbar.
- `frontend/styles/35-gantt.css` — planner body (pinned left block, --gw columns).
- `frontend/templates/00-app.html` — ONE Ractive template; per-tab branches (schedules the biggest: gantt + modals).
- `lib/calendar.ts` — VERBATIM: workday math, weeks, toFriday quirk; injectable holidays (ARES canonical); workday/toFriday/setHolidays.
- `lib/dayplan.ts` — NEW (not the port): day capacities for Deadlines daily plotting; dayCapacities/weekDays.
- `lib/forecast.legacy.ts` — RETIRED workbook formula, migration tests only, never UI; legacyForecast.
- `lib/forecast.ts` — VERBATIM: the empirical forecast users see; SLA overrides cascade; forecast.
- `lib/model.ts` — verbatim grid lookup + shipped EMPIRICAL snapshot; designCell/laneOf.
- `lib/planner.constants.ts` — verbatim WEIGHTS/HARD_MIX/weightOf (split to avoid a cycle).
- `lib/planner.ts` — VERBATIM: suggestPlan/weekLoad/sprintFor/sprintIssues/reflowSprints.
- `lib/sheets.ts` — read-only service-account Sheets source; makeSheetSource.
- `lib/trello.ts` — THE write path, exactly W1/W2/W3; TrelloClient/makeTrelloWriter.
- `scripts/ackcap-probe.ts` — seeded e2e proof on in-memory mongod.
- `scripts/allowlist.ts` — ONLY path creating allow-list rows/memberships/admin flags (CLI).
- `scripts/ares-probe.mjs` — openapi contract-drift (CI).
- `scripts/batch3-probe.ts` — seeded e2e proof on in-memory mongod.
- `scripts/batch4-probe.ts` — seeded e2e proof on in-memory mongod.
- `scripts/batch5-probe.ts` — seeded e2e proof on in-memory mongod.
- `scripts/create-test-board.ts` — one-off: builds the non-production mirror board.
- `scripts/due-roundtrip.ts` — live W2 smoke vs TEST board.
- `scripts/gate-t045.ts` — T045 gate report.
- `scripts/generate-index.ts` — rebuilds this file's GEN blocks (STATUS from STATE.md, MODULES from disk, DOCMAP); `--check` = CI drift gate.
- `scripts/migrate-open-cards.ts` — project onboarding: full sync + model refresh + summary.
- `scripts/migrate/migrations.ts` — versioned migrations ledger.
- `scripts/migrate/run.ts` — migration runner; npm run migrate.
- `scripts/reconcile-probe.ts` — live Trello→ARES latency.
- `scripts/seed-intake-test.ts` — fixture-only intake seed (scripts/fixtures/).
- `scripts/seed.ts` — fixture-only seed (scripts/fixtures/).
- `scripts/urgency-roundtrip.ts` — live W1 smoke vs TEST board.
- `server.js` — entry: env → Mongo/Redis → createApp → listen; boots ARES calendar; worker owns sync.
- `src/app.ts` — ALL Express wiring (supertest-able); Redis sessions; webhook router before json/session; createApp.
- `src/auth/admin.ts` — ensureAdmin; re-reads users doc every request.
- `src/auth/membership.ts` — ensureProjectMember; sets res.locals.project; 403 cross-project.
- `src/auth/passport.ts` — Google OAuth, the 4 sign-in checks (invariant 9); evaluateSignIn.
- `src/auth/routes.ts` — /auth/* Google SSO; denied → /auth/failed.
- `src/auth/session.ts` — ensureAuthenticated, SessionUser.
- `src/config/env.ts` — Zod env validation, fail-fast in prod; validateEnv.
- `src/db/mongo.ts` — own `sirius` db on shared server; connectMongo.
- `src/db/redis.ts` — node-redis (connect-redis v9 needs it, not ioredis); connectRedis.
- `src/models/index.ts` — all 18 models (15 planned + push_events/frost_notes/milestone_day_plan; date-only = 'YYYY-MM-DD'); ALL_MODELS.
- `src/routes/admin.ts` — allow-list on a screen; no hard deletes.
- `src/routes/deliverables.ts` — read-only pipeline/model/deadline payloads.
- `src/routes/projects.ts` — project list/switcher; the scoping pattern.
- `src/routes/requests.ts` — intake mirror + frost notes; status derived from Trello join, never stored.
- `src/routes/schedule.ts` — ONLY write surface for Sirius-owned planning (week/pin/confidence/SLA/note/capacity) + sprints + suggest.
- `src/routes/webhooks.ts` — ARES push receiver, HMAC-signed, stores pending events; verifySignature.
- `src/routes/writes.ts` — registry writes W1 urgency/W2 due/W3 difficulty; Trello-first, rollback structural.
- `src/routing/paths.ts` — shell whitelist + returnTo validator + base-path stamp; ROUTE_TABS mirrored in 00-router.js; isShellPath/safeReturnTo.
- `src/services/ares.ts` — ARES read-API client (v1 envelopes, 60/min); AresClient.
- `src/services/audit.ts` — insert-only audit writer; audit.
- `src/services/calendar-sync.ts` — ARES-canonical work calendar persist/load (global; invariant-1 exception); loadCalendar/syncCalendarFromAres.
- `src/services/conflicts.ts` — BR-6 detection + invariant-13 situation key; detectConflicts/conflictKey.
- `src/services/guard.ts` — refuse prod board ids outside production; assertNotProductionBoards.
- `src/services/intake-parser.ts` — sheet parser (ragged rows, serial dates, dup Type cols); parseIntake.
- `src/services/mapper.ts` — Trello taxonomy → deliverables + MC-group work cards; mapTrello.
- `src/services/model-grid.ts` — per-project EmpiricalModel with fallback provenance; loadProjectModel.
- `src/services/model-refresh.ts` — pure BR-2 derivation: card_events → samples → grids + delta; deriveSamples/computeModelGrid.
- `src/services/pipeline.ts` — db rows → tab payload (deliverables_v + forecast + BR-10); loadPipeline/toMilestones.
- `src/services/status-rules.ts` — BR-10 list name → pending/ongoing/done; classifyList.
- `src/types/express-session.d.ts` — session returnTo typing.
- `worker/drainPush.ts` — drains push_events → per-card reconciles; poll fallback; drainPushEvents/pushHealth.
- `worker/index.ts` — cadence: ares 15 min (hourly while push healthy), intake 15 min, model nightly, calendar.
- `worker/refreshModel.ts` — nightly per-project rebuild + delta; runModelRefresh.
- `worker/syncAres.ts` — ARES → idempotent mapped upserts, sync_runs every run; runAresSync/syncProject.
- `worker/syncIntake.ts` — sheet mirror + deadline join; vanished rows go inactive; runIntakeSync.
<!-- /GEN:MODULES -->

## Doc map

<!-- GEN:DOCMAP -->
- Layer 0 · entry — CLAUDE.md (constitution) · docs/MAP.md (this skim) · directory CLAUDE.md files (frontend/, test/, lib/, src/)
- Layer 1 · current state — STATE.md · docs/HANDOFF.md
- Layer 2 · task set — area rulebooks (planner: specs/001-sirius-v1/gantt-rules.md; pipeline/requests law still lives in their frame-notes until extracted — docs/README.md §Where law lives) · decisions/ · specs/001-sirius-v1/ (contracts + spec-kit)
- Layer 3 · archive — docs/state-log/ · archived frame-notes (gantt today; banner marks each) · git history · owl threads
<!-- /GEN:DOCMAP -->

## Test guards (load-bearing only, of 58 suites + helpers and the golden oracle)

- golden: test/golden/original.mjs — VERBATIM oracle, DO NOT EDIT; calendar/forecast/planner.test.ts pin port-trio parity — highest-value tests; forecast.legacy/.workbook.test.ts (40 sanitized workbook rows) pin BR-1/AC-10.
- test/helpers/gantt-render.ts — renders the shipped schedules template with real Ractive — the template-proof harness.
- test/helpers/ — db.ts in-memory mongod + migrations; fixtures.ts project/member/agent preamble; requests.ts shared payload shape.
- test/drag-hittest.test.ts — pins drag-source (.grun) count/classes; bar stays hit-testable.
- test/gantt-run-geometry.test.ts — pins coloured-run pixel geometry from shipped source text.
- test/gantt-legend.test.ts — one phase→colour map only; deadline tick reuses .gdl.
- test/suggest-counts.test.ts — the Suggest bar's three client-side counts.
- test/planner-weeks.test.ts — week/month labels + bar geometry from shipped planner text.
- test/sprints-modal.test.ts — modal validators executed out of 01-app.js + rendered states.
- test/pipeline-warning.test.ts — warning icon + hover card, keyed on server-emitted tokens.

<!-- HAND:BEGIN -->
- lib/calendar.ts + lib/forecast.ts + lib/planner.ts = the VERBATIM-port trio (invariant 5); golden tests pin parity (test/golden/).
- frontend has no bundler: frontend/build.js concatenates the numbered files into public/index.html (styles' numbered sort = cascade order).
- worker owns ALL sync; sync never runs inside a request (constitution §Stack).
- scripts/ are ops; write-capable ones refuse prod boards/env (src/services/guard.ts).
- src/auth/* = invariant 9's four checks; src/routes/* each export <name>Router.
<!-- HAND:END -->
