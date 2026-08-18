# MAP — one-glance code map: one line per file; read this instead of exploring.
Update on file add/rename/repurpose.
Last verified: 2026-08-18.

## Server
- server.js — entry: env → Mongo/Redis → createApp → listen; boots ARES calendar; worker owns sync.
- src/app.ts — ALL Express wiring (supertest-able); Redis sessions; webhook router before json/session; createApp.
- src/config/env.ts — Zod env validation, fail-fast in prod; validateEnv.
- src/db/mongo.ts + redis.ts — own `sirius` db on shared server; node-redis (connect-redis v9 needs it, not ioredis); connectMongo/connectRedis.
- src/models/index.ts — all 18 models (15 planned + push_events/frost_notes/milestone_day_plan; date-only = 'YYYY-MM-DD'); ALL_MODELS.
- src/routing/paths.ts — shell whitelist + returnTo validator + base-path stamp; ROUTE_TABS mirrored in 00-router.js; isShellPath/safeReturnTo.
- src/types/express-session.d.ts — session returnTo typing.

### auth (invariant 9)
- src/auth/passport.ts — Google OAuth, the 4 sign-in checks; evaluateSignIn.
- src/auth/session.ts — ensureAuthenticated, SessionUser.
- src/auth/membership.ts — ensureProjectMember; sets res.locals.project; 403 cross-project.
- src/auth/admin.ts — ensureAdmin; re-reads users doc every request.
- src/auth/routes.ts — /auth/* Google SSO; denied → /auth/failed.

### routes (each exports <name>Router)
- src/routes/projects.ts — project list/switcher; the scoping pattern.
- src/routes/deliverables.ts — read-only pipeline/model/deadline payloads.
- src/routes/requests.ts — intake mirror + frost notes; status derived from Trello join, never stored.
- src/routes/schedule.ts — ONLY write surface for Sirius-owned planning (week/pin/confidence/SLA/note/capacity) + sprints + suggest.
- src/routes/writes.ts — registry writes W1 urgency/W2 due/W3 difficulty; Trello-first, rollback structural.
- src/routes/webhooks.ts — ARES push receiver, HMAC-signed, stores pending events; verifySignature.
- src/routes/admin.ts — allow-list on a screen; no hard deletes.

### services
- src/services/ares.ts — ARES read-API client (v1 envelopes, 60/min); AresClient.
- src/services/mapper.ts — Trello taxonomy → deliverables + MC-group work cards; mapTrello.
- src/services/status-rules.ts — BR-10 list name → pending/ongoing/done; classifyList.
- src/services/intake-parser.ts — sheet parser (ragged rows, serial dates, dup Type cols); parseIntake.
- src/services/pipeline.ts — db rows → tab payload (deliverables_v + forecast + BR-10); loadPipeline/toMilestones.
- src/services/conflicts.ts — BR-6 detection + invariant-13 situation key; detectConflicts/conflictKey.
- src/services/model-grid.ts — per-project EmpiricalModel with fallback provenance; loadProjectModel.
- src/services/model-refresh.ts — pure BR-2 derivation: card_events → samples → grids + delta; deriveSamples/computeModelGrid.
- src/services/calendar-sync.ts — ARES-canonical work calendar persist/load (global; invariant-1 exception); loadCalendar/syncCalendarFromAres.
- src/services/audit.ts — insert-only audit writer; audit.
- src/services/guard.ts — refuse prod board ids outside production; assertNotProductionBoards.

## lib (calendar/forecast/planner = VERBATIM-port trio — golden tests pin them; invariant 5)
- lib/calendar.ts — VERBATIM: workday math, weeks, toFriday quirk; injectable holidays (ARES canonical); workday/toFriday/setHolidays.
- lib/forecast.ts — VERBATIM: the empirical forecast users see; SLA overrides cascade; forecast.
- lib/planner.ts — VERBATIM: suggestPlan/weekLoad/sprintFor/sprintIssues/reflowSprints.
- lib/model.ts — verbatim grid lookup + shipped EMPIRICAL snapshot; designCell/laneOf.
- lib/planner.constants.ts — verbatim WEIGHTS/HARD_MIX/weightOf (split to avoid a cycle).
- lib/forecast.legacy.ts — RETIRED workbook formula, migration tests only, never UI; legacyForecast.
- lib/dayplan.ts — NEW (not the port): day capacities for Deadlines daily plotting; dayCapacities/weekDays.
- lib/sheets.ts — read-only service-account Sheets source; makeSheetSource.
- lib/trello.ts — THE write path, exactly W1/W2/W3; TrelloClient/makeTrelloWriter.

## worker (owns ALL sync)
- worker/index.ts — cadence: ares 15 min (hourly while push healthy), intake 15 min, model nightly, calendar.
- worker/syncAres.ts — ARES → idempotent mapped upserts, sync_runs every run; runAresSync/syncProject.
- worker/syncIntake.ts — sheet mirror + deadline join; vanished rows go inactive; runIntakeSync.
- worker/drainPush.ts — drains push_events → per-card reconciles; poll fallback; drainPushEvents/pushHealth.
- worker/refreshModel.ts — nightly per-project rebuild + delta; runModelRefresh.

## frontend (no bundler — build.js concatenates dirs in numbered-filename order → public/index.html)
- frontend/build.js — injects styles/templates/scripts at index.html markers; parse-checks every Ractive template.
- frontend/index.html — shell: Google Sans Flex + Ractive CDN + inject markers.
- frontend/scripts/00-api.js — fetch helper; BASE from window.SIRIUS_BASE; 401 → redirect to sign-in (returnTo preserved).
- frontend/scripts/00-icons.js — inlined SVG icon set (ICONS).
- frontend/scripts/00-router.js — PURE routing half (path ⇄ {project, tab}); ROUTE_TABS mirrored from src/routing/paths.ts.
- frontend/scripts/01-app.js — everything else, one Ractive instance (2.9k lines): constants (WEEK_COUNT/WEEK_PX, capacity bands, segments); Requests columns/sorting; app ~l.426 with computeds; gantt geometry ~l.1101 (workday x-axis, phaseRun/ghostBar); warning hover card; capacity footer; data loading ~l.1620; app.on ~l.2017 (tabs, filters, notes, admin, menus, drag, suggest, sprints modal, daily plotting); arrival affordance; impure routing.
- frontend/templates/00-app.html — ONE Ractive template; per-tab branches (schedules the biggest: gantt + modals).
- styles (numbered sort = cascade order): 00-base.css legacy aliases onto tokens; 05-tokens.css Figma tokens (raw hex = defect); 10-ui.css legacy recipes for unmigrated tabs; 20-pipeline.css shell nav + Pipeline; 25-requests.css Requests v2; 30-planner.css schedules toolbar; 35-gantt.css planner body (pinned left block, --gw columns).

## scripts (ops; write-capable ones refuse prod boards/env)
- scripts/seed.ts + seed-intake-test.ts — fixture-only seeds (scripts/fixtures/).
- scripts/allowlist.ts — ONLY path creating allow-list rows/memberships/admin flags (CLI).
- scripts/migrate/migrations.ts + run.ts — versioned migrations ledger; npm run migrate.
- scripts/migrate-open-cards.ts — project onboarding: full sync + model refresh + summary.
- scripts/create-test-board.ts — one-off: builds the non-production mirror board.
- probes: ackcap/batch3/batch4/batch5-probe.ts seeded e2e proofs on in-memory mongod; ares-probe.mjs openapi contract-drift (CI); reconcile-probe.ts live Trello→ARES latency; urgency/due-roundtrip.ts live W1/W2 smokes vs TEST board; gate-t045.ts T045 gate report.

## TEST GUARDS (load-bearing only, of 58 suites + helpers and the golden oracle)
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
