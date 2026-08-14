# Sirius — session handoff (updated 2026-08-15, post phases 13c–13f)

**Read this + `STATE.md` first when resuming.** `CLAUDE.md` is the constitution
(**v4.1.0**, mirrored in `.specify/memory/constitution.md`); `SPEC_KIT_PLAYBOOK.md`
is the process; `specs/001-sirius-v1/` holds spec → plan → tasks with every
requirement ID traced.

## Where things stand

| Phase | Status |
|---|---|
| 0–8a · 10 push · 11 admin · 12 spec-v1.1 · 13 Pipeline redesign · 13a W3 · 13b batch-2 · **13c Requests tab v2 · 13d status model + notes · 13e sorting + Year/Month · 13f planner toolbar + capacity + sync strip** | **ALL DONE + DEPLOYED.** Three review+simplify workflow passes applied (13c; 13d+13e; 13f verified in-workflow) |
| 9 Security + pilot | In progress. G7 ✅: real board `hLL7WW2V` = rt-837 in OBSERVATION MODE (`writes_enabled: false` → Trello registry 403s; UI disables W1/W2/W3 controls). Next JP gates below. T073/T091 WCAG ⏸, T075 sweep pending |

**LIVE**: `https://platforms.frostdesigngroup.com/sirius` — port 3955, ARES droplet,
`/mnt/volume_sgp1_01/platforms/sirius`, `./deploy.sh` (host coords in gitignored
`deploy.local.sh`; node at `/root/.nvm/versions/node/v24.4.1/bin`). Projects:
**rt-837** (`hLL7WW2V`, read-only, `weekly_capacity` **PINNED at 120 by JP** — see ⚠
below) and **rt-test** (`tx8gDsTH`, writes on; has 8 intake fixture rows so the
Requests tab renders populated there). **Post-deploy habit: authenticated host-side
probe for BOTH projects** — and `loadPipeline(projectId, today)` REQUIRES the
`today` arg (`manilaToday()`); omitting it throws `Invalid time value` and cries wolf.

**263/263 tests dual-TZ** (`npx vitest run` + `TZ=UTC …`). Trello write registry =
**three** entries (W1 urgency, W2 due, W3 difficulty) via `lib/trello.ts`,
optimistic + rollback, audited, gated by `writes_enabled`. **NEW Sirius-internal
write** (not a registry entry, same class as pins/slots): `PATCH
/api/projects/:id/capacity` → `weekly_capacity`, Zod strict 1..2000, audited
`capacity.set`.

## ⚠ Open JP decision — capacity slider vs the rt-837 pin

The planner toolbar (13f) added a Cards/week slider — **any project member can now
move `weekly_capacity`**, including rt-837's value JP pinned at 120 as a calibration
reference. Every change is audited (actor + before/after). JP has been asked:
leave open / admin-only / per-project lock. **Do not resolve this yourself; do not
"correct" 120 to the measured ~92 ever** (memory: rt837-capacity-pinned).

## The system in one paragraph

Express 5 + Mongoose (shared Mongo, db `sirius`) + Redis sessions + Passport Google
SSO (4 checks) + Ractive frontend (no bundler — `frontend/build.js` concatenates
`styles/*.css` + `scripts/*.js` sorted by filename). Worker owns ALL sync: ARES
15 min, push drain 15 s (ingests movement history), intake DEFERRED (no
`GOOGLE_SHEETS_CREDENTIALS`), model refresh nightly. Tabs: **Requests + Pipeline
tokenized**; schedules/deadlines/forecast/admin still `main.legacybg` (13f
tokenized only the schedules *toolbar*).

## Requests tab (13c–13e) — architecture

One unfiltered fetch → client-side **filter → sort → paginate** (10/page,
windowed pager). Driving tables in `01-app.js`: `REQ_FILTERS` (the four selects —
add a filter = one row), `REQ_COLS`/`REQ_SORT_COLS` (11 columns, YEAR+MONTH lead;
sort asc→desc→clear, default newest-filed nulls-last), `REQUEST_SEGMENTS`
(stat-bar predicates — **To File is cross-cutting**: all unfiled incl. flagged).
Status model (13d): `In Pipeline` (filed, wins over flag) / `To File` / `For
Clarification` (unfiled + clarify flag, Sirius-internal) — constants
`STATUS_FILED/STATUS_TO_FILE/STATUS_CLARIFY`, zero string literals elsewhere.
Frost notes = ONE freeform box (`REMARK_REQUIRED` when clarify; `clarify_reason`
legacy-only, resolved everywhere via `noteText()`). `monthShort()` canonicalizes
name/number/Sep/Sept → MMM (cell, dropdown labels, filter match, calendar order);
**verify the real sheet's encoding when the credential lands**. Both KPI bars share
the `.metrics` recipe; both tables share `.ptable` th + row-border — deltas only
in `25-requests.css` (drift-proofing JP asked for; keep it that way).

