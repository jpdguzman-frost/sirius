# 0018 — The rt-837 capacity pin is enforced by a structural lock (Option B)

**Status:** accepted
**Date:** 2026-08-17

## Context

The 0016 pin was an instruction, not a mechanism: from 2026-08-12 to
2026-08-17 nothing but discipline stopped a capacity write from moving the
pinned 120. JP raised exactly this during 13f; product's owl #23 carried
the options, and Option B — a structural lock — was chosen.

## Decision

JP (2026-08-17, owl #23, Option B): rt-837's capacity is locked
structurally via `projects.capacity_locked` — the capacity write path
refuses while the lock is set, and migration `006-capacity-lock-rt837`
locks that one project. The refusal semantics, unlock flow and per-project
lock state live in `src/routes/schedule.ts` and the batch-3 entry of
`docs/state-log/2026-08-17.md`, not here.

## Consequences

- The 0016 pin turned from a standing instruction into a mechanical
  refusal — no sync, agent or teammate can "correct" 120 → 92 without the
  lock coming off first.
- The UI shows the lock honestly (dimmed slider, padlock, reason) rather
  than hiding the control.

## Alternatives rejected

- **Advisory-only pin (no lock)** — the actual state from 2026-08-12 until
  2026-08-17; Option B was chosen precisely because a note in a doc does
  not stop a write path.

## Sources

`docs/state-log/2026-08-17.md` (batch 3, capacity lock Option B);
`docs/HANDOFF.md` §LIVE + §rulings; `src/routes/schedule.ts` (capacity
route); migration `006-capacity-lock-rt837`.
