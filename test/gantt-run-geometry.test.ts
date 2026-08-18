/**
 * Batch 8 (T158) — the drag source becomes the coloured RUN, and the coloured
 * bars must not move by a pixel.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HONESTY NOTE — READ BEFORE TRUSTING A GREEN RUN.
 *
 * Nothing in this file can prove a drag works. This repo has no jsdom and no
 * browser runner, so every assertion here is either an execution of source
 * text sliced out of the shipped frontend files, or a read of that text. A
 * synthetic `DragEvent` NEVER enters Chrome's drag machinery — it calls the
 * app's own handlers directly, which is exactly why every automated check since
 * 13g/13j passed while the live bar was un-draggable. There are no synthetic
 * events here and none may be added.
 *
 * What this file DOES prove is the one thing the batch is most likely to get
 * wrong and the least likely to notice: re-basing every `.gseg` from
 * percent-of-track onto percent-of-run is an arithmetic identity, and the bars
 * therefore land where they land today. Real-input verification — real mouse,
 * real drag, real drop, plus a before/after screenshot that must be identical
 * apart from the cursor — is the orchestrator's, in a browser, after deploy.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * THE STRUCTURAL CHANGE, IN ONE LINE. `phaseBars(row)` emitted one flat list of
 * segments positioned in percent OF THE TRACK. `phaseRun(row)` emits 0 or 1
 * BOXES — the run's own bounding box, positioned in percent of the track — each
 * carrying its segments re-based to percent OF THE BOX. The box is the drag
 * source; the segments are what paints.
 *
 * WHY phaseBars was never executed by a test and phaseRun is. `phaseBars` was
 * an inline arrow inside `app.set('phaseBars', …)`, which no slicer can address.
 * `phaseRun` is a column-0 `const`, so the SHIPPED recipe runs here — not a
 * retyped copy of it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_JS, GANTT_CSS, TEMPLATE, cssRule } from './helpers/gantt-render.ts';

const API_JS = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'scripts', '00-api.js'),
  'utf8',
);

/**
 * Slice one top-level declaration out of a source file. Copied from
 * test/planner-weeks.test.ts rather than reused from `helpers/gantt-render.ts`
 * on purpose: that one is const-only and cannot slice `function fmtDate` or
 * `function dayIndex`, both of which this harness needs.
 */
function decl(src: string, name: string): string {
  const fnAt = src.indexOf(`\nfunction ${name}(`);
  if (fnAt >= 0) {
    let depth = 0;
    for (let i = src.indexOf('{', fnAt); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return src.slice(fnAt, i + 1);
    }
    throw new Error(`gantt-run-geometry: unterminated function \`${name}\``);
  }
  const at = src.indexOf(`\nconst ${name} =`);
  if (at < 0) throw new Error(`gantt-run-geometry: no declaration of \`${name}\` in the shipped frontend source`);
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i]!;
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`gantt-run-geometry: unterminated declaration \`${name}\``);
}

interface Phase {
  phase: string;
  startIso: string;
  endIso: string;
}
interface Seg {
  cls: string;
  title: string;
  left: string;
  width: string;
}
interface Run {
  left: string;
  width: string;
  segs: Seg[];
}
/** One entry as the DELETED `phaseBars` used to emit it — the frozen oracle. */
interface OracleBar {
  cls: string;
  left: string;
  width: string;
  title: string;
}

interface Harness {
  setWeek(w: string): void;
  phaseRun(row: unknown): Run[];
  dayIndex(iso: string): number;
  clampUnits(u: number): number;
  pctOf(n: number, d: number): string;
  unitPct(u: number): string;
  fmtDate(iso: string): string;
  TOTAL_UNITS: number;
  WEEK_COUNT: number;
  WEEK_PX: number;
  WORKDAYS_PER_WEEK: number;
  MIN_GRAB_PX: number;
  UNIT_PX: number;
  MIN_GRAB_UNITS: number;
}

/**
 * Declaration order matters: these are `const`s, so anything evaluated at
 * definition time (`TOTAL_UNITS`, `UNIT_PX`, `MIN_GRAB_UNITS`) must come after
 * what it reads. `dayIndex` and `fmtDate` are function declarations and hoist.
 */
