/**
 * lib/trello.ts — THE write path (invariant 2 as amended 2026-08-04,
 * registry grown 2026-08-12 and 2026-09-10). Sirius writes exactly what the
 * write registry enumerates (specs/001-sirius-v1/contracts/trello-write.md)
 * and nothing else:
 *   W1  add/remove the `Urgent` label — absence means non-urgent
 *   W2  the card due date (set or clear)
 *   W3  the `Difficulty: …` label (swap; BRD-§9-A1)
 *   W4  the business-unit label (assign/swap an EXISTING board label only;
 *       lookup-only, never created — BRD v3.0 §9 / FR-4.11). Server half
 *       only: no route or caller exists until the surface and the ingestion
 *       actor are ruled (contracts/trello-write.md §W4).
 * Credential: dedicated integration account, server-side env only
 * (TRELLO_API_KEY + TRELLO_TOKEN; TRELLO_WRITE_TOKEN accepted).
 */

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface TrelloWriter {
  ensureUrgentLabel(boardId: string): Promise<string>;
  setUrgency(cardId: string, boardId: string, urgent: boolean): Promise<void>;
  /** W2: dueIso is a full ISO instant, or null to clear the due date. */
  setDue(cardId: string, dueIso: string | null): Promise<void>;
  /** W3: swap the card's `Difficulty: …` label to the given value. */
  setDifficulty(cardId: string, boardId: string, difficulty: Difficulty): Promise<void>;
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
export const DIFFICULTY_LABEL_PREFIX = 'Difficulty: ';
const DIFFICULTY_LABEL_COLOR: Record<Difficulty, string> = { Easy: 'green', Medium: 'yellow', Hard: 'red' };

/**
 * W4's refusal (contracts/trello-write.md §W4: "an unmatched value is refused
 * and surfaced, never guessed"). `reason` says which way the lookup failed:
 *   unmatched  — no board label normalises to the tag
 *   ambiguous  — MORE than one does (two labels differing only by case or
 *                whitespace). Refused rather than "first match": a wrong
 *                business unit silently misattributes work (BRD v3.0 §9),
 *                which is worse than a missing one.
 * The message carries the board id and the tag, never a credential.
 */
export class UnknownClassificationLabel extends Error {
  readonly boardId: string;
  readonly tag: string;
  readonly reason: 'unmatched' | 'ambiguous';

  constructor(boardId: string, tag: string, reason: 'unmatched' | 'ambiguous') {
    super(
      reason === 'ambiguous'
        ? `More than one board label matches ${JSON.stringify(tag)} on board ${boardId} — refusing to guess`
        : `No board label matches ${JSON.stringify(tag)} on board ${boardId}`,
    );
    this.name = 'UnknownClassificationLabel';
    this.boardId = boardId;
    this.tag = tag;
    this.reason = reason;
  }
}

/**
 * The W4 resolver, pure: the ids of EVERY board label whose name equals the
 * tag after trim + case-fold on both sides. Exact only — no prefix, no
 * substring, no distance; inner whitespace is part of the name. Returning
 * every match (not the first) is what lets the caller refuse ambiguity. A
 * blank tag names nothing: Trello boards carry colour-only labels with an
 * empty name, and a blank value must never land on one.
 */
export function resolveLabelIds(labels: Array<{ id: string; name: string }>, tag: string): string[] {
  const want = tag.trim().toLowerCase();
  if (want === '') return [];
  return labels.filter((l) => l.name.trim().toLowerCase() === want).map((l) => l.id);
}

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

  /** Find or create one `Difficulty: …` taxonomy label (production boards carry all three — invariant 17). */
  private async ensureDifficultyLabel(boardId: string, difficulty: Difficulty): Promise<string> {
    const name = `${DIFFICULTY_LABEL_PREFIX}${difficulty}`;
    const cacheKey = `${boardId}:${name}`;
    const cached = this.labelCache.get(cacheKey);
    if (cached) return cached;
    const labels = await this.call<Array<{ id: string; name: string }>>('GET', `/boards/${boardId}/labels`);
    let label = labels.find((l) => l.name === name);
    if (!label) {
      label = await this.call<{ id: string; name: string }>(
        'POST',
        `/boards/${boardId}/labels?name=${encodeURIComponent(name)}&color=${DIFFICULTY_LABEL_COLOR[difficulty]}`,
      );
    }
    this.labelCache.set(cacheKey, label.id);
    return label.id;
  }

  /**
   * W3 (contracts/trello-write.md): a label SWAP, not atomic. The new label
   * is added BEFORE stale `Difficulty: …` labels are removed, so the card
   * never passes through a no-difficulty state; a failed stale removal
   * restores the just-added label and reports failure.
   */
  async setDifficulty(cardId: string, boardId: string, difficulty: Difficulty): Promise<void> {
    const targetId = await this.ensureDifficultyLabel(boardId, difficulty);
    const current = await this.call<Array<{ id: string; name: string }>>('GET', `/cards/${cardId}/labels`);
    const stale = current.filter((l) => l.name.startsWith(DIFFICULTY_LABEL_PREFIX) && l.id !== targetId);
    const added = !current.some((l) => l.id === targetId);
    if (added) {
      await this.call('POST', `/cards/${cardId}/idLabels?value=${targetId}`);
    }
    try {
      for (const l of stale) {
        await this.call('DELETE', `/cards/${cardId}/idLabels/${l.id}`);
      }
    } catch (err) {
      // restore the original state; if this also fails the card wears two
      // difficulty labels until the next ARES read reconciles it — the local
      // value still rolls back (invariant 8)
      if (added) await this.call('DELETE', `/cards/${cardId}/idLabels/${targetId}`).catch(() => {});
      throw err;
    }
  }

  /**
   * W4 (contracts/trello-write.md §W4): assign the board's EXISTING
   * business-unit label for `tag`, and — when `previousTag` is given — remove
   * the label it names, W3's add-then-remove so the card never passes through
   * an untagged state. LOOKUP ONLY: there is deliberately no
   * `ensureClassificationLabel()`; the labels are Frost's to manage on the
   * board, and the absence of that helper is the control. Unmatched and
   * ambiguous tags both throw `UnknownClassificationLabel` before any write.
   *
   * The board's labels are read FRESH on every call — no cache, unlike the
   * W1/W3 taxonomy helpers: the tag is an open set (every business unit the
   * sheet may name), and a cached id goes stale the moment a label is renamed.
   *
   * `previousTag` is skipped SILENTLY when it does not resolve to exactly one
   * board label or that label is not on the card — a stale value that is
   * already gone must not block a legitimate re-tag, and an ambiguous one is
   * never guessed at. A failed stale removal restores the just-added label
   * and rethrows, exactly as `setDifficulty`.
   *
   * Not on the `TrelloWriter` interface: nothing calls this polymorphically
   * yet. The caller runs the same refusal checks `writeGuards()` runs for
   * W1–W3 (production board, `writes_enabled`, local rows) — this primitive
   * does not.
   */
  async setClassification(cardId: string, boardId: string, tag: string, previousTag?: string | null): Promise<void> {
    const labels = await this.call<Array<{ id: string; name: string }>>('GET', `/boards/${boardId}/labels`);
    const matches = resolveLabelIds(labels, tag);
    if (matches.length === 0) throw new UnknownClassificationLabel(boardId, tag, 'unmatched');
    if (matches.length > 1) throw new UnknownClassificationLabel(boardId, tag, 'ambiguous');
    const targetId = matches[0]!;

    const current = await this.call<Array<{ id: string; name: string }>>('GET', `/cards/${cardId}/labels`);
    const added = !current.some((l) => l.id === targetId);
    if (added) {
      await this.call('POST', `/cards/${cardId}/idLabels?value=${targetId}`);
    }

    const previous = previousTag == null ? [] : resolveLabelIds(labels, previousTag);
    const staleId = previous.length === 1 ? previous[0]! : null;
    if (staleId === null || staleId === targetId || !current.some((l) => l.id === staleId)) return;
    try {
      await this.call('DELETE', `/cards/${cardId}/idLabels/${staleId}`);
    } catch (err) {
      // restore the original state; if this also fails the card wears two
      // business-unit labels until someone fixes it in Trello — the local
      // value still rolls back (invariant 8)
      if (added) await this.call('DELETE', `/cards/${cardId}/idLabels/${targetId}`).catch(() => {});
      throw err;
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
