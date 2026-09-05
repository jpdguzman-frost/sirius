# 0020 — Pins freeze the row completely (Option B)

**Status:** accepted
**Date:** 2026-08-17

## Context

A pinned deliverable's meaning was contested: product (Miles) proposed that
pins should only shield a row from Suggest's automated proposals while
leaving manual drag free (FR-5.9 change request). Owls #27/#31 and two live
Figma annotations carried that assumption as if settled (citing #24); the
batch-4 build itself followed JP's ruling from the start.

## Decision

JP ruled Option B (2026-08-17): **pins are fully frozen** — a pinned row is
excluded from Suggest AND immovable manually, everywhere (drag, keyboard
reslot, `/replot`, which skips pinned rows without an audit row). Miles's
"pins block Suggest only" was declined; the owls carrying the stale language
are superseded and Miles was informed (jp→miles #18/#19). The pin freezes
the pinned ROW, not its column — a pinned row's track still accepts other
rows' drops.

## Consequences

- One meaning of "pinned" across every surface; UI affordances follow it
  (no drag handle on the coloured run, refusal cursor and title —
  operational detail in `specs/001-sirius-v1/sprint-rules.md`).
- Standing instruction not to re-litigate: recorded in HANDOFF's
  never-re-litigate list; agents must not resurrect the Suggest-only
  reading from the stale owls.
- Probes assert `/replot` skips pinned rows with no audit row (batch 4).

## Alternatives rejected

- **Pins block Suggest only (Miles's proposal)** — a "pinned" row that still
  moves under a stray drag makes the pin a suggestion, not a promise; JP
  declined it explicitly.

## Sources

`docs/state-log/2026-08-17.md` (invariant-13 session entry: FR-5.9 ruling B;
batch-4 entry: pins supersession enforced); `docs/HANDOFF.md` §JP rulings to
never re-litigate; `specs/001-sirius-v1/gantt-frame-notes.md` (batch-4
precedence override — the two stale annotations); `specs/001-sirius-v1/sprint-rules.md`
(operational pin rules).
