# Pipeline frame — annotation extraction & build notes

**Source:** Figma `Frost-Sirius--Working-File` (abDRsIVDs1XjJKeR8xYOoF), frame `Pipeline/Default` (17:1015, 1600×1201), extracted 2026-08-12 via Figma MCP.
**Authority order (JP 2026-08-12):** frame annotations govern the Pipeline rebuild; where an annotation is stale against decided governance (marked ⚠ below), the constitution/v1.2 build spec wins and the drift goes back to the product team.

## Annotations, verbatim by component

| Node | Component | Category | Content (condensed) |
|---|---|---|---|
| 17:1438 | TopNav | Design | 1600×186, white bg; two 45px rows (breadcrumb+controls / tabs), 32px gap, 40px top pad; content 1472 wide, 64px inset |
| ↳ 19:920 | Breadcrumb | Design | `Frost: Sirius › {tab}` · `--text-title` 24/600 `--surface-foreground` · 22px chevron · `<nav aria-label="Breadcrumb">`, `aria-current="page"` |
| ↳ 19:927 | Project selector | Functionality | Bound to projects; switch swaps entire context; board id external link under `PROJECT` label; **board AND `trello_label`** rule; done-when: switch empties/restores |
| ↳ 19:940 | Last Synced | Functionality | `--text-caption` 400 muted; locale time; updates on successful sync |
| ↳ 19:941 | User chip | Functionality | Four auth checks; 28px initial avatar (foreground bg); name + Sign out; slate-50 box, 1px border, radius-md. ⚠ "Sign out clears imported data" is prototype-era — v1.2 corrected: server-side data, sign-out clears nothing |
| ↳ 19:947 | Tab group | Design | **Five tabs** icon+label; active = foreground text + 2px foreground underline; inactive = muted + `--border-border` underline; divider extends right; `--text-body` 600. ⚠ v1.2 says SIX (Admin, admin-only) — keep Admin in production, styled to match |
| ↳ 19:948/949 | Tab states | Interaction | `role="tab"`, `aria-selected`, `tabIndex=0`; hover darkens inactive text |
| 28:3666 | Metric strip | Functionality ×4 | MAIN CARDS (deliverables; done-when 269+209+20=498 on the verified board) · WORK CARDS (attach to MC group, never a parent link) · OPEN WORK (incomplete-field count, mirrors the §4.4 panel; "clicking could scroll to/filter panel" — optional) · URGENT (red, `Urgent`-label count) |
| 70:1358 | Alert Banner | Design + Func | §4.4 panel: amber-50 bg, amber-300 border, radius-md; row = `Row N` chip + bold MC + name + amber reason + right-aligned Open Card (new tab); consequence copy beneath; hide entirely when empty; count feeds OPEN WORK |
| 17:2057 | Search | Functionality | Placeholder "Search cards or MC#"; case-insensitive substring over MC #, name, type, client, status…; matches wrapped in `<mark>` amber; realtime filter |
| 70:1211 | Callout | Functionality | "Difficulty and Current List are read from Trello — can't be edited here" (dashed slate-50 box). **"Simulate Trello sync" button is dev-only — not in production** |
| 70:10024 | Row | Interaction | Expandable; chevron toggles the MC group's task cards; sub-id `MC-655.3` display; row focusable, **Enter toggles expand** (WCAG) |
| 169:26426 | Difficulty cell | Functionality | **"Read-only from Trello (§4.1). Render as coloured badge, never an input."** Missing difficulty → incomplete panel. (The chevron inside the badge is Badge-component chrome, not a select) |
| 169:26364 | Urgency (urgent) | Interaction | The write: optimistic then reconciled, restore+surface error on failure; urgent = destructive-light bg / destructive-strong text / red-300 border / ⚡; **saving state: opacity .5, label "saving…", pointer-events none** |
| 169:26074 | Urgency (non-urgent + menu) | Interaction | Click toggles urgent; creates label on board once; non-urgent = secondary bg, muted text, **dashed** slate-300 border. Open state renders a Select Group (white, slate-200 border, radius-sm, Shadow/xs; "Urgency" caption header; dot-indicator items) |
| 70:10030 | Status cell | Functionality | Trello list name **verbatim**, keyword-classified: pending warning-light / ongoing blue-100 / done emerald-100 |
| 251:7925 | Due cell | Interaction | Editable here; click opens date input with Set and clear. ⚠ Annotation still reads v1.1 ("precedence manual → Trello → sheet", dashed local override) — **superseded**: v1.2 §4.2 + errata confirm the edit WRITES the Trello due date (W2), no local layer. Implement write-through in the Date-Picker chrome shown |
| 70:10037 | Links cell | Functionality | Trello/Figma source icons, open new tab, never editable inline; missing Figma → incomplete panel |

