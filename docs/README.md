# docs/ — authority index

Verdict first, one line per file: which documents **govern**, which merely
**record**. Precedence between the governing documents is set by the root
`CLAUDE.md` (the constitution) — never re-derive it from this index.

_last-verified: 2026-08-18_

## Anchors — read on resume

- **HANDOFF.md** — READ FIRST on resume, together with root `STATE.md` (current phase table, decisions, AC scoreboard).
- **state-log/** — ARCHIVE: STATE.md session entries rotated out verbatim, one dated file per day, newest-first.
- **CONTEXT_RESTRUCTURE.md** — PLAN+RECORD of the 2026-08-18 docs restructure (this index is one of its stages).
- **CONTEXT_ARCHITECTURE.md** — GOVERNS documentation shape: the four context layers, caps, growth rule, rigidity log (JP-ruled 2026-08-18).
- **MAP.md** — CODE MAP: one line per source file (purpose, key exports, guarding tests); read it before exploring the codebase.
- **README.md** — this index.

## Governing

- **Sirius__BRD.md** — GOVERNS scope and business rules (v2.2, 3 Aug 2026).
- **Sirius__Implementation_Plan.md** — GOVERNS engineering detail *where not superseded*; its stack and layout sections are superseded (root `CLAUDE.md` Stack section; `specs/001-sirius-v1/plan.md`).
- **sirius-build-spec_v1.2.md** — GOVERNS the UI build (product's spec, 12 Aug 2026; supersedes v1.1, folds in the errata).

Constitution amendments in root `CLAUDE.md` supersede all three; conflict
rules (BRD vs Implementation Plan) are stated there, not here.

## Operational

- **DEPLOY.md** — runbook: `.env` key list and smoke checklist (still the reference for those); superseded by SERVER_SETUP_SPEC.md where they differ.
- **SERVER_SETUP_SPEC.md** — go-live spec for the `platforms.frostdesigngroup.com` host, Sirius under `/sirius`; gated phases, Apache/certbot, no staging tier.
- **ARES_PUSH_BUILD_SPEC.md** — spec for the ARES-side outbound-push feature (audience: the agent in the ARES codebase; Sirius consumes it per `specs/001-sirius-v1/contracts/ares-push.md`).

## Historical / superseded — records, not law

- **sirius-build-spec_v1.1.md** — SUPERSEDED by v1.2.
- **sirius-build-spec_v1.1_errata.md** — ANSWERED record: build team's line-by-line corrections to v1.1.
- **sirus_errata-reply-v1.2.md** — ANSWERED record: product's reply (all six corrections accepted; count-basis ruling).
- **AGENTS.md** — MIXED: §2's enumerated-write posture stands, but the authoritative registry is `specs/001-sirius-v1/contracts/trello-write.md`, which has grown past §2's count; §7/§8/§9 are historical (OD-1/OD-8 shown open, "Postgres") per STATE.md's decisions table (2026-08-12 row).
- **frost-sirius-v1.html** — the compiled prototype `lib/` was ported from. NEVER DELETE: it is the golden tests' provenance (constitution invariant 5).
- **forecasting-block.csv** — raw export of the legacy spreadsheet's forecasting block (data record).
- **gate-t045-model-validation.md** — evidence record for the model-validation gate (2026-08-03).
- **deploy.sh** — reference copy of ARES's deploy script (the pattern Sirius mirrors); live deploys use root `./deploy.sh` + gitignored `deploy.local.sh`.
- **screenshots/** — live and prototype captures (record).

## Where law lives

| Law | Authoritative file |
|---|---|
| Planner (Gantt) rules | `specs/001-sirius-v1/gantt-rules.md` (its narratives: `gantt-frame-notes.md`, history only) |
| Pipeline rules incl. R-warn-* rulings | `specs/001-sirius-v1/pipeline-frame-notes.md` |
| Requests-tab rules | `specs/001-sirius-v1/requests-frame-notes.md` |
| Trello write registry | `specs/001-sirius-v1/contracts/trello-write.md` |
| Constitution, invariants, precedence | root `CLAUDE.md` |
