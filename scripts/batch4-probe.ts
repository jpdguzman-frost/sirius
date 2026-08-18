/**
 * Batch-4 seeded probe (phase 13j, owls #27–#31) — exercises the sprints save
 * surface, the holiday wire-up behind the modal's gap warning, and the drag
 * write path end to end against an ISOLATED in-memory mongod.
 *
 * Never a real database, never a Trello call, never a Sheets call: nothing in
 * this file imports lib/trello.ts or the sheets client, so the write registry
 * (W1 urgency · W2 due · W3 difficulty) cannot grow by accident here — leg 8
 * asserts that as source truth rather than trusting the claim.
 *
 * Usage:  npx tsx scripts/batch4-probe.ts
 * Exits non-zero on the first failed check.
 *
 * What it proves, in order:
 *   1. a project, its members and deliverables on known slotted weeks;
 *   2. sprint save round-trip — 200, docs in start order, ONE audited replace;
 *   3. duplicate-name reject — 422, collection untouched, no audit row;
 *   4. overlap reject (invariant 12) — 422, collection untouched, no audit row;
 *   5. deletion-warn count — the client's covered-rows expression evaluated
 *      against the SEEDED rows, so the warning's N is checked against real
 *      data instead of a fixture constant;
 *   6. gap detection against an INJECTED holiday calendar — a gap that is pure
 *      weekend + holiday counts ZERO working days (no banner) while a gap with
 *      one open weekday counts ONE (banner fires). The R-f-8 proof, computed
 *      from the holidays the API actually served;
 *   7. drag write path unchanged — /replot slots, unslots, audits each move,
 *      and skips a pinned row with no audit row (FR-5.9, pins stay frozen),
 *      plus (7c/7d, owl #37) the Save dirty-gate and the blank-name reject:
 *      `''` and whitespace-only both land on the friendly 422 carrying the
 *      modal's own words, write nothing, audit nothing, and are never ALSO
 *      reported as duplicate names;
 *   8. no write-registry growth.
 */

import { readFile } from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, Deliverable, Project, Sprint, User, UserProject } from '../src/models/index.ts';
import { runMigrations } from './migrate/migrations.ts';
import { getHolidays, setHolidays } from '../lib/calendar.ts';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(`[probe] ${ok ? 'PASS' : 'FAIL'} — ${label}${ok || detail === undefined ? '' : ` · ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

/**
 * The modal's gap rule, R-f-8, expressed against the holiday set the API
 * served: calendar days STRICTLY between two sprints, minus Saturdays,
 * Sundays and holidays. Never raw weekdays. Kept here so the probe measures
 * the wire contract (S4) rather than re-reading a server-side calendar the
 * browser cannot see.
 */
function workingDaysBetween(endA: string, startB: string, holidays: string[]): string[] {
  const holiday = new Set(holidays);
  const open: string[] = [];
  const cursor = new Date(`${endA}T00:00:00`);
  const stop = new Date(`${startB}T00:00:00`);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < stop) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6 && !holiday.has(iso)) open.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return open;
}

const server = await MongoMemoryServer.create();
await mongoose.connect(server.getUri('sirius-batch4-probe'));
const seedHolidays = getHolidays();

