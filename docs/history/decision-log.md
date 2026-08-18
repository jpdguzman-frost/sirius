# Decision log — settled questions, dated

ARCHIVE (Layer 3). Never loaded on resume. `STATE.md` carries only questions
still awaiting an answer; a question lands here the session it is answered.
Rows are verbatim — moved, never rewritten.

Not to be confused with `decisions/` at the repo root: that folder holds
immutable ARCHITECTURAL records with six required headings. This file holds
project-management state — open questions, gates, and exceptions, once closed.

Companion archives: `phase-log.md` · `state-log/`.

_last-verified: 2026-08-18_

## Answered — was blocking

| # | Decision | Blocks | Status |
|---|---|---|---|
| OD-1 | ARES interface: DB role / read API / replication | Phase 4 | ✅ **Resolved 2026-08-03: ARES read API** (`/api/v1/trello/*`, read-only key; contract in `specs/001-sirius-v1/contracts/ares-read.md`) |
| OD-8 | Hosting: Frost GCP or elsewhere | Infra work | ✅ **Resolved 2026-08-03: beside ARES, same pattern; shared Mongo server, own `sirius` db** |
| — | TEST board | Phase 8 | ✅ created: tx8gDsTH (structure-mirroring, 12 synthetic cards) |
| T085 | Hand `docs/operations/ares-push-spec.md` to the ARES build agent + provision `ARES_WEBHOOK_SECRET` on both hosts | T086 (e2e push verify) | ✅ done 2026-08-04 — ARES built it, push LIVE |
| W2 | Due-write canonical time: 17:00 Asia/Manila, preserve existing time-of-day on edit | — | ✅ confirmed by JP 2026-08-04 |
| lib/cal | Two pre-existing `lib/calendar.ts` defects (see 2026-08-15 log): Sunday week keys from `buildWeeks` breaks `/suggest` on the Manila host; `isHoliday` UTC/local mix shifts holiday exclusion off the real dates on prod | Usable Suggest on prod; forecast holiday accuracy | ✅ **Resolved 2026-08-15: JP chose option (a) + ARES-canonical calendar** — constitution v4.2.0, both fixed, migration 005 normalized live data, deployed same day |
| NFR-3 | Guide documents a 30-min ARES cache cycle; JP: new ARES is realtime, so < 15 min stands | Phase 4 exit verification | ✅ measured 2026-08-04: **37 s** Trello→Sirius push-driven; 15-min poll fallback drilled |

## Answered — was not blocking

| # | Decision | Blocks |
|---|---|---|
| errata Q | Deadlines count basis | ✅ **answered 2026-08-12** (`docs/product/errata-reply-v1.2.md`): §5.4 weight everywhere — built default is final; §6.1 was their doc error |
| — | Build spec **v1.2** + **AGENTS.md** (now `docs/architecture/agents-guide.md`) | ✅ received 2026-08-12, verified, filed in docs/ (v1.2 now `docs/product/build-spec-v1.2.md`). All 6 errata corrections confirmed in the diff. its §2 already says two writes; its §7/§8/§9 are historical (OD-1/OD-8 shown open, "Postgres") — do not treat as current |

## Answered — operational

- **2026-08-18 — Agent browser-verification runs against the deployed site, not a local dev server.** Asked this session; the practical answer today is NO local target: there is no headless dev auth path and the four auth checks are real everywhere. Passes run against the deployed site on `rt-test` / `tx8gDsTH`, synthetic fixtures only. Discipline is `test/CLAUDE.md` rule 4 — record every row's `slottedWeek` before touching anything and restore it after, zero net change. Building a dev login is JP's call and was not asked for.

## Deviations proposed by the agent, approved by JP

- **2026-08-03 — Port source is the compiled bundle, not the JSX.** The original `frost-sirius-v1.jsx` is not available; the team supplied only the built prototype `docs/source-material/frost-sirius-v1.html` (single minified 272 KB script block, identifiers mangled). JP approved inferring `lib/forecast.ts`, `lib/planner.ts`, `lib/calendar.ts` from the bundle. Consequence: Invariant 5's "verbatim port" becomes a faithful reconstruction, and the AC-10 golden tests are the sole proof of fidelity — they gate Phase 3 exactly as before. If the original `.jsx` surfaces, it supersedes the bundle.

_Durable home: `decisions/0012-lib-port-from-compiled-bundle.md`, plus the
root `CLAUDE.md` invariant 5 and `lib/CLAUDE.md` — this row is the record of
JP's approval, not the operative rule._
