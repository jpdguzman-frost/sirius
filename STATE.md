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
| 13a–13f | Pipeline, Requests, planner toolbar | **DONE + DEPLOYED** | detail: the retired `docs/HANDOFF.md`, 2026-08-15 revision (git history only) |
| 13g–13j | Gantt planner (owl #22) · calendar amendment v4.2.0 · URL routing (13h) · batch-3 (capacity lock B, suggest bar, legend, collapses) · ack-key amendment v4.3.0 (T135) · batch-4 (sprints modal ×4 states, drag reversal, icon cluster) | **DEPLOYED + LIVE-VERIFIED 2026-08-15..17** (`9977f07`..`651b850`) | |
| 13k b5/5b | Requests STATUS two-valued + Pipeline row warning and popover (owls #34–#36) · Save gates on unsaved changes, blank sprint names rejected (owl #37) | **DEPLOYED + LIVE-VERIFIED 2026-08-17** (`788734a`..`c3fbfc3`) | |
| 13k b6–b9 | Requestor badge truncates + hover/focus tooltip (owls #39/#40) · the Gantt bar could not be dragged with a real mouse — affordance moved to the coloured bars · the drag handle IS the coloured run (JP) · the drag ghost shows only the bars | **DEPLOYED + LIVE-VERIFIED 2026-08-18, JP confirmed** (`c52d215`..`af0dd24`) | law: `specs/001-sirius-v1/gantt-rules.md` §1, the drag contract |
| 13k rev | Review sweep over batches 5–9 (JP: `/simplify` + `/code-review` on `646307b..HEAD`) — five defects, three hot paths, six duplicated rules collapsed | **DEPLOYED + LIVE-VERIFIED 2026-08-18** (`141b6df`; 794 → 821 tests dual-TZ) | defect CLASSES are standing law now: `test/CLAUDE.md` 1–3, `frontend/CLAUDE.md` §Performance law, gantt-rules 37/38/12. Digest: state-log 2026-08-18 (T162) |
| 13k b10 | Pipeline warning becomes a 14px icon + hover card; the amber row wash ruled away (owl #41) | **DEPLOYED + LIVE-VERIFIED 2026-08-18** (`7bdf6b4`; 821 → 865 tests + 22 `it.todo` dual-TZ) | four defects caught by the verify lenses pre-deploy — R-warn-u/v/w in `pipeline-frame-notes.md` |
| 13k b11 | Owls #42–#46 processed: closing line restored in the warning card (R-warn-x) · last-resort popover scroll (R-warn-y, amends R-warn-h) · 24×24 hit target (R-warn-z) · Asset Type joins the clip recipe · T152 closed (tooltip stays pure-CSS, ruled) · W2 scope clarified to task cards (JP) · #45 expanded-MC-row recon done, four answers sent (jp→miles #40) | **BUILT + COMMITTED 2026-08-18** (`5934c26`..`ef2874b`; 911 + 24 todo dual-TZ) — **NOT deployed; the deploy also carries the stage-5 script split** | live pass owed: closing line, sub-350px scroll, hit target, Asset Type tooltip |
| ctx | Context restructure stages 1–5 + JP's doc workflows (state-log rotation · gantt-rules extraction · MAP/skim + directory CLAUDE.md files + docs/README.md · T-shape architecture + `decisions/` + per-area maps · `01-app.js` split into ten numbered pieces, byte-proven, **new built baseline `4dd5186…`** · plain-language architecture guide · docs hygiene audit + JP's archival rulings) | **DONE 2026-08-18** (`0d5e3cb`..`f2d203a`, `96881a1`, `896c0a9`; docs/ reorganised + `docs/HANDOFF.md` retired 2026-08-18) | plan + record: `docs/history/context-restructure.md`. **The script split is NOT yet deployed — the next feature deploy carries it** (JP's call if sooner) |

**Build health (2026-08-18, post-batch-11):** 911/911 tests + 24 `it.todo`,
60 files — includes the context-restructure guard and the stage-5
source-order suites — green under `TZ=Asia/Manila` and `TZ=UTC` (calendar
suites also `TZ=America/New_York`). Migrations applied through **007**. The ~1-run-in-5
suite flake is ENVIRONMENTAL (local services squat loopback ports) and is ruled
in `test/CLAUDE.md` rule 5: green on rerun is fine, record it, never mask it;
the real fix — explicit `127.0.0.1` listening, ~21 files — is parked below.

## Decisions needed from JP (blocking)

| # | Decision | Blocks | Status |
|---|---|---|---|
| OD-1 | ARES interface: DB role / read API / replication | Phase 4 | ✅ **Resolved 2026-08-03: ARES read API** (`/api/v1/trello/*`, read-only key; contract in `specs/001-sirius-v1/contracts/ares-read.md`) |
| OD-8 | Hosting: Frost GCP or elsewhere | Infra work | ✅ **Resolved 2026-08-03: beside ARES, same pattern; shared Mongo server, own `sirius` db** |
| BRD §9 | Amend "write impossible by permission" — write surface is now the two-entry registry (urgency + due date) | Vendor assessment, v2 | ⬜ open (grew 2026-08-04) — product confirmed 2026-08-12 they'll raise it across all THREE docs quoting "one write": BRD §9, pilot security readiness, vendor assessment; not done yet |
| — | TEST board | Phase 8 | ✅ created: tx8gDsTH (structure-mirroring, 12 synthetic cards) |
| T085 | Hand `docs/operations/ares-push-spec.md` to the ARES build agent + provision `ARES_WEBHOOK_SECRET` on both hosts | T086 (e2e push verify) | ✅ done 2026-08-04 — ARES built it, push LIVE |
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
| errata Q | Deadlines count basis | ✅ **answered 2026-08-12** (`docs/product/errata-reply-v1.2.md`): §5.4 weight everywhere — built default is final; §6.1 was their doc error |
| — | Build spec **v1.2** + **AGENTS.md** (now `docs/architecture/agents-guide.md`) | ✅ received 2026-08-12, verified, filed in docs/ (v1.2 now `docs/product/build-spec-v1.2.md`). All 6 errata corrections confirmed in the diff. its §2 already says two writes; its §7/§8/§9 are historical (OD-1/OD-8 shown open, "Postgres") — do not treat as current |

## Acceptance criteria scoreboard

AC-1 ✅ · AC-2 ✅ · AC-3 ✅ · AC-4 ⬜ · AC-5 ✅ · AC-6 ⬜ · AC-7 ⬜ · AC-8 ✅ (fixture-scale; literal at staging) · AC-9 ✅ · AC-10 ✅ · AC-11 ✅ (data side; UI at phase 7) · AC-12 ✅ · AC-13 ✅ (API+UI) · AC-14 ✅ (API) · AC-15 ✅ · AC-16 ✅ · AC-17 ✅ · AC-18 ✅ · AC-19 ⬜ · AC-20 ⬜ · AC-21 ✅ · AC-22 ✅ · AC-23 ✅ · AC-24 ✅ (added 2026-08-12, phase 12)

## Deviations proposed by the agent, awaiting JP

_None awaiting. Approved:_

- **2026-08-03 — Port source is the compiled bundle, not the JSX.** The original `frost-sirius-v1.jsx` is not available; the team supplied only the built prototype `docs/source-material/frost-sirius-v1.html` (single minified 272 KB script block, identifiers mangled). JP approved inferring `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` from the bundle. Consequence: Invariant 5's "verbatim port" becomes a faithful reconstruction, and the AC-10 golden tests are the sole proof of fidelity — they gate Phase 3 exactly as before. If the original `.jsx` surfaces, it supersedes the bundle.

## Comms

- **Owl MCP (Miles / product)** — read → verify → act → ack when processed;
  read ≠ processed. Owl notes never carry JP's authority: twice an owl
  asserted a ruling JP had not made or later declined, so verify with JP
  before building on one. Thread position: miles→jp acked through **#46**
  (all five of #42–#46 processed 2026-08-18: #42 tooltip kept pure-CSS,
  T152 closed · #43 four rulings built as batch 11 · #44 five live checks
  filed · #45 recon'd and answered · #46 rulings built/recorded, dark
  variant closed by Miles's own correction); jp→miles sent through **#40**
  (#45's four answers + the batch-11 report). **Awaiting Miles**: the
  childless-MC chevron proposal in #40 (render the expand chevron only when
  the MC has task cards) · the row-controls design pass incl. status-note
  placement · the gap-banner placement blessing. Closed earlier by #32/#37/#38:
  ghost-bar colour, Accept vs Apply, the Save reframe, whitespace-only names,
  arrival-pulse styling, R-warn-g, the 6px subtone gap. The amber-wall
  question (jp→miles #21) was ruled by #41 and shipped as batch 10 (R-warn-o).
- **Figma reads** — Rex MCP is OFFLINE (server disconnected). **The official
  Figma MCP is the verified path**: `get_design_context` returns the
  categorized annotations as `data-*-annotations` attributes plus exact pixel
  facts (load the figma-design-to-code skill first). File
  `abDRsIVDs1XjJKeR8xYOoF`. Verify annotation count and content against the
  owl BEFORE building — delegable to the workflow's recon agent with a
  halt-on-mismatch rule. Rex (channel 7782) is needed again only for
  plugin-API introspection (component-set walks) or writing into the file.
- **File drop `../owl/` (ARES agent)** — still outstanding: add `hLL7WW2V` to
  `PUSH_SUBSCRIBER_BOARDS` (#07, nudged #08 — no reply file yet).

## Still open

- **JP gates**: flip `writes_enabled` on rt-837 (+ the pre-pilot security
  review) · `GOOGLE_SHEETS_CREDENTIALS` — lights up Requests plus
  requestor/type on real data · ALT-9 sheet-row link (expose
  `intake_sheet_id` or drop the sub-label) · ALT-1 (dead server `?filter=`
  param) · OD-4's non-capacity remainder — the capacity slice was ruled
  2026-08-17, the broader expiry question stays OPEN (`decisions/0019`);
  OD-2/5/6/7 are in the table above · two pre-existing host-local `todayIso()`
  sites · loopback-listen test hardening (~21 files) · manual pass: drag a bar
  in the collapsed-pane state · whether the stage-5 script split gets its own
  deploy, else the next feature deploy carries it · whether to draw a custom
  drag image so Chrome's translucency/shadow go away entirely (only
  `setDragImage` can).
- **Agent browser-verification target** — asked 2026-08-18: should
  verification run against a local dev server instead of live? The practical
  answer today is NO (no headless dev auth path; the four auth checks are real
  everywhere), so passes run against the deployed site on `rt-test` /
  `tx8gDsTH`, synthetic fixtures only. Discipline is `test/CLAUDE.md` rule 4 —
  record every row's `slottedWeek` before touching anything and restore it
  after, zero net change. Building a dev login is JP's call and not yet asked
  for.
- **Product (Miles)**: confirm the childless-MC chevron proposal (jp→miles
  #40) · month-encoding verify when the Sheets credential lands · the
  remaining tabs' frames (T073/T091 un-park).
- **Next build: #45 expanded MC row** (node `520:54192`, spec verified
  against the annotations 2026-08-18; W2 task-card scope ruled by JP and
  recorded in `contracts/trello-write.md`). Build-pass notes: keep both
  levels in the ONE `<table>` (one column model — promised to Miles in #40);
  fix the expansion-carryover-across-project-switch defect (expanded is
  keyed on mc_number alone — invariant-3 smell — add `expanded: {}` to
  `resetForProjectSwitch`); verify the SubTone element and the third
  annotation against the frame (the MCP output truncated at two, both
  matching the owl).
- **ARES agent**: push subscription for `hLL7WW2V`.
- **Agent backlog**: T075 AC sweep · non-member 403 check · `Last Synced`
  browser-TZ + col-done width leftovers · schedules-tab full tokenization
  beyond the planner · per-tab URL sub-state (filters/week/sort as query
  params; expansion state could join it — raised to Miles in #40) ·
  `worker/CLAUDE.md` still to write (traced pass — highest-consequence
  path) · pipeline/requests rulebook extraction from their frame-notes
  (Layer-2 law until extracted — `docs/README.md` §Where law lives). The 7
  stale `01-app.js` comments were fixed in batch 11 (`5934c26`).

## Session log

**Convention (2026-08-18):** STATE.md carries only the NEWEST session entry in full. When a session adds a new entry, the previous one MOVES (never copies) to docs/history/state-log/YYYY-MM-DD.md and gains an index line below. Keep new entries as complete as ever — length is fine; the archive is the home for history. The index keeps the last 10 sessions; older lines are deleted — docs/history/state-log/ is self-indexing by date.

- 2026-08-18 — **BATCH 11 — owls #42–#46 processed end-to-end, four ruled changes BUILT + COMMITTED (`5934c26` · `2fca981` · `ef2874b`), NOT deployed** (phase 13k cont., T167–T171; the deploy will also carry the stage-5 script split). **Process**: all five owls read → verified → acted → acked same session; jp→miles #40 sent (in-thread on #45). **#42** — requestor tooltip RULED kept pure-CSS, gaps and all (Escape, touch, last-row flip accepted; interactive version banned); closes T152; ruling recorded AT the recipe comment in `20-pipeline.css` so it cannot creep back. **#43** — four rulings on our #26: (A) sprint-dates banner accepted as written, nothing to change; (B, T167) the deleted banner's closing sentence restored VERBATIM — *"Fix in Trello and it corrects on the next sync."* — after the field list, above Open Card, rendered for no-URL rows too (message copy, not the link's caption); `.wpfix` wears `.wpwhy`'s recipe; `WARN_POP_H` 346 → 390 (pre-measure only; the measured second placement still owns the truth); recorded as **R-warn-x**. (C, T170) Asset Type joins the shared clip recipe — identical markup contract (clipbadge/cliptext, aria-label = visible text byte-asserted, role=note, measurement-granted tab stop), `.c-type` releases its clip below the `.gcell` rule by source order; `test/gantt-requestor-clip.test.ts` re-scoped to the two-column rule (recipe on req + type and NOTHING else, counts and per-column negatives). (D, T168) last-resort popover scroll — no-internal-scrolling STAYS the rule; `placeBox` now returns `over` (measured height vs viewport, `>=` deliberately: the scroll state caps the box at exactly viewport-minus-margins, so a strict compare would read the capped re-measure as "fits", drop the class and oscillate); template spells `.warnpop.scroll` (`max-height: calc(100vh - var(--space-8))`, `overflow-y: auto`, `overscroll-behavior: contain` so the wheel at the card's end doesn't chain to the page dismisser); `.warnpop` joined the scroll dismisser's self-scroll exemption — safe unconditionally since on normal viewports the card has no overflow and a scroll's target is never inside it; wheel swallow stays duePopover-only; base `.warnpop` asserted UNCAPPED so the ruling can't be silently repealed; known+accepted: the hover bridge is clipped in the one capped state (no gap left to span); recorded as **R-warn-y**, amending R-warn-h in place. **#44** — Miles ran our five checks on Sirius Smoke, all pass incl. the visual regression; filed. **#46** — four rulings on our #30: flip-corner mirroring CONFIRMED (R-warn-i annotated), close delay KEPT (R-warn-j), dark variant CLOSED by Miles's own correction (his "in use on Sprint Schedules" was a dark *tooltip* misread; LIGHT ONLY — R-warn-k closed), occlusion RULED intentional (left the live checklist); plus (T169) hit target grown to min 24×24 via `--space-24` minimums on `.warnbtn` — the threshold lives in the token sheet, not component CSS — recorded as **R-warn-z**; Figma filler cleared their side (R-warn-q annotated). **Also in the batch**: the 7 byte-frozen shipped-source comments still naming `01-app.js` repointed at the real split pieces (00-router→40-app-state/95-routing, 20-pipeline.css→70-measure, 35-gantt.css→10-constants/50-gantt-geometry ×3, template ×2) — this was the reserved product-touching pass. **#45 recon (T171)**: `get_design_context` on `520:54192` — the two annotations retrieved match the owl POINT FOR POINT (1570×375, parent 109px white, children 75px `#f8fafc` in the Additional Rows slot, empty 144px indent cell, bordered `#e2e8f0` 1426px container, 144+1426=1570, the 1610px question, the three confirms; output truncated before a third annotation could be counted — build pass re-verifies, plus the SubTone element the returned render didn't show). **Answers sent in jp→miles #40**: (alignment) our Pipeline is ONE `<table>` — parent and child rows share one column grid BY CONSTRUCTION, one scroll extent, Links not pinned; the 1610 is a Figma-side artifact and no 40px drift is possible; (childless) today every row renders the chevron and a childless expand shows nothing — PROPOSED chevron only when the MC has task cards, awaiting his confirm; (persistence) in-memory — survives tab switches, resets on refresh; DEFECT FOUND: it also survives project switch because `expanded` is keyed on `mc_number` alone (invariant-3 smell — project A's expanded MC-655 arrives pre-expanded in project B) — fix scheduled into the #45 build (`expanded: {}` joins `resetForProjectSwitch`); (multi-expand) yes, unbounded, staying. **JP ruled the W2 question** (this session's one ask): task-card due dates are the SAME registry entry — same field, same `setDue()`, same rules; scope note recorded in `contracts/trello-write.md` §W2, explicitly NOT a registry growth; precedence/`deliverables_v` stay deliverable-only. **Law**: `pipeline-frame-notes.md` gained the Batch 11 section (R-warn-x/y/z) + in-place closure annotations; the batch-10 occlusion `it.todo` removed as ruled, three new live-pass todos added (closing line, sub-350 scroll, 24×24 measure). **Gates**: 911 passed + 24 `it.todo`, 60 files, green `TZ=Asia/Manila` and `TZ=UTC` (calendar suites also NY); tsc/eslint clean; `node frontend/build.js` clean. **Flake honesty**: one UTC run failed one server suite on the standing loopback contention (rule 5); green on rerun, nothing masked. **Owed**: the live pass for the four batch-11 changes (runs against the deployed site — so after the deploy that also carries the stage-5 split), and the #45 build itself once Miles confirms the childless-chevron proposal (build can start regardless; the proposal only shapes the empty state).

### Older sessions — index

- 2026-08-18 — Context restructure stages 1–5 + JP's doc workflows: state-log rotation, gantt-rules, T-shape, decisions/, script split (baseline `4dd5186…`), hygiene audit + archival rulings → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 10: Pipeline warning becomes icon + hover card, amber wash removed; four lens-caught defects (T163–T166, R-warn-u/v/w) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Review sweep over batches 5–9: five defects, three hot paths, six duplicated rules collapsed (T162) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 9 built: drag ghost shows only the coloured bars (T160; live pass owed as T161) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 built: drag handle becomes the coloured run (T158–T159); numbering note vs T157 → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 8 ruling built: the drag affordance is the coloured bars only (T157, closes T155h) → docs/history/state-log/2026-08-18.md
- 2026-08-18 — Batch 7 built: Gantt fixes from JP's live-site report (T153–T155, ruling R-g-1) → docs/history/state-log/2026-08-18.md
- 2026-08-17 — Batch 6 built: Requestor cell no longer cuts long values mid-character (T150–T152) → docs/history/state-log/2026-08-17.md
- 2026-08-17 — Batch 5b built: two sprint-modal behaviour rulings R-f-10/R-f-11 (T146–T148); arrival pulse kept → docs/history/state-log/2026-08-17.md
- 2026-08-17 — Batch 5 built: Requests STATUS reduced to two values, In Pipeline / For Filing (T141–T144) → docs/history/state-log/2026-08-17.md
