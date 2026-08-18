/**
 * Row action cluster (owl #27, T136) and drag reversal (owl #31, T139).
 *
 * Both features are template + CSS, and both are governed by JP's ruling of
 * 2026-08-17 — **pins stay FULLY frozen** — which supersedes the "a pin blocks
 * Suggest, not deliberate action" line still carried by owls #27/#31 and by two
 * live Figma annotations. That makes the pinned cases the load-bearing ones
 * here, not an afterthought.
 *
 * Everything a browser would show is RENDERED with Ractive's own `toHTML()`.
 * Two things it cannot show are asserted against the shipped source instead and
 * said so out loud: `on-dragstart` is a Ractive DIRECTIVE and never reaches the
 * output for any row kind, and `moveRows`' BR-8 group resolution is behaviour
 * with no markup at all. The live-browser pass (a real drag, a real drop, the
 * arrival scroll) is still owed — recorded in the frame notes as T134/R5.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  GANTT_CSS,
  ICONS_JS,
  TEMPLATE,
  type PlannerGroup,
  type PlannerRow,
  renderGantt,
} from './helpers/gantt-render.ts';

const SCHEDULED: PlannerRow = {
  cardId: 'c1', mcLabel: 'MC-655', displayId: 'MC-655.1', name: 'Hero render',
  slottedWeek: '2026-08-03', urgency: 'Urgent', difficulty: 'Hard',
  requestor: 'Ana', assetType: 'Render', currentList: 'Sketching', status: 'ongoing',
};
const PINNED: PlannerRow = { ...SCHEDULED, cardId: 'c3', mcLabel: 'MC-900', displayId: 'MC-900', pinned: true };
const UNSCHEDULED: PlannerRow = {
  cardId: 'c2', mcLabel: 'MC-712', displayId: 'MC-712', name: 'Loft plan',
  slottedWeek: null, urgency: 'Non-Urgent', currentList: 'Backlog', status: 'pending',
};
const NOTED: PlannerRow = { ...SCHEDULED, cardId: 'c4', mcLabel: 'MC-777', displayId: 'MC-777', statusNote: 'client paused it' };

const groups = (rows: PlannerRow[]): PlannerGroup[] => [
  { id: 's1', kind: 'sprint', name: 'Sprint A', meta: '2 wk', count: `${rows.length} items`, rows },
];

/** The one `<div class="growr …">…</div>` for a card, sliced from the render. */
function row(html: string, cardId: string): string {
  const at = html.indexOf(`data-card="${cardId}"`);
  if (at < 0) throw new Error(`gantt-rowactions: no row for ${cardId}`);
  const start = html.lastIndexOf('<div class="growr', at);
  const next = html.indexOf('<div class="growr', at);
  return html.slice(start, next < 0 ? html.length : next);
}

/** The `<span class="gactions">…</span>` cluster inside a row. */
function cluster(rowHtml: string): string {
  const at = rowHtml.indexOf('<span class="gactions">');
  if (at < 0) throw new Error('gantt-rowactions: no .gactions cluster');
  return rowHtml.slice(at, rowHtml.indexOf('</span></div>', at));
}

/* ---------------------------------------------------------------------- */
/* Feature 1 — the row action cluster                                      */
/* ---------------------------------------------------------------------- */

