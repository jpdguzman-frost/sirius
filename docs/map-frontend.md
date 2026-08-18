# MAP — frontend area (Layer 2)

_One line per frontend source file — Layer 2, loaded when working the frontend; the Layer-0 index is docs/MAP.md. Regenerate: `npx tsx scripts/generate-index.ts` (`--check` exits 1 on drift)._
_last-verified: 2026-08-18_

<!-- GEN:MODULES -->
- `frontend/build.js` — injects styles/templates/scripts at index.html markers; parse-checks every Ractive template.
- `frontend/index.html` — the shell build.js injects into (Google Sans Flex + Ractive CDN + the three inject markers).
- `frontend/scripts/00-api.js` — fetch helper; BASE from window.SIRIUS_BASE; 401 → redirect to sign-in (returnTo preserved).
- `frontend/scripts/00-icons.js` — inlined SVG icon set (ICONS).
- `frontend/scripts/00-router.js` — PURE routing half (path ⇄ {project, tab}); ROUTE_TABS mirrored from src/routing/paths.ts.
- `frontend/scripts/01-app.js` — everything else, one Ractive instance (2.9k lines): constants (WEEK_COUNT/WEEK_PX, capacity bands, segments); Requests columns/sorting; app ~l.426 with computeds; gantt geometry ~l.1101 (workday x-axis, phaseRun/ghostBar); warning hover card; capacity footer; data loading ~l.1620; app.on ~l.2017 (tabs, filters, notes, admin, menus, drag, suggest, sprints modal, daily plotting); arrival affordance; impure routing.
- `frontend/styles/00-base.css` — legacy aliases onto tokens.
- `frontend/styles/05-tokens.css` — Figma tokens (raw hex = defect).
- `frontend/styles/10-ui.css` — legacy recipes for unmigrated tabs.
- `frontend/styles/20-pipeline.css` — shell nav + Pipeline.
- `frontend/styles/25-requests.css` — Requests v2.
- `frontend/styles/30-planner.css` — schedules toolbar.
- `frontend/styles/35-gantt.css` — planner body (pinned left block, --gw columns).
- `frontend/templates/00-app.html` — ONE Ractive template; per-tab branches (schedules the biggest: gantt + modals).
<!-- /GEN:MODULES -->
