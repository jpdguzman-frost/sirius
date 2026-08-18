# STATE.md — Sirius Build State

_Last updated: 2026-08-18 · Update at the end of every working session._

## Phase status

| # | Phase | Status | Gate |
|---|---|---|---|
| 0 | Setup & infrastructure | **done 2026-08-03** (T001–T006) | |
| 1 | Schema + migrations + seed | **done 2026-08-03** (T007–T010) | |
| 2 | Auth + audit | **done 2026-08-03** (T011–T016) | |
| 3 | Port lib/ + golden tests | **done 2026-08-03** (T017–T026) | AC-10: ✅ gate passed by JP 2026-08-03 |
| 4 | ARES read + mapping | **done 2026-08-03** (T027–T033; T034 end-to-end measure at staging) | NFR-3: ARES cycle observed 15 min ✓; e2e at staging |
| 5 | Intake sync | **done 2026-08-03** (T035–T039; AC-6 literal counts at staging) | |
| 6 | Model refresh + validation | **done 2026-08-03** (T040–T045) | **PM sign-off: ✅ 2026-08-03** |
| 7 | UI — five tabs | **done 2026-08-03/04** (T046–T063; perf: 107ms/85ms @5k) | demoed on real 837 data |
| 8 | Urgency write | **done 2026-08-04** (T064–T066) | TEST board round-trip: ✅ (board tx8gDsTH, label add/remove verified live) |
| 8a | Conflict acknowledgements | **done 2026-08-04** (T067–T068) | audit-logged ✓ |
| 9 | Security testing + pilot | in progress — T069 anon half ✅, T072 backup/restore ✅, T086 ✅; **G7 ✅ 2026-08-12 (observation mode)**; T073/T091 ⏸ (team UI update), T075 sweep pending, non-member 403 parked | G7 passed; write-enable on rt-837 = next JP gate |
| 10 | Two-way sync (due-date write + ARES push) | **DONE 2026-08-04** — push LIVE, 37s Trello→Sirius, fallback drill passed (T077–T086) | FR-9.6 observed live |
| 11 | Admin panel (FR-10) | **DONE 2026-08-04** (T087–T090); T091 ⏸ with T073 | JP first admin; live |
| 12 | Build-spec v1.1 adoptions (frost notes FR-11, daily plotting FR-12, weighted load BR-6c) | **BUILT 2026-08-12** (T092–T099; 214/214 dual-TZ) | errata answered — BR-6c confirmed everywhere |
| 13 | Pipeline redesign to Figma frame 17:1015 | **DEPLOYED LIVE 2026-08-12** (T100–T110 + /simplify 15 fixes + /code-review 15 fixes; 219/219 dual-TZ) | live verified; team testing on TEST board |

## Decisions needed from JP (blocking)

| # | Decision | Blocks | Status |
|---|---|---|---|
| OD-1 | ARES interface: DB role / read API / replication | Phase 4 | ✅ **Resolved 2026-08-03: ARES read API** (`/api/v1/trello/*`, read-only key; contract in `specs/001-sirius-v1/contracts/ares-read.md`) |
| OD-8 | Hosting: Frost GCP or elsewhere | Infra work | ✅ **Resolved 2026-08-03: beside ARES, same pattern; shared Mongo server, own `sirius` db** |
| BRD §9 | Amend "write impossible by permission" — write surface is now the two-entry registry (urgency + due date) | Vendor assessment, v2 | ⬜ open (grew 2026-08-04) — product confirmed 2026-08-12 they'll raise it across all THREE docs quoting "one write": BRD §9, pilot security readiness, vendor assessment; not done yet |
| — | TEST board | Phase 8 | ✅ created: tx8gDsTH (structure-mirroring, 12 synthetic cards) |
| T085 | Hand `docs/ARES_PUSH_BUILD_SPEC.md` to the ARES build agent + provision `ARES_WEBHOOK_SECRET` on both hosts | T086 (e2e push verify) | ✅ done 2026-08-04 — ARES built it, push LIVE |
| W2 | Due-write canonical time: 17:00 Asia/Manila, preserve existing time-of-day on edit | — | ✅ confirmed by JP 2026-08-04 |
| lib/cal | Two pre-existing `lib/calendar.ts` defects (see 2026-08-15 log): Sunday week keys from `buildWeeks` breaks `/suggest` on the Manila host; `isHoliday` UTC/local mix shifts holiday exclusion off the real dates on prod | Usable Suggest on prod; forecast holiday accuracy | ✅ **Resolved 2026-08-15: JP chose option (a) + ARES-canonical calendar** — constitution v4.2.0, both fixed, migration 005 normalized live data, deployed same day |
| NFR-3 | Guide documents a 30-min ARES cache cycle; JP: new ARES is realtime, so < 15 min stands | Phase 4 exit verification | ✅ measured 2026-08-04: **37 s** Trello→Sirius push-driven; 15-min poll fallback drilled |

