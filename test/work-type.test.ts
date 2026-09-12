/**
 * T179 — work-type labels and the family → lane fold (JP 2026-09-10, block-8
 * Q1/Q3; `lib/model.ts`, `src/services/work-type.ts`).
 *
 * Every expectation about WHICH lane a family folds to is DERIVED from the
 * shipped `WORK_TYPE_LANES` (test/CLAUDE.md rule 2) — this file never carries a
 * second copy of the table. What it does pin is the RULING the table encodes:
 * which of ARES's twelve families are mapped at all, and that the two JP left
 * out stay out.
 */

import { describe, expect, it } from 'vitest';
import { WORK_TYPE_LANES, laneOfWorkType, workTypeOf } from '../src/services/work-type.ts';
import { EMPIRICAL, GENERAL, designCell, laneOf, type Lane } from '../lib/model.ts';
import { forecast } from '../lib/forecast.ts';
import { localIso } from '../lib/calendar.ts';
import { finishOf } from '../src/services/sprint-items.ts';

/**
 * The twelve label families ARES's cycle-time model keys on (its
 * `workTypeKeys`, prefix set — survey-law §"Response data"). Written out
 * because it is a fact about the BOARD, not about our code: nothing in the
 * repo could derive it, and if ARES grows a thirteenth this list is where the
 * gap has to be answered.
 */
const ARES_FAMILIES = [
  '3D',
  'Asset',
  'Build',
  'Components',
  'Content',
  'Design System',
  'Design',
  'Dev',
  'Motion',
  'Ops',
  'Production',
  'Strategy',
];

describe('WORK_TYPE_LANES — the ruled fold (JP 2026-09-10, amended 2026-09-12)', () => {
  it('maps ALL twelve of ARES’s families — Build and Dev joined the dev lane (block 12)', () => {
    expect(ARES_FAMILIES.filter((f) => laneOfWorkType(f) === null)).toEqual([]);
    expect(ARES_FAMILIES.filter((f) => laneOfWorkType(f) !== null)).toHaveLength(ARES_FAMILIES.length);
  });

  it('holds no family outside ARES’s vocabulary', () => {
    expect(Object.keys(WORK_TYPE_LANES).sort()).toEqual(
      ARES_FAMILIES.filter((f) => laneOfWorkType(f) !== null).sort(),
    );
  });

  it('folds onto exactly four lanes — Ops alone to ops, Content alone to content, Build AND Dev to dev, the rest to design', () => {
    const lanes = Object.values(WORK_TYPE_LANES);
    expect(new Set(lanes)).toEqual(new Set<Lane>(['design', 'ops', 'content', 'dev']));
    expect(lanes.filter((l) => l === 'ops')).toHaveLength(1);
    expect(lanes.filter((l) => l === 'content')).toHaveLength(1);
    expect(WORK_TYPE_LANES['Ops']).toBe('ops');
    expect(WORK_TYPE_LANES['Content']).toBe('content');
    /* JP's gate answer, 2026-09-12: BOTH families, because ARES already pools
       the two into the single `dev` cell we read. Mapping only one would give
       us a lane whose name disagreed with its contents. */
    expect(WORK_TYPE_LANES['Build']).toBe('dev');
    expect(WORK_TYPE_LANES['Dev']).toBe('dev');
    expect(lanes.filter((l) => l === 'dev')).toHaveLength(2);
    expect(lanes.filter((l) => l === 'design')).toHaveLength(8);
  });
});

