# Reply to errata — Sirius build spec v1.1

**To:** Sirius build · **From:** Product · **Date:** 12 August 2026
**Re:** `sirius-build-spec_v1.1_errata.md`

All six corrections accepted and folded into **v1.2**, attached. Answers to
your two open items below.

---

## The count-basis question (§3 of your errata)

**Use the §5.4 weight — 4 — everywhere. Your interim choice was right, and
§6.1 was wrong.**

§6.1's "counts 3" was a documentation error on my part, not a deliberate
alternative basis. The prototype has always used `cardWeight()` in both places:

```js
// milestonesFor()
const open = cardWeight(c);          // 1 + (tasks ÷ deliverables)
out.push({ card: c, phase: "Sketch", load: open, … });
out.push({ card: c, phase: "Render", load: open, … });
```

The reasoning is worth stating so it survives the next edit: a deliverable is a
real piece of work, not just a container for its tasks. Excluding it would make
a request with one deliverable and no tasks weigh zero — and 244 of the 269
deliverables on the live board have no task cards at all. Under a work-cards-only
basis, 90% of the board would be invisible to capacity.

§6.1 in v1.2 now reads:

> Each entry carries the row's full weight from §5.4, `1 + (tasks ÷
> deliverables)`. A single-deliverable card with 3 task cards weighs **4** in its
> sketch week and 4 again in its render week.

No split basis. One unit, one meaning.

---

## The missing companion (§4 of your errata)

`AGENTS.md` exists and is attached. It is not a placeholder — it carries the
findings that are not derivable from the code or the design, including several
you will already have discovered:

- `mc_number` is not unique; identity is `(project_id, trello_card_id)`
- task cards attach to the MC, not to a deliverable — only 1 of 27 titles matched
- the retired spreadsheet model overstated review waits by 2.6–4.6×
- Figma variables alias each other, so any resolver must follow the chain

Sections 5 and 7 are the useful ones: things that look like bugs and are not,
and the build sequence with its gates.

**One correction to it, on your evidence:** §2 says "the one write" and needs to
say two. I have left it otherwise as-is rather than back-editing history — the
build-order section is now a record of what happened, and it is more useful that
way than rewritten as though it were always current.

---

## On the corrections themselves

Three are worth a note beyond "accepted".

**The two-way deadline sync (§4.2) is better than what I specified.** I had a
Sirius-local override layer with a manual → Trello → sheet precedence, which
needed a reconciliation rule and would have quietly diverged from the board.
Writing the Trello due date removes the layer and the rule together. Fewer
concepts, and a designer changing a date in Trello now just works.

**The second write is a governance change, not a code change.** The
enumerated-write posture is quoted in the BRD §9, the pilot security readiness
doc and the vendor assessment. All three say "one write". They now need to say
two, with the same enumeration and the same rule that a third requires an
amendment. I will raise that separately — flagging it here so it is not assumed
done.

**37 seconds end-to-end is a real improvement** over the 15-minute cadence I
specified, and it changes a downstream assumption: the Deadlines conflict view
was written expecting data up to 15 minutes stale. Worth checking that nothing
in the UI now flickers on a fast push.

---

## Adopted items (§2 of your errata)

No objection to the project-scoped API paths. `/api/frost-notes?project=:id` was
illustrative, not prescriptive — access control at the route is the better
pattern.

Agreed on keeping Suggest plan's placement arithmetic byte-faithful to the
prototype. It took several rounds to get right, the capacity check is separate
from the placement logic, and there is no reason to touch it.

---

## Attached

| File | |
|---|---|
| `sirius-build-spec.md` | v1.2, all six corrections applied |
| `AGENTS.md` | the missing companion |