const HARNESS_SRC = [
  decl(APP_JS, 'WEEK_COUNT'),
  decl(APP_JS, 'WEEK_PX'),
  decl(APP_JS, 'WORKDAYS_PER_WEEK'),
  decl(APP_JS, 'TOTAL_UNITS'),
  decl(APP_JS, 'dayIndex'),
  decl(APP_JS, 'clampUnits'),
  decl(APP_JS, 'pctOf'),
  decl(APP_JS, 'unitPct'),
  decl(APP_JS, 'MIN_GRAB_PX'),
  decl(APP_JS, 'UNIT_PX'),
  decl(APP_JS, 'MIN_GRAB_UNITS'),
  decl(APP_JS, 'phaseRun'),
  decl(API_JS, 'fmtDate'),
].join('\n');

/**
 * `dayIndex` reads the window origin off the Ractive instance, and `phaseRun`
 * reads nothing else off it, so this two-line stand-in is the whole surface the
 * shipped bodies need. Window: 2026-08-03 (a Monday) through 2026-10-23,
 * 12 columns × 5 workdays = 60 units.
 */
const H = new Function(`
  const WEEK_START = { v: '2026-08-03' };
  const app = { get: (k) => (k === 'weekStart' ? WEEK_START.v : undefined) };
  ${HARNESS_SRC}
  return {
    setWeek: (w) => { WEEK_START.v = w; },
    phaseRun, dayIndex, clampUnits, pctOf, unitPct, fmtDate,
    TOTAL_UNITS, WEEK_COUNT, WEEK_PX, WORKDAYS_PER_WEEK,
    MIN_GRAB_PX, UNIT_PX, MIN_GRAB_UNITS,
  };
`)() as Harness;

/**
 * THE FROZEN ORACLE — `phaseBars` exactly as it stood at 1c571f1, transcribed
 * here because the app no longer contains it.
 *
 * It is deliberately FROZEN. It is the fixed point that proves the bars did not
 * move, not a mirror that tracks the source: if someone edits `phaseRun`'s
 * output positions, this must NOT follow. Its primitives (`dayIndex`,
 * `clampUnits`, `unitPct`, `fmtDate`) are the SLICED shipped ones, so the two
 * sides cannot disagree about what a date means — only about where a segment
 * is drawn, which is the whole question.
 */
function barsAt1c571f1(row: { phases?: unknown }): OracleBar[] {
  const phases = Array.isArray(row.phases) ? (row.phases as Phase[]) : [];
  const bars: OracleBar[] = [];
  for (const p of phases) {
    const left = H.clampUnits(H.dayIndex(p.startIso));
    const right = H.clampUnits(H.dayIndex(p.endIso));
    if (right <= left) continue; // zero-width, or clipped fully outside the window
    bars.push({
      cls: p.phase,
      left: H.unitPct(left),
      width: H.unitPct(right - left),
      title: `${p.phase} → ${H.fmtDate(p.endIso)}`,
    });
  }
  return bars;
}

const row = (...phases: Phase[]): { phases: Phase[] } => ({ phases });

/* ---------------------------------------------------------------------- *
 * Fixtures. Every date is chosen so `dayIndex` lands on the unit named in
 * the comment — asserted below, so a wrong comment fails rather than lies.
 * ---------------------------------------------------------------------- */

