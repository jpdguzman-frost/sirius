# 0007 — Seed from fixtures, never from a production dump

**Status:** accepted
**Date:** 2026-08-03

## Context

Sirius reads real client briefs, so development needs realistic data without
the exposure: client content must never reach a developer laptop. The
companion exposure — a write path exercised against the production board —
is closed separately by the mirror TEST board and its board guard (0008).

## Decision

Seed from fixtures, never from a production dump — real briefs never touch a
developer machine (constitution invariant 16). Synthetic fixtures are the
only seed everywhere below production, including the standing rt-test
project.

## Consequences

- Fixture seeds deliberately encode the hard shapes (MC group ×3, sprint
  gap, shared-board label) so tests exercise them by default.
- rt-test carries synthetic fixtures only, forever.
- Fixture-driven write exercises stay off production boards mechanically:
  before any registry write, a board listed in `PROD_TRELLO_BOARD_IDS` is
  refused *in a non-production environment* (`contracts/trello-write.md`
  rule 3) — the qualifier scopes the guard to dev and staging, so it never
  blocks the future production pilot.

## Alternatives rejected

- **Seed from a production dump** — puts client briefs on laptops;
  convenience is not worth the exposure (invariant 16 bans it outright).

## Sources

Root `CLAUDE.md` invariant 16; `specs/001-sirius-v1/contracts/trello-write.md`
rule 3; `docs/HANDOFF.md` §Key facts (rt-test); `docs/state-log/2026-08-03.md`
(phase 1 seed entry).
