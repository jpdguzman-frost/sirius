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

  it('disambiguates the two Type columns by position — the LATER one is the asset type (AGENTS.md §5: col B card type, col L asset type)', () => {
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