/** F1 — one segment, mid-window: units 10 → 14. */
const F1 = row({ phase: 'sketch', startIso: '2026-08-17', endIso: '2026-08-21' });
/** F2 — three TOUCHING segments: 5→10, 10→15, 15→20. The seams must stay closed. */
const F2 = row(
  { phase: 'sketch', startIso: '2026-08-10', endIso: '2026-08-17' },
  { phase: 'review', startIso: '2026-08-17', endIso: '2026-08-24' },
  { phase: 'render', startIso: '2026-08-24', endIso: '2026-08-31' },
);
/** F3 — clipped by the window's LEFT edge: dayIndex −5 clamps to 0, then 4→9. */
const F3 = row(
  { phase: 'sketch', startIso: '2026-07-27', endIso: '2026-08-07' },
  { phase: 'review', startIso: '2026-08-07', endIso: '2026-08-14' },
);
/** F4 — clipped by the window's RIGHT edge: 50→55, then 55→65 clamped to 60. */
const F4 = row(
  { phase: 'review', startIso: '2026-10-12', endIso: '2026-10-19' },
  { phase: 'render', startIso: '2026-10-19', endIso: '2026-11-02' },
);
/** F5a — every segment entirely BEFORE the window. */
const F5A = row({ phase: 'sketch', startIso: '2026-07-13', endIso: '2026-07-17' });
/** F5b — every segment entirely AFTER it. */
const F5B = row({ phase: 'render', startIso: '2026-11-09', endIso: '2026-11-13' });
/** F6 — a one-day run in the FINAL column: 59 → 60. The right-edge case. */
const F6 = row({ phase: 'render', startIso: '2026-10-23', endIso: '2026-10-26' });
/** F7 — a one-day run mid-window: 12 → 13. The minimum fires; `left` must not move. */
const F7 = row({ phase: 'sketch', startIso: '2026-08-19', endIso: '2026-08-20' });
/** F8 — already wider than the minimum: 25 → 34. Nothing may be adjusted. */
const F8 = row({ phase: 'render', startIso: '2026-09-07', endIso: '2026-09-18' });
/** F10 — a zero-width segment mixed with a real one (15 → 19). */
const F10 = row(
  { phase: 'sketch', startIso: '2026-08-17', endIso: '2026-08-17' },
  { phase: 'review', startIso: '2026-08-24', endIso: '2026-08-28' },
);

/** The fixtures that draw a box, and must round-trip to the frozen oracle. */
const DRAWN: [string, { phases: Phase[] }][] = [
  ['F1 one segment', F1],
  ['F2 three touching segments', F2],
  ['F3 clipped at the left edge', F3],
  ['F4 clipped at the right edge', F4],
  ['F6 the final column', F6],
  ['F7 a one-day run mid-window', F7],
  ['F8 already wider than the minimum', F8],
  ['F10 a zero-width segment dropped', F10],
];

/** ISO date of workday unit `u`, so a sweep can address every column. */
function isoAtUnit(u: number): string {
  const days = Math.floor(u / 5) * 7 + (u % 5);
  return new Date(Date.UTC(2026, 7, 3) + days * 864e5).toISOString().slice(0, 10);
}

/* ====================================================================== *
 * SUITE 0 — the harness executes the SHIPPED recipe, and the fixtures mean
 * what their comments say
 * ====================================================================== */

describe('the geometry under test is the shipped geometry', () => {
  it('slices phaseRun as a column-0 const — which is what makes this whole file possible', () => {
    // `app.set('phaseBars', (row) => …)` was un-sliceable, so the OLD helper was
    // never once executed by a test. That is the gap this batch closes.
    expect(APP_JS).toMatch(/\nconst phaseRun = /);
    expect(typeof H.phaseRun).toBe('function');
  });

  it('leaves no drifting twin — phaseBars is gone from the app and from the template', () => {
    expect(APP_JS).not.toContain('phaseBars');
    expect(TEMPLATE).not.toContain('phaseBars');
  });

  it('keeps the axis it re-bases against: 12 columns × 5 workdays = 60 units', () => {
    expect(H.WEEK_COUNT).toBe(12);
    expect(H.WORKDAYS_PER_WEEK).toBe(5);
    expect(H.TOTAL_UNITS).toBe(60);
  });

  it('has ONE rounding rule — unitPct is pctOf against the track, byte-identical to before', () => {
    for (let u = 0; u <= 60; u++) expect(H.unitPct(u)).toBe(((u / 60) * 100).toFixed(2));
    expect(H.unitPct(1.3043478260869565)).toBe(H.pctOf(1.3043478260869565, 60));
    expect(APP_JS).toMatch(/const unitPct = \(u\) => pctOf\(u, TOTAL_UNITS\);/);
  });

  it('lands every fixture date on the unit its comment claims', () => {
    expect(H.dayIndex('2026-08-17')).toBe(10);
    expect(H.dayIndex('2026-08-21')).toBe(14);
    expect(H.dayIndex('2026-08-10')).toBe(5);
    expect(H.dayIndex('2026-08-24')).toBe(15);
    expect(H.dayIndex('2026-08-31')).toBe(20);
    expect(H.dayIndex('2026-07-27')).toBeLessThan(0);
    expect(H.clampUnits(H.dayIndex('2026-07-27'))).toBe(0);
    expect(H.dayIndex('2026-08-07')).toBe(4);
    expect(H.dayIndex('2026-08-14')).toBe(9);
    expect(H.dayIndex('2026-10-12')).toBe(50);
    expect(H.dayIndex('2026-10-19')).toBe(55);
    expect(H.dayIndex('2026-11-02')).toBeGreaterThan(60);
    expect(H.dayIndex('2026-10-23')).toBe(59); // the LAST workday drawn
    expect(H.dayIndex('2026-10-26')).toBe(60); // one past the end
    expect(H.dayIndex('2026-08-19')).toBe(12);
    expect(H.dayIndex('2026-08-20')).toBe(13);
    expect(H.dayIndex('2026-09-07')).toBe(25);
    expect(H.dayIndex('2026-09-18')).toBe(34);
    expect(H.dayIndex('2026-08-28')).toBe(19);
  });

  it('addresses every unit in the window, which is what lets the sweep below be exhaustive', () => {
    for (let u = 0; u <= 60; u++) expect(H.dayIndex(isoAtUnit(u))).toBe(u);
  });
});

