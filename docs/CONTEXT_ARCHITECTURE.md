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
Directory-scoped `CLAUDE.md` files (`frontend/`, `test/`, later `lib/`,
`src/`) are contextual extensions of this layer: they auto-load only when an
agent works under their directory, ≤4KB each.

**Layer 1 — CURRENT STATE. Always the current state of the system; protected
against rot.**
`STATE.md` (phase table, decisions, AC scoreboard, the newest session entry in
full, a 10-session index window) and `docs/HANDOFF.md` (current landmarks,
pointers not restatements). Rot protection is structural: hard caps, rotation
windows, generated facts, and a guard test that goes red on decay.

**Layer 2 — TASK SET. Loaded on demand for the task at hand; every file
atomic and bounded.**
Domain rulebooks — one file per AREA of the app, rules numbered inside, cap
~20KB, split by sub-area at the cap, never by individual rule
(`specs/001-sirius-v1/gantt-rules.md` today; pipeline and requests to follow
the pattern) · `decisions/NNNN-short-name.md` — ONE architectural decision per
file, 20–40 lines (Title / Status / Context / Decision / Consequences /
Alternatives rejected); accepted decisions are never edited — changes are a
new numbered file marked as superseding · the write-registry contract and
spec-kit files (`specs/001-sirius-v1/`).

**Layer 3 — ARCHIVE. Unbounded, self-indexing, never loaded except for
archaeology.**
`docs/state-log/` (dated filenames are the index) · the frame-notes histories
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

## Caps and guards (asserted by `test/context-architecture.test.ts`)

| Item | Bound |
|---|---|
| `docs/MAP.md` (skim) | ≤150 lines; both standing rules at top; every MODULES path exists on disk and every source file is listed (bijection); no `TODO: describe` persists |
| `STATE.md` | ≤25KB; session index ≤12 lines (10-session window + slack) |
| `docs/HANDOFF.md` | ≤24KB target; the guard hard-stops at 26KB |
| Domain rulebooks (`specs/**/*-rules.md`) | ≤20KB each — over the cap = split by sub-area |
| Directory `CLAUDE.md` files | ≤4KB each (guard sweeps every top-level dir) |
| `decisions/*.md` | 20–40 lines target (guard hard-stops at 60), one decision, required headings |
| Hand-written Layer 0/2 docs + rulebooks | carry `last-verified: YYYY-MM-DD` (not the constitution — JP versions it; not STATE/HANDOFF — Layer 1 freshness is their content) |
| `scripts/generate-index.ts` | idempotent — second run byte-identical |

## Rigidity log

JP holds the one-file-per-area granularity provisional. After each build
batch, record here any friction: a rulebook over cap, a rule needed by two
areas, a contract that fought the grouping. Empty log = the structure holds.

- (none yet)
