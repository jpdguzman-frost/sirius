/**
 * Invariant 11 on the CLIENT: "store UTC, render and compute Asia/Manila".
 *
 * The server side of this is well covered — `manilaDate`/`manilaToday` in
 * `src/services/pipeline.ts`, and the golden suites over `lib/calendar.ts`.
 * The browser had no such guard, and three places had quietly grown a
 * host-local "today": the planner's opening week, the sprint the Add button
 * proposes, and the month the Deadlines tab scopes itself to. All three read
 * the VIEWER's clock, so the same board showed a different current week and a
 * different current month depending on where it was opened from.
 *
 * The failure is quiet, which is what makes it worth a guard rather than a
 * one-time fix: a wrong default week looks exactly like a right one, and
 * nothing in a green suite distinguishes them.
 *
 * This asserts the RULE — the client derives "now" in exactly one place, and
 * that place names the timezone — rather than pinning the three call sites,
 * which would forbid a legitimate fourth caller while missing a fifth that
 * reached for `new Date()` again.
 */

import { describe, expect, it } from 'vitest';
import { APP_JS, APP_JS_CODE } from './helpers/gantt-render.ts';

/* The whole shipped bundle, comments stripped, so a `new Date()` written in
   prose cannot fail this and a real one cannot hide behind a comment. */
const CODE = APP_JS_CODE;

describe('invariant 11 — the client has ONE clock, and it is Manila’s', () => {
  it('reads the wall clock in exactly one place', () => {
    const reads = [...CODE.matchAll(/new Date\(\s*\)/g)];
    expect(
      reads,
      'the client reads the host clock in more than one place — every "today" must come through the Manila formatter',
    ).toHaveLength(1);
  });

  it('and that one place hands it straight to the Manila formatter', () => {
    const at = CODE.search(/new Date\(\s*\)/);
    expect(at).toBeGreaterThan(-1);
    const line = CODE.slice(CODE.lastIndexOf('\n', at) + 1, CODE.indexOf('\n', at));
    expect(line, 'the single clock read is not the Manila one').toContain('MANILA_DAY.format');
    expect(line).toContain('manilaToday');
  });

  it('the Manila formatter names the timezone rather than trusting the host', () => {
    expect(CODE).toMatch(/timeZone:\s*'Asia\/Manila'/);
    // both formatters — the day and the clock time — are pinned, not just one
    expect([...CODE.matchAll(/timeZone:\s*'Asia\/Manila'/g)].length).toBeGreaterThanOrEqual(2);
  });

  /* THE DEFECT THIS ENCODES: `todayIso()` existed for exactly this — an
     unqualified host-local today — and both of its callers wanted Manila. It
     was deleted rather than left as a thing to reach for. */
  it('no host-local “today” helper is left lying around to be reached for', () => {
    expect(CODE, 'a host-local today helper is back').not.toMatch(/function todayIso\b/);
    expect(CODE).not.toMatch(/\btodayIso\s*\(/);
  });

  /* `isoOf(new Date(...))` on a constructed date is fine and used everywhere;
     the ban is only on constructing one from the wall clock. Asserted so the
     guard above is not read as banning `isoOf`. */
  it('but calendar arithmetic on an explicit date is untouched', () => {
    expect(APP_JS).toMatch(/const isoOf = /);
    expect(CODE).toMatch(/new Date\(\s*[^)\s]/); // at least one constructed-from-arguments Date survives
  });
});
