# Deadlines frame notes — owl miles→jp #64, node `630:51389`

> **ARCHIVE (2026-09-05)** — the law of the OLD milestone-unit Deadlines tab (owl #64,
> node `630:51389`, deliverable × phase), superseded whole by the work-card rebuild of
> owls #74/#75/#78 §2 (JP ruling 2026-08-27; built block 3, 2026-09-05). Current law:
> `deadlines-rules.md`; where this file and it disagree, `deadlines-rules.md` wins. Kept
> because it records WHY R-dl-a…n were built as they were — the acknowledge/day-planner
> hold (R-dl-i) is now PARKED server-side with no caller (JP 2026-09-05), and R-dl-n (the
> acknowledged-state design) is still with product. The node `630:51389` no longer
> exists in the file.

Layer-2 law for the redesigned Deadlines tab. Five categorized annotations were
read off the frame and verified against the owl before a line was written; the
count and the content matched. Where the frame and the owl differ, **the frame
wins** — the rule that has already served this project twice.

Was asserted by `test/deadlines-frame.test.ts` — deleted with the tab on 2026-09-05; the
current law is asserted by `test/deadlines-tab.test.ts`.

| # | Rule | Asserted |
|---|---|---|
| **R-dl-a** | **THERE IS NO COLUMN TABLE HERE.** The Figma component is still named 'Request Tab Table', but the tab is a Search Field over week groups holding cards. The name is a leftover, not an intent, and the Requests/Pipeline table treatment is deliberately not inherited — no `.ptable`, no column widths, no header row. The week groups read LEFT TO RIGHT and the row of them scrolls horizontally inside its own box; the page body never scrolls sideways. | Yes — the absence of the table recipes, and the scroller asserted on the week row and NOT on the body |
| **R-dl-b** | ⚠️ **TWO DATES, TWO MEANINGS, NEVER COLLAPSED.** The caption date is the FORECAST MILESTONE — it is what places the card in this week. The subtitle date is the CLIENT DEADLINE. Comparing the two *is* the past-deadline rule, so they sit in different places, carry different labels, and are formatted by different functions. The deadline shows its year only when it leaves the milestone's year: the frame drops the year, which reads fine while both dates sit in one year and misleads the moment they do not. | Yes — both formatters executed, including the year-crossing case |
| **R-dl-c** | **The week range is DAY-FIRST and unpunctuated between the days** — `3-7 Aug 2026`, `31 Aug-4 Sep 2026` where the week straddles two months, both months and both years where it straddles two years. That is not `fmtRange`'s shape (month-first, en dash, comma before the year), so it is its own formatter rather than a flag on that one: two callers wanting two different strings is not one formatter with an option. Pure string math on the fixed month table — no `Date`, so no timezone can shift the day. | Yes — all three shapes executed |
| **R-dl-d** | **The legend renders FROM the rule table, not beside it.** The Model Constants wording is quoted verbatim from the frame and names the SAME three rules the engine detects, so the copy on screen and the rules in `detectConflicts` cannot drift apart. Adding a fourth rule to the engine without a legend entry becomes impossible by construction. | Yes — the three rule keys asserted equal to the engine's, and the wording asserted verbatim |
| **R-dl-e** | **The week badge names the RULE AND THE CARDS** — `1 overlap • MC-05, MC-06`, not a bare count. The header carries the evidence, which is the whole reason it is a badge and not a number. One badge per rule broken, cards de-duplicated in the order the engine found them. | Yes |
| **R-dl-f** | **The two Breakdown definitions product asked us to state rather than infer.** **CONFLICTS counts CONFLICTS, not weeks in conflict** — the frame's own arithmetic settles it, since `2 conflicts` covers two weeks holding one each, broken out as one badge per rule. **NEEDS REPLOTTING counts the replot list**: the deliverables caught in an active (unacknowledged) conflict — the same list the detail rows below it enumerate, so the number and the rows can never disagree. That is BROADER than product's guess ("deliverables whose forecast breaches their deadline"), and it is the shipped meaning; raised back to product rather than changed under them. | Yes — both counts asserted against the same source the rows render from |
| **R-dl-g** | **A week the SEARCH empties is dropped; a week with NOTHING DUE keeps its place and says so.** They are different states and the frame draws the second one its own card. The week's own summary — due, urgent, load against capacity — is **not** recomputed against the search: it describes the week, and a capacity line that moved when you typed would be reporting the search rather than the load. | Yes — both states executed off the shipped computed |
| **R-dl-h** | **Search-only, by design.** The frame gives this tab a Search Field and NOT the filter + sort pair Pipeline gained in owl #62. That is a decision, not an omission — product asked which and the frame answers it. | Yes — the buttons asserted absent from this tab's markup |
| **R-dl-i** | ⚠️ **THE ACKNOWLEDGE ACTION AND THE DAY PLANNER ARE KEPT, though the frame draws neither.** Acknowledging a conflict is shipped, audited behaviour (invariant 10, invariant 13, AC-13) and this tab is its ONLY route in the whole UI; the day planner is FR-12 and writes through `writeDayPlan`. "Build without it rather than inventing one" defers the DESIGN of an acknowledged state — it cannot mean deleting the capability, which would take a shipped, tested feature off the board to match a frame product has said is deliberately partial. Both stay exactly as they shipped until the design lands, and neither is dressed up as an interpretation of this frame. | Yes — both affordances asserted present, and the ack asserted to still carry the situation-key wording |
| **R-dl-j** | **The banners are built AS DRAWN.** The alert-group and alert-container are queued for conversion to the row-level warning pattern Pipeline already ships; that conversion is deferred, so the old pattern here is deliberate and is not evidence of drift. | Yes — the banner asserted present, with the deferral recorded in the source |
| **R-dl-k** | **The card's left accent is URGENCY, not conflict.** Every card carries one — red where the card is urgent, blue where it is not — which is why it cannot double as a conflict marker: the week badge and the summary banner are where a conflict is stated, and a third voice saying it more quietly would only weaken them. | Yes |
| **R-dl-l** | **The month control stays**, though the frame does not draw it. The Breakdown says DUE THIS MONTH, so a month scope exists; removing the only way to move it — to match a frame that never showed it — would strand the tab on whatever month it loaded in. | Yes |
| **R-dl-m** | ⚠️ **STALE SAMPLE VALUES, not data.** The frame's Breakdown reads 8 / 4 / 491 / 31, and 4 / 491 / 31 are the identical values from the Requests tab's Breakdown. 491 conflicts against 8 items due this month is not a coherent board state. Nothing in the build is calibrated against those numbers. | n/a — deliberately not asserted |
| **R-dl-n** | ⚠️ **OPEN — the acknowledged states.** No acknowledge design, no acknowledged appearance, no restore, and no cue for a week that RE-SURFACED because a capacity change invalidated its acknowledgement (invariant 13). Product is designing these after seeing the tab live. Until then the v1 affordances stand (R-dl-i), and a re-surfaced week is indistinguishable from a newly broken one — which product has already noted will read as a bug. | n/a — the gap is the rule |

