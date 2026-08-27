/**
 * T127 — the client router's pure half (phase 13h, JP-approved 2026-08-15).
 *
 * Like test/planner-weeks.test.ts, this executes the SHIPPED TEXT of
 * `frontend/scripts/00-router.js` rather than a retyped copy — the repo has no
 * browser test runner, and a router that silently regresses would send every
 * deep link to the wrong tab.
 *
 * It runs in a `node:vm` context with an EMPTY sandbox, which is itself an
 * assertion: `parseRoute` and `buildPath` are contractually pure, so a stray
 * reference to `window`, `history` or `app` fails here with a ReferenceError
 * instead of shipping.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appScripts } from './helpers/source.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(dir, '..', 'frontend', 'scripts', '00-router.js'), 'utf8');

interface Route { project: string | null; tab: string | null }
interface Router {
  parseRoute(pathname: string, base: string): Route;
  buildPath(code: string | null, tab: string | null, base: string): string;
  ROUTE_TABS: string[];
  ROUTE_DEFAULT_TAB: string;
}

const { parseRoute, buildPath, ROUTE_TABS, ROUTE_DEFAULT_TAB } = vm.runInNewContext(
  `${SRC}\n;({ parseRoute, buildPath, ROUTE_TABS, ROUTE_DEFAULT_TAB })`,
  {},
) as Router;

const BASES = ['', '/sirius'];

describe('parseRoute — reports what the URL says, decides nothing', () => {
  it('reads the canonical form at the domain root and under a prefix', () => {
    for (const base of BASES) {
      expect(parseRoute(`${base}/rt-test/schedules`, base)).toEqual({ project: 'rt-test', tab: 'schedules' });
      expect(parseRoute(`${base}/rt-837/deadlines`, base)).toEqual({ project: 'rt-837', tab: 'deadlines' });
    }
  });

  it('reads every one of the six tabs', () => {
    for (const tab of ROUTE_TABS) {
      expect(parseRoute(`/rt-test/${tab}`, '')).toEqual({ project: 'rt-test', tab });
      expect(parseRoute(`/sirius/rt-test/${tab}`, '/sirius')).toEqual({ project: 'rt-test', tab });
    }
  });

  it('treats a lone segment as a tab when it names one, else as a project code', () => {
    for (const base of BASES) {
      expect(parseRoute(`${base}/schedules`, base)).toEqual({ project: null, tab: 'schedules' }); // row 3
      expect(parseRoute(`${base}/rt-test`, base)).toEqual({ project: 'rt-test', tab: null }); // row 2
    }
  });

  it('hands unknowns back verbatim — the caller falls back, the parser does not', () => {
    expect(parseRoute('/zzz', '')).toEqual({ project: 'zzz', tab: null }); // row 6
    expect(parseRoute('/zzz/schedules', '')).toEqual({ project: 'zzz', tab: 'schedules' }); // row 5
    expect(parseRoute('/rt-test/zzz', '')).toEqual({ project: 'rt-test', tab: null });
    expect(parseRoute('/admin', '')).toEqual({ project: null, tab: 'admin' }); // row 7
  });

  it('reads the roots and empty input as "no opinion"', () => {
    expect(parseRoute('/', '')).toEqual({ project: null, tab: null }); // row 4
    expect(parseRoute('/sirius', '/sirius')).toEqual({ project: null, tab: null });
    expect(parseRoute('/sirius/', '/sirius')).toEqual({ project: null, tab: null });
    expect(parseRoute('', '')).toEqual({ project: null, tab: null });
  });

  it('ignores trailing and doubled slashes', () => {
    expect(parseRoute('/rt-test/', '')).toEqual({ project: 'rt-test', tab: null });
    expect(parseRoute('/rt-test/schedules/', '')).toEqual({ project: 'rt-test', tab: 'schedules' });
  });

  it('only strips the base when the path actually carries it', () => {
    expect(parseRoute('/rt-test/schedules', '/sirius')).toEqual({ project: 'rt-test', tab: 'schedules' });
  });
});

describe('buildPath — one canonical shape, never a bare project or bare tab', () => {
  it('always emits ${base}/${code}/${tab}', () => {
    expect(buildPath('rt-test', 'schedules', '')).toBe('/rt-test/schedules');
    expect(buildPath('rt-test', 'schedules', '/sirius')).toBe('/sirius/rt-test/schedules');
  });

  it('falls back to the default tab for a missing or unknown one', () => {
    expect(buildPath('rt-test', null, '')).toBe(`/rt-test/${ROUTE_DEFAULT_TAB}`);
    expect(buildPath('rt-test', 'zzz', '')).toBe(`/rt-test/${ROUTE_DEFAULT_TAB}`);
    expect(ROUTE_DEFAULT_TAB).toBe('pipeline');
  });

  it('returns "" with no project code, so the caller leaves the URL alone', () => {
    expect(buildPath(null, 'schedules', '')).toBe('');
    expect(buildPath('', 'schedules', '/sirius')).toBe('');
  });
});

describe('normalization is idempotent — the URL settles after exactly one pass', () => {
  const INCOMING = ['/', '/rt-test', '/schedules', '/rt-test/schedules', '/zzz', '/zzz/schedules', '/admin'];

  it.each(BASES)('round-trips every table row at base "%s"', (base) => {
    for (const row of INCOMING) {
      const url = `${base}${row === '/' ? '/' : row}`;
      const once = (p: string) => {
        const r = parseRoute(p, base);
        return buildPath(r.project, r.tab, base);
      };
      const first = once(url);
      // A path with no project resolves to '' — the client keeps the URL and
      // waits for the project list; anything else is already settled.
      expect(once(first || url)).toBe(first);
      if (first) expect(once(first)).toBe(first);
    }
  });

  it('a canonical URL parses back to exactly what built it', () => {
    for (const base of BASES) {
      for (const tab of ROUTE_TABS) {
        const built = buildPath('rt-837', tab, base);
        expect(parseRoute(built, base)).toEqual({ project: 'rt-837', tab });
      }
    }
  });
});

/**
 * Regression — live defect 2026-08-17: cold-loading a NON-default project deep
 * link (/rt-837/schedules) always settled on projects[0]. Root cause: the
 * header <select> is two-way bound to activeProjectId, so rendering `projects`
 * against a null selection makes the browser pick option one and the binding
 * writes it back BEFORE the guarded route-apply ran — the guard then saw a
 * project "already chosen" and skipped the route's. The fix chooses from the
 * route FIRST and ships projects + activeProjectId in ONE suppressed set.
 * This pins the shipped source shape so the ordering cannot silently regress.
 */
describe('boot applies the route project before the select can bind (source shape)', () => {
  const src = appScripts(); // the WHOLE shipped script set, not one file
  const shell = src.slice(src.indexOf('async function loadShell'), src.indexOf('async function loadAdmin'));

  it('projects and activeProjectId land in the same set, after the route choice', () => {
    const oneSet = /app\.set\(\{[^)]*projects:\s*projects\.projects[^)]*activeProjectId:/s;
    expect(shell).toMatch(oneSet);
    expect(shell.indexOf('const chosen')).toBeGreaterThan(-1);
    expect(shell.indexOf('const chosen')).toBeLessThan(shell.search(oneSet));
  });

  it('the racy guarded form is gone', () => {
    expect(shell).not.toContain("!app.get('activeProjectId')");
  });
});
