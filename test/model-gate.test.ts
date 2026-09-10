/**
 * T182 — the sanity gate (src/services/model-gate.ts). Fixtures are built in
 * code and the expected failing set is DERIVED from the same numbers
 * (test/CLAUDE.md rule 2) — never a second hand-typed table. Every test also
 * asserts the positive side (some cell passes) so a fail-everything gate
 * cannot satisfy it vacuously.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GATE, gateCells } from '../src/services/model-gate.ts';
import type { GateModel, GateOptions, GateReason } from '../src/services/model-gate.ts';
import type { GridCell } from '../src/services/model-refresh.ts';
import type { ConfidenceKey, Difficulty, Lane } from '../lib/model.ts';

const TIERS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const KEYS: ConfidenceKey[] = ['Average', '0.7', '0.85', '0.95'];
const DAY_MS = 864e5;

function cell(lane: Lane, difficulty: Difficulty, confidence: ConfidenceKey, value: number, sample_n: number): GridCell {
  return { difficulty, lane, metric: 'design', confidence, value, sample_n };
}

/** A well-ordered lane: value = base × tier rank × key rank, n as given. */
function orderedLane(lane: Lane, n: number, base = 1): GridCell[] {
  const out: GridCell[] = [];
  TIERS.forEach((d, ti) => KEYS.forEach((k, ki) => out.push(cell(lane, d, k, base * (ti + 1) * (ki + 1), n))));
  return out;
}

function isoPlusDays(from: string, days: number): string {
  return new Date(Date.parse(from) + days * DAY_MS).toISOString();
}

const FROM = '2025-03-10T00:00:00.000Z';

/** A model that trips nothing under `opts`: window exactly minWindowDays, zero unverified. */
function healthyModel(opts: GateOptions = DEFAULT_GATE): GateModel {
  return {
    window: { from: FROM, to: isoPlusDays(FROM, opts.minWindowDays) },
    historyUnverified: 0,
    dropped: { considered: 120, sampled: 100, reasons: { noDone: 20 } },
  };
}

const key = (c: GridCell) => `${c.lane}|${c.difficulty}|${c.confidence}`;
const reasonsOf = (failed: { cell: GridCell; reasons: GateReason[] }[]) =>
  Object.fromEntries(failed.map((f) => [key(f.cell), f.reasons]));

describe('DEFAULT_GATE (drift item 5, decided without JP — tunable)', () => {
  it('is the exported decided values (unverifiedRatioFail 0.5 — review A3-1, 2026-09-10)', () => {
    expect(DEFAULT_GATE).toEqual({ minN: 15, minWindowDays: 60, unverifiedRatioFail: 0.5 });
  });

  it("A3-1 — the live rt-837 envelope (8337 of 8376 unverified) fails EVERY cell 'unverified' under the defaults", () => {
    // The refuters' failing input: a well-ordered, well-sampled grid whose backing history is
    // 99.5% unverified. At 1.0 the ratio never reached the threshold and the lane shipped.
    const cells = [...orderedLane('design', 216), ...orderedLane('ops', 150)];
    const live: GateModel = {
      window: { from: '2025-09-10', to: '2026-09-10' },
      historyUnverified: 8337,
      dropped: { considered: 8376, sampled: 8376, reasons: {} },
    };
    const ratio = live.historyUnverified / live.dropped.sampled;
    expect(ratio, 'fixture: almost all unverified, but NOT all — the 1.0 threshold must miss it').toBeLessThan(1);
    expect(ratio).toBeGreaterThanOrEqual(DEFAULT_GATE.unverifiedRatioFail);
    const r = gateCells(cells, live, DEFAULT_GATE);
    expect(r.passed).toEqual([]);
    expect(r.failed.map((f) => f.cell)).toEqual(cells);
    expect(r.failed.every((f) => f.reasons.includes('unverified'))).toBe(true);
  });
});

