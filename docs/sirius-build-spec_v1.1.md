# Frost: Sirius — build spec

The platform as it currently stands. Written as build instructions, with the
rules and measured values that cannot be inferred from the design.

Companion to `AGENTS.md` (traps and boundaries), the BRD (scope and business
rules) and the engineering doc (schema and infrastructure). The same content is
filed on the Figma layers as annotations, in three categories: **Functionality**,
**Design Specs**, **Interaction**.

**Success criterion throughout: 1:1 reproduction of the frame.** Every colour,
radius, spacing and type value binds to an ARES variable. A raw hex or px in the
output is a defect — the token exists, use it.

---

## 0. Shell

**Design Specs.** Fixed header, tab bar beneath, content below. Header carries a
`Frost: Sirius › {tab}` breadcrumb on the left; on the right, the project
selector labelled `PROJECT` with the Trello board id as a link beneath it, the
last sync time, and the signed-in user with a circular initial.

Five tabs, icon plus label: Requests, Pipeline, Sprint Schedules, Deadlines,
Forecast. Active tab is `--surface-foreground` with a 2px underline; the rest
`--surface-muted-foreground`.

**Type** `--font-sans` is Google Sans Flex, self-hosted. Sizes from
`--text-caption|label|body|body-lg|heading|title`. Weights 400/500/600/700 only.

**Radius** ARES caps non-full radius at 8px (`--radius-md`). Nothing larger
except pills (`--radius-full`).

**Done when** rendered output diffs to zero against the frame at 1600px.

---

## 1. Sign-in

**Functionality.** Google Workspace only. Four checks, all server-side in
production: `email_verified`, `hd` claim equals `frostdesigngroup.com`, the
email domain matches, and an active allow-list row exists.

Denies personal Gmail, other Workspace domains, unverified accounts, a missing
`hd`, and lookalike domains such as `frostdesigngroup.com.evil.co`. Each denial
states its reason rather than failing silently.

Nothing renders before sign-in. Signing out clears imported data.

**Done when** a non-Frost account is refused with a readable reason, and no API
route answers without a valid session.

---

## 2. Projects

**Functionality.** Selector bound to the `projects` table. Changing it swaps the
entire working context — cards, requests, capacity, sprints, sources. No data
crosses projects.

**Critical:** five of 26 Trello boards serve more than one project. Query on
`trello_board_id` **and** `trello_label`. Filtering on board alone merges three
JFC brands into one pipeline.

Every table carries `project_id`; every query filters on it.

**Done when** switching projects empties the previous project's pipeline and
restores it on switching back.

---

## 3. Requests

Read-only mirror of the client's intake sheet. Sirius never writes back to it.

### 3.1 Tiles — Design Specs

Four, label above a large number, no boxes or borders:

| Label | Colour |
|---|---|
| REQUESTS | `--surface-foreground` |
| IN PIPELINE | `--emerald-600` |
| TO FILE | `--status-warning` |
| FOR CLARIFICATION | `--status-destructive-strong` |

Label uppercase `--text-label` weight 600; number `--text-display` weight 700.
Clicking filters; unselected tiles drop to 45% opacity rather than gaining an
underline.

### 3.2 Sync strip — Design Specs

`--slate-50` background, 1px `--border-border`, `--radius-md`. Trello mark, then
a `CSV import` / `Live sync` button, then the rule in plain text: *Difficulty,
list, due date and Figma links are read from Trello and can't be edited here.*
Then dim: *last sync 6 min ago · every 5 minutes*.

### 3.3 Incomplete panel — Functionality

Amber panel listing sheet rows that failed validation. Per row: a `Row N` chip,
the MC number in bold, the name, then the reason in amber, with `Open Card`
right-aligned.

State the consequence beneath, not just the gap: *without a difficulty label the
forecast falls back to Overall; without a due date the card can't raise a
deadline warning. Fix it in the sheet and it corrects on the next sync.*

Hide the panel entirely when empty — no empty state.

**Ingestion figures on current data:** 495 imported, 495 reserved MC numbers
skipped silently, 8 rejected.

### 3.4 Search and filters — Functionality

Search sits above the filters, full width, placeholder *Search cards or MC#*.
Case-insensitive substring across MC #, deliverable, use case, requestor, type,
brief, note reason and remark. Matches wrap in `<mark>` with
`--status-warning-light` / `--amber-800`.

Four selects: `YEAR`, `MONTH`, `TYPE`, `REQUESTOR`. Options derived from loaded
data only. Month sorts by calendar, not alphabetically. Year parses `2026.0` to
an integer. Active select tints `--blue-50` / `--blue-200` / `--blue-700`.

