/**
 * Every `{{>name}}` in the shipped template resolves to a partial registered
 * at the ROOT of that template.
 *
 * This became a live failure mode the moment the template stopped being one
 * file. Ractive only registers a `{{#partial}}` block as a template-wide
 * partial when the block sits at the top level; a definition that ends up
 * nested inside an element becomes local to that element — and the failure is
 * SILENT. The nested form parses without complaint, so `assertParses` in
 * `frontend/build.js` passes, and every `{{>name}}` elsewhere then renders
 * nothing at all. A blank strip in the page, a green build, no console error
 * worth the name.
 *
 * The composition puts `<!-- inject:partials -->` above the shell chrome in
 * `templates/layout.html` precisely so the registry lands at the top level.
 * Nothing else holds that marker in place, which is what this guard is for:
 * move it inside `<header>` or `<main>` and both assertions below go red.
 *
 * Read through `test/helpers/source.ts` (test/CLAUDE.md rule 8), and the
 * assertion is derived from the parsed AST rather than from a source regex —
 * the AST is the same structure Ractive itself consults when it looks a
 * partial up.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import RactiveModule from 'ractive';
import { describe, expect, it } from 'vitest';
import { appScripts, template } from './helpers/source.ts';

/**
 * Ractive's ESM typings sit in a CommonJS package, so the default import types
 * as the namespace and hides `parse`. Named here rather than fought with in the
 * vendor typings — same reasoning, and same one-member shape, as the harness in
 * `test/helpers/gantt-render.ts`.
 */
const Ractive = RactiveModule as unknown as { parse(template: string): unknown };

/**
 * What the browser actually parses. `40-app-state.js` passes
 * `template: '#tpl-app'`, so Ractive takes the script element's INNER html —
 * the wrapper tag itself is never part of the template.
 */
function innerTemplate(src: string = template()): string {
  const inner = /<script id="tpl-app"[^>]*>([\s\S]*)<\/script>/.exec(src);
  if (!inner) throw new Error('template-partials: no <script id="tpl-app"> wrapper in the composed template');
  return inner[1]!;
}

