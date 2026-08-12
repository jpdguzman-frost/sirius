# Feature Specification: Sirius v1 — Delivery Pipeline & Forecasting Platform

**Feature Branch**: `001-sirius-v1`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Convert the signed-off BRD v2.2 (docs/Sirius__BRD.md) into Spec Kit format. Preserve every FR, BR, NFR, AC with its ID. Preserve every measured constant exactly. Mark Open Decisions [NEEDS CLARIFICATION]. Scope is v1 only. Add nothing the BRD does not contain."

**Source of truth**: `docs/Sirius__BRD.md` (v2.2, 3 August 2026). This document is a format conversion, not a rewrite. Where this spec and the BRD diverge, the BRD wins and this spec is in error. Requirement IDs (FR-x.y, BR-n, NFR-n, AC-n) are the BRD's own and are how work is traced.

## Overview

Frost delivers design work to several clients through Trello boards, tracked in a pair of Google Sheets that have outgrown themselves — 6,342 production rows, broken cross-sheet links, and 4,020 status values reading `No Match`.

Sirius replaces the *planning and forecasting* half of that system: a pipeline register, a sprint schedule, an operations deadline view, and a delivery forecast. Trello remains where work happens. The intake sheet remains where clients file requests. Sirius reads both and owns neither. It is **multi-project from the outset** — GCash: Design Support is the first engagement, not the only one.

Sirius owns only planning decisions: which week a deliverable is slotted, confidence, review SLA overrides, status notes, pins — and, since 2026-08-12, frost notes on intake requests and day placements on Deadlines. It writes back only what the write registry enumerates — the `Urgent` label and the card due date, both on Trello — nothing else, anywhere (amended 2026-08-04; was urgency-only).

The business case is not headcount. It is that a forecast becomes defensible, scheduling conflicts surface before they bite, and the manual reconciliation between two spreadsheets and a board stops consuming PM time.

## User Scenarios & Testing *(mandatory)*

All actors are Frost staff (PM, Operations Lead, designers, leadership) signing in with Frost Google accounts. The BRD defines no other personas for v1; client access is v2.

### User Story 1 - Pipeline register (Priority: P1)

A Frost PM opens the Pipeline view for a project and sees every deliverable — type, difficulty, urgency, current Trello list, requestor, deadline, cycle time, and links to the Trello card and Figma file — without opening Trello or either spreadsheet. Expanding a deliverable reveals its MC group's work cards. Cards missing difficulty, deadline or Figma link are listed for correction, with links.

**Why this priority**: The register is the read-only core every other view derives from; it alone replaces the manual reconciliation between two spreadsheets and a board.

**Independent Test**: Sync a project's board data, open Pipeline, verify fields, grouping, and the correction list against known board contents (FR-4.1–FR-4.5).

**Acceptance Scenarios**:

1. **Given** a synced project, **When** the PM opens Pipeline, **Then** deliverables list with the FR-4.1 fields and Trello-sourced fields are read-only (FR-4.3).
2. **Given** a deliverable in an MC group with work cards, **When** the row expands, **Then** the group's work cards appear (FR-4.2) — attached to the MC group, not to a single deliverable.
3. **Given** cards missing difficulty, deadline or Figma link, **When** the PM opens the correction list, **Then** each appears with a link to fix it at source (FR-4.4).

---

### User Story 2 - Sprint scheduling (Priority: P2)

The PM plans by dragging deliverable rows into weeks on a list-plus-gantt view grouped by sprint. Multi-select moves preserve relative spacing. Rows can be pinned. **Suggest plan** proposes slots from empirical throughput and applies nothing until explicitly accepted. Sprints themselves are edited in the platform — added, renamed, re-dated, reordered, deleted.

**Why this priority**: Slotting weeks is the planning decision Sirius owns; it feeds Deadlines and Forecast.

**Independent Test**: Drag single and multi-selected rows, pin a row, run Suggest plan, edit sprints — verify AC-13, AC-14, AC-15, AC-16 and FR-5.x behaviours.

**Acceptance Scenarios**:

1. **Given** a slotted deliverable, **When** the PM drags its row to another week, **Then** dates, sprint group and load update (AC-13).
2. **Given** several selected rows, **When** dragged, **Then** the interval between the grabbed row's week and the drop week applies to every selected row, preserving spacing (AC-14, BR-8).
3. **Given** a backlog, **When** Suggest plan runs, **Then** proposals preview as ghosts and nothing applies until accepted (AC-15, FR-5.8).
4. **Given** a pinned row, **When** Suggest plan runs, **Then** the pinned row never moves (AC-16, FR-5.9).
5. **Given** two sprints whose dates overlap, **When** saved, **Then** the save is rejected (FR-5.15); weeks covered by no sprint surface as *Outside any sprint* (BR-5).

---

### User Story 3 - Deadlines and conflicts (Priority: P3)

The Operations Lead opens the read-only Deadlines view for a month and sees, per week, each deliverable's two entries — sketch delivery and render delivery — with conflicts detected and explained on screen, and a replot list naming every affected deliverable and why. A conflict knowingly accepted can be acknowledged; the acknowledgement lapses if the cards involved change.

**Why this priority**: Surfacing conflicts before they bite is a core business-case line; it depends on scheduling (US2) existing.

**Independent Test**: Construct weeks that trigger each BR-6 rule, verify detection, explanation, replot list, and acknowledgement lapse per BR-9a (AC-17, AC-18).

**Acceptance Scenarios**:

1. **Given** two urgent milestones in one week, **When** Deadlines renders, **Then** the conflict is flagged and both items named (AC-17).
2. **Given** a forecast date after the client deadline, **When** Deadlines renders, **Then** the row flags late, the render bar is red, and the item is listed for replot (AC-18).
3. **Given** an acknowledged conflict, **When** a card involved is added, removed, replotted or moves phase, **Then** the acknowledgement lapses and the conflict resurfaces (FR-6.7, BR-9a).
4. **Given** an acknowledged conflict, **When** viewing Deadlines, **Then** card-level indicators (red bar, late flag) remain visible — never suppressed (BR-9a).
5. **Given** a week expanded to its Mon–Fri days, **When** a milestone is dragged to another day, **Then** the week never changes and the day columns still sum to the weekly capacity — holidays take zero (AC-22, AC-23, FR-12 — added 2026-08-12).

---

### User Story 4 - Forecast (Priority: P4)

The PM opens Forecast and sees a single forecast computed from measured delivery data — design time keyed on difficulty **and** lane, review time from measured review dwell — at a selectable confidence per card. Entering a review SLA override replaces modelled review time and cascades downstream. Model constants and sample sizes are visible.

**Why this priority**: The defensible forecast is the headline business case, but it is gated: no forecast dates are shown to users until the model refresh produces dates the PM recognises (release gate; BR-3).

**Independent Test**: With a computed model grid, verify UI dates match the grid, provenance and sample sizes visible (AC-11); enter an SLA and verify downstream recalculation (AC-12).

**Acceptance Scenarios**:

1. **Given** a computed empirical grid, **When** Forecast renders, **Then** its dates match the grid and provenance and sample size are visible (AC-11).
2. **Given** a review SLA entered, **When** it is saved, **Then** all downstream dates recalculate (AC-12).
3. **Given** any user-facing view, **When** forecasts are shown, **Then** only the empirical model is offered — the spreadsheet formula is never exposed (FR-7.2, BR-2).

---

### User Story 5 - Requests mirror (Priority: P5)

A Frost user opens Requests and sees a read-only mirror of the project's intake sheet tab: MC #, deliverable, type, use case, requestor, deadline, brief, and a link to the source row, with status derived from the Trello join (*In pipeline* / *Not yet filed*). Pre-allocated MC rows are skipped silently and counted; unparseable rows are surfaced with row number, reason and a link.

**Why this priority**: Completes the picture (intent vs execution) but reads an independent source; the register stands without it.

**Independent Test**: Run the sheet sync against current data and verify counts (AC-6), the deadline join (AC-8), and inactive marking on row deletion (AC-9).

**Acceptance Scenarios**:

