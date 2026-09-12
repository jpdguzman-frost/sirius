/**
 * BLOCK 12 — the lane structure: the retired asset figure, the generalised
 * fallback, and the dev lane (JP's three rulings, 2026-09-12, from the
 * measured-cycle-times artifact; `.claude/block12/plan.md` §"Guards this
 * needs" items 1–7).
 *
 * Every number here is READ from the shipped module or from the oracle
 * (test/CLAUDE.md rule 2). The retired figures in particular are read out of
 * `test/golden/original.mjs`, which keeps the cell deliberately as the
 * pre-ruling reference — so this file never types them and cannot drift from
 * what was actually retired.
 *
 * WHY THE SOURCE GUARD BELOW STRIPS COMMENTS, against rule 3's usual habit:
 * the amendment note in `lib/model.ts` RECORDS the retired figures on purpose,
 * the way the calendar's 2026-08-15 note records what it changed. A raw-text
 * ban would force that record to be deleted to stay green — the guard would be
 * wrong and the prose right, which is the reverse of rule 3's precedent. So
 * the guard is made comment-proof by construction instead: it walks the file's
 * NUMERIC LITERALS through the TypeScript parser, which is both stricter than
 * a text search (a value cannot hide behind spacing or a different quote) and
 * indifferent to prose. Prose in that file is free; code is not.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
// @ts-expect-error verbatim minified extract, untyped by design
import * as O from './golden/original.mjs';
import {
  CONFIDENCE_LEVELS,
  EMPIRICAL,
  GENERAL,
  WORK_TYPE_LANES,
  designCell,
  laneOf,
  laneOfWorkType,
  type ConfidenceKey,
  type DesignCell,
  type Difficulty,
  type Lane,
} from '../lib/model.ts';
import { cellsFromAresModel } from '../src/services/model-refresh.ts';
import type { AresCycleTimeModel } from '../src/services/ares.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL_SRC = fs.readFileSync(path.join(HERE, '../lib/model.ts'), 'utf8');
const REFRESH_SRC = fs.readFileSync(path.join(HERE, '../src/services/model-refresh.ts'), 'utf8');

const TIERS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const KEYS: ConfidenceKey[] = ['Average', '0.7', '0.85', '0.95'];

/**
 * The cell the block-12 amendment retired, READ from the oracle — which keeps
 * it, deliberately, as the pre-ruling reference. Derived as "the lane the
 * oracle's Easy tier carries and the shipped snapshot no longer does", so it
 * names neither the lane nor its numbers.
 */
const oracleEasy = O.Xe.design.Easy as Record<string, Record<string, number>>;
const RETIRED_LANE: string = Object.keys(oracleEasy).find((k) => !(k in (EMPIRICAL.design.Easy ?? {})))!;
const RETIRED_VALUES: number[] = Object.values(oracleEasy[RETIRED_LANE] ?? {});

/** Every numeric literal in a TypeScript source, comments and strings excluded. */
function numericLiterals(src: string, fileName: string): number[] {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.ES2022, true);
  const out: number[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isNumericLiteral(node)) out.push(Number(node.text));
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

/**
 * Type-check one standalone snippet in memory; returns the diagnostic messages.
 * Nothing is written to disk and nothing is imported — the snippet carries both
 * halves of the tie as text, so `tsc`'s own answer about them is the assertion.
 * The real `lib.*.d.ts` files are served off the installed compiler so that
 * `Record` resolves; without them every snippet would "fail" for the wrong
 * reason and the negative cases below would pass vacuously.
 */
