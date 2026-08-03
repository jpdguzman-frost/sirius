# Research — Sirius v1 (Phase 0)

Every decision below was made in `docs/Sirius__Implementation_Plan.md` before this conversion; this file records them in Spec Kit form with their original rationale. **None are open for re-litigation.** The one genuine unknown, OD-1, is held open and blocking — deliberately not resolved here.

## D1 — Database: managed Postgres (Cloud SQL, Postgres 16)

- **Decision**: Relational store, Cloud SQL for Postgres 16, never on the same instance as the app.
- **Rationale**: The data is relational — projects own cards, cards own work cards, work cards accumulate events, forecasts join a model table, everything queried by date range and filtered by project. Percentile recalculation is SQL's home ground.
- **Alternatives considered**: Document store — rejected: hand-rolling joins you get free here (§1.1).

## D2 — Language/runtime: Node + TypeScript `strict`

- **Decision**: TypeScript on Node; the forecast engine stays JavaScript.
- **Rationale**: Specific, not fashion — the forecast engine is already JavaScript and already validated against the workbook and ARES movement data across several rounds of correction. `forecast()`, `forecastSmart()`, `workday()`, `toFriday()`, `weekLoad()`, `suggestPlan()` are pure functions with no React dependency; they move to `lib/` unchanged. TypeScript because sometimes-a-string-sometimes-null `deadline` caused prototype bugs twice (§2.1).
- **Alternatives considered**: Python (FastAPI) or Go port — rejected: re-opens exactly the date-arithmetic risk already paid to close. The honest path, if ever needed, is a golden-file suite running both implementations over 500 real cards asserting identical dates (~a week). Do not port casually.

## D3 — Framework shape: one server-rendered Next.js app + separate worker

- **Decision**: Next.js App Router, single app, session in httpOnly cookie; a separate worker service runs all sync.
- **Rationale**: Prototype components port over; API routes host sync endpoints; SSR keeps a 5,000-card pipeline fast (NFR-1). Sync must never run inside a request (§2.2).
- **Alternatives considered**: Static SPA + separate API domain — rejected: adds CORS, token handling in the browser, and a second deployment for no benefit at this size (§2.4).

## D4 — ORM: Prisma

- **Decision**: Prisma — typed queries, versioned migrations from the first line. No DDL applied by hand against production, ever (§1.5).
- **Alternatives considered**: Drizzle — acceptable per source plan ("Prisma or Drizzle"); Prisma selected as the repo's choice per the decided stack. The schema itself is fixed either way (data-model.md).

## D5 — Auth: Auth.js (NextAuth), Google provider, four server-side checks

- **Decision**: Google SSO only. Four checks in the signIn callback, all server-side: verified email, `hd` claim = `frostdesigngroup.com`, matching email domain, active allow-list row. Every API route re-checks session AND project membership (§4).
- **Rationale**: FR-2.x; hiding a tab is not access control. The prototype's browser check was a UX affordance, not this.
- **Alternatives considered**: Local passwords — excluded by FR-2.1.

## D6 — Hosting: Cloud Run + Cloud SQL on Frost GCP

- **Decision**: Cloud Run (`sirius-web`, `sirius-worker`), Cloud SQL private IP, Secret Manager, Cloud Scheduler, Cloud Logging with brief-text exclusion, Artifact Registry (§3.1–3.2).
- **Rationale**: The deciding factor is credentials — an attached service account means the Sheets reader needs **no key file at all**: nothing to commit, forward, or find in a backup. That win only exists on Google infrastructure.
- **Alternatives considered**: Vercel + Neon — rejected: faster to stand up but puts client roadmap data with a third party, which may not survive a vendor review at v2.
- **Caveat**: Assumes Frost owns the system — OD-8 (Leadership) can overturn; if GCash owns it, their platform and release process apply instead.

## D7 — Trello read: via ARES — interface OPEN (OD-1) ⛔

- **Decision**: **NOT DECIDED — [NEEDS CLARIFICATION: OD-1, owner Engineering/JP].** Sirius reads Trello data from ARES, not Trello directly (FR-8.1); *how* ARES exposes it is the open question that gates the ARES-read phase.
- **Candidates, in the source plan's order of preference** (§5.1):
  1. Read-only Postgres role on ARES's database — cheapest, no new surface, couples the two schemas.
  2. A small read API on ARES — cleaner boundary, needs ARES-side work.
  3. Scheduled replication into Sirius tables — most isolated, most moving parts.
