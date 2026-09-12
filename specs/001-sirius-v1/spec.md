# Feature Specification: Sirius v1 — Delivery Pipeline & Forecasting Platform

**Feature Branch**: `001-sirius-v1`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Convert the signed-off BRD v2.2 (docs/product/brd.md) into Spec Kit format. Preserve every FR, BR, NFR, AC with its ID. Preserve every measured constant exactly. Mark Open Decisions [NEEDS CLARIFICATION]. Scope is v1 only. Add nothing the BRD does not contain."

**Source of truth**: `docs/product/brd.md` — **v3.0 since 2026-09-12** (the v2.2 this document was converted from is archived as `brd-v2.2.md`). This document is a format conversion, not a rewrite. Where this spec and the BRD diverge, the BRD wins and this spec is in error. Requirement IDs (FR-x.y, BR-n, NFR-n, AC-n) are the BRD's own and are how work is traced.

> **RE-CONVERTED TO BRD v3.0 on 2026-09-12** (JP: *"start now"*). The body below is no longer
> the v2.2 conversion: the functional requirements and the business rules are v3.0's own text,
> the user stories and edge cases were rewritten to the work-card unit, and the acceptance
> criteria were brought forward when v3.0 was adopted earlier the same day.
>
> **Three gaps are marked in place rather than guessed.** Each is a question already with
> product, and each names the reading the build follows meanwhile:
>
> | | question | built as | asked in |
> |---|---|---|---|
> | **GAP 1** | FR-3.3 — is *For Clarification* a status value or a flag? | a flag; STATUS is two-valued | owl #81 |
> | **GAP 2** | FR-7.3 / BR-2 / BR-4 — work-type label or lane? | lane and difficulty, for sample depth | owl #74 |
> | **GAP 3** | BR-10 / §7a — does the lanes endpoint supersede the name table? | no; the table is the source of state | owl #74 |
>
> **What is this document's own, not the BRD's:** FR-9 (two-way sync), FR-10 (the admin
> screen), BR-6c (row weight), AC-27–AC-30, and the engineering notes marked as such. Product's
> numbering wins everywhere the two describe the same rule — FR-11 folded to FR-3.7–FR-3.10 and
> FR-12 to FR-6.9–FR-6.14 on the same day.

## Overview

Frost delivers design work to several clients through Trello boards, tracked in a pair of Google Sheets that have outgrown themselves — 6,342 production rows, broken cross-sheet links, and 4,020 status values reading `No Match`.

Sirius replaces the *planning and forecasting* half of that system: a pipeline register, a sprint schedule, an operations deadline view, and a delivery forecast. Trello remains where work happens. The intake sheet remains where clients file requests. Sirius reads both and owns neither. It is **multi-project from the outset** — GCash: Design Support is the first engagement, not the only one.

Sirius owns only planning decisions: which week a deliverable is slotted, confidence, review SLA overrides, status notes, pins — and, since 2026-08-12, frost notes on intake requests and day placements on Deadlines. It writes back only what the write registry enumerates — the `Urgent` label and the card due date, both on Trello — nothing else, anywhere (amended 2026-08-04; was urgency-only).

The business case is not headcount. It is that a forecast becomes defensible, the week's real load is visible before it bites, and the manual reconciliation between two spreadsheets and a board stops consuming PM time.

## User Scenarios & Testing *(mandatory)*

All actors are Frost staff (PM, Operations Lead, designers, leadership) signing in with Frost Google accounts. The BRD defines no other personas for v1; client access is v2.

### User Story 1 - Pipeline register (Priority: P1)

A Frost PM opens the Pipeline view for a project and sees every deliverable — type, difficulty, urgency, current Trello list, requestor, deadline, cycle time, and links to the Trello card and Figma file — without opening Trello or either spreadsheet. Expanding a deliverable reveals its MC group's work cards. Cards missing difficulty, deadline or Figma link are listed for correction, with links.

**Why this priority**: The register is the read-only core every other view derives from; it alone replaces the manual reconciliation between two spreadsheets and a board.

**Independent Test**: Sync a project's board data, open Pipeline, verify fields, grouping, and the correction list against known board contents (FR-4.1–FR-4.5).

**Acceptance Scenarios**:

1. **Given** a synced project, **When** the PM opens Pipeline, **Then** deliverables list with the FR-4.1 fields and Trello-sourced fields are read-only (FR-4.3).
2. **Given** a deliverable in an MC group with work cards, **When** the row expands, **Then** the group's work cards appear (FR-4.2) — attached to the MC group, not to a single deliverable.
3. **Given** a card missing its difficulty, **When** Pipeline renders it, **Then** nothing is drawn to
   mark it incomplete — no amber accent, no alert icon, no hover card. ⚠️ **FR-4.4's correction list
   is WITHDRAWN**: a missing difficulty is a data error for ingestion health, not a Pipeline
   surface. 19% of done cards carry no difficulty label today, and the column simply reads
   em-dash (AC-26).

---

### User Story 2 - Sprint scheduling (Priority: P2)

The PM plans on a list-plus-gantt view grouped by sprint. **The scheduled unit is the work
card, not the deliverable** — sketch and render are separate rows, one bar each, with a start
and a forecasted finish. Placement is **week grain and click-to-place**: the PM clicks a week
and the bar starts on that week's first working day. Multi-select moves apply a relative week
shift. Rows can be pinned. Sprints themselves are edited in the platform — added, renamed,
re-dated, reordered, deleted.

**Why this priority**: Slotting weeks is the planning decision Sirius owns; it feeds Deadlines
and the forecast.

**Independent Test**: Click-place a card into a week, move a multi-selection, re-date a sprint
under placed cards, edit sprints — verify AC-13, AC-14, AC-23 and FR-5.x behaviours.

**Acceptance Scenarios**:

1. **Given** a slotted work card, **When** the PM places it in another week, **Then** dates,
   sprint group and load update, and the bar starts on that week's first working day (AC-13,
   FR-5.4).
2. **Given** several selected rows, **When** moved, **Then** the interval between the grabbed
   row's week and the target week applies to every selected row, preserving spacing (AC-14,
   BR-8). *Not yet built — the API half exists; v3.0 marks the move unbuilt.*
3. **Given** a sprint re-dated so placed cards fall outside it, **When** saved, **Then** those
   cards keep their day and move to *Outside any sprint* — nothing is unslotted or destroyed
   (AC-23, BR-5).
4. **Given** two sprints whose dates overlap, **When** saved, **Then** the save is rejected
   (FR-5.15); weeks covered by no sprint surface as *Outside any sprint* (BR-5).
5. **Given** the PM on this tab, **When** they try to place or drag at day precision,
   **Then** there is no such gesture — the day belongs to the design lead, on Deadlines
   (FR-5.4, BR-9b).

⚠️ **Suggest plan (FR-5.7, FR-5.8, BR-7) is WITHDRAWN**, and AC-15/AC-16 with it. Pinning
(FR-5.9) survives as a flag that now protects against nothing. Read the absence as a decision:
product removed it to watch how the tool is actually used, and any rebuild would take a
different form.

---

### User Story 3 - Deadlines (Priority: P3)

The design lead opens Deadlines for a month and sees each week's work cards on the day work
**starts**, with per-week and per-day counts. **This is the one surface that owns the day**:
she drags a card between days, bounded by four conditions at once — inside the card's assigned
week, inside its sprint, on or before its deadline, and a working day. A card whose forecast
finish has passed while it sits outside a Done lane rolls forward one working day.

**Why this priority**: It is where the day-level decision is made, and it depends on
scheduling (US2) existing.

**Independent Test**: Drag a card to a valid and an invalid day, let a forecast finish pass on
an unfinished card, and check the counts — verify AC-18, AC-21, AC-22 and FR-6.x.

**Acceptance Scenarios**:

1. **Given** a card placed in a week, **When** the design lead drags it to another day in that
   week, **Then** it moves and the assigned week never changes (FR-6.9, FR-6.10, AC-29).
2. **Given** a drag past the edge of the assigned week, **When** released, **Then** it is
   refused — the bar goes pale and snaps back (AC-22, FR-6.9).
3. **Given** a forecast date after the client deadline, **When** Deadlines renders, **Then**
   the row flags late and the bar is red — **no replot list**, which went with BR-6 (AC-18).
4. **Given** an unfinished card whose forecast finish has passed, **When** the day rolls over,
   **Then** it moves forward one working day, the Sprint Schedules bar translates whole, and
   no marker appears (AC-21, FR-6.13).
5. **Given** a week expanded to its Mon–Fri days, **When** a milestone is dragged,
   **Then** the day columns still sum to the weekly capacity and holidays take zero
   (AC-28, FR-12.4 — locally added, and whether v3.0 §6.2 keeps day capacity is OPEN).

⚠️ **Conflict detection (BR-6), the replot list (FR-6.5) and acknowledgement (FR-6.7, FR-6.8,
BR-9a) are WITHDRAWN**, and the acknowledgement implementation was **deleted** 2026-09-07, not
parked. AC-17 goes with them. Deadlines counts rather than flags: `N Pending · N Urgent ·
N Done` per week, `N Pending · N Done` per day. **Card-level indicators — the red bar, the
late flag — are never suppressed by anything** (constitution invariant 13).

---

### User Story 4 - Forecast (Priority: P4)

Every date the team sees is computed from measured delivery data — `finish = WORKDAY(start,
lead + design)`, design time from the ARES-derived grid, at a selectable confidence per work
card. **There is no Forecast tab**: the forecast surfaces as the Sprint Schedules bar, the
Pipeline dates and the Deadlines placement. **Review time is retired** (BR-1b) — a work card
is done when it is done internally, and client review is not part of its duration.

**Why this priority**: The defensible forecast is the headline business case, but it is
gated: no refreshed model reaches users until it produces dates the PM recognises (release
gate, constitution invariant 7; BR-3).

**Independent Test**: With a computed grid, verify the dates on all three surfaces match the
measurements for the same inputs (AC-11).

**Acceptance Scenarios**:

1. **Given** a computed empirical grid, **When** any surface renders a date, **Then** it
   matches the ARES-derived measurement for the same inputs (AC-11).
2. **Given** any user-facing view, **When** dates are shown, **Then** only the empirical model
   is offered — the spreadsheet formula is never exposed (FR-7.2, BR-2, invariant 6).
