# lib/CLAUDE.md — durable law for lib/ work

Auto-loaded when working under `lib/`. This file stands alone; where a rule
has an authoritative home elsewhere, this file points and never restates.

_last-verified: 2026-08-18_

## The verbatim trio [root CLAUDE.md invariant 5; decisions/0012]

`calendar.ts`, `forecast.ts`, `planner.ts` are a validated port from the
compiled prototype bundle (`docs/source-material/frost-sirius-v1.html`; the original .jsx was
never available). Never refactor, rename, or "clean up" their logic; the
quirks (`toFriday` Fri/Sat/Sun→next Monday, and friends) are deliberate —
fidelity outranks tidiness. Changes happen only by constitution amendment
with the golden suites rebuilt against a stated reference (0017 is the worked
example). Before touching any module here, read its `decisions/` entries
[docs/architecture/context-architecture.md principle 5].

**The golden suites are the sole proof of fidelity** [decisions/0012]:
`test/calendar.test.ts`, `test/forecast.test.ts`, `test/planner.test.ts`
(parity vs the oracle), plus `test/forecast.workbook.test.ts` (cross-
validation against real sheet rows in `test/golden/workbook-rows.json`).
The oracle is `test/golden/original.mjs` — extracted verbatim from the
bundle, minified identifiers kept, DO NOT EDIT.

## What is NOT the trio [docs/architecture/map-backend.md; the file headers]

- `dayplan.ts` — NEW code (phase 12), not the port: day capacities for
  Deadlines daily plotting.
- `planner.constants.ts` — verbatim VALUES, split out only so forecast and
  planner share them without an import cycle.
- `model.ts` — verbatim grid-lookup semantics carrying the prototype's
  shipped EMPIRICAL snapshot; the phase-6 refresh replaces the snapshot per
  project, the lookup semantics stay identical.
- `sheets.ts` (read-only Sheets source) and `trello.ts` (THE write path,
  exactly registry entries W1/W2/W3) are governed by invariants 2 and 8 and
  `specs/001-sirius-v1/contracts/trello-write.md` — pointer only.

## forecast.legacy.ts [invariant 6; decisions/0003]

Migration tests only — it overstates review waits 2.6–4.6× and is never
imported by UI, server, or worker code. Mechanically guarded: the
"isolation" block in `test/forecast.legacy.test.ts` greps `src`, `worker`,
`frontend`, `server.js` for the import and fails on any hit.

## Calendar law — headlines [invariant 5 as amended v4.2.0; decisions/0017]

- Week keys are the LOCAL Monday; `isHoliday` matches the local calendar
  date.
- The holiday set is injectable via `setHolidays()`; the ARES working-day
  calendar is canonical — the static `HOLIDAYS` list is only the offline
  seed.
- Endpoint semantics and persistence live in
  `specs/001-sirius-v1/contracts/ares-read.md`, not here.

## Timezone and workday math [invariant 11]

Store UTC; render and compute Asia/Manila. Workday math goes through
`lib/calendar.ts` only — no hand-rolled date arithmetic anywhere else.

## Constitution

Anything constitution-level — the write registry, `project_id` filtering,
optimistic writes — is governed by the root `CLAUDE.md`. Do not restate it
beyond this pointer.