describe('the cluster is the design’s three icons, in the frame’s order', () => {
  const html = renderGantt({ plannerGroups: groups([SCHEDULED]) });
  const c = cluster(row(html, 'c1'));

  it('emits exactly three buttons — Copy · Pin · Calendar Remove', () => {
    expect([...c.matchAll(/<button/g)]).toHaveLength(3);
    expect([...c.matchAll(/href="#i-(row\w+)"/g)].map((m) => m[1]))
      .toEqual(['rowCopy', 'rowPin', 'rowCalRemove']);
  });

  it('gives every one a title AND an accessible label', () => {
    const buttons = [...c.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(3);
    for (const b of buttons) {
      expect(b).toMatch(/title="[^"]+"/);
      expect(b).toMatch(/aria-label="[^"]+"/);
    }
  });

  it('routes Copy and Pin to the handlers that already existed', () => {
    expect(TEMPLATE).toContain("on-click=\"['duplicateRow', row.cardId]\"");
    expect(TEMPLATE).toContain("on-click=\"['togglePin', row.cardId, row.pinned]\"");
  });

  it('routes Calendar Remove to the SAME audited unslot a header drop takes', () => {
    expect(TEMPLATE).toContain("on-click=\"['unslotRow', row.cardId]\"");
    // no new endpoint and no new audit action: moveRows(id, null) → POST /replot
    expect(APP_JS).toMatch(/async unslotRow\([\s\S]*?await moveRows\(cardId, null\);/);
    expect(APP_JS).not.toMatch(/\/unslot|schedule\.unslot/);
  });

  it('keeps all three in the tab order at rest — opacity, never display', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.gactions \{[^}]*opacity: 0/);
    expect(GANTT_CSS).not.toMatch(/\.gantt \.gactions \{[^}]*display: none/);
  });

  it('states the cluster on a pinned row, because state must not hide behind a hover', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.growr\.pinned \.gactions,?\s*\{?[^}]*opacity: 1/);
  });
});

describe('Calendar Remove refuses where it would change nothing', () => {
  const html = renderGantt({ plannerGroups: groups([SCHEDULED, PINNED, UNSCHEDULED]) });
  const calRemove = (cardId: string) =>
    /<button[^>]*>(?=[\s\S]{0,200}i-rowCalRemove)/.exec(cluster(row(html, cardId)).slice(cluster(row(html, cardId)).indexOf('i-rowPin')))?.[0]
    ?? [...cluster(row(html, cardId)).matchAll(/<button[^>]*>/g)].map((m) => m[0])[2]!;

  it('is live on a scheduled, unpinned row', () => {
    const b = calRemove('c1');
    expect(b).not.toContain('disabled');
    expect(b).toContain('title="Remove from the schedule"');
  });

  it('is DISABLED on a pinned row and says why (JP’s ruling B — pins fully frozen)', () => {
    const b = calRemove('c3');
    expect(b).toContain('disabled');
    expect(b).toContain('Pinned — unpin to move');
  });

  it('is DISABLED on a row that is already off the schedule', () => {
    // /replot audits every move it applies, so an enabled control here would
    // write a `schedule.replot` row for a non-change (invariant 10)
    const b = calRemove('c2');
    expect(b).toContain('disabled');
    expect(b).toContain('Already off the schedule');
  });

  it('guards the handler too, not only the attribute', () => {
    expect(APP_JS).toMatch(/async unslotRow\([\s\S]*?if \(row\.pinned\)/);
    expect(APP_JS).toMatch(/async unslotRow\([\s\S]*?if \(!row\.slottedWeek\) return;/);
  });

  it('draws the refusal', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.gact\[disabled\] \{[^}]*cursor: not-allowed/);
  });
});

describe('the status-note affordance kept its home, outside the cluster (#27)', () => {
  const html = renderGantt({ plannerGroups: groups([NOTED, SCHEDULED]) });

  it('never sits in badge-icons-container', () => {
    for (const id of ['c4', 'c1']) {
      const c = cluster(row(html, id));
      expect(c).not.toContain('editNote');
      expect(c).not.toContain('gnote');
      expect(c).not.toContain('✎');
    }
  });

  it('turns the chip that announces a note into the button that edits it', () => {
    const scope = /<div class="gchips">[\s\S]*?<\/div>/.exec(row(html, 'c4'))![0];
    expect(scope).toContain('<button class="pbadge gsm gnote"');
    expect(scope).toContain('>manual</button>');
    expect(scope).toContain('aria-label="Edit the status note on MC-777: client paused it"');
  });

  it('offers a ghost pencil in the same chips row when there is no note', () => {
    const scope = /<div class="gchips">[\s\S]*?<\/div>/.exec(row(html, 'c1'))![0];
    expect(scope).toContain('class="gact gnoteadd"');
    expect(scope).toContain('aria-label="Add a status note to MC-655"');
  });

  it('reveals the ghost on the same hover/focus the cluster answers to', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.gnoteadd \{[^}]*opacity: 0/);
    expect(GANTT_CSS).toMatch(/\.gantt \.growr:hover \.gnoteadd,\s*\n\.gantt \.growr:focus-within \.gnoteadd \{[^}]*opacity: 1/);
  });

  it('is still the app’s only status-note edit surface, and there is exactly one per row', () => {
    const r = row(html, 'c4');
    expect([...r.matchAll(/editNote/g)]).toHaveLength(0); // the handler name is a directive, stripped
    expect([...TEMPLATE.matchAll(/\['editNote'/g)]).toHaveLength(2); // the chip and the ghost, one branch each
  });
});

