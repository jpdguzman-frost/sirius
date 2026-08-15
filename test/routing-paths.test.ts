/**
 * T127 — the shell whitelist, the login return-to validator and the base stamp
 * (phase 13h, JP-approved 2026-08-15).
 *
 * `isShellPath` is the security-relevant half of client routing: it is the only
 * thing standing between the catch-all and every real route, AND the final gate
 * inside `safeReturnTo`. Both are pure, so they are tested directly rather than
 * through HTTP — `test/routing-shell.test.ts` proves the wiring.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ROUTE_DEFAULT_TAB,
  ROUTE_TABS,
  injectBase,
  isShellPath,
  resolvesToShellFile,
  safeReturnTo,
} from '../src/routing/paths.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ROUTER_SRC = fs.readFileSync(path.join(dir, '..', 'frontend', 'scripts', '00-router.js'), 'utf8');
const SHELL_SRC = fs.readFileSync(path.join(dir, '..', 'frontend', 'index.html'), 'utf8');

describe('isShellPath — what the html shell owns', () => {
  it('accepts the approved route table: /, /<code>, /<tab>, /<code>/<tab>', () => {
    expect(isShellPath('/')).toBe(true); // row 4 — default project, default tab
    expect(isShellPath('/rt-test')).toBe(true); // row 2 — project, tab implied
    expect(isShellPath('/schedules')).toBe(true); // row 3 — tab-only shorthand
    expect(isShellPath('/rt-test/schedules')).toBe(true); // row 1 — canonical
    expect(isShellPath('/zzz')).toBe(true); // row 6 — unknown code, client falls back
    expect(isShellPath('/zzz/schedules')).toBe(true); // row 5 — unknown code, valid tab
    expect(isShellPath('/admin')).toBe(true); // row 7 — non-admin falls back client-side
  });

  it('serves every one of the six tabs, under a project and bare', () => {
    for (const tab of ROUTE_TABS) {
      expect(isShellPath(`/rt-837/${tab}`)).toBe(true);
      expect(isShellPath(`/${tab}`)).toBe(true);
    }
  });

  it('tolerates exactly one trailing slash', () => {
    expect(isShellPath('/rt-test/')).toBe(true);
    expect(isShellPath('/rt-test/schedules/')).toBe(true);
    expect(isShellPath('//')).toBe(false);
    expect(isShellPath('/rt-test//schedules')).toBe(false);
  });

  it('NEVER shadows a server route — the whitelist rejects reserved segments outright', () => {
    expect(isShellPath('/api')).toBe(false);
    expect(isShellPath('/api/projects')).toBe(false);
    expect(isShellPath('/api/pipeline')).toBe(false); // a real tab name under /api
    expect(isShellPath('/auth')).toBe(false);
    expect(isShellPath('/auth/google')).toBe(false);
    expect(isShellPath('/healthz')).toBe(false);
    expect(isShellPath('/__test')).toBe(false);
    expect(isShellPath('/__test/login')).toBe(false);
  });

  it('rejects anything that is not one or two lower-case code segments', () => {
    expect(isShellPath('/a/b/c')).toBe(false); // three segments
    expect(isShellPath('/favicon.ico')).toBe(false); // a dot is never a segment
    expect(isShellPath('/index.html')).toBe(false); // served by its own redirect
    expect(isShellPath('/RT-Test')).toBe(false); // upper case
    expect(isShellPath('/rt-test/Schedules')).toBe(false); // upper-case tab
    expect(isShellPath('/rt-test/zzz')).toBe(false); // second segment must be a known tab
    expect(isShellPath('/rt test')).toBe(false); // space
    expect(isShellPath('/rt_test')).toBe(false); // underscore
    expect(isShellPath('')).toBe(false);
    expect(isShellPath('rt-test')).toBe(false); // not base-relative
    expect(isShellPath('../etc')).toBe(false);
  });
});

/**
 * The unstamped-shell door. `isShellPath` rejects `/index.html` (it has a dot),
 * so the shell catch-all never serves it — but express.static sits in front and
 * WILL, and it resolves the path its own way first. A guard that compared the
 * literal string missed eight working spellings; every one of them handed the
 * browser a shell with no `window.SIRIUS_BASE`, i.e. BASE='' and a dead app
 * under BASE_PATH. These cases are the regression.
 */
