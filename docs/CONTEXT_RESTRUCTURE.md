# Context restructure — staged plan & checklist

_Started 2026-08-18 · JP-approved. Goal: cut agent session-start token burn
(~34k → ~10k) and make the repo navigable for agents. No product change of any
kind. Each stage runs as a workflow with independent verification, then a gate,
then a scoped commit, then an owl record._

## Ground rules — every stage

- **The live build and deployed site are untouched.** Stages 1–3 are
  markdown-only. `public/index.html` is gitignored and never committed; the
  deployed site changes only via `./deploy.sh`, which no stage runs.
- **Quarantine — any file carrying uncommitted work from another session is
  untouchable**, re-checked at every gate via `git status`. At kickoff that was
  six files (diff sha `7392448…`); they landed mid-Stage-1 as `7bdf6b4`
  (pipeline-warning feature, another session) with our stage touching none of
  them — verified. The rule stays live for whatever is dirty at each gate.
- **Nothing is deleted, only moved.** Every entry of moved prose must be proven
  byte-present at its new home before commit (mechanical conservation check,
  run independently by a verifier AND re-run at the gate).
- **Drift rule applies to docs too**: content MOVES; the old location gets a
  pointer, never a copy.
- A red gate stops the stage. No partial commits. Scoped `git add` only —
  never `git add -A` (the quarantine files are dirty).
- Constitution (CLAUDE.md v4.4.0) is not edited in any stage.

## Baseline (2026-08-18)

| Metric | Value |
|---|---|
| STATE.md | 123,191 bytes (~49k tokens; exceeds single-read cap) |
| docs/HANDOFF.md | 24KB |
| specs/001-sirius-v1/gantt-frame-notes.md | 172KB |
| Session-start anchor cost | ~34k tokens |
| `node frontend/build.js` output | 357,778 bytes, sha `76fd1f17…` (from dirty tree incl. in-flight work) |
| Test suite | 821 tests dual-TZ green at HEAD `e2e601d` |

## Stage 1 — STATE.md session-log split  `[DONE 2026-08-18]`

STATE.md keeps: phase table, decisions, AC scoreboard, deviations, the **single
newest** session entry in full, and a one-line index of every archived entry.
All older entries move verbatim to `docs/state-log/YYYY-MM-DD.md` (newest-first
within each file). New convention, recorded in STATE.md itself: each session
update moves the previous full entry to the archive and writes the new one in
STATE.md.

- [x] Workflow build — 60 entries, 59 archived across 8 dated files, newest
      (2026-08-18 review sweep) retained; script aborts-on-mismatch, backup kept
- [x] Verify A: PASS — sha256 multisets equal, prefix byte-identical, 59 index
      lines == 59 archived entries, all targets exist
- [x] Verify B: PASS — no code/test reads STATE.md (comments only); CLAUDE.md,
      constitution mirror, HANDOFF, playbook all coherent with the new shape.
      3 minor concerns: stale one-hop pointers (frame-notes :1425/:1463 +
      tasks.md T159 say figures are "in STATE.md" → now docs/state-log/;
      fixed in Stage 2), memory pointer (fixed directly), size (below)
- [x] Gate: conservation re-run PASS (3rd independent check) · tree shows only
      intended paths · **size ruling: 22,123 bytes vs "≤ ~20KB" — ACCEPTED**
      (−82%; overshoot is the retained 7.5KB newest entry, by design)
- [x] Commit (scoped) · owl record

## Stage 2 — gantt rules extracted from frame-notes  `[DONE 2026-08-18]`

`specs/001-sirius-v1/gantt-rules.md` becomes the ONE home for current planner
rules (drag-source rule, `.grun` shape, standing rulings, deliberately-not-done
list). `gantt-frame-notes.md` stays as the batch-history archive with a header
pointing at the rules file. HANDOFF's planner sections shrink to pointers.
NOTE: `pipeline-frame-notes.md` is quarantined (in-flight) — untouched this
stage; same treatment later if the pattern proves out.

- [x] Workflow build — gantt-rules.md: 56 numbered rules, every one
      source-tagged; HANDOFF's two planner sections → 5/6-line stubs
      (25.2KB → 20.3KB); frame-notes gains the archive banner; 4 stale
      "in STATE.md" pointers fixed (frame-notes ×2, tasks.md T159 ×2)
- [x] Verify A (completeness): PASS — 39 normative statements from the old
      HANDOFF sections all represented; all 56 rules traced to sources,
      zero invented
