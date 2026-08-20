/**
 * ESLint flat config (ARES convention: surface real bugs, Prettier owns
 * formatting). TypeScript files are typechecked by tsc; eslint covers JS.
 */

import js from '@eslint/js';
import globals from 'globals';

// Names defined in one frontend script and used in another (build.js
// concatenates them into one <script>). Drives both the eslint globals map
// and the unused-vars ignore pattern below — one list, two derivations.
const FRONTEND_SHARED = [
  'alphaSort',
  'api', 'fmtDate', 'mondayShift', 'ICONS', 'ICON_SPRITE',
  'BASE', 'parseRoute', 'buildPath', 'ROUTE_TABS', 'ROUTE_DEFAULT_TAB',
  // The former 01-app.js, split into ten files (context restructure stage 5,
  // 2026-08-18): everything below is defined in one of those pieces and read
  // in a later one. Same shared-<script> scope as above.
  'app', 'blobRequests', 'CAP_MAX_FALLBACK', 'CAP_MIN_FALLBACK', 'capacityBand', 'clarified',
  'closeMenus', 'computeDeadlines', 'DUE_POP_H', 'DUE_POP_W', 'errText', 'findWorkCard', 'flashBanner',
  'fmtInstant', 'fmtLongIso', 'fmtMonthDay', 'fmtRange', 'fridayIso', 'HARD_CEILING',
  'HARD_IDEAL', 'initialRoute', 'isoAddDays', 'isoNextMonday', 'isoOf', 'itemCount',
  'loadAdmin', 'loadAll', 'loadShell', 'MANILA_TIME', 'manilaToday', 'mcRank',
  'mondayIso', 'mondaysBetween', 'monthOf', 'monthOrder', 'MONTHS_LONG', 'MONTHS_SHORT', 'OVERLAY_EDGE',
  'monthShiftYm', 'monthShort', 'normalizeUrl', 'noteText', 'NUDGE_PX', 'openOverlay', 'openMeasured', 'OVERLAY_SHIELDS', 'OVERLAY_SHIELD', 'OVERLAY_SELF_SCROLL',
  'PIPE_FILTERS', 'PIPE_FILTERS_EMPTY', 'PIPE_SORTS', 'PIPE_SORT_DEFAULT', 'pipeCompare', 'pipeSortRows',
  'PIPE_MENU_W', 'PIPE_SORT_H', 'PIPE_FILTER_H', 'pipeBackToTop',
  'pipeMatches', 'pipeEmpty', 'pipePick', 'pipeFacetList', 'pipeSortLabel',
  'DL_RULES', 'dlRule', 'dlRuleWord', 'fmtWeekRange', 'fmtDayMonth', 'fmtDeadlineShort',
  'NO_OVERLAYS', 'patchRow', 'placeMeasured', 'PUSH_LIVE_MS', 'remeasure', 'REQ_COLS', 'REQ_FILTERS',
  'REQ_MENU_H', 'REQ_MENU_W', 'REQ_PAGE_SIZE', 'reqComparator', 'reqFilterKeys', 'reqFiltersCleared',
  'REQUEST_SEGMENTS', 'requestBlob', 'resetForProjectSwitch', 'rowLoad', 'rowWarning', 'scrollerOf',
  'selectTab', 'showWarnPop', 'sprintPayload', 'STATUS_FILED', 'thumbKeyOf', 'todayIso',
  'unranked', 'updateThumb', 'WARN_CLOSE_MS', 'WARN_POP_H', 'WARN_POP_W', 'WARN_SHADOW_BLEED', 'warnPopCancelClose',
  'WEEK_COUNT', 'WEEK_PX', 'weekAtX', 'withRouterSuppressed', 'WORKDAYS_PER_WEEK', 'workingDaysBetween',
  'writeCapacity', 'writeDayPlan', 'writeDeadline',
];

// Shared names ASSIGNED outside their defining file (60-overlays.js declares
// them, 90-events.js writes them) — 'writable' so no-global-assign stays
// meaningful for everything in the readonly list above.
const FRONTEND_SHARED_MUTABLE = ['overlayTrigger', 'warnCloseTimer'];

export default [
  {
    ignores: ['node_modules/', 'public/', 'coverage/', 'docs/', '.specify/', '.claude/', '**/*.ts'],
  },

  js.configs.recommended,

  // --- Backend / build scripts (ESM, Node) ---
  {
    files: ['server.js', 'worker/**/*.js', 'frontend/build.js', 'scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // --- Frontend scripts (browser; build.js concatenates them into ONE
  // <script>, so top-level consts in 00-api.js are shared scope) ---
  // One list drives both the globals map and the unused-vars ignore pattern.
  {
    files: ['frontend/scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        Ractive: 'readonly',
        ...Object.fromEntries(FRONTEND_SHARED.map((n) => [n, 'readonly'])),
        ...Object.fromEntries(FRONTEND_SHARED_MUTABLE.map((n) => [n, 'writable'])),
      },
    },
    rules: {
      'no-redeclare': 'off', // the defining file "redeclares" the shared names
      'no-unused-vars': ['error', { varsIgnorePattern: `^(${[...FRONTEND_SHARED, ...FRONTEND_SHARED_MUTABLE].join('|')})$` }],
    },
  },
];
