# frontend/CLAUDE.md — durable law for frontend/ work

Auto-loaded when working under `frontend/`. This file stands alone; where a rule
has an authoritative home elsewhere, this file points and never restates.

_last-verified: 2026-08-18_

## Build convention [frontend/build.js]

No bundler. `node frontend/build.js` assembles `public/index.html` from
`frontend/index.html` by replacing three markers: `<!-- inject:css -->` →
concatenated `styles/*.css` (in `<style>`), `<!-- inject:templates -->` → the
composed Ractive template, `<!-- inject:js -->` → concatenated `scripts/*.js`
(in `<script>`).

The template is `templates/layout.html` — `tpl-app` wrapper, icon sprite, shell
nav, banner, the `<main>` panel — carrying two markers of its own:
`<!-- inject:partials -->` → `templates/partials/*.html`, the `{{#partial}}`
registry; `<!-- inject:views -->` → `templates/views/*.html`, one file per tab.
Every concatenation is sorted filename order — in all four directories the
numeric prefixes ARE the load order. Every Ractive template is parse-checked at
build, each piece alone and then the composed whole: a template that will not
parse fails the build, not the browser.

Tests read shipped source through `test/helpers/source.ts`, never a filename —
a guard naming one file breaks at the next split. `template()` calls build.js's
exported `composeTemplate()` rather than rebuilding the composition; importing
build.js writes nothing, only running it directly does.

## Ractive hazards [authoritative here since the 2026-08-18 rewire; `{{! }}` incident: docs/history/state-log/2026-08-18.md, batch 7]

- Triple-mustache dynamic member access renders empty — use helpers.
- `{{! … }}` comments in ELEMENT-CONTENT position leak text after the first
  `}}` (an AST-scan test guards it). `{{!expr}}` in attributes is a negation
  and fine.
- `{{#partial}}` registers template-wide ONLY at the top level. Nested in an
  element it goes local, every `{{>call}}` elsewhere renders empty, and the
  build still passes. Hence `<!-- inject:partials -->` above the chrome in
  `layout.html`; guard `test/template-partials.test.ts`.

## Performance law [docs/history/state-log/2026-08-18.md, review sweep]

- Any helper called from a template expression runs per row per render —
  `rowWarning(row)` sat in seven template positions while the Pipeline table
  re-renders on every search keystroke. Derived per-row data is stamped once in
  `loadAll`'s stamp loop beside `r.blob`, never computed in the template.
- Never interleave a layout read (`scrollWidth`) with a style write that a live
  selector keys on (`data-clipped`) — that forces one full layout per changed
  element. Split into a read pass, then a write pass (`refreshClips` is the
  precedent).

## Comments can trip source-regex guards [docs/history/state-log/2026-08-18.md — two incidents, batches 8 and 9]

Several tests read RAW source text, comments included. A bare decimal in an
app-script block comment read as a second copy of a guarded constant (batch 8);
a CSS comment naming the four phase colour classes broke "declares each phase
colour exactly once in the whole stylesheet" (batch 9). In guarded files: spell
numbers in words inside comments, and do not name guarded selectors or
constants in comment prose. Both times the guard was right — reword the
comment, never the guard.

## Planner and tab law — pointers

- Before touching the Gantt/planner, read `specs/001-sirius-v1/gantt-rules.md`
  — especially §1, the drag contract (a drag source must stay hit-testable in
  every state; standing guard `test/drag-hittest.test.ts`)
  [gantt-rules.md §1; docs/history/state-log/2026-08-18.md, batches 7–9].
- Pipeline mechanism notes: `specs/001-sirius-v1/pipeline-frame-notes.md`.
  Requests: `specs/001-sirius-v1/requests-frame-notes.md`.

## Constitution

Anything constitution-level — the write registry, timezone rules, the stack,
the invariants — is governed by the root `CLAUDE.md`. Do not restate it here
beyond this pointer.
