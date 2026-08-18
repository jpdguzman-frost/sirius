# 0019 — Conflict-acknowledgement keys include the capacity slice

**Status:** accepted
**Date:** 2026-08-17

## Context

Acknowledgements are keyed on the *situation* so that any change to the
cards involved re-surfaces the conflict (invariant 13). Product raised (owl
miles→jp #23) that a capacity change is also a situation change: a week
acknowledged as over-capacity at 120 is a different fact at 92, yet the old
three-part key would keep it suppressed.

## Decision

JP ruled A (2026-08-17, constitution v4.3.0): the ack key is
`week | rule | capacity | sorted card:phase pairs`. Invalidation is a
NON-match — no audit row, superseded acks stay in place — so reverting
capacity re-suppresses through the **original** ack. One `conflictKey()`
recipe exists (`src/services/conflicts.ts`, drift-guarded); hard-mix is a
planner flag, not an ackable conflict (guard test pins it). The broader
OD-4 expiry question (time- or event-based lapse of acks generally) stays
**open** — this record covers only the capacity slice.

## Consequences

- A capacity change silently re-arms every affected week's conflicts, and a
  revert costs nothing — the semantics fall out of keying rather than of
  bookkeeping (which is why no timestamp may ever enter the key; a test
  exists to fail if one does).
- Migration 007 backfills legacy keys with each project's own capacity
  (prod had zero acks — clean slate).
- Card-level indicators are never suppressed by an ack, unchanged.

## Alternatives rejected

- **The other lettered options** — reconstructed from the ruling log's
  emphasis (invalidation is a non-match, no audit row); the lettered option
  set itself lived in the owl exchange and is not recoverable from the
  repo, so its specifics are not restated here.
- **Leaving capacity out (status quo)** — an ack given under one capacity
  silently blessing a different one is the defect product named.

## Sources

Root `CLAUDE.md` invariant 13 (v4.3.0, amended 2026-08-17);
`docs/state-log/2026-08-17.md` (T135 build + JP ruling A);
`docs/HANDOFF.md` §Constitution changes; STATE.md OD-4 row (remainder
open).
