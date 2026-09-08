# Frost: Sirius — build spec

> **Held copy, 2026-09-08.** Transport: owls #83–#85 (Miles, 7 Sept 2026), joined; letter prose kept in the day's state-log. Amended the same day by **#86** (quote bar `--amber-600` against the Figma node; header sort stays retired; missing difficulty closed) and **#87** (§6.3's server half is DELETED, not parked — this text's "parked, not deleted" is overruled). Build-team readings that differ from this text are in the 2026-09-08 drift report.

**v1.3** · 7 September 2026 · supersedes v1.2.

The platform as it currently stands. Written as build instructions, with the
rules and measured values that cannot be inferred from the design.

### What changed in v1.3

The redesign pass following the 3 September alignment with the PM and design lead.

**The scheduled unit is now the WORK CARD, not the deliverable.** Sprint Schedules
and Deadlines were both rebuilt on it (§5.0, §6.1); sketch and render are separate
rows; urgency, difficulty and deadlines all live on the work card (§4.1).

**The Forecast tab is withdrawn** — four tabs remain. The engine survives with no
screen of its own (§7).

**Review time is retired** (§7.1), and with it `sketchApproved`, the review
percentile table and the SLA override. The confidence percentile now applies to
design time only.

**Suggest Plan is withdrawn** (§5.5) and **the incomplete-card warning with it**
(§4.4, §3.3) — the product now carries no incomplete-card surface at all.

**Requests and Pipeline share one filter and sort recipe** (§3.4, §4.4a), one
no-results state (§8), and one chip component.

**Deadline write access moved to Sprint Schedules** (§5); Pipeline reflects it as
plain text (§4.2).

**Rollover** — unfinished work moves forward a working day once its forecast
finish has passed (§6.2). It is the only place the system moves a card the PM
placed.

**§7a is rewritten on the real lane data** — 146 lanes, replacing the earlier
50-lane list, with the exclusion rule stated. **It is sufficient to build against**;
the missing ARES lane endpoint is an improvement, not a blocker.

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
and **Admin** — user access management, visible to admins only.
Active tab is `--surface-foreground` with a 2px underline; the rest
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

Nothing renders before sign-in. Data lives server-side, so signing out ends the
session and clears nothing.

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
the rule in plain text: *Difficulty, list and Figma links are read from Trello
and can't be edited here.* Then dim: *synced HH:MM · push live*.

**Sync is push-driven.** ARES notifies Sirius on every Trello change — measured
at 37 seconds end to end — with a 15-minute poll as automatic fallback if push
goes quiet. There is no CSV-import path in the platform; the prototype's CSV
import was a stand-in for the absent backend.

### 3.3 Incomplete panel — WITHDRAWN

The amber rejects panel is gone (removed 2026-08-14). No panel lists failed sheet
rows, and none should be reintroduced — the row-level warning that replaced it on
Pipeline has since been withdrawn too (§4.4), so the product carries no
incomplete-card surface at all.

**Ingestion figures on current data**, kept as a reconciliation reference: 495
imported, 495 reserved MC numbers skipped silently, 8 rejected.

### 3.4 Search, filter and sort — Functionality

**Search** sits full width above the table, placeholder *Search cards or MC#*.
Case-insensitive substring across MC #, deliverable, unit, requestor, type, brief,
note reason and remark.

**Filter and Sort are two icon buttons** to its right — 38 × 33 and 37 × 33, 8px
apart, white fill, 1px `--slate-500`, `--radius-sm`. **The same component and the
same treatment as Pipeline's pair. They must not diverge.** The four inline
selects this replaced are gone.

**Filter panel — six axes,** each a group label above its values with a per-value
count: `YEAR · MONTH · TYPE · UNIT · REQUESTOR · STATUS`. Multi-select checkboxes;
`Clear filter` greyed while nothing is selected. Zero-count values hidden unless
ticked; `None` where a sheet cell is blank.

**Every axis must appear verbatim as a column header.** A guard enforces it — an
axis that narrows a column the table does not draw is a filter the reader cannot
account for.

**The counts do not reconcile across axes, and that is correct.** Cards genuinely
lack values, so a request with no month contributes to YEAR and not to MONTH. Do
not build a test asserting the axes sum to the same figure; it would pin a
falsehood.

**Sort panel — eight options, single-select,** in two groups. `DATES`: Deadline
closest to now · Deadline farthest from now · Recently requested · Oldest request
first. `IDENTITY`: MC Number: Low to High · MC Number: High to Low · Deliverable
Name: A–Z · Deliverable Name: Z–A.

**Filter accumulates; sort replaces.** The two panels sit behind adjacent buttons
and must not behave alike.

**Default sort is `Recently requested`** — the intake sheet's row order, newest
first. `Clear Sort` returns to it, not to no sort.

Row position is stored as an integer and sorted server-side. **It is position, not
time:** the sheet is editable, and the order rests on the convention that rows are
appended. A divergence guard warns when a row lower in the sheet carries an
earlier Year/Month than the row above it.

**Chips.** One chip per selected **value**, wrapping to a second line, `Clear all`
wrapping with them. A chip's ✕ removes its one value. Chips never scroll and are
never truncated — a hidden chip is an active filter the reader cannot see or
remove, which is the confusion the control exists to prevent.

### 3.5 Pagination — Interaction

10 rows per page. **A footer beneath the table**, 1784 × 32 — not on the filter
row.

Left: *Showing **1-10** of **N** requests* — labels `--text-body` regular
`--slate-500`, the two counts weight 600 `--slate-900`.

Right: previous chevron 28 × 32, page numbers, next chevron 28 × 32. Windowing
`1 … 4 5 6 … 50`, first and last always reachable. **The current page is 32 × 32**
against its neighbours' 28, carrying a `--slate-300` border and `--slate-100`
fill; siblings have neither. Build the width difference — the break in rhythm is
what makes the current page findable.

