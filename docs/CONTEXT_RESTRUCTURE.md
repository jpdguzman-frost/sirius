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

## Stage 3 — code map + contextual CLAUDE.md files + docs index  `[queued]`

- `docs/MAP.md`: one line per source file — purpose, key exports, guarding tests.
- `frontend/CLAUDE.md`: Ractive hazards, per-render helper rule, pointer to
  gantt-rules.md and drag rule.
- `test/CLAUDE.md`: guard conventions (source-regex guards read comments as
  code; derive-don't-copy; no synthetic DragEvents).
- `docs/README.md`: authoritative vs historical index (AGENTS.md §7–9
  historical, build-spec v1.1 superseded by v1.2, etc.).

- [ ] Workflow build (parallel writers per file)
- [ ] Verify: accuracy sweep — every MAP.md line spot-checked against the real
      file; every claim in the CLAUDE.md files traced to a recorded ruling
- [ ] Gate: quarantine hash · scoped status · MAP.md ≤ ~8KB
- [ ] Commit · owl record

## Stage 4 — split `frontend/scripts/01-app.js`  `[PARKED — blocked]`

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
