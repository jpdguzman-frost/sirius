# 0010 — Trello data comes through the ARES read API (OD-1)

**Status:** accepted
**Date:** 2026-08-03

## Context

Sirius needs Trello card and movement data that ARES already ingests. Three
interfaces were on the table (OD-1): a read-only role on ARES's database, a
read API on ARES, or replicating Trello ingestion inside Sirius. The choice
determines who owns the schema boundary and whether two systems fight over
one upstream quota.

## Decision

JP resolved OD-1 (2026-08-03): Sirius consumes Trello **only** via the ARES
read API — `/api/v1/trello/*`, enveloped, paginated, rate-limited, behind a
read-only `X-API-Key` held server-side. Writes through that key 403 by
design; ARES is never a write path. Build only on `stable` operations; the
one `internal` exception (steering, for BR-6a capacity) sits behind an
adapter Sirius owns, with CI shape-drift probes.

## Consequences

- ARES's API contract is the schema boundary: its internals can change
  freely; drift breaks a CI probe, not the runtime.
- Sirius inherits ARES's ingestion (and its 60 req/min budget) instead of
  duplicating Trello sync and burning shared upstream quota twice.
- Freshness is bounded by ARES's cycle — measured live at 15 min, later
  collapsed to seconds by push (0015).
- The read-only key class makes invariant 2's read-only posture structural,
  not behavioural.

## Alternatives rejected

- **Direct DB role on ARES's Mongo** — couples Sirius to ARES's private
  schema; any internal refactor breaks Sirius silently.
- **Replicating Trello ingestion in Sirius** — two ingesters, double quota
  burn, and two versions of the truth to reconcile.

## Sources

`specs/001-sirius-v1/research.md` D7; `specs/001-sirius-v1/contracts/ares-read.md`;
STATE.md decisions table (OD-1 row); `docs/state-log/2026-08-03.md`
(v2.0.0 entry, endpoints verified live).