Any change to search, tile or filter returns to page 1, and **the denominator
follows the filtered set**, never the project total.

**The footer leaves with the table** in the no-results state: with nothing to page
through, a count of zero pages is noise.

### 3.6 Table — Design Specs

**Eleven columns in order:** MC #, Year, Month, Deliverable, Type, Unit,
Requestor, Deadline, Brief, Status, Frost notes.

`min-width: 1420px`, horizontal scroll below. Header `--slate-50`, uppercase
`--text-label`, weight 600. Rows separated by 1px `--surface-secondary`, no
vertical rules. Padding 16px horizontal, 20px vertical, top-aligned.

MC cell shows the number with the sheet row beneath as a small external link.
Deliverable caps at 256px, Brief at 384px, ellipsised at 180 characters.

**UNIT** — renamed from Use Case. Its source is the intake sheet's `Business Unit`
column; **the sheet's name lives in the parser, not on screen** — map it as
`'business unit': 'unit'`, alongside the existing `'primary requestor':
'requestor'`. Sirius displays `UNIT` in the column header and the filter axis
both.

**Single-value means single-value.** One column, one value per request. No comma
parsing, no contains-matching, no combination values. A comma-separated cell is
stored whole and warns; splitting it would rebuild the combinatorial filter list
this rename exists to remove.

**Deadline is read-only here** — set in Sprint Schedules. Format `17 Jan 2026`.
Missing renders as an em-dash.

**Header-click sorting is not built.** The sort panel is the one sort door; the
frame's header chevrons are identical and inactive on all eleven columns and read
as decoration.

### 3.7 Status — Functionality

Derived, never stored. **Three values:**

```
In Pipeline        the MC # is found in Trello — this IS the filed state
For Filing         the MC # is absent from Trello
For Clarification  the Sirius-only flag; exists nowhere in Trello
```

`Filed` is not a value. It was outdated and duplicated *In Pipeline*.

A clarified row belongs to **For Filing AND For Clarification** — the two are not
mutually exclusive, so STATUS counts sum past the row count by design. The row
badge stays two-valued.

Rendered at `--text-body`, `--radius-sm`, padding 4px 10px.

**The tiles drive this axis.** Clicking a status tile ticks its value in the
filter panel and shows its chip; clicking again clears it. Two controls over one
field are one state and cannot disagree.

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

**Ten columns:** MC #, Card name, Type, Urgency, Difficulty, Status, Deadline,
Started, Done, Links. `REQUESTOR` was removed from this table **and** from its
filter panel — the axis left with its column, so the header-label guard holds.

Parent rows are deliverables — Trello cards carrying the `Main Card` label.
Expanding reveals the work cards sharing that MC number, on `--slate-50`.

**URGENCY, DIFFICULTY and DEADLINE live on the WORK CARD.** Parent rows draw an
**em-dash** in all three — not blank-pending-a-value, not inherited. A main card
does not have these properties.

*"Pag-usapang throughput kasi work card naman talaga yung important. Main cards
kasi pang tracking lang siya."* A request can carry an urgent screen and
non-urgent assets, so one value on the parent cannot be true.

**STARTED and DONE do still carry values on parent rows.** Deadlines are the
work-card-only field, not dates in general.

**TYPE and STATUS read the MAIN CARD**, including for filtering. The main card
reflects where the deliverable stands at a point in time, which is what the PM and
design lead need to see. **Opening the row shows the children that explain why the
parent sits in that lane** — that is the context, and it is why the two are not in
conflict.

**`mc_number` is not unique.** 15 MC numbers carry more than one deliverable;
MC-825 carries 99. Key on `(project_id, trello_card_id)`; display id is
`MC-655.3` for multi-deliverable requests.

**Work cards attach to the MC, not to a deliverable.** Only 1 of 27 task titles
matched a deliverable name — do not model a parent link. **A consequence worth
building knowingly:** a work card cannot be attributed to one of a shared MC's
deliverables, so it appears under all of them. On MC-825 one urgent work card is
drawn under 99 parent rows.

**Done when** 269 deliverables + 209 tasks + 20 unkeyed = 498 cards, nothing
dropped or double-counted.

### 4.2 Deadline — READ-ONLY here. Plain text, not a control.

**Set in Sprint Schedules, on work cards, and nowhere else** — *"sa isang place
lang sila."* This cell **reflects**; Sprint Schedules **owns**.

Render as a plain text label. **No border, no fill, no radius, no calendar icon,
no hover affordance, no cursor change** — a value in a table cell exactly like
STARTED and DONE beside it.

A cell carrying the visual grammar of a date picker invites the click the rule
exists to prevent, and a control that looks live but refuses is worse than none:
the reader concludes the feature is broken rather than that it lives elsewhere.

**Empty renders as an em-dash** — not a `No Due Date` badge, and not a warning of
any kind. Amber is a warning colour and a card without a deadline is not a fault;
most sit that way for their whole planning life. Every absent value on this table
reads the same way.

Format `17 Jan 2026`.

*(The write itself — W2, the Trello due date — is specced at §5. Precedence is
Trello → sheet by construction: writing to Trello means a change made in either
place flows back without a reconciliation rule.)*

### 4.3 Urgency and difficulty — Interaction

**Both are set on the WORK CARD.** W1 (the `Urgent` label) and W3 (the
`Difficulty: …` label) target the work card, never the parent. Parent rows carry
no control.

**Adding a write beyond the registry requires a governance amendment**, not a code
change — the enumerated-write posture is quoted in the BRD, the security readiness
doc and the vendor assessment. Re-pointing an existing write at a different card
kind is not a new write.

Adds or removes a Trello label named `Urgent`; absence means non-urgent, so there
is no second state to sync.

Optimistic then reconciled: update locally, call Trello, and on failure restore
the previous value and surface the error. **Sirius must never show a state Trello
does not hold.**

**States on the row** — badge with a chevron, 96 × 25, `--radius-sm`:

