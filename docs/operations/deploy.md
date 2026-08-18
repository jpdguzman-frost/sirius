# Sirius — production deploy & operations runbook

Sirius is **LIVE** at `https://platforms.frostdesigngroup.com/sirius` and has been
since 2026-08-05. **There is no staging tier** (JP, 2026-08-05: "we don't really
stage platform — anything we deploy goes live"): every deploy goes straight to the
production instance, and safety comes from data, not environment — Trello writes
are gated per project (`writes_enabled`) and by the invariant-17 board guard below.

Per OD-8 (resolved 2026-08-03): Sirius runs on the same host as ARES, uses the
same Mongo server (its own `sirius` database), and follows the ARES deploy
pattern. Invariant 15: all secrets live in the host's `.env`, never the repo.

Host architecture — the Apache + certbot vhost, proxy config, port choice, and the
full provisioning history (gates G2–G7) — is specified in
`docs/operations/server-setup.md`;
**where that spec and this runbook differ on server architecture, the spec wins.**
This runbook is the reference for the `.env` key list, the deploy procedure, the
smoke checklist, backup/restore, and user administration.

## The live instance

| Fact | Value |
|---|---|
| URL | `https://platforms.frostdesigngroup.com/sirius` · health: `…/sirius/healthz` |
| Host | the ARES droplet; files at `/mnt/volume_sgp1_01/platforms/sirius` |
| Proxy | Apache :443 + Let's Encrypt (certbot-renewed) → `127.0.0.1:3955`, `/sirius` prefix NOT stripped, `X-Forwarded-Proto https` (`docs/operations/server-setup.md` §3) |
| Port | **3955** (JP, 2026-08-05) |
| Processes | pm2 under nvm node: `sirius` (web, `npm run start`) + `sirius-worker` (`npm run worker`) |
| Env | `NODE_ENV=production` · database `sirius` · `BASE_PATH=/sirius` |
| Projects | **rt-837** (`hLL7WW2V`) — the LIVE production project, observation mode (`writes_enabled: false`), capacity **LOCKED at 120** (Option B structural lock; an admin unlock is audited — `decisions/0016` + `0018`) · **rt-test** (`tx8gDsTH`) — the TEST board, writes on, unlocked, 8 intake fixture rows, zero sprints |

**rt-837 is live production data.** Every example, drill, and round-trip in this
runbook uses `rt-test` / `tx8gDsTH` only.

The session cookie is `secure` in production (`src/app.ts`), so sign-in only
works over TLS — the Apache vhost terminates it.

## Host `.env` — the complete key list

Never committed, never synced by deploy — hand-provisioned on the host (0600).
The source of truth for this list is the Zod schema in `src/config/env.ts`;
`validateEnv` refuses to boot production without `MONGODB_URI`, `REDIS_URL`,
`SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ARES_URL`,
`ARES_API_KEY`.

- `NODE_ENV=production` (the schema's enum also lists `staging` — it exists in
  code only; no staging tier is deployed)
- `PORT=3955`
- `BASE_PATH=/sirius` (serve under the base path on the platforms host; default
  `''` — nothing changes for local dev/tests. See `docs/operations/server-setup.md` §4)
- `APP_BASE_URL=` (the OAuth callback is built as
  `<APP_BASE_URL>/auth/google/callback` — `src/auth/passport.ts`; on the host
  that must resolve to
  `https://platforms.frostdesigngroup.com/sirius/auth/google/callback`)
- `MONGODB_URI=mongodb://localhost:27017/sirius`
- `REDIS_URL=redis://localhost:6379`
- `SESSION_SECRET=` (generate: `openssl rand -hex 32`)
- `GOOGLE_CLIENT_ID/SECRET=` (the ARES OAuth client, reused — JP, 2026-08-05;
  callback URL above) — required for SSO, boot refuses without them
- `ALLOWED_HD=frostdesigngroup.com` (the `hd`-claim check; this is also the
  schema default, so it may be omitted)
- `ARES_URL=https://ares.frostdesigngroup.com` · `ARES_API_KEY=` (read-only key)
- `ARES_WEBHOOK_SECRET=` (generate: `openssl rand -hex 32`; the SAME value goes
  into ARES's push subscriber config — see `docs/operations/ares-push-spec.md`.
  Unset = push disabled; the 15-min poll carries everything)
- `TRELLO_API_KEY=` · `TRELLO_TOKEN=` (dedicated integration account;
  `TRELLO_WRITE_TOKEN` is accepted as a fallback name for older env files)
- `GOOGLE_SHEETS_CREDENTIALS=` · `INTAKE_SHEET_IDS=` (deferred — a JP gate;
  lights up Requests + requestor/type on real data)
- `PROD_TRELLO_BOARD_IDS=hLL7WW2V` — **the invariant-17 guard**
  (`src/services/guard.ts`): any NON-production environment configured with a
  board on this list refuses to start, so a laptop or test env can never write
  to the production board. Inert in production; kept in every env regardless.
- `DEV_AUTOLOGIN=` — dev-only auto-login, honoured EXCLUSIVELY when
  `NODE_ENV=development` (allow-list still checked). Never set on the host.

## Each deploy (from the laptop)

1. Host coordinates live in gitignored `deploy.local.sh` (sourced by
   `deploy.sh`; env vars `DEST_USER` / `DEST_HOST` / `DEST_PORT` / `DEST_DIR` /
   `SSH_KEY` — `DEST_DIR=/mnt/volume_sgp1_01/platforms/sirius`). Nothing
   infrastructure-shaped is committed.
2. `./deploy.sh` — refuses on red tests/typecheck; builds the frontend; rsyncs
   only runtime files (`.env` is never synced); then remotely (sourcing
   `~/.nvm/nvm.sh`): `npm ci --omit=dev` + **`npm run migrate`** (automatic,
   version-controlled, idempotent) + pm2 restart of `sirius` and
   `sirius-worker`.

Remote node runs under nvm at `/root/.nvm/versions/node/v24.4.1/bin` — prefix
`PATH` with it when running `npx` by hand over ssh (host probes, scripts).

## Local development (from the laptop)

```bash
SESSION_SECRET=dev-visual-check-only \
  DEV_AUTOLOGIN=jpdguzman@frostdesigngroup.com npm run dev
```

Serves on **3955** against the host `mongod` on **27017**. Any non-production
environment must carry `PROD_TRELLO_BOARD_IDS=hLL7WW2V` so the invariant-17
guard can refuse the production board. Probes and seeds point at ISOLATED
databases only — `scripts/seed.ts` does `deleteMany({})` on every collection
(`test/CLAUDE.md` rule 7).

## Onboarding a project (first boot on a fresh instance)

```bash
cd /mnt/volume_sgp1_01/platforms/sirius && source ~/.nvm/nvm.sh
npm run migrate                       # version-controlled, idempotent
CODE=rt-test BOARD=tx8gDsTH NAME="GCash: Design Support (test)" \
  npx tsx scripts/migrate-open-cards.ts    # full ARES sync + model refresh + summary
# allow-list yourself — see "Adding users" below
pm2 logs sirius --lines 50            # verify boot + guard messages
```

`WRITES=0` onboards a project read-only (observation mode — how rt-837 went
live at G7): the write registry refuses writes for it until JP flips
`writes_enabled`.

## Smoke checklist

Run after any deploy that touches auth, writes, or sync (G6 execution record in
`docs/operations/server-setup.md` §7): sign in with a Frost account · non-Frost account
denied · authz matrix script · urgency round-trip on the TEST board
(`BOARD=tx8gDsTH npx tsx scripts/urgency-roundtrip.ts`) · due-date round-trip
(`BOARD=tx8gDsTH npx tsx scripts/due-roundtrip.ts`) · backup/restore drill on
the shared mongod · log hygiene spot-check.

## Backup & restore (NFR-8 — drill passed 2026-08-05)

- **Backup**: `mongodump --db sirius --out /mnt/volume_sgp1_01/platforms/sirius/backups/<stamp>`
  (~124 KB at pilot scale; `deliverables_v` dumps as a view definition, not data — restores
  correctly as a view).
- **Restore test** (the quarterly drill): `mongorestore --nsFrom "sirius.*" --nsTo
  "sirius_restore_test.*" <dir>` → compare collection counts → drop the scratch db.
- **Disaster restore**: `mongorestore --db sirius <dir>/sirius` onto a clean server, then
  `npm run migrate` (idempotent) and redeploy — sessions are disposable (Redis), users
  re-sign-in.
- **Nightly schedule INSTALLED 2026-08-05** (JP chose whole-box coverage): `/etc/cron.d/
  mongo-backup` runs `/mnt/volume_sgp1_01/backups/mongo-backup.sh` at 03:30 Manila — ALL
  databases, gzipped (~23 MB/run today), 30-day retention, log at `backups/mongo/backup.log`.

## Adding users

`ssh` to the host, then:
```bash
cd /mnt/volume_sgp1_01/platforms/sirius && source ~/.nvm/nvm.sh
EMAIL=person@frostdesigngroup.com NAME="Person" CODE=rt-test npx tsx scripts/allowlist.ts
```
Allow-lists the account (auth check #4) and grants membership to the CODE project. Repeat
with another CODE for more projects; omit CODE for allow-list only. `ADMIN=1` promotes to
admin (FR-10.8 — promote/demote is CLI-only). Deactivate: flip `active:false` on the users
doc — revokes live sessions on their next request.

_last-verified: 2026-08-18_
