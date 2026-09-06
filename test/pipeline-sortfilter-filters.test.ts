/**
 * Pipeline FILTERS — OR within an axis and AND across them, the facet counts,
 * and "None" as a selectable value. Split 2026-09-05 out of
 * test/pipeline-sortfilter.test.ts (sections D, E, F); the shared prelude —
 * recipe harness and row/work-card fixtures — is
 * test/helpers/pipeline-sortfilter.ts.
 */

import { describe, expect, it } from 'vitest';
import { APP_JS, TEMPLATE, decl } from './helpers/gantt-render.ts';
import {
  type Facet,
  type FacetValue,
  type Sel,
  facet,
  ids,
  matching,
  recipe,
  row,
  sel,
  toolbarComputeds,
  wc,
} from './helpers/pipeline-sortfilter.ts';

/* ---------------------------------------------------------------------- */
/* D — the surviving filter axes, OR within / AND across                    */
/* ---------------------------------------------------------------------- */

describe('filtering is OR within a category and AND across them', () => {
  const rows = [
    row({ cardId: 'a', assetType: 'Icon', currentList: 'Design' }),
    row({ cardId: 'b', assetType: 'UI', currentList: 'Backlogs: Icon' }),
    row({ cardId: 'c', assetType: 'Icon', currentList: 'Backlogs: Icon' }),
  ];
  const pick = (over: Record<string, string[]>) => matching(rows, sel(over));

  it('carries the FOUR axes in the frame’s order — Type, Difficulty, Urgency, Status', () => {
    /* SUPERSEDES block 1's two-axis pin. #78 §4 (frame 841:53782) rebuilds
       DIFFICULTY and URGENCY over WORK-CARD values — a group matches through a
       child (B2/B3) — and that is what brings them back; REQUESTOR stays gone
       with its column (#78 §3). The order is the frame's (B1). */
    expect(recipe.PIPE_FILTERS.map((f) => f.label)).toEqual(['Type', 'Difficulty', 'Urgency', 'Status']);
    const keys = recipe.PIPE_FILTERS.map((f) => f.key);
    expect(keys).toContain('difficulty');
    expect(keys).toContain('urgency');
    expect(keys).not.toContain('requestor');
  });

  it('reads TYPE and STATUS off the MAIN row and DIFFICULTY and URGENCY off the WORK cards (B2)', () => {
    /* the axis says which field of WorkCardWire it reads (`work`), and the
       main-row axes keep `pick`; an axis with both, or neither, is an axis
       the matcher cannot evaluate */
    const by = Object.fromEntries(recipe.PIPE_FILTERS.map((f) => [f.key, f]));
    expect(by.difficulty!.work).toBe('difficulty');
    expect(by.urgency!.work).toBe('urgency');
    expect(by.type!.work).toBeUndefined();
    expect(by.status!.work).toBeUndefined();
    expect(typeof by.type!.pick).toBe('function');
    expect(typeof by.status!.pick).toBe('function');
  });

  it('a group matches a work-card axis through ONE child that satisfies EVERY live work axis (B3)', () => {
    /* child-level conjunction. The tempting shape is row-level: "some child is
       Urgent AND some child is Hard". That admits a group whose urgent card is
       easy and whose hard card is quiet — and the reader, looking for urgent
       hard work, opens it to find neither. */
    const split = row({ cardId: 'split', work: [wc({ urgency: 'Urgent', difficulty: 'Easy' }), wc({ cardId: 'w2', difficulty: 'Hard' })] });
    const one = row({ cardId: 'one', work: [wc({ urgency: 'Urgent', difficulty: 'Hard' }), wc({ cardId: 'w2' })] });
    const both = sel({ urgency: ['Urgent'], difficulty: ['Hard'] });
    expect(recipe.pipeMatches(split, both, null)).toBe(false);
    expect(recipe.pipeMatches(one, both, null)).toBe(true);
    // each axis alone still admits the split group — it is the conjunction that fails
    expect(recipe.pipeMatches(split, sel({ urgency: ['Urgent'] }), null)).toBe(true);
    expect(recipe.pipeMatches(split, sel({ difficulty: ['Hard'] }), null)).toBe(true);
    // the same rule at the card level, which is what `pipeKids` draws (B3)
    expect(recipe.pipeWorkKids(split, both, null)).toEqual([]);
    expect(recipe.pipeWorkKids(one, both, null).map((w) => (w as { cardId: string }).cardId)).toEqual(['w1']);
  });

  it('hides a group with NO matching child — a childless MC cannot pass a work-card axis (E2)', () => {
    /* undrawn in the frame, decided at the gate: a main row matches a
       work-card axis only through a child, so a group with no children — or
       none matching — is not shown under that axis at all. Shown, it would be
       a row the reader cannot explain and cannot open. */
    const childless = row({ cardId: 'lone' });
    expect(recipe.pipeMatches(childless, sel({ urgency: ['Urgent'] }), null)).toBe(false);
    expect(recipe.pipeMatches(childless, sel({ urgency: ['Non-Urgent'] }), null)).toBe(false);
    expect(recipe.pipeMatches(childless, sel({ difficulty: [null] }), null)).toBe(false);
    // …and is untouched by a main-row axis it does satisfy
    expect(recipe.pipeMatches(row({ assetType: 'Icon' }), sel({ type: ['Icon'] }), null)).toBe(true);
  });

  it('ORs within a WORK axis and ANDs it against a MAIN axis, the same as before', () => {
    const rows = [
      row({ cardId: 'a', assetType: 'Icon', work: [wc({ difficulty: 'Easy' })] }),
      row({ cardId: 'b', assetType: 'UI', work: [wc({ difficulty: 'Hard' })] }),
      row({ cardId: 'c', assetType: 'Icon', work: [wc({ difficulty: 'Hard' })] }),
    ];
    expect(matching(rows, sel({ difficulty: ['Easy', 'Hard'] }))).toEqual(['a', 'b', 'c']);
    expect(matching(rows, sel({ type: ['Icon'], difficulty: ['Hard'] }))).toEqual(['c']);
  });

  it('pipeValues: a main axis yields one value (or nothing where None is not offered); a work axis the DISTINCT child values', () => {
    /* the value SET is what the counts and the matcher both read, so its
       shape is a rule: a STATUS-less row has NO value on STATUS (the axis
       offers no None), a type-less row has [null] on TYPE (it does), and a
       group with two Hard cards and one Easy carries {Hard, Easy} once each —
       which is what makes a count a count of GROUPS (B4). */
    const by = Object.fromEntries(recipe.PIPE_FILTERS.map((f) => [f.key, f]));
    const r = row({ work: [wc({ difficulty: 'Hard' }), wc({ cardId: 'w2', difficulty: 'Hard' }), wc({ cardId: 'w3', difficulty: 'Easy' })] });
    expect(recipe.pipeValues(by.type!, r, sel())).toEqual([null]);
    expect(recipe.pipeValues(by.status!, r, sel())).toEqual([]);
    expect(recipe.pipeValues(by.difficulty!, r, sel()).slice().sort()).toEqual(['Easy', 'Hard']);
    expect(recipe.pipeValues(by.urgency!, r, sel())).toEqual(['Non-Urgent']);
    // a childless group has NO value on a work axis — not None, nothing
    expect(recipe.pipeValues(by.difficulty!, row(), sel())).toEqual([]);
    // the set on one work axis is read over the children matching the OTHER
    // live work axes — the axis's own selection is ignored (R-pf-c)
    const mixed = row({ work: [wc({ urgency: 'Urgent', difficulty: 'Easy' }), wc({ cardId: 'w2', difficulty: 'Hard' })] });
    expect(recipe.pipeValues(by.difficulty!, mixed, sel({ urgency: ['Urgent'] }))).toEqual(['Easy']);
    expect(recipe.pipeValues(by.difficulty!, mixed, sel({ urgency: ['Urgent'], difficulty: ['Hard'] }))).toEqual(['Easy']);
  });

  it('leaves no axis pointed at a column the ten-column table stopped drawing', () => {
    /* THE RULE #78 could have broken quietly: an axis takes its label from the
       column it narrows, so one left behind on `col-requestor` or `col-diff`
       renders a heading of `undefined` over a live list of checkboxes. Section
       H proves the join from the column side; this is the axis side, and it is
       the side that fails first when a column is deleted. */
    const cols = recipe.PIPE_COLS.map((c) => c.cls);
    for (const a of recipe.PIPE_FILTERS) expect(cols, `axis "${a.key}" narrows "${a.col}"`).toContain(a.col);
    expect(cols, 'the Requestor column is gone from Pipeline (#78 §3)').not.toContain('col-requestor');
  });

  it('ORs within a category — Icon plus UI shows both', () => {
    expect(pick({ type: ['Icon', 'UI'] })).toEqual(['a', 'b', 'c']);
  });

  it('ANDs across categories — Icon plus one list shows only that list’s icons', () => {
    expect(pick({ type: ['Icon'], status: ['Backlogs: Icon'] })).toEqual(['c']);
  });

  it('an empty axis constrains nothing', () => {
    expect(pick({})).toEqual(['a', 'b', 'c']);
    expect(pick({ type: [] })).toEqual(['a', 'b', 'c']);
  });

  it('has NO state axes — blocked and missing-info were declined', () => {
    const keys = recipe.PIPE_FILTERS.map((f) => f.key);
    expect(keys).not.toContain('blocker');
    expect(keys).not.toContain('missing');
  });
});

