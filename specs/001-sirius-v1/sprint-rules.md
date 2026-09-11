# Sprint Schedules — planner behaviours, sprints, chips, the add row

**Authority.** Current law for what the planner DOES: pins, capacity, sprint
membership, the sprints modal, Suggest, the row action cluster, the chip
grammar and the search-based add row. Split out of `gantt-rules.md` on
2026-09-05 at the 20KB rulebook cap; rule numbers are GLOBAL across the two
files (26–39, 53–62 and R8-* live here; 1–25 and 40–52 stay there), so every
existing citation still names exactly one rule. The pointer-drag contract
(`gantt-rules.md` §1), geometry (§2) and verification law (§5) bind every row
this file describes. Narratives: `gantt-frame-notes.md`. Where a rulebook and a
narrative disagree, the rulebook wins — fix the narrative.

_last-verified: 2026-09-11_

## 3. Planner behaviours

26. **Pins = Option B, fully frozen.** A pin blocks Suggest AND manual
    action; FR-5.9 stands; `/replot` skips pinned rows server-side. "Pins
    block Suggest only" is superseded wherever it still appears (stale owls
    and Figma annotations). [JP ruling B 2026-08-17]
27. **The conflict-ack key recipe lives in `src/services/conflicts.ts`
    `conflictKey()`** — `week | rule | capacity | sorted card:phase pairs`,
    never retyped. Invalidation is a NON-match (no audit row); hard-mix is a
    planner FLAG, not ackable; card-level indicators are never suppressed by
    an ack. [invariant 13 v4.3.0]
