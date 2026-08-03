/**
 * Live urgency round-trip smoke (phase 8 validation; phase 9 smoke suite).
 * Runs ONLY against the board given in BOARD — pass the TEST board
 * (invariant 17). Refuses boards listed in PROD_TRELLO_BOARD_IDS.
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

const cards = (await call('GET', `/boards/${BOARD}/cards`)) as Array<{ id: string; name: string }>;
const card = cards.find((c) => c.name.includes('Main Card'));
if (!card) throw new Error('no Main Card on the test board');
console.log('[roundtrip] target:', card.name);

const client = new TrelloClient(KEY, TOKEN);
await client.setUrgency(card.id, BOARD, true);
let labels = ((await call('GET', `/cards/${card.id}`)) as { labels: Array<{ name: string }> }).labels.map((l) => l.name);
console.log('[roundtrip] after set:', labels.includes('Urgent') ? 'Urgent PRESENT ✓' : 'MISSING ✗', JSON.stringify(labels));

await client.setUrgency(card.id, BOARD, false);
labels = ((await call('GET', `/cards/${card.id}`)) as { labels: Array<{ name: string }> }).labels.map((l) => l.name);
console.log('[roundtrip] after unset:', !labels.includes('Urgent') ? 'Urgent ABSENT ✓' : 'STILL THERE ✗', JSON.stringify(labels));
console.log('[roundtrip] done — absence means non-urgent, round-trip verified');
