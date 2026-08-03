/**
 * T010 — seed fixtures sanity: the shapes the ACs rely on exist
 * (two projects, shared-board labelling, multi-deliverable MC group,
 * work cards attached to the group, sprint gap).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb } from './helpers/db.ts';
import { seedDatabase } from '../scripts/seed.ts';
import { Project, Sprint, Deliverable, WorkCard } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
  await seedDatabase();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

describe('seed fixtures', () => {
  it('seeds two projects, one with a disambiguating board label (AC-4, AC-5 basis)', async () => {
    expect(await Project.countDocuments()).toBe(2);
    const shared = await Project.findOne({ code: 'rt-900' });
    expect(shared?.trello_label).toBe('Acme');
  });

  it('MC-655 is a multi-deliverable group; its work cards attach to the group (invariants 3, 4)', async () => {
    const project = await Project.findOne({ code: 'rt-837' }).orFail();
    const group = await Deliverable.find({ project_id: project._id, mc_number: 'MC-655' });
    expect(group.length).toBe(3);
    expect(group.map((d) => d.display_id).sort()).toEqual(['MC-655.1', 'MC-655.2', 'MC-655.3']);

    const tasks = await WorkCard.find({ project_id: project._id, mc_number: 'MC-655' });
    expect(tasks.length).toBe(2);
  });

  it('sprints leave a gap (BR-5: gaps are legal and surfaced)', async () => {
    const project = await Project.findOne({ code: 'rt-837' }).orFail();
    const sprints = await Sprint.find({ project_id: project._id }).sort({ position: 1 });
    expect(sprints.length).toBe(2);
    expect(sprints[0]?.ends_on).toBe('2026-07-31');
    expect(sprints[1]?.starts_on).toBe('2026-08-10'); // week of 3 Aug is outside any sprint
  });

  it('refuses to seed production (invariant 16)', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(seedDatabase()).rejects.toThrow(/refusing to seed production/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
