/**
 * lib/model.ts — model grid lookup, ported VERBATIM from the validated
 * prototype bundle (invariant 5). The EMPIRICAL snapshot below is the
 * prototype's shipped grid (ARES · board hLL7WW2V · Jan–Jul 2026); the
 * phase-6 refresh replaces it per project from model_grid/throughput_grid
 * (FR-7.6) — the lookup semantics here stay identical.
 */

export type Difficulty = 'Easy' | 'Medium' | 'Hard';
/**
 * Amended 2026-09-10 (JP, block-8 Q3): `content` joins the union. The board's
 * work-type label families fold onto lanes (see WORK_TYPE_LANES) and `Content`
 * has no home among design/ops/assets. Purely additive — `designCell`'s
 * fallback chain answers a `content` card with no `content` cell exactly as it
 * answers any other absent lane.
 *
 * Amended 2026-09-12 (JP, block-12, from the measured-cycle-times artifact) —
 * two changes to the membership of this union:
 *  - `assets` LEAVES. Its only cell was the shipped snapshot's 19.24-day Easy
 *    figure (see the EMPIRICAL amendment note), retired as unmeasured; the
 *    asset-producing families already folded to `design` on 2026-09-10, so the
 *    lane had no labelled members left. The union is the tsc tie that forces
 *    `model-refresh.ts`'s LANE_KEYS to drop it in the same commit.
 *  - `dev` JOINS. ARES already pools Build + Dev into a `dev` lane (834
 *    samples; Easy/Medium/Hard p85 0.98 / 1.06 / 3.60, firm-sourced and
 *    correctly ordered) and we were throwing those cells away as unmapped.
 *    The cells arrive the moment the union admits them — no ARES change.
 */
export type Lane = 'design' | 'ops' | 'content' | 'dev';
export type ConfidenceKey = 'Average' | '0.7' | '0.85' | '0.95';

export interface ConfidenceLevel {
  key: ConfidenceKey;
  idx: number;
  label: string;
}

/** Source: fn. Index 1 (0.7) is the default confidence. */
export const CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  { key: 'Average', idx: 0, label: 'Average' },
  { key: '0.7', idx: 1, label: '70th pct' },
  { key: '0.85', idx: 2, label: '85th pct' },
  { key: '0.95', idx: 3, label: '95th pct' },
];

/** Source: Tc — the retired workbook's cycle formula constants (BR-1). */
export const LEGACY_CYCLE = { coef: 1.28, constant: 2.96 };

export interface DesignCell {
  Average: number;
  '0.7': number;
  '0.85': number;
  '0.95': number;
  n: number;
}

export interface EmpiricalModel {
  source: string;
  design: Partial<Record<Difficulty, Partial<Record<Lane, DesignCell>>>>;
  review: { Average: number; '0.7': number; '0.85': number; '0.95': number; median: number; n: number };
  throughput: Record<Difficulty, { p25: number; p50: number; p70: number }>;
}

/**
 * Source: Xe — shipped snapshot, superseded per-project by the nightly refresh.
 *
 * AMENDED 2026-09-12 (JP, block-12): the Easy tier's `assets` cell — Average
 * 12.06, p70 13.88, p85 19.24, p95 23.31, n 353 — is DELETED. It was the only
 * `assets` cell in the snapshot and the only reason the lane existed. The
 * measured run puts asset work at p70 0.50 · p85 0.84 · p95 1.49 over 1,671
 * finished cards, so the shipped figure overstated p85 by roughly 23×; and
 * since JP's 2026-09-10 fold every asset-producing FAMILY prices off `design`,
 * so no labelled card had reached this cell for two days anyway. Deleting a
 * value from a verbatim snapshot is an amendment, not a tidy-up: the oracle
 * (`test/golden/original.mjs`, Xe) keeps the cell, deliberately.
 */
export const EMPIRICAL: EmpiricalModel = {
  source: 'ARES · board hLL7WW2V · Jan–Jul 2026',
  design: {
    Easy: {
      design: { Average: 0.97, '0.7': 0.94, '0.85': 2.67, '0.95': 4.2, n: 1126 },
      ops: { Average: 2.4, '0.7': 1.03, '0.85': 2.94, '0.95': 3.75, n: 311 },
    },
    Medium: {
      design: { Average: 1.13, '0.7': 1.2, '0.85': 2.21, '0.95': 4.02, n: 1508 },
      ops: { Average: 0.73, '0.7': 0.56, '0.85': 0.98, '0.95': 1.05, n: 385 },
    },
    Hard: {
      design: { Average: 1.79, '0.7': 2.09, '0.85': 3.24, '0.95': 5.85, n: 228 },
      ops: { Average: 2.05, '0.7': 1.02, '0.85': 2.94, '0.95': 4.91, n: 121 },
    },
  },
  review: { Average: 5.21, '0.7': 4.8, '0.85': 9.87, '0.95': 19.64, median: 2.68, n: 1184 },
  throughput: {
    Easy: { p25: 29, p50: 50, p70: 75 },
    Medium: { p25: 42, p50: 51, p70: 69 },
    Hard: { p25: 7, p50: 9, p70: 11 },
  },
};

