# Sirius — session handoff (updated 2026-08-18, post-restructure revision)

**Entry sequence on resume**: the constitution (root `CLAUDE.md`, **v4.4.0**,
mirrored in `.specify/memory/constitution.md`) auto-loads → read `docs/MAP.md`
FIRST (the Layer-0 skim: live status, the areas, where every kind of law
lives) → then this file + `STATE.md` (phase table, decisions, AC scoreboard).
`decisions/0001–0022` hold the WHY of settled choices — read a module's
records before changing it. `SPEC_KIT_PLAYBOOK.md` is the process;
`specs/001-sirius-v1/` holds spec → plan → tasks with every requirement ID
traced; doc layers and caps are ruled in `docs/CONTEXT_ARCHITECTURE.md`.

## Where things stand

| Phase | Status |
|---|---|
| 0–8a · 10 push · 11 admin · 12 spec-v1.1 · 13–13f (pipeline, requests, planner toolbar) | ALL DONE + DEPLOYED (see the 2026-08-15 handoff revision in git history for detail) |
| **13g Gantt planner** (owl #22) · **calendar amendment v4.2.0** · **13h URL routing** · **13i batch-3** (capacity lock B, suggest bar, legend, collapses) · **ack-key amendment v4.3.0** (T135) · **13j batch-4** (sprints modal ×4 states, drag reversal, icon cluster) | **ALL DONE + DEPLOYED + LIVE-VERIFIED 2026-08-15..17** (commits `9977f07`..`651b850`) |
| **13k batch-5** (owls #34–#36: Requests STATUS two-valued, Pipeline row warning + popover) · **batch-5b** (owl #37: Save gates on unsaved changes, blank sprint names rejected) | **DONE + DEPLOYED + LIVE-VERIFIED 2026-08-17** (commits `788734a`..`c3fbfc3`) |
| **13k batch-6** (owls #39/#40: Requestor badge truncates + hover/focus tooltip) · **batch-7 + 7b** (the Gantt bar could not be dragged with a real mouse; the affordance moved to the coloured bars) · **batch-8** (JP: the drag handle IS the coloured run) · **batch-9** (the drag ghost shows only the bars) | **DONE + DEPLOYED + LIVE-VERIFIED 2026-08-18, JP confirmed** (commits `c52d215`..`af0dd24`) |
| **Review sweep over batches 5–9** (JP: `/simplify` + `/code-review` on `646307b..HEAD`) — five defects, three hot paths, six duplicated rules collapsed | **DONE + DEPLOYED + LIVE-VERIFIED 2026-08-18** (commit `141b6df`; 794 → 821 tests dual-TZ). Digest + pointers below |
| **13k batch-10** (owl #41: the Pipeline warning becomes a 14px icon + hover card; the amber row wash is ruled away) | **DONE + DEPLOYED + LIVE-VERIFIED 2026-08-18** (commit `7bdf6b4`; 821 → 865 tests + 22 `it.todo` dual-TZ; four defects caught by the verify lenses pre-deploy — R-warn-u/v/w in `pipeline-frame-notes.md`) |
| **Context restructure stages 1–5 + JP's doc workflows** — state-log rotation · gantt-rules extraction · MAP/skim + directory CLAUDE.md files + docs/README.md · T-shape architecture + `decisions/` + per-area maps · `01-app.js` split into ten numbered pieces (byte-proven; **new built baseline `4dd5186…`**) · plain-language architecture guide (private artifact) · docs hygiene audit + JP's archival rulings (`96881a1`, `896c0a9`) | **DONE 2026-08-18** (commits `0d5e3cb`..`f2d203a`; plan+record `docs/CONTEXT_RESTRUCTURE.md`; full entry STATE.md 2026-08-18). The split is NOT yet deployed — the next feature deploy carries it (JP's call if sooner) |
| 9 Security + pilot | In progress. rt-837 still OBSERVATION MODE (`writes_enabled: false`). T073/T091 WCAG ⏸, T075 sweep pending |

**LIVE**: `https://platforms.frostdesigngroup.com/sirius` — port 3955, ARES droplet,
`/mnt/volume_sgp1_01/platforms/sirius`, `./deploy.sh` (host coords in gitignored
`deploy.local.sh`; env vars are `DEST_USER/DEST_HOST/DEST_PORT/DEST_DIR/SSH_KEY`;
node at `/root/.nvm/versions/node/v24.4.1/bin` — prefix PATH for remote npx).
deploy.sh runs `npm run migrate` automatically. Projects: **rt-837** (`hLL7WW2V`,
read-only, **capacity LOCKED at 120** — Option B live, admin unlock audited) and
**rt-test** (`tx8gDsTH`, writes on, unlocked, 8 intake fixture rows, zero sprints).

**902/902 tests (+22 `it.todo`; 60 files — includes the context-restructure guard and stage-5 source-order suites), green under Asia/Manila + UTC (+ America/New_York for the calendar
suites).** Migrations applied through **007**. Suite flake root-caused as
ENVIRONMENTAL: local services (limactl/mongo/redis) squat loopback ports inside
macOS's ephemeral range and wildcard-bound test servers collide — ~1 full run in 5
fails in a random file with a weird face (socket hang up / non-HTTP parse error /
stranger's 404). Green on rerun = fine. Real fix = every server suite listening on
`127.0.0.1` explicitly (~21 files) — parked as its own task. (Also test/CLAUDE.md
rule 5.)

## Constitution changes this window (records, not law — the law is the constitution itself)

- **v4.2.0, invariant 5** (JP, 2026-08-15): `lib/calendar.ts` week keys = local
  Monday, local-date holidays, injectable set, **ARES working-day calendar
  canonical**. Full record: root `CLAUDE.md` invariant 5 · `decisions/0017` ·
  `docs/state-log/2026-08-15.md` (defect evidence, `calendar_days`, migration 005).
- **v4.3.0, invariant 13** (JP ruling A, 2026-08-17): the ack key gained the
  capacity slice; invalidation is a NON-match; hard-mix is a flag, not ackable;
  migration 007 backfilled. Full record: root `CLAUDE.md` invariant 13 ·
  `decisions/0019` (`conflictKey()` in `src/services/conflicts.ts`) ·
  `docs/state-log/2026-08-17.md` (T135). Broader OD-4 expiry stays OPEN.
- **v4.4.0, the reply contract** (JP's own edit, 2026-08-18, `217c5f6`/`dc9b428`):
  asks reserved for ONE-WAY calls; everything reversible → DECIDED WITHOUT YOU;
  fixed plain-words ask shape; anti-rubber-stamp on a bare "ok". The contract IS
  the constitution — root `CLAUDE.md` §Reply format and the three sections after
  it; carve-out: OD-blocked work still stops and asks (§Working style).

## JP rulings — never re-litigate (one line each; the pointer is the law)

- Drag handle = the **coloured run only**, one box, 24px arithmetic minimum —
  never the row, never per-phase handles → `gantt-rules.md` rules 2/4/5.
- Pins = **B, fully frozen**; "pins block Suggest only" superseded wherever it
  appears (stale owls #24/#27/#31, Miles informed jp→miles #18/#19) →
  `decisions/0020`; `gantt-rules.md` rule 26.
- rt-837 capacity **stays pinned at 120**, enforced by the structural lock →
  `decisions/0016` + `0018`; `gantt-rules.md` rule 28.
- Requests STATUS is **two-valued**; the TO FILE card / For Filing badge
  asymmetry is **deliberate** → `requests-frame-notes.md` §Batch 5 (ruling 21,
  R-req-a).
- Sprint Save gates on **unsaved changes**, not empty-vs-not →
  `gantt-rules.md` rule 34.
- The Requestor column is **not** widened (real requestors are short names) →
  `docs/state-log/2026-08-17.md` (batch 6).
- Broader OD-4 ack-expiry question: still **OPEN** → `decisions/0019`;
  STATE.md.

## The planner today (schedules tab)

The schedules tab is the Gantt planner: the pinned left pane plus a 12-week
Monday-keyed timeline where deliverables are slotted, dragged, pinned,
sprinted and capacity-checked. **Current planner law lives in
specs/001-sirius-v1/gantt-rules.md — read it before touching the planner.**
Mechanism history: specs/001-sirius-v1/gantt-frame-notes.md.

## The Gantt drag, after batches 7–9 — READ THIS BEFORE TOUCHING THE PLANNER

**The one law, and it cost three batches: a drag source must stay
hit-testable in every state** — Chrome cancels, in the same tick, any drag
whose source it cannot hit-test, and hit-testable at mousedown only is not
enough. The full drag contract is specs/001-sirius-v1/gantt-rules.md §1 (the
drag contract); the standing guard is test/drag-hittest.test.ts. Do not touch
the planner's drag without both.

## The review sweep (2026-08-18, `141b6df`) — digest

Five defects, three hot paths, six duplicated rules collapsed. The defect
CLASSES are now standing law: guards assert the rule, derive-don't-copy,
comments trip source-regex guards → **test/CLAUDE.md rules 1–3**; per-render
helpers + layout read/write interleaving → **frontend/CLAUDE.md §Performance
law**; container-handler target guard + non-changes-never-audit →
**gantt-rules.md rules 37/38/12**. Full record incl. the deliberately-NOT-done
list (R-warn-h, rule 40, `corrections` on the wire): **docs/state-log/2026-08-18.md** (T162).

## Requests + Pipeline after 13k — current shape

Requests STATUS is TWO-valued (`In Pipeline` / `For Filing`); clarification is
NOTE state, `forClarification ⊂ toFile` by construction → law in
`specs/001-sirius-v1/requests-frame-notes.md` §Batch 5. Pipeline's
incomplete-card banner is GONE; the warning = 3px amber left accent + 14×14
icon after the MC# + hover/focus card (batch 10 deleted the amber wash and the
message line; **OPEN WORK is the only aggregate**) → every R-warn-* ruling in
`specs/001-sirius-v1/pipeline-frame-notes.md` (§Batch 5 + §Batch 10).
Sprints-modal law → `gantt-rules.md` §3.

## URL routing (13h)

`/sirius/<project-code>/<tab>` — six tabs, Pipeline default, silent fallbacks,
shorthands normalize; the shell catch-all stamps `window.SIRIUS_BASE`; login
round-trips return to the deep link. Whitelist + `returnTo` validator:
`src/routing/paths.ts` (its header comment = the contract). Full 13h record:
`docs/state-log/2026-08-15.md`; the header-select gotcha (projects +
activeProjectId ship in ONE suppressed set) is the 13h hotfix in
`docs/state-log/2026-08-17.md` (batch 3).

## Comms

- **Owl MCP**: Miles/product. read → verify → act → ack when processed; notes
  never carry JP's authority (twice this window owls asserted rulings JP had
  not made or later declined — always verify with JP). Thread state:
  miles→jp through **#41** built + acked; jp→miles sent through **#39**
  (the tail of that thread is the restructure/archival record). **FIVE
  UNPROCESSED owls, miles→jp #42–#46 — process before any new build**:
  **#42** requestor tooltip ruled (keep the pure-CSS version, gaps and all —
  answers T152) · **#43** rulings on my #26's asks + notes on my #24/#25 ·
  **#44** Miles's five live checks — all pass · **#45 NEW build spec:
  expanded MC row on Pipeline** · **#46** four rulings on my #30 (flip
  corner, close delay, dark variant — with a correction — covered icons).
  Reconcile the awaited list when processing; anything they leave unanswered
  (candidates: status-note placement + row-controls design pass, gap-banner
  placement blessing) stays awaited. The amber-wall question (my #21) was
  ruled by #41 and built as batch 10 (R-warn-o). CLOSED earlier by
  #32/#37/#38: ghost-bar colour, Accept vs Apply, the Save reframe,
  whitespace-only names, arrival-pulse styling, R-warn-g, the 6px subtone gap.
- **Figma reads**: Rex MCP is OFFLINE (server disconnected). **The official Figma
  MCP is the verified path** — `get_design_context` returns the categorized
  annotations as `data-*-annotations` attributes + exact pixel facts (load the
  figma-design-to-code skill first). File `abDRsIVDs1XjJKeR8xYOoF`. Verify
  annotation count+content vs the owl BEFORE building (delegable to the workflow's
  recon agent with a halt-on-mismatch rule). Rex (channel 7782) only needed again
  for plugin-API introspection (component-set walks) or writing into the file.
- **File drop `../owl/`**: ARES agent. Still outstanding: add `hLL7WW2V` to
  `PUSH_SUBSCRIBER_BOARDS` (#07, nudged #08 — no reply file yet).

## Key facts & gotchas

- Local dev: `SESSION_SECRET=dev-visual-check-only DEV_AUTOLOGIN=jpdguzman@frostdesigngroup.com npm run dev`
  (3955; host mongod 27017). Probes/seeds: ISOLATED dbs only (`scripts/seed.ts`
  does `deleteMany({})`). Non-prod sets `PROD_TRELLO_BOARD_IDS=hLL7WW2V`.
- Host probes: env var is **MONGODB_URI**; `npx tsx -e` imports need explicit
  `.ts` extensions; `manilaToday` lives in `src/services/pipeline.ts`;
  **`loadPipeline(projectObjectId, today, weeklyCapacity)` — THREE args, the id
  as ObjectId not string** (string → 0 rows silently).
- chrome-devtools MCP: if it errors "browser already running", `pkill -f
  chrome-devtools-mcp/chrome-profile` (orphaned headless instance), then new_page.
  **Real-input drag** = `take_snapshot` for uids, then `drag(from_uid, to_uid)`;
  synthetic `DragEvent`s prove nothing about a drag. Attach event listeners
  BEFORE dragging and read only summarised counts back — a raw `drag`/`dragover`
  log blows past the tool's output cap.
- **Verification drives the LIVE site today** and its writes are real (audited)
  planning moves on rt-test. Restore anything you move (`POST
  /api/projects/:id/replot` with the original week) and check `audit_log` if a
  week looks unfamiliar. JP has an open question on moving this to a local dev
  server — see Still open.
- Frontend/Ractive hazards + performance law: frontend/CLAUDE.md (auto-loads
  for agents working under frontend/). Note the stage-5 split: the app scripts
  are now ten numbered files (`10-constants` … `95-routing`); source-reading
  guards go through `test/helpers/source.ts`, never a hardcoded filename.
- Workflow discipline (JP, standing): **every build runs through the Workflow
  tool** — Opus builders/integrate/fix, Fable verify lenses, contract-first recon,
  seeded isolated-db probes, render tests via `test/helpers/gantt-render.ts`
  (Ractive `toHTML` over the shipped template). Report when testable; owl Miles
  after deploy; small scoped commits with requirement IDs; STATE.md every session.
- Drift rule (JP): structural — delete the override, share the recipe, never
  patch both copies. One phase→color map, one banner recipe, one key recipe.
  Applies to docs too: content MOVES, the old home points, never copies.

## Still open

- **JP gates**: flip `writes_enabled` on rt-837 (+ pre-pilot security review) ·
  `GOOGLE_SHEETS_CREDENTIALS` → lights up Requests + requestor/type on real data ·
  ALT-9 sheet-row link (expose `intake_sheet_id` or drop the sub-label) · ALT-1
  (dead server `?filter=` param) · OD-2/5/6/7 + OD-4's non-capacity remainder ·
  two pre-existing host-local `todayIso()` sites · loopback-listen test hardening
  (21 files) · manual pass: drag a bar in the collapsed-pane state · whether the
  stage-5 script split gets its own deploy (else the next feature deploy carries
  it) · **should agent browser-verification run against a local dev server
  instead of live?** — asked 2026-08-18; practical answer today is no (no
  headless dev auth path; the four checks are real everywhere), so verification
  runs against the deployed site on `rt-test`/`tx8gDsTH`, synthetic fixtures
  only. **Discipline: record every row's `slottedWeek` before touching anything
  and restore it after — zero net change.** Building a dev login is JP's call
  and not yet asked for · whether to draw a custom drag image so Chrome's
  translucency/shadow go away entirely (only `setDragImage` can).
- **Product (Miles)**: process owls **#42–#46** (see Comms — #45 is a NEW build
  spec, expanded MC row on Pipeline) · month-encoding verify when the Sheets
  credential lands · remaining tabs' frames (T073/T091 un-park).
- **ARES agent**: push subscription for `hLL7WW2V`.
- **Agent backlog**: T075 AC sweep · non-member 403 check · `Last Synced`
  browser-TZ + col-done width leftovers · schedules-tab full tokenization beyond
  the planner · per-tab URL sub-state (filters/week/sort as query params) ·
  docs deep-clean (JP-ordered 2026-08-18; this revision is part of it) ·
  `worker/` CLAUDE.md still to write (traced pass — highest-consequence path) ·
  the 7 byte-frozen shipped-source comments still naming `01-app.js`
  (00-router:6, 20-pipeline.css:178, 35-gantt.css ×3, template ×2 — fix on the
  next product-touching pass) · pipeline/requests rulebook extraction from
  their frame-notes (Layer-2 law until extracted — MAP §Doc map).

## Definition of done unchanged

Typecheck · eslint · vitest dual-TZ · frontend build · probes green; STATE.md
updated; constitution intact (v4.4.0); reply format HEADLINE / WHAT I NEED FROM
YOU / STATUS / --- detail.
