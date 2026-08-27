# CLAUDE.md — Sirius Build Constitution

You are building **Sirius**, Frost Design Group's internal delivery pipeline and forecasting platform. Source documents: `docs/product/brd.md` (v2.2 — the *what*) and `docs/product/implementation-plan.md` (the *how*). When they conflict, the Implementation Plan wins on engineering detail; the BRD wins on scope and business rules. If a conflict matters, stop and ask.

## What Sirius is, in three lines

Sirius reads Trello (via ARES) and intake Google Sheets, and owns only planning decisions: which week a deliverable is slotted, confidence, SLA overrides, pins, status notes. It writes back only what the write registry enumerates — today the `Urgent` label, the card due date, and the card difficulty label — nothing else, anywhere. It is multi-project from the first migration.

## Invariants — never violate, never "improve"

1. **Every collection carries** `project_id`**. Every query filters on it.** No exceptions, including audit and sync collections where the schema defines it.
2. **Read-only everywhere except the write registry.** (Amended 2026-08-04; registry grown 2026-08-12.) No write path to Google Sheets, ever. No write to Trello except the enumerated write registry in `specs/001-sirius-v1/contracts/trello-write.md` — today exactly three entries, all via `lib/trello.ts`: the `Urgent` label (`setUrgency()`), the card due date (`setDue()`), and the `Difficulty: …` label (`setDifficulty()`, approved by JP 2026-08-12 per BRD-§9-A1). Growing the registry is a constitution amendment, never a code change. If you find yourself writing anything else to a source system, you have misread the task — stop.
3. `mc_number` **is NOT a unique key.** Identity is `(project_id, trello_card_id)`. MC-825 carries 99 deliverables. `display_id` (e.g. `MC-655.3`) is for humans.
4. **Work cards attach to the MC group, not to a single deliverable.** There is no reliable task→deliverable edge (1 of 27 titles matched). Do not model one.
5. `lib/forecast.ts`**,** `lib/planner.ts`**,** `lib/calendar.ts` **are ported verbatim from** `frost-sirius-v1.jsx`**.** They are validated. Do not refactor, rename, or "clean up" their logic. Golden tests prove the port before anything else uses them. (Amended 2026-08-15, JP: `lib/calendar.ts` date-string derivation is TZ-safe — week keys are the local Monday; `isHoliday` matches the local calendar date — and the holiday set is injectable via `setHolidays()`. **The ARES working-day calendar is canonical**; the static `HOLIDAYS` list is only the offline seed. Golden tests amended to a TZ-true reference, oracle parity kept where the oracle is correct. Everything else stays verbatim; the `toFriday` quirk is preserved.)
6. `lib/forecast.legacy.ts` **(the spreadsheet formula) is for migration tests only.** It is never imported by UI code. It overstates review waits 2.6–4.6× (BR-3). The empirical model is the only forecast users see.
7. **The empirical model is a release gate, not a feature** (Sequence item 6). Do not build UI that displays forecast dates until the model refresh produces dates the PM recognises.
8. **Every Trello write is optimistic with rollback.** (Amended 2026-08-04; was urgency-only.) A failed Trello write reverts the local change. Sirius never displays a state Trello lacks. Every write logs to `audit_log` and `sync_runs`. Trello-owned fields — including the written ones — reconcile from ARES reads, so a manual change made in Trello always surfaces in Sirius.
9. **Auth is four server-side checks:** verified email, `hd` claim = `frostdesigngroup.com`, matching email domain, active allow-list row. Every API route re-checks session AND project membership. Hiding a tab is not access control.
10. **Every state change writes to the immutable** `audit_log` — schedule moves, pins, SLA overrides, urgency, conflict acknowledgements, project settings.
11. **Store UTC, render and compute Asia/Manila.** Workday math uses `lib/calendar.ts` only.
12. **Sprints are editable data, not a cadence.** Overlapping sprints rejected on save. Gaps allowed and surfaced as *Outside any sprint*.
13. **Conflict acknowledgements are keyed on the situation:** `week | rule | capacity | sorted card:phase pairs`. Any change to the cards involved — or to the project's weekly capacity — invalidates the acknowledgement, and the week re-surfaces for re-acknowledgement. (Amended 2026-08-17, JP ruling on OD-4's capacity slice, raised by product in owl #23; the broader OD-4 expiry question stays open.) Card-level indicators (red bar, late flag) are never suppressed by an acknowledgement.
14. **Deadline precedence:** Trello due date wins where present, else sheet deadline, else none (implemented in `deliverables_v`). A Sirius deadline edit writes the Trello due date (registry entry W2), so precedence is preserved by construction.
15. **Secrets live in server-side environment configuration only** (dotenv on the host, per the ARES pattern). Never in the client bundle, never in the repo, never in logs. The ARES API key is read-only and never leaves the server. The Sheets service-account credential is provisioned as a server-side secret, never committed.
16. **Seed from fixtures, never from a production dump.** Real briefs never touch a developer laptop.
17. **Staging and local point at a NON-PRODUCTION TEST board that mirrors the production board's structure** — same lists and label taxonomy (`Main Card`, `Difficulty: …`, 🛑 blockers); a dozen sample cards suffice. (Amended 2026-08-04: the production board is too large to duplicate.) Before any urgency write runs, verify the configured board ID is not a production board.