3. **Given** a confidence level chosen on a row, **When** it changes, **Then** the finish
   moves with the measured distribution for that card. *The control is specced (§5.1d) and
   unbuilt; its arithmetic is held by product.*

⚠️ **Retired with review time:** `Sketch Approved` as a computed date, the review percentile
table, the review term in total cycle time, **FR-7.5** (SLA override) and **AC-12**. Also
retired: **FR-7.7**, the model-constants view — no user asked for the grid, and AC-11's
provenance clause went with it.

---

### User Story 5 - Requests mirror (Priority: P5)

A Frost user opens Requests and sees a read-only mirror of the project's intake sheet tab — eleven columns: MC #, Year, Month, Deliverable, Type, **UNIT** (the renamed *Use Case*), Requestor, Deadline, Brief, Status, Frost notes — plus a link to the source row, with status derived from the Trello join (*In Pipeline* / *For Filing*). Pre-allocated MC rows are skipped silently and counted; unparseable rows are surfaced with row number, reason and a link.

**Why this priority**: Completes the picture (intent vs execution) but reads an independent source; the register stands without it.

**Independent Test**: Run the sheet sync against current data and verify counts (AC-6), the deadline join (AC-8), and inactive marking on row deletion (AC-9).

**Acceptance Scenarios**:

