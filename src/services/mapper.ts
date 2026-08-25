/**
 * Trello taxonomy mapper (T028) — the corrected card taxonomy (BRD §5):
 *  - `Main Card` label → deliverable (the planning/forecasting unit)
 *  - everything else → work card, attached to the MC GROUP (invariant 4 —
 *    there is no reliable task→deliverable edge; 1 of 27 titles matched)
 *  - `mc_number` is NOT unique (invariant 3); `display_id` is for humans
 *  - where a board serves several projects, a Trello label disambiguates
 *    (FR-1.3, AC-5)
 */

import { laneOf } from '../../lib/model.ts';
import { URGENT_LABEL_NAME } from '../../lib/trello.ts';
import type { AresCard } from './ares.ts';
import { manilaDate } from './pipeline.ts';

export const MAIN_CARD_LABEL = 'Main Card';
const MC_RE = /\bMC[-\s]?(\d+)\b/i;
const DIFFICULTY_RE = /^Difficulty:\s*(Easy|Medium|Hard)$/i;
const BLOCKER_PREFIX = '🛑';
const FIGMA_RE = /https:\/\/(?:www\.)?figma\.com\/[^\s)"']+/;
const TASK_PREFIX_RE = /^([A-Za-z][A-Za-z /&-]{1,39}):\s/;

export interface MappedDeliverable {
  trello_card_id: string;
  trello_url?: string;
  name: string;
  mc_number: string | null;
  current_list: string | null;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  lane: string;
  blocker?: string;
  figma_url?: string;
  labels: string[];
  /** owl #62 — the Trello card's own creation instant, the pipeline's natural order. */
  trello_created_at: string | null;
  trello_due: string | null;
  /** Raw due instant from ARES — kept so W2 writes preserve time-of-day. */
  trello_due_at: string | null;
  /** Reconciled from the `Urgent` label (FR-9.5) — Trello is the truth. */
  urgent: boolean;
  active: boolean;
  /**
   * When ARES last fetched this card from Trello (`AresCard.lastPolledAt`).
   * NOT a display field — it is the clock `staleGuard` compares a Sirius
   * registry write against, and the only field on this record whose job is to
   * describe the PAYLOAD rather than the card.
   */
  trello_polled_at: string | null;
}

export interface MappedWorkCard {
  trello_card_id: string;
  trello_url?: string;
  name: string;
  mc_number: string;
  task_prefix?: string;
  difficulty?: string;
  current_list: string | null;
  figma_url?: string;
  /** W2 on task cards (2026-08-18): same date-only + instant pair as the deliverable */
  trello_due: string | null;
  trello_due_at: string | null;
  active: boolean;
  /** Same payload-fetch instant as the deliverable's — see there. */
  trello_polled_at: string | null;
}

export interface MapResult {
  deliverables: MappedDeliverable[];
  workCards: MappedWorkCard[];
  /** Cards with no MC number in the title — reported, never guessed (BRD §4: 478/498 coverage). */
  unlinked: Array<{ trello_card_id: string; name: string; isMainCard: boolean }>;
}

export function mcNumberOf(name: string): string | null {
  const m = MC_RE.exec(name || '');
  return m ? `MC-${m[1]}` : null;
}

function labelNames(card: AresCard): string[] {
  return (card.labels ?? []).map((l) => l.name).filter(Boolean);
}

function difficultyOf(labels: string[]): 'Easy' | 'Medium' | 'Hard' | undefined {
  for (const l of labels) {
    const m = DIFFICULTY_RE.exec(l.trim());
    if (m) {
      const v = m[1]!.toLowerCase();
      return (v.charAt(0).toUpperCase() + v.slice(1)) as 'Easy' | 'Medium' | 'Hard';
    }
  }
  return undefined;
}

function blockerOf(labels: string[]): string | undefined {
  const b = labels.find((l) => l.startsWith(BLOCKER_PREFIX));
  return b ? b.replace(BLOCKER_PREFIX, '').trim() : undefined;
}

function figmaOf(card: AresCard): string | undefined {
  const m = FIGMA_RE.exec(card.description ?? '');
  return m ? m[0] : undefined;
}

/* MANILA-day, not a UTC slice (review pass 2026-08-18, finding on both W2
   halves): a Trello due set 00:00–07:59 Manila arrives as the PREVIOUS UTC
   day, and slicing stored it a day early beside the manilaDate()-true
   Started/Done on the same row — misleading the no-op guard into a rewrite.
   DATE_ONLY documents itself as "an Asia/Manila calendar day" (invariant 11);
   now it is one. Stored values self-heal on the next sync's $set. */
