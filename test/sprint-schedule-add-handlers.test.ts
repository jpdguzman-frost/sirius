/**
 * SUITE 4, second half — the three add handlers executed in a stub scope, the
 * search row's dress in CSS, and the withdrawal sweep over the 08-28 add flow.
 * Split out of test/sprint-schedule-render.test.ts on 2026-09-05 (PLAN.md §C);
 * the rendered states and the matching recipe are in
 * sprint-schedule-add-search.test.ts, the shared prelude and the panel/CSS
 * fixtures in test/helpers/sprint-schedule-tab.ts.
 */

import { describe, expect, it } from 'vitest';
import { APP_JS_CODE, handlerBody, topDecl } from './helpers/gantt-render.ts';
import { CSS, CSS_RULES, PANELS, rulesFor, schedulesView } from './helpers/sprint-schedule-tab.ts';

/* ---------------------------------------------------------------------- *
 * The three handlers, executed. What matters about them is the ROUTE, the
 * ids that ride along and when the query clears — none of which a source
 * grep can tell apart from a string that merely appears in a body.
 * ---------------------------------------------------------------------- */

interface AddRun {
  api: Array<{ method: string; path: string; body: Record<string, unknown> }>;
  banners: string[];
  /** the sprints the handler asked the focus return for, in order */
  refocus: string[];
  reloads: number;
  reply: unknown;
  state: Record<string, unknown>;
}

/** Every top-level `const`/`function` the shipped bundle declares — what
    `topDecl` can slice. The two shared top-level `let`s are stubbed by name. */
