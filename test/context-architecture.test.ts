/**
 * Context-architecture guard — asserts the caps table of
 * docs/CONTEXT_ARCHITECTURE.md §Caps and guards.
 *
 * The architecture's bet is "enforcement over discipline": the always-loaded
 * docs (Layer 0/1) must survive neglect, so every cap, rotation window,
 * marker pair, and staleness stamp is asserted here. A red in this suite
 * means a DOC has rotted — fix the doc (usually: run
 * `npx tsx scripts/generate-index.ts`), never widen a bound here without a
 * ruling recorded in the architecture file.
 *
 * TZ-independent (no dates are computed — the stamps are matched on format
 * only) and offline (the only spawn is the local generator in --check mode).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The bijection check below MUST use the exact scope rule the generator uses.
// Importing the generator's own enumerator — not replicating its glob — makes
// drift between the two impossible: one definition of "source file in scope".
import { sourceFiles } from '../scripts/generate-index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const bytesOf = (rel: string): number => fs.statSync(path.join(ROOT, rel)).size;
const KB = 1024;

const MAP = read('docs/MAP.md');

/** Interior of a `<!-- GEN:NAME --> … <!-- /GEN:NAME -->` block in the skim. */
function genBlock(name: string): string {
  const open = `<!-- GEN:${name} -->`;
  const close = `<!-- /GEN:${name} -->`;
  const from = MAP.indexOf(open);
  const to = MAP.indexOf(close);
  expect(from, `docs/MAP.md lacks ${open}`).toBeGreaterThan(-1);
  expect(to, `docs/MAP.md lacks ${close} after ${open}`).toBeGreaterThan(from);
  return MAP.slice(from + open.length, to);
}

describe('docs/MAP.md — the Layer-0 skim', () => {
  it('stays at or under the 150-line cap', () => {
    // counted the way the generator counts (lines = newline count)
    expect(MAP.split('\n').length - 1).toBeLessThanOrEqual(150);
  });

  it('carries both standing rules at the top', () => {
    // distinctive phrases, not byte-equality — the wording may be polished,
    // the RULES must survive
    const top = MAP.slice(0, MAP.indexOf('<!-- GEN:STATUS -->'));
    expect(top, 'two-way authority rule (facts half) missing').toMatch(/Code decides FACTS/);
    expect(top, 'two-way authority rule (obligations half) missing').toMatch(/bind code/i);
    expect(top, 'decisions-first rule missing').toMatch(/Before changing a module/);
    expect(top, 'decisions-first rule (re-decide half) missing').toMatch(/re-decide settled choices/);
  });

  it('has intact GEN:STATUS / GEN:MODULES / GEN:DOCMAP pairs and the HAND block', () => {
    for (const name of ['STATUS', 'MODULES', 'DOCMAP']) {
      expect(genBlock(name).trim(), `GEN:${name} is empty`).not.toBe('');
    }
    const begin = MAP.indexOf('<!-- HAND:BEGIN -->');
    const end = MAP.indexOf('<!-- HAND:END -->');
    expect(begin, 'HAND:BEGIN missing').toBeGreaterThan(-1);
    expect(end, 'HAND:END missing after HAND:BEGIN').toBeGreaterThan(begin);
  });
});

describe('docs/MAP.md — MODULES bijection with the repo', () => {
  const listedModules = (): string[] =>
    [...genBlock('MODULES').matchAll(/^- `([^`]+)` — /gm)].map((m) => m[1]!);

  it('lists only files that exist on disk', () => {
    for (const rel of listedModules()) {
      expect(fs.existsSync(path.join(ROOT, rel)), `\`${rel}\` is listed but missing on disk`).toBe(true);
    }
  });

  it('carries no unfilled TODO purpose (describe a file when you add it)', () => {
    // the generator stubs a new file's line as "TODO: describe"; the stub may
    // exist only inside the change that adds the file, never at rest
    expect(genBlock('MODULES')).not.toMatch(/TODO: describe/);
  });

  it('lists every in-scope source file exactly once (generator scope rule)', () => {
    const listed = listedModules();
    expect(new Set(listed).size, 'a path is listed twice').toBe(listed.length);
    // sourceFiles() is path-sorted and duplicate-free, so sorted-array
    // equality proves both halves of the bijection; on mismatch, run:
    // npx tsx scripts/generate-index.ts
    expect([...listed].sort()).toEqual(sourceFiles());
  });
});

describe('docs/MAP.md — Test guards section', () => {
  it('points only at test files that exist', () => {
    const at = MAP.indexOf('## Test guards');
    expect(at, 'the Test guards section is missing').toBeGreaterThan(-1);
    const section = MAP.slice(at, MAP.indexOf('<!-- HAND:BEGIN -->'));
    // the skim writes guard paths both backticked and bare — match the path
    // shape itself so a rename in either form goes red
    const guardPaths = [...new Set([...section.matchAll(/\btest\/[\w./-]+\.(?:ts|mjs)\b/g)].map((m) => m[0]))];
    expect(guardPaths.length, 'no guard paths found — section gutted?').toBeGreaterThan(0);
    for (const rel of guardPaths) {
      expect(fs.existsSync(path.join(ROOT, rel)), `Test guards points at missing file \`${rel}\``).toBe(true);
    }
  });
});