**Use case is deliberately not a select** — 76 distinct values. It is covered by
search.

### 3.5 Pagination — Interaction

10 rows per page. Control at the right of the filter row: previous, page
numbers, next. Windowing `1 … 4 5 6 … 50`, first and last always reachable,
ellipsis for the rest. Current page carries a `--slate-300` border and weight
600. Any change to search, tile or filter returns to page 1.

### 3.6 Table — Design Specs

Nine columns in order: MC #, Deliverable, Type, Use case, Requestor, Deadline,
Brief, Status, Frost notes.

`min-width: 1420px`, horizontal scroll below. Header `--slate-50`, uppercase
`--text-label`, weight 600. Rows separated by 1px `--surface-secondary`, no
vertical rules. Padding 16px horizontal, 20px vertical, top-aligned.

MC cell shows the number with the sheet row beneath as a small external link.
Deliverable caps at 256px, Brief at 384px, ellipsised at 180 characters.

**Deadline is read-only here** — it is set on Pipeline. Format `17 Jan 2026`,
tooltip naming the source. Missing renders as an outlined red `none` pill.

### 3.7 Status — Functionality

Derived, never stored:

```
if (trelloCardExists(mc))      -> 'In Pipeline'        green
else if (frostNote.clarify)    -> 'With Clarification' red
else                           -> 'For Filing'         amber
```

Rendered at `--text-body`, `--radius-sm`, padding 4px 10px.

### 3.8 Frost notes — Functionality + Interaction

Two fields per request: `clarify` boolean with a `reason`, and a free-text
`remark`. Stored in `frost_notes` keyed `(project_id, mc_number)`.

**Never written to the intake sheet.** The Sheets service account holds
`spreadsheets.readonly`, so the permission enforces it — do not add a write
scope.

```
GET  /api/frost-notes?project=:id
PUT  /api/frost-notes { project, mc, note }
```

Optimistic write, roll back on failure.

**Display** — flagged: an outlined red `With Clarification` pill with the reason
beneath on a 2px red left rule. Remark only: the remark in a bordered box.
Neither: an input-shaped button reading `Add Remarks`.

**Editor is inline, not a popover.** Order: remark textarea (3 rows, autofocus)
→ `With Clarification` checkbox with the sub-line *Marks the request as not
fileable yet* → reason textarea, only when ticked, red-bordered → Cancel and
Submit right-aligned. Textareas `stopPropagation` on keydown. Escape and Cancel
discard; only Submit persists.

**Done when** a remark alone leaves the status unchanged and a flag changes it.

---

## 4. Pipeline

### 4.1 Table — Functionality

Rows are deliverables — Trello cards carrying the `Main Card` label. Expanding
reveals the task cards sharing that MC number.

**Read-only from Trello:** difficulty, current list, Figma link, labels. Render
as text, never as inputs.

**`mc_number` is not unique.** 15 MC numbers carry more than one deliverable;
MC-825 carries 99. Key on `(project_id, trello_card_id)`; display id is
`MC-655.3` for multi-deliverable requests.

**Task cards attach to the MC, not to a deliverable.** Only 1 of 27 task titles
matched a deliverable name — do not model a parent link.

**Done when** 269 deliverables + 209 tasks + 20 unkeyed = 498 cards, nothing
dropped or double-counted.

### 4.2 Deadline — Interaction

**Editable here**, unlike on Requests. Click opens a date input with `Set` and
`clear`. Precedence **manual → Trello → sheet**; a manual date carries a dashed
underline and the tooltip names the source. `clear` removes the override and
falls back.

The override applies whether or not the card has a matching intake row — plenty
of cards are internal work with no request behind them and still need a date.

*Open decision: whether setting a deadline here should also write the Trello due
date. Currently it does not, preserving the single-write posture.*

### 4.3 Urgency — Interaction

**The only write in the system.** Adds or removes a Trello label named `Urgent`;
absence means non-urgent, so there is no second state to sync. Creates the label
on the board once if missing.

Optimistic then reconciled: update locally, call Trello, and on failure restore
the previous value and surface the error. Sirius must never show a state Trello
does not hold.

States — Urgent: `--status-destructive-light` bg, `--status-destructive-strong`
text, solid `--red-300` border, ⚡ prefix. Non-urgent: `--surface-secondary` bg,
muted text, **dashed** `--slate-300` border. Saving: opacity 0.5, label
`saving…`, pointer-events none.

**Done when** a forced API failure visibly reverts the pill.

### 4.4 Incomplete cards — Design Specs

Amber panel listing cards missing a difficulty label, deadline or Figma
attachment, each linked to its Trello card. State the consequence. Hide when
empty.