1. **Given** the current intake sheet, **When** sync runs, **Then** 495 rows import, 495 are reserved, 8 are rejected (AC-6).
2. **Given** the deadline join on MC number, **When** Pipeline renders, **Then** deadline coverage rises from ~1/269 to ~169/269 (AC-8).
3. **Given** a row deleted in the sheet, **When** the next sync runs, **Then** the request is marked inactive with history intact — never deleted (AC-9, FR-8.4).
4. **Given** a request with only a remark, **When** viewed, **Then** status is unchanged; **Given**
   the clarification flag set with a reason, **Then** status is **still** unchanged and the FOR
   CLARIFICATION tile counts and filters it (AC-27, FR-3.7–FR-3.9). ⚠️ **GAP 1** — v3.0's FR-3.3
   calls *For Clarification* a status value; the built model keeps STATUS two-valued and puts the
   flag on the note (owls #34/#35; asked again in #81).

---

### User Story 6 - Urgency (Priority: P6)

The PM marks a deliverable urgent in Pipeline. Sirius adds an `Urgent` label to the Trello card so designers working the board see it. Removing urgency removes the label. A failed write rolls the local change back — Sirius never shows a state Trello lacks.

**Why this priority**: The write paths are deliberately last, each with its own review and rollback semantics. ⚠️ **Urgency is no longer the only one.** The registry now enumerates **four** — the `Urgent` label, the card due date (W2, FR-9), the `Difficulty: …` label (W3, FR-4.9) and the business-unit tag (W4, FR-4.11, built but inert). A fifth requires a BRD amendment (FR-4.10), and the constitution treats growing the registry as an amendment, never a code change.

**Independent Test**: Toggle urgency against a duplicate board; verify label add/remove, audit records, and rollback on a forced failure (FR-4.6, FR-4.7).

**Acceptance Scenarios**:

1. **Given** a non-urgent **work card**, **When** the PM marks it urgent, **Then** the Trello card
   gains the `Urgent` label; absence means non-urgent — no second state to sync, and no
   `Non-Urgent` label exists (FR-4.6). ⚠️ **The control targets the WORK CARD, never the parent** —
   a parent row offers none, and reads em-dashes instead (AC-26).
2. **Given** a Trello write failure, **When** the write fails, **Then** the local change rolls back and the failure is recorded (FR-4.7).

---

### User Story 7 - Multi-project (Priority: P7)

A Frost user switches project and every view scopes to it — no data bleeds between projects. Where one Trello board serves several projects, a Trello label disambiguates. Project settings (sources, capacity, sprint list) are edited in the platform, not in code.

**Why this priority**: Structural from the first migration (every table carries `project_id`), but exercised as a journey only once views exist.

**Independent Test**: Two seeded projects, one shared board with labels; switch projects and verify scoping (AC-3, AC-4, AC-5).

**Acceptance Scenarios**:

1. **Given** a session scoped to one project, **When** it calls an API for another project, **Then** 403 (AC-3).
2. **Given** two projects, **When** the user switches, **Then** all views swap with no data bleed (AC-4).
3. **Given** a board serving 3 projects, **When** a labelled project syncs, **Then** only cards carrying that project's label appear (AC-5).

---

### Edge Cases

- MC number carries many deliverables — 15 do today; MC-825 carries 99. `mc_number` is never treated as unique; identity is (project, Trello card).
- Work card titles do not name their parent deliverable (1 of 27 matched) — tasks attach to the MC group; no task→deliverable edge is modelled.
- A work card with neither Trello due date nor sheet deadline has no deadline, so nothing can read late against it (BR-9). *Conflicts themselves are withdrawn — BR-6.*
- A slotted week covered by no sprint appears under *Outside any sprint* — never forced into a neighbour (BR-5).
- The backlog's own hard share exceeds the ceiling: the ceiling is reported as unreachable, never enforced by refusing work (BR-7a — still live, and **not** dependent on the withdrawn Suggest plan).
- Sync service unavailable: last good data remains visible, error surfaced, app usable (AC-19, FR-8.5).
- Sheet un-shared from the reader: access fails safely; re-sharing restores (AC-7).
- Non-Frost account or Frost account off the allow-list: denied with a clear reason (AC-1, AC-2).
- Any registry write fails mid-flight: the local state rolls back, so Sirius never shows a state Trello lacks (FR-4.7, invariant 8).
- A business unit with no matching board label is tagged: refused and surfaced, and **no label is created** (AC-24, FR-4.11).
- A Trello lane appears that the name table does not know: surfaced and logged, never silently assigned a state (AC-25, BR-10).
- Trello list names resolve to a lane state via a static table (`LIST_STATES` in `src/services/status-rules.ts`) → pending | ongoing | done | excluded, exact match after normalisation, with Ready-for / family-stage / Backlog rules for the prefixed Ongoing lanes and unknown names defaulting to ongoing and logged per sync (spec v1.3 §7a, owl #82, 2026-09-08) (BR-10).
- A multi-deliverable MC (MC-655 × 3) carries **one** note — it attaches to the request row, not to each deliverable (FR-3.7, FR-3.8).
- A deliverable whose MC group has no work cards weighs exactly 1 (BR-6c); the 20 unkeyed cards belong to no group and weigh into none.
- A week whose Mon–Fri are all holidays: every day takes zero capacity and rejects drops; the week's cards still render (FR-12.4, locally held — whether v3.0 §6.2 keeps day capacity is OPEN with product).

## Requirements *(mandatory)*

### Functional Requirements

IDs and text are the BRD's, preserved verbatim. Priority M = must, S = should.

#### FR-1 — Projects

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | A project registry holds name, client, status, Trello board id, Trello label, intake sheet, sync endpoint, capacity and its own sprint list | M |
| FR-1.2 | Users switch project; all views scope to it | M |
| FR-1.3 | Where a board serves several projects, a Trello label disambiguates — 5 of 26 boards do this | M |
| FR-1.4 | Every table carries `project_id`; every query filters on it | M |
| FR-1.5 | Project settings are edited in the platform, not in code | S |

#### FR-2 — Authentication

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Google SSO only; no local passwords | M |
| FR-2.2 | Access restricted to verified `hd` claim = `frostdesigngroup.com` **and** matching email domain | M |
| FR-2.3 | Verification is server-side against a session, never in the browser | M |
| FR-2.4 | A named allow-list on top of the domain check | M |
| FR-2.5 | Deactivating a Workspace account revokes access with no manual step | M |
| FR-2.6 | All state changes written to an immutable audit log | M |

#### FR-3 — Requests (read-only)

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Mirror the project's intake tab; no editing, no write-back | M |
| FR-3.2 | Eleven columns: MC #, Year, Month, Deliverable, Type, **UNIT**, Requestor, Deadline, Brief, Status, Frost notes — plus a link to the source row. **`UNIT` is the renamed `Use Case`**, sourced from the sheet's `Business Unit` column; the sheet's name lives in the parser, not on screen | M |
| FR-3.3 | Derive status, never store it. **Three values:** *In Pipeline* (MC # found in Trello — this **is** the filed state) · *For Filing* (MC # absent) · *For Clarification* (the Sirius-only flag). `Filed` is not a value. **A clarified row is both For Filing AND For Clarification**, so status counts sum past the row count by design | M |
| FR-3.4 | Skip pre-allocated MC rows silently and report the count | M |
| FR-3.5 | Surface unparseable rows with row number, reason and a link | M |
| FR-3.6 | One filter panel, **six axes** — `YEAR · MONTH · TYPE · UNIT · REQUESTOR · STATUS` — multi-select, per-value counts. Every axis must appear verbatim as a column header. Default sort *Recently requested*. ⚠️ **Tiles do not filter** (retired 10 Sep); the Filter button is the only filter door | M |
| FR-3.7 | Frost can flag a request as **needs clarification**, with a reason, blocking it from filing | M |
| FR-3.8 | Frost can add an internal **remark** to any request | M |
| FR-3.9 | Neither is written back to the intake sheet | M |
| FR-3.10 | Both are shared across the team and durable across sessions | M |

#### FR-4 — Pipeline

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | **Ten columns:** MC #, Card name, Type, Urgency, Difficulty, Status, Deadline, Started, Done, Links. ⚠️ **`REQUESTOR` was removed** from this table and its filter — the axis left with its column. **Urgency, difficulty and deadline live on the WORK CARD**; a parent row draws an em-dash in all three | M |
| FR-4.2 | Expand to reveal the MC group's work cards | M |
| FR-4.3 | Trello-sourced fields are read-only | M |
| ~~FR-4.4~~ | ~~Cards missing difficulty, deadline or Figma link are listed for correction~~ — **WITHDRAWN.** Ruled by Miles: Pipeline draws nothing to mark a card as incomplete. No amber accent, no alert icon, no hover card. **Do not reintroduce it as a smaller warning** — the smaller warning *was* the reduced version, replacing a full-row wash that lit 247 of 249 rows. An absent value shows as an em-dash, everywhere | — |
| FR-4.5 | Cycle time derived from Trello activity timestamps, not date fields | M |
| FR-4.6 | Urgency is set from a Pipeline row and written to Trello as an `Urgent` label; absence means non-urgent. ⚠️ **It targets the WORK CARD, never the parent** — a parent row carries no control | M |
| FR-4.7 | A failed write rolls the local change back, so Sirius never shows a state Trello lacks | M |
| FR-4.8 | ⚠️ **The deadline is READ-ONLY here — plain text, not a control.** It is set on work cards in **Sprint Schedules** and nowhere else. No border, no fill, no calendar icon, no hover affordance: a cell carrying the grammar of a date picker invites the click the rule exists to prevent. Empty renders as an em-dash. **The W2 write itself now originates on Sprint Schedules** | M |
| FR-4.9 | Difficulty is set from a Pipeline row and written to Trello by swapping the card's `Difficulty: …` label — added before the stale one is removed, so the card is never left without a difficulty. ⚠️ **Targets the WORK CARD** | M |
| FR-4.10 | These four are the complete set of writes; a fifth requires a BRD amendment | M |
| FR-4.11 | **Classification tagging (W4).** **Business unit only** — the `UNIT` field — is written back to Trello by assigning and unassigning labels from a named set that already exists on the board. Matching is exact after normalisation; an unmatched value is surfaced, never fuzzy-matched. **Sirius never creates a label** — a tag with no matching board label is refused and surfaced, never resolved by creating one | M |

#### FR-5 — Sprint Schedules

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Fixed list pane plus scrolling gantt, grouped by sprint | M |
| FR-5.2 | **One bar per row.** The scheduled unit is the **work card**, not the deliverable — sketch and render are **separate rows**, each a task with a start and a forecasted finish. ⚠️ **Bar colour encodes URGENCY, not phase** — urgent amber-600, non-urgent slate-400. The sketch-amber / render-blue convention is **retired**: the row already says which it is. The client deadline is a 2px red vertical rule. **No review segment, and review is not computed at all** — retired, BR-1b | M |
| FR-5.3 | A **bar** ending past its deadline renders red; the row flags late. *("Segment" belonged to the retired two-phase row — sketch and render are separate rows now)* | M |
| FR-5.4 | ⚠️ **Placement is WEEK GRAIN and click-to-place.** The PM clicks a week; the bar starts on that week's first working day. **No day-precise placement and no day-drag on this tab** — the day belongs to the design lead, in Deadlines alone (BR-9b). The start day is shown here **read-only**. A card may still be moved to a different **week** | M |
| FR-5.5 | Multi-select by checkbox, shift-range or whole sprint | M |
| FR-5.6 | A multi-row move applies a relative **week** shift, preserving spacing. *Not yet built* | M |
| ~~FR-5.7~~ | ~~**Suggest plan** proposes slots from empirical throughput~~ — **WITHDRAWN, see below** | — |
| ~~FR-5.8~~ | ~~Suggestions preview as ghosts and apply only on explicit accept~~ — **WITHDRAWN** | — |
| FR-5.9 | Rows can be pinned | **see below — pinning now protects against nothing** |
| FR-5.10 | Throughput setting selectable: conservative / typical / stretch | S |
| FR-5.11 | Trello status may be overridden with a note, visibly marked manual and reversible | M |
| FR-5.12 | Duplicate a row without inheriting its Trello or Figma links | M |
| FR-5.13 | Per-week weighted load and Hard mix against capacity | S |
| FR-5.14 | Sprints are added, renamed, re-dated, reordered and deleted in the platform | M |
| FR-5.15 | Overlapping sprints blocked on save; gaps allowed and surfaced | M |
| FR-5.16 | Weekly capacity is set in cards per week, bounded by the project's ARES reference weeks | M |
| FR-5.17 | The weekly footer shows cards against capacity and the Hard share | S |

**Suggest plan withdrawn.** FR-5.7 and FR-5.8 are withdrawn, along with BR-7, AC-15 and AC-16.
Miles's reasoning: removed for now to observe how the tool is actually used, and if a smart
suggest proves warranted it will be rebuilt in a different form. Read the absence as a decision,
not an oversight — do not restore it from this document.

Two consequences that are **not** withdrawals:

- **`planner.ts` stays.** `weekLoad()` and the WEIGHTS / HARD\_MIX constants remain
  load-bearing for week capacity and the hard-mix ceiling. Only `suggestPlan()` goes dormant,
  kept rather than deleted because the feature may return.
  ⚠️ **`cardWeight()`'s `1 + tasks ÷ deliverables` (BR-6c) must NOT be applied on Sprint
  Schedules or Deadlines.** It existed only because a deliverable row had to absorb the weight of
  tasks with no row of their own. **Work cards have rows now, so each row weighs 1** and the
  footer counts them directly: `N / 120 Work Cards`.
- **FR-5.10 stays.** The throughput setting was bundled with smart plan in roadmap 3.4, but it
  drives displayed capacity independently — the gantt footer reads `Capacity: 120 (Typical)`.

**FR-5.9 is orphaned and needs a decision.** Pinning exists so that suggestions cannot move a
row. With no suggester, a pin now protects against nothing. Either give it a second purpose or
withdraw it — leaving it is a control that does nothing, which is worse than either.

#### FR-6 — Deadlines

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | Read-only and **downstream of Sprint Schedules**. The unit is the **work card**; sketch and render appear as separate cards | M |
| FR-6.2 | A prev/next **month** navigator with a label — not a date-range picker | M |
| FR-6.3 | ⚠️ **DOUBLY OPT-IN.** A card appears only if it was **added to Sprint Schedules AND plotted**. On the board but not added → absent. Added but not plotted → absent. **Neither is a gap, a sync failure or a bug** — do not reconcile against the board, and do not warn about unscheduled work | M |
| ~~FR-6.4~~ | ~~Conflicts detected per BR-6~~ — **WITHDRAWN.** See BR-6 | — |
| ~~FR-6.5~~ | ~~A replot list~~ — **WITHDRAWN** | — |
| FR-6.6 | Trello and Figma links on each card | M |
| ~~FR-6.7~~ | ~~Conflicts may be acknowledged~~ — **WITHDRAWN, and the server half DELETED** 2026-09-07, not parked | — |
| ~~FR-6.8~~ | ~~Acknowledged conflicts counted and restorable~~ — **WITHDRAWN** | — |
| FR-6.9 | ⚠️ **The day-drag lives here and ONLY here.** The design lead moves a card between days; a valid drop day satisfies four conditions at once — **inside the card's assigned week** · inside the sprint's dates · no later than the deadline · a working day | M |
| FR-6.10 | **A card sits on its START day**, not its forecast finish. Day placement never changes the assigned week | M |
| FR-6.11 | Placement is shared and durable across sessions and users | M |
| FR-6.12 | Counts per week `N Pending · N Urgent · N Done`, per day `N Pending · N Done`. **Pending and Done do not sum to the total** — an ongoing card is in neither. **Urgent is a cross-cutting subset**, never added to the other two | M |
| FR-6.13 | **Rollover.** An unfinished card moves forward one working day once its forecast finish has **passed** and it is **not in a Done lane**. It crosses week and sprint boundaries, membership follows the card, and the Sprint Schedules bar **translates whole**. **No marker records that it moved** | M |
| FR-6.14 | **No search and no filters.** Navigation is the month control and scrolling. A completed card renders at `opacity: 0.4` | M |

#### FR-7 — Forecast engine

**The Forecast tab was withdrawn.** The model remains as an internal engine with no screen of
its own, supplying projected dates, week capacity and day capacity to Pipeline, Sprint
Schedules and Deadlines. Requirement IDs are left unrenumbered so existing references hold.

| ID | Requirement | Priority |
|---|---|---|
| FR-7.2 | A single forecast, from measured delivery. The ported spreadsheet formula is retained in code for migration tests but is not exposed | M |
| FR-7.3 | ⚠️ Design time keys on difficulty **and the WORK-TYPE LABEL — not the lane.** Corrected 2026-09-09 after a 17,986-card audit: the lane says where a card *sat*, a label says what the *work was*. Labels are shaped `Category: Specific`; 57 exist on real cards and 98.3% of finished work cards carry exactly one. A cell is work-type × difficulty, and there are 134 | M |
| FR-7.6 | The empirical grid recomputes on a schedule from a rolling window | M |

**Withdrawn with the tab.** FR-7.1 — column names matching the Delivery Forecast sheet.

**All three are now settled** — this section previously asked where each should go:

| ID | Control | Question |
|---|---|---|
| ~~FR-7.4~~ | ~~Confidence, selectable per card~~ | ✅ **REHOMED, not orphaned.** It is a per-row select on **Sprint Schedules** — 70th / 85th / 95th — choosing from the measured design-time distribution for that card's difficulty and work type. This table listed it as an open question after it had been answered |
| ~~FR-7.5~~ | ~~Review SLA override~~ | **RETIRED** — review time is withdrawn (BR-1b). Nothing left to override. |
| ~~FR-7.7~~ | ~~Model constants and sample sizes visible to users~~ | **RETIRED** — no user asked for the grid. The team needs the bar and the confidence selector, both of which exist on Sprint Schedules. |

#### FR-8 — Ingestion

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | Trello data read from ARES, not from Trello directly | M |
| FR-8.2 | Intake sheet read server-side via service account, `spreadsheets.readonly` | M |
| FR-8.3 | Sheet sharing stays Restricted; the service account is a named Viewer | M |
| FR-8.4 | Sheet rows that vanish are marked inactive, never deleted | M |
| FR-8.5 | Sync failures are logged and alerted; last good data remains visible | M |
| FR-8.6 | Sync status and last-success time visible in the UI | S |


> **Engineering notes on the block above** — where the built system and v3.0 do not describe
> each other. None of these is a licence to ignore the BRD; each is a question already with
> product, and the build follows the reading named here until it is answered.
>
> ⚠️ **GAP 1 — FR-3.3's status values** (asked in owl #81, 2026-09-12). Its first sentence
> makes *For Clarification* a third STATUS value; its third sentence makes it a flag a
> *For Filing* row also carries. Sirius shipped the second reading on product's own #34/#35
> ruling (2026-08-17): **STATUS is two-valued** — *In Pipeline* / *For Filing* — derived from
> the Trello join alone, with the clarification flag living on the note and surfacing in the
> Remarks cell. Named locally as FR-11.3 / FR-11.4 until the reword lands.
>
> ⚠️ **GAP 2 — FR-7.3's forecast axis** (asked in owl #74, 2026-09-11). v3.0 keys design time
> on the **work-type label**; Sirius keys it on **lane and difficulty**, the lane folded from
> the card's label family, reading ARES's pooled per-lane table. The reason is sample depth:
> most single work types are too thin on the live board. Unanswered.
>
> **FR-3.6's "tiles do not filter" does not hold on Requests.** JP ruled 2026-09-12 that the
> Requests tiles keep filtering **and** keep their unfiltered server counts, because tiles
> that filter *and* rescope feed back on themselves. Pipeline's four tiles do not filter and
> do rescope — that half is built as v3.0 states it.
>
> **FR-4.11 (W4) is built but INERT** — no route, no caller, `unit_label` outside
> `registryFields()`. Its surface (which tab, which card kind) and the actor of an
> ingestion-triggered tag are UNRULED, and constitution invariant 2 forbids a write until
> they are.
>
> **FR-5.9's pinning protects against nothing** now that Suggest plan is withdrawn; the flag
> and its audit row remain, unused by any planner.

#### FR-9 — Two-way sync *(added 2026-08-04, JP-directed; **the BRD amendment landed** — v3.0 §9 and FR-4.10 enumerate four writes, so this section is now engineering detail beneath them, not a pending exception)*

| ID | Requirement | Priority |
|---|---|---|
| FR-9.1 | The deliverable deadline is editable in Sirius; the edit writes the Trello card due date (write registry W2), including clearing it | M |
| FR-9.2 | Every Trello write comes from the enumerated write registry (`contracts/trello-write.md`); registry growth requires a constitution amendment | M |
| FR-9.3 | Every write is optimistic with rollback and logs `audit_log` + `sync_runs` per attempt (extends FR-4.7 beyond urgency) | M |
| FR-9.4 | Sirius accepts signed push notifications from ARES and re-reads the affected card from the ARES read API — the push is a trigger, never a data carrier (`contracts/ares-push.md`) | M |
| FR-9.5 | Trello-owned fields — including the `Urgent` label and due date — reconcile from ARES reads, so manual Trello changes surface in Sirius; Sirius-owned planning fields are never touched by sync | M |
| FR-9.6 | Push failure degrades to polling with an alert; the poll remains the reconcile fallback — no data loss on a dead push channel | M |

#### FR-10 — Admin panel *(added 2026-08-05, JP-directed change — user-access management UI)*

| ID | Requirement | Priority |
|---|---|---|
| FR-10.1 | An **Admin** tab, visible only to admins, lists every account: email, name, active state, admin flag, last sign-in, project memberships | M |
| FR-10.2 | Admins add a person — email (must be `@frostdesigngroup.com`, hard-validated), name, and project memberships chosen from existing projects | M |
| FR-10.3 | Admins deactivate/reactivate accounts; deactivation revokes live sessions on the next request (existing per-request allow-list re-check) | M |
| FR-10.4 | Admins grant/revoke project memberships per account | M |
| FR-10.5 | Server-side enforcement: every admin route requires session + active allow-list row + admin flag (`ensureAdmin`); hiding the tab is not access control | M |
| FR-10.6 | The last active admin cannot be deactivated — no self-lockout | M |
| FR-10.7 | Every action writes `audit_log`: `user.added`, `user.deactivated`, `user.reactivated`, `memberships.set` (invariant 10) | M |
| FR-10.8 | Scope bounds: no hard deletes (deactivate only) · no email notifications · admin promote/demote is CLI-only (`scripts/allowlist.ts ADMIN=1`) — the panel manages members, not admins | M |

*Clarified 2026-08-05 (JP): admin flag model (first admin: JP) · core actions only (no role management in UI) · new tab beside the five · built immediately so the WCAG pass covers it. The four sign-in checks are untouched — admin is authorization layered after them; no constitution amendment required.*

#### FR-11 — Frost notes *(added 2026-08-12, JP-directed; **FOLDED into BRD v3.0's numbering 2026-09-12** — JP)*

BRD v3.0 carries these rules as **FR-3.7–FR-3.10**, so product's numbers are the names
from here on. What follows is the map, not a second statement of the rules — read the BRD
for anything marked *folded*.

| was | is | note |
|---|---|---|
| FR-11.1 | **FR-3.7 + FR-3.8** | one rule here, two there: the clarification flag with its required reason (3.7) and the internal remark (3.8). Still one stored note keyed `(project_id, mc_number)` |
| FR-11.2 | **FR-3.9** | never written to the intake sheet. The `spreadsheets.readonly` scope is what enforces it — an engineering fact v3.0 does not state and this spec keeps |
| FR-11.3 | ⚠️ **HELD — not folded** | v3.0's FR-3.3 still calls *For Clarification* a STATUS value. Sirius shipped a **two-valued** STATUS (owls #34/#35, 2026-08-17): the flag is a property of the NOTE and surfaces in the Remarks cell. v3.0's own sentence that a clarified row is "both For Filing AND For Clarification" is the cross-cutting reading we built. **Wording question for product; until it lands, `FR-11.3` stays the name in code and tests** |
| FR-11.4 | ⚠️ **HELD — not folded** | same question: a remark alone never changes status, and neither does the flag. Named in AC-27 |
| FR-11.5 | **stays local** | the FOR CLARIFICATION tile that counts and filters. No counterpart in v3.0, and JP ruled 2026-09-12 that the Requests tiles keep filtering |
| FR-11.6 | **stays local** | inline editing, optimistic with rollback, every change audited (invariant 10). v3.0's FR-3.10 covers only "shared and durable" |
| FR-11.7 | **stays local** | routes under `/api/projects/:projectId/…` behind session + membership (NFR-6). Engineering detail; the build spec's bare path is wrong |

#### FR-12 — Deadlines daily plotting *(added 2026-08-12, JP-directed; **FOLDED into BRD v3.0's numbering 2026-09-12** — JP)*

BRD v3.0 carries the day rules as **FR-6.9–FR-6.14**, rewritten for the work-card unit.

| was | is | note |
|---|---|---|
| FR-12.1 | **stays local** | the week header expanding to a Mon–Fri grid, one week open at a time. v3.0's §6 assumes a day grid without specifying how it opens; the built mechanism is this one |
| FR-12.2 | **FR-6.9** | the day drag, now with four drop conditions at once — inside the assigned week, inside the sprint, on or before the deadline, a working day |
| FR-12.3 | **FR-6.10** | day placement never changes the week. ⚠️ The KEY changed with the unit: `(project_id, deliverable, phase)` became the work card's own start day, per the swept engineering doc |
| FR-12.4 | ⚠️ **stays local, and is OPEN** | day capacity by largest remainder. v3.0 has no equivalent, and whether §6.2's day-capacity paragraph survives at all is a live question with product |
| FR-12.5 | **stays local** | optimistic with rollback and audited. v3.0 does not state it; invariant 10 does |
| FR-12.6 | **stays local** | a week change lapses the day placement back to the forecast default. v3.0's nearest rule is FR-6.13 rollover, which is a different mechanism — do not treat one as the other. Named in AC-29 |

**What this fold does NOT do.** FR-9 (two-way sync) and FR-10 (the admin screen) keep their
local numbers: v3.0 spreads the write rules across FR-4.5–FR-4.11 and §9 rather than giving
them one id, and it has no admin-screen requirement at all.

### Business Rules

Preserved verbatim from BRD v3.0 §7.

**BR-1 — Forecast arithmetic.** `Finish = WORKDAY(start, lead + design)`, per work card, at the
selected confidence percentile. The start is the PM's placement; the finish is computed.

~~`Sketch Approved = WORKDAY(sketch delivery, review)`~~ · ~~render begins the **Friday of the
sketch-approval week**~~ · ~~`Total Cycle Time = 1.28 × forecast review time + 2.96`~~ —
**all withdrawn with review time, see BR-1b.**

**BR-1b — Review time is retired.** Ruled by Miles: Sirius schedules **work cards**, and a work
card is done and closed internally. Client review is not part of its duration — it is something
that happens to a deliverable afterwards, and nothing Sirius forecasts depends on it.

Withdrawn with it: `Sketch Approved` as a computed date, the review percentile table, the review
term in Total Cycle Time, **FR-7.5** (the review SLA override) and **AC-12**. Do not rehome
FR-7.5 — an override with nothing to override is not homeless, it is finished.

---
**The confidence percentile now applies to design time only.** Where a percentile is selected on
a Sprint Schedules row, it selects from the measured design-time distribution for that card's
difficulty and **work-type label** — ⚠️ *not lane; see BR-4.* There is no second percentile.

**BR-3 becomes historical.** Its finding — that the spreadsheet overstated *review* waits by
2.6–4.6× — was the reason the measured model replaced the workbook. With review out of the
arithmetic the finding no longer governs any live calculation. Keep the record; it explains why
the spreadsheet was retired, and why its numbers must not be reintroduced.

⚠️ **One consequence to watch.** Client-review lanes still exist on the board and are classified
**ongoing** in the lane mapping (§7a of the build spec). An ongoing card rolls forward daily. So
a card sitting in *Sent for Client Review* will walk forward through the schedule for as long as
the client holds it — a wait the team does not control, moving a bar the PM placed. Review is out
of the forecast but not out of the board, and rollover does not know the difference.

**BR-1a — The render-start clause no longer governs placement.** In Sprint Schedules the PM plots
every work card by hand, render exactly as sketch. There is no cascade: a render row is not
created, positioned or suggested when its sketch is forecast to finish. BR-1 still supplies each
bar's right-hand end — `finish = WORKDAY(start, lead + design)` — but the *start* is the PM's
click, not a derivation. Miles's reasoning: the PM should hold that control.

⚠️ **Resolved, and this paragraph previously said otherwise.** It read that *"review is still
computed"* and asked what still consumed it — a question **BR-1b answered by retiring review
entirely.** Nothing computes it, nothing reads it, and `Sketch Approved` is gone rather than
orphaned. The two paragraphs contradicted each other inside one document.

**BR-2 — The forecast is empirical, and it is the only one.** Design time from measured working-lane dwell, keyed on difficulty **and the work-type label** — ⚠️ *not the lane; see FR-7.3 and BR-4.* Percentiles at Average / 70 / 85 / 95, selected per work card. ~~Review time from measured dwell in *Sent for Client Review* lanes~~ — withdrawn, see BR-1b. The spreadsheet model is not offered as an alternative — it was found to overstate review waits by 2.6–4.6× (BR-3), so presenting it beside measured data would invite use of a number known to be wrong. It survives in code purely so tests can prove the port was faithful before the workbook is retired.

**BR-3 — The spreadsheet model was wrong and HAS been rebuilt.** ✅ *Done; the gate passed and the PM accepted the model. This rule previously read "must be rebuilt … a prerequisite for release" and is kept as the record of why.* Measured client review wait across 1,184 completed cycles: median 2.68 d, p70 4.80 d. The workbook uses 12.5 d (Medium) and 22 d (Hard) at p70 — **2.6× to 4.6× too high**. This is why every card in early prototypes rendered as late.

**BR-4 — Difficulty must be paired with the WORK-TYPE LABEL.** ⚠️ **Corrected 2026-09-09**; this rule previously said *lane*, and lane was the wrong axis.

**The lane says where a card sat; a label says what the work was.** A card in the Design group might be a screen cascade, a refinement or QA, and those take very different times. The nature of work lives in labels shaped `Category: Specific` — `Design: Screen Cascade`, `Asset: Illustration`.

**Difficulty alone remains invalid**, for the reason originally recorded: in aggregate Easy appears slower than Medium purely from mix. Easy/assets is 13.88 days at p70 against Easy/design at 0.94.

⚠️ **Never classify on the card TITLE.** The old lane matcher hit `asset|illustrat|render|icon`, and every task prefix on this board (`Sketch Asset`, `Render Asset`, `Icon Clean Up`) matched it — picking a 13.88-day cell where a 0.94-day one belonged. **Fourteen times the duration, decided by a naming convention.**

⚠️ **Figures quoted before 2026-09-09 are suspect.** ARES was asking Trello for list moves without a limit, so Trello silently returned only the **50 most recent** — and the cards that churn most are the slow ones, so **the slowest work was recorded as fast**. 26.3% of finished work cards measured under one hour. Fixed. Every Content and Motion cell now carries a **borrowed** figure rather than a measurement; those are placeholders, not numbers to defend to a client.

**BR-5 — Sprints are data, not a cadence.** Each project holds an editable list of sprints with explicit start and end dates. Length varies with client alignment, holidays and scope. ⚠️ **A WORK CARD** — not a deliverable — belongs to whichever sprint contains its slotted week; weeks covered by no sprint appear under *Outside any sprint* rather than being forced into a neighbour. Overlapping sprints are rejected on save — a week cannot belong to two. Gaps are permitted and surfaced. Reordering preserves each sprint's length and re-flows the calendar from the set's earliest start.

⚠️ **Membership is STORED, not derived.** Rollover moves cards across sprint boundaries (FR-6.13), so membership must follow the card rather than be recomputed from a week.

⚠️ **Re-dating a sprint displaces cards to *Outside any sprint*, keeping their day.** Ruled 2026-09-10. They are **not** pushed into the next sprint — that can start a card **after its own deadline**, which the UI refuses, and it would silently discard the design lead's day. **There is no no-next-sprint case**, so a date edit never destroys a schedule. Sprint **deletion** does remove rows, audited and behind a confirmation naming the count; **a date edit must never be that destructive.**

**~~BR-6 — Conflict detection.~~ WITHDRAWN ENTIRELY.** Ruled by Miles: *"those are just noise."* Gone: the three per-week rules (urgent overlap, over capacity, past deadline), the badges, the banners, the replot list, and acknowledgement — **whose server half was deleted 2026-09-07, not parked.**

**A count replaced it** — `N Pending · N Urgent · N Done`. A count states the situation without asserting anything is wrong, and keeps discriminating when many weeks trip the same condition.

⚠️ **That last clause is the whole lesson.** The predecessor was a full-row amber wash on Pipeline that lit **247 of 249 rows** and therefore said nothing. **A warning that fires almost always is not a warning.** Do not reintroduce this as a smaller warning — the smaller warning *was* the reduced version.

**BR-6a — Capacity is cards per week, sourced from ARES.** Each project's capacity comes from
`steering.deliveryForecast.referenceWeeks` in ARES, which already models the least productive, typical and most
productive week by card count. The typical week is the default; least and most bound the control. For rt-837 that is
1 / 120 / 367 cards, with an `effectiveWeeklyRate` of 90.2. Sirius does not invent a capacity unit.

*Caveat:* those reference weeks count every card on the board, including ops cards. ⚠️ **Sirius now plans work cards, not deliverables**, so the unit is much closer than when this caveat was written — but ops cards are excluded from Sirius's own counts by identity (§7a of the build spec), so the two still differ. **Both the capacity figure and the hard-mix ceiling predate the work-card rework; if their denominator was deliverables, the thresholds do not mean what they meant.** Being confirmed with Engineering.

**BR-6b — Hard mix ceiling.** Card count alone cannot distinguish a week of 120 easy cards from 120 hard ones, so a
second axis applies. Difficulty weights (Easy 1, Medium 2, Hard 4) are used *only* for this test. Measured across 27
weeks on board `hLL7WW2V`: hard share median **8.3%** (ideal), p85 **12.9%** (ceiling), observed max 20.4%. Weeks above
the median ran a median cycle of **24.1 h against 19.4 h** — roughly 24% slower per card. A week over the ideal is
flagged amber, over the ceiling red.

**BR-6c — Row weight converts rows to card-equivalents.** *(Added 2026-08-12 from build spec v1.1 §5.4; resolves the BR-6a caveat.)* A schedule row is a deliverable, but capacity (BR-6a) counts every card. Each row therefore weighs `1 + (its MC group's work cards ÷ the group's deliverables)`: MC-805, with 13 deliverables and 40 work cards, weighs 4.08 per row and 53 as a group; the verified board sums to **478 = 269 deliverables + 209 work cards** (the 20 unkeyed cards weigh into no group). The weight feeds the weekly footer, the over-capacity tint and the BR-6 *over capacity* conflict. It does **not** feed the hard-mix test (BR-6b keeps its own difficulty weights) and does **not** alter Suggest plan's validated placement arithmetic (`lib/planner.ts` counts rows, golden-locked — invariant 5). *Count basis confirmed by the product team 2026-08-12 (`docs/product/errata-reply-v1.2.md`): this weight applies everywhere, Deadlines included — their §6.1 "counts 3" was a documentation error, fixed in build spec v1.2. Their rationale, kept for the record: a deliverable is real work, not a container — 244 of 269 deliverables carry no task cards, so a work-cards-only basis would hide 90% of the board from capacity.*

⚠️ **BR-6c is ours, not v3.0's, and its SCOPE narrowed with the work-card rework.** v3.0
names it once — to forbid it: `cardWeight()`'s `1 + tasks ÷ deliverables` must NOT be
applied on Sprint Schedules or Deadlines. It existed only because a deliverable row had to
absorb the weight of work cards that had no row of their own. **Work cards have rows now, so
each row weighs 1** and the footer counts them directly — `N / 120 Work Cards`. The weight
survives where rows are still deliverables. Proven by AC-30.

**~~BR-7 — Smart plan.~~ WITHDRAWN** with FR-5.7 / FR-5.8. The ordering it defined — urgency, then deadline, then difficulty descending — has no consumer while there is no suggester. Retained here rather than deleted because the feature may return in another form, and the ordering was derived from measured behaviour rather than chosen: *order by urgency, then deadline, then difficulty descending; a week fills at the empirical throughput ceiling for its difficulty mix; blocked cards are not scheduled into the current week; pinned rows are immovable; nothing applies without explicit acceptance.*

**BR-7a — Unachievable mixes are reported, not refused.** Still live and **not** dependent on smart plan — it governs how the hard-mix ceiling is reported wherever capacity is shown, including the Sprint Schedules footer and the Deadlines view. Where the backlog's own hard share exceeds the ceiling, no
arrangement of weeks can satisfy it. The planner spreads hard work as evenly as possible, places everything, and states
plainly that the ceiling is unreachable. Refusing to schedule work would be worse than scheduling it with a warning.

**BR-8 — Multi-row move.** A drag applies the interval between the grabbed row's **week** and the drop week to every selected row, preserving spacing. *(Not yet built.)*

**BR-9 — Deadline precedence.** Trello due date wins where present; otherwise the intake sheet's; otherwise none. ⚠️ The old clause *"and the card cannot raise a deadline conflict"* is void — **there are no conflicts** (BR-6). A card without a deadline renders an **em-dash** and is not a fault; most sit that way for their whole planning life.

**~~BR-9a — Conflicts can be acknowledged.~~ WITHDRAWN, and the implementation DELETED** 2026-09-07 — not parked pending a design.

**There is nothing left to acknowledge.** The badges were replaced by a count, and a count does not assert that anything is wrong, so it never needs dismissing. Keeping dormant schema and endpoints would drag them through every migration and read to a future maintainer as a feature in flight.

*The dismissal key that was recorded here — `week + rule + the exact cards involved`, so a dismissal silences one situation rather than the rule — is worth remembering only if a per-week warning ever returns. Its design would differ anyway.*

**BR-9b — Daily placement, and it belongs to ONE role on ONE tab.** ⚠️ Rewritten 2026-09-10; the previous wording had the wrong default and the wrong owner.

**Two owners, one row.** The PM owns the **deadline** and the **week**; the design lead owns the **day**. In the PM's own words: *"sa akin yung red line, kay Don yung orange na bar."* **The week is locked to the PM** — the design lead works inside the week he was given.

⚠️ **The day is set in DEADLINES and nowhere else.** Sprint Schedules places at week grain and shows the resulting day **read-only**; the PM cannot move a card by a day on any surface. **A card placed into a week starts on that week's first working day** — not on its forecast delivery day, which is computed rather than chosen and would leave the lead arranging dates he cannot move.

⚠️ **The design lead's drag is BOUNDED by the assigned week**, and a valid drop day satisfies four conditions at once: inside that week · inside the sprint's dates · no later than the card's deadline · a working day.

**A card sits on its START day** — the day the team is slated to pick it up.

Placement is stored per project and card, shared across users, and durable across sessions. It never alters the assigned week or the forecast.

*Day capacity — the week's capacity split across non-holiday days by largest remainder, holidays taking none — is **recorded but has no surface**, the day planner it served having been retired. Whether it survives is open.*

**BR-3a — Frost notes.** A request may carry a clarification flag with a reason, and an internal remark. ⚠️ **The flag does not replace a status — it adds one.** A clarified row is **both *For Filing* AND *For Clarification*** (FR-3.3); the two are not mutually exclusive, so status counts sum past the row count by design. It is the team's record of why something cannot be filed. Neither field is ever written to the client's sheet — the sheet is theirs, and Sirius does not edit it. Both are stored per project and shared.

**BR-10 — Status classification. ⚠️ THE KEYWORD CLASSIFIER IS RETIRED.** This rule previously specified *"configurable keyword rules"*. **Do not build them.** Measured against real lane data they **misclassified 9 of 20** — `Ops Work Complete` counting as finished project work, `Passed QA` counting as nothing.

**Every lane resolves to one of four outcomes: Pending · Ongoing · Done · excluded.** Three are states a card is *in*; **excluded is a visibility filter, not a state.**

**Two different reasons to exclude, and they must not be merged.** Operations work is excluded **by identity** — ops cards carry perfectly good states, so state cannot exclude them. Three lanes are excluded because the source says they have **no equivalent status**.

⚠️ **`Production Backlog` sits inside the OPS group and is IN SCOPE**, as Pending. A blanket `group == OPS` rule is wrong: exclude the five *named* lanes.

**The source of truth is Apollo, read through the ARES lanes endpoint** — `GET /api/v1/trello/boards/:boardId/lanes` returns every list with its type and group, keyed by list ID so a rename does not break the mapping. **Neither side needs to maintain a second table of lane names.**

⚠️ **An unmapped lane must be SURFACED, never guessed at.** That is the one case a static table cannot cover, and it has to fail loudly rather than quietly picking a state.

*Why a keyword rule is tempting and still wrong: one does happen to hold across the current data, but it turns on single characters — `Released` is Done while `Ready for Release` is Ongoing, and `Pushed` matches `Pushed to Production` while `Production` would collide with `Production Backlog`. It holds by coincidence, not by structure.*

**Requests' status model is separate and unaffected** — see FR-3.3.


> **Engineering notes on the rules above.**
>
> ⚠️ **GAP 3 — BR-10's source of state** (asked in owl #74, 2026-09-11, unanswered). v3.0 and
> build spec §7a say the ARES lanes endpoint **supersedes** product's name table. JP ruled
> 2026-09-08 that the **name table stays the source of state** (pending · ongoing · done ·
> excluded) and the endpoint is read for two narrower things: naming a list we hold no rule
> for before a card sits in it, and Apollo's type and group. The endpoint cannot replace the
> table — it knows only "work" and "process", has no *waiting on client* and no *excluded*,
> and is a cache of the last manual sync. Built as JP ruled: `LIST_STATES` in
> `src/services/status-rules.ts`, exact match after normalisation, unknown names logged per
> sync.
>
> **BR-2 and BR-4 carry GAP 2** — see the engineering notes under the functional
> requirements. The rules are built on lane and difficulty, not on the work-type label.
>
> **BR-6c is ours, not the BRD's** *(added 2026-08-12 from build spec v1.1 §5.4)* — a
> scheduled row weighs `1 + tasks ÷ deliverables` in its MC group, converting rows to
> card-equivalents so weekly load can be compared with a capacity counted in cards. It
> resolves BR-6a's caveat and is proven by AC-30.
>
> **BR-3 is historical, not governing** (v3.0's own wording). It is why
> `lib/forecast.legacy.ts` exists and why it is never imported by UI code — constitution
> invariant 6.

### Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Page load, Pipeline and Sprint Schedules | < 2 s p95 at 5,000 cards |
| NFR-2 | Drag feedback | < 100 ms |
| NFR-3 | Trello change to Sirius | < 15 min (ARES cadence + sync) |
| NFR-4 | Availability, PHT business hours | 99.5% |
| NFR-5 | Credentials | Secrets manager; never in a client bundle |
| NFR-6 | Authorisation | Server-side on every endpoint |
| NFR-7 | Audit retention | 24 months |
| NFR-8 | Backups | Daily, 30-day, restore tested quarterly |
| NFR-9 | Accessibility | WCAG 2.1 AA, including a keyboard path for scheduling |
| NFR-10 | Timezone | Store UTC, render and compute Asia/Manila |
| NFR-11 | Logs | No brief text, no credentials |

NFR-9 is not optional decoration: drag-based scheduling requires an equivalent keyboard action for AA conformance.

NFR-3 amended 2026-08-04: with ARES push live (FR-9.4) the working target is **< 1 min**; the 15-minute ceiling stays as the poll-fallback guarantee (FR-9.6).

### Key Entities

- **Project**: A client engagement — name, client, status, its Trello board (and disambiguating label where the board is shared), its intake sheet, capacity in cards per week bounded by ARES reference weeks, and its own editable sprint list.
- **Sprint**: An editable named date range belonging to a project. Not a cadence. Overlaps rejected; gaps legal and surfaced.
- **Deliverable**: A Trello card carrying the `Main Card` label (269 on the verified board). Identity is (project, Trello card id) — `mc_number` is NOT unique, and MC-825 carries 99. ⚠️ **It is no longer the scheduled unit**: slotted week, pin, confidence, start day, deadline, sprint membership and urgency all live on the work card. A parent row offers no controls and reads em-dashes (AC-26).
- **Work card**: A production task (209 on the verified board), prefixed by verb (`Render Asset:`, `Cascade Mobile Screen:`, `Icon Clean Up:`). ⚠️ **THE SCHEDULED UNIT** — one bar per work card, sketch and render as separate rows. Attaches to the MC group, never to a single deliverable: no reliable task→deliverable edge exists (1 of 27 titles matched), and none is modelled.
- **Intake request**: One row of the project's intake sheet — MC #, name, requestor, type, use case, brief, deadline. Read-only mirror; vanished rows go inactive, never deleted.
- **Card event**: A single Trello lane movement with its timestamp — the raw material for cycle times and the empirical model.
- **Model grid / throughput grid**: Per-project percentiles (Average / 70 / 85 / 95) of **design** time keyed on difficulty × lane, and cards-per-week reference figures, read from ARES. ⚠️ **The review percentile table is retired with review time (BR-1b).** GAP 2: v3.0 keys design time on the work-type label; the build keys it on lane and difficulty, for sample depth — asked in owl #74.
- **Frost note**: A Sirius-owned annotation on an intake request — remark, clarification flag and reason — keyed (project, MC number); one per request, never written back to the sheet (FR-3.7–FR-3.10).
- **Milestone day placement**: A Mon–Fri day choice inside a card's assigned week; absent means follow the forecast; lapses when the week changes (FR-6.10, FR-12.6). ⚠️ **Re-keyed with the unit** — the swept engineering doc replaces the old `(deliverable, phase)` key with the work card's own start day.
- ~~**Conflict acknowledgement**~~: **DELETED 2026-09-07**, not parked — with BR-6, BR-9a, FR-6.7 and FR-6.8. Stored rows were archived by migration 011. Nothing acknowledges anything now: the badges became a count, and a count asserts nothing that needs dismissing (constitution invariant 13).
- **Audit log entry**: Immutable record of every state change — who, what, before, after, when.
- **Sync run**: One execution of an ingestion or write job — source, outcome, stats, error.

### Data sources and what each supplies

From BRD §4, verbatim — the measured coverage that justifies BR-9 and AC-8.

| Field | Source | Coverage today |
|---|---|---|
| MC number | Trello card title | 478 / 498 |
| Deliverable vs task | Trello `Main Card` label | reliable |
| Difficulty | Trello label `Difficulty: …` | 495 / 498 |
| Current list / stage | Trello list | complete |
| Blockers | Trello labels `🛑 On hold`, `🛑 For clarification`, `🛑 Has dependency` | in active use |
| Figma file | Trello card attachment | to verify |
| Cycle times | Trello card movements via ARES | 78,401 movements |
| **Deadline** | **Intake sheet** | **467 / 502** (Trello: 4 / 498) |
| Use case, brief, requestor | Intake sheet | 98% / 99% / 100% |
| Urgency | Set in Sirius on the WORK CARD, written to Trello as an `Urgent` label (W1) | 0 / 26 boards today — created on first use |
| Difficulty (written) | Set in Sirius, written as a `Difficulty: …` label swap (W3, FR-4.9) | label family already on every board |
| Deadline (written) | Set in Sirius on the work card, written as the Trello due date (W2, FR-9) | preserves precedence by construction (BR-9) |
| Business unit (written) | Assigned from an EXISTING board label only (W4, FR-4.11) | **built but inert** — surface and actor unruled |

**BR-note on deadlines.** An earlier draft required the team to start setting Trello due dates. Measurement showed the sheet already holds them at 93% coverage while Trello holds 0.8%. Sirius therefore reads deadlines from the sheet and joins on MC number, raising pipeline deadline coverage from 1/269 to 169/269 with no behaviour change. A Trello due date, where present, wins — it was set deliberately.

## Acceptance Criteria

Preserved verbatim from BRD §10. These define "done" for v1.

| # | Scenario | Expected |
|---|---|---|
| AC-1 | Non-Frost Google account signs in | Denied, with a clear reason |
| AC-2 | Frost account not on the allow-list | Denied |
| AC-3 | Session calls an API for another project | 403 |
| AC-4 | Switch project | All views swap; no data bleeds between projects |
| AC-5 | Board serving 3 projects | Only labelled cards appear |
| AC-6 | Sheet sync runs | 495 imported, 495 reserved, 8 rejected on current data |
| AC-7 | Un-share the sheet from the service account | 403; re-share restores |
| AC-8 | Deadline join | Pipeline coverage rises ~1/269 → ~169/269 |
| AC-9 | Row deleted in the sheet | Marked inactive, history intact |
| AC-10 | Golden test: ported spreadsheet formula vs the workbook | Identical dates for identical inputs — proves the port before retirement |
| AC-11 | Forecast dates wherever they surface — Pipeline, Sprint Schedules, Deadlines | Match the ARES-derived measurements for the same inputs. *Provenance clause dropped with FR-7.7* |
| ~~AC-12~~ | ~~Review SLA entered~~ | **RETIRED** with FR-7.5 and review time (BR-1b) |
| AC-13 | Move a row to another **week** | Dates, sprint group and load update. *Week grain — there is no day placement on this tab* |
| AC-14 | Multi-select **week** move | Relative spacing preserved. *Not yet built* |
| ~~AC-15~~ | ~~Suggest plan~~ | **WITHDRAWN with FR-5.7 / FR-5.8** |
| ~~AC-16~~ | ~~Pinned row + suggest~~ | **WITHDRAWN** — nothing left to test pinning against; see FR-5.9 |
| ~~AC-17~~ | ~~Two urgent milestones in a week~~ | **WITHDRAWN with BR-6.** Deadlines flags nothing; it counts |
| AC-18 | Forecast past deadline | Row late, **bar red** — but **no replot list**, that went with BR-6 |
| AC-19 | Sync service unavailable | Last good data shown; error surfaced; app usable |
| AC-20 | Keyboard-only scheduling | A row can be slotted without a pointer |
| AC-21 | A card's forecast finish passes while it sits outside a Done lane | It moves forward one working day; the Sprint Schedules bar translates whole; **no marker appears** |
| AC-22 | The design lead drags a card past the edge of its assigned week | Refused. The bar goes pale and snaps back |
| AC-23 | A sprint is re-dated so placed cards fall outside it | Those cards keep their day and move to *Outside any sprint*. **Nothing is unslotted or destroyed** |
| AC-24 | A business unit with no matching Trello label is tagged | Refused and surfaced. **No label is created** |
| AC-25 | An unmapped Trello lane appears | Surfaced and logged, never silently assigned a state |
| AC-26 | A main card is opened on Pipeline | Urgency, difficulty and deadline all read **em-dash**; no control is offered on the parent row |
| AC-27 | Frost note: remark vs flag | A remark alone leaves status unchanged; the clarification flag flips it to *With Clarification*; both audited |
| AC-28 | 4-day week (one holiday) expanded to days | Day columns sum exactly to the weekly capacity; the holiday takes zero and rejects drops |
| AC-29 | Day drag, then week replot | Day drag never changes the week; the week change lapses the day placement |
| AC-30 | Weekly load on the verified board shape | Rows weigh 1 + tasks ÷ deliverables; the board totals 478 card-equivalents |

**Numbering (JP, 2026-09-12).** AC-1–AC-26 are BRD v3.0's, verbatim, and v3.0's numbering
is authoritative. The four criteria added here on 2026-08-12 from build spec v1.1 (FR-11,
FR-12, BR-6c) were AC-21–AC-24 until that date and are **AC-27–AC-30** now: v3.0 assigned
those four numbers to different scenarios, and two numbering schemes for one project is the
worse of the two costs. State logs, task checkpoints and commit messages written before
2026-09-12 keep the old numbers — they are archive and are not rewritten; `docs/history/`
is where the old mapping lives if a pre-adoption reference needs decoding.
**Retired or withdrawn by v3.0:** AC-12 (with FR-7.5 and review time), AC-15, AC-16
(with Suggest Plan), AC-17 (with BR-6).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1**: All live acceptance criteria pass as automated tests where testable — AC-1–AC-26 from BRD v3.0 plus AC-27–AC-30 added here 2026-08-12. AC-12, AC-15, AC-16 and AC-17 are retired or withdrawn and are not counted.
- **SC-2**: Pipeline deadline coverage rises from ~1/269 to ~169/269 via the sheet join, with no behaviour change asked of the team (AC-8).
- **SC-3**: The forecast users see derives solely from measured delivery data, with provenance and sample sizes visible (AC-11); the spreadsheet formula — which overstates review waits 2.6–4.6× — is never exposed (BR-2, BR-3). Release-gated on the PM recognising the dates.
- **SC-4**: Pipeline and Sprint Schedules load in < 2 s at p95 with 5,000 cards; drag feedback < 100 ms; a Trello change reaches Sirius in < 15 min (NFR-1, NFR-2, NFR-3).
- **SC-5**: Zero writes to any source system except the enumerated write registry — the `Urgent` label, the card due date, and the `Difficulty: …` label on Trello (amended 2026-08-04; grown 2026-08-12); every write audited; a failed write leaves no divergent state (FR-4.6, FR-4.7, FR-4.8, FR-9.1–9.3, FR-2.6).
- **SC-6**: A scheduling week's conflicts are detected, explained, and individually acknowledgeable per BR-6/BR-9a — with card-level indicators never suppressed.
- **SC-7**: A row can be slotted keyboard-only (AC-20, NFR-9 — WCAG 2.1 AA).
- **SC-8**: Availability 99.5% during PHT business hours (NFR-4); audit retained 24 months (NFR-7); daily backups with quarterly restore tests (NFR-8).

## Scope

### In scope — v1

- Multi-project registry with per-project sources and settings
- **Requests** — read-only mirror of each project's intake sheet
- **Pipeline** — deliverables and work cards, sourced from Trello via ARES
- **Sprint Schedules** — list-plus-gantt planning at **week grain**, click-to-place, multi-select, one bar per work card *(smart suggestions WITHDRAWN — FR-5.7/5.8, BR-7)*
- **Deadlines** — the design lead's month view: the day a card starts, bounded day drag, per-week and per-day counts *(conflict detection WITHDRAWN — BR-6)*
- **The forecast** — the empirical model rebuilt from ARES, surfaced on Pipeline, Sprint Schedules and Deadlines; **there is no Forecast tab**, and review time is retired (BR-1b). The ported spreadsheet model exists in code for migration tests only, per FR-7.2)
- Google SSO restricted to `@frostdesigngroup.com`, with a named allow-list
- Read-only ingestion from Trello (via ARES) and Google Sheets (via service account)

### Out of Scope — v1

| Item | Deferred to |
|---|---|
| Client login and any client-visible surface | v2 |
| Request filing inside the platform | v3 |
| Google Chat notifications | v2 (they address clients) |
| Any write-back to Trello or Sheets — except the enumerated write registry, now **four** entries: `Urgent` label (W1), card due date (W2), `Difficulty: …` label (W3) and the business-unit tag (W4, built but inert). A fifth requires a BRD amendment (FR-4.10) | v1 carries exactly these four; **no write path to Sheets exists at any version** |
| Per-designer resource assignment | Later |
| Manual time tracking | Not planned — derived from Trello activity |
| Native mobile apps | Not planned |

Release ladder for context: v1 Frost-only; v2 adds client read (login, scoped views, Chat notifications); v3 adds client write (in-platform filing; the intake sheet retires). Each release is independently useful.

## Data Protection

From BRD §9. Sirius holds no personal data beyond staff names and work emails. It **does** hold unreleased client roadmap: deliverable names, dates and Figma links. That is the asset to protect.

- Frost staff only; all under NDA. No external users until v2, which changes the risk profile materially.
- ARES and Google Sheets are read-only by scope.
- **One exception class: the write registry.** Sirius adds or removes a single label named `Urgent` and sets or clears the card due date on a single Trello card (amended 2026-08-04 — registry W1 + W2), and writes nothing else anywhere. This requires a Trello token with write scope. Trello cannot scope a token per board, so it must be a **dedicated integration account** holding membership of the Design Support boards only — never a personal admin token. Every write is recorded in the audit log, and a failure rolls the local change back.
- Encryption in transit and at rest; audit logging; automatic offboarding.
- *Note carried from the BRD:* §9's statement that "write is impossible by permission" predates the urgency write and awaits amendment (tracked in STATE.md).

## Clarifications

### Session 2026-08-03 (JP)

- **OD-1 — RESOLVED**: ARES exposes its data via its **read API** (`/api/v1/trello/*` — boards, cards, movements, cycle-time; all marked `stable`), authenticated with a read-only `X-API-Key`, server-side only. Contract: `https://ares.frostdesigngroup.com/api/docs` (guide.md + openapi.yaml, served behind the same key). ARES ingestion (FR-8.1) is unblocked.
- **OD-8 — RESOLVED**: Sirius deploys beside ARES, same pattern and place, and uses the **same Mongo server as ARES** (its own `sirius` database).
- **Stack amendment**: datastore is MongoDB + Redis; app is Express 5 with a Ractive frontend per ARES conventions; auth via Passport Google OAuth with the four checks unchanged. Constitution v2.0.0.
- **NFR-3 stands at < 15 min**: the ARES guide documents a 30-minute cache cycle, but per JP the new ARES delivers in realtime, so ARES cadence is not the bottleneck. Verify end-to-end latency during ARES-integration work.

### Session 2026-08-04 (JP) — two-way sync

- **Write registry opened (constitution v4.0.0, MAJOR)**: the Trello write surface grows from urgency-only to an enumerated registry — today exactly `Urgent` label (W1) and card due date (W2). Deadline edits happen in Sirius and write through to Trello. Further growth requires a constitution amendment. Sheets stay read-only forever.
- **ARES push chosen over polling (NFR-3 → < 1 min target)**: ARES gains an outbound webhook feature (built by a separate agent from `docs/operations/ares-push-spec.md`); Sirius consumes it per `contracts/ares-push.md` on the notification-then-read pattern. The 15-min poll remains as reconcile fallback.
- **Sequencing**: build now — the pilot ships with deadline writes and push, widening the pre-pilot security review accordingly (phase 10, T077–T086).
- **Truth for Trello-owned fields**: Trello, always — manual Trello changes flow back via push and reconcile into Sirius, including the two written fields (FR-9.5).

### Session 2026-08-12 (JP) — build spec v1.1 alignment

- The product team's build spec v1.1 (`docs/history/build-spec-v1.1.md`) was reviewed against the live system; corrections returned as `docs/history/build-spec-v1.1-errata.md`. *(Both archived 2026-08-18 per JP → `docs/history/`.)*
- **W2 confirmed standing**: the doc's §4.2 "open decision" on writing the Trello due date predates the 2026-08-04 amendment. The decision holds — a Sirius deadline edit writes the Trello due date; no Sirius-local override layer exists or will be built.
- **Frost notes adopted** → **FR-3.7–FR-3.10** *(local FR-11 until the 2026-09-12 fold)*, AC-27 *(AC-21 before the same date)* (build spec §3.7–3.8).
- **Daily plotting adopted** → **FR-6.9–FR-6.14** *(local FR-12 until the 2026-09-12 fold)*, AC-28/AC-29 *(AC-22/AC-23 before the same date)* (build spec §6.2).
- **Weighted row load adopted** → BR-6c, AC-30 *(AC-24 before the 2026-09-12 renumbering)* (build spec §5.4) — resolves the BR-6a caveat by converting deliverable rows to card-equivalents.
- One question back to the product team (in the errata): the Deadlines count basis — §6.1's example disagrees with §5.4's formula. Default until answered: BR-6c weight everywhere. **Answered 2026-08-12** (`docs/product/errata-reply-v1.2.md`): §5.4 weight everywhere — the default stands, no code change; §6.1 was a doc error, fixed in their v1.2.

### Session 2026-08-12 (JP) — W3 difficulty writeback

- Product approved the Pipelines difficulty dropdown writing back to Trello (Miles, amendment
  BRD-§9-A1, via owl #01–#03); JP authorized the constitution amendment the same day. The
  write registry grows to three entries (constitution 4.1.0; `contracts/trello-write.md` W3;
  FR-4.8). Mechanics: `Difficulty: …` label swap, add-first with restore-on-partial-failure —
  pending Miles's label-vs-custom-field confirmation.
- The BRD document still needs product's incorporation pass: literal v2.2 §9 says *one* write
  (the 2026-08-04 W2 amendment was never incorporated), so BRD-§9-A1's "Was: two writes" block
  cannot paste in as written — flagged back to product.
- Easy/Medium dropdown colors reuse the phase-13 badge tokens (green/amber); the frame carries
  no tokens for them (product to confirm or supply).

### Session 2026-08-13 (JP) — batch-2 pipeline cells

- **Started/Done are per-card** (the row card's own movement events), superseding the phase-13
  group-derived assumption: started = first transition into a working/done state (survives a
  backlog bounce), done = latest entry into a done list, held only while the card currently
  sits there. Product spec (Figma 431:17015/16), JP: "proceed as defined from Miles".
- **MC# never shows decimals on the pipeline table** (JP ruling on product's DATA FIX,
  432:17733): the cell renders the bare `mc_number`; `display_id` (invariant 3) is unchanged —
  still assigned, stable, searchable, and shown on all other surfaces.
- **Due edits commit on Apply** (product spec 415:54979): date clicks stage; Apply writes W2;
  a baseline guard ensures an untouched popover never writes (so a sheet-sourced deadline is
  never silently promoted to a Trello due). Display precedence unchanged: Trello due wins where
  present, else sheet (invariant 14) — the annotation claiming sheet-first is a recorded drift.

### Session 2026-08-14 (JP) — Requests tab v2

- **Requests tab rebuilt to the Figma frame** (product owls #11/#12; annotated instances
  `452:23559` Breakdown + `452:23561` Request Tab Table — the owls cited the source-component
  ids, which carry no annotations; counts and content verified 1:1 via Rex). JP standing
  directive: build on arrival, end-to-end workflow, report when testable.
- **The requests route now serves the resolved deadline** (invariant 14): earliest `trello_due`
  among the MC's active deliverables where any exists (source `trello`), else the intake sheet
  deadline (source `sheet`), else null — fixing the same-MC-two-dates drift between tabs and the
  `missing-deadline` filter, which now tests the resolved value.
- **YEAR/MONTH filter on the sheet's own Year/Month columns** (build-spec §3.4 "Year parses
  `2026.0`"), not on any derived date — new optional intake chain (parser → schema → sync →
  API), dormant until `GOOGLE_SHEETS_CREDENTIALS` is provisioned. Requests carry no
  request/filed date field; if product wants one it is a new sheet column.
- **Defaults pending product confirm** (flagged in owl): stat cards are single-select toggles,
  REQUESTS acts as show-all; page size 10 (build-spec §3.5); no column sort, row-click detail,
  or MC#/BRIEF click-through (frame shows none — "flag rather than assume"); In Pipeline /
  With Clarification badge recipes inferred from the Breakdown palette (frame shows only
  For Filing). Frost notes stay the existing FR-11 feature (Sirius-owned, audit-logged) —
  the frame's editor states restyle it, no semantics change.

### Session 2026-08-14 (JP) — corrected status model + single-box notes (owls #13–#15)

- **Status derives from Trello presence** (supersedes owl #11 wording; amends FR-11.3's labels,
  not its precedence): `In Pipeline` = MC filed (still wins over the flag) · `To File` = unfiled
  (renames "For Filing") · `For Clarification` = unfiled + clarify flag (Sirius-internal, renames
  the status string "With Clarification"; the notes-cell badge TEXT keeps "With Clarification").
- **Counts cross-cut**: REQUESTS = IN PIPELINE + TO FILE; FOR CLARIFICATION is a subset of
  TO FILE — the To File card filters ALL unfiled rows, flagged included. A filed row with a
  stale flag is In Pipeline and excluded from the clarification count/filter.
- **One freeform note box** (owl #15): no separate clarification field. Clarify now requires the
  remark (`REMARK_REQUIRED` replaces `REASON_REQUIRED`); `clarify_reason` stays accepted for
  API compat, nulled on new writes; legacy rows resolve through `noteText()` (remark ‖ reason)
  everywhere. FR-11.4 (a remark alone never changes status) unchanged.
- Clarification display block + editor rebuilt to frame nodes `452:24801`/`452:24791`
  (red-50/red-500 badge + red-bordered wrapping note; editor text turns red-500 while flagged).

### Session 2026-08-15 (JP) — URL routing for the main tabs

- **Tabs and projects are addressable**: the path below `BASE_PATH` is `/<project-code>/<tab>`
  (`/rt-test/schedules`), with `/<code>`, `/<tab>` and `/` accepted as shorthand and normalized
  in place. Default tab `pipeline`; default project stays the first the membership returns.
  Back/forward and refresh restore both; sign-in returns to the full deep link.
- **Routing is navigation, never access control** (invariant 9 untouched): an unknown code, a
  non-member project and `/admin` for a non-admin all fall back silently to the defaults — no
  error page. Every API route still re-checks session and project membership, and admin data
  still 403s regardless of the URL.

## Open Decisions

From BRD §13. Marked, not resolved — each is answered by its owner and recorded in Clarifications before dependent work proceeds. (The BRD's numbering has no OD-3.)

- **OD-1** — ✅ Resolved 2026-08-03, see Clarifications.
- **OD-2** [NEEDS CLARIFICATION: Rolling window for the empirical model — 6 or 12 months? Owner: PM. Affects FR-7.6.]
- **OD-4** — ✅ **DEAD.** Conflicts and acknowledgement were withdrawn and the implementation deleted 2026-09-07 (owl #87; invariant 13). v3.0 records it the same way.
- **OD-5** — ✅ Closed 2026-09-08: `Client Approval` lanes are Ongoing by §7a's enumeration (`Ready for Client Approval`, `Sent for Client Approval`).
- **OD-6** [NEEDS CLARIFICATION: Which projects are in v1 beyond GCash? Owner: Leadership. Affects seed data and rollout.]
- **OD-7** [NEEDS CLARIFICATION: Retention for closed requests and archived cards. Owner: Leadership.]
- **OD-8** — ✅ Resolved 2026-08-03 on the build side (deployed beside ARES, shared Mongo server, own
  database), see Clarifications. ⚠️ **BRD v3.0 §13 still lists it open with leadership** — read that as
  product paperwork, not an undecided build question. Put back to product in owl #79.

## Assumptions

From BRD §11, verbatim.

| # | Assumption | If false |
|---|---|---|
| A1 | ARES continues to run and can expose a read interface | Trello sync returns to scope, +2 weeks |
| A2 | Trello remains the execution system | Integration scope changes |
| A3 | MC numbers stay in card titles | Grouping becomes heuristic |
| A4 | `Main Card` label keeps its meaning | Deliverable identification breaks |
| A5 | The intake sheet stays the filing mechanism until v3 | v3 accelerates |
| A6 | Frost owns and hosts the system | Vendor assessment enters the critical path |

## Appendix — Empirical constants

Preserved exactly from BRD Appendix A. Measured from ARES, board `hLL7WW2V`, Jan–Jul 2026. These are a snapshot and are superseded by the scheduled refresh (FR-7.6).

~~**Client review wait (days):** median 2.68 · p70 4.80 · p85 9.87 · p95 19.64 · mean 5.21 · n = 1,184~~
⚠️ **RETIRED with review time (BR-1b).** Kept struck through rather than deleted because it is the
evidence behind BR-3 — the spreadsheet's 2.6–4.6× overstatement — and `lib/forecast.legacy.ts`'s
migration tests still measure against it. No user-facing date uses it.

**Design time (days) by difficulty × lane, at p70** — ⚠️ **GAP 2**: v3.0 keys this on the work-type
label; the build keys it on the folded lane, for sample depth (asked in owl #74, unanswered). The
figures below are the January–July snapshot; ARES's live grid superseded them for the cards that have
enough samples, and the refreshed grid is **held, not used**, until the unfreeze gate passes
(invariant 7):

| Difficulty | design | ops | assets |
|---|---|---|---|
| Easy | 0.94 (n=1,126) | 1.03 (n=311) | 13.88 (n=353) |
| Medium | 1.20 (n=1,508) | 0.56 (n=385) | — |
| Hard | 2.09 (n=228) | 1.02 (n=121) | — |

**Throughput, cards completed per week:** Easy 29/50/75 · Medium 42/51/69 · Hard 7/9/11 (p25/p50/p70)

**Hard mix across 27 weeks:** median 8.3% · p70 9.6% · p85 12.9% · max 20.4%. Weeks above the median: 24.1 h median cycle against 19.4 h below it.

**Capacity reference weeks** — from ARES `steering.deliveryForecast.referenceWeeks`, rt-837:

| | Week | Cards |
|---|---|---|
| Least productive | 2026-W03 | 1 |
| Typical | 2026-W21 | 120 |
| Most productive | 2026-W30 | 367 |

`effectiveWeeklyRate` 90.2 · `dailySampleSize` 207 · 30 weeks of `weeklyPairs` available.