describe('gateCells — one reason at a time', () => {
  it('zero cells in → zero out, no throw', () => {
    expect(gateCells([], healthyModel(), DEFAULT_GATE)).toEqual({ passed: [], failed: [] });
  });

  it('a healthy grid passes whole, in input order', () => {
    const cells = [...orderedLane('design', DEFAULT_GATE.minN), ...orderedLane('ops', DEFAULT_GATE.minN + 5)];
    const { passed, failed } = gateCells(cells, healthyModel(), DEFAULT_GATE);
    expect(failed).toEqual([]);
    expect(passed).toEqual(cells);
  });

  it("'min_n' — exactly the cells with sample_n below minN, on the boundary", () => {
    const ns = [DEFAULT_GATE.minN - 1, DEFAULT_GATE.minN, DEFAULT_GATE.minN + 1];
    // one lane per n so ordering cannot interfere; lanes drawn from the Lane union
    const lanes: Lane[] = ['design', 'ops', 'assets'];
    const cells = lanes.flatMap((lane, i) => orderedLane(lane, ns[i]!));
    const { passed, failed } = gateCells(cells, healthyModel(), DEFAULT_GATE);
    const expectedFail = cells.filter((c) => c.sample_n < DEFAULT_GATE.minN);
    expect(expectedFail.length, 'fixture must produce failing cells or the guard is vacuous').toBeGreaterThan(0);
    expect(failed.map((f) => f.cell)).toEqual(expectedFail);
    expect(failed.every((f) => f.reasons.length === 1 && f.reasons[0] === 'min_n')).toBe(true);
    expect(passed).toEqual(cells.filter((c) => c.sample_n >= DEFAULT_GATE.minN));
  });

  it("'window' — a span one day short fails EVERY cell; the exact span passes", () => {
    const cells = orderedLane('design', DEFAULT_GATE.minN);
    const short: GateModel = { ...healthyModel(), window: { from: FROM, to: isoPlusDays(FROM, DEFAULT_GATE.minWindowDays - 1) } };
    const r = gateCells(cells, short, DEFAULT_GATE);
    expect(r.passed).toEqual([]);
    expect(r.failed.map((f) => f.cell)).toEqual(cells);
    expect(r.failed.every((f) => f.reasons.length === 1 && f.reasons[0] === 'window')).toBe(true);
    expect(gateCells(cells, healthyModel(), DEFAULT_GATE).failed).toEqual([]);
  });

  it("'window' — an unparseable window fails closed", () => {
    const cells = orderedLane('design', DEFAULT_GATE.minN);
    const broken: GateModel = { ...healthyModel(), window: { from: 'not-a-date', to: FROM } };
    const r = gateCells(cells, broken, DEFAULT_GATE);
    expect(r.passed).toEqual([]);
    expect(r.failed.every((f) => f.reasons.includes('window'))).toBe(true);
  });

  it("'unverified' — ratio ≥ unverifiedRatioFail fails EVERY cell; one below passes", () => {
    const cells = orderedLane('design', DEFAULT_GATE.minN);
    const sampled = 100;
    const atRatio = Math.ceil(DEFAULT_GATE.unverifiedRatioFail * sampled);
    const all: GateModel = { ...healthyModel(), historyUnverified: atRatio, dropped: { considered: sampled, sampled, reasons: {} } };
    const r = gateCells(cells, all, DEFAULT_GATE);
    expect(r.passed).toEqual([]);
    expect(r.failed.map((f) => f.cell)).toEqual(cells);
    expect(r.failed.every((f) => f.reasons.length === 1 && f.reasons[0] === 'unverified')).toBe(true);

    const below: GateModel = { ...all, historyUnverified: atRatio - 1 };
    expect(gateCells(cells, below, DEFAULT_GATE).failed).toEqual([]);
  });

  it("'unverified' — sampled = 0 never divides and never fails", () => {
    const cells = orderedLane('design', DEFAULT_GATE.minN);
    const none: GateModel = { ...healthyModel(), historyUnverified: 5, dropped: { considered: 5, sampled: 0, reasons: { noDone: 5 } } };
    expect(gateCells(cells, none, DEFAULT_GATE).failed).toEqual([]);
  });

  it('honours opts over the defaults (the numbers are tunable)', () => {
    const cells = orderedLane('design', 3);
    const opts: GateOptions = { minN: 3, minWindowDays: 1, unverifiedRatioFail: 0.5 };
    const m: GateModel = { window: { from: FROM, to: isoPlusDays(FROM, 1) }, historyUnverified: 49, dropped: { considered: 100, sampled: 100, reasons: {} } };
    expect(gateCells(cells, m, opts).failed).toEqual([]);
    expect(gateCells(cells, { ...m, historyUnverified: 50 }, opts).failed.length).toBe(cells.length);
  });
});

