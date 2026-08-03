# Implementation Plan: Sirius v1 — Delivery Pipeline & Forecasting Platform

**Branch**: `001-sirius-v1` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-sirius-v1/spec.md`

**Source of truth**: `docs/Sirius__Implementation_Plan.md` (aligned to BRD v2.2, 3 August 2026). This document is a format conversion, not a redesign. Where this plan and the source diverge, the source wins. The stack is decided; nothing here re-opens it.

## Summary

Sirius v1 is a Frost-internal, multi-project planning and forecasting platform: a pipeline register, sprint schedules, a deadlines view with conflict detection, and an empirical delivery forecast. It reads Trello (via ARES) and intake Google Sheets; it writes exactly one thing anywhere — an `Urgent` label on a Trello card, optimistic with rollback and audited. The forecast engine is pre-validated prototype code ported verbatim into `lib/`; golden tests (AC-10) prove the port, and the empirical model refresh is a release gate before any forecast UI ships.

## Technical Context

All entries are **decided** (Implementation Plan §2, §3) — none are open for re-litigation. The single genuine unknown is OD-1, tracked in research.md and blocking only the ARES-read phase.

**Language/Version**: TypeScript, `strict` — on Node (Next.js). Chosen specifically because the validated forecast engine is already JavaScript; a port to another language re-opens closed date-arithmetic risk (§2.1).

**Primary Dependencies**: Next.js App Router · Prisma (ORM + versioned migrations) · Auth.js (NextAuth) with Google provider · Zod at every API boundary · separate worker service for all sync (sync never runs inside a request).

**Storage**: Cloud SQL for Postgres 16 — private IP, automated backups, PITR. Never on the same instance as the app. Schema per `data-model.md` (reproduced from §1.3, not redesigned).

**Testing**: Vitest. The forecast golden tests are the highest-value tests in the project; tests-first for everything in `lib/` and every business rule.

**Target Platform**: Cloud Run (`sirius-web` public + SSO-gated, min instances 1; `sirius-worker` no public ingress) · Cloud Scheduler (ares 15 min · intake 15 min · model nightly · health daily) · Secret Manager · Cloud Logging with an exclusion filter dropping brief text · Artifact Registry. Hosting assumes Frost GCP (OD-8 assumption A6).

**Project Type**: Single server-rendered Next.js web application plus a separate worker service. Explicitly NOT a SPA + separate API domain (§2.4) — one app, session in an httpOnly cookie.

**Performance Goals**: NFR-1 page load < 2 s p95 at 5,000 cards (SSR keeps the pipeline fast) · NFR-2 drag feedback < 100 ms · NFR-3 Trello change to Sirius < 15 min · NFR-4 availability 99.5% PHT business hours.

**Constraints**: Read-only against every source except the single urgency write (`lib/trello.ts` `setUrgency()`) · store UTC, render and compute Asia/Manila; workday math via `lib/calendar.ts` only · secrets in Secret Manager, never in the client bundle, repo, or logs · Sheets access via attached service account — no key file exists · seed from fixtures, never a production dump · staging points at a duplicate Trello board.

**Scale/Scope**: Multi-project from the first migration (26 boards, 1,016+ cards in ARES today; 5 of 26 boards serve several projects) · 5,000-card performance envelope · five UI tabs · ~57 dev-days across 9 phases.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0 (all 17 invariants). Re-checked after Phase 1 design.*

| # | Invariant | How this plan honours it |
|---|---|---|
| 1 | `project_id` on every table/query | Schema §1.3 carries it on every table incl. audit/sync; first migration |
| 2 | Read-only except urgency | One write path: `lib/trello.ts` `setUrgency()`; contracts/trello-write.md |
| 3 | `mc_number` not unique | Identity `(project_id, trello_card_id)`; `display_id` for humans (data-model) |
| 4 | Work cards attach to MC group | `work_cards.mc_number`, no deliverable FK (data-model, §1.4) |
| 5 | `lib/` ported verbatim, pre-validated | Stated in Summary; golden tests precede any consumer. Port source is the prototype bundle per the approved deviation in STATE.md |
| 6 | `forecast.legacy.ts` tests-only | Repo layout marks it "tests only, not exported to UI" |
| 7 | Empirical model is a release gate | Sequence item 6 gate preserved below; no forecast UI before it passes |
| 8 | Urgency optimistic + rollback + audit | contracts/trello-write.md; `audit_log` + `sync_runs` rows per write |
| 9 | Auth = four server-side checks | §4 signIn callback; every route re-checks session + project membership |
| 10 | Immutable `audit_log` for state changes | Schema + contracts/http-api.md side-effect rules |
| 11 | UTC storage, Asia/Manila compute | Technical Context constraint; `lib/calendar.ts` only |
| 12 | Sprints are editable data | `sprints` table; overlap rejection on save |
| 13 | Conflict acks keyed on situation | `conflict_acknowledgements.conflict_key` = week \| rule \| sorted card:phase pairs |
| 14 | Deadline precedence in `deliverables_v` | View reproduced in data-model |
| 15 | Secrets in Secret Manager | §3.2 topology; no key file for Sheets |
| 16 | Seed from fixtures | quickstart.md; `npm run seed` uses fixtures + CSV |
| 17 | Staging = duplicate Trello board | §3.3 environments table; phase 8 gate |

**Result: PASS — no violations, nothing to justify in Complexity Tracking.** One phase is blocked, not violating: ARES read awaits OD-1.

## Project Structure

### Documentation (this feature)

```text
specs/001-sirius-v1/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions recorded, OD-1 held open
├── data-model.md        # Phase 1 — schema §1.3 reproduced verbatim
├── quickstart.md        # Phase 1 — local dev + validation
├── contracts/           # Phase 1 — http-api, worker, trello-write
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

