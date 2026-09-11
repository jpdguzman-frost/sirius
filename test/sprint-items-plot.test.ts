/**
 * Sprint items — THE PLOT GUARDS. Section G of test/sprint-items.test.ts,
 * split out 2026-09-11 (block 9; the file was 73KB) at the `plotIssue`
 * boundary, and grown here by the block's rulings (owls miles→jp #88, #89,
 * #90; JP's yes 2026-09-10; PLAN.md block 9, frozen "Server" interfaces):
 *
 *   - a FOURTH refusal, `OUT_OF_WEEK`, checked FIRST — the Design Lead's
 *     day-drag on Deadlines is bounded by the assigned week (#89 §1/§3);
 *   - `plotIssue` takes `sprint: null` for a row OUTSIDE ANY SPRINT (#90)
 *     and skips the range check for it;
 *   - `weekKeyOf` (the local Monday) and `firstWorkdayOfWeek` (where the
 *     PM's week click lands the bar — the week's first WORKING day on the
 *     ACTIVE calendar, #89 §2), each proven in three timezones, because
 *     both compose `lib/calendar` primitives and invariant 11 is exactly
 *     the kind of rule a UTC-only run cannot see break.
 *
 * The server contract only; the route-level half of the week placement and
 * the re-date displacement lives in test/schedule.test.ts. The shared
 * prelude (`setup`, `add`, `addAndPlot`, `withHoliday`, …) is
 * test/helpers/sprint-items-fixture.ts.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { startTestDb, stopTestDb, clearCollections } from './helpers/db.ts';
import { mkWorkCard } from './helpers/schedule-fixture.ts';
import { add, addAndPlot, batch, itemUrl, load, setup, withHoliday } from './helpers/sprint-items-fixture.ts';
import { firstWorkdayOfWeek, plotIssue, sprintRangeIssue, weekKeyOf } from '../src/services/sprint-items.ts';
import { getHolidays, localIso, setHolidays } from '../lib/calendar.ts';
import { AuditLog, Sprint, SprintItem } from '../src/models/index.ts';

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearCollections();
});

/* ---------------------------------------------------------------------- */
/* G — the plot guards: the day the PM picks must be a day work can start  */
/*     (JP 2026-09-08; drift.md rows 1, 2 and 5)                           */
/* ---------------------------------------------------------------------- */

/**
 * ONE validator behind every route that takes a `starts_on` from a person,
 * and FOUR refusals in one order. JP's rules (2026-09-08): a row cannot be
 * placed outside its sprint's dates, and cannot START after the card's
 * deadline — a FINISH past the deadline stays legal and red (R9-b, and the
 * `late` cases in test/sprint-items.test.ts section E, which is why the guard
 * is on the START alone). The third is invariant 11: the grid is Mon–Fri and
 * the ARES working-day calendar is canonical, so a holiday is not a day work
 * can begin. The FOURTH (block 9, owl #89 §1/§3) is the assigned week: the
 * Design Lead's day-drag on Deadlines cannot carry a card past either edge
 * of the week the PM assigned — asked FIRST, and only by the caller that
 * supplies `assignedWeek` (the day write; the PM's week click has no current
 * week to stay inside, since it is the act that sets one).
 *
 * ROLLOVER IS EXEMPT, and the last test here is what keeps it that way: §6.2
 * lets a roll leave its sprint and outrun the deadline "with no cap", so the
 * guard belongs to the manual write paths alone.
 */
