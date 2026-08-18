# Research — Sirius v1 (Phase 0)

Decisions D1–D12 were made in `docs/product/implementation-plan.md`; **on 2026-08-03 JP amended the stack** (constitution v2.0.0) to align Sirius with the ARES stack and resolved OD-1 and OD-8. Superseded decisions keep their original rationale on record, with the amendment and its trade-off stated plainly. None are open for re-litigation.

## D1 — Datastore: MongoDB + Redis *(amended 2026-08-03)*

- **Decision**: MongoDB via Mongoose, on the **same Mongo server ARES uses**, in Sirius's own `sirius` database. Redis for sessions (connect-redis) and caching.
- **Rationale**: Stack consolidation — one datastore technology, one operational surface, the stack the team already runs daily for ARES. Decided by JP with the trade-off below on the table.
- **Superseded**: Cloud SQL Postgres 16. The source plan chose it because the data is relational and percentile recalculation is native SQL (§1.1). Under Mongo, joins are application-side or `$lookup`, and percentiles are computed in worker code during the model refresh — acceptable at this data size (~5,000-card envelope, thousands of movement events per refresh window).
- **What survives regardless**: every collection carries `project_id`; ownership grouping (Trello-owned / sheet-owned / Sirius-owned fields); unique keys; append-only audit; version-controlled migration scripts, never hand-applied (constitution, amended invariant 1).

## D2 — Language/runtime: Node + TypeScript `strict` (server, worker, lib)

- **Decision**: TypeScript on Node for server, worker and `lib/`; the forecast engine stays JavaScript-family. Frontend scripts are plain JS per ARES conventions (D3).
- **Rationale**: The forecast engine is already JavaScript and validated across several rounds of correction — `forecast()`, `forecastSmart()`, `workday()`, `toFriday()`, `weekLoad()`, `suggestPlan()` are pure functions with no framework dependency; they move to `lib/` unchanged. TypeScript because sometimes-a-string-sometimes-null `deadline` caused prototype bugs twice (§2.1).
- **Alternatives considered**: Python/Go port — rejected: re-opens the date-arithmetic risk already paid to close.

## D3 — Application shape: Express 5 + Ractive frontend, ARES conventions *(amended 2026-08-03)*

- **Decision**: One Express app serving a Ractive.js frontend (templates + plain JS + CSS concatenated by `frontend/build.js`, no bundler) and the JSON API; Redis-backed sessions in an httpOnly cookie; a separate worker process for all sync.
- **Rationale**: Same stack as ARES — shared conventions, shared operational knowledge; ARES's own consumer contract requires a server-side facade anyway (no CORS on `/api/*`, key never in a browser).
- **Superseded**: Next.js App Router. Its rationale was that prototype React components port over; under Ractive they do not — the prototype resolves layout and interaction *design*, and the five tabs are rebuilt as Ractive templates. UI estimate raised 12 → 15–18 days (plan.md).
- **Still rejected**: SPA on a separate origin/domain — CORS, token-in-browser, second deployment, and incompatible with the ARES key rule.

## D4 — ODM: Mongoose *(amended 2026-08-03)*

- **Decision**: Mongoose (ARES uses Mongoose 9). Schema/index changes via version-controlled migration scripts under `scripts/migrate/`; never applied by hand against production.
- **Superseded**: Prisma (with Postgres).

## D5 — Auth: Passport + `passport-google-oauth20`, four server-side checks *(amended 2026-08-03)*

- **Decision**: Google SSO only via Passport (ARES pattern), sessions in Redis. The four checks are unchanged and all live in the verify/sign-in path, server-side: verified email · `hd` claim = `frostdesigngroup.com` · matching email domain · active allow-list document. Every API route re-checks session AND project membership.
- **Superseded**: Auth.js/NextAuth (Next-coupled). The checks themselves are stack-independent and survive verbatim (FR-2.x; hiding a tab is not access control).

## D6 — Hosting: beside ARES *(amended 2026-08-03 — resolves OD-8)*

- **Decision**: Sirius deploys the same way and place as ARES, uses ARES's Mongo server, and follows the ARES deployment pattern. Secrets in server-side environment configuration (dotenv on host), per amended invariant 15.
- **Superseded**: Cloud Run + Cloud SQL topology (§3.1–3.2). Its deciding factor — attached service account, no Sheets key file — dies with it: **the Sheets service-account credential is now provisioned as a server-side secret** on the host, never committed (D8).

## D7 — Trello read: ARES read API *(RESOLVED 2026-08-03 — OD-1)* ✅

