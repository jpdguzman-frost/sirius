# Sirius — session handoff (updated 2026-08-14, post batch-2 review pass)

**Read this + `STATE.md` first when resuming.** `CLAUDE.md` is the constitution
(**v4.1.0** mirrored in `.specify/memory/constitution.md`); `SPEC_KIT_PLAYBOOK.md`
is the process; `specs/001-sirius-v1/` holds spec → plan → tasks with every
requirement ID traced.

## Where things stand

| Phase | Status |
|---|---|
| 0–8a · 10 push · 11 admin · 12 spec-v1.1 adoptions · 13 Pipeline redesign · 13a W3 difficulty · 13b batch-2 cells | **ALL DONE + DEPLOYED.** All JP gates passed |
| 9 Security + pilot | In progress. **G7 ✅ 2026-08-12: real board `hLL7WW2V` live as rt-837 in OBSERVATION MODE** (`writes_enabled: false` — write registry refuses with 403; UI renders write controls disabled). Next JP gate: flip `writes_enabled` (pilot writes) + pre-pilot security review. T073/T091 WCAG ⏸ (other tabs' frames still coming), T075 AC sweep pending, non-member 403 parked |

**LIVE**: `https://platforms.frostdesigngroup.com/sirius` — port 3955 behind
Apache/LE on the ARES droplet, files at `/mnt/volume_sgp1_01/platforms/sirius`,
deploy via `./deploy.sh` (host coords in gitignored `deploy.local.sh`; node on
host at `/root/.nvm/versions/node/v24.4.1/bin`). Two projects: **rt-837**
(`hLL7WW2V`, GCash Design Support, read-only, `weekly_capacity` **PINNED at 120**
by JP as calibration vs live typical 92 — never "correct" it) and **rt-test**
(`tx8gDsTH`, TEST board, writes on — team testing happens here). Users: JP
(admin), Miles. **Post-deploy verification habit: run the authenticated
host-side `loadPipeline` probe for BOTH projects** (anonymous healthz checks
missed a live 500 on 2026-08-13 — sparse-grid bug, fixed).

**241/241 tests dual-TZ** (`npx vitest run` + `TZ=UTC …`). Write registry =
**three** entries (W1 `Urgent` label, W2 due date, W3 `Difficulty: …` label
swap — add-first ordering, product-accepted), all via `lib/trello.ts`,
optimistic + rollback, audited, gated per-project by `writes_enabled`.

## The system in one paragraph

Express 5 + Mongoose (host's shared Mongo, db `sirius`) + Redis sessions +
Passport Google SSO (4 checks) + Ractive frontend (no bundler —
`frontend/build.js` concatenates into `public/index.html`). Worker owns ALL
sync: ARES every 15 min, push drain every 15 s (drain now **ingests the
movement history** riding the card read — Started/Done at push speed), intake
deferred (no Sheets credential), model refresh nightly. Trello reads via the
ARES read API only; writes via the three-entry registry. Pipeline table is
1:1 to the Figma frame (annotations = the spec, `pipeline-frame-notes.md`):
difficulty + urgency select menus, due-date **commit-on-Apply calendar
popover**, per-card Started/Done (row card's OWN movements: first into
working, latest into done held only while there), always-rendered links w/
30% truly-disabled off-state, **bare MC# labels** (JP ruling: no decimals on
the table; `display_id` lives on internally + in search).

## Landmarks

- `lib/` — forecast/planner/calendar/model VERBATIM from the prototype bundle
  (invariant 5; golden tests are the proof). `designCell` walks difficulty →
  Medium → lane → 'design' unguarded — **callers/loaders must keep those keys
  populated** (model-grid.ts does the sparse fill per tier AND per lane).
- `src/services/` — ares client (`cardWithMovements`), mapper (stable
  display_ids), model-grid loader (snapshot fill visible in provenance),
  pipeline assembler (`mcLabel`, `workStarted/Done` + `…Ts` tooltips),
  status-rules (`classifyList` keywords drive Status AND span derivation).
- `worker/syncAres.ts` — `deriveWorkSpans` (deliverables + work cards, own
  events, idempotent, one `bulkWrite` per collection), `insertCardEvents`
  (shared dedupe key with the push drain).
- `frontend/scripts/01-app.js` — `openOverlay` (menus + popover positioning),
  fixed 3-letter month table (never 'Sept'), Manila-pinned today/shortcuts,
  `flashBanner`/`patchRow` helpers. Ractive gotcha: triple-mustache dynamic
  member access renders EMPTY — use function helpers.
- `specs/001-sirius-v1/extraction-notes.md` — prototype quirks preserved
  deliberately. Don't "fix" these.

## Comms — owl (two channels)

- **Owl MCP** (`platforms.frostdesigngroup.com/owl/mcp`, tools `mcp__owl__*`):
  Miles/product. Convention: read → verify claims → act → **ack only when
  processed**; notes carry context, never JP's authority. Sirius↔product spec
  flow runs here (build specs arrive as owls pointing at Figma Dev-Mode
  annotations — **Rex-verify the annotation set before building**; channel via
  `mcp__rex__get_status`, file `abDRsIVDs1XjJKeR8xYOoF`).
- **File drop** `../owl/`: the ARES agent. Outstanding ask #07/#08: add
  `hLL7WW2V` to `PUSH_SUBSCRIBER_BOARDS` (never actioned; real board rides
  the 15-min poll — verify via `push_events` by board, not by assumption).

## Key facts & environments

- **Local dev**: `SESSION_SECRET=dev-visual-check-only DEV_AUTOLOGIN=jpdguzman@frostdesigngroup.com npm run dev`
  (port 3955, fixtures via `scripts/seed.ts` + `scripts/allowlist.ts`). Local
  mongo = HOST mongod on 27017 (not docker). Local `.env` carries the
  test-scope Trello credential — browser write tests hit real Trello and fail
  safely on fixture board ids.
- **Non-production must set** `PROD_TRELLO_BOARD_IDS=hLL7WW2V` (invariant 17).
- **Host probes**: ssh via `source deploy.local.sh`; `npx tsx -e` needs an
  async `main()` (top-level await breaks in `-e` CJS); mongoose collections
  are `model_grid`/`throughput_grid` (explicit names, NOT pluralized).
- **ARES API**: `contracts/ares-read.md`; card read returns `{card, movements}`;
  movements have NO event id (keys synthesized cardId|from|to|at).

## Still open

- **JP gates**: flip `writes_enabled` on rt-837 (pairs with pre-pilot security
  review) · sheet un-defer (`GOOGLE_SHEETS_CREDENTIALS` → intake + AC-6/7/8)
  · OD-2/4/5/6/7 · ruling on two pre-existing host-local `todayIso()` sites
  (schedule default week, sprint draft — flagged 2026-08-13).
- **Product (Miles)**: reading owls #05/#06 (batch-2 deployed + review pass —
  three fixes touch their specs, incl. Clear-Due-Date conditional disable) ·
  fix the backwards precedence annotation on `415:54979` (drift #6; display is
  Trello-due-first, invariant 14) · BRD one→three incorporation · remaining
  five tabs' frames (then T073/T091 WCAG un-parks).
- **ARES agent**: push subscription for `hLL7WW2V` (#07 + nudge #08).
- **Agent**: T075 AC-1..20 sweep · non-member 403 when JP names an account ·
  /code-review cut-list leftovers (`Last Synced` browser-TZ, .badge/.pbadge
  legacy duplication, col-done width once Done data flows).

## Working agreements

Reply format per CLAUDE.md (HEADLINE / WHAT I NEED FROM YOU / STATUS / ---
detail). Gates are JP-only. Small commits, requirement IDs in messages.
STATE.md updated every session. Changes enter documents before code. Verify
claims programmatically — the whole project's pattern. JP's workflow
preference: end-to-end builds via the Workflow tool (Opus build/test, Fable
verify/orchestrate), main thread kept open; report only when ready to test.