/* ====================================================================== *
 * SUITE 1 — THE POSITION INVARIANT. The reason this file exists.
 * ====================================================================== */

/**
 * WHY 0.02 PERCENTAGE POINTS, AND WHY THAT IS NOT A FUDGE.
 *
 * In reals the identity is EXACT, and the run's width W cancels out of it:
 *
 *   left + left'ᵢ · width / 100
 *     = 100·L/T + (100·(sLᵢ − L)/W) · (100·W/T) / 100
 *     = 100·L/T + 100·(sLᵢ − L)/T
 *     = 100·sLᵢ/T                       — today's `unitPct(sLᵢ)`
 *
 * and likewise width'ᵢ · width / 100 = 100·sWᵢ/T. Because W cancels, the
 * identity does not depend on the minimum-width extension, on which branch of
 * the left clamp fired, or on how many segments there are — which is exactly
 * why widening the invisible box is free of visual consequence.
 *
 * The tolerance is entirely the shipped `.toFixed(2)`, and THREE roundings feed
 * it, not two — the third is the one that sets the number:
 *
 *   1. the box's own `left`            ≤ 0.005 pp
 *   2. the segment's `left'`, scaled down by W/T ≤ 1, so ≤ 0.005 pp and much
 *      less when the run is short (at the 2.17% minimum it is ≈ 0.0001 pp)
 *   3. THE ORACLE'S OWN `unitPct`      ≤ 0.005 pp — the 1c571f1 value this is
 *      compared against was rounded too, and that side does not cancel
 *
 * so the analytic bound is ≈ 0.015–0.02 pp. Measured (INTEGRATE, batch 8, by
 * rendering both templates and reading the numbers back out of the HTML): the
 * worst across these fixtures is F2 at 0.0075 pp = 0.083px, not F6 — three
 * touching segments beat the single-column case because a wide W lets rounding
 * 2 through at full scale. F6 is 0.0063 pp = 0.069px, and the exhaustive
 * one-day sweep below tops out at the same 0.0063 pp. All of it is a tenth of a
 * device pixel. 0.02 pp ≈ 0.22px is the line; anything that actually MOVED a
 * bar blows through it instantly — dropping the re-base costs 4.58 pp, 600×.
 */
const TOLERANCE_PP = 0.02;

