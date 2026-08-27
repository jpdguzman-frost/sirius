/**
 * Sprints modal, four states (owls #28–#30, phase 13j / T137–T138).
 *
 * Two halves, both against the SHIPPED files and neither retyped:
 *
 * 1. The validators are EXECUTED out of the shipped app scripts (the
 *    executed-computed precedent, now homed in
 *    test/sprint-schedule-render.test.ts), because what a banner says and
 *    whether Save locks are arithmetic, not markup — and R-f-8's working-day
 *    gap rule is a NEW date-math site that `lib/**` cannot own (invariant 5),
 *    so it is the one thing in this batch with no golden test behind it.
 * 2. The four states are RENDERED with Ractive's own `toHTML()` (the T131–T133
 *    precedent), because the frame's real risks are structural: a banner that
 *    grows a CTA (R-f-5), the Alert Banner component's unused 1450px variant
 *    slots reaching the DOM, a LENGTH cell that becomes an input, a hint strip
 *    the frame hides (R-f-7). A source grep proves none of those.
 *
 * The server truth behind the two blocking rules — duplicate names and
 * overlapping ranges, both rejected with a 422 that writes nothing — lives in
 * test/schedule.test.ts and scripts/batch4-probe.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  TEMPLATE,
  UI_CSS,
  leakedMustacheText,
  renderSprintModal,
  type SprintBanner,
} from './helpers/gantt-render.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A top-level `function name(…) { … }`, sliced by brace matching. */
function fn(name: string, src: string = APP_JS): string {
  const at = src.indexOf(`\nfunction ${name}(`);
  if (at < 0) throw new Error(`sprints-modal: no \`function ${name}\` in the shipped frontend source`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`sprints-modal: unterminated \`function ${name}\``);
}

/** A top-level `const name = …;`, sliced to the first `;` outside brackets. */
function constDecl(name: string, src: string = APP_JS): string {
  const at = src.indexOf(`\nconst ${name} =`);
  if (at < 0) throw new Error(`sprints-modal: no \`const ${name}\` in the shipped frontend source`);
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i]!;
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`sprints-modal: unterminated \`const ${name}\``);
}

/** A Ractive `computed` method (`    name() { … }`), sliced by brace matching. */
function computedMethod(name: string, src: string = APP_JS): string {
  const at = src.indexOf(`\n    ${name}() {`);
  if (at < 0) throw new Error(`sprints-modal: no computed \`${name}()\` in the shipped frontend source`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`sprints-modal: unterminated computed \`${name}()\``);
}

interface Draft { name: string; start: string; end: string }
interface Baseline { name: string; start: string; end: string }
/* the shape the computeds emit, and the shape `renderSprintModal` takes — one
   type, so a banner can go straight from the shipped validator into the
   shipped template with nothing retyped in between */
type Banner = SprintBanner;
interface Validators {
  set(draft: Draft[], holidays?: string[]): void;
  baseline(rows: Baseline[]): void;
  dups(): Banner[];
  blanks(): Banner[];
  noDates(): Banner[];
  overlaps(): Banner[];
  gaps(): Banner[];
  banners(): Banner[];
  blocked(): boolean;
  dirty(): boolean;
  longIso(iso: string): string;
  workingDays(a: string, b: string, h?: string[]): number;
  monday(iso: string): string;
  friday(iso: string): string;
}

const COMPUTEDS = [
  'sprintOrder', 'sprintDupNames', 'sprintBlankNames', 'sprintMissingDates',
  'sprintOverlaps', 'sprintGaps', 'sprintRowBanners', 'sprintBlocked', 'sprintDirty',
];

// `this.get(key)` resolves a computed transparently in Ractive, so the harness
// `get` does too — that is what lets sprintOverlaps/sprintGaps consume
// sprintOrder unmodified.
const v = new Function(`
  ${constDecl('isoOf')}
  ${constDecl('MONTHS_SHORT')}
  ${constDecl('sprintPayload')}
  ${fn('fmtLongIso')}
  ${fn('mondayIso')}
  ${fn('fridayIso')}
  ${fn('workingDaysBetween')}
  const computed = { ${COMPUTEDS.map((n) => computedMethod(n)).join(', ')} };
  const DATA = { sprintDraft: [], sprintBaseline: [], holidays: [] };
  const ctx = { get: (k) => (Object.prototype.hasOwnProperty.call(computed, k) ? computed[k].call(ctx) : DATA[k]) };
  return {
    set: (draft, holidays) => { DATA.sprintDraft = draft; DATA.holidays = holidays || []; },
    baseline: (rows) => { DATA.sprintBaseline = rows; },
    dups: () => computed.sprintDupNames.call(ctx),
    blanks: () => computed.sprintBlankNames.call(ctx),
    noDates: () => computed.sprintMissingDates.call(ctx),
    overlaps: () => computed.sprintOverlaps.call(ctx),
    gaps: () => computed.sprintGaps.call(ctx),
    banners: () => computed.sprintRowBanners.call(ctx),
    blocked: () => computed.sprintBlocked.call(ctx),
    dirty: () => computed.sprintDirty.call(ctx),
    longIso: (iso) => fmtLongIso(iso),
    workingDays: (a, b, h) => workingDaysBetween(a, b, h || []),
    monday: (iso) => mondayIso(iso),
    friday: (iso) => fridayIso(iso),
  };
`)() as Validators;

/* ---------------------------------------------------------------------- */
/* the validators, executed                                                */
/* ---------------------------------------------------------------------- */