/**
 * The GENERAL cell set — the board-wide pool, added 2026-09-12 (JP, block-12).
 *
 * Measured across EVERY deep cell on the board (cells with n ≥ 15), 5,245
 * finished cards, in working days. Correctly ordered at p85 (0.80 → 0.90 →
 * 2.50) and the widest evidence base we have.
 *
 * WHAT IT IS FOR: `designCell`'s middle fallback. A lane with no cell of its
 * own now prices off this pool instead of off the `design` lane's cell. That
 * is deliberately GENERAL, not a content special case — content is simply its
 * first user, and a rule written for one lane is a second rule to keep in sync
 * the next time the union grows.
 *
 * ON CONTENT, for the record: content is NOT unsampled. It carries 202
 * finished cards across four deep cells, but they measure in MINUTES — p85
 * between 0.05 and 0.43 working days — because content cards pass THROUGH
 * their lane rather than being worked in it. Their durations are real; they
 * describe the board's mechanics, not the work. The reason to use a general
 * number here is "unusable", not "absent".
 *
 * NOT part of EmpiricalModel: the nightly refresh replaces a project's
 * measured cells, and this is the floor under all of them.
 */
export const GENERAL: Record<Difficulty, DesignCell> = {
  Easy: { Average: 0.63, '0.7': 0.4, '0.85': 0.8, '0.95': 1.96, n: 2250 },
  Medium: { Average: 0.53, '0.7': 0.55, '0.85': 0.9, '0.95': 1.66, n: 2478 },
  Hard: { Average: 1.44, '0.7': 1.4, '0.85': 2.5, '0.95': 4.61, n: 517 },
};

export interface LaneCard {
  currentList?: string;
  labels?: string[];
}

/**
 * Work-type label FAMILY → lane (JP 2026-09-10, block-8 Q1; data-confirmed
 * against 4,407 done cards on rt-837). The board labels work as `Family: Kind`
 * — `Asset: Icons`, `Design: Refinement`, `Ops: Board Management` — and ARES's
 * cycle-time model keys on exactly the same 12 families.
 *
 * AMENDED 2026-09-12 (JP, block-12): `Build` and `Dev` were deliberately
 * ABSENT here — unmapped, no lane, never guessed. That is SUPERSEDED: both
 * families now map to `dev`, and all twelve families fold. BOTH, not just
 * `Dev`, because ARES ALREADY POOLS THE TWO into one `dev` lane — 834 samples
 * against Build's 595 deep and Dev's 180 — so mapping only one of them would
 * hand us a lane whose NAME disagrees with the CELLS it reads, with Build's
 * 595 cards discarded while their durations sat silently inside the number.
 * If the two are genuinely different work, the fix is for ARES to split the
 * pool, not for us to read a pooled cell under a narrower name.
 *
 * Lives in lib/ because `laneOf` below needs it and lib never imports src;
 * `src/services/work-type.ts` re-exports it for server code.
 */
export const WORK_TYPE_LANES: Record<string, Lane> = {
  Design: 'design',
  'Design System': 'design',
  Components: 'design',
  Strategy: 'design',
  Asset: 'design',
  '3D': 'design',
  Motion: 'design',
  Production: 'design',
  Ops: 'ops',
  Content: 'content',
  Build: 'dev',
  Dev: 'dev',
};

/**
 * The board's work-type label shape, MIRRORED from ARES (review X3/A1-F2):
 * `ares/src/utils/cycleTimeMath.js` — `WORK_TYPE_PATTERN` and
 * `DIFFICULTY_PREFIX_PATTERN`, both applied to the TRIMMED label name in
 * `extractWorkTypeLabels`. `[^:]+` keeps a label with no family out; `\s*\S`
 * keeps a bare `Design:` out while accepting `Asset:Icons` (no space) and the
 * tab/multi-space variants the board really carries.
 *
 * The shapes must agree with ARES's exactly: a card ARES samples into its
 * `Asset` cell has to price off OUR asset-family lane, or the two halves of one
 * model disagree about which cards they are describing. A stricter shape here
 * put `Asset:Icons` on the 13.88-day assets cell while ARES had it in design.
 * (That cell was retired 2026-09-12; the shape-agreement rule it proved was
 * not — it is why `dev` is mapped to match ARES's pool, not our own reading.)
 */
