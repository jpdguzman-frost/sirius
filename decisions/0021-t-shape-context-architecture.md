# 0021 — The layered context architecture (entry / state / task set / archive)

**Status:** accepted
**Date:** 2026-08-18

## Context

Agent session-start anchors had grown to ~34k tokens, and STATE.md alone
(123 KB) exceeded a single tool read — the documentation was rotting into
its own navigation problem. JP approved a staged restructure
(`docs/CONTEXT_RESTRUCTURE.md`) and ruled the resulting shape as
architecture, not housekeeping.

## Decision

JP (2026-08-18): documentation lives in four layers — Layer 0 ENTRY (root
`CLAUDE.md`, `docs/MAP.md`, directory-scoped `CLAUDE.md`s), Layer 1 CURRENT
STATE (`STATE.md`, `docs/HANDOFF.md`, rot-protected by caps and rotation),
Layer 2 TASK SET (one rulebook per AREA; one decision per file here;
contracts), Layer 3 ARCHIVE (self-indexing, never loaded except for
archaeology). No always-loaded file may grow with time; accepted decisions
are never edited — changes are a new numbered record superseding the old.
Enforcement over discipline: every cap, window and format is asserted by
`test/context-architecture.test.ts` and `scripts/generate-index.ts`.

## Consequences

- Session-start anchor cost ~34k → ~10k tokens; planner law reads as one
  bounded rulebook instead of a 172 KB history.
- Structure survives neglect: generated facts cannot rot; a decayed cap
  goes red in CI rather than quietly bloating.
- The one-file-per-AREA rulebook granularity is **provisional** — JP holds
  it open ("test the rigidity as we build the system forward"); friction is
  recorded in the architecture file's Rigidity log, and a change there would
  supersede this record's granularity clause, not its layers.
- This directory exists because of this decision (restructure stage 4b).

## Alternatives rejected

- **Keep growing STATE.md/HANDOFF.md** — measured failure: unreadable in one
  tool call, rising per-session cost with no ceiling.
- **One file per rule** — atomicity below the useful grain; rules read in
  area-sized sets (JP's granularity ruling, held provisional).
- **Code-graph MCP ("graphify")** — assessed and skipped: pays off at
  hundreds of source files; Sirius is ~12.3k source lines and the weight
  was prose. Revisit at 50–100k lines or sustained cross-repo ARES work.

## Sources

`docs/CONTEXT_ARCHITECTURE.md` (JP-ruled 2026-08-18);
`docs/CONTEXT_RESTRUCTURE.md`; STATE.md 2026-08-18 session entry (stages
1–3, graphify assessment); `test/context-architecture.test.ts`.