## Confirms answered back to product — all three answered, owl #66

1. **Do the conflict detail rows link to the week or card they name?** **No — they stay
   non-navigable.** They are evidence, not navigation. Shipped as drawn.
2. **Do week groups collapse?** **No collapse control.** The day-columns view is the more
   useful per-week action, collapse would need a second control drawn, and search narrows a
   long list faster than folding it does. The round action opens the day columns, as built.
3. **Does this tab get Pipeline's filter/sort?** No — see R-dl-h, confirmed as deliberate.

## Ratified by owl #66

- **R-dl-f** — NEEDS REPLOTTING **keeps the broad count**. It matches the rows enumerated
  beneath it, and a card displaced by an over-capacity week genuinely does need replotting
  even with no deadline problem. Do not narrow it to the deadline breach. CONFLICTS counting
  conflicts is confirmed, settled from the frame's own arithmetic rather than by asking.
- **R-dl-i** — the acknowledge action, the day planner and the month control (R-dl-l) all
  **stay**. "Build without it rather than inventing one" meant do not invent; it should not
  have put shipped, audited behaviour at risk, and this tab being the only route to
  acknowledgement in the product settles it. All three are replaced wholesale when the
  acknowledged-state design lands.
- **The "1 replotting" badge is DERIVED**, as built. It was never a separate card-level rule —
  where the sample showed it beside no rule badge, that is sample error.
- **R-dl-n stays open**: the acknowledged-state design is still with product.
