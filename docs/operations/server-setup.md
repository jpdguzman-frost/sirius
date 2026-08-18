# Sirius — server setup & go-live specification

_last-verified: 2026-08-18_

**Status**: EXECUTED — G3–G6 executed 2026-08-05 (see the §7 log), site live at `platforms.frostdesigngroup.com/sirius`; G7 passed 2026-08-12 **as OBSERVATION MODE** (rt-837 onboarded with `writes_enabled: false`, rt-test RETAINED alongside — this differs from the §5 G7 row as originally written).
**Written**: 2026-08-05. Supersedes the generic runbook in `docs/operations/deploy.md` where they
differ; `docs/operations/deploy.md` remains the reference for the `.env` key list and the smoke checklist.
**Rule of engagement (JP)**: every phase below has an explicit approval gate. No command
touches the server before the gate for its phase is given. Discovery is read-only.

## 1. Intent (as articulated, for sign-off)

JP is standing up a shared **platforms host** — `platforms.frostdesigngroup.com` — as the
umbrella for Frost's internal tools. Sirius is the first tenant and lives under the **base
path `/sirius`**, with its files at `/mnt/volume_sgp1_01/platforms/sirius`. The pattern is
deliberate: future tools join as `/toolname` + `/mnt/volume_sgp1_01/platforms/<toolname>`
without new DNS or certificates each time.

The host is the **existing ARES droplet** (reachable per the ARES deploy script (reference copy kept outside the repo), gitignored — host,
port, user, key live there and nowhere else in this repo). Sirius deploys beside ARES exactly
as OD-8 resolved: same Mongo server (own database), same Redis, same pm2, same rsync-based
deploy pattern. The web tier is **Apache** with **Let's Encrypt** (certbot) — the team's
current tooling — terminating TLS for `platforms.frostdesigngroup.com` and reverse-proxying
`/sirius` to the Node process on localhost.

