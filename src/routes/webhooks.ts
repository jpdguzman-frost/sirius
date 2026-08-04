/**
 * ARES push receiver (T083; FR-9.4; contracts/ares-push.md).
 *
 * Authenticated by SIGNATURE, not session: HMAC-SHA256 over
 * "<timestamp>.<raw body>" with the shared secret, timestamp within ±5 min,
 * constant-time compare. Any failure answers 401 with an empty body.
 *
 * The receiver does NO sync work in-request (constitution: sync never runs
 * inside a request): it dedupes on event_id, persists to push_events as
 * `pending`, and answers 202 — the worker drains and reconciles.
 *
 * Mounted BEFORE express.json() and the session middleware: it needs the raw
 * body for the HMAC and has no use for a session.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { Project, PushEvent } from '../models/index.ts';
import type { Env } from '../config/env.ts';

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

const envelope = z.object({
  delivery_id: z.string().min(1),
  sent_at: z.string(),
  events: z
    .array(
      z.object({
        event_id: z.string().min(1),
        type: z.enum(['card.changed', 'card.created', 'board.resync']),
        board_id: z.string().min(1),
        card_id: z.string().optional(),
        occurred_at: z.string(),
      }),
    )
    .max(1000),
});

export function verifySignature(secret: string, timestamp: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
}

export function aresWebhookRouter(env: Env): Router {
  const router = Router();

  router.post(
    '/api/webhooks/ares',
    express.raw({ type: 'application/json', limit: '256kb' }),
    async (req, res) => {
      if (!env.ARES_WEBHOOK_SECRET) {
        res.status(503).json({ ok: false, error: { code: 'PUSH_NOT_CONFIGURED' } });
        return;
      }
      const timestamp = req.get('X-Ares-Timestamp');
      const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
      if (!timestamp || !rawBody) {
        res.status(401).end();
        return;
      }
      const ts = Date.parse(timestamp);
      if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) {
        res.status(401).end();
        return;
      }
      if (!verifySignature(env.ARES_WEBHOOK_SECRET, timestamp, rawBody, req.get('X-Ares-Signature'))) {
        res.status(401).end();
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody.toString('utf8'));
      } catch {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }
      const body = envelope.safeParse(parsed);
      if (!body.success) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
        return;
      }

      // Boards → active projects; events for unknown boards are acknowledged
      // and dropped (per-board subscription is ARES-side config; this is the
      // Sirius-side belt to that suspender).
      const projects = await Project.find({ status: 'ongoing' }).select('_id trello_board_id');
      const byBoard = new Map(projects.map((p) => [p.trello_board_id, p._id]));

      const accepted = body.data.events.filter((e) => byBoard.has(e.board_id));
      const ignored = body.data.events.length - accepted.length;

      let inserted = 0;
      if (accepted.length > 0) {
        try {
          const docs = await PushEvent.insertMany(
            accepted.map((e) => ({
              project_id: byBoard.get(e.board_id),
              event_id: e.event_id,
              type: e.type,
              board_id: e.board_id,
              card_id: e.card_id ?? null,
              occurred_at: new Date(e.occurred_at),
            })),
            { ordered: false },
          );
          inserted = docs.length;
        } catch (err) {
          // duplicate event_ids are the idempotency mechanism, not a failure
          const e = err as {
            code?: number;
            writeErrors?: Array<{ code?: number; err?: { code?: number } }>;
            result?: { insertedCount?: number };
            insertedDocs?: unknown[];
          };
          const codes = (e.writeErrors ?? []).map((w) => w.code ?? w.err?.code);
          const allDup = codes.length > 0 ? codes.every((c) => c === 11000) : e.code === 11000;
          if (!allDup) throw err;
          inserted = e.insertedDocs?.length ?? e.result?.insertedCount ?? 0;
        }
      }

      res.status(202).json({ accepted: inserted, duplicates: accepted.length - inserted, ignored });
    },
  );

  return router;
}
