/**
 * test/helpers/source.ts claims `appScripts()` is byte-equivalent to what
 * frontend/build.js ships inside the one `<script>` (banners aside). This
 * suite proves it by EXECUTING build.js's OWN `readDir` — sliced out of the
 * shipped build script, not retyped (test/CLAUDE.md rule 2: derive, don't
 * copy) — against the real directory, then comparing both the enumeration
 * order and the joined bytes. If build.js ever changes how it enumerates or
 * joins scripts, this goes red naming the helper as the thing to re-align.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appScriptFiles, appScripts } from './helpers/source.ts';

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const BUILD_SRC = fs.readFileSync(path.join(FRONTEND, 'build.js'), 'utf8');

/**
 * `function readDir(…) { … }`, sliced out of build.js. The parameter list is
 * paren-matched FIRST (its `{ parseCheck = false } = {}` default would fool a
 * naive brace counter), then the body is brace-matched from its own `{`.
 */
function sliceReadDir(src: string): string {
  const at = src.indexOf('\nfunction readDir(');
  if (at < 0) {
    throw new Error('source-order: build.js no longer declares `function readDir(` — re-derive helpers/source.ts');
  }
  let parens = 0;
  let bodyAt = -1;
  for (let i = src.indexOf('(', at); i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')' && --parens === 0) {
      bodyAt = src.indexOf('{', i);
      break;
    }
  }
  if (bodyAt < 0) throw new Error('source-order: `readDir` in build.js has no body');
  let depth = 0;
  for (let i = bodyAt; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('source-order: unterminated `readDir` in build.js');
}

/**
 * The shipped enumerator, executed with the same fs/path and the same
 * frontend `__dirname` build.js uses. `assertParses` is stubbed: readDir only
 * reaches it under `parseCheck: true`, which the scripts call never passes.
 */
const readDir = new Function('fs', 'path', '__dirname', 'assertParses', `${sliceReadDir(BUILD_SRC)}\nreturn readDir;`)(
  fs,
  path,
  FRONTEND,
  () => {},
) as (dir: string, ext: string) => string;

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
});
