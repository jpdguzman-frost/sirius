/**
 * T179 — the board's work-type labels, for server code.
 *
 * The board labels work as `Family: Kind` (`Asset: Icons`, `Design:
 * Refinement`, `Ops: Board Management`) and ARES's cycle-time model keys on
 * exactly the same 12 families. JP's fold from family → lane (2026-09-10,
 * data-confirmed) is the ONE table, and it lives in `lib/model.ts` because
 * `laneOf` needs it there and lib never imports src.
 *
 * This module is a re-export, deliberately: a second copy of the fold — or a
 * second implementation of "which label is the work type" — would be free to
 * drift from the one the forecast engine actually classifies on.
 * `test/CLAUDE.md` rule 2: derive, don't copy.
 */

export {
  WORK_TYPE_LANES,
  laneOfWorkType,
  workTypeOf,
  type Lane,
} from '../../lib/model.ts';
