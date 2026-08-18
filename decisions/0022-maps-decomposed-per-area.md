# 0022 — Maps decomposed per area

**Status:** accepted
**Date:** 2026-08-18

## Context

The Layer-0 skim (`docs/MAP.md`) carried one generated line per source
file — the only always-read section growing with the codebase, against
architecture principle 1. At 76 files the block already dominated the skim.

## Decision

JP (2026-08-18): the skim keeps status, areas, and the doc map; the
per-file MODULES lines move to per-area Layer-2 maps (`docs/map-frontend.md`,
`docs/map-backend.md`), rebuilt by the same generator from an exported area
partition (`frontend/` prefix = frontend; everything else = backend). The
guard test imports the partition and the scope rule — never re-derives them
— and asserts the union of the maps is a bijection with the source set,
each file in the map its area names.

## Consequences

- `docs/MAP.md` is ~55 lines and no longer grows with the codebase; an
  agent loads an area map only when working that side.
- The generator owns the partition; the guard imports it, so a stray,
  duplicated, or missing per-file line goes red in CI.
- A map for the test suites is deliberately deferred — trigger: the skim's
  Test-guards section outgrowing ~20 lines.

## Alternatives rejected

- **Keep one monolithic modules block until the 150-line cap forces the
  split** — rejected: the split is near-free now, and the block grows with
  the codebase inside the always-read layer.

## Sources

JP ruling 2026-08-18 (session); `docs/CONTEXT_ARCHITECTURE.md` principle 1;
`docs/CONTEXT_RESTRUCTURE.md` stage 4d.