1. **Given** the current intake sheet, **When** sync runs, **Then** 495 rows import, 495 are reserved, 8 are rejected (AC-6).
2. **Given** the deadline join on MC number, **When** Pipeline renders, **Then** deadline coverage rises from ~1/269 to ~169/269 (AC-8).
3. **Given** a row deleted in the sheet, **When** the next sync runs, **Then** the request is marked inactive with history intact — never deleted (AC-9, FR-8.4).
4. **Given** a request with only a remark, **When** viewed, **Then** status is unchanged; **Given** the clarification flag set with a reason, **Then** status reads *With Clarification* and the FOR CLARIFICATION tile counts it (AC-21, FR-11 — added 2026-08-12).

---

### User Story 6 - Urgency (Priority: P6)

The PM marks a deliverable urgent in Pipeline. Sirius adds an `Urgent` label to the Trello card so designers working the board see it. Removing urgency removes the label. A failed write rolls the local change back — Sirius never shows a state Trello lacks.

**Why this priority**: The only write path; deliberately last, with its own review, rollback semantics and a dedicated integration account (BRD §9).

**Independent Test**: Toggle urgency against a duplicate board; verify label add/remove, audit records, and rollback on a forced failure (FR-4.6, FR-4.7).

**Acceptance Scenarios**:

1. **Given** a non-urgent deliverable, **When** the PM marks it urgent, **Then** the Trello card gains the `Urgent` label; absence of the label means non-urgent — no second state to sync (FR-4.6).
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
- A deliverable with neither Trello due date nor sheet deadline has no deadline and cannot raise a deadline conflict (BR-9).
- A slotted week covered by no sprint appears under *Outside any sprint* — never forced into a neighbour (BR-5).
- The backlog's own hard share exceeds the ceiling: the planner spreads hard work evenly, places everything, and states the ceiling is unreachable — reported, not refused (BR-7a).
- Sync service unavailable: last good data remains visible, error surfaced, app usable (AC-19, FR-8.5).
- Sheet un-shared from the reader: access fails safely; re-sharing restores (AC-7).
- Non-Frost account or Frost account off the allow-list: denied with a clear reason (AC-1, AC-2).
- Urgency write fails mid-flight: local state rolls back (FR-4.7).
- Trello list names are free text: classified Pending / Ongoing / Done by configurable keyword rules (BR-10).
- A multi-deliverable MC (MC-655 × 3) carries **one** frost note — the note attaches to the request row, not to each deliverable (FR-11.1).
- A deliverable whose MC group has no work cards weighs exactly 1 (BR-6c); the 20 unkeyed cards belong to no group and weigh into none.
- A week whose Mon–Fri are all holidays: every day takes zero capacity and rejects drops; the week's milestones still render (FR-12.4).

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
| FR-3.2 | Show MC #, deliverable, type, use case, requestor, deadline, brief, and a link to the source row | M |
| FR-3.3 | Derive status from the Trello join: *In pipeline* or *Not yet filed* | M |
| FR-3.4 | Skip pre-allocated MC rows silently and report the count | M |
| FR-3.5 | Surface unparseable rows with row number, reason and a link | M |
| FR-3.6 | Filter by filed / unfiled / missing deadline | S |

*FR-3.1 and FR-3.3 amended 2026-08-12 by FR-11: the mirror itself stays read-only with no write-back, but each request may carry a Sirius-owned frost note stored beside it (never in the sheet), and status becomes three-state per FR-11.3.*

#### FR-4 — Pipeline

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Deliverables listed with type, difficulty, urgency, current list, requestor, deadline, cycle time, links | M |
| FR-4.2 | Expand to reveal the MC group's work cards | M |
| FR-4.3 | Trello-sourced fields are read-only | M |
| FR-4.4 | Cards missing difficulty, deadline or Figma link are listed for correction, with links | M |
| FR-4.5 | Cycle time derived from Trello activity timestamps, not date fields | M |
| FR-4.6 | Urgency is set here and written back to Trello as an `Urgent` label; absence means non-urgent | M |
| FR-4.7 | A failed write rolls the local change back, so Sirius never shows a state Trello lacks | M |

