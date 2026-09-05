# PLAN — split the five giant files (JP yes 2026-09-05) · EPHEMERAL, rotates at CLOSE

**Mode:** Light-shaped veto gate (mechanical, no behaviour change, no new guards, no Figma) — posted and proceeding. Drift report: n/a (no spec). Rationale: the four 70–110KB test files and `frontend/scripts/10-constants.js` are read whole dozens of times per build.

**Law that makes this safe (survey 2026-09-05):** `frontend/build.js` and `test/helpers/source.ts` glob + string-sort `frontend/scripts/*.js` and join with `\n`; every slicer in `test/helpers/gantt-render.ts` reads the CONCATENATED text (test/CLAUDE.md rule 8). No test reads any of the five files by path. `test/source-order.test.ts` derives its expectation from the directory.

## Frozen interfaces = the file names and section homes below. Nothing else changes: no renames, no reordering, no edits inside moved code.

### A — `frontend/scripts/10-constants.js` (921 lines) → three files, verbatim line ranges, old file deleted
| New file | Lines | Holds |
|---|---|---|
| `frontend/scripts/10-constants-core.js` | 1–228 | capacity fallbacks · planner geometry/capacity band · Requests constants · row warning + date helpers |
| `frontend/scripts/11-constants-deadlines.js` | 229–422 | DL_MONTHS … dlBuild, monthShort/monthOrder |
| `frontend/scripts/12-constants-pipeline.js` | 423–921 | DIFF_RANK/PIPE_* sort+filter · addLabel/addTokens/addMatches |
Proof: `appScripts()`-style join of the directory is byte-identical before/after (banner-free); `public/index.html` differs only by per-file banner lines. Forward refs (unranked/mcRank in 20-requests-table.js; dlBuild→addLabel) stay inside function bodies — nothing moves to top-level immediate code.

### B — `test/pipeline-sortfilter.test.ts` (129 tests) → helper `test/helpers/pipeline-sortfilter.ts` (lines 1–125 prelude, exported verbatim) + 5 files
| New file | Describes (line ranges) |
|---|---|
| `pipeline-sortfilter-sorts.test.ts` | A 126–233 · B 239–295 · B2a 301–349 · B2b 351–402 · C 408–432 · E2 709–729 |
| `pipeline-sortfilter-filters.test.ts` | D 438–562 · E 568–707 · F 735–920 |
| `pipeline-sortfilter-panels.test.ts` | F2a 926–958 · F2b 960–1009 · F2c 1011–1117 · F2d 1119–1131 · F2e 1133–1148 · F2f 1150–1161 · H1 1491–1574 |
| `pipeline-sortfilter-indicator.test.ts` | F3 1167–1443 · G 1449–1485 · H2 1580–1702 |
| `pipeline-sortfilter-noresults.test.ts` | local prelude 1704–1761 · H3a 1763–1812 · H3b 1814–1894 |

### C — `test/sprint-schedule-render.test.ts` (139 tests) → helper `test/helpers/sprint-schedule-tab.ts` (prelude 1–132 + the SUITE-1 harness 139–172 + SUITE-4 fixtures 749–798 and any memoised sub-harness used by 2+ new files) + 5 files
| New file | Suites (line ranges) |
|---|---|
| `sprint-schedule-groups.test.ts` | SUITE 1 133–254 · SUITE 2 255–337 |
| `sprint-schedule-deadline.test.ts` | SUITE 2b 338–598 · SUITE 3 599–735 |
| `sprint-schedule-add-search.test.ts` | SUITE 4 first half 736–1099 |
| `sprint-schedule-add-handlers.test.ts` | SUITE 4 second half 1101–1501 |
| `sprint-schedule-bars-footer.test.ts` | SUITE 5 1502–1730 · SUITE 6 1731–1820 · SUITE 7 1821–1877 |

### D — `test/pipeline-warning.test.ts` (80 tests + 24 todo) → helper `test/helpers/pipeline-warning.ts` (prelude 1–191) + 4 files
| New file | Describes (line ranges) |
|---|---|
| `pipeline-warning-recipe.test.ts` | 192–207 · 209–286 · 288–371 · 373–540 |
| `pipeline-warning-wiring.test.ts` | 548–584 · 596–685 · 693–735 · 737–785 · 806–876 |
| `pipeline-warning-dismissal-css.test.ts` | 878–1026 · local prelude 1029–1052 · 1055–1278 |
| `pipeline-warning-live.test.ts` | 1280–1304 · 1319–1360 (the 24 `it.todo`) |

### E — `test/pipeline-expanded.test.ts` (72 tests) → helper `test/helpers/pipeline-expanded.ts` (prelude 1–134) + 3 files
| New file | Describes (line ranges) |
|---|---|
| `pipeline-expanded-columns.test.ts` | 135–276 · 282–306 · 312–336 · 338–366 · 383–473 · 479–501 |
| `pipeline-expanded-groups.test.ts` | 545–723 · 725–763 · 769–844 · 846–858 · local prelude 859–899 · 900–942 · 944–966 |
| `pipeline-expanded-metrics.test.ts` | 972–1027 · 1033–1086 · 1092–1152 · 1159–1265 · 1271–1308 |

### Hoisting rule (B–E)
Prelude code moves to the helper VERBATIM; the only edit is adding `export` (and `export type`/`export interface`) to what the new files import. Memoised `let X; const F = () => (X ??= …)` harnesses move whole. Anything used by exactly ONE new file stays local to that file. Each new file imports from `./helpers/<name>` and keeps its own banner comment naming the old file and the split date. Old file deleted with `git rm`.

### P — pointer sweep (after A–E): every reference to the five old names outside `docs/history/**` and `specs/001-sirius-v1/tasks.md` is repointed to the file that now holds the referenced thing: `scripts/generate-index.ts` DOCMAP + regenerate `docs/MAP.md`; `docs/architecture/map-frontend.md:12`; `test/CLAUDE.md:68` (count); `specs/001-sirius-v1/pipeline-frame-notes.md:33,211`; `gantt-rules.md:120`; `sprint-rules.md:186`; comments in `eslint.config.js`, `frontend/styles/35-gantt.css`, `frontend/scripts/{20,40}-*.js`, `src/routes/schedule.ts`, `test/helpers/gantt-render.ts`, `test/sprints-modal.test.ts`, `test/sprint-items.test.ts`, and the split files' own cross-comments. Exit check: `grep -rn` for the five basenames outside the two exclusions returns nothing.

### Ownership
A: `frontend/scripts/10-constants*.js`, `11-constants-deadlines.js`, `12-constants-pipeline.js` only. B/C/D/E: their old file, their helper, their new files only. P: everything in the pointer list, nothing else. Nobody touches `test/helpers/gantt-render.ts` code (comments only, by P).

### Validate / review / close
VALIDATE: typecheck, lint, full suite `TZ=UTC` and `TZ=Asia/Manila` → 1335 tests + 24 todo across 64−4+17 = 77 files. REVIEW: one nothing-lost pass (describe/it inventory old vs new by name, bundle byte identity, helper verbatim-ness, no stale pointer). No E2E (nothing on screen changes), no revert proofs (no new guards). CLOSE: STATE.md + day log; PLAN.md rotates to `docs/history/state-log/2026-09-05-plan-split.md`.
