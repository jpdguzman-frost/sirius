# PLAN.md — Sprint Schedules rebuild (owls #72/#73, frame 731:98513)

**EPHEMERAL** (constitution §Build workflow rev b): exists only while this
build is in flight; rotates into docs/history/state-log/ at CLOSE. Never
committed, never a Layer-1 doc.

Mode: **FULL**. Gate passed: JP saw the drift report (2026-08-27 session) and
answered the transition ask **yes** (2026-08-28): week-editing for old
deliverable rows pauses until Deadlines part 2.

## What this build is

The Sprint Schedules TAB BODY is rebuilt on the work-card unit. The server
half is live (`sprint_items`, three routes, `sprintItems: {rows, addable}` on
the `/deliverables` payload). This build is the screen only. **No server file
is touched.**

Source of truth for every visual number: frame `731:98513` read node-by-node
(2026-08-28 survey, in the session transcript). Where the mock contradicts a
ruled rule, THE RULE WINS — the four known cases are called out below.

## Agent split — EXCLUSIVE file ownership

| agent | owns (nobody else touches) |
|---|---|
| A `scripts` | `frontend/scripts/40-app-state.js`, `80-loaders.js`, `90-events.js`, `70-measure.js`, `60-overlays.js`, `eslint.config.js` |
| B `template` | `frontend/templates/views/40-schedules.html` |
| C `styles` | `frontend/styles/35-gantt.css`, `frontend/styles/30-planner.css` |
| D `tests` | everything under `test/` plus `test/helpers/gantt-render.ts` |

Already done by the main thread (baseline, do not re-edit):
`frontend/scripts/50-gantt-geometry.js` — `phaseRun`/`ghostBar` replaced by
`itemBar(row)` → `[{left,width,cls,title}]`, `plusLeft(weekKey)`,
`itemPhase` (colour only). `deadlineTick(row)`, `weekAtX`, `sprintLength`
unchanged.

An agent that needs to change a FROZEN interface below STOPS and reports —
interfaces are amended only here, by the main thread.

## Frozen interfaces

### State keys (agent A defines; B reads; D asserts)
- `sprintItems: { rows: [], addable: {} }` — stored verbatim from the
  payload in `loadAll` (`pipeline.sprintItems || { rows: [], addable: {} }`).
- `sprintSel: null | <itemId>` — single selection; the checkbox toggles it.
- `plotWeek: null | <weekKey>` — the week the pointer is over on the
  SELECTED unplotted row's track.
- `addRow: null | { sprintId, mc: null|string, cardId: null|string, saving: false }`
- `addMenu: null | 'mc' | 'card'` — joins `OVERLAY_KEYS` in 60-overlays.js
  with shield `.gdd` (trigger + menu live inside it).
- REMOVED state: `suggest`, `selected`, `arrived`, `perWeekLocal`. Grep
  before deleting; `expanded` belongs to Pipeline — do not touch.
- `resetForProjectSwitch` clears: `sprintSel`, `plotWeek`, `addRow`,
  `addMenu` (plus its existing list).