#### FR-5 — Sprint Schedules

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Fixed list pane plus scrolling gantt, grouped by sprint | M |
| FR-5.2 | Three segments per row — sketch, client review, render — plus a deadline marker | M |
| FR-5.3 | A render segment past its deadline renders red; the row flags late | M |
| FR-5.4 | Rows are dragged to slot them; the gantt is output, not a control | M |
| FR-5.5 | Multi-select by checkbox, shift-range or whole sprint | M |
| FR-5.6 | A multi-row drag applies a relative shift, preserving spacing | M |
| FR-5.7 | **Suggest plan** proposes slots from empirical throughput, ordered urgency → deadline → difficulty | S |
| FR-5.8 | Suggestions preview as ghosts and apply only on explicit accept | M |
| FR-5.9 | Rows can be pinned; suggestions never move a pinned row | M |
| FR-5.10 | Throughput setting selectable: conservative / typical / stretch | S |
| FR-5.11 | Trello status may be overridden with a note, visibly marked manual and reversible | M |
| FR-5.12 | Duplicate a row without inheriting its Trello or Figma links | M |
| FR-5.13 | Per-week weighted load and Hard mix against capacity | S |
| FR-5.14 | Sprints are added, renamed, re-dated, reordered and deleted in the platform | M |
| FR-5.15 | Overlapping sprints blocked on save; gaps allowed and surfaced | M |
| FR-5.16 | Weekly capacity is set in cards per week, bounded by the project's ARES reference weeks | M |
| FR-5.17 | The weekly footer shows cards against capacity and the Hard share | S |

#### FR-6 — Deadlines

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | Read-only; all dates derive from Sprint Schedules | M |
| FR-6.2 | Weeks of a selected month, navigable to any month | M |
| FR-6.3 | Each deliverable contributes two entries — sketch delivery and render delivery | M |
| FR-6.4 | Conflicts detected per BR-6 and explained on screen | M |
| FR-6.5 | A replot list naming every affected deliverable and why | M |
| FR-6.6 | Trello and Figma links on each entry | M |
| FR-6.7 | Conflicts may be acknowledged; acknowledgement lapses when the cards involved change | M |
| FR-6.8 | Acknowledged conflicts are counted and restorable | S |

#### FR-7 — Forecast

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | Column names match the Delivery Forecast sheet | M |
| FR-7.2 | A single forecast, from measured delivery. The ported spreadsheet formula is retained in code for migration tests but is not exposed | M |
| FR-7.3 | Empirical mode keys design time on difficulty **and** lane | M |
| FR-7.4 | Difficulty read-only; confidence selectable per card | M |
| FR-7.5 | Review SLA override replaces modelled review time and cascades | M |
| FR-7.6 | The empirical grid recomputes on a schedule from a rolling window | M |
| FR-7.7 | Model constants and sample sizes visible to users | S |

#### FR-8 — Ingestion

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | Trello data read from ARES, not from Trello directly | M |
| FR-8.2 | Intake sheet read server-side via service account, `spreadsheets.readonly` | M |
| FR-8.3 | Sheet sharing stays Restricted; the service account is a named Viewer | M |
| FR-8.4 | Sheet rows that vanish are marked inactive, never deleted | M |
| FR-8.5 | Sync failures are logged and alerted; last good data remains visible | M |
| FR-8.6 | Sync status and last-success time visible in the UI | S |

#### FR-9 — Two-way sync *(added 2026-08-04, JP-directed change — not in BRD v2.2; BRD §9 amendment pending)*

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

#### FR-11 — Frost notes *(added 2026-08-12, JP-directed — adopted from product build spec v1.1 §3.7–3.8; not in BRD v2.2)*

