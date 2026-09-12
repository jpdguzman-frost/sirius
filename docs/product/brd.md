> **Assembly note (2026-09-11).** Assembled verbatim from owl messages miles→jp #99–#102 (Set 2/5), stripping owl headers and part-banner text only. **No gaps or overlaps found** — each part's content picks up exactly where the previous part's "Part N of 4 ends here" pointer said it would (part 2 opens at §5 Card taxonomy as promised by part 1; part 3 opens mid-BR-1b as promised by part 2; part 4 opens at §8 NFRs as promised by part 3). The trailing owl commentary ("End of BRD v3.0," corrections tally, forward references to sets 3/5–5/5) was stripped from the end of part 4 as it is message meta-text, not document content.

---

# Business Requirements Document
## Frost: Sirius — Delivery Pipeline & Forecasting Platform

> **ADOPTED 2026-09-12 (JP).** This is the held copy — the *what* the constitution
> points at. It replaces v2.2, archived beside it as `brd-v2.2.md`; v2.2's interim
> engineering banner retires with it, all four of its points now settled in the body
> (the write registry is enumerated at four in §9/FR-4.10/FR-4.11 · OD-1 struck ·
> acknowledgement withdrawn and deleted · §2.1's dual-mode line gone).
>
> **One engineering carry-forward:** §13 still lists **OD-8 (hosting)** as open with
> leadership. It was answered on the build side 2026-08-03 — Sirius deploys beside
> ARES, per the constitution's Stack section — so read OD-8 as open for product
> paperwork only, not as an undecided build question.
>
> **Acceptance-criteria numbering:** AC-21–AC-26 below are authoritative (JP,
> 2026-09-12). The four criteria added here on 2026-08-12 under those numbers moved
> to AC-27–AC-30 in `specs/001-sirius-v1/spec.md`; AC-12 retires with FR-7.5. State
> logs and commit messages written before that date keep the old numbering — they are
> archive, and are not rewritten.

| | |
|---|---|
| **Document** | BRD — Frost: Sirius |
| **Version** | 3.0 |
| **Date** | 10 September 2026 |
| **Supersedes** | BRD — Design Support Platform v1.0 (31 Jul 2026) |
| **Changes in 3.0** | ⚠️ **Body sweep. v2.9 was current in its changelog and roughly v2.5 in its body** — every section the work-card rework touched had been left behind, and the document argued with the build spec in about fifteen places. Corrected: **§3** no longer claims *"Sirius reads; it never writes"* · **BR-10** no longer specifies the **keyword classifier that was retired** (it misclassified 9 of 20 lanes) · **FR-6 rewritten** on the work-card unit with all conflict machinery removed · **FR-4.4, FR-4.8, FR-5.2, FR-5.4, BR-6, BR-9a, BR-9b, BR-3a, AC-17, AC-18** corrected or withdrawn · **FR-7.3, BR-2, BR-4** now key design time on the **work-type label, not the lane** (JP's 17,986-card audit, 9 Sep) · **BR-1a**'s claim that review is still computed removed, it contradicted BR-1b in the same document · **OD-4 dead, OD-5 answered**. No new decisions were taken in this sweep; every correction records a ruling already made. |
| **Changes in 2.9** | **W4 is now actually amended into the governing text.** v2.8's changelog announced the fourth write, but §9 still read *"three enumerated exceptions"* and *"a fourth write requires an amendment"* — the amendment was declared and never made, so no code path could legitimately assume it. §9 now enumerates **four**, FR-4.10 reads four-and-a-fifth-needs-amendment, and **FR-4.11 is added** for classification tagging, **scoped to BUSINESS UNIT only** — pillar and use case are out of scope for v1 (Miles, 10 Sep), *use case* being the former name of `UNIT` rather than a second axis. The constraint is stated in every place the write is: **Sirius assigns existing Trello labels only and never creates one.** ⚠️ **Open, and not part of this amendment: which surface performs the tagging.** The write is authorised; the UI is unspecced. |
| **Changes in 2.8** | **Review time is retired (BR-1b).** Sirius schedules work cards; a work card is done and closed internally, and client review is not part of its duration. Withdrawn with it: `Sketch Approved` as a computed date, the review percentile table, the review term in Total Cycle Time, **FR-7.5** and **AC-12**. The confidence percentile now applies to **design time only**. BR-3 becomes historical rather than governing. **FR-7.7 retired** — no user asked for the model grid; the team needs the bar and the confidence selector, both of which exist. AC-11's provenance clause drops with it. **Roadmap 4.6 is no longer at risk** — the workbook's two jobs, sprint slating and deadlines, are exactly what Sprint Schedules and Deadlines now do. **W4 added to the write registry:** business unit / pillar / use case tagging, constrained to **assigning existing Trello labels only — Sirius never creates a label**. Watch: client-review lanes remain "ongoing" in the lane mapping, so a card held by a client rolls forward daily. |
| **Changes in 2.7** | **Suggest plan withdrawn from Sprint Schedules.** FR-5.7, FR-5.8, BR-7, AC-15 and AC-16 withdrawn; §2.1 and roadmap 3.4 updated. Removed to observe how the tool is used in practice; if a smart suggest proves warranted it will be rebuilt in a different form. **Not withdrawn:** `planner.ts` (`weekLoad`, `cardWeight`, WEIGHTS / HARD\_MIX stay load-bearing — only `suggestPlan()` goes dormant, kept not deleted), FR-5.10 throughput settings (they drive displayed capacity independently), and BR-7a unachievable-mix reporting. **FR-5.9 orphaned:** pinning existed so suggestions could not move a row, and now protects against nothing — needs a second purpose or withdrawal. **Sprint Schedules now schedules work cards, not deliverables.** FR-5.2 rewritten: one bar per row, and **sketch and render are separate rows** — each an actual Trello task card with a start and a forecasted finish. The review segment and its legend entry go, because review is not a task but the client waiting between two tasks. **BR-1 and BR-2 are unchanged** — review is still computed and still moves Sketch Approved. Ruled by Miles: out of the drawing, not out of the arithmetic; and with the phases on separate rows there is no gap left to misread as slack. **The tab is not a mirror of the board** — work cards enter only when the PM adds them through the Add Sprint Item Row, so an absent card is not a sync failure and must not be reconciled or warned about. Consequence still open: FR-7.5's review SLA override was orphaned by the Forecast tab withdrawal, so review drives dates while being adjustable nowhere. |
| **Changes in 2.6** | **The Forecast tab is withdrawn. Four tabs remain: Requests, Pipeline, Sprint Schedules, Deadlines** (plus Admin). The forecast **model is unaffected** and continues as an internal engine — the remaining tabs depend on it for projected dates, week capacity from `deliveryForecast.referenceWeeks`, day capacity by largest remainder, and the *Past deadline* conflict rule. §2.1, §3 and FR-7 updated; AC-11 rescoped. **Three controls are orphaned and need a home or an explicit drop:** FR-7.4 confidence, FR-7.5 review SLA override, FR-7.7 model constants and sample sizes. Roadmap 4.6 — retiring the Forecast workbook — is at risk, the withdrawn tab having been its successor surface. |
| **Changes in 2.5** | Capacity expressed in cards per week from ARES reference weeks · hard-mix ceiling added · sprints are editable data, not a cadence · urgency written back to Trello · conflicts can be acknowledged · spreadsheet forecast mode retired, measured model only · **two enumerated writes: the Urgent label and the card due date** · v1 scope note added: Frost-internal, no vendor assessment or DPA until v2 |
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

Sirius replaces the *planning and forecasting* half of that system: a request register, a pipeline register, a sprint schedule and an operations deadline view, all resting on a delivery forecast that runs beneath them rather than as a screen of its own. Trello remains where work happens. The intake sheet remains where clients file requests. Sirius reads both and owns neither.

It is **multi-project from the outset**. GCash: Design Support is the first engagement, not the only one.

The business case is not headcount. It is that a forecast becomes defensible, scheduling conflicts surface before they bite, and the manual reconciliation between two spreadsheets and a board stops consuming PM time.

---

## 2. Scope

### 2.1 In scope — v1

- Multi-project registry with per-project sources and settings
- **Requests** — read-only mirror of each project's intake sheet
- **Pipeline** — deliverables and work cards, sourced from Trello via ARES
- **Sprint Schedules** — list-plus-gantt planning at **week grain**, multi-select
- **Deadlines** — read-only day-level view for the design lead. **No conflict detection** — withdrawn; a count replaced it
- The empirical forecast model, rebuilt from ARES — an internal engine, not a tab. It supplies the projected dates, week capacity and day capacity the four tabs above depend on
- Google SSO restricted to `@frostdesigngroup.com`, with a named allow-list
- Read-only ingestion from Trello (via ARES) and Google Sheets (via service account)

### 2.2 Out of scope — v1

| Item | Deferred to |
|---|---|
| Client login and any client-visible surface | v2 |
| Request filing inside the platform | v3 |
| Google Chat notifications | v2 (they address clients) |
| Write-back to **Sheets** | Not planned — the `spreadsheets.readonly` scope enforces it |
| Write-back to **Trello beyond the four enumerated writes** | A fifth requires an amendment to this document (§9) |
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

⚠️ **Sirius reads almost everything and writes four enumerated things.** An earlier version of this section said *"Sirius reads; it never writes"* — that has been false since v2.4 and flatly contradicts §9. The four writes are the `Urgent` label, the card due date, the `Difficulty: …` label and business-unit tagging; **a fifth requires an amendment to this document.**

Trello is authoritative for execution state. The intake sheet is authoritative for request intent. Sirius owns only planning decisions — which week something is slotted into, which day within it, confidence level, status notes and pins. *(Review SLA overrides were retired with review time — BR-1b.)*

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
| **Unit** (was Use case), brief, requestor | Intake sheet — the `Business Unit` column | 98% / 99% / 100% |
| Urgency | Set in Sirius, written to Trello as an `Urgent` label | 0 / 26 boards today — created on first use |

**BR-note on deadlines.** An earlier draft required the team to start setting Trello due dates. Measurement showed the sheet already holds them at 93% coverage while Trello holds 0.8%. Sirius therefore reads deadlines from the sheet and joins on MC number, raising pipeline deadline coverage from 1/269 to 169/269 with no behaviour change. A Trello due date, where present, wins — it was set deliberately.

**Urgency is resolved, and it was the first of the four things Sirius writes.** No urgency signal exists in either source today. It is set in the Pipeline view and written to the Trello card as a label named `Urgent`; its absence means non-urgent, so there is no second state to keep in sync. This puts the signal where the designers working the board can see it, rather than only inside Sirius. See §9 for the security consequence.

---
## 5. Card taxonomy — corrected

Verified against board `hLL7WW2V` (498 cards, 37 MC numbers):

- **MC number** — the client request. One row in the intake sheet.
- **`Main Card` label** — an individual deliverable within that request. **269 of them.** ⚠️ **This is NOT the planning unit** — it was until the work-card rework, and this line said so. It is the **tracking** unit: it reflects where a deliverable stands, and Pipeline filters on it. **The planning and forecasting unit is the work card.**
- **Everything else** — production tasks, prefixed by verb (`Render Asset:`, `Cascade Mobile Screen:`, `Icon Clean Up:`). **209 of them.** ⚠️ **These are the work cards, and they are what Sirius schedules, forecasts, urges and dates.**

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
| FR-3.2 | Eleven columns: MC #, Year, Month, Deliverable, Type, **UNIT**, Requestor, Deadline, Brief, Status, Frost notes — plus a link to the source row. **`UNIT` is the renamed `Use Case`**, sourced from the sheet's `Business Unit` column; the sheet's name lives in the parser, not on screen | M |
| FR-3.3 | Derive status, never store it. **Three values:** *In Pipeline* (MC # found in Trello — this **is** the filed state) · *For Filing* (MC # absent) · *For Clarification* (the Sirius-only flag). `Filed` is not a value. **A clarified row is both For Filing AND For Clarification**, so status counts sum past the row count by design | M |
| FR-3.4 | Skip pre-allocated MC rows silently and report the count | M |
| FR-3.5 | Surface unparseable rows with row number, reason and a link | M |
| FR-3.6 | One filter panel, **six axes** — `YEAR · MONTH · TYPE · UNIT · REQUESTOR · STATUS` — multi-select, per-value counts. Every axis must appear verbatim as a column header. Default sort *Recently requested*. ⚠️ **Tiles do not filter** (retired 10 Sep); the Filter button is the only filter door | M |
| FR-3.7 | Frost can flag a request as **needs clarification**, with a reason, blocking it from filing | M |
| FR-3.8 | Frost can add an internal **remark** to any request | M |
| FR-3.9 | Neither is written back to the intake sheet | M |
| FR-3.10 | Both are shared across the team and durable across sessions | M |

### FR-4 — Pipeline

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

### FR-5 — Sprint Schedules

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

### FR-6 — Deadlines

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

### FR-7 — Forecast engine

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

**Scope note.** v1 is Frost-internal. No GCash user logs in, and Frost owns the Trello workspace and the intake sheet. There is therefore **no vendor security assessment and no separate Data Processing Agreement for v1** — Frost is already an assessed supplier under the existing engagement, and Sirius is a tool used inside it, not a new arrangement. Both first arise at v2, when client access lands. The controls below exist because the data is confidential, not because a regulator has asked for them.

- Frost staff only; all under NDA
- No external users until v2, which changes the risk profile materially and
  brings a vendor assessment, a DPA and cross-tenant authorisation with it
- ARES and Google Sheets are read-only by scope — write is impossible by permission, not merely by code
- **Four enumerated exceptions, all to Trello and nothing else:**
  1. **Urgency** — adds or removes a single label named `Urgent` on a card. Absence means non-urgent, so there is no second state to keep in sync.
  2. **Card due date** — ⚠️ **set on a work card in SPRINT SCHEDULES**, which sets or clears the Trello due date. *(This clause used to say Pipeline; Pipeline now reflects the deadline as plain text — FR-4.8.)* Default 17:00 Manila; an existing time of day is preserved. There is no Sirius-local override layer, so a date changed in Trello flows back automatically. This applies equally to a deliverable and to its task cards; task-card dates take no part in deadline precedence or forecasting, and a task has no sheet fallback, so clearing means cleared.
  3. **Card difficulty** — setting difficulty on Pipeline swaps the card's `Difficulty: …` label. The new label is **added before the stale one is removed**, so the card is never left without a difficulty; a failed removal is rolled back by removing the label just added.
  4. **Classification tagging — BUSINESS UNIT only.** Assigns and unassigns labels drawn from a **named set created on Trello by Frost**. Scoped to the one field Sirius actually holds: `UNIT`, sourced from the intake sheet's `Business Unit` column. **Pillar and use case are explicitly out of scope for v1** — pillar is not read by Sirius at all, and *use case* is the former name of `UNIT`, not a second axis. Extending W4 to a further field is a fresh amendment. ⚠️ **Sirius never creates a Trello label.** A tag whose label does not already exist on the board cannot be applied, and the attempt is surfaced rather than resolved by creating one. This is what keeps the write enumerable: the set of labels Sirius can apply is bounded by the board, not by user input.
- Nothing else is written anywhere. **A fifth write requires an amendment to this document, not a code change.** In particular, internal remarks and the clarification flag are held in Sirius only and are never written to Trello, and the intake sheet remains a read-only mirror.
- All four need a Trello token with write scope. Trello cannot scope a token per board, so it must be a **dedicated integration account** holding membership of the Design Support boards only — never a personal admin token.
- All four are optimistic in the UI and roll back on failure, so Sirius never shows a state Trello does not hold. Every write of any of the four is recorded in the audit log with actor and before/after, and is no-op guarded — an edit that changes nothing writes nothing.
- Writes are additionally gated **per project**: a project in observation mode refuses all writes server-side and the corresponding controls render read-only.
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

---

## 11. Assumptions

| # | Assumption | If false |
|---|---|---|
| A1 | ARES continues to run | ✅ *The read interface exists.* If ARES were retired, Trello sync returns to scope, +2 weeks |
| A2 | Trello remains the execution system | Integration scope changes |
| A3 | MC numbers stay in card titles | Grouping becomes heuristic |
| A4 | `Main Card` label keeps its meaning | Deliverable identification breaks |
| A5 | The intake sheet stays the filing mechanism until v3 | v3 accelerates |
| A6 | Frost owns and hosts the system | Vendor assessment enters the critical path |

---

## 12. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| ~~R1~~ | ~~Forecast credibility lost because the model shipped uncalibrated~~ | — | — | ✅ **Mitigated.** The gate passed; the PM accepted the model. ⚠️ *The live risk that replaced it: Content and Motion cells carry borrowed figures — see R7* |
| R2 | Difficulty applied inconsistently | High | Medium | Publish a rubric with worked examples; review in retro |
| ~~R3~~ | ~~ARES snapshot ≠ live ARES; interface not yet built~~ | — | — | ✅ **Resolved 2026-08-03.** ARES pushes on change, ~37 s end to end, 15-min poll as fallback. ⚠️ *Sirius depends on ARES's `lastPolledAt`, which ARES's own survey still lists as read by nobody — if it is removed, reconciliation fails silently* |
| ~~R4~~ | ~~Urgency never gets captured, so a conflict rule stays dead~~ | — | — | **Void.** There are no conflict rules (BR-6), and urgency is captured — it drives the bar colour, the quote bar and a metric tile |
| R5 | Multi-project introduced late, requiring retrofit | Low | High | `project_id` in the first migration |
| R6 | `#REF!` sheet data lost on archive | Medium | High | Recover before retiring the workbook |
| R7 | Slow work-type cells distort planning | Medium | Medium | Model by **work-type label** (BR-4), not lane. ⚠️ Every Content and Motion cell currently carries a **borrowed** figure; if Content cycle time ever matters commercially the fix is on the board — the team has to move cards when work starts |

---

## 13. Open decisions

| # | Decision | Owner |
|---|---|---|
| ~~OD-1~~ | ~~Where does ARES expose its data?~~ — **RESOLVED 2026-08-03** | — |
| OD-2 | Rolling window for the empirical model — 6 or 12 months? | PM |
| ~~OD-4~~ | ~~Should acknowledged conflicts expire, or persist until the cards change?~~ — **DEAD.** Conflicts and acknowledgement were withdrawn and the implementation deleted 2026-09-07 | — |
| ~~OD-5~~ | ~~Is `Client Approval` an ongoing or done state?~~ — **ANSWERED: Ongoing**, per the lane mapping | — |
| OD-6 | Which projects are in v1 beyond GCash? | Leadership |
| OD-7 | Retention for closed requests and archived cards | Leadership |
| OD-8 | Hosting — Frost GCP, or elsewhere? | Leadership |

---

## Appendix A — Empirical constants

Measured from ARES, board `hLL7WW2V`, Jan–Jul 2026.

**Client review wait (days)** — ⚠️ **HISTORICAL ONLY. Review time is retired (BR-1b) and nothing computes it.** Kept because it is the evidence that the spreadsheet overstated review by 2.6–4.6×, and therefore why the spreadsheet's numbers must never be reintroduced: median 2.68 · p70 4.80 · p85 9.87 · p95 19.64 · mean 5.21 · n = 1,184

**Design time (days) by difficulty × lane, at p70** — ⚠️ **SUPERSEDED.** This table is keyed on *lane*, which BR-4 corrected to the **work-type label** on 2026-09-09, and its figures predate the 50-move fix that was biasing every duration downward. Retained only to show the magnitude of the Easy/assets vs Easy/design gap that proved difficulty alone is invalid. **The live grid is 134 work-type × difficulty cells, held by Engineering.**

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
| **`sirius-build-spec-1.3.md`** | **Screen-by-screen build authority — the most detailed of the set** |
| **`AGENTS.md`** | **Traps and boundaries; read before writing code** |
| `deadlines-agreements-03-september.md` | Deadlines agreements, marked built / open / overtaken |
| `domain-knowledge-from-alignment.md` | Why the specs are shaped this way |

---