Reproduced from Implementation Plan §2.3 — this layout is fixed.

```text
sirius/
├── app/
│   ├── (app)/                    # authenticated shell
│   │   ├── requests/  pipeline/  schedules/  deadlines/  forecast/
│   └── api/
│       ├── requests/             # intake read
│       ├── deliverables/         # pipeline read
│       ├── schedule/             # slot, pin, bulk replot
│       ├── urgency/              # THE write path (§5.3)
│       └── sync/                 # worker-triggered, OIDC-protected
├── lib/
│   ├── forecast.ts               # empirical model (the live one)
│   ├── forecast.legacy.ts        # ported workbook formula — tests only, not exported to UI
│   ├── model.ts                  # grid lookup + refresh
│   ├── planner.ts                # suggestPlan, weekLoad, WEIGHTS, HARD_MIX
│   ├── calendar.ts               # workday, toFriday, holidays, Manila tz
│   ├── trello.ts                 # mapping + the single write
│   └── sheets.ts                 # service-account read
├── worker/
│   ├── syncAres.ts  syncIntake.ts  refreshModel.ts
├── prisma/schema.prisma
└── scripts/migrate-open-cards.ts
```

**Structure Decision**: One Next.js app (server-rendered, session in httpOnly cookie) plus a separate worker service. `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` are **ported verbatim from the pre-validated prototype** — `forecast()`, `forecastSmart()`, `workday()`, `toFriday()`, `weekLoad()`, `suggestPlan()` are pure functions with no React dependency; they move to `lib/` unchanged and golden tests prove the port before anything else uses them. Do not refactor, rename, or "clean up" their logic.

## Sequence & Gates

Reproduced from Implementation Plan §8. Order is load-bearing; both gates are JP's to pass, never self-certified.

| Order | Work | Why this order |
|---|---|---|
| 1 | Schema + migrations | `project_id` everywhere from the start |
| 2 | Auth + audit log | Before any write path exists |
| 3 | Port `lib/` + golden tests | The tested part, moved intact — **GATE: AC-10 golden tests pass, confirmed by JP** |
| 4 | ARES read + mapping | **BLOCKED on OD-1** (ARES interface: DB role / API / replication) |
| 5 | Intake sync | Independent of 4 |
| 6 | Model refresh + validation | **RELEASE GATE: dates the PM recognises** — no forecast UI before this passes |
| 7 | UI, five tabs | Cheapest — the prototype resolved the design; do not start before gate 6 |
| 8 | Urgency write | Last; the only write, own review, dedicated Trello token, staging duplicate board confirmed first |
| 8a | Conflict acknowledgements | Small, but must reach the audit log |
| 9 | Security testing, pilot | AC-1..AC-5, AC-7, smoke authz matrix |

Building UI on an uncalibrated model produces a board where everything reads late, and that costs the team's trust once (§8).

## Estimates

From Implementation Plan §9 — the sanity bound for task generation (~57 days ≈ 11–12 weeks, one full-stack developer; two developers compress the middle to ~9 weeks; the gates do not parallelise).

| Item | Days |
|---|---|
| Schema, migrations, seed | 3 |
| Auth, allow-list, audit | 4 |
| Port lib + golden tests | 4 |
| ARES integration + mapping | 6 |
| Intake sync | 4 |
| Model refresh + validation | 4 |
| UI — five tabs | 12 |
| Urgency write + rollback + audit | 2 |
| Conflict acknowledgements | 1 |
| Infra, IaC, pipeline | 4 |
| Security testing + remediation | 5 |
| Migration + pilot support | 8 |
| **Total** | **~57 days ≈ 11–12 weeks** |

## Deployment Pipeline

From §6: push to main → typecheck · lint · vitest · dependency audit → build container → migrate staging · deploy staging · smoke test → manual approval → migrate production · deploy production. Nothing reaches production without its migration having run against staging first. The smoke test includes the authorization matrix — a non-Frost session hitting each endpoint and getting 403.

## Complexity Tracking

None — Constitution Check passed with no violations.
