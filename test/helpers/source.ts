/**
 * Shared readers for the SHIPPED frontend source — the single place a test
 * reads the app's scripts or template from.
 *
 * `appScripts()` mirrors frontend/build.js `readDir('scripts', '.js')`: the
 * same enumeration (`readdirSync` → `.filter(endsWith('.js'))` → `.sort()`)
 * and the same `'\n'` join, minus build.js's per-file banner comments.
 * test/source-order.test.ts executes build.js's OWN readDir against this
 * mirror — order and joined bytes both — so the two cannot drift silently.
 *
 * WHY guards read the WHOLE shipped script set, not one file: build.js
 * concatenates every scripts/*.js into ONE `<script>` — one shared scope, in
 * filename order. A guard that asserts "the client declares X exactly once"
 * or "the client never contains Y" is a claim about that bundle, and a
 * first-occurrence slicer must see the same corpus, in the same order, the
 * browser executes. Reading a single file would let a second declaration (or
 * a banned token) ship from a sibling script under a green suite.
 *
 * Deliberately NOT here: per-file reads whose guard is per-file by design —
 * 00-router.js executed alone in an empty vm (its purity IS the assertion,
 * test/routing-client.test.ts), 00-icons.js read alone as ICONS_JS in
 * test/helpers/gantt-render.ts, the per-sheet CSS reads in
 * test/helpers/gantt-render.ts (their counting guards are scoped to one
 * stylesheet on purpose), test/drag-hittest.test.ts's own readAll()
 * enumeration (it needs per-file attribution across scripts AND styles), and
 * the literal comparison in test/routing-paths.test.ts. Those stay beside
 * the suites that own them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend');

/** The shipped script filenames, in the exact order build.js ships them. */
export function appScriptFiles(): string[] {
  return fs
    .readdirSync(path.join(FRONTEND, 'scripts'))
    .filter((f) => f.endsWith('.js'))
    .sort();
}

/** The whole shipped script set as ONE string — the browser's `<script>` scope. */
export function appScripts(): string {
  return appScriptFiles()
    .map((f) => fs.readFileSync(path.join(FRONTEND, 'scripts', f), 'utf8'))
    .join('\n');
}

/** The shipped Ractive template. */
export function template(): string {
  return fs.readFileSync(path.join(FRONTEND, 'templates', '00-app.html'), 'utf8');
}