const dateOnly = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : manilaDate(d);
};

/**
 * Map a board's cards for one project. `projectLabel` null means the whole
 * board belongs to the project; set, only cards carrying it appear (AC-5).
 */
export function mapTrello(cards: AresCard[], projectLabel: string | null): MapResult {
  const scoped = projectLabel
    ? cards.filter((c) => labelNames(c).includes(projectLabel))
    : cards;

  const result: MapResult = { deliverables: [], workCards: [], unlinked: [] };

  for (const card of scoped) {
    const labels = labelNames(card);
    const isMainCard = labels.includes(MAIN_CARD_LABEL);
    const mc = mcNumberOf(card.name);
    const active = !card.archived && card.status !== 'archived';

    if (isMainCard) {
      result.deliverables.push({
        trello_card_id: card.cardId,
        trello_url: card.url,
        name: card.name,
        mc_number: mc,
        current_list: card.currentList,
        difficulty: difficultyOf(labels),
        lane: laneOf({ currentList: card.currentList ?? '', labels }),
        blocker: blockerOf(labels),
        figma_url: figmaOf(card),
        labels,
        // owl #62 — the pipeline's natural order. Stored as the instant ARES
        // reports; the day-string derivation stays with whoever displays it.
        trello_created_at: card.createdAt ?? null,
        trello_due: dateOnly(card.due),
        trello_due_at: card.due ?? null,
        urgent: labels.includes(URGENT_LABEL_NAME),
        active,
        trello_polled_at: card.lastPolledAt ?? null,
      });
      if (!mc) result.unlinked.push({ trello_card_id: card.cardId, name: card.name, isMainCard: true });
    } else {
      if (!mc) {
        result.unlinked.push({ trello_card_id: card.cardId, name: card.name, isMainCard: false });
        continue; // a task with no MC group attaches to nothing — reported, not guessed
      }
      const prefix = TASK_PREFIX_RE.exec(card.name);
      result.workCards.push({
        trello_card_id: card.cardId,
        trello_url: card.url,
        name: card.name,
        mc_number: mc,
        task_prefix: prefix?.[1],
        difficulty: difficultyOf(labels),
        current_list: card.currentList,
        figma_url: figmaOf(card),
        trello_due: dateOnly(card.due),
        trello_due_at: card.due ?? null,
        active,
        trello_polled_at: card.lastPolledAt ?? null,
      });
    }
  }
  return result;
}

/**
 * Stable display ids (invariant 3): a lone deliverable shows its bare MC
 * number; multi-deliverable groups suffix .1, .2… Existing assignments are
 * NEVER reshuffled — new arrivals take the next free suffix, so a human's
 * "MC-655.3" keeps meaning the same card forever.
 */
export function assignDisplayIds(
  existing: Map<string, string>, // trello_card_id → display_id already in the db
  deliverables: MappedDeliverable[],
): Map<string, string> {
  const out = new Map<string, string>(existing);
  const groups = new Map<string, MappedDeliverable[]>();
  for (const d of deliverables) {
    const key = d.mc_number ?? `__no_mc__${d.trello_card_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  for (const [mc, group] of groups) {
    if (mc.startsWith('__no_mc__')) {
      const d = group[0]!;
      if (!out.has(d.trello_card_id)) out.set(d.trello_card_id, d.name.slice(0, 40));
      continue;
    }
    const assigned = group.filter((d) => out.has(d.trello_card_id));
    const fresh = group
      .filter((d) => !out.has(d.trello_card_id))
      .sort((a, b) => a.trello_card_id.localeCompare(b.trello_card_id));
    const groupTotal = assigned.length + fresh.length;
    let maxSuffix = 0;
    for (const d of assigned) {
      const suffix = out.get(d.trello_card_id)!.match(/\.(\d+)$/);
      if (suffix) maxSuffix = Math.max(maxSuffix, Number(suffix[1]));
      else maxSuffix = Math.max(maxSuffix, 1); // a bare id counts as .1
    }
    for (const d of fresh) {
      if (groupTotal === 1) {
        out.set(d.trello_card_id, mc);
      } else {
        maxSuffix += 1;
        out.set(d.trello_card_id, `${mc}.${maxSuffix}`);
      }
    }
  }
  return out;
}
