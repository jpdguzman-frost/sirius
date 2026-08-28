/**
 * One-off ops script (invariant 17 class, beside create-test-board.ts):
 * makes the TEST board a faithful replica of the production board's
 * MAIN-card / WORK-card lane split, measured from the live board via ARES
 * on 2026-08-28 (594 active cards, JP's spot-check of the schedules tab):
 *
 *  - MAIN cards live ONLY in the client pipeline: `Backlog: Process Lane`
 *    and the `➜ `-prefixed stage lanes. WORK cards live ONLY in internal
 *    design lanes (`Design Backlog`, `Backlog: Icons/Assets/…`, `Working
 *    on Design`, `Ready for Design`, `Ready for Design Review`, `On Hold:
 *    …`). The two sets are disjoint on the real board.
 *  - WORK-card titles are MC-FIRST: `MC-NNN <task type>: <subject>`
 *    (`MC-837 Render Icon: …`), never the type-first shape the original
 *    seeder produced.
 *  - Every WORK card carries a `Difficulty: …` label; none carries
 *    `Main Card`.
 *
 * WHY: create-test-board.ts built its task cards with
 * `mc.replace(/\d+$/, String(i - 4))`, which swallowed the whole trailing
 * digit run — `MC-909` became `MC-5`, not the intended `MC-905` — so the
 * four synthetic work cards matched no main-card group and sat in
 * main-card lanes. The MC group join (deadline/urgency inheritance, the
 * add flow) could never be exercised on the test board.
 *
 * This script: creates the six internal design lanes, renames + moves the
 * four orphans onto MC-905..MC-908 in live title shape, and adds one
 * sibling work card per group so the add dropdown has a real list.
 *
 * GUARDS: the board id is an explicit argument; any id in
 * PROD_TRELLO_BOARD_IDS refuses; the board's name must contain "TEST".
 * Writes go to the given board and nowhere else.
 *
 * Usage: npx tsx scripts/fix-test-board-lanes.ts <boardId>
 */

import 'dotenv/config';

const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_WRITE_TOKEN ?? process.env.TRELLO_TOKEN;
const BASE = 'https://api.trello.com/1';

const boardArg = process.argv[2];
if (!KEY || !TOKEN) {
  console.error('[fix-test-board] TRELLO_API_KEY and TRELLO_WRITE_TOKEN are required');
  process.exit(1);
}
if (!boardArg) {
  console.error('[fix-test-board] usage: npx tsx scripts/fix-test-board-lanes.ts <boardId>');
  process.exit(1);
}
const prodIds = (process.env.PROD_TRELLO_BOARD_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// hLL7WW2V is the known production board — refused even where the env var
// is unset (a laptop .env leaves it blank; the guard must not depend on it)
if (prodIds.includes(boardArg) || boardArg === 'hLL7WW2V') {
  console.error(`[fix-test-board] ${boardArg} is a PRODUCTION board — refusing (invariant 17)`);
  process.exit(1);
}

const q = (s: string) => encodeURIComponent(s);
async function call<T>(method: string, path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE}${path}${sep}key=${KEY}&token=${TOKEN}`, { method });
  if (!res.ok) throw new Error(`Trello ${method} ${path.split('?')[0]} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface BoardShape {
  id: string;
  name: string;
  lists: Array<{ id: string; name: string }>;
  labels: Array<{ id: string; name: string }>;
  cards: Array<{ id: string; name: string; idList: string }>;
}
const board = await call<BoardShape>(
  'GET',
  `/boards/${boardArg}?fields=name&lists=open&list_fields=name&labels=all&label_fields=name&cards=open&card_fields=name,idList`,
);
if (!/TEST/i.test(board.name)) {
  console.error(`[fix-test-board] board "${board.name}" does not say TEST — refusing`);
  process.exit(1);
}
console.log(`[fix-test-board] target: "${board.name}" (${board.id})`);

/* The internal design lanes, from the live measurement. Idempotent: an
   existing lane of the same name is reused, never duplicated. */
const WORK_LANES = [
  'Design Backlog',
  'Backlog: Icons',
  'Backlog: Assets',
  'Working on Design',
  'Ready for Design',
  'Ready for Design Review',
];
const listIds = new Map(board.lists.map((l) => [l.name, l.id]));
for (const name of WORK_LANES) {
  if (listIds.has(name)) continue;
  const l = await call<{ id: string }>('POST', `/boards/${board.id}/lists?name=${q(name)}&pos=bottom`);
  listIds.set(name, l.id);
  console.log(`[fix-test-board] lane created: ${name}`);
}

const labelIds = new Map(board.labels.filter((l) => l.name).map((l) => [l.name, l.id]));
const diffId = (d: string) => labelIds.get(`Difficulty: ${d}`);

/* The four orphans → their intended groups (create-test-board's i−4
   mapping), live title shape, live task-type vocabulary, work lanes. */
const REPAIRS: Array<{ from: string; to: string; lane: string }> = [
  { from: 'Render Asset: MC-5 synthetic test task', to: 'MC-905 Illustrate Asset: synthetic test task', lane: 'Working on Design' },
  { from: 'Render Asset: MC-6 synthetic test task', to: 'MC-906 Render Icon: synthetic test task', lane: 'Design Backlog' },
  { from: 'Render Asset: MC-7 synthetic test task', to: 'MC-907 Cascade Mobile Screen: synthetic test task', lane: 'Backlog: Assets' },
  { from: 'Render Asset: MC-8 synthetic test task', to: 'MC-908 Icon Clean Up: synthetic test task', lane: 'Ready for Design Review' },
];
for (const r of REPAIRS) {
  const card = board.cards.find((c) => c.name === r.from);
  if (!card) {
    console.log(`[fix-test-board] already repaired or absent: "${r.from}" — skipping`);
    continue;
  }
  await call('PUT', `/cards/${card.id}?name=${q(r.to)}&idList=${listIds.get(r.lane)}`);
  console.log(`[fix-test-board] repaired: "${r.from}" → "${r.to}" · ${r.lane}`);
}

/* One sibling per group — a second work card makes the add dropdown a real
   list. Skipped when a card of the same name already exists (idempotent). */
const SIBLINGS: Array<{ name: string; lane: string; diff: string }> = [
  { name: 'MC-905 Render Icon: synthetic sibling task', lane: 'Backlog: Icons', diff: 'Medium' },
  { name: 'MC-906 Componentize Icon: synthetic sibling task', lane: 'Ready for Design', diff: 'Easy' },
  { name: 'MC-907 Cascade Tablet Screen: synthetic sibling task', lane: 'Design Backlog', diff: 'Medium' },
  { name: 'MC-908 Illustrate Asset: synthetic sibling task', lane: 'Working on Design', diff: 'Hard' },
];
for (const s of SIBLINGS) {
  if (board.cards.some((c) => c.name === s.name)) {
    console.log(`[fix-test-board] sibling exists: "${s.name}" — skipping`);
    continue;
  }
  const ids = [diffId(s.diff)].filter(Boolean).join(',');
  await call('POST', `/cards?idList=${listIds.get(s.lane)}&name=${q(s.name)}&idLabels=${ids}`);
  console.log(`[fix-test-board] sibling created: "${s.name}" · ${s.lane} · Difficulty: ${s.diff}`);
}

console.log('[fix-test-board] done — next: let ARES re-poll, let the Sirius worker sync, then remove the stale MC-6/MC-7 schedule rows through the API (they snapshot their group at add time and cannot heal by rename).');
