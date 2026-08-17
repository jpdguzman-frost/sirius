/**
 * Owl #25 — the expanded Suggest bar's three counts (node 262:34499).
 *
 * The frozen contract keeps all three CLIENT-side: they are pure reads of the
 * /suggest payload the planner already holds, so no server field was added and
 * no re-forecast happens in the browser (invariants 5–7). That puts the rulings
 * that matter — R-a (flagged and hard-heavy are independent counts in different
 * units) and R-e (0 proposed still shows the bar, with Accept dead) — outside
 * the server suite, and the repo has no browser test runner.
 *
 * So, exactly as test/planner-weeks.test.ts does, this file EXECUTES THE
 * SHIPPED TEXT of the computeds straight out of `frontend/scripts/01-app.js`.
 * Nothing is retyped: if a computed regresses in the real file, this fails.
 * The server half of the contract — that `plan`, `notes` and `strain` stay on
 * the wire — lives in test/schedule.test.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderSuggestBar } from './helpers/gantt-render.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const APP = fs.readFileSync(path.join(dir, '..', 'frontend', 'scripts', '01-app.js'), 'utf8');

/**
 * Slice one top-level declaration out of the source (same extractor shape as
 * test/planner-weeks.test.ts): a `function` ends with the brace that closes its
 * body, a `const` with the first `;` outside any bracket.
 */
function decl(src: string, name: string): string {
  const fnAt = src.indexOf(`\nfunction ${name}(`);
  if (fnAt >= 0) {
    let depth = 0;
    for (let i = src.indexOf('{', fnAt); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return src.slice(fnAt, i + 1);
    }
    throw new Error(`suggest-counts: unterminated function \`${name}\``);
  }
  const at = src.indexOf(`\nconst ${name} =`);
  if (at < 0) throw new Error(`suggest-counts: no declaration of \`${name}\` in the shipped frontend source`);
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i]!;
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`suggest-counts: unterminated declaration \`${name}\``);
}

/** Slice a Ractive `computed` method (`  name() { … }`) by brace matching. */
function method(src: string, name: string): string {
  const at = src.indexOf(`\n    ${name}() {`);
  if (at < 0) throw new Error(`suggest-counts: no computed \`${name}()\` in the shipped frontend source`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`suggest-counts: unterminated computed \`${name}()\``);
}

interface Suggest {
  plan?: Record<string, string> | null;
  notes?: Record<string, string> | null;
  strain?: unknown;
}
interface Harness {
  set(s: Suggest | null): void;
  proposed(): number;
  flagged(): number;
  hardHeavy(): number;
  blockedWhy(): string;
  offWeeks(): string[];
}

const COMPUTEDS = ['suggestOffWeeks', 'suggestOffWeeksText', 'suggestProposed', 'suggestFlagged', 'suggestHardHeavy', 'suggestBlockedWhy'];

// The computeds read `this.get(key)`; Ractive resolves a key to another
// computed transparently, so the harness `get` does the same — that is what
// lets suggestBlockedWhy consume suggestOffWeeks and suggestProposed unmodified.
const harness = new Function(`
  ${decl(APP, 'isoOf')}
  ${decl(APP, 'mondayIso')}
  const computed = { ${COMPUTEDS.map((n) => method(APP, n)).join(', ')} };
  const DATA = { suggest: null };
  const ctx = { get: (k) => (Object.prototype.hasOwnProperty.call(computed, k) ? computed[k].call(ctx) : DATA[k]) };
  return {
    set: (s) => { DATA.suggest = s; },
    proposed: () => computed.suggestProposed.call(ctx),
    flagged: () => computed.suggestFlagged.call(ctx),
    hardHeavy: () => computed.suggestHardHeavy.call(ctx),
    blockedWhy: () => computed.suggestBlockedWhy.call(ctx),
    offWeeks: () => computed.suggestOffWeeks.call(ctx),
  };
`)() as Harness;

describe('N proposed — the rows the suggestion would reslot', () => {
  it('is the size of `plan`, i.e. exactly what Accept posts to /replot', () => {
    harness.set({ plan: { c1: '2026-08-03', c2: '2026-08-10', c3: '2026-08-10' }, notes: {}, strain: [] });
    expect(harness.proposed()).toBe(3);
  });

  it('is 0 with no suggestion and 0 with an empty plan', () => {
    harness.set(null);
    expect(harness.proposed()).toBe(0);
    harness.set({ plan: {}, notes: {}, strain: [] });
    expect(harness.proposed()).toBe(0);
  });
});