describe('re-basing moves no bar — the position invariant, against the frozen 1c571f1 oracle', () => {
  for (const [label, fixture] of DRAWN) {
    it(`${label}: every segment composes back to its 1c571f1 position and width`, () => {
      const [run] = H.phaseRun(fixture);
      const oracle = barsAt1c571f1(fixture);
      expect(run).toBeDefined();
      expect(run!.segs).toHaveLength(oracle.length);

      run!.segs.forEach((seg, i) => {
        const o = oracle[i]!;
        const abs = Number(run!.left) + (Number(seg.left) * Number(run!.width)) / 100;
        const absW = (Number(seg.width) * Number(run!.width)) / 100;
        expect(Math.abs(abs - Number(o.left)), `${label} seg ${i} left`).toBeLessThanOrEqual(TOLERANCE_PP);
        expect(Math.abs(absW - Number(o.width)), `${label} seg ${i} width`).toBeLessThanOrEqual(TOLERANCE_PP);
      });
    });

    it(`${label}: keeps the same segments, in the same order, with the same colour class and title`, () => {
      // the titles are the only user-visible TEXT inside the box; if they moved,
      // re-basing quietly re-ordered or dropped a phase
      const [run] = H.phaseRun(fixture);
      const oracle = barsAt1c571f1(fixture);
      expect(run!.segs.map((s) => s.cls)).toEqual(oracle.map((o) => o.cls));
      expect(run!.segs.map((s) => s.title)).toEqual(oracle.map((o) => o.title));
    });
  }

  it('closes no seam and opens none — three touching segments still tile the box edge to edge', () => {
    const [run] = H.phaseRun(F2);
    const segs = run!.segs;
    expect(segs).toHaveLength(3);
    expect(Number(segs[0]!.left)).toBe(0);
    for (let i = 1; i < segs.length; i++) {
      const prevEnd = Number(segs[i - 1]!.left) + Number(segs[i - 1]!.width);
      expect(Math.abs(Number(segs[i]!.left) - prevEnd)).toBeLessThanOrEqual(TOLERANCE_PP);
    }
    const last = segs[segs.length - 1]!;
    expect(Math.abs(Number(last.left) + Number(last.width) - 100)).toBeLessThanOrEqual(TOLERANCE_PP);
  });

  it('sweeps EVERY one-day run in the window, so F6 is one instance of a general statement', () => {
    for (let u = 0; u < 60; u++) {
      const fixture = row({ phase: 'render', startIso: isoAtUnit(u), endIso: isoAtUnit(u + 1) });
      const [run] = H.phaseRun(fixture);
      const oracle = barsAt1c571f1(fixture);
      expect(run, `unit ${u} drew no box`).toBeDefined();
      const L = Number(run!.left);
      const W = Number(run!.width);
      // the handle never hangs off either end of the track
      expect(L, `unit ${u} left`).toBeGreaterThanOrEqual(0);
      expect(L + W, `unit ${u} right edge`).toBeLessThanOrEqual(100 + TOLERANCE_PP);
      // and the visible segment is still exactly where it was
      const seg = run!.segs[0]!;
      const abs = L + (Number(seg.left) * W) / 100;
      expect(Math.abs(abs - Number(oracle[0]!.left)), `unit ${u} composed left`).toBeLessThanOrEqual(TOLERANCE_PP);
    }
  });
});

/* ====================================================================== *
 * SUITE 2 — the minimum grab width
 * ====================================================================== */