| ID | Requirement | Priority |
|---|---|---|
| FR-11.1 | Each intake request may carry one Sirius-owned frost note — a free-text remark, and a clarification flag with a required reason — keyed `(project_id, mc_number)` | M |
| FR-11.2 | Notes are never written to the intake sheet; the service account keeps `spreadsheets.readonly`, so the permission enforces the rule (FR-8.2, FR-8.3 unchanged) | M |
| FR-11.3 | Request status becomes three-state, derived and never stored: Trello card exists → *In Pipeline*; else clarification flag → *With Clarification*; else *For Filing* (amends FR-3.3) | M |
| FR-11.4 | A remark alone never changes status; only the clarification flag does | M |
| FR-11.5 | Requests gains a FOR CLARIFICATION tile that counts and filters flagged requests | M |
| FR-11.6 | Note edits are inline, optimistic with rollback, and every change writes `audit_log` (invariant 10) | M |
| FR-11.7 | Routes live under the project scope (`/api/projects/:projectId/…`) behind session + membership like every other route (NFR-6) — the build spec's bare `/api/frost-notes` path is illustrative only | M |

#### FR-12 — Deadlines daily plotting *(added 2026-08-12, JP-directed — adopted from product build spec v1.1 §6.2; not in BRD v2.2)*

| ID | Requirement | Priority |
|---|---|---|
| FR-12.1 | A week header on Deadlines expands to a Mon–Fri day grid; one week open at a time | M |
| FR-12.2 | Milestones (deliverable × phase) drag between days with pointer events; a keyboard equivalent exists (NFR-9) | M |
| FR-12.3 | Day placement never changes the week; stored per `(project_id, deliverable, phase)`; absent means *follow the forecast* | M |
| FR-12.4 | Day capacity distributes the week's capacity across non-holiday weekdays by largest remainder — day columns sum exactly to the weekly capacity; holidays take zero and reject drops | M |
| FR-12.5 | Day placements are optimistic with rollback and audited (invariant 10) | M |
| FR-12.6 | When a milestone's week changes — drag, suggest apply, or deadline change — its day placement lapses back to the forecast default | M |

### Business Rules

Preserved verbatim from BRD §7.

**BR-1 — Forecast arithmetic.** Unchanged from the workbook. `Sketch Delivery = WORKDAY(start, lead + design)`; `Sketch Approved = WORKDAY(sketch delivery, review)`; render begins the **Friday of the sketch-approval week**; `Total Cycle Time = 1.28 × forecast review time + 2.96` in spreadsheet mode.

**BR-2 — The forecast is empirical, and it is the only one.** Design time from measured working-lane dwell, keyed on difficulty **and** lane. Review time from measured dwell in *Sent for Client Review* lanes. Percentiles at Average / 70 / 85 / 95. The spreadsheet model is not offered as an alternative — it was found to overstate review waits by 2.6–4.6× (BR-3), so presenting it beside measured data would invite use of a number known to be wrong. It survives in code purely so tests can prove the port was faithful before the workbook is retired.

**BR-3 — The spreadsheet model is wrong and must be rebuilt.** Measured client review wait across 1,184 completed cycles: median 2.68 d, p70 4.80 d. The workbook uses 12.5 d (Medium) and 22 d (Hard) at p70 — **2.6× to 4.6× too high**. This is why every card in early prototypes rendered as late. Rebuilding the grid from ARES is a prerequisite for release, not an enhancement.

**BR-4 — Difficulty must be paired with lane.** In aggregate, Easy cards appear slower than Medium (21.6 h vs 13.0 h median). Within the `design` lane the expected order holds: 4.2 h → 18.1 h → 28.1 h. The anomaly is lane mix — Easy cards cluster in the `assets` lane, median 231 h. Difficulty alone is not a valid key.

**BR-5 — Sprints are data, not a cadence.** Each project holds an editable list of sprints with explicit start and end dates. Length varies with client alignment, holidays and scope. A deliverable belongs to whichever sprint contains its slotted week; weeks covered by no sprint appear under *Outside any sprint* rather than being forced into a neighbour. Overlapping sprints are rejected on save — a week cannot belong to two. Gaps are permitted and surfaced. Reordering preserves each sprint's length and re-flows the calendar from the set's earliest start.

**BR-6 — Conflict detection**, per week on Deadlines:

| Conflict | Condition | Reported |
|---|---|---|
| Urgent overlap | ≥2 urgent milestones in one week | the urgent items |
| Over capacity | cards due exceed the week's card capacity | non-urgent items, as displaced |
| Past deadline | forecast date after the client deadline | the breaching milestones |

