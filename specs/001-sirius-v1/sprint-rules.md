# Sprint Schedules — planner behaviours, sprints, chips, the add row

**Authority.** Current law for what the planner DOES: pins, capacity, sprint
membership, the sprints modal, Suggest, the row action cluster, the chip
grammar and the search-based add row. Split out of `gantt-rules.md` on
2026-09-05 at the 20KB rulebook cap; rule numbers are GLOBAL across the two
files (26–39, 53–62 and R8-* live here; 1–25 and 40–52 stay there), so every
existing citation still names exactly one rule. The drag contract (`gantt-rules.md`
§1), geometry (§2) and verification law (§5) bind every row this file
describes. Narratives: `gantt-frame-notes.md`. Where a rulebook and a
narrative disagree, the rulebook wins — fix the narrative.

_last-verified: 2026-09-05_

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
30. **Sprint membership is DERIVED**: slotted week ∈ sprint range; a drag
    into another sprint's range IS the sprint move; no row carries a sprint
    reference on the wire. Group order: sprints by `position` → Outside any
    sprint → Unscheduled, empty groups dropped. [R5; invariant 12]
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
