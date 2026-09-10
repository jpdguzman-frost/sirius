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
 */
export type Lane = 'design' | 'ops' | 'assets' | 'content';
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

/** Source: Xe — shipped snapshot, superseded per-project by the nightly refresh. */
export const EMPIRICAL: EmpiricalModel = {
  source: 'ARES · board hLL7WW2V · Jan–Jul 2026',
  design: {
    Easy: {
      design: { Average: 0.97, '0.7': 0.94, '0.85': 2.67, '0.95': 4.2, n: 1126 },
      ops: { Average: 2.4, '0.7': 1.03, '0.85': 2.94, '0.95': 3.75, n: 311 },
      assets: { Average: 12.06, '0.7': 13.88, '0.85': 19.24, '0.95': 23.31, n: 353 },
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

export interface LaneCard {
  currentList?: string;
  labels?: string[];
}

/**
 * Work-type label FAMILY → lane (JP 2026-09-10, block-8 Q1; data-confirmed
 * against 4,407 done cards on rt-837). The board labels work as `Family: Kind`
 * — `Asset: Icons`, `Design: Refinement`, `Ops: Board Management` — and ARES's
 * cycle-time model keys on exactly the same 12 families. Ten fold here; `Build`
 * and `Dev` are deliberately ABSENT (unmapped, no lane), never guessed.
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
 * keys its cells. Null means unmapped: a family with no ruled lane (Build, Dev)
 * is counted and surfaced, never folded into `design` by default.
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
 * card falls into `assets` on the text regex below — the opposite of the ruled
 * fold, which puts every asset-producing family in `design`.
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
 * reads design. Free-text labels are not the board's shape and still reach the
 * regex, exactly as they did before the amendment; the regex text is byte-
 * identical to the port.
 */
export const laneOf = (card: LaneCard): Lane => {
  const labels = card.labels || [];
  const workType = workTypeOf(labels);
  if (workType) {
    const lane = laneOfWorkType(workType);
    if (lane) return lane;
  }
  const t = `${card.currentList || ''} ${labels.filter((l) => !isFamilyShaped(l)).join(' ')}`.toLowerCase();
  return /asset|illustrat|render|icon/.test(t)
    ? 'assets'
    : /ops|process|board management/.test(t)
      ? 'ops'
      : 'design';
};

export interface DesignCellCard extends LaneCard {
  difficulty?: string;
}

/** Grid cell for a card: difficulty × lane, with the source's fallbacks (source: Xh). */
export function designCell(card: DesignCellCard, model: EmpiricalModel = EMPIRICAL): DesignCell {
  const t =
    model.design[card.difficulty as Difficulty] ?? (model.design.Medium as Record<string, DesignCell>);
  const a = laneOf(card);
  return (
    (t as Record<string, DesignCell>)[a] ??
    (t as Record<string, DesignCell>).design ??
    (Object.values(t)[0] as DesignCell)
  );
}