describe('N flagged — proposals the planner had to compromise', () => {
  it('counts only ids present in BOTH plan and notes', () => {
    harness.set({
      plan: { c1: '2026-08-03', c2: '2026-08-10', c3: '2026-08-17' },
      notes: { c2: 'placed beyond the hard-item ceiling' },
      strain: [],
    });
    expect(harness.flagged()).toBe(1);
  });

  it('ignores a note on a card the planner could NOT place (not a proposal)', () => {
    harness.set({
      plan: { c1: '2026-08-03' },
      notes: { c9: 'no week has capacity in the visible horizon', c8: 'cannot meet deadline from any week in view' },
      strain: [],
    });
    expect(harness.flagged()).toBe(0);
    expect(harness.proposed()).toBe(1); // and the unplaceable rows are not proposed either
  });

  it('counts each of the four planner note kinds when it lands on a proposal', () => {
    harness.set({
      plan: { c1: 'w', c2: 'w', c3: 'w', c4: 'w', c5: 'w' },
      notes: {
        c1: 'no week has capacity in the visible horizon',
        c2: 'placed beyond the hard-item ceiling',
        c3: 'cannot meet deadline from any week in view',
        c4: 'deferred — 🛑 waiting on client',
      },
      strain: [],
    });
    expect(harness.flagged()).toBe(4);
  });

  it('is 0 when notes is missing or null', () => {
    harness.set({ plan: { c1: 'w' }, strain: [] });
    expect(harness.flagged()).toBe(0);
    harness.set({ plan: { c1: 'w' }, notes: null, strain: [] });
    expect(harness.flagged()).toBe(0);
  });
});

describe('N hard-heavy — weeks over the measured ceiling UNDER THE PROPOSED PLAN', () => {
  it('is the length of `strain`, read from the server and never recomputed', () => {
    harness.set({ plan: { c1: 'w' }, notes: {}, strain: ['2026-08-03', '2026-08-17'] });
    expect(harness.hardHeavy()).toBe(2);
  });

  it('is 0 when strain is absent, null or not an array', () => {
    harness.set({ plan: { c1: 'w' }, notes: {} });
    expect(harness.hardHeavy()).toBe(0);
    harness.set({ plan: { c1: 'w' }, notes: {}, strain: null });
    expect(harness.hardHeavy()).toBe(0);
    harness.set({ plan: { c1: 'w' }, notes: {}, strain: 3 });
    expect(harness.hardHeavy()).toBe(0);
    harness.set(null);
    expect(harness.hardHeavy()).toBe(0);
  });
});

describe('R-a — flagged and hard-heavy are independent counts', () => {
  it('1 flagged beside 2 hard-heavy: neither clamps or derives the other', () => {
    harness.set({
      plan: { c1: '2026-08-03', c2: '2026-08-03', c3: '2026-08-10' },
      notes: { c3: 'placed beyond the hard-item ceiling' },
      strain: ['2026-08-03', '2026-08-10'],
    });
    expect(harness.proposed()).toBe(3);
    expect(harness.flagged()).toBe(1);
    expect(harness.hardHeavy()).toBe(2);
  });

  it('hard-heavy can exceed proposed — the units differ (weeks vs proposals)', () => {
    harness.set({ plan: { c1: '2026-08-03' }, notes: {}, strain: ['2026-08-03', '2026-08-10', '2026-08-17'] });
    expect(harness.proposed()).toBe(1);
    expect(harness.hardHeavy()).toBe(3);
  });
});

describe('R-e — a suggestion with nothing to apply', () => {
  it('shows 0 proposed and blocks Accept with the "nothing to apply" reason', () => {
    harness.set({ plan: {}, notes: {}, strain: [] });
    expect(harness.proposed()).toBe(0);
    expect(harness.blockedWhy()).toMatch(/nothing to apply/i);
  });

  it('leaves Accept live when there is something to apply', () => {
    harness.set({ plan: { c1: '2026-08-03' }, notes: {}, strain: [] });
    expect(harness.blockedWhy()).toBe(''); // falsy → the button is not disabled
  });

  it('the off-week tripwire takes precedence over the empty-plan reason', () => {
    // a Sunday key: the Manila-host bug the guard exists for
    harness.set({ plan: { c1: '2026-08-02' }, notes: {}, strain: [] });
    expect(harness.offWeeks()).toEqual(['2026-08-02']);
    expect(harness.blockedWhy()).toMatch(/not Mondays/);

    harness.set({ plan: {}, notes: {}, strain: [] });
    expect(harness.blockedWhy()).toMatch(/nothing to apply/i);
  });
});

