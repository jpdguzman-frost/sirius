# Contract — Worker process (`worker/`)

Sync never runs inside a request. The worker is a separate Node process (ARES pattern) scheduling its own jobs; it is the **only** component holding source credentials — the ARES read-only key and the Sheets service-account credential. Deployed beside the web process on the ARES host.

## Jobs & cadence

| Job | Cadence | Contract |
|---|---|---|
| `syncAres` | 15 min | Read boards/cards/movements from the **ARES read API** per `ares-read.md`; filter by `trello_board_id` AND `trello_label` where set (FR-1.3, AC-5); map per taxonomy (deliverables = `Main Card`, everything else = work cards attached to the MC group); upsert on `(project_id, trello_card_id)`; append `card_events` idempotently on `source_event_id`; pull `steering.deliveryForecast.referenceWeeks` + `effectiveWeeklyRate` through the internal-tier adapter and copy into `projects` (BR-6a, §5.3a) |
| `syncIntake` | 15 min | Read the project's intake tab via service account; pad ragged rows before positional parsing; serial dates from the 1899-12-30 epoch; disambiguate the two `Type` columns by position (§5.2); skip pre-allocated MC rows silently and count (FR-3.4); reject unparseable rows to `intake_rejects` with row + reason (FR-3.5); vanished rows marked inactive, never deleted (FR-8.4) |
| `refreshModel` | nightly | Per project over `model_window_months`: `card_events` → design dwell + review dwell (*Sent for Client Review*) → percentiles by difficulty × lane × metric (Average/70/85/95) **computed in worker code** → throughput percentiles per difficulty → write `model_grid` + `throughput_grid` → **record delta from previous run** (a sharp overnight shift means the input changed; someone should look) (§5.4, BR-2, BR-4) |
| `rollover` | end of every successful `syncAres` tick | `src/services/rollover.ts`: every plotted `sprint_items` row whose card is active, labelled with a difficulty and not classified done walks `starts_on` forward one working day at a time until the engine's finish is today or later (Manila); the sprint holding the new finish day takes the row (tail position), none → unchanged; one `audit_log` row per moved card (`sprintItem.rollover`, actor `system`) or the row is taken back; a project whose latest ARES sync is not a fresh success is skipped; a row a PM rewrote between the read and the write is left alone; one `sync_runs` row per project per run (source `rollover`, stats moved/skipped/raced/failed/capped); no UI marker; idempotent, catches up after downtime in one pass (owl #75 §2; jp→miles #59 §3; deadlines-rules.md §4) |
| health | daily | Liveness/config sanity, incl. ARES `/healthz` freshness check before trusting a sync (guide §6.10) |

## Universal rules

- Every run — success or failure — writes a `sync_runs` document (source, ok, stats, error).
- Failures are logged and alerted; last good data remains visible to users (FR-8.5); sync status and last-success time surface in the UI (FR-8.6).
- Read-only against every source. The worker holds no Trello write credential — the write token belongs solely to the urgency path (`trello-write.md`), and the ARES key class cannot write at all (403 `READ_ONLY_KEY` by server design).
- Respect the ARES v1 rate limit (60 req/min): paginate politely, honour `X-RateLimit-*` and `error.retryAfter`; cache aggressively.
- Logs carry no brief text and no credentials (NFR-11).
- Timestamps stored UTC; ARES `YYYY-MM-DD` values are **Asia/Manila calendar days** — never re-interpret as UTC (guide §4; invariant 11); workday/Manila computation via `lib/calendar.ts` only.
