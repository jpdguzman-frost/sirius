# PLAN — Pipeline no-results state (owl #76, frame 748:18444)

**EPHEMERAL** — rotates into the day's state-log at CLOSE. Mode: **Full**
(Figma work → hard gate), build sized like Light: ONE build agent.

## Drift report

Today the Pipeline table (headers included) always renders; when search or
filters match nothing the user gets a header row over an empty body. The
whole #76 state is NEW — no mock-vs-ruling contradictions found. Verified
from node 748:19608, not prose:

- Message frame 1781×606, no fill/border; vertical auto-layout, content
  CENTERED with asymmetric padding **64 top / 180 bottom / 64 sides**, gap
  12 — that padding is what puts the block "slightly above centre" (the
  headline lands at y=206). Text column fills (1653 at full width).
- Headline `No results found` — 32px / **700** / lh 120% / #0f172a /
  centred. The 700 is measured from the node; Miles flagged it as possible
  drift vs the house 600 but ruled "build what the frame holds".
- Subline `Try adjusting your search term or clearing active filters` —
  24px / 400 / lh 120% / #64748b / centred, 12px below. Single-weight both.
- ONE state for search-only / filter-only / both; no term echo in the
  headline (deliberately removed — do not reintroduce).
- The ENTIRE table goes, header row included; metrics strip, search field
  (term retained), filter/sort controls all stay — all already true of our
  layout, they sit above the table.
- Tiles do NOT rescope (already true: kpi reads the project); term and
  filters persist (already true: nothing clears them).
- §8's dashed-box empty-state pattern deliberately does NOT apply — this
  is a full-page empty; do not "correct" it into the box (Miles raised the
  §8 doc gap himself).

## Decisions taken here (reversible, reported to JP)

1. **Fresh-empty is out of scope**: zero rows with NO search and NO active
   filter (a project with no cards) keeps today's rendering. The state is
   specified for the three user-caused paths only, and its subline would
   otherwise instruct remedies that don't exist.
2. **UNATTACHED tile stays clickable** while the table is empty — Miles
   marked it not-covered; the tiles describe the project, so the tile's
   behavior doesn't change with the result set.

## Build — one agent, exclusive ownership

Files: `frontend/templates/views/30-pipeline.html`,
`frontend/styles/20-pipeline.css`, `frontend/scripts/40-app-state.js`,
the Pipeline render/frame test suite (locate by existing pins).

Frozen interfaces:
- Computed `pipeNoResults` (40-app-state): true iff the filtered row set is
  empty AND (the search term is non-blank OR any pipe filter is active —
  derive "active" from the same source the chips/Clear-all read, never a
  second spelling).
- Template: `{{#if pipeNoResults}}` renders `<div class="pnores">` with
  `<p class="pnores-head">No results found</p>` and
  `<p class="pnores-sub">Try adjusting your search term or clearing active
  filters</p>` IN PLACE OF the `.pscrollwrap` table block (headers
  included); `{{else}}` the existing table unchanged.
- CSS: `.pnores` — no fill, no border; padding 64px top, 180px bottom,
  64px sides; content column centred in the remaining height; gap 12px;
  `.pnores-head` 32px/700/lh 1.2/var slate-900 token for #0f172a;
  `.pnores-sub` 24px/400/lh 1.2/slate-500 token. Use existing tokens where
  they match the hex exactly; otherwise the literal with a node comment.
- Guards: copy strings pinned verbatim (both, single-weight); weight 700
  pinned WITH a comment naming Miles's drift flag so nobody "fixes" it to
  600; table absent (no `<thead>`) when pipeNoResults; table present and
  state absent when rows exist; fresh-empty (no search/filter) renders the
  table, NOT the state.

VALIDATE dual-TZ in full; new guards revert-proven (anchor commit first,
/tmp snapshots). REVIEW single correctness pass (Light-scale). E2E real
browser: type a hopeless term, see the state; add a filter on top; clear
both; fresh-empty edge. CLOSE: STATE.md, day log, PLAN rotation, ack #76.
