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

## Sprint items — the placement guards (JP 2026-09-08)

A `starts_on` is the PM's own click: the day a bar begins. Every route that
accepts one judges it on the SAME validator — `plotIssue()` in
`src/services/sprint-items.ts` — so the three answers cannot drift per route.
Refusals are **422** with body `{ ok: false, error: { code, message } }`, the
envelope the sprint-save conflict (`SPRINT_CONFLICT`) already uses; the client
prints the server's `message` verbatim.

| Code | Refused when | Message |
|---|---|---|
| `OUT_OF_SPRINT` | the day falls outside the sprint's own `starts_on`..`ends_on` — the range is INCLUSIVE, so both boundary days are legal | `That day is outside the sprint's dates (3 Aug 2026 – 14 Aug 2026).` |
| `PAST_DEADLINE` | the card carries a Trello due date and the day is AFTER it. The deadline day itself is a legal start; a FINISH past the deadline stays legal and paints the bar red (R9-b) | `That day is after the card's deadline (5 Aug 2026).` |
| `NOT_A_WORKDAY` | the day is a weekend, or a holiday on the ACTIVE working-day calendar — the ARES set loaded into `lib/calendar.ts` (invariant 11) | `That day is not a working day.` |

Checked in that order: a day can fail all three, and the PM is told the first
thing wrong with it.

| Route | Guarded when |
|---|---|
| `PATCH /api/projects/:projectId/sprint-items/:itemId` | the body carries a non-null `starts_on`. Judged against the TARGET sprint when the same request moves the row, so a move that carries a day is measured against where the row lands. `starts_on: null` un-plots and is never judged; a bare `sprint_id` move supplies no day and is never judged either — rollover legitimately walks a row past its sprint's end (§6.2) and the PM must still be able to re-file it |
| `POST /api/projects/:projectId/sprint-items` | the optional `starts_on` is present. The card-state refusals (409 `CARD_COMPLETE` / `CARD_EXCLUDED`) answer first — a card that cannot be scheduled at all is not a question about a day |
| `POST /api/projects/:projectId/sprint-items/batch` | **never** — the batch body has no `starts_on` and `.strict()` refuses one (400 `INVALID_BODY`), so its rows land unplotted by construction (#72 §6) and its skip list (`NOT_FOUND`, `CARD_COMPLETE`, `CARD_EXCLUDED`, `ALREADY_SCHEDULED`) carries no placement code |

A refused write **creates nothing and audits nothing** — invariant 10 logs
changes, not attempts. `src/services/rollover.ts` never calls the validator:
§6.2 lets a roll leave its sprint and outrun the deadline, with no cap.

## Withdrawn routes — deleted, not disabled

Removed 2026-09-08 (owl #87, JP; spec v1.3 §6.3/§6.5). They answer **404** and are not to be reintroduced; `test/schedule.test.ts` holds the standing guard.

| Route | Was | Why it went |
|---|---|---|
| `POST /api/projects/:projectId/conflicts/acknowledge` | Dismissed one week-level conflict, keyed on the situation | Week badges were replaced by a count (`N Pending · N Urgent · N Done`); a count asserts nothing, so it never needs dismissing |
| `POST /api/projects/:projectId/conflicts/restore` | Undid an acknowledgement | Same |
| `GET /api/projects/:projectId/deadlines` | Milestone-unit read: milestones, day capacities, conflicts, acknowledged, replot | Lost its caller with the milestone tab (owls #74/#75); the Deadlines tab reads `GET /deliverables` |
| `PUT /api/projects/:projectId/deadlines/day` | The day-drag planner's write | The planner is retired (§6.5); the day a card sits on is `sprint_items.starts_on`, set on Sprint Schedules |

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
