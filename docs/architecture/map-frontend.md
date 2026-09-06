# MAP — frontend area (Layer 2)

_One line per frontend source file — Layer 2, loaded when working the frontend; the Layer-0 index is docs/MAP.md. Regenerate: `npx tsx scripts/generate-index.ts` (`--check` exits 1 on drift)._
_last-verified: 2026-08-18_

<!-- GEN:MODULES -->
- `frontend/build.js` — injects styles/templates/scripts at index.html markers; parse-checks every Ractive template.
- `frontend/index.html` — the shell build.js injects into (Google Sans Flex + Ractive CDN + the three inject markers).
- `frontend/scripts/00-api.js` — fetch helper; BASE from window.SIRIUS_BASE; 401 → redirect to sign-in (returnTo preserved).
- `frontend/scripts/00-icons.js` — inlined SVG icon set (ICONS).
- `frontend/scripts/00-router.js` — PURE routing half (path ⇄ {project, tab}); ROUTE_TABS mirrored from src/routing/paths.ts.
- `frontend/scripts/10-constants-core.js` — capacity fallbacks, planner geometry (WEEK_COUNT/WEEK_PX), Requests constants, STATUS_FILED/clarified/REQUEST_SEGMENTS/noteText, WARN_*/rowWarning, isoOf/todayIso, fmtLongIso.
- `frontend/scripts/11-constants-deadlines.js` — Deadlines month/week tables and helpers: DL_MONTHS/DL_DAY_NAMES through dlBuild, monthShort/monthOrder.
- `frontend/scripts/12-constants-pipeline.js` — Pipeline sort/filter: DIFF_RANK/PIPE_* machinery (mcRank is consumed from 20-requests-table.js) and the add-work search helpers addLabel/addTokens/addMatches.
- `frontend/scripts/20-requests-table.js` — Requests filter/sort recipe (owl #77 §1–4, block 5): REQ_FILTERS (six axes, per-value facets via reqFacetList/reqMatches), REQ_SORTS + REQ_SORT_DEFAULT (Recently requested = sheet row desc) with reqSortRows, REQ_COLS/reqColLabel (the header-label guard's source), reqChipList (one chip per value), reqStatusOf; mcRank is consumed by 12-constants-pipeline.js.
- `frontend/scripts/30-dates.js` — Manila clock (MANILA_DAY/TIME, manilaToday, fmtInstant), ISO calendar arithmetic (isoAddDays…mondayIso), sprint week helpers (sprintPayload, fridayIso, workingDaysBetween, mondaysBetween).
- `frontend/scripts/40-app-state.js` — initialRoute capture + THE `app = new Ractive({...})` — every data key and computed (tabLabel…sprintDirty); one statement, indivisible.
- `frontend/scripts/50-gantt-geometry.js` — workday x-axis: TOTAL_UNITS, dayIndex, clampUnits, pctOf/unitPct, weekAtX, phaseRun + app.set of phaseRun/deadlineTick/ghostBar/sprintLength.
- `frontend/scripts/60-overlays.js` — search highlighter; the five-overlay system: OVERLAY_KEYS/NO_OVERLAYS, closeMenus, the four document dismissers, placeBox/openOverlay/placeMeasured, showWarnPop (the warning hover card).
- `frontend/scripts/70-measure.js` — patchRow + banner chrome (errText, flashBanner), scroll-thumb machinery, refreshClips sweep, the shared `remeasure` rAF seam, capacity footer (weekTotal/footText/footCls).
- `frontend/scripts/80-loaders.js` — data loading + writes: loadShell/loadAdmin/loadAll, writeDeadline, serialized writeCapacity queue, requestBlob/blobRequests, pager observers; the Deadlines month day (dlToday) is refreshed here.
- `frontend/scripts/90-events.js` — interaction layer: selectTab, resetForProjectSwitch, applyRequestFilter, ONE indivisible `app.on({...})` handler map (tabs, filters, notes, admin, menus, the due popover, sprints modal, the Deadlines month + lane expand), patchUrl/bumpWeek/moveRows, announceArrival (the arrival affordance).
- `frontend/scripts/95-routing.js` — IMPURE routing half: withRouterSuppressed, normalizeUrl, pushState observer, popstate listener, the file-final loadShell() boot call (must stay last in load order).
- `frontend/styles/00-base.css` — legacy aliases onto tokens.
- `frontend/styles/05-tokens.css` — Figma tokens (raw hex = defect).
- `frontend/styles/10-ui.css` — legacy recipes for unmigrated tabs.
- `frontend/styles/20-pipeline.css` — shell nav + Pipeline.
- `frontend/styles/25-requests.css` — Requests: the .reqtools toolbar row, the viewport-capped filter panel, the .reqfoot footer + pager recipe (28×32 buttons, 32×32 bordered active page), column widths incl. col-runit.
- `frontend/styles/30-planner.css` — schedules toolbar.
- `frontend/styles/35-gantt.css` — planner body (pinned left block, --gw columns).
- `frontend/styles/40-deadlines.css` — Deadlines on the work-card unit (owls #74/#75): the month navigator, the week lanes (collapsed / expanded with five day columns) and the one horizontal scroller, the fixed 308×180 card with the badge recipe, the SVG quote bar and the done-card opacity, the dashed empty card. No table recipes — this tab has no column table.
- `frontend/templates/layout.html` — the tpl-app script wrapper, icon sprite, shell nav + tabbar, banner, the `<main>` panel; carries the partials and views markers build.js fills.
- `frontend/templates/partials/00-req-sync-strip.html` — reqSyncStrip: the read-only-from-Trello sentence, used by the Requests populated view and its empty state.
- `frontend/templates/partials/10-due-calendar.html` — dueCalendar: month nav, day-of-week strip, day grid, shortcuts; shared by both due popovers (root state only).
- `frontend/templates/partials/20-deadline-card.html` — the Deadlines card partial (owl #74, node 810:122333): urgent quote bar as the frame's path, the four badge kinds, the three-line title, the links row; registered top-level like dueCalendar.
- `frontend/templates/partials/20-filter-group.html` — ONE filter group (heading + its checkbox rows), read as a context so BOTH the Filter button's panel and a chip's hover panel render the same row. It was typed twice and had already drifted on the group's accessible name.
- `frontend/templates/partials/30-no-results.html` — noResults: the ONE no-results block (headline + subline) both Pipeline and Requests render when a search or filter empties the table (owl #77 §3) — one partial, so the copy cannot drift between tabs.
- `frontend/templates/views/20-requests.html` — Requests tab: stat tiles (they drive the STATUS axis), the .reqtools toolbar (search + Pipeline's filter/sort buttons and panels), per-value chips, plain-header table, the .reqfoot pagination footer, the shared noResults partial, rejects.
- `frontend/templates/views/30-pipeline.html` — Pipeline tab: KPI metrics, search, the MC table and its expanded row.
- `frontend/templates/views/40-schedules.html` — Schedules tab: planner toolbar, the gantt, and the modals (the biggest view).
- `frontend/templates/views/50-deadlines.html` — Deadlines tab: the month navigator and the week lanes over the schedule's own rows; read-only, nothing writes from here.
- `frontend/templates/views/70-admin.html` — Admin tab: the allow-list table.
<!-- /GEN:MODULES -->