### Computeds / template helpers (A defines, B consumes, D executes)
- `sprintGroups()` → `[{ id, name, meta, count, rows }]` — ONE group per
  sprint from `sprints` **including empty sprints** (the add affordance
  needs a home), `rows` = `sprintItems.rows` filtered by `sprintId`
  (server order preserved — it is position-sorted). `meta` =
  `fmtDate(start) + ' - ' + fmtDate(end)` (frame: "Aug 24 - Aug 28"),
  `count` = `itemCount(n)`. NO 'outside', NO 'unscheduled' group — absence
  is the design (#72 §2).
- `addMcOptions()` → `Object.keys(sprintItems.addable).sort()`.
- `addCardOptions()` → `sprintItems.addable[addRow.mc] || []`
  (`{cardId, name, taskPrefix}`; server-sorted alphabetically — #73's
  provisional rule; DO NOT re-sort client-side).
- `footCaption()` → `` `Capacity: ${capacity.weekly}${band ? ` (${band})` : ''}` ``
  via `capacityBand`.
- `sprintFootText(weekKey)` / `sprintFootCls(weekKey)` (app.set helpers in
  70-measure.js, replacing `weekTotal`/`footText`/`footCls`/`perWeekLocal`):
  count of plotted rows whose `[startsOn..finish]` OVERLAPS the week
  (workday-window overlap: `startsOn <= isoAddDays(weekKey,4) && finish >= weekKey`),
  em-dash at zero; `over` class when count > `capacity.weekly`, `empty`
  when zero.

### Event handlers (A defines, B wires)
- `sprintSelect(ctx, itemId)` — toggle `sprintSel` (same id → null).
- `plotHover(ctx)` — mousemove on the SELECTED unplotted row's `.gtrack`:
  `weekAtX(clientX, track rect, plannerWeeks)` → `plotWeek`.
- `plotLeave()` — `plotWeek = null`.
- `plotPlace(ctx, itemId)` — click on that track: PATCH
  `/api/projects/:pid/sprint-items/:itemId` `{ starts_on: plotWeek }`
  (the week's Monday — #72 §6 places by hovered WEEK; the Monday is the
  start), then `loadAll()`; clear `sprintSel`/`plotWeek`. Errors →
  `flashBanner(errText(err))`.
- `unplotItem(_ctx, itemId)` — PATCH `{ starts_on: null }`, `loadAll()`.
  Wired to the calendar icon, enabled only when the row has `startsOn`.
- `openAddRow(_ctx, sprintId)`, `cancelAddRow()` (also Escape),
  `openAddMenu(ctx, which)` ('card' inert until `addRow.mc`),
  `pickAddMc(_ctx, mc)` — sets mc AND **always clears `cardId`** (#73:
  re-selecting the MC clears the work card; never re-match by name),
  `pickAddCard(_ctx, cardId)`, `submitAddItem()` — POST
  `/api/projects/:pid/sprint-items` `{ sprint_id, card_id }`; 409
  `CARD_COMPLETE`/`ALREADY_SCHEDULED` → `flashBanner` with the server
  message; success → `loadAll()`, clear `addRow`.
- REMOVED handlers (and their helpers, incl. `moveRows` at 90-events:925):
  `dragRow dragEnd dragOver dropOnWeek dropOnBar dragOverBlock dropBlock
  rowKey togglePin duplicateRow unslotRow editNote runSuggest clearSuggest
  acceptSuggest`. Also the suggest computeds
  (`suggestOffWeeks/-Text/-Proposed/-Flagged/-HardHeavy/-BlockedWhy`),
  `schedRows`, `plannerGroups`, `ghostBar` references.
- KEPT: `toggleBlock`, `toggleLeftPane`, `weekShiftView`, `capSlide`,
  `capCommit`, `ganttScrolled`, `nudgeScroll`, `trackJump`, the sprints
  modal set, `openSprints`.
- eslint `FRONTEND_SHARED`: remove names that no longer exist anywhere,
  add any new cross-file names (e.g. `itemBar` is app.set — NOT a global;
  check each before adding).

### Template structure (B builds; D asserts; C dresses)
Frame `731:98513`. Keep: toolbar (trpicker, cardsweek, unattached note,
Sprints button), gmonths/gcolhead skeleton, gblock/gbhinner collapse,
gfoot skeleton, thumb, sprints modal. Remove: the Suggest branch of
`.fnbox` (button, sgbar, Accept/Discard) and BOTH conflict banners
(`suggestOffWeeks`, `unavoidable`); all `draggable`/`on-drag*`/`on-drop`
attributes; `.gunsched` hint; `ghostBar` block; `gdragging` class wiring.
`fnnote` becomes: `Select a row, then click a week to place its bar — the
finish is computed.`

Column heads (952px pinned pane): `MC NO.` / `SCOPE` / `DEADLINE` /
`FORECASTED` / `STATUS`. Cells per row (class names frozen):
- `.gcell.c-mc` (122px): `<input type="checkbox" class="gsel">` checked
  when `sprintSel === row.id`, `on-click="['sprintSelect', row.id]"`,
  `aria-label="Select {{row.mcNumber}} {{row.name}} for placement"`; then
  `<span class="gmc">{{row.mcNumber}}</span>`.
- `.gcell.c-scope` (262px): badges row — urgency
  (`<span class="gub {{row.urgent ? 'urgent' : 'nonurgent'}}">` with
  ⚡Urgent / Non-Urgent text; Non-Urgent keeps the DASHED stroke) +
  difficulty (`<span class="pbadge gsm d-{{row.difficulty}}">` or an
  em-dash when null); below, the FULL card name
  `<span class="gname">{{row.name}}</span>` — never clamped in data,
  wraps in CSS (#73: the ellipsis is a display clamp, not the value).
- `.gcell.c-dl` (163px): `{{fmtLongIso(row.deadline)}}` or `—`.
- `.gcell.c-fc` (142px): `{{fmtLongIso(row.finish)}}` or `—`.
- `.gcell.c-gstatus` (263px): the RAW lane chip
  `<span class="pbadge s-{{row.status}}">{{row.currentList}}</span>`;
  when `row.status === null` an em-dash with
  `title="This card is no longer on the board"` (absent is its own
  state); then the icon trio `.gactions`: copy (`disabled`,
  `title="One row per work card — duplicating is refused"`), pin
  (`disabled`, `title="Pinning is parked"`), calendar →
  `unplotItem` (`disabled` when `!row.startsOn`,
  `title="Clear the placement — the row stays"`).
Row: `<div class="growr sitem {{#if sprintSel === row.id}}sel{{/if}}">`,
no tabindex-move keyboard path (flagged gap, see Deviations).
Track: `.gtrack` with the 12 `.gweek` cells (no drop handlers);
`{{#each itemBar(row) as b}}` → `<div class="gitem {{b.cls}}
{{#if row.late}}late{{/if}}" style="left:{{b.left}}%;width:{{b.width}}%;"
title="{{b.title}}">`; deadline tick unchanged
(`{{#if deadlineTick(row) !== null}}<div class="gdl" …>`); violet + only
when `sprintSel === row.id && !row.startsOn`: mousemove/mouseleave/click
handlers on the track and `{{#if plotWeek}}<button class="gplus"
style="left:{{plusLeft(plotWeek)}}%" aria-label="Place the bar in the
week of {{plotWeek}}">` with the plus icon.
After each group's rows: the add affordance —
`{{#if addRow && addRow.sprintId === g.id}}` the Add row, `{{else}}`
`.gaddzone` (`on-click="['openAddRow', g.id]"`, role=button, dashed rule
`.gaddrule` + circle `.gaddplus`, CSS-revealed on hover/focus).
Add row (`.growr.gaddrow`, details fill slate-50 = pending): c-mc hosts
the MC dropdown (90×32), c-scope the Work Card dropdown (230×32, disabled
until mc), c-dl the black `Add Item` button — **frozen class `.gaddbtn`**
(102×32, neutral-950 fill, white 12/600, radius-sm; `[disabled]` grey,
`.saving` half-opacity; NOT `.fnbtn`, which is toolbar-scoped and does not
reach the rows), disabled until cardId; c-fc/c-gstatus em-dashes + the
inert grey trio. The badges-row wrapper in c-scope is the EXISTING
`.gchips` container (frozen — B emits it, C dresses it).
[AMENDED mid-build 2026-08-28, main thread, on agent C's escalation.]
Dropdown (`.gdd`): `.gddctl` (open state darkens stroke, chevron flips) +
`{{#if addMenu === 'mc'}}` `.gddmenu` role=listbox with `.gdditem`
buttons — `.on` = SemiBold ONLY (no tick, no fill — #73), text clamps to
2 lines via CSS, the STORED value is always the full string.
Footer: `WORK CARDS / WEEK` + `{{footCaption}}`;
`{{sprintFootText(wk.key)}}` / class `{{sprintFootCls(wk.key)}}`.
Legend: Sketch, Render, Past deadline (`.gseg.late`), Client deadline —
Review REMOVED. Empty state: keep the existing no-groups branch, pointed
at the Sprints modal ("Create a sprint, then add work cards to it").

### CSS (C; class names above are frozen)
- Widths: `.c-mc` 122 / `.c-scope` 262 / `.c-dl` 163 / `.c-fc` 142 /
  `.c-gstatus` 263; `--gleft: 952px`; collapsed pane `.gantt.lpc
  { --gleft: 384px }` hiding `.c-dl/.c-fc/.c-gstatus`. Delete `.c-req`/
  `.c-type` and the 58px gutter padding (checkbox replaces the grip).
- Row height 120px; `.growr.sitem` white; name wraps, overflow hidden.
- Sprint block header `.gblockhead`: **48px tall** (frame nodes 731:98676 /
  98784; the kept 36px recipe was the old frame's — assigned to C).
  [AMENDED mid-build 2026-08-28.]
- `.gitem`: height 31, **radius 2** (read off the node by agent C via Rex;
  the plan's earlier 4 was the main thread's unverified default — node
  wins), vertically centred (top 44.5px), fills:
  `.sketch` amber-500, `.render` blue-600, `.work` slate-400, `.late`
  overrides to red-600. Delete `.gseg.review`, `.gseg.renderOverdue`,
  `.grun`/`.gbar`/`.gghost`/`.gunsched`/`.gdragging` rules, `.ghandle`,
  `.clipbadge` (schedules-only — verify with grep first).
- `.gdl`: **1px wide, `var(--red-500)`** (frame 731:98733 — was 2px
  slate-400; the legend swatch follows automatically). Agent C reads
  stroke-weight 2 on row instance 98682; owl #72's RULING says "1px …
  do not give it thickness", and a ruling outranks a node reading —
  1px stands, discrepancy flagged to product at CLOSE.
- `.gaddzone`: hidden at rest (opacity 0), revealed on hover/focus-within;
  `.gaddrule` dashed 1px `#6366f1` spanning the DETAILS pane only (stops
  at the gantt boundary); `.gaddplus` 24×24 circle `#6366f1` radius-pill,
  white +, centred. `.gplus` identical circle (deliberately the same —
  #72 §6), absolutely positioned in the track, centred within the --gw
  column, `pointer-events: none` (the TRACK takes the click).
- `.gdd`: control 32px tall, white, radius 4, stroke slate-200; `.open
  .gddctl` stroke `#334155`, chevron rotated; `.gddmenu` positioned
  `bottom: calc(100% + 5px)` (UPWARD — #73; no flip needed at a list
  end), width matches control (90/230), **fixed max-height 218px,
  overflow-y auto** (scroll is the normal case), stroke slate-200,
  radius 4, white; `.gdditem` 12px Google Sans Flex, 2-line clamp
  (`-webkit-line-clamp: 2`), `.on { font-weight: 600 }` and NOTHING else.
- New colour literals `#6366f1` (violet-600?) — add as a token in
  05-tokens.css? 05-tokens is UNOWNED this build: use the existing
  `--violet-500 #8b5cf6`? NO — the frame says `#6366f1` (indigo-500).
  Agent C: add `--indigo-500: #6366f1;` to 05-tokens.css — C takes
  ownership of 05-tokens.css for this one addition; nobody else touches it.

### Tests (D)
Law: `test/CLAUDE.md` (all 8 rules), `specs/001-sirius-v1/gantt-rules.md`.
- NEW `test/sprint-schedule-render.test.ts` via a new
  `renderSprintSchedule()` in `test/helpers/gantt-render.ts` (real
  Ractive `toHTML()` over the shipped template's schedules subtree; every
  iterated array stubbed; recipes under test never stubbed): groups incl.
  an EMPTY sprint rendering header + add zone; NO auto-population (three
  work cards in `addable`, zero rows → zero `.sitem`); no
  'outside'/'unscheduled' groups; row cells (checkbox, badges incl. the
  dashed Non-Urgent, FULL 71-char name — use #73's Corey G string,
  fmtLongIso dates, raw-lane chip, null-status em-dash, the disabled
  trio); add-row states (work-card dropdown disabled until MC, Add Item
  disabled until card, menu upward class, `.on` weight-only, full string
  stored on the option's handler args); `itemBar` executed FROM SHIPPED
  SOURCE (derive, don't copy) — plotted vs unplotted vs no-difficulty,
  window clipping, MIN_GRAB widening, finish-day-inclusive; late tint;
  `.gdl` 1px red-500 rule (assert the RULE: 1px + red token, not a
  snapshot); footer overlap counts; WITHDRAWAL guards — no `draggable=`,
  no `on-drag`/`on-drop` in the schedules subtree, no Suggest markup, no
  `.gseg.review` declaration, no ghost bar.
- RETIRE with the feature (each with a dated note pointing at #72 and
  this plan): `suggest-counts.test.ts`, `gantt-rowactions.test.ts`,
  `gantt-requestor-clip.test.ts`, `gantt-run-geometry.test.ts` (its
  MIN_GRAB/identity arithmetic MOVES into the new itemBar tests, not
  deleted).
- TRIM `drag-hittest.test.ts`: the drag-source sweeps die with the drag;
  KEEP AND DO NOT WEAKEN the inline-style law (incl. the `noteGrow`
  exact-text allow-list and its length-2 pin) and the week-cell
  hit-testability sweep (week cells now take real placement CLICKS — same
  law, new consumer; re-word the comments to say so).
- `planner-payload`, `sprints-modal`, dayplan/deadlines suites: untouched.
- Prove every NEW guard non-vacuous (revert-and-fail) — record which.

## Ruled decisions the mock contradicts (rule wins)
1. Dropdown order: server's alphabetical (Render before Sketch) — the
   mock shows Sketch first. Do not "fix".
2. Bars: start→finish duration, not the mock's fixed 28px chips.
3. Checkbox = placement selection (my read; flagged to product).
4. Icon trio: two inert (duplicate refused by unique index; pin parked),
   no remove control exists because none is drawn.

## Deviations / flagged gaps (report at CLOSE, not silently)
- No keyboard path for placement yet (pointer-only) — flagged to product.
- Placement lands on the hovered week's MONDAY (day-granular placement is
  #75's rollover territory).
- Footer counts are overlap-based (a bar spanning two weeks counts in
  both) — default taken.
- Old deliverable week-editing pauses until Deadlines part 2 (JP yes,
  2026-08-28).

## Phases after BUILD
VALIDATE (main thread): build.js, typecheck, lint, vitest dual-TZ;
non-vacuous proofs. REVIEW: correctness-with-adversarial-verify FIRST,
then simplify; any edit after VALIDATE re-runs it in full. E2E (main
thread, local dev server + chrome-devtools): seed difficulty labels onto
the three local fixture work cards first (synthetic fixtures, local db);
full add→place→unplot pass; console clean. CLOSE: STATE.md, day log,
rotate this file.

---

## CLOSE addendum (rotation note)

Rotated from the repo root at CLOSE per the constitution's ephemeral-plan
rule. Mid-build amendments that changed this plan: `.gaddbtn`/`.gchips`
frozen on agent C's escalation; bar radius 2 (C's Rex read beat the main
thread's unverified 4); 48px sprint headers; the `.gdl` 1px ruling upheld
over a stroke-2 node reading. The build itself: commits from the rebuild
through the simplification pass, 2026-08-28.