| | fill | stroke | label |
|---|---|---|---|
| Urgent | solid `--amber-600` | none | `--amber-50` |
| Non-Urgent | `--slate-100` | **dashed** `--slate-400`, pattern `3 2` | `--slate-500` |
| Easy | `--green-100` | `--green-500` | `--green-600` |

Saving: opacity 0.5, label `saving…`, pointer-events none.

**Keep the asymmetry on urgency.** Trello has an `Urgent` label and none meaning
*not urgent*, so Urgent asserts a value and Non-Urgent draws an absence. A solid
grey outline would state something the data does not hold.

**Urgency is amber, not red.** Red belongs to difficulty (Hard) and to the
deadline marker on the gantt; urgency there too had one hue carrying three
unrelated meanings. The URGENT metric tile carries the same `--amber-600`.

**Open menus use a dot plus plain text**, not filled badges: a 6px indicator then
a `--text-body` label in `--slate-900`, under a 10px group header. In the row the
badge *is* the value and must read across a dense table; in the menu the label
carries the meaning and the dot is a key. **The label is never tinted to match its
dot.**

**Urgency offers exactly two options.** There is no "unset" — the two options are
the two states.

**Done when** a forced API failure visibly reverts the pill, and an urgency write
made from a parent row is impossible rather than merely hidden.

### 4.4a Filter and sort — Functionality

**Four axes:** `TYPE · DIFFICULTY · URGENCY · STATUS`, per-value counts,
`Clear filter` greyed until something is selected. All four are columns; the
header-label guard holds.

**Ten sorts, single-select,** in three groups. `DATES`: Deadline closest to now ·
Deadline farthest from now · Recently started · Recently completed. `PRIORITY`:
Urgent first · Hardest first. `IDENTITY`: MC Number and Deliverable Name, both
directions. **PRIORITY is Pipeline-only** — urgency and difficulty have no
counterpart on a request.

**Labels match Requests character for character** on every option the two tabs
share. The sort button names its selection **without a group prefix** — no item
name appears in two groups, so the prefix earns nothing and produces two colons in
one label.

**Filtering and the four work-card sorts auto-open groups.** Work cards carry the
deadlines, urgency and difficulty; a filter matching them would otherwise return
closed parents with every matching value hidden inside.

**Non-matching siblings stay hidden inside an opened group,** and a work card must
satisfy **every** live work-card axis at once — `Urgent + Hard` means one card
that is both. Opening MC-825 to reveal two urgent cards among ninety-nine defeats
the filter.

**Counts are counts of rows carrying the value** — for urgency and for difficulty
alike. On a shared MC every sibling row counts, so MC-825 reads `Urgent 99` for
one urgent work card. That is truthful about what ticking it draws.

**STATUS values are Trello lane names verbatim.** Keep them exactly as the board
writes them; do not tidy or shorten them for the panel. **STATUS is alphabetical** —
board order needs a list position the ARES read API does not expose today. It
arrives with the Apollo lane endpoint (§7a) rather than as separate work.

**Two kinds of sort, and only one needs the derived machinery:**

- **Main-card sorts** — Recently started, Recently completed, and all four
  IDENTITY options. Parents hold these values; order them directly.
- **Work-card-derived sorts** — both deadline options and both PRIORITY options.
  Parents reorder by their **earliest** work-card deadline, grouping kept — the
  soonest child deadline binds, because missing it means something under that MC is
  late. A childless parent renders collapsed. Keyless rows sort **last in either
  direction**, ordered among themselves by MC Number ascending.

### 4.4 Incomplete cards — WITHDRAWN

**The incomplete-card warning is removed entirely.** Ruled by Miles: no amber
accent, no alert icon, no hover card, no conditions. Pipeline draws nothing to
mark a card as incomplete.

Withdrawn with it: the 3px `--amber-300` left accent, the 14×14 alert icon after
the MC number, the 235-wide hover card with its per-field consequences, the *Fix
in Trello and it corrects on the next sync.* line and its **Open Card** link.

An absent value now shows the same way everywhere on this table — an **em-dash**.
No cell asserts that a gap is a problem.

**Do not reintroduce this as a smaller warning.** It was already the reduced
version: it replaced a full-row amber wash that lit 247 of 249 rows and stopped
discriminating. Reducing it further is not the answer that was reached; removing
it is.

#### Three things left without a surface, recorded so they are decisions

**Missing difficulty is the one that bites.** Without a difficulty label a card
**cannot forecast** — no cell, no bar, no finish date. That is a functional
blocker, and after this removal nothing on any screen says so. The card simply
produces no forecast and the reader is left to work out why.

**Missing due date no longer matters here.** Its stated consequence was *cannot
raise a deadline conflict*, and conflicts were withdrawn from Deadlines entirely.
The consequence was already void before this ruling.

**Missing Figma attachment already has a surface.** The LINKS column renders an
unavailable link at 30% opacity, so the gap is visible without a warning.

#### One stale claim in the withdrawn text

It read: *"the at-a-glance count … lives in the Open Work KPI, which counts
exactly these cards."* That is no longer what OPEN WORK counts — the metric strip
now counts work cards, and the incomplete set has no tile. If a count of
incomplete cards is still wanted, it needs its own decision rather than inheriting
a tile whose meaning has moved.

---

## 5. Sprint Schedules

### 5.0 The unit — READ THIS FIRST

**Sprint Schedules schedules WORK CARDS — actual Trello task cards — not
deliverables.** One row = one work card = one bar, with a start and a forecasted
finish. **Sketch and render are separate rows**, not two segments of one.

**There is no review segment.** Review is not a task; it is the client waiting
between two tasks. A row represents work someone does, so a wait has no row. With
the phases on separate rows there is no gap left in a row to misread as slack.
Review time itself is retired — see §7.

