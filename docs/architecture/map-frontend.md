# MAP — frontend area (Layer 2)

_One line per frontend source file — Layer 2, loaded when working the frontend; the Layer-0 index is docs/MAP.md. Regenerate: `npx tsx scripts/generate-index.ts` (`--check` exits 1 on drift)._
_last-verified: 2026-08-18_

<!-- GEN:MODULES -->
- `frontend/build.js` — injects styles/templates/scripts at index.html markers; parse-checks every Ractive template.
- `frontend/index.html` — the shell build.js injects into (Google Sans Flex + Ractive CDN + the three inject markers).
- `frontend/scripts/00-api.js` — fetch helper; BASE from window.SIRIUS_BASE; 401 → redirect to sign-in (returnTo preserved).
- `frontend/scripts/00-icons.js` — inlined SVG icon set (ICONS).
- `frontend/scripts/00-router.js` — PURE routing half (path ⇄ {project, tab}); ROUTE_TABS mirrored from src/routing/paths.ts.
- `frontend/scripts/10-constants.js` — module constants + one-per-app recipes: capacity bands, planner geometry (WEEK_COUNT/WEEK_PX), STATUS_FILED/clarified/REQUEST_SEGMENTS/noteText, WARN_*/rowWarning, isoOf/todayIso, month tables + pure-string date formatters (fmtLongIso…monthShort).
- `frontend/scripts/20-requests-table.js` — Requests sort/filter machinery: shared comparators, REQ_FILTERS, mcRank, REQ_COLS/REQ_SORT_COLS, reqComparator.
- `frontend/scripts/30-dates.js` — Manila clock (MANILA_DAY/TIME, manilaToday, fmtInstant), ISO calendar arithmetic (isoAddDays…mondayIso), sprint week helpers (sprintPayload, fridayIso, workingDaysBetween, mondaysBetween).
- `frontend/scripts/40-app-state.js` — initialRoute capture + THE `app = new Ractive({...})` — every data key and computed (tabLabel…sprintDirty); one statement, indivisible.
- `frontend/scripts/50-gantt-geometry.js` — workday x-axis: TOTAL_UNITS, dayIndex, clampUnits, pctOf/unitPct, weekAtX, phaseRun + app.set of phaseRun/deadlineTick/ghostBar/sprintLength.
- `frontend/scripts/60-overlays.js` — rowLoad + search highlighter; the five-overlay system: OVERLAY_KEYS/NO_OVERLAYS, closeMenus, the four document dismissers, placeBox/openOverlay/placeMeasured, showWarnPop (the warning hover card).
- `frontend/scripts/70-measure.js` — patchRow + banner chrome (errText, flashBanner), scroll-thumb machinery, refreshClips sweep, the shared `remeasure` rAF seam, capacity footer (weekTotal/footText/footCls).
- `frontend/scripts/80-loaders.js` — data loading + writes: loadShell/loadAdmin/loadAll, writeDeadline, serialized writeCapacity queue, requestBlob/blobRequests, pager observers, computeDeadlines, dayCols, writeDayPlan.
- `frontend/scripts/90-events.js` — interaction layer: selectTab, resetForProjectSwitch, applyRequestFilter, ONE indivisible `app.on({...})` handler map (tabs, filters, notes, admin, menus, drag, suggest, sprints modal, daily plotting), patchUrl/bumpWeek/moveRows, announceArrival (the arrival affordance).
- `frontend/scripts/95-routing.js` — IMPURE routing half: withRouterSuppressed, normalizeUrl, pushState observer, popstate listener, the file-final loadShell() boot call (must stay last in load order).
- `frontend/styles/00-base.css` — legacy aliases onto tokens.
- `frontend/styles/05-tokens.css` — Figma tokens (raw hex = defect).
- `frontend/styles/10-ui.css` — legacy recipes for unmigrated tabs.
- `frontend/styles/20-pipeline.css` — shell nav + Pipeline.
- `frontend/styles/25-requests.css` — Requests v2.
- `frontend/styles/30-planner.css` — schedules toolbar.
- `frontend/styles/35-gantt.css` — planner body (pinned left block, --gw columns).
- `frontend/styles/40-deadlines.css` — Deadlines tab v2 (owl #64): the week columns and their horizontal scroller, the deadline card and its two dates, the alert-group banners (built as drawn, conversion to the row-warning pattern deferred) and the Model Constants legend. No table recipes — this tab has no column table.
- `frontend/styles/45-forecast.css` — Forecast tab: the two-tier 25-column table, the measured-delivery banner, the review-SLA field, Model Constants. Numbered after 20-pipeline.css so its `.fctable` overrides beat the shared `.ptable` recipe honestly.
- `frontend/templates/layout.html` — the tpl-app script wrapper, icon sprite, shell nav + tabbar, banner, the `<main>` panel; carries the partials and views markers build.js fills.
- `frontend/templates/partials/00-req-sync-strip.html` — reqSyncStrip: the read-only-from-Trello sentence, used by the Requests populated view and its empty state.
- `frontend/templates/partials/10-due-calendar.html` — dueCalendar: month nav, day-of-week strip, day grid, shortcuts; shared by both due popovers (root state only).
- `frontend/templates/partials/20-filter-group.html` — ONE filter group (heading + its checkbox rows), read as a context so BOTH the Filter button's panel and a chip's hover panel render the same row. It was typed twice and had already drifted on the group's accessible name.
- `frontend/templates/views/20-requests.html` — Requests tab: filters, table, pager, rejects.
- `frontend/templates/views/30-pipeline.html` — Pipeline tab: KPI metrics, search, the MC table and its expanded row.
- `frontend/templates/views/40-schedules.html` — Schedules tab: planner toolbar, the gantt, and the modals (the biggest view).
- `frontend/templates/views/50-deadlines.html` — Deadlines tab: month calendar, reference only.
- `frontend/templates/views/60-forecast.html` — Forecast tab: model provenance panel and the per-phase table.
- `frontend/templates/views/70-admin.html` — Admin tab: the allow-list table.
<!-- /GEN:MODULES -->