**No staging tier** (JP, 2026-08-05: "we don't really stage platform — anything we deploy
goes live"). The instance boots `NODE_ENV=production`, database `sirius`, on the live URL.
Safety during the pre-pilot window comes from data, not environment: the ONLY project
onboarded until the drills pass is the TEST board (`tx8gDsTH`), and every Trello write
resolves its board from the project — so the production board is unreachable until its
project is deliberately onboarded at G7. `PROD_TRELLO_BOARD_IDS=hLL7WW2V` stays in the env
regardless (inert in production, an extra belt anywhere else).

## 2. Facts and constraints

- ARES's deploy pattern (from the ARES deploy script (reference copy kept outside the repo)): rsync over SSH → `npm install --production`
  → env validation → pm2 restart; node runs under **nvm** for the deploy user, so every
  remote command sources `~/.nvm/nvm.sh` first. Sirius's `deploy.sh` already mirrors this
  (tests + build refuse-on-red locally, `.env` never synced) and boots pm2 via npm scripts
  (`sirius` = `npm run start`, `sirius-worker` = `npm run worker` — tsx runtime, a runtime
  dependency, survives `--omit=dev`).
- Secrets live in the host's `.env` only (invariant 15). The `.env` key list is in
  `docs/operations/deploy.md`; nothing is committed, nothing is echoed into logs or this spec.
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
    ProxyPass        /sirius  http://127.0.0.1:3955/sirius   (prefix NOT stripped)
    ProxyPassReverse /sirius  http://127.0.0.1:3955/sirius
    ProxyPreserveHost On · X-Forwarded-Proto "https"          (app has trust proxy)
    /                 → placeholder page (future tools index)
Apache :80 → 301 to https (certbot default)

pm2 (nvm node):
  sirius          npm run start    PORT=3955  BASE_PATH=/sirius
  sirius-worker   npm run worker

/mnt/volume_sgp1_01/platforms/sirius   ← rsync target (DEST_DIR)
  .env (hand-provisioned, never synced)
Mongo: localhost — db sirius (no staging tier; TEST-board project only until G7)
Redis: localhost — session prefix sirius:sess: (already namespaced)
```

Port **3955** (JP, 2026-08-05 — moved off 3100 per JP; 3950 turned out to be osiris’s — 3955 verified free on BOTH server and laptop, JP to add localhost:3955 origin/callback in the Google console for future local SSO).

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
| **G3** | Provision | `mkdir -p /mnt/volume_sgp1_01/platforms/sirius`; write host `.env` from the `docs/operations/deploy.md` list (`NODE_ENV=production`, db `sirius`, `BASE_PATH=/sirius`; secrets generated on-host, never pasted into chat); fill local `deploy.sh` `DEST_*` (dir `platforms/sirius`, host/port/key per the ARES deploy script (reference copy kept outside the repo)) | yes — additive only |
| **G4** | Vhost + TLS | DNS A record confirmed live (JP, §6) → write the `platforms.frostdesigngroup.com` vhost (proxy config §3, site root placeholder); `apachectl configtest`; enable site; reload; `certbot --apache -d platforms.frostdesigngroup.com`; verify auto-renewal timer. ARES's existing vhosts untouched — configtest before every reload | yes |
| **G5** | First deploy + boot | `./deploy.sh` (tests → build → rsync → `npm ci` → migrate → pm2 start both apps); onboard staging project against the TEST board (`migrate-open-cards.ts`, `CODE=rt-test BOARD=tx8gDsTH` — rt-837 stays reserved for the real board at G7); allow-list JP; verify `https://…/sirius/healthz`, sign-in, tabs on synthetic data | yes |
| **G6** | Smoke → phase 9 | The `docs/operations/deploy.md` smoke checklist + urgency & due round-trips on `tx8gDsTH`; then the phase-9 drill sequence (T069–T076) on the live instance (TEST-board project only), each reported to JP | yes |
| **G7** | Real-board onboarding | Separate approval, after drills: onboard the production-board project (`migrate-open-cards.ts`, `BOARD=hLL7WW2V`), deactivate/remove the TEST project, pilot go/no-go per *Pilot Security Readiness* | yes |

*G7 as passed (2026-08-12) differs from the row above: OBSERVATION MODE — rt-837 onboarded with `writes_enabled: false` and the TEST project (rt-test) retained alongside; see the record in `STATE.md`.*

## 6. Decisions — answered by JP 2026-08-05

1. **DNS** — ✅ A record for `platforms.frostdesigngroup.com` already points at the droplet.
2. **Google OAuth client** — JP creates it with the agent walking him through it, before G5
   boot (the app refuses to start without it). Callback:
   `https://platforms.frostdesigngroup.com/sirius/auth/google/callback`.
3. **No staging tier** — deploys go live; safety-by-data per §1 (TEST-board project only
   until G7).
4. **G0+G1+G2 approved** ("go", 2026-08-05).

## 7. Execution log

- **FALLBACK DRILL PASSED 2026-08-04 — T086 fully closed, FR-9.6 observed live.** ARES
  paused push 03:59–04:43Z (44 min). Mid-pause label edit (04:06) went stale exactly as
  designed, bounded: at >30 min silence Sirius wrote ONE alert `sync_runs` row, reverted to
  15-min polling, and the full sync at 04:42:14 reconciled the edit (~36 min staleness,
  inside the ~45-min worst case). On resume: ARES auto-resync (batched with the flushed
  card event) arrived 04:43:44; Sirius drained it and converged within 2 min. Alert count
  stayed at 1 — no spam. ARES-side corrections recorded in `contracts/ares-push.md`:
  no dead-letters during a pause (nothing is attempted), resyncs may batch, per-card
  debounce coalesces with latest `occurred_at`.

- **T086 PASSED 2026-08-04 — PUSH IS LIVE**: JP switched ARES on; hand-edited label on the
  TEST board reached Sirius's database **push-driven in 37 s** both directions (Trello→ARES
  ~5 s · ARES debounce ~15 s · receiver → 15-s drain tick). NFR-3 **< 1 min target MET**
  (ceiling was 15 min). Six live deliveries in the first minutes, every drain ok. Remaining
  sliver: the coordinated fallback drill (pause ARES consumer → watch our 30-min poll
  reversion + alert) — scheduled with the ARES agent for a calm moment.

