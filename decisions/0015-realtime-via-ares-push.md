# 0015 — Realtime via ARES push webhooks; the poll survives as fallback

**Status:** accepted
**Date:** 2026-08-04

## Context

The 15-minute ARES poll met NFR-3 but made two-way sync feel dead: a due
date written to Trello, or a card moved there by hand, took up to 15 minutes
to surface. The freshness options weighed were a faster poll and a push
channel from ARES — which already ingests Trello and debounces its events.

## Decision

JP chose push from ARES (option c, 2026-08-04, phase 10) on the
**notification-then-read** pattern: ARES pushes signed *triggers*, never
truth — on receipt the worker re-reads the affected card from the read API
and reconciles. The 15-minute poll stays as the reconcile fallback,
relaxing while push is healthy and reverting on silence; the signature
scheme, windows and thresholds are owned by
`specs/001-sirius-v1/contracts/ares-push.md`, not restated here.

## Consequences

- Ordering, duplication and payload drift are irrelevant by design — any
  event, stale or repeated, converges to the same state (leaning on 0014's
  idempotent reconcile).
- A dead push channel degrades to exactly the pre-push behaviour, never to
  data loss (drill-verified 2026-08-04).
- Measured live: 37 s Trello→Sirius end-to-end (T086); NFR-3 target < 1 min.
- The ARES half is a separate build with a lockstep contract pair
  (`ares-push.md` ↔ `docs/ARES_PUSH_BUILD_SPEC.md`); sync still never runs
  inside a request (worker drains `push_events`).

## Alternatives rejected

- **Faster polling** — quota burn against the shared 60 req/min budget for
  still-minutes latency.
- **Payload-carrying webhooks (push as truth)** — reintroduces ordering and
  drift problems the read API already solves; a trigger cannot be wrong
  about data it does not carry.

## Sources

`specs/001-sirius-v1/contracts/ares-push.md`; `docs/ARES_PUSH_BUILD_SPEC.md`;
`docs/state-log/2026-08-04.md` (decision, build, T086 37 s + fallback
drill); STATE.md NFR-3 row.
