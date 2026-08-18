# 0002 — No task→deliverable edge; work cards attach to the MC group

**Status:** accepted
**Date:** 2026-08-03

## Context

A planning tool would love a graph from each work card (task) to the
deliverable it serves — per-deliverable progress would fall out of it. The
BRD's survey measured whether that edge exists in the real data: task titles
were matched against deliverable titles, and only 1 of 27 matched.

## Decision

Do not model a task→deliverable relationship. Work cards attach to the MC
*group* (constitution invariant 4). Anything derived from work cards —
Started/Done spans, cycle time, weighted load (BR-6c) — is computed at group
scope, never attributed to a single deliverable.

## Consequences

- Pipeline expansion shows the MC group's work cards (FR-4.2), not a per-row
  task list.
- BR-6c's weighted load (`1 + tasks÷deliverables`) works at group granularity
  precisely because no finer edge is trustworthy.
- If the team ever starts naming parents reliably, adding the edge is a new
  decision with new evidence — not a refactor.

## Alternatives rejected

- **Title-matching heuristics** — 1-of-27 accuracy means 96% of edges would be
  guesses presented as facts.

## Sources

Root `CLAUDE.md` invariant 4; `docs/Sirius__BRD.md` line 120 (1-of-27
evidence) and FR-4.2; BR-6c rationale in `docs/state-log/2026-08-12.md`
(errata-reply entry: 244/269 deliverables have no tasks).
