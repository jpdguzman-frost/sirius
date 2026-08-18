/**
 * Layer-0 skim generator — rebuilds docs/MAP.md's GEN blocks in place.
 * Architecture + caps: docs/CONTEXT_ARCHITECTURE.md (asserted by
 * test/context-architecture.test.ts).
 *
 *   GEN:STATUS  — parsed from STATE.md's own tables: in-progress phases,
 *                 open blocking decisions, the AC scoreboard tally.
 *   GEN:MODULES — the generator owns the FILE LIST (every source file,
 *                 path-sorted); the human owns the PURPOSE text, merged from
 *                 each path's existing line. New file → "TODO: describe";
 *                 vanished file → its line is dropped.
 *   GEN:DOCMAP  — the four context layers as pointers.
 *
 * Everything outside the GEN markers — including the HAND:BEGIN … HAND:END
 * judgment block — is preserved byte-for-byte. Output is byte-stable (no
 * timestamps, deterministic ordering): a second run changes nothing.
 *
 * Usage: npx tsx scripts/generate-index.ts           # rewrite in place
 *        npx tsx scripts/generate-index.ts --check   # write nothing; exit 1 if stale
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = path.join(ROOT, 'docs', 'MAP.md');
const STATE_PATH = path.join(ROOT, 'STATE.md');
const BLOCKS = ['STATUS', 'MODULES', 'DOCMAP'] as const;

// ---------- source enumeration (the generator owns this list) ----------

/**
 * Every file the skim must list — nothing else. Deterministic path sort.
 * Exported for test/context-architecture.test.ts, whose bijection check MUST
 * use this exact scope rule — importing it (not re-globbing) makes drift
 * between the generator and the guard impossible.
 */
export function sourceFiles(): string[] {
  const files: string[] = ['server.js', 'frontend/build.js', 'frontend/index.html'];
  const walk = (dir: string, exts: string[]): void => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel, exts);
      else if (exts.some((ext) => entry.name.endsWith(ext))) files.push(rel);
    }
  };
  walk('src', ['.ts']);
  walk('lib', ['.ts']);
  walk('worker', ['.ts']);
  walk('scripts', ['.ts', '.mjs']);
  walk('frontend/scripts', ['.js']);
  walk('frontend/templates', ['.html']);
  walk('frontend/styles', ['.css']);
  return files.sort();
}

// ---------- GEN block plumbing ----------

function blockSpan(text: string, name: string): { from: number; to: number } {
  const open = `<!-- GEN:${name} -->`;
  const close = `<!-- /GEN:${name} -->`;
  const openAt = text.indexOf(open);
  const closeAt = text.indexOf(close);
  if (openAt === -1 || closeAt === -1 || closeAt < openAt) {
    console.error(`[generate-index] docs/MAP.md lacks an intact ${open} … ${close} pair`);
    process.exit(1);
  }
  return { from: openAt + open.length, to: closeAt };
}

/** Interior of a GEN block (between the markers, newlines included). */
function blockText(text: string, name: string): string {
  const { from, to } = blockSpan(text, name);
  return text.slice(from, to);
}

/** The block's interior replaced by `lines`; everything else byte-preserved. */
function withBlock(text: string, name: string, lines: string[]): string {
  const { from, to } = blockSpan(text, name);
  return `${text.slice(0, from)}\n${lines.join('\n')}\n${text.slice(to)}`;
}

// ---------- GEN:STATUS — facts parsed from STATE.md's own tables ----------

function sectionOf(state: string, heading: string): string {
  const at = state.indexOf(`## ${heading}`);
  if (at === -1) {
    console.error(`[generate-index] STATE.md lacks the "## ${heading}" section`);
    process.exit(1);
  }
  const rest = state.slice(at + heading.length + 3);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Markdown table → trimmed cell rows (header + separator dropped). */
function tableRows(sectionText: string): string[][] {
  return sectionText
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => line.split('|').map((cell) => cell.trim()));
}

