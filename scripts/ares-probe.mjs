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

console.log(`[ares-probe] OK — ${Object.keys(REQUIRED).length} endpoints present at expected stability`);