## Decisions needed later (not blocking yet)

| # | Decision | Blocks |
|---|---|---|
| OD-2 | Model window 6 or 12 months (schema defaults 12) | Phase 6 tuning |
| OD-4 | Acknowledgement expiry policy | Phase 8a |
| OD-5 | Is `Client Approval` ongoing or done | Phase 4 keyword rules |
| OD-6 | Which projects in v1 beyond GCash | Seed data |
| OD-7 | Retention for closed requests | Phase 9 |
| errata Q | Deadlines count basis | ✅ **answered 2026-08-12** (`docs/sirus_errata-reply-v1.2.md`): §5.4 weight everywhere — built default is final; §6.1 was their doc error |
| — | Build spec **v1.2** + **AGENTS.md** | ✅ received 2026-08-12, verified, filed in docs/ (v1.2 renamed to `sirius-build-spec_v1.2.md`). All 6 errata corrections confirmed in the diff. AGENTS.md §2 already says two writes; its §7/§8/§9 are historical (OD-1/OD-8 shown open, "Postgres") — do not treat as current |

## Acceptance criteria scoreboard

AC-1 ✅ · AC-2 ✅ · AC-3 ✅ · AC-4 ⬜ · AC-5 ✅ · AC-6 ⬜ · AC-7 ⬜ · AC-8 ✅ (fixture-scale; literal at staging) · AC-9 ✅ · AC-10 ✅ · AC-11 ✅ (data side; UI at phase 7) · AC-12 ✅ · AC-13 ✅ (API+UI) · AC-14 ✅ (API) · AC-15 ✅ · AC-16 ✅ · AC-17 ✅ · AC-18 ✅ · AC-19 ⬜ · AC-20 ⬜ · AC-21 ✅ · AC-22 ✅ · AC-23 ✅ · AC-24 ✅ (added 2026-08-12, phase 12)

## Deviations proposed by the agent, awaiting JP

_None awaiting. Approved:_

- **2026-08-03 — Port source is the compiled bundle, not the JSX.** The original `frost-sirius-v1.jsx` is not available; the team supplied only the built prototype `docs/frost-sirius-v1.html` (single minified 272 KB script block, identifiers mangled). JP approved inferring `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` from the bundle. Consequence: Invariant 5's "verbatim port" becomes a faithful reconstruction, and the AC-10 golden tests are the sole proof of fidelity — they gate Phase 3 exactly as before. If the original `.jsx` surfaces, it supersedes the bundle.

## Session log

**Convention (2026-08-18):** STATE.md carries only the NEWEST session entry in full. When a session adds a new entry, the previous one MOVES (never copies) to docs/state-log/YYYY-MM-DD.md and gains an index line below. Keep new entries as complete as ever — length is fine; the archive is the home for history.

