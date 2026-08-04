/**
 * Reconcile live probe (G6; FR-9.5): set/unset the Urgent label directly in
 * Trello — simulating a manual change — then watch ARES until it reflects it,
 * measuring the Trello→ARES leg of NFR-3. Usage:
 *   CARD=<id> BOARD=tx8gDsTH ACTION=set|unset npx tsx scripts/reconcile-probe.ts
 */
import 'dotenv/config';
import { TrelloClient } from '../lib/trello.ts';

const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN ?? process.env.TRELLO_WRITE_TOKEN;
const { CARD, BOARD, ACTION } = process.env;
const prodIds = (process.env.PROD_TRELLO_BOARD_IDS ?? '').split(',').map((s) => s.trim());
if (!KEY || !TOKEN || !CARD || !BOARD || !ACTION) throw new Error('CARD, BOARD, ACTION required');
if (prodIds.includes(BOARD)) throw new Error('REFUSING: production board (invariant 17)');

await new TrelloClient(KEY, TOKEN).setUrgency(CARD, BOARD, ACTION === 'set');
console.log(`[probe] Urgent label ${ACTION} on ${CARD}`);

const t0 = Date.now();
for (let i = 0; i < 30; i++) {
  const res = await fetch(`${process.env.ARES_URL}/api/v1/trello/cards/${CARD}`, {
    headers: { 'X-API-Key': process.env.ARES_API_KEY! },
  });
  const body = (await res.json().catch(() => ({}))) as { data?: unknown };
  const card = ((body.data as { card?: unknown })?.card ?? body.data) as { labels?: Array<{ name: string }> } | null;
  const labels = (card?.labels ?? []).map((l) => l.name);
  if (labels.includes('Urgent') === (ACTION === 'set')) {
    console.log(`[probe] ARES reflected in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log('[probe] ARES did NOT reflect within 150s');
process.exit(1);
