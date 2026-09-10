/**
 * ARES read API client — contracts/ares-read.md (T027).
 *
 * Two surfaces, two shapes: /api/v1/* envelopes {ok, data, meta}; /api/*
 * returns the payload bare; errors enveloped on both. v1 is rate-limited
 * 60 req/min — honour retryAfter on 429, pace pagination politely.
 * Read-only key, server-side only; a write returns 403 READ_ONLY_KEY by
 * design and is a bug in the CALLER, never a reason for a bigger key.
 */

import { z } from 'zod';

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
  /**
   * When ARES last FETCHED this card from Trello — not when we asked it for
   * the card, and not when the card last changed. ARES never reads Trello at
   * request time (`getCard()` is a `findOne` against its own store), so this
   * is the only honest answer to "how old is this data" (contract
   * §Freshness, settled 2026-08-25).
   *
   * Stamped by `buildCardDoc`, which BOTH of ARES's writers share — the
   * 15-minute poll and the Trello webhook that re-fetches a changed card
   * within seconds. That shared stamp is what makes it safe to compare
   * against: it tracks whichever path last fetched, so it stays correct
   * under either cadence and under any future one.
   *
   * Optional in the type because ARES's own audit records this field as
   * "read by none" — a cleanup could remove it. `staleGuard` treats its
   * absence as infinitely stale rather than falling back to a clock that
   * would silently reinstate the bug it guards.
   */
  lastPolledAt?: string;
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

/**
 * The cycle-time model (T180; Ares #03/#04, live 2026-09-10). One cell per
 * work-type label × difficulty; durations are WORKING DAYS on Ares's own
 * calendar (weekends + holidays removed, ÷ `workingDayHours`) — already the
 * unit the grid stores, so nothing here converts. `workingDayHours` is
 * carried through to provenance and never assumed (24 today, by design).
 */
export interface AresCycleTimeCell {
  workType: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  source: 'project' | 'firm';
  n: number;
  meanWorkingDays: number;
  p70: number;
  p85: number;
  p95: number;
  meanCalendarHours: number;
}

/**
 * Q2-A (JP 2026-09-10; Sirius→Ares #15): the grid's cell is lane × difficulty,
 * and percentiles cannot be pooled from per-work-type cells — only Ares, who
 * holds the samples, can pool them. `laneCells` is what #15 asked for; live
 * since Ares #05 (2026-09-10), still OPTIONAL in the reader — a model without
 * it maps to no grid cells at all. Ares's `laneKeys` field is stripped, not
 * read: the lane vocabulary Sirius honours is `lib/model`'s union.
 */
export interface AresCycleTimeLaneCell {
  laneKey: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  source: 'project' | 'firm';
  n: number;
  meanWorkingDays: number;
  p70: number;
  p85: number;
  p95: number;
}

export interface AresCycleTimeModel {
  rtProjectId: number | null;
  generatedAt: string;
  window: { from: string; to: string };
  floorMinutes: number;
  overrideDays: number;
  workingDayHours: number;
  workTypeKeys: string[];
  historyUnverified: number;
  dropped: { considered: number; sampled: number; reasons: Record<string, number> };
  cells: AresCycleTimeCell[];
  laneCells?: AresCycleTimeLaneCell[];
}

/** Apollo's id-keyed lane table for one board (`/boards/{id}/lanes`, Ares #01). */
export interface AresBoardLane {
  listId: string;
  name: string;
  pos: number;
  type: 'work' | 'process';
  group: string;
  isStart: boolean;
  isDone: boolean;
}

const difficultySchema = z.enum(['Easy', 'Medium', 'Hard']);
const cellSourceSchema = z.enum(['project', 'firm']);
/**
 * A sample count or a duration below zero cannot be a working-day figure;
 * the boundary rejects it (fail-closed, the `referenceWeeks` style) rather
 * than letting the gate — which checks tier ordering, not sign — write it
 * (review A2-5). Within-cell p70 ≤ p85 ≤ p95 is the gate's to consider.
 */
const count = z.number().nonnegative();
const workingDays = z.number().nonnegative();
/** The statistics a work-type cell and a lane cell share; only the key field differs. */
const cellStats = {
  difficulty: difficultySchema,
  source: cellSourceSchema,
  n: count,
  meanWorkingDays: workingDays,
  p70: workingDays,
  p85: workingDays,
  p95: workingDays,
};
const cycleTimeCellSchema = z.object({ workType: z.string(), ...cellStats, meanCalendarHours: z.number().nonnegative() });
const laneCellSchema = z.object({ laneKey: z.string(), ...cellStats });
const sumReasons = (reasons: Record<string, number>) => Object.values(reasons).reduce((a, b) => a + b, 0);
/**
 * Plain `z.object` (unknown fields stripped, tolerant of payload growth — the
 * webhook precedent). The one refinement re-asserts Ares's own identity,
 * `considered === sampled + Σreasons`: a payload that breaks its own
 * accounting is not one to build a forecast on (drift item 15).
 */
const cycleTimeModelSchema: z.ZodType<AresCycleTimeModel> = z
  .object({
    rtProjectId: z.number().nullable(),
    generatedAt: z.string(),
    window: z.object({ from: z.string(), to: z.string() }),
    floorMinutes: z.number(),
    overrideDays: z.number(),
    workingDayHours: z.number(),
    workTypeKeys: z.array(z.string()),
    historyUnverified: z.number(),
    dropped: z.object({ considered: z.number(), sampled: z.number(), reasons: z.record(z.number()) }),
    cells: z.array(cycleTimeCellSchema),
    laneCells: z.array(laneCellSchema).optional(),
  })
  .refine((m) => m.dropped.considered === m.dropped.sampled + sumReasons(m.dropped.reasons), {
    message: 'dropped.considered must equal dropped.sampled + Σ dropped.reasons',
    path: ['dropped'],
  });