const TOP_LEVEL = new Set([...APP_JS_CODE.matchAll(/\n(?:const|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!));

/** The stub scope every handler run is given. */
const STUBBED = ['app', 'api', 'flashBanner', 'errText', 'loadAll', 'addRefocus', 'sprintItemSaving'];

/**
 * The shipped declarations a body NAMES beyond the stub scope, and theirs in
 * turn, as one prelude. A handler may lean on any top-level helper in the
 * bundle — the skip banner's sentence and its code→wording map, for two — and
 * PLAN.md froze the HANDLERS, not the helpers they reach for. Naming those
 * here would couple this suite to a spelling nobody froze, so they are
 * RESOLVED out of the shipped source instead (test/CLAUDE.md rule 2). Bare
 * references count, not just calls: the map behind the banner is read, never
 * called, and missing it turned a partial add into a caught ReferenceError.
 */
const shippedDeps = (body: string): string => {
  const out: string[] = [];
  const seen = new Set(STUBBED);
  const queue = [body];
  while (queue.length) {
    for (const m of queue.shift()!.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      const name = m[1]!;
      if (seen.has(name) || !TOP_LEVEL.has(name)) continue;
      seen.add(name);
      const decl = topDecl(name);
      out.push(decl);
      queue.push(decl);
    }
  }
  return out.join('\n');
};

/**
 * The handler's own signature as a function expression, DERIVED rather than
 * retyped (rule 2): PLAN.md froze the parameter lists, and a retyped copy
 * would keep binding the arguments below to names the shipped handler had
 * stopped using. Reads the comment-stripped source, as `handlerBody` does.
 */
const handlerHead = (name: string): string => {
  const m = new RegExp(`\\n  (async )?(${name}\\([^)]*\\))`).exec(APP_JS_CODE);
  expect(m, `no \`${name}\` handler in the shipped client`).not.toBeNull();
  return `${m![1] ?? ''}function ${m![2]}`;
};

/**
 * Runs one shipped add handler in a stub scope. Everything the body reaches
 * for outside itself — `app`, `api`, `flashBanner`, `errText`, `loadAll`, the
 * module-level `sprintItemSaving` lock, and any shipped helper it calls — is
 * supplied and recorded. `api.send` answers with the route's documented body,
 * or throws when `reply` is an Error. The seed is DEEP-COPIED: one shared
 * fixture object mutated by an earlier run made a later run's assertion read
 * the earlier run's writes.
 */
const runAdd = async (
  name: 'addOne' | 'addAll' | 'addKey',
  args: unknown[],
  seed: Record<string, unknown> = {},
  reply: unknown = { ok: true, added: 1, skipped: [] },
): Promise<AddRun> => {
  const run: AddRun = {
    api: [],
    banners: [],
    refocus: [],
    reloads: 0,
    reply: reply instanceof Error ? null : reply,
    state: { activeProjectId: 'p1', addQ: {}, addBusy: null, addPanels: {}, ...structuredClone(seed) },
  };
  const factory = new Function(
    'run',
    'fail',
    `
    const state = run.state;
    const app = {
      get: (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), state),
      set: (a, b) => {
        const write = (k, v) => {
          const parts = k.split('.');
          const last = parts.pop();
          let o = state;
          for (const p of parts) o = (o[p] = o[p] || {});
          o[last] = v;
        };
        if (a && typeof a === 'object') Object.keys(a).forEach((k) => write(k, a[k]));
        else write(a, b);
      },
    };
    const api = { send: async (m, p, b) => { run.api.push({ method: m, path: p, body: b }); if (fail) throw fail; return typeof run.reply === 'function' ? run.reply(run) : run.reply; } };
    /* the banner is STATE, as shipped: flashBanner writes the slot and the
       reload writes it too — 80-loaders.js's one app.set carries
       \`banner: … : ''\`. A stub reload that left the slot alone let a summary
       the reload wipes pass as delivered (review 2026-09-05, B2-R1). */
    const flashBanner = (m) => { run.banners.push(String(m)); app.set('banner', String(m)); };
    const errText = (e) => (e && e.detail && e.detail.message) || (e && e.message) || 'Request failed';
    const loadAll = async () => { run.reloads += 1; app.set('banner', ''); };
    const addRefocus = (s) => { run.refocus.push(String(s)); };
    let sprintItemSaving = false;
    ${shippedDeps(handlerBody(name))}
    return ${handlerHead(name)} ${handlerBody(name)};
  `,
  ) as (r: AddRun, fail: Error | null) => (...a: unknown[]) => unknown;
  await factory(run, reply instanceof Error ? reply : null)(...args);
  return run;
};

/** That run's query map, after the handler had its way with it. */
const queries = (run: AddRun) => run.state.addQ as Record<string, string>;

describe('addOne — the single route, and the query stays (B4)', () => {
  const seed = { addQ: { s1: 'illustrate' }, addPanels: PANELS };

  it('POSTs the sprint and the card to the EXISTING single route, never the batch one', async () => {
    const run = await runAdd('addOne', [null, 's1', 'c1'], seed);
    expect(run.api).toHaveLength(1);
    expect(run.api[0]!.method).toBe('POST');
    expect(run.api[0]!.path).toBe('/api/projects/p1/sprint-items');
    expect(run.api[0]!.body).toEqual({ sprint_id: 's1', card_id: 'c1' });
    expect(run.api[0]!.body, 'a single add carries a start — the two acts collapsed back into one (B5)')
      .not.toHaveProperty('starts_on');
    expect(run.reloads, 'the added row never arrives — loadAll is what fetches it').toBe(1);
  });

  it('leaves the query alone — the added card drops out when loadAll replaces the pool (B4)', async () => {
    expect(queries(await runAdd('addOne', [null, 's1', 'c1'], seed)).s1).toBe('illustrate');
  });

  it('refuses to start while another add is in flight, and writes nothing', async () => {
    const run = await runAdd('addOne', [null, 's1', 'c1'], { ...seed, addBusy: 's2' });
    expect(run.api).toHaveLength(0);
  });

  it('surfaces a plain failure through the banner, reloads nothing, and releases the lock', async () => {
    const run = await runAdd('addOne', [null, 's1', 'c1'], seed, new Error('Failed to fetch'));
    expect(run.banners).toEqual(['Failed to fetch']);
    expect(run.reloads, 'a network failure says nothing about the list — reloading it is noise').toBe(0);
    expect(run.state.addBusy, 'the lock outlived a failed flight — that sprint can never add again').toBeFalsy();
  });

  it('reloads BEFORE bannering a refusal that means the list is stale — the refused row leaves (B2-R6)', async () => {
    const stale = Object.assign(new Error('ALREADY_SCHEDULED'), {
      detail: { code: 'ALREADY_SCHEDULED', message: 'That task card is already on the schedule.' },
    });
    const run = await runAdd('addOne', [null, 's1', 'c1'], seed, stale);
    expect(run.reloads, 'the refused row stays listed and the next click refuses again').toBe(1);
    // the banner is written AFTER the reload, so the reload cannot wipe it
    expect(run.state.banner).toBe('That task card is already on the schedule.');
    expect(queries(run).s1, 'a refusal consumed the query').toBe('illustrate');
  });

  it("returns focus to that sprint's field after the reload — the clicked Add is gone with its row (B2-R7)", async () => {
    const run = await runAdd('addOne', [null, 's1', 'c1'], seed);
    expect(run.refocus).toEqual(['s1']);
    const failed = await runAdd('addOne', [null, 's1', 'c1'], seed, new Error('Failed to fetch'));
    expect(failed.refocus, 'a failed add moved focus — nothing left the page').toEqual([]);
  });
});

describe('Add All — ONE request carrying the listed set, in list order (B3/B4)', () => {
  const seed = { addQ: { s1: 'illustrate', s2: 'loft' }, addPanels: PANELS };

  it("POSTs the PANEL'S OWN ids to the batch route, in the order on screen", async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, { ok: true, added: 2, skipped: [] });
    expect(run.api, 'Add All fanned out into one request per card').toHaveLength(1);
    expect(run.api[0]!.method).toBe('POST');
    expect(run.api[0]!.path).toBe('/api/projects/p1/sprint-items/batch');
    expect(run.api[0]!.body).toEqual({ sprint_id: 's1', card_ids: ['c1', 'c3'] });
    expect(run.api[0]!.body, 'the batch carries a start — its rows land UNPLOTTED (B5)').not.toHaveProperty('starts_on');
    expect(run.reloads).toBe(1);
  });

  it("sends the OPEN sprint's ids only — never another sprint's panel", async () => {
    const run = await runAdd('addAll', [null, 's2'], seed, { ok: true, added: 1, skipped: [] });
    expect(run.api[0]!.body).toEqual({ sprint_id: 's2', card_ids: ['c9'] });
  });

  it("clears that sprint's query when something landed — the set was consumed (B4)", async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, { ok: true, added: 2, skipped: [] });
    expect(queries(run).s1).toBe('');
    expect(queries(run).s2, "another sprint's query was cleared too").toBe('loft');
  });

  it('KEEPS the query when nothing landed — an untouched set must stay on screen (B4)', async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, {
      ok: true,
      added: 0,
      skipped: [{ card_id: 'c1', code: 'ALREADY_SCHEDULED' }, { card_id: 'c3', code: 'CARD_COMPLETE' }],
    });
    expect(queries(run).s1).toBe('illustrate');
  });

  it('banners a PARTIAL result and stays silent when everything landed (B3)', async () => {
    const partial = await runAdd('addAll', [null, 's1'], seed, {
      ok: true, added: 1, skipped: [{ card_id: 'c3', code: 'ALREADY_SCHEDULED' }],
    });
    expect(partial.banners.length, 'a partial add said nothing — a card goes missing silently').toBe(1);
    expect(partial.reloads).toBe(1);
    expect(partial.state.banner, 'the reload wiped the summary — the user never reads it (B2-R1)').toBe(partial.banners[0]);
    const clean = await runAdd('addAll', [null, 's1'], seed, { ok: true, added: 2, skipped: [] });
    expect(clean.banners, 'a clean add interrupted with a banner — no confirmation, no count-check (Miles)').toEqual([]);
  });

  it('clears only the query it SENT — text typed during the flight survives (B2-R4)', async () => {
    const typedMeanwhile = (run: AddRun) => {
      (run.state.addQ as Record<string, string>).s1 = 'illustrate corey';
      return { ok: true, added: 2, skipped: [] };
    };
    const run = await runAdd('addAll', [null, 's1'], seed, typedMeanwhile);
    expect(run.api).toHaveLength(1);
    expect(queries(run).s1, 'the clear wiped what the user typed while the batch was in the air').toBe('illustrate corey');
  });

  it("returns focus to the field after the reload — Add All left with the emptied panel (B2-R7)", async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, { ok: true, added: 2, skipped: [] });
    expect(run.refocus).toEqual(['s1']);
  });

  it('writes nothing for an empty panel, and nothing while any sprint is busy', async () => {
    const empty = await runAdd('addAll', [null, 's1'], { addQ: { s1: 'zzz' }, addPanels: { s1: { items: [] } } });
    expect(empty.api).toHaveLength(0);
    const busy = await runAdd('addAll', [null, 's1'], { ...seed, addBusy: 's1' });
    expect(busy.api).toHaveLength(0);
    const elsewhere = await runAdd('addAll', [null, 's1'], { ...seed, addBusy: 's2' });
    expect(elsewhere.api, 'two adds in the air at once — one act per screen (B10)').toHaveLength(0);
  });

  it('releases the lock, banners, and keeps the query when the batch itself fails', async () => {
    const run = await runAdd('addAll', [null, 's1'], seed, new Error('SPRINT_NOT_FOUND'));
    expect(run.banners).toEqual(['SPRINT_NOT_FOUND']);
    expect(run.state.addBusy).toBeFalsy();
    expect(queries(run).s1, 'a failed batch consumed the query anyway').toBe('illustrate');
  });
});

