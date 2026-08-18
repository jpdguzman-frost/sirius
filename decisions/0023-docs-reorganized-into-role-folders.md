# 0023 — docs/ reorganized into role folders

**Status:** accepted
**Date:** 2026-08-18

## Context

`docs/` had grown to 23 mixed items in one flat listing — governing specs, retired
records, generated maps, runbooks, and local-only evidence side by side under
SHOUTING, prefixed, and typo'd filenames. It no longer described the system.

## Decision

JP (2026-08-18): every file moves into a folder named for the ROLE it plays —
`product/`, `architecture/`, `operations/`, `history/`, `source-material/`. Only
`MAP.md` and `README.md` stay at the top, and `README.md` is rewritten as the
folder guide. `docs/HANDOFF.md` is retired in the same ruling (Layer 1 is
`STATE.md` alone). Filenames are lowercased and de-prefixed on the way, and the
local-only records leave the project.

## Consequences

Records 0001–0022 are accepted and therefore immutable — they cite the OLD paths
and always will, so this table is how those citations resolve. Root `CLAUDE.md`
and its mirror still name the old BRD and plan paths too — JP's files to edit.

| Old path | New path |
|---|---|
| `docs/AGENTS.md` | `docs/architecture/agents-guide.md` |
| `docs/CONTEXT_ARCHITECTURE.md` | `docs/architecture/context-architecture.md` |
| `docs/map-frontend.md` | `docs/architecture/map-frontend.md` |
| `docs/map-backend.md` | `docs/architecture/map-backend.md` |
| `docs/Sirius__BRD.md` | `docs/product/brd.md` |
| `docs/Sirius__Implementation_Plan.md` | `docs/product/implementation-plan.md` |
| `docs/sirius-build-spec_v1.2.md` | `docs/product/build-spec-v1.2.md` |
| `docs/sirus_errata-reply-v1.2.md` | `docs/product/errata-reply-v1.2.md` |
| `docs/DEPLOY.md` | `docs/operations/deploy.md` |
| `docs/SERVER_SETUP_SPEC.md` | `docs/operations/server-setup.md` |
| `docs/ARES_PUSH_BUILD_SPEC.md` | `docs/operations/ares-push-spec.md` |
| `docs/state-log/*.md` | `docs/history/state-log/*.md` (same filenames) |
| `docs/CONTEXT_RESTRUCTURE.md` | `docs/history/context-restructure.md` |
| `docs/archive/sirius-build-spec_v1.1.md` | `docs/history/build-spec-v1.1.md` |
| `docs/archive/sirius-build-spec_v1.1_errata.md` | `docs/history/build-spec-v1.1-errata.md` |
| `docs/frost-sirius-v1.html` | `docs/source-material/frost-sirius-v1.html` |
| `docs/HANDOFF.md` | RETIRED — `STATE.md`, `decisions/`, `docs/architecture/context-architecture.md` §Standing working rules |
| `docs/screenshots/`, `docs/forecasting-block.csv`, `docs/gate-t045-model-validation.md`, `docs/deploy.sh` | outside the project (JP, 2026-08-18); `scripts/gate-t045.ts` regenerates the gate report |

## Alternatives rejected

- **Keep the flat layout** — rejected: at 23 mixed items the listing no longer
  described the system, and every new document made it worse.
- **Move only the files nothing cites** — rejected: it trades zero churn for a
  permanent rule nobody can remember about which paths moved, and leaves the
  worst filenames — the most-cited ones — exactly as they were.

## Sources

JP ruling 2026-08-18; `docs/history/context-restructure.md`;
`docs/architecture/context-architecture.md` §Rigidity log; rename set read from
`git status -M`.
