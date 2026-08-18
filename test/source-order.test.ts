/**
 * test/helpers/source.ts claims `appScripts()` is byte-equivalent to what
 * frontend/build.js ships inside the one `<script>` (banners aside), and that
 * `template()` is what build.js composes into `<script id="tpl-app">`. This
 * suite checks both against build.js's OWN `readDir` and `composeTemplate` —
 * sliced out of the shipped build script and executed, not retyped
 * (test/CLAUDE.md rule 2: derive, don't copy) — over the real directories.
 *
 * The two halves prove different strengths, on purpose:
 *   • scripts — `appScripts()` re-implements the enumeration, so the order and
 *     byte assertions are a true cross-check: change how build.js enumerates or
 *     joins and this goes red naming the helper as the thing to re-align.
 *   • template — `template()` CALLS the composer, so it cannot disagree with a
 *     sliced copy of that same composer. The byte assertion guards the seam,
 *     not the composition: it goes red if the helper ever stops deriving (a
 *     hand-rolled reassembly, a single-file read). The composition itself is
 *     guarded independently by the banner-order assertion, which builds the
 *     expected sequence from `readDir` rather than from the composed output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appScriptFiles, appScripts, template } from './helpers/source.ts';

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const BUILD_SRC = fs.readFileSync(path.join(FRONTEND, 'build.js'), 'utf8');

/**
 * One `function name(…) { … }` declaration, sliced out of build.js. The
 * parameter list is paren-matched FIRST (readDir's `{ parseCheck = false } = {}`
 * default would fool a naive brace counter), then the body is brace-matched
 * from its own `{`. A leading `export` is dropped so the slice can be evaluated
 * outside a module.
 */
function sliceFn(src: string, name: string): string {
  const decl = new RegExp(`\\n(?:export )?function ${name}\\(`).exec(src);
  if (!decl) {
    throw new Error(`source-order: build.js no longer declares \`function ${name}(\` — re-derive helpers/source.ts`);
  }
  const at = decl.index;
  let parens = 0;
  let bodyAt = -1;
  for (let i = src.indexOf('(', at); i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')' && --parens === 0) {
      bodyAt = src.indexOf('{', i);
      break;
    }
  }
  if (bodyAt < 0) throw new Error(`source-order: \`${name}\` in build.js has no body`);
  let depth = 0;
  for (let i = bodyAt; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1).replace('\nexport function', '\nfunction');
  }
  throw new Error(`source-order: unterminated \`${name}\` in build.js`);
}

/**
 * The shipped enumerator and the shipped composer, executed with the same
 * fs/path and the same frontend `__dirname` build.js uses. `assertParses` is
 * stubbed — the real build still parse-checks; here only the bytes matter.
 */
const [readDir, composeTemplate] = new Function(
  'fs',
  'path',
  '__dirname',
  'assertParses',
  `${sliceFn(BUILD_SRC, 'readDir')}\n${sliceFn(BUILD_SRC, 'composeTemplate')}\nreturn [readDir, composeTemplate];`,
)(fs, path, FRONTEND, () => {}) as [(dir: string, ext: string) => string, () => string];

/** The `templates/<dir>/<file>` paths a composed chunk names, in banner order. */
function bannerPaths(html: string): string[] {
  return [...html.matchAll(/<!-- ==== (templates\/\S+) ==== -->/g)].map((m) => m[1]!);
}

describe('helpers/source.ts mirrors the shipped build', () => {
  it('enumerates the scripts in the exact order build.js ships them', () => {
    const order = [...readDir('scripts', '.js').matchAll(/\/\* ==== scripts\/(.+) ==== \*\//g)].map((m) => m[1]!);
    expect(order.length).toBeGreaterThan(0);
    expect(appScriptFiles()).toEqual(order);
  });

  it('joins the same bytes the shipped bundle carries (banners aside)', () => {
    const banner = /^\/\* ==== scripts\/.+ ==== \*\/\n/gm;
    expect(readDir('scripts', '.js').replace(banner, '')).toBe(appScripts());
  });

  it('carries every partial then every view, each in build.js filename order', () => {
    const partials = bannerPaths(readDir('templates/partials', '.html'));
    const views = bannerPaths(readDir('templates/views', '.html'));
    expect(partials.length).toBeGreaterThan(0);
    expect(views.length).toBeGreaterThan(0);
    expect(bannerPaths(template())).toEqual([...partials, ...views]);
  });

  it('derives the template from build.js rather than reassembling it', () => {
    expect(template()).toBe(composeTemplate());
  });
});