**This tab is not a mirror of the board.** Work cards enter only when the PM adds
them (§5.1a). An empty schedule is the correct starting state; a card absent from
it is not a gap, a sync failure or a bug. **Do not build any reconciliation that
fills in missing cards, and do not warn about board cards that are unscheduled
here.** Every other surface in Sirius reconciles against the board, so absence
reads as failure — here it is the design.

**Every row is placed by hand, including render.** A render row is not created,
positioned or suggested when its sketch is forecast to finish. No cascade, no
auto-follow, no ghost placement. The PM decides when each task starts, and that
control is the point.

### 5.1 Gantt — Design Specs

Fixed left pane, horizontally scrolling right pane, one shared column table so
header and rows align.

**Left pane columns:** MC No., Scope, Deadline, Confidence, Status. Row height
120.

**One bar per row**, start to computed finish. **Bar colour encodes URGENCY, not
phase** — urgent `--amber-600`, non-urgent `--slate-400`. The sketch-amber /
render-blue convention is retired; sketch and render bars are no longer
distinguishable from one another, because the row already says which it is.

**The client deadline is a 2px vertical rule** in `--red-500`, full row height, on
the week containing the date. It is a rule, not a bar — no fill, no radius.

**A bar to the right of its marker is late.** That relationship is the row's whole
purpose: the bar ends at the forecast, the marker stands at the deadline.

**Two tooltips, and they are an input and an output.** On the marker, the
**deadline** the PM *set*. On the bar, the **computed finish** — `Ends: 2 Sept
2026`. Do not merge them, and do not put the computed finish back in the DEADLINE
column: that column is editable and holds a commitment; the finish is never typed.

### 5.1a Adding work cards — Functionality

**An always-visible search field at the end of every sprint.** Not hover-revealed,
no pending row, no dropdowns. Type an MC number or work card text; matching cards
list beneath; add them one at a time or all at once.

Row height is **77 in every state** — only the field's right edge moves, from 890
to 808, as `Add All` appears. **The row must not reflow as the user types.**

| state | Add All | list |
|---|---|---|
| resting | **absent**, not disabled | nothing renders |
| matches | `--blue-600` | results, each `Add` at `--blue-300` |
| no matches | `--slate-400`, inert | one muted line where the first result would be |

On row hover the row's `Add` rises to `--blue-600` **and its label goes to weight
600** — both, not one. Two distinct colour tokens, never one at reduced opacity.

**`Add All` adds exactly the list on screen**, in one request, in list order.
**No confirmation, no count-check, no review pass.**

That is not a convenience. It is the fix for why urgent work has historically
bypassed the plan: an urgent batch is many items, per-item selection cost more
than plotting was worth, so the PM skipped plotting and reconstructed the record
afterwards. **If Add All grows friction it stops being the answer to the problem
it exists for.**

**Only open / active work cards are offered.** A completed card is never listed.
The full card name is matched and stored, never a truncated one. **Cards land
unplotted** — adding and placing are two acts.

### 5.1b Placement and anchoring — Interaction

**A violet + appears when an item is selected and has no schedule yet.** It
**tracks the pointer** across the week columns, rendering in whichever week is
hovered — not fixed to a column. **Clicking places the bar immediately**: no
picker, no confirmation, no drag-to-size.

**The user sets the START; the finish is computed.** That follows from
click-to-place — setting a duration would need a drag. It is also what keeps the
bar and the forecast incapable of disagreeing. **If they can ever disagree,
something is wrong.**

**Anchoring is a project-level toggle** in the toolbar:

- **Forward: Start Date** — set the start, see the finish.
- **Backward: End Date** — set the deadline, and the bar anchors backwards so the
  user sees when work must begin.

Design support runs **forward from start**; a managed service has no shared end
date. A waterfall project would run backward.

**Confidence is a per-row select** — 70th / 85th / 95th percentile — replacing the
retired FORECASTED column. It selects from the measured **design-time**
distribution for that card's difficulty and lane. There is no second percentile;
review is retired.

**Bar resizing is out of the pilot. Percentile only.**

### 5.2 Row drag — Interaction

Pointer events only. **Not HTML5 drag-and-drop** — it fails inside sticky and
scrolling containers, which this layout has.

**Drag a task bar to move an item across sprints.** A chip follows the cursor
showing the destination week and the delta. Target week tints `--blue-100`.

Multi-select by checkbox, shift-click range, or the sprint header checkbox with
an indeterminate state. A multi-row drag applies a **relative shift** —
preserve the interval between rows, do not stack them.

Escape clears the selection. Release outside a valid target cancels.

**Done when** dragging three rows spaced a week apart keeps them a week apart.

### 5.3 Sprints — Functionality

Table `sprints (project_id, name, starts_on, ends_on, position)`. Lengths vary;
do not derive from a two-week anchor.

A **work card** belongs to whichever sprint contains its plotted week. Weeks
covered by no sprint group under *Outside any sprint* — never absorbed into a
neighbour.

**Sprint membership is stored, not derived.** Rollover moves cards across sprint
boundaries (§6), so membership must follow the card rather than being recomputed
from a week. Deleting a sprint removes its scheduled rows with it, audited, behind
a confirmation naming the count.

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

**Row weight — BR-6c does not apply on this tab.** `1 + (tasks ÷ deliverables)`
existed only because a deliverable row had to absorb the weight of tasks that had
no row of their own. Work cards now have rows, so **each row weighs 1** and the
footer counts them directly: `N / 120 Work Cards`. Pipeline may still need BR-6c;
Sprint Schedules must not apply it.

**Hard mix ceiling** — ideal 8.3%, ceiling 12.9%, from 27 measured weeks. Weeks
above the median ran a median cycle of 24.1h against 19.4h, about 24% slower per
card. Difficulty weights (Easy 1, Medium 2, Hard 4) are used **only** for this
test, never for capacity.

Footer per week: `{cards}/{capacity}` then `{hard}H · {share}%`. Tint normal
transparent, over ideal `--amber-50`, over ceiling or over capacity `--red-50`.
Fractions to one decimal, whole numbers plain.

