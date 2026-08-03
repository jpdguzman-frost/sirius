# STATE.md — Sirius Build State

_Last updated: 2026-08-03 · Update at the end of every working session._

## Phase status

| # | Phase | Status | Gate |
|---|---|---|---|
| 1 | Schema + migrations + seed | not started | |
| 2 | Auth + audit | not started | |
| 3 | Port lib/ + golden tests | not started | AC-10: ⬜ |
| 4 | ARES read + mapping | **BLOCKED — OD-1** | |
| 5 | Intake sync | not started | |
| 6 | Model refresh + validation | not started | **PM sign-off: ⬜** |
| 7 | UI — five tabs | not started | |
| 8 | Urgency write | not started | Staging duplicate board confirmed: ⬜ |
| 8a | Conflict acknowledgements | not started | |
| 9 | Security testing + pilot | not started | |

## Decisions needed from JP (blocking)

| # | Decision | Blocks | Status |
|---|---|---|---|
| OD-1 | ARES interface: DB role / read API / replication | Phase 4 | ⬜ open |
| OD-8 | Hosting: Frost GCP or elsewhere (plan assumes Cloud Run + Cloud SQL) | Infra work | ⬜ open |
| BRD §9 | Amend "write impossible by permission" to reflect the urgency write | Vendor assessment, v2 | ⬜ open |
| — | Create duplicate Trello board for staging | Phase 8 | ⬜ open |

## Decisions needed later (not blocking yet)

| # | Decision | Blocks |
|---|---|---|
| OD-2 | Model window 6 or 12 months (schema defaults 12) | Phase 6 tuning |
| OD-4 | Acknowledgement expiry policy | Phase 8a |
| OD-5 | Is `Client Approval` ongoing or done | Phase 4 keyword rules |
| OD-6 | Which projects in v1 beyond GCash | Seed data |
| OD-7 | Retention for closed requests | Phase 9 |

## Acceptance criteria scoreboard

AC-1 ⬜ · AC-2 ⬜ · AC-3 ⬜ · AC-4 ⬜ · AC-5 ⬜ · AC-6 ⬜ · AC-7 ⬜ · AC-8 ⬜ · AC-9 ⬜ · AC-10 ⬜ · AC-11 ⬜ · AC-12 ⬜ · AC-13 ⬜ · AC-14 ⬜ · AC-15 ⬜ · AC-16 ⬜ · AC-17 ⬜ · AC-18 ⬜ · AC-19 ⬜ · AC-20 ⬜

## Deviations proposed by the agent, awaiting JP

_None awaiting. Approved:_

- **2026-08-03 — Port source is the compiled bundle, not the JSX.** The original `frost-sirius-v1.jsx` is not available; the team supplied only the built prototype `docs/frost-sirius-v1.html` (single minified 272 KB script block, identifiers mangled). JP approved inferring `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` from the bundle. Consequence: Invariant 5's "verbatim port" becomes a faithful reconstruction, and the AC-10 golden tests are the sole proof of fidelity — they gate Phase 3 exactly as before. If the original `.jsx` surfaces, it supersedes the bundle.

## Session log

- 2026-08-03 — Kit created. No code exists.
- 2026-08-03 — Step 3 complete: Implementation Plan converted to `specs/001-sirius-v1/` — plan.md (constitution check PASS, sequence + both gates intact, phase 4 BLOCKED-OD1), research.md (12 recorded decisions, OD-1 held open), data-model.md (§1.3 SQL byte-identical), contracts/ (http-api, worker, trello-write), quickstart.md. Verified programmatically.
- 2026-08-03 — Step 2 complete: BRD v2.2 converted to `specs/001-sirius-v1/spec.md`. Traceability verified programmatically: 62 FR, 14 BR, 11 NFR, 20 AC preserved with IDs; all measured constants exact; ODs marked [NEEDS CLARIFICATION], unresolved. Quality checklist at `specs/001-sirius-v1/checklists/requirements.md`.
- 2026-08-03 — CLAUDE.md amended by JP: added "Reply format — always" (communication protocol). Constitution regenerated verbatim → v1.1.0. Invariants untouched.
- 2026-08-03 — Step 1 complete: constitution ratified at `.specify/memory/constitution.md` v1.0.0 — CLAUDE.md adopted verbatim (byte-identical body, all 17 invariants verified programmatically), Governance section added (CLAUDE.md stays authoritative; amendments enter CLAUDE.md first; gates never self-certified).
- 2026-08-03 — Step 0 complete: installed `uv` + `specify-cli` 0.15.2 (official github/spec-kit); scaffolded Spec Kit with Claude integration (`.specify/`, `.claude/skills/speckit-*`); renamed docs to match CLAUDE.md references (`Sirius__BRD.md`, `Sirius__Implementation_Plan.md`, `frost-sirius-v1.html`); git repo initialised, first commit pushed to `jpdguzman-frost/sirius`. Deviation above approved by JP.