function statusLines(state: string): string[] {
  const lines: string[] = [];
  for (const row of tableRows(sectionOf(state, 'Phase status'))) {
    const [, num, phase, status] = row;
    if (num && phase && status && /in progress/i.test(status)) {
      lines.push(`- In progress: phase ${num} — ${phase} → STATE.md §Phase status · history: docs/state-log/`);
    }
  }
  for (const row of tableRows(sectionOf(state, 'Decisions needed from JP (blocking)'))) {
    const [, id, decision, , status] = row;
    if (id && decision && status && !status.includes('✅')) {
      const head = decision.split(' — ')[0] ?? decision;
      const short = head.length > 120 ? `${head.slice(0, 119)}…` : head;
      lines.push(`- Open blocking decision ${id}: ${short} → STATE.md §Decisions needed from JP (blocking)`);
    }
  }
  const scoreboard = sectionOf(state, 'Acceptance criteria scoreboard');
  const done = (scoreboard.match(/✅/g) ?? []).length;
  const open = (scoreboard.match(/⬜/g) ?? []).length;
  lines.push(`- ACs: ${done} ✅ · ${open} ⬜ (of ${done + open}) → STATE.md §Acceptance criteria scoreboard`);
  return lines;
}

// ---------- GEN:MODULES — generated list, human-owned purposes merged ----------

/** path → purpose from the current block (the human-owned half of each line). */
function existingPurposes(modulesBlock: string): Map<string, string> {
  const purposes = new Map<string, string>();
  for (const line of modulesBlock.split('\n')) {
    const m = /^- `([^`]+)` — (.+)$/.exec(line);
    if (m && m[1] && m[2]) purposes.set(m[1], m[2]);
  }
  return purposes;
}

function moduleLines(purposes: Map<string, string>): string[] {
  return sourceFiles().map((file) => `- \`${file}\` — ${purposes.get(file) ?? 'TODO: describe'}`);
}

// ---------- GEN:DOCMAP — the four layers ----------

const DOCMAP_LINES: string[] = [
  '- Layer 0 · entry — CLAUDE.md (constitution) · docs/MAP.md (this skim) · directory CLAUDE.md files (frontend/, test/, lib/, src/)',
  '- Layer 1 · current state — STATE.md · docs/HANDOFF.md',
  '- Layer 2 · task set — area rulebooks (planner: specs/001-sirius-v1/gantt-rules.md; pipeline/requests law still lives in their frame-notes until extracted — docs/README.md §Where law lives) · decisions/ · specs/001-sirius-v1/ (contracts + spec-kit)',
  '- Layer 3 · archive — docs/state-log/ · archived frame-notes (gantt today; banner marks each) · git history · owl threads',
];

// ---------- main ----------

// Run only as a script (`npx tsx scripts/generate-index.ts`): the guard test
// imports sourceFiles() above, and importing must never read or write MAP.md.
const runAsScript =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runAsScript) {
  const check = process.argv.includes('--check');
  const before = fs.readFileSync(MAP_PATH, 'utf8');
  const state = fs.readFileSync(STATE_PATH, 'utf8');

  let after = before;
  after = withBlock(after, 'STATUS', statusLines(state));
  after = withBlock(after, 'MODULES', moduleLines(existingPurposes(blockText(before, 'MODULES'))));
  after = withBlock(after, 'DOCMAP', DOCMAP_LINES);

  const lineCount = after.split('\n').length - 1;
  if (lineCount > 150) {
    console.warn(`[generate-index] warning: docs/MAP.md would be ${lineCount} lines (skim cap: 150)`);
  }

  if (after === before) {
    console.log(`[generate-index] docs/MAP.md is current (${lineCount} lines)`);
  } else if (check) {
    for (const name of BLOCKS) {
      const was = blockText(before, name);
      const now = blockText(after, name);
      if (was === now) continue;
      const wasLines = was.split('\n').filter(Boolean);
      const nowLines = now.split('\n').filter(Boolean);
      const added = nowLines.filter((line) => !wasLines.includes(line)).length;
      const dropped = wasLines.filter((line) => !nowLines.includes(line)).length;
      console.error(`[generate-index] --check: GEN:${name} is stale (${wasLines.length} → ${nowLines.length} lines; +${added} -${dropped})`);
    }
    process.exit(1);
  } else {
    fs.writeFileSync(MAP_PATH, after);
    console.log(`[generate-index] docs/MAP.md rewritten (${lineCount} lines)`);
  }
}
