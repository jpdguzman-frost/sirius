# 0025 — A reconcile never overwrites a newer registry write

**Status:** accepted
**Date:** 2026-08-18

## Context

Reconciliation is read-then-write: the full sync reads the whole board then
loops upserts, and the push drain reads a card and upserts it milliseconds
later. Both windows can straddle a registry write. The write route's ordering
is already safe (Trello first, local state only on success — invariant 8), but
nothing stopped a reconcile *holding an older ARES payload* from landing after
that write and restoring the previous value.

Product raised it (owl miles→jp #50) against the 37-second push. Three of the
four surfaces named turned out structurally immune — Sirius has no
client-side refresh loop — leaving this one, which shows a **wrong value**: a
user sets a difficulty, watches it stick, and finds the old one back on the
next reload.

## Decision

Every successful registry write stamps `registry_written_at` on the card (all
three entries, both card kinds). Every reconcile stamps the instant it
**issued** its ARES read. Registry-owned fields are then written under a
filter — `staleGuard()` — matching only when the card's last Sirius write is
**strictly older** than that read instant, so each upsert is two plain
updates: Trello-owned fields, then the guarded ones.

## Consequences

- Invariant 8 keeps its promise: a manual Trello change still surfaces, at
  most one reconcile later. The guard is time-bounded by construction — the
  next read that *starts* after the write is authoritative — so it needs no
  expiry and no bookkeeping to clear.
- No migration, no backfill: an absent stamp means "never written by Sirius",
  which is exactly the value that should reconcile normally.
- A tie counts as stale: skipping a good reconcile self-heals next cycle,
  applying a stale one shows a value the user never chose.
- One extra round trip per card per sync. Accepted: the drain handles a
  handful of cards and the full sync relaxes to hourly while push is healthy.
- Not covered: caching inside ARES. Out of reach from here; recorded.

## Alternatives rejected

- **One aggregation-pipeline update instead of two.** In pipeline form every
  `$set` value is an *expression*, so a card named `$name` would store a field
  path instead of its title — a hazard on the hottest path, for one round trip.
- **Read the stamp first, then decide in JavaScript.** Reintroduces the same
  race in miniature.
- **A fixed quiet period after a write.** Needs a number nobody can justify,
  and is wrong both ways: too short still reverts, too long delays real edits.
- **Leaving it** (product did not require a fix). The failure is silent and
  the user's own reload is what reveals it.

## Sources

Root `CLAUDE.md` invariants 2 and 8; `contracts/trello-write.md`; owl
miles→jp #50 and the reply; `worker/syncAres.ts` (`staleGuard`),
`src/routes/writes.ts`; `test/reconcile.test.ts` §stale reconcile.
