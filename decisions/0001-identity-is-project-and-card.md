# 0001 — Identity is (project_id, trello_card_id); mc_number is not unique

**Status:** accepted
**Date:** 2026-08-03

## Context

The intake sheet and the team speak in MC numbers, so the obvious key for a
deliverable is `mc_number`. The BRD's data survey killed that: 15 MC numbers
carry multiple deliverables, and MC-825 alone carries 99. A key that collides
99 times is not a key.

## Decision

Deliverable identity is the pair `(project_id, trello_card_id)`. `mc_number`
is an attribute shared across an MC group, never a unique key. Humans get a
derived `display_id` (e.g. `MC-655.3`) for reference. Every collection carries
`project_id` and every query filters on it (constitution invariant 1), making
the pair meaningful from the first migration — Sirius is multi-project by
construction, and two projects sharing a Trello board cannot collide.

## Consequences

- Joins from the sheet land on the MC *group*, not one row — deadline joins
  cover the whole group (AC-8 measures that coverage).
- UI and audit rows reference cards; anything keyed on bare MC numbers is a
  defect.
- Fixtures deliberately include an MC-655 ×3 group so the shape is always
  exercised (phase 1 seed).

## Alternatives rejected

- **`mc_number` as primary key** — collides (MC-825 ×99); silently merges
  distinct deliverables.
- **`trello_card_id` alone** — breaks project isolation and invariant 1's
  filter-on-project rule.

## Sources

Root `CLAUDE.md` invariant 3; `docs/Sirius__BRD.md` line 120 (the 15/99
survey); `docs/state-log/2026-08-03.md` (phase 1 seed entry).
