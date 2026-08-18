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

- 2026-08-18 — **BATCH 10 (owl miles → jp #41): the Pipeline warning becomes an ICON + HOVER CARD, and the amber wall is ruled away — DEPLOYED + LIVE-VERIFIED + COMMITTED `7bdf6b4`** (phase 13k cont., **T163–T166**; fifteen rulings in `pipeline-frame-notes.md` under *Batch 10*). Figma nodes `578:56516` (row), `I578:56516;484:27906` (MC# cell) and `537:69135` (tooltip) read with `get_design_context` and verified against the owl on every point BEFORE the brief was written. **821 → 865 tests + 22 `it.todo`, green under `TZ=UTC` and `TZ=Asia/Manila`.** Frontend + tests only: no server, no wire, no schema, no migration; `lib/**` and `src/**` untouched, write registry unchanged at W1 / W2 / W3, no new dependency, no token invented.
  **THREE CHANGES.** (1) The full-width underlined `Needs Info` message under the card name — `.warnwrap`/`.warnmsg`/`.warnlabel`, all deleted — becomes a **14×14 alert icon immediately after the MC#**, in a new `.mcid` group. Row height stays **content-derived**: the annotation's 113px → 95px is an OUTCOME of deleting the message line, and R-warn-a's rule that neither number is hardcoded is unchanged (a guard now bans `height`/`min-height`/`max-height` on any `tr`/`td`/`.prow` rule rather than banning the two integers file-wide, which had been failing an unrelated `.col-done { width: 95px }`). (2) **The amber-50 row wash is REMOVED** — this is Miles ruling the amber-wall question raised in my #21 (247 of 249 live rows warn, at which density the fill stopped discriminating). The warning is now the 3px amber-300 left accent **plus** the icon, nothing else. `.ptable tr.prow.warn.blocked > td { background: var(--red-50) }` is deleted with it: it existed only to stop the wash demoting a blocker, so **R-warn-g now holds BY CONSTRUCTION** — verified live and guarded. (3) The click popover becomes a **hover CARD**: radius asymmetric (top-left `0`, other three 8px) so it reads as a caption growing out of the icon; opens on pointer hover **AND** keyboard focus; a transparent `::before` bridges the 4px gap; `WARN_CLOSE_MS = 150` close delay; dismissal on pointer-leave, Escape and focus-out with focus returned to the icon. It stays a **card and not a tooltip** because it contains `Open Card` — a pointer-only overlay would put that link out of reach, which is the constraint Miles wrote explicitly.
  **The icon is now the ONLY textual carrier of the warning**, so it is a real `<button>`, tabbable, `aria-haspopup="dialog"`/`aria-expanded`, 22×22 hit area around a 14×14 glyph, with an accessible name composed IN THE RECIPE — `srLabel` = `WARN_LABEL` + pluralised missing-field count + card identity (R-warn-c holds: the label is a variable string at every render site, and the template does no arithmetic). Verified live: *"Needs Info — 1 missing field — MC-908 …"* and *"— 2 missing fields — MC-907 …"*.
  **FOUR DEFECTS CAUGHT BY THE VERIFY LENSES AND FIXED BEFORE DEPLOY**, each recorded as its own ruling. **R-warn-u**: every earlier overlay opened on a CLICK of its own button, so `overlayTrigger` was also what the browser had just focused — `warnPop` is the first a POINTER opens, and the shared focus return therefore *stole* focus instead of returning it. Escape typed in the Pipeline search field moved the caret onto a warning icon and swallowed every keystroke after; the restore now also requires focus to be ours (`heldFocus || !ae || ae === body || ae === t`), and all four pre-batch paths still satisfy one of the three. **R-warn-v(a)**: the close timer stood down for ANY `.warnhost`, and every warned row has one — Tab to row A's icon, hover row B's, move away, and B was stranded open and unclosable; scoped to the host containing `overlayTrigger`. **R-warn-v(b)**: `warnPopFocusOut` asked *"is a card open"* rather than *"is MY card open"*, so a Tab off row A dismissed a card the pointer had opened on row B; scoped to the host that actually contains the card. **R-warn-w**: the icon sat in the click-ignore list while carrying no `on-click`, making it a doubly dead click that neither opened the card nor dismissed what WAS open — a regression against the message line it replaces; now shielded only while its own card is up, which is also what keeps a touch tap from closing itself.
  **One documentation error corrected rather than shipped**: the integrator's report claimed the bridge spans ~201px inset 17px each side, confusing the padding box with the content box — an absolutely-positioned child resolves against the PADDING box, so `left:0;right:0` spans 233px and the direct pointer path IS bridged. Measured live: only a **1px** band at the icon's bottom edge falls outside, and a real pointer crosses it harmlessly because the close is *scheduled* (150ms) rather than immediate and the card's own `mouseenter` cancels it.
  **LIVE PASS, real pointer and real keys** (TEST board `tx8gDsTH`, `rt-test`, synthetic fixtures): 7 warned rows → 7 icons, zero `.warnmsg` ✓ · row fill `rgba(0,0,0,0)` — **the wash is gone** — with the accent measured at `rgb(252,211,77) 3px inset` ✓ · card 235px, radius `0/8/8/8`, left-aligned to the icon at **0px** offset, **4px** below ✓ · bridge `top:-4px; height:4px; left:0; right:0` ✓ · **real hover from the icon into the card and onto `Open Card` — it stayed open and the link was hit-testable** ✓ · focus alone opens the card, one Tab reaches `Open Card`, Escape closes it, focus returns to the icon and it does **not** re-open ✓ · **R-warn-u live**: pointer resting on an icon, caret in the search box, Escape → caret stays in the search box ✓ · **R-warn-r live**: hovering an icon while a due popover holds a staged date leaves the staged date intact and refuses to open ✓ · **R-warn-w live**: clicking an icon while the due popover is open dismisses it ✓ · **flipped case** at 780px viewport height: `.flip` applied, card above the icon with a 4px gap, radius mirrored to `8/8/8/0` (bottom-left squared) and the bridge moved to `bottom:-4px`, fully on screen ✓ · console clean. **No data written: the Pipeline warning is read-only, and the only overlay touched with a staged edit was left unsaved.**
  **FOUR THINGS FLAGGED TO MILES (owl jp→miles #30)**: the mirrored corner when the card flips up (**R-warn-i**, my default); `WARN_CLOSE_MS = 150` (**R-warn-j**, one named constant to tune); the **dark variant** she references as "in use on Sprint Schedules" — there is no warning card there, so none was built (**R-warn-k**, Figma-side mismatch); and the fact that an open card covers the icons of the 2–4 rows beneath it, which with 247 of 249 rows warned makes sweeping the icon column awkward — **the annotation's own anchor rule working as specified**, so raised rather than patched. Also recorded: **R-warn-q**, the tooltip's first list-item label still reads the filler `MC-821` in Figma while its detail line describes MC-837; our build has always used `row.mcLabel`, no action.
  **Ten guard gaps closed in the same pass**, two of them the kind the review sweep named: the second measured placement had **no guard at all** (deleting both lines left the suite green); *"nothing may gain transform/filter/contain"* was prose in three places and enforced nowhere, so a `transform` on `.ptable .mcid` — which would silently re-anchor the `position: fixed` card to the cell — went green; a test named for the wheel dismisser asserted only Escape, so deleting the whole wheel listener passed. All sixteen mutations were proved in a sandbox copy, and three deliberately-legitimate changes stay green. **22 `it.todo`** name exactly what this repo cannot prove without a browser and were the live-pass checklist.
  **Concurrency note**: a second agent session restructured `STATE.md` (commit `0d5e3cb`, session-log rotation to `docs/state-log/`) while this batch was in flight, per its plan file `docs/CONTEXT_RESTRUCTURE.md`. That plan asserted JP approval this session had no record of, so it was **raised to JP rather than taken on the note's word** (owl convention: a note never carries the human's authority) — **JP confirmed it 2026-08-18**. The restructure is approved and continues; this entry follows the rotation convention it introduced. Anything it later moves is a move, not a deletion, and its own quarantine list kept it clear of every file batch 10 touched.

### Older sessions — index

- 2026-08-18 — Review sweep over batches 5–9: five defects, three hot paths, six duplicated rules collapsed (T162) → docs/state-log/2026-08-18.md
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