describe('workTypeOf — one label or nothing', () => {
  it('returns the single `Family: Kind` label', () => {
    expect(workTypeOf(['Asset: Icons'])).toBe('Asset: Icons');
    expect(workTypeOf(['Main Card', '\u{1F6D1} Waiting on client', 'Design: Refinement'])).toBe(
      'Design: Refinement',
    );
  });

  it('ignores `Difficulty: …`, which wears the same shape and is never a work type', () => {
    expect(workTypeOf(['Difficulty: Easy'])).toBeNull();
    expect(workTypeOf(['Difficulty: Hard', 'Ops: Board Management'])).toBe('Ops: Board Management');
  });

  it('returns null for no work-type label at all', () => {
    expect(workTypeOf([])).toBeNull();
    expect(workTypeOf(['Main Card', 'Urgent'])).toBeNull();
    // a family with nothing after the colon is not a work type (ARES's `\S`)
    expect(workTypeOf(['Design:'])).toBeNull();
    expect(workTypeOf(['Asset: '])).toBeNull();
    // nothing BEFORE the colon either (ARES's `[^:]+`)
    expect(workTypeOf([': Icons'])).toBeNull();
  });

  it('returns null for MORE than one — ambiguity is reported, never resolved by picking', () => {
    expect(workTypeOf(['Asset: Icons', 'Ops: Board Management'])).toBeNull();
    expect(workTypeOf(['Asset: Icons', 'Asset: Illustration'])).toBeNull();
  });

  /**
   * Review X3/A1-F2. The discrimination has to be ARES's, byte for byte: a card
   * ARES samples into its `Asset` cell must price off OUR asset-family lane, or
   * the two halves of one model disagree about which cards they describe.
   *
   * The two patterns below are TRANSCRIBED from
   * `ares/src/utils/cycleTimeMath.js` (`WORK_TYPE_PATTERN`,
   * `DIFFICULTY_PREFIX_PATTERN`, applied to the trimmed label name in
   * `extractWorkTypeLabels`). Transcribed rather than derived for the same
   * reason as `ARES_FAMILIES` above: ARES is a separate repository, and this
   * file is where a divergence from it has to be answered.
   */
  const aresSamplesAsWorkType = (name: string): boolean => {
    const n = name.trim();
    return n !== '' && !/^Difficulty:/i.test(n) && /^[^:]+:\s*\S/.test(n);
  };

  it('agrees with ARES, label for label, about what a work type is', () => {
    for (const label of [
      'Asset: Icons',
      'Asset:Icons', // the mistyped-but-real board label — ARES samples it
      'Asset:\tIcons',
      'Asset:   Icons',
      '  Asset: Icons  ',
      'Asset: ',
      'Design:',
      ': Icons',
      'Difficulty: Easy',
      'difficulty: easy',
      'Main Card',
      '\u{1F6D1} Waiting on client',
      '',
    ]) {
      expect(workTypeOf([label]) !== null, JSON.stringify(label)).toBe(aresSamplesAsWorkType(label));
    }
  });

  it('reports the label the way ARES does — trimmed', () => {
    expect(workTypeOf(['  Asset: Icons  '])).toBe('Asset: Icons');
    expect(workTypeOf(['Asset:Icons'])).toBe('Asset:Icons');
  });

  it('a mistyped `Asset:Icons` lands in the same lane as `Asset: Icons`', () => {
    expect(laneOfWorkType(workTypeOf(['Asset:Icons'])!)).toBe(laneOfWorkType('Asset'));
    expect(laneOf({ currentList: 'Render Assets', labels: ['Asset:Icons'] })).toBe(laneOfWorkType('Asset'));
  });
});

describe('laneOfWorkType — prefix lookup', () => {
  it('answers the same lane for the bare family and for a full label', () => {
    for (const [family, lane] of Object.entries(WORK_TYPE_LANES)) {
      expect(laneOfWorkType(family), family).toBe(lane);
      expect(laneOfWorkType(`${family}: Some Kind`), family).toBe(lane);
    }
  });

  it('returns null for an unmapped family — never a default lane', () => {
    /* `Build` and `Dev` stood here until 2026-09-12; all twelve of the board's
       families fold now, so the case an unmapped family describes is a family
       the BOARD has grown since — which is exactly what must surface rather
       than be guessed at. Derived: any key the shipped table lacks. */
    for (const family of ['Nonsense', 'Rendering', 'QA'])
      expect(Object.hasOwn(WORK_TYPE_LANES, family), family).toBe(false);
    expect(laneOfWorkType('Nonsense')).toBeNull();
    expect(laneOfWorkType('Nonsense: Thing')).toBeNull();
    expect(laneOfWorkType('QA: Regression')).toBeNull();
  });

  /**
   * Review A1-F3. The table is a plain object literal, so a family that names
   * something on `Object.prototype` used to answer with whatever the prototype
   * holds — a Function for `constructor`, `Object.prototype` itself for
   * `__proto__`. Both leave the function typed as `Lane`, and the second makes
   * the Mongoose cast of `deliverables.lane` throw and fail the sync run.
   */
  it('a family that collides with Object.prototype is UNMAPPED, not a function', () => {
    for (const key of ['constructor: x', '__proto__: x', 'toString: x', 'hasOwnProperty', 'valueOf']) {
      expect(laneOfWorkType(key), key).toBeNull();
    }
    expect(laneOf({ currentList: 'Working on Design', labels: ['constructor: x'] })).toBe('design');
    expect(laneOf({ currentList: 'Working on Design', labels: ['__proto__: x'] })).toBe('design');
  });
});

