# 0024 — STATE.md rotates per section, not per file

**Status:** accepted
**Date:** 2026-08-18

## Context

Record 0021 set the growth rule: no always-loaded file may grow with time. It
was written for whole FILES, and STATE.md satisfied it on paper — one byte cap,
one rotation window. Underneath, five of its eight sections accreted forever.

Measured 2026-08-18: 22.3KB against a 25KB cap (89% full). Seven of eight
*blocking* decision rows were already answered — the map generator had always
filtered them out, so they were read-cost with no reader. The phase table gained
a row per batch and stood at 23. One session narrative ran 5,688 chars (26% of
the file), parked in Layer 1 for a session before archiving.

## Decision

JP (2026-08-18, "another context bloat with growing text… has to follow the same
index format per file"): rotation applies at the SECTION, not the file. Each
accreting section keeps only what is live; what settles moves to a Layer-3
archive the session it settles, verbatim, never rewritten on the way.

Two archives join `state-log/`: `docs/history/phase-log.md` (every phase,
append-only) and `docs/history/decision-log.md` (answered questions, resolved
gates, approved deviations). The session-log convention is INVERTED — the full
narrative is written straight into `state-log/YYYY-MM-DD.md` and never into
STATE.md, not even for one session. Cap falls 25KB → 10KB.

## Consequences

22.3KB → 10.1KB with nothing lost: every moved row was checksummed before the
move and found in an archive after. The one row that failed that check was a
deliberate correction — it called the Trello write registry two entries when
constitution invariant 2 has held three since 2026-08-12.

Five assertions in `test/context-architecture.test.ts` enforce it, each proved
to redden by mutation: no settled row in either decision table · phase table ≤10
rows · session window ≤10 lines · each line ≤1200 chars and naming an archive
file that exists · STATE.md naming all three archives.

The archives are deliberately uncapped — capping them pushes content back into
Layer 1. Coupling: `scripts/generate-index.ts` parses three STATE.md headings by
exact name and hard-exits if one is missing; all three survive verbatim.

## Alternatives rejected

**Raise the cap to 40KB.** Buys months, concedes the principle.

**Fold answered decisions into `decisions/`.** That folder holds immutable
architectural records; these are project-management state.

**Leave a stub per answered row.** Stubs accrete too, just slower.

## Sources

- JP, 2026-08-18: the request, and approval of both asks.
- `docs/architecture/context-architecture.md` — caps table, rigidity log.
- Record 0021 (amended in scope, not principle).