**BR-6a — Capacity is cards per week, sourced from ARES.** Each project's capacity comes from `steering.deliveryForecast.referenceWeeks` in ARES, which already models the least productive, typical and most productive week by card count. The typical week is the default; least and most bound the control. For rt-837 that is 1 / 120 / 367 cards, with an `effectiveWeeklyRate` of 90.2. Sirius does not invent a capacity unit.

*Caveat:* those reference weeks count every card on the board, including work cards and ops cards, while Sirius plans deliverables. Expect the deliverable-level typical to be lower, and revise once ARES can report it.

**BR-6b — Hard mix ceiling.** Card count alone cannot distinguish a week of 120 easy cards from 120 hard ones, so a second axis applies. Difficulty weights (Easy 1, Medium 2, Hard 4) are used *only* for this test. Measured across 27 weeks on board `hLL7WW2V`: hard share median **8.3%** (ideal), p85 **12.9%** (ceiling), observed max 20.4%. Weeks above the median ran a median cycle of **24.1 h against 19.4 h** — roughly 24% slower per card. A week over the ideal is flagged amber, over the ceiling red.

**BR-6c — Row weight converts rows to card-equivalents.** *(Added 2026-08-12 from build spec v1.1 §5.4; resolves the BR-6a caveat.)* A schedule row is a deliverable, but capacity (BR-6a) counts every card. Each row therefore weighs `1 + (its MC group's work cards ÷ the group's deliverables)`: MC-805, with 13 deliverables and 40 work cards, weighs 4.08 per row and 53 as a group; the verified board sums to **478 = 269 deliverables + 209 work cards** (the 20 unkeyed cards weigh into no group). The weight feeds the weekly footer, the over-capacity tint and the BR-6 *over capacity* conflict. It does **not** feed the hard-mix test (BR-6b keeps its own difficulty weights) and does **not** alter Suggest plan's validated placement arithmetic (`lib/planner.ts` counts rows, golden-locked — invariant 5). *Pending product-team clarification via the v1.1 errata: the count basis on Deadlines — build spec §6.1's example ("3 work cards counts 3") disagrees with this formula (4); until answered, Deadlines uses this same weight.*

**BR-7 — Smart plan.** Order by urgency, then deadline, then difficulty descending. A week fills at the empirical throughput ceiling for its difficulty mix. Blocked cards are not scheduled into the current week. Pinned rows are immovable. Nothing applies without explicit acceptance.

**BR-7a — Unachievable mixes are reported, not refused.** Where the backlog's own hard share exceeds the ceiling, no arrangement of weeks can satisfy it. The planner spreads hard work as evenly as possible, places everything, and states plainly that the ceiling is unreachable. Refusing to schedule work would be worse than scheduling it with a warning.

**BR-8 — Multi-row move.** A drag applies the interval between the grabbed row's week and the drop week to every selected row.

**BR-9 — Deadline precedence.** Trello due date wins where present; otherwise the intake sheet's; otherwise none, and the card cannot raise a deadline conflict.

**BR-9a — Conflicts can be acknowledged.** Overlaps sometimes happen by choice. Any conflict banner may be dismissed, which also removes its items from the replot list. A dismissal is keyed on *week + rule + the exact cards involved*, so it silences one specific situation rather than the rule: if a card is added, removed, replotted or moves phase, the conflict is a different one and surfaces again. Card-level indicators — the red render bar, the late flag — are never suppressed. The alert is dismissible; the fact is not.