describe("gateCells — 'ordering' within a lane", () => {
  /** A lane ordered everywhere except `swapKey`, where Medium dips below Easy. */
  function mixedLane(lane: Lane, swapKey: ConfidenceKey, n: number): GridCell[] {
    return orderedLane(lane, n).map((c) =>
      c.confidence === swapKey && c.difficulty === 'Medium' ? { ...c, value: c.value / 10 } : c,
    );
  }

  for (const swapKey of ['0.85', 'Average'] as const) {
    it(`a dip on '${swapKey}' fails EVERY cell of that lane, not just the tier; the other lane passes`, () => {
      const bad = mixedLane('design', swapKey, DEFAULT_GATE.minN);
      const good = orderedLane('ops', DEFAULT_GATE.minN);
      const cells = [...bad, ...good];
      // derived from the fixture: the dipped tier really is below its predecessor on swapKey
      const easy = bad.find((c) => c.difficulty === 'Easy' && c.confidence === swapKey)!;
      const medium = bad.find((c) => c.difficulty === 'Medium' && c.confidence === swapKey)!;
      expect(medium.value, 'fixture must dip or the guard is vacuous').toBeLessThan(easy.value);

      const { passed, failed } = gateCells(cells, healthyModel(), DEFAULT_GATE);
      expect(failed.map((f) => f.cell)).toEqual(bad);
      expect(failed.every((f) => f.reasons.length === 1 && f.reasons[0] === 'ordering')).toBe(true);
      expect(passed).toEqual(good);
    });
  }

  it("a dip on '0.7' or '0.95' alone is NOT an ordering failure (only 0.85 and Average are ruled)", () => {
    for (const k of ['0.7', '0.95'] as const) {
      const cells = mixedLane('design', k, DEFAULT_GATE.minN);
      expect(gateCells(cells, healthyModel(), DEFAULT_GATE).failed).toEqual([]);
    }
  });

  it('equal neighbours are non-decreasing (Easy = Medium passes)', () => {
    const cells = orderedLane('design', DEFAULT_GATE.minN).map((c) =>
      c.difficulty === 'Medium' ? { ...c, value: c.value / 2 } : c, // Medium = Easy for every key
    );
    for (const k of KEYS) {
      const e = cells.find((c) => c.difficulty === 'Easy' && c.confidence === k)!;
      const m = cells.find((c) => c.difficulty === 'Medium' && c.confidence === k)!;
      expect(m.value).toBe(e.value);
    }
    expect(gateCells(cells, healthyModel(), DEFAULT_GATE).failed).toEqual([]);
  });

  it('compares only the tiers present (Easy + Hard, no Medium)', () => {
    const two = orderedLane('design', DEFAULT_GATE.minN).filter((c) => c.difficulty !== 'Medium');
    expect(gateCells(two, healthyModel(), DEFAULT_GATE).failed).toEqual([]);
    const flipped = two.map((c) => (c.difficulty === 'Hard' ? { ...c, value: c.value / 100 } : c));
    const r = gateCells(flipped, healthyModel(), DEFAULT_GATE);
    expect(r.failed.map((f) => f.cell)).toEqual(flipped);
  });
});

describe('gateCells — several reasons on one cell', () => {
  it('a thin cell in a mixed lane carries both, in the stable order', () => {
    const lane = orderedLane('design', DEFAULT_GATE.minN).map((c) =>
      c.confidence === '0.85' && c.difficulty === 'Medium' ? { ...c, value: c.value / 10, sample_n: DEFAULT_GATE.minN - 1 } : c,
    );
    const thin = lane.filter((c) => c.sample_n < DEFAULT_GATE.minN);
    expect(thin.length).toBe(1);
    const r = gateCells(lane, healthyModel(), DEFAULT_GATE);
    const got = reasonsOf(r.failed);
    expect(got[key(thin[0]!)]).toEqual(['ordering', 'min_n']);
    for (const c of lane.filter((c) => c.sample_n >= DEFAULT_GATE.minN)) expect(got[key(c)]).toEqual(['ordering']);
    expect(r.passed).toEqual([]);
  });

  it('every rule at once yields all four reasons, ordering → min_n → window → unverified', () => {
    const lane = orderedLane('design', DEFAULT_GATE.minN - 1).map((c) =>
      c.confidence === 'Average' && c.difficulty === 'Hard' ? { ...c, value: 0 } : c,
    );
    const m: GateModel = {
      window: { from: FROM, to: isoPlusDays(FROM, 1) },
      historyUnverified: 10,
      dropped: { considered: 10, sampled: 10, reasons: {} },
    };
    const r = gateCells(lane, m, DEFAULT_GATE);
    expect(r.passed).toEqual([]);
    for (const f of r.failed) expect(f.reasons).toEqual(['ordering', 'min_n', 'window', 'unverified']);
  });
});