- [x] Verify B (no-drift): **FAILED first pass, correctly** — HANDOFF's
      "Requests + Pipeline after 13k" section still restated sprints-modal
      law (rules 31/34) normatively. Fixed at gate: paragraph → pointer.
      Soft concerns accepted: evidence-anchored pairs (rules cite HANDOFF
      §gotchas/§still-open as source), carve-outs for ruling-history
      records, stub restating rule 1's headline (sanctioned ≤6-line stub)
- [x] Gate: drift driver fixed · two completeness nits fixed source-verified
      (rule 13 multi-select carve-out per 01-app.js:2509; rule 39 sprint-block
      collapse made explicit) · tree exact · commit
- [x] Commit · owl record

## Stage 3 — code map + contextual CLAUDE.md files + docs index  `[DONE 2026-08-18]`

- `docs/MAP.md`: one line per source file — purpose, key exports, guarding tests.
- `frontend/CLAUDE.md`: Ractive hazards, per-render helper rule, pointer to
  gantt-rules.md and drag rule.
- `test/CLAUDE.md`: guard conventions (source-regex guards read comments as
  code; derive-don't-copy; no synthetic DragEvents).
- `docs/README.md`: authoritative vs historical index (AGENTS.md §7–9
  historical, build-spec v1.1 superseded by v1.2, etc.).

- [x] Workflow build — 4 parallel writers, every claim from an opened file:
      MAP.md 8.2KB (full src/lib/worker/frontend coverage + test-guard index),
      frontend/CLAUDE.md 3.0KB, test/CLAUDE.md 3.4KB, docs/README.md 3.4KB
      (authority index + where-law-lives; also fixed HANDOFF's R-warn-*
      pointer gap). HANDOFF's Ractive gotcha bullet → pointer (one home)
- [x] Verify accuracy: PASS — 28 MAP lines checked against real files, zero
      omissions; every README classification opened and confirmed (incl.
      AGENTS.md §2 wording corrected against the 3-entry registry)
- [x] Verify traceability/drift/tree: PASS — every CLAUDE.md claim traced to
      source; law pointed at, not restated; tree exact
- [x] Gate: 6 verifier nits fixed (model name singular, 401 wording, suite
      count 58, golden-suite location, circular Ractive citation retagged,
      README indexes itself + MAP). Accepted concerns: the comments-trip-
      guards lesson has 3 audience-tailored headline+pointer homes; MAP's
      law-adjacent parentheticals are descriptors, not law
- [x] Commit · owl record

## Stage 4 — T-shape context architecture (JP-ruled 2026-08-18)

Architecture locked in `docs/CONTEXT_ARCHITECTURE.md` (JP's layer definitions;
file-per-area granularity provisional with a standing Rigidity log; skim
replaces MAP.md). Sub-stages:

### Stage 4a — skim + generator + guard test  `[DONE 2026-08-18]`

Rebuild `docs/MAP.md` as the Layer-0 skim (≤150 lines, standing rules with the
two-way authority wording, fact+pointer only, marked HAND-WRITTEN block);
`scripts/generate-index.ts` regenerates the factual sections (STATUS from
STATE.md's own tables, DOC MAP, module skeleton) idempotently between markers;
`test/context-architecture.test.ts` asserts the caps table; STATE.md's session
index trimmed to the 10-session window with the window rule added to its
convention note.

- [x] Workflow build — skim 127/150 lines, 74/75 purposes carried verbatim;
      generator idempotent (3 runs byte-identical), `--check` proven on a
      perturbed copy; guard suite born 19 tests; STATE.md 11.2KB after the
      51-line index trim (targets verified before deletion)
- [x] Verify A: PASS — generator read fully (no write path in --check,
      HAND/marker splice traced); purposes conserved; 2 borderline
      parentheticals accepted as one-clause guards
- [x] Verify B: PASS — conservation exact (deleted lines byte-match HEAD),
      tree exact, gates green; concerns became gate fixes
- [x] Gate fixes: frontend/index.html into generator scope (was HAND-only) ·
      decisions/README.md placeholder (standing rule pointed at a missing
      dir) · rulebook + directory-CLAUDE.md caps became GLOBS (future files
      auto-guarded) · "TODO: describe" banned at rest · staleness exclusions
      documented in-test · architecture caps table trued to the guard
      (24-soft/26-hard, 20–40-target/60-hard). Accepted as convention:
      eslint ignores *.ts by design — tsc strict is the TS gate
- [x] Commit · owl record

### Stage 4b — decision records  `[DONE 2026-08-18]`

**21 records, 0001–0021, all `accepted`** (every one backed by a JP ruling,
constitution text, or recorded gate — zero needed `proposed`). Extraction
workflow drafted 19; BOTH verifiers failed the first gate, correctly:
traceability caught two INVENTED "alternatives rejected" (manual-linking in
0002 with a card count matching today's board, not the 2026-08-03 survey;
statistical-acceptance in 0004 — never on any recorded table); format caught
two compound records (fixtures vs TEST-board; capacity pin vs Option-B lock —
the law amended each half separately) plus restated route mechanics that
would rot inside never-edited records. Fix pass applied the full list
(splits, renumber to 21, six drift trims to pointers, board-guard qualifier
from trello-write.md rule 3 so the records can't read as blocking the prod
pilot); independent re-verify PASS on all six checks. Guard test now
requires all six headings + ≥15 records (can't go vacuous). Verified exact
along the way: every date, number, and ruling attribution. Deliberate gaps:
v4.4.0 reply contract (communication protocol, not architecture); records
run 38–52 lines where sourced content demanded (60 is the hard stop).

### Stage 4c — module notes + end-to-end gate pass  `[queued]`

`lib/CLAUDE.md` + `src/CLAUDE.md` (≤4KB, self-contained, coupling flagged not
papered over); staleness stamps across scope; the T-shape spec's full gate
list + our conservation/drift gates run once end-to-end.

## Stage 5 (was 4) — split `frontend/scripts/01-app.js`  `[HELD by JP 2026-08-18]`

Blocked until the in-flight pipeline-warning work lands (it edits 01-app.js and
test files). Then: add `test/helpers/source.ts` returning the concatenation of
`scripts/*.js`, migrate source-regex guards to it, split 01-app.js into
numbered files (build.js sort-concatenates; styles already use this pattern).
**Build effect**: `public/index.html` changes ONLY by the per-file banner
comments build.js inserts; the executed JS must be content-identical.

- [ ] Precondition: quarantine cleared — in-flight work landed as `7bdf6b4`
      mid-Stage-1, BUT that batch's live pass / deploy may still be owed by the
      other session; Stage 4 additionally waits for JP's explicit go since it
      is the one build-touching stage
- [ ] Workflow build (helper first, guard migration, then the split)
- [ ] Gate: built JS byte-identical after stripping `/* ==== ... ==== */`
      banners · tsc · eslint · vitest dual-TZ full suite · no template/CSS
      byte changes
- [ ] Commit · owl record · JP decides if a deploy is wanted (not required)

## Explicitly out of scope

Graphify / code-graph MCP (skipped — wrong scale for this repo; revisit at
50–100k source lines or cross-repo work) · CLAUDE.md trimming · anything
touching `lib/**`, the wire, schema, or the write registry.

## Record

- 2026-08-18 — plan approved by JP; baseline captured; owl kickoff sent (#28).
- 2026-08-18 — Stage 1 DONE: workflow wf_63080de1 (3 agents, both verifiers
  PASS), gate green, STATE.md 123,191 → 22,123 bytes, 59 entries archived
  verbatim to docs/state-log/. Pipeline-warning work landed as `7bdf6b4`
  (another session) mid-stage; untouched by us, verified.
- 2026-08-18 — Stage 2 DONE (`e8d14db`): gantt-rules.md, 56 rules; drift
  verifier's one real finding fixed at gate. JP confirmed the restructure to
  the concurrent session (`03da2dd`). Owl #29/#31.
- 2026-08-18 — Stage 3 DONE: workflow wf_0f3b8602 (6 agents, both verifiers
  PASS), 6 nits fixed at gate. The STATE.md rotation convention was followed
  correctly by the concurrent batch-10 session unprompted — the Stage-1
  design survived first contact.
- 2026-08-18 — JP ruled the T-shape adoption: rule files one-per-AREA
  (provisional, rigidity tested as we build), skim replaces MAP.md, layer
  definitions his (L0 entry/latest read-first, L1 current-state rot-protected,
  lower layers delegated). Alignment confirmed; architecture codified in
  docs/CONTEXT_ARCHITECTURE.md; stage 4 = 4a/4b/4c; script split renumbered
  stage 5, HELD.
