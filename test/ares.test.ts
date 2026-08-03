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
