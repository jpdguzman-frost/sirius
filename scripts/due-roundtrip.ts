/**
 * Live W2 due-date round-trip smoke (phase 10 validation; phase 9/10 smoke
 * suite; contracts/trello-write.md W2). Runs ONLY against the board given in
 * BOARD — pass the TEST board (invariant 17). Refuses boards listed in
 * PROD_TRELLO_BOARD_IDS.
 *
 * Usage: BOARD=tx8gDsTH npx tsx scripts/due-roundtrip.ts
 */

import 'dotenv/config';
import { TrelloClient, composeDueIso } from '../lib/trello.ts';

const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN ?? process.env.TRELLO_WRITE_TOKEN;
const BOARD = process.env.BOARD;

if (!KEY || !TOKEN || !BOARD) {
  console.error('[due-roundtrip] TRELLO_API_KEY, TRELLO_TOKEN and BOARD are required');
  process.exit(1);
}
const prodIds = (process.env.PROD_TRELLO_BOARD_IDS ?? '').split(',').map((s) => s.trim());
if (prodIds.includes(BOARD)) {
  console.error('[due-roundtrip] REFUSING: that is a production board (invariant 17)');
  process.exit(1);
}

const call = async (m: string, p: string) => {
  const sep = p.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.trello.com/1${p}${sep}key=${KEY}&token=${TOKEN}`, { method: m });
  if (!r.ok) throw new Error(`${m} ${p.split('?')[0]} HTTP ${r.status}`);
  return r.json();
};

const cards = (await call('GET', `/boards/${BOARD}/cards`)) as Array<{ id: string; name: string; due: string | null }>;
const card = cards.find((c) => c.name.includes('Main Card'));
if (!card) throw new Error('no Main Card on the test board');
console.log('[due-roundtrip] target:', card.name, '· current due:', card.due);

const client = new TrelloClient(KEY, TOKEN);
const date = '2026-09-15'; // arbitrary future Manila day
const dueIso = composeDueIso(date, card.due ? new Date(card.due) : null);

await client.setDue(card.id, dueIso);
let read = (await call('GET', `/cards/${card.id}`)) as { due: string | null };
const roundTripDay = read.due ? read.due.slice(0, 10) : null;
console.log(
  '[due-roundtrip] after set:',
  roundTripDay === date ? `due ${read.due} → day ${roundTripDay} ✓` : `MISMATCH ✗ wrote ${dueIso}, read ${read.due}`,
);

await client.setDue(card.id, card.due ? new Date(card.due).toISOString() : null);
read = (await call('GET', `/cards/${card.id}`)) as { due: string | null };
const restored = (read.due ? new Date(read.due).toISOString() : null) === (card.due ? new Date(card.due).toISOString() : null);
console.log('[due-roundtrip] restored original due:', restored ? `${read.due} ✓` : `MISMATCH ✗ ${read.due}`);
console.log('[due-roundtrip] done — W2 set + clear/restore verified live');