describe("addKey — Escape clears that sprint's query, every other key falls through (B6)", () => {
  const press = async (key: string, seed: Record<string, unknown>) => {
    let prevented = 0;
    const ctx = { event: { key, preventDefault: () => { prevented += 1; }, stopPropagation: () => {} } };
    return { run: await runAdd('addKey', [ctx, 's1'], seed), prevented: () => prevented };
  };

  it('clears the query on Escape, and takes the key so nothing else answers it', async () => {
    const { run, prevented } = await press('Escape', { addQ: { s1: 'illustrate', s2: 'loft' } });
    expect(queries(run).s1).toBe('');
    expect(queries(run).s2, "Escape cleared another sprint's field").toBe('loft');
    expect(prevented()).toBe(1);
  });

  it('leaves Enter INERT — Enter-as-Add-All is a suggestion to Miles, not built (B6)', async () => {
    const { run, prevented } = await press('Enter', { addQ: { s1: 'illustrate' }, addPanels: PANELS });
    expect(queries(run).s1).toBe('illustrate');
    expect(run.api, 'Enter added the listed set — no such ruling exists').toHaveLength(0);
    expect(prevented(), 'Enter was swallowed — whatever default the field owns dies with it').toBe(0);
  });

  it('leaves an ordinary keystroke alone — the field is two-way bound, not handler-driven', async () => {
    const { run, prevented } = await press('a', { addQ: { s1: 'illustrate' } });
    expect(queries(run).s1).toBe('illustrate');
    expect(prevented()).toBe(0);
  });
});