describe('the minimum grab width is ARITHMETIC, and the invisible part stays inside the track', () => {
  it('is 24px, expressed in the units the box is measured in', () => {
    expect(H.MIN_GRAB_PX).toBe(24);
    expect(H.WEEK_PX).toBe(92);
    expect(H.UNIT_PX).toBe(92 / 5); // 18.4 — one workday column, mirroring --gw
    expect(H.MIN_GRAB_UNITS).toBe(24 / (92 / 5));
    // 24px of a 12 × 92px = 1104px track. The percent↔px map is exact because
    // `--gw` is declared once and never re-tuned in a media query (pinned in
    // test/drag-hittest.test.ts), and `.gtrack` is content-sized at 12 columns.
    expect(Number(H.unitPct(H.MIN_GRAB_UNITS))).toBe(2.17);
    expect(Number(((24 / 1104) * 100).toFixed(2))).toBe(2.17);
  });

  it('F7 — a one-day run grows RIGHT: the box widens, its left edge does not move', () => {
    const [run] = H.phaseRun(F7);
    expect(Number(run!.width)).toBeGreaterThanOrEqual(2.17);
    expect(Number(H.unitPct(1))).toBeLessThan(2.17); // the run itself is 1.67% wide
    expect(run!.left).toBe(H.unitPct(12)); // anchored at the run's own left edge
  });

  it('F8 — a run already wider than the minimum is left exactly alone', () => {
    const [run] = H.phaseRun(F8);
    expect(run!.left).toBe(H.unitPct(25));
    expect(run!.width).toBe(H.unitPct(34 - 25));
    expect(run!.segs[0]!.left).toBe('0.00');
    expect(run!.segs[0]!.width).toBe('100.00');
  });

  it('F6 — a run in the FINAL column shifts LEFT rather than pushing the handle off the track', () => {
    const [run] = H.phaseRun(F6);
    expect(Number(run!.left) + Number(run!.width)).toBeCloseTo(100, 2);
    expect(Number(run!.left)).toBeLessThan(Number(H.unitPct(59))); // it moved left, by ~5.6px
    // …and the segment it contains is still drawn at 98.33% of the track
    const seg = run!.segs[0]!;
    const abs = Number(run!.left) + (Number(seg.left) * Number(run!.width)) / 100;
    expect(Math.abs(abs - Number(H.unitPct(59)))).toBeLessThanOrEqual(TOLERANCE_PP);
  });

  it('F3 — the left clamp never goes negative; a run clipped at 0 starts at 0', () => {
    const [run] = H.phaseRun(F3);
    expect(run!.left).toBe('0.00');
  });

  it('F4 — a run clipped at the right edge ends exactly on the track’s end', () => {
    const [run] = H.phaseRun(F4);
    expect(run!.left).toBe(H.unitPct(50));
    expect(Number(run!.left) + Number(run!.width)).toBeCloseTo(100, 2);
  });
});

/* ====================================================================== *
 * SUITE 3 — no visible phase ⇒ no box, no handle, no draggable
 * ====================================================================== */

describe('a row with nothing visible draws no box at all', () => {
  it('F5 — every segment clipped away, before the window and after it', () => {
    expect(barsAt1c571f1(F5A)).toEqual([]);
    expect(barsAt1c571f1(F5B)).toEqual([]);
    expect(H.phaseRun(F5A)).toEqual([]);
    expect(H.phaseRun(F5B)).toEqual([]);
  });

  it('F9 — phases missing, null, empty or not an array', () => {
    expect(H.phaseRun({})).toEqual([]);
    expect(H.phaseRun({ phases: null })).toEqual([]);
    expect(H.phaseRun({ phases: [] })).toEqual([]);
    expect(H.phaseRun({ phases: 'nope' })).toEqual([]);
  });

  it('returns the SAME empty-run shape ghostBar already uses, so the template needs no {{#if}}', () => {
    // `{{#each phaseRun(row) as run}}` over `[]` emits nothing — no box, no
    // handle, no `draggable`. That is why there is no conditional anywhere in
    // the geometry path, and why `.grun`'s directives are unconditional.
    expect(APP_JS).toMatch(/const ghostBar|app\.set\('ghostBar'/);
    expect(H.phaseRun(F5A)).toHaveLength(0);
  });
});

/* ====================================================================== *
 * SUITE 4 — the shape, and the promise that the template does no arithmetic
 * ====================================================================== */

describe('phaseRun hands the template finished strings, never numbers to multiply', () => {
  const ALL: { phases?: unknown }[] = [F1, F2, F3, F4, F5A, F5B, F6, F7, F8, F10, {}, { phases: [] }];

  it('returns an array of length 0 or 1 — never null, never a bare object', () => {
    for (const fixture of ALL) {
      const out = H.phaseRun(fixture);
      expect(Array.isArray(out)).toBe(true);
      expect(out.length).toBeLessThanOrEqual(1);
    }
  });

  it('formats every left and width to two decimals, as a STRING', () => {
    const twoDp = /^-?\d+\.\d{2}$/;
    for (const fixture of ALL) {
      for (const run of H.phaseRun(fixture)) {
        expect(run.left).toMatch(twoDp);
        expect(run.width).toMatch(twoDp);
        for (const seg of run.segs) {
          expect(seg.left).toMatch(twoDp);
          expect(seg.width).toMatch(twoDp);
          expect(typeof seg.cls).toBe('string');
          expect(typeof seg.title).toBe('string');
        }
      }
    }
  });

  it('is called exactly once in the template, and the template multiplies nothing', () => {
    expect([...TEMPLATE.matchAll(/phaseRun\(row\)/g)]).toHaveLength(1);
    const styleOf = (tag: string): string => /style="([^"]*)"/.exec(tag)?.[1] ?? '';
    const runTag = /<div class="grun"[^>]*>/.exec(TEMPLATE)![0];
    const segTag = /<div class="gseg \{\{b\.cls\}\}"[^>]*>/.exec(TEMPLATE)![0];
    for (const tag of [runTag, segTag]) {
      const style = styleOf(tag);
      expect(style).toMatch(/^left:\{\{\s*[\w.]+\s*\}\}%;width:\{\{\s*[\w.]+\s*\}\}%;?$/);
      expect(style).not.toContain('*');
      expect(style).not.toContain('+');
      expect(style).not.toContain('calc(');
    }
  });
});

