/**
 * T035 — intake parser: the three §5.2 gotchas, row classification
 * (FR-3.4, FR-3.5), and AC-6 counting logic proven at scale on a synthetic
 * sheet shaped like the real one (495 ok / 495 reserved / 8 rejects).
 * The literal current-data run happens at staging with the live sheet.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapHeader,
  padRagged,
  parseCsv,
  parseDeadline,
  parseIntake,
  parseYear,
  serialToDate,
} from '../src/services/intake-parser.ts';

const HEADER = ['MC #', 'Deliverable', 'Type', 'Use Case', 'Type', 'Requestor', 'Deadline', 'Brief', 'In Frost Prod'];

describe('the three gotchas (§5.2)', () => {
  it('pads ragged rows before positional parsing', () => {
    const padded = padRagged([['a'], ['a', 'b', 'c']], 3);
    expect(padded[0]).toEqual(['a', '', '']);
    expect(padded[1]).toEqual(['a', 'b', 'c']);
  });

  it('converts serial dates from the 1899-12-30 epoch', () => {
    expect(serialToDate(45870)).toBe('2025-08-01');
    expect(parseDeadline('45870')).toBe('2025-08-01');
    expect(parseDeadline('2026-08-28')).toBe('2026-08-28');
    expect(parseDeadline('8/28/2026')).toBe('2026-08-28');
    expect(parseDeadline('soon™')).toBeNull();
  });

  it('disambiguates the two Type columns by position — the LATER one is the asset type (docs/architecture/agents-guide.md §5: col B card type, col L asset type)', () => {
    const map = mapHeader(HEADER);
    expect(map.asset_type).toBe(4); // NOT 2 — corrected 2026-08-12, phase 13
    expect(map.mc).toBe(0);
    expect(map.requestor).toBe(5);
  });
});

describe('row classification (FR-3.4, FR-3.5)', () => {
  const row = (over: Partial<Record<'mc' | 'name' | 'type' | 'use' | 'req' | 'dl' | 'brief' | 'prod', string>> = {}) => [
    over.mc ?? '',
    over.name ?? '',
    over.type ?? '',
    over.use ?? '',
    '',
    over.req ?? '',
    over.dl ?? '',
    over.brief ?? '',
    over.prod ?? '',
  ];

  it('classifies ok / reserved / rejected / skipped correctly', () => {
    const result = parseIntake([
      HEADER,
      row({ mc: 'MC-1', name: 'Thing', req: 'r@c.example', brief: 'b', dl: '2026-08-28', prod: 'TRUE' }),
      row({ mc: 'MC-2' }), // reserved: pre-allocated, silently counted
      row({ mc: 'MC-3', name: 'No requestor', brief: 'b' }), // reject
      row({ name: 'No MC at all', req: 'r', brief: 'b' }), // reject: missing MC
      row(), // fully blank: skipped
      row({ mc: 'MC-1', name: 'Duplicate', req: 'r', brief: 'b' }), // reject: duplicate
    ]);
    expect(result.ok.length).toBe(1);
    expect(result.reserved).toBe(1);
    expect(result.rejects.length).toBe(3);
    expect(result.skipped).toBe(1);
    expect(result.rejects[0]?.reason).toMatch(/missing Primary Requestor/);
    expect(result.rejects[1]?.reason).toMatch(/missing MC number/);
    expect(result.rejects[2]?.reason).toMatch(/duplicate MC-1/);
    expect(result.ok[0]).toMatchObject({ mc_number: 'MC-1', in_frost_prod: true, deadline: '2026-08-28' });
  });

  it('AC-6 at scale: a 998-row synthetic sheet yields exactly 495 / 495 / 8', () => {
    const rows: string[][] = [HEADER];
    for (let i = 1; i <= 495; i++)
      rows.push(row({ mc: `MC-${i}`, name: `Deliverable ${i}`, req: 'r@c.example', brief: 'brief', dl: '2026-09-04' }));
    for (let i = 496; i <= 990; i++) rows.push(row({ mc: `MC-${i}` })); // reserved block
    for (let i = 0; i < 8; i++) rows.push(row({ mc: `MC-${991 + i}`, name: `Broken ${i}` })); // no requestor/brief
    const result = parseIntake(rows);
    expect(result.ok.length).toBe(495);
    expect(result.reserved).toBe(495);
    expect(result.rejects.length).toBe(8);
  });
});

describe('year / month columns (optional — sheet still deferred)', () => {
  const YM_HEADER = [...HEADER, 'Year', 'Month'];
  const ymRow = (mc: string, year: string, month: string) => [
    mc, `Deliverable ${mc}`, 'Static', 'Campaign', 'Web', 'r@c.example', '2026-08-28', 'brief', 'TRUE', year, month,
  ];

  it('parses the year cell, spreadsheet float or plain, and rejects the rest', () => {
    expect(parseYear('2026.0')).toBe(2026);
    expect(parseYear('2026')).toBe(2026);
    expect(parseYear(' 2026 ')).toBe(2026);
    expect(parseYear('')).toBeNull();
    expect(parseYear('   ')).toBeNull();
    expect(parseYear('soon™')).toBeNull();
  });

  it('carries year and month off the sheet, month verbatim', () => {
    const result = parseIntake([
      YM_HEADER,
      ymRow('MC-1', '2026.0', 'January'),
      ymRow('MC-2', '2026', ' February '),
      ymRow('MC-3', '', ''),
      ymRow('MC-4', 'whenever', 'Q3'),
    ]);
    expect(result.ok.length).toBe(4);
    expect(result.ok.map((r) => r.year)).toEqual([2026, 2026, null, null]);
    expect(result.ok.map((r) => r.month)).toEqual(['January', 'February', null, 'Q3']);
  });

  it('rows without the columns still parse — year/month are optional, never a reject', () => {
    const result = parseIntake([
      HEADER,
      ['MC-9', 'No year column', 'Static', 'Campaign', 'Web', 'r@c.example', '2026-08-28', 'brief', 'TRUE'],
    ]);
    expect(result.rejects.length).toBe(0);
    expect(result.ok[0]).toMatchObject({ mc_number: 'MC-9', year: null, month: null });
  });
});

describe('fixture CSV (quickstart local path)', () => {
  it('parses scripts/fixtures/intake.csv with expected counts', () => {
    const text = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'fixtures', 'intake.csv'), 'utf8');
    const result = parseIntake(parseCsv(text));
    expect(result.ok.length).toBe(3); // MC-655, MC-701, MC-702
    expect(result.reserved).toBe(1); // MC-9000
    expect(result.rejects.length).toBe(1); // the deliberately unparseable row
    expect(result.ok.map((r) => r.mc_number)).toEqual(['MC-655', 'MC-701', 'MC-702']);
  });
});

/*
 * UNIT (block 5, PLAN D1) — the screen says Unit, storage and wire keep
 * `use_case`; the parser is where the sheet's own header name lives. The
 * sheet is being renamed Business Unit, so BOTH headers must map, and a
 * multi-value cell is raised as a data problem — never split by us.
 */