### 5.5 Suggest plan — WITHDRAWN. Do not build.

**The Suggest Plan control is removed from Sprint Schedules.** Miles's reasoning: withdrawn
for now to observe how the tool is actually used, and if a smart suggest proves warranted it
will be rebuilt in a different form. Its absence is a decision — do not restore it from this
section, and do not treat what follows as a spec.

Kept as a record only, because the placement arithmetic was derived from measured behaviour
across several rounds of correction and would be expensive to re-derive:

> Two passes. Pass 1 spreads Hard work evenly under a per-week quota. Pass 2 fills the rest by
> urgency then deadline, against an even per-week target, then allows overflow. Respects card
> capacity, the hard ceiling, pinned rows and blockers. Never places a blocked card into the
> current week. Proposals preview as `--violet-100` cells with a `--violet-300` inset ring.
> Nothing applies until Apply. Unplaceable rows get an inline reason.

**Two things here are NOT withdrawn:**

`planner.ts` stays. `weekLoad()`, `cardWeight()` and the WEIGHTS / HARD_MIX constants remain
load-bearing for week capacity, row weight and the hard-mix ceiling. Only `suggestPlan()` goes
dormant, and it is kept rather than deleted because the feature may return.

The rule that **an unachievable hard mix is reported rather than refused** (BR-7a) survives on
its own account — where the backlog's own hard share exceeds the ceiling, show the work and say
the ceiling is unreachable. Stranding work is worse. That governs any surface displaying
capacity, not just the retired suggester.

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

Read-only, and **downstream of Sprint Schedules**. The unit is the **work card**,
not the deliverable — one card per scheduled work card. Sketch and render appear
as separate cards, as they are separate rows on Sprint Schedules.

**Doubly opt-in.** A card appears **only** if it has been added to Sprint
Schedules **and** plotted. On the board but not added → absent. Added but not
plotted → absent. **Neither is a gap, a sync failure or a bug.**

**Do not reconcile this tab against the board, and do not warn about unscheduled
work.** Deadlines shows the plan, not the backlog. Every other surface in Sirius
reconciles against the board, so an empty week reads as failure; here it is
correct.

**This supersedes the retired rule** that each deliverable contributes two entries
weighted by `1 + (tasks ÷ deliverables)`. Each work card is one entry weighing
**one**. The progress line reads `N / 120 Work Cards`.

**Counts.** Week header `N Pending · N Urgent · N Done`; day header `N Pending ·
N Done`.

- **Pending and Done do not sum to the total.** An ongoing card is in neither.
  Do not build a reconciliation expecting them to balance, and do not derive one
  count by subtracting the other.
- **Urgent is a cross-cutting subset**, not a third state. An urgent card is also
  pending, ongoing or done. Never add it to the other two.
- The three states come from the lane mapping — §7a.

### 6.2 Which day a card sits in, and when it moves — Functionality

**A card sits on its START day** — the day the team is slated to pick it up. Not
its forecast finish.

That is the design lead's instrument and the reason this view runs on days:
the PM owns the week and the deadline, the design lead owns the day work begins.
A computed finish is not something the lead chooses, so placing cards on it would
leave them arranging dates they cannot move.

**Rollover — an unfinished card moves forward one working day when BOTH hold:**

- its **forecast finish has passed**, and
- it is **still not in a Done lane**.

**The trigger is not "didn't finish that day."** Taken literally that rolls any
multi-day card every single day: a three-day task placed Monday isn't finished
Monday, so it moves; not finished Tuesday, moves again. Its Sprint Schedules bar
translates each time, the forecast keeps receding, and the bar never lands.

> **Worked example.** Card placed Monday, forecast finish Wednesday.
> *Tue–Wed* — stays in **Monday's** column; work is simply in progress.
> *Thu, if unfinished* — the finish has passed. It moves to Tuesday's column, the
> bar translates whole on Sprint Schedules, and the finish recomputes from the new
> start.
> *If it completes* — it stays put at 40% opacity and never rolls again.

**Rollover crosses week and sprint boundaries.** A card may leave the sprint the
PM placed it in; **sprint membership follows the card.** The bar **translates
whole** — do not stretch it to cover the delay, which would silently inflate the
forecast.

**No marker records that a card moved.** Deliberate: carrying unfinished work to
the next day is the nature of the thing, and it is being observed before anything
is added. Do not invent a rolled-over badge, a carry-over count or a
date-changed indicator. It is audited internally; the audit log is not a product
surface.

**Build this knowingly:** a card that never completes moves indefinitely, landing
in each new day's and week's counts, with no cap and nothing on screen recording
it. That is intended.

**This is the only place in either tab where the system moves a card the PM
placed** — a deliberate exception to manual placement, not licence to automate
placement elsewhere.

**Day capacity** is the week's capacity across non-holiday days using **largest
remainder**, so the total is exact — per-day rounding drifts it (22 over 4 days
rounds to 24, not 22). Holidays take zero and their share redistributes.

**Done when** a 4-day week's columns still sum to the weekly capacity.

### 6.3 Conflicts — WITHDRAWN

**There is no conflict indicator on this tab at all.** Withdrawn: the three
per-week rules, the dismissal key, the banners, the acknowledge and restore
controls, and the replot list. The server half is parked, not deleted, pending an
acknowledged-state design.

**Do not reintroduce week-level conflict badges.** They previously read *"With
overlapping items"* and *"With items past deadline"*. A **count** replaced them —
`N Pending · N Urgent · N Done` — because a count states the situation without
asserting something is wrong, and keeps discriminating when many weeks trip the
same condition. That is the failure that produced the amber wall on Pipeline at
247 of 249 rows.

**The card's quote bar is the only signal that survives**, and it means **Urgent**
— nothing else. See §6.4.

### 6.4 The card — Design Specs

**308 × 180, fixed height.** A three-line title and a two-line title both render
at 180; do not size to content. Badges → title → links.