describe('gate purity and the freeze (invariant 7)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../src/services/model-gate.ts'), 'utf8');
  const script = fs.readFileSync(path.resolve(__dirname, '../scripts/gate-t045.ts'), 'utf8');

  it('the gate has only type imports — no I/O, no client, no models', () => {
    const runtimeImports = src.split('\n').filter((l) => /^import\s/.test(l) && !/^import type\s/.test(l));
    expect(runtimeImports).toEqual([]);
  });

  it('neither the gate nor the gate script names the freeze field (raw text, comments included)', () => {
    const token = ['model', 'frozen'].join('_');
    expect(src.includes(token)).toBe(false);
    expect(script.includes(token)).toBe(false);
  });

  it('the gate script exits non-zero on a failed cell, on a missing model run, and on a refresh that threw (X8)', () => {
    // anchored on the T182 verdict lines, not the pre-existing env-check exit
    const exits = script.match(/T182 FAIL[^\n]*\n\s*process\.exit\(1\);/g) ?? [];
    expect(exits.length).toBe(3);
    expect(script).toMatch(/SyncRun\.findOne\(\{[^}]*source: 'model'/);
  });

  it('A3-2 — zero cells reaching the gate is NOT a pass: the script prints T182 NO CELLS and exits 1', () => {
    const noCells = script.match(/T182 NO CELLS[^\n]*\n\s*process\.exit\(1\);/g) ?? [];
    expect(noCells.length).toBe(1);
    // the NO CELLS exit sits BEFORE the PASS line, so an empty grid can never reach PASS
    expect(script.indexOf('T182 NO CELLS')).toBeLessThan(script.indexOf('T182 PASS'));
  });

  it('X8 — the model refresh runs inside try/catch so an unavailable model reaches the T182 verdict, not a stack trace', () => {
    // the call is the first statement of a try block that has a catch (the body may hold object literals)
    expect(script).toMatch(/try \{\s*refresh = await refreshProjectModel\([\s\S]*?\} catch \(/);
    // and the thrown refresh is one of the T182 FAIL exits
    expect(script).toMatch(/if \(refreshError\) \{\s*console\.error\([^\n]*T182 FAIL[^\n]*\n\s*process\.exit\(1\);/);
  });

  it('X8 — the T045 grid table iterates the lanes present in the refreshed model, never a hardcoded lane list', () => {
    expect(script).toMatch(/Object\.keys\(model\.design\[diff\]/);
    // the pre-amendment union, in any spacing/quoting, must not be typed into the script
    expect(script).not.toMatch(/\[\s*['"]design['"]\s*,\s*['"]ops['"]\s*,\s*['"]assets['"]\s*\]/);
  });

  it("A3-7 — the script's today and its rendered dates are Asia/Manila (invariant 11), never UTC or host-TZ", () => {
    expect(script).toMatch(/import \{[^}]*\bmanilaToday\b[^}]*\} from '\.\.\/src\/services\/pipeline\.ts'/);
    expect(script).toMatch(/const today = manilaToday\(\)/);
    expect(script).toMatch(/timeZone: 'Asia\/Manila'/);
    // the two host/UTC renderings the finding named
    expect(script).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
    expect(script).not.toMatch(/toDateString\(/);
  });

  it("A3-6 — cellRow prints '—' for a failure entry without a cell instead of throwing (executed from the shipped text)", () => {
    // The script cannot be imported (it connects on load), so the helper is cut out of the
    // shipped source at its declaration, transpiled, and RUN — not compared as text.
    const start = script.indexOf('const cellRow = ');
    expect(start, 'cellRow must exist in the script').toBeGreaterThan(-1);
    const end = script.indexOf('\n};\n', start);
    const snippet = script.slice(start, end + 3);
    const js = ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const cellRow = new Function(`${js}; return cellRow;`)() as (c: unknown, v: string) => string;
    const dashes = '| — | — | — | — | — | failed: min_n |';
    expect(cellRow(undefined, 'failed: min_n')).toBe(dashes);
    expect(cellRow(null, 'failed: min_n')).toBe(dashes);
    // the other two shapes still print
    expect(cellRow('design', 'x')).toBe('| design | — | — | — | — | x |');
    expect(cellRow({ lane: 'ops', difficulty: 'Easy', confidence: '0.85', value: 1, sample_n: 20 }, 'passed')).toBe(
      '| ops | Easy | 0.85 | 1 | 20 | passed |',
    );
  });
});
