# Contract — Trello writes: the write registry

Amended 2026-08-04 (JP): the write surface grew from one entry to two. Amended 2026-08-12
(JP, per product's BRD-§9-A1 — Miles): grown from two to three. The principle is unchanged
and constitutional (invariant 2): **the write surface is enumerable** — it is this table,
exhaustively. Growing it is a constitution amendment, never a code change. No other write
to any source system exists; Google Sheets has no write path, ever.

## The registry

| # | Field | Trello op | Sirius surface | Audit action | Since |
|---|---|---|---|---|---|
| W1 | `Urgent` label | `POST /cards/{id}/idLabels` · `DELETE /cards/{id}/idLabels/{labelId}` | Pipeline urgency toggle | `urgency.set` | v1 (FR-4.6) |
| W2 | Due date | `PUT /cards/{id}` with `{due}`; `{due: null}` clears | Deadline edit in Pipeline | `due.set` | 2026-08-04 (FR-9.1) |
| W3 | `Difficulty: …` label | `POST /cards/{id}/idLabels` (new value) · `DELETE /cards/{id}/idLabels/{labelId}` (stale values) | Pipeline difficulty dropdown | `difficulty.set` | 2026-08-12 (BRD-§9-A1) |

Interfaces live in `lib/trello.ts` only: `setUrgency(cardId, boardId, urgent)` (§5.3 verbatim
shape, unchanged), `setDue(cardId, isoDateTimeOrNull)`, and
`setDifficulty(cardId, boardId, 'Easy' | 'Medium' | 'Hard')`.

## Rules binding every registry entry (invariant 8, FR-9.3)

1. **Trello-first, optimistic with rollback**: the local change persists only after the Trello
   write succeeds; a failed write reverts it. Sirius never displays a state Trello lacks.
2. **Every attempt writes an `audit_log` row and a `sync_runs` row** — success and failure alike.
3. **Board guard (invariant 17)**: before any write, refuse if the target board is listed in
   `PROD_TRELLO_BOARD_IDS` in a non-production environment.
4. **No-op guard**: a write whose value equals the current local value is rejected client- and
   server-side — no Trello call, no audit row.
5. **Credential**: `TRELLO_API_KEY` + `TRELLO_TOKEN`, server-side env only, belonging to the
   **dedicated integration account** that is a member of the Design Support boards only. W2 adds
   no blast radius: Trello tokens are account-scoped, not per-operation, so the existing token
   already carried due-date permission.
6. **Echo**: every write returns via Trello → ARES → push (`contracts/ares-push.md`). Reconcile
   is idempotent — a same-value set changes nothing and writes no audit row.
7. **Ships with tests**: rollback, board guard, audit rows, and a live round-trip on the TEST
   board (`tx8gDsTH`) before staging sign-off.

## W2 semantics — due date

- Sirius deadlines are Manila calendar days (`YYYY-MM-DD`); Trello `due` is a datetime.
- **Canonical write time**: the chosen date at **17:00 Asia/Manila**. When the card already has
  a due date, preserve its existing time-of-day and change only the date. *(Default set in the
  2026-08-04 spec package — JP may veto; any time on the Manila day round-trips to the same
  date-only value through the mapper.)*
- **Clearing**: a cleared deadline sends `{due: null}`; precedence (invariant 14, BR-9) then
  falls back to the sheet deadline inside `deliverables_v` — untouched by this change.
- **Precedence preserved by construction**: Sirius edits the deadline *by writing the Trello
  due date*, so "Trello due wins" remains true and the sheet is never written.

## W3 semantics — difficulty label

- Difficulty lives on the card as one label from the board taxonomy: `Difficulty: Easy`,
  `Difficulty: Medium`, `Difficulty: Hard` (invariant 17). The write is a **label swap** and
  therefore not atomic: two Trello calls when a difficulty label already exists.
  *(Confirmed by product — Miles, owl #04, 2026-08-12: label, not a Trello custom field.)*
- **Order: add first, then remove.** The new label is added before stale `Difficulty: …`
  labels are removed, so the card never passes through a state with *no* difficulty. If a
  stale-label removal fails, the write attempts to remove the just-added label (restoring the
  original state) and reports failure; if even that restore fails, the card is left with two
  difficulty labels — visible in Trello, reconciled by the next ARES read — and the local
  value still rolls back (invariant 8: Sirius never displays a state Trello lacks).
  *(Deliberate deviation from product's remove-first suggestion in owl #04: both orders keep
  the displayed value at last-known-good until full success, but remove-first's worst case
  strands the card with NO difficulty label — silently unforecastable — while add-first's
  worst case is a visible double label the next sync reconciles. Accepted by product —
  Miles, owl #05, 2026-08-13: add-first is final; label target final; BRD incorporation
  proceeding on their side. W3 fully closed.)*
- Missing labels in the board taxonomy are created on demand (green/yellow/red), mirroring
  the `Urgent` bootstrap — relevant only on test boards; the production taxonomy exists.
- Changing difficulty re-keys the row's forecast (difficulty × lane — BR keying, model grid);
  Sirius recomputes at read time, so persistence is sufficient.

## Recorded consequence

BRD §9's "write is impossible by permission" is no longer true, and the write surface is now
three fields, not one. Product's amendment text (BRD-§9-A1, Miles 2026-08-12) still needs
incorporation into the BRD document — and the literal BRD v2.2 §9 still says *one* write, so
the incorporation must go one → three (or land the pending v2.3 "one → two" sweep first).
Product-owned, tracked in STATE.md.
