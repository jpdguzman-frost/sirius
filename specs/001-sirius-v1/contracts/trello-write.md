# Contract — The one write: Trello urgency label

Urgency is the **only thing Sirius writes anywhere** (invariant 2, FR-4.6). It adds or removes a single label named `Urgent` on a single Trello card; absence means non-urgent, so there is no second state to keep in sync.

## Interface (Implementation Plan §5.3, verbatim shape)

```ts
export async function setUrgency(cardId: string, boardId: string, urgent: boolean) {
  const labelId = await ensureUrgentLabel(boardId);
  return urgent
    ? trello.post(`/cards/${cardId}/idLabels`, { value: labelId })
    : trello.delete(`/cards/${cardId}/idLabels/${labelId}`);
}
```

`ensureUrgentLabel` creates the `Urgent` label on first use — 0 of 26 boards have one today (BRD §4).

## Non-negotiable rules

1. **Optimistic with rollback** (invariant 8, FR-4.7): the UI applies the change locally, and a failed Trello write reverts it. Sirius never displays a state Trello lacks.
2. **Every call writes an `audit_log` row and a `sync_runs` row** — success and failure alike.
3. **Credential**: `TRELLO_WRITE_TOKEN` from Secret Manager, belonging to a **dedicated integration account** that is a member of the Design Support boards only — never a personal admin token (Trello cannot scope a token per board; a leaked token then exposes those boards, not everything a person can see). It is a third credential, separate from both service accounts (§3.2).
4. **Staging safety** (invariant 17): staging points at a **duplicate Trello board** — a staging test against the live board would relabel real cards (§3.3). Before any urgency code runs, verify the configured board ID is not a production board. Phase 8 does not start until the duplicate board is confirmed.
5. This path ships **last** (sequence item 8), with its own review.

## Recorded consequence

BRD §9's "write is impossible by permission" is no longer true. Amend before the vendor assessment rather than after (§5.3; tracked in STATE.md).
