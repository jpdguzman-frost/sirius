# Sirius — session handoff (updated 2026-08-18, post phases 13g-13k + the review sweep + three constitution amendments)

**Read this + `STATE.md` first when resuming.** `CLAUDE.md` is the constitution
(**v4.4.0**, mirrored in `.specify/memory/constitution.md`); `SPEC_KIT_PLAYBOOK.md`
is the process; `specs/001-sirius-v1/` holds spec → plan → tasks with every
requirement ID traced.

## Where things stand

| Phase | Status |
|---|---|
| 0–8a · 10 push · 11 admin · 12 spec-v1.1 · 13–13f (pipeline, requests, planner toolbar) | ALL DONE + DEPLOYED (see the 2026-08-15 handoff revision in git history for detail) |
| **13g Gantt planner** (owl #22) · **calendar amendment v4.2.0** · **13h URL routing** · **13i batch-3** (capacity lock B, suggest bar, legend, collapses) · **ack-key amendment v4.3.0** (T135) · **13j batch-4** (sprints modal ×4 states, drag reversal, icon cluster) | **ALL DONE + DEPLOYED + LIVE-VERIFIED 2026-08-15..17** (commits `9977f07`..`651b850`) |
| **13k batch-5** (owls #34–#36: Requests STATUS two-valued, Pipeline row warning + popover) · **batch-5b** (owl #37: Save gates on unsaved changes, blank sprint names rejected) | **DONE + DEPLOYED + LIVE-VERIFIED 2026-08-17** (commits `788734a`..`c3fbfc3`) |
| **13k batch-6** (owls #39/#40: Requestor badge truncates + hover/focus tooltip) · **batch-7 + 7b** (the Gantt bar could not be dragged with a real mouse; the affordance moved to the coloured bars) · **batch-8** (JP: the drag handle IS the coloured run) · **batch-9** (the drag ghost shows only the bars) | **DONE + DEPLOYED + LIVE-VERIFIED 2026-08-18, JP confirmed** (commits `c52d215`..`af0dd24`) |
| **Review sweep over batches 5–9** (JP: `/simplify` + `/code-review` on `646307b..HEAD`) — five defects, three hot paths, one spelling each for six duplicated rules | **DONE + DEPLOYED + LIVE-VERIFIED 2026-08-18** (commit `141b6df`; 794 → **821** tests dual-TZ). See *The review sweep* below |
| **13k batch-10** (owl #41: the Pipeline warning becomes a 14px icon + hover card; the amber row wash is ruled away) | **DONE + DEPLOYED + LIVE-VERIFIED 2026-08-18** (commit `7bdf6b4`; 821 → **865** tests + 22 `it.todo` dual-TZ). Four defects caught by the verify lenses before deploy — see *The review sweep* and R-warn-u/v/w |
| 9 Security + pilot | In progress. rt-837 still OBSERVATION MODE (`writes_enabled: false`). T073/T091 WCAG ⏸, T075 sweep pending |

**LIVE**: `https://platforms.frostdesigngroup.com/sirius` — port 3955, ARES droplet,
`/mnt/volume_sgp1_01/platforms/sirius`, `./deploy.sh` (host coords in gitignored
`deploy.local.sh`; env vars are `DEST_USER/DEST_HOST/DEST_PORT/DEST_DIR/SSH_KEY`;
node at `/root/.nvm/versions/node/v24.4.1/bin` — prefix PATH for remote npx).
deploy.sh runs `npm run migrate` automatically. Projects: **rt-837** (`hLL7WW2V`,
read-only, **capacity LOCKED at 120** — Option B live, admin unlock audited) and
**rt-test** (`tx8gDsTH`, writes on, unlocked, 8 intake fixture rows, zero sprints).

**897/897 tests (+22 `it.todo`; 60 files — includes the context-restructure guard and stage-5 source-order suites), green under Asia/Manila + UTC (+ America/New_York for the calendar
suites).** Migrations applied through **007**. Suite flake root-caused as
ENVIRONMENTAL: local services (limactl/mongo/redis) squat loopback ports inside
macOS's ephemeral range and wildcard-bound test servers collide — ~1 full run in 5
fails in a random file with a weird face (socket hang up / non-HTTP parse error /
stranger's 404). Green on rerun = fine. Real fix = every server suite listening on
`127.0.0.1` explicitly (~21 files) — parked as its own task.

## Constitution changes (all JP-ruled)

- **v4.4.0, the reply contract** (JP's own edit, 2026-08-18, `217c5f6`/`dc9b428`):
  WHAT I NEED FROM YOU is reserved for **one-way** calls (hard to undo, costs
  money, touches live client data, changes a promise already made); everything
  reversible is decided and reported under a new **DECIDED WITHOUT YOU** section,
  max 3 bullets. Asks take a fixed plain-words shape (what's happening / if yes /
  if no / undo / I'd pick), max 3 per reply, one change per ask, no jargon —
  answerable at 11pm without opening the codebase. **Anti-rubber-stamp**: a bare
  "ok" to a reply carrying 2+ asks is not consent; re-ask one at a time, least
  reversible first. **JP's carve-out, ruled the same day**: work blocked on an
  undecided item (OD-1, OD-6, OD-7, OD-8) still stops and asks, reversible or not.

## Earlier constitution changes this window (both JP-ruled)

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
- **JP rulings to never re-litigate** (2026-08-18 additions): the drag handle is
  the **coloured run only**, one box, with a 24px invisible minimum — never the
  row, never one handle per phase · the Requests STATUS column is **two-valued**
  and the TO FILE card / For Filing badge asymmetry is **deliberate** · Save gates
  on **unsaved changes**, not empty-vs-not · the Requestor column is **not**
  widened (real requestors are short names). Earlier: pins = **B, fully frozen** (Miles's
  "pins block Suggest only" was declined — owls #24/#27/#31 carry the stale
  language, superseded, Miles informed in jp→miles #18/#19) · rt-837 capacity
  stays pinned at 120 (now enforced by the lock) · broader OD-4 expiry still OPEN.

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

## The review sweep (2026-08-18, commit `141b6df`) — five defects worth remembering

JP ran `/simplify` and `/code-review` over `646307b..HEAD`. What it found is more
useful than what it changed, because four of the five defects are **classes**, not
incidents.

1. **A handler on a container fires for every descendant.** `rowKey` lives on
   `.growr`; keydown bubbles; so ← / → reslotted the card from the row's checkbox,
   note button and three action buttons. **`pipeRowKey` had the guard
   (`ctx.event.target !== ctx.node`) since the day it was written and `rowKey`
   never did.** Batch 6 had patched ONE cell (`on-keydown="['noop']"` on the
   requestor badge) — and that patch is exactly what hid the other six. *When you
   find yourself immunising an element against its ancestor's handler, the bug is
   in the ancestor.*
2. **A non-change must not reach the audit log.** `unslotRow` and `saveSprints`
   both enforce it; `moveRows` — which every drag, every keyboard reslot and both
   unslot paths funnel through — did not. Batch 8 turned that from rare into
   likely by making the coloured run the handle. The guard refuses only when
   EVERY member is a no-op, so mixed multi-selects still go.
3. **A field no validator can see is a field with no validation.** Clearing a
   sprint date left `start: ''`; `sprintOrder` filters such a row out before
   overlaps/gaps run, and blank-names reads only the name — so Save stayed live
   and the user got the literal string `INVALID_BODY`. **This is the same failure
   5b fixed for names, in a field nobody re-checked.** The route was left alone
   on purpose: it already refuses the shape; what was missing was the modal not
   asking it to.
4. **Shape validation is not range validation.** `DATE_ONLY` is
   `/^\d{4}-\d{2}-\d{2}$/`, so `2026-00-17` passes it and indexed
   `MONTHS_SHORT[-1]` → the word `undefined` inside user-facing 422 copy.
5. **A shared close path only helps the callers that use it.** R-warn-f's focus
   return was real, and five handlers bypassed it by nulling their own state key
   — so it worked on Escape and failed on *choosing an option*, which is the path
   people actually use. All five now call `closeMenus({ restoreFocus: true })`,
   and the restore is `focus({ preventScroll: true })` because that same path runs
   from the capture-phase scroll dismisser.

**Two guards were rewritten because they pinned the implementation, not the
rule** — and one of them was actively harmful: `expect(...matchAll(/rAF lambda/))
.toHaveLength(4)` **forbade** extracting the duplicated lambda into `remeasure()`,
while a fifth seam calling only half the pair would have passed. Two more now
DERIVE rather than copy: the `missing` tokens are read out of
`src/services/pipeline.ts` (a reworded token shipped a blank rationale with a
green suite), and `longDate`/`fmtLongIso` are executed against each other rather
than compared as source strings.

**Hot paths, for the pattern**: any helper called from a template expression runs
per row per render — `rowWarning(row)` sat in SEVEN template positions and the
Pipeline table re-renders on every search keystroke. Derived per-row data belongs
in `loadAll`'s stamp loop beside `r.blob`. And never interleave a layout read
(`scrollWidth`) with a style write that a live selector keys on
(`data-clipped`) — `refreshClips` forced one full layout per changed badge until
it was split into a read pass and a write pass.

**Deliberately not done** (do not "fix" these): `.warnpop` still has no
`max-height`/`overflow-y` — **R-warn-h ruled that**, so it stays out of the scroll
dismisser's self-scroll exemption and the second measured placement is the
mitigation; the four shared `.grun`/`.gghost` declarations stay duplicated
because `gantt-run-geometry`/`drag-hittest` look those selectors up by name;
`corrections` stays on the wire though only `kpi.open` reads it now.

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

Sprints-modal law (Save gating on unsaved changes, blank-name and
missing-date blocking, the deliberate absence of a Zod `.min(1)` on `name`)
lives in `specs/001-sirius-v1/gantt-rules.md` §3 with the rest of the planner
law — batch 5b's rulings moved there at the 2026-08-18 docs rewire.

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
  through **#41** built + acked; my #14–**#30** sent. **Awaiting Miles**: the
  amber-density question on Pipeline (247 of 249 live rows warn — tone the row
  fill or leave it, my #21) · R-warn-g (a blocked+warned row keeps its red fill) ·
  status-note placement + row-controls design pass · gap-banner placement
  blessing · Escape-dismissal + touch reveal for the requestor tooltip (T152) ·
  **three from my #26**: (A) the PROVISIONAL sprint-dates banner copy I wrote,
  (B) whether the deleted banner's *"Fix in Trello and it corrects on the next
  sync"* sentence should return to the Needs Info popover — it currently says why
  each field matters and never where to fix it, (C) whether `.c-type` (Asset
  Type) should get the requestor's clip treatment; it is the identical
  hugging-badge-in-a-fixed-width-cell pairing and still cuts mid-character, but
  owls #39/#40 named Requestor only so I did not sweep it. **Four more from my #30**
  (batch 10): the mirrored corner when the hover card flips up (R-warn-i) · the
  150ms close delay (R-warn-j, one named constant) · the DARK variant she
  references as "in use on Sprint Schedules" — there is no warning card there, so
  none was built (R-warn-k) · and that an open card covers the icons of the 2–4
  rows beneath it, which with 247 of 249 rows warned makes sweeping the icon
  column awkward — the annotation's own anchor rule working as specified, raised
  rather than patched.
  CLOSED by #32/#37/#38: ghost-bar colour, Accept vs Apply, the Save reframe,
  whitespace-only names, arrival-pulse styling, R-warn-g, the 6px subtone gap.
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
  for agents working under frontend/).
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
  (21 files) · manual pass: drag a bar in the collapsed-pane state ·
  **should agent browser-verification run against a local dev server instead of
  live?** — asked 2026-08-18; **the practical answer today is no: there is no dev
  auth path**, so a locally-run server cannot be logged into headlessly (the four
  checks are real everywhere). Verification therefore runs against the deployed
  site on `rt-test`/`tx8gDsTH`, which is synthetic fixtures only. **Discipline:
  record every row's `slottedWeek` before touching anything and restore it after
  — the 2026-08-18 sweep made 4 `schedule.replot` rows and left zero net change.**
  Building a dev login is JP's call and not yet asked for · whether to draw a
  custom drag image so Chrome's translucency/shadow go away entirely (only
  `setDragImage` can).
- **Product (Miles)**: the list under Comms above · month-encoding verify when the
  Sheets credential lands · remaining tabs' frames (T073/T091 un-park).
- **ARES agent**: push subscription for `hLL7WW2V`.
- **Agent backlog**: T075 AC sweep · non-member 403 check · `Last Synced`
  browser-TZ + col-done width leftovers · schedules-tab full tokenization beyond
  the planner · per-tab URL sub-state (filters/week/sort as query params).

## Definition of done unchanged

Typecheck · eslint · vitest dual-TZ · frontend build · probes green; STATE.md
updated; constitution intact (v4.4.0); reply format HEADLINE / WHAT I NEED FROM
YOU / STATUS / --- detail.
