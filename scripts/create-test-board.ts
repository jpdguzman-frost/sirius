/**
 * One-off ops script (invariant 17, as amended 2026-08-04): creates the
 * NON-PRODUCTION TEST board mirroring the production board's structure —
 * same lists (taken from the locally synced data) and label taxonomy
 * (`Main Card`, `Difficulty: …`, 🛑 blockers) plus a dozen synthetic cards.
 *
 * This is staging setup, not part of Sirius's runtime: it writes only to a
 * BRAND-NEW board it creates, never to any existing one.
 *
 * Usage: MONGODB_URI=... TRELLO_API_KEY=... TRELLO_TOKEN=... npx tsx scripts/create-test-board.ts
 * Then: put the printed board id into the staging project config and add the
 * production board id to PROD_TRELLO_BOARD_IDS everywhere non-production.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { Deliverable } from '../src/models/index.ts';

const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN ?? process.env.TRELLO_WRITE_TOKEN;
const BASE = 'https://api.trello.com/1';

if (!KEY || !TOKEN) {
  console.error('[test-board] TRELLO_API_KEY and TRELLO_TOKEN are required');
  process.exit(1);
}

async function call<T>(method: string, path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE}${path}${sep}key=${KEY}&token=${TOKEN}`, { method });
  if (!res.ok) throw new Error(`Trello ${method} ${path.split('?')[0]} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Lists mirrored from the real board's synced structure, in workflow order.
let listNames: string[] = [];
if (process.env.MONGODB_URI) {
  await mongoose.connect(process.env.MONGODB_URI);
  listNames = (await Deliverable.distinct('current_list')).filter(Boolean) as string[];
  await mongoose.disconnect();
}
if (listNames.length === 0) {
  listNames = ['Production Backlog', 'Backlog: Process Lane', 'Sketch: Working on it', 'Sketch: Sent for Client Review', 'Render: Working on it', 'Render: Sent for Client Review', 'Done'];
}

const q = (s: string) => encodeURIComponent(s);

const board = await call<{ id: string; shortLink: string; url: string }>(
  'POST',
  `/boards?name=${q('Sirius TEST board (staging) — safe to label')}&defaultLists=false&prefs_permissionLevel=private`,
);
console.log(`[test-board] created: ${board.url}`);

const listIds: string[] = [];
for (const name of listNames) {
  const l = await call<{ id: string }>('POST', `/boards/${board.id}/lists?name=${q(name)}&pos=bottom`);
  listIds.push(l.id);
}
console.log(`[test-board] ${listIds.length} lists mirroring production structure`);

const LABELS: Array<[string, string]> = [
  ['Main Card', 'green'],
  ['Difficulty: Easy', 'yellow'],
  ['Difficulty: Medium', 'orange'],
  ['Difficulty: Hard', 'red'],
  ['🛑 On hold', 'red'],
  ['🛑 For clarification', 'red'],
  ['🛑 Has dependency', 'red'],
];
const labelIds = new Map<string, string>();
for (const [name, color] of LABELS) {
  const l = await call<{ id: string }>('POST', `/boards/${board.id}/labels?name=${q(name)}&color=${color}`);
  labelIds.set(name, l.id);
}
console.log(`[test-board] label taxonomy created (${LABELS.length})`);

const DIFFS = ['Easy', 'Medium', 'Hard'];
let made = 0;
for (let i = 1; i <= 12; i++) {
  const isMain = i <= 8;
  const mc = `MC-9${String(i).padStart(2, '0')}`;
  const name = isMain
    ? `${mc} Main Card: Synthetic test deliverable ${i}`
    : `Render Asset: ${mc.replace(/\d+$/, String(i - 4))} synthetic test task`;
  const listId = listIds[i % listIds.length]!;
  const ids = [isMain ? labelIds.get('Main Card')! : null, labelIds.get(`Difficulty: ${DIFFS[i % 3]}`)!]
    .filter(Boolean)
    .join(',');
  await call('POST', `/cards?idList=${listId}&name=${q(name)}&idLabels=${ids}`);
  made++;
}
console.log(`[test-board] ${made} synthetic cards created`);
console.log(`\n[test-board] BOARD ID (shortLink): ${board.shortLink}`);
console.log('[test-board] next: set this id on the staging project; add the PRODUCTION id (hLL7WW2V) to PROD_TRELLO_BOARD_IDS in every non-production env.');
