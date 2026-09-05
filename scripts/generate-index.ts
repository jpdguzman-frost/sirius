/**
 * Map generator — rebuilds the GEN blocks of the Layer-0 skim (docs/MAP.md)
 * and the per-area Layer-2 maps (docs/architecture/map-frontend.md,
 * docs/architecture/map-backend.md) in place. Architecture + caps:
 * docs/architecture/context-architecture.md (asserted by
 * test/context-architecture.test.ts).
 *
 * docs/MAP.md (Layer 0):
 *   GEN:STATUS — parsed from STATE.md's own tables: in-progress phases,
 *                open blocking decisions, the AC scoreboard tally.
 *   GEN:AREAS  — one line per area: file count + pointer to its area map;
 *                the human owns the TAIL text after the pointer, merged by
 *                area key (new area → "TODO: describe"; vanished → dropped).
 *   GEN:DOCMAP — the four context layers as pointers.
 *
 * docs/architecture/map-<area>.md (Layer 2, one per area):
 *   GEN:MODULES — the generator owns the FILE LIST (that area's source
 *                 files, path-sorted); the human owns the PURPOSE text,
 *                 merged from that same map's existing block. New file →
 *                 "TODO: describe"; vanished file → its line is dropped.
 *
 * Everything outside the GEN markers — including the HAND:BEGIN … HAND:END
 * judgment block — is preserved byte-for-byte. Output is byte-stable across
 * the whole set (no timestamps, deterministic ordering): a second run
 * changes nothing, and write mode rewrites only the files that changed.
 *
 * Usage: npx tsx scripts/generate-index.ts           # rewrite in place
 *        npx tsx scripts/generate-index.ts --check   # write nothing; exit 1 naming stale file+block
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, 'STATE.md');

// ---------- source enumeration + area partition (the generator owns both) ----------

/**
 * Every file the maps must list — nothing else. Deterministic path sort.
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

/**
 * The area partition (JP-ruled 2026-08-18): a file is "frontend" iff its
 * path starts with `frontend/`; everything else (server.js, src/, lib/,
 * worker/, scripts/) is "backend". Exported beside sourceFiles() so the
 * guard test imports the partition instead of re-deriving it.
 */
export const AREAS = ['frontend', 'backend'] as const;
export type Area = (typeof AREAS)[number];

export function areaOf(file: string): Area {
  return file.startsWith('frontend/') ? 'frontend' : 'backend';
}

/** Repo-relative path of an area's Layer-2 map. */
export function areaMapPath(area: Area): string {
  return `docs/architecture/map-${area}.md`;
}

// ---------- GEN block plumbing ----------

function blockSpan(text: string, name: string, rel: string): { from: number; to: number } {
  const open = `<!-- GEN:${name} -->`;
  const close = `<!-- /GEN:${name} -->`;
  const openAt = text.indexOf(open);
  const closeAt = text.indexOf(close);
  if (openAt === -1 || closeAt === -1 || closeAt < openAt) {
    console.error(`[generate-index] ${rel} lacks an intact ${open} … ${close} pair`);
    process.exit(1);
  }
  return { from: openAt + open.length, to: closeAt };
}

/** Interior of a GEN block (between the markers, newlines included). */
function blockText(text: string, name: string, rel: string): string {
  const { from, to } = blockSpan(text, name, rel);
  return text.slice(from, to);
}

/** The block's interior replaced by `lines`; everything else byte-preserved. */
function withBlock(text: string, name: string, rel: string, lines: string[]): string {
  const { from, to } = blockSpan(text, name, rel);
  return `${text.slice(0, from)}\n${lines.join('\n')}\n${text.slice(to)}`;
}

// ---------- GEN:STATUS — facts parsed from STATE.md's own tables ----------

/**
 * A `## `-delimited section's body, by exact heading — null when absent.
 * EXPORTED because test/context-architecture.test.ts reads STATE.md with the
 * same grammar: one parser, so the guard and the generator can never disagree
 * about what a section is (test/CLAUDE.md rule 2 — derive, don't copy).
 */
export function sectionOf(state: string, heading: string): string | null {
  const marker = `## ${heading}`;
  const at = state.indexOf(marker);
  if (at === -1) return null;
  const rest = state.slice(at + marker.length);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The generator's own callers treat a missing section as fatal. */
function requireSection(state: string, heading: string): string {
  const body = sectionOf(state, heading);
  if (body === null) {
    console.error(`[generate-index] STATE.md lacks the "## ${heading}" section`);
    process.exit(1);
  }
  return body;
}

/** Markdown table → trimmed cell rows (header + separator dropped). Shared, as above. */
export function tableRows(sectionText: string): string[][] {
  return sectionText
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => line.split('|').map((cell) => cell.trim()));
}

function statusLines(state: string): string[] {
  const lines: string[] = [];
  for (const row of tableRows(requireSection(state, 'Phase status'))) {
    const [, num, phase, status] = row;
    if (num && phase && status && /in progress/i.test(status)) {
      lines.push(`- In progress: phase ${num} — ${phase} → STATE.md §Phase status · history: docs/history/state-log/`);
    }
  }
  for (const row of tableRows(requireSection(state, 'Decisions needed from JP (blocking)'))) {
    const [, id, decision, , status] = row;
    if (id && decision && status && !status.includes('✅')) {
      const head = decision.split(' — ')[0] ?? decision;
      const short = head.length > 120 ? `${head.slice(0, 119)}…` : head;
      lines.push(`- Open blocking decision ${id}: ${short} → STATE.md §Decisions needed from JP (blocking)`);
    }
  }
  const scoreboard = requireSection(state, 'Acceptance criteria scoreboard');
  const done = (scoreboard.match(/✅/g) ?? []).length;
  const open = (scoreboard.match(/⬜/g) ?? []).length;
  lines.push(`- ACs: ${done} ✅ · ${open} ⬜ (of ${done + open}) → STATE.md §Acceptance criteria scoreboard`);
  return lines;
}