/* ---------------------------------------------------------------------- *
 * The dress: heights that cannot reflow, two blue TOKENS, one hover rise.
 * ---------------------------------------------------------------------- */

describe('the search row and its results in CSS (833:68629 / 840:31597 / 841:33668)', () => {
  it("pins both row heights as HEIGHTS — only the field's right edge may move (B7)", () => {
    for (const [cls, px] of [['gsearch', '77px'], ['gresult', '54px']] as const) {
      const rules = rulesFor(cls);
      expect(rules.length, `no CSS rule names \`.${cls}\``).toBeGreaterThan(0);
      expect(
        rules.some((r) => new RegExp(`(^|;)\\s*height:\\s*${px}`).test(r.body)),
        `.${cls} lost its fixed ${px} height`,
      ).toBe(true);
      expect(
        rules.every((r) => !r.body.includes('min-height')),
        `.${cls} uses a min-height — the row can grow, and the first keystroke reflows the sprint`,
      ).toBe(true);
    }
  });

  it('never fakes the second blue with opacity — two TOKENS, never one colour dimmed (B8, Miles)', () => {
    const linkRules = CSS_RULES.filter((r) => /\.galink|\.gaddone|\.gaddall/.test(r.selector));
    expect(linkRules.length, 'no add-link rules at all — this sweep would be vacuous').toBeGreaterThan(0);
    expect(linkRules.filter((r) => /(^|[^-\w])opacity\s*:/.test(r.body)).map((r) => r.selector)).toEqual([]);
  });

  it('rests the per-row Add on the blue-300 TOKEN (840:31661)', () => {
    const rest = rulesFor('gaddone').filter((r) => !r.selector.includes(':'));
    expect(rest.some((r) => /color:\s*var\(--blue-300\)/.test(r.body)), 'the resting Add is not the blue-300 token').toBe(true);
  });

  it("raises the link AND the label together, on the ROW's hover and focus (840:31670/31671)", () => {
    const risen = CSS_RULES.filter((r) => /\.gresult:(hover|focus-within)/.test(r.selector));
    expect(risen.length, 'no row-hover rules at all — the rise is not built').toBeGreaterThan(0);
    const link = risen.filter((r) => /\.gaddone/.test(r.selector));
    const label = risen.filter((r) => /\.glabel/.test(r.selector));
    expect(link.some((r) => /var\(--blue-600\)/.test(r.body)), 'the Add does not rise to blue-600 on row hover').toBe(true);
    expect(label.some((r) => /font-weight:\s*600/.test(r.body)), 'the label does not thicken with it — the two move together').toBe(true);
    // the keyboard gets the same rise: a focus-within clause on each half
    expect(link.some((r) => r.selector.includes(':focus-within')), 'the Add rises for a pointer only').toBe(true);
    expect(label.some((r) => r.selector.includes(':focus-within')), 'the label thickens for a pointer only').toBe(true);
  });

  it('greys a dead Add All to slate-400 — never a pale blue (841:33668)', () => {
    const dis = rulesFor('gaddall').filter((r) => r.selector.includes('[disabled]'));
    expect(dis.length, 'no disabled Add All rule').toBeGreaterThan(0);
    expect(dis.some((r) => /color:\s*var\(--slate-400\)/.test(r.body))).toBe(true);
  });

  it('turns the live grammar OFF on a busy row — grey link, no rise, and it wins by ORDER (surface-1 / B2-R3)', () => {
    const busyLink = CSS_RULES.filter((r) => /\.gresult\.busy .*\.galink/.test(r.selector));
    const busyLabel = CSS_RULES.filter((r) => /\.gresult\.busy .*\.glabel/.test(r.selector));
    expect(busyLink.some((r) => /color:\s*var\(--slate-400\)/.test(r.body) && /cursor:\s*default/.test(r.body)), 'a busy Add still reads live').toBe(true);
    expect(busyLabel.some((r) => /font-weight:\s*400/.test(r.body)), 'a busy row still thickens its label on hover').toBe(true);
    // same specificity as the rise, so the sheet ORDER is what decides — the busy rules must come later
    const at = (re: RegExp) => CSS.search(re);
    expect(at(/\.gresult\.busy \.galink/)).toBeGreaterThan(at(/\.gresult:hover \.gaddone/));
    expect(at(/\.gresult\.busy \.glabel/)).toBeGreaterThan(at(/\.gresult:hover \.glabel/));
  });

  it("draws the seam above the footer ONCE — the row above owns it (surface-2)", () => {
    const seam = CSS_RULES.filter((r) => /\.gblock \+ \.gfoot/.test(r.selector));
    expect(seam.some((r) => /border-top:\s*none/.test(r.body)), 'the footer doubles the rule of the row above it').toBe(true);
  });

  it("yields the sixteenth pixel below the field to the row's own rule — 16 + 45 + 15 + 1 = 77 (surface-5)", () => {
    const pane = rulesFor('gsearchpane');
    expect(pane.some((r) => /padding:\s*var\(--space-16\) var\(--space-24\) 15px var\(--space-16\)/.test(r.body)), 'the search pane pads 16 below and the field overflows the border-box').toBe(true);
  });

  it('keeps the placement circle — the + outlived the add zone it shared a recipe with', () => {
    expect(
      rulesFor('gplus').some((r) => /var\(--indigo-500\)/.test(r.body)),
      'the placement + lost its circle with the add zone',
    ).toBe(true);
  });
});

