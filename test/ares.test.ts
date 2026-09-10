/**
 * T027 — ARES client: envelope unwrap by surface, pagination drain,
 * 429/retryAfter honour, error mapping, steering adapter drift tolerance.
 * Recorded-shape fixtures mirror live responses (verified 2026-08-03).
 */

import { describe, expect, it, vi } from 'vitest';
import { AresClient, AresError } from '../src/services/ares.ts';

type Resp = { status?: number; body: unknown };

function clientWith(responses: Record<string, Resp | Resp[]>): { client: AresClient; calls: string[] } {
  const calls: string[] = [];
  const counters: Record<string, number> = {};
  const fetchImpl = vi.fn(async (url: unknown) => {
    const u = String(url).replace('https://ares.test', '');
    calls.push(u);
    const key = Object.keys(responses).find((k) => u.startsWith(k));
    if (!key) return new Response(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND' } }), { status: 404 });
    const entry = responses[key]!;
    const list = Array.isArray(entry) ? entry : [entry];
    const idx = Math.min(counters[key] ?? 0, list.length - 1);
    counters[key] = (counters[key] ?? 0) + 1;
    const r = list[idx]!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return {
    client: new AresClient({ baseUrl: 'https://ares.test', apiKey: 'k', fetchImpl, pageDelayMs: 0 }),
    calls,
  };
}

describe('surfaces & envelopes', () => {
  it('unwraps the v1 envelope and returns /api/* bare', async () => {
    const { client } = clientWith({
      '/api/v1/trello/boards': { body: { ok: true, data: { boards: [{ boardId: 'b1' }] }, meta: {} } },
      '/api/projects/index': { body: { projects: [{ rowKey: '837' }] } },
    });
    expect((await client.boards()).boards[0]?.boardId).toBe('b1');
    expect(await client.get('/api/projects/index')).toEqual({ projects: [{ rowKey: '837' }] });
  });

  it('maps enveloped errors to AresError with code and requestId', async () => {
    const { client } = clientWith({
      '/api/v1/trello/boards': {
        status: 403,
        body: { ok: false, error: { code: 'READ_ONLY_KEY', message: 'nope' }, meta: { requestId: 'r1' } },
      },
    });
    await expect(client.boards()).rejects.toMatchObject({ code: 'READ_ONLY_KEY', requestId: 'r1' });
  });

  it('honours retryAfter on 429 and then succeeds', async () => {
    const { client, calls } = clientWith({
      '/api/v1/trello/boards': [
        { status: 429, body: { ok: false, error: { code: 'RATE_LIMited', retryAfter: 0 } } },
        { body: { ok: true, data: { boards: [] }, meta: {} } },
      ],
    });
    expect((await client.boards()).boards).toEqual([]);
    expect(calls.length).toBe(2);
  });
});

describe('pagination', () => {
  it('drains all pages using meta.pagination.totalPages', async () => {
    const page = (n: number) => ({
      body: {
        ok: true,
        data: [{ cardId: `c${n}` }],
        meta: { pagination: { page: n, totalPages: 3 } },
      },
    });
    const { client, calls } = clientWith({ '/api/v1/trello/boards/b1/cards': [page(1), page(2), page(3)] });
    const cards = await client.boardCards('b1');
    expect(cards.map((c) => c.cardId)).toEqual(['c1', 'c2', 'c3']);
    expect(calls.length).toBe(3);
  });
});

describe('steering adapter (internal tier — drift-tolerant, T030)', () => {
  it('reads the LIVE shape: referenceWeeks.{leastProductive,typical,mostProductive}.total', async () => {
    const { client } = clientWith({
      '/api/project/837/steering': {
        body: {
          deliveryForecast: {
            referenceWeeks: {
              leastProductive: { week: '2026-W03', total: 1 },
              typical: { week: '2026-W07', total: 116 },
              mostProductive: { week: '2026-W30', total: 367 },
            },
            effectiveWeeklyRate: 89.2,
          },
        },
      },
    });
    expect(await client.referenceWeeks('837')).toEqual({
      least: 1,
      typical: 116,
      most: 367,
      effectiveWeeklyRate: 89.2,
    });
  });

  it('returns nulls on drift or failure — never throws (a stale baseline beats a crashed sync)', async () => {
    const { client } = clientWith({
      '/api/project/837/steering': { body: { totallyDifferent: true } },
      '/api/project/999/steering': { status: 404, body: { ok: false, error: { code: 'NOT_FOUND' } } },
    });
    expect(await client.referenceWeeks('837')).toEqual({ least: null, typical: null, most: null, effectiveWeeklyRate: null });
    expect(await client.referenceWeeks('999')).toEqual({ least: null, typical: null, most: null, effectiveWeeklyRate: null });
  });

  it('still accepts the documented `cards` field if ARES reverts to it', async () => {
    const { client } = clientWith({
      '/api/project/837/steering': {
        body: { deliveryForecast: { referenceWeeks: { least: { cards: 2 }, typical: { cards: 120 }, most: { cards: 300 } } } },
      },
    });
    expect((await client.referenceWeeks('837')).typical).toBe(120);
  });
});

describe('error surfaces', () => {
  it('wraps plain HTTP failures', async () => {
    const { client } = clientWith({});
    await expect(client.get('/api/unknown')).rejects.toBeInstanceOf(AresError);
  });
});

/* ------------------------------------------------------------------------ */
/* Block 8 (T180): the cycle-time model reader and Apollo's lane table.      */
/* Fixture shape = the live envelope verified 2026-09-10 (state log), plus   */
/* `laneCells` as asked in Sirius→Ares #15 (optional until it ships).         */
/* ------------------------------------------------------------------------ */

const MODEL_BODY = {
  rtProjectId: 837,
  generatedAt: '2026-09-10T16:00:03.000Z',
  window: { from: '2025-09-10', to: '2026-09-10' },
  floorMinutes: 15,
  overrideDays: 14,
  workingDayHours: 24,
  workTypeKeys: ['Asset: Icons', 'Design: Refinement'],
  historyUnverified: 80,
  dropped: { considered: 100, sampled: 80, reasons: { noDifficulty: 15, noWorkTypeLabel: 5 } },
  cells: [
    { workType: 'Design: Refinement', difficulty: 'Medium', source: 'project', n: 33, meanWorkingDays: 0.9, p70: 0.7, p85: 1.4, p95: 2.8, meanCalendarHours: 21.5 },
    { workType: 'Asset: Icons', difficulty: 'Easy', source: 'firm', n: 47, meanWorkingDays: 0.2, p70: 0.14, p85: 0.5, p95: 1.1, meanCalendarHours: 4.8 },
  ],
  laneCells: [
    { laneKey: 'design', difficulty: 'Medium', source: 'project', n: 80, meanWorkingDays: 0.9, p70: 0.7, p85: 1.4, p95: 2.8 },
  ],
};
const envelope = (data: unknown) => ({ body: { ok: true, data, meta: {} } });

describe('cycleTimeModel (v1, key-gated — null on any failure, T180)', () => {
  it('reads the live envelope with the bare integer id and keeps workingDayHours + laneCells', async () => {
    const { client, calls } = clientWith({ '/api/v1/trello/cycle-time/model': envelope(MODEL_BODY) });
    const model = await client.cycleTimeModel(837);
    expect(calls[0]).toBe('/api/v1/trello/cycle-time/model?rtProjectId=837');
    expect(model).toEqual(MODEL_BODY);
    expect(model?.workingDayHours).toBe(24); // recorded, never assumed
  });

  it('accepts a model WITHOUT laneCells (optional until #15 ships)', async () => {
    const { laneCells: _omitted, ...withoutLanes } = MODEL_BODY;
    void _omitted;
    const { client } = clientWith({ '/api/v1/trello/cycle-time/model': envelope(withoutLanes) });
    const model = await client.cycleTimeModel(837);
    expect(model?.cells).toHaveLength(2);
    expect(model?.laneCells).toBeUndefined();
  });

  it('rejects a malformed envelope with null — a string percentile, a missing block', async () => {
    const stringP70 = { ...MODEL_BODY, cells: [{ ...MODEL_BODY.cells[0], p70: '0.7' }] };
    const { dropped: _d, ...noDropped } = MODEL_BODY;
    void _d;
    const a = clientWith({ '/api/v1/trello/cycle-time/model': envelope(stringP70) });
    const b = clientWith({ '/api/v1/trello/cycle-time/model': envelope(noDropped) });
    const c = clientWith({ '/api/v1/trello/cycle-time/model': envelope({ totallyDifferent: true }) });
    expect(await a.client.cycleTimeModel(837)).toBeNull();
    expect(await b.client.cycleTimeModel(837)).toBeNull();
    expect(await c.client.cycleTimeModel(837)).toBeNull();
  });

  it('re-asserts Ares\'s own identity: considered ≠ sampled + Σreasons → null (drift item 15)', async () => {
    const broken = { ...MODEL_BODY, dropped: { considered: 100, sampled: 80, reasons: { noDifficulty: 15, noWorkTypeLabel: 4 } } };
    const { client } = clientWith({ '/api/v1/trello/cycle-time/model': envelope(broken) });
    expect(await client.cycleTimeModel(837)).toBeNull();
    // and the identity holding is exactly what lets the fixture above through
    const sum = Object.values(MODEL_BODY.dropped.reasons).reduce((x, y) => x + y, 0);
    expect(MODEL_BODY.dropped.considered).toBe(MODEL_BODY.dropped.sampled + sum);
  });

  it('404 (unmapped id) and 500 come back null, never a throw', async () => {
    const notFound = clientWith({});
    const broken = clientWith({
      '/api/v1/trello/cycle-time/model': { status: 500, body: { ok: false, error: { code: 'INTERNAL', message: 'boom' } } },
    });
    expect(await notFound.client.cycleTimeModel(999999)).toBeNull();
    expect(await broken.client.cycleTimeModel(837)).toBeNull();
  });

  it('a non-integer id never reaches the wire (the `rt-837` → 400 trap, closed on our side too)', async () => {
    const { client, calls } = clientWith({ '/api/v1/trello/cycle-time/model': envelope(MODEL_BODY) });
    expect(await client.cycleTimeModel(Number.NaN)).toBeNull();
    expect(await client.cycleTimeModel(837.5)).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('boardLanes (Apollo\'s id-keyed table — block 8 lane reconcile)', () => {
  it('returns the lanes and syncedAt (null until Ares stamps it); a null group reads as none', async () => {
    const { client, calls } = clientWith({
      '/api/v1/trello/boards/hLL7WW2V/lanes': envelope({
        boardId: 'hLL7WW2V',
        projectName: 'Fx',
        source: 'apollo',
        syncedAt: null,
        lanes: [
          { listId: 'l1', name: 'Working on Design', pos: 0, type: 'work', group: 'Design', isStart: true, isDone: false },
          { listId: 'l2', name: 'NOTE', pos: 1, type: 'process', group: null, isStart: false, isDone: false },
        ],
      }),
    });
    const res = await client.boardLanes('hLL7WW2V');
    expect(calls[0]).toBe('/api/v1/trello/boards/hLL7WW2V/lanes');
    expect(res?.syncedAt).toBeNull();
    expect(res?.lanes.map((l) => l.name)).toEqual(['Working on Design', 'NOTE']);
    expect(res?.lanes[0]).toMatchObject({ listId: 'l1', type: 'work', group: 'Design', isStart: true, isDone: false });
    expect(res?.lanes[1]?.group).toBe('');
  });

  it('404 = never synced, not "no lanes" — null, and a malformed table is null too', async () => {
    const { client } = clientWith({
      '/api/v1/trello/boards/bad/lanes': envelope({ lanes: [{ listId: 'l1' }] }),
    });
    expect(await client.boardLanes('neverSynced')).toBeNull();
    expect(await client.boardLanes('bad')).toBeNull();
  });
});
