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
| 1 | Breakdown cards vs build-spec §3.1 "no boxes, 45% dim" | ~~Bordered cards per the annotated instance~~ **Superseded by JP's revised design (2026-08-14): borderless segments**, equal quarters flush with the content edge, hairline `--slate-200` closing the bar — i.e. §3.1 was right after all. Active state = the other segments dim to 45%; no border treatment. |
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
| 13 | Rejects banner (§3.3 incomplete panel) | **Removed by JP (2026-08-14, "remove this banner already")** — the rejects payload stays in the API; the rejects-only empty state carries the message instead. |
| 14 | Status model (owl #14 supersedes #11) | Trello presence drives it: In Pipeline (filed, wins over flag) · To File (unfiled) · For Clarification (unfiled + flag, Sirius-internal). Counts cross-cut: REQUESTS = IN PIPELINE + TO FILE; FOR CLARIFICATION ⊂ TO FILE. Card filters are predicates, not string matches. |
| 15 | Filed row with a stale clarify flag | Not in the "For Clarification state" (owl #13's render condition) — shows In Pipeline + the plain remark box, excluded from the clarification count/filter. Flagged to product for confirm. |
| 16 | Single-box notes (owl #15) | The reason field is gone; clarify requires the remark (`REMARK_REQUIRED`). Legacy rows keep their text via `noteText()` = remark ‖ clarify_reason. Keying stays `(project_id, mc_number)` — owl #15 said `(project_id, trello_card_id)`, but a For-Clarification request has no Trello card by definition. |
| 17 | Breakdown annotation drift | The moved node `470:21130` still describes **bordered** cards; JP's borderless revision (ruling #1) stands — annotation refresh requested from product. |

## Data reality

Production intake is empty (`GOOGLE_SHEETS_CREDENTIALS` deferred), so both live
projects show the tokenized empty state with zeroed Breakdown counts until the
sheet credential lands. The tab is fully exercised by the seeded E2E probe and
fixtures locally.
