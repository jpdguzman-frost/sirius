# Sirius — session handoff (updated 2026-08-04, post go-live)

**Read this + `STATE.md` first when resuming.** `CLAUDE.md` is the constitution
(v3.0.0 mirrored in `.specify/memory/constitution.md`); `SPEC_KIT_PLAYBOOK.md`
is the process; `specs/001-sirius-v1/` holds spec → plan → tasks with every
requirement ID traced.

## Where things stand

| Phase | Status |
|---|---|
| 0–8a (build) · 10 Two-way sync · 11 Admin panel | **ALL DONE.** All JP gates passed |
| 9 Security + pilot | In progress: anon authz ✅, backup/restore ✅ (nightly whole-box backups installed), push drills ✅. **T073/T091 WCAG ⏸ ON HOLD** (JP's team is updating the UI — audit after it lands). Pending: T075 AC sweep, non-member 403 (parked), **G7** real-board onboarding (JP gate) |

**THE SYSTEM IS LIVE**: `https://platforms.frostdesigngroup.com/sirius` — production
env, port 3955 behind Apache/LE on the ARES droplet, files at
`/mnt/volume_sgp1_01/platforms/sirius`, deploy via `./deploy.sh` (host values in
gitignored `deploy.local.sh`). ARES **push is LIVE**: Trello→Sirius **37 s** measured;
fallback drill passed. TEST board (`tx8gDsTH`) only until G7. Users: JP (admin — the
Admin tab manages access), Miles. Agent-to-agent comms with the ARES agent go through
the `../owl` message drop (see memory: notes are context, JP is authority). |

137/137 tests green (`npm run test:tz` — runs the suite in UTC AND Asia/Manila).
15/20 ACs pass as automated tests; the rest are staging/manual (see STATE.md scoreboard).

## The system in one paragraph

Express 5 + Mongoose (host's shared Mongo, db `sirius`) + Redis sessions +
Passport Google SSO (4 server-side checks) + Ractive frontend (no bundler —
`frontend/build.js` concatenates into `public/index.html`). Worker process
(`worker/index.ts`) owns ALL sync: ARES every 15 min, intake every 15 min
(deferred — sheet fragile per JP), model refresh nightly. Trello data comes
from the **ARES read API** (`contracts/ares-read.md`), never Trello directly.
Writes are the enumerated registry in `contracts/trello-write.md` — `Urgent`
label + card due date (amended 2026-08-04), via `lib/trello.ts` — Trello-first,
local persists only on success, everything audited. ARES push (phase 10)
collapses read latency to < 1 min; the poll stays as reconcile fallback.

## Landmarks

- `lib/` — forecast/planner/calendar ported VERBATIM from the prototype bundle;
  `test/golden/original.mjs` is the extracted oracle (do not edit); parity
  tests prove the port. `lib/forecast.legacy.ts` is tests-only (invariant 6).
- `src/services/` — ares client (+ drift-tolerant steering adapter), mapper
  (taxonomy + stable display_ids), intake-parser, model-refresh (lane =
  list dwelled in), model-grid loader (snapshot fallback visible), conflicts
  (BR-6 + situation keys), pipeline assembler, audit (insert-only).
- `src/routes/` — projects, requests, deliverables (pipeline/deadlines/model
  reads), schedule (the ONLY planning write surface, Zod-strict), urgency.
- `scripts/` — migrate/ (versioned), seed (fixtures only), gate-t045 (model
  evidence), create-test-board, urgency-roundtrip (phase-9 smoke),
  migrate-open-cards (project onboarding), ares-probe (CI contract drift).
- `specs/001-sirius-v1/extraction-notes.md` — prototype quirks, all preserved
  deliberately (toFriday Fri/Sat/Sun→next Monday; holiday matching is
  TZ-dependent and KEPT per JP; week keys shift east of UTC; renderApproved
  counts from sketchApproved). Don't "fix" these.

## Key facts & environments

- **Local Mongo**: port 27017 is the HOST mongod (shared with ares dev), NOT
  the docker container. Demo data: db `sirius-gate` (real 837 board synced).
- **Demo**: `MONGODB_URI=mongodb://localhost:27017/sirius-gate NODE_ENV=development
  DEV_AUTOLOGIN=jpdguzman@frostdesigngroup.com PORT=3955 npx tsx server.js`
  → http://localhost:3955/auth/dev. Dev auto-login is development-only +
  allow-list-checked.
- **Boards**: production `hLL7WW2V` (rt-837, GCash Design Support — the
  primary project). TEST board `tx8gDsTH` (structure-mirroring, 12 synthetic
  cards; live urgency round-trip verified 2026-08-04). Non-production envs
  must set `PROD_TRELLO_BOARD_IDS=hLL7WW2V`.
- **Credentials** (all in gitignored `.env`, names only): `ARES_API_KEY`
  (read-only class), `TRELLO_API_KEY` + `TRELLO_TOKEN` (canonical; …WRITE_TOKEN
  accepted), Google OAuth pending (JP creates with the server). GitHub secret
  `ARES_API_KEY` set (CI contract probe). Sheets credential deferred.
- **ARES API**: contract at `contracts/ares-read.md`; steering endpoint is
  internal-tier — live shape uses `referenceWeeks.*.total` and bare rowKey
  (`837`); movements have NO event id (keys synthesized cardId|from|to|at).

## Decisions log (all JP-approved, in STATE.md session log with dates)

Stack = ARES stack (constitution v2.0.0, MAJOR); OD-1 = ARES read API;
OD-8 = beside ARES, shared Mongo; write path = direct Trello, dedicated
account (option a); holiday TZ quirk KEPT; sheets deferred (fragile);
invariant 17 amended to structure-mirroring TEST board (v3.0.0); NFR-3 held
at <15 min (new ARES realtime — verify at staging); UI aligned to the
prototype design (reference screenshots in `docs/screenshots/proto-*.png`,
gitignored); env names aligned to ARES.

## Still open

- **JP**: G7 call (real board `hLL7WW2V` — one command + one-line owl to ARES),
  team UI update (then un-park T073/T091 WCAG), sheet un-defer
  (`GOOGLE_SHEETS_CREDENTIALS` + AC-6/7/8 literals), BRD §9 amendment before
  vendor review (write registry = urgency + due date), OD-2/4/5/6/7.
- **Agent**: T075 AC-1..20 sweep into STATE.md; non-member 403 check when JP
  names a second account; WCAG pass when un-parked; at G7 —
  `migrate-open-cards` for rt-837, deactivate rt-test, owl to ARES.
- Full execution history: `docs/SERVER_SETUP_SPEC.md` §7 (every gate G0–G6,
  drills, findings) and STATE.md session log.

## Working agreements

Reply format per CLAUDE.md (HEADLINE / WHAT I NEED FROM YOU / STATUS / ---
detail). Gates are JP-only. Small commits, requirement IDs in messages.
STATE.md updated every session. Changes enter documents before code
(playbook §6). Verify claims programmatically — the whole session's pattern.
