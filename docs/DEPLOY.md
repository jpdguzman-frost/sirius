# Sirius — server setup & deploy runbook (staging beside ARES)

Per OD-8 (resolved 2026-08-03): Sirius runs on the same host as ARES, uses the
same Mongo server (its own `sirius` database), and follows the ARES deploy
pattern. Invariant 15: all secrets live in the host's `.env`, never the repo.

## One-time server setup

1. **Prereqs already on the ARES host**: Node LTS, the shared mongod, Redis,
   pm2. Verify: `node -v`, `redis-cli ping`, `pm2 -v`.
2. **Directory**: create e.g. `/mnt/<volume>/sirius` (mirror ARES's layout).
3. **Host `.env`** (never committed — copy keys from `.env.example`):
   - `NODE_ENV=staging` (staging) / `production` (later)
   - `MONGODB_URI=mongodb://localhost:27017/sirius` (`sirius-staging` for staging)
   - `REDIS_URL=redis://localhost:6379`
   - `SESSION_SECRET=` (generate: `openssl rand -hex 32`)
   - `GOOGLE_CLIENT_ID/SECRET=` (Google OAuth Web client; callback
     `https://<host>/auth/google/callback`) — required for real SSO
   - `ARES_URL=https://ares.frostdesigngroup.com` · `ARES_API_KEY=` (read-only key)
   - `TRELLO_API_KEY=` · `TRELLO_TOKEN=` (dedicated integration account)
   - **Staging safety (invariant 17)**: `PROD_TRELLO_BOARD_IDS=hLL7WW2V`
     — staging then refuses any urgency write to the production board;
     the staging project points at the TEST board `tx8gDsTH`.
   - Sheets (deferred): `GOOGLE_SHEETS_CREDENTIALS=` when the sheet stabilises.
4. **Reverse proxy / TLS**: same pattern as ARES (nginx/caddy) → port from
   `PORT=` (pick a free one, e.g. 3100). Cookie is `secure` in staging/prod,
   so TLS is required for sign-in.

## Each deploy (from the laptop)

1. Fill `deploy.sh` `DEST_*` once (same values as ARES's deploy.sh, different
   `DEST_DIR`).
2. `./deploy.sh` — refuses on red tests/typecheck; builds the frontend; rsyncs
   only runtime files (`.env` is never synced); remote `npm ci` + `npm run
   migrate` + pm2 restart of `sirius` (web) and `sirius-worker`.

## First boot on staging

```bash
cd <DEST_DIR>
npm run migrate                       # version-controlled, idempotent
CODE=rt-837 BOARD=tx8gDsTH NAME="GCash: Design Support (staging)" \
  npx tsx scripts/migrate-open-cards.ts    # onboard against the TEST board
# allow-list yourself:
node --input-type=module -e "…create users doc + user_projects…"  # or via mongosh
pm2 logs sirius --lines 50            # verify boot + guard messages
```

Smoke checklist (phase 9 starts here): sign in with a Frost account ·
non-Frost account denied · authz matrix script · urgency round-trip on the
TEST board (`BOARD=tx8gDsTH npx tsx scripts/urgency-roundtrip.ts`) ·
backup/restore drill on the shared mongod · log hygiene spot-check.

## What production changes later

`NODE_ENV=production`, `MONGODB_URI=.../sirius`, the real board on the
project config, `PROD_TRELLO_BOARD_IDS` kept everywhere non-production, and
the pilot go/no-go per *Pilot Security Readiness*.