describe('the bar itself (node 262:34499), rendered with Ractive', () => {
  it('replaces the Suggest button in its own slot, leaving Sprints and the note', () => {
    const resting = renderSuggestBar();
    expect(resting).toContain('Suggest plan');
    expect(resting).not.toContain('sgbar');

    const pending = renderSuggestBar({ suggest: { plan: {} }, suggestProposed: 7, suggestFlagged: 2, suggestHardHeavy: 3 });
    expect(pending).not.toContain('Suggest plan'); // the button gave up its slot
    expect(pending).toContain('7 proposed');
    expect(pending).toContain('2 flagged');
    expect(pending).toContain('3 hard-heavy');
    for (const html of [resting, pending]) {
      expect(html).toContain('Sprints');
      expect(html).toContain('Grab a row to reslot it.');
    }
  });

  it('drops the disabled attribute when there is no reason, and states it when there is', () => {
    // `disabled="{{suggestBlockedWhy}}"`: one computed drives both the state and
    // the tooltip, which only works because Ractive removes a falsy boolean attr
    const live = renderSuggestBar({ suggest: { plan: { c1: 'w' } }, suggestProposed: 1 });
    const accept = (html: string) => /<button class="fnbtn primary"[^>]*>Accept<\/button>/.exec(html)?.[0] ?? '';
    expect(accept(live)).not.toContain('disabled=');

    const dead = renderSuggestBar({ suggest: { plan: {} }, suggestProposed: 0, suggestBlockedWhy: 'Nothing to apply — this suggestion proposes no moves.' });
    expect(accept(dead)).toContain('disabled="Nothing to apply');
    expect(accept(dead)).toContain('title="Nothing to apply');
    expect(dead).toContain('0 proposed'); // R-e: the bar still shows
    expect(dead).toContain('Discard'); // and Discard still reverts
  });

  it('reuses the shared .pbadge recipe for the hard-heavy badge (drift rule)', () => {
    const pending = renderSuggestBar({ suggest: { plan: {} }, suggestHardHeavy: 1 });
    expect(pending).toMatch(/<span class="pbadge sgheavy"/);
    expect(pending).not.toMatch(/style=/); // no inline colour anywhere in the bar
  });

  it('announces itself politely rather than stealing focus', () => {
    const pending = renderSuggestBar({ suggest: { plan: {} } });
    const bar = /<div class="sgbar"[^>]*>/.exec(pending)?.[0] ?? '';
    expect(bar).toContain('role="status"'); // Ractive does not preserve attribute order
    expect(bar).toContain('aria-live="polite"');
    expect(pending).not.toContain('autofocus');
  });
});

describe('drift guard — the 12.9% ceiling is never retyped for this bar', () => {
  it('the client declares the hard-mix fallbacks exactly once and nowhere else', () => {
    const code = APP.split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l));
    const ceilings = code.filter((l) => l.includes('0.129'));
    expect(ceilings).toHaveLength(1);
    expect(ceilings[0]).toMatch(/^const HARD_CEILING = 0\.129;$/);
    const ideals = code.filter((l) => l.includes('0.083'));
    expect(ideals).toHaveLength(1);
    expect(ideals[0]).toMatch(/^const HARD_IDEAL = 0\.083;$/);
    // and the counts themselves never touch a share: strain is read whole
    expect(method(APP, 'suggestHardHeavy')).not.toMatch(/0\.1|ceiling|Hard\s*\//i);
  });

  it('no computed banks a count at fetch time — all three derive from `suggest`', () => {
    expect(APP).not.toMatch(/\bsuggestCount\b/); // the old data key is gone
    for (const name of ['suggestProposed', 'suggestFlagged', 'suggestHardHeavy']) {
      expect(method(APP, name)).toContain("this.get('suggest')");
    }
  });
});
