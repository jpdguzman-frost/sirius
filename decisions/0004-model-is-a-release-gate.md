# 0004 — The model refresh is a release gate, not a feature

**Status:** accepted
**Date:** 2026-08-03

## Context

With the spreadsheet model retired (0003), everything visible rides on the
rebuilt empirical grid. The Implementation Plan's sequence makes item 6
("Model refresh + validation") a gate: building forecast UI on an
uncalibrated model produces a board where everything reads late, and that
costs the team's trust in the tool exactly once.

## Decision

No UI that displays forecast dates ships until the model refresh produces
dates the PM recognises as reality (constitution invariant 7; BRD risk R1
names this the mitigation for "forecast credibility lost"). The gate is
human sign-off — JP + PM — never self-certified by the build agent.

## Consequences

- Phase 7 (five tabs) was sequenced strictly after the T045 gate; it passed
  2026-08-03 with PM sign-off on real project-837 derivations (257 samples).
- Any future model-methodology change inherits the same bar: PM-recognisable
  dates before user-visible output (the phase 6 delta alerts exist to notice
  a grid shifting sharply overnight).
- Sample thinness is surfaced honestly (visible snapshot fallback) rather
  than hidden behind confident numbers.

## Alternatives rejected

- **Shipping forecast-date UI before the model refresh produces dates the
  PM recognises** — the alternative invariant 7 exists to ban; the plan's
  §8 note on item 6: building UI on an uncalibrated model produces a board
  where everything reads late, and that costs the team's trust once.

## Sources

Root `CLAUDE.md` invariant 7; `docs/Sirius__Implementation_Plan.md` §8 item 6;
`docs/Sirius__BRD.md` risk R1; `docs/state-log/2026-08-03.md` (T045 gate
passed, T044 evidence); `docs/gate-t045-model-validation.md`.
