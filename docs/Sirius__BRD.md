# Business Requirements Document
## Frost: Sirius — Delivery Pipeline & Forecasting Platform

| | |
|---|---|
| **Document** | BRD — Frost: Sirius |
| **Version** | 2.2 |
| **Date** | 3 August 2026 |
| **Supersedes** | BRD — Design Support Platform v1.0 (31 Jul 2026) |
| **Changes in 2.2** | Capacity expressed in cards per week from ARES reference weeks · hard-mix ceiling added · sprints are editable data, not a cadence · urgency written back to Trello (the one write) · conflicts can be acknowledged · spreadsheet forecast mode retired, measured model only |
| **Status** | Awaiting sign-off on §13 |
| **Prototype** | `frost-sirius-v1.html` |

**What changed from v1.0.** The client-facing half is deferred. v1.0 specified a platform where GCash requestors filed and tracked requests; v2.0 specifies a Frost-internal tool, with client access as a later release. Three findings drove this: ARES already ingests Trello, so the largest build item disappears; removing external users removes the entire cross-tenant security surface; and the forecasting model was found to be materially wrong, which has to be fixed before anyone is asked to trust a date.

**Approvals**

| Role | Purpose | Signed |
|---|---|---|
| Frost — Project Manager | Scope, business rules, forecast model | |
| Frost — Operations Lead | Deadlines view, cascade process | |
| Frost — Engineering | Feasibility, estimates | |
| Frost — Leadership | Budget, ownership | |
| GCash — Sponsor | *Only required at v2 (client access)* | |

---

## 1. Summary

Frost delivers design work to several clients through Trello boards, tracked in a pair of Google Sheets that have outgrown themselves — 6,342 production rows, broken cross-sheet links, and 4,020 status values reading `No Match`.

Sirius replaces the *planning and forecasting* half of that system: a pipeline register, a sprint schedule, an operations deadline view, and a delivery forecast. Trello remains where work happens. The intake sheet remains where clients file requests. Sirius reads both and owns neither.

It is **multi-project from the outset**. GCash: Design Support is the first engagement, not the only one.

The business case is not headcount. It is that a forecast becomes defensible, scheduling conflicts surface before they bite, and the manual reconciliation between two spreadsheets and a board stops consuming PM time.

---

## 2. Scope

### 2.1 In scope — v1

- Multi-project registry with per-project sources and settings
- **Requests** — read-only mirror of each project's intake sheet
- **Pipeline** — deliverables and work cards, sourced from Trello via ARES
- **Sprint Schedules** — list-plus-gantt planning, drag scheduling, multi-select, smart suggestions
- **Deadlines** — read-only operations view with conflict detection
- **Forecast** — dual-mode: the ported spreadsheet model and an empirical model rebuilt from ARES
- Google SSO restricted to `@frostdesigngroup.com`, with a named allow-list
- Read-only ingestion from Trello (via ARES) and Google Sheets (via service account)

### 2.2 Out of scope — v1

| Item | Deferred to |
|---|---|
| Client login and any client-visible surface | v2 |
| Request filing inside the platform | v3 |
| Google Chat notifications | v2 (they address clients) |
| Any write-back to Trello or Sheets | Not planned |
| Per-designer resource assignment | Later |
| Manual time tracking | Not planned — derived from Trello activity |
| Native mobile apps | Not planned |

### 2.3 Release ladder

| Release | Audience | Adds |
|---|---|---|
| **v1** | Frost only | Pipeline, scheduling, deadlines, forecasting, multi-project |
| **v2** | Frost + client read | Client login, scoped read-only views, Chat notifications |
| **v3** | Frost + client write | Request filing in-platform; the intake sheet retires |

Each release is independently useful. v1 delivers value without a single external user, which is what makes the security posture tractable.

---

## 3. Architecture

```
Trello boards ──► ARES ──────┐
                             ├──► Sirius ──► Frost users (SSO)
Intake sheets ──► sync worker┘
```

**Sirius reads; it never writes.** Trello is authoritative for execution state. The intake sheet is authoritative for request intent. Sirius owns only planning decisions — which week something is slotted into, confidence level, review SLA overrides, status notes, pins.