describe('the three sprites match the library components (§1.6)', () => {
  it('adds exactly the three named entries', () => {
    for (const name of ['rowCopy', 'rowPin', 'rowCalRemove']) {
      expect(ICONS_JS).toMatch(new RegExp(`\\n  ${name}: '<svg `));
    }
  });

  it('draws each on a 13 viewBox with the components’ own stroke', () => {
    for (const name of ['rowCopy', 'rowPin', 'rowCalRemove']) {
      const entry = new RegExp(`\\n  ${name}: '(.*)',\\n`).exec(ICONS_JS)![1]!;
      expect(entry).toContain('viewBox="0 0 13 13"');
      expect(entry).toContain('fill="none"');
      expect(entry).toContain('stroke="currentColor"');
      expect(entry).toContain('stroke-width="1.08333"');
      expect(entry).toContain('stroke-linecap="round"');
      expect(entry).toContain('stroke-linejoin="round"');
      expect(entry).not.toContain('#94A3B8'); // normalised to currentColor, tinted in CSS
    }
  });

  it('leaves the sprite builder alone — the rows still reference #i-<name>', () => {
    expect(ICONS_JS).toContain('<symbol id="i-');
    expect(GANTT_CSS).toMatch(/\.gantt \.gact svg \{/);
  });
});

/* ---------------------------------------------------------------------- */
/* Feature 3 — drag reversal                                               */
/* ---------------------------------------------------------------------- */

describe('a scheduled row is moved by its COLOURED RUN, not by itself or by the whole track', () => {
  const html = renderGantt({ plannerGroups: groups([SCHEDULED]) });
  const r = row(html, 'c1');

  it('emits no draggable on the row at all — not even draggable="false"', () => {
    const open = /<div class="growr[^>]*>/.exec(r)![0];
    expect(open).not.toContain('draggable');
  });

  /**
   * JP's 2026-08-18 structural ruling, made into an assertion: "Gbar stays, but
   * the colored bars wrapped in a draggable container can now be dragged." The
   * NESTING is the ruling — `.gbar` positions, `.grun` drags, `.gseg` paints —
   * so all three levels are asserted in order rather than each in isolation.
   */
  it('puts draggable on the .grun box inside .gbar, with the segments inside THAT', () => {
    // read off the extracted OPEN TAG, not by adjacency: Ractive's `toHTML()`
    // emits `style` ahead of `draggable` whatever order the template writes
    // them in, and an adjacency assertion would fail for a rendering detail
    // that has nothing to do with the claim being made
    expect(/<div class="grun"[^>]*>/.exec(r)![0]).toContain('draggable="true"');
    expect(r).toMatch(/<div class="gbar">\s*<div class="grun"/);
    expect(r).toMatch(/<div class="grun"[^>]*>\s*<div class="gseg sketch"/);
    // the wrapper is a plain positioning box now — no draggable anywhere on it
    expect(/<div class="gbar"[^>]*>/.exec(r)![0]).not.toContain('draggable');
  });

  /**
   * MOVED, not weakened (JP, 2026-08-18 — T155(h)). This used to assert
   * `title="Drag along the timeline to reslot"` on `.gbar`. That title is gone
   * and the assertion would now be WRONG to keep: the wrapper spans the whole
   * 1104px track for hit-testing reasons, so the hint popped over empty air and
   * offered a grab where no bar exists. The same three claims are asserted
   * here, at their new homes:
   *   1. the bar advertises nothing — no title at all, so empty track is silent;
   *   2. the grab affordance is the coloured run (`.gseg` owns `cursor: grab`,
   *      the wrapper is neutral) — pinned in CSS below;
   *   3. the instruction itself survives as STANDING text, not a tooltip, in
   *      the hint line above the Gantt (rendered by suggest-counts.test.ts).
   */
  it('advertises nothing on either wrapper — hovering empty track says nothing', () => {
    // T158 adds the second half: `.grun` extends invisibly by up to ~6px to
    // reach the 24px minimum grab width, and a `title` there would pop a
    // tooltip over what looks like empty track. Neither box speaks.
    expect(/<div class="gbar"[^>]*>/.exec(r)![0]).not.toContain('title=');
    expect(/<div class="grun"[^>]*>/.exec(r)![0]).not.toContain('title=');
    expect(r).not.toContain('Drag along the timeline to reslot');
  });

  it('puts the grab affordance on the coloured run, not across the track', () => {
    // the cursor split is JP's 2026-08-18 affordance ruling applied at 24px
    // instead of 1104px: `grab` over colour, plain arrow over empty track. The
    // invisible extension reads as empty track to the eye, so the box is
    // `default` and only the segments offer the grab.
    expect(GANTT_CSS).toMatch(/\.gantt \.grun \{[^}]*cursor: default/);
    expect(GANTT_CSS).not.toMatch(/\.gantt \.grun \{[^}]*cursor: grab/);
    expect(GANTT_CSS).toMatch(/\.gantt \.grun \.gseg \{[^}]*cursor: grab/);
    // PRESERVATION GUARD, not a regression proof: this rule's DECLARATIONS are
    // byte-identical across both rulings — only its ancestor selector moved. It
    // is here so that `grab` living on `.gseg` cannot later be "tidied" by
    // dropping the pressed state.
    expect(GANTT_CSS).toMatch(/\.gantt \.grun \.gseg:active \{[^}]*cursor: grabbing/);
  });

  it('keeps the reslot instruction as standing text, where no hover is needed', () => {
    // Scoped to the `.fnnote` span on purpose. A bare `toContain` on TEMPLATE is
    // satisfied by the Ractive comment at the bar (which quotes this sentence and
    // never renders), so deleting the real hint would leave it green.
    expect(TEMPLATE).toMatch(/<span class="fnnote">[^<]*Drag a bar along its row to reslot it/);
  });

  it('leaves the segments’ own titles alone — they name the phase, not the mechanic', () => {
    const seg = /<div class="gseg sketch"[^>]*>/.exec(r)![0];
    expect(seg).toContain('title=');
    expect(seg).not.toContain('reslot');
  });

  it('drops the gutter grip — it would drag nothing (R-drag-b)', () => {
    expect(r).not.toContain('ghandle');
  });

  it('sources the dragstart from the run box; the row carries none (source, not render)', () => {
    // `on-dragstart` is a Ractive directive and never reaches toHTML() output
    expect(TEMPLATE).toMatch(/<div class="grun"[^>]*on-dragstart="\['dragRow', row\.cardId\]"/);
    expect([...TEMPLATE.matchAll(/on-dragstart="\['dragRow', row\.cardId\]"/g)]).toHaveLength(2); // run + unscheduled row
    expect(TEMPLATE).toMatch(/\{\{#if !row\.slottedWeek\}\}draggable="\{\{ row\.pinned \? 'false' : 'true' \}\}" on-dragstart=/);
  });

  it('is hit-testable at all times and owns its own drop; the week cells keep theirs (batches 7 + 8)', () => {
    // REVERSED from 13g/13j, and MOVED DOWN A LEVEL by T158.
    // `pointer-events: none` on the DRAG SOURCE is what cancelled every real
    // drag: Chrome starts the drag from the draggable element and abandons it
    // in the same tick when that element cannot be hit. `.grun` is the source
    // now, so `.grun` is what must stay solid — and `.gbar` goes back to
    // transparent precisely so the `.gweek` columns get their drops back
    // everywhere outside the coloured run.
    expect(GANTT_CSS).toMatch(/\.gantt \.grun \{[^}]*pointer-events: auto/);
    expect(GANTT_CSS).toMatch(/\.gantt \.grun \.gseg \{[^}]*pointer-events: auto/);
    expect(GANTT_CSS).toMatch(/\.gantt \.gbar \{[^}]*pointer-events: none/);
    // `on-drop` is a directive too — it never renders; the .gweek cells do, and
    // they serve the UNSCHEDULED rows and every pixel of track outside a run
    expect([...html.matchAll(/<div class="gweek"><\/div>/g)]).toHaveLength(2);
    expect(TEMPLATE).toContain('<div class="gweek" on-dragover="[\'dragOver\']" on-drop="[\'dropOnWeek\', wk.key]">');
  });

  it('draws NO run box at all when every phase is clipped out of the window', () => {
    // `phaseRun` returns [] there, so `{{#each}}` emits nothing: no box, no
    // `draggable`, no segment. A row with nothing visible has nothing to grab —
    // and, because the geometry path carries no `{{#if}}`, that falls out of the
    // empty-array shape rather than out of a second code path.
    const blank = row(renderGantt({ plannerGroups: groups([SCHEDULED]), phaseRun: () => [] }), 'c1');
    expect(blank).toContain('<div class="gbar">');
    expect(blank).not.toContain('class="grun"');
    expect(blank).not.toContain('draggable');
    expect(blank).not.toContain('class="gseg');
  });
});

/**
 * Batch 7 correction, and the reason the flag was NOT deleted.
 *
 * 13g/13j reasoned that the bar overlay had to go transparent so hit-testing
 * would fall through to the `.gweek` cells. That is precisely what broke the
 * feature: a drag source Chrome cannot hit is a drag Chrome abandons in the
 * same tick, and turning the source transparent *during* the drag cancels it
 * just as surely as turning it transparent at rest. The bar stays solid now and
 * owns its own drop (`dropOnBar` → the same `moveRows`).
 *
 * `ganttDragging` survives with one clause instead of two. `.gdl` is a later
 * sibling of `.gbar` in the same positioned `.gtrack`, both absolute at z-index
 * auto, so the tick paints OVER the bar and wins hit-testing at its 2px column;
 * carrying no dragover handler, it would refuse the drop at exactly the
 * deadline. It hides for the duration — and only for the duration, because at
 * rest its `title` is a real affordance.
 *
 * Whether the browser completes the drop is still a live-browser question
 * (T134/R5). No assertion here, and no synthetic DragEvent anywhere, can
 * answer it — that is the whole reason this bug shipped.
 */
describe('a live drag hides only the deadline tick, so the solid bar can take its own drop', () => {
  it('carries the state on the planner root, only while dragging', () => {
    const classes = (h: string) => (/^<div class="([^"]*)"/.exec(h)?.[1] ?? '').split(/\s+/).filter(Boolean);
    expect(classes(renderGantt({ ganttDragging: true }))).toEqual(['gantt', 'gdragging']);
    expect(renderGantt()).not.toContain('gdragging');
  });

  it('lifts pointer-events off the deadline tick ALONE, never off the segments', () => {
    expect(GANTT_CSS).toMatch(/\.gantt\.gdragging \.gdl \{[^}]*pointer-events: none/);
    // nothing needs the segments transparent now that the solid bar beneath
    // them takes the drop. Keeping the whole drag source hittable is the
    // stricter line on purpose: control 3 of the real-input diagnosis blanked
    // the WRAPPER mid-drag and got the same-tick cancel, and a blanked `.gseg`
    // becomes that same cancel the moment `draggable` moves down onto it — the
    // variant batch 7 rejected.
    expect(GANTT_CSS).not.toContain('.gantt.gdragging .gbar .gseg');
  });

  it('never turns the DRAG SOURCE transparent, in any state — that is the batch-7 bug', () => {
    // replaces the old specificity test: `.gdl` has no resting
    // `pointer-events: auto` rule to out-rank, so "4 classes beats 3" no longer
    // has a subject. What matters instead is the SCOPE of the transparency.
    // T158 repoints it: the subject that must never be transparent is `.grun`,
    // the element that carries `draggable`. `.gbar` is transparent on purpose
    // now — it is a positioning wrapper, not a handle. The exhaustive sweep,
    // including the rule that an ancestor's `none` is legal only when the
    // source re-declares `auto`, lives in test/drag-hittest.test.ts; this keeps
    // the local rule honest next to the assertions it belongs with.
    expect(GANTT_CSS).not.toMatch(/\.grun[^{,]*\{[^}]*pointer-events: none/);
  });

  it('sets the flag on dragstart and clears it on dragend and at the write', () => {
    expect(APP_JS).toMatch(/dragRow\(ctx, cardId\) \{[\s\S]*?app\.set\('ganttDragging', true\);/);
    expect(APP_JS).toContain("dragEnd() { app.set('ganttDragging', false); }");
    // belt and braces: a re-render that eats the source node swallows dragend,
    // and a stuck flag would leave every deadline tick permanently transparent
    // — a lost tooltip now rather than an un-grabbable bar, but still wrong
    expect(APP_JS).toMatch(/async function moveRows\([\s\S]*?app\.set\('ganttDragging', false\);/);
  });

  it('wires dragend to BOTH drag sources — the run box and the unscheduled row', () => {
    // a directive again: it never reaches toHTML() for any row kind
    expect([...TEMPLATE.matchAll(/on-dragend="\['dragEnd'\]"/g)]).toHaveLength(2);
    expect(TEMPLATE).toMatch(/<div class="grun"[^>]*on-dragstart="\['dragRow', row\.cardId\]" on-dragend="\['dragEnd'\]"/);
    expect(TEMPLATE).toMatch(/\{\{#if !row\.slottedWeek\}\}draggable=[^\n]*on-dragstart="\['dragRow', row\.cardId\]" on-dragend="\['dragEnd'\]"/);
  });
});

describe('an unscheduled row keeps the row-drag it has no bar to replace (R-drag-a)', () => {
  const html = renderGantt({ plannerGroups: groups([UNSCHEDULED]) });
  const r = row(html, 'c2');

  it('still drags whole', () => {
    expect(/<div class="growr[^>]*>/.exec(r)![0]).toContain('draggable="true"');
  });

  it('keeps its grip, because the grip still drags something', () => {
    expect(r).toContain('class="ghandle"');
  });

  it('renders neither .gbar nor .grun — there is nothing scheduled to grab', () => {
    expect(r).not.toContain('class="gbar"');
    expect(r).not.toContain('class="grun"');
    expect(r).toContain('class="gunsched"');
  });

  it('still says so in the hint line', () => {
    expect(r).toContain('drag the row onto a week');
  });
});

describe('a pinned row refuses both grabs (JP 2026-08-17, ruling B)', () => {
  const html = renderGantt({ plannerGroups: groups([PINNED]) });
  const r = row(html, 'c3');

  it('marks the run box undraggable, and no longer speaks for the whole track', () => {
    // the open tag, not adjacency — `toHTML()` puts `style` first (see above)
    expect(/<div class="grun"[^>]*>/.exec(r)![0]).toContain('draggable="false"');
    // MOVED (2026-08-18): the wrapper's `title` is gone in BOTH branches, so the
    // refusal is asserted at its two surviving homes below rather than here.
    // Losing it would be invisible without those two — hence they are separate
    // failing assertions, not an `expect(r).toContain(…)` that any one of the
    // row's several copies of the sentence could satisfy. T158 adds `.grun` to
    // the silent list for the same reason it added it to `.gbar`.
    expect(/<div class="gbar"[^>]*>/.exec(r)![0]).not.toContain('title=');
    expect(/<div class="grun"[^>]*>/.exec(r)![0]).not.toContain('title=');
  });

  it('carries the reason on the row, which is what the track inherits', () => {
    // `title` on an ancestor is what a title-less descendant shows, so this ONE
    // attribute is why hovering a pinned row's empty track still states the pin
    expect(/<div class="growr[^>]*>/.exec(r)![0]).toContain('title="Pinned — unpin to move"');
  });

  it('carries it on the coloured runs too, appended to the phase', () => {
    expect(/<div class="gseg sketch"[^>]*>/.exec(r)![0]).toContain(' · Pinned — unpin to move"');
  });

  it('refuses the cursor — on the segments, where the grab was offered', () => {
    // only the RESTING clause is load-bearing — at (0,5,0) it already outranks
    // both `.gseg`'s `grab` (0,3,0) and `:active`'s `grabbing` (0,4,0), so a
    // pressed pinned segment computes `not-allowed` even without the second
    // clause. It is kept defensively and asserted so a later edit cannot drop
    // one clause and keep the other's comment. Scoped off `.gbar` by JP's
    // 2026-08-18 ruling — a refusal is an affordance, and a 1104px `not-allowed`
    // would withhold a whole track that never offered anything.
    expect(GANTT_CSS).toMatch(/\.gantt \.growr\.pinned \.grun \.gseg,\s*\n\.gantt \.growr\.pinned \.grun \.gseg:active \{[^}]*cursor: not-allowed/);
    // neither wrapper may be a SUBJECT again — matches `.grun,` / `.grun {` /
    // `.grun{`, and deliberately not `.grun .gseg…`. Specificity is unchanged
    // by the substitution: (0,5,0) resting, still out-ranking `.gantt .grun
    // .gseg`'s grab (0,3,0) and the `:active` grabbing (0,4,0).
    expect(GANTT_CSS).not.toMatch(/\.gantt \.growr\.pinned \.grun\s*[,{]/);
    expect(GANTT_CSS).not.toMatch(/\.gantt \.growr\.pinned \.gbar\s*[,{]/);
  });

  it('leaves the keyboard guard exactly as it was', () => {
    expect(APP_JS).toContain("flashBanner('Pinned — unpin to move.')");
  });
});

describe('BR-8 multi-select survives the reversal', () => {
  const html = renderGantt({ plannerGroups: groups([SCHEDULED, UNSCHEDULED]) });

  it('keeps the checkbox on BOTH row kinds', () => {
    for (const id of ['c1', 'c2']) {
      expect(row(html, id)).toContain('class="gsel"');
      expect(row(html, id)).toContain('for a multi-row move');
    }
  });

  it('leaves the group-resolution expression untouched (drift guard)', () => {
    expect(APP_JS).toContain('const group = ids.length > 1 && ids.includes(grabbedId) ? ids : [grabbedId];');
  });

  it('still applies the grabbed row’s week DELTA to every member', () => {
    expect(APP_JS).toMatch(/deltaWeeks/);
    expect(APP_JS).toContain("await api.send('POST', `/api/projects/${'$'}{app.get('activeProjectId')}/replot`".replace("${'$'}", '$'));
  });

  it('keeps the keyboard reslot on every row kind', () => {
    for (const id of ['c1', 'c2']) expect(row(html, id)).toContain('tabindex="0"');
    expect(TEMPLATE).toContain("on-keydown=\"['rowKey', row.cardId]\"");
  });
});

describe('the arrival affordance says where a row landed', () => {
  it('marks only the rows the drop moved', () => {
    const html = renderGantt({ plannerGroups: groups([SCHEDULED, UNSCHEDULED]), arrived: { c1: true } });
    expect(row(html, 'c1')).toMatch(/class="growr[^"]*arrived/);
    expect(row(html, 'c2')).not.toMatch(/class="growr[^"]*arrived/);
  });

  it('pulses, and honours a reduced-motion preference', () => {
    expect(GANTT_CSS).toContain('@keyframes garrive');
    expect(GANTT_CSS).toMatch(/prefers-reduced-motion: reduce[\s\S]*?animation: none/);
  });

  it('re-queries the DOM after the reload, because the node identity changed', () => {
    expect(APP_JS).toMatch(/function announceArrival[\s\S]*?requestAnimationFrame\(/);
    expect(APP_JS).toMatch(/announceArrival[\s\S]*?scrollIntoView\(\{ block: 'nearest' \}\)/);
  });

  it('never pulses a pinned member — /replot skipped it, so it never arrived', () => {
    expect(APP_JS).toMatch(/announceArrival\(moves\.map[\s\S]*?return row && !row\.pinned;/);
  });
});