**BR-10 — Status classification.** Trello list names are free text, classified as Pending / Ongoing / Done by configurable keyword rules.

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
- **Deliverable**: The planning and forecasting unit — a Trello card carrying the `Main Card` label (269 on the verified board). Identity is (project, Trello card); `mc_number` is **not** unique — MC-825 carries 99 deliverables; a display id such as `MC-655.3` is for humans. Fields divide by owner: Trello-owned (name, list, difficulty, lane, blockers, due date, links), sheet-owned (deadline, use case, brief, requestor), Sirius-owned (slotted week, pin, confidence, SLA overrides, status note) — and the written-back fields per the write registry: urgency and the due date (amended 2026-08-04).
- **Work card**: A production task (209 on the verified board), prefixed by verb (`Render Asset:`, `Cascade Mobile Screen:`, `Icon Clean Up:`). Attaches to the MC group — there is no reliable task→deliverable edge (1 of 27 titles matched).
- **Intake request**: One row of the project's intake sheet — MC #, name, requestor, type, use case, brief, deadline. Read-only mirror; vanished rows go inactive, never deleted.
- **Card event**: A single Trello lane movement with its timestamp — the raw material for cycle times and the empirical model.
- **Model grid / throughput grid**: Per-project percentiles (Average / 70 / 85 / 95) of design and review time keyed on difficulty × lane, and cards-per-week throughput per difficulty, recomputed on a schedule from a rolling window, each with visible sample sizes.
- **Frost note**: A Sirius-owned annotation on an intake request — remark, clarification flag and reason — keyed (project, MC number); one per request, never written to the sheet (added 2026-08-12, FR-11).
- **Milestone day placement**: A Mon–Fri day choice for one deliverable phase inside its slotted week; absent means follow the forecast; lapses when the week changes (added 2026-08-12, FR-12).
- **Conflict acknowledgement**: A dismissal keyed on week + rule + the exact cards involved; lapses when the situation changes.
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
| Urgency | Set in Sirius, written to Trello as an `Urgent` label | 0 / 26 boards today — created on first use |

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
| AC-11 | Forecast in the UI | Matches the ARES-derived grid; provenance and sample size visible |
| AC-12 | Review SLA entered | All downstream dates recalculate |
| AC-13 | Drag a row | Dates, sprint group and load update |
| AC-14 | Multi-select drag | Relative spacing preserved |
| AC-15 | Suggest plan | Proposes; applies nothing until accepted |
| AC-16 | Pinned row + suggest | Never moved |
| AC-17 | Two urgent milestones in a week | Deadlines flags and names both |
| AC-18 | Forecast past deadline | Row late, bar red, listed for replot |
| AC-19 | Sync service unavailable | Last good data shown; error surfaced; app usable |
| AC-20 | Keyboard-only scheduling | A row can be slotted without a pointer |
| AC-21 | Frost note: remark vs flag | A remark alone leaves status unchanged; the clarification flag flips it to *With Clarification*; both audited |
| AC-22 | 4-day week (one holiday) expanded to days | Day columns sum exactly to the weekly capacity; the holiday takes zero and rejects drops |
| AC-23 | Day drag, then week replot | Day drag never changes the week; the week change lapses the day placement |
| AC-24 | Weekly load on the verified board shape | Rows weigh 1 + tasks ÷ deliverables; the board totals 478 card-equivalents |

AC-21–AC-24 added 2026-08-12 (FR-11, FR-12, BR-6c — from build spec v1.1); AC-1–AC-20 remain the BRD's verbatim.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1**: All acceptance criteria (AC-1–AC-24: 20 from the BRD, 4 added 2026-08-12) pass — as automated tests where testable.
- **SC-2**: Pipeline deadline coverage rises from ~1/269 to ~169/269 via the sheet join, with no behaviour change asked of the team (AC-8).
- **SC-3**: The forecast users see derives solely from measured delivery data, with provenance and sample sizes visible (AC-11); the spreadsheet formula — which overstates review waits 2.6–4.6× — is never exposed (BR-2, BR-3). Release-gated on the PM recognising the dates.
- **SC-4**: Pipeline and Sprint Schedules load in < 2 s at p95 with 5,000 cards; drag feedback < 100 ms; a Trello change reaches Sirius in < 15 min (NFR-1, NFR-2, NFR-3).
- **SC-5**: Zero writes to any source system except the enumerated write registry — the `Urgent` label and the card due date on Trello (amended 2026-08-04); every write audited; a failed write leaves no divergent state (FR-4.6, FR-4.7, FR-9.1–9.3, FR-2.6).
- **SC-6**: A scheduling week's conflicts are detected, explained, and individually acknowledgeable per BR-6/BR-9a — with card-level indicators never suppressed.
- **SC-7**: A row can be slotted keyboard-only (AC-20, NFR-9 — WCAG 2.1 AA).
- **SC-8**: Availability 99.5% during PHT business hours (NFR-4); audit retained 24 months (NFR-7); daily backups with quarterly restore tests (NFR-8).

