/**
 * Context-architecture guard — asserts the caps table of
 * docs/architecture/context-architecture.md §Caps and guards.
 *
 * The architecture's bet is "enforcement over discipline": the always-loaded
 * docs (Layer 0/1) must survive neglect, so every cap, rotation window,
 * marker pair, and staleness stamp is asserted here. A red in this suite
 * means a DOC has rotted — fix the doc (usually: run
 * `npx tsx scripts/generate-index.ts`), never widen a bound here without a
 * ruling recorded in the architecture file.
 *
 * The map set (decomposed 2026-08-18, decision 0022): docs/MAP.md is the
 * fixed-size Layer-0 index (status, areas, doc map); the per-file lines live
 * in per-area Layer-2 maps (docs/architecture/map-*.md), one GEN:MODULES
 * block each.
 *
 * TZ-independent (no dates are computed — the stamps are matched on format
 * only) and offline (the only spawn is the local generator in --check mode).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The bijection checks below MUST use the exact scope rule AND area
// partition the generator uses. Importing its own exports — not replicating
// the glob or the prefix rule — makes drift between the generator and this
// guard impossible: one definition of "source file in scope", one definition
// of "which map a file belongs to".
import { AREAS, areaMapPath, areaOf, sectionOf as parseSection, sourceFiles, tableRows as parseTableRows } from '../scripts/generate-index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const bytesOf = (rel: string): number => fs.statSync(path.join(ROOT, rel)).size;
const KB = 1024;

const MAP = read('docs/MAP.md');

/** Interior of a `<!-- GEN:NAME --> … <!-- /GEN:NAME -->` block in `text`. */
function genBlockIn(text: string, name: string, rel: string): string {
  const open = `<!-- GEN:${name} -->`;
  const close = `<!-- /GEN:${name} -->`;
  const from = text.indexOf(open);
  const to = text.indexOf(close);
  expect(from, `${rel} lacks ${open}`).toBeGreaterThan(-1);
  expect(to, `${rel} lacks ${close} after ${open}`).toBeGreaterThan(from);
  return text.slice(from + open.length, to);
}

const genBlock = (name: string): string => genBlockIn(MAP, name, 'docs/MAP.md');

/**
 * The area maps as found ON DISK (glob, not the partition): the set test
 * below proves this equals what the partition names, so a stray
 * docs/architecture/map-*.md — or a partition change that forgot its file —
 * goes red.
 */
const areaMapsOnDisk = (): string[] =>
  fs
    .readdirSync(path.join(ROOT, 'docs', 'architecture'))
    .filter((name) => /^map-.+\.md$/.test(name))
    .map((name) => `docs/architecture/${name}`)
    .sort();

/** Paths listed in one area map's GEN:MODULES block. */
const listedIn = (rel: string): string[] =>
  [...genBlockIn(read(rel), 'MODULES', rel).matchAll(/^- `([^`]+)` — /gm)].map((m) => m[1]!);

describe('docs/MAP.md — the Layer-0 index', () => {
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

  it('has intact GEN:STATUS / GEN:AREAS / GEN:DOCMAP pairs and the HAND block', () => {
    for (const name of ['STATUS', 'AREAS', 'DOCMAP']) {
      expect(genBlock(name).trim(), `GEN:${name} is empty`).not.toBe('');
    }
    const begin = MAP.indexOf('<!-- HAND:BEGIN -->');
    const end = MAP.indexOf('<!-- HAND:END -->');
    expect(begin, 'HAND:BEGIN missing').toBeGreaterThan(-1);
    expect(end, 'HAND:END missing after HAND:BEGIN').toBeGreaterThan(begin);
  });

  it('AREAS block: one line per area, naming its map and the true file count', () => {
    const lines = genBlock('AREAS')
      .split('\n')
      .filter((line) => line.startsWith('- '));
    expect(lines.length, 'AREAS block must hold exactly one line per area').toBe(AREAS.length);
    const files = sourceFiles();
    for (const area of AREAS) {
      const line = lines.find((l) => l.startsWith(`- \`${area}\``));
      expect(line, `AREAS block lacks a line for \`${area}\``).toBeDefined();
      const m = /^- `[^`]+` — (\d+) files → (\S+) — .+$/.exec(line!);
      expect(m, `AREAS line for \`${area}\` is malformed: ${line}`).not.toBeNull();
      const [, count, target] = m!;
      expect(target, `\`${area}\` must point at its own area map`).toBe(areaMapPath(area));
      expect(fs.existsSync(path.join(ROOT, target!)), `AREAS points at missing ${target}`).toBe(true);
      expect(
        Number(count),
        `\`${area}\` file count is stale — run: npx tsx scripts/generate-index.ts`,
      ).toBe(files.filter((file) => areaOf(file) === area).length);
    }
  });
});

