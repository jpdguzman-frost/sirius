# Implementation Plan: Sirius v1 — Delivery Pipeline & Forecasting Platform

**Branch**: `001-sirius-v1` | **Date**: 2026-08-03 (amended same day: ARES-stack alignment) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-sirius-v1/spec.md`

**Sources of truth**: `docs/product/implementation-plan.md` (aligned to BRD v2.2) for sequence, gates, estimates, integration rules and schema *content*; **CLAUDE.md stack section as amended by JP 2026-08-03** (constitution v2.0.0) for the stack, which supersedes the source plan's §1.1, §2.1–2.4 and §3. Where they conflict, the amended constitution wins. OD-1 and OD-8 are resolved (spec Clarifications).

## Summary

Sirius v1 is a Frost-internal, multi-project planning and forecasting platform: a pipeline register, sprint schedules, a deadlines view with conflict detection, and an empirical delivery forecast. It reads Trello data from the **ARES read API** and intake Google Sheets; it writes exactly one thing anywhere — an `Urgent` label on a Trello card, optimistic with rollback and audited. It is built on the ARES stack — Express, MongoDB (shared server with ARES), Redis, Passport Google OAuth, Ractive frontend — and deploys beside ARES. The forecast engine is pre-validated prototype code ported verbatim into `lib/`; golden tests (AC-10) prove the port, and the empirical model refresh is a release gate before any forecast UI ships.

## Technical Context

Decided per constitution v2.0.0. No open unknowns remain for design; OD-2/4/5/6/7 affect later tuning/seed/retention detail only.

**Language/Version**: TypeScript `strict` for server, worker and `lib/` (the validated forecast engine stays JavaScript-family; a port to another language re-opens closed date-arithmetic risk). Frontend scripts are plain JS per ARES conventions.

**Primary Dependencies**: Express 5 · Mongoose (MongoDB) · ioredis + connect-redis (Redis sessions, caching) · Passport with `passport-google-oauth20` — the four auth checks unchanged · Zod at every API boundary · Ractive.js templates concatenated by `frontend/build.js` (no bundler) · separate worker process for all sync.

**Storage**: MongoDB on the **same Mongo server as ARES**, own `sirius` database (JP, 2026-08-03). Redis for sessions and caching. Schema content per `data-model.md` — the Implementation Plan §1.3 tables translated 1:1 to collections, same fields, same ownership groups, same keys; not redesigned.

**Testing**: Vitest. The forecast golden tests are the highest-value tests in the project; tests-first for everything in `lib/` and every business rule. Timezone suite runs twice: `TZ=UTC` and `TZ=Asia/Manila` (ARES pattern, serves invariant 11).

**Target Platform**: Deployed beside ARES, same pattern and host. Worker scheduling via the worker process itself (sync never runs inside a request). Secrets in server-side environment configuration only (invariant 15, as amended).

**Project Type**: Single server-rendered-shell Express app (Ractive templates hydrated client-side, ARES style) plus a separate worker process. Explicitly NOT a SPA on another origin — the ARES API has no CORS on `/api/*` and the key never reaches a browser; Sirius's server is the facade.

**Performance Goals**: NFR-1 page load < 2 s p95 at 5,000 cards · NFR-2 drag feedback < 100 ms · NFR-3 Trello change to Sirius < 15 min — per JP the new ARES delivers in realtime, so ARES cadence is not the bottleneck; verify end-to-end during phase 4 · NFR-4 availability 99.5% PHT business hours.

**Constraints**: Read-only against every source except the single urgency write (`lib/trello.ts` `setUrgency()`, direct Trello API with a dedicated write token — ARES is never the write path; its read-only key returns 403 on writes by design) · store UTC, render and compute Asia/Manila; workday math via `lib/calendar.ts` only · ARES v1 surface rate limit 60 req/min — comfortable at 15-min sync cadence with pagination; cache reads aggressively · secrets server-side only · seed from fixtures, never a production dump · staging points at a duplicate Trello board.

**Scale/Scope**: Multi-project from the first migration (26 boards, 1,016+ cards in ARES today; 5 of 26 boards serve several projects) · 5,000-card performance envelope · five UI tabs · ~57 dev-days baseline with UI likely 15–18 days rather than 12 now that prototype React components are a design reference, not portable code.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` **v2.0.0** (all 17 invariants). Re-checked after the ARES-stack amendment.*

| # | Invariant | How this plan honours it |
|---|---|---|
| 1 | `project_id` on every collection/query | Every collection carries it incl. audit/sync; compound indexes lead with it (data-model) |
| 2 | Read-only except urgency | ARES key is read-only (server-enforced 403 on writes); Sheets `spreadsheets.readonly`; one write path: `lib/trello.ts` `setUrgency()` |
| 3 | `mc_number` not unique | Unique compound index `(project_id, trello_card_id)`; `display_id` for humans |
| 4 | Work cards attach to MC group | `work_cards.mc_number`, no deliverable reference (data-model) |
| 5 | `lib/` ported verbatim, pre-validated | Unaffected by the stack change — pure functions, no framework dependency; golden tests precede any consumer. Port source per approved deviation in STATE.md |
| 6 | `forecast.legacy.ts` tests-only | Layout marks it "tests only, never imported by UI code" |
| 7 | Empirical model is a release gate | Sequence item 6 gate preserved; no forecast UI before it passes |
| 8 | Urgency optimistic + rollback + audit | contracts/trello-write.md; `audit_log` + `sync_runs` documents per write |
| 9 | Auth = four server-side checks | Passport Google OAuth verify callback implements all four; every route re-checks session + project membership (contracts/http-api.md) |
| 10 | Immutable `audit_log` for state changes | Append-only collection + route side-effect rules |
| 11 | UTC storage, Asia/Manila compute | `lib/calendar.ts` only; dual-TZ test runs; ARES dates are Manila calendar days — never re-interpret as UTC |
| 12 | Sprints are editable data | `sprints` collection; overlap rejection on save |
| 13 | Conflict acks keyed on situation | `conflict_key` = week \| rule \| sorted card:phase pairs; unique per project |
| 14 | Deadline precedence | Computed `deadline`/`deadline_source` per BR-9 at the model layer (Postgres view translated; data-model) |
| 15 | Secrets server-side env only | ARES key, Trello write token, Sheets credential, session secret — dotenv on host, never repo/bundle/logs |
| 16 | Seed from fixtures | quickstart.md; `npm run seed` uses fixtures + CSV |
| 17 | Staging = duplicate Trello board | Environments table below; phase 8 gate |

**Result: PASS — no violations.** Phase 4 is now **unblocked** (OD-1 resolved).

## Project Structure

### Documentation (this feature)

```text
specs/001-sirius-v1/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions incl. the 2026-08-03 amendments
├── data-model.md        # Phase 1 — §1.3 content as Mongoose collections
├── quickstart.md        # Phase 1 — local dev + validation
├── contracts/           # Phase 1 — http-api, worker, trello-write, ares-read
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

Amended layout (constitution v2.0.0) — mirrors ARES conventions; supersedes Implementation Plan §2.3. What each piece *does* is unchanged.

```text
sirius/
├── server.js                     # Express app entry — sessions (Redis), passport, routes
├── src/
│   ├── auth/                     # passport setup: the four checks; ensureAuthenticated,
│   │                             #   ensureProjectMember middleware
│   ├── routes/
│   │   ├── requests.js           # intake read
│   │   ├── deliverables.js       # pipeline read
│   │   ├── schedule.js           # slot, pin, bulk replot, sprints, conflict acks
│   │   └── urgency.js            # THE write path
│   ├── models/                   # mongoose schemas — data-model.md, 1:1
│   └── services/                 # audit writer, ares client adapter, zod schemas
├── lib/
│   ├── forecast.ts               # empirical model (the live one) — VERBATIM PORT
│   ├── forecast.legacy.ts        # ported workbook formula — tests only, not imported by UI
│   ├── model.ts                  # grid lookup + refresh
│   ├── planner.ts                # suggestPlan, weekLoad, WEIGHTS, HARD_MIX — VERBATIM PORT
│   ├── calendar.ts               # workday, toFriday, holidays, Manila tz — VERBATIM PORT
│   ├── trello.ts                 # the single write (setUrgency)
│   └── sheets.ts                 # service-account read
├── worker/
│   ├── index.js                  # scheduler loop — sync never runs inside a request
│   ├── syncAres.ts  syncIntake.ts  refreshModel.ts
├── frontend/                     # ARES conventions — no bundler
│   ├── build.js                  # concatenates styles/*.css, templates/*.html, scripts/*.js
│   ├── index.html                # shell with inject markers
│   ├── templates/                # Ractive templates: requests, pipeline, schedules,
│   │                             #   deadlines, forecast
│   ├── scripts/                  # plain JS, wired into the Ractive instance in app.js
│   └── styles/
├── scripts/
│   ├── migrate/                  # version-controlled schema/index migration scripts
│   └── seed.js                   # fixtures only — never a production dump
└── test/                         # vitest; golden fixtures under test/golden/
```

**Structure Decision**: One Express app serving the built Ractive frontend and the JSON API; a separate worker process for all sync; Sirius's server is the only caller of the ARES API (no CORS on `/api/*`, key stays server-side). `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` are **ported verbatim from the pre-validated prototype** — pure functions with no framework dependency, unaffected by the stack amendment; golden tests prove the port before anything else uses them. Do not refactor, rename, or "clean up" their logic.

## Environments

| Env | Data | Trello (write path) | ARES | Sheets |
|---|---|---|---|---|
| local | seed fixtures | duplicate board | fixture JSON or dev key | CSV fixture |
| staging | prod copy | **duplicate board** | read-only key | copy of the sheet |
| production | live | live | read-only key | live |

Staging must point at a **duplicate Trello board** — the urgency write path is real; a staging test against the live board would relabel real cards (invariant 17).

## Sequence & Gates

Reproduced from Implementation Plan §8; order is load-bearing; both gates are JP's to pass, never self-certified. **Phase 4 unblocked 2026-08-03 (OD-1 = ARES read API).**

| Order | Work | Why this order |
|---|---|---|
| 1 | Schema + migrations | `project_id` everywhere from the start |
| 2 | Auth + audit log | Before any write path exists |
| 3 | Port `lib/` + golden tests | The tested part, moved intact — **GATE: AC-10 golden tests pass, confirmed by JP** |
| 4 | ARES read + mapping | ✅ Unblocked — contract: contracts/ares-read.md |
| 5 | Intake sync | Independent of 4 |
| 6 | Model refresh + validation | **RELEASE GATE: dates the PM recognises** — no forecast UI before this passes |
| 7 | UI, five tabs | Prototype resolves the design; components rebuilt as Ractive templates |
| 8 | Urgency write | Last; the only write, own review, dedicated Trello token, staging duplicate board confirmed first |
| 8a | Conflict acknowledgements | Small, but must reach the audit log |
| 9 | Security testing, pilot | AC-1..AC-5, AC-7, smoke authz matrix |

Building UI on an uncalibrated model produces a board where everything reads late, and that costs the team's trust once (§8).

## Estimates

Baseline from Implementation Plan §9 (~57 days ≈ 11–12 weeks, one full-stack developer; gates do not parallelise), with one amendment: **UI — five tabs raised 12 → 15–18 days** because prototype React components no longer port as code — the prototype resolves layout and interaction design; the tabs are rebuilt as Ractive templates. All other line items unchanged: schema 3 · auth 4 · lib port 4 · ARES integration 6 · intake sync 4 · model refresh 4 · urgency 2 · conflict acks 1 · infra 4 · security 5 · migration/pilot 8. **Amended total ~60–63 days.**

## Deployment Pipeline

push to main → typecheck · lint · vitest (incl. dual-TZ run) · dependency audit → build frontend (`node frontend/build.js`) → deploy staging beside ARES · run migration scripts · smoke test (incl. authz matrix: non-Frost session hitting each endpoint → 403/denied) → manual approval → migrate + deploy production. Nothing reaches production without its migration scripts having run against staging first. `api:verify`-style probe against ARES (shape drift detection, ARES's own pattern) runs in CI so an ARES contract change fails the build, not the runtime.

## Complexity Tracking

None — Constitution Check passed with no violations.