describe('plotIssue — one validator, four refusals, one order', () => {
  const sprint = { starts_on: '2026-08-03', ends_on: '2026-08-14' }; // Mon .. Fri

  it('allows every working day inside the sprint, both boundaries included', () => {
    for (const day of ['2026-08-03', '2026-08-07', '2026-08-10', '2026-08-14']) {
      expect(plotIssue({ sprint, startsOn: day, deadline: null }), day).toBeNull();
    }
  });

  it('refuses a day outside the sprint, naming the range in the PM’s own words', () => {
    for (const day of ['2026-07-31', '2026-08-17']) {
      expect(plotIssue({ sprint, startsOn: day, deadline: null }), day).toEqual({
        code: 'OUT_OF_SPRINT',
        message: "That day is outside the sprint's dates (3 Aug 2026 – 14 Aug 2026).",
      });
    }
  });

  it('allows the DEADLINE DAY itself and refuses the day after it', () => {
    expect(plotIssue({ sprint, startsOn: '2026-08-05', deadline: '2026-08-05' })).toBeNull();
    expect(plotIssue({ sprint, startsOn: '2026-08-06', deadline: '2026-08-05' })).toEqual({
      code: 'PAST_DEADLINE',
      message: "That day is after the card's deadline (5 Aug 2026).",
    });
  });

  it('invents no deadline — a card without one is judged on the sprint alone (BR-9)', () => {
    expect(plotIssue({ sprint, startsOn: '2026-08-13' })).toBeNull();
    expect(plotIssue({ sprint, startsOn: '2026-08-13', deadline: null })).toBeNull();
  });

  it('refuses the weekend — the grid is Mon–Fri', () => {
    expect(plotIssue({ sprint, startsOn: '2026-08-08' })).toEqual({
      code: 'NOT_A_WORKDAY',
      message: 'That day is not a working day.',
    });
    expect(plotIssue({ sprint, startsOn: '2026-08-09' })!.code).toBe('NOT_A_WORKDAY'); // Sunday
  });

  it('refuses a holiday from the ACTIVE (ARES) calendar rather than a list of its own', () => {
    const restore = getHolidays();
    try {
      /* The one holiday source: whatever `setHolidays` last loaded — the ARES
         working-day calendar in production (calendar-sync.ts), the seed until
         it lands. A second list here would drift from the forecast's. */
      setHolidays([...restore, '2026-08-05']);
      expect(plotIssue({ sprint, startsOn: '2026-08-05' })!.code).toBe('NOT_A_WORKDAY');
      setHolidays(restore);
      expect(plotIssue({ sprint, startsOn: '2026-08-05' })).toBeNull();
    } finally {
      setHolidays(restore);
    }
  });

  it('takes an injected calendar, so a caller can ask against a set of its own', () => {
    const calendar = { isHoliday: (d: Date) => localIso(d) === '2026-08-12' };
    expect(plotIssue({ sprint, startsOn: '2026-08-12', calendar })!.code).toBe('NOT_A_WORKDAY');
    expect(plotIssue({ sprint, startsOn: '2026-08-11', calendar })).toBeNull();
  });

  it('checks in ONE order: the week, then the sprint, then the deadline, then the calendar (PLAN.md block 9)', () => {
    // a Saturday BEFORE the sprint and after a deadline — the sprint answers first
    expect(plotIssue({ sprint, startsOn: '2026-08-01', deadline: '2026-07-01' })!.code).toBe('OUT_OF_SPRINT');
    // inside the sprint, past the deadline AND a Saturday — the deadline answers
    expect(plotIssue({ sprint, startsOn: '2026-08-08', deadline: '2026-08-05' })!.code).toBe('PAST_DEADLINE');
    // and with a week to stay inside: a Saturday AFTER the sprint, after the
    // deadline, in ANOTHER week — the week answers before all three
    expect(plotIssue({ sprint, startsOn: '2026-08-22', deadline: '2026-08-05', assignedWeek: '2026-08-03' })!.code).toBe('OUT_OF_WEEK');
    // inside the week but outside the sprint (a two-week sprint ending mid-week
    // 2), past the deadline — the sprint answers second
    const endsWed = { starts_on: '2026-08-03', ends_on: '2026-08-12' };
    expect(plotIssue({ sprint: endsWed, startsOn: '2026-08-13', deadline: '2026-08-05', assignedWeek: '2026-08-10' })!.code).toBe('OUT_OF_SPRINT');
    // inside the week and the sprint, past the deadline and a Saturday — the deadline answers third
    expect(plotIssue({ sprint, startsOn: '2026-08-08', deadline: '2026-08-05', assignedWeek: '2026-08-03' })!.code).toBe('PAST_DEADLINE');
    // inside all three, a Saturday — the calendar answers last
    expect(plotIssue({ sprint, startsOn: '2026-08-08', deadline: null, assignedWeek: '2026-08-03' })!.code).toBe('NOT_A_WORKDAY');
  });

  it('OUT_OF_WEEK — refuses every day past either edge of the assigned week, and takes every day inside it (#89 §1)', () => {
    /* The assigned week is Mon 10 Aug; the sprint spans it on both sides (3–21
       Aug), no deadline — so the week is the ONLY thing that can refuse, and
       the boundary days prove it does, in the fourth refusal's own voice
       (frozen message, PLAN.md). */
    const wide = { starts_on: '2026-08-03', ends_on: '2026-08-21' };
    const week = '2026-08-10';
    for (const day of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']) {
      expect(plotIssue({ sprint: wide, startsOn: day, deadline: null, assignedWeek: week }), day).toBeNull();
    }
    for (const day of ['2026-08-07', '2026-08-09', '2026-08-17', '2026-08-03', '2026-08-21']) {
      expect(plotIssue({ sprint: wide, startsOn: day, deadline: null, assignedWeek: week }), day).toEqual({
        code: 'OUT_OF_WEEK',
        message: "That day is outside the card's assigned week (Mon 10 Aug 2026 – Fri 14 Aug 2026).",
      });
    }
    // IS NOT VACUOUS: the same days, with no week to stay inside, are the
    // sprint's and the calendar's to judge — Friday the 7th and Monday the
    // 17th pass, the Sunday is a NOT_A_WORKDAY
    expect(plotIssue({ sprint: wide, startsOn: '2026-08-07', deadline: null })).toBeNull();
    expect(plotIssue({ sprint: wide, startsOn: '2026-08-17', deadline: null })).toBeNull();
    expect(plotIssue({ sprint: wide, startsOn: '2026-08-09', deadline: null })!.code).toBe('NOT_A_WORKDAY');
  });

  it('OUT_OF_WEEK names the week Mon–Fri through the same long-date formatter the other three use', () => {
    // one register: the fourth sentence is built from `longDate` like the
    // sprint's and the deadline's, so the PM reads one voice (#89 §3)
    const issue = plotIssue({ sprint, startsOn: '2026-08-14', deadline: null, assignedWeek: '2026-08-03' })!;
    expect(issue.message).toMatch(/^That day is outside the card's assigned week \(Mon 3 Aug 2026 – Fri 7 Aug 2026\)\.$/);
    expect(plotIssue({ sprint, startsOn: '2026-07-31', deadline: null })!.message).toMatch(/^That day is outside the sprint's dates \(3 Aug 2026 – 14 Aug 2026\)\.$/);
  });

  it('skips the SPRINT check for a row outside any sprint (`sprint: null`, owl #90) — the other three still bind', () => {
    /* A displaced row keeps its day and its week and has no range to judge:
       the Design Lead can still move it inside its week, to a working day no
       later than the deadline. */
    expect(plotIssue({ sprint: null, startsOn: '2026-08-12', deadline: null })).toBeNull();
    expect(plotIssue({ sprint: null, startsOn: '2026-08-12', deadline: null, assignedWeek: '2026-08-10' })).toBeNull();
    expect(plotIssue({ sprint: null, startsOn: '2026-08-17', deadline: null, assignedWeek: '2026-08-10' })!.code).toBe('OUT_OF_WEEK');
    expect(plotIssue({ sprint: null, startsOn: '2026-08-12', deadline: '2026-08-11', assignedWeek: '2026-08-10' })!.code).toBe('PAST_DEADLINE');
    expect(plotIssue({ sprint: null, startsOn: '2026-08-15', deadline: null, assignedWeek: '2026-08-10' })!.code).toBe('NOT_A_WORKDAY');
    // negative control: the same day with a sprint that excludes it IS refused
    expect(plotIssue({ sprint: { starts_on: '2026-08-03', ends_on: '2026-08-07' }, startsOn: '2026-08-12', deadline: null })!.code).toBe('OUT_OF_SPRINT');
  });

  it('answers its range refusal THROUGH sprintRangeIssue — one range rule, two callers', () => {
    /* The bare list move (D5, strict) judges the range and nothing else, so
       the clause is factored out and `plotIssue` calls it first. Executed
       against each other rather than compared as source (test/CLAUDE.md rule
       2): the two must agree on every day around both boundaries, including
       the exact words, or the PM reads one sentence when they drop a bar and
       another when they drag its list. */
    for (const day of ['2026-07-31', '2026-08-02', '2026-08-03', '2026-08-10', '2026-08-14', '2026-08-15', '2026-08-17']) {
      const full = plotIssue({ sprint, startsOn: day, deadline: null });
      expect(sprintRangeIssue({ sprint, startsOn: day }), day)
        .toEqual(full?.code === 'OUT_OF_SPRINT' ? full : null);
    }
    // and it answers ONLY the range: a Saturday inside the sprint is its problem
    expect(sprintRangeIssue({ sprint, startsOn: '2026-08-08' })).toBeNull();
    expect(plotIssue({ sprint, startsOn: '2026-08-08' })!.code).toBe('NOT_A_WORKDAY');
  });

  it('is never called by rollover — §6.2 lets a roll leave its sprint and outrun the deadline', () => {
    /* The guard is on the PM's own click, never on the day-advance job. A roll
       that had to satisfy it would stop moving a card the moment the card ran
       late, which is the one case rollover exists for ("moves indefinitely …
       with no cap. That is intended", spec v1.3 §6.2). */
    const src = readFileSync(new URL('../src/services/rollover.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('plotIssue');
  });
});

describe('the write routes refuse a day that cannot be plotted on', () => {
  /** The three refusals as the ADD answers them: 422 { code, message }. The
      add takes a day with no week to stay inside, so it asks three questions. */
  const CASES: Array<[string, string]> = [
    ['2026-08-17', 'OUT_OF_SPRINT'], // a Monday, past the sprint's last day
    ['2026-08-13', 'PAST_DEADLINE'], // a Thursday, the day after the card's due date
    /* A Saturday INSIDE the sprint and BEFORE the deadline — so the first two
       checks pass it and the calendar is the one that answers. A Saturday past
       the due date would earn PAST_DEADLINE instead, which is the documented
       order, not a bug: the PM is told the first thing wrong with the day. */
    ['2026-08-08', 'NOT_A_WORKDAY'],
  ];

  it('PATCH answers 422 with the code and the words for all FOUR refusals, and writes NOTHING', async () => {
    /* The day write (the Design Lead's, Deadlines) asks all four, week FIRST
       (block 9, owl #89). The row sits on Mon 10 Aug in a sprint that ends
       Wed 12 Aug, with a Tuesday deadline — so inside its week there is a day
       the sprint refuses, a day the deadline refuses and, under a holiday, a
       day the calendar refuses; and either edge of the week is the week's
       refusal before anything else is asked. */
    const { project, sprint, agent } = await setup();
    await Sprint.updateOne({ _id: sprint._id }, { $set: { ends_on: '2026-08-12' } });
    await mkWorkCard(project._id, 'w1', { trello_due: '2026-08-11' });
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-10');
    const audits = await AuditLog.countDocuments({ project_id: project._id });

    const DAY_CASES: Array<[string, string]> = [
      ['2026-08-17', 'OUT_OF_WEEK'], // the Monday after — inside the sprint? no; but the week answers first
      ['2026-08-07', 'OUT_OF_WEEK'], // the Friday before — inside the sprint AND before the deadline
      ['2026-08-13', 'OUT_OF_SPRINT'], // Thursday, after a Wednesday end
      ['2026-08-12', 'PAST_DEADLINE'], // Wednesday, after a Tuesday deadline
    ];
    for (const [day, code] of DAY_CASES) {
      const res = await agent.patch(itemUrl(project._id, id)).send({ starts_on: day }).expect(422);
      expect(res.body, day).toMatchObject({ ok: false, error: { code } });
      expect(String(res.body.error.message), day).toMatch(/^That day is /);
    }
    // the calendar's refusal, on a weekday inside every other bound
    await withHoliday('2026-08-11', async () => {
      const res = await agent.patch(itemUrl(project._id, id)).send({ starts_on: '2026-08-11' }).expect(422);
      expect(res.body.error.code).toBe('NOT_A_WORKDAY');
    });
    /* A REFUSED WRITE AUDITS NOTHING (invariant 10 logs changes, not attempts)
       and leaves the bar exactly where it was — the client restores the row
       from this answer, so a half-applied state here would be a state Trello
       and Sirius disagree about. */
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(audits);
    expect((await SprintItem.findOne({ _id: id, project_id: project._id }).lean())!.starts_on).toBe('2026-08-10');
    // IS NOT VACUOUS: the one day every bound allows goes through
    await agent.patch(itemUrl(project._id, id)).send({ starts_on: '2026-08-11' }).expect(200);
  });

  it('the single ADD holds the same rule — no row, no audit, then the good day lands', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1', { trello_due: '2026-08-12' });

    for (const [day, code] of CASES) {
      const res = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1', starts_on: day }).expect(422);
      expect(res.body.error.code, day).toBe(code);
    }
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(0);

    // the day that IS plottable still lands already plotted, in the one act
    const ok = await add(agent, project._id, { sprint_id: String(sprint._id), card_id: 'w1', starts_on: '2026-08-05' }).expect(201);
    expect((await SprintItem.findOne({ _id: ok.body.id, project_id: project._id }).lean())!.starts_on).toBe('2026-08-05');
  });

  it('allows the boundary days — the sprint’s first and last, and the deadline day itself', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1', { trello_due: '2026-08-14' });
    // the sprint's FIRST day (a plot through the PATCH route)
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-03');
    // the sprint's LAST day, which is also the deadline day — reached the
    // way a person reaches it since block 9: the PM's week click into the
    // sprint's second week, then the Design Lead's day inside that week
    await agent.patch(itemUrl(project._id, id)).send({ week: '2026-08-10' }).expect(200);
    await agent.patch(itemUrl(project._id, id)).send({ starts_on: '2026-08-14' }).expect(200);
    expect((await load(project._id)).rows[0]!.startsOn).toBe('2026-08-14');
  });

  it('never judges an UN-plot — null clears a row wherever it happens to sit', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-05');
    /* The day the row sits on becomes a holiday AFTER the plot — exactly what
       an ARES calendar refresh can do. Clearing the bar must still work: the
       guard judges a placement, and null is the absence of one. */
    await withHoliday('2026-08-05', async () => {
      await agent.patch(itemUrl(project._id, id)).send({ starts_on: null }).expect(200);
    });
    expect((await SprintItem.findOne({ _id: id, project_id: project._id }).lean())!.starts_on ?? null).toBeNull();
  });

  it('answers a RE-SEND of the day a row already sits on as the no-op it is', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    const id = await addAndPlot(agent, project._id, 'w1', String(sprint._id), '2026-08-05');
    const audits = await AuditLog.countDocuments({ project_id: project._id });
    /* The calendar turns the row's own day into a holiday after the fact. The
       client's reload window can re-send the day it already sent, and that is
       not a placement — before == after, so it never reaches the guard, writes
       nothing and audits nothing (the no-op rule, review finding 2). A refusal
       here would be a 422 for a change nobody made. */
    await withHoliday('2026-08-05', async () => {
      const res = await agent.patch(itemUrl(project._id, id)).send({ starts_on: '2026-08-05' }).expect(200);
      expect(res.body.noop).toBe(true);
    });
    expect(await AuditLog.countDocuments({ project_id: project._id })).toBe(audits);
    expect((await SprintItem.findOne({ _id: id, project_id: project._id }).lean())!.starts_on).toBe('2026-08-05');
  });

  it('the batch add carries no day at all, so no placement can be smuggled past the guard', async () => {
    const { project, sprint, agent } = await setup();
    await mkWorkCard(project._id, 'w1');
    /* Rows land unplotted by construction (#72 §6) — `.strict()` refuses the
       key, which is a REFUSAL OF THE BODY (400), stricter than the 422 a bad
       day earns on the routes that do take one. So the three plot codes cannot
       arise here, and a batch can never write a placement nobody validated. */
    await batch(agent, project._id, { sprint_id: String(sprint._id), card_ids: ['w1'], starts_on: '2026-08-08' }).expect(400);
    expect(await SprintItem.countDocuments({ project_id: project._id })).toBe(0);
  });
});

