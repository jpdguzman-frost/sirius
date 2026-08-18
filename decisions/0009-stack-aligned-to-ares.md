# 0009 — Stack aligned to ARES; Implementation Plan §2–§3 superseded

**Status:** accepted
**Date:** 2026-08-03

## Context

The Implementation Plan chose Next.js + Cloud SQL Postgres + Prisma +
Auth.js on Cloud Run. The team's existing production system, ARES, runs
Express 5 + Ractive + Mongo + Redis + Passport with no bundler — a stack the
team operates daily. Running two stacks means two sets of conventions,
deployment patterns and failure modes for one small team.

## Decision

JP amended the constitution (v2.0.0, 2026-08-03): Sirius adopts the ARES
stack wholesale — Node + Express 5, TypeScript `strict` for server/worker/
`lib/`, Ractive templates + plain JS + CSS concatenated by
`frontend/build.js` (no bundler), MongoDB via Mongoose, Redis sessions,
Passport Google OAuth (the four checks unchanged), a separate worker process
for all sync, Zod at API boundaries, Vitest. This supersedes the Plan's
§2–§3 stack and layout choices; the Plan still wins on other engineering
detail.

## Consequences

- Percentiles compute in worker code instead of native SQL — accepted at the
  ~5,000-card envelope (research D1 records the trade).
- The React prototype's components do not port; the five tabs were rebuilt as
  Ractive templates (UI estimate raised 12 → 15–18 days, research D3).
- One operational surface: shared Mongo server, shared deploy pattern,
  shared conventions (see 0011).
- The stack is fixed — "do not re-litigate" is constitutional wording.

## Alternatives rejected

- **Next.js + Postgres as planned** — relationally cleaner, but doubles the
  team's operational surface; superseded with rationale kept in research
  D1–D6.
- **SPA + separate API domain** — rejected independently of the amendment:
  CORS, token-in-browser, and it breaks the ARES-key server-side rule.

## Sources

Root `CLAUDE.md` §Stack (amendment note, 2026-08-03);
`specs/001-sirius-v1/research.md` D1–D6; `docs/Sirius__Implementation_Plan.md`
§2–§3 (superseded text); `docs/state-log/2026-08-03.md` (v2.0.0 entry).