/* ---------------------------------------------------------------------- *
 * WITHDRAWAL — the 08-28 add flow, whole (owl #77 §0).
 * ---------------------------------------------------------------------- */

describe('the 08-28 add flow is withdrawn whole — zone, pending row, dropdowns, one-act commit', () => {
  it('is out of the shipped scripts', () => {
    for (const gone of [
      'addRow', 'addMenu', 'addMenuFlip', 'addMcOptions', 'addCardOptions',
      'openAddRow', 'cancelAddRow', 'openAddMenu', 'pickAddMc', 'pickAddCard',
      'addZoneKey', 'submitAddItem', 'draftPlace', "plotRow === 'add'",
    ]) {
      expect(APP_JS_CODE, `\`${gone}\` survives in the shipped scripts`).not.toContain(gone);
    }
  });

  it('is out of the schedules view', () => {
    // Ractive comments stripped first (rule 3's kinder corpus): the template
    // may legitimately explain what replaced the retired block
    const view = schedulesView().replace(/\{\{!\s[\s\S]*?\}\}/g, ' ');
    for (const gone of [
      'gaddzone', 'gaddrule', 'gaddplus', 'gaddrow', 'gaddbtn', 'gdd',
      'openAddRow', 'addZoneKey', 'submitAddItem', 'draftPlace',
      'addMcOptions', 'addCardOptions', 'Add Item',
    ]) {
      expect(view, `\`${gone}\` survives in the schedules view`).not.toContain(gone);
    }
  });

  it('is out of the stylesheet', () => {
    for (const gone of ['.gaddzone', '.gaddrule', '.gaddplus', '.gaddrow', '.gaddbtn', '.gdd']) {
      expect(CSS, `\`${gone}\` outlived the flow it dressed`).not.toContain(gone);
    }
  });

  it('left the overlay law with it — no addMenu key, no .gdd shield, no anchored entry', () => {
    const keys = new Function(`${topDecl('OVERLAY_KEYS')} return OVERLAY_KEYS;`)() as string[];
    expect(keys.length, 'no overlay keys at all — the assertion below would be vacuous').toBeGreaterThan(0);
    expect(keys, 'addMenu is still an overlay — the dropdown it shielded is gone').not.toContain('addMenu');
    const anchored = new Function(`${topDecl('OVERLAY_ANCHORED')} return OVERLAY_ANCHORED;`)() as string[];
    expect(anchored).not.toContain('addMenu');
    expect(topDecl('OVERLAY_SHIELDS'), 'the .gdd shield outlived its dropdown').not.toContain('.gdd');
    expect(topDecl('OVERLAY_SELF_SCROLL'), 'the .gddmenu self-scroll entry outlived its menu').not.toContain('.gddmenu');
  });
});

