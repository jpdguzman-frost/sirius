# Requests tab — frame notes (2026-08-14)

The Figma annotations are the spec (product owls #11 Breakdown, #12 Request Tab
Table), read via Rex. This file records where the build had to interpret,
mirror-corrected, or deviated — the requests-tab counterpart of
`pipeline-frame-notes.md`.

## Canonical node map (product, owl #19 — read annotations ONLY from these)

Root cause of the recurring node-id drift was duplicate component instances on
the Workspace page; product is consolidating. Canonical instances:

| Component | Node |
|---|---|
| Breakdown | `470:21130` (metric-wrapper) — the duplicate `452:23559` is stale, disregard |
| Request Tab Table | `452:23561` |
| Frost Remarks — display block | `452:24801` |
| Frost Remarks — edit state | `452:24791` |
| YEAR column | header `470:21145` · value `452:24773` |
| MONTH column | header `470:21178` · value `470:21206` |
| Planner toolbar | `94:4828` |

Closures via #19/#20: filed-wins confirmed by product too; frost-note keying
corrected to `(project_id, mc_number)` in their records; client-side sort
accepted (annotation updated to match); rulings #15–#17 all closed both sides.

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
| 15 | Filed row with a stale clarify flag | Not in the "For Clarification state" (owl #13's render condition) — shows In Pipeline + the plain remark box, excluded from the clarification count/filter. **CONFIRMED by JP 2026-08-14** ("Correct. A" — filed wins, red block clears). |
| 16 | Single-box notes (owl #15) | The reason field is gone; clarify requires the remark (`REMARK_REQUIRED`). Legacy rows keep their text via `noteText()` = remark ‖ clarify_reason. Keying stays `(project_id, mc_number)` — owl #15 said `(project_id, trello_card_id)`, but a For-Clarification request has no Trello card by definition. |
| 17 | Breakdown annotation drift | ~~Annotation refresh requested~~ **RESOLVED — product refreshed it to borderless (owl #17)**; the `415:54979` precedence annotation was also corrected to Trello-due-first (closes pipeline drift #6). |
| 18 | Year/Month basis (final) | Owl #16 supersedes ruling #3: two NEW leading table columns hold the **filed** year/month (nodes 470:21145/452:24773/470:21178/470:21206); the dropdowns key on them. Source month encoding unknown until the sheet credential — `monthShort()` canonicalizes name/number/Sep/Sept → MMM everywhere. |
| 19 | Sorting (owl #18) | All columns except Brief + Frost Notes; asc→desc→clear; default newest-filed, nulls last; page-1 reset. The annotation's "server-side over the full dataset" is implemented client-side over the full filtered set — identical semantics, the client holds every row from the one fetch. Row-click and cell links: **closed as none.** |
| 20 | Status badge tokens (owl #17) | For Clarification red-50/**red-500** (was inferred red-600); In Pipeline green-50/**#22c55e** (product-derived); To File amber confirmed as built. Breakdown segment colors unchanged (frame-pinned green-600). |

## Batch 5 — STATUS is two-valued (owls #34/#35, 2026-08-17)

Nodes re-read for this pass: `452:24800` (Request Tab Table) and `452:24801`
(Frost Remarks display block). Six annotations across the two, verified against
the owl text before build; no material mismatch.

**The rule.** STATUS derives from the Trello join and nothing else —
`In Pipeline` when the MC group has deliverables, `For Filing` when it does
not. `To File` is renamed to `For Filing`; the third value `For Clarification`
is **retired**. A clarification flag is a property of the NOTE and surfaces
only in the Remarks cell, as the red `With Clarification` pill. Ruling 14 above
(the three-state model) is superseded by this; ruling 15 (filed wins) survives
unchanged and is now true *by construction* rather than by a precedence branch.

Counts are unchanged in every input. `forClarification` re-keys from
"status === For Clarification" to "unfiled AND `note.clarify`" — precisely the
set the old derivation produced — so owl #14's cross-cutting rule still holds:
REQUESTS = IN PIPELINE + TO FILE, and FOR CLARIFICATION ⊂ TO FILE.

| ID | Ruling | Shipped |
|---|---|---|
| **21** | **Card/badge asymmetry is deliberate** (Miles, owl #35): the Breakdown card keeps reading `TO FILE` and the `FOR CLARIFICATION` card stays, while the row badge reads `For Filing`. The counts key `counts.toFile` keeps its name for the same reason. Do not "fix" this and do not report it later as drift. | Yes — `reqStats` labels untouched; a comment at each site says why |
| **R-req-a** | A **FILED + flagged** row renders the plain remark box and is `In Pipeline` only — no clarification pill, excluded from the count and the filter. The frame calls clarification "orthogonal", which could be read as showing the badge on filed rows too, but that would break the `forClarification ⊂ toFile` count Miles asked us to agree with in #14. **Default built as unchanged; asked of Miles.** | Yes — one shared `clarified()` predicate serves the segment filter *and* the template branch, so the two can never disagree. Proven both ways: `test/requests-render.test.ts` renders MC-D with a plain `notebox`, and `scripts/batch5-probe.ts` excludes it from `?filter=clarification` |
| **22** | The client stops owning the clarification vocabulary entirely. `STATUS_TO_FILE` and `STATUS_CLARIFY` are **deleted**, not renamed — the client never needs to spell `For Filing` (the server sends `r.status` and the cell prints it), and keeping an unused const would fail `no-unused-vars`. `STATUS_FILED` survives as the one literal the badge branches on. | Yes — the probe asserts `For Filing` appears nowhere in `frontend/scripts/01-app.js` outside a comment |
| **23** | A note save **cannot move status**. The optimistic patch that rewrote `requests.N.status`, its `prev.status` capture and its rollback keypath are all removed; only the note and the search blob are patched. | Yes — the badge and the Remarks cell both re-derive from the note the patch just wrote |
| **24** | Remarks-cell nits from the verified render: note text is **red-600 `#dc2626`** (already true, `.clarnote` needed no change) and the frame's container border reads as a **~3.9px LEFT** border where the annotation text says "a red-500 border". The build's 1px all-round is the *annotation* reading and is **ACCEPTABLE** — recorded, not churned. | ~~Recorded only~~ — **OVERTURNED by ruling 25** |
| **25** | **The clarification note is a 4px LEFT ACCENT, no border** (product correction, owl #51, 2026-08-18). Product exported the container as SVG: it holds exactly one red element, a bar from x=0 to x=4 at full height, and the file contains a single `#EF4444` reference. There is no top, right or bottom stroke in the design. The 11px text inset is the accent plus a ~7px gap, so with `border-box` the padding is 7 and not 11. **This closes ruling 24 the other way**: the measured render was right and the annotation was wrong, and deferring to the annotation's word "border" shipped the defect for four days. The reusable lesson — the same word produced the same wrong build on the Pipeline row's amber, where we read the frame correctly and product's prose incorrectly — is that a *directional-looking* stroke is settled from the SVG, never from the annotation text and never from `get_node_info`, which reports no per-side weights. Product has switched to writing "Npx left accent" explicitly. | Yes — `.notewrap .clarnote`; guarded four ways in `test/requests-render.test.ts` (accent present, no four-sided border, inset arithmetic, still hugs its content) |

**Open to Miles — the Remarks cell's own annotation contradicts the feature.**
`452:24801` states the cell is a READ-ONLY display, "no editing here". But the
frost-note editor's only entry point *is* that cell (owl #15, ruling 10 above),
and the feature is Sirius-owned and audit-logged — read-only applies to the
source systems, not to this column. The editor is kept. **Asked of Miles: if
the cell is genuinely read-only, where should the edit affordance live?**

## Data reality

Production intake is empty (`GOOGLE_SHEETS_CREDENTIALS` deferred), so both live
projects show the tokenized empty state with zeroed Breakdown counts until the
sheet credential lands. The tab is fully exercised by the seeded E2E probe and
fixtures locally.