const boardLanesSchema = z.object({
  syncedAt: z.string().nullable().optional(),
  lanes: z.array(
    z.object({
      listId: z.string(),
      name: z.string(),
      pos: z.number(),
      type: z.enum(['work', 'process']),
      // Ares sends null for a list Apollo put in no group; '' keeps the
      // frozen `group: string` and still reads as "none" to a consumer.
      group: z.string().nullable().transform((g) => g ?? ''),
      isStart: z.boolean(),
      isDone: z.boolean(),
    }),
  ),
});

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
   * Single card WITH its movement history (gap repair + push-drain reconcile,
   * contracts/ares-read.md, contracts/ares-push.md). The push drain needs both
   * halves: the card gives the current list, the movements give the move that
   * triggered the push — without them Started/Done cannot follow a list change
   * until the next full sync. Drift-tolerant on shape ({card, movements} or
   * the card bare, absent movements → []); 404 comes back null — the full
   * board sync catches true deletions.
   */
  async cardWithMovements(cardId: string): Promise<{ card: AresCard | null; movements: AresMovement[] }> {
    try {
      const data = await this.get<Record<string, unknown>>(`/api/v1/trello/cards/${cardId}`);
      const card = ((data as { card?: unknown })?.card ?? data) as AresCard | null;
      const raw = (data as { movements?: unknown })?.movements;
      const movements = Array.isArray(raw)
        ? (raw as AresMovement[]).map((m) => ({ ...m, cardId: m.cardId ?? cardId }))
        : [];
      return { card: card && (card as AresCard).cardId ? (card as AresCard) : null, movements };
    } catch (err) {
      if ((err as AresError).status === 404) return { card: null, movements: [] };
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

  /**
   * Working-day calendar (amendment 2026-08-15 — ARES is canonical, JP).
   * Session-tier endpoints behind this adapter ONLY, same pattern as
   * referenceWeeks. Two independent surfaces:
   *  - /api/workload?mode=daily — columns[] contain ONLY working days
   *    (weekends and holidays are absent), verified live 2026-08-15.
   *  - /api/portfolio/capacity — workingDays[] per Monday-keyed week,
   *    used as a cross-check.
   * Defensive on drift: any failure returns null and the caller keeps the
   * previous calendar rather than crashing or blanking it.
   */
  async workingDayColumns(from: string, to: string): Promise<string[] | null> {
    try {
      const w = await this.get<{ columns?: Array<{ key?: string }> }>(
        `/api/workload?dateFrom=${from}&dateTo=${to}&mode=daily`,
      );
      const days = (w?.columns ?? []).map((c) => c.key).filter((k): k is string => !!k);
      return days.length ? days : null;
    } catch {
      return null;
    }
  }

  /**
   * The cycle-time model for one RT project (T180, block 8). v1, key-gated;
   * `rtProjectId` is the BARE integer — `rt-837` is a 400 on their side and a
   * non-integer never leaves this method. One call per project per night.
   *
   * The `referenceWeeks` style: null on ANY failure — transport, 404 for an
   * unmapped id, a malformed envelope, or a payload whose `dropped` block
   * does not add up — and never a throw, so one project's bad night is one
   * `sync_runs` row, not a dead tick. The caller keeps last night's grid.
   */
  async cycleTimeModel(rtProjectId: number): Promise<AresCycleTimeModel | null> {
    if (!Number.isInteger(rtProjectId)) return null;
    try {
      const data = await this.get<unknown>(`/api/v1/trello/cycle-time/model?rtProjectId=${rtProjectId}`);
      const parsed = cycleTimeModelSchema.safeParse(data);
      if (!parsed.success) {
        console.warn(`[ares] cycle-time model for ${rtProjectId} rejected: ${parsed.error.issues.map((i) => i.path.join('.') || '(root)').join(', ')}`);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  /**
   * Apollo's lane table for a board (block 8 lane reconcile; owl #13). 404
   * means "never synced", not "no lanes" — null either way, and the caller
   * records that the check could not run rather than guessing.
   */
  async boardLanes(boardId: string): Promise<{ lanes: AresBoardLane[]; syncedAt: string | null } | null> {
    try {
      const data = await this.get<unknown>(`/api/v1/trello/boards/${encodeURIComponent(boardId)}/lanes`);
      const parsed = boardLanesSchema.safeParse(data);
      if (!parsed.success) return null;
      return { lanes: parsed.data.lanes, syncedAt: parsed.data.syncedAt ?? null };
    } catch {
      return null;
    }
  }

  async workingDaysPerWeek(
    from: string,
    to: string,
  ): Promise<Array<{ monday: string; workingDays: number }> | null> {
    try {
      const c = await this.get<{ columns?: Array<{ monday?: string }>; workingDays?: number[] }>(
        `/api/portfolio/capacity?from=${from}&to=${to}`,
      );
      const cols = c?.columns ?? [];
      const wd = c?.workingDays ?? [];
      if (!cols.length || cols.length !== wd.length) return null;
      return cols.map((col, i) => ({ monday: col.monday ?? '', workingDays: wd[i] ?? 0 }));
    } catch {
      return null;
    }
  }
}
