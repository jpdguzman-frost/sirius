/**
 * Frontend build script (ARES convention — no bundler).
 * Assembles public/index.html from frontend/ source files.
 *
 * Usage:  node frontend/build.js
 *
 * Replaces markers in frontend/index.html:
 *   <!-- inject:css -->        → concatenated styles/*.css  (wrapped in <style>)
 *   <!-- inject:templates -->  → concatenated templates/*.html
 *   <!-- inject:js -->         → concatenated scripts/*.js  (wrapped in <script>)
 *
 * Every Ractive template is parse-checked — a template that will not parse
 * fails the build, not the browser.
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

const shell = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const css = readDir('styles', '.css');
const templates = readDir('templates', '.html', { parseCheck: true });
const js = readDir('scripts', '.js');

const out = shell
  .replace('<!-- inject:css -->', `<style>\n${css}\n</style>`)
  .replace('<!-- inject:templates -->', templates)
  .replace('<!-- inject:js -->', `<script>\n${js}\n</script>`);

const publicDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'index.html'), out);

console.log(`[build] public/index.html written (${out.length} bytes)`);