describe('STATE.md — Layer-1 rot protection', () => {
  it('stays at or under 25KB', () => {
    expect(bytesOf('STATE.md')).toBeLessThanOrEqual(25 * KB);
  });

  it('keeps the session index inside the rotation window (≤12 lines)', () => {
    // 10-session window + slack, per the caps table
    const state = read('STATE.md');
    const at = state.indexOf('### Older sessions — index');
    expect(at, 'the "Older sessions — index" section is missing').toBeGreaterThan(-1);
    const indexLines = state.slice(at).split('\n').filter((line) => line.startsWith('- 20'));
    expect(indexLines.length, 'rotate: keep the newest 10, delete the rest (targets live in docs/state-log/)').toBeLessThanOrEqual(12);
  });
});

describe('size caps (docs/CONTEXT_ARCHITECTURE.md §Caps and guards)', () => {
  it('docs/HANDOFF.md ≤ 26KB', () => {
    // the architecture's 24KB is a SOFT bound (warn — sanctioned overshoot
    // exists); the hard stop sits at 26KB so only real decay goes red
    expect(bytesOf('docs/HANDOFF.md')).toBeLessThanOrEqual(26 * KB);
  });

  it('domain rulebooks ≤ 20KB (every *-rules.md, present and future)', () => {
    const specDir = path.join(ROOT, 'specs', '001-sirius-v1');
    const rulebooks = fs.readdirSync(specDir).filter((name) => name.endsWith('-rules.md'));
    expect(rulebooks, 'no rulebooks found — glob broken?').toContain('gantt-rules.md');
    for (const name of rulebooks) {
      expect(bytesOf(`specs/001-sirius-v1/${name}`), `${name} is over the 20KB cap — split by sub-area`).toBeLessThanOrEqual(20 * KB);
    }
  });

  it('directory CLAUDE.md files ≤ 4KB (every top-level dir, present and future)', () => {
    const found: string[] = [];
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'public') continue;
      const rel = `${entry.name}/CLAUDE.md`;
      if (!fs.existsSync(path.join(ROOT, rel))) continue;
      found.push(rel);
      expect(bytesOf(rel), `${rel} is over the 4KB cap`).toBeLessThanOrEqual(4 * KB);
    }
    expect(found, 'no directory CLAUDE.md found — glob broken?').toContain('frontend/CLAUDE.md');
  });
});

describe('generator cleanliness — the rot alarm', () => {
  it('generate-index --check exits 0 (skim agrees with the repo)', () => {
    // generous timeout: a cold tsx start on a busy machine is slow, and a
    // false red here would teach people to ignore the alarm
    try {
      execSync('npx tsx scripts/generate-index.ts --check', { cwd: ROOT, stdio: 'pipe', timeout: 120_000 });
    } catch (err) {
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? String(err);
      expect.fail(
        `docs/MAP.md's GEN blocks disagree with the repo — run: npx tsx scripts/generate-index.ts\n${stderr}`,
      );
    }
  });
});

describe('staleness stamps', () => {
  // Deliberately NOT stamped: root CLAUDE.md (the constitution — JP versions
  // it himself) and STATE.md/docs/HANDOFF.md (Layer 1 current-state files —
  // their freshness IS their content, updated every session by convention).
  it.each([
    'docs/MAP.md',
    'docs/README.md',
    'docs/CONTEXT_ARCHITECTURE.md',
    'specs/001-sirius-v1/gantt-rules.md',
    'frontend/CLAUDE.md',
    'test/CLAUDE.md',
  ])('%s carries a last-verified date', (rel) => {
    expect(read(rel)).toMatch(/last-verified: \d{4}-\d{2}-\d{2}/);
  });
});

describe('decisions/ records (tolerant while absent — Stage 4b creates it)', () => {
  const dir = path.join(ROOT, 'decisions');
  const records = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /^\d{4}-.+\.md$/.test(name)) : [];

  it('every NNNN-*.md is 20–60 lines with the four required headings', () => {
    // the architecture writes 20–40; the guard allows to 60 so a sanctioned
    // long record does not go red (same soft/hard pattern as HANDOFF)
    for (const name of records) {
      const text = read(`decisions/${name}`);
      const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
      expect(lines, `decisions/${name} is ${lines} lines (want 20–60)`).toBeGreaterThanOrEqual(20);
      expect(lines, `decisions/${name} is ${lines} lines (want 20–60)`).toBeLessThanOrEqual(60);
      for (const heading of ['Status', 'Context', 'Decision', 'Consequences']) {
        expect(text, `decisions/${name} lacks a ${heading} heading`).toMatch(
          new RegExp(`^(?:#{1,6}\\s+|\\*\\*)${heading}\\b`, 'm'),
        );
      }
    }
  });
});
