# 0006 — Sprints are editable data, not a cadence

**Status:** accepted
**Date:** 2026-08-03

## Context

Most planning tools generate sprints from a cadence (every N weeks from an
anchor date). Frost's real sprints vary in length with client alignment,
holidays and scope, so a generator would constantly disagree with reality.
BRD v2.2 lists this shift — "sprints are editable data, not a cadence" —
among its headline changes.

## Decision

Each project holds an explicit, editable list of sprints with start and end
dates (BR-5; FR-5.14). A deliverable belongs to whichever sprint contains its
slotted week. Overlaps are rejected on save — a week cannot belong to two
sprints; gaps are allowed and surfaced as *Outside any sprint* rather than
forced into a neighbour (FR-5.15; constitution invariant 12).

## Consequences

- Sprint edits are ordinary audited state changes (invariant 10), not
  configuration.
- *Outside any sprint* is an honest, expected UI state — prod rt-test showing
  all rows outside any sprint is correct data, not a bug (2026-08-15 live
  verification leaned on exactly this).
- Operational modal/save rules live in `specs/001-sirius-v1/gantt-rules.md`
  §3, not here.

## Alternatives rejected

- **Cadence generator** — wrong whenever a sprint stretches or shrinks, which
  is normal here; the data would fight the calendar it is meant to model.
- **Forcing gap weeks into the nearest sprint** — hides real planning gaps;
  BR-5 chooses surfacing over tidiness.

## Sources

Root `CLAUDE.md` invariant 12; `docs/Sirius__BRD.md` BR-5, FR-5.14/5.15 and
the "Changes in 2.2" row; `docs/state-log/2026-08-15.md` (Outside-any-sprint
verified live).