**ARES is the Trello integration.** It already polls Trello, holds 1,016 cards across 26 boards and 88,822 lane movements, and computes cycle times. Building a second Trello sync would duplicate roughly two weeks of work and create a permanent second thing to keep alive.

---

## 4. Data sources and what each supplies

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

**Urgency is resolved, and it is the one thing Sirius writes.** No urgency signal exists in either source today. It is set in the Pipeline view and written to the Trello card as a label named `Urgent`; its absence means non-urgent, so there is no second state to keep in sync. This puts the signal where the designers working the board can see it, rather than only inside Sirius. See §9 for the security consequence.

---

## 5. Card taxonomy — corrected

Verified against board `hLL7WW2V` (498 cards, 37 MC numbers):

- **MC number** — the client request. One row in the intake sheet.
- **`Main Card` label** — an individual deliverable within that request. **269 of them.** This is the planning and forecasting unit.
- **Everything else** — production tasks, prefixed by verb (`Render Asset:`, `Cascade Mobile Screen:`, `Icon Clean Up:`). **209 of them.**

**An MC number can carry many deliverables.** 15 do; MC-825 carries 99. And **tasks do not name their parent deliverable** — only 1 of 27 titles matched — so there is no dependable edge from a task to one `Main Card`. Tasks attach to the MC group.

Schema consequence: `mc_number` **is not a unique key**. Identity is `(project_id, trello_card_id)`, with a display id such as `MC-655.3` for multi-deliverable requests.

---

## 6. Functional requirements

### FR-1 — Projects

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | A project registry holds name, client, status, Trello board id, Trello label, intake sheet, sync endpoint, capacity and its own sprint list | M |
| FR-1.2 | Users switch project; all views scope to it | M |
| FR-1.3 | Where a board serves several projects, a Trello label disambiguates — 5 of 26 boards do this | M |
| FR-1.4 | Every table carries `project_id`; every query filters on it | M |
| FR-1.5 | Project settings are edited in the platform, not in code | S |

### FR-2 — Authentication

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Google SSO only; no local passwords | M |
| FR-2.2 | Access restricted to verified `hd` claim = `frostdesigngroup.com` **and** matching email domain | M |
| FR-2.3 | Verification is server-side against a session, never in the browser | M |
| FR-2.4 | A named allow-list on top of the domain check | M |
| FR-2.5 | Deactivating a Workspace account revokes access with no manual step | M |
| FR-2.6 | All state changes written to an immutable audit log | M |

### FR-3 — Requests (read-only)

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Mirror the project's intake tab; no editing, no write-back | M |
| FR-3.2 | Show MC #, deliverable, type, use case, requestor, deadline, brief, and a link to the source row | M |
| FR-3.3 | Derive status from the Trello join: *In pipeline* or *Not yet filed* | M |
| FR-3.4 | Skip pre-allocated MC rows silently and report the count | M |
| FR-3.5 | Surface unparseable rows with row number, reason and a link | M |
| FR-3.6 | Filter by filed / unfiled / missing deadline | S |

### FR-4 — Pipeline

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Deliverables listed with type, difficulty, urgency, current list, requestor, deadline, cycle time, links | M |
| FR-4.2 | Expand to reveal the MC group's work cards | M |
| FR-4.3 | Trello-sourced fields are read-only | M |
| FR-4.4 | Cards missing difficulty, deadline or Figma link are listed for correction, with links | M |
| FR-4.5 | Cycle time derived from Trello activity timestamps, not date fields | M |
| FR-4.6 | Urgency is set here and written back to Trello as an `Urgent` label; absence means non-urgent | M |
| FR-4.7 | A failed write rolls the local change back, so Sirius never shows a state Trello lacks | M |

### FR-5 — Sprint Schedules

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

### FR-6 — Deadlines

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

### FR-7 — Forecast

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | Column names match the Delivery Forecast sheet | M |
| FR-7.2 | A single forecast, from measured delivery. The ported spreadsheet formula is retained in code for migration tests but is not exposed | M |
| FR-7.3 | Empirical mode keys design time on difficulty **and** lane | M |
| FR-7.4 | Difficulty read-only; confidence selectable per card | M |
| FR-7.5 | Review SLA override replaces modelled review time and cascades | M |
| FR-7.6 | The empirical grid recomputes on a schedule from a rolling window | M |
| FR-7.7 | Model constants and sample sizes visible to users | S |