28. **Capacity lock is Option B**: `projects.capacity_locked`, default
    false, every read `=== true` (deliberately the mirror of
    `writes_enabled`). The 403 `CAPACITY_LOCKED` precedes the Zod parse; a
    refusal writes and audits nothing; the admin toggle is audited both ways
    and omits `ensureProjectMember`. rt-837 stays LOCKED at 120 — JP-held
    calibration, never auto-correct. [owl #23, batch 3; MEMORY rt-837]
29. **Capacity footer**: total over capacity OR hard-mix share over the
    12.9% ceiling → red; ideal (8.3%) to ceiling → amber.
    `hardIdeal`/`hardCeiling` ride the `capacity` block from `HARD_MIX`
    (`lib/planner.constants.ts`) on GET and the PATCH echo; "13%" is
    `Math.round(hardCeiling * 100)`, never retyped. [R9]
30. **Sprint membership is STORED, not derived**: `sprint_id` rides the row
    on the wire (v1.4 §5.3), now NULLABLE — `required: false`, default
    `null` (owl #90; a Mongoose flip, no migration). Placing onto a week
    in a DIFFERENT sprint's range IS the sprint move (`weekPlace` resolves
    the target from the week's day, gantt-rules.md rule 6); no day-grain
    drag remains to carry `sprint_id` by accident (cross-sprint stays
    excluded, gantt-rules §1 rule 11). Group order: sprints by `position`
    → Outside any sprint (non-empty only) → Unscheduled, empty dropped.
    Rollover changes `sprint_id` without a click (R9-d), guards skipped
    (§10).

    **A re-dated sprint is the second such path** (owl #90, new): a
    sprint-date edit pushing a placed row's ASSIGNED WEEK outside the new
    range does not strand, re-place or unslot it (the unslot-to-pool
    branch is WITHDRAWN) — `sprint_id` clears to `null`, `starts_on`
    untouched, rendering under *Outside any sprint*. Never refused for
    this (JP 2026-09-09's "refuse and notify" half-withdraws — the REFUSE
    half; rule 31 is unedited). Response carries `displaced: [{ id,
    display_id, title, starts_on, from_sprint }]`; the client shows a
    dismissible notice naming each — the LIST half of JP's 2026-09-09
    ruling survives. One `audit_log` row per displaced row
    (`sprintItem.displaced`, before/after `sprint_id`, `starts_on`
    unchanged), actor = the editor, never `system` (rollover's, R-d2-r).
    Re-slots by the ordinary week click (rule 6) once a sprint covers its
    day again. **(new, owl #90 — flagged "pre-existing; JP to rule later"
    at block 7.)** [R5; invariant 12; `schedule.ts PUT /sprints`]
31. **Sprints modal — blocking (red) classes, both sides, byte-identical
    copy where both speak**: duplicate names (trimmed/case-insensitive, 422
    `SPRINT_CONFLICT`), blank/whitespace-only names (one banner per blank
    ROW), missing dates (`sprintMissingDates` blocks Save; the route stays a
    dumb refuser), and overlaps. `name` carries no Zod `.min(1)` on purpose —
    the friendly 422 owns the blank class. [R-f-3, R-f-11; review sweep
    #3–4]
32. **Sprints modal — non-blocking**: gap banners are amber, render between
    the two rows they name (one per gap, placement carried as data), and count
    WORKING days against the wire's `holidays` field, never raw weekdays. No
    banner carries a CTA. [R-f-4, R-f-5, R-f-8]
33. **Sprints modal — mechanics**: START snaps to the picked week's Monday,
    END to its Friday, on `change` never `input` (snap on pick, never
    reject); column 1 holds the remove ✕ — no grip, no manual reordering
    (`position` derives from sorted starts on save); deletion warns with the
    displaced count; copy is "Add Sprint" in both states; save is one audited
    batch PUT. [R-f-1, R-f-2, R-f-6; batch 4]
34. **Save gates on UNSAVED CHANGES, not empty-vs-not**: `sprintDirty`
    compares a baseline captured at open against the draft over the three
    persisted fields, draft order, untrimmed; Save is live iff dirty and
    nothing blocks. `saveSprints` re-checks, so a no-op PUT can never audit.
    [R-f-10, owl #37]
35. **Suggest bar counts**: proposed = `Object.keys(suggest.plan).length`;
    flagged = `plan ∩ notes` (unit: proposals); hard-heavy =
    `suggest.strain.length` (unit: weeks) — independent counts, no
    cross-check, no client hard-share recomputation, no new `/suggest` field.
    [R-a; batch 3 §counts]
36. **Suggest behaviours**: ghost bars stay violet, exact week-key match;
    rows still drag while a proposal is pending and a manual drag does not
    mutate it; a proposal does NOT survive a project switch (`suggest` and
    `collapsedBlocks` clear; `leftCollapsed` survives); a 0-proposal Accept
    can never fire; the off-Monday tripwire stays, inert while keys are
    Mondays. [R-b, R-c, R-d, R-e; batch 3]
37. **A handler on a container guards its target**: `rowKey` acts only when
    `ctx.event.target === ctx.node`. Never immunise a descendant against its
    ancestor's handler — fix the ancestor. [review sweep #1]
38. **Non-changes never audit** (invariant 10): Calendar Remove is `disabled`
    on an unslotted row and `unslotRow` returns before writing; the
    sprint-save dirty lock and the `moveRows` guard apply the same rule.
    [batch 4; review sweep]
39. **The left pane collapses 999px → 417px** (MC# + Scope only); the row
    action cluster and status-note affordance are unavailable while collapsed
    — expand to use them. Sprint blocks (including *Outside any sprint* and
    *Unscheduled*) collapse/expand per block via `collapsedBlocks`, which
    clears on project switch (rule 36). [owl #24, batch 3; 13g/13i]

## 6. Carried over at the 2026-08-18 rewire

Rules that lived only in the session handoff (`docs/HANDOFF.md`, retired
2026-08-18) when this file became authoritative; moved here so the planner has
one home instead of two.

53. **Capacity footer totals are computed with the BR-6c weights** — rule
    29's red/amber thresholds apply to that weighted load, never to a raw
    card count. [13g]
54. **A drag is horizontal only; the vertical outcome is derived.** A drop
    changes the slotted week and nothing else — the row's relocation to
    another block follows from rule 30 and is announced with the arrival
    pulse + `scrollIntoView`. [13j]
55. **The row action cluster is Copy · Pin · Calendar Remove** — 13px
    sprites, aria-labelled and keyboard-operable; Calendar Remove is
    disabled on pinned and on unslotted rows (rules 26, 38).
    [13j]
56. **The status-note affordance is the note chip** (ghost pencil when
    empty). Placement in the scope cell is CONFIRMED (owl #48); the chip's
    treatment may still change in the row-controls design pass.
    [carried over 2026-08-18; amended by owls #48/#49]

## 7. The chip grammar (product ruling, owls #48 + #49, 2026-08-18)

57. **Coloured chips carry STATE, neutral chips carry CONTENT.** Urgency and
    difficulty are coloured; requestor and the status note wear the base
    badge — slate-100 fill, slate-300 stroke, slate-500 ink. A content chip
    therefore declares no colourway of its own; it inherits the rule the
    other content chip uses, so the family cannot drift by copying. A guard
    fails if any `.gnote` rule declares a background. [owl #49]
    **The urgency chip is drawn ONLY where the row is urgent** (JP
    2026-09-08): the second variant said nothing a reader needed and is
    withdrawn from the row and from the stylesheet, so a row that is not
    urgent carries no urgency chip at all. Difficulty is unaffected — it
    still prints its dimmed dash when the label is missing (rule 61).
58. **A content chip shows its value, never a word standing in for it.** The
    note chip renders the note; the fixed word it shipped with told the
    reader a note existed but not what it said, so the note had to be opened
    to be read — defeating the point of putting it on the row. [owl #48]
59. **Truncation is MEASURED, never counted** — the shared `.clipbadge` /
    `.cliptext` recipe plus the one post-render sweep, for every clipped
    value. Same guards, same hover-and-focus reveal. [owls #39/#40, #43-C,
    #48]
60. **Where a clipped value is also a control, the accessible name and the
    tooltip are two different strings.** The non-interactive badges feed
    their tooltip from `aria-label`, which is correct while name and value
    are the same thing. A button's name must say what pressing it does, so
    the note chip's tooltip reads `data-note` instead — both still written
    from the one template expression, so they cannot drift.
61. **The chips line never wraps.** It is held to one row and only the note
    may shrink: a second line grows the row past its 84px floor and the
    pinned pane stops lining up with the timeline bars. Urgency and
    difficulty carry fixed vocabularies and are never cut; the note's real
    truncation budget is the cell minus those two chips.
62. **A freeform value's tooltip wraps and is capped.** The shared recipe's
    single nowrap line is right for a person or an asset type and wrong for
    a note, which can be any length — uncapped, a long one runs off the
    viewport where no pointer can reach it. This is the note chip's one
    documented deviation from the shared recipe.

## 8. Adding work cards — the search row (owl #77 §0, 2026-09-05)

Nodes 840:31597 · 841:33668 · 841:33689 · 833:68629; retires #73's dropdowns. Add All is the point: no confirmation, no count-check.

- **R8-a** One always-visible search row at the END of every sprint's rows,
  inside the collapse gate; 77px in every state, field FILLs, placeholder
  `Search by MC# or Work Card to add to sprint`; nothing below it at rest,
  no Add All. Only the field's right edge moves on the first keystroke.
- **R8-b** Query: trim, lowercase, whitespace-split; a card matches when
  EVERY token is a substring of `MC-NNN: <full name>`. No cap: the list IS the
  set.
- **R8-c** Pool = the server's `addable`; order MC rank ascending, unrankable
  last, then the server's order inside an MC — never re-sorted client-side.
- **R8-d** Matches: Add All blue-600; rows 54px, Add blue-300 → blue-600
  WITH the label → 600 on ROW hover/focus-within. No matches: Add All
  slate-400 inert; one muted `No cards found for this query` row. Two blue
  TOKENS, never opacity.
- **R8-e** Add All = ONE batch request, the listed ids in list order; skips
  never fail it and are bannered AFTER the reload; the query clears iff
  something landed and the field still holds the query sent. A single Add
  keeps the query.
- **R8-f** Rows land UNPLOTTED (#72 §6); no + on the search or result rows.
- **R8-g** One add in flight per screen: every sprint's links inert until
  the reload. Not the placement lock.
- **R8-h** Escape empties the query; Enter inert. Focus RETURNS to the field
  after a reload only when nothing holds it. A stale refusal reloads first.
- **R8-i** Server: the sprint is re-asserted AFTER the batch (gone → rows
  taken back, audited, 409); an audit row failing takes its row back (500
  PARTIAL says how far it got); one audit row per created row.

## 9. The DEADLINE cell — the W2 setter (owl #78 §2, 2026-09-05)

- **R9-a** The DEADLINE cell on a work-card row IS the due-date setter: W2 write
  access lives here, on work cards, and nowhere else ("sa isang place lang
  sila"). The Pipeline popover recipe verbatim — `.duewrap` / `.datefield` /
  `.duepop`, the `dueCalendar` partial, `openDuePopover(ctx, cardId)`,
  commit-on-Apply, Clear sends null (a work card has no sheet fallback) —
  gated on `writesEnabled` (UX only: `writeGuards` enforces server-side).
  `saving…` shows in flight and the trigger is disabled for the flight. A
  row with no deadline reads `Select Date` (writes on) / `No Due Date`
  (writes off) — the em-dash left this cell. A row whose card has LEFT the
  board is read-only whatever the switch says: nothing to write to (review
  R4-1). Pipeline only REFLECTS the date.
  [#78 §2;
  PLAN block 3 B12/B13; `test/sprint-schedule-deadline.test.ts`]
- **R9-b** A row's deadline is the card's OWN Trello due date or none. The MC
  group's deliverable dates are never inherited (#78 §2 retired jp→miles
  #58's judgement — main cards have no deadline; the Pipeline work row and
  this cell must agree about one card). No deadline → no tick, `late` false.
  [`src/services/sprint-items.ts deadlineFor`; `test/sprint-items.test.ts`]
- **R9-c** The write's reload is what re-derives the tick and `late`; nothing
  client-side recomputes either. The cell wears the `missing` dress only — no
  overdue tint here, because the tick and the red bar already say late.
  Known, kept for parity with Pipeline: a scroll outside the popover — the
  gantt's sideways scroll included, although the sticky trigger does not move —
  dismisses it and discards a staged date (the shared dismisser; review R4-2,
  backlog).
- **R9-d** Rollover (deadlines-rules.md §4) moves `starts_on` server-side; the
  bar translates whole and the FORECASTED cell moves with it by construction;
  sprint membership follows the card's new START day — the day rollover just
  wrote, matched against every sprint's `[starts_on, ends_on]` range — not the
  finish day (corrects the prior wording; the finish can sit in a later sprint
  than the start, or in none). No marker on the row. [§6.2, 2026-09-08]

## 10. The plot guards (block 9, JP 2026-09-11, owls #88/#89/#90 —
    supersedes block 7, JP 2026-09-08)

- **R10-a** A row is placed or dragged at WEEK grain on Sprint Schedules,
  never day grain: `weekHover`/`weekPlace` track the pointer by `.gweek`
  column; a click PATCHes `{ week }` and the server resolves `starts_on`
  to that week's FIRST WORKING DAY (`firstWorkdayOfWeek`, owl #89 §2 —
  never a bare Monday), judged against the target sprint (rule 30). The
  day is set exclusively by the Design Lead's drag on Deadlines
  (deadlines-rules.md §1a). **(reversed by owls #88/#89; was: JP
  2026-09-08's day-grain extension — reinstates v1.4 §5.1b/§5.2's
  week-grain prose, corrected for the first-working-day default over its
  literal "Monday".)** [gantt-rules.md §1]
- **R10-b** A manual DAY-drag exists only on Deadlines now (Sprint
  Schedules takes a week, never a day — R10-a). Refused, 422, before any
  write or audit row, in this order:
  1. `OUT_OF_WEEK` — outside the card's ASSIGNED week (from its current
     `starts_on`, never persisted separately): `That day is outside the
     card's assigned week (Mon D Mon – Fri D Mon).` Checked FIRST — only
     rollover crosses a week (deadlines-rules.md §4, R10-d);
  2. `OUT_OF_SPRINT` — outside the TARGET sprint's dates, both ends
     included. May be unreachable once (1) holds (sprints are
     Mon/Fri-aligned, rule 33) — kept: a displaced row's week can
     misalign with a later sprint edit (rule 30);
  3. `PAST_DEADLINE` — after the deadline (R9-b, legal ON it); only the
     START is guarded, FINISH may still run late (§5.1, R9-c);
  4. `NOT_A_WORKDAY` — a Saturday, Sunday or ARES-calendar holiday
     (`lib/calendar.ts`, invariant 11).
  Envelope `{ ok: false, error: { code, message } }`, frozen copy. One
  validator (`plotIssue()`, widened with an optional `assignedWeek`
  checked first, `sprint` may be `null`) backs this single write path —
  `PATCH /sprint-items/:itemId`, non-null `starts_on` — the only
  day-taking path left (R10-a). No `starts_on` → 422 `NOT_PLACED`.
  `POST /sprint-items/batch` still never takes a day (R10-c).

  **Gated by SURFACE only** (JP 2026-09-11): any project member may PATCH
  `starts_on` from Deadlines; the route re-checks session and project
  membership like every route (invariant 9), no per-user/role check —
  "the Design Lead" is a team convention, not a Sirius permission.
  **(reversed by owls #88/#89/#90; was: one guard bound BOTH tabs' write
  paths — Sprint Schedules is out of it now, order gains `OUT_OF_WEEK`
  first.)**
- **R10-c** `POST /sprint-items/batch` never carries a day — its body is
  `.strict()` with no `starts_on` field, so a batch add always lands
  UNPLOTTED and no skip entry in that route ever carries a plot code. A
  batch is the two-act add (rule in §6 above); placing a row is always a
  separate, later act through R10-a's single-row paths.
- **R10-d** The guards bind ONLY a person's own click or drag. Rollover
  (deadlines-rules.md §4; R9-d) never calls `plotIssue()` and is exempt by
  construction: a card that never completes moves indefinitely, landing
  outside its sprint and past its deadline, with no cap and nothing on
  screen recording it (§6.2) — that is rollover's whole point, and a guard
  that also ran on the day-advance job would stop it exactly when a card
  runs late.
- **R10-e** The affordance guard relocates to Deadlines: `dlDayPlaceable`
  mirrors R10-b's four conditions client-side — assigned week, sprint
  dates, deadline, Mon–Fri by construction — gating `.dlday` drop cells;
  a failing day previews `.dlcard.refused` (deadlines-rules.md §1a), a
  release there a no-op. The server stays the sole backstop for holidays
  (deliberately not checked client-side — ARES is canonical); its 422
  rolls the card's optimistic move back through the existing banner.
  Sprint Schedules loses this guard entirely. **(reversed by owls
  #88/#89; was: `placeable(row, day)` gating the `+`/hover tint, block 7
  — deleted.)**
- **R10-f** A bare `sprint_id` move — `starts_on` absent from the same write
  — still moves a bar for a PLOTTED row (its existing `starts_on` rides
  across into the new list), so it is judged against the TARGET sprint's
  RANGE alone (`sprintRangeIssue()`, the range half of `plotIssue()`,
  factored out for this exact caller) — 422 `OUT_OF_SPRINT` on a miss, same
  envelope, same frozen message, naming the target's dates. Neither
  `PAST_DEADLINE` nor `NOT_A_WORKDAY` is asked: that day was already
  accepted once when the row was placed, and re-filing it into another list
  is not re-placing it — refusing on a question the request never raised
  would be a 422 for a day nobody sent (D5 resolved STRICT, main thread,
  2026-09-09, over the block's earlier permissive reading). An UNPLOTTED row
  (`starts_on` null) has no bar to misplace and moves freely — this is what
  still lets a PM re-file a row rollover left with no covering sprint
  (deadlines-rules.md R-d2-q) once one exists. A write that DOES carry a
  `starts_on` is judged by the full `plotIssue()` against the sprint that
  write targets (R10-b), never by this narrower rule. Un-plotting
  (`starts_on: null`) and re-sending the day a row already sits on are both
  no-ops that return before either guard runs. Rollover itself
  (`src/services/rollover.ts`) writes through Mongo directly and never
  reaches this route — R10-d is unaffected.
