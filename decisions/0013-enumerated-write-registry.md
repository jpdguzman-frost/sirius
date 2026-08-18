# 0013 — Writes to source systems live in an enumerated registry

**Status:** accepted
**Date:** 2026-08-04 (one-write principle 2026-08-03; grown 2026-08-12)

## Context

Sirius's credibility with the team rests on "it reads everything, owns only
planning". v1 allowed exactly one write (the `Urgent` label, JP-decided
2026-08-03 as a direct Trello call — ARES stays read-only). When two-way
sync added the due-date write, the question was how to open a write surface
without it creeping.

## Decision

The write surface is **enumerable**: it is the registry table in
`specs/001-sirius-v1/contracts/trello-write.md`, exhaustively — today W1
`Urgent` label, W2 due date (2026-08-04, constitution v4.0.0 MAJOR), W3
`Difficulty:` label (2026-08-12, v4.1.0, product's BRD-§9-A1). Growing the
registry is a **constitution amendment, never a code change**. All
interfaces live in `lib/trello.ts` only. Google Sheets has no write path,
ever (invariant 2).

## Consequences

- An agent finding itself writing anything else to a source system has
  misread the task — the constitution says stop, by name.
- Each entry carries the full rule set (rollback, board guard, no-op guard,
  audit, echo-reconcile — see 0014); a new entry inherits them by joining
  the table.
- BRD §9's "write is impossible by permission" is stale; product owns the
  one→three amendment sweep (tracked in STATE.md, still open).
- Every registry change so far has a named human approval on record.

## Alternatives rejected

- **Case-by-case writes as features demand** — exactly the creep the
  enumeration exists to prevent; the amendment ritual is the point.
- **Writing via ARES** — ARES's key class 403s writes by design; a second
  write path would blur which system owns the change (research D9).

## Sources

`specs/001-sirius-v1/contracts/trello-write.md`; root `CLAUDE.md` invariant
2; `specs/001-sirius-v1/research.md` D9; `docs/state-log/2026-08-04.md`
(v4.0.0) and `2026-08-12.md` (W3, v4.1.0).
