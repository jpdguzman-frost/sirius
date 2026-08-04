# Sirius — server setup & go-live specification

**Status**: DRAFT for JP approval — nothing in here has been executed.
**Written**: 2026-08-05. Supersedes the generic runbook in `DEPLOY.md` where they differ;
`DEPLOY.md` remains the reference for the `.env` key list and the smoke checklist.
**Rule of engagement (JP)**: every phase below has an explicit approval gate. No command
touches the server before the gate for its phase is given. Discovery is read-only.

## 1. Intent (as articulated, for sign-off)

JP is standing up a shared **platforms host** — `platforms.frostdesigngroup.com` — as the
umbrella for Frost's internal tools. Sirius is the first tenant and lives under the **base
path `/sirius`**, with its files at `/mnt/volume_sgp1_01/platforms/sirius`. The pattern is
deliberate: future tools join as `/toolname` + `/mnt/volume_sgp1_01/platforms/<toolname>`
without new DNS or certificates each time.

The host is the **existing ARES droplet** (reachable per `docs/deploy.sh`, gitignored — host,
port, user, key live there and nowhere else in this repo). Sirius deploys beside ARES exactly
as OD-8 resolved: same Mongo server (own database), same Redis, same pm2, same rsync-based
deploy pattern. The web tier is **Apache** with **Let's Encrypt** (certbot) — the team's
current tooling — terminating TLS for `platforms.frostdesigngroup.com` and reverse-proxying
`/sirius` to the Node process on localhost.

First boot is **staging-mode on the live URL** (recommended, §6): `sirius-staging` database,
TEST board `tx8gDsTH`, `PROD_TRELLO_BOARD_IDS=hLL7WW2V` so the production board physically
cannot be written. After the phase-9 drills pass, the same instance flips to production
config — that flip is its own JP gate.

## 2. Facts and constraints

- ARES's deploy pattern (from `docs/deploy.sh`): rsync over SSH → `npm install --production`
  → env validation → pm2 restart; node runs under **nvm** for the deploy user, so every
  remote command sources `~/.nvm/nvm.sh` first. Sirius's `deploy.sh` already mirrors this
  (tests + build refuse-on-red locally, `.env` never synced) and boots pm2 via npm scripts
  (`sirius` = `npm run start`, `sirius-worker` = `npm run worker` — tsx runtime, a runtime
  dependency, survives `--omit=dev`).
- Secrets live in the host's `.env` only (invariant 15). The `.env` key list is in
  `DEPLOY.md`; nothing is committed, nothing is echoed into logs or this spec.
- The app currently assumes it is served at the **domain root**. Serving under `/sirius`
  requires a small, testable code change (§4) — the only code change in this spec.
- Auth (staging and production) requires the Google OAuth client to exist first:
  `validateEnv` refuses to boot staging without `GOOGLE_CLIENT_ID/SECRET`. Callback URL:
  `https://platforms.frostdesigngroup.com/sirius/auth/google/callback`.
- Let's Encrypt HTTP-01 requires the DNS A record for `platforms.frostdesigngroup.com` to
  point at the droplet **before** certbot runs.
- ARES's push subscriber (when the ARES-side build lands) targets
  `https://platforms.frostdesigngroup.com/sirius/api/webhooks/ares`.

## 3. Target architecture

```
DNS A: platforms.frostdesigngroup.com → droplet
Apache :443 (LE cert, certbot-managed renewal)
  vhost platforms.frostdesigngroup.com
    ProxyPass        /sirius  http://127.0.0.1:3100/sirius   (prefix NOT stripped)
    ProxyPassReverse /sirius  http://127.0.0.1:3100/sirius
    ProxyPreserveHost On · X-Forwarded-Proto "https"          (app has trust proxy)
    /                 → placeholder page (future tools index)
Apache :80 → 301 to https (certbot default)

pm2 (nvm node):
  sirius          npm run start    PORT=3100  BASE_PATH=/sirius
  sirius-worker   npm run worker

/mnt/volume_sgp1_01/platforms/sirius   ← rsync target (DEST_DIR)
  .env (hand-provisioned, never synced)
Mongo: localhost — db sirius-staging → sirius at the flip
Redis: localhost — session prefix sirius:sess: (already namespaced)
```

Port **3100** assumed free — verified in discovery; changed there if taken.

## 4. Code change required first: `BASE_PATH` (needs JP approval)

One env var, default `''` (nothing changes for local dev/tests), `BASE_PATH=/sirius` on the
host:

- **Server**: mount the entire app (routes, static, 404 handler) on a parent router at
  `BASE_PATH`; session cookie `path` = `BASE_PATH || '/'`; auth redirects (`/`,
  `/auth/failed`, `/auth/dev`) prefixed. The OAuth callback already honours `APP_BASE_URL`.
- **Frontend**: all API calls already flow through the single `api` helper; it derives the
  prefix from the page's own URL at runtime (served at `/sirius/` → prefix `/sirius`), so
  the same built bundle works at root locally and under the path in production. The one
  hard-coded `window.location.href = '/auth/dev'` goes through the same helper.
- **Tests**: existing suite must stay green with `BASE_PATH` unset; new cases prove routes,
  static, cookie path and redirects under `BASE_PATH=/sirius` (supertest against the
  prefixed paths), including the webhook route.

Estimated: half a day including tests. Ships as its own commit(s) before any server work
depends on it.

## 5. Phased runbook — each phase gated on JP's go

| Gate | Phase | Actions | Touches server? |
|---|---|---|---|
| **G0** | Spec approval | JP approves this document, §6 decisions answered | no |
| **G1** | Base-path code | §4 change + tests, committed, suite green | no |
| **G2** | Discovery (READ-ONLY) | SSH in; record: Apache version + enabled modules (proxy, ssl) + existing vhosts; certbot presence + existing certs; node/nvm + pm2 versions; mongod + redis reachable on localhost; port 3100 free; disk on `/mnt/volume_sgp1_01`; ufw/firewall state. Output: a findings block posted to JP; NO writes | read-only |
| **G3** | Provision | `mkdir -p /mnt/volume_sgp1_01/platforms/sirius`; write host `.env` from `DEPLOY.md` list (staging values; secrets generated on-host or provided by JP, never pasted into chat); fill local `deploy.sh` `DEST_*` (dir `platforms/sirius`, host/port/key per `docs/deploy.sh`) | yes — additive only |
| **G4** | Vhost + TLS | DNS A record confirmed live (JP, §6) → write the `platforms.frostdesigngroup.com` vhost (proxy config §3, site root placeholder); `apachectl configtest`; enable site; reload; `certbot --apache -d platforms.frostdesigngroup.com`; verify auto-renewal timer. ARES's existing vhosts untouched — configtest before every reload | yes |
| **G5** | First deploy + boot | `./deploy.sh` (tests → build → rsync → `npm ci` → migrate → pm2 start both apps); onboard staging project against the TEST board (`migrate-open-cards.ts`, `CODE=rt-837 BOARD=tx8gDsTH`); allow-list JP; verify `https://…/sirius/healthz`, sign-in, tabs on synthetic data | yes |
| **G6** | Smoke → phase 9 | The `DEPLOY.md` smoke checklist + urgency & due round-trips on `tx8gDsTH`; then the phase-9 drill sequence (T069 staging half, T070–T076) each reported to JP | yes |
| **G7** | Production flip | Separate approval, after drills: `NODE_ENV=production`, db `sirius`, real board on the project config, `PROD_TRELLO_BOARD_IDS` kept everywhere non-production, pilot go/no-go per *Pilot Security Readiness* | yes |

## 6. Decisions needed from JP before G2

1. **DNS** — does `platforms.frostdesigngroup.com` already have an A record to the droplet?
   If not: JP creates it (registrar/DNS panel) before G4; G2–G3 can proceed without it.
2. **Google OAuth client** — JP creates (Google Cloud console → OAuth client, Web), callback
   `https://platforms.frostdesigngroup.com/sirius/auth/google/callback`; values go straight
   into the host `.env` at G3. Needed before G5 boot.
3. **Staging-on-live-URL confirmed?** One instance, staging config first, flip at G7
   (recommended — one URL, one vhost, the board guard carries the safety). Alternative: a
   separate `/sirius-staging` path kept permanently — more moving parts, not recommended.
4. **Approve §4** (base-path code change) and this spec as a whole (G0+G1 in one "go" if
   both are fine).

## 7. Safety rails

- ARES must never blink: no Apache reload without `configtest`; no changes inside
  `/mnt/volume_sgp1_01/ares`; no pm2 commands against the `ares` process; Mongo/Redis are
  shared services — Sirius only ever adds its own databases/keys.
- Invariant 17 the whole way: staging `.env` carries `PROD_TRELLO_BOARD_IDS=hLL7WW2V` from
  the first boot; the staging project points at `tx8gDsTH`.
- Every server session ends with a report of exactly what was run and what changed; anything
  unexpected found mid-phase stops the phase and comes back to JP.
- Rollback: pm2 keeps the previous process definition; the vhost is one file (removable +
  reload); rsync deploys are re-runnable from any git ref; migrations are versioned.
