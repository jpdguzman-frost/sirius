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
import { EMPIRICAL, designCell, laneOf, type Lane } from '../lib/model.ts';
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

describe('WORK_TYPE_LANES — the ruled fold (JP 2026-09-10)', () => {
  it('maps ten of ARES’s twelve families and leaves Build and Dev unmapped', () => {
    const unmapped = ARES_FAMILIES.filter((f) => laneOfWorkType(f) === null);
    expect(unmapped).toEqual(['Build', 'Dev']);
    expect(ARES_FAMILIES.filter((f) => laneOfWorkType(f) !== null)).toHaveLength(10);
  });

  it('holds no family outside ARES’s vocabulary', () => {
    expect(Object.keys(WORK_TYPE_LANES).sort()).toEqual(
      ARES_FAMILIES.filter((f) => laneOfWorkType(f) !== null).sort(),
    );
  });

  it('folds onto exactly three lanes — Ops alone to ops, Content alone to content, the rest to design', () => {
    const lanes = Object.values(WORK_TYPE_LANES);
    expect(new Set(lanes)).toEqual(new Set<Lane>(['design', 'ops', 'content']));
    expect(lanes.filter((l) => l === 'ops')).toHaveLength(1);
    expect(lanes.filter((l) => l === 'content')).toHaveLength(1);
    expect(WORK_TYPE_LANES['Ops']).toBe('ops');
    expect(WORK_TYPE_LANES['Content']).toBe('content');
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
    expect(laneOfWorkType('Build')).toBeNull();
    expect(laneOfWorkType('Dev: API')).toBeNull();
    expect(laneOfWorkType('Nonsense: Thing')).toBeNull();
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
   * THE POINT OF THE AMENDMENT. Every list below reads `assets` to the
   * verbatim regex (`/asset|illustrat|render|icon/`); the ruled fold overrides
   * it. Before the branch existed, storing labels (T179) would have moved every
   * `Asset: …` card INTO `assets` — a 13.88-day Easy cell instead of a
   * 0.94-day one — which is the opposite of what JP ruled.
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

  it('falls back to the verbatim list/title regex when there is no work-type label', () => {
    expect(laneOf({ currentList: 'Render Assets', labels: [] })).toBe('assets');
    expect(laneOf({ currentList: 'Ops / Process', labels: [] })).toBe('ops');
    expect(laneOf({ currentList: 'Working on Design', labels: [] })).toBe('design');
    expect(laneOf({ currentList: '', labels: ['Main Card'] })).toBe('design');
  });

  it('falls back for an UNMAPPED family — Build/Dev get the list’s answer, not design by default', () => {
    expect(laneOf({ currentList: 'Render Assets', labels: ['Build: Pipeline'] })).toBe('assets');
    expect(laneOf({ currentList: 'Ops / Process', labels: ['Dev: API'] })).toBe('ops');
  });

  it('falls back when the card carries TWO work-type labels', () => {
    expect(
      laneOf({ currentList: 'Render Assets', labels: ['Ops: Board Management', 'Content: Copy'] }),
    ).toBe('assets');
  });

  /**
   * Review A1-F1/X2, ruled by the main thread 2026-09-10: when the branch
   * DECLINES — unmapped family, or two work-type labels — the fallback gets the
   * LIST plus the card's non-work-type labels, never the text of the work-type
   * labels themselves. Otherwise `Dev: Render Pipeline` reads `assets` off its
   * own label text (a 13.88-day Easy cell instead of a 0.94-day one) while the
   * list plainly says design, which is the opposite of JP's fold.
   *
   * Every list below reads `design` to the verbatim regex; every label below
   * would read something else if its text were fed in.
   */
  it('a DECLINED work type falls back to the list — the label text never decides', () => {
    const design = 'Working on Design';
    expect(laneOf({ currentList: design, labels: ['Dev: Render Pipeline'] })).toBe('design');
    expect(laneOf({ currentList: design, labels: ['Difficulty: Easy', 'Dev: Render Pipeline'] })).toBe(
      'design',
    );
    expect(laneOf({ currentList: design, labels: ['Build: Ops tooling'] })).toBe('design');
    expect(laneOf({ currentList: design, labels: ['Asset: Icons', 'Design: Screen'] })).toBe('design');
    expect(laneOf({ currentList: design, labels: ['Ops: Board Management', 'Content: Copy'] })).toBe(
      'design',
    );
    expect(laneOf({ currentList: design, labels: ['Client: NBG', 'Asset: Icons'] })).toBe('design');
  });

  it('the fallback still reads the list and any NON-work-type label — verbatim behaviour', () => {
    // unlabelled cards: byte-identical to the port
    expect(laneOf({ currentList: 'Render Assets', labels: [] })).toBe('assets');
    expect(laneOf({ currentList: 'Ops / Process', labels: [] })).toBe('ops');
    expect(laneOf({ currentList: 'Working on Design' })).toBe('design');
    // free-text labels are not the board's `Family: Kind` shape and still count
    expect(laneOf({ currentList: 'Working on Design', labels: ['Icon Clean Up'] })).toBe('assets');
    expect(laneOf({ currentList: 'Working on Design', labels: ['Board Management'] })).toBe('ops');
    expect(laneOf({ currentList: '', labels: ['Main Card'] })).toBe('design');
  });
});

describe('designCell with the new lane', () => {
  /**
   * `content` is a lane the shipped EMPIRICAL snapshot has no cell for, and
   * `designCell`'s fallback chain (lane → design → first present) is untouched
   * by the amendment. A Content card must therefore price off the design cell,
   * not throw and not land on `assets`.
   */
  it('a content card with no content cell falls back to the design cell', () => {
    const content = designCell({ difficulty: 'Easy', currentList: '', labels: ['Content: Copy'] });
    expect(laneOf({ currentList: '', labels: ['Content: Copy'] })).toBe('content');
    expect(EMPIRICAL.design.Easy!.content).toBeUndefined();
    expect(content).toEqual(EMPIRICAL.design.Easy!.design);
  });

  it('an ops card still prices off the ops cell', () => {
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
  const card = {
    difficulty: 'Easy',
    current_list: 'Render Assets', // the verbatim regex reads this as `assets`
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