/* ---------------------------------------------------------------------- */
/* E — the facet counts (jp→miles #49)                                      */
/* ---------------------------------------------------------------------- */

describe('a category counts against the OTHER categories, never its own', () => {
  /* the two readers every count below goes through: one axis's values off a
     facet list, and those values as `[label, count]` pairs */
  const facetOf = (facets: Facet[], key: string): FacetValue[] => facets.find((f) => f.key === key)?.values ?? [];
  const counts = (facets: Facet[], key: string) => facetOf(facets, key).map((v) => [v.label, v.count]);

  it('ignoring its own selection is what keeps a second value reachable', () => {
    /* the whole reason for the third option: counted against ALL filters
       including its own, picking Icon drops UI to zero and it can never be
       added without clearing first — accurate and unusable. */
    const rows = [row({ cardId: 'a', assetType: 'Icon' }), row({ cardId: 'b', assetType: 'UI' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: ['Icon'] };
    const forType = rows.filter((r) => recipe.pipeMatches(r, sel, 'type'));
    expect(forType.map((r) => r.cardId)).toEqual(['a', 'b']); // UI still countable
    const forOthers = rows.filter((r) => recipe.pipeMatches(r, sel, 'status'));
    expect(forOthers.map((r) => r.cardId)).toEqual(['a']); // …but the other axis sees the narrowing
  });

  it('counts MAIN ROWS on a work-card axis — two Urgent cards in one group is one Urgent, two rows on one MC are two (B4)', () => {
    /* the row unit the table draws and pages is the main row; a count of
       cards would read "3 Urgent" over a table that shows one group. */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', work: [wc({ urgency: 'Urgent' }), wc({ cardId: 'w2', urgency: 'Urgent' }), wc({ cardId: 'w3' })] }),
      row({ cardId: 'b', mcNumber: 'MC-2', work: [wc()] }),
      row({ cardId: 'c', mcNumber: 'MC-3' }), // childless: on no pool of a work axis
    ];
    expect(counts(recipe.pipeFacetList(rows, sel()), 'urgency')).toEqual([['Non-Urgent', 2], ['Urgent', 1]]);
    /* …and the unit is the ROW, not the MC: siblings on a shared MC carry the
       same `work` (invariant 3 — MC-825's 99 rows read Urgent 99 with one
       urgent card), and every one is a row the table draws (2026-09-05 block 4
       review, finding 4) */
    const shared = [wc({ urgency: 'Urgent' })];
    const siblings = [row({ cardId: 'a', mcNumber: 'MC-825', work: shared }), row({ cardId: 'b', mcNumber: 'MC-825', work: shared })];
    expect(counts(recipe.pipeFacetList(siblings, sel()), 'urgency')).toEqual([['Urgent', 2]]);
  });

  it('ignores its OWN axis on a work axis too, and sees the other work axis’s narrowing', () => {
    /* R-pf-c with two work axes live at once. Picking Urgent must leave
       Non-Urgent countable (own axis ignored), while DIFFICULTY — another
       axis — counts only the children that ARE urgent (B3's conjunction
       reaching the counts). */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', assetType: 'Icon', work: [wc({ urgency: 'Urgent', difficulty: 'Hard' }), wc({ cardId: 'w2', difficulty: 'Easy' })] }),
      row({ cardId: 'b', mcNumber: 'MC-2', assetType: 'UI', work: [wc({ difficulty: 'Easy' })] }),
    ];
    const facets = recipe.pipeFacetList(rows, sel({ urgency: ['Urgent'] }));
    expect(counts(facets, 'urgency'), 'own axis ignored: Non-Urgent still reachable').toEqual([['Non-Urgent', 2], ['Urgent', 1]]);
    expect(counts(facets, 'difficulty'), 'the other work axis counts urgent children only').toEqual([['Hard', 1]]);
    expect(counts(facets, 'type'), 'a main axis sees the narrowing').toEqual([['Icon', 1]]);
    // …and a MAIN axis's selection narrows the WORK axes' counts in turn
    expect(counts(recipe.pipeFacetList(rows, sel({ type: ['UI'] })), 'difficulty')).toEqual([['Easy', 1]]);
  });

  /* ---- BOTH work-card axes live (PLAN.md B12; owl #78 §4; R-pf-c) ----------
     THE RULE every number below is derived from:
       pool_j = the rows matching the selection with axis j REMOVED, each
       counted once per value it carries on j over the children the OTHER
       work axes admit.
     The work-card axes are ONE conjunction (B3), so a row fails them together
     and that is ONE failure: it still counts in every WORK pool with its
     own-ignoring set, and in no MAIN pool. Counted per axis instead, `split`
     fell out of both work pools the moment Urgent and Hard were ticked, and
     Easy read zero on a panel where ticking it would have widened the table —
     R-pf-c's "accurate and unusable", found on 446 of 1000 random boards.
     The board: `both` has ONE child that is Urgent AND Hard; `split` has an
     Urgent Easy card and a quiet Hard card; `far` is `split` under a TYPE the
     selection below does not pick. */
  const both = row({ cardId: 'both', mcNumber: 'MC-1', assetType: 'Icon', work: [wc({ urgency: 'Urgent', difficulty: 'Hard' })] });
  const split = row({ cardId: 'split', mcNumber: 'MC-2', assetType: 'Icon', work: [wc({ urgency: 'Urgent', difficulty: 'Easy' }), wc({ cardId: 'w2', difficulty: 'Hard' })] });
  const far = row({ cardId: 'far', mcNumber: 'MC-3', assetType: 'UI', work: [wc({ urgency: 'Urgent', difficulty: 'Easy' }), wc({ cardId: 'w2', difficulty: 'Hard' })] });
  const asMap = (facets: Facet[], key: string) => new Map(facetOf(facets, key).map((v) => [v.value, v.count] as const));
  /* the rule EXECUTED from the shipped matcher and value set, so the facet
     pass is checked against the rule and not against a copy of its own
     arithmetic (test/CLAUDE.md rule 2): `pipeMatches(…, null)` over the
     selection with j removed IS pool_j, and `pipeValues` on j reads the
     children the other work axes admit */
  const byRule = (rows: unknown[], live: Sel, key: string) => {
    const f = recipe.PIPE_FILTERS.find((x) => x.key === key)!;
    const pool = rows.filter((r) => recipe.pipeMatches(r, { ...live, [key]: [] }, null));
    const m = new Map<string | null, number>();
    for (const r of pool) for (const v of recipe.pipeValues(f, r, live)) m.set(v, (m.get(v) || 0) + 1);
    return m;
  };

  it('counts with BOTH work axes live — the conjunction fails as ONE, so a failed group still counts in every WORK pool (B12)', () => {
    /* Urgent + Hard ticked. By the rule:
         table      = rows matching Urgent AND Hard → `both` (its one child is
                      both); `split` has no such child
         DIFFICULTY = rows matching Urgent alone → both, split; values over the
                      URGENT children: both → Hard, split → Easy   ⇒ Easy 1, Hard 1
         URGENCY    = rows matching Hard alone → both, split; values over the
                      HARD children: both → Urgent, split → Non-Urgent ⇒ Non-Urgent 1, Urgent 1
         TYPE       = rows matching Urgent AND Hard → both only    ⇒ Icon 1
       `split` reaches Easy and Non-Urgent, and no MAIN pool. */
    const rows = [both, split];
    const live = sel({ urgency: ['Urgent'], difficulty: ['Hard'] });
    expect(matching(rows, live)).toEqual(['both']);
    const facets = recipe.pipeFacetList(rows, live);
    expect(counts(facets, 'difficulty'), 'split reaches Easy through its Urgent child').toEqual([['Easy', 1], ['Hard', 1]]);
    expect(counts(facets, 'urgency'), 'split reaches Non-Urgent through its Hard child').toEqual([['Non-Urgent', 1], ['Urgent', 1]]);
    expect(counts(facets, 'type'), 'a MAIN pool keeps the conjunction — split is not in it').toEqual([['Icon', 1]]);
    for (const f of recipe.PIPE_FILTERS) expect(asMap(facets, f.key), `pool ${f.key}, by the rule`).toEqual(byRule(rows, live, f.key));
  });

  it('a MAIN miss on top of the conjunction miss is TWO failures — the group counts nowhere (B12)', () => {
    /* Type=Icon, Urgent, Hard. `far` fails TYPE and fails the conjunction.
       By the rule every pool removes ONE axis and the other failure remains,
       so `far` is in none of them: UI never appears under TYPE, and the work
       pools read exactly what `split` (Icon — one failure) gives them:
         DIFFICULTY = matching Icon + Urgent → both (Hard), split (Easy)
         URGENCY    = matching Icon + Hard   → both (Urgent), split (Non-Urgent)
         TYPE       = matching Urgent + Hard → both                ⇒ Icon 1 */
    const rows = [both, split, far];
    const live = sel({ type: ['Icon'], urgency: ['Urgent'], difficulty: ['Hard'] });
    expect(matching(rows, live)).toEqual(['both']);
    const facets = recipe.pipeFacetList(rows, live);
    expect(counts(facets, 'type'), 'UI is nowhere — far failed two axes').toEqual([['Icon', 1]]);
    expect(counts(facets, 'difficulty')).toEqual([['Easy', 1], ['Hard', 1]]);
    expect(counts(facets, 'urgency')).toEqual([['Non-Urgent', 1], ['Urgent', 1]]);
    for (const f of recipe.PIPE_FILTERS) expect(asMap(facets, f.key), `pool ${f.key}, by the rule`).toEqual(byRule(rows, live, f.key));
  });

  it('"except axis j" IS the selection with j removed — on a work axis too, with the other one live (B12)', () => {
    /* the definition the pools are drawn from. Before B12, "except
       difficulty" skipped DIFFICULTY's own test but handed the FULL selection
       to URGENCY's child filter, so `split` was asked for a child that is
       Urgent AND Hard after all — j leaked back in through the other work
       axis, and the rule above could not hold. */
    const rows = [both, split, far, row({ cardId: 'lone', mcNumber: 'MC-4', assetType: 'Icon' })];
    const live = sel({ type: ['Icon'], urgency: ['Urgent'], difficulty: ['Hard'] });
    for (const r of rows) for (const f of recipe.PIPE_FILTERS) {
      expect(recipe.pipeMatches(r, live, f.key), `${ids([r])[0]} except ${f.key}`).toBe(recipe.pipeMatches(r, { ...live, [f.key]: [] }, null));
    }
    // the concrete case: split has an Urgent child and a Hard child, so it
    // survives either work axis being ignored — only the conjunction fails it
    expect(recipe.pipeMatches(split, live, 'difficulty')).toBe(true);
    expect(recipe.pipeMatches(split, live, 'urgency')).toBe(true);
    expect(recipe.pipeMatches(split, live, null)).toBe(false);
  });
});

