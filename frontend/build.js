/**
 * Frontend build script (ARES convention — no bundler).
 * Assembles public/index.html from frontend/ source files.
 *
 * Usage:  node frontend/build.js
 *
 * Replaces markers in frontend/index.html:
 *   <!-- inject:css -->        → concatenated styles/*.css  (wrapped in <style>)
 *   <!-- inject:templates -->  → the composed Ractive template
 *   <!-- inject:js -->         → concatenated scripts/*.js  (wrapped in <script>)
 *
 * The template is composed from templates/layout.html, which carries the
 * script wrapper, the shell chrome and the <main> panel, plus two markers of
 * its own:
 *   <!-- inject:partials -->   → concatenated templates/partials/*.html
 *   <!-- inject:views -->      → concatenated templates/views/*.html
 * Filenames sort, so the numeric prefixes are the order the pieces land in.
 *
 * Every Ractive template is parse-checked — each piece on its own, then the
 * composed whole — so a template that will not parse fails the build, not the
 * browser.
 *
 * Importing this module writes nothing: `composeTemplate()` is the seam tests
 * derive the shipped template from, and the file-writing path runs only when
 * node runs this file directly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ractive from 'ractive';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertParses(name, body) {
  try {
    Ractive.parse(body);
  } catch (err) {
    throw new Error(`Ractive template failed to parse: ${name}\n${err.message}`, { cause: err });
  }
}

function readDir(dir, ext, { parseCheck = false } = {}) {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) return '';
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => {
      const body = fs.readFileSync(path.join(full, f), 'utf8');
      if (parseCheck) assertParses(`${dir}/${f}`, body);
      const banner = ext === '.html' ? `<!-- ==== ${dir}/${f} ==== -->` : `/* ==== ${dir}/${f} ==== */`;
      return `${banner}\n${body}`;
    })
    .join('\n');
}

/** The shipped Ractive template: layout + partial registry + per-tab views. */
export function composeTemplate() {
  const layout = fs.readFileSync(path.join(__dirname, 'templates', 'layout.html'), 'utf8');
  assertParses('templates/layout.html', layout);

  const composed = layout
    .replace('<!-- inject:partials -->', readDir('templates/partials', '.html', { parseCheck: true }))
    .replace('<!-- inject:views -->', readDir('templates/views', '.html', { parseCheck: true }));

  assertParses('templates/layout.html (composed)', composed);
  return composed;
}

function main() {
  const shell = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  const css = readDir('styles', '.css');
  const templates = composeTemplate();
  const js = readDir('scripts', '.js');

  const out = shell
    .replace('<!-- inject:css -->', `<style>\n${css}\n</style>`)
    .replace('<!-- inject:templates -->', templates)
    .replace('<!-- inject:js -->', `<script>\n${js}\n</script>`);

  const publicDir = path.join(__dirname, '..', 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), out);

  // Buffer.byteLength, not .length — `·`, `—` and `✓` are multibyte, so the
  // string length under-reports the written file by ~1.4KB.
  console.log(`[build] public/index.html written (${Buffer.byteLength(out)} bytes)`);
}

/** This file's path as node would report it for a direct run, symlinks resolved. */
function realPath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// Node resolves symlinks in import.meta.url but not in argv[1], so both sides
// are realpathed here — otherwise an absolute run through a release symlink
// (…/current -> …/releases/N) would match nothing and write nothing, silently.
if (process.argv[1] && realPath(process.argv[1]) === realPath(fileURLToPath(import.meta.url))) {
  main();
}