const WORK_TYPE_LABEL_RE = /^[^:]+:\s*\S/;
/** `Difficulty: Easy` wears the same shape and is the cell's OTHER axis, never a work type. */
const DIFFICULTY_LABEL_RE = /^Difficulty:/i;

/** Does the label wear the board's `Family: Kind` shape at all? (`Difficulty:` included.) */
function isFamilyShaped(label: string): boolean {
  return WORK_TYPE_LABEL_RE.test((label || '').trim());
}

/**
 * The card's ONE work-type label — trimmed, as ARES reports it — or null when
 * it has none or more than one: the same discrimination ARES makes when it
 * samples a card (`noWorkTypeLabel` / `multipleWorkTypeLabels` in its
 * `dropped.reasons`). Ambiguity is reported as "no work type", never resolved
 * by picking a favourite.
 */
export function workTypeOf(labels: string[]): string | null {
  const found = (labels || [])
    .map((l) => (l || '').trim())
    .filter((l) => isFamilyShaped(l) && !DIFFICULTY_LABEL_RE.test(l));
  return found.length === 1 ? found[0]! : null;
}

/**
 * Lane for a work-type key — a full label (`Asset: Icons`) or the bare family
 * (`Asset`). The family is the text before the FIRST colon, trimmed, as ARES
 * keys its cells. Null means unmapped: a family with no ruled lane is counted
 * and surfaced, never folded into `design` by default. Since 2026-09-12 all
 * twelve of the board's known families fold (Build and Dev joined `dev`), so
 * null now means a family the BOARD has grown since — which is exactly the
 * case that must surface as unmapped rather than be guessed at.
 *
 * `Object.hasOwn`, not a bare index (review A1-F3): the table is an object
 * literal, so `constructor: x` used to answer with a Function and `__proto__: x`
 * with `Object.prototype` — both typed as `Lane`, and the second makes the
 * Mongoose cast of the stored lane throw and fail the project's sync run.
 */
export function laneOfWorkType(key: string): Lane | null {
  const colon = key.indexOf(':');
  const family = (colon === -1 ? key : key.slice(0, colon)).trim();
  return Object.hasOwn(WORK_TYPE_LANES, family) ? (WORK_TYPE_LANES[family] ?? null) : null;
}

/**
 * Lane classification. The LABEL FAMILY decides where a labelled card belongs
 * (JP 2026-09-10, invariant-5 amendment): without this branch an `Asset: Icons`
 * card fell into `assets` on the text regex below — the opposite of the ruled
 * fold, which puts every asset-producing family in `design`. The branch stays
 * load-bearing after the 2026-09-12 amendment below: it is what routes `Ops:`,
 * `Content:` and the new `Build:`/`Dev:` families off the list text.
 *
 * The regex that follows is the VERBATIM port (source: rp; BR-4 companion) and
 * stays the fallback for the 19% of cards carrying no work-type label at all.
 *
 * WHAT THE FALLBACK SEES (review A1-F1/X2, ruled by the main thread
 * 2026-09-10): the list, plus the card's labels MINUS every `Family: Kind`-
 * shaped one. When the branch declines — an unmapped family, or two work-type
 * labels — the decision belongs to the list, which is the pre-T179 behaviour
 * and JP's fold; letting the declined label's own TEXT through would put
 * `Dev: Render Pipeline` on the 13.88-day assets cell while its list plainly
 * reads design. (Both halves of that worked example are moot since
 * 2026-09-12 — `Dev` maps, the assets cell is gone — but the rule stands on
 * its own ground: a declined label's text is not the board's classification
 * signal.) Free-text labels are not the board's shape and still reach the
 * regex, exactly as they did before the amendment.
 *
 * ⚠️ AMENDED 2026-09-12 (JP, block-12) — THE FIRST EDIT TO THE VERBATIM REGEX
 * SINCE THE PORT, recorded here the way `lib/calendar.ts` records its
 * 2026-08-15 amendment. Deliberate, not a cleanup:
 *  - WHAT CHANGED: the `/asset|illustrat|render|icon/` → `'assets'` branch is
 *    DELETED. The remaining alternations are byte-identical to the port; the
 *    `ops` branch and the final `design` default are untouched. An unlabelled
 *    asset-looking card now falls through to `design`.
 *  - WHY: that branch was the last route to the snapshot's 19.24-day p85
 *    assets cell, itself retired above as unmeasured (measured asset work:
 *    p70 0.50 · p85 0.84 · p95 1.49 over 1,671 finished cards). Labelled
 *    asset families have folded to `design` since JP's 2026-09-10 ruling, so
 *    the branch could only catch cards that DON'T announce themselves — and
 *    `design` is precisely the ruled fold for those.
 *  - WHY IT IS SAFE (verified before the build): no golden fixture row carries
 *    `currentList` or `labels` — `test/golden/workbook-rows.json`, 40 rows,
 *    whose fields are mc, start, slaSketch, slaRender, sketchDelivery,
 *    sketchApproved, renderDelivery, renderApproved, confidence,
 *    forecastedReview, totalCycle. The oracle's own lane derivation
 *    (`test/golden/original.mjs`, `rp`) reads `e.currentList || ""` and
 *    `e.labels || []`, so its text is empty and EVERY golden row resolves to
 *    `design` in both implementations, so the FIXTURE goldens cannot move —
 *    and they did not (`test/forecast.workbook.test.ts`, 4/4).
 *  - ⚠️ THAT IS ONLY HALF THE PICTURE, and the first version of this note
 *    stopped here. `test/forecast.test.ts` builds its OWN parity matrix from a
 *    hand-written list of list-names including `Render Assets` and
 *    `Icon Clean Up`, so 1,200 of its 3,600 cards DO reach this branch and DO
 *    diverge from the oracle. That divergence is licensed, and it is pinned
 *    rather than excused: every diverging card returns exactly what the oracle
 *    itself returns for the same card in a design-named list, and ZERO cards
 *    diverge while agreeing on lane. So the engine's composition is untouched
 *    — only the lane a card is assigned to changed, which is the ruling.
 *    If a card ever diverges while agreeing on lane, stop: that is the change
 *    reaching further than intended.
 *  - THE ORACLE KEEPS THE BRANCH, ON PURPOSE. `test/golden/original.mjs` is
 *    the reference and is never edited; oracle/lib divergence here is licensed
 *    only by the unreachability fact above, so that fact must be re-verified
 *    before any golden fixture grows a `currentList` or `labels` field.
 */
