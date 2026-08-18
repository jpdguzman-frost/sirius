# 0014 — Every Trello write is optimistic with rollback; Trello stays truth

**Status:** accepted
**Date:** 2026-08-04 (urgency-only original 2026-08-03)

## Context

A write path to Trello creates two copies of a fact, and the failure mode is
Sirius displaying a state Trello never accepted. v1 solved this for the
single urgency write; when the registry grew (0013), the rule was generalised
to bind every entry — and the loop had to close in the other direction too,
because people also edit Trello by hand.

## Decision

Constitution invariant 8 (amended 2026-08-04, v4.0.0): every registry write
is Trello-first and optimistic with rollback — the local change persists only
after the Trello write succeeds; a failed write reverts it. Sirius never
displays a state Trello lacks. Every attempt (success and failure) writes
`audit_log` and `sync_runs`. Trello-owned fields — including the written ones
— reconcile from ARES reads, so a manual Trello change always surfaces in
Sirius, and reconcile is idempotent, silently absorbing the echo of Sirius's
own writes.

## Consequences

- Ordering/duplication of sync events becomes irrelevant — everything
  converges on the next read (the same property 0015's push design relies
  on).
- Non-atomic writes need explicit worst-case design under this rule: W3's
  add-first label swap was chosen so the visible failure is a double label
  the next sync heals, never a card with no difficulty.
- A no-op write is rejected before Trello is called — the audit log records
  changes, not attempts (invariant 10's spirit, enforced registry-wide).

## Alternatives rejected

- **Local-first, sync later** — invents a Sirius-owned copy of Trello-owned
  fields; divergence is then a matter of time.
- **Blocking (non-optimistic) writes** — pays UI latency on every toggle to
  avoid a rollback path the failure case needs anyway.

## Sources

Root `CLAUDE.md` invariant 8; `specs/001-sirius-v1/contracts/trello-write.md`
(rules 1–6, W3 semantics); `specs/001-sirius-v1/contracts/ares-push.md`
§Reconcile ownership; `docs/state-log/2026-08-04.md`.