- 2026-08-18 — **REVIEW SWEEP over batches 5–9 (`646307b..HEAD`) — DEPLOYED + LIVE-VERIFIED + COMMITTED `141b6df`** (T162). JP: *"let's run /simplify and /code-review on the set of latest commits for code and performance improvement."* Five passes (reuse · simplification · efficiency · altitude · correctness). **794 → 821 tests, green under `TZ=UTC` and `TZ=Asia/Manila`.** No new dependency, no wire change, no schema, no migration, `lib/**` untouched, write registry unchanged at W1 / W2 / W3.
  **Five defects, each verified in source before the fix and with real input after it:**
  1. **`rowKey` had no target guard (FR-5.9, invariant 10).** `.growr` carries the keydown listener and keydown bubbles, so ← / → reslotted the deliverable from **any** of the row's seven focusable descendants — the `.gsel` checkbox, `.gnote`/`.gnoteadd`, and the three `.c-status` action buttons. An audited `schedule.replot` from a keystroke that should do nothing. Batch 6 had patched the requestor badge alone with `on-keydown="['noop']"`, which **masked the width of the hole**; the guard is now the one `pipeRowKey` has always had (`ctx.event.target !== ctx.node`) and the per-element stop is deleted.
  2. **`moveRows` had no non-change guard (invariant 10, BR-8).** Releasing a bar inside the column it already occupies POSTed `/replot` and wrote an audit row recording nothing — and batch 8 made that gesture easy by making the coloured run itself the handle. Refuses only when **every** member is a no-op, so a mixed multi-select still goes.
  3. **A cleared sprint date left Save live (FR-5.15).** `sprintOrder` filters a row lacking `start`/`end` **before** overlaps and gaps see it, and `sprintBlankNames` reads only the name — so no validator could see it, Save stayed enabled, and the PUT failed `DATE_ONLY` with an envelope carrying no `issues[]`, which the modal printed to the user as the literal `INVALID_BODY`. Exactly the failure 5b removed for blank names. New blocking computed `sprintMissingDates`; **route deliberately unchanged** — it already refuses the shape, and now the modal never asks it to. **Copy is PROVISIONAL, flagged to Miles (owl #26 item A).**
  4. **`longDate` indexed `MONTHS_SHORT` unchecked** while `DATE_ONLY` (`/^\d{4}-\d{2}-\d{2}$/`) accepts `00` and `13`, rendering the word `undefined` into 422 copy the modal shows verbatim. Falls back to the raw month.
  5. **R-warn-f's focus return only covered dismissal.** `chooseUrgency` / `chooseDifficulty` / `dueApply` / `dueClear` / `pickReqFilter` each nulled their own state key, bypassing `closeMenus()` — so a keyboard user who pressed Enter on an option was dropped at `<body>` and restarted the next Tab from the top of the document, the very regression Escape was written to fix, surviving on the path people actually use. The direct writes also left `overlayTrigger` pinning a detached node. All five now use `closeMenus({ restoreFocus: true })`, and the restore is `focus({ preventScroll: true })` because the same path runs from the capture-phase **scroll** dismisser.
  **Three hot paths (NFR-1):** `rowWarning(row)` was an expression in SEVEN template positions, so it rebuilt an object graph per row on every re-render — the table re-renders on every search keystroke (`lazy="250"`) — now stamped once per load beside `r.blob`, which also hands `{{#each}}` a stable array identity · `refreshClips` interleaved layout reads with `data-clipped` writes (a live selector), forcing one full style+layout pass **per changed badge**, worst on the left-pane collapse where every badge flips at once — split into a read pass and a write pass, one layout · `Sprint.create` in a `for` loop → `insertMany`, one round trip, order preserved, `project_id` on every doc · the capture-phase scroll dismisser walked the DOM before the cheap `anyMenuOpen()` read.
  **One spelling each:** `OVERLAY_KEYS`/`NO_OVERLAYS` (was three lists that had to agree — adding `warnPop` had meant three hand-edits) · `sprintBlocked` (was three: the `disabled` binding, the `title` condition, `saveSprints`' second lock — any one missed silently unlocked Save) · `sprintRowBanners` (was a three-way `.concat` **inside** the per-draft-row loop) · `sprintPayload` (was three projections of the persisted fields; `sprintDirty` now derives its comparison from it) · `remeasure()` (was four byte-identical rAF lambdas) · sprint row identity settled once at the route boundary, so `duplicateNameIssues`/`blankNameIssues` drop their index params and the blank-skip moves to the call site · `--space-12`/`--space-4` for three raw px in the new popover.
  **Two guards rewritten to assert the RULE, not a snapshot** — the `.toHaveLength(4)` on the rAF lambda text *actively blocked* naming the pair (and a fifth seam calling only one half still passed), and the per-element `noop` assertion pinned the patch instead of the rule. **Two drift guards now derive instead of copying**: the `missing` tokens are read out of `src/services/pipeline.ts` (a reworded token used to ship a blank rationale with a green suite), and `longDate`/`fmtLongIso` are **executed against each other** across twelve months + leap day + the out-of-range cases, instead of having their interpolation source strings compared.
  **Live pass (real input, TEST board `tx8gDsTH`, project `rt-test` — synthetic fixtures only):** ← on a focused `.gsel` → no move, no `/replot` ✓ · ← / → on the row → moves and restores, one `/replot` each ✓ · **real pointer drag** MC-901 `2026-09-14` → `2026-09-21` ✓ (proves removing `dropOnBar`'s `|| ctx.node` fallback did not break the drag) · **real pointer drag released in its own column → zero `/replot`** ✓ · Delete on a sprint date → `sprintDirty` true, `sprintBlocked` true, Save disabled with tooltip, banner rendered ✓ (before the fix Save was live here) · Enter on `.warnmsg` → popover with both items and no empty rationale ✓ · Escape → focus back on trigger ✓ · **Enter on a Requests select item → focus back on trigger** ✓ (was `<body>`) · 7/8 rows warned and 7 stamped `row.warning` ✓ · 4/4 requestor badges clipped ✓ · console clean but for a pre-existing root `favicon.ico` 404. **All eight rows restored to their pre-verification weeks; sprint modal cancelled without saving; tree clean.** Net effect on the test project: 4 `schedule.replot` audit rows (two moves, two restores), zero net data change.
  **Not applied, deliberately:** `.warnpop` overflow/max-height — **R-warn-h settled it** (no internal scroll, so it stays out of the scroll dismisser's self-scroll exemption; the second measured placement is the mitigation), residual edge raised to Miles rather than reversed · the deleted banner's *"Fix in Trello and it corrects on the next sync"* sentence and a `.c-type` clip sweep — **product copy and scope, Miles (owl #26 items B and C)** · CSS de-duplication of the four shared `.grun`/`.gghost` declarations — the gain is four lines against selectors `gantt-run-geometry`/`drag-hittest` look up by name, in the area that cost three batches · `corrections` on the wire (now kept only for `kpi.open`) — a payload change with tests pinning it deliberately · z-index tokens and delegated drag listeners — both real, both wider than this diff. **Deploy aborted once on the standing environmental flake** (six suites, `Port "…" already in use`, zero assertion failures); green on rerun, recorded not masked.

### Older sessions — index

- 2026-08-18 — Batch 9 built: drag ghost shows only the coloured bars (T160; live pass owed as T161) → docs/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 built: drag handle becomes the coloured run (T158–T159); numbering note vs T157 → docs/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 ruling built: the drag affordance is the coloured bars only (T157, closes T155h) → docs/state-log/2026-08-18.md
- 2026-08-18 — Batch 7 built: Gantt fixes from JP's live-site report (T153–T155, ruling R-g-1) → docs/state-log/2026-08-18.md
- 2026-08-17 — Batch 6 built: Requestor cell no longer cuts long values mid-character (T150–T152) → docs/state-log/2026-08-17.md
- 2026-08-17 — Batch 5b built: two sprint-modal behaviour rulings R-f-10/R-f-11 (T146–T148); arrival pulse kept → docs/state-log/2026-08-17.md
- 2026-08-17 — Batch 5 built: Requests STATUS reduced to two values, In Pipeline / For Filing (T141–T144) → docs/state-log/2026-08-17.md
- 2026-08-17 — Batch 4 deployed live: sprints modal with four states, batch save on the audited PUT (T136–T140) → docs/state-log/2026-08-17.md
- 2026-08-17 — Invariant 13 amended v4.3.0: capacity joins the conflict-ack key; pins stay fully frozen → docs/state-log/2026-08-17.md
- 2026-08-17 — Batch 3 deployed live: capacity lock plus four more features (T130–T133, rulings R-a to R-e) → docs/state-log/2026-08-17.md
- 2026-08-15 — URL routing for main tabs deployed: /sirius/<project-code>/<tab> scheme (T127–T129) → docs/state-log/2026-08-15.md
- 2026-08-15 — Calendar amendment v4.2.0 deployed: TZ-safe week keys and holidays, ARES calendar canonical → docs/state-log/2026-08-15.md
- 2026-08-15 — Deliverables table + phase-segmented Gantt planner built and deployed (owl #22) → docs/state-log/2026-08-15.md
- 2026-08-14 — Planner toolbar, capacity slider with the first weekly-capacity write, sync strip deployed (T123–T124) → docs/state-log/2026-08-14.md
- 2026-08-14 — Review+simplify over 13d+13e: 5 bugs fixed incl. the inert Year/Month seed, 17 cleanups, deployed → docs/state-log/2026-08-14.md
- 2026-08-14 — Requests sorting + filed Year/Month columns deployed (T121–T122); header sort on most columns → docs/state-log/2026-08-14.md
- 2026-08-14 — Corrected status model (Trello presence) + Frost remarks restyle deployed (T119–T120) → docs/state-log/2026-08-14.md
- 2026-08-14 — Review+simplify over 13c: 5 bugs fixed incl. a cross-project draft leak, 10 cleanups, deployed → docs/state-log/2026-08-14.md
- 2026-08-14 — Requests tab v2 built and deployed from product owls #11–#12 (T116–T118) → docs/state-log/2026-08-14.md
- 2026-08-14 — Review+simplify over batch-2 deployed: 7 bugs fixed, 21 cleanups; push-drain ingests movement history → docs/state-log/2026-08-14.md
- 2026-08-14 — Review+simplify applied to the batch-2 diff: the push path can now move a span, not only clear one → docs/state-log/2026-08-14.md
- 2026-08-13 — Hotfix: live 500 on rt-test pipeline GET from a sparse model grid; fixed and deployed within the hour → docs/state-log/2026-08-13.md
- 2026-08-13 — Batch-2 pipeline cells deployed: due popover, start/done cells, links cell, MC# fix (T113–T115) → docs/state-log/2026-08-13.md
- 2026-08-12 — W3 difficulty writeback approved and built (T111–T112); owl MCP registered → docs/state-log/2026-08-12.md
- 2026-08-12 — G7 passed: real board live in observation mode; writes_enabled safety rail shipped first → docs/state-log/2026-08-12.md
- 2026-08-12 — Phase 13 deployed live after /simplify and /code-review gates; 15 findings applied → docs/state-log/2026-08-12.md
- 2026-08-12 — Phase 13 built: Pipeline redesigned to the Figma frame (T100–T110); awaiting JP go → docs/state-log/2026-08-12.md
- 2026-08-12 — Phase 12 deployed live for team testing; migration applied on host, live checks green → docs/state-log/2026-08-12.md
- 2026-08-12 — Errata reply received: all 6 corrections accepted; weight basis stands; no flicker risk → docs/state-log/2026-08-12.md
- 2026-08-12 — Phase 12 built same day (T092–T099): frost notes, day plan, weighted load; 214 tests dual-TZ → docs/state-log/2026-08-12.md
- 2026-08-12 — Build spec v1.1 processed and diffed against the live system; W2 stands, errata sent → docs/state-log/2026-08-12.md
- 2026-08-04 — Go-live session: G3–G6 executed, first deploy, SSO live; port 3955; TEST board registered → docs/state-log/2026-08-04.md
- 2026-08-04 — Phase 10 Sirius side built (T077–T084): reconcile reads urgency and due back; W2 due-date writes → docs/state-log/2026-08-04.md
- 2026-08-04 — Two-way sync decided and specced (phase 10): write registry v4.0.0, freshness via ARES push → docs/state-log/2026-08-04.md
- 2026-08-04 — Pre-staging batch: perf pass done at 5,000 cards, authz matrix test, deploy runbook for JP → docs/state-log/2026-08-04.md
- 2026-08-04 — TEST board created and the live urgency round-trip verified; phases 8 and 8a done → docs/state-log/2026-08-04.md
- 2026-08-04 — Invariant 17 amended v3.0.0: mirrored TEST board; phase 8 built with rollback urgency writes → docs/state-log/2026-08-04.md
- 2026-08-03 — UI aligned to the prototype design: Poppins, tabs, gantt, forecast panel; verified on 837 data → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 7 built (T046–T062): pipeline assembler, schedule writes, conflicts, five Ractive tabs → docs/state-log/2026-08-03.md
- 2026-08-03 — JP decision: urgency writes go direct to Trello with a dedicated account; phase 7 go → docs/state-log/2026-08-03.md
- 2026-08-03 — Release gate T045 passed: empirical model dates recognised as reality; forecast UI unlocked → docs/state-log/2026-08-03.md
- 2026-08-03 — T044 evidence regenerated for project 837: 257 samples across six months of movements → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 6 built (T040–T044): model refresh derivation, nightly job, grid loader; gate T045 open → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 5 complete (T035–T039): intake parser, sheets reader, syncIntake with deadline join → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 4 complete (T027–T033): ARES client, mapper, BR-10 rules, syncAres, 15-min worker loop → docs/state-log/2026-08-03.md
- 2026-08-03 — Gate T026 passed by JP: port fidelity accepted on three-way evidence; phase 3 closed → docs/state-log/2026-08-03.md
- 2026-08-03 — Workbook export processed: 84/84 formula-driven rows reproduce the sheet's dates exactly → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 3 built (T017–T025): calendar, model, forecast, planner ported verbatim with oracle parity → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 2 complete (T011–T016): Google SSO four checks, allow-list re-check, audit writer → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 1 complete (T007–T010): 15 collections, migration runner, fixture seed; ARES key verified → docs/state-log/2026-08-03.md
- 2026-08-03 — Phase 0 complete (T001–T006): scaffold, CI, deploy script, board guard; dual-TZ green → docs/state-log/2026-08-03.md
- 2026-08-03 — Kit created; no code exists yet → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 4 complete: tasks.md generated — 76 tasks on the phase ladder, gates assigned JP-only → docs/state-log/2026-08-03.md
- 2026-08-03 — Stack amendment by JP (v2.0.0): Mongo + Redis + Express 5 + Ractive beside ARES; OD-1/OD-8 resolved → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 3 complete: Implementation Plan converted to specs/001-sirius-v1 with contracts → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 2 complete: BRD v2.2 converted to spec.md; traceability verified programmatically → docs/state-log/2026-08-03.md
- 2026-08-03 — CLAUDE.md amended by JP: reply format added; constitution regenerated v1.1.0 → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 1 complete: constitution ratified v1.0.0, CLAUDE.md adopted verbatim → docs/state-log/2026-08-03.md
- 2026-08-03 — Step 0 complete: Spec Kit installed and scaffolded; repo initialised, first commit pushed → docs/state-log/2026-08-03.md