describe('duplicate names — blocking, per project, one banner per NAME', () => {
  it('says nothing while every name is distinct', () => {
    v.set([
      { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-07' },
      { name: 'Sprint 47', start: '2026-08-10', end: '2026-08-14' },
    ]);
    expect(v.dups()).toEqual([]);
  });

  it('collides on trim and case, and carries the frame copy verbatim', () => {
    v.set([
      { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-07' },
      { name: '  sprint 46 ', start: '2026-08-10', end: '2026-08-14' },
    ]);
    const [b] = v.dups();
    expect(v.dups()).toHaveLength(1);
    expect(b!.variant).toBe('err');
    expect(b!.title).toBe('Duplicate sprint names found');
    expect(b!.text).toBe('Multiple sprints are named "Sprint 46". Give each sprint a unique name to save.');
  });

  it('reports a triple once, not twice — the banner names the NAME', () => {
    v.set([
      { name: 'Alpha', start: '2026-08-03', end: '2026-08-07' },
      { name: 'alpha', start: '2026-08-10', end: '2026-08-14' },
      { name: 'ALPHA', start: '2026-08-17', end: '2026-08-21' },
    ]);
    expect(v.dups()).toHaveLength(1);
  });

  it('ignores blank names — an unnamed new row is not a duplicate of another', () => {
    v.set([
      { name: '', start: '2026-08-03', end: '2026-08-07' },
      { name: '   ', start: '2026-08-10', end: '2026-08-14' },
    ]);
    expect(v.dups()).toEqual([]);
  });

  // the modal's banner and the route's 422 must read identically, or a user who
  // trips the server check sees different words than the one who trips the
  // client check for the same mistake
  it('says exactly what the route’s 422 says', () => {
    const route = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'schedule.ts'), 'utf8');
    const tail = '. Give each sprint a unique name to save.';
    expect(route).toContain(`Multiple sprints are named "\${first}"${tail}`);
    expect(APP_JS).toContain(`Multiple sprints are named "\${String(s.name).trim()}"${tail}`);
  });
});

/**
 * Blank names — the second blocking class (owl #37 item 2, Miles). The
 * duplicate-name parity test above is the precedent: whichever side a user
 * trips, the words must be the same, so the copy is pinned on BOTH files at
 * once rather than trusted to stay in step.
 *
 * The executed-validator half of this class (`sprintBlankNames` out of the
 * shipped the app scripts) sits with the other computeds; this describe owns only
 * the two-sided copy contract.
 */
describe('blank names — the modal banner and the route’s 422 say the same words', () => {
  const ROUTE = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'schedule.ts'), 'utf8');
  const SENTENCE = 'has no name. Name every sprint to save.';

  it('interpolates the SAME sentence on each side, differing only in the date helper', () => {
    // the date is the only identity a nameless row still has; each side renders
    // it with its own pure-string-math helper, never `Date` and never a locale
    expect(ROUTE).toContain(`A sprint starting \${longDate(s.start)} ${SENTENCE}`);
    expect(APP_JS).toContain(`A sprint starting \${when} ${SENTENCE}`);
  });

  it('states the imperative fix once per interpolated form — no drifting second copy', () => {
    const count = (src: string, needle: string) => src.split(needle).length - 1;
    // server: exactly one blank-name sentence — `start` is DATE_ONLY-required
    // there, so the route has no dateless branch to word differently
    expect(count(ROUTE, SENTENCE)).toBe(1);
    // client: two — the interpolated one plus the cleared-date fallback below,
    // and this pins that there is no third
    expect(count(APP_JS, SENTENCE)).toBe(2);
  });

  it('keeps the client’s cleared-date fallback on the same second sentence', () => {
    // clearing the row's date input sets `start` to '' (snapSprintStart), so
    // `fmtLongIso('')` is empty and the row cannot be named by its date. Only
    // the first clause changes; the fix the user must perform reads identically.
    expect(APP_JS).toContain(`This sprint ${SENTENCE}`);
    expect(ROUTE).not.toContain('This sprint');
  });

  it('shares the two-clause house shape with the duplicate-name copy', () => {
    // [state the problem in the user's own data]. [imperative fix] to save.
    expect(ROUTE).toContain('. Give each sprint a unique name to save.');
    expect(ROUTE).toContain('. Name every sprint to save.');
  });

  /**
   * The sentence is only byte-identical if the DATE inside it is. There is no
   * bundler, so the two sides cannot share a module and each carries its own
   * pure-string-math formatter — and the parity assertions above compare the
   * interpolation SOURCE, which a server table that spelled 'Sept' would
   * satisfy while rendering different words. So run both.
   */
  describe('the two date formatters agree, run against each other', () => {
    const server = new Function(`
      ${ROUTE.slice(ROUTE.indexOf('const MONTHS_SHORT'), ROUTE.indexOf('\n', ROUTE.indexOf('const MONTHS_SHORT')))}
      ${ROUTE.slice(ROUTE.indexOf('function longDate('), ROUTE.indexOf('\n}', ROUTE.indexOf('function longDate(')) + 2)
        .replace('(iso: string): string', '(iso)')}
      return longDate;
    `)() as (iso: string) => string;

    it('renders every month of the year identically on both sides', () => {
      for (let m = 1; m <= 12; m++) {
        const iso = `2026-${String(m).padStart(2, '0')}-17`;
        expect(server(iso), iso).toBe(v.longIso(iso));
      }
    });

    it('agrees on the edges — first and last day, and a leap day', () => {
      for (const iso of ['2026-01-01', '2026-12-31', '2024-02-29', '2026-08-09']) {
        expect(server(iso), iso).toBe(v.longIso(iso));
      }
    });

    it('says "Sep", never the en-GB locale’s "Sept", on both sides', () => {
      expect(server('2026-09-01')).toBe('1 Sep 2026');
      expect(v.longIso('2026-09-01')).toBe('1 Sep 2026');
    });

    it('never renders the word `undefined` for a month the shape check let through', () => {
      // DATE_ONLY is /^\d{4}-\d{2}-\d{2}$/ — `00` and `13` both match it, and
      // this string goes straight into user-facing 422 copy
      for (const iso of ['2026-00-17', '2026-13-17', '2026-99-17']) {
        expect(server(iso), iso).not.toContain('undefined');
      }
    });
  });
});

