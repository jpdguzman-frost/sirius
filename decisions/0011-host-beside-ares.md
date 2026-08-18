# 0011 — Host beside ARES: same droplet pattern, own `sirius` database (OD-8)

**Status:** accepted
**Date:** 2026-08-03

## Context

Hosting was an open decision (OD-8): Frost's GCP (the Plan's Cloud Run +
Cloud SQL topology) or the droplet where ARES already runs. With the stack
aligned to ARES (0009), a separate cloud topology would mean a second deploy
pipeline, secret store and monitoring surface for the same team.

## Decision

JP resolved OD-8 (2026-08-03): Sirius deploys beside ARES, same droplet and
deployment pattern, using ARES's Mongo server with its **own** `sirius`
database. Secrets live in server-side environment configuration on the host
(dotenv, per the ARES pattern) — including the Sheets service-account
credential, provisioned as a host secret and never committed.

## Consequences

- One box to operate; deploy mirrors ARES's pattern (the specifics —
  scripts, URL, port — are owned by `docs/SERVER_SETUP_SPEC.md`).
- Database-level separation (own `sirius` db) keeps blast radius and backup
  scope clean despite the shared server.
- The Plan's Cloud Run rationale — attached service account, no Sheets key
  file — died with the topology; research D6/D8 record the replacement
  (host-side secret).
- Local dev mirrors the shape: host mongod shared with ARES dev, own
  database.

## Alternatives rejected

- **Cloud Run + Cloud SQL (the Plan §3.1–3.2)** — a second operational world
  for a one-team shop; superseded with its rationale kept on record.
- **Sharing ARES's database itself** — schema entanglement for no gain;
  separation costs nothing on the same server.

## Sources

`specs/001-sirius-v1/research.md` D6, D8; STATE.md decisions table (OD-8
row); root `CLAUDE.md` §Stack + invariant 15; `docs/SERVER_SETUP_SPEC.md`;
`docs/state-log/2026-08-03.md`.
