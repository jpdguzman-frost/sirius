/**
 * T020 — lib/forecast.legacy.ts (BR-1; AC-10 partial pending workbook rows).
 *
 * The executable spreadsheet mode was retired before the bundle shipped
 * (BRD v2.2), so the formula is reconstructed from BR-1. These tests pin the
 * formula mechanics; the FINAL golden set — identical dates for identical
 * inputs against real workbook rows — runs when JP's export lands
 * (TODO(workbook-export); gate T026).
 */

import { describe, expect, it } from 'vitest';
import { parseDate, toFriday, workday } from '../lib/calendar.ts';
import { LEGACY_GRID_SEED, legacyForecast } from '../lib/forecast.legacy.ts';
import { forecast } from '../lib/forecast.ts';
import { LEGACY_CYCLE } from '../lib/model.ts';

describe('BR-1 formula mechanics', () => {
  const card = { difficulty: 'Medium', startDate: '2026-08-03' };

  it('Sketch Delivery = WORKDAY(start, lead + design)', () => {
    const f = legacyForecast(card);
    expect(f.sketchDelivery.getTime()).toBe(
      workday(parseDate('2026-08-03'), LEGACY_GRID_SEED.lead + LEGACY_GRID_SEED.design.Medium!).getTime(),
    );
  });

  it('Sketch Approved = WORKDAY(sketch delivery, review)', () => {
    const f = legacyForecast(card);
    expect(f.sketchApproved.getTime()).toBe(
      workday(f.sketchDelivery, LEGACY_GRID_SEED.review.Medium!).getTime(),
    );
  });

  it('render begins the Friday of the sketch-approval week', () => {
    const f = legacyForecast(card);
    expect(f.renderDelivery.getTime()).toBe(
      workday(toFriday(f.sketchApproved), LEGACY_GRID_SEED.lead + LEGACY_GRID_SEED.design.Medium!).getTime(),
    );
  });

  it('Total Cycle Time = 1.28 × forecast review time + 2.96, constants verbatim', () => {
    expect(LEGACY_CYCLE).toEqual({ coef: 1.28, constant: 2.96 });
    const f = legacyForecast(card);
    expect(f.totalCycleTime).toBeCloseTo(1.28 * f.forecastedReviewTime + 2.96, 10);
  });

  it('BR-3: the legacy model overstates review waits 2.6–4.6× vs measured p70', () => {
    const measured = 4.8; // empirical review at 0.7 (Appendix A)
    expect(LEGACY_GRID_SEED.review.Medium! / measured).toBeCloseTo(2.6, 1);
    expect(LEGACY_GRID_SEED.review.Hard! / measured).toBeCloseTo(4.6, 1);
  });

  it('legacy dates land far later than the empirical model for the same card (why it was retired)', () => {
    const legacy = legacyForecast(card);
    const empirical = forecast({ ...card, currentList: 'Design', labels: [], confidence: '0.7' });
    expect(legacy.sketchApproved.getTime()).toBeGreaterThan(empirical.sketchApproved.getTime());
  });
});

describe('isolation (invariant 6)', () => {
  it('no runtime module outside test/ imports forecast.legacy', async () => {
    const { execSync } = await import('node:child_process');
    const hits = execSync(
      `grep -rl "forecast.legacy" --include="*.ts" --include="*.js" src worker frontend server.js || true`,
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();
    expect(hits).toBe('');
  });
});