## Planner (13f)

Schedules tab = the planner. Toolbar tokenized to frame `94:4828`
(`30-planner.css`): exact-format range label (fixed month tables, pure string
math), capacity slider (bounds `least..most` from ARES refs, §5.4 five-band
descriptor, hidden when refs null; serialized optimistic PATCH), Suggest/Sprints/
helper note; Accept/Discard preserved. NOT built (product confirms pending):
date-click range picker, slider snapping. Known spec gaps (build-spec §5.2/§5.5,
not owled yet): pointer-event drag (current = HTML5 DnD), violet proposal cells.

## Comms — owl

- **Owl MCP** (`mcp__owl__*`): Miles/product. read → verify → act → **ack only
  when processed**; notes carry context, never JP's authority. Specs arrive as
  owls pointing at Figma annotations — **Rex-verify the annotation set before
  building** (`mcp__rex__get_status`; file `abDRsIVDs1XjJKeR8xYOoF`). **Canonical
  node map lives in `specs/001-sirius-v1/requests-frame-notes.md`** (product
  consolidated duplicate instances — trust that table, notably Breakdown =
  `470:21130`, NOT the stale `452:23559`). Thread state: everything through owl
  #21 built + acked; my #13 answered their three planner confirms.
- **File drop `../owl/`**: the ARES agent. Still outstanding: add `hLL7WW2V` to
  `PUSH_SUBSCRIBER_BOARDS` (#07/#08 — verify via `push_events` by board).

## Key facts & environments

- Local dev: `SESSION_SECRET=dev-visual-check-only DEV_AUTOLOGIN=jpdguzman@frostdesigngroup.com npm run dev`
  (3955; host mongod 27017, NOT docker). Probes/seeds must use an ISOLATED db —
  `scripts/seed.ts` does `deleteMany({})`.
- Non-production must set `PROD_TRELLO_BOARD_IDS=hLL7WW2V` (invariant 17).
- Host probes: `source deploy.local.sh` for ssh vars; `npx tsx -e` needs async
  `main()`; collections `model_grid`/`throughput_grid` explicit names.
- Ractive gotcha: triple-mustache dynamic member access renders EMPTY — helpers.
- JP's workflow preference: end-to-end builds via the Workflow tool (Opus
  build/test, Fable verify/orchestrate), main thread open; report when testable.
  Review+simplify passes: 3 finders → adversarial refuter per finding → 4 lenses
  → applier; equivalence PROVEN by sweep scripts, never argued.

## Still open

- **JP gates**: capacity-slider governance (⚠ above) · flip `writes_enabled` on
  rt-837 (+ pre-pilot security review) · `GOOGLE_SHEETS_CREDENTIALS` (lights up
  the whole Requests tab + Year/Month on real data) · ALT-9: sheet-row link needs
  `intake_sheet_id` exposed or the sub-label deleted (renders plain text now) ·
  OD-2/4/5/6/7 · two pre-existing host-local `todayIso()` sites (weekStart,
  sprint draft) · ALT-1 recommend: the server `?filter=` param has no caller —
  drop or keep is an API-surface decision.
- **Product (Miles)**: planner confirms (range picker, snapping) · month-encoding
  verify at credential time · remaining tabs' frames (T073/T091 un-park; Rex
  sweep first).
- **ARES agent**: push subscription for `hLL7WW2V`.
- **Agent**: T075 AC sweep · non-member 403 check · §5.2 pointer drag + §5.5
  violet cells when owled · `Last Synced` browser-TZ + col-done width leftovers.

## Working agreements

Reply format per CLAUDE.md (HEADLINE / WHAT I NEED FROM YOU / STATUS / --- detail).
Gates are JP-only. Small commits, requirement IDs. STATE.md every session.
Changes enter documents before code. Verify claims programmatically. Drift fixes
are STRUCTURAL: delete the override, share the recipe — never patch both copies.