const TS_LIB_DIR = path.dirname(ts.sys.getExecutingFilePath());
function typeErrors(code: string): string[] {
  const fileName = '/virtual/lane-tie.ts';
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022 };
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.ES2022, true);
  const libCache = new Map<string, ts.SourceFile | undefined>();
  const readLib = (name: string): ts.SourceFile | undefined => {
    if (!libCache.has(name)) {
      const full = path.join(TS_LIB_DIR, path.basename(name));
      libCache.set(
        name,
        fs.existsSync(full)
          ? ts.createSourceFile(name, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.ES2022, true)
          : undefined,
      );
    }
    return libCache.get(name);
  };
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === fileName ? sf : readLib(name)),
    writeFile: () => undefined,
    getDefaultLibFileName: (o) => ts.getDefaultLibFileName(o),
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (n) => n,
    getCurrentDirectory: () => '/virtual',
    getNewLine: () => '\n',
    fileExists: (name) => name === fileName || fs.existsSync(path.join(TS_LIB_DIR, path.basename(name))),
    readFile: (name) =>
      name === fileName ? code : fs.readFileSync(path.join(TS_LIB_DIR, path.basename(name)), 'utf8'),
  };
  const program = ts.createProgram([fileName], options, host);
  return program
    .getSemanticDiagnostics(sf)
    .concat(program.getSyntacticDiagnostics(sf))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

/* ---------------------------------------------------------------------- */
/* GUARD 1 — no lane resolves to the retired figure, by ANY route          */
/* ---------------------------------------------------------------------- */

