# test/ — durable law for writing or editing tests

Scope: everything under `test/`. Planner law is NOT restated here — its
authoritative home is `specs/001-sirius-v1/gantt-rules.md`; constitution law
is the root `CLAUDE.md`. Point at those, never copy them into assertions.

1. **Guards assert the RULE, never a snapshot of the implementation.** The
   standing lesson: `expect(...matchAll(...)).toHaveLength(4)` on the rAF
   lambda text actively FORBADE extracting the duplicated lambda into
   `remeasure()`, while a fifth seam calling only half the pair still passed
   — a count-pin that blocked a correct refactor and missed a real defect.
   State the rule the test defends; assert that. [docs/HANDOFF.md
   §review-sweep; docs/state-log/2026-08-18.md]

2. **Derive, don't copy.** When a guard must agree with a production value,
   READ it out of the shipped module or EXECUTE both sides against each
   other — never compare hardcoded copies. Precedents: the `missing` tokens
   are read out of `src/services/pipeline.ts` (a reworded token once shipped
   a blank rationale under a green suite), and `longDate`/`fmtLongIso` are
   executed against each other (twelve months + leap day + out-of-range),
   not compared as source strings. [docs/HANDOFF.md;
   docs/state-log/2026-08-18.md]

3. **Source-regex guards read RAW text — comments included.** Twice in two
   batches a prose comment tripped a drift guard (a CSS comment naming the
   four phase colour classes; a bare decimal in a JS comment). Both times
   the guard was right and the comment was reworded, not the guard. Know
   this both when writing guards and when editing guarded files.
   [docs/state-log/2026-08-18.md; specs/001-sirius-v1/gantt-rules.md §5]

4. **Drag/planner verification law lives in
   `specs/001-sirius-v1/gantt-rules.md` §5.** Headline only: NO synthetic
   `DragEvent`s, ever — a synthetic event calls the app's handlers directly
   and never enters Chrome's drag machinery; a drag interaction ships only
   after a real-pointer pass; `test/drag-hittest.test.ts` is the standing
   structural guard. [specs/001-sirius-v1/gantt-rules.md §5]

5. **Run the suite dual-TZ**: `TZ=UTC` and `TZ=Asia/Manila`; calendar
   suites also `TZ=America/New_York`. Known ENVIRONMENTAL flake: local
   services squat loopback ports, so ~1 full run in 5 fails one random
   server suite with a weird face (socket hang up / stranger's 404). Green
   on rerun is fine — record it; never retry-cap, never mask. The real fix
   (explicit `127.0.0.1` listening, ~21 files) is a parked task.
   [docs/HANDOFF.md]

6. **Render tests go through `test/helpers/gantt-render.ts`** — real
   Ractive `toHTML()` over one balanced `<div>` subtree of the SHIPPED
   template, stubbing only helpers whose maths another suite executes from
   shipped source: the recipe under test is never stubbed, and every array
   the template iterates MUST be stubbed or the section renders empty and
   the assertion passes vacuously. [test/helpers/gantt-render.ts]

7. **Probes and seeds use ISOLATED dbs only** — `scripts/seed.ts` does
   `deleteMany({})` on every collection. The golden suites
   (`test/calendar|forecast|planner.test.ts`, oracle in `test/golden/`)
   prove the verbatim `lib/` port and are the highest-value tests in the
   project; handle them per the root `CLAUDE.md` invariants.
   [docs/HANDOFF.md §gotchas; scripts/seed.ts; root CLAUDE.md]
