/**
 * Calendar sync (amendment 2026-08-15) — ARES working-day calendar is
 * canonical. Derivation, cross-check, merge policy, persistence round-trip,
 * and the 005 migration normalizing Sunday slotted_week values.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import {
  CALENDAR_COLLECTION,
  CALENDAR_DOC_ID,
  activeWindow,
  crossCheck,
  deriveNonWorkingDays,
  loadCalendar,
  mergeWithSeed,
  syncCalendarFromAres,
  weekdaysBetween,
} from '../src/services/calendar-sync.ts';
import { HOLIDAYS, getHolidays, setHolidays } from '../lib/calendar.ts';
import { MIGRATIONS } from '../scripts/migrate/migrations.ts';
import { AuditLog, Deliverable, Project } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});
afterEach(() => setHolidays(HOLIDAYS));

describe('derivation (pure)', () => {
  it('weekdaysBetween emits Mon–Fri only, inclusive bounds, TZ-proof', () => {
    const days = weekdaysBetween('2026-08-21', '2026-08-31'); // Fri .. Mon
    expect(days).toEqual([
      '2026-08-21',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-31',
    ]);
  });

  it('deriveNonWorkingDays = weekdays missing from the ARES daily columns (live shape 2026-08-15: Aug 25 absent)', () => {
    const cols = ['2026-08-24', '2026-08-26', '2026-08-27', '2026-08-28'];
    expect(deriveNonWorkingDays(cols, '2026-08-24', '2026-08-28')).toEqual(['2026-08-25']);
  });

  it('crossCheck flags weeks whose workingDays count disagrees, skipping window-truncated weeks', () => {
    const derived = ['2026-08-25'];
    const perWeek = [
      { monday: '2026-08-17', workingDays: 5 },
      { monday: '2026-08-24', workingDays: 4 }, // agrees: 5 − 1 derived
      { monday: '2026-08-31', workingDays: 4 }, // disagrees: nothing derived that week
      { monday: '2026-08-10', workingDays: 3 }, // outside the window — ignored
    ];
    expect(crossCheck(derived, perWeek, '2026-08-17', '2026-09-04')).toEqual(['2026-08-31']);
  });

  it('mergeWithSeed: ARES wins inside the window, the static seed survives outside it', () => {
    const merged = mergeWithSeed({
      dates: ['2026-08-25'],
      window: { from: '2026-08-01', to: '2026-09-30' },
    });
    expect(merged).toContain('2026-08-25'); // ARES-derived
    expect(merged).not.toContain('2026-08-31'); // seed entry INSIDE window — ARES says working
    expect(merged).toContain('2026-01-01'); // seed entry outside window survives
    expect(merged).toContain('2026-12-25');
  });

  it('activeWindow spans 8 weeks back to 40 weeks forward', () => {
    expect(activeWindow('2026-08-15')).toEqual({ from: '2026-06-20', to: '2027-05-22' });
  });
});

describe('sync + load round-trip (isolated db)', () => {
  const fakeAres = (cols: string[] | null, perWeek: Array<{ monday: string; workingDays: number }> | null) => ({
    workingDayColumns: async () => cols,
    workingDaysPerWeek: async () => perWeek,
  });

  it('syncCalendarFromAres persists the doc and activates the merged set', async () => {
    const cols = weekdaysBetween('2026-06-20', '2027-05-22').filter((d) => d !== '2026-08-25');
    const res = await syncCalendarFromAres(
      mongoose.connection,
      fakeAres(cols, [{ monday: '2026-08-24', workingDays: 4 }]),
      '2026-08-15',
    );
    expect(res).toEqual({ dates: ['2026-08-25'], mismatches: [] });
    const doc = await mongoose.connection
      .db!.collection(CALENDAR_COLLECTION)
      .findOne({ _id: CALENDAR_DOC_ID as never });
    expect(doc?.dates).toEqual(['2026-08-25']);
    // Active set: ARES canonical inside window (Aug 31 seed dropped), seed kept outside.
    expect(getHolidays()).toContain('2026-08-25');
    expect(getHolidays()).not.toContain('2026-08-31');
  });

  it('unavailable ARES surface keeps the previous calendar and writes nothing', async () => {
    const res = await syncCalendarFromAres(mongoose.connection, fakeAres(null, null), '2026-08-15');
    expect(res).toBeNull();
    const doc = await mongoose.connection
      .db!.collection(CALENDAR_COLLECTION)
      .findOne({ _id: CALENDAR_DOC_ID as never });
    expect(doc).toBeNull();
    expect(getHolidays()).toEqual([...HOLIDAYS].sort());
  });

  it('loadCalendar seeds a fresh process from the stored doc; false when absent', async () => {
    expect(await loadCalendar(mongoose.connection)).toBe(false);
    await mongoose.connection.db!.collection(CALENDAR_COLLECTION).insertOne({
      _id: CALENDAR_DOC_ID as never,
      dates: ['2026-09-07'],
      window: { from: '2026-09-01', to: '2026-09-30' },
      source: 'test',
      synced_at: new Date(),
      mismatches: [],
    });
    expect(await loadCalendar(mongoose.connection)).toBe(true);
    expect(getHolidays()).toContain('2026-09-07');
    expect(getHolidays()).toContain('2026-01-01'); // outside-window seed kept
  });
});

describe('migration 005 — Monday-normalized slotted_week', () => {
  it('rewrites non-Monday values to the Monday of their week and audits each change', async () => {
    const p = await Project.create({
      code: 'rt-mig',
      name: 'Mig',
      trello_board_id: 'migB',
      weekly_capacity: 100,
    });
    const mk = (n: number, wk: string | null) =>
      Deliverable.create({
        project_id: p._id,
        trello_card_id: `mig-${n}`,
        mc_number: `MC-9${n}`,
        display_id: `MC-9${n}`,
        name: `row ${n}`,
        slotted_week: wk,
      });
    await mk(1, '2026-08-09'); // Sunday → 2026-08-03
    await mk(2, '2026-08-10'); // Monday — untouched
    await mk(3, '2026-08-12'); // Wednesday → 2026-08-10
    await mk(4, null); // unscheduled — untouched

    // startTestDb already ran (and recorded) every migration on the fresh
    // db, so invoke 005's body directly against the seeded rows.
    const m005 = MIGRATIONS.find((m) => m.id === '005-monday-slotted-week')!;
    await m005.up(mongoose.connection);

    const rows = await Deliverable.find({ project_id: p._id }).sort({ mc_number: 1 }).lean();
    expect(rows.map((r) => r.slotted_week)).toEqual(['2026-08-03', '2026-08-10', '2026-08-10', null]);
    const audits = await AuditLog.find({ action: 'schedule.normalize' }).lean();
    expect(audits).toHaveLength(2);
    const sunday = audits.find((a) => (a.before as { slotted_week?: string }).slotted_week === '2026-08-09');
    expect(sunday?.after).toEqual({ slotted_week: '2026-08-03' });
    expect(String(sunday?.project_id)).toBe(String(p._id));
  });
});
