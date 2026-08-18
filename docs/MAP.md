# MAP — the Sirius skim (Layer 0)

_Read first, instead of exploring: live status · the areas (per-file lines live in the area maps, docs/architecture/map-*.md) · the doc layers (ruled in docs/architecture/context-architecture.md). last-verified: 2026-08-18 · regenerate: `npx tsx scripts/generate-index.ts` (`--check` exits 1 on drift)._

## Standing rules

- Code decides FACTS: where a doc describes behaviour and the code disagrees, code wins — flag the contradiction in your task output, never silently work around it. Obligations bind the other way: the constitution (root CLAUDE.md), the write registry (specs/001-sirius-v1/contracts/trello-write.md), and the area rulebooks bind code — code contradicting them is a defect to flag.
- Before changing a module, read its entries in decisions/ and its area rulebook (planner: specs/001-sirius-v1/gantt-rules.md). Do not re-decide settled choices.

## Status

<!-- GEN:STATUS -->
- In progress: phase 9 — Security testing + pilot → STATE.md §Phase status · history: docs/history/state-log/
- Open blocking decision BRD §9: Amend "write impossible by permission" → STATE.md §Decisions needed from JP (blocking)
- ACs: 19 ✅ · 5 ⬜ (of 24) → STATE.md §Acceptance criteria scoreboard
<!-- /GEN:STATUS -->

## Areas

<!-- GEN:AREAS -->
- `frontend` — 23 files → docs/architecture/map-frontend.md — no-bundler Ractive app: numbered app scripts (one shared scope, filename order) + one template + numbered styles
- `backend` — 62 files → docs/architecture/map-backend.md — Express 5 + worker; lib/ holds the verbatim-port trio; scripts/ are ops
<!-- /GEN:AREAS -->

## Doc map

<!-- GEN:DOCMAP -->
- Layer 0 · entry — CLAUDE.md (constitution) · docs/MAP.md (this skim) · directory CLAUDE.md files (frontend/, test/, lib/, src/)
- Layer 1 · current state — STATE.md (the only Layer-1 file; docs/HANDOFF.md retired 2026-08-18)
- Layer 2 · task set — area maps (docs/architecture/map-frontend.md, docs/architecture/map-backend.md — the per-file lines) · area rulebooks (planner: specs/001-sirius-v1/gantt-rules.md; pipeline/requests law still lives in their frame-notes until extracted — docs/README.md §Where law lives) · decisions/ · specs/001-sirius-v1/ (contracts + spec-kit)
- Layer 3 · archive — docs/history/state-log/ · archived frame-notes (gantt today; banner marks each) · git history · owl threads
<!-- /GEN:DOCMAP -->

## Test guards (load-bearing only, of 60 suites + helpers and the golden oracle)

- golden: test/golden/original.mjs — VERBATIM oracle, DO NOT EDIT; calendar/forecast/planner.test.ts pin port-trio parity — highest-value tests; forecast.legacy/.workbook.test.ts (40 sanitized workbook rows) pin BR-1/AC-10.
- test/helpers/gantt-render.ts — renders the shipped schedules template with real Ractive — the template-proof harness.
- test/helpers/ — db.ts in-memory mongod + migrations; fixtures.ts project/member/agent preamble; requests.ts shared payload shape.
- test/drag-hittest.test.ts — pins drag-source (.grun) count/classes; bar stays hit-testable.
- test/gantt-run-geometry.test.ts — pins coloured-run pixel geometry from shipped source text.
- test/gantt-legend.test.ts — one phase→colour map only; deadline tick reuses .gdl.
- test/suggest-counts.test.ts — the Suggest bar's three client-side counts.
- test/planner-weeks.test.ts — week/month labels + bar geometry from shipped planner text.
- test/sprints-modal.test.ts — modal validators executed out of the shipped app scripts + rendered states.
- test/pipeline-warning.test.ts — warning icon + hover card, keyed on server-emitted tokens.

<!-- HAND:BEGIN -->
- lib/calendar.ts + lib/forecast.ts + lib/planner.ts = the VERBATIM-port trio (invariant 5); golden tests pin parity (test/golden/).
- frontend has no bundler: frontend/build.js concatenates the numbered files into public/index.html (styles' numbered sort = cascade order).
- worker owns ALL sync; sync never runs inside a request (constitution §Stack).
- scripts/ are ops; write-capable ones refuse prod boards/env (src/services/guard.ts).
- src/auth/* = invariant 9's four checks; src/routes/* each export <name>Router.
<!-- HAND:END -->