describe('guard 1 — the retired figure is reachable by no route at all', () => {
  it('the premise: the oracle still carries the retired cell, and it is a real cell', () => {
    expect(RETIRED_LANE, 'the oracle must keep a lane the shipped snapshot has dropped').toBeTruthy();
    expect(RETIRED_VALUES.length, 'the retired cell must carry values or this file guards nothing').toBe(5);
    expect(RETIRED_VALUES.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('no numeric literal in the shipped model source equals a retired value (parsed, so prose cannot mask it)', () => {
    const literals = new Set(numericLiterals(MODEL_SRC, 'lib/model.ts'));
    // non-vacuity: the parser really did find the snapshot's numbers
    expect(literals.has(EMPIRICAL.design.Easy!.design!['0.7'])).toBe(true);
    for (const v of RETIRED_VALUES) expect(literals.has(v), `retired value ${v}`).toBe(false);
  });

  it('the same reader, pointed at the ORACLE, DOES find every retired value — the guard has teeth', () => {
    /* The oracle keeps the cell on purpose, so it is a file that must trip this
       reader. Without this case, a reader that silently found nothing would
       satisfy the guard above forever. */
    const oracleSrc = fs.readFileSync(path.join(HERE, 'golden/original.mjs'), 'utf8');
    const literals = new Set(numericLiterals(oracleSrc, 'original.mjs'));
    for (const v of RETIRED_VALUES) expect(literals.has(v), `retired value ${v}`).toBe(true);
  });

  it('no card reaches a retired value — every difficulty × every labelled family', () => {
    const difficulties: (string | undefined)[] = [...TIERS, undefined, 'Unknown', 'constructor'];
    for (const difficulty of difficulties)
      for (const family of Object.keys(WORK_TYPE_LANES)) {
        const cell = designCell({ difficulty, currentList: '', labels: [`${family}: Some Kind`] });
        for (const k of KEYS)
          expect(RETIRED_VALUES, `${difficulty}/${family}/${k}`).not.toContain(cell[k]);
        expect(RETIRED_VALUES, `${difficulty}/${family}/n`).not.toContain(cell.n);
      }
  });

  it('no card reaches a retired value — every difficulty × every list text the fallback can read', () => {
    /* The retired alternation's own words, plus the ops words and a neutral
       one: whatever the fallback does with them, none may price at the cell. */
    const lists = [
      'Render Assets',
      'Sketch Assets',
      'Illustration',
      'Icon Clean Up',
      'Ops / Process',
      'Board Management',
      'Working on Design',
      '',
    ];
    const difficulties: (string | undefined)[] = [...TIERS, undefined, 'Unknown'];
    for (const difficulty of difficulties)
      for (const currentList of lists)
        for (const labels of [[], ['Main Card'], ['Icon Clean Up'], ['\u{1F6D1} Waiting on client']]) {
          const cell = designCell({ difficulty, currentList, labels });
          for (const k of KEYS)
            expect(RETIRED_VALUES, `${difficulty}/${currentList}/${k}`).not.toContain(cell[k]);
        }
  });

  it('no cell anywhere in the shipped snapshot or the general pool carries one', () => {
    const all: DesignCell[] = [
      ...Object.values(EMPIRICAL.design).flatMap((tier) => Object.values(tier ?? {})),
      ...Object.values(GENERAL),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const cell of all)
      for (const v of Object.values(cell)) expect(RETIRED_VALUES, String(v)).not.toContain(v);
  });
});

/* ---------------------------------------------------------------------- */
/* GUARD 2 — an unlabelled asset-looking card resolves to design           */
/* ---------------------------------------------------------------------- */

describe('guard 2 — an unlabelled asset-looking card is a design card', () => {
  /** The retired alternation was /asset|illustrat|render|icon/; each word, in list text. */
  const ASSET_LISTS = ['Render Assets', 'Sketch Asset', 'Illustration', 'Illustrating', 'Icons', 'Icon Clean Up'];

  it('every word of the retired alternation resolves to design, from the list', () => {
    for (const currentList of ASSET_LISTS) expect(laneOf({ currentList, labels: [] }), currentList).toBe('design');
  });

  it('…and from a free-text label, which the fallback also reads', () => {
    for (const label of ASSET_LISTS)
      expect(laneOf({ currentList: 'Working on Design', labels: [label] }), label).toBe('design');
  });

  it('the ops branch of the same fallback is UNTOUCHED — the removal took one alternation, not the regex', () => {
    for (const currentList of ['Ops / Process', 'Board Management', 'Client process'])
      expect(laneOf({ currentList, labels: [] }), currentList).toBe('ops');
    // and ops still beats an asset word in the same text, as it always did
    expect(laneOf({ currentList: 'Render Assets / Ops', labels: [] })).toBe('ops');
  });

  it('so such a card prices off the design cell, not off a fallback', () => {
    for (const difficulty of TIERS)
      for (const currentList of ASSET_LISTS)
        expect(designCell({ difficulty, currentList, labels: [] }), `${difficulty}/${currentList}`).toEqual(
          EMPIRICAL.design[difficulty]!.design,
        );
  });
});

/* ---------------------------------------------------------------------- */
/* GUARD 3 — a lane with no cell of its own gets the GENERAL pool          */
/* ---------------------------------------------------------------------- */

describe('guard 3 — a lane with no cell of its own resolves to the general number, not to design’s', () => {
  /** The lanes the shipped snapshot measures at all, derived from the snapshot. */
  const measured = new Set(Object.values(EMPIRICAL.design).flatMap((tier) => Object.keys(tier ?? {})));
  /** Lanes the fold can produce that the snapshot has no cell for — derived, not listed. */
  const unmeasured = [...new Set(Object.values(WORK_TYPE_LANES))].filter((l) => !measured.has(l));

  it('the premise: the fold really does produce lanes the snapshot cannot price, and the two answers differ', () => {
    expect(unmeasured.length, 'a cell-less lane must exist or this guard is vacuous').toBeGreaterThan(0);
    for (const difficulty of TIERS)
      expect(GENERAL[difficulty], difficulty).not.toEqual(EMPIRICAL.design[difficulty]!.design);
  });

  it('every cell-less lane gets the general pool for its difficulty', () => {
    for (const lane of unmeasured) {
      const family = Object.keys(WORK_TYPE_LANES).find((f) => WORK_TYPE_LANES[f] === lane)!;
      for (const difficulty of TIERS) {
        const cell = designCell({ difficulty, currentList: '', labels: [`${family}: Some Kind`] });
        expect(laneOf({ currentList: '', labels: [`${family}: Some Kind`] }), family).toBe(lane);
        expect(cell, `${lane}/${difficulty}`).toBe(GENERAL[difficulty]);
        expect(cell, `${lane}/${difficulty}`).not.toEqual(EMPIRICAL.design[difficulty]!.design);
      }
    }
  });

  it('it is the DIFFICULTY’s general cell, not one general number for the board', () => {
    const family = Object.keys(WORK_TYPE_LANES).find((f) => !measured.has(WORK_TYPE_LANES[f]!))!;
    const cells = TIERS.map((d) => designCell({ difficulty: d, currentList: '', labels: [`${family}: X`] }));
    expect(new Set(cells).size).toBe(TIERS.length);
  });

  it('an unknown or missing difficulty takes the general pool’s Medium, as the tier lookup does', () => {
    const family = Object.keys(WORK_TYPE_LANES).find((f) => !measured.has(WORK_TYPE_LANES[f]!))!;
    for (const difficulty of [undefined, 'Unknown', '', 'constructor', '__proto__'])
      expect(designCell({ difficulty, currentList: '', labels: [`${family}: X`] }), String(difficulty)).toBe(
        GENERAL.Medium,
      );
  });

  it('a MEASURED lane never reaches the pool — the fallback is a fallback', () => {
    for (const difficulty of TIERS)
      for (const lane of ['design', 'ops'] as const) {
        const family = Object.keys(WORK_TYPE_LANES).find((f) => WORK_TYPE_LANES[f] === lane)!;
        expect(
          designCell({ difficulty, currentList: '', labels: [`${family}: X`] }),
          `${lane}/${difficulty}`,
        ).toEqual(EMPIRICAL.design[difficulty]![lane]);
      }
  });
});

/* ---------------------------------------------------------------------- */
/* GUARD 4 — the general numbers ARE the measured pool                     */
/* ---------------------------------------------------------------------- */

/**
 * JP's measured pool, 2026-09-12 — pooled across every deep cell on the board
 * (n ≥ 15), 5,245 finished cards, in working days.
 *
 * TRANSCRIBED, for the same reason `ARES_FAMILIES` is transcribed in
 * test/work-type.test.ts: it is a fact about the BOARD, produced by a run
 * against ARES, and nothing in this repository could derive it. This file is
 * where a divergence between the shipped constant and the run that produced it
 * has to be answered. Nothing below recomputes a percentile — the arithmetic
 * belongs to the run, not to the test; the shipped values are READ from
 * `GENERAL` and compared against what was measured.
 */
const MEASURED_POOL: Record<Difficulty, { n: number; p70: number; p85: number; p95: number }> = {
  Easy: { n: 2250, p70: 0.4, p85: 0.8, p95: 1.96 },
  Medium: { n: 2478, p70: 0.55, p85: 0.9, p95: 1.66 },
  Hard: { n: 517, p70: 1.4, p85: 2.5, p95: 4.61 },
};
const POOL_TOTAL = 5245;

describe('guard 4 — GENERAL is the measured pool, read out of the shipped constant', () => {
  it('every tier’s percentiles and sample size are the measured ones', () => {
    for (const difficulty of TIERS) {
      const shipped = GENERAL[difficulty];
      const measured = MEASURED_POOL[difficulty];
      expect(shipped['0.7'], `${difficulty} p70`).toBe(measured.p70);
      expect(shipped['0.85'], `${difficulty} p85`).toBe(measured.p85);
      expect(shipped['0.95'], `${difficulty} p95`).toBe(measured.p95);
      expect(shipped.n, `${difficulty} n`).toBe(measured.n);
    }
  });

  it('the pool covers exactly the three difficulties, and its sample sizes sum to the run’s total', () => {
    expect(Object.keys(GENERAL).sort()).toEqual([...TIERS].sort());
    expect(TIERS.reduce((a, d) => a + GENERAL[d].n, 0)).toBe(POOL_TOTAL);
  });

  it('every cell is complete and positive — no confidence key left at zero', () => {
    for (const difficulty of TIERS) {
      for (const k of KEYS) expect(GENERAL[difficulty][k], `${difficulty}/${k}`).toBeGreaterThan(0);
      expect(GENERAL[difficulty].n).toBeGreaterThan(0);
    }
  });

  it('it is correctly ordered at p85 across difficulties — the property JP’s ruling turned on', () => {
    const p85 = TIERS.map((d) => GENERAL[d]['0.85']);
    expect(p85).toEqual([...p85].sort((a, b) => a - b));
    expect(new Set(p85).size, 'a flat curve would satisfy the sort vacuously').toBe(p85.length);
  });

  it('the confidence keys are the shipped ones, so every cell answers every level', () => {
    for (const difficulty of TIERS)
      expect(CONFIDENCE_LEVELS.every((L) => typeof GENERAL[difficulty][L.key] === 'number')).toBe(true);
  });
});

/* ---------------------------------------------------------------------- */
/* GUARDS 5 + 6 — the dev lane reaches the grid, and the families reach it */
/* ---------------------------------------------------------------------- */

const laneCell = (laneKey: string, difficulty: Difficulty, n = 40) => ({
  laneKey,
  difficulty,
  source: 'firm' as const,
  n,
  meanWorkingDays: 1,
  p70: 0.9,
  p85: 1.06,
  p95: 2,
});

const ARES_MODEL = (laneKeys: string[]): AresCycleTimeModel => ({
  rtProjectId: 837,
  generatedAt: '2026-09-12T00:00:00.000Z',
  window: { from: '2026-01-01', to: '2026-09-01' },
  floorMinutes: 15,
  overrideDays: 14,
  workingDayHours: 24,
  workTypeKeys: [],
  historyUnverified: 0,
  dropped: { considered: 100, sampled: 100, reasons: {} },
  cells: [],
  laneCells: laneKeys.flatMap((k) => TIERS.map((d) => laneCell(k, d))),
});

describe('guard 5 — an ARES `dev` lane cell reaches the grid instead of being discarded', () => {
  it('the dev cells map, and nothing about them is counted unmapped', () => {
    const { cells, unmapped, laneSources } = cellsFromAresModel(ARES_MODEL(['dev']), 'p1');
    expect(unmapped).toEqual({});
    expect(laneSources).toEqual({ dev: 'firm' });
    expect(cells).toHaveLength(TIERS.length * KEYS.length);
    expect(new Set(cells.map((c) => c.lane))).toEqual(new Set(['dev']));
    // the values are ARES's own, copied not converted
    const easy = cells.filter((c) => c.difficulty === 'Easy');
    const src = laneCell('dev', 'Easy');
    expect(easy.find((c) => c.confidence === '0.85')?.value).toBe(src.p85);
    expect(easy.every((c) => c.sample_n === src.n)).toBe(true);
  });

  it('non-vacuity: a key the union does NOT hold is still counted, by the same call', () => {
    const { cells, unmapped } = cellsFromAresModel(ARES_MODEL(['dev', 'working-on-design']), 'p1');
    expect(unmapped).toEqual({ 'working-on-design': TIERS.length });
    expect(new Set(cells.map((c) => c.lane))).toEqual(new Set(['dev']));
  });

  it('the retired lane is one of those now — an ARES cell under it is counted, never mapped', () => {
    const { cells, unmapped } = cellsFromAresModel(ARES_MODEL([RETIRED_LANE]), 'p1');
    expect(cells).toEqual([]);
    expect(unmapped).toEqual({ [RETIRED_LANE]: TIERS.length });
  });
});

describe('guard 6 — a card whose family is Build: or Dev: gets the dev lane', () => {
  it('both families fold to one lane, by the family key and by a full label', () => {
    for (const family of ['Build', 'Dev']) {
      expect(laneOfWorkType(family), family).toBe('dev');
      expect(laneOfWorkType(`${family}: Some Kind`), family).toBe('dev');
    }
    expect(WORK_TYPE_LANES['Build']).toBe(WORK_TYPE_LANES['Dev']);
  });

  it('the real work types ARES pools into that lane all land there', () => {
    /* ARES's own deep cells under the two families (plan §3): Build's five
       kinds and Dev's one. A card wearing any of them is a dev-lane card. */
    const kinds = [
      'Build: Element',
      'Build: High Level Component',
      'Build: Low Level Component',
      'Build: Page',
      'Build: Section',
      'Dev: Develop Functionality',
    ];
    for (const label of kinds) expect(laneOf({ currentList: '', labels: [label] }), label).toBe('dev');
  });

  it('the label beats the list, as it does for every other family', () => {
    for (const currentList of ['Ops / Process', 'Render Assets', 'Working on Design', ''])
      expect(laneOf({ currentList, labels: ['Build: Page'] }), currentList).toBe('dev');
    expect(laneOf({ currentList: 'Working on Design', labels: ['Difficulty: Hard', 'Dev: API'] })).toBe('dev');
  });

  it('but the WORD dev in list text is not a lane — only the label family is', () => {
    expect(laneOf({ currentList: 'Development Backlog', labels: [] })).toBe('design');
    expect(laneOf({ currentList: 'Working on Design', labels: ['Dev tooling'] })).toBe('design');
  });
});

/* ---------------------------------------------------------------------- */
/* GUARD 7 — the Lane union and LANE_KEYS cannot drift                     */
/* ---------------------------------------------------------------------- */

describe('guard 7 — the compile-time tie between the Lane union and LANE_KEYS is real', () => {
  /** The shipped union declaration and the shipped key set, cut out of their files. */
  const UNION = /export type Lane = [^;]+;/.exec(MODEL_SRC)?.[0]?.replace(/^export /, '') ?? '';
  const KEYSET = /const LANE_KEYS = (\{[^}]*\}) satisfies Record<Lane, true>/.exec(REFRESH_SRC)?.[1] ?? '';

  const tie = (literal: string) => `${UNION}\nconst LANE_KEYS = ${literal} satisfies Record<Lane, true>;\n`;

  it('both halves are present in the shipped sources (or the cases below prove nothing)', () => {
    expect(UNION, 'lib/model.ts must declare `export type Lane = …;`').toMatch(/^type Lane = /);
    expect(KEYSET, 'model-refresh.ts must tie LANE_KEYS with `satisfies Record<Lane, true>`').toMatch(/^\{/);
    // the tie covers the whole union — same membership on both sides, at runtime too
    const unionMembers = [...UNION.matchAll(/'([^']+)'/g)].map((m) => m[1]!).sort();
    const keyMembers = [...KEYSET.matchAll(/(\w+)\s*:/g)].map((m) => m[1]!).sort();
    expect(keyMembers).toEqual(unionMembers);
    expect(unionMembers.length).toBeGreaterThan(1);
  });

  it('the shipped pair type-checks clean — the baseline', () => {
    expect(typeErrors(tie(KEYSET))).toEqual([]);
  });

  /* Each negative asserts the diagnostic NAMES the drifted member, so a
     snippet that failed for some unrelated reason — a missing lib, a typo in
     the extraction — could not be mistaken for the tie doing its job. */
  it('DROPPING a key from the set fails the check (a lane in the union with no runtime key)', () => {
    const members = [...KEYSET.matchAll(/(\w+)\s*:\s*true/g)].map((m) => m[1]!);
    expect(members.length).toBeGreaterThan(1);
    for (const dropped of members) {
      const short = `{ ${members.filter((m) => m !== dropped).map((m) => `${m}: true`).join(', ')} }`;
      const errs = typeErrors(tie(short));
      expect(errs.length, `dropping ${dropped}`).toBeGreaterThan(0);
      expect(errs.join(' '), `dropping ${dropped}`).toContain(`Property '${dropped}' is missing`);
    }
  });

  it('ADDING a key the union lacks fails the check (a runtime key with no lane)', () => {
    const wide = KEYSET.replace(/\}\s*$/, ', notALane: true }');
    const errs = typeErrors(tie(wide));
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join(' ')).toContain("'notALane' does not exist in type 'Record<Lane, true>'");
  });

  it('so does widening the union alone (a lane the key set never learned about)', () => {
    const wider = UNION.replace(/;$/, " | 'notALane';");
    const errs = typeErrors(`${wider}\nconst LANE_KEYS = ${KEYSET} satisfies Record<Lane, true>;\n`);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join(' ')).toContain("Property 'notALane' is missing");
  });

  it('and the retired lane is in neither half', () => {
    expect(UNION).not.toContain(`'${RETIRED_LANE}'`);
    expect(KEYSET).not.toContain(RETIRED_LANE);
    const runtimeLanes = new Set<string>(Object.values(WORK_TYPE_LANES) as Lane[]);
    expect(runtimeLanes.has(RETIRED_LANE)).toBe(false);
    expect(runtimeLanes.has('dev')).toBe(true);
  });
});
