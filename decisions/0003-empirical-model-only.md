# 0003 — The empirical model is the only forecast users see

**Status:** accepted
**Date:** 2026-08-03

## Context

The legacy spreadsheet formula was the team's forecasting tool for years, so
the safe-looking move was to ship it alongside a new measured model. But
measurement across 1,184 completed review cycles showed the spreadsheet
overstates client review waits 2.6–4.6× (measured p70 4.80d vs the workbook's
12.5d Medium / 22d Hard) — it is why every card in early prototypes rendered
late.

## Decision

The empirical model — percentiles from measured lane dwell, keyed on
difficulty × lane, refreshed nightly per project — is the only forecast shown
anywhere (BR-2). The spreadsheet formula survives as
`lib/forecast.legacy.ts` strictly for migration tests proving the port was
faithful; it is never imported by UI code (invariant 6).

## Consequences

- No "classic mode" toggle, ever: presenting a number known wrong beside a
  measured one invites using the wrong one.
- The model refresh is operationally load-bearing — see 0004 (release gate)
  and D11 (nightly refresh, delta-tracked).
- A UI import of `forecast.legacy.ts` is a defect by definition, cheap to
  guard mechanically.

## Alternatives rejected

- **Offer both models** — rejected in BR-2 for the reason above.
- **Delete the legacy formula outright** — loses the only executable proof
  that the migration reproduced the workbook before retiring it.

## Sources

Root `CLAUDE.md` invariant 6; `docs/Sirius__BRD.md` BR-2, BR-3 and Appendix
measured constants (median 2.68 · p70 4.80 · n=1,184);
`specs/001-sirius-v1/research.md` D11.