export const laneOf = (card: LaneCard): Lane => {
  const labels = card.labels || [];
  const workType = workTypeOf(labels);
  if (workType) {
    const lane = laneOfWorkType(workType);
    if (lane) return lane;
  }
  const t = `${card.currentList || ''} ${labels.filter((l) => !isFamilyShaped(l)).join(' ')}`.toLowerCase();
  return /ops|process|board management/.test(t) ? 'ops' : 'design';
};

export interface DesignCellCard extends LaneCard {
  difficulty?: string;
}

/**
 * The GENERAL cell for a difficulty, with the same Medium default the tier
 * lookup uses. `Object.hasOwn`, not a bare index, for the reason spelled out
 * on `laneOfWorkType` (review A1-F3): GENERAL is an object literal, so
 * `difficulty: 'constructor'` off a card would otherwise answer with a
 * Function typed as a DesignCell.
 */
function generalCell(difficulty?: string): DesignCell {
  const d = (difficulty || '').trim();
  return Object.hasOwn(GENERAL, d) ? (GENERAL[d as Difficulty] ?? GENERAL.Medium) : GENERAL.Medium;
}

/**
 * Grid cell for a card: difficulty × lane, with the source's fallbacks
 * (source: Xh).
 *
 * AMENDED 2026-09-12 (JP, block-12): the MIDDLE step of the chain changes.
 * The walk was difficulty tier (or Medium) → the card's lane → the `design`
 * lane's cell → first cell; it is now difficulty tier (or Medium) → the card's
 * lane → the GENERAL pool for that difficulty → first cell.
 *
 * A lane with no measured cell of its own no longer borrows design's number.
 * Written for EVERY lane, not for content: content is only the first user, and
 * a rule written for one lane is a second rule to keep in sync the next time
 * the union grows. See GENERAL above for the pool and for why content's own
 * 202 samples are unusable rather than absent.
 *
 * The final `Object.values(t)[0]` is kept as the port left it. It is defensive
 * only — `generalCell` is total, so nothing reaches it while GENERAL covers
 * all three difficulties — and it stays because the chain's shape is the
 * verbatim port's and removing a step is a bigger claim than adding one.
 */
export function designCell(card: DesignCellCard, model: EmpiricalModel = EMPIRICAL): DesignCell {
  const t =
    model.design[card.difficulty as Difficulty] ?? (model.design.Medium as Record<string, DesignCell>);
  const a = laneOf(card);
  return (
    (t as Record<string, DesignCell>)[a] ??
    generalCell(card.difficulty) ??
    (Object.values(t)[0] as DesignCell)
  );
}
