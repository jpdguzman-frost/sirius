# 0016 — rt-837 capacity pinned at 120 as a calibration reference

**Status:** accepted
**Date:** 2026-08-12

## Context

When the real board went live in observation mode (G7), ARES steering
reported a live typical of 92 cards/week while the project carried the BRD
snapshot's 120. The obvious "fix" — auto-correct to the measured value —
would silently move every capacity line the team is calibrating the tool
against.

## Decision

JP (2026-08-12): rt-837's `weekly_capacity` **stays pinned at 120** as a
deliberate calibration reference against the live ARES typical of 92; it is
never changed without JP. The footer renders both
(`capacity 120 · typical 92`) so the gap is visible, not hidden.

## Consequences

- No sync or agent may "correct" 120 → 92. As ruled, the pin was a standing
  instruction only; 0018 later made it a mechanical refusal.
- The pin interacts with conflict math deliberately: capacity joined the
  ack key (0019) — with the value pinned, acks stay stable until JP moves
  it, at which point every affected week correctly re-surfaces.

## Alternatives rejected

- **Auto-correct to ARES's live typical** — destroys the calibration
  comparison the pin exists to run, and moves planning ground truth without
  a human decision.

## Sources

`docs/state-log/2026-08-12.md` (G7 entry, DECIDED line); `docs/HANDOFF.md`
§LIVE + §rulings; memory note `rt837-capacity-pinned.md`.