---

## 5. Sprint Schedules

### 5.1 Gantt — Design Specs

Fixed left pane, horizontally scrolling right pane, one shared column table so
header and rows align.

Column widths: select 34, grip 24, MC 96, scope 262, requestor 136, type 104,
status 234. Row height 84. Bars 26 high, lane 1 at y=12, lane 2 at y=46.

Three segments: sketch `--status-warning`, client review `--blue-200`, render
`--blue-600`. Render past deadline `--status-destructive-strong`. The client
deadline is a 1px hairline. Square edges, not pills.

**Bars are output** — not draggable, no pointer cursor.

### 5.2 Row drag — Interaction

Pointer events only. **Not HTML5 drag-and-drop** — it fails inside sticky and
scrolling containers, which this layout has.

Grab anywhere in the left pane. A chip follows the cursor showing the
destination week and the delta. Target week tints `--blue-100`.

Multi-select by checkbox, shift-click range, or the sprint header checkbox with
an indeterminate state. A multi-row drag applies a **relative shift** —
preserve the interval between rows, do not stack them.

Escape clears the selection. Release outside a valid target cancels.

**Done when** dragging three rows spaced a week apart keeps them a week apart.

### 5.3 Sprints — Functionality

Table `sprints (project_id, name, starts_on, ends_on, position)`. Lengths vary;
do not derive from a two-week anchor.

A deliverable belongs to whichever sprint contains its slotted week. Weeks
covered by no sprint group under *Outside any sprint* — never absorbed into a
neighbour.

Overlaps rejected on save. Gaps allowed and surfaced. `ends_on >= starts_on`.

Reorder preserves each sprint's length and re-flows from the **earliest start in
the set** — not from the moved sprint's own start, which drags the calendar
forward.

**Done when** swapping a 3-week and a 2-week sprint keeps the first start date
and the total length.

### 5.4 Capacity and load — Functionality

Cards per week, seeded from ARES `deliveryForecast.referenceWeeks`. For rt-837:
least 1, typical 120, most 367. Slider bounded by least and most, defaults to
typical, labelled light / below typical / typical / above typical / peak.

**Row weight** `1 + (MC's task cards ÷ MC's deliverables)`. MC-805 has 13
deliverables and 40 tasks, so each row weighs 4.08 and the group weighs 53. The
whole board must total 478 = 269 + 209.

**Hard mix ceiling** — ideal 8.3%, ceiling 12.9%, from 27 measured weeks. Weeks
above the median ran a median cycle of 24.1h against 19.4h, about 24% slower per
card. Difficulty weights (Easy 1, Medium 2, Hard 4) are used **only** for this
test, never for capacity.

Footer per week: `{cards}/{capacity}` then `{hard}H · {share}%`. Tint normal
transparent, over ideal `--amber-50`, over ceiling or over capacity `--red-50`.
Fractions to one decimal, whole numbers plain.

### 5.5 Suggest plan — Interaction

Two passes. Pass 1 spreads Hard work evenly under a per-week quota. Pass 2 fills
the rest by urgency then deadline, against an even per-week target, then allows
overflow.

Respects card capacity, the hard ceiling, pinned rows and blockers. Never places
a blocked card into the current week.

**Where the backlog's own hard share exceeds the ceiling**, place everything
anyway and say the ceiling is unreachable. Stranding work is worse.

Proposals preview as `--violet-100` cells with a `--violet-300` inset ring.
Nothing applies until Apply. Unplaceable rows get an inline reason.

**Done when** no week exceeds capacity at settings of 1, 5, 20, 120 and 367.

### 5.6 Status chip — Interaction

Text is `statusNote || currentList`, classified by keyword into pending
`--status-warning-light`, ongoing `--blue-100`, done `--emerald-100`.

A manual override renders the **same colour** with a **dashed** border — colour
keeps meaning state, the border means someone typed it.

Click opens an inline textarea. Enter submits, Shift+Enter newlines, Escape
cancels. Submitting empty clears back to Trello. The editing row must lift to
`z-index: 30` or the textarea clips under the next row.

Deadlines renders the same component read-only — one shared implementation.

---

## 6. Deadlines

### 6.1 Board — Functionality

Read-only. Every date derives from Sprint Schedules; only day placement is
editable here.

Each deliverable contributes **two** entries — sketch delivery and render
delivery — landing in whichever week each falls in. A card with 3 work cards
counts 3 in its sketch week and 3 again in its render week. Not double-counting:
sketching three assets and rendering them later are separate work.

Week column tints `--amber-50` **only when over capacity**, not when a warning
exists.

### 6.2 Daily plotting — Interaction

