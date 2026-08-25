# Contract — ARES read API (the Trello source, OD-1 resolution)

**Contract source of truth**: `https://ares.frostdesigngroup.com/api/docs` — `guide.md` + `openapi.yaml`, served behind the same key as the data, always matching the running deployment. Facts below verified against the live guide on 2026-08-03. Sirius consumes ARES **only** through this API (FR-8.1); ARES is never a write path.

## Authentication & key handling

- Header `X-API-Key` on every request. Sirius holds a **read-only class key** (`ARES_READONLY_API_KEYS` class): reads yes, every write 403 `READ_ONLY_KEY` — by design, never request an upgrade.
- The key lives in server-side env (`ARES_API_KEY`) — never in the repo, the client bundle, or logs (invariant 15). Browser-direct calls are impossible anyway: `/api/*` sends no CORS headers; Sirius's server is the facade.
- Admin-tier endpoints (`/api/system/*`, most `/api/config/*`, `/api/capacity/*`) return 401 for **any** key — sessions only. Use the documented alternatives (`/api/people`, `/api/config/frontend-constants`, `/healthz`).

## Endpoints Sirius uses

| Endpoint | Stability | Purpose in Sirius |
|---|---|---|
| `/api/v1/trello/boards` | stable | Board inventory (note: payload is `data.boards[]`, not `data[]`) |
| `/api/v1/trello/boards/{boardId}/cards` | stable | Card sync — paginated (`meta.pagination.totalPages`), labels inline |
| `/api/v1/trello/boards/{boardId}/movements` | stable | **`card_events` source** — movement events in a date range, paginated |
| `/api/v1/trello/cards/{cardId}` | stable | Single card with metadata + movement history (gap repair) |
| `/api/v1/trello/cycle-time` | stable | Cross-check for derived cycle times (`?rtProjectId=` bare integer) |
| `/api/v1/trello/boards/{boardId}/summary` | stable | Cards per list, recent movements, health |
| `/api/v1/trello/health` | stable | Trello-side sync health |
| `/healthz` | public | Freshness gate before trusting a sync run |
| `/api/projects/index` | stable | The **only** legitimate source of `rowKey` — never construct one |
| `/api/project/{rowKey}/steering` | **internal** | `steering.deliveryForecast.referenceWeeks` + `effectiveWeeklyRate` (BR-6a) — consume behind Sirius's adapter only |
| `/api/workload?mode=daily` | **session** | Working-day calendar (amendment 2026-08-15, ARES-canonical per JP): `columns[]` contain ONLY working days — weekends/holidays absent. Behind the adapter (`workingDayColumns`), verified live 2026-08-15 |
| `/api/portfolio/capacity?from&to` | **session** | `workingDays[]` per Monday-keyed week — cross-check for the daily derivation. Behind the adapter (`workingDaysPerWeek`). Params are `from`/`to`, NOT `dateFrom`/`dateTo` |

## Response shapes & traps (from the guide — each has cost someone a day)

- **Two surfaces**: `/api/v1/*` envelopes `{ok, data, meta}`; `/api/*` returns the payload **bare**. Errors enveloped on both. Client helper unwraps by prefix.
- **Rate limit**: 60 req/min per key on `/api/v1/*` only, with `X-RateLimit-Limit/-Remaining/-Reset`; honour `error.retryAfter` on 429. `/api/*` is unlimited by oversight — cache aggressively anyway.
- **Identity**: `rowKey` has three live formats (`"837"`, `"rt-838"`, `"runn-45"`) and can mix within one response; some endpoints want the bare integer instead. Read `rowKey` from `/api/projects/index`; convert with the guide's `toRtProjectId()`. Boards/cards use opaque Trello ids.
- **Timezone**: all upstream data originates in **Asia/Manila**; `YYYY-MM-DD` are Manila calendar days. Re-interpreting as UTC shifts everything 8 h and drops/duplicates boundary days — the guide calls this the cause of "missing data" nine times out of ten.
- **Numbers**: `*Hours` fields are pre-formatted **strings**; `*Minutes` fields are the numbers. `progress` is string-or-number — coerce. `estimate` is hours-as-string, not minutes.
- **Freshness — SETTLED 2026-08-25 by reading ARES's source and measuring the live API** (this line previously said the cache was 30 minutes, then that "the new ARES delivers in realtime"; both were second-hand and they contradicted each other). **A read NEVER touches Trello.** `getCard()` is `TrelloCard.findOne().lean()` and the board endpoint is `TrelloCard.find()` — ARES serves a materialised store its own worker refreshes on a **15-minute cycle** (`TRELLO_REFRESH_INTERVAL_MS`; live `/api/v1/trello/health` returned `lastRefreshAt` and `nextRefreshAt` exactly 15 min apart). So a payload can be **up to ~15 minutes old however recently you asked for it**, and the age of a response says nothing about the age of its data.
- ⚠️ **`lastPolledAt` IS THE FIELD THAT SOLVES THIS, and it is already served.** ARES stamps every non-done card with the instant it was polled from Trello (`buildCardDoc`: `lastPolledAt: now`), on every cycle, whether or not anything changed — so it is a true fetch time, not a last-modified. Confirmed present in a live response on 2026-08-25, its age tracking the position in the cycle. **Any Sirius logic that needs "how old is this data" must read `lastPolledAt` and never the instant the request was issued.** See `worker/syncAres.ts` `staleGuard`. Caveat worth carrying: ARES's own 2026-08-02 audit records this field as "written in three places and read by none", so Sirius depending on it must be told to them or a cleanup could remove it.
- Gate on `/healthz` before rendering trust.

## Stability & drift protection

- Build only on `stable` operations (`x-ares-stability` in `openapi.yaml`); the one `internal` exception (steering, for BR-6a capacity) sits behind an adapter Sirius owns (`src/services/`), so a shape change breaks one file.
- CI runs a probe against the documented shapes (ARES's own `api-probe --verify` pattern) so contract drift fails the build, not the runtime. When ARES's spec changes, update this contract and the adapter together.
- Do not call undocumented routes; do not call ingestion-triggering reads (`/api/trello/board/{boardId}/labels`, `/api/myday`, cache-refresh triggers) — they burn shared upstream Trello/Raintool quota.
