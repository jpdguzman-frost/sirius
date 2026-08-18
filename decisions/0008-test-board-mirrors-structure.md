# 0008 — Non-prod points at a TEST board mirroring production structure

**Status:** accepted
**Date:** 2026-08-03 (invariant 17 amended 2026-08-04)

## Context

Sirius writes to a production Trello board through the write registry, so
staging and local need a board that behaves like production without being
it. The original invariant asked for a duplicate of the production board;
the board turned out to be too large to copy.

## Decision

Staging and local point at a NON-PRODUCTION TEST board mirroring the
production board's *structure* — same lists and label taxonomy, a dozen
synthetic cards (constitution invariant 17, amended 2026-08-04 by JP:
structure-mirroring replaces a full duplicate because the production board
is too large to copy). Before any registry write runs, the board guard
refuses a board listed in `PROD_TRELLO_BOARD_IDS` *in a non-production
environment* (`contracts/trello-write.md` rule 3) — scoped so the guard
catches a mis-pointed dev or staging process and never blocks the future
production pilot.

## Consequences

- TEST board `tx8gDsTH` created 2026-08-04 (11 mirrored lists, full
  taxonomy, 12 synthetic cards); every live write round-trip proves itself
  there first (write-registry rule 7).
- The board guard is code, tested since phase 0 — safety does not depend on
  configuration discipline alone.
- rt-test on `tx8gDsTH` remains the standing live-verification target; its
  seeding stays governed by 0007 (synthetic fixtures only).

## Alternatives rejected

- **Full duplicate of the production board** — the 2026-08-04 amendment's
  reason: the board is too large to duplicate; structure is what the mapper
  and label taxonomy actually depend on.

## Sources

Root `CLAUDE.md` invariant 17; `docs/state-log/2026-08-04.md` (v3.0.0
amendment + board creation); `specs/001-sirius-v1/contracts/trello-write.md`
rules 3 and 7; `docs/HANDOFF.md` §Key facts (rt-test).