describe('laneOf — label first, list regex as the fallback', () => {
  /**
   * THE POINT OF THE 2026-09-10 AMENDMENT: the ruled fold overrides whatever
   * the card's list text says. Before the branch existed, storing labels (T179)
   * would have moved every `Asset: …` card onto the lane its list named,
   * which is the opposite of what JP ruled.
   *
   * The asset-named lists below are kept as fixtures even though the branch
   * that gave them a lane of their own was retired on 2026-09-12 — the ops
   * list in the same loop is what keeps the override discriminating, and an
   * asset list that no longer moves the lane is itself worth exercising.
   */
  it('the work-type label decides the lane even when the list says otherwise', () => {
    for (const [family, lane] of Object.entries(WORK_TYPE_LANES)) {
      expect(laneOf({ currentList: 'Render Assets', labels: [`${family}: Some Kind`] }), family).toBe(lane);
      expect(laneOf({ currentList: 'Ops / Process', labels: [`${family}: Some Kind`] }), family).toBe(lane);
      expect(laneOf({ currentList: 'Icon Clean Up', labels: [`${family}: Some Kind`] }), family).toBe(lane);
    }
  });

  it('a `Difficulty: …` label alongside the work type does not confuse the pick', () => {
    for (const [family, lane] of Object.entries(WORK_TYPE_LANES)) {
      expect(
        laneOf({ currentList: 'Render Assets', labels: ['Difficulty: Easy', `${family}: Kind`] }),
        family,
      ).toBe(lane);
    }
  });

  it('falls back to the list/title regex when there is no work-type label', () => {
    expect(laneOf({ currentList: 'Ops / Process', labels: [] })).toBe('ops');
    expect(laneOf({ currentList: 'Working on Design', labels: [] })).toBe('design');
    expect(laneOf({ currentList: '', labels: ['Main Card'] })).toBe('design');
    // block 12: the asset alternation is gone, so an asset-named list is design
    expect(laneOf({ currentList: 'Render Assets', labels: [] })).toBe('design');
  });

  it('falls back for an UNMAPPED family — the list answers, never design by default', () => {
    /* Build and Dev stood here as the unmapped families until 2026-09-12; both
       map now, so the case is carried by a family the board does not have. */
    expect(laneOf({ currentList: 'Ops / Process', labels: ['Nonsense: Thing'] })).toBe('ops');
    expect(laneOf({ currentList: 'Working on Design', labels: ['Nonsense: Thing'] })).toBe('design');
  });

  it('falls back when the card carries TWO work-type labels', () => {
    expect(
      laneOf({ currentList: 'Ops / Process', labels: ['Design: Screen', 'Content: Copy'] }),
    ).toBe('ops');
  });

  /**
   * Review A1-F1/X2, ruled by the main thread 2026-09-10: when the branch
   * DECLINES — unmapped family, or two work-type labels — the fallback gets the
   * LIST plus the card's non-work-type labels, never the text of the work-type
   * labels themselves. Otherwise a declined label's own words classify the card
   * while its list plainly says something else, which is the opposite of JP's
   * fold.
   *
   * AMENDED 2026-09-12: the worked example used to be `Dev: Render Pipeline`
   * reading `assets` off its own text. Both halves are moot — `Dev` maps now,
   * and the asset branch is retired — so the example is rebuilt on the one
   * lane the fallback text can still reach: every list below reads `design`,
   * and every label below would read `ops` if its text were fed in.
   */
  it('a DECLINED work type falls back to the list — the label text never decides', () => {
    const design = 'Working on Design';
    expect(laneOf({ currentList: design, labels: ['Nonsense: Board Management'] })).toBe('design');
    expect(
      laneOf({ currentList: design, labels: ['Difficulty: Easy', 'Nonsense: Board Management'] }),
    ).toBe('design');
    expect(laneOf({ currentList: design, labels: ['Nonsense: Ops tooling'] })).toBe('design');
    expect(laneOf({ currentList: design, labels: ['Ops: Board Management', 'Content: Copy'] })).toBe(
      'design',
    );
    expect(laneOf({ currentList: design, labels: ['Client: Process', 'Ops: Board Management'] })).toBe(
      'design',
    );
    // the premise: fed in as free text, each of those WOULD have moved the lane
    expect(laneOf({ currentList: design, labels: ['Board Management'] })).toBe('ops');
    expect(laneOf({ currentList: design, labels: ['Ops tooling'] })).toBe('ops');
  });

  it('the fallback still reads the list and any NON-work-type label', () => {
    expect(laneOf({ currentList: 'Ops / Process', labels: [] })).toBe('ops');
    expect(laneOf({ currentList: 'Working on Design' })).toBe('design');
    // free-text labels are not the board's `Family: Kind` shape and still count
    expect(laneOf({ currentList: 'Working on Design', labels: ['Board Management'] })).toBe('ops');
    expect(laneOf({ currentList: '', labels: ['Main Card'] })).toBe('design');
    // block 12: an asset-looking free-text label reaches no lane of its own
    expect(laneOf({ currentList: 'Working on Design', labels: ['Icon Clean Up'] })).toBe('design');
  });
});