- **Push contract VERIFIED end-to-end 2026-08-04/05**: ARES's shipping code probed our live
  receiver (signature accept/reject, replay window, dedupe, batch, absent-card_id resync —
  all correct) and its three real deliveries drained clean in ~1–4 s each (sync_runs
  `ares_push` ok). ARES side is deployed and OFF; switch-on is JP's call (4 env vars +
  restart on the ARES side, `tx8gDsTH` only). T086 runs the moment it flips. Correction
  absorbed: no flat `/api/v1/trello/cards` list exists — we never used it. Comms via the
  `../owl` message drop.

- **Admin panel SHIPPED 2026-08-05 (FR-10, T087–T090)**: spec → tests → build → deploy in
  one pass. JP seeded as first admin (CLI `ADMIN=1`); Miles remains a member. Live checks:
  anonymous admin API 401; the tab appears only for admins with enforcement server-side.
  T091 (AA pass over the new screens) folds into T073.

- **Nightly backups INSTALLED 2026-08-05** (JP: option b, whole box): all databases,
  gzipped, 03:30 Manila via /etc/cron.d/mongo-backup, 30-day retention; first run 23 MB ok.
  NB: the host abbreviates its +08:00 zone as "PST" (Philippine Standard Time) — schedule
  times are Manila. Miles Alba allow-listed + member of rt-test (JP request).

- **Backup/restore drill PASSED 2026-08-05 (T072, NFR-8)**: dumped `sirius` (124 KB),
  restored into a scratch db, all 17 collection counts identical, `deliverables_v` view
  definition survives dump/restore, scratch dropped; dump retained at
  `platforms/sirius/backups/20260804-1113` as backup #1. Runbook added to `docs/operations/deploy.md`.
  **Finding for JP**: the host had NO Mongo backup schedule for ANY database (ares
  included) — nightly cron + 30-day retention proposed.

- **G6 smoke IN PROGRESS 2026-08-05**: TEST board registered in ARES by JP (12 cards →
  8 deliverables + 4 work cards, 0 unlinked). LIVE on the deployed instance: due
  round-trip (set 17:00 Manila → restore) ✓ · **reconcile loop both directions** — manual
  Trello label add/remove reflected by ARES in ~5 s and reconciled into Sirius's urgency
  field on sync (FR-9.5) ✓ · HTTPS authz smoke: anonymous API reads/writes 401, unsigned
  webhook 401 ✓. NFR-3 poll leg: Trello→ARES ≈5 s + ≤15-min poll = comfortably inside the
  ceiling; the <1-min push target waits on ARES's subscribe feature (in development).
  Remaining drills: non-member 403 (needs a second Frost account), backup/restore,
  keyboard/AA, AC sweep.

- **G5 sign-in VERIFIED live 2026-08-05 (JP)**: Google SSO end-to-end through the reused
  ARES client — four auth checks passed, session persisted in Redis, app renders with the
  sync loop running. Found+fixed on the way: connect-redis v9 requires the node-redis
  client — ioredis got `ERR syntax error` on every session write (invisible locally; tests
  use the memory store). Pipeline empty as expected — awaiting JP registering `tx8gDsTH`
  in ARES; next: G6 smoke once data flows.