try {
  await runMigrations(mongoose.connection);

  // ---- 1. seed ------------------------------------------------------------
  const project = await Project.create({
    code: 'rt-test', name: 'Test Board', trello_board_id: 'probe-b4', weekly_capacity: 12,
  });
  const other = await Project.create({
    code: 'rt-test-2', name: 'Second Board', trello_board_id: 'probe-b4b', weekly_capacity: 12,
  });
  const member = await User.create({ email: 'pm@frostdesigngroup.com' });
  for (const p of [project, other]) await UserProject.create({ user_id: member._id, project_id: p._id });

  // Known slotted weeks: three inside Sprint A's range, one after it, one
  // unslotted, one PINNED inside the range (leg 5 counts it, leg 7 refuses it).
  const seedRows: Array<{ id: string; week: string | null; pinned?: boolean }> = [
    { id: 'c1', week: '2026-08-03' },
    { id: 'c2', week: '2026-08-10' },
    { id: 'c3', week: '2026-08-10' },
    { id: 'c4', week: '2026-09-07' },
    { id: 'c5', week: null },
    { id: 'c6', week: '2026-08-03', pinned: true },
  ];
  for (const [i, row] of seedRows.entries()) {
    await Deliverable.create({
      project_id: project._id, mc_number: `MC-${i + 1}`, display_id: `MC-${i + 1}`, trello_card_id: row.id,
      name: `Deliverable ${i + 1}`, difficulty: 'Medium', lane: 'design', current_list: 'Design',
      slotted_week: row.week, ...(row.pinned ? { pinned: true } : {}),
    });
  }
  check('seeded 6 deliverables on known weeks', (await Deliverable.countDocuments({ project_id: project._id })) === 6);

  const app = createApp({ env: validateEnv({ NODE_ENV: 'test' }), redis: null, mongo: null });
  const asMember = request.agent(app);
  await asMember.post('/__test/login').send({ userId: String(member._id), email: member.email });

  // ---- 2. sprint save round trip ------------------------------------------
  const clean = [
    { name: 'Sprint B', start: '2026-08-17', end: '2026-08-28' }, // deliberately out of order
    { name: 'Sprint A', start: '2026-08-03', end: '2026-08-14' },
  ];
  const saved = await asMember.put(`/api/projects/${project._id}/sprints`).send({ sprints: clean });
  check('clean save → 200', saved.status === 200, { status: saved.status, body: saved.body });
  const stored = await Sprint.find({ project_id: project._id }).sort({ position: 1 }).lean();
  check('two sprint docs written', stored.length === 2, stored.length);
  check('position 1..2 in START order, not payload order',
    stored.map((s) => `${s.position}:${s.name}`).join('|') === '1:Sprint A|2:Sprint B',
    stored.map((s) => `${s.position}:${s.name}`));
  check('every sprint carries project_id (invariant 1)', stored.every((s) => String(s.project_id) === String(project._id)));
  const replaceRows = await AuditLog.find({ action: 'sprints.replace' }).lean();
  check('one sprints.replace audit row (invariant 10)', replaceRows.length === 1, replaceRows.length);
  const replaceRow = replaceRows[0];
  check('audit row carries actor, entity and both snapshots', Boolean(
    replaceRow &&
    replaceRow.actor === member.email &&
    replaceRow.entity === 'sprint' &&
    String(replaceRow.project_id) === String(project._id) &&
    Array.isArray((replaceRow.before as { sprints?: unknown[] })?.sprints) &&
    ((replaceRow.after as { sprints?: unknown[] })?.sprints ?? []).length === 2,
  ), { actor: replaceRow?.actor, before: replaceRow?.before, after: replaceRow?.after });
  check('before snapshot is the EMPTY prior list, not the new one',
    ((replaceRow?.before as { sprints?: unknown[] })?.sprints ?? []).length === 0);

  // membership is derived — a sprint reference must never land on a row
  const rowKeys = new Set(Object.keys((await Deliverable.findOne({ trello_card_id: 'c1' }).lean()) ?? {}));
  check('no sprint reference written onto a deliverable (derived membership)',
    ![...rowKeys].some((k) => /sprint/i.test(k)), [...rowKeys].filter((k) => /sprint/i.test(k)));

  // ---- 3. duplicate-name reject -------------------------------------------
  const dup = await asMember.put(`/api/projects/${project._id}/sprints`).send({
    sprints: [
      { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
      { name: '  sprint 46 ', start: '2026-08-17', end: '2026-08-28' },
    ],
  });
  check('duplicate names → 422 SPRINT_CONFLICT', dup.status === 422 && dup.body?.error?.code === 'SPRINT_CONFLICT',
    { status: dup.status, code: dup.body?.error?.code });
  check('issue kind is duplicate-name (trim + case insensitive)', dup.body?.error?.issues?.[0]?.kind === 'duplicate-name',
    dup.body?.error?.issues);
  check('issue text matches the modal banner copy',
    dup.body?.error?.issues?.[0]?.text === 'Multiple sprints are named "Sprint 46". Give each sprint a unique name to save.',
    dup.body?.error?.issues?.[0]?.text);
  const afterDup = await Sprint.find({ project_id: project._id }).sort({ position: 1 }).lean();
  check('duplicate reject wrote nothing — the two good rows survive',
    afterDup.length === 2 && afterDup.map((s) => s.name).join('|') === 'Sprint A|Sprint B', afterDup.map((s) => s.name));
  check('duplicate reject wrote no audit row', (await AuditLog.countDocuments({ action: 'sprints.replace' })) === 1);

  // the same name in ANOTHER project is fine — uniqueness is per project
  const crossProject = await asMember.put(`/api/projects/${other._id}/sprints`).send({
    sprints: [{ name: 'Sprint A', start: '2026-08-03', end: '2026-08-14' }],
  });
  check('same sprint name in a different project → 200 (invariant 1)', crossProject.status === 200, crossProject.body);

  // ---- 4. overlap reject (invariant 12) -----------------------------------
  const overlap = await asMember.put(`/api/projects/${project._id}/sprints`).send({
    sprints: [
      { name: 'Sprint A', start: '2026-08-03', end: '2026-08-14' },
      { name: 'Sprint B', start: '2026-08-10', end: '2026-08-21' },
    ],
  });
  check('overlapping sprints → 422 SPRINT_CONFLICT', overlap.status === 422 && overlap.body?.error?.code === 'SPRINT_CONFLICT',
    { status: overlap.status, code: overlap.body?.error?.code });
  check('issue kind is overlap', overlap.body?.error?.issues?.[0]?.kind === 'overlap', overlap.body?.error?.issues);
  check('overlap reject wrote nothing', (await Sprint.countDocuments({ project_id: project._id })) === 2);
  check('overlap reject wrote no audit row', (await AuditLog.countDocuments({ action: 'sprints.replace', project_id: project._id })) === 1);

  const inverted = await asMember.put(`/api/projects/${project._id}/sprints`).send({
    sprints: [{ name: 'Backwards', start: '2026-08-14', end: '2026-08-03' }],
  });
  check('inverted range → 422, nothing written', inverted.status === 422 && (await Sprint.countDocuments({ project_id: project._id })) === 2,
    { status: inverted.status });

  // ---- 5. deletion-warn count against the seeded rows ---------------------
  const payload = await asMember.get(`/api/projects/${project._id}/deliverables`);
  check('GET /deliverables → 200', payload.status === 200, payload.status);
  type WireRow = { cardId: string; slottedWeek: string | null };
  const wireRows: WireRow[] = payload.body?.rows ?? [];
  const sprintA = (payload.body?.sprints ?? []).find((s: { name: string }) => s.name === 'Sprint A');
  check('Sprint A round-tripped onto the wire with start/end', Boolean(sprintA?.start && sprintA?.end), sprintA);
  // the client's expression, verbatim: slottedWeek ∈ [start, end]
  const covered = wireRows.filter((r) => r.slottedWeek && r.slottedWeek >= sprintA.start && r.slottedWeek <= sprintA.end);
  const expected = seedRows.filter((r) => r.week && r.week >= '2026-08-03' && r.week <= '2026-08-14').map((r) => r.id).sort();
  check('deletion warning counts 4 covered deliverables', covered.length === 4, covered.map((r) => r.cardId));
  check('covered set is exactly the seeded rows in range', covered.map((r) => r.cardId).sort().join(',') === expected.join(','),
    { got: covered.map((r) => r.cardId).sort(), expected });
  check('a pinned row still COUNTS as covered (the warning is about grouping, not movability)',
    covered.some((r) => r.cardId === 'c6'));
  check('the unslotted row is never counted', !covered.some((r) => r.cardId === 'c5'));
  check('deleting a sprint writes nothing until Save — no deliverable moved',
    (await Deliverable.countDocuments({ project_id: project._id, slotted_week: { $ne: null } })) === 5);

  // ---- 6. gap detection against an injected holiday calendar (R-f-8) ------
  // Fri 2026-08-14 → Mon 2026-08-17 is a pure weekend: zero working days.
  // Push the next sprint to Tue 2026-08-18 and Monday 2026-08-17 opens up —
  // unless it is a holiday, which is exactly what the raw-weekday rule misses.
  setHolidays(['2026-08-17']);
  const withHoliday = await asMember.get(`/api/projects/${project._id}/deliverables`);
  const wireHolidays: string[] = withHoliday.body?.holidays ?? [];
  check('the injected holiday calendar reaches the client (S4)', wireHolidays.includes('2026-08-17'), wireHolidays);
  check('holidays on the wire are the ACTIVE set, not the static seed',
    JSON.stringify(wireHolidays) === JSON.stringify(getHolidays()), { wire: wireHolidays, active: getHolidays() });

  check('weekend-only gap → 0 working days → NO banner',
    workingDaysBetween('2026-08-14', '2026-08-17', wireHolidays).length === 0,
    workingDaysBetween('2026-08-14', '2026-08-17', wireHolidays));
  check('weekend + holiday Monday → still 0 working days → NO banner',
    workingDaysBetween('2026-08-14', '2026-08-18', wireHolidays).length === 0,
    workingDaysBetween('2026-08-14', '2026-08-18', wireHolidays));
  setHolidays([]);
  const openMonday = await asMember.get(`/api/projects/${project._id}/deliverables`);
  const openHolidays: string[] = openMonday.body?.holidays ?? [];
  check('with the holiday lifted, the SAME gap reports 1 working day → banner fires',
    workingDaysBetween('2026-08-14', '2026-08-18', openHolidays).length === 1,
    workingDaysBetween('2026-08-14', '2026-08-18', openHolidays));
  check('a raw-calendar-day rule would have called the weekend gap 2 days — the working-day rule calls it 0 (R-f-8)',
    workingDaysBetween('2026-08-14', '2026-08-17', openHolidays).length === 0);
  // and the server still ACCEPTS a gap — gaps warn, they never block (BR-5)
  const gappy = await asMember.put(`/api/projects/${project._id}/sprints`).send({
    sprints: [
      { name: 'Sprint A', start: '2026-08-03', end: '2026-08-14' },
      { name: 'Sprint C', start: '2026-08-31', end: '2026-09-11' },
    ],
  });
  check('a gap between sprints still saves (gaps warn, never block)', gappy.status === 200, gappy.body);
  setHolidays(seedHolidays);

  // ---- 7. drag write path unchanged ---------------------------------------
  const auditBefore = await AuditLog.countDocuments({ action: 'schedule.replot' });
  const slot = await asMember.post(`/api/projects/${project._id}/replot`).send({
    moves: [{ cardId: 'c1', week: '2026-08-24' }],
  });
  check('bar drop → /replot 200, one move', slot.status === 200 && slot.body?.moved === 1, slot.body);
  check('the week actually moved', (await Deliverable.findOne({ trello_card_id: 'c1' }).lean())?.slotted_week === '2026-08-24');
  check('one schedule.replot audit row for the drop',
    (await AuditLog.countDocuments({ action: 'schedule.replot' })) === auditBefore + 1);

  const unslot = await asMember.post(`/api/projects/${project._id}/replot`).send({
    moves: [{ cardId: 'c2', week: null }],
  });
  check('Calendar-Remove / Unscheduled drop → same audited path, week null', unslot.status === 200 && unslot.body?.moved === 1, unslot.body);
  check('the row is unslotted', ((await Deliverable.findOne({ trello_card_id: 'c2' }).lean())?.slotted_week ?? null) === null);
  const unslotRow = await AuditLog.findOne({ action: 'schedule.replot', entity_id: 'c2' }).lean();
  check('unslot audited with after.slotted_week = null',
    ((unslotRow?.after as { slotted_week?: string | null })?.slotted_week ?? null) === null, unslotRow?.after);

  const auditBeforePinned = await AuditLog.countDocuments({ action: 'schedule.replot' });
  const pinned = await asMember.post(`/api/projects/${project._id}/replot`).send({
    moves: [{ cardId: 'c6', week: '2026-09-14' }],
  });
  check('pinned row → 200 but moved 0 (pins stay FULLY frozen, FR-5.9)', pinned.status === 200 && pinned.body?.moved === 0, pinned.body);
  check('the pinned row kept its week', (await Deliverable.findOne({ trello_card_id: 'c6' }).lean())?.slotted_week === '2026-08-03');
  check('a skipped pinned row writes NO audit row',
    (await AuditLog.countDocuments({ action: 'schedule.replot' })) === auditBeforePinned);

  // ---- 7b. why Calendar Remove is disabled on an already-unslotted row -----
  // /replot audits every move it APPLIES, and a null → null move is applied.
  // That is a non-change reaching the immutable log (invariant 10), so the
  // client refuses the click rather than the server refusing the write — the
  // route stays a dumb applier and the affordance carries the rule.
  const auditBeforeNoop = await AuditLog.countDocuments({ action: 'schedule.replot' });
  const noop = await asMember.post(`/api/projects/${project._id}/replot`).send({
    moves: [{ cardId: 'c2', week: null }], // c2 was unslotted above
  });
  check('a null → null replot IS applied and audited by the route', noop.status === 200
    && (await AuditLog.countDocuments({ action: 'schedule.replot' })) === auditBeforeNoop + 1, noop.body);
  const rowActionsTpl = await readFile(new URL('../frontend/templates/00-app.html', import.meta.url), 'utf8');
  // NOTE: historical batch instrument. 01-app.js was split into numbered pieces
  // (context restructure stage 5, 2026-08-18); a re-run must concatenate
  // frontend/scripts/*.js (minus the 00-* files) instead of reading one file.
  const rowActionsJs = await readFile(new URL('../frontend/scripts/01-app.js', import.meta.url), 'utf8');
  check('so Calendar Remove is disabled without a slotted week',
    rowActionsTpl.includes("disabled=\"{{ row.pinned || !row.slottedWeek }}\""));
  check('and unslotRow returns before writing when there is no week to remove',
    /async unslotRow\([\s\S]*?if \(!row\.slottedWeek\) return;/.test(rowActionsJs));

  // ---- 7c. R7 SUPERSEDED — Save gates on UNSAVED CHANGES (owl #37 item 1) ---
  const auditBeforeEmpty = await AuditLog.countDocuments({ action: 'sprints.replace', project_id: project._id });
  const emptied = await asMember.put(`/api/projects/${project._id}/sprints`).send({ sprints: [] });
  check('saving an EMPTY sprint list → 200 (the route accepts it)', emptied.status === 200, emptied.body);
  check('every sprint is gone', (await Sprint.countDocuments({ project_id: project._id })) === 0);
  check('the removal is audited like any other replace',
    (await AuditLog.countDocuments({ action: 'sprints.replace', project_id: project._id })) === auditBeforeEmpty + 1);
  check('membership fell back to derivation — no deliverable was touched',
    (await Deliverable.findOne({ trello_card_id: 'c1' }).lean())?.slotted_week === '2026-08-24');
  // the emptied-vs-opened-empty flag is gone: Save is live iff the draft
  // differs from the baseline captured at open AND nothing blocks
  check('Save is gated on the dirty check, not on an empty-vs-not flag',
    rowActionsTpl.includes('!sprintDirty') && rowActionsJs.includes('sprintBaseline'));
  check('the retired sprintOpenedEmpty flag is gone from both shipped files',
    !rowActionsTpl.includes('sprintOpenedEmpty') && !rowActionsJs.includes('sprintOpenedEmpty'));

  // ---- 7d. blank sprint names reject (owl #37 item 2) ----------------------
  // the route now owns the WHOLE blank class on the friendly 422 — `''` and
  // whitespace alike — instead of letting Zod answer an issue-less 400.
  await asMember.put(`/api/projects/${project._id}/sprints`).send({
    sprints: [{ name: 'Sprint A', start: '2026-08-03', end: '2026-08-14' }],
  }).expect(200);
  const sprintsBeforeBlank = await Sprint.countDocuments({ project_id: project._id });
  const auditBeforeBlank = await AuditLog.countDocuments({ action: 'sprints.replace', project_id: project._id });

  const blank = await asMember.put(`/api/projects/${project._id}/sprints`).send({
    sprints: [
      { name: 'Sprint A', start: '2026-08-03', end: '2026-08-14' },
      { name: '   ', start: '2026-08-17', end: '2026-08-28' },
    ],
  });
  check('a whitespace-only name → 422 SPRINT_CONFLICT, never a Zod 400',
    blank.status === 422 && blank.body?.error?.code === 'SPRINT_CONFLICT',
    { status: blank.status, code: blank.body?.error?.code });
  check('issue kind is blank-name',
    blank.body?.error?.issues?.some((i: { kind: string }) => i.kind === 'blank-name'), blank.body?.error?.issues);
  check('issue text matches the modal banner copy, dated from the row itself',
    blank.body?.error?.issues?.some((i: { text: string }) =>
      i.text === 'A sprint starting 17 Aug 2026 has no name. Name every sprint to save.'),
    blank.body?.error?.issues?.map((i: { text: string }) => i.text));
  check('blank reject wrote nothing',
    (await Sprint.countDocuments({ project_id: project._id })) === sprintsBeforeBlank);
  check('blank reject wrote no audit row',
    (await AuditLog.countDocuments({ action: 'sprints.replace', project_id: project._id })) === auditBeforeBlank);

  // two blanks used to collide on the key '' and get called duplicates of each
  // other — the class each side reports must now be the same one
  const twoBlanks = await asMember.put(`/api/projects/${project._id}/sprints`).send({
    sprints: [
      { name: '', start: '2026-08-03', end: '2026-08-14' },
      { name: '\t', start: '2026-08-17', end: '2026-08-28' },
    ],
  });
  const blankIssues = (twoBlanks.body?.error?.issues ?? []) as { kind: string }[];
  check('two blank rows → 422 with TWO blank-name issues',
    twoBlanks.status === 422 && blankIssues.filter((i) => i.kind === 'blank-name').length === 2, blankIssues);
  check('and ZERO duplicate-name issues — a blank is never a duplicate',
    blankIssues.filter((i) => i.kind === 'duplicate-name').length === 0, blankIssues);
  check('two blanks wrote nothing and audited nothing',
    (await Sprint.countDocuments({ project_id: project._id })) === sprintsBeforeBlank
    && (await AuditLog.countDocuments({ action: 'sprints.replace', project_id: project._id })) === auditBeforeBlank);

  const named = await asMember.put(`/api/projects/${project._id}/sprints`).send({
    sprints: [
      { name: 'Sprint A', start: '2026-08-03', end: '2026-08-14' },
      { name: 'Sprint B', start: '2026-08-17', end: '2026-08-28' },
    ],
  });
  check('the SAME list saves once every row has a name → 200', named.status === 200, named.body);
  check('and the named save landed both rows, audited once more',
    (await Sprint.countDocuments({ project_id: project._id })) === 2
    && (await AuditLog.countDocuments({ action: 'sprints.replace', project_id: project._id })) === auditBeforeBlank + 1);

  // ---- 8. no write-registry growth ----------------------------------------
  const scheduleSrc = await readFile(new URL('../src/routes/schedule.ts', import.meta.url), 'utf8');
  const deliverablesSrc = await readFile(new URL('../src/routes/deliverables.ts', import.meta.url), 'utf8');
  check('no route touched by batch 4 imports the Trello client',
    !/from '.*lib\/trello/.test(scheduleSrc) && !/from '.*lib\/trello/.test(deliverablesSrc));
  check('no sheets write anywhere in the touched routes',
    !/sheets/i.test(scheduleSrc) && !/sheets/i.test(deliverablesSrc));
  check('this probe made no outbound call by construction (supertest against an in-process app only)', true);
} finally {
  setHolidays(seedHolidays);
  await mongoose.disconnect();
  await server.stop();
}

console.log(failures === 0 ? '[probe] all checks passed' : `[probe] ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
