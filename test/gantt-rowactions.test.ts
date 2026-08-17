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

describe('a scheduled row is moved by its BAR, not by itself', () => {
  const html = renderGantt({ plannerGroups: groups([SCHEDULED]) });
  const r = row(html, 'c1');

  it('emits no draggable on the row at all — not even draggable="false"', () => {
    const open = /<div class="growr[^>]*>/.exec(r)![0];
    expect(open).not.toContain('draggable');
  });

  it('puts draggable on the .gbar wrapper instead, with the segments inside it', () => {
    expect(r).toMatch(/<div class="gbar" draggable="true"[^>]*>/);
    const bar = /<div class="gbar"[\s\S]*?<\/div>\s*<\/div>/.exec(r)![0];
    expect(bar).toContain('class="gseg sketch"');
  });

  it('names the bar as the grab target', () => {
    expect(r).toContain('title="Drag along the timeline to reslot"');
  });

  it('drops the gutter grip — it would drag nothing (R-drag-b)', () => {
    expect(r).not.toContain('ghandle');
  });

  it('sources the dragstart from the bar; the row carries none (source, not render)', () => {
    // `on-dragstart` is a Ractive directive and never reaches toHTML() output
    expect(TEMPLATE).toMatch(/<div class="gbar"[^>]*\n?\s*on-dragstart="\['dragRow', row\.cardId\]"/);
    expect([...TEMPLATE.matchAll(/on-dragstart="\['dragRow', row\.cardId\]"/g)]).toHaveLength(2); // bar + unscheduled row
    expect(TEMPLATE).toMatch(/\{\{#if !row\.slottedWeek\}\}draggable="\{\{ row\.pinned \? 'false' : 'true' \}\}" on-dragstart=/);
  });

  it('keeps the segments the only hit area, so week cells stay droppable', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.gbar \{[^}]*pointer-events: none/);
    expect(GANTT_CSS).toMatch(/\.gantt \.gbar \.gseg \{[^}]*pointer-events: auto/);
    // `on-drop` is a directive too — it never renders; the .gweek cells do
    expect([...html.matchAll(/<div class="gweek"><\/div>/g)]).toHaveLength(2);
    expect(TEMPLATE).toContain('<div class="gweek" on-dragover="[\'dragOver\']" on-drop="[\'dropOnWeek\', wk.key]">');
  });
});

/**
 * The grab necessarily STARTS on a segment, so a segment left solid for the
 * duration of the drag is the hit-test winner for every short horizontal move —
 * and gseg → gbar → gtrack → growr → gbrows carries no dragover handler, so
 * nothing calls preventDefault and the drop is refused. Whether the browser
 * actually completes the drop is a live-browser question (still T134); what is
 * testable here is that the state flag, the class and the rule that make it
 * possible all exist and agree.
 */
describe('a live drag makes the bar transparent so the week cells can take the drop', () => {
  it('carries the state on the planner root, only while dragging', () => {
    const classes = (h: string) => (/^<div class="([^"]*)"/.exec(h)?.[1] ?? '').split(/\s+/).filter(Boolean);
    expect(classes(renderGantt({ ganttDragging: true }))).toEqual(['gantt', 'gdragging']);
    expect(renderGantt()).not.toContain('gdragging');
  });

  it('lifts pointer-events off the segments AND the deadline tick for the duration', () => {
    expect(GANTT_CSS).toMatch(
      /\.gantt\.gdragging \.gbar \.gseg,\s*\n\.gantt\.gdragging \.gdl \{[^}]*pointer-events: none/,
    );
  });

  it('outranks the resting rule it overrides', () => {
    // 4 classes beats 3 — otherwise the `pointer-events: auto` above wins and
    // nothing changes during the drag
    const dragging = GANTT_CSS.indexOf('.gantt.gdragging .gbar .gseg');
    expect(dragging).toBeGreaterThan(GANTT_CSS.indexOf('.gantt .gbar .gseg {'));
  });

  it('sets the flag on dragstart and clears it on dragend and at the write', () => {
    expect(APP_JS).toMatch(/dragRow\(ctx, cardId\) \{[\s\S]*?app\.set\('ganttDragging', true\);/);
    expect(APP_JS).toContain("dragEnd() { app.set('ganttDragging', false); }");
    // belt and braces: a re-render that eats the source node would swallow
    // dragend and leave every bar un-grabbable
    expect(APP_JS).toMatch(/async function moveRows\([\s\S]*?app\.set\('ganttDragging', false\);/);
  });

  it('wires dragend to BOTH drag sources — the bar and the unscheduled row', () => {
    // a directive again: it never reaches toHTML() for any row kind
    expect([...TEMPLATE.matchAll(/on-dragend="\['dragEnd'\]"/g)]).toHaveLength(2);
    expect(TEMPLATE).toMatch(/<div class="gbar"[^>]*\n?\s*on-dragstart="\['dragRow', row\.cardId\]" on-dragend="\['dragEnd'\]"/);
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

  it('renders no .gbar — there is nothing scheduled to grab', () => {
    expect(r).not.toContain('class="gbar"');
    expect(r).toContain('class="gunsched"');
  });

  it('still says so in the hint line', () => {
    expect(r).toContain('drag the row onto a week');
  });
});

describe('a pinned row refuses both grabs (JP 2026-08-17, ruling B)', () => {
  const html = renderGantt({ plannerGroups: groups([PINNED]) });
  const r = row(html, 'c3');

  it('marks the bar undraggable and says why', () => {
    expect(r).toContain('<div class="gbar" draggable="false"');
    expect(r).toContain('title="Pinned — unpin to move"');
  });

  it('carries the reason on the row as well', () => {
    expect(/<div class="growr[^>]*>/.exec(r)![0]).toContain('title="Pinned — unpin to move"');
  });

  it('refuses the cursor', () => {
    expect(GANTT_CSS).toMatch(/\.gantt \.growr\.pinned \.gbar,\s*\n\.gantt \.growr\.pinned \.gbar \.gseg:active \{[^}]*cursor: not-allowed/);
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
