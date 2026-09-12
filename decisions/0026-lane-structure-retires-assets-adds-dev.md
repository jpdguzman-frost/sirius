# 0026 — The lane vocabulary retires `assets`, adds `dev`, and gains a general fallback

**Status:** accepted (JP, 2026-09-12). Supersedes clauses 1 and 4 of the
2026-09-10 `model.ts` amendment in `lib/CLAUDE.md`.

## Context

`lib/model.ts` prices a card off a difficulty × lane cell. The vocabulary was
`design | ops | assets | content`, and the shipped snapshot carried an `assets`
cell at 19.24 working days at p85 (n 353) — the largest figure in the model.

Twelve months on rt-837 measure asset work at **0.84 days at p85 over 1,671
cards** — the shipped figure is 23× that. JP had ruled on 2026-09-10 that every
asset-producing family folds to `design`, so a *labelled* card never reached the
cell; it survived only for the ~1 in 5 cards with no work-type label, through a
text regex in the verbatim port. The same measurement showed `content`'s 202
samples measure in minutes (p85 0.05–0.43) because those cards pass through their
lane rather than being worked in it, and that ARES had been sending a pooled
`dev` lane all along (n 834, p85 0.98 / 1.06 / 3.60) that our vocabulary
discarded as unmapped, with 775 Build and Dev cards.

## Decision

1. **`assets` leaves the union**, its `EMPIRICAL` cell is deleted, and the
   `asset|illustrat|render|icon` alternation is cut from `laneOf`'s regex. An
   unlabelled asset-looking card now reads `design` — the 2026-09-10 fold applied
   to the cards that do not announce themselves.
2. **`dev` joins the union**, and BOTH `Build` and `Dev` map to it. Mapping one
   would give a lane whose name disagreed with the pooled cell it reads.
3. **`GENERAL`** — the board-wide measured pool (Easy 0.80, Medium 0.90, Hard
   2.50 at p85; 5,245 cards) — becomes `designCell`'s middle step for ANY lane
   with no cell of its own. Content is its first user, not a special case.

## Consequences

- **The first cut to verbatim port text in `lib/model.ts`.** Fixture goldens
  cannot move (no row carries `currentList`/`labels`) and did not. The in-code
  parity matrix DOES reach the branch: 1,200 of 3,600 cards diverge, each
  returning exactly what the oracle returns for that card in a design-named
  list, and zero diverge while agreeing on lane. The oracle keeps the branch and
  is never edited; the divergence is pinned, not carved out, so an *unexpected*
  one still fails loudly.
- A stale grid row naming `assets` needs no migration: the lane is a free
  `String`, re-derived by `laneOf` on the next sync. The seed fixture was
  corrected so a fresh local DB does not carry the retired lane.
- The snapshot is high in EVERY lane — design and ops by 2.3–3.7×, inside the
  documented range for the review wait the engine no longer computes. Still open.

## Alternatives rejected

- **Keep `assets` and correct its number.** The lane has no source: ARES sends no
  assets pool, because asset work *is* design work under the fold.
- **A content-specific fallback.** Two rules to keep in sync.
- **Map only `Dev`.** The cell is pooled across both families; the narrower name
  would have been a label that lied.

## Sources

ARES cycle-time model, `rtProjectId=837`, read 2026-09-12T07:07:52Z · JP's
rulings 2026-09-10 and 2026-09-12 · `lib/model.ts` comments · state-log 09-12.
