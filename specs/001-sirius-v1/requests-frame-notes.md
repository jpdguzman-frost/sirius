# Requests tab — frame notes (2026-08-14)

The Figma annotations are the spec (product owls #11 Breakdown, #12 Request Tab
Table), read via Rex. This file records where the build had to interpret,
mirror-corrected, or deviated — the requests-tab counterpart of
`pipeline-frame-notes.md`.

## Annotation source

The owls cite nodes `160:10320` / `279:21667` — the source components, which
carry **zero** annotations. The annotated copies are the 🛠️ Workspace instances
**`452:23559`** (Breakdown, 3 categorized) and **`452:23561`** (Request Tab
Table, 9 categorized). Counts and content match the owls 1:1; verified before
build per the standing Rex-first rule.

## Rulings and defaults (flagged to product in the deploy owl)

| # | Point | Ruling |
|---|---|---|
| 1 | Breakdown cards vs build-spec §3.1 "no boxes, 45% dim" | Frame wins (newer): bordered cards `--border-border`. The 45% dim survives as the *unselected* treatment while a filter is active; active card gets a 2px `--surface-foreground` border. |
| 2 | Single vs multi-select cards | Single-select toggle; REQUESTS = show-all. Annotation left both open. |
| 3 | YEAR/MONTH basis | The sheet's own Year/Month columns (§3.4 "Year parses `2026.0`") — requests have no request/filed date field. Chain built, dormant until the Sheets credential. |
| 4 | Page size | 10 (build-spec §3.5). The frame's `1 … 491 492 493 … 495` numbers are sample filler mirroring the 495-item count. |
| 5 | Search debounce | 250ms lazy, matching the Pipeline searchbar. |
| 6 | Column sort / row-click detail / MC# & BRIEF click-through | Not built — annotation says "none evident from the frame — flag rather than assume". |
| 7 | BRIEF | The frame renders brief *text*, not a link (answers owl #12 Q4). Ellipsised at 180 chars, full text in the tooltip. |
| 8 | Filter-label casing | Frame is malformed (`Year`, `MONTH`, `TYPE`, `rEQUESTOR`) — normalized to ALL-CAPS per the annotation's own recommendation. |
| 9 | STATUS badge recipes | Frame shows only For Filing (`#fef3c7/#f59e0b/#d97706`). In Pipeline (green-50/600) and With Clarification (red-50/600) inferred from the Breakdown palette — product to confirm. |
| 10 | FROST NOTES editability | Owl #12 filed the column under "read-only display from ARES"; the frame shows a full editor (Add Remarks → textarea + clarify checkbox + Cancel/Submit). Read-only applies to the *source systems*: this is the existing FR-11 Sirius-owned, audit-logged feature, restyled. No semantics change. |
| 11 | Sync strip (build-spec §3.2) | Not in the frame, not in the owls — **not built** this pass; still pending. |
| 12 | MC-cell "row 2" sub-label | Decoded as the §3.6 sheet-row link. Renders as an external link only when a sheet URL is derivable, else plain dim text. |

## Data reality

Production intake is empty (`GOOGLE_SHEETS_CREDENTIALS` deferred), so both live
projects show the tokenized empty state with zeroed Breakdown counts until the
sheet credential lands. The tab is fully exercised by the seeded E2E probe and
fixtures locally.