describe('docs/architecture/map-*.md — the Layer-2 area maps', () => {
  it('the on-disk map set is exactly what the area partition names', () => {
    expect(areaMapsOnDisk()).toEqual(AREAS.map(areaMapPath).sort());
  });

  it.each(areaMapsOnDisk())('%s: intact GEN:MODULES, ≤150 lines, no unfilled TODO', (rel) => {
    const text = read(rel);
    expect(genBlockIn(text, 'MODULES', rel).trim(), `${rel} GEN:MODULES is empty`).not.toBe('');
    expect(text.split('\n').length - 1, `${rel} is over the 150-line cap`).toBeLessThanOrEqual(150);
    // the generator stubs a new file's line as "TODO: describe"; the stub may
    // exist only inside the change that adds the file, never at rest
    expect(text, `${rel} carries an unfilled TODO purpose`).not.toMatch(/TODO: describe/);
  });
});

describe('area maps — MODULES bijection with the repo', () => {
  it('the union of the sub-map paths equals the generator scope, no path twice', () => {
    const union = AREAS.flatMap((area) => listedIn(areaMapPath(area)));
    expect(new Set(union).size, 'a path is listed twice across the map set').toBe(union.length);
    // sourceFiles() is path-sorted, duplicate-free, and enumerated from disk,
    // so sorted-array equality proves both halves of the bijection AND that
    // every listed path exists; on mismatch, run:
    // npx tsx scripts/generate-index.ts
    expect([...union].sort()).toEqual(sourceFiles());
  });

  it('every file sits in the sub-map its area names (no strays)', () => {
    for (const area of AREAS) {
      for (const rel of listedIn(areaMapPath(area))) {
        expect(
          areaOf(rel),
          `\`${rel}\` is listed in ${areaMapPath(area)} but belongs to \`${areaOf(rel)}\``,
        ).toBe(area);
      }
    }
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

/**
 * STATE.md is Layer 1 — read on every resume, so it may never grow with the
 * project. Byte cap alone cannot hold that: a file stays small only if
 * settled things LEAVE. These assert the leaving, section by section
 * (JP-ruled 2026-08-18; caps table in docs/architecture/context-architecture.md).
 *
 * Archives that receive the rotated content are Layer 3 and deliberately
 * UNCAPPED: docs/history/phase-log.md · decision-log.md · state-log/.
 */
describe('STATE.md — Layer-1 rot protection', () => {
  const state = (): string => read('STATE.md');

  /* The section/table grammar is IMPORTED from the generator, not restated:
     the whole point of this describe is agreeing with what the map generator
     reads out of STATE.md, and one parser cannot disagree with itself
     (test/CLAUDE.md rule 2 — derive, don't copy). */
  const sectionOf = (heading: string): string => {
    const body = parseSection(state(), heading);
    expect(body, `STATE.md lacks the "## ${heading}" section`).not.toBeNull();
    return body!;
  };

  /** Body rows of the section's markdown table, re-joined per row for text asserts. */
  const tableRows = (heading: string): string[] =>
    parseTableRows(sectionOf(heading)).map((cells) => cells.join('|'));

  it('stays at or under 10KB', () => {
    // Was 25KB and 89% full on 2026-08-18. The cap is the backstop; the
    // rotation assertions below are what actually hold the line.
    expect(bytesOf('STATE.md')).toBeLessThanOrEqual(10 * KB);
  });

  it('carries no settled decision — answered rows rotate to docs/history/decision-log.md', () => {
    // The anti-accretion rule. Seven of eight blocking rows were answered and
    // still sat here; the map generator already ignored them, so they were
    // read-cost with no reader. An answered row leaves the session it is
    // answered — its verbatim text lives on in the decision log.
    for (const heading of ['Decisions needed from JP (blocking)', 'Decisions needed later (not blocking yet)']) {
      for (const row of tableRows(heading)) {
        expect(
          row.includes('✅'),
          `"${heading}" carries a settled row — move it verbatim to docs/history/decision-log.md:\n  ${row.slice(0, 100)}`,
        ).toBe(false);
      }
    }
  });

  it('keeps the phase table to open or undeployed work (≤10 rows)', () => {
    // Complete phases move to docs/history/phase-log.md; roll-up rows stand
    // in for them. Grew one row per batch before the 2026-08-18 rotation.
    const rows = tableRows('Phase status');
    expect(rows.length, 'roll up the shipped phases into docs/history/phase-log.md').toBeLessThanOrEqual(10);
  });

  it('keeps the session log to a 10-line window of summaries', () => {
    const lines = sectionOf('Session log').split('\n').filter((line) => line.startsWith('- 20'));
    expect(lines.length, 'the "Session log" window is empty — heading or line format changed').toBeGreaterThan(0);
    expect(lines.length, 'rotate: keep the newest 10, delete the rest (docs/history/state-log/ is self-indexing by date)').toBeLessThanOrEqual(10);
  });

  it('narrates in the archive, not here — every session line ≤1200 chars', () => {
    // The convention JP approved 2026-08-18: the full narrative is written
    // STRAIGHT into docs/history/state-log/YYYY-MM-DD.md, never into this
    // file. One entry had reached 5,688 chars — a quarter of STATE.md — while
    // waiting to be rotated out next session.
    for (const line of sectionOf('Session log').split('\n').filter((l) => l.startsWith('- 20'))) {
      expect(
        line.length,
        `a session line is narrating; write the full entry into docs/history/state-log/ and summarise here:\n  ${line.slice(0, 100)}…`,
      ).toBeLessThanOrEqual(1200);
    }
  });

  it('every session line points at a state-log file that exists', () => {
    for (const line of sectionOf('Session log').split('\n').filter((l) => l.startsWith('- 20'))) {
      const target = line.match(/docs\/history\/state-log\/[\d-]+\.md/)?.[0];
      expect(target, `a session line names no archive file:\n  ${line.slice(0, 100)}`).toBeDefined();
      expect(fs.existsSync(path.join(ROOT, target!)), `session line points at missing \`${target}\``).toBe(true);
    }
  });

  it('names its archives, so nothing rotated becomes unreachable', () => {
    const text = state();
    for (const rel of ['docs/history/phase-log.md', 'docs/history/decision-log.md', 'docs/history/state-log/']) {
      expect(text, `STATE.md no longer points at \`${rel}\` — rotated content would be orphaned`).toContain(rel);
      const onDisk = rel.endsWith('/') ? rel.slice(0, -1) : rel;
      expect(fs.existsSync(path.join(ROOT, onDisk)), `archive \`${rel}\` is missing`).toBe(true);
    }
  });
});

describe('size caps (docs/architecture/context-architecture.md §Caps and guards)', () => {
  it('Layer 1 is STATE.md alone — docs/HANDOFF.md stays retired', () => {
    // Retired by JP on 2026-08-18 ("an extra step that can be removed"); every
    // unique fact moved to the file an agent meets it in (rigidity log,
    // docs/architecture/context-architecture.md). A file reappearing here is a
    // second always-loaded current-state doc with no single audience — the
    // exact drift the retirement removed. Re-adding one is a ruling, not a
    // commit: record it in the architecture file first, then change this test.
    expect(
      fs.existsSync(path.join(ROOT, 'docs/HANDOFF.md')),
      'docs/HANDOFF.md is back — see the 2026-08-18 rigidity-log entry before reviving it',
    ).toBe(false);
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
  it('generate-index --check exits 0 (the map set agrees with the repo)', () => {
    // generous timeout: a cold tsx start on a busy machine is slow, and a
    // false red here would teach people to ignore the alarm
    try {
      execSync('npx tsx scripts/generate-index.ts --check', { cwd: ROOT, stdio: 'pipe', timeout: 120_000 });
    } catch (err) {
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? String(err);
      expect.fail(
        `the map set's GEN blocks disagree with the repo — run: npx tsx scripts/generate-index.ts\n${stderr}`,
      );
    }
  });
});

describe('staleness stamps', () => {
  // Deliberately NOT stamped: root CLAUDE.md (the constitution — JP versions
  // it himself) and STATE.md (the Layer-1 current-state file — its freshness
  // IS its content, updated every session by convention).
  // The set is DERIVED, not listed: a new rulebook, area map, or directory
  // CLAUDE.md is covered by this assertion the day it appears. The
  // hand-written Layer-2 operational docs are the exception — no glob names
  // them, so they are listed explicitly below.
  const stamped = [
    'docs/MAP.md',
    'docs/README.md',
    'docs/architecture/context-architecture.md',
    'decisions/README.md',
    // hand-written Layer-2 operational docs (listed explicitly)
    'docs/operations/deploy.md',
    'docs/operations/server-setup.md',
    'docs/architecture/agents-guide.md',
    'docs/operations/ares-push-spec.md',
    'docs/product/errata-reply-v1.2.md',
    ...areaMapsOnDisk(),
    ...fs
      .readdirSync(path.join(ROOT, 'specs', '001-sirius-v1'))
      .filter((name) => name.endsWith('-rules.md'))
      .map((name) => `specs/001-sirius-v1/${name}`),
    ...fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'public')
      .map((e) => `${e.name}/CLAUDE.md`)
      .filter((rel) => fs.existsSync(path.join(ROOT, rel))),
  ];
  it.each(stamped)('%s carries a last-verified date', (rel) => {
    expect(read(rel)).toMatch(/last-verified: \d{4}-\d{2}-\d{2}/);
  });
});

describe('decisions/ records (tolerant while absent — Stage 4b creates it)', () => {
  const dir = path.join(ROOT, 'decisions');
  const records = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /^\d{4}-.+\.md$/.test(name)) : [];

  it('every NNNN-*.md is 20–60 lines with the six required headings', () => {
    // the architecture writes 20–40; the guard allows to 60 so a sanctioned
    // long record does not go red
    for (const name of records) {
      const text = read(`decisions/${name}`);
      expect(text.startsWith('# '), `decisions/${name} lacks a # Title first line`).toBe(true);
      const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
      expect(lines, `decisions/${name} is ${lines} lines (want 20–60)`).toBeGreaterThanOrEqual(20);
      expect(lines, `decisions/${name} is ${lines} lines (want 20–60)`).toBeLessThanOrEqual(60);
      for (const heading of ['Status', 'Context', 'Decision', 'Consequences', 'Alternatives rejected', 'Sources']) {
        expect(text, `decisions/${name} lacks a ${heading} heading`).toMatch(
          new RegExp(`^(?:#{1,6}\\s+|\\*\\*)${heading}\\b`, 'm'),
        );
      }
    }
  });

  it('decisions/README.md indexes every record exactly once', () => {
    if (records.length === 0) return;
    const rows = [...read('decisions/README.md').matchAll(/^\| (\d{4}) \|/gm)].map((m) => m[1]!);
    expect(new Set(rows).size, 'a record number is indexed twice').toBe(rows.length);
    expect([...rows].sort(), 'index rows must match the NNNN files on disk — rebuild the table').toEqual(
      records.map((name) => name.slice(0, 4)).sort(),
    );
  });

  it('the directory holds at least 15 NNNN records (never quietly vacuous)', () => {
    expect(
      records.length,
      `decisions/ holds ${records.length} NNNN-*.md records (want >= 15)`,
    ).toBeGreaterThanOrEqual(15);
  });
});