describe('blank names — blocking, one banner per unnamed ROW (owl #37 item 2)', () => {
  const AGREED = 'A sprint starting 17 Aug 2026 has no name. Name every sprint to save.';

  it('says nothing while every row carries a name', () => {
    v.set([{ name: 'Sprint 46', start: '2026-08-17', end: '2026-08-28' }]);
    expect(v.blanks()).toEqual([]);
  });

  it('fires on an empty string, and names the row by its start date', () => {
    v.set([{ name: '', start: '2026-08-17', end: '2026-08-28' }]);
    const [b] = v.blanks();
    expect(v.blanks()).toHaveLength(1);
    expect(b!.variant).toBe('err');
    expect(b!.title).toBe('Sprint name required');
    expect(b!.after).toBe(0); // the DRAFT index, so placement stays data (R-f-4)
    expect(b!.text).toBe(AGREED);
  });

  it('treats whitespace-only as the same class — trim, then reject', () => {
    for (const name of ['   ', '\t', '\n', ' \t ']) {
      v.set([{ name, start: '2026-08-17', end: '2026-08-28' }]);
      expect(v.blanks()).toHaveLength(1);
      expect(v.blanks()[0]!.text).toBe(AGREED);
    }
  });

  it('emits one banner PER blank row, each after its own row', () => {
    v.set([
      { name: '', start: '2026-08-03', end: '2026-08-14' },
      { name: '  ', start: '2026-08-17', end: '2026-08-28' },
      { name: 'Sprint 48', start: '2026-08-31', end: '2026-09-11' },
    ]);
    const out = v.blanks();
    expect(out).toHaveLength(2);
    expect(out.map((b) => b.after)).toEqual([0, 1]);
    expect(out[0]!.text).toBe('A sprint starting 3 Aug 2026 has no name. Name every sprint to save.');
    expect(out[1]!.text).toBe(AGREED);
  });

  // clearing the date input sets `start` to '' (snapSprintStart), so the row has
  // no date to be named by either. Only the first clause changes.
  it('falls back to a dateless sentence when the row’s start has been cleared', () => {
    v.set([{ name: '', start: '', end: '' }]);
    const [b] = v.blanks();
    expect(b!.text).toBe('This sprint has no name. Name every sprint to save.');
    for (const banner of v.blanks()) expect(banner.text).not.toMatch(/ {2}/); // no collapsed gap
  });

  // the two sides used to disagree exactly here: the client stayed silent while
  // the route called two blanks a duplicate of each other. Both now say blank.
  it('owns the whole blank class — two blanks are never ALSO a duplicate', () => {
    v.set([
      { name: '', start: '2026-08-03', end: '2026-08-14' },
      { name: '   ', start: '2026-08-17', end: '2026-08-28' },
    ]);
    expect(v.blanks()).toHaveLength(2);
    expect(v.dups()).toEqual([]);
  });
});

/**
 * A cleared date used to be INVISIBLE to every validator — `sprintOrder` drops
 * a row with no start or end before overlaps and gaps ever see it, and blank
 * names only read the name. So Save stayed live, the PUT failed the route's
 * shape check, and the modal printed the raw envelope code at the user: exactly
 * the unreadable failure blank names were fixed to stop (owl #37 item 2).
 *
 * The route needs no change — it already refuses the shape. What was missing is
 * the modal never asking it to. Copy is PROVISIONAL, flagged to Miles.
 */
