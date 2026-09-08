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
