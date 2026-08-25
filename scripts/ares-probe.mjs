/**
 * ARES contract drift check (contracts/ares-read.md).
 *
 * Downloads the live openapi.yaml and asserts every endpoint Sirius builds on
 * still exists at the expected stability tier. Exit 1 on drift so CI fails
 * the build, not the runtime (ARES's own api-probe --verify pattern).
 *
 * Usage: ARES_URL=... ARES_API_KEY=... node scripts/ares-probe.mjs
 */

const BASE = process.env.ARES_URL;
const KEY = process.env.ARES_API_KEY;

if (!BASE || !KEY) {
  console.log('[ares-probe] ARES_URL / ARES_API_KEY not set — skipping (configure the repo secret to enable)');
  process.exit(0);
}

/** path → required x-ares-stability tier */
const REQUIRED = {
  '/api/v1/trello/boards': 'stable',
  '/api/v1/trello/boards/{boardId}/cards': 'stable',
  '/api/v1/trello/boards/{boardId}/movements': 'stable',
  '/api/v1/trello/boards/{boardId}/summary': 'stable',
  '/api/v1/trello/cards/{cardId}': 'stable',
  '/api/v1/trello/cycle-time': 'stable',
  '/api/v1/trello/health': 'stable',
  // internal tier — consumed behind src/services adapter only (BR-6a capacity)
  '/api/project/{rowKey}/steering': 'internal',
};

const res = await fetch(`${BASE}/api/docs/openapi.yaml`, {
  headers: { 'X-API-Key': KEY, Accept: 'text/yaml' },
});
if (!res.ok) {
  console.error(`[ares-probe] failed to fetch openapi.yaml: HTTP ${res.status}`);
  process.exit(1);
}
const yaml = await res.text();

// Light-touch YAML scan: find each path key, then the first x-ares-stability
// under it (before the next top-level path). Avoids a YAML dependency.
const failures = [];
for (const [p, tier] of Object.entries(REQUIRED)) {
  const anchor = `  ${p}:`;
  const start = yaml.indexOf(anchor);
  if (start === -1) {
    failures.push(`${p} — MISSING from openapi.yaml`);
    continue;
  }
  const rest = yaml.slice(start + anchor.length);
  const nextPath = rest.search(/\n {2}\/[^\s]+:/);
  const section = nextPath === -1 ? rest : rest.slice(0, nextPath);
  const m = section.match(/x-ares-stability:\s*(\S+)/);
  if (!m) {
    failures.push(`${p} — no x-ares-stability marker`);
  } else if (m[1] !== tier) {
    failures.push(`${p} — stability changed: expected ${tier}, got ${m[1]}`);
  }
}

if (failures.length > 0) {
  console.error('[ares-probe] CONTRACT DRIFT:');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('[ares-probe] update specs/001-sirius-v1/contracts/ares-read.md and the adapter together.');
  process.exit(1);
}

/*
 * Field-level check, not just endpoint-level: `lastPolledAt` is load-bearing.
 *
 * It is the instant ARES fetched the card from Trello, and `staleGuard` in
 * worker/syncAres.ts compares every registry write against it. ARES answers
 * from its own store, so no other value in the payload bounds the data's age.
 *
 * Why this needs a probe rather than trust: ARES's own 2026-08-02 integrity
 * survey records the field as "written in three places and read by none", so a
 * cleanup could reasonably drop it. If it vanishes, Sirius does NOT break
 * loudly — it stops reconciling urgency, due dates and difficulty and carries
 * on looking healthy. That is the failure this exists to convert into a red
 * build.
 *
 * Endpoint-level stability would not catch it: the path stays `stable` while
 * the field disappears from the body.
 */
const json = async (url) => {
  const res = await fetch(url, { headers: { 'X-API-Key': KEY, Accept: 'application/json' } });
  if (!res.ok) {
    console.error(`[ares-probe] ${url} failed: HTTP ${res.status}`);
    process.exit(1);
  }
  return res.json();
};

const missing = (what) => {
  console.error(`[ares-probe] CONTRACT DRIFT: \`lastPolledAt\` is gone from ${what}.`);
  console.error('  It is the ONLY honest measure of how old ARES data is, and the reconcile');
  console.error('  guard compares every registry write against it. Without it, urgency, due');
  console.error('  dates and difficulty stop reconciling for every card Sirius has written');
  console.error('  (they fail SAFE — our value is kept — but they stop).');
  console.error('  See specs/001-sirius-v1/contracts/ares-read.md §Freshness and worker/syncAres.ts.');
  process.exit(1);
};

const boards = (await json(`${BASE}/api/v1/trello/boards`))?.data?.boards ?? [];
if (!boards.length) {
  console.error('[ares-probe] no boards returned — cannot verify the card shape');
  process.exit(1);
}

/*
 * SEVERAL boards, not the biggest one.
 *
 * The first version sampled whichever board reported the highest card count,
 * which in CI is whatever happens to be largest across all of ARES — not
 * necessarily a board any Sirius project is configured for (review,
 * 2026-08-25). Drift confined to the board Sirius actually syncs would have
 * passed green. The probe has no database and so cannot ask which boards those
 * are; `ARES_PROBE_BOARDS` pins them when someone wants certainty, and absent
 * that it samples broadly instead of narrowly, which is the honest fallback.
 *
 * The single-card endpoint is checked too: the two reconcile paths read
 * different routes — the full sync the board list, the push drain the card —
 * and the field can leave one and not the other. The push path is the one that
 * would go quiet first, since FR-9.6 relaxes the full sync to hourly while
 * push is healthy.
 */
const pinned = (process.env.ARES_PROBE_BOARDS ?? '').split(',').map((b) => b.trim()).filter(Boolean);
// ARES lists a shared board once PER PROJECT, so the raw list repeats board ids
// — without this the sample silently narrows to two or three distinct boards.
const distinct = [...new Map(boards.map((b) => [b.boardId, b])).values()];
const sample = pinned.length
  ? distinct.filter((b) => pinned.includes(b.boardId))
  : distinct.sort((a, b) => (b.cardCount ?? 0) - (a.cardCount ?? 0)).slice(0, 5);

if (pinned.length && sample.length !== pinned.length) {
  console.error(`[ares-probe] ARES_PROBE_BOARDS names a board ARES does not list: ${pinned.join(', ')}`);
  process.exit(1);
}

let firstCard = null;
const checked = [];
for (const board of sample) {
  const cards = (await json(`${BASE}/api/v1/trello/boards/${board.boardId}/cards?pageSize=1`))?.data ?? [];
  if (!cards[0]) continue; // an empty board proves nothing either way
  if (!cards[0].lastPolledAt) missing(`board ${board.boardId}'s cards payload`);
  firstCard ??= cards[0];
  checked.push(board.boardId);
}
if (!checked.length) {
  console.error('[ares-probe] every sampled board returned no cards — cannot verify the card shape');
  process.exit(1);
}

const one = (await json(`${BASE}/api/v1/trello/cards/${firstCard.cardId}`))?.data;
if (!one?.lastPolledAt) missing('the single-card payload (the push path)');

console.log(`[ares-probe] OK — ${Object.keys(REQUIRED).length} endpoints present at expected stability`);
console.log(`[ares-probe] OK — \`lastPolledAt\` present on ${checked.length} board(s) (${checked.join(', ')}) and on the single-card route`);