Clicking a week header expands it to a Mon–Fri grid, one week open at a time.
Collapsed 320px, expanded 900px.

Drag milestones between days with pointer events. Target column tints
`--blue-100`; a chip names what is moving; release outside a day cancels.

**Day placement never changes the week.** Store `(project_id, milestone, day)`
in `milestone_day_plan`; null means follow the forecast. Optimistic with
rollback.

**Day capacity** is the week's capacity across non-holiday days using **largest
remainder**, so the total is exact — per-day rounding drifts it (22 over 4 days
rounds to 24, not 22). Holidays take zero, reject drops, and their share
redistributes.

**Done when** a 4-day week's columns still sum to the weekly capacity.

### 6.3 Conflicts — Functionality

Three rules per week: two or more urgent milestones, cards due over capacity,
forecast date after the client deadline.

**Dismissal is keyed on the situation, not the rule:** `week + rule + sorted
card:phase pairs`. Adding, removing, replotting or re-phasing a card produces a
different key and the banner returns. Keying on the rule alone lets a warning be
switched off permanently by accident.

Dismissing also removes those items from the replot list.

**Card-level indicators are never suppressed.** The red render bar and the late
flag stay. The alert is dismissible; the fact is not.

---

## 7. Forecast

### 7.1 Engine — Functionality

Port `forecast.ts`, `planner.ts`, `calendar.ts` verbatim from the prototype.
Pure functions, tested against real data, several rounds to get right.

```
sketchDelivery = WORKDAY(start, lead + design)
sketchApproved = WORKDAY(sketchDelivery, review)
renderStart    = Friday of the sketch-approval week
renderDelivery = WORKDAY(renderStart, lead + design)
```

Business days, Philippine holidays excluded, Asia/Manila. Store UTC, render
Manila.

**Design time keys on difficulty AND lane.** Easy/assets is 13.88 days at p70;
Easy/design is 0.94. Difficulty alone is invalid — in aggregate Easy looks
slower than Medium purely from lane mix.

**Measured review wait** across 1,184 completed cycles: median 2.68d, p70 4.80,
p85 9.87, p95 19.64.

**Do not reintroduce the spreadsheet review times.** They overstate by 2.6–4.6×.
`forecast.legacy.ts` exists only for the migration golden test.

### 7.2 Table — Design Specs

Two-tier header matching rows 1–2 of the Delivery Forecast sheet. Group spans
must sum to the body column count; a mismatch shears the header from the rows.

Order: Request · Difficulty · Confidence · Start · W · Cards → Review SLA
(Sketch, Render) → Forecasted Dates (4) → Total Cycle Time → Sketch breakdown
(4) → Render breakdown (4) → Baseline Review · Forecasted Review.

Numeric cells right-aligned, tabular figures. Group boundaries carry a 1px
`--border-border` right rule.

Difficulty read-only. Confidence is a select. Review SLA inputs tint
`--status-warning-light` to mark them as overrides.

### 7.3 Review SLA override — Interaction

Number input. A value replaces the modelled review time and cascades to Sketch
Approved, Render Delivery and Total Cycle Time in the same render pass. Empty
falls back to the measured percentile. Decimals accepted; negative and
non-numeric rejected without clearing the field.

---

## 8. Cross-cutting

**Empty states** — every table and panel. Dashed 1px `--border-border`,
`--radius-md`, `--slate-50`, centred, 32px vertical padding. Say what is missing
and the next action, never *No data*.

**Copy** — plain language throughout. No jargon in warnings, banners or
tooltips: *Too much in one week*, not *Over capacity*. Difficulty labels and
Trello list names stay verbatim, because they are the team's own vocabulary.

**Keyboard — WCAG 2.1 AA.** Drag-based scheduling needs a keyboard equivalent or
the platform fails AA. Row focusable, arrows move the target week, Enter
commits, Escape cancels. Every interactive element Tab-reachable in visual
order. Focus ring visible on both `--white` and `--slate-50`. Icon-only buttons
carry `aria-label`. `prefers-reduced-motion` disables bar transitions and the
drag chip.

**Timezone** — store UTC, render and compute Asia/Manila.

**Logs** — no brief text, no credentials.

---

## 9. Build order

1. Schema and migrations — `project_id` from the first line
2. Auth, allow-list, audit log — before any write path exists
3. Port `forecast`, `planner`, `calendar` with golden tests
4. ARES read (blocked on OD-1), then intake sync
5. **Rebuild the percentile grid and validate it** — a gate, not a task
6. UI, five tabs
7. Urgency write, last, with its own review

Step 5 is a gate. A schedule where everything reads late is ignored within a
week, and there is no second first impression.