**The quote bar — 4px, left edge only, following the 8px corner radius.** It is
not a plain rectangle: the path curves at top-left and bottom-left. Built as
`border-left`, the corners square off and it sits wrong against every neighbouring
card. The node inspector reports a side-less, weight-less stroke; that reading is
wrong and has shipped wrong twice.

**It appears on Urgent cards only**, so they can be picked out when cards stack in
a day column. Same input as the Urgent badge above it — the redundancy is
deliberate: a badge has to be read, a coloured edge is caught while scanning.
**Non-urgent cards get no bar** — not a grey one, not a pale one. The bare edge is
what makes the red one carry.

**Shadow — `0 1px 2px rgba(0,0,0,0.05)`.** The SVG filter is `stdDeviation="1"`,
and **CSS blur is 2 × stdDeviation**. Figma's codegen emits the stdDeviation and
is wrong; copying it ships a visibly lighter shadow.

**The done card is the standard card at `opacity: 0.4`** — one property, nothing
underneath restyled. Do not recreate it with paler colours: that needs a second
value for every token and stops tracking future colour changes. **`get_node_info`
does not report opacity**, so this state is invisible to the inspector.

The purpose of the fade is worth keeping: *"the goal, every week dapat yan, faded
lahat yan."* An empty or fully faded week means the week landed; anything at full
strength on Thursday has not moved.

**Empty states** — `None slated today` in a day, `None slated this week` in a
week. White, `--radius-sm`, 16px padding, `[6,3]` dash. *(This is the live node
value and it differs from §8 pattern A; see the note there.)*

### 6.5 Removed with the rework

**No search and no filters.** Navigation is the date-range control and scrolling.
Do not add a search field back on the assumption it was dropped by mistake.

**No stats or breakdown strip** above the lanes.

**The day-drag planner is retired** along with the conflict machinery. ⚠️ The
two-owner model gives the design lead *"which day of that week work begins"*, and
with the planner gone that has no surface. Recorded as a known gap, not an
oversight.

**The range control is a prev/next month navigator** with a label — `Aug 31 –
Sept 30, 2026` — not a date-range picker.

---

## 7. Forecast engine

**No screen of its own — the Forecast tab was withdrawn.** The engine supplies each
work card's forecast finish, plus week and day capacity, to Pipeline, Sprint
Schedules and Deadlines. Deadlines depends on it twice: week capacity from
`deliveryForecast.referenceWeeks`, and rollover's test that a forecast finish has
passed.

### 7.1 Engine — Functionality

Port `forecast.ts`, `planner.ts`, `calendar.ts` verbatim from the prototype.
Pure functions, tested against real data, several rounds to get right.

```
finish = WORKDAY(start, lead + design)
```

**Per work card, at the selected confidence percentile.** The start is the PM's
placement; the finish is computed. Business days, Philippine holidays excluded,
Asia/Manila. Store UTC, render Manila.

**Design time keys on difficulty AND lane.** Easy/assets is 13.88 days at p70;
Easy/design is 0.94. Difficulty alone is invalid — in aggregate Easy looks
slower than Medium purely from lane mix.

**The two halves of that key come from different places.** Lane comes from the
Trello **list**; difficulty comes from the **label**. Classifying on the card's
**title** was a real defect — the lane matcher hits `asset|illustrat|render|icon`,
and every task prefix on this board (`Sketch Asset`, `Render Asset`, `Icon Clean
Up`) matches it, picking a 13.88-day cell where a 0.94-day one belonged. Fourteen
times the duration, decided by a naming convention. **Never classify on the
title.**

#### Review time is RETIRED

Sirius schedules **work cards**, and a work card is done and closed internally.
Client review is not part of its duration — it is something that happens to a
deliverable afterwards, and nothing Sirius forecasts depends on it.

**Withdrawn:** `sketchApproved` as a computed date · `renderStart = Friday of the
sketch-approval week` · the review term in Total Cycle Time · the review
percentile table · the review SLA override (FR-7.5) and its acceptance criterion.

**The confidence percentile applies to design time only.** Two percentile tables
previously existed; one survives.

**Do not rehome the SLA override.** An override with nothing to override is not
homeless, it is finished. The `/model` endpoint and the confidence routes **stay**.

**BR-3 is historical, not governing.** Its finding — the spreadsheet overstating
*review* waits by 2.6–4.6× — is why the measured model replaced the workbook. With
review out of the arithmetic it governs no live calculation. **Keep the record: it
is why the spreadsheet's numbers must never be reintroduced.** `forecast.legacy.ts`
exists only for the migration golden test.

⚠️ **One consequence to build knowingly.** Client-review lanes still exist on the
board and are classified **ongoing** (§7a). An ongoing card rolls forward daily,
so a card sitting in *Sent for Client Review* walks through the schedule for as
long as the client holds it — a wait the team does not control, moving a bar the
PM placed. Review is out of the forecast but not out of the board, and rollover
cannot tell the difference.

### 7.2 Withdrawn with the tab

The two-tier header and its column order — Request · Difficulty · Confidence · Start · W ·
Cards → Review SLA (Sketch, Render) → Forecasted Dates (4) → Total Cycle Time → Sketch
breakdown (4) → Render breakdown (4) → Baseline Review · Forecasted Review — along with the
`--status-warning-light` override tinting.

Of the three controls that were orphaned when the tab went, all three are now settled:

- **Confidence (FR-7.4) — rehomed.** It is a per-row select on Sprint Schedules, §5.1b.
- **Review SLA override (FR-7.5) — retired** with review time itself, §7.1.
- **Model constants and sample sizes (FR-7.7) — retired.** No user asked for the
  grid. What the PM and design lead need is the bar and the confidence selector,
  and both exist. The grid was an engineering artefact, not a user surface.

