/**
 * ARES read API client — contracts/ares-read.md (T027).
 *
 * Two surfaces, two shapes: /api/v1/* envelopes {ok, data, meta}; /api/*
 * returns the payload bare; errors enveloped on both. v1 is rate-limited
 * 60 req/min — honour retryAfter on 429, pace pagination politely.
 * Read-only key, server-side only; a write returns 403 READ_ONLY_KEY by
 * design and is a bug in the CALLER, never a reason for a bigger key.
 */

export interface AresConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Pause between paginated requests (ms). 1100 keeps well under 60/min. */
  pageDelayMs?: number;
}

export interface AresBoard {
  boardId: string;
  projectName: string;
  status: string;
  cardCount: number;
  activeCards: number;
  doneCards: number;
  stale: boolean;
  lastSuccessAt: string | null;
  error: string | null;
}

export interface AresLabel {
  id: string;
  name: string;
  color?: string;
}

export interface AresCard {
  cardId: string;
  boardId: string;
  name: string;
  description?: string;
  currentList: string | null;
  labels: AresLabel[];
  due: string | null;
  url?: string;
  status?: string;
  archived?: boolean;
  dateLastActivity?: string;
  createdAt?: string;
}

export interface AresMovement {
  cardId: string;
  cardName?: string;
  fromList: string | null;
  toList: string | null;
  detectedAt: string;
}

/** Live steering shape (internal tier — consumed ONLY through this adapter). */
export interface ReferenceWeeks {
  least: number | null;
  typical: number | null;
  most: number | null;
  effectiveWeeklyRate: number | null;
}

export class AresError extends Error {
  code?: string;
  status?: number;
  requestId?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AresClient {
  private cfg: Required<Pick<AresConfig, 'baseUrl' | 'apiKey'>> & AresConfig;
  private fetchImpl: typeof fetch;

  constructor(cfg: AresConfig) {
    this.cfg = { pageDelayMs: 1100, ...cfg };
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  /** GET with envelope unwrap by surface; one retry honouring retryAfter on 429. */
  async get<T>(path: string, retried = false): Promise<T> {
    const res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
      headers: { 'X-API-Key': this.cfg.apiKey, Accept: 'application/json' },
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (res.status === 429 && !retried) {
      const err = body?.error as { retryAfter?: number } | undefined;
      await sleep(((err?.retryAfter ?? 2) as number) * 1000);
      return this.get<T>(path, true);
    }
    if (body && body.ok === false) {
      const e = new AresError(
        ((body.error as { message?: string })?.message ?? 'Ares error') as string,
      );
      e.code = (body.error as { code?: string })?.code;
      e.status = res.status;
      e.requestId = (body.meta as { requestId?: string })?.requestId;
      throw e;
    }
    if (!res.ok) {
      const e = new AresError(`Ares HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return (path.startsWith('/api/v1/') ? (body as { data: T }).data : (body as T)) as T;
  }

  /** Drain a paginated v1 endpoint (meta.pagination.totalPages tells us when to stop). */
  async getAllPages<T>(basePath: string, pageSize = 100): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const sep = basePath.includes('?') ? '&' : '?';
      const res = await this.fetchImpl(
        `${this.cfg.baseUrl}${basePath}${sep}page=${page}&pageSize=${pageSize}`,
        { headers: { 'X-API-Key': this.cfg.apiKey, Accept: 'application/json' } },
      );
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: T[];
        error?: { code?: string; message?: string; retryAfter?: number };
        meta?: { pagination?: { totalPages?: number } };
      } | null;
      if (res.status === 429) {
        await sleep((body?.error?.retryAfter ?? 2) * 1000);
        continue; // retry same page
      }
      if (!res.ok || body?.ok === false) {
        const e = new AresError(body?.error?.message ?? `Ares HTTP ${res.status}`);
        e.code = body?.error?.code;
        e.status = res.status;
        throw e;
      }
      out.push(...(body?.data ?? []));
      totalPages = body?.meta?.pagination?.totalPages ?? page;
      page++;
      if (page <= totalPages && this.cfg.pageDelayMs) await sleep(this.cfg.pageDelayMs);
    } while (page <= totalPages);
    return out;
  }

  boards(): Promise<{ boards: AresBoard[] }> {
    return this.get('/api/v1/trello/boards');
  }

  boardCards(boardId: string): Promise<AresCard[]> {
    return this.getAllPages<AresCard>(`/api/v1/trello/boards/${boardId}/cards`);
  }

  boardMovements(boardId: string, fromIso?: string): Promise<AresMovement[]> {
    const q = fromIso ? `?from=${encodeURIComponent(fromIso)}` : '';
    return this.getAllPages<AresMovement>(`/api/v1/trello/boards/${boardId}/movements${q}`);
  }

  health(): Promise<{ status?: string }> {
    return this.get('/healthz');
  }

  /**
   * Single card (gap repair + push-drain reconcile, contracts/ares-push.md).
   * Drift-tolerant on shape ({card, movements} or the card bare); 404 comes
   * back null — the full board sync catches true deletions.
   */
  async card(cardId: string): Promise<AresCard | null> {
    try {
      const data = await this.get<Record<string, unknown>>(`/api/v1/trello/cards/${cardId}`);
      const card = ((data as { card?: unknown })?.card ?? data) as AresCard | null;
      return card && (card as AresCard).cardId ? (card as AresCard) : null;
    } catch (err) {
      if ((err as AresError).status === 404) return null;
      throw err;
    }
  }

  /**
   * Capacity reference weeks (BR-6a) — internal-tier endpoint behind this
   * adapter ONLY. Live shape verified 2026-08-03: deliveryForecast.
   * referenceWeeks.{leastProductive,typical,mostProductive}.total +
   * deliveryForecast.effectiveWeeklyRate. Defensive on drift: absent pieces
   * come back null, never a throw — a PM override stays visible against a
   * stale baseline rather than crashing the sync.
   */
  async referenceWeeks(rowKey: string): Promise<ReferenceWeeks> {
    try {
      const steering = await this.get<Record<string, unknown>>(`/api/project/${rowKey}/steering`);
      const df = (steering?.deliveryForecast ?? {}) as Record<string, unknown>;
      const rw = (df.referenceWeeks ?? {}) as Record<string, { total?: number; cards?: number }>;
      const pick = (k: string) => rw[k]?.total ?? rw[k]?.cards ?? null;
      return {
        least: pick('leastProductive') ?? pick('least'),
        typical: pick('typical'),
        most: pick('mostProductive') ?? pick('most'),
        effectiveWeeklyRate: (df.effectiveWeeklyRate as number | undefined) ?? null,
      };
    } catch {
      return { least: null, typical: null, most: null, effectiveWeeklyRate: null };
    }
  }
}
