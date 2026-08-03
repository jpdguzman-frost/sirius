# Quickstart — Sirius v1 local development & validation

## Prerequisites

- Node.js (LTS), Docker, git
- No production data, no production credentials — local runs entirely on fixtures (invariant 16: real briefs never touch a developer laptop)

## Setup (Implementation Plan §7)

```bash
git clone git@github.com:jpdguzman-frost/sirius.git && cd sirius && npm install
docker compose up -d postgres          # local db
cp .env.example .env.local             # fill in
npx prisma migrate dev
npm run seed                           # fixture cards + a CSV intake fixture
npm run dev
```

## Environment (§3.4)

```
DATABASE_URL=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_HD=frostdesigngroup.com

ARES_DATABASE_URL=            # or ARES_API_URL + token, per OD-1
TRELLO_API_KEY=
TRELLO_WRITE_TOKEN=           # dedicated integration account — staging/local: DUPLICATE board only
INTAKE_SHEET_IDS=             # per project, from the projects table
APP_BASE_URL=
```

Sheets needs no credential variable — in GCP, Application Default Credentials resolve the attached identity. Locally the sheet is a CSV fixture (§3.3).

## Environments (§3.3)

| Env | Data | Trello | Sheets |
|---|---|---|---|
| local | seed | duplicate board | CSV fixture |
| staging | prod copy | **duplicate board** | copy of the sheet |
| production | live | live | live |

## Validation scenarios

Run after any change; all must pass before a phase is called done.

1. **Static + unit**: `npm run typecheck && npm run lint && npx vitest run` — green, no exceptions.
2. **Golden tests (AC-10, gate for sequence item 3)**: the ported `lib/forecast.legacy.ts` produces dates identical to the workbook for identical inputs across the golden fixture set. JP confirms the gate; it is never self-certified.
3. **Seed & scope (AC-4)**: with two fixture projects seeded, switch projects in the UI — every view swaps, no data bleeds.
4. **Authz matrix (AC-1, AC-2, AC-3)**: non-Frost session denied with a clear reason; Frost session off the allow-list denied; session calling another project's API gets 403.
5. **Sheet sync counts (AC-6)**: sync against the current-data fixture yields 495 imported / 495 reserved / 8 rejected.
6. **Degraded mode (AC-19)**: stop the sync source; last good data still renders, error surfaced, app usable.
7. **Urgency (FR-4.6/4.7, staging only, duplicate board)**: toggle urgency — label appears/disappears on the duplicate board; force a failure — local state rolls back; `audit_log` and `sync_runs` rows exist for every attempt. **Verify the configured board ID is not a production board before running (invariant 17).**
8. **Keyboard path (AC-20)**: slot a row without a pointer.

Deploy pipeline (§6) runs 1 automatically on push; nothing reaches production without its migration having run against staging first.
