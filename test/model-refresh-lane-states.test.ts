/**
 * §7a consumer guard, model refresh (block 6, 2026-09-08; retargeted block 8,
 * 2026-09-10). The cycle-time model must not measure work Sirius does not
 * own: an EXCLUDED list is neither design dwell nor a completion.
 *
 * Under the retired keyword classifier `Working on Ops Work` matched neither
 * regex, classified ongoing, and its dwell went into the design percentiles;
 * `Ops Work Complete` matched `\bcomplete\b`, classified done, and ended a
 * card in the throughput counts.
 *
 * DESIGN CELLS (block 8): lists no longer feed them at all. The worker READS
 * Ares's model and maps `laneCells` 1:1 (`cellsFromAresModel`); nothing on our
 * side classifies a list into a cell, so the excluded-dwell regression has no
 * path back UNLESS the dwell derivation comes back. It was DELETED in the
 * 2026-09-10 review-fix round (X7), so the first block pins its absence at
 * the module surface — export `deriveSamples` or `computeModelGrid` from
 * `model-refresh.ts` again, or put the review-list regex back, and it fails —
 * plus that the worker imports the mapper, and that the mapper takes no list
 * input and yields no review cell.
 *
 * THROUGHPUT is still derived locally, so the completion half is unchanged:
 * `computeThroughput` counts `=== 'done'` and nothing else. What it pins is
 * the MAPPING — give `Ops Work Complete` the state `'done'` in `LIST_STATES`,
 * which is exactly what the retired keyword classifier did, and it fails.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as modelRefresh from '../src/services/model-refresh.ts';
import { cellsFromAresModel, computeThroughput } from '../src/services/model-refresh.ts';
import { classifyList } from '../src/services/status-rules.ts';
import type { AresCycleTimeModel } from '../src/services/ares.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const MODEL: AresCycleTimeModel = {
  rtProjectId: 837,
  generatedAt: '2026-07-01T16:00:03.000Z',
  window: { from: '2026-01-01', to: '2026-07-01' },
  floorMinutes: 15,
  overrideDays: 14,
  workingDayHours: 24,
  workTypeKeys: ['Ops: Board'],
  historyUnverified: 0,
  dropped: { considered: 10, sampled: 10, reasons: {} },
  cells: [{ workType: 'Ops: Board', difficulty: 'Medium', source: 'project', n: 20, meanWorkingDays: 0.7, p70: 0.6, p85: 1.0, p95: 1.2, meanCalendarHours: 16 }],
  laneCells: [{ laneKey: 'ops', difficulty: 'Medium', source: 'project', n: 20, meanWorkingDays: 0.7, p70: 0.6, p85: 1.0, p95: 1.2 }],
};

describe('design cells no longer come from list dwell (block 8)', () => {
  it('the premise still holds: ops lists are excluded, and a design list is not', () => {
    expect(classifyList('Working on Ops Work')).toBe('excluded');
    expect(classifyList('Working on Design')).toBe('ongoing');
  });

  it('the dwell derivation is gone: model-refresh exports no deriveSamples/computeModelGrid and carries no review-list regex (X7)', () => {
    expect(modelRefresh).not.toHaveProperty('deriveSamples');
    expect(modelRefresh).not.toHaveProperty('computeModelGrid');
    // rule 3: raw text, comments included — the classifier text must not survive even as prose
    const src = fs.readFileSync(path.join(HERE, '../src/services/model-refresh.ts'), 'utf8');
    expect(src).not.toMatch(/sent for client review/i);
    expect(typeof modelRefresh.percentile, 'percentile stays — computeThroughput uses it').toBe('function');
  });

  it('the worker imports the mapper from model-refresh — the Ares-read path is what is wired', () => {
    const src = fs.readFileSync(path.join(HERE, '../worker/refreshModel.ts'), 'utf8');
    const imported = /import\s*\{([^}]*)\}\s*from\s*'\.\.\/src\/services\/model-refresh\.ts'/.exec(src)?.[1] ?? '';
    expect(imported).toContain('cellsFromAresModel');
    expect(imported).not.toMatch(/\bderiveSamples\b|\bcomputeModelGrid\b/);
  });

  it('the mapper yields exactly the lane cells Ares pooled — one cell per lane × difficulty × confidence, no review row', () => {
    const { cells } = cellsFromAresModel(MODEL, 'p1');
    expect(cells.map((c) => `${c.difficulty}|${c.lane}|${c.metric}|${c.confidence}`).sort()).toEqual(
      ['Medium|ops|design|0.7', 'Medium|ops|design|0.85', 'Medium|ops|design|0.95', 'Medium|ops|design|Average'],
    );
    expect(cells.find((c) => c.confidence === '0.7')?.value).toBe(MODEL.laneCells![0]!.p70);
  });
});

describe('an excluded list is not a completion', () => {
  it('`Ops Work Complete` no longer ends a card — it used to, on the word `complete`', () => {
    expect(classifyList('Ops Work Complete')).toBe('excluded');
    const rows = computeThroughput(
      [{ trello_card_id: 'c1', to_list: 'Ops Work Complete', occurred_at: new Date('2026-07-06T10:00:00Z') }],
      [{ trello_card_id: 'c1', difficulty: 'Easy' }],
    );
    expect(rows).toEqual([]);
  });

  it('a real Done list still counts — the same fixture, one name apart', () => {
    const rows = computeThroughput(
      [{ trello_card_id: 'c1', to_list: 'Design Complete', occurred_at: new Date('2026-07-06T10:00:00Z') }],
      [{ trello_card_id: 'c1', difficulty: 'Easy' }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.weeks).toBe(1);
  });

  it('and the three Done lists no keyword rule reaches count too (§7a’s surviving trap)', () => {
    for (const list of ['Passed QA', '➜ Development: Pushed to Production', '➜ Development: Released']) {
      const rows = computeThroughput(
        [{ trello_card_id: 'c1', to_list: list, occurred_at: new Date('2026-07-06T10:00:00Z') }],
        [{ trello_card_id: 'c1', difficulty: 'Easy' }],
      );
      expect(rows, list).toHaveLength(1);
    }
  });
});
