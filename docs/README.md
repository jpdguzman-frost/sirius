# docs/ — what Sirius is, one folder at a time

The written record of Sirius: what it must do, how it is shaped, how it runs,
and how it got here. Verdict first on every line — a file either **GOVERNS**
(binding; code contradicting it is a defect to flag) or **RECORDS** (history;
never build from it). Precedence between governing files is set by the root
`CLAUDE.md` — never re-derive it here.

_last-verified: 2026-08-18_

## Start here

- **`MAP.md`** — the codebase in one skim: live status, the two areas, the doc
  layers, the load-bearing test guards. Read it instead of exploring; its factual
  blocks are generated (`npx tsx scripts/generate-index.ts`; `--check` exits 1 on drift).
- **root `STATE.md`** — the current state, and ONLY what is still live: open
  phases, unanswered decisions, AC scoreboard, comms, a 10-line window of
  session summaries. Anything settled rotates to `history/` the session it
  settles (decision 0024). The only Layer-1 file — `HANDOFF.md` was retired
  2026-08-18 (JP).
- **`decisions/`** (repo root) — the why: one settled architectural decision per
  numbered record, never edited once accepted; `decisions/README.md` indexes all.
- **`README.md`** — this guide.

Entry sequence on resume: root `CLAUDE.md` (auto-loads) → `MAP.md` → `STATE.md`.

## product/ — the *what*: scope, business rules, the UI to build

- **brd.md** — GOVERNS scope and BR-1…BR-10 (v2.2, 3 Aug 2026). An interim
  banner lists four points later rulings moved past; the rest governs as written.
- **implementation-plan.md** — GOVERNS engineering detail *except* §1–§3 (stack,
  infrastructure, repo layout), superseded by root `CLAUDE.md` §Stack and
  `specs/001-sirius-v1/plan.md`.
- **build-spec-v1.2.md** — GOVERNS the UI wherever the area rulebooks are silent
  (12 Aug 2026, supersedes v1.1). Its banner lists five sections reversed by
  later JP rulings — do not build those as written.
- **errata-reply-v1.2.md** — RECORD: product's reply accepting all six v1.1
  corrections (count basis = the §5.4 weight, 4). Path and its filename typo are
  cited by `specs/001-sirius-v1/tasks.md` — do not rename either.

## architecture/ — how the system and its documentation are shaped

- **context-architecture.md** — GOVERNS documentation shape: the four context
  layers, caps, growth rule, standing working rules, rigidity log (JP-ruled
  2026-08-18). Every cap is asserted by `test/context-architecture.test.ts`.
- **agents-guide.md** — MIXED: §§2–6 GOVERN the traps and boundaries no source
  file states; §7–§9 are historical, annotated in place. Never renumber its
  sections — code and tests cite them by number.
- **map-frontend.md** · **map-backend.md** — RECORD (generated): one line per
  source file, Layer 2, loaded only when working that side.

## operations/ — how Sirius is deployed and run

- **deploy.md** — GOVERNS the deploy procedure, `.env` key list, smoke checklist,
  backup/restore, user administration. Live since 2026-08-05; no staging tier.
- **server-setup.md** — GOVERNS host architecture (Apache/certbot vhost, base path
  `/sirius`, provisioning gates G2–G7); wins over deploy.md on the server itself.
- **ares-push-spec.md** — RECORD: the spec written FOR the ARES codebase. The
  Sirius-side authority is `specs/001-sirius-v1/contracts/ares-push.md`.

## history/ — records only; STATE.md points here, nothing else does

The three archives that let Layer 1 stay small. Deliberately UNCAPPED — capping
them would push content back up into `STATE.md`. Never loaded on resume; read
one only when chasing a specific fact.

- **state-log/** — ARCHIVE: the FULL session narrative, written here directly
  and never into STATE.md (decision 0024). One dated file per day, entries
  newest-first. The filenames are the index.
- **phase-log.md** — ARCHIVE: every phase and batch, verbatim, append-only.
  STATE.md keeps only the open and undeployed ones.
- **decision-log.md** — ARCHIVE: questions once answered, gates once passed,
  deviations once approved. Not to be confused with `decisions/` at the repo
  root, which holds immutable ARCHITECTURAL records.
- **context-restructure.md** — RECORD of the 2026-08-18 restructure that
  produced this layout (all stages complete).
- **spec-kit-playbook.md** · **phase-prompt-generator.md** — RECORDS of how the
  build was set up on 2026-08-03, moved off the repo root 2026-08-18. **Never
  build from either**: the playbook names the pre-reversal stack (Next.js /
  Prisma / Cloud Run) and the generator's phase ladder stops at 9. Both carry
  banners listing what superseded them.
- **build-spec-v1.1.md** — SUPERSEDED by `product/build-spec-v1.2.md`.
- **build-spec-v1.1-errata.md** — RECORD: the build team's line-by-line corrections
  to v1.1, all six answered in `product/errata-reply-v1.2.md`.

## source-material/ — the inputs Sirius was built from

- **frost-sirius-v1.html** — the compiled prototype `lib/` was ported from.
  NEVER DELETE: it is the golden tests' provenance (constitution invariant 5).

The local-only records left the project on 2026-08-18 (JP's ruling): screenshots,
the legacy spreadsheet export, the model-validation gate evidence, and the borrowed
ARES deploy script now live outside the repo. `scripts/gate-t045.ts` regenerates its
report on demand — still gitignored; it carries the real board id.

## Where law lives

| Law | Authoritative file |
|---|---|
| Planner (Gantt) rules — drag, geometry, verification | `specs/001-sirius-v1/gantt-rules.md` (its narratives: `gantt-frame-notes.md`, history only) |
| Deadlines rules — the work-card tab, counts, the card, rollover | `specs/001-sirius-v1/deadlines-rules.md` (its narrative/history: `deadlines-frame-notes.md`, the old milestone tab, archived 2026-09-05) |
| Sprint Schedules rules — planner behaviours, sprints modal, chips, the add row | `specs/001-sirius-v1/sprint-rules.md` (split from `gantt-rules.md` 2026-09-05 at the 20KB cap; rule numbers are global across the two) |
| Pipeline rules incl. R-warn-* rulings | `specs/001-sirius-v1/pipeline-frame-notes.md` |
| Requests-tab rules | `specs/001-sirius-v1/requests-frame-notes.md` |
| Trello write registry | `specs/001-sirius-v1/contracts/trello-write.md` |
| Build artefacts (spec · plan · tasks; `T…` numbers trace here) | `specs/001-sirius-v1/` — live. The playbook that generated them is a RECORD: `history/spec-kit-playbook.md` (its stack section is wrong — see its banner) |
| How a requirement change enters | the area rulebook it governs, before any code moves — see the rows above |
| Documentation shape, caps, layers | `docs/architecture/context-architecture.md` |
| Constitution, invariants, precedence | root `CLAUDE.md` — authoritative and auto-loading; mirrored (with the version number, **v4.4.0**) at `.specify/memory/constitution.md`. Amendments enter the root file first, then the mirror |
