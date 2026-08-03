# Contract — Worker service (`sirius-worker`)

Sync never runs inside a request (§2.2). The worker is a separate Cloud Run service with **no public ingress**, invoked by Cloud Scheduler via the `sirius-scheduler` service account (invoke-only scope). Sheets access uses the attached `sirius-sheets-reader` identity (`spreadsheets.readonly`, named Viewer per sheet) — Application Default Credentials, **no key file exists** (§3.2, §3.4).

## Jobs & cadence (§3.2)

| Job | Cadence | Contract |
|---|---|---|
| `syncAres` | 15 min | Read cards/lists/movements from ARES **[BLOCKED-OD1: interface undecided]**; filter by `trello_board_id` AND `trello_label` where set (FR-1.3, AC-5); map per taxonomy (deliverables = `Main Card`, everything else = work cards attached to the MC group); upsert on `(project_id, trello_card_id)`; append `card_events` idempotently on `source_event_id`; copy ARES `referenceWeeks` + `effectiveWeeklyRate` into `projects` (BR-6a, §5.3a) |
| `syncIntake` | 15 min | Read the project's intake tab; pad ragged rows before positional parsing; serial dates from the 1899-12-30 epoch; disambiguate the two `Type` columns by position (§5.2); skip pre-allocated MC rows silently and count (FR-3.4); reject unparseable rows to `intake_rejects` with row + reason (FR-3.5); vanished rows marked inactive, never deleted (FR-8.4) |
| `refreshModel` | nightly | Per project over `model_window_months`: `card_events` → design dwell + review dwell (*Sent for Client Review*) → percentiles by difficulty × lane × metric (Average/70/85/95) → throughput percentiles per difficulty → write `model_grid` + `throughput_grid` → **record delta from previous run** (a sharp overnight shift means the input changed; someone should look) (§5.4, BR-2, BR-4) |
| health | daily | Liveness/config sanity |

## Universal rules

- Every run — success or failure — writes a `sync_runs` row (source, ok, stats, error).
- Failures are logged and alerted; last good data remains visible to users (FR-8.5); sync status and last-success time surface in the UI (FR-8.6).
- Read-only against every source. The worker holds no Trello write credential — the write token belongs solely to the urgency path (`trello-write.md`).
- Logs carry no brief text and no credentials (NFR-11); Cloud Logging exclusion filter drops brief text (§3.2).
- All timestamps stored UTC; workday/Manila computation via `lib/calendar.ts` only (invariant 11).