/* ---------------------------------------------------------------------- */
/* H — the week helpers: where a week click lands, and which week a day    */
/*     belongs to (block 9, owl #89 §2; PLAN.md "Server")                  */
/* ---------------------------------------------------------------------- */

/**
 * Runs `body` with the host timezone set to each of the three zones the
 * calendar suites run in (test/CLAUDE.md rule 5): UTC, one east of it, one
 * west of it across a DST edge. Node re-reads `process.env.TZ` when it
 * changes, so the same helper is executed three times against the same
 * dates — the rule is "the answer is the same calendar day everywhere"
 * (invariant 11), and a `new Date(iso)` (UTC midnight) hiding behind a
 * `parseDate` (local midnight) is exactly what only the WESTERN zone shows.
 * The restore follows test/sprint-items.test.ts's own precedent: assigning
 * `undefined` stores the STRING 'undefined', which Node treats as UTC.
 */
const inEveryZone = (body: (zone: string) => void): void => {
  const was = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Asia/Manila', 'America/New_York']) {
      process.env.TZ = zone;
      body(zone);
    }
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
};

/** The Monday of `iso`'s week by pure UTC arithmetic — the TZ-true reference. */
const refMonday = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y!, m! - 1, d!);
  const dow = new Date(t).getUTCDay() || 7;
  return new Date(t - (dow - 1) * 864e5).toISOString().slice(0, 10);
};