- **Decision**: Option 2 from the source plan — **a read API on ARES**, now live and documented. Surface: `/api/v1/trello/*` — boards, `boards/{boardId}/cards` (paginated), `boards/{boardId}/movements` (date-ranged, paginated — the `card_events` source), `cards/{cardId}` (with movement history), `cycle-time`, `boards/{boardId}/summary`, `health`. All marked `stable` in `openapi.yaml` (`x-ares-stability`). Auth: read-only `X-API-Key`, server-side only; writes return 403 `READ_ONLY_KEY` by design.
- **Contract source**: `https://ares.frostdesigngroup.com/api/docs` — guide.md + openapi.yaml served behind the same key, always matching the running deployment. Full details: `contracts/ares-read.md`.
- **Key operational facts** (from the guide, verified 2026-08-03): v1 surface enveloped `{ok, data, meta}` and rate-limited 60 req/min per key with `X-RateLimit-*` headers · no CORS on `/api/*` — server-side calls only · all upstream dates are Asia/Manila calendar days, never re-interpret as UTC · `rowKey` has multiple live formats, never construct one — read from `/api/projects/index`.
- **Caveat**: capacity reference weeks (BR-6a) come from `/api/project/{rowKey}/steering`, marked **internal** stability — consumed behind an adapter Sirius owns (`src/services/ares client`), with CI shape-drift detection.
- **Freshness**: the guide documents a 30-minute cache cycle; **per JP (2026-08-03) the new ARES delivers in realtime**, so NFR-3 (< 15 min) stands. Verify end-to-end latency during phase 4 integration.

## D8 — Intake sheet read: service account, `spreadsheets.readonly`

- **Decision**: Server-side read via a dedicated service account, named Viewer on each intake sheet; sheet sharing stays Restricted (FR-8.2, FR-8.3). Per `sirius-live-sheet-runbook.md`. Credential provisioned as a server-side secret on the ARES host (amended invariant 15) — never committed, never in the client.
- **Known gotchas** (each costs an afternoon if ignored): pad ragged rows before positional parsing; convert serial dates from the 1899-12-30 epoch; disambiguate the two columns named `Type` by position (§5.2).

## D9 — The one write: `setUrgency()` with a dedicated integration account

- **Decision**: Unchanged, and **unchanged by OD-1**: the urgency write goes **directly to the Trello API** with `TRELLO_WRITE_TOKEN` — ARES is never the write path (its documented surface is deliberately inert; its key class returns 403 on writes). Dedicated integration account holding membership of the Design Support boards only; optimistic UI with rollback; every call writes `audit_log` and `sync_runs` (§5.3).
- **Recorded consequence**: BRD §9's "write is impossible by permission" is no longer true — amend before the vendor assessment (tracked in STATE.md).

## D10 — Capacity: copied from ARES, not computed

- **Decision**: From `steering.deliveryForecast.referenceWeeks` + `effectiveWeeklyRate` via the steering endpoint (internal-tier — adapter + drift detection per D7); copied into `projects` each sync so a PM override is visible against a current baseline (§5.3a, BR-6a).
- **Caveat**: Reference weeks count all cards incl. work/ops cards; deliverable-level typical is lower — revise once ARES can report deliverable-only completions.

## D11 — Model refresh: nightly, per project, delta-tracked

- **Decision**: Nightly per project over `model_window_months`: read `card_events` → derive design time (working-lane dwell) and review time (*Sent for Client Review* dwell) → percentiles by difficulty × lane × metric (Average/70/85/95) **computed in worker code** (amended D1 — no SQL percentile) → throughput percentiles per difficulty → write `model_grid` + `throughput_grid` and record the delta from the previous run (§5.4).
- **Rationale**: BR-2/BR-3 — the empirical model is the only forecast users see; its rebuild is a release gate. A grid that shifts sharply overnight means the input changed, and someone should look.
- **Open tuning input**: OD-2 (window 6 vs 12 months; default 12) — PM decision, phase 6 tuning, not blocking.

## D12 — Port source for `lib/`

- **Decision**: `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` port verbatim from the pre-validated prototype; golden tests (AC-10) prove the port before anything else uses them; `lib/forecast.legacy.ts` survives for migration tests only and is never imported by UI code. **Unaffected by the stack amendment** — pure functions, no framework dependency.
- **Deviation on file, approved by JP 2026-08-03** (STATE.md): the original `frost-sirius-v1.jsx` is unavailable; the compiled bundle `docs/source-material/frost-sirius-v1.html` stands in as port source, making the golden tests the sole proof of fidelity. If the `.jsx` surfaces, it supersedes the bundle.

## Remaining open items (tracked, none blocking design)

| Item | Owner | Blocks |
|---|---|---|
| OD-2 model window 6/12 mo | PM | Phase 6 tuning only |
| OD-4 ack expiry policy | PM | Phase 8a detail |
| OD-5 `Client Approval` ongoing/done | PM | BR-10 keyword rules |
| OD-6 v1 projects beyond GCash | Leadership | Seed data |
| OD-7 retention policy | Leadership | Phase 9 |
| Duplicate staging Trello board | JP | Phase 8 |
| BRD §9 amendment (urgency write) | JP | Vendor assessment |
| NFR-3 realtime verification | JP/Engineering | Phase 4 exit check |

Resolved this session: ~~OD-1~~ (ARES read API), ~~OD-8~~ (beside ARES, shared Mongo server).
