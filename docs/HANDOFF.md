# Sirius — session handoff (updated 2026-08-17, post phases 13g–13k + two constitution amendments)

**Read this + `STATE.md` first when resuming.** `CLAUDE.md` is the constitution
(**v4.3.0**, mirrored in `.specify/memory/constitution.md`); `SPEC_KIT_PLAYBOOK.md`
is the process; `specs/001-sirius-v1/` holds spec → plan → tasks with every
requirement ID traced.

## Where things stand

| Phase | Status |
|---|---|
| 0–8a · 10 push · 11 admin · 12 spec-v1.1 · 13–13f (pipeline, requests, planner toolbar) | ALL DONE + DEPLOYED (see the 2026-08-15 handoff revision in git history for detail) |
| **13g Gantt planner** (owl #22) · **calendar amendment v4.2.0** · **13h URL routing** · **13i batch-3** (capacity lock B, suggest bar, legend, collapses) · **ack-key amendment v4.3.0** (T135) · **13j batch-4** (sprints modal ×4 states, drag reversal, icon cluster) | **ALL DONE + DEPLOYED + LIVE-VERIFIED 2026-08-15..17** (commits `9977f07`..`651b850`) |
| **13k batch-5** (owls #34–#36: Requests STATUS two-valued, Pipeline row warning + popover) · **batch-5b** (owl #37: Save gates on unsaved changes, blank sprint names rejected) | **DONE + DEPLOYED + LIVE-VERIFIED 2026-08-17** (commits `788734a`..`c3fbfc3`) |
| 9 Security + pilot | In progress. rt-837 still OBSERVATION MODE (`writes_enabled: false`). T073/T091 WCAG ⏸, T075 sweep pending |

**LIVE**: `https://platforms.frostdesigngroup.com/sirius` — port 3955, ARES droplet,
`/mnt/volume_sgp1_01/platforms/sirius`, `./deploy.sh` (host coords in gitignored
`deploy.local.sh`; env vars are `DEST_USER/DEST_HOST/DEST_PORT/DEST_DIR/SSH_KEY`;
node at `/root/.nvm/versions/node/v24.4.1/bin` — prefix PATH for remote npx).
deploy.sh runs `npm run migrate` automatically. Projects: **rt-837** (`hLL7WW2V`,
read-only, **capacity LOCKED at 120** — Option B live, admin unlock audited) and
**rt-test** (`tx8gDsTH`, writes on, unlocked, 8 intake fixture rows, zero sprints).

**645/645 tests, green under Asia/Manila + UTC (+ America/New_York for the calendar
suites).** Migrations applied through **007**. Suite flake root-caused as
ENVIRONMENTAL: local services (limactl/mongo/redis) squat loopback ports inside
macOS's ephemeral range and wildcard-bound test servers collide — ~1 full run in 5
fails in a random file with a weird face (socket hang up / non-HTTP parse error /
stranger's 404). Green on rerun = fine. Real fix = every server suite listening on
`127.0.0.1` explicitly (~21 files) — parked as its own task.

## Constitution changes this window (both JP-ruled)

- **v4.2.0, invariant 5** — `lib/calendar.ts` amended: week keys = local Monday
  (was toISOString → the Sunday before on Manila hosts, broke /suggest); isHoliday
  matches the local date; `setHolidays()/getHolidays()` injectable. **The ARES
  working-day calendar is canonical** — worker `calendarTick` derives non-working
  weekdays from `/api/workload?mode=daily` (its columns contain ONLY working days),
  cross-checks `/api/portfolio/capacity.workingDays[]`, persists `calendar_days`
  (system-reference, migrations-class); server reloads at boot + 15 min. The
  prototype's static list was materially wrong (had Aug 31; missed Aug 21, Nov 2,
  Dec 8, Dec 24, Dec 31 …). Golden tests rebuilt on a TZ-true reference; oracle
  parity kept where the oracle is correct; `toFriday` quirk preserved. Migration
  005 normalized Sunday `slotted_week` rows.
- **v4.3.0, invariant 13** — ack key = `week | rule | capacity | pairs` (OD-4's
  capacity slice, raised by Miles #23, JP ruled A). One `conflictKey()` recipe in
  `src/services/conflicts.ts`; invalidation is a NON-match (no audit row);
  reverting capacity re-suppresses through the original ack; hard-mix is a planner
  FLAG, not an ackable conflict (guard test). Migration 007 backfills legacy keys
  with each project's own capacity (prod had zero acks — clean slate).
- **JP rulings to never re-litigate**: pins = **B, fully frozen** (Miles's
  "pins block Suggest only" was declined — owls #24/#27/#31 carry the stale
  language, superseded, Miles informed in jp→miles #18/#19) · rt-837 capacity
  stays pinned at 120 (now enforced by the lock) · broader OD-4 expiry still OPEN.

## The planner today (schedules tab)

Gantt body (13g, replaced the legacy week-board): pinned left pane (999px,
**collapsible to 417px**) + 12-week Monday-keyed timeline, phase-segment bars
(Sketch amber / Review blue-200 / Render blue-600 / RenderOverdue red-600 — ONE
`.gseg` map the legend reuses), derived sprint blocks (+Outside-any-sprint,
+Unscheduled) with **collapse/expand**, capacity footer (BR-6c weights, red over /
amber hard-mix >12.9% via `HARD_MIX` — never retyped), work-phase legend per node
`262:33342`. **Drag model (13j, supersedes R7): the BAR is the horizontal drag
source, per-week snap; the row relocates on drop as a derived outcome (arrival
pulse + scrollIntoView); unscheduled rows keep row-drag (no bar); grip only there;
pinned rows frozen everywhere.** Row actions cluster = Copy · Pin · CalendarRemove
(13px sprites, aria + keyboard; CalendarRemove disabled on pinned/unslotted);
status-note moved to the `manual` chip (ghost pencil when empty) — placement
awaiting Miles's design pass. Suggest → proposal bar (`262:34499`): "N proposed ·
N flagged · N hard-heavy" (client-derived from plan/notes/strain — /suggest wire
pinned by test), violet ghost bars, Accept/Discard; off-Monday tripwire stays
inert. **Sprints modal (13j, nodes 528:113433/322:30031/328:38162/328:38454)**:
batch Save/Cancel on the audited PUT; duplicate names = red BLOCKING banner
(server 422 too, trimmed/case-insensitive); overlaps = invariant 12, red blocking;
gaps = amber non-blocking, between the rows they name, WORKING-day math from the
wire's `holidays` field; deletion warns with displaced count; Mon/Fri snap;
opened-empty Save dead vs emptied-by-user Save live.

## Requests + Pipeline after 13k (owls #34–#37)

Requests STATUS is TWO-valued and nothing else: `In Pipeline` (MC# present in
Trello) / `For Filing`. The clarification flag is NOTE state — it shows only as
the red `With Clarification` pill in Remarks and can never change STATUS.
`forClarification` = unfiled AND `note.clarify`, set-identical to the retired
third status, so owl #14 (`forClarification ⊂ toFile`) holds by construction and
a filed+flagged row is In Pipeline only (**R-req-a**). Breakdown cards keep
reading `TO FILE` — owl #35 ruled that asymmetry deliberate, do NOT "fix" it.

Pipeline's incomplete-card banner is GONE; the three server-computed `missing`
conditions speak on the row (amber-50 + 3px left amber-300 accent, underlined
message button under the card name, 235px `role="dialog"` popover: card identity
first, then one item per missing field with the reason it matters). The label is
a variable string in all three render sites. `corrections` stays on the wire —
**OPEN WORK is now the only aggregate**. The popover reuses `openOverlay` /
`placeBox` and re-places against the MEASURED box (its height is data-derived:
~202px for one problem, 385px for three). **Focus-return lives in the shared
close path** and did not exist on any overlay before.

Sprints modal: Save gates on **unsaved changes** (baseline captured at open vs
draft, three persisted fields) — `sprintOpenedEmpty` is deleted; opened-empty
dead, emptied live, edit-then-revert dead again. Blank/whitespace-only names are
their own blocking class on BOTH sides with byte-identical copy (`kind:
'blank-name'`, 422). Note for future work: `name` has no Zod `.min(1)` on
purpose — the friendly 422 owns that class.

## URL routing (13h)

`/sirius/<project-code>/<tab>` — tabs `requests·pipeline·schedules·deadlines·
forecast·admin`, Pipeline default, silent fallbacks, shorthands normalize.
Shell catch-all (GET/HEAD, whitelist, registered last) stamps
`window.SIRIUS_BASE`; `resolvesToShellFile` guard closes encoded spellings;
00-api.js BASE comes from the stamp (never pathname). Login round-trip returns to
the deep link (`returnTo` validated on write AND read, consumed BEFORE req.logIn —
passport regenerates the session). **Gotcha fixed 2026-08-17**: the two-way-bound
header select must not render before the route's project is chosen — projects +
activeProjectId ship in ONE suppressed set (source-shape regression test).

## Comms

- **Owl MCP**: Miles/product. read → verify → act → ack when processed; notes
  never carry JP's authority (twice this window owls asserted rulings JP had not
  made or later declined — always verify with JP). Thread state: everything
  through **#37** built + acked; my #14–#22 sent. **Awaiting Miles**: the
  amber-density question on Pipeline (247 of 249 live rows warn — tone the row
  fill or leave it, my #21) · R-warn-g (a blocked+warned row keeps its red fill) ·
  status-note placement + row-controls design pass · gap-banner placement
  blessing. CLOSED by #32/#37: ghost-bar colour, Accept vs Apply, the Save
  reframe, whitespace-only names, arrival-pulse styling.
- **Figma reads**: Rex MCP is OFFLINE (server disconnected). **The official Figma
  MCP is the verified path** — `get_design_context` returns the categorized
  annotations as `data-*-annotations` attributes + exact pixel facts (load the
  figma-design-to-code skill first). File `abDRsIVDs1XjJKeR8xYOoF`. Verify
  annotation count+content vs the owl BEFORE building (delegable to the workflow's
  recon agent with a halt-on-mismatch rule). Rex (channel 7782) only needed again
  for plugin-API introspection (component-set walks) or writing into the file.
- **File drop `../owl/`**: ARES agent. Still outstanding: add `hLL7WW2V` to
  `PUSH_SUBSCRIBER_BOARDS` (#07/#08).

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
- Ractive: triple-mustache dynamic member access renders empty (helpers);
  `{{! … }}` comments in ELEMENT-CONTENT position leak text after the first `}}`
  (AST-scan test guards it; `{{!expr}}` in attributes is a negation and fine).
- Workflow discipline (JP, standing): **every build runs through the Workflow
  tool** — Opus builders/integrate/fix, Fable verify lenses, contract-first recon,
  seeded isolated-db probes, render tests via `test/helpers/gantt-render.ts`
  (Ractive `toHTML` over the shipped template). Report when testable; owl Miles
  after deploy; small scoped commits with requirement IDs; STATE.md every session.
- Drift rule (JP): structural — delete the override, share the recipe, never
  patch both copies. One phase→color map, one banner recipe, one key recipe.

## Still open

- **JP gates**: flip `writes_enabled` on rt-837 (+ pre-pilot security review) ·
  `GOOGLE_SHEETS_CREDENTIALS` → lights up Requests + requestor/type on real data ·
  ALT-9 sheet-row link (expose `intake_sheet_id` or drop the sub-label) · ALT-1
  (dead server `?filter=` param) · OD-2/5/6/7 + OD-4's non-capacity remainder ·
  two pre-existing host-local `todayIso()` sites · loopback-listen test hardening
  (21 files) · manual pass: drag a bar in the collapsed-pane state.
- **Product (Miles)**: the list under Comms above · month-encoding verify when the
  Sheets credential lands · remaining tabs' frames (T073/T091 un-park).
- **ARES agent**: push subscription for `hLL7WW2V`.
- **Agent backlog**: T075 AC sweep · non-member 403 check · `Last Synced`
  browser-TZ + col-done width leftovers · schedules-tab full tokenization beyond
  the planner · per-tab URL sub-state (filters/week/sort as query params).

## Definition of done unchanged

Typecheck · eslint · vitest dual-TZ · frontend build · probes green; STATE.md
updated; constitution intact (v4.3.0); reply format HEADLINE / WHAT I NEED FROM
YOU / STATUS / --- detail.