describe('weekKeyOf — the LOCAL Monday of a day, in every timezone', () => {
  it('names the Monday for every day of a week, and the Monday names itself', () => {
    inEveryZone((zone) => {
      for (const day of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16']) {
        expect(weekKeyOf(day), `${day} in ${zone}`).toBe('2026-08-10');
      }
    });
  });

  it('agrees with a pure-arithmetic Monday across year edges, month edges and both DST edges of New York', () => {
    const DAYS = [
      '2026-01-01', '2026-01-04', '2026-01-05', // year edge: Thu → Mon 29 Dec; Sun; Mon
      '2026-03-08', '2026-03-09', '2026-03-14', // the Sunday DST starts in New York, and the week after
      '2026-11-01', '2026-11-02', '2026-11-07', // the Sunday DST ends, and the week after
      '2026-08-31', '2026-09-01', '2026-12-31',
      '2028-02-29', // a leap day
    ];
    inEveryZone((zone) => {
      for (const day of DAYS) expect(weekKeyOf(day), `${day} in ${zone}`).toBe(refMonday(day));
    });
  });

  it('is the same derivation the planner keys its weeks by — `toMonday` over a LOCAL-midnight date (invariant 11)', () => {
    // READ out of the shipped module (rule 2), not restated: the key must be
    // the local Monday `lib/calendar` would give the planner, or Deadlines and
    // Sprint Schedules disagree about which week a day is in
    const src = readFileSync(new URL('../src/services/sprint-items.ts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('export function weekKeyOf('), src.indexOf('export function firstWorkdayOfWeek('));
    expect(body).toContain('toMonday(parseDate(');
    expect(body).toContain('localIso(');
    expect(body).not.toContain('new Date(iso)');
  });
});

describe('firstWorkdayOfWeek — where the PM’s week click lands the bar (#89 §2: the first WORKING day, not Monday)', () => {
  it('is the Monday itself on an ordinary week — in every timezone', () => {
    inEveryZone((zone) => {
      expect(firstWorkdayOfWeek('2026-08-10'), zone).toBe('2026-08-10');
      expect(firstWorkdayOfWeek('2026-03-09'), zone).toBe('2026-03-09'); // the Monday after New York's DST start
      expect(firstWorkdayOfWeek('2026-11-02'), zone).toBe('2026-11-02'); // …and after its DST end
    });
  });

  it('hands a holiday Monday to Tuesday, on the ACTIVE calendar, in every timezone', () => {
    // v1.4 §5.1b said "the Monday"; owl #89 §2 and JP's yes say the first
    // WORKING day — the owl wins (drift report §A row 4). The holiday source is
    // whatever `setHolidays` last loaded (the ARES calendar in production).
    const restore = getHolidays();
    try {
      setHolidays([...restore, '2026-08-10']);
      inEveryZone((zone) => {
        expect(firstWorkdayOfWeek('2026-08-10'), zone).toBe('2026-08-11');
      });
      // two holidays in a row push it to Wednesday
      setHolidays([...restore, '2026-08-10', '2026-08-11']);
      inEveryZone((zone) => {
        expect(firstWorkdayOfWeek('2026-08-10'), zone).toBe('2026-08-12');
      });
      // and a holiday LATER in the week changes nothing about the Monday
      setHolidays([...restore, '2026-08-12']);
      expect(firstWorkdayOfWeek('2026-08-10')).toBe('2026-08-10');
    } finally {
      setHolidays(restore);
    }
    // IS NOT VACUOUS: with the calendar restored the same Monday is a working day again
    expect(firstWorkdayOfWeek('2026-08-10')).toBe('2026-08-10');
  });

  it('answers null for a week that is ALL holidays — there is no day to place on, and it never invents one', () => {
    const restore = getHolidays();
    try {
      setHolidays([...restore, '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']);
      inEveryZone((zone) => {
        expect(firstWorkdayOfWeek('2026-08-10'), zone).toBeNull();
      });
      // four holidays leave Friday — it never crosses into the next week
      setHolidays([...restore, '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']);
      expect(firstWorkdayOfWeek('2026-08-10')).toBe('2026-08-14');
    } finally {
      setHolidays(restore);
    }
  });

  it('takes an injected calendar, so a caller can ask against a set of its own', () => {
    const calendar = { isHoliday: (d: Date) => localIso(d) === '2026-08-10' };
    expect(firstWorkdayOfWeek('2026-08-10', calendar)).toBe('2026-08-11');
    expect(firstWorkdayOfWeek('2026-08-17', calendar)).toBe('2026-08-17');
  });

  it('never steps onto a weekend — the scan is Mon..Fri of the given Monday and nothing past it', () => {
    // the seed calendar's Monday 31 Aug 2026 (National Heroes Day) → Tuesday
    const restore = getHolidays();
    try {
      setHolidays(['2026-08-31']);
      expect(firstWorkdayOfWeek('2026-08-31')).toBe('2026-09-01');
    } finally {
      setHolidays(restore);
    }
    // and the result is always inside the week it was asked about
    inEveryZone(() => {
      const day = firstWorkdayOfWeek('2026-08-10');
      expect(day).not.toBeNull();
      expect(weekKeyOf(day!)).toBe('2026-08-10');
    });
  });
});
