/**
 * W4 — business-unit classification write, the COMMIT HALF (invariants 2, 8,
 * 10; contracts/trello-write.md §W4; BRD v3.0 §9 / FR-4.11; build-spec v1.4
 * §4.3a). The W4 analogue of `commitRegistryWrite` in src/routes/writes.ts,
 * deliberately NOT Express-coupled: there is no route to hand it a request,
 * because the surface (which tab, which card kind) and the ingestion actor are
 * UNRULED. Server-side work proceeds on the rule; the control cannot. Nothing
 * calls this yet.
 *
 * What it guarantees, the same as W1–W3:
 *  - Trello FIRST. The document changes only after `setClassification`
 *    returned, so a throw leaves it exactly as it was — Sirius never displays
 *    a state Trello lacks (invariant 8), the optimistic change reverts.
 *  - audit_log AND sync_runs on success and on failure (invariant 10: one
 *    act, one row). Actions `classification.set` / `classification.set_failed`.
 *  - `registry_written_at` is stamped on SUCCESS only — the stale-reconcile
 *    guard's clock (`staleGuard`, worker/syncAres.ts). NOTE: `unit_label` is
 *    NOT yet in `registryFields()`, so it is not reconciled from ARES reads
 *    until a caller exists; the stamp is shared with urgency/due/difficulty by
 *    design, as it already is for those three.
 *  - No-op when the document already carries the tag, compared the way the
 *    resolver matches (trim + case-fold): no Trello call, no audit row, no
 *    run row, no stamp. A case-only change is not an act (review F2).
 *  - The stored value is the board label's CANONICAL name (what
 *    `setClassification` resolved to), never the raw tag; the audit's
 *    before/after carry the stored values.
 *  - The failure branch never depends on the store that just failed: the
 *    `sync_runs` row is written FIRST, then the failure audit, each guarded
 *    so nothing escapes this function (review F4). RESIDUAL, stated: an
 *    audit failure AFTER Trello and `doc.save()` succeeded returns `ok:false`
 *    while Trello and the document already carry the new tag (the run row
 *    records it); and a write that succeeded in Trello with BOTH stores down
 *    is recorded nowhere until the next reconcile.
 *
 * What it does NOT do — the CALLER'S obligation, exactly as for W1–W3: the
 * refusal checks `writeGuards()` runs before every registry write (the
 * production-board guard of invariant 17, the G7 `writes_enabled` refusal,
 * the local-row and active-document lookups, membership). This function is
 * safe to unit-test and is NOT safe to call from anywhere that skipped those.
 *
 * `actor` is a bare string, not `req.user`: an ingestion-triggered tag would
 * be the first write with no human actor and records `system` deliberately
 * (build-spec §4.3a) — whether that is allowed is JP's ruling, not this
 * function's; it only has to be able to carry it.
 */

import type { Types } from 'mongoose';
import { audit } from './audit.ts';
import { SyncRun } from '../models/index.ts';
import type { TrelloClient } from '../../lib/trello.ts';

export type ClassificationEntity = 'deliverable' | 'work_card';

export interface ClassificationWriteContext {
  trello: TrelloClient;
  projectId: Types.ObjectId;
  boardId: string;
  cardId: string;
  entity: ClassificationEntity;
  /** the Sirius document the tag persists on — whichever card kind gets ruled */
  doc: { unit_label?: string | null; registry_written_at?: Date | null; save(): Promise<unknown> };
  /** the business unit to tag — matched against the board's EXISTING labels, never created */
  tag: string;
  actor: string;
}

export type ClassificationWriteResult =
  | { ok: true; noop: boolean; before: string | null; after: string }
  | { ok: false; error: string; before: string | null };

/** the resolver's normalisation (lib/trello.ts `resolveLabelIds`): trim + case-fold */
const norm = (v: string) => v.trim().toLowerCase();

export async function applyClassificationWrite(ctx: ClassificationWriteContext): Promise<ClassificationWriteResult> {
  const before = ctx.doc.unit_label ?? null;
  const attempted = ctx.tag;
  if (before !== null && norm(before) === norm(attempted)) {
    // no-op guard: no Trello call, no audit row, no run row, no stamp —
    // `after` is the stored value, which is what the document keeps
    return { ok: true, noop: true, before, after: before };
  }

  const entry = { project_id: ctx.projectId, actor: ctx.actor, entity: ctx.entity, entity_id: ctx.cardId };
  try {
    // Trello first; `before` is the label Sirius last wrote, which is the one
    // the swap strips (a label Sirius never wrote is left alone). The value
    // stored is the board's canonical name, not the raw tag.
    const after = await ctx.trello.setClassification(ctx.cardId, ctx.boardId, attempted, before);
    ctx.doc.unit_label = after;
    ctx.doc.registry_written_at = new Date();
    await ctx.doc.save();
    const runStats = { cardId: ctx.cardId, kind: 'classification', entity: ctx.entity, unit_label: after };
    await audit({ ...entry, action: 'classification.set', before: { unit_label: before }, after: { unit_label: after } });
    await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: true, stats: runStats });
    return { ok: true, noop: false, before, after };
  } catch (err) {
    // an unmatched, ambiguous or reserved label is a refusal, recorded and
    // surfaced the same way a failed Trello call is — the document is
    // untouched by a throw before `doc.save()`. Run row FIRST, then the
    // audit, each guarded: a failing audit_log must not take the run row
    // with it, and nothing thrown here escapes (header: residual).
    const message = (err as Error).message;
    const runStats = { cardId: ctx.cardId, kind: 'classification', entity: ctx.entity, unit_label: attempted };
    await SyncRun.create({ project_id: ctx.projectId, source: 'trello_write', ok: false, error: message, stats: runStats }).catch(() => {});
    await audit({ ...entry, action: 'classification.set_failed', before: { unit_label: before }, after: { attempted, error: message } }).catch(() => {});
    return { ok: false, error: message, before };
  }
}