### FR-8 — Ingestion

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | Trello data read from ARES, not from Trello directly | M |
| FR-8.2 | Intake sheet read server-side via service account, `spreadsheets.readonly` | M |
| FR-8.3 | Sheet sharing stays Restricted; the service account is a named Viewer | M |
| FR-8.4 | Sheet rows that vanish are marked inactive, never deleted | M |
| FR-8.5 | Sync failures are logged and alerted; last good data remains visible | M |
| FR-8.6 | Sync status and last-success time visible in the UI | S |

---

## 7. Business rules

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

**BR-6a — Capacity is cards per week, sourced from ARES.** Each project's capacity comes from
`steering.deliveryForecast.referenceWeeks` in ARES, which already models the least productive, typical and most
productive week by card count. The typical week is the default; least and most bound the control. For rt-837 that is
1 / 120 / 367 cards, with an `effectiveWeeklyRate` of 90.2. Sirius does not invent a capacity unit.

*Caveat:* those reference weeks count every card on the board, including work cards and ops cards, while Sirius plans
deliverables. Expect the deliverable-level typical to be lower, and revise once ARES can report it.

**BR-6b — Hard mix ceiling.** Card count alone cannot distinguish a week of 120 easy cards from 120 hard ones, so a
second axis applies. Difficulty weights (Easy 1, Medium 2, Hard 4) are used *only* for this test. Measured across 27
weeks on board `hLL7WW2V`: hard share median **8.3%** (ideal), p85 **12.9%** (ceiling), observed max 20.4%. Weeks above
the median ran a median cycle of **24.1 h against 19.4 h** — roughly 24% slower per card. A week over the ideal is
flagged amber, over the ceiling red.

**BR-7 — Smart plan.** Order by urgency, then deadline, then difficulty descending. A week fills at the empirical throughput ceiling for its difficulty mix. Blocked cards are not scheduled into the current week. Pinned rows are immovable. Nothing applies without explicit acceptance.

**BR-7a — Unachievable mixes are reported, not refused.** Where the backlog's own hard share exceeds the ceiling, no
arrangement of weeks can satisfy it. The planner spreads hard work as evenly as possible, places everything, and states
plainly that the ceiling is unreachable. Refusing to schedule work would be worse than scheduling it with a warning.

**BR-8 — Multi-row move.** A drag applies the interval between the grabbed row's week and the drop week to every selected row.

**BR-9 — Deadline precedence.** Trello due date wins where present; otherwise the intake sheet's; otherwise none, and the card cannot raise a deadline conflict.

**BR-9a — Conflicts can be acknowledged.** Overlaps sometimes happen by choice. Any conflict banner may be dismissed,
which also removes its items from the replot list. A dismissal is keyed on *week + rule + the exact cards involved*, so
it silences one specific situation rather than the rule: if a card is added, removed, replotted or moves phase, the
conflict is a different one and surfaces again. Card-level indicators — the red render bar, the late flag — are never
suppressed. The alert is dismissible; the fact is not.

**BR-10 — Status classification.** Trello list names are free text, classified as Pending / Ongoing / Done by configurable keyword rules.

---

## 8. Non-functional requirements

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

---

## 9. Data protection

Sirius holds no personal data beyond staff names and work emails. It **does** hold unreleased client roadmap: deliverable names, dates and Figma links. That is the asset to protect.

- Frost staff only; all under NDA
- No external users until v2, which changes the risk profile materially
- ARES and Google Sheets are read-only by scope — write is impossible by permission, not merely by code
- **One exception: urgency.** Sirius adds or removes a single label named `Urgent` on a single Trello card, and writes nothing else anywhere. This requires a Trello token with write scope. Trello cannot scope a token per board, so it must be a **dedicated integration account** holding membership of the Design Support boards only — never a personal admin token. Every write is recorded in the audit log, and a failure rolls the local change back.
- Encryption in transit and at rest; audit logging; automatic offboarding

