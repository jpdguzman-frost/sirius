# Sirius context architecture

_Ruled by JP 2026-08-18: rule files are one-per-AREA (provisional — "test the
rigidity as we build the system forward", see Rigidity log); the skim replaces
docs/MAP.md; layer definitions below are JP's wording. Enforced by
`test/context-architecture.test.ts` and `scripts/generate-index.ts`.
This file records the context architecture; it governs documentation shape,
never product behaviour._
_last-verified: 2026-08-18_

## The layers

**Layer 0 — ENTRY. Always the latest context, read first, regardless of
domain. Kicks in the moment an agent starts.**
Root `CLAUDE.md` (the constitution — auto-loads) and `docs/MAP.md` (the skim —
first read; ≤150 lines, script-refreshed so it is always current).
Directory-scoped `CLAUDE.md` files (`frontend/`, `test/`, `lib/`, `src/`)
are contextual extensions of this layer: they auto-load only when an agent
works under their directory, ≤4KB each.

**Layer 1 — CURRENT STATE. Always the current state of the system; protected
against rot.**
`STATE.md` alone — phase table, decisions, AC scoreboard, comms and open
threads, the newest session entry in full, a 10-session index window. Rot
protection is structural: hard caps, rotation windows, generated facts, and a
guard test that goes red on decay. (`docs/HANDOFF.md` was the second Layer-1
file until 2026-08-18, when JP retired it — "an extra step that can be
removed"; every unique fact it held moved to the file an agent actually meets
it in. Layer 1 is one file now.)

**Layer 2 — TASK SET. Loaded on demand for the task at hand; every file
atomic and bounded.**
Domain rulebooks — one file per AREA of the app, rules numbered inside, cap
~20KB, split by sub-area at the cap, never by individual rule
(`specs/001-sirius-v1/gantt-rules.md` + `sprint-rules.md` today, split 2026-09-05; pipeline and requests to follow
the pattern) · `decisions/NNNN-short-name.md` — ONE architectural decision per
file, 20–40 lines (Title / Status / Context / Decision / Consequences /
Alternatives rejected); accepted decisions are never edited — changes are a
new numbered file marked as superseding · the write-registry contract and
spec-kit files (`specs/001-sirius-v1/`).

**Layer 3 — ARCHIVE. Unbounded, self-indexing, never loaded except for
archaeology.**
`docs/history/state-log/` (dated filenames are the index) · the frame-notes histories
behind their banners · git history · owl threads. Self-indexing means the
unit's name carries its key — no upper layer ever needs a line per archived
item.

## Principles

1. **No always-loaded file may grow with time.** Anything that accrues
   (sessions, decisions, rulings) lives in Layer 3 as self-indexing units;
   the layer above holds a fixed window plus one pointer to the directory.
   Windows rotate; rotation deletes index LINES only, never content.
2. **Current state is authoritative and top-level; history and rationale are
   drill-downs.**
3. **Authority runs two ways.** Code decides FACTS: a doc describing
   behaviour yields to code — flag the contradiction in task output, never
   silently work around it. OBLIGATIONS bind the other way: the constitution,
   the write registry, and the rulebooks bind code — code contradicting them
   is a defect to flag, never a doc to rewrite.
4. **Atomicity.** The most important context is atomic and easy to process:
   one purpose per file, one decision per file, one area per rulebook,
   fact+pointer lines in the skim. If a line explains, the explanation moves
   a layer down.
5. **Decisions are protected.** Before changing a module, read its entries in
   `decisions/`. Settled choices are never silently re-decided.
6. **Enforcement over discipline.** The structure must survive neglect:
   generated facts cannot rot, and every cap, window, format, and staleness
   date below is asserted by the guard test.

## Standing working rules (JP)

Discipline JP has stated as standing, not per-task. Recorded here because both
rules govern how work reaches the code and the docs. They arguably belong in
the root constitution — that file is JP's to edit, so they live here until he
moves them.

- **Every build runs through the Workflow tool.** Opus builders / integrate /
  fix, Fable verify lenses, contract-first recon, seeded isolated-db probes,
  render tests via `test/helpers/gantt-render.ts` (real Ractive `toHTML()`
  over the shipped template). Report when testable; owl Miles after deploy;
  small scoped commits carrying requirement IDs; `STATE.md` updated every
  session. Session gates before "done": typecheck · eslint · vitest dual-TZ ·
  frontend build · probes green — the per-phase definition of done itself is
  the root `CLAUDE.md` §Definition of done, per phase.
- **The drift rule is structural: delete the override, share the recipe, never
  patch both copies.** One phase→colour map, one banner recipe, one key
  recipe. It binds documentation the same way — content MOVES, the old home
  points at the new one, it never copies.

## Caps and guards (asserted by `test/context-architecture.test.ts`)

| Item | Bound |
|---|---|
| `docs/MAP.md` (main index) | ≤150 lines; both standing rules at top; AREAS/STATUS/DOCMAP generated; does NOT grow with codebase size — per-file lines live in the area maps |
| Area maps (`docs/architecture/map-*.md`, Layer 2) | ≤150 lines each; GEN:MODULES bijection — the union of the maps lists every source file exactly once, each in the map its area names; no `TODO: describe` persists |
| `STATE.md` (Layer 1) | ≤10KB; **no settled row in either decision table** — answered ones rotate to `docs/history/decision-log.md`; phase table ≤10 rows (complete phases → `docs/history/phase-log.md`); session log = 10-line window of summaries, each ≤1200 chars and naming an existing `state-log/` file; must name all three archives |
| `docs/history/**` (Layer 3 archives) | deliberately UNCAPPED — `phase-log.md`, `decision-log.md`, `state-log/`. They exist so Layer 1 can stay small; capping them would push content back up |
| Domain rulebooks (`specs/**/*-rules.md`) | ≤20KB each — over the cap = split by sub-area |
| Directory `CLAUDE.md` files | ≤4KB each (guard sweeps every top-level dir; the convention is top-level only — don't nest) |
| `decisions/*.md` | 20–40 lines target (guard hard-stops at 60), one decision, `# Title` first line + Status/Context/Decision/Consequences/Alternatives rejected/Sources; README index must match the directory |
| Hand-written Layer 0/2 docs + rulebooks | carry `last-verified: YYYY-MM-DD` (not the constitution — JP versions it; not `STATE.md` — Layer 1 freshness is its content) |
| `scripts/generate-index.ts` | idempotent — second run byte-identical |

## Rigidity log

JP holds the one-file-per-area granularity provisional. After each build
batch, record here any friction: a rulebook over cap, a rule needed by two
areas, a contract that fought the grouping. Empty log = the structure holds.

- 2026-08-18 — `docs/HANDOFF.md` RETIRED (JP: "I use handoff.md only for
  keeping context every compact… it's an extra step that can be removed").
  Real friction: it was the one always-loaded file with no single audience, so
  it re-collected facts that already had homes and its caps needed policing.
  Layer 1 is now `STATE.md` alone; the standing rules above are the part of it
  that had nowhere else to go.
- 2026-08-18 — maps decomposed per area (JP, restructure stage 4d, decision
  0022): the modules block was the one Layer-0 section growing with the
  codebase; split while cheap. map-test-suites deliberately deferred
  (trigger: Test-guards section outgrows ~20 lines).
- 2026-08-18 — docs/ reshaped into role folders and HANDOFF retired (JP);
  Layer 1 is STATE.md alone. Redirects: decisions/0023.
- 2026-08-18 — **STATE.md rotated section by section (JP: "another context
  bloat with growing text… has to follow the same index format per file").
  Real friction, and the sharpest yet: the growth rule was written for
  WHOLE files, so STATE.md passed every check while five of its eight
  sections accreted forever** — 22.3KB against a 25KB cap, 7 of 8 blocking
  decisions already answered, and one session narrative at 5,688 chars
  (26% of the file) parked in Layer 1 for a session at a time. The lesson
  generalises beyond this file: **rotation belongs at the section, not the
  file.** A file made of sections rots one section at a time, and a byte cap
  on the whole cannot see it. Two archives added (`phase-log.md`,
  `decision-log.md`), the session-log convention INVERTED — narrative is
  written straight into `state-log/`, never here first — cap 25KB → 10KB,
  and five new assertions, each mutation-proved to redden. Decision: 0024.
