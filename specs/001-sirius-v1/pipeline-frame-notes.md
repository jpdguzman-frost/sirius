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

**Un-annotated elements** (build from visual + existing FRs): Type cell (badge, values like UI/Asset/Icon/Spot Illustration), Client cell (`@handle` badge), Work Started / Work Done cells (row 1 renders Work Started in Date-Picker chrome — no annotation; **treat as read-only display per FR-4.5**, cycle fields derive from Trello activity), table header, horizontal scroll slider (custom, chevrons + thumb).

## Drift register (frame ↔ decided state) — for the product team

1. Due cell annotation carries v1.1 §4.2 (local override) — v1.2 + errata already corrected this; annotation needs the same fix.
2. Urgency annotations say "the only write" — registry has two.
3. User chip: "sign out clears imported data" — prototype-era.
4. Tab group: five tabs; v1.2 says six (Admin).
5. Project selector's rendered label uses the `Semantic/Button` token → **Inter 13.9px**, off-system vs §0 (Google Sans Flex only) — normalising to `--text-body`/600 Google Sans Flex unless the team objects.

## Open item — Difficulty editability (JP decision pending)

The frame's own annotations say difficulty is **read-only, never an input** (169:26426 and the Callout), agreeing with FR-4.3 and invariant 2. JP's 2026-08-12 instruction said "you can change difficulty" — which would be write-registry entry **W3** (Trello `Difficulty: …` label swap): constitution amendment (MAJOR), `trello-write.md` entry, FR update, and the product team's own governance rule says stop-and-raise. **Held pending JP: follow the annotation (read-only) or open the amendment.** Building read-only does not block anything — the write can be added later without rework (the badge is already a component).

## Build mechanics

- Tokens: extracted variable set (slate/red/amber/blue/green scales, text/caption 10 · label 12 · body 14 · title 24 · display 32, radius/xs 2 · sm 4, space/4 · 8 · 24, Shadow/xs) → CSS custom properties, names preserved (`--slate-50`, `--text-body`, `--radius-sm`…).
- Font: **Google Sans Flex via Google Fonts CDN** (JP call, verified available 400–700): `fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..700`.
- Icons/assets: MCP export URLs expire in 7 days — download the needed SVGs (tab icons, chevrons, search, calendar, warning, Trello/Figma marks) into `frontend/assets/` at build time and inline/reference locally.
- Scope: THIS frame only (Pipeline tab + shell it carries: top nav, breadcrumb, tabs, metric strip). Other tabs keep the current design until their frames arrive; the shell restyle applies app-wide by construction.
- 1:1 target at 1600px per build spec §0; wire to live data (the frame's demo content — MC-05, Demo User, counts — is placeholder).