## Rex verification pass (plugin-context sweep, 2026-08-12) — 32 total, 8 the MCP missed

Full-tree walk via Rex confirmed every MCP-extracted annotation **verbatim** and surfaced 8 more (mostly frame/container-level, dropped by the MCP's sparse-response mode):

| Node | Component | Category | Content (condensed) |
|---|---|---|---|
| 17:1015 | Pipeline/Default (frame) | Design | Full page 1600×1201; Top + Content sections; **success criterion: 1:1 at 1600px, all values bind to ARES variables** |
| 70:10522 | Top | Design | Shell header 1600×268 flex column: TopNav 186 + Stats 82; 64px inset (content 1472); `--font-sans` Google Sans Flex (annotation says self-hosted — **JP overrode: Google Fonts CDN**); raw hex/px is a defect; done-when: diff to zero at 1600px |
| 28:3683 | stats-container | Design | 82px row, four equal 368px columns (1472÷4), no gap, shared 1px `--border-border`; overline `--text-label` 600, value `--text-display` 600, 8px apart |
| 17:2063 | Content | Design | Stack: incomplete panel (conditional) → search 54px → callout 53px → table + scroll bar; 24px gaps |
| 70:10008 | Table | Functionality | §4.1: rows = deliverables (`Main Card`); expand reveals the MC group's tasks; identity `(project_id, trello_card_id)`; done-when 269+209+20=498 |
| 70:10009 | Header | Design | 56px, `--slate-100` bg; **definitive column order: MC #, Card Name, Type, Difficulty, Urgency, Status, Client, Due, Work Started, Work Done, Cycle Time, Weeks, Links**; header `--text-label` 600 uppercase muted; 1px `--slate-100` row separators, no vertical rules; horizontal scroll below min width |
| 251:23859 | Due (missing/overdue) | Design | Missing: outlined red "none" pill or amber warning border on the picker; format `17 Jan 2026`; tooltip names the source; overdue tints `--status-warning` |
| 251:6758 | horizontal-slider | Interaction | Custom scroll bar: track `--slate-300`, thumb on `--slate-100` container, chevron nudge buttons; **below 1600px the table scrolls horizontally — never column collapse** |

**Un-annotated elements** (build from visual + existing FRs): Type cell (badge — UI/Asset/Icon/Spot Illustration), Client cell (`@handle` badge), MC/Card-Name cells, Work Started / Work Done / Cycle Time / Weeks cells (Work Started renders in Date-Picker chrome but carries no annotation — **read-only display per FR-4.5**, cycle fields derive from Trello activity; Weeks = slotted-week display).

**Team corrections after build (2026-08-12, via JP):** content-stack gap is 16px with 0-margin elements (frame geometry confirms; the Content annotation's "24px" is the container's top padding only) · column labels **Started** / **Done** (renamed from Work Started / Work Done in the header annotation) · Card Name flexes to fill remaining width · scroll bar only when the table overflows · **Cycle Time + Weeks columns removed, Links 94px, header 44px** (frame re-measured after their edit) · **read-only callout strip removed** (simplification; the read-only rule survives in the difficulty tooltip — annotation 70:1211 superseded).

## Batch-2 cell specs (2026-08-13, owl #06–#10; Rex-verified 1:1 against the owls)

Five nodes: `415:54979` Due popover · `431:17015` start-date-cell · `431:17016` done-date-cell ·
`431:17017` Links · `432:17733` mc-cell (DATA FIX). All built 2026-08-13 (tasks T113–T115).
Decisions folded in: **per-card Started/Done** (the row card's own transitions — supersedes the
phase-13 group-derived assumption; JP "proceed as defined from Miles"); done = latest entry into
done, held only while the card sits there (our rule, told to product); **MC# decimal ruling**
(JP): the table shows the bare MC number, `display_id` survives internally, in search, and on
every other surface; commit-on-Apply on the Due popover; links off-state truly disabled at 30%.
Read-only Due field (observation mode) says "No Due Date" rather than "Select Date" — it is not
a selectable field there.

## Drift register (frame ↔ decided state) — for the product team

1. Due cell annotation carries v1.1 §4.2 (local override) — v1.2 + errata already corrected this; annotation needs the same fix.
2. Urgency annotations say "the only write" — registry has two.
3. User chip: "sign out clears imported data" — prototype-era.
4. Tab group: five tabs; v1.2 says six (Admin).
5. Project selector's rendered label uses the `Semantic/Button` token → **Inter 13.9px**, off-system vs §0 (Google Sans Flex only) — normalising to `--text-body`/600 Google Sans Flex unless the team objects.
6. **Due popover annotation (415:54979 Functionality) states display precedence backwards** — "deadlines-first: intake sheet then Trello". The constitution (invariant 14) and BRD BR-note say a Trello due date, where present, WINS (set deliberately), else sheet. The write-target description (Trello only) is correct. Flagged to Miles 2026-08-13; annotation needs the fix.
7. mc-cell frame (432:17733) draws the MC# column at 132px — superseded by JP's 150px fine-tune (2026-08-12 team correction).

## Difficulty editability — RESOLVED 2026-08-12 (W3 approved and built)

The frame's read-only annotations (169:26426 and the Callout) were the stale state: product
approved the difficulty writeback the same day (Miles, BRD-§9-A1, owl #01–#03) and appended an
**APPROVED** annotation to cell `415:54974` (parent frame `415:18672` Pipeline/Default/v.1.3,
verified); the stale GOVERNANCE BLOCKER note is theirs to clear. JP authorized the amendment
(constitution 4.1.0, write registry W3 — `contracts/trello-write.md`), and the dropdown is
built per Miles's #01 spec: badge-chip trigger + select panel (white, `--slate-200` border,
head + Easy/Medium/Hard with value dots), phase-13 `d-*` color recipes retained — Hard =
red-50/red-500, exactly the spec's `#fef2f2`/`#ef4444`; **Easy/Medium tokens supplied and applied** (Miles, owl #04:
Easy green-50 `#f0fdf4` / green-500 `#22c55e`, Medium amber-50 `#fffbeb` / amber-500
`#f59e0b` — 50 fill, 500 stroke+text, same shape as Hard). Write mechanics **confirmed label
swap** (owl #04, not a custom field); we keep add-first ordering over product's remove-first
suggestion — same last-known-good display guarantee, safer worst case (see
`contracts/trello-write.md` W3). Rows with no difficulty render a dashed unset chip and are settable (the
missing-difficulty fix path). On projects with `writes_enabled: false` (rt-837 observation
mode) the dropdown is disabled with the read-only tooltip.

## Batch 5 — the incomplete-card panel becomes a row state (owl #36, 2026-08-17)

Nodes: `537:69131` (warned row) and `537:69135` (popover); dark variant
`528:112097` noted but not built. The `70:1358` Alert Banner above (§4.4 panel)
is **deleted** — the three conditions it covered now speak on the row that owns
them, and the aggregate signal is the OPEN WORK metric (`28:3666`), which still
counts `corrections` off the same payload.

**Migration completeness — the answer owed to Miles (#36 item 1).** The Pipeline
tab had exactly ONE top-of-table notice: the incomplete-card panel, covering
missing **difficulty label** · missing **due date** · missing **Figma
attachment**, all three derived read-only from the ARES read. Everything else
already lives on the row (the 🛑 blocker badge) or is an app-level flash strip
(sync error / load failure / write rollback), which is not a table banner and
stays. So the row state expresses three conditions, one variable label covers
all three today, and the popover carries one list-item per missing field.

**Search interaction, stated deliberately:** a warned row the search hides stays
hidden. No special case — which is exactly why the OPEN WORK KPI keeps carrying
the total.

| ID | Ruling | Shipped |
|---|---|---|
| **R-warn-a** | The frame draws the amber-300 as a "stroke" around the row and grows the row to **113px** in a **280px** card-name column. Built as a **3px LEFT accent** (`box-shadow: inset 3px 0 0 0 var(--amber-300)` on the first cell) over an amber-50 fill, with the table's own geometry left alone. `.ptable .col-name` is fluid (`width: auto`, `min-width: 158px`) and row height is content-derived from the 16px cell padding — hardcoding either frame number would break the table. **Divergence recorded, asked of Miles.** | Yes — accent declared exactly once, asserted; a render test proves neither frame number was pinned |
| **R-warn-b** | The Figma-attachment rationale is **new copy**: *"Without the Figma attachment the deliverable cannot be opened from the plan."* The other two are the deleted banner's own wording, carried over verbatim. All three live in ONE constant keyed by the server's `missing` tokens. **Proposed, asked of Miles.** | Yes — the probe reads the tokens off a real incomplete card and asserts every one has a non-empty rationale, so a server token the map does not know can never render blank unnoticed |
| **R-warn-c** | The label is a **variable string** (`WARN_LABEL`, "Needs Info" today) in all three places it appears — the row message, its accessible name, and the popover title. Never a literal at a render site. | Yes — a test asserts the template contains no literal `Needs Info` |
| **R-warn-d** | The **message** is the click target, not the row: a real `<button>` with `aria-haspopup="dialog"`, `aria-expanded` and an accessible name of label + MC# + deliverable. The `.warn` class is presentation only and **no control is disabled** by the warning state. | Yes — a render test compares the `disabled` count of a warned row against a clean one |
| **R-warn-e** | The popover **joins the existing fixed-box recipe** (`.selectmenu, .duepop, .warnpop`) rather than forking it; the annotation's `#f1f5f9` stroke is the single forked value. There is **no dark popover recipe in this codebase** to share a base with — the brief's "already in use on Sprint Schedules" is a Figma statement, not a code one. | Yes — asserted as one selector group |
| **R-warn-f** | **Focus return** did not exist on any of the four pre-existing overlays. Added **once**, in the shared close path: a module-scope `overlayTrigger` captured in `openOverlay` and replayed by `closeMenus()`. It fires on Escape (`{ restoreFocus: true }`) and on **any** dismissal that unmounts the element currently holding focus — a scroll or trackpad nudge while the user is tabbed onto `Open Card` would otherwise drop them at `<body>`. Outside-click still does not restore (it would steal focus from whatever was clicked) and the toggle-off re-click does not need to (focus is already there). | Yes — one mechanism now serving all five overlays, not a per-caller fix |
| **R-warn-h** | The popover's height is **data-derived** — one wrapping list-item per missing field, ~202px for one problem and ~346px for all three — so `WARN_POP_H` can only ever be a pre-measure for the first flip decision, exactly as `REQ_MENU_H` is the Requests select's cap. `openWarnPop` therefore **measures the rendered box and places it a second time**, through the same `placeBox`; the Requests select's `placeReqMenu` was generalised to `placeMeasured(trigger, id, {key, posKey, sel})` so both share one recipe. Without it a three-problem card opened low in the table ran ~70–80px off the bottom of a 900px viewport, putting the separator and `Open Card` out of reach — `.warnpop` deliberately has no `max-height`/`overflow-y` (it must stay out of the scroll dismisser's self-scroll exemption, which only `.duepop`/`.selectmenu` hold). | Yes — the live-browser pass (T145) is the only place a real `offsetHeight` exists |
| **R-warn-g** | A **blocked + warned** row keeps the red blocker fill. `.ptable tr.prow.warn > td` (0,3,2) outranks the pre-existing `.ptable tr.blocked td` (0,2,2), so the amber would have silently demoted the stronger signal; one added rule restores it and the amber left accent still draws, so the row reads "blocked, and also incomplete". Not specified anywhere — **flagged to Miles**, and one line to revert if amber should win. | Yes |

**Unresolved measurement:** the frame's `content › subtone-offset` gap between
the card name and the message carries no px value. Built at **6px** (matching
the popover's first-list-item gap). Recorded rather than ruled.

## Build mechanics

- Tokens: extracted variable set (slate/red/amber/blue/green scales, text/caption 10 · label 12 · body 14 · title 24 · display 32, radius/xs 2 · sm 4, space/4 · 8 · 24, Shadow/xs) → CSS custom properties, names preserved (`--slate-50`, `--text-body`, `--radius-sm`…).
- Font: **Google Sans Flex via Google Fonts CDN** (JP call, verified available 400–700): `fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..700`.
- Icons/assets: MCP export URLs expire in 7 days — download the needed SVGs (tab icons, chevrons, search, calendar, warning, Trello/Figma marks) into `frontend/assets/` at build time and inline/reference locally.
- Scope: THIS frame only (Pipeline tab + shell it carries: top nav, breadcrumb, tabs, metric strip). Other tabs keep the current design until their frames arrive; the shell restyle applies app-wide by construction.
- 1:1 target at 1600px per build spec §0; wire to live data (the frame's demo content — MC-05, Demo User, counts — is placeholder).
