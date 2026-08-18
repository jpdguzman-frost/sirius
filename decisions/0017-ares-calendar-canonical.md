# 0017 — The ARES working-day calendar is canonical; week keys = local Monday

**Status:** accepted
**Date:** 2026-08-15

## Context

Two pre-existing defects in the ported `lib/calendar.ts` surfaced on the
Manila host: `buildWeeks` derived week keys via `toISOString`, yielding the
Sunday before the local Monday (breaking `/suggest` on prod), and
`isHoliday` mixed UTC and local dates, excluding the day *after* each
holiday east of UTC. Worse, the prototype's static holiday list was
materially wrong — it had Aug 31 and missed Aug 21, Nov 2, Dec 8, Dec 24 and
Dec 31.

## Decision

JP amended invariant 5 (constitution v4.2.0): `lib/calendar.ts`'s
date-string derivation is TZ-safe — week keys are the **local Monday**;
`isHoliday` matches the local calendar date — and the holiday set is
injectable via `setHolidays()`. **The ARES working-day calendar is
canonical**: the worker derives the working-day set from the ARES read API,
and the static list is only the offline seed — endpoint semantics and
persistence are owned by `specs/001-sirius-v1/contracts/ares-read.md` and
the v4.2.0 amendment text, not restated here. Everything else in the ported
files stays verbatim, `toFriday` quirk included.

## Consequences

- Golden tests were rebuilt on a TZ-true reference, oracle parity kept where
  the oracle is correct — the amendment ritual 0012 anticipated, executed.
- One source of holiday truth, maintained where the team already maintains
  it (ARES), instead of a hardcoded list that had already drifted.
- Migration 005 normalised live Sunday `slotted_week` rows (audited);
  Suggest became usable on prod the same day.

## Alternatives rejected

- **Normalising to Mondays in routes / client snap** — tabled options (b)
  and (c); both leave the library lying and every future caller exposed.
- **Keeping the static list as truth** — it was demonstrably wrong; a
  forecast that ignores real holidays fails its one job.

## Sources

Root `CLAUDE.md` invariant 5 (v4.2.0 parenthetical);
`docs/state-log/2026-08-15.md` (defect evidence + amendment build); STATE.md
lib/cal decision row; `specs/001-sirius-v1/contracts/ares-read.md`
(workload/capacity rows).
