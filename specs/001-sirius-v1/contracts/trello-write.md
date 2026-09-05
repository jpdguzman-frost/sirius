# Contract — Trello writes: the write registry

Amended 2026-08-04 (JP): the write surface grew from one entry to two. Amended 2026-08-12
(JP, per product's BRD-§9-A1 — Miles): grown from two to three. The principle is unchanged
and constitutional (invariant 2): **the write surface is enumerable** — it is this table,
exhaustively. Growing it is a constitution amendment, never a code change. No other write
to any source system exists; Google Sheets has no write path, ever.

## The registry

| # | Field | Trello op | Sirius surface | Audit action | Since |
|---|---|---|---|---|---|
| W1 | `Urgent` label | `POST /cards/{id}/idLabels` · `DELETE /cards/{id}/idLabels/{labelId}` | Pipeline urgency control (work-card rows) | `urgency.set` | v1 (FR-4.6) |
| W2 | Due date | `PUT /cards/{id}` with `{due}`; `{due: null}` clears | The DEADLINE cell on Sprint Schedules (work-card rows; Pipeline read-only since #78 §2) | `due.set` | 2026-08-04 (FR-9.1) |
| W3 | `Difficulty: …` label | `POST /cards/{id}/idLabels` (new value) · `DELETE /cards/{id}/idLabels/{labelId}` (stale values) | Pipeline difficulty control (work-card rows) | `difficulty.set` | 2026-08-12 (BRD-§9-A1) |

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

## W1 / W3 scope clarification — the WORK card (2026-09-05)

- **Scope clarification (product owl miles→jp #78, 2026-09-04; built 2026-09-05):** W1 and
  W3 write the **work card** — the task cards revealed by expanding a Pipeline MC group — and
  **only** the work card. "A main card does not have these properties": a website request can
  hold an urgent screen and non-urgent assets, so one value on the parent cannot be true. The
  shipped build had been writing both labels to the Main Card, so this is a *defect fix on the
  existing entries*, exactly parallel to the §W2 scope note below: same fields, same
  `setUrgency()` / `setDifficulty()` interfaces, same rules 1–7; only the kind of card changes.
  Not a registry growth — the registry enumerates *fields*, and the fields are unchanged.
- **The deliverable-scoped routes are gone, not dormant.** `PATCH …/deliverables/:cardId/urgency`
  and `…/difficulty` no longer exist (404); the routes are `PATCH …/workcards/:cardId/urgency`
  and `…/workcards/:cardId/difficulty`, through the same `writeGuards` door. A main-card id on
  the work-card route is a 404. Audit rows carry `entity: 'work_card'`.
- **A main card's own labels still exist and still reconcile IN** (invariant 8): Sirius reads
  them from ARES on every sync and keeps them read-only — the main card's `difficulty` still
  keys the Pipeline forecast and Needs Info, its `urgency` still feeds Deadlines and the
  urgent-overlap rule. They change in Trello only. The Pipeline main row draws an em-dash for
  both. (Block-1 decision D1; revisited when Deadlines moves to work cards.)
- **Reconcile widens to match** (owl #50's stale guard): a work card's `urgency` and
  `difficulty` now sit inside the `registry_written_at`-guarded write beside its due date, so
  a Sirius write within the window is not clobbered and a Trello-side change outside it
  surfaces at most one reconcile later.
- **Sprint Schedules rows follow the card, not the group**: a row is urgent iff *its* card
  carries the label. The MC-group inheritance of urgency (the 2026-08-2x #58 judgement) is
  retired; deadline inheritance followed it on 2026-09-05 (block 3, owl #78 §2 — see §W2 below): a
  row's deadline is its card's own due date or none.

## W2 semantics — due date

- **Scope NARROWED to the work card (product owl miles→jp #78 §2, 2026-09-04; built
  2026-09-05, block 3):** "W2 write access lives in Sprint Schedules, on work cards, and
  nowhere else." The Sprint Schedules DEADLINE cell is the one setter; Pipeline's DEADLINE
  column is read-only (main rows draw an em-dash — a main card has no deadline; work rows
  reflect the date). **The deliverable-scoped route is gone, not dormant**: `PATCH
  …/deliverables/:cardId/deadline` no longer exists (404), exactly as W1/W3's deliverable
  routes were deleted; `PATCH …/workcards/:cardId/deadline` through the same `writeGuards`
  door is the whole of W2. Not a registry change — the field is unchanged, the surface
  shrank. The 2026-08-18 scope note below is history. A main card's Trello due still
  reconciles IN and still feeds `deliverables_v` precedence for the Requests view.


- **Scope clarification (JP, 2026-08-18, for the expanded-MC-row build — owl miles→jp #45):**
  W2 covers the due date of **any card Sirius surfaces in Pipeline** — the deliverable
  (Main Card) row and the task cards revealed by expanding its MC group alike. Same field,
  same `setDue()` interface, same rules 1–7; only the kind of card widens. This is a scope
  note on the existing entry, not a registry growth: the registry enumerates *fields*, and
  the field is unchanged. Task-card due dates play no part in deadline precedence
  (invariant 14) or `deliverables_v` — those remain deliverable-only.

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