- **Whichever it is, Sirius needs**: cards (id, name, list, labels, due, attachments), lists, and card movements; filtered by `trello_board_id` AND `trello_label` where the project sets one.
- **Status**: Phase 4 tasks stay **BLOCKED-OD1** until JP answers. The BRD risk register (R3) wants this confirmed in week 1.

## D8 — Intake sheet read: attached service account, `spreadsheets.readonly`

- **Decision**: Server-side read via the `sirius-sheets-reader` service account, a named Viewer on each intake sheet; sheet sharing stays Restricted (FR-8.2, FR-8.3). Per `sirius-live-sheet-runbook.md`.
- **Known gotchas** (each costs an afternoon if ignored): pad ragged rows before positional parsing; convert serial dates from the 1899-12-30 epoch; disambiguate the two columns named `Type` by position (§5.2).

## D9 — The one write: `setUrgency()` with a dedicated integration account

- **Decision**: Urgency is the only thing Sirius writes anywhere — add/remove a label named `Urgent` on a single card via `lib/trello.ts`. Token: a **dedicated integration account** holding membership of the Design Support boards only — never a personal admin token (Trello cannot scope a token per board). Optimistic UI with rollback on failure; every call writes `audit_log` and `sync_runs` rows (§5.3).
- **Recorded consequence**: BRD §9's "write is impossible by permission" is no longer true — amend before the vendor assessment (tracked in STATE.md).

## D10 — Capacity: copied from ARES, not computed

- **Decision**: Capacity comes from ARES `steering.deliveryForecast.referenceWeeks` (least/typical/most productive week by card count) plus `effectiveWeeklyRate`; the sync copies these into `projects` each run so a PM override is visible against a current baseline (§5.3a, BR-6a).
- **Caveat**: Reference weeks count all cards incl. work/ops cards; deliverable-level typical is lower — revise once ARES can report deliverable-only completions.

## D11 — Model refresh: nightly, per project, delta-tracked

- **Decision**: Nightly per project over `model_window_months`: read `card_events` → derive design time (working-lane dwell) and review time (*Sent for Client Review* dwell) → percentiles by difficulty × lane × metric → throughput percentiles per difficulty → write `model_grid` + `throughput_grid` and record the delta from the previous run (§5.4).
- **Rationale**: BR-2/BR-3 — the empirical model is the only forecast users see, and its rebuild is a release gate. A grid that shifts sharply overnight means the input changed, and someone should look.
- **Open tuning input**: OD-2 (window 6 vs 12 months; schema defaults 12) — PM decision, phase 6 tuning, not blocking.

## D12 — Port source for `lib/`

- **Decision**: `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` port verbatim from the pre-validated prototype; golden tests (AC-10) prove the port before anything else uses them; `lib/forecast.legacy.ts` (the workbook formula) survives for migration tests only and is never imported by UI code.
- **Deviation on file, approved by JP 2026-08-03** (STATE.md): the original `frost-sirius-v1.jsx` is unavailable; the compiled bundle `docs/frost-sirius-v1.html` stands in as port source, making the golden tests the sole proof of fidelity. If the `.jsx` surfaces, it supersedes the bundle.

## Remaining open items (tracked, not blocking Phase 1 design)

| Item | Owner | Blocks |
|---|---|---|
| OD-1 ARES interface | Engineering/JP | Sequence item 4 (BLOCKED) |
| OD-2 model window 6/12 mo | PM | Phase 6 tuning only |
| OD-4 ack expiry policy | PM | Phase 8a detail |
| OD-5 `Client Approval` ongoing/done | PM | BR-10 keyword rules |
| OD-6 v1 projects beyond GCash | Leadership | Seed data |
| OD-7 retention policy | Leadership | Phase 9 |
| OD-8 hosting confirmation | Leadership | Infra work (plan assumes Frost GCP) |
| Duplicate staging Trello board | JP | Phase 8 |
| BRD §9 amendment (urgency write) | JP | Vendor assessment |
