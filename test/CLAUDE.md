# test/ — durable law for writing or editing tests

Scope: everything under `test/`. Planner law lives in
`specs/001-sirius-v1/gantt-rules.md` + `sprint-rules.md` and constitution law in the root
`CLAUDE.md` — point at those, never copy them into assertions.

_last-verified: 2026-08-18_

1. **Guards assert the RULE, never a snapshot of the implementation.** A
   count-pin on the rAF lambda text FORBADE a correct refactor while a fifth
   seam calling half the pair still passed — it blocked good work and missed a
   real defect. State the rule the test defends; assert that. [state-log
   2026-08-18, review sweep]

2. **Derive, don't copy.** When a guard must agree with a production value,
   READ it out of the shipped module or EXECUTE both sides against each
   other — never compare hardcoded copies. Precedents: the `missing` tokens
   are read out of `src/services/pipeline.ts` (a reworded token once shipped
   a blank rationale under a green suite), and `longDate`/`fmtLongIso` are
   executed against each other (twelve months + leap day + out-of-range),
   not compared as source strings. [state-log 2026-08-18]

3. **Source-regex guards read RAW text — comments included.** Twice a prose
   comment tripped a drift guard; both times the guard was right and the
   comment was reworded. Know this when writing guards AND when editing
   guarded files. [state-log 2026-08-18; gantt-rules §5]

4. **Only a browser proves an interaction.** Law: `gantt-rules.md` §5 — NO
   synthetic `DragEvent`s, ever (they call the handlers directly and never
   enter Chrome's drag machinery); a drag ships only after a real-pointer
   pass; `test/drag-hittest.test.ts` is the standing structural guard.
   Procedure, chrome-devtools MCP: `take_snapshot` for uids, then
   `drag(from_uid, to_uid)`; attach listeners BEFORE the drag and read back
   only summarised counts — a raw log blows the tool's output cap. On "browser already running": `pkill -f
   chrome-devtools-mcp/chrome-profile`, then `new_page`. **Live verification writes are real** — passes run against the
   deployed site on `rt-test`/`tx8gDsTH`, synthetic fixtures only. Record
   every row's `slottedWeek` before touching anything and restore it after
   via `POST /api/projects/:id/replot` (zero net change); check `audit_log`
   if a week looks unfamiliar.
   [gantt-rules §5; JP 2026-08-18, STATE.md §Still open]

5. **Run the suite dual-TZ**: `TZ=UTC` and `TZ=Asia/Manila`; calendar
   suites also `TZ=America/New_York`. Known ENVIRONMENTAL flake: local
   services squat loopback ports, so ~1 full run in 5 fails one random
   server suite (socket hang up / stranger's 404). Green
   on rerun is fine — record it; never retry-cap, never mask. The real fix
   (explicit `127.0.0.1` listening, ~21 files) is a parked task.

   ⚠️ SECOND, distinct flake: many files timing out at `startTestDb()` (31
   start a real mongod). Tell is DURATION — 973s vs ~27s. Confirm by
   re-running the FULL suite, not one file. → state-log 2026-08-25
   [STATE.md §Still open]

6. **Render tests go through `test/helpers/gantt-render.ts`** — real
   Ractive `toHTML()` over one balanced `<div>` subtree of the SHIPPED
   template, stubbing only helpers whose maths another suite executes from
   shipped source: the recipe under test is never stubbed, and every array
   the template iterates MUST be stubbed or the section renders empty and
   the assertion passes vacuously.

7. **Probes and seeds use ISOLATED dbs only** — `scripts/seed.ts` does
   `deleteMany({})` on every collection. The golden suites
   (`test/calendar|forecast|planner.test.ts`, oracle in `test/golden/`)
   prove the verbatim `lib/` port and are the highest-value tests in the
   project; handle them per the root `CLAUDE.md` invariants.

8. **Source-reading guards go through `test/helpers/source.ts`** — never a
   hardcoded frontend filename: the app scripts are ten numbered files
   concatenated by `frontend/build.js`, so a guard naming one breaks at the
   next split. [test/helpers/source.ts]
