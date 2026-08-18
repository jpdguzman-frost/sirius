# Sirius — Spec-Driven Development Playbook (GitHub Spec Kit + Claude Code)

The rule for this whole playbook: **your documents seed every phase. Spec Kit formats; it does not invent.** If any generated file contradicts BRD v2.2 or the Implementation Plan, the documents win and the generated file gets corrected.

---

## Step 0 — Install (10 minutes)

Prerequisites: Python 3.11+, `uv`, Claude Code, a git repo.

```bash
uv tool install specify-cli
cd ~/dev
specify init sirius --integration claude    # Claude Code = skills-based install
cd sirius
mkdir -p docs
# copy in: the BRD and Implementation Plan (today docs/product/brd.md and
#          docs/product/implementation-plan.md),
#          frost-sirius-v1.jsx (the prototype), CLAUDE.md
git add . && git commit -m "Spec Kit scaffold + source documents"
```

Install only from the official GitHub repo, not PyPI — impostor packages exist under the same name.

---

## Step 1 — Constitution

Run the constitution step and paste the whole of `CLAUDE.md` as its input. Preface with:

> This project already has a written constitution. Adopt it verbatim as the Spec Kit
> constitution. Do not soften, generalize, or reword the 17 invariants. Add only the
> standard Spec Kit framing around them. Anything you generate that conflicts with an
> invariant is an error.

**Check before moving on:** open `memory/constitution.md` (or wherever your Spec Kit version writes it). All 17 invariants present, verbatim. The forecast-gate rule (#7) and the read-only rule (#2) especially — those two prevent the expensive failure modes.

---

## Step 2 — Specify (seed with the BRD)

Do NOT describe the app in your own words. Instead:

> The specification for this system already exists as a signed-off BRD (v2.2) at
> docs/product/brd.md. Convert it into the Spec Kit spec format. Rules:
> 1. Preserve every FR, BR, NFR, and AC with its ID. IDs are how we trace work.
> 2. Preserve every measured constant exactly (review-wait percentiles, throughput
>    grids, hard-mix thresholds, capacity reference weeks). Do not round or "example-ify."
> 3. Where the BRD lists Open Decisions (OD-1..OD-8), mark them [NEEDS CLARIFICATION]
>    rather than resolving them.
> 4. Scope is v1 only. v2/v3 items appear in Out of Scope.
> 5. Do not add features, personas, or user stories the BRD does not contain.

**Check:** diff mentally against the BRD. The most common SDD failure here is silent scope creep — invented user stories, "helpful" extra features. Delete anything you can't trace to a BRD line. Confirm `mc_number` non-uniqueness and the urgency-write exception survived the conversion.

---

## Step 3 — Plan (seed with the Implementation Plan)

> The technical plan also already exists: docs/product/implementation-plan.md.
> Convert it to the Spec Kit plan format. Rules:
> 1. The stack is decided (Next.js App Router, TypeScript strict, Prisma, Auth.js,
>    separate worker, Cloud Run + Cloud SQL). Do not re-open stack decisions.
> 2. The schema in §1.3 is the schema. Reproduce it, don't redesign it.
> 3. lib/forecast.ts, lib/planner.ts, lib/calendar.ts port verbatim from
>    frost-sirius-v1.jsx — they are pre-validated. The plan must say so.
> 4. Preserve the phase sequence in §8 including both gates (golden tests AC-10;
>    model validation "dates the PM recognises").
> 5. Anything blocked on OD-1 (ARES interface) stays marked blocked.

**Check:** gates present, sequence intact, no alternative stacks "for consideration."

---

## Step 4 — Tasks (the genuinely new artifact)

This is the step where Spec Kit earns its keep. Run the tasks step with:

> Generate tasks.md from the plan. Rules:
> 1. Group tasks by the 9 phases in the plan's sequence. Keep phase order.
> 2. Every task cites the FR/BR/AC it satisfies. A task with no requirement ID
>    is scope creep — don't emit it.
> 3. Tasks in lib/ and business rules are test-first: the test task precedes
>    the implementation task.
> 4. Mark phase 4 tasks BLOCKED-OD1. Mark phase 8 tasks BLOCKED until the
>    staging duplicate Trello board is confirmed.
> 5. Gates (end of phase 3, end of phase 6) are tasks assigned to JP, not the
>    agent. The agent cannot check them off.
> 6. Right-size: a task is 0.5–1 day. The plan's estimates (~57 dev-days) are
>    the sanity bound — if tasks sum wildly past that, they're too granular
>    or padded.

Optionally run the tasks-to-issues step to mirror tasks into GitHub Issues, which gives Leigh and the team visibility without opening the repo.

**Check:** count tasks per phase against the day estimates. Phase 7 (UI, 12 days) should be the biggest block. If phase 1 has 20 tasks, it over-decomposed.

---

## Step 5 — Implement, phase by phase

Never "implement everything." Run the implement step scoped:

> Implement phase 1 tasks only. Stop at the phase boundary. Report: tasks
> completed, tests passing, ACs satisfied, any deviation you propose (do not
> apply deviations — propose them).

Cadence per phase:
1. Agent implements → reports.
2. You review the report against the AC scoreboard (10 min, not a code read —
   the tests are the code read).
3. Gates: you personally confirm AC-10 (golden tests) after phase 3, and the
   forecast sanity check after phase 6 — ask your PM whether the dates look
   like reality. Only then unlock phase 7.
4. Commit, move to next phase.

---

## Step 6 — Change management (the part teams skip)

When requirements change mid-build — they will — the change enters the SPEC first,
then re-run plan/tasks for the affected slice, then implement. Never patch code
directly for a requirement change; that's the exact drift SDD exists to prevent.
Same for open decisions: when you answer OD-1, record the answer in the spec's
clarifications, then unblock phase 4 tasks.

---

## Decisions you still owe the process

| When | Decision |
|---|---|
| Before Step 4 completes | OD-1: ARES interface (DB role / API / replication) |
| Before phase 8 | Create the duplicate staging Trello board |
| Before vendor review | Amend BRD §9 (urgency write contradicts "no writes by permission") |
| Anytime | OD-8 hosting confirmation (plan assumes Frost GCP) |

---

## File map after setup

```
sirius/
├── memory/constitution.md        ← from CLAUDE.md, verbatim invariants
├── specs/001-sirius-v1/
│   ├── spec.md                   ← from BRD v2.2
│   ├── plan.md                   ← from Implementation Plan
│   └── tasks.md                  ← generated, phase-grouped, ID-traced
├── docs/                         ← the originals stay; they remain authoritative
│   ├── product/brd.md
│   ├── product/implementation-plan.md
│   └── frost-sirius-v1.jsx
└── CLAUDE.md                     ← Claude Code reads this every session
```