interface Node {
  t?: number;
  r?: string;
  p?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Every partial NAME invoked anywhere in the tree (`{{>name}}` parses to `t: 8`). */
function callsIn(nodes: unknown): string[] {
  if (Array.isArray(nodes)) return nodes.flatMap(callsIn);
  if (!nodes || typeof nodes !== 'object') return [];
  const node = nodes as Node;
  const here = node.t === 8 && typeof node.r === 'string' ? [node.r] : [];
  return [...here, ...Object.values(node).flatMap(callsIn)];
}

/**
 * Names of partials defined NON-top-level. Ractive hangs a top-level registry
 * off the parsed root as `p`; a definition nested inside an element hangs the
 * same key off that element instead, and that copy is visible to nothing else.
 */
function nestedDefinitionsIn(nodes: unknown): string[] {
  if (Array.isArray(nodes)) return nodes.flatMap(nestedDefinitionsIn);
  if (!nodes || typeof nodes !== 'object') return [];
  const node = nodes as Node;
  const here = node.p && typeof node.p === 'object' ? Object.keys(node.p) : [];
  return [...here, ...Object.values(node).flatMap(nestedDefinitionsIn)];
}

/** Registered names, unresolved calls, and any nested definitions, for one template. */
function partialAudit(src: string) {
  const ast = Ractive.parse(src) as { t: unknown; p?: Record<string, unknown> };
  const registered = Object.keys(ast.p ?? {});
  const called = [...new Set(callsIn(ast.t))].sort();
  return {
    registered: registered.sort(),
    called,
    unresolved: called.filter((name) => !registered.includes(name)),
    nested: [...new Set(nestedDefinitionsIn(ast.t))].sort(),
  };
}

describe('the shipped template registers its partials where Ractive can find them', () => {
  const audit = partialAudit(innerTemplate());

  it('registers at least one partial and calls at least one', () => {
    // Without this, an empty template would satisfy every assertion below.
    expect(audit.registered.length).toBeGreaterThan(0);
    expect(audit.called.length).toBeGreaterThan(0);
  });

  it('resolves every {{>partial}} call against the top-level registry', () => {
    expect(audit.unresolved).toEqual([]);
  });

  it('defines no partial nested inside an element, where only that element could see it', () => {
    expect(audit.nested).toEqual([]);
  });

  it('but the audit does catch a nested definition (negative control)', () => {
    // The same registry, moved one element deeper: parses clean, renders empty.
    const sunk = partialAudit('<header>{{#partial strip}}<b>hi</b>{{/partial}}</header><main>{{>strip}}</main>');
    expect(sunk.nested).toEqual(['strip']);
    expect(sunk.unresolved).toEqual(['strip']);
  });
});

/* ==========================================================================
 * The unfinished-screen background
 * ========================================================================== */

describe('the grey wash reaches only tabs that have not been rebuilt', () => {
  /* THE DEFECT THIS ENCODES: the rule used to be written as a list of tabs to
     EXEMPT from the wash, so every rebuild had to remember to edit it — and two
     did not. Sprint Schedules and Deadlines were finished screens rendering on
     the unfinished-screen background for weeks, and nothing said so, because a
     background colour is not something any assertion was looking at.

     Asserted as the RULE — a tab with a rulebook is a rebuilt tab and must not
     be washed — rather than as today's list, so the guard keeps working when
     Admin is eventually designed. */
  /* Each tab's rulebook, by the name(s) that count as one. A LIST rather than a
     single name because a rebuild can rename its own law: Deadlines was rebuilt
     whole on 2026-09-05 (owls #74/#75, PLAN.md block 3), and its rulebook
     becomes `deadlines-rules.md` (R-d2-*) while `deadlines-frame-notes.md` is
     archived behind the gantt-frame-notes banner. The main thread writes the
     new file at CLOSE, so until then EITHER name proves the same thing this
     guard has always cared about: the tab has a law on disk.
     2026-09-05 — the main thread narrows this entry to the single new name at
     CLOSE, once the file exists. */
  const REBUILT_TABS: Record<string, string[]> = {
    requests: ['requests-frame-notes.md'],
    pipeline: ['pipeline-frame-notes.md'],
    schedules: ['gantt-frame-notes.md'], // the planner's law predates the tab's name
    deadlines: ['deadlines-rules.md', 'deadlines-frame-notes.md'],
  };

  const specDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'specs', '001-sirius-v1');
  const SRC = template();
  const UI_TABS = [...appScripts().matchAll(/\{ id: '([a-z]+)', label: '/g)].map((m) => m[1]!);
  const washLine = (() => {
    const at = SRC.indexOf('legacybg');
    expect(at, 'the wash has been renamed or removed — re-point this guard').toBeGreaterThan(-1);
    return SRC.slice(SRC.lastIndexOf('<main', at), SRC.indexOf('>', at) + 1);
  })();

  it('every tab named as rebuilt really does have a rulebook on disk', () => {
    for (const [tab, names] of Object.entries(REBUILT_TABS)) {
      const found = names.some((n) => fs.existsSync(path.join(specDir, n)));
      expect(found, `${tab} claims a rulebook that is not there: ${names.join(' or ')}`).toBe(true);
    }
  });

  it('and none of them is washed', () => {
    for (const tab of Object.keys(REBUILT_TABS)) {
      expect(washLine, `${tab} has been rebuilt but still renders on the unfinished-screen background`).not.toContain(
        `'${tab}'`,
      );
    }
  });

  it('the wash is spelled as the EXCEPTION, so a rebuild does not have to remember it', () => {
    // one tab named, and it is the one being washed — not a list of exemptions
    const named = [...washLine.matchAll(/activeTab === '([a-z]+)'/g)].map((m) => m[1]!);
    expect(named, 'the wash is back to listing exemptions — a rebuild will forget one').toHaveLength(1);
    expect(REBUILT_TABS[named[0]!], `${named[0]} has a rulebook and should not be the washed one`).toBeUndefined();
  });

  it('the wash still exists for the tab that has genuinely never been designed', () => {
    expect(UI_TABS, 'the tab list moved').toContain('admin');
    expect(washLine).toContain("'admin'");
    expect(fs.existsSync(path.join(specDir, 'admin-frame-notes.md')), 'Admin has a rulebook now — stop washing it').toBe(
      false,
    );
  });
});