**Roadmap 4.6 — retiring the Forecast workbook — is reachable.** The workbook did
exactly two jobs, sprint slating and deadlines, and those are precisely what Sprint
Schedules and Deadlines now do, including the forecasted delivery dates. The one
genuine remainder is monthly COCA reporting, deferred to a reporting release and
unrelated to the workbook's planning role.

---

## 7a. Trello lane → state mapping

**Authoritative.** Source: `[Mapping] Trello Lanes.xlsx`, supplied by Miles
2026-09-07. **146 lanes**, replacing the 50-lane list this section previously
carried.

Every lane resolves to one of four outcomes: **Pending · Ongoing · Done ·
excluded**. Three are states a card is *in*; **excluded is a visibility filter,
not a state**.

### The rule

```
excluded   ·  the five OPS lanes  (see below — NOT the whole OPS group)
           ·  the three lanes with no equivalent status
otherwise  ·  Pending | Ongoing | Done, per the enumeration
```

**Two different reasons to exclude, and they must not be merged.**

**Operations work is not ours.** Ops cards are operations tasks, not deliverables
Sirius tracks. They carry perfectly good states — `Operations Backlog` is Pending,
`Ops Work Complete` is Done — so **state cannot exclude them; identity does.**

⚠️ **`Production Backlog` sits inside the OPS group and is IN SCOPE**, as Pending.
So a blanket `group == OPS` rule is wrong. Exclude the five named lanes, not the
group.

**Three lanes have no equivalent status** — the sheet says so in as many words:
`➜ Process Lane`, `Discarded Work`, `Unused Work`.

### What the enumeration is still for

Two earlier traps are **dissolved** by this data and should not be carried forward:

- **`Ready for …` does not split.** Every `Ready for X` lane is **Ongoing**,
  including `Ready for Content`, `Ready for Design` and `Ready for Development` —
  which the previous 50-lane list had as *pending*. **Pending is the Backlog lanes
  and nothing else.**
- **`… Complete` splits only via Ops**, which is now excluded by name anyway.

**One trap survives, and it is why the enumeration is still required:**
`Passed QA` and `➜ Development: Pushed to Production` are **Done** and match no
keyword. Any name-based rule misses them.

⚠️ **A data inconsistency to normalise on read.** Process lanes use the glyph `➜`
(U+279C) — except **`-> Render: Sent for Client Approval`**, which uses ASCII
`->`. Match on a normalised form or that one lane never resolves.

---

### EXCLUDED — 8 lanes

**Operations — 5.** `Operations Backlog` · `Working on Ops Work` ·
`Ready for Ops Review` · `Reviewing Ops Work` · `Ops Work Complete`

**No equivalent status — 3.** `➜ Process Lane` · `Discarded Work` · `Unused Work`

### PENDING — 16 lanes

All are Backlog lanes.

`Production Backlog` · `Content Backlog` · `Design Backlog` ·
`Development Backlog` · `Backlog: Process Lane` · `Backlog: Screens` ·
`Backlog: Components` · `Backlog: Normalization` · `Backlog: Assets` ·
`Backlog: Sketch Revisions` · `Backlog: Render Revisions` ·
`Backlog: UI Revisions` · `Backlog: Icons` · `Backlog: Motion` ·
`Backlog: Bugs and Fixes`

*(15 named; the 16th is `Operations Backlog`, which is Pending but excluded.)*

### DONE — 15 lanes

**Work lanes — 5.** `Content Complete` · `Design Complete` · `Passed QA` ·
`Development Complete` · *(`Ops Work Complete` is Done but excluded)*

**Process lanes — 10.** `➜ Content: Done` · `➜ Screen: Done` ·
`➜ Component: Done` · `➜ Render: Done` · `➜ Final Animation: Done` ·
`➜ UAT: Done` · `➜ Development: Pushed to Production` ·
`➜ Development: Completed` · `➜ Development: Released` · `➜ Development: Done`

### ONGOING — 112 lanes

Everything not listed above. Enumerated by group so an unmapped lane is visible:

**WORK · CONTENT (10)** — `Ready for Content` · `Working on Content` ·
`Ready for Content Peer Review` · `Working on Content Peer Review` ·
`Ready for Content Review` · `Working on Content Review` ·
`Ready for Content Refinement` · `Working on Content Refinement` ·
`Ready for Content Checks` · `Working on Content Checks`

**WORK · DESIGN (6)** — `Ready for Design` · `Working on Design` ·
`Ready for Peer Review` · `Working on Peer Review` · `Ready for Design Review` ·
`Working on Design Review`

**WORK · DEV (12)** — `Ready for Development` · `Working on Development` ·
`Ready for Dev Peer Review` · `Working on Dev Peer Review` ·
`Ready for Code Review` · `Working on Code Review` ·
`Ready for Design and Content QA` · `Working on Design and Content QA` ·
`Working on Bugs and Fixes` · `Ready for QA Validation` ·
`Validating Bugs and Fixes`

**PROCESS · CONTENT (8)** — `➜ Ready for Content` · `➜ Content: Writing Content` ·
then `Ready for Client Review` · `Sent for Client Review` · `With Revision` ·
`Working on Revision` · `Ready for Client Approval` · `Sent for Client Approval`

**PROCESS · SCREENS (16)** — the `➜ Screen:` and `➜ Component:` families, each
running `Ready for …` → `Working on it` → the six review and approval lanes, plus
`➜ Ready for Screen Design` and `➜ Ready for Componentization`

**PROCESS · ASSETS (16)** — the `➜ Sketch:` and `➜ Render:` families on the same
shape, plus `➜ Ready for Sketch` and `➜ Ready for Render`

**PROCESS · MOTION (16)** — the `➜ Rough Animation:` and `➜ Final Animation:`
families on the same shape, plus their two `Ready for` lanes

