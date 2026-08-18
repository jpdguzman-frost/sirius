# 0005 — Auth is four server-side checks, re-run on every route

**Status:** accepted
**Date:** 2026-08-03

## Context

Sirius handles client delivery data for one company, so authentication is
Google SSO on the company domain — but a domain check alone admits every
account in the workspace, and a client-side check admits anyone who can call
the API directly. The BRD requires SSO restricted to
`frostdesigngroup.com` plus a named allow-list (FR-2.4).

## Decision

Four checks, all server-side, all in the sign-in path: verified email · `hd`
claim = `frostdesigngroup.com` · matching email domain · active allow-list
row. Every API route re-checks the session AND project membership on each
request; deactivating an allow-list row revokes live sessions. Hiding a tab
is never access control (constitution invariant 9).

## Consequences

- The checks are stack-independent and survived the Auth.js→Passport swap
  verbatim (research D5) — the *rule* is the four checks, not the library.
- Per-request re-checks make membership changes take effect immediately, at
  the cost of an allow-list read per request (accepted; Redis-backed
  sessions keep it cheap).
- Spoofed-`hd` and cross-project access are permanent test fixtures
  (AC-1..AC-3 pass as automated tests, phase 2).

## Alternatives rejected

- **Domain check only** — admits any workspace account; the allow-list is the
  actual authorization boundary.
- **Check at login only** — a deactivated user would keep a live session
  until expiry; per-request re-check closes that window.
- **Client-side gating** — "hiding a tab is not access control" is
  constitutional wording precisely because it looks sufficient in a demo.

## Sources

Root `CLAUDE.md` invariant 9; `docs/Sirius__BRD.md` FR-2.x, AC-1..AC-3;
`specs/001-sirius-v1/research.md` D5; `docs/state-log/2026-08-03.md`
(phase 2 entry).