Full controls in *Pilot Security Readiness*. The sheet access model is in *Reading the Intake Sheet Without Exposing It*.

---

## 10. Acceptance criteria

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

---

## 11. Assumptions

| # | Assumption | If false |
|---|---|---|
| A1 | ARES continues to run and can expose a read interface | Trello sync returns to scope, +2 weeks |
| A2 | Trello remains the execution system | Integration scope changes |
| A3 | MC numbers stay in card titles | Grouping becomes heuristic |
| A4 | `Main Card` label keeps its meaning | Deliverable identification breaks |
| A5 | The intake sheet stays the filing mechanism until v3 | v3 accelerates |
| A6 | Frost owns and hosts the system | Vendor assessment enters the critical path |

---

## 12. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Forecast credibility lost because the model shipped uncalibrated | High | High | BR-3 rebuild is a release gate |
| R2 | Difficulty applied inconsistently | High | Medium | Publish a rubric with worked examples; review in retro |
| R3 | ARES snapshot ≠ live ARES; interface not yet built | Medium | High | Confirm the read interface in week 1 |
| R4 | Urgency never gets captured, so a conflict rule stays dead | High | Medium | Decide OD-4 before build |
| R5 | Multi-project introduced late, requiring retrofit | Low | High | `project_id` in the first migration |
| R6 | `#REF!` sheet data lost on archive | Medium | High | Recover before retiring the workbook |
| R7 | Assets lane bottleneck (231 h median) distorts planning | Medium | Medium | Model by lane; investigate separately |

---

## 13. Open decisions

| # | Decision | Owner |
|---|---|---|
| OD-1 | Where does ARES expose its data — shared DB, API, or replicated tables? | Engineering |
| OD-2 | Rolling window for the empirical model — 6 or 12 months? | PM |
| OD-4 | Should acknowledged conflicts expire after a set period, or persist until the cards change? | PM |
| OD-5 | Is `Client Approval` an ongoing or done state? | PM |
| OD-6 | Which projects are in v1 beyond GCash? | Leadership |
| OD-7 | Retention for closed requests and archived cards | Leadership |
| OD-8 | Hosting — Frost GCP, or elsewhere? | Leadership |

---

## Appendix A — Empirical constants

Measured from ARES, board `hLL7WW2V`, Jan–Jul 2026.

**Client review wait (days):** median 2.68 · p70 4.80 · p85 9.87 · p95 19.64 · mean 5.21 · n = 1,184

**Design time (days) by difficulty × lane, at p70:**

| Difficulty | design | ops | assets |
|---|---|---|---|
| Easy | 0.94 (n=1,126) | 1.03 (n=311) | 13.88 (n=353) |
| Medium | 1.20 (n=1,508) | 0.56 (n=385) | — |
| Hard | 2.09 (n=228) | 1.02 (n=121) | — |

**Throughput, cards completed per week:** Easy 29/50/75 · Medium 42/51/69 · Hard 7/9/11 (p25/p50/p70)

**Hard mix across 27 weeks:** median 8.3% · p70 9.6% · p85 12.9% · max 20.4%. Weeks above the median: 24.1 h median
cycle against 19.4 h below it.

**Capacity reference weeks** — from ARES `steering.deliveryForecast.referenceWeeks`, rt-837:

| | Week | Cards |
|---|---|---|
| Least productive | 2026-W03 | 1 |
| Typical | 2026-W21 | 120 |
| Most productive | 2026-W30 | 367 |

`effectiveWeeklyRate` 90.2 · `dailySampleSize` 207 · 30 weeks of `weeklyPairs` available.

These are a snapshot and are superseded by the scheduled refresh (FR-7.6).

## Appendix B — Referenced documents

| Document | Covers |
|---|---|
| `frost-sirius-roadmap.md` | Phasing, sequence, estimates |
| `ares-sirius-review.md` | ARES findings and corrections |
| `sirius-live-sheet-runbook.md` | Sheet connection implementation |
| `pilot-security-readiness.md` | Security controls and go/no-go |
| `sheet-access-security.md` | Service account model |
| `frost-sirius-v1.html` | Working prototype |