// ---------- GEN:AREAS — generated counts/pointers, human-owned tails merged ----------

/** area key → hand tail from the current block (the human-owned half of each line). */
function existingTails(areasBlock: string): Map<string, string> {
  const tails = new Map<string, string>();
  for (const line of areasBlock.split('\n')) {
    const m = /^- `([^`]+)` — \d+ files → \S+ — (.+)$/.exec(line);
    if (m && m[1] && m[2]) tails.set(m[1], m[2]);
  }
  return tails;
}

function areaLines(tails: Map<string, string>): string[] {
  const files = sourceFiles();
  return AREAS.map((area) => {
    const count = files.filter((file) => areaOf(file) === area).length;
    return `- \`${area}\` — ${count} files → ${areaMapPath(area)} — ${tails.get(area) ?? 'TODO: describe'}`;
  });
}

// ---------- GEN:MODULES (per area map) — generated list, human-owned purposes merged ----------

/** path → purpose from the current block (the human-owned half of each line). */
function existingPurposes(modulesBlock: string): Map<string, string> {
  const purposes = new Map<string, string>();
  for (const line of modulesBlock.split('\n')) {
    const m = /^- `([^`]+)` — (.+)$/.exec(line);
    if (m && m[1] && m[2]) purposes.set(m[1], m[2]);
  }
  return purposes;
}

function moduleLines(area: Area, purposes: Map<string, string>): string[] {
  return sourceFiles()
    .filter((file) => areaOf(file) === area)
    .map((file) => `- \`${file}\` — ${purposes.get(file) ?? 'TODO: describe'}`);
}

// ---------- GEN:DOCMAP — the four layers ----------

const DOCMAP_LINES: string[] = [
  '- Layer 0 · entry — CLAUDE.md (constitution) · docs/MAP.md (this skim) · directory CLAUDE.md files (frontend/, test/, lib/, src/)',
  '- Layer 1 · current state — STATE.md (the only Layer-1 file; docs/HANDOFF.md retired 2026-08-18)',
  '- Layer 2 · task set — area maps (docs/architecture/map-frontend.md, docs/architecture/map-backend.md — the per-file lines) · area rulebooks (planner: specs/001-sirius-v1/gantt-rules.md + sprint-rules.md; deadlines: deadlines-rules.md; pipeline/requests law still lives in their frame-notes until extracted — docs/README.md §Where law lives) · decisions/ · specs/001-sirius-v1/ (contracts + spec-kit)',
  '- Layer 3 · archive — docs/history/state-log/ · archived frame-notes (gantt today; banner marks each) · git history · owl threads',
];

// ---------- main ----------

// Run only as a script (`npx tsx scripts/generate-index.ts`): the guard test
// imports sourceFiles()/areaOf() above, and importing must never read or
// write any map file.
const runAsScript =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runAsScript) {
  const check = process.argv.includes('--check');
  const state = fs.readFileSync(STATE_PATH, 'utf8');

  type BlockPlan = { name: string; lines: (before: string) => string[] };
  type FilePlan = { rel: string; blocks: BlockPlan[] };

  const plans: FilePlan[] = [
    {
      rel: 'docs/MAP.md',
      blocks: [
        { name: 'STATUS', lines: () => statusLines(state) },
        {
          name: 'AREAS',
          lines: (before) => areaLines(existingTails(blockText(before, 'AREAS', 'docs/MAP.md'))),
        },
        { name: 'DOCMAP', lines: () => DOCMAP_LINES },
      ],
    },
    ...AREAS.map((area): FilePlan => {
      const rel = areaMapPath(area);
      return {
        rel,
        blocks: [
          {
            name: 'MODULES',
            lines: (before) => moduleLines(area, existingPurposes(blockText(before, 'MODULES', rel))),
          },
        ],
      };
    }),
  ];

  let staleCount = 0;
  let wroteCount = 0;

  for (const plan of plans) {
    const abs = path.join(ROOT, plan.rel);
    if (!fs.existsSync(abs)) {
      console.error(`[generate-index] ${plan.rel} is missing — every map file must exist`);
      process.exit(1);
    }
    const before = fs.readFileSync(abs, 'utf8');
    let after = before;
    for (const block of plan.blocks) {
      after = withBlock(after, block.name, plan.rel, block.lines(before));
    }

    if (plan.rel === 'docs/MAP.md') {
      const lineCount = after.split('\n').length - 1;
      if (lineCount > 150) {
        console.warn(`[generate-index] warning: docs/MAP.md would be ${lineCount} lines (skim cap: 150)`);
      }
    }

    if (after === before) continue;

    if (check) {
      for (const block of plan.blocks) {
        const was = blockText(before, block.name, plan.rel);
        const now = blockText(after, block.name, plan.rel);
        if (was === now) continue;
        const wasLines = was.split('\n').filter(Boolean);
        const nowLines = now.split('\n').filter(Boolean);
        const added = nowLines.filter((line) => !wasLines.includes(line)).length;
        const dropped = wasLines.filter((line) => !nowLines.includes(line)).length;
        console.error(
          `[generate-index] --check: ${plan.rel} GEN:${block.name} is stale (${wasLines.length} → ${nowLines.length} lines; +${added} -${dropped})`,
        );
        staleCount += 1;
      }
    } else {
      fs.writeFileSync(abs, after);
      console.log(`[generate-index] ${plan.rel} rewritten`);
      wroteCount += 1;
    }
  }

  if (check && staleCount > 0) process.exit(1);
  if (wroteCount === 0) console.log(`[generate-index] all ${plans.length} map files current`);
}
