# Prototype extraction notes — phase 3 port record

Port source: `docs/frost-sirius-v1.html` (compiled bundle; approved deviation in STATE.md).
Method: bundle script extracted and prettier-formatted; domain functions located by constants
(1.28/2.96, hard-mix 0.083/0.129, throughput grids); the exact minified code copied VERBATIM
into `test/golden/original.mjs` (the oracle); `lib/` reimplements it typed; parity tests prove
port ≡ oracle across input matrices (calendar spans, ~3,600-card forecast matrix, planner
backlogs, sprint sets). This is the AC-10 discipline under the deviation.

## Identifier map (minified → lib/)

| Bundle | lib/ | Notes |
|---|---|---|
| `fn` | `model.CONFIDENCE_LEVELS` | index 1 (0.7) is the default |
| `Tc` | `model.LEGACY_CYCLE` | 1.28 / 2.96 — display-only in the bundle |
| `Xe` | `model.EMPIRICAL` | shipped grid snapshot (hLL7WW2V Jan–Jul 2026) |
| `zu`, `Uc` | `planner.WEIGHTS`, `weightOf` | Easy 1 · Medium 2 · Hard 4 · default 2 |
| `Ke` | `planner.HARD_MIX` | ideal .083 · ceiling .129 · observedMax .204 |
| `jh` | `planner.weekLoad` | BR-6b flags |
| `rp`, `Xh` | `model.laneOf`, `designCell` | lane regexes; Medium fallback |
| `Kh/Qh/V/np` | `calendar.HOLIDAYS/iso/parseDate/isHoliday` | see quirk 2 |
| `on`, `sp` | `calendar.workday`, `toFriday` | see quirk 1; `Math.round` on day counts |
| `Zh`, `dp`, `rn` | `calendar.weekNum/toMonday/workdaysBetween` | |
| `tg`, `ag`, `Hu` | `calendar.buildWeeks/monthWeeks/dateInWeek` | see quirk 4 |
| `qu/Yh/Wu/Jh/eg` | `planner.sortSprints/sprintFor/sprintLengthDays/sprintIssues/reflowSprints` | BR-5 |
| `fl`/`lg` | `forecast.forecast` | the empirical forecast (BR-2) |
| `Eg` | `planner.suggestPlan` | BR-7/BR-7a, incl. note strings |
| `ka` | *(phase 4, T031)* | BR-10 default keyword regexes — not ported yet |

## Load-bearing quirks — preserved verbatim, decisions for the T026 gate

1. **`toFriday` on Fri/Sat/Sun lands on the NEXT MONDAY** (`8-a` arithmetic), not Friday.
   Render-start dates for late-week approvals therefore start the following week.
2. **Holiday matching is timezone-dependent**: local-midnight dates are compared against
   `toISOString()` (UTC). Anywhere east of UTC — Asia/Manila included — the comparison
   shifts a day, so **PH holidays effectively never exclude** in the environment the
   prototype was validated in. The PM's recognised dates were computed WITHOUT holiday
   exclusion. Fixing this would change validated dates; not fixed without JP's say-so.
3. **`renderApproved` counts from `sketchApproved` directly**, not from the Friday that
   `renderDelivery` uses.
4. **Week keys use `toISOString()`** — east of UTC every week key is the Sunday date, and
   `reflowSprints` output dates shift the same way. Internally consistent; UI labels use
   local formatting so users never see it.
5. **`monthWeeks` includes a trailing week whose Monday is in-month** (Friday in the next
   month) — August 2026 renders 5 weeks.
6. **Legacy spreadsheet mode is retired in the bundle** (BRD v2.2): only the constants
   survive, displayed in the Model constants panel. `lib/forecast.legacy.ts` is therefore
   reconstructed from BR-1's formulas; its difficulty grids carry seed values
   (12.5 d / 22 d review at p70 per BR-3) pending JP's workbook export —
   **TODO(workbook-export), required before the T026/AC-10 gate is called**.
7. **`COLUMN_MAP` is referenced but never defined** in the bundle's sheet parser (`og`) —
   a latent prototype bug. Phase-5 sheet parsing follows `sirius-live-sheet-runbook.md`
   instead of the bundle.
8. Prototype fixture data embeds the real intake sheet id/URL — fixture data in the
   prototype only; Sirius fixtures use fakes (invariant 16).
