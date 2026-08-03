# Contract — HTTP API (app routes)

Route groups are fixed by the repository layout (Implementation Plan §2.3). Exact handler signatures are decided at implementation; the rules below are contractual for every route.

## Universal rules (every route, no exceptions)

1. **Auth re-check server-side** on every call: valid session AND caller's membership of the target project (invariant 9, NFR-6). A session calling an API for another project gets **403** (AC-3). Hiding a tab is not access control.
2. **Zod validation at the boundary** — never trust a body (§2.2).
3. **`project_id` scoping** on every query (invariant 1, FR-1.4).
4. **Audit**: every state change writes an immutable `audit_log` row — schedule moves, pins, SLA overrides, urgency, conflict acknowledgements, project settings (invariant 10, FR-2.6).
5. Trello- and sheet-owned fields are **read-only** through this API; the write path refuses anything Sirius doesn't own (§1.2). The single exception is urgency (own contract: `trello-write.md`).

## Route groups

| Group | Purpose | Access | Writes |
|---|---|---|---|
| `/api/requests` | Intake mirror read (FR-3.x) | Session + membership | None — read-only mirror |
| `/api/deliverables` | Pipeline read (FR-4.1–4.5) | Session + membership | None |
| `/api/schedule` | Slot, pin, bulk replot (FR-5.x, BR-8); Sirius-owned planning fields only (slotted week, pin, confidence, SLA overrides, status note); sprint CRUD with overlap rejection (FR-5.14–5.15); conflict acknowledgements (FR-6.7–6.8, keyed per invariant 13) | Session + membership | Sirius-owned columns + `audit_log` |
| `/api/urgency` | THE write path — see `trello-write.md` | Session + membership | `deliverables.urgency` + Trello label + audit |
| `/api/sync` | Worker-triggered sync endpoints | **OIDC-protected** — invocable by `sirius-scheduler`/worker identity only, no user sessions | Source-mirror columns + `sync_runs` |

## Session & sign-in (Auth.js callback, §4)

Four checks, all server-side; failing any denies sign-in:

```ts
async signIn({ profile }) {
  if (!profile?.email_verified) return false;
  if (profile.hd !== process.env.ALLOWED_HD) return false;
  if (profile.email?.split("@")[1] !== process.env.ALLOWED_HD) return false;
  const u = await db.user.findUnique({ where: { email: profile.email } });
  return !!u?.active;
}
```

Non-Frost account → denied with a clear reason (AC-1). Frost account off the allow-list → denied (AC-2). Deactivating a Workspace account revokes access with no manual step (FR-2.5).

## Error semantics

- Cross-project access: 403 (AC-3).
- Sync source unavailable: API keeps serving last good data; error surfaced in UI; app usable (AC-19, FR-8.5).
- Overlapping sprint save: rejected with the conflict explained (FR-5.15).