/* ====================================================================== *
 * SUITE 5 — the box paints NOTHING. The minimum width must not be CSS.
 * ====================================================================== */

describe('the invisible extension stays invisible — the trap this batch had to avoid', () => {
  const RUN_RULE = cssRule('.gantt .grun');

  it('is a bare positioned box: absolute, full row height, hit-testable, neutral cursor', () => {
    expect(RUN_RULE).toContain('position: absolute');
    expect(RUN_RULE).toContain('top: 0');
    expect(RUN_RULE).toContain('bottom: 0');
    expect(RUN_RULE).toContain('pointer-events: auto');
    expect(RUN_RULE).toContain('cursor: default');
  });

  it('declares NO width minimum in CSS — that would visibly stretch every short bar', () => {
    // `.grun` is positioned in PERCENT and its `.gseg` children resolve their
    // own percentages against its RENDERED box. A `min-width: 24px` (or padding,
    // or a border) widens that rendered box after the arithmetic has run, so the
    // segments inside a short run would stretch on screen. The 24px minimum is
    // therefore done in units, inside the helper, where the re-basing divides by
    // the ALREADY-WIDENED width and the segments land unmoved.
    for (const banned of ['min-width', 'min-inline-size', 'padding', 'border', 'box-sizing']) {
      expect(RUN_RULE, `.gantt .grun must not declare ${banned}`).not.toContain(banned);
    }
  });

  it('paints nothing at all — only the .gseg children have colour', () => {
    for (const banned of ['background', 'outline', 'box-shadow', 'opacity', 'border-radius', 'transition', 'z-index']) {
      expect(RUN_RULE, `.gantt .grun must not declare ${banned}`).not.toContain(banned);
    }
    expect(GANTT_CSS).not.toMatch(/\.grun\s*::?(before|after)/);
    expect(GANTT_CSS).not.toMatch(/\.grun:hover/);
  });

  it('sets no height, so the segments keep centring against the same-height box they do today', () => {
    // `.gantt .gtrack .gseg` centres with `top: 50%; transform: translateY(-50%)`
    // against its nearest positioned ancestor. That ancestor is `.grun` now, so
    // `top: 0; bottom: 0` is what makes that rule byte-identical to before.
    expect(RUN_RULE).not.toMatch(/\bheight:/);
    expect(GANTT_CSS).toMatch(/\.gantt \.gtrack \.gseg \{[\s\S]*?top: 50%[\s\S]*?translateY\(-50%\)/);
    expect(GANTT_CSS).toMatch(/\.gantt \.gtrack \.gseg \{[\s\S]*?height: var\(--gbar-h\)/);
  });

  it('carries no title — an invisible extension must not pop a tooltip over empty track', () => {
    const runTag = /<div class="grun"[^>]*>/.exec(TEMPLATE)![0];
    expect(runTag).not.toContain('title=');
  });
});