describe('UNIT column (D1): header alias + multi-value warning', () => {
  const BU_HEADER = HEADER.map((h) => (h === 'Use Case' ? 'Business Unit' : h));
  const unitRow = (mc: string, unit: string) => [
    mc, `Deliverable ${mc}`, 'Static', unit, 'Web', 'r@c.example', '2026-08-28', 'brief', 'TRUE',
  ];

  it('maps Business Unit onto use_case — and Use Case, the older header, still maps', () => {
    expect(mapHeader(BU_HEADER).use_case).toBe(3);
    expect(mapHeader(HEADER).use_case).toBe(3);
    expect(parseIntake([BU_HEADER, unitRow('MC-1', 'Campaign')]).ok[0]?.use_case).toBe('Campaign');
    expect(parseIntake([HEADER, unitRow('MC-1', 'Campaign')]).ok[0]?.use_case).toBe('Campaign');
  });

  /*
   * A tab caught mid-rename carries BOTH headers — the ruled name added
   * beside the stale one, on either side of it. The ruled name wins wherever
   * it sits: if position decided, a rename would silently keep reading the
   * stale column on half the tabs. (Contrast the two `Type` columns, where
   * BOTH headers are legitimately named `Type` and position is the only
   * thing that CAN distinguish them.)
   */
  it('a tab carrying BOTH headers takes use_case from Business Unit — the ruled name wins whichever column comes first', () => {
    const staleFirst = ['MC #', 'Deliverable', 'Use Case', 'Business Unit', 'Requestor', 'Brief'];
    const ruledFirst = ['MC #', 'Deliverable', 'Business Unit', 'Use Case', 'Requestor', 'Brief'];
    expect(mapHeader(staleFirst).use_case).toBe(3);
    expect(mapHeader(ruledFirst).use_case).toBe(2);
    // and the VALUE follows the ruled column, neither the leftmost nor the rightmost
    expect(parseIntake([staleFirst, ['MC-1', 'Thing', 'Stale', 'Campaign', 'r@c.example', 'brief']]).ok[0]?.use_case)
      .toBe('Campaign');
    expect(parseIntake([ruledFirst, ['MC-1', 'Thing', 'Campaign', 'Stale', 'r@c.example', 'brief']]).ok[0]?.use_case)
      .toBe('Campaign');
  });

  it('only the UNIT column is ruled by name — every other duplicated alias keeps first-wins', () => {
    const map = mapHeader(['MC #', 'Id', 'Deliverable', 'Deliverable Name', 'Brief', 'Description']);
    expect(map.mc).toBe(0);
    expect(map.name).toBe(2);
    expect(map.brief).toBe(4);
  });

  it('a comma-separated unit is stored WHOLE and raised as exactly one warning', () => {
    const result = parseIntake([BU_HEADER, unitRow('MC-1', ' Campaign, Product '), unitRow('MC-2', 'Campaign')]);
    expect(result.ok.map((r) => r.use_case)).toEqual(['Campaign, Product', 'Campaign']); // never split, only outer-trimmed
    expect(result.warnings).toEqual([{ sheet_row: 2, field: 'use_case', reason: 'multi-value' }]);
  });

  it('rejected, duplicate and skipped rows never warn', () => {
    const result = parseIntake([
      BU_HEADER,
      ['MC-1', 'No brief', 'Static', 'Campaign, Product', 'Web', 'r@c.example', '2026-08-28', '', 'TRUE'], // reject
      unitRow('MC-2', 'Campaign, Product'), // ok → the only warning
      unitRow('MC-2', 'Campaign, Product'), // duplicate MC → reject
      ['', '', '', 'Campaign, Product', '', '', '', '', ''], // blank id+name → skipped
    ]);
    expect(result.rejects.map((r) => r.sheet_row)).toEqual([2, 4]);
    expect(result.skipped).toBe(1);
    expect(result.warnings).toEqual([{ sheet_row: 3, field: 'use_case', reason: 'multi-value' }]);
  });

  it('an empty sheet still answers the full shape', () => {
    expect(parseIntake([])).toEqual({ ok: [], rejects: [], warnings: [], reserved: 0, skipped: 0 });
  });
});