**PROCESS · DEV (16)** — `➜ Ready for Development` · `➜ Development: Working on
it` · `➜ Ready for DQA` · `➜ DQA: Working on it` · `➜ Ready for CQA` ·
`➜ CQA: Working on it` · `➜ Ready for Integration` · `➜ Sent for Integration` ·
`➜ Integration: Ongoing` · `➜ Development: Ready for UAT` ·
`➜ Development: Sent for UAT` · `➜ UAT: Ongoing` · `➜ UAT: With Issues` ·
`➜ Development: Ready for Release`

**JFC (12)** — client-specific. `➜ Content:`, `➜ Screen:` and `➜ Sketch:` each
with `Ready for CRM` · `Sent for CRM` · `Ready for Brand` · `Sent for Brand`

---

### What consumes this

- **Deadlines week and day counts.** `N Pending · N Urgent · N Done`. **Ongoing is
  in neither**, so the two do not sum to the total — do not build a reconciliation
  expecting them to balance.
- **The 40% faded card** on Deadlines — a card in a Done lane.
- **Rollover** (§6.2) — its test for whether a card is finished. A card not in a
  Done lane rolls once its forecast finish has passed.
- **The Add Sprint Item search** (§5.1a) — only open / active lanes are offered;
  Done and excluded lanes are never listed.
- **Pipeline's STATUS filter** shows lane names **verbatim** and is unaffected by
  this mapping.

**Requests' status model is separate and unaffected:** *In Pipeline* = MC # found
in Trello · *For Filing* = MC # absent · *For Clarification* = the Sirius-only flag.

### This enumeration is sufficient to build against. Build it.

**The lanes are standard across projects.** JFC is the only known variant, and its
twelve lanes are already in the table above. So this is not one board's list — it
is **the standard set plus the only exception**, which makes it safe to ship as it
stands.

**The missing ARES lane endpoint is therefore an improvement, not a blocker.** It
was previously treated as one. What it will still buy, neither urgent:

- **Which lanes a given board actually holds.** A board using 40 of the 146 should
  not offer the other 106 as filter options.
- **The next genuinely new client** with its own lanes, handled without a spec
  edit.

**The safety net is what makes a static table safe: an unmapped lane must be
SURFACED, never guessed at.** That is the one case this list cannot cover, and it
has to fail loudly rather than quietly picking a state.

**Retire the keyword classifier.** Measured against the earlier 50-lane list,
**9 of 20 misclassified** — `Ops Work Complete` counting as finished project work,
`Passed QA` counting as nothing.

#### Keywords, as a cross-check only — do not implement

A keyword rule does happen to hold across all 146 lanes today:

```
Pending  →  contains "Backlog"
Done     →  Complete | Done | Passed | Pushed | Released
Ongoing  →  everything else
```

It is recorded because it is a cheap way to audit the enumeration, and because two
of its terms are non-obvious: `Passed` for `Passed QA`, and `Pushed` for
`➜ Development: Pushed to Production` — **not `Production`, which collides with
`Production Backlog` (Pending).**

⚠️ **`Released` must be the past tense.** `➜ Development: Released` is Done, but
`➜ Development: Ready for Release` is **Ongoing**. Matching on `Release` marks work
finished the moment it is queued for release.

**It holds by coincidence, not by structure**, and turns on a one-character
distinction. Use the enumeration.

---

## 8. Cross-cutting

### Empty states — two patterns, and they are not interchangeable

Which one applies depends on **how much of the screen is empty**, not on which tab
it is.

**A · In-panel empty — the dashed box.** A container inside an otherwise populated
page has nothing to show: an empty day column on Deadlines, an empty week, a
result list under a search field. Dashed 1px border, centred. Say what is missing
and the next action, never *No data*.

**Take the live values from the Deadlines nodes: white fill, `--radius-sm`, 16px
padding, a `[6,3]` dash** — not the slate-50 / `--radius-md` / 32px this section
carried previously. The nodes are canonical; the earlier values were prose that
had drifted. Copy is `None slated today` / `None slated this week`.

The box exists to hold the container's shape. Without it the layout collapses and
the page reflows around a gap, so the reader loses the structure they were
navigating.

**B · Full-page empty — centred type, no box.** A search or filter returns nothing
and the **entire table is replaced**, column headers included. No box, no dash, no
fill. Centred on the content area:

- headline 32px, `--slate-900`
- subline 24px Regular, `--slate-500`, 12px beneath
- nothing else — no icon, no illustration, no button

Live examples: Pipeline and Requests both use *"No results found"* over *"Try
adjusting your search term or clearing active filters"*, **character for character
identical**. Where two tables share a full-page empty they share the component;
two copies of one string will drift, and the copy is the part most likely to be
revised.

**Why B has no box.** A dashed rectangle around most of the viewport reads as a
broken container rather than an answer, and there is no surrounding structure left
for it to preserve — the table it would have outlined is gone. At that size the
type carries the message on its own.

**One rule for both.** Copy names the situation and the next action. Neither
pattern says *No data*, and neither instructs an action the screen does not offer —
if the subline says "clear active filters", a filter chip with a close control must
be on screen.

**Which pagination and counts do.** A full-page empty also drops the pagination
footer: with nothing to page through, a count of zero pages is noise. Metric tiles
do **not** drop or rescope — they describe the project, not the result set, and
hold their values while the table below shows nothing.

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

## 9. Build order — complete

All seven steps are built and live. OD-1 was resolved on 2026-08-03; both gates
passed — golden tests on the ported engine, and model validation accepted by the
PM.

1. ~~Schema and migrations — `project_id` from the first line~~
2. ~~Auth, allow-list, audit log — before any write path exists~~
3. ~~Port `forecast`, `planner`, `calendar` with golden tests~~
4. ~~ARES read, then intake sync~~
5. ~~**Rebuild the percentile grid and validate it**~~ — passed
6. ~~UI, six tabs~~
7. ~~Writes: urgency label and card due date, each with its own review~~

Retained for the record: step 5 was a gate rather than a task. A schedule where
everything reads late is ignored within a week, and there is no second first
impression.

---

**End of build spec v1.3.**
