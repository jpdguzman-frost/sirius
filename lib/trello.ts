/**
 * lib/trello.ts — THE single write path (invariant 2; §5.3; FR-4.6).
 * Sirius writes exactly one thing anywhere: add/remove a label named
 * `Urgent` on a Trello card. Absence means non-urgent — no second state to
 * keep in sync. Credential: dedicated integration account, server-side env
 * only (TRELLO_API_KEY + TRELLO_TOKEN; TRELLO_WRITE_TOKEN accepted).
 */

export interface TrelloWriter {
  ensureUrgentLabel(boardId: string): Promise<string>;
  setUrgency(cardId: string, boardId: string, urgent: boolean): Promise<void>;
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