describe('designCell with a lane the snapshot has no cell for', () => {
  /**
   * AMENDED 2026-09-12 (JP, block 12). `content` and `dev` are lanes the
   * shipped EMPIRICAL snapshot has no cell for. The middle step of
   * `designCell`'s chain used to hand them the DESIGN lane's cell; it now
   * hands them the GENERAL pool — the board-wide number — and that is written
   * for every lane, not for content. Content is only its first user.
   *
   * The deeper guards for this live in `test/lane-structure.test.ts`; what
   * these two cases pin is the join between the ruled fold and the lookup.
   */
  it('a content card with no content cell falls back to the GENERAL pool, not to design', () => {
    const content = designCell({ difficulty: 'Easy', currentList: '', labels: ['Content: Copy'] });
    expect(laneOf({ currentList: '', labels: ['Content: Copy'] })).toBe('content');
    expect(EMPIRICAL.design.Easy!.content).toBeUndefined();
    expect(content).toBe(GENERAL.Easy);
    expect(content, 'the general pool must differ from design’s cell or the case is vacuous').not.toEqual(
      EMPIRICAL.design.Easy!.design,
    );
  });

  it('a dev card does the same — the fallback is the lane-agnostic one', () => {
    const dev = designCell({ difficulty: 'Easy', currentList: '', labels: ['Dev: Develop Functionality'] });
    expect(laneOf({ currentList: '', labels: ['Dev: Develop Functionality'] })).toBe('dev');
    expect(EMPIRICAL.design.Easy!.dev).toBeUndefined();
    expect(dev).toBe(GENERAL.Easy);
  });

  it('an ops card still prices off the ops cell — a measured lane never reaches the fallback', () => {
    expect(designCell({ difficulty: 'Easy', currentList: '', labels: ['Ops: Board Management'] })).toEqual(
      EMPIRICAL.design.Easy!.ops,
    );
  });
});

describe('the sprint-schedule bar reads the card’s own labels (T179)', () => {
  /**
   * `finishOf` is where a work card meets the forecast engine, and until T179
   * it fed `laneOf` an empty label array — the 2026-08-27 workaround, which had
   * to classify on the LIST because the labels were being thrown away by the
   * mapper. They are stored now, so the bar is drawn from the work type.
   *
   * Both sides EXECUTED, never a pinned date: the expectation is `forecast`'s
   * own answer for the lane the ruled fold picks, so this cannot drift from the
   * engine and carries no timezone-fragile literal.
   */
  /* The list is one the FALLBACK reads as a different lane from the one the
     label folds to, or the case proves nothing. That used to be an asset-named
     list; the branch behind it was retired on 2026-09-12, so it is an ops-named
     one — the last lane the fallback text still reaches. */
  const card = {
    difficulty: 'Easy',
    current_list: 'Ops / Process',
    labels: ['Difficulty: Easy', 'Asset: Icons'],
  };
  const START = '2026-08-03';
  const run = (labels: string[]) =>
    localIso(
      forecast({ difficulty: 'Easy', currentList: card.current_list, labels, startDate: START }, EMPIRICAL)
        .sketchDelivery,
    );

  it('classifies the bar on the work-type label, not on the list', () => {
    expect(finishOf(card, START, EMPIRICAL)).toBe(run(card.labels));
    // and that is a DIFFERENT bar from the one the list alone would have drawn
    expect(run(card.labels)).not.toBe(run([]));
  });

  it('still falls back to the list for a card carrying no work-type label', () => {
    expect(finishOf({ ...card, labels: ['Difficulty: Easy'] }, START, EMPIRICAL)).toBe(run([]));
    expect(finishOf({ ...card, labels: [] }, START, EMPIRICAL)).toBe(run([]));
  });
});
