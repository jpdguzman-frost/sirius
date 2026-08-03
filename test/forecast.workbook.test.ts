/**
 * T017/T020 — workbook cross-validation (AC-10 evidence).
 *
 * Source: JP's export of the real Delivery Forecast sheet
 * (docs/forecasting-block.csv — gitignored: client roadmap data, BRD §9).
 * test/golden/workbook-rows.json holds 40 sanitized formula-driven rows
 * (MC number, dates, SLAs — no titles, no briefs), selected where the span
 * crosses no 2025 PH holiday so the arithmetic is pure WORKDAY.
 *
 * What this proves: the ported workday() reproduces the workbook's own
 * WORKDAY chain — sketchApproved = WORKDAY(sketchDelivery, slaSketch) — on
 * real sheet-computed dates, row for row.
 *
 * Known and accepted: the export uses the OLD cycle model (per JP), whose
 * render-delivery rule predates BR-1's Friday rule; hand-edited cells in the
 * sheet land on weekends (impossible WORKDAY outputs) and were excluded.
 * The current model's arithmetic authority remains BR-1 + the validated
 * prototype (see forecast.legacy.test.ts and extraction-notes.md).
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { workday } from '../lib/calendar.ts';

interface WorkbookRow {
  mc: string;
  start: string;
  slaSketch: number;
  slaRender: number | null;
  sketchDelivery: string;
  sketchApproved: string;
  renderApproved: string | null;
  confidence: string;
}

const rows: WorkbookRow[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'golden', 'workbook-rows.json'), 'utf8'),
);

/** Local calendar date of a Date — TZ-stable comparison key. */
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('workbook golden rows (real Delivery Forecast export, 2025)', () => {
  it('has a meaningful sample', () => {
    expect(rows.length).toBeGreaterThanOrEqual(30);
  });

  it('sketchApproved = WORKDAY(sketchDelivery, slaSketch) on every formula-driven row', () => {
    for (const row of rows) {
      const ours = workday(new Date(row.sketchDelivery + 'T00:00:00'), row.slaSketch);
      expect(localDate(ours), `${row.mc} (${row.sketchDelivery} + ${row.slaSketch})`).toBe(
        row.sketchApproved,
      );
    }
  });

  it('renderApproved = WORKDAY(sketchApproved, slaRender) where the sheet computed it', () => {
    let checked = 0;
    for (const row of rows) {
      if (row.renderApproved == null || row.slaRender == null) continue;
      const ours = workday(new Date(row.sketchApproved + 'T00:00:00'), row.slaRender);
      if (localDate(ours) === row.renderApproved) checked++;
    }
    // hand-edited render cells exist in the sheet; require a strong majority
    const candidates = rows.filter((r) => r.renderApproved != null && r.slaRender != null).length;
    expect(checked / candidates).toBeGreaterThan(0.85);
  });

  it('the sheet defaults to 70% confidence, matching the prototype default', () => {
    const seventies = rows.filter((r) => r.confidence === '70%').length;
    expect(seventies / rows.length).toBeGreaterThan(0.9);
  });
});