/* ---------------------------------------------------------------------- */
/* F — "None" is a value (owl #63, closing R-pf-i)                          */
/* ---------------------------------------------------------------------- */

describe('absence is selectable on the axis that can lack a value', () => {
  it('offers None on TYPE and DIFFICULTY, and never on URGENCY or STATUS', () => {
    /* AMENDED twice on 2026-09-05. Block 1 parked DIFFICULTY with its column
       and left TYPE the one none-bearing axis; block 4 (owl #78 §4, F11)
       brings DIFFICULTY back over the WORK cards, and None with it — a card
       with no difficulty label is exactly the incomplete work a PM filters
       for. The RULE is untouched: an axis whose subject can carry no value
       must offer the absence. URGENCY offers none because every card carries
       one (Non-Urgent IS the absence of the label, and it is a value); STATUS
       because every card sits in a Trello list. The URGENCY half was vacuous
       while every fixture card carried an urgency: `w3` carries none at all,
       and the axis still offers no None (2026-09-05 block 4 review,
       finding 8). */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', work: [wc(), { cardId: 'w3', name: 'lean', difficulty: null, due: null }] }),
      row({ cardId: 'b', mcNumber: 'MC-2', assetType: 'Icon', currentList: 'Design', work: [wc({ difficulty: 'Easy' })] }),
    ];
    const labels = (k: string) => facet(rows, k).values.map((v) => v.label);
    expect(labels('type')).toContain('None');
    expect(labels('difficulty')).toContain('None');
    expect(labels('urgency')).not.toContain('None');
    expect(labels('status')).not.toContain('None');
    // the flags say the same, so the chip and the matcher agree with the panel
    const none = Object.fromEntries(recipe.PIPE_FILTERS.map((f) => [f.key, !!f.none]));
    expect(none).toEqual({ type: true, difficulty: true, urgency: false, status: false });
  });

  it('offers None on DIFFICULTY only through an unlabelled MATCHING child — never for a childless group', () => {
    /* the work-axis half of "None is derived": a childless MC has no card to
       lack a label, so it contributes no None; a group whose only unlabelled
       card is filtered out by ANOTHER live work axis does not either — the
       reader would tick None and see a group with nothing unlabelled in it */
    const childless = [row({ cardId: 'a', mcNumber: 'MC-1' })];
    expect(recipe.pipeFacetList(childless, sel()).find((f) => f.key === 'difficulty')).toBeUndefined();

    const labelled = [row({ cardId: 'a', mcNumber: 'MC-1', work: [wc({ difficulty: 'Hard' }), wc({ cardId: 'w2', difficulty: 'Easy' })] })];
    expect(facet(labelled, 'difficulty').values.map((v) => v.label)).not.toContain('None');

    const oneUnlabelled = [row({ cardId: 'a', mcNumber: 'MC-1', work: [wc({ difficulty: 'Hard', urgency: 'Urgent' }), wc({ cardId: 'w2' })] })];
    expect(facet(oneUnlabelled, 'difficulty').values.map((v) => [v.label, v.count])).toEqual([['Hard', 1], ['None', 1]]);
    // the quiet unlabelled card is not a match under Urgency = Urgent, so None goes
    expect(facet(oneUnlabelled, 'difficulty', sel({ urgency: ['Urgent'] })).values.map((v) => v.label)).toEqual(['Hard']);
    // …and selecting None reaches exactly the groups with an unlabelled matching card
    const rows = [...labelled, ...oneUnlabelled.map((r) => ({ ...r, cardId: 'b', mcNumber: 'MC-2' })), ...childless.map((r) => ({ ...r, cardId: 'c', mcNumber: 'MC-3' }))];
    expect(matching(rows, sel({ difficulty: [null] }))).toEqual(['b']);
  });

  it('DERIVES None like every other value — a complete board never shows it', () => {
    /* the axes are built from what the board carries, so None is not a fixed
       sixth checkbox that sits there reading zero */
    const rows = [row({ cardId: 'a', assetType: 'Icon' }), row({ cardId: 'b', assetType: 'UI' })];
    expect(facet(rows, 'type').values.map((v) => v.label)).toEqual(['Icon', 'UI']);
  });

  it('selects exactly the rows with no value there', () => {
    // read on TYPE, the main-row axis that offers None: a main row's value is
    // its own, so absence is the row's — the work-axis half (a MATCHING child
    // lacking the label) is the previous test's
    const rows = [
      row({ cardId: 'a', assetType: 'Icon' }),
      row({ cardId: 'b' }),
      row({ cardId: 'c', assetType: '' }), // empty string is absence too
    ];
    expect(matching(rows, sel({ type: [null] }))).toEqual(['b', 'c']);
  });

  it('THE POINT — every row is now reachable, which is what R-pf-i said was broken', () => {
    /* before this, the rows carrying no type were the only rows no filter could
       select, and they are the incomplete rows most needing attention. Stated
       as a sum: on an axis that admits absence, the values account for the
       whole board. (URGENCY and STATUS are NOT asserted to reconcile — owl #63
       retracted that, and on a real board they do not.) */
    const rows = [
      row({ cardId: 'a', assetType: 'Icon' }),
      row({ cardId: 'b', assetType: 'UI' }),
      row({ cardId: 'c' }),
      row({ cardId: 'd' }),
    ];
    /* The sum is asserted over the `none`-marked MAIN-row axes rather than
       a named list. Block 4's DIFFICULTY is none-bearing too but counts
       GROUPS through children (B4): a group with a Hard card and an
       unlabelled one is counted under BOTH values, so its sum is not a row
       count — the reachability it owes is proven as a union, below. */
    const noneMain = recipe.PIPE_FILTERS.filter((f) => f.none && !f.work).map((f) => f.key);
    expect(noneMain, 'no main axis admits absence — the sum would hold vacuously').toContain('type');
    for (const key of noneMain) {
      const total = facet(rows, key).values.reduce((n, v) => n + v.count, 0);
      expect(total, key).toBe(rows.length);
    }
  });

  it('THE POINT on a WORK axis — every group with a child is reachable through the values the panel offers', () => {
    /* the same reachability, stated the way a group axis can honour it: tick
       every value DIFFICULTY offers and every group that has a child comes
       back — the unlabelled ones through None. The childless group is the one
       exception, by construction (E2), and it is asserted as one. */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', work: [wc({ difficulty: 'Hard' })] }),
      row({ cardId: 'b', mcNumber: 'MC-2', work: [wc()] }),
      row({ cardId: 'c', mcNumber: 'MC-3', work: [wc({ difficulty: 'Easy' }), wc({ cardId: 'w2' })] }),
      row({ cardId: 'd', mcNumber: 'MC-4' }),
    ];
    const noneWork = recipe.PIPE_FILTERS.filter((f) => f.none && f.work).map((f) => f.key);
    expect(noneWork, 'no work axis admits absence — the union would hold vacuously').toContain('difficulty');
    for (const key of noneWork) {
      const all = facet(rows, key).values.map((v) => v.value);
      expect(all, key).toContain(null);
      expect(matching(rows, sel({ [key]: all })), key).toEqual(['a', 'b', 'c']);
    }
  });

  it('stores None as null, so a board value that IS the word stays separate', () => {
    /* a Trello asset-type label could legitimately be called None; merging the
       two into one checkbox would silently mis-count both. Read on TYPE since
       #78 — it was REQUESTOR's case before, and the axis went with its column. */
    const rows = [
      row({ cardId: 'a', assetType: 'None' }),
      row({ cardId: 'b' }),
    ];
    const values = facet(rows, 'type').values;
    expect(values.map((v) => v.label)).toEqual(['None', 'None']);
    expect(values.map((v) => v.value)).toEqual(['None', null]);
    expect(values.map((v) => v.count)).toEqual([1, 1]);

    expect(matching(rows, sel({ type: ['None'] }))).toEqual(['a']);
  });

  it('sorts None LAST — it is the residue, not a value in the vocabulary', () => {
    /* alphabetically None would land mid-list and push the real vocabulary
       down. The ORDERED half of this rule rode on DIFFICULTY (`order:
       ['Easy','Medium','Hard']`, where None has no place at all), parked with
       that axis in block 1, and is back under test below (block 4, F2). */
    const rows = [
      row({ cardId: 'a', assetType: 'Zeppelin' }),
      row({ cardId: 'b', assetType: 'Animation' }),
      row({ cardId: 'c' }),
    ];
    expect(facet(rows, 'type').values.map((v) => v.label)).toEqual(['Animation', 'Zeppelin', 'None']);
  });

  it('reads DIFFICULTY in its own progression — Easy, Medium, Hard — then None; URGENCY Non-Urgent then Urgent', () => {
    /* the `order` branch, live again: alphabetically Hard would sit between
       Easy and Medium, and the panel would read as a list of words rather
       than a scale. Fed in reverse so the sort has to do the work. */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', work: [wc()] }),
      row({ cardId: 'b', mcNumber: 'MC-2', work: [wc({ difficulty: 'Hard', urgency: 'Urgent' })] }),
      row({ cardId: 'c', mcNumber: 'MC-3', work: [wc({ difficulty: 'Medium' })] }),
      row({ cardId: 'd', mcNumber: 'MC-4', work: [wc({ difficulty: 'Easy' })] }),
    ];
    expect(facet(rows, 'difficulty').values.map((v) => v.label)).toEqual(['Easy', 'Medium', 'Hard', 'None']);
    expect(facet(rows, 'urgency').values.map((v) => v.label)).toEqual(['Non-Urgent', 'Urgent']);
    // the orders are the axes' own, derived — not a second list typed here
    const by = Object.fromEntries(recipe.PIPE_FILTERS.map((f) => [f.key, f]));
    expect(by.difficulty!.order).toEqual(['Easy', 'Medium', 'Hard']);
    expect(by.urgency!.order).toEqual(['Non-Urgent', 'Urgent']);
  });

  it('keeps STATUS alphabetical — the wire carries no list position (R-pf-e stands, B8)', () => {
    /* #78 §4 asks for Trello LIST order; nothing on the wire says what that
       is, and inventing one from the names would be a second order the board
       could contradict. Alphabetical until the ARES read API carries a
       position (backlog). Asserted as "no `order` declared" plus the result. */
    const rows = [
      row({ cardId: 'a', mcNumber: 'MC-1', currentList: 'Working on design' }),
      row({ cardId: 'b', mcNumber: 'MC-2', currentList: 'Backlogs: Icon' }),
      row({ cardId: 'c', mcNumber: 'MC-3', currentList: 'Render: Ready for Client Review' }),
    ];
    expect(recipe.PIPE_FILTERS.find((f) => f.key === 'status')!.order).toBeUndefined();
    expect(facet(rows, 'status').values.map((v) => v.label)).toEqual(['Backlogs: Icon', 'Render: Ready for Client Review', 'Working on design']);
  });

  it('still ignores its own axis when None is the selection', () => {
    /* R-pf-c has to hold for None as well, or picking it would strip every
       sibling value to zero and there would be no way back without clearing */
    const rows = [row({ cardId: 'a' }), row({ cardId: 'b', assetType: 'Icon' })];
    const sel = { ...recipe.PIPE_FILTERS_EMPTY(), type: [null] };
    expect(facet(rows, 'type', sel).values.map((v) => [v.label, v.count])).toEqual([['Icon', 1], ['None', 1]]);
  });

  it('draws the label and toggles the value — they differ for exactly this item', () => {
    expect(TEMPLATE).toContain('<span class="pmval">{{v.label}}</span>');
    // one partial serves both panels — and, since block 5, both TABLES: the
    // row is written once and says which table it belongs to (D10)
    expect(TEMPLATE).toContain("on-click=\"['toggleFacet', table, key, v.value]\"");
  });

  it('stamps every facet with the TABLE the shared partial dispatches on (D10)', () => {
    /* The recipe knows nothing about tables — `pipeFacets` stamps it — so this
       runs the COMPUTED. Without the stamp the partial's first argument is
       undefined and every tick in the Pipeline panel throws; with a stamp that
       named no filter root it would throw just as surely, which is why the
       value is joined against the dispatcher's own map rather than pinned as
       a word. */
    const h = toolbarComputeds();
    h.set('rows', [row({ cardId: 'a', assetType: 'Icon' }), row({ cardId: 'b', currentList: 'Design' })]);
    const facets = h.facets();
    expect(facets.length, 'no facets built — the stamp assertion would be vacuous').toBeGreaterThan(0);
    const roots = new Function(`${decl(APP_JS, 'FACET_FILTER_ROOT')} return FACET_FILTER_ROOT;`)() as Record<
      string,
      string
    >;
    for (const f of facets) {
      expect(f.table, `the ${f.key} facet carries no table`).toBe('pipe');
      expect(Object.keys(roots), 'the stamped table names no filter root').toContain(f.table);
    }
  });
});