## Stack — fixed, do not re-litigate

*(Amended by JP, 2026-08-03 — aligned to the ARES stack; supersedes the Implementation Plan's §2–§3 stack choices.)*

Node.js + Express 5 · TypeScript `strict` for server, worker and `lib/` · frontend follows ARES conventions: Ractive.js templates, plain JS scripts, CSS, HTML, no bundler (`frontend/build.js` concatenation) · MongoDB via Mongoose (same Mongo server as ARES, own `sirius` database) · Redis (sessions via connect-redis, caching) · Passport with `passport-google-oauth20` — the four auth checks unchanged · separate worker process for all sync (sync never runs inside a request) · Zod at every API boundary · Vitest · deployed beside ARES, same pattern · Trello data via the ARES read API (`/api/v1/trello/*`, read-only key, server-side only) · realtime updates via ARES push webhooks (HMAC-signed, notification-then-read per `contracts/ares-push.md`; the poll stays as the reconcile fallback) · repository layout per `specs/001-sirius-v1/plan.md` (supersedes Implementation Plan §2.3).

Do NOT: split into SPA + separate API domain · apply schema or index changes by hand against production (version-controlled migration scripts only) · port the forecast engine to another language · put the ARES key or any credential in a browser · add libraries that duplicate what the stack provides.

## Working style

- **Tests first for anything in** `lib/` **and any business rule (BR-1 through BR-10).** The forecast golden tests are the highest-value tests in the project.
- Reference requirements by ID (FR-x.y, BR-n, AC-n, NFR-n) in commit messages and PR descriptions.
- When a task depends on an undecided item (OD-1, OD-6, OD-7, OD-8), stop and ask JP. Do not pick a default silently.
- Small commits, one concern each. Migrations are version-controlled from the first line.
- Update `STATE.md` at the end of every working session: what's done, what's in flight, what's blocked, which ACs pass.



## Build workflow — how work is executed (JP, rev 2026-08-28b)

**When it applies:** any change touching 2+ files or 30+ lines of non-doc
code. One-line fixes and docs-only changes are exempt. Unsure → run the
workflow. **Deploy is never part of a workflow; it waits for JP.**

**Two modes** — the main thread picks one and names it in the drift report:
- **Full** — default. Features, screens, anything law-heavy or
  design-heavy, anything with new guards or Figma work. The gate is a
  HARD STOP: JP sees the artifacts before anything is built.
- **Light** — small builds only (≤3 files, ≤150 lines, no new guards, no
  Figma): one survey reader, one build agent, VALIDATE in full, REVIEW as
  a single correctness pass, E2E only if UI changed. The gate artifacts
  are still produced and posted, but the build PROCEEDS without waiting —
  a veto gate, not a wait gate (JP's asking-vs-deciding ruling,
  2026-08-17: reversible work is decided and reported, not queued).

**The main thread stays open.** It orchestrates, holds the gates, reads
owls, and talks to JP; the work itself runs as background workflows.
Phases run as SEPARATE workflows — survey, build, review — with the main
thread (and JP, at the gate) between them, never one fire-and-forget
pipeline.

**Model tiers by role** (mapping current as of this revision — update the
names when models change, not the roles):
- Readers and sweeps: mid tier (Sonnet). Purely mechanical sweeps: low
  tier (Haiku).
- Build agents: top tier (Opus 5 or Fable 5, whichever fits the piece —
  Fable for the hardest, law-heavy or design-heavy work).
- Review/verify agents: top tier, always.

1. **SURVEY** — parallel readers over code, specs/owls, and Figma. Figma
   goes through Rex when connected (`get_status` first), else the Figma
   MCP. **Geometry is read from nodes or exported SVG, never from
   annotation prose** — the prose has been wrong about its own design four
   times on this project. A node id that 404s is re-found by name.

2. **GATE: DRIFT REPORT + BUILD PLAN.** Two artifacts, one stop:
   - **Drift report** — spec vs current code, item by item, every place
     the mock contradicts a ruled rule called out.
   - **Build plan** — written by the main thread from survey output,
     saved as `PLAN.md` at the repo root: the agent split, exclusive
     file ownership per agent, and the frozen interfaces (state keys,
     class names, handler names). Interfaces are frozen here and nowhere
     else. **`PLAN.md` is per-build and EPHEMERAL** — it exists only
     while its build is in flight and rotates into the day's state-log at
     CLOSE, leaving the root. Layer 1 stays `STATE.md` alone (the
     2026-08-18 HANDOFF retirement; the architecture suite enforces it).
   JP sees both before anything is built (Full mode). If the drift report
   suggests the spec itself is wrong, that goes to JP as a question,
   never a guess.

3. **BUILD** — parallel agents where the work allows, each with
   **exclusive ownership of its files** per `PLAN.md` (the frontend is
   one concatenated `<script>`: split by layer — state / template /
   stylesheet / tests). Each agent is pointed at the law for its layer
   (`test/CLAUDE.md`, `gantt-rules.md`). An agent that needs to change a
   frozen interface **stops and reports**; the main thread amends
   `PLAN.md` and restarts the affected agents — agents never renegotiate
   interfaces between themselves.

4. **VALIDATE** — typecheck, lint, full suite `TZ=UTC` and
   `TZ=Asia/Manila` (calendar suites also America/New_York). The two
   documented environmental flakes: re-run before believing red, record,
   never mask. **Every new guard proven non-vacuous** — revert the code,
   watch it fail, restore. **Anchor the build in a commit BEFORE any
   revert proof**, and restore from a /tmp snapshot, never `git checkout`
   — against uncommitted work that command restores HEAD and destroys the
   build (it did once, 2026-08-28; recovered from the bundle's
   concatenation markers).
   **On red:** back to the owning build agent with the failing output.
   Three rounds on the same red → stop, report to JP.

5. **REVIEW** — two passes, in this order, every build:
   - **Correctness with adversarial verification** — the reviewer works
     from the drift table and `PLAN.md`; for each item claimed done, the
     reviewer must attempt to construct a failing input or state.
     "Looks right" is not a verdict. Findings go back to BUILD.
   - **Simplification** — only after correctness is clean.
   **Rule: any code change after VALIDATE re-runs VALIDATE in full.**
   Simplification edits included — no exceptions.
   Reviewer/builder disagreement resolves at the main thread; unresolved
   → JP.

6. **E2E** — seeded local fixtures, a real browser: programmatic
   measurements plus screenshots plus a clean console; interactions
   proven by real pointer only. Live-site writes only against `rt-test`.
   **On failure:** back to the owning agent; the fix passes through
   VALIDATE and REVIEW again for the changed files.

7. **CLOSE** — `STATE.md` and the day log updated; the drift report,
   `PLAN.md`, and decisions rotate into the session record and `PLAN.md`
   leaves the root.

Outward messages (owls, anything leaving the machine) are never sent from
inside a workflow — per-approval, from the main thread.



## Reply format — always

Every reply to JP follows this shape, in this order:

1. **HEADLINE** — one sentence. The answer, the status, or the ask. If JP reads nothing else, this must be enough.
2. **WHAT I NEED FROM YOU** — decisions or approvals only, as a numbered list. Skip the section entirely if nothing is needed.
3. **STATUS** — max 5 bullets. One line each. Facts, not narration.
4. **DETAIL** — collapsed at the bottom under `---`. Evidence, logs, reasoning. JP reads it only by choice.



## WHAT I NEED FROM YOU — rules

Ask JP only when the answer is one-way: hard to undo, costs money,
touches live client data, or changes a promise already made.
Everything reversible: decide it yourself, report it under DECIDED WITHOUT YOU.

Max 3 asks per reply. If there are more, pick the 3 that block work
and hold the rest.

One ask = one change. Never bundle two changes into one yes.

Every ask uses exactly this shape:

**N. [Short plain title]**

- What's happening: one sentence, no ticket numbers, no names,
no file paths, no feature nicknames. A smart person outside
the project must understand it.
- If yes: what becomes true.
- If no: what stays true.
- Undo: easy / hard / impossible.
- I'd pick: X, because [one reason].

Banned inside an ask: acronyms, code identifiers, issue numbers,
teammate names, words like "gate", "flag", "state", "handler",
"migration" without a plain-word gloss. Put all of that in DETAIL.

Test before sending: could JP answer this correctly at 11pm
without opening the codebase? If no, rewrite it.

## DECIDED WITHOUT YOU

Max 3 bullets. Reversible calls I made on my own. Plain words.
JP can veto any of them; say so if a veto is expensive.

## Anti-rubber-stamp

If JP replies with a bare "ok", "yes", "go", or "sure" to a reply
containing 2+ asks, do NOT proceed. Re-ask them one at a time,
starting with the least reversible.

Hard rules:

- Never narrate process ("first I checked…", "I then realized…"). Conclusions only. Reasoning goes in DETAIL.
- Never restate JP's request or prior context back.
- One reply = one screen. If longer, detail is above the line — move it down.
- No hedging paragraphs. Tag uncertainty inline: [sure] / [likely] / [guess].
- Tables over prose for anything with 3+ comparable items.
- When asking JP to decide: keep it short, use simple words, lay out the options plainly. Never complicate a decision.



## Definition of done, per phase

A phase is done when: its acceptance criteria (AC-1 to AC-20, as mapped in the phase prompt) pass as automated tests where testable; typecheck, lint, and vitest are green; `STATE.md` is updated; and nothing in this file was violated.