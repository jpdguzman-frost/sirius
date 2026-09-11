# Contract — HTTP API (Express routes)

Route groups are fixed by the repository layout (plan.md, ARES conventions). Exact handler signatures are decided at implementation; the rules below are contractual for every route.

## Universal rules (every route, no exceptions)

1. **Auth re-check server-side** on every call: valid session AND caller's membership of the target project (invariant 9, NFR-6). A session calling an API for another project gets **403** (AC-3). Hiding a tab is not access control.
2. **Zod validation at the boundary** — never trust a body.
3. **`project_id` scoping** on every query (invariant 1, FR-1.4).
4. **Audit**: every state change writes an immutable `audit_log` document — schedule moves, pins, SLA overrides, urgency, project settings (invariant 10, FR-2.6). Historical `conflict.acknowledge` / `conflict.restore` rows stay forever; nothing writes them any more (owl #87, 2026-09-08).
5. Trello- and sheet-owned fields are **read-only** through this API; the write path refuses anything Sirius doesn't own. The single exception is urgency (own contract: `trello-write.md`).
6. **No credential ever reaches the browser** — the ARES key, Trello tokens and Sheets credential live server-side only; the frontend talks exclusively to Sirius's own routes.

## Route groups

| Group | Purpose | Access | Writes |
|---|---|---|---|
| `src/routes/requests.js` | Intake mirror read (FR-3.x) | Session + membership | None — read-only mirror |
| `src/routes/deliverables.js` | Pipeline read (FR-4.1–4.5) | Session + membership | None |
| `src/routes/schedule.js` | Slot, pin, bulk replot (FR-5.x, BR-8); Sirius-owned planning fields only (slotted week, pin, confidence, SLA overrides, status note); sprint CRUD with overlap rejection (FR-5.14–5.15); sprint items (owl #72) | Session + membership | Sirius-owned fields + `audit_log` |
| `src/routes/urgency.js` | THE write path — see `trello-write.md` | Session + membership | `deliverables.urgency` + Trello label + audit |
| worker-internal sync | Sync is triggered inside the worker process, not via public HTTP (plan.md) | No public surface | Source-mirror fields + `sync_runs` |

## Sprint items — the placement guards (JP 2026-09-08; the week bound owls #88/#89, JP 2026-09-10)

Two owners, one route (§6.2's two-owner model). The **PM owns the week**, on
Sprint Schedules: a `week` (its Monday) places the bar on that week's FIRST
WORKING DAY, resolved server-side on the canonical calendar. The client's own
holiday list (`80-loaders.js`, used for the sprints-modal gap banner and,
since PLAN amendment 13, the Deadlines keyboard nudge) is a display/stepping
copy, never a judge — the server's ARES calendar is the sole authority
everywhere a day is accepted or refused, on either owner's write. **(reworded
REVIEW 2026-09-12; was "the browser holds no holiday set" — the payload
carries one.)** The **Design Lead owns the day**, on Deadlines: a non-null
`starts_on` moves the bar within the week the row already has, never past
either edge. Only rollover crosses a week, as a system action (§6.2). The
Deadlines day write is gated by SURFACE only (JP 2026-09-11) — any project
member may send it; there is no role check.

Every route that accepts a day judges it on the SAME validator — `plotIssue()`
in `src/services/sprint-items.ts` — so the four answers cannot drift per route.
Refusals are **422** with body `{ ok: false, error: { code, message } }`, the
envelope the sprint-save conflict (`SPRINT_CONFLICT`) already uses; the client
prints the server's `message` verbatim.

| Code | Refused when | Message |
|---|---|---|
| `OUT_OF_WEEK` | the row already has a week (its current `starts_on`'s local Monday, `weekKeyOf()` — derived, never stored) and the day falls in another week. Asked only by the day write; a `week` placement chooses the week and is not bound by the old one | `That day is outside the card's assigned week (Mon 3 Aug 2026 – Fri 7 Aug 2026).` |
| `OUT_OF_SPRINT` | the day falls outside the sprint's own `starts_on`..`ends_on` — the range is INCLUSIVE, so both boundary days are legal. SKIPPED for a row *Outside any sprint* (`sprint_id: null`, owl #90): it has no range to be inside | `That day is outside the sprint's dates (3 Aug 2026 – 14 Aug 2026).` |
| `PAST_DEADLINE` | the card carries a Trello due date and the day is AFTER it. The deadline day itself is a legal start; a FINISH past the deadline stays legal and paints the bar red (R9-b) | `That day is after the card's deadline (5 Aug 2026).` |
| `NOT_A_WORKDAY` | the day is a weekend, or a holiday on the ACTIVE working-day calendar — the ARES set loaded into `lib/calendar.ts` (invariant 11). Also the answer to a `week` with no working day at all, with the words `That week has no working day.` | `That day is not a working day.` |

Checked in that order — `OUT_OF_WEEK` → `OUT_OF_SPRINT` → `PAST_DEADLINE` →
`NOT_A_WORKDAY`: a day can fail all four, and the person is told the first
thing wrong with it, the narrowest bound first.

| Route | Guarded when |
|---|---|
| `PATCH /api/projects/:projectId/sprint-items/:itemId` | body `{ starts_on?: DATE\|null, week?: DATE, sprint_id?: OBJECT_ID }`, `.strict()`. **`week`** (must be its own Monday, else 400 `INVALID_BODY`; with `starts_on` in the same body → 400): the server sets `starts_on = firstWorkdayOfWeek(week)` and asks the three non-week checks against the TARGET sprint — `sprint_id` given → that sprint (bare-move semantics); the row's own otherwise; a row with `sprint_id: null` and none given → the sprint whose dates cover the resolved day, else it stays outside (invariant 12: gaps are legal). **Non-null `starts_on`** (the Deadlines day write): all FOUR checks, `assignedWeek` = the row's current week, against the target sprint when the same request moves the row. A row with no `starts_on` → 422 `NOT_PLACED` (`That card has no week yet — place it on Sprint Schedules first.`): there is no week to stay inside. `starts_on: null` un-plots and is never judged. A bare `sprint_id` move is judged too, on the RANGE alone — see below. The 200 body carries the resolved `starts_on` and `sprint_id` (the week click draws at the Monday until this answer names the day) — the client re-stamps the row from THIS body before its own reload runs (PLAN amendment 17), so a reload that silently fails can never leave a day the server did not give (invariant 8) |
| `POST /api/projects/:projectId/sprint-items` | the optional `starts_on` is present — the three non-week checks (a fresh placement has no week to stay inside). The card-state refusals (409 `CARD_COMPLETE` / `CARD_EXCLUDED`) answer first — a card that cannot be scheduled at all is not a question about a day |
| `POST /api/projects/:projectId/sprint-items/batch` | **never** — the batch body has no `starts_on` and `.strict()` refuses one (400 `INVALID_BODY`), so its rows land unplotted by construction (#72 §6) and its skip list (`NOT_FOUND`, `CARD_COMPLETE`, `CARD_EXCLUDED`, `ALREADY_SCHEDULED`) carries no placement code |

### The bare list move (PATCH with a `sprint_id` and no `starts_on`)

A request that changes only the list still **moves a bar**: the row carries its
existing day across. So a **plotted** row is judged against the target sprint's
range and refused with `OUT_OF_SPRINT` — the same 422 envelope and the same
words, naming the TARGET's dates — when its current day falls outside them. The
check runs after the no-op guard and after the target sprint's 404, before any
mutation; a refusal writes nothing and audits nothing.

It asks the **range and nothing else**: not the deadline, not the working-day
calendar. That day was already judged in full when it was placed, and re-filing
a row into another list is not re-placing it, so a refusal on either would be a
422 for a day the request never named. An **unplotted** row (`starts_on` null)
has no bar to misplace and moves into any sprint freely.

The clause is `sprintRangeIssue()` in `src/services/sprint-items.ts`, which
`plotIssue()` calls as its own range check — one range rule, one sentence, two
callers. A row rollover has walked out of every sprint, or a row *Outside any
sprint*, is re-filed by moving it into the sprint that DOES cover its day, or
by sending a `week` with the move.

A refused write **creates nothing and audits nothing** — invariant 10 logs
changes, not attempts. `src/services/rollover.ts` never calls the validator:
§6.2 lets a roll leave its sprint and outrun the deadline, with no cap. It
writes through Mongo, never through this route, so nothing above binds it.

### The sprint re-date (`PUT /api/projects/:projectId/sprints`) — displacement, never refusal (owl #90, JP 2026-09-10)

After the list is saved, every sprint whose dates actually CHANGED this
request is asked which of its plotted rows now sit outside its dates — a
sprint saved unchanged, or newly created, displaces nothing (PLAN amendment
18); each row's update is its own conditional write keyed on the `starts_on`/
`sprint_id` the pass read, the same discipline rollover's R3-2 uses, so a row
a person edited in between is left alone rather than overwritten blind. Each
such row **keeps its exact day**
and leaves the sprint for *Outside any sprint* (`sprint_id: null`, nullable
since block 9) — not re-placed, not pushed to the next sprint, not unslotted.
The save is never refused for it. The 200 body carries
`displaced: [{ id, display_id, title, starts_on, from_sprint }]` (the row id,
its `mc_number`, the work card's title, the kept day, the sprint's name) —
empty when nothing moved — and the client shows the list. Audit: the
`sprints.replace` row as before, plus **one `audit_log` row per displaced
row**, `action: 'sprintItem.displaced'`, actor = the person who saved the
sprints (never `system`, which §6.2 reserves for rollover), `before/after
{ starts_on, sprint_id }` with `starts_on` unchanged on both sides and
`after.sprint_id: null`.

Deletion is untouched and distinct: a sprint absent from the payload still
removes its rows WITH it, audited in the same `sprints.replace` row's
`removed_items`, behind the modal's confirm banner naming the count.

## Withdrawn routes — deleted, not disabled

Removed 2026-09-08 (owl #87, JP; spec v1.3 §6.3/§6.5). They answer **404** and are not to be reintroduced; `test/schedule.test.ts` holds the standing guard.

| Route | Was | Why it went |
|---|---|---|
| `POST /api/projects/:projectId/conflicts/acknowledge` | Dismissed one week-level conflict, keyed on the situation | Week badges were replaced by a count (`N Pending · N Urgent · N Done`); a count asserts nothing, so it never needs dismissing |
| `POST /api/projects/:projectId/conflicts/restore` | Undid an acknowledgement | Same |
| `GET /api/projects/:projectId/deadlines` | Milestone-unit read: milestones, day capacities, conflicts, acknowledged, replot | Lost its caller with the milestone tab (owls #74/#75); the Deadlines tab reads `GET /deliverables` |
| `PUT /api/projects/:projectId/deadlines/day` | The day-drag planner's write | The milestone-unit planner is retired (§6.5); the day a card sits on is `sprint_items.starts_on`. Since block 9 (owls #88/#89) the Deadlines day-drag writes it through `PATCH /sprint-items/:itemId` with `starts_on`, bounded by the week — this route is not the way back |

FR-6.7/6.8 and BR-9a are superseded by owl #87. The `conflict_acknowledgements` collection was renamed to `conflict_acknowledgements_archive` by migration 011 — archived, never dropped.

## Session & sign-in (Passport, `passport-google-oauth20`)

Sessions live in Redis (connect-redis), httpOnly cookie. Four checks, all server-side in the Google strategy verify / sign-in path; failing any denies sign-in:

1. `email_verified` is true
2. `hd` claim = `frostdesigngroup.com` (`ALLOWED_HD`)
3. email domain matches `ALLOWED_HD` (belt and braces with #2)
4. an **active** allow-list document exists in `users` for the email

Non-Frost account → denied with a clear reason (AC-1). Frost account off the allow-list → denied (AC-2). Deactivating a Workspace account revokes access with no manual step — Google refuses the sign-in upstream (FR-2.5). Middleware: `ensureAuthenticated` on every route, `ensureProjectMember(projectId)` on every project-scoped route.

## Error semantics

- Cross-project access: 403 (AC-3).
- Sync source unavailable: API keeps serving last good data; error surfaced in UI; app usable (AC-19, FR-8.5).
- Overlapping sprint save: rejected with the conflict explained (FR-5.15).
