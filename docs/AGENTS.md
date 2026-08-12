# AGENTS.md — Frost: Sirius

Read this before writing code. It records what is **not** derivable from the
Figma file, the prototype source, or the Trello board — the reasoning, the
traps, and the boundaries.

Tokens are not covered here. They are in the file and in
`colour/radius/spacing/typography-mode-1.css`, and they describe themselves.

---

## 1. What this is

A Frost-internal planning and forecasting platform over an existing Trello
workflow. Five tabs: Requests, Pipeline, Sprint Schedules, Deadlines, Forecast.
Multi-project from day one. No client access in v1.

**Sirius reads; it does not own.** Trello is authoritative for execution state.
The intake sheet is authoritative for request intent. Sirius owns only planning
decisions: slotted week, day placement, confidence, review SLA overrides,
status notes, pins, conflict acknowledgements.

---

## 2. The two writes

Everything is read-only except **two enumerated writes**:

1. **Urgency** — adds or removes a Trello label named `Urgent`. Absence means
   non-urgent; there is no second state to keep in sync.
2. **Card due date** — editing a deadline on Pipeline writes the Trello due
   date, set or clear. Default 17:00 Manila, existing time of day preserved.
   There is no Sirius-local override layer, so a change made in Trello flows
   back automatically.

Nothing else is written anywhere.

- Both are optimistic in the UI and **rolled back on failure**. Never show a
  state Trello does not hold.
- Needs a Trello token with write scope. Trello cannot scope per board, so it
  must be a dedicated integration account holding membership of the Design
  Support boards only — never a personal admin token.
- Every write of either kind produces an audit row.

**Adding a third write requires a governance amendment, not a code change.**
The enumerated-write posture is quoted in the BRD, the pilot security readiness
doc and the vendor assessment. If a ticket seems to need one, stop and raise it.

---

## 3. Data model traps

These cost real time to discover. All verified against board `hLL7WW2V`.

**`mc_number` is not unique.** 15 MC numbers carry more than one deliverable;
MC-825 carries 99. Identity is `(project_id, trello_card_id)`. Display id is
`MC-655.3` for multi-deliverable requests.

**Task cards do not link to a specific deliverable.** Only 1 of 27 task titles
matched a deliverable name. Tasks attach to the **MC group**, not to a parent.
Any model assuming a clean two-level tree will mis-assign work.

**A board can serve several projects.** 5 of 26 do. `gZxV4FkK` carries two,
`VB5bz5WX` carries three. Filter on board **and** `trello_label`, or three JFC
brands appear as one pipeline.

**Card counts that must reconcile:** 269 deliverables + 209 tasks = 478 live
cards. If your ingestion produces a different total, something is being dropped
or double-counted.

**Figma variables alias each other.** `domain/hard → red/500 → #ef4444`. Any
code resolving variables must follow the chain, or the entire semantic layer
disappears and only primitives survive.

---

## 4. Business rules you cannot infer

**Forecast dates.** Sketch delivery = `WORKDAY(start, lead + design)`. Sketch
approved = `WORKDAY(sketch delivery, review)`. Render begins on the **Friday of
the sketch-approval week** — not the day after approval. Business days,
Philippine holidays excluded, Asia/Manila.

**The forecast is empirical, and the old model was wrong.** Measured client
review wait across 1,184 completed cycles: median 2.68 d, p70 4.80. The retired
spreadsheet used 12.5–22 d at p70 — 2.6× to 4.6× too high. That is why early
builds showed every card as late. Do not reintroduce the spreadsheet numbers.
`forecast.legacy.ts` exists only so tests can prove the port was faithful.

**Design time is keyed on difficulty AND lane.** In aggregate Easy looks slower
than Medium (21.6 h vs 13.0 h median), which suggests the labels are noise. They
are not — within the `design` lane it is a clean 4.2 → 18.1 → 28.1 h. The
anomaly is that Easy cards cluster in the `assets` lane, median 231 h. Keying on
difficulty alone is invalid.

**Capacity is cards per week, from ARES.** `deliveryForecast.referenceWeeks`
gives least / typical / most: 1 / 120 / 367 for rt-837. Do not invent a unit.

**A row weighs itself plus its share of its MC's tasks.** `1 + tasks ÷
siblings`. MC-805: 13 deliverables, 40 tasks → each weighs 4.08, group weighs
53. Attaching all 40 to whichever row came first made one week read 40 and the
other twelve read 1.

**Both phases carry full weight, in their own weeks.** A deliverable with 3
work cards counts 3 in its sketch week and 3 in its render week. Sketching three
assets is three pieces of work; rendering them later is another three.

**Hard mix ceiling.** Ideal 8.3%, ceiling 12.9%, from 27 measured weeks. Weeks
above the median ran a median cycle of 24.1 h against 19.4 h — about 24% slower
per card. Difficulty weights (Easy 1, Medium 2, Hard 4) are used **only** for
this test, not for capacity.

**Where the backlog itself exceeds the ceiling**, the planner spreads hard work
evenly, places everything, and says the ceiling is unreachable. Refusing to
schedule is worse than scheduling with a warning.

**Deadline precedence.** Trello due date wins where present, else the intake
sheet's, else none — and a card with none can never raise a deadline conflict.
The sheet has 93% coverage; Trello has 0.8%.

**Sprints are data, not a cadence.** Editable per project, variable length.
Overlaps rejected on save, gaps allowed and surfaced. A week covered by no
sprint appears under *Outside any sprint* rather than being absorbed.

**Day placement never changes the week.** Ops places milestones on days; the
week comes from Sprint Schedules. Day capacity is the week's capacity across
non-holiday days using **largest remainder**, so the total is exact — per-day
rounding drifts it (22 over 4 days rounds to 24).

**Conflict acknowledgement is keyed on the situation.** `week + rule + the exact
cards involved`. Add, remove, replot or re-phase a card and it resurfaces. Never
key on the rule alone — that turns a warning off permanently by accident.

---

## 5. Things that look like bugs and are not

| Observation | Explanation |
|---|---|
| Every card shows as late | The old percentile grid. Rebuild from ARES before building UI |
| Easy cards slower than Medium | Lane mix. Split by lane and it resolves |
| 495 rows "rejected" on import | Pre-allocated MC numbers — skip silently, count separately |
| Two columns named `Type` in the sheet | Col B is card type, col L is asset type. Disambiguate by position |
| `Primary\nRequestor` has a newline | Normalise whitespace when matching headers |
| Sheet dates arrive as `45308` | Serial numbers, 1899-12-30 epoch |
| Rows come back short | Sheets omits trailing empty cells. Pad before positional parsing |

---

## 6. Security boundaries

- **Authorisation is server-side on every endpoint.** Hiding a tab is not access
  control. The prototype's browser-side `hd` check is a UX affordance only.
- **Four auth checks:** verified email, `hd` claim, matching email domain, active
  allow-list row. A domain check alone lets in everyone who ever joins.
- **`project_id` on every table, filtered in every query.** Retrofitting tenancy
  is as painful as retrofitting authentication.
- **Sheet access via service account, `spreadsheets.readonly`.** The sheet stays
  Restricted. Never publish it, not even to test — a public Sheets URL cannot be
  un-shared from anyone who already fetched it.
- **No brief text or credentials in logs.**
- The sensitive asset is unreleased client roadmap, not personal data. Treat
  deliverable names and dates accordingly.

---

## 7. Build order

1. Schema and migrations — `project_id` from the first line
2. Auth, allow-list, audit log — **before** any write path exists
3. Port `forecast`, `planner`, `calendar` from the prototype, with golden tests
4. ARES read (blocked on OD-1), then intake sync
5. **Rebuild the percentile grid and validate it** — this is a gate, not a task
6. UI, five tabs
7. Urgency write, last, with its own review

Step 5 is a gate because a schedule where everything reads late is ignored
within a week, and you do not get a second first impression.

---

## 8. Still open

| # | Question |
|---|---|
| OD-1 | How ARES exposes its data — shared DB view, API, or replication. **Blocks step 4** |
| OD-2 | Model refresh window — 6 or 12 months |
| OD-4 | Do acknowledged conflicts expire, or persist until the cards change |
| OD-5 | Is `Client Approval` an ongoing or a done state |
| OD-6 | Which projects beyond GCash are in v1 |
| OD-7 | Retention for closed requests |
| OD-8 | Hosting and ownership — Frost or GCash |

Do not guess these. They change scope.

---

## 9. Prototype vs production

`frost-sirius-v1.html` is a working prototype, not a reference implementation.

| Prototype | Production |
|---|---|
| State in memory, resets on refresh | Postgres |
| Auth checked in the browser | Verified server-side |
| Trello read via a key pasted into the UI | Backend with stored credentials |
| Sheet via CSV import | Service account, scheduled |
| Sprint edits, day plans, acknowledgements are session-only | Persisted and shared |

The parts worth lifting verbatim are `forecast()`, `forecastSmart()`,
`workday()`, `toFriday()`, `weekLoad()`, `cardWeight()` and `suggestPlan()`.
They are pure, tested against real data, and took several rounds to get right.

---

## 10. Companion documents

| File | Covers |
|---|---|
| `BRD-frost-sirius.md` | Scope, requirements, business rules, acceptance criteria |
| `frost-sirius-engineering.md` | Schema, stack, infrastructure, sync workers |
| `frost-sirius-roadmap.md` | Phases, gates, sequencing |
| `ares-sirius-review.md` | What ARES already provides and what to inherit |
| `sirius-live-sheet-runbook.md` | Sheet connection, step by step |
| `pilot-security-readiness.md` | Controls and go/no-go |
| `frost-sirius-v1-functionality.md` | Everything the prototype does |
