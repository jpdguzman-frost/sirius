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

_last-verified: 2026-09-09_

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
30. **Sprint membership is STORED, not derived**: `sprint_id` rides the row on
    the wire (build-spec-v1.3 §5.3). Placing or dragging a row onto a day
    inside a DIFFERENT sprint's range IS the sprint move — the write carries
    the target sprint's id and the plot guards (§10 below) are checked
    against that target sprint, not the row's old one. Group order: sprints
    by `position` → Outside any sprint → Unscheduled, empty groups dropped.
    Rollover is the one write path that changes `sprint_id` without a PM
    click, by re-deriving it from the row's new `starts_on` against every
    sprint's range (R9-d) — the plot guards never run on that path (§10).
    [R5; invariant 12; corrects the DERIVED wording superseded by §5.3;
    block 7, JP 2026-09-08]
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
    disabled on pinned and on unslotted rows (rules 13, 38).
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

## 10. The plot guards — placing and dragging a bar (block 7, JP 2026-09-08)

- **R10-a** A row is placed or dragged at DAY grain, not week grain: the
  violet `+` tracks the pointer across workdays and a click sets `starts_on`
  to the exact day under it; a placed row's coloured run is itself the drag
  source and can be picked up and dropped on another workday. This is a
  deliberate extension of §5.1b/§5.2 — Sprint Schedules now owns the day for
  this one gesture, not only the week — decided by JP 2026-09-08 over the
  §6.2 two-owner reading. `docs/product/build-spec-v1.3.md` §5.1b/§5.2's
  week-grain prose is superseded to that extent; everything else in §5.1b/
  §5.2 (click-to-place with no picker, the user sets the start and the finish
  is computed, Escape/outside-drop cancel, no HTML5 drag-and-drop) still
  holds. [`dayAtX`, `plusLeft` — `frontend/scripts/50-gantt-geometry.js`;
  `plotHover`/`plotPlace`/`barDragStart`/`barDragMove`/`barDragEnd`/
  `barDragCancel` — `frontend/scripts/90-events.js`]
- **R10-b** A manual placement or drag is refused, 422, before any write and
  before any audit row, in this order — the PM is told the first thing wrong
  with the day in the order they would fix it:
  1. `OUT_OF_SPRINT` — the day is outside the TARGET sprint's own dates, both
     ends INCLUDED (the sprint's first and last day are both legal starts);
  2. `PAST_DEADLINE` — the card carries a deadline (R9-b) and the day is
     AFTER it. The deadline day itself is a legal start. Only the START is
     guarded — a row may still FINISH past its deadline and paint the bar's
     lateness signal (§5.1, R9-c); that stays true and is not this rule;
  3. `NOT_A_WORKDAY` — the day is a Saturday, a Sunday, or a holiday on the
     ACTIVE calendar `lib/calendar.ts` loads from the ARES sync (invariant
     11) — never a second holiday source.
  Body is `{ code, message }`; the messages are frozen copy carrying the
  sprint's dates or the deadline date in the codebase's existing long-date
  form ("14 Aug 2026"). One validator (`plotIssue()`,
  `src/services/sprint-items.ts`) backs all three write paths that take a
  day from a person — `PATCH /sprint-items/:itemId`, the single
  `POST /sprint-items` — so the same day gets the same answer everywhere it
  can be offered. [`specs/001-sirius-v1/contracts/http-api.md`]
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
- **R10-e** The affordance guard mirrors the server on the client so a
  refusal is rare, never load-bearing: `placeable(row, day)` — inside the
  row's own sprint's dates, not after `row.deadline`, Mon–Fri by
  construction (`dayAtX` names no other day) — gates the `+` and the hover
  tint; a day that fails it draws neither, and a click there is a no-op. The
  server is the backstop for every case the client cannot know (a holiday:
  deliberately NOT checked client-side, since the ARES calendar is
  canonical) — its 422 message reaches the PM through the existing error
  banner and the row's optimistic change is rolled back.
- **R10-f** A bare `sprint_id` move with no `starts_on` in the same write is
  NOT judged by the guards — only a write that supplies a day is. This
  leaves a row free to be re-filed into a sprint whose range does not cover
  its existing bar, which is what lets a PM re-home a row rollover has
  already carried out of range; a write that DOES carry a day is judged
  against the sprint that write targets. Un-plotting (`starts_on: null`) and
  re-sending the day a row already sits on are both no-ops that return before
  the guard runs.
