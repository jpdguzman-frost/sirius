# Contract — ARES push (Sirius consumption side)

Added 2026-08-04 (JP decision: option c — push over polling). Complements `ares-read.md`.
The ARES-side half of this contract is `docs/ARES_PUSH_BUILD_SPEC.md`, written to be handed to
the ARES build agent; the two documents must stay in lockstep — a change to either updates both.

**Design principle — notification, then read.** ARES pushes *triggers*, never truth. On
receipt, Sirius re-reads the affected card from the ARES read API and reconciles. This makes
ordering, duplication, and payload drift irrelevant: any event, stale or repeated, converges to
the same state. The read API remains the single source of truth; push only collapses latency
(NFR-3: **< 1 min** target, 15-min poll ceiling as fallback per FR-9.6).

## Endpoint

`POST /api/webhooks/ares` on the Sirius web process — **under `BASE_PATH`**, so the live
URL is `http://127.0.0.1:3955/sirius/api/webhooks/ares` (loopback, same box) or
`https://platforms.frostdesigngroup.com/sirius/api/webhooks/ares` through Apache.

- Authenticated by **signature, not session** — this route is exempt from the session /
  membership middleware (it is not under `/api/projects/:projectId`, so the authz-matrix test
  is unaffected) and from any CSRF handling.
- JSON only; body limit 256 KB. Anything else is rejected without processing.

## Authentication

- Headers: `X-Ares-Signature: sha256=<hex>` · `X-Ares-Timestamp: <ISO-8601 UTC>` ·
  `X-Ares-Delivery: <ULID>`.
- Signature = `HMAC-SHA256(ARES_WEBHOOK_SECRET, "<timestamp>.<raw request body>")`, hex-encoded.
  Signing the timestamp with the body blocks replay outside the window.
- Timestamp must be within **±5 minutes** of server time.
- Compare in constant time. Any failure → `401` with an empty body — no detail leaks.
- `ARES_WEBHOOK_SECRET` lives in server-side env on both hosts (invariant 15), provisioned by
  JP (`openssl rand -hex 32`). It joins the log-hygiene forbidden list (NFR-11).

## Envelope

```json
{
  "delivery_id": "01J...ULID",
  "sent_at": "2026-08-04T09:15:00Z",
  "events": [
    { "event_id": "01J...ULID", "type": "card.changed", "board_id": "hLL7WW2V"  // 8-char Trello shortLink — what Sirius keys projects on,
      "card_id": "abc123", "occurred_at": "2026-08-04T09:14:58Z" }
  ]
}
```

Event types (kept deliberately tiny — the payload is a trigger, not a data carrier):

| Type | Meaning | `card_id` |
|---|---|---|
| `card.changed` | Any field / label / list / due / archive change on a card | required |
| `card.created` | New card appeared on the board | required |
| `board.resync` | ARES requests a full board reconcile (e.g. after its own recovery) | absent |

## Receiver behavior (sync never runs inside a request — constitution stack rule)

1. Verify signature + timestamp, else `401`.
2. Drop events for boards that belong to no active Sirius project (acknowledged, counted).
3. Dedupe on `event_id` — unique index on the `push_events` collection (TTL 7 days).
4. Persist accepted events with status `pending`; respond **`202` `{accepted, duplicates,
   ignored}` in under 1 s**. No ARES, Trello, or model work happens in the request.
5. The **worker** drains `push_events`: coalesce per distinct card → `GET
   /api/v1/trello/cards/{cardId}` → reconcile; `board.resync` → full board sync. Each drain
   writes a `sync_runs` row (source `ares_push`). Drains respect the 60 req/min v1 budget with
   the existing 429/retryAfter handling.

## Reconcile ownership (FR-9.5 — unchanged rules, now including the written fields)

- **Trello-owned fields update from the read**: name, list, difficulty, lane, blockers, links,
  **due date**, and the **`Urgent` label** — so a manual change made in Trello always surfaces
  in Sirius, closing the write-read loop.
- **Sirius-owned planning fields are never touched**: slotted week, pin, confidence, SLA
  overrides, status note.
- Reconcile is idempotent: same-value sets change nothing and write no audit row, which also
  silently absorbs the echo of Sirius's own writes.

## Delivery semantics & fallback

- **At-least-once, unordered.** Safe by the notification-then-read design.
- Poll cadence: while push is healthy (any accepted delivery within the last 30 min) the
  existing sync loop relaxes to an **hourly full reconcile**. If no push arrives for 30 min
  while ARES `/healthz` shows upstream activity, the loop reverts to **15 min** and writes an
  alerting `sync_runs` row (FR-8.5). A dead push channel therefore degrades to exactly today's
  behavior — never to data loss.
