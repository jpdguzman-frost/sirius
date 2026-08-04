/**
 * lib/trello.ts — THE write path (invariant 2 as amended 2026-08-04).
 * Sirius writes exactly what the write registry enumerates
 * (specs/001-sirius-v1/contracts/trello-write.md) and nothing else:
 *   W1  add/remove the `Urgent` label — absence means non-urgent
 *   W2  the card due date (set or clear)
 * Credential: dedicated integration account, server-side env only
 * (TRELLO_API_KEY + TRELLO_TOKEN; TRELLO_WRITE_TOKEN accepted).
 */

export interface TrelloWriter {
  ensureUrgentLabel(boardId: string): Promise<string>;
  setUrgency(cardId: string, boardId: string, urgent: boolean): Promise<void>;
  /** W2: dueIso is a full ISO instant, or null to clear the due date. */
  setDue(cardId: string, dueIso: string | null): Promise<void>;
}

/**
 * Compose the due instant for a W2 write (contracts/trello-write.md):
 * the chosen Manila calendar day at 17:00 Asia/Manila — or, when the card
 * already has a due, at its existing time-of-day. Guard: a preserved
 * time-of-day before 08:00 Manila would fold back to the PREVIOUS day when
 * the mapper slices the UTC instant, so those fall back to 17:00.
 */
export function composeDueIso(dateOnly: string, preserveFrom?: Date | null): string {
  let time = '17:00:00';
  if (preserveFrom) {
    const manila = new Date(preserveFrom.getTime() + 8 * 60 * 60 * 1000);
    const hh = manila.getUTCHours();
    if (hh >= 8) {
      const pad = (n: number) => String(n).padStart(2, '0');
      time = `${pad(hh)}:${pad(manila.getUTCMinutes())}:${pad(manila.getUTCSeconds())}`;
    }
  }
  return new Date(`${dateOnly}T${time}+08:00`).toISOString();
}

const BASE = 'https://api.trello.com/1';
export const URGENT_LABEL_NAME = 'Urgent';

export class TrelloClient implements TrelloWriter {
  private labelCache = new Map<string, string>();
  private fetchImpl: typeof fetch;

  constructor(
    private apiKey: string,
    private token: string,
    fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async call<T>(method: string, path: string): Promise<T> {
    const sep = path.includes('?') ? '&' : '?';
    const res = await this.fetchImpl(`${BASE}${path}${sep}key=${this.apiKey}&token=${this.token}`, {
      method,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      // never echo the URL — it carries the credential (invariant 15, NFR-11)
      throw new Error(`Trello ${method} ${path.split('?')[0]} failed: HTTP ${res.status}`);
    }
    return (await res.json().catch(() => ({}))) as T;
  }

  /** Find or create the `Urgent` label on the board (0/26 boards have one today — BRD §4). */
  async ensureUrgentLabel(boardId: string): Promise<string> {
    const cached = this.labelCache.get(boardId);
    if (cached) return cached;
    const labels = await this.call<Array<{ id: string; name: string }>>('GET', `/boards/${boardId}/labels`);
    let label = labels.find((l) => l.name === URGENT_LABEL_NAME);
    if (!label) {
      label = await this.call<{ id: string; name: string }>(
        'POST',
        `/boards/${boardId}/labels?name=${encodeURIComponent(URGENT_LABEL_NAME)}&color=red`,
      );
    }
    this.labelCache.set(boardId, label.id);
    return label.id;
  }

  /** §5.3, verbatim shape. */
  async setUrgency(cardId: string, boardId: string, urgent: boolean): Promise<void> {
    const labelId = await this.ensureUrgentLabel(boardId);
    if (urgent) {
      await this.call('POST', `/cards/${cardId}/idLabels?value=${labelId}`);
    } else {
      await this.call('DELETE', `/cards/${cardId}/idLabels/${labelId}`);
    }
  }

  /** W2 (contracts/trello-write.md): set or clear the card due date. */
  async setDue(cardId: string, dueIso: string | null): Promise<void> {
    const value = dueIso === null ? 'null' : encodeURIComponent(dueIso);
    await this.call('PUT', `/cards/${cardId}?due=${value}`);
  }
}

export function makeTrelloWriter(env: {
  TRELLO_API_KEY?: string;
  TRELLO_TOKEN?: string;
  TRELLO_WRITE_TOKEN?: string;
}): TrelloWriter | null {
  const token = env.TRELLO_TOKEN ?? env.TRELLO_WRITE_TOKEN;
  if (!env.TRELLO_API_KEY || !token) return null;
  return new TrelloClient(env.TRELLO_API_KEY, token);
}
