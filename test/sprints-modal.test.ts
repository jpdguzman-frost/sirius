/**
 * Sprints modal, four states (owls #28–#30, phase 13j / T137–T138).
 *
 * Two halves, both against the SHIPPED files and neither retyped:
 *
 * 1. The validators are EXECUTED out of `frontend/scripts/01-app.js` (the
 *    test/suggest-counts.test.ts precedent), because what a banner says and
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
interface Banner { variant: string; title: string; text: string; after?: number }
interface Validators {
  set(draft: Draft[], holidays?: string[]): void;
  dups(): Banner[];
  overlaps(): Banner[];
  gaps(): Banner[];
  workingDays(a: string, b: string, h?: string[]): number;
  monday(iso: string): string;
  friday(iso: string): string;
}

const COMPUTEDS = ['sprintOrder', 'sprintDupNames', 'sprintOverlaps', 'sprintGaps'];

// `this.get(key)` resolves a computed transparently in Ractive, so the harness
// `get` does too — that is what lets sprintOverlaps/sprintGaps consume
// sprintOrder unmodified.
const v = new Function(`
  ${constDecl('isoOf')}
  ${fn('mondayIso')}
  ${fn('fridayIso')}
  ${fn('workingDaysBetween')}
  const computed = { ${COMPUTEDS.map((n) => computedMethod(n)).join(', ')} };
  const DATA = { sprintDraft: [], holidays: [] };
  const ctx = { get: (k) => (Object.prototype.hasOwnProperty.call(computed, k) ? computed[k].call(ctx) : DATA[k]) };
  return {
    set: (draft, holidays) => { DATA.sprintDraft = draft; DATA.holidays = holidays || []; },
    dups: () => computed.sprintDupNames.call(ctx),
    overlaps: () => computed.sprintOverlaps.call(ctx),
    gaps: () => computed.sprintGaps.call(ctx),
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
  const html = renderSprintModal({ sprintDraft: FOUR, sprintOpenedEmpty: false });

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

  it('enables Save when the list is clean', () => {
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
    sprintOpenedEmpty: false,
    sprintGaps: [{
      variant: 'warn',
      title: 'Unscheduled Gap Detected',
      text: "There are unallocated working days between Sprint 46 and Sprint 47. Deliverables scheduled during this period won't belong to any sprint.",
      after: 0,
    }],
  });
  const dup = renderSprintModal({
    sprintDraft: FOUR,
    sprintOpenedEmpty: false,
    sprintDupNames: [{
      variant: 'err',
      title: 'Duplicate sprint names found',
      text: 'Multiple sprints are named "Sprint 46". Give each sprint a unique name to save.',
    }],
  });
  const lap = renderSprintModal({
    sprintDraft: FOUR,
    sprintOpenedEmpty: false,
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
    sprintOpenedEmpty: false,
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

  it('reads the count from the SAME membership test the planner derives with', () => {
    // `slottedWeek ∈ [start, end]` — never a stored sprint reference (invariant 12)
    expect(APP_JS).toContain('r.slottedWeek >= s.start && r.slottedWeek <= s.end');
  });
});

describe('R7 — an emptied table is not the same state as an empty one', () => {
  it('keeps Save live when the user has removed every row, so the deletion can land', () => {
    expect(saveBtn(renderSprintModal({ sprintDraft: [], sprintOpenedEmpty: false }))).not.toContain('disabled');
  });

  it('still renders Save dead when the modal was opened with none', () => {
    expect(saveBtn(renderSprintModal({ sprintDraft: [], sprintOpenedEmpty: true }))).toContain('disabled');
  });

  it('sets the flag once, at open, from the STORED list', () => {
    expect(APP_JS).toContain('sprintOpenedEmpty: stored.length === 0');
  });
});

describe('batch semantics — one PUT, nothing per row', () => {
  it('sends the whole draft in a single PUT and never writes a sprint id onto a row', () => {
    expect([...APP_JS.matchAll(/api\.send\('PUT', `\/api\/projects\/\$\{app\.get\('activeProjectId'\)\}\/sprints`/g)]).toHaveLength(1);
    // membership is derived; no per-row sprint write exists anywhere in the client
    expect(APP_JS).not.toMatch(/sprint_id|sprintId\s*[:=]/);
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
