# Quickstart — Sirius v1 local development & validation

## Prerequisites

- Node.js (LTS), Docker, git
- No production data, no production credentials — local runs entirely on fixtures (invariant 16: real briefs never touch a developer laptop)

## Setup

```bash
git clone git@github.com:jpdguzman-frost/sirius.git && cd sirius && npm install
docker compose up -d mongo redis       # local datastore + sessions
cp .env.example .env                   # fill in
npm run migrate                        # version-controlled scripts: indexes + deliverables_v view
npm run seed                           # fixture cards + a CSV intake fixture
npm run build                          # frontend/build.js — concatenate Ractive templates/JS/CSS
npm run dev                            # web + worker
```

## Environment (server-side only — invariant 15 as amended; never in repo, bundle, or logs)

```
MONGODB_URI=                  # local: docker; staging/prod: the shared ARES Mongo server, db "sirius"
REDIS_URL=
SESSION_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_HD=frostdesigngroup.com

ARES_URL=https://ares.frostdesigngroup.com   # see contracts/ares-read.md
ARES_API_KEY=                 # READ-ONLY key class — server-side only, never a browser
TRELLO_API_KEY=
TRELLO_WRITE_TOKEN=           # dedicated integration account — staging/local: DUPLICATE board only
GOOGLE_SHEETS_CREDENTIALS=    # service-account credential, provisioned as a server-side secret
INTAKE_SHEET_IDS=             # per project, from the projects collection
APP_BASE_URL=
```

## Environments

| Env | Data | Trello (write path) | ARES | Sheets |
|---|---|---|---|---|
| local | seed fixtures | duplicate board | fixture JSON or dev key | CSV fixture |
| staging | prod copy | **duplicate board** | read-only key | copy of the sheet |
| production | live (shared ARES Mongo server, own db) | live | read-only key | live |

## Validation scenarios

Run after any change; all must pass before a phase is called done.

1. **Static + unit**: `npm run typecheck && npm run lint && npx vitest run` — green; then the dual-timezone run: `TZ=UTC npx vitest run && TZ=Asia/Manila npx vitest run` (invariant 11 — results must be identical).
2. **Golden tests (AC-10, gate for sequence item 3)**: the ported `lib/forecast.legacy.ts` produces dates identical to the workbook for identical inputs across the golden fixture set. JP confirms the gate; it is never self-certified.
3. **Seed & scope (AC-4)**: with two fixture projects seeded, switch projects in the UI — every view swaps, no data bleeds.
4. **Authz matrix (AC-1, AC-2, AC-3)**: non-Frost session denied with a clear reason; Frost session off the allow-list denied; session calling another project's API gets 403.
5. **ARES contract (phase 4)**: probe the documented shapes against `openapi.yaml` (drift check, CI too); confirm cards + movements land, `card_events` idempotent on re-run; measure end-to-end freshness against NFR-3 (< 15 min — JP: new ARES is realtime).
6. **Sheet sync counts (AC-6)**: sync against the current-data fixture yields 495 imported / 495 reserved / 8 rejected.
7. **Degraded mode (AC-19)**: stop the sync source; last good data still renders, error surfaced, app usable.
8. **Urgency (FR-4.6/4.7, staging only, duplicate board)**: toggle urgency — label appears/disappears on the duplicate board; force a failure — local state rolls back; `audit_log` and `sync_runs` documents exist for every attempt. **Verify the configured board ID is not a production board before running (invariant 17).**
9. **Keyboard path (AC-20)**: slot a row without a pointer.

Deploy pipeline (plan.md) runs 1 automatically on push; nothing reaches production without its migration scripts having run against staging first.