- **G5 DONE 2026-08-05**: first deploy green end-to-end — local suite + typecheck + build →
  rsync → `npm ci` → migrations (001–003) → pm2 `sirius` + `sirius-worker` online. Boot log
  clean; `https://platforms.frostdesigngroup.com/sirius/healthz` = ok/connected/connected
  (production); app root serves. Project `rt-test` (TEST board) onboarded; JP allow-listed
  and member. **Finding**: ARES tracks 23 boards incl. `hLL7WW2V` but NOT `tx8gDsTH` — the
  TEST board returns 0 cards, so the instance is data-empty until JP registers the TEST
  board in ARES (add ARES's Trello account to the board + register) or G7 onboards the real
  board. Write round-trips (G6) are unaffected — they talk to Trello directly.

- **G3 DONE 2026-08-05**: `/mnt/volume_sgp1_01/platforms/sirius` created; host `.env`
  provisioned (0600) — `SESSION_SECRET` + `ARES_WEBHOOK_SECRET` generated on-host, ARES +
  Trello credentials transferred without display; only `GOOGLE_CLIENT_ID/SECRET` (JP, pre-G5)
  and the deferred Sheets keys are empty. Local `deploy.sh` now sources gitignored
  `deploy.local.sh` (created, filled); remote command sources nvm.
- **G5 prelude 2026-08-05**: port moved 3100 → 3955 everywhere (JP); OAuth = the ARES
  client reused — JP added the platforms + localhost:3955 redirect URIs; client ID/secret
  copied into Sirius's `.env` server-side from ARES's `.env` (values never left the box).
- **G4 DONE 2026-08-05**: `platforms.frostdesigngroup.com` vhost enabled (configtest before
  each reload); LE certificate issued (expires 2026-11-02, certbot.timer auto-renews);
  HTTP→HTTPS 301; placeholder page at `/`; `/sirius` proxies to 127.0.0.1:3955 (503 until
  G5 boots the app — correct); `X-Forwarded-Proto https` set in the ssl vhost.

_Log ends 2026-08-05; later operations are recorded in STATE.md / docs/history/state-log/._

## 7a. G2 discovery findings (read-only, 2026-08-05)

- Ubuntu 22.04.5 · Apache 2.4.52 with proxy, proxy_http, ssl, headers, rewrite already
  enabled · certbot 1.21 managing existing certs with the `<domain>.conf` +
  `<domain>-le-ssl.conf` pattern — our vhost follows it. nginx installed but **inactive**;
  Apache owns :80/:443.
- Node v24.4.1 (nvm) · pm2 6.0.8 running 11 apps (ares among them) · Mongo 7.0.28 and
  Redis bound to localhost only.
- DNS: `platforms.frostdesigngroup.com` → droplet ✓ (verified). No Apache vhost claims the
  name (grep + `apachectl -S`): today HTTP falls through to 000-default and HTTPS to the
  default 443 vhost with a mismatched cert — our vhost + cert fixes both.
- **Port 3000 is taken** (apollo.live). 3100 free → Sirius binds 3100 as planned.
  *(Superseded: the port later moved 3100 → 3955 — see §3 and the §7 "G5 prelude" entry.)*
- `/mnt/volume_sgp1_01` exists with the platform apps at top level; `platforms/` subdir does
  not exist yet (created at G3). NB: the path sits on the root filesystem (58G, 62% used,
  23G free) — named like a block volume but isn't one.
- ufw inactive (edge protection presumably at the cloud firewall — not ours to change).
- ⚠ Observation for JP, untouched: pm2 app `ares` showed 40 restarts with 21 min uptime and
  823 MB memory at discovery time.

## 8. Safety rails

- ARES must never blink: no Apache reload without `configtest`; no changes inside
  `/mnt/volume_sgp1_01/ares`; no pm2 commands against the `ares` process; Mongo/Redis are
  shared services — Sirius only ever adds its own databases/keys.
- Invariant 17 the whole way: staging `.env` carries `PROD_TRELLO_BOARD_IDS=hLL7WW2V` from
  the first boot; the staging project points at `tx8gDsTH`.
- Every server session ends with a report of exactly what was run and what changed; anything
  unexpected found mid-phase stops the phase and comes back to JP.
- Rollback: pm2 keeps the previous process definition; the vhost is one file (removable +
  reload); rsync deploys are re-runnable from any git ref; migrations are versioned.