describe('resolvesToShellFile — every spelling that reaches the raw shell', () => {
  it('catches the literal path', () => {
    expect(resolvesToShellFile('/index.html')).toBe(true);
  });

  it('catches percent-encoded spellings — serve-static decodes before it looks at disk', () => {
    expect(resolvesToShellFile('/index%2Ehtml')).toBe(true);
    expect(resolvesToShellFile('/index%2ehtml')).toBe(true);
    expect(resolvesToShellFile('/%69ndex.html')).toBe(true);
    expect(resolvesToShellFile('/%2findex.html')).toBe(true);
    expect(resolvesToShellFile('/%2F%2Findex.html')).toBe(true);
    expect(resolvesToShellFile('/%2e%2f%69ndex%2ehtml')).toBe(true);
  });

  it('catches repeated and dot segments — serve-static normalizes them away', () => {
    expect(resolvesToShellFile('//index.html')).toBe(true);
    expect(resolvesToShellFile('///index.html')).toBe(true);
    expect(resolvesToShellFile('/./index.html')).toBe(true);
    expect(resolvesToShellFile('/foo/../index.html')).toBe(true);
    expect(resolvesToShellFile('/a/b/../../index.html')).toBe(true);
  });

  it('catches case variants — dev serves from a case-insensitive filesystem', () => {
    expect(resolvesToShellFile('/INDEX.HTML')).toBe(true);
    expect(resolvesToShellFile('/Index.html')).toBe(true);
  });

  it('keeps the trailing-slash spelling Express tolerated before', () => {
    expect(resolvesToShellFile('/index.html/')).toBe(true);
    expect(resolvesToShellFile('/index.html%2f')).toBe(true);
  });

  it('leaves every real route and in-app path alone', () => {
    expect(resolvesToShellFile('/')).toBe(false);
    expect(resolvesToShellFile('/rt-test/pipeline')).toBe(false);
    expect(resolvesToShellFile('/api/projects')).toBe(false);
    expect(resolvesToShellFile('/auth/google')).toBe(false);
    expect(resolvesToShellFile('/healthz')).toBe(false);
    expect(resolvesToShellFile('/favicon.ico')).toBe(false);
    expect(resolvesToShellFile('/assets/index.html.map')).toBe(false);
    expect(resolvesToShellFile('/index.htm')).toBe(false);
    expect(resolvesToShellFile('/index.html.')).toBe(false);
    expect(resolvesToShellFile('/notindex.html')).toBe(false);
  });

  it('rejects what send.js rejects rather than guessing at it', () => {
    expect(resolvesToShellFile('/index.html%00')).toBe(false); // NUL → 400 upstream
    expect(resolvesToShellFile('/index%FFhtml')).toBe(false); // malformed escape → 400
    expect(resolvesToShellFile('index.html')).toBe(false); // not base-relative
    expect(resolvesToShellFile('')).toBe(false);
  });
});

describe('safeReturnTo — a whitelist, so an open redirect is not expressible', () => {
  it('accepts only in-app paths the shell owns, and returns them path-only', () => {
    expect(safeReturnTo('/')).toBe('/');
    expect(safeReturnTo('/rt-test')).toBe('/rt-test');
    expect(safeReturnTo('/schedules')).toBe('/schedules');
    expect(safeReturnTo('/rt-test/schedules')).toBe('/rt-test/schedules');
  });

  it('discards query and hash rather than echoing them into the redirect', () => {
    expect(safeReturnTo('/rt-test/schedules?a=1#b')).toBe('/rt-test/schedules');
    expect(safeReturnTo('/rt-test?next=http://evil.example')).toBe('/rt-test');
  });

  it('rejects every off-site form', () => {
    expect(safeReturnTo('http://evil.example/x')).toBeNull();
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('//evil.example')).toBeNull(); // protocol-relative
    expect(safeReturnTo('/\\evil')).toBeNull(); // legacy backslash proto-relative
    expect(safeReturnTo('javascript:alert(1)')).toBeNull();
    expect(safeReturnTo('/x%0d%0aSet-Cookie:evil=1')).toBeNull(); // encoded
    expect(safeReturnTo('/x\r\nSet-Cookie: evil=1')).toBeNull(); // decoded by express
  });

  it('rejects server routes, so login can never land on a JSON endpoint', () => {
    expect(safeReturnTo('/api/projects')).toBeNull();
    expect(safeReturnTo('/auth/google')).toBeNull(); // no redirect loop
    expect(safeReturnTo('/healthz')).toBeNull();
  });

  it('rejects non-strings, the empty string and anything over 128 chars', () => {
    expect(safeReturnTo('')).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(42)).toBeNull();
    expect(safeReturnTo(['/rt-test'])).toBeNull(); // express gives arrays for repeated params
    expect(safeReturnTo('/' + 'a'.repeat(200))).toBeNull();
  });
});

describe('injectBase — the shell always knows its own mount prefix', () => {
  it('stamps the exact tag for a prefixed mount and for the domain root', () => {
    expect(injectBase('<head>\n<title>x</title>', '/sirius')).toContain(
      '<script>window.SIRIUS_BASE="/sirius"</script>',
    );
    // Dev: falsy but PRESENT, so `window.SIRIUS_BASE ?? ''` reads it as the
    // empty base rather than falling back by accident.
    expect(injectBase('<head>\n<title>x</title>', '')).toContain('<script>window.SIRIUS_BASE=""</script>');
  });

  it('lands inside <head>, before the injected bundle that reads it', () => {
    const out = injectBase(SHELL_SRC, '/sirius');
    const tag = out.indexOf('window.SIRIUS_BASE');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeLessThan(out.indexOf('</head>'));
    expect(tag).toBeLessThan(out.indexOf('<!-- inject:js -->'));
  });

  it('leaves the build markers alone — build.js owns those', () => {
    const out = injectBase(SHELL_SRC, '/sirius');
    expect(out).toContain('<!-- inject:css -->');
    expect(out).toContain('<!-- inject:templates -->');
    expect(out).toContain('<!-- inject:js -->');
  });
});

/**
 * The tab list exists twice — here and in the browser script — because the
 * frontend has no module system and the server cannot import a browser script.
 * Drift between them would silently 404 a tab the client still links to, so the
 * duplication is pinned rather than trusted.
 */
describe('drift guard — server and client agree on the tabs', () => {
  it('frontend/scripts/00-router.js declares the same ROUTE_TABS', () => {
    const match = /const ROUTE_TABS = (\[[^\]]*\]);/.exec(ROUTER_SRC);
    expect(match, 'no ROUTE_TABS literal in the shipped router source').not.toBeNull();
    expect(JSON.parse(match![1]!.replace(/'/g, '"'))).toEqual([...ROUTE_TABS]);
  });

  it('frontend/scripts/00-router.js declares the same default tab', () => {
    const match = /const ROUTE_DEFAULT_TAB = '([a-z]+)';/.exec(ROUTER_SRC);
    expect(match, 'no ROUTE_DEFAULT_TAB literal in the shipped router source').not.toBeNull();
    expect(match![1]).toBe(ROUTE_DEFAULT_TAB);
  });
});
