# src/CLAUDE.md — durable law for src/ work

Auto-loaded when working under `src/`. Stands alone; where a rule has an
authoritative home (root `CLAUDE.md`, `decisions/NNNN`, contracts, rulebooks)
this file names it in one line and points — it never restates.

1. **`project_id` everywhere** — every collection carries it, every query
   filters on it [root CLAUDE.md, invariant 1]. Project-scoped handlers read
   the resolved project from `res.locals.project` and filter on its id
   [src/auth/membership.ts]. The ONE recorded exception: the `calendar_days`
   system-reference store — the PH work calendar is global, same class as the
   `migrations` ledger; deliberately unscoped, do not "fix" it
   [src/services/calendar-sync.ts header; docs/MAP.md §MODULES].

2. **Zod at every API boundary** [root CLAUDE.md §Stack]. Every route that
   accepts input parses it with Zod before touching it (`safeParse` → 400).
   Mutating routes use `.strict()` schemas [src/routes/writes.ts,
   schedule.ts, admin.ts]; the webhook envelope is a plain `z.object` —
   unknown fields are stripped, not rejected, tolerant of ARES payload
   growth [src/routes/webhooks.ts]. `deliverables.ts` and `projects.ts` are
   GET-only today. Each route file exports one
   `<name>Router()` factory returning an Express `Router` — `writesRouter`,
   `scheduleRouter`, `aresWebhookRouter`, `authRouter`, … [src/routes/*.ts;
   src/auth/routes.ts].

3. **Writes to source systems**: the only Trello write paths in `src/` are
   the three registry entries — W1 urgency, W2 due date (the deadline edit),
   W3 difficulty — all in `src/routes/writes.ts` via `lib/trello.ts`, nothing
   else anywhere [invariant 2; decisions/0013; contracts/trello-write.md].
   The rollback guarantee is structural: Trello is written FIRST, local state
   changes only after success, so a failure reverts the UI's optimistic
   change [invariant 8; decisions/0014]. Every attempt — success or failure —
   writes `audit_log` AND `sync_runs` [src/routes/writes.ts]. The shared
   refusal guards (production-board, `writes_enabled`, local rows) live in
   `writeGuards()`; any new registry entry routes through it — and growing
   the registry is a constitution amendment, never a code change.

4. **`audit_log` is insert-only** and `audit()` in `src/services/audit.ts`
   is its only writer — no update or delete path exists; keep it that way
   [invariant 10]. Structured before/after snapshots only; never brief text
   or credentials (NFR-11) [src/services/audit.ts].

5. **Sync never runs inside a request — the worker owns it** [root CLAUDE.md
   §Stack; worker/]. Precedent: the ARES push receiver only dedupes, persists
   `pending` events, and answers 202; the worker drains and reconciles
   [src/routes/webhooks.ts]. No route or request-path service calls sync code.

6. **Auth**: the four sign-in checks live in `src/auth/passport.ts`
   (`evaluateSignIn`; the allow-list is re-checked on EVERY request in
   `deserializeUser`). Every API route stacks `ensureAuthenticated`
   [src/auth/session.ts]; project-scoped routes add `ensureProjectMember` —
   session AND membership re-checked per route. Hiding a tab is not access
   control [invariant 9; decisions/0005].

7. **The conflict-ack key recipe has ONE home**: `conflictKey()` in
   `src/services/conflicts.ts` — `week | rule | capacity | sorted card:phase
   pairs` [invariant 13, 2026-08-17 amendment; decisions/0019]. Nothing else
   composes, splits, or rebuilds a key; routes and client treat it as an
   opaque string [src/services/conflicts.ts].

## Constitution and decisions

Invariants, the write registry, the stack, and timezone law are governed by
the root `CLAUDE.md` — never restated here beyond these pointers. Before
changing a module, read its `decisions/` entries; settled choices are never
silently re-decided [docs/CONTEXT_ARCHITECTURE.md, principle 5].

_last-verified: 2026-08-18_
