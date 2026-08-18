# 0012 — lib/ ported from the compiled bundle; golden tests are the proof

**Status:** accepted
**Date:** 2026-08-03

## Context

Invariant 5 requires `lib/forecast.ts`, `lib/planner.ts` and
`lib/calendar.ts` ported verbatim from the validated prototype
`frost-sirius-v1.jsx` — several rounds of correction are baked into that
code. The original `.jsx` turned out to be unavailable; the team supplied
only the built prototype `docs/frost-sirius-v1.html` (one minified 272 KB
script block, identifiers mangled).

## Decision

JP approved the deviation (2026-08-03): the compiled bundle is the port
source. "Verbatim port" becomes a faithful reconstruction, and the AC-10
golden tests become the **sole** proof of fidelity — a verbatim-extracted
oracle (`test/golden/original.mjs`) plus parity suites (~3,600-card forecast
matrix; planner/quota/note-string parity; 84/84 workbook cross-validation).
The gate (T026) stayed JP-only and passed on that three-way evidence. If the
original `.jsx` ever surfaces, it supersedes the bundle.

## Consequences

- `docs/frost-sirius-v1.html` is provenance and must never be deleted
  (recorded in `docs/README.md`).
- Behavioural quirks are preserved deliberately (`toFriday` Fri/Sat/Sun→next
  Monday and friends, `extraction-notes.md`) — fidelity outranks tidiness;
  "clean-ups" of ported logic are constitutional violations.
- Changes to ported files happen only by constitution amendment with the
  golden tests rebuilt against a stated reference (the 2026-08-15 calendar
  amendment, 0017, is the worked example).

## Alternatives rejected

- **Reimplementing from the BRD's formulas** — discards the validation the
  prototype paid for; re-opens closed date-arithmetic risk (research D2).
- **Waiting for the original `.jsx`** — unavailable with no ETA; the golden
  oracle gives equivalent confidence with evidence instead of provenance.

## Sources

STATE.md §Deviations (2026-08-03 entry); root `CLAUDE.md` invariant 5;
`specs/001-sirius-v1/research.md` D12; `docs/state-log/2026-08-03.md`
(phase 3 + T026 gate); `docs/README.md` (never-delete note).