describe('missing dates — blocking, the class no other validator could see', () => {
  it('says nothing while every row carries both dates', () => {
    v.set([{ name: 'Sprint 46', start: '2026-08-17', end: '2026-08-28' }]);
    expect(v.noDates()).toEqual([]);
  });

  it('fires on a cleared START, and names the row by the name it still has', () => {
    v.set([{ name: 'Sprint 46', start: '', end: '2026-08-28' }]);
    const [b] = v.noDates();
    expect(v.noDates()).toHaveLength(1);
    expect(b!.variant).toBe('err');
    expect(b!.title).toBe('Sprint dates required');
    expect(b!.after).toBe(0); // the DRAFT index, so placement stays data (R-f-4)
    expect(b!.text).toBe('"Sprint 46" has no start date. Every sprint needs a start and an end to save.');
  });

  it('fires on a cleared END, and says which one is missing', () => {
    v.set([{ name: 'Sprint 46', start: '2026-08-17', end: '' }]);
    expect(v.noDates()[0]!.text).toContain('has no end date');
  });

  it('says it once when BOTH are gone, not twice', () => {
    v.set([{ name: 'Sprint 46', start: '', end: '' }]);
    expect(v.noDates()).toHaveLength(1);
    expect(v.noDates()[0]!.text).toContain('has no start and end dates');
  });

  it('falls back to a nameless subject when the row has no name either', () => {
    v.set([{ name: '  ', start: '', end: '2026-08-28' }]);
    expect(v.noDates()[0]!.text).toBe('This sprint has no start date. Every sprint needs a start and an end to save.');
    expect(v.blanks()).toHaveLength(1); // and it is still a blank name — two real problems, two banners
  });

  it('is the ONLY validator that sees it — the regression that let it through', () => {
    v.set([
      { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
      { name: 'Sprint 47', start: '', end: '' },
    ]);
    expect(v.overlaps()).toEqual([]); // sprintOrder filtered the row out
    expect(v.gaps()).toEqual([]);
    expect(v.blanks()).toEqual([]);
    expect(v.dups()).toEqual([]);
    expect(v.noDates()).toHaveLength(1);
    expect(v.blocked()).toBe(true); // …and THAT is what keeps Save from firing
  });
});

describe('sprintBlocked — one name for "the server would refuse this"', () => {
  const CLEAN = [{ name: 'Sprint 46', start: '2026-08-17', end: '2026-08-28' }];

  it('is false for a clean list', () => {
    v.set(CLEAN.map((s) => ({ ...s })));
    expect(v.blocked()).toBe(false);
  });

  it('is true for every blocking class, one at a time', () => {
    const cases: Record<string, { name: string; start: string; end: string }[]> = {
      'duplicate name': [
        { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
        { name: 'sprint 46 ', start: '2026-08-17', end: '2026-08-28' },
      ],
      'blank name': [{ name: '', start: '2026-08-17', end: '2026-08-28' }],
      'missing date': [{ name: 'Sprint 46', start: '2026-08-17', end: '' }],
      overlap: [
        { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-21' },
        { name: 'Sprint 47', start: '2026-08-17', end: '2026-08-28' },
      ],
    };
    for (const [why, draft] of Object.entries(cases)) {
      v.set(draft);
      expect(v.blocked(), why).toBe(true);
    }
  });

  it('is FALSE for a gap — advisory, never blocking (BR-5, invariant 12)', () => {
    v.set([
      { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-07' },
      { name: 'Sprint 47', start: '2026-08-17', end: '2026-08-28' },
    ], []);
    expect(v.gaps().length).toBeGreaterThan(0);
    expect(v.blocked()).toBe(false);
  });

  it('is the ONLY spelling of the rule — the markup and the handler both read it', () => {
    // it was written out three times (the disabled binding, the tooltip
    // condition, the handler's own second lock), so a new error class was three
    // edits that had to agree and any one missed silently unlocked Save
    expect(TEMPLATE).toContain('disabled="{{ sprintBlocked || !sprintDirty }}"');
    expect(TEMPLATE).toContain('{{#if sprintBlocked}}title="Fix the errors above to save"');
    expect(APP_JS).toContain("if (app.get('sprintBlocked')) return;");
    for (const stale of ['sprintDupNames.length ||', "app.get('sprintDupNames').length ||"]) {
      expect(TEMPLATE + APP_JS, stale).not.toContain(stale);
    }
  });
});

describe('sprintRowBanners — the row banners assembled once, in reading order', () => {
  it('reads outward from the row: its own problems, then the pair, then the advisory', () => {
    v.set([
      { name: '', start: '', end: '' },
      { name: 'Sprint 47', start: '2026-08-17', end: '2026-08-28' },
    ]);
    expect(v.banners()).toEqual(v.blanks().concat(v.noDates(), v.overlaps(), v.gaps()));
  });

  it('is what the markup iterates — the template does no assembly of its own', () => {
    // it used to concatenate three lists INSIDE the per-draft-row loop, so the
    // arrays were rebuilt once per row and each new class meant editing markup
    expect(TEMPLATE).toContain('{{#each sprintRowBanners as b}}');
    expect(TEMPLATE).not.toContain('.concat(sprintOverlaps');
  });
});

describe('sprintDirty — the draft against the baseline captured at open', () => {
  it('is false while the draft still matches the baseline', () => {
    v.baseline(FOUR.map((s) => ({ ...s })));
    v.set(FOUR.map((s) => ({ ...s })));
    expect(v.dirty()).toBe(false);
  });

  it('turns true on any of the three persisted fields, and back to false on revert', () => {
    for (const field of ['name', 'start', 'end'] as const) {
      v.baseline(FOUR.map((s) => ({ ...s })));
      const draft = FOUR.map((s) => ({ ...s }));
      const was = draft[1]![field];
      draft[1]![field] = 'CHANGED';
      v.set(draft);
      expect(v.dirty()).toBe(true);
      draft[1]![field] = was; // put it back — the case the reframe buys
      expect(v.dirty()).toBe(false);
    }
  });

  it('does not trim — a trailing space is a change the user made', () => {
    v.baseline([{ name: 'Sprint 1', start: '2026-08-03', end: '2026-08-14' }]);
    v.set([{ name: 'Sprint 1 ', start: '2026-08-03', end: '2026-08-14' }]);
    expect(v.dirty()).toBe(true);
  });

  it('is false for an empty modal opened on an empty list — nothing to persist', () => {
    v.baseline([]);
    v.set([]);
    expect(v.dirty()).toBe(false);
  });

  it('is true when the user removes every row — a deletion is a real change', () => {
    v.baseline(FOUR.map((s) => ({ ...s })));
    v.set([]);
    expect(v.dirty()).toBe(true);
  });

  it('is true when the user adds the first row to an empty list', () => {
    v.baseline([]);
    v.set([{ name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' }]);
    expect(v.dirty()).toBe(true);
  });

  it('compares in DRAFT order — the same rows reordered are a change', () => {
    v.baseline(FOUR.map((s) => ({ ...s })));
    const swapped = FOUR.map((s) => ({ ...s }));
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    v.set(swapped);
    expect(v.dirty()).toBe(true);
  });
});

describe('overlaps — blocking, invariant 12 said early (R-f-3)', () => {
  it('fires on a touching boundary, because the route rejects `r.start <= l.end`', () => {
    v.set([
      { name: 'A', start: '2026-08-03', end: '2026-08-14' },
      { name: 'B', start: '2026-08-14', end: '2026-08-21' },
    ]);
    const [b] = v.overlaps();
    expect(v.overlaps()).toHaveLength(1);
    expect(b!.variant).toBe('err');
    expect(b!.title).toBe('Overlapping sprints');
    expect(b!.text).toContain('A');
    expect(b!.text).toContain('B');
    expect(b!.after).toBe(0); // renders between the two rows it names (R-f-4)
  });

  it('stays silent on adjacent, non-touching ranges', () => {
    v.set([
      { name: 'A', start: '2026-08-03', end: '2026-08-07' },
      { name: 'B', start: '2026-08-10', end: '2026-08-14' },
    ]);
    expect(v.overlaps()).toEqual([]);
  });

  it('reads pairs in START order even when the draft is out of order', () => {
    v.set([
      { name: 'Later', start: '2026-08-17', end: '2026-08-28' },
      { name: 'Earlier', start: '2026-08-03', end: '2026-08-21' },
    ]);
    const [b] = v.overlaps();
    expect(b!.text).toMatch(/^Earlier and Later/);
    expect(b!.after).toBe(1); // the DRAFT index of the earlier-starting row
  });
});

describe('gaps — advisory, and counted in WORKING days (R-f-8)', () => {
  it('does not fire for a pure weekend between a Friday end and a Monday start', () => {
    v.set([
      { name: 'A', start: '2026-08-03', end: '2026-08-07' }, // Fri
      { name: 'B', start: '2026-08-10', end: '2026-08-14' }, // Mon
    ]);
    expect(v.gaps()).toEqual([]);
  });

  it('does not fire when the only open day in the gap is a holiday', () => {
    // Fri 7 Aug → Tue 11 Aug leaves Mon 10 Aug; make it a holiday and the gap dies
    v.set(
      [
        { name: 'A', start: '2026-08-03', end: '2026-08-07' },
        { name: 'B', start: '2026-08-11', end: '2026-08-14' },
      ],
      ['2026-08-10'],
    );
    expect(v.gaps()).toEqual([]);
  });

  it('fires the moment one working day is left unallocated, and names the pair', () => {
    v.set([
      { name: 'Sprint 48', start: '2026-08-03', end: '2026-08-07' },
      { name: 'Sprint 49', start: '2026-08-11', end: '2026-08-14' },
    ]);
    const [b] = v.gaps();
    expect(v.gaps()).toHaveLength(1);
    expect(b!.variant).toBe('warn');
    expect(b!.title).toBe('Unscheduled Gap Detected');
    expect(b!.text).toBe(
      'There are unallocated working days between Sprint 48 and Sprint 49. '
      + "Deliverables scheduled during this period won't belong to any sprint.",
    );
    expect(b!.after).toBe(0);
  });

  it('emits one banner PER gap, each after its own earlier row (R-f-4)', () => {
    v.set([
      { name: 'A', start: '2026-08-03', end: '2026-08-07' },
      { name: 'B', start: '2026-08-17', end: '2026-08-21' },
      { name: 'C', start: '2026-08-31', end: '2026-09-04' },
    ]);
    expect(v.gaps().map((b) => b.after)).toEqual([0, 1]);
  });

  it('never calls an overlap a gap', () => {
    v.set([
      { name: 'A', start: '2026-08-03', end: '2026-08-21' },
      { name: 'B', start: '2026-08-10', end: '2026-08-28' },
    ]);
    expect(v.gaps()).toEqual([]);
    expect(v.overlaps()).toHaveLength(1);
  });

  it('counts the open days strictly between the two dates', () => {
    expect(v.workingDays('2026-08-07', '2026-08-10')).toBe(0); // Sat+Sun
    expect(v.workingDays('2026-08-07', '2026-08-11')).toBe(1); // + Mon
    expect(v.workingDays('2026-08-07', '2026-08-11', ['2026-08-10'])).toBe(0);
    expect(v.workingDays('2026-08-03', '2026-08-07')).toBe(3); // Tue–Thu
    expect(v.workingDays('2026-08-10', '2026-08-03')).toBe(0); // inverted
  });
});

describe('R-f-2 — START snaps to Monday, END to that week’s Friday', () => {
  it('snaps every day of a week onto the same Monday/Friday pair', () => {
    for (const iso of ['2026-08-03', '2026-08-05', '2026-08-07', '2026-08-09']) {
      expect(v.monday(iso)).toBe('2026-08-03');
      expect(v.friday(iso)).toBe('2026-08-07');
    }
  });

  it('snaps on `change`, never on `input` — a half-typed year must survive', () => {
    expect(TEMPLATE).toContain('on-change="[\'snapSprintStart\', i]"');
    expect(TEMPLATE).toContain('on-change="[\'snapSprintEnd\', i]"');
    expect(TEMPLATE).not.toContain('snapSprintStart\', i]" on-input');
    expect(TEMPLATE).not.toMatch(/on-input="\['snapSprint/);
  });
});

/* ---------------------------------------------------------------------- */
/* the four states, rendered                                               */
/* ---------------------------------------------------------------------- */

const FOUR: Draft[] = [
  { name: 'Sprint 46', start: '2026-08-03', end: '2026-08-14' },
  { name: 'Sprint 47', start: '2026-08-17', end: '2026-08-28' },
  { name: 'Sprint 48', start: '2026-08-31', end: '2026-09-11' },
  { name: 'Sprint 49', start: '2026-09-14', end: '2026-09-25' },
];

/** The `<button …>Save sprints</button>` tag as rendered. */
const saveBtn = (html: string): string => /<button[^>]*>Save sprints<\/button>/.exec(html)?.[0] ?? '';

describe('empty state (node 528:113433)', () => {
  const html = renderSprintModal();

  it('shows the headline, the sub-line and one Add Sprint button', () => {
    expect(html).toContain('No sprints yet');
    expect(html).toContain('Until you add one, everything scheduled sits in a single ungrouped list.');
    expect([...html.matchAll(/Add Sprint/g)]).toHaveLength(1);
  });

  it('renders no table at all', () => {
    expect(html).not.toContain('stable');
    expect(html).not.toContain('strow');
    expect(html).not.toContain('NAME');
  });

  it('renders Save in its disabled treatment — nothing has ever been registered', () => {
    expect(saveBtn(html)).toContain('disabled');
  });

  it('carries the shell: title, close, explainer, Cancel', () => {
    expect(html).toContain('<h3 class="smtitle">Sprints</h3>');
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain('Sprints are not a fixed cadence');
    expect(html).toContain('A deliverable belongs to whichever sprint contains');
    expect(html).toContain('>Cancel</button>');
  });

  /* contract §1.1: Cancel's LABEL is --slate-400 here and --slate-900 in the
     other three states. De-emphasis, not a disabled treatment — the border, the
     fill, the hover and the click are untouched and it still closes the modal. */
  it('dims Cancel, and only here', () => {
    expect(html).toContain('<button class="smbtn ghost dim" type="button"');
    expect(renderSprintModal({ sprintDraft: FOUR })).toContain('<button class="smbtn ghost " type="button"');
  });

  it('backs the dim with a colour-only rule', () => {
    expect(UI_CSS).toMatch(/\.sprintmodal \.smbtn\.ghost\.dim \{ color: var\(--slate-400\); \}/);
    // colour ONLY: no background, border or cursor may ride along, or it reads
    // as the disabled treatment the frame reserves for Save
    const dim = /\.sprintmodal \.smbtn\.ghost\.dim \{([^}]*)\}/.exec(UI_CSS)![1];
    expect(dim).not.toMatch(/background|border|cursor|opacity/);
  });
});

describe('filled state (node 322:30031)', () => {
  const html = renderSprintModal({ sprintDraft: FOUR, sprintDirty: true });

  it('emits one row per draft with a name input and two date inputs', () => {
    expect([...html.matchAll(/class="strow"/g)]).toHaveLength(4);
    expect([...html.matchAll(/<input class="stin" type="text"/g)]).toHaveLength(4);
    expect([...html.matchAll(/type="date"/g)]).toHaveLength(8);
  });

  it('keeps LENGTH derived — a read-only span, never an input', () => {
    expect(html).toContain('<span class="stlen">');
    // the LENGTH cell holds no field of any kind
    const lenCells = [...html.matchAll(/<span class="stc sc-len">.*?<\/span><\/span>/g)].map((m) => m[0]);
    expect(lenCells).toHaveLength(4);
    for (const cell of lenCells) expect(cell).not.toContain('<input');
  });

  it('states the five header labels in the frame order', () => {
    const heads = [...html.matchAll(/<span class="sthc sc-\w+">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(heads).toEqual(['', 'NAME', 'START (MON)', 'END (FRI)', 'LENGTH']);
  });

  it('holds the remove ✕ in column 1 and no grip anywhere (R-f-6)', () => {
    expect([...html.matchAll(/class="strm"/g)]).toHaveLength(4);
    expect(html).not.toContain('ghandle');
    expect(html).not.toMatch(/grip/i);
    // column 1 is the only place a row-level control sits
    expect(html).toMatch(/<span class="stc sc-rm"><button class="strm"/);
  });

  it('enables Save when the list is clean and the user has changed something', () => {
    expect(saveBtn(html)).not.toContain('disabled');
  });

  it('offers Add Sprint inside the table', () => {
    expect(html).toContain('class="stadd"');
    expect(html).toContain('>Add Sprint</button>');
  });
});

describe('R-f-1 / R-f-7 — the two copy-and-chrome rulings', () => {
  it('never says "Add a Sprint", in either state', () => {
    expect(renderSprintModal()).not.toContain('Add a Sprint');
    expect(renderSprintModal({ sprintDraft: FOUR })).not.toContain('Add a Sprint');
  });

  it('renders no SubTone hint strip in any state', () => {
    for (const html of [
      renderSprintModal(),
      renderSprintModal({ sprintDraft: FOUR }),
      renderSprintModal({ sprintDraft: FOUR, sprintGaps: [{ variant: 'warn', title: 'g', text: 'g', after: 0 }] }),
    ]) {
      expect(html).not.toMatch(/subtone/i);
    }
  });
});

describe('banners — one recipe, three modifiers, zero CTAs (R-f-5)', () => {
  const gap = renderSprintModal({
    sprintDraft: FOUR,
    sprintDirty: true,
    sprintGaps: [{
      variant: 'warn',
      title: 'Unscheduled Gap Detected',
      text: "There are unallocated working days between Sprint 46 and Sprint 47. Deliverables scheduled during this period won't belong to any sprint.",
      after: 0,
    }],
  });
  const dup = renderSprintModal({
    sprintDraft: FOUR,
    sprintDirty: true,
    sprintDupNames: [{
      variant: 'err',
      title: 'Duplicate sprint names found',
      text: 'Multiple sprints are named "Sprint 46". Give each sprint a unique name to save.',
    }],
  });
  const lap = renderSprintModal({
    sprintDraft: FOUR,
    sprintDirty: true,
    sprintOverlaps: [{ variant: 'err', title: 'Overlapping sprints', text: 'Sprint 46 and Sprint 47 cover the same weeks.', after: 0 }],
  });

  it('draws the gap as the amber, non-blocking variant', () => {
    expect(gap).toContain('class="sbanner warn"');
    expect(gap).toContain('Unscheduled Gap Detected');
    expect(saveBtn(gap)).not.toContain('disabled'); // gaps never block
  });

  it('draws duplicates and overlaps as the SAME red base class, both blocking', () => {
    expect(dup).toContain('class="sbanner err"');
    expect(lap).toContain('class="sbanner err"');
    expect(saveBtn(dup)).toContain('disabled');
    expect(saveBtn(lap)).toContain('disabled');
  });

  it('gives neither variant a CTA — Miles removed the frame’s two buttons', () => {
    for (const html of [gap, dup, lap]) {
      // a .warn/.err banner is head + description and stops there; .sconfirm is
      // the only variant that ever carries actions, and it is not in these states
      const banners = [...html.matchAll(/<div class="sbanner (?:warn|err)"[\s\S]*?<\/p><\/div>/g)].map((m) => m[0]);
      expect(banners.length).toBeGreaterThan(0);
      for (const b of banners) expect(b).not.toContain('<button');
      expect(html).not.toContain('sbctas');
      expect(html).not.toContain('Delete sprint');
      expect(html).not.toContain('Keep it');
    }
  });

  it('places a gap banner BETWEEN the two rows it names (R-f-4)', () => {
    const rowAt = [...gap.matchAll(/class="strow"/g)].map((m) => m.index!);
    const bannerAt = gap.indexOf('class="sbanner warn"');
    expect(bannerAt).toBeGreaterThan(rowAt[0]!);
    expect(bannerAt).toBeLessThan(rowAt[1]!);
  });

  it('leads the list with duplicates — they name no pair to sit between', () => {
    expect(dup.indexOf('class="sbanner err"')).toBeLessThan(dup.indexOf('class="strow"'));
  });

  /* the blank-name class reuses the SAME red recipe rather than forking one:
     one banner, sitting after the row it is about, no CTA, Save dead. */
  it('draws a blank name in the same red variant, after its own row, and blocks Save', () => {
    const blank = renderSprintModal({
      sprintDraft: FOUR,
      sprintDirty: true,
      sprintBlankNames: [{
        variant: 'err',
        title: 'Sprint name required',
        text: 'A sprint starting 17 Aug 2026 has no name. Name every sprint to save.',
        after: 1,
      }],
    });
    expect(blank).toContain('class="sbanner err"');
    expect(blank).toContain('role="alert"');
    expect(blank).toContain('Sprint name required');
    expect(saveBtn(blank)).toContain('disabled');

    const rowAt = [...blank.matchAll(/class="strow"/g)].map((m) => m.index!);
    const bannerAt = blank.indexOf('class="sbanner err"');
    expect(bannerAt).toBeGreaterThan(rowAt[1]!);
    expect(bannerAt).toBeLessThan(rowAt[2]!);

    const banners = [...blank.matchAll(/<div class="sbanner err"[\s\S]*?<\/p><\/div>/g)].map((m) => m[0]);
    expect(banners).toHaveLength(1);
    expect(banners[0]).not.toContain('<button'); // R-f-5
    expect(blank).not.toContain('sbctas');
    // a blank is reported as a blank and NOTHING else (the class the server and
    // the client used to disagree about)
    expect(blank).not.toContain('Duplicate sprint names found');
  });

  it('draws two blank rows as two banners, still with zero CTAs', () => {
    const two = renderSprintModal({
      sprintDraft: FOUR,
      sprintDirty: true,
      sprintBlankNames: [
        { variant: 'err', title: 'Sprint name required', text: 'A sprint starting 3 Aug 2026 has no name. Name every sprint to save.', after: 0 },
        { variant: 'err', title: 'Sprint name required', text: 'A sprint starting 17 Aug 2026 has no name. Name every sprint to save.', after: 1 },
      ],
    });
    expect([...two.matchAll(/class="sbanner err"/g)]).toHaveLength(2);
    expect(two).not.toContain('sbctas');
    expect(two).not.toContain('Duplicate sprint names found');
    expect(saveBtn(two)).toContain('disabled');
  });

  it('shares one CSS recipe across the modifiers', () => {
    expect(UI_CSS).toMatch(/\n\.sbanner \{/);
    expect(UI_CSS).toMatch(/\n\.sbanner\.warn \{[^}]*--amber-50/);
    expect(UI_CSS).toMatch(/\n\.sbanner\.err \{[^}]*--red-50/);
  });
});

describe('the 1450px slot trap (R4)', () => {
  const states = [
    renderSprintModal(),
    renderSprintModal({ sprintDraft: FOUR }),
    renderSprintModal({ sprintDraft: FOUR, sprintGaps: [{ variant: 'warn', title: 'g', text: 'g', after: 0 }] }),
    renderSprintModal({ sprintDraft: FOUR, sprintDupNames: [{ variant: 'err', title: 'd', text: 'd' }] }),
  ];

  it('never emits the Alert Banner component’s unused variant slots', () => {
    for (const html of states) {
      expect(html).not.toMatch(/List Item/i);
      expect(html).not.toMatch(/items-container/i);
      expect(html).not.toContain('1450');
    }
  });

  it('keeps 1450 out of the modal CSS as well', () => {
    // comments may NAME the trap (they do, deliberately); no declaration may set it
    const declarations = UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declarations).not.toContain('1450');
  });
});

describe('deletion warning (Miles, #30)', () => {
  const html = renderSprintModal({
    sprintDraft: FOUR,
    sprintDirty: true,
    sprintDeleteConfirm: { idx: 1, name: 'Sprint 47', count: 4 },
  });

  it('states the count in the ruling’s own words', () => {
    expect(html).toContain('Remove Sprint 47?');
    expect(html).toContain('4 deliverables will move to Outside any sprint.');
  });

  it('confirms in place, after the row it is about', () => {
    const rowAt = [...html.matchAll(/class="strow"/g)].map((m) => m.index!);
    const confirmAt = html.indexOf('class="sbanner sconfirm"');
    expect(confirmAt).toBeGreaterThan(rowAt[1]!);
    expect(confirmAt).toBeLessThan(rowAt[2]!);
  });

  it('offers exactly two choices, and neither is the frame’s removed copy', () => {
    const confirm = /<div class="sbanner sconfirm"[\s\S]*?<\/div><\/div>/.exec(html)?.[0] ?? '';
    expect([...confirm.matchAll(/<button/g)]).toHaveLength(2);
    expect(confirm).toContain('>Cancel</button>');
    expect(confirm).toContain('>Remove sprint</button>');
    expect(html).not.toContain('Keep it');
    expect(html).not.toContain('Delete sprint');
  });

  it('shows no confirm until the ✕ is pressed', () => {
    expect(renderSprintModal({ sprintDraft: FOUR })).not.toContain('sconfirm');
  });

  it('reads the count from the SAME membership test the planner groups with', () => {
    /* Re-pointed 2026-08-28 (owls #72/#73): the scheduled unit is the WORK
       CARD and its sprint membership is the server's `sprintId` — the list
       the card was added to — so the old derived `slottedWeek ∈ [start, end]`
       recipe left with the deliverable rows. The rule that SURVIVES is the
       drift rule: the delete-confirm count and `sprintGroups` must run the
       byte-same membership predicate, so the modal can never warn about a
       different population than the planner displays. */
    const sites = [...APP_JS.matchAll(/\.filter\(\(r\) => r\.sprintId === s\.id\)/g)];
    expect(sites, 'the one membership predicate, in the computed AND the count').toHaveLength(2);
    expect(APP_JS).not.toContain('r.slottedWeek >= s.start'); // the retired recipe stays gone
  });
});

/**
 * R7 SUPERSEDED (owl #37 item 1, Miles): "Don't decide empty vs not, decide
 * UNSAVED CHANGES vs not." Save is live iff the draft differs from the
 * baseline captured at open AND no blocking issue stands. Both batch-4
 * behaviours fall out of that, and so does the case the old flag could never
 * express — edit a field and put it back.
 *
 * The three render states below are each paired with the executed `dirty()`
 * arithmetic in the describe under it, so the markup and the maths are proven
 * together rather than one standing in for the other.
 */
describe('R7 superseded — Save gates on UNSAVED CHANGES', () => {
  it('renders Save dead when the modal was opened with none — nothing to persist', () => {
    expect(saveBtn(renderSprintModal({ sprintDraft: [], sprintDirty: false }))).toContain('disabled');
  });

  it('keeps Save live when the user has removed every row, so the deletion can land', () => {
    expect(saveBtn(renderSprintModal({ sprintDraft: [], sprintDirty: true }))).not.toContain('disabled');
  });

  it('renders Save dead on a full table the user has edited and put back', () => {
    // the case the reframe buys: four good rows, no issue of any kind, and
    // still nothing to save
    expect(saveBtn(renderSprintModal({ sprintDraft: FOUR, sprintDirty: false }))).toContain('disabled');
  });

  it('captures the baseline at open as a COPY, never a reference to the stored list', () => {
    // a shared reference would be dragged along by every edit, and the draft
    // could then never look different from its own baseline
    const sites = [...APP_JS.matchAll(/sprintBaseline/g)].map((m) => APP_JS.slice(m.index!, m.index! + 160));
    expect(sites.length).toBeGreaterThan(1); // the state init AND the capture at open
    expect(sites.some((s) => s.includes('.map('))).toBe(true);
    for (const site of sites) {
      expect(site).not.toMatch(/sprintBaseline['"]?\s*,\s*(app\.get\('sprints'\)|stored|draft)\s*\)/);
    }
  });

  it('leaves no trace of the retired flag in either shipped file', () => {
    // an unused key that still names the old split is exactly the drift the
    // ruling forbids — the deletion is part of the change, not a follow-up
    expect(APP_JS).not.toContain('sprintOpenedEmpty');
    expect(TEMPLATE).not.toContain('sprintOpenedEmpty');
  });
});

/**
 * The two halves joined (owl #37, integrate). Every describe above proves one
 * side: the computeds sliced out of the app scripts are EXECUTED, the template is
 * RENDERED off hand-written banner stubs. Neither on its own catches a
 * validator that emits `index` where the template reads `after`, or a Save
 * expression that forgets one of the three blocking classes.
 *
 * So here nothing is stubbed and nothing is hand-written: the draft goes into
 * the shipped computeds, and whatever they return goes straight into the
 * shipped template. What the user would actually see, for the six states the
 * rulings name.
 */
describe('end to end — the shipped validators drive the shipped markup', () => {
  /** baseline as captured at open + the draft as it now stands → the markup. */
  const render = (baseline: Draft[], draft: Draft[]): string => {
    v.baseline(baseline.map((s) => ({ ...s })));
    v.set(draft.map((s) => ({ ...s })));
    return renderSprintModal({
      sprintDraft: draft,
      sprintDupNames: v.dups(),
      sprintBlankNames: v.blanks(),
      sprintOverlaps: v.overlaps(),
      sprintGaps: v.gaps(),
      sprintDirty: v.dirty(),
    });
  };

  it('opened on an empty list → Save dead, nothing to persist', () => {
    expect(saveBtn(render([], []))).toContain('disabled');
  });

  it('emptied BY the user → Save live, so the last sprint can be removed', () => {
    expect(saveBtn(render(FOUR, []))).not.toContain('disabled');
  });

  it('edited and put back → Save dead again, the case the reframe buys', () => {
    const edited = FOUR.map((s) => ({ ...s }));
    edited[1]!.name = 'Sprint 47 renamed';
    expect(saveBtn(render(FOUR, edited))).not.toContain('disabled');
    expect(saveBtn(render(FOUR, FOUR.map((s) => ({ ...s }))))).toContain('disabled');
  });

  it('a blank name renders its own red banner, blocks Save, and raises NO duplicate', () => {
    const draft = FOUR.map((s) => ({ ...s }));
    draft[1]!.name = '   ';
    const html = render(FOUR, draft);

    expect(html).toContain('Sprint name required');
    // the words the route's 422 carries for this same row, verbatim
    expect(html).toContain('A sprint starting 17 Aug 2026 has no name. Name every sprint to save.');
    expect([...html.matchAll(/class="sbanner err"/g)]).toHaveLength(1);
    expect(html).not.toContain('Duplicate sprint names found');
    expect(html).not.toContain('sbctas'); // R-f-5: banners never grow a CTA
    expect(saveBtn(html)).toContain('disabled');

    // and it sits after the row it names, because `after` is the draft index
    const rowAt = [...html.matchAll(/class="strow"/g)].map((m) => m.index!);
    const bannerAt = html.indexOf('class="sbanner err"');
    expect(bannerAt).toBeGreaterThan(rowAt[1]!);
    expect(bannerAt).toBeLessThan(rowAt[2]!);
  });

  it('two blank names render TWO blank banners and still no duplicate one', () => {
    const draft = FOUR.map((s) => ({ ...s }));
    draft[0]!.name = '';
    draft[1]!.name = '\t';
    const html = render(FOUR, draft);

    expect([...html.matchAll(/class="sbanner err"/g)]).toHaveLength(2);
    expect([...html.matchAll(/Sprint name required/g)]).toHaveLength(2);
    expect(html).toContain('A sprint starting 3 Aug 2026 has no name. Name every sprint to save.');
    expect(html).toContain('A sprint starting 17 Aug 2026 has no name. Name every sprint to save.');
    expect(html).not.toContain('Duplicate sprint names found');
    expect(saveBtn(html)).toContain('disabled');
  });

  it('a real duplicate still renders as a duplicate — the blank guard took nothing else', () => {
    const draft = FOUR.map((s) => ({ ...s }));
    draft[1]!.name = 'Sprint 46';
    const html = render(FOUR, draft);
    expect(html).toContain('Duplicate sprint names found');
    expect(html).not.toContain('Sprint name required');
    expect(saveBtn(html)).toContain('disabled');
  });

  it('a gap is advisory — the banner renders and Save stays live', () => {
    const draft = FOUR.map((s) => ({ ...s }));
    draft.splice(1, 1); // drop Sprint 47, opening a two-week hole
    const html = render(FOUR, draft);
    expect(html).toContain('class="sbanner warn"');
    expect(html).toContain('role="status"');
    expect(saveBtn(html)).not.toContain('disabled');
  });
});

describe('batch semantics — one PUT, nothing per row', () => {
  it('sends the whole draft in a single PUT and never stamps a sprint onto a row', () => {
    expect([...APP_JS.matchAll(/api\.send\('PUT', `\/api\/projects\/\$\{app\.get\('activeProjectId'\)\}\/sprints`/g)]).toHaveLength(1);
    /* Amended 2026-08-28 (#72): ONE legitimate `sprint_id` exists now — the
       Add row's POST pairs a work card with the sprint list the PM opened
       (frozen contract, PLAN.md). Sprint DEFINITIONS still travel only in
       the batch PUT, and no client code assigns a sprintId onto a row — the
       rows arrive from the server already carrying theirs. */
    expect([...APP_JS.matchAll(/sprint_id/g)]).toHaveLength(1);
    expect(APP_JS).not.toMatch(/\.sprintId\s*=[^=]/); // no property assignment, anywhere
  });

  it('re-copies from the stored list on open, which is what makes Cancel a discard', () => {
    expect(APP_JS).toContain("app.set('sprintDraft', stored.map((s) => ({ ...s })))");
  });
});

describe('the Ractive comment hazard, over the new markup', () => {
  it('leaks no comment text into the DOM', () => {
    expect(leakedMustacheText()).toEqual([]);
  });

  it('would catch one — negative control', () => {
    const leaks = leakedMustacheText('<div>{{! a comment quoting {{sprintDraft.length}} and trailing on }}</div>');
    expect(leaks.length).toBeGreaterThan(0);
  });
});
