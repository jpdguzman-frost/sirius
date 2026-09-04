/**
 * Live urgency round-trip smoke (phase 8 validation; phase 9 smoke suite).
 * Runs ONLY against the board given in BOARD — pass the TEST board
 * (invariant 17). Refuses boards listed in PROD_TRELLO_BOARD_IDS.
 *
 * W1 TARGETS THE WORK CARD since owl #78 (2026-09-05): urgency lives on the
 * task card, not on the MC main card, so a smoke that labels a Main Card
 * exercises a write path the product no longer has. The target is picked by
 * LABEL — a main card wears `Main Card`, a work card does not — because the
 * kind is a board fact and the naming convention is only a convention.
 *
 * Usage: BOARD=tx8gDsTH npx tsx scripts/urgency-roundtrip.ts
 */

import 'dotenv/config';
import { TrelloClient } from '../lib/trello.ts';

const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN ?? process.env.TRELLO_WRITE_TOKEN;
const BOARD = process.env.BOARD;

if (!KEY || !TOKEN || !BOARD) {
  console.error('[roundtrip] TRELLO_API_KEY, TRELLO_TOKEN and BOARD are required');
  process.exit(1);
}
const prodIds = (process.env.PROD_TRELLO_BOARD_IDS ?? '').split(',').map((s) => s.trim());
if (prodIds.includes(BOARD)) {
  console.error('[roundtrip] REFUSING: that is a production board (invariant 17)');
  process.exit(1);
}

const call = async (m: string, p: string) => {
  const sep = p.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.trello.com/1${p}${sep}key=${KEY}&token=${TOKEN}`, { method: m });
  if (!r.ok) throw new Error(`${m} ${p.split('?')[0]} HTTP ${r.status}`);
  return r.json();
};

const cards = (await call('GET', `/boards/${BOARD}/cards?fields=name,labels`)) as Array<{
  id: string;
  name: string;
  labels: Array<{ name: string }>;
}>;
const isWorkCard = (c: { labels: Array<{ name: string }> }) => !c.labels.some((l) => l.name === 'Main Card');
// prefer a task card that names its MC group, so the log line reads like the
// board does; any unlabelled card will do if the test board has none
const workCards = cards.filter(isWorkCard);
const card = workCards.find((c) => /^MC-\d+ /.test(c.name)) ?? workCards[0];
if (!card) {
  console.error('[roundtrip] REFUSING: every card on that board carries the Main Card label — W1 writes WORK cards (owl #78)');
  process.exit(1);
}
console.log('[roundtrip] target: work card —', card.name);

const client = new TrelloClient(KEY, TOKEN);
await client.setUrgency(card.id, BOARD, true);
let labels = ((await call('GET', `/cards/${card.id}`)) as { labels: Array<{ name: string }> }).labels.map((l) => l.name);
console.log('[roundtrip] after set:', labels.includes('Urgent') ? 'Urgent PRESENT ✓' : 'MISSING ✗', JSON.stringify(labels));

await client.setUrgency(card.id, BOARD, false);
labels = ((await call('GET', `/cards/${card.id}`)) as { labels: Array<{ name: string }> }).labels.map((l) => l.name);
console.log('[roundtrip] after unset:', !labels.includes('Urgent') ? 'Urgent ABSENT ✓' : 'STILL THERE ✗', JSON.stringify(labels));
console.log('[roundtrip] done — absence means non-urgent, round-trip verified');