## Scope

### In scope — v1

- Multi-project registry with per-project sources and settings
- **Requests** — read-only mirror of each project's intake sheet
- **Pipeline** — deliverables and work cards, sourced from Trello via ARES
- **Sprint Schedules** — list-plus-gantt planning, drag scheduling, multi-select, smart suggestions
- **Deadlines** — read-only operations view with conflict detection
- **Forecast** — the empirical model rebuilt from ARES (the ported spreadsheet model exists in code for migration tests only, per FR-7.2)
- Google SSO restricted to `@frostdesigngroup.com`, with a named allow-list
- Read-only ingestion from Trello (via ARES) and Google Sheets (via service account)

### Out of Scope — v1

| Item | Deferred to |
|---|---|
| Client login and any client-visible surface | v2 |
| Request filing inside the platform | v3 |
| Google Chat notifications | v2 (they address clients) |
| Any write-back to Trello or Sheets — except the enumerated write registry: `Urgent` label + card due date (amended 2026-08-04; §Data Protection) | Not planned |
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
- **ARES push chosen over polling (NFR-3 → < 1 min target)**: ARES gains an outbound webhook feature (built by a separate agent from `docs/ARES_PUSH_BUILD_SPEC.md`); Sirius consumes it per `contracts/ares-push.md` on the notification-then-read pattern. The 15-min poll remains as reconcile fallback.
- **Sequencing**: build now — the pilot ships with deadline writes and push, widening the pre-pilot security review accordingly (phase 10, T077–T086).
- **Truth for Trello-owned fields**: Trello, always — manual Trello changes flow back via push and reconcile into Sirius, including the two written fields (FR-9.5).

### Session 2026-08-12 (JP) — build spec v1.1 alignment

- The product team's build spec v1.1 (`docs/sirius-build-spec_v1.1.md`) was reviewed against the live system; corrections returned as `docs/sirius-build-spec_v1.1_errata.md`.
- **W2 confirmed standing**: the doc's §4.2 "open decision" on writing the Trello due date predates the 2026-08-04 amendment. The decision holds — a Sirius deadline edit writes the Trello due date; no Sirius-local override layer exists or will be built.
- **Frost notes adopted** → FR-11, AC-21 (build spec §3.7–3.8).
- **Daily plotting adopted** → FR-12, AC-22/AC-23 (build spec §6.2).
- **Weighted row load adopted** → BR-6c, AC-24 (build spec §5.4) — resolves the BR-6a caveat by converting deliverable rows to card-equivalents.
- One question back to the product team (in the errata): the Deadlines count basis — §6.1's example disagrees with §5.4's formula. Default until answered: BR-6c weight everywhere.

## Open Decisions

From BRD §13. Marked, not resolved — each is answered by its owner and recorded in Clarifications before dependent work proceeds. (The BRD's numbering has no OD-3.)

- **OD-1** — ✅ Resolved 2026-08-03, see Clarifications.
- **OD-2** [NEEDS CLARIFICATION: Rolling window for the empirical model — 6 or 12 months? Owner: PM. Affects FR-7.6.]
- **OD-4** [NEEDS CLARIFICATION: Should acknowledged conflicts expire after a set period, or persist until the cards change? Owner: PM. Affects FR-6.7.]
- **OD-5** [NEEDS CLARIFICATION: Is `Client Approval` an ongoing or done state? Owner: PM. Affects BR-10 keyword rules.]
- **OD-6** [NEEDS CLARIFICATION: Which projects are in v1 beyond GCash? Owner: Leadership. Affects seed data and rollout.]
- **OD-7** [NEEDS CLARIFICATION: Retention for closed requests and archived cards. Owner: Leadership.]
- **OD-8** — ✅ Resolved 2026-08-03, see Clarifications.

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

**Client review wait (days):** median 2.68 · p70 4.80 · p85 9.87 · p95 19.64 · mean 5.21 · n = 1,184

**Design time (days) by difficulty × lane, at p70:**

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
