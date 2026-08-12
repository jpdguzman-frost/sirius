# Errata — Sirius build spec v1.1

**To:** Product team · **From:** Sirius build · **Date:** 2026-08-12
**Against:** `sirius-build-spec_v1.1.md`, checked line-by-line against the live system.

The spec is largely accurate — every measured constant matches, and the multi-project
board rule (§2) is implemented exactly as written. The corrections below are places
where the platform moved after the spec was written (most date from the 2026-08-04
two-way-sync change). Please fold them into v1.2.

## 1. Corrections — the platform has moved past these

| § | v1.1 says | Actual, live today |
|---|---|---|
| 4.3 | "The only write in the system" (urgency) | There are **two** enumerated writes: the `Urgent` label **and the card due date**. Nothing else, anywhere; adding a third requires a governance amendment. |
| 4.2 | Deadline precedence "manual → Trello → sheet"; a Sirius-local override with dashed underline; writing the Trello due date is an *open decision* — "currently it does not" | **Decided 2026-08-04 and live.** Editing a deadline in Sirius **writes the Trello due date** (set or clear; default 17:00 Manila, existing time-of-day preserved). There is no Sirius-local override layer — precedence stays Trello → sheet by construction, and a manual change made in Trello flows back automatically. Please rewrite §4.2 around this. |
| 3.2 | Sync strip: "CSV import / Live sync" button; "last sync 6 min ago · every 5 minutes" | Sync is push-driven: ARES notifies Sirius on every Trello change (measured **37 seconds** end-to-end), with a 15-minute poll as automatic fallback if push goes quiet. There is no CSV-import path in the platform. Suggested copy: *"synced HH:MM · push live"*. |
| 0 | Five tabs | Six — an **Admin** tab (user access management) shipped 2026-08-04, visible to admins only. Needs adding to the shell spec. |
| 1 | "Signing out clears imported data" | Prototype-era behaviour. Data lives server-side now; signing out ends the session, nothing is cleared. |
| 9 | Build order: "ARES read (blocked on OD-1)"; "urgency write, last" | All seven steps are built and live, including both gates (golden tests; model validation passed by the PM). OD-1 was resolved 2026-08-03. |

## 2. Adopted — now in the engineering spec, being built

These three v1.1 items were **new to us** and have been adopted as requirements
(engineering IDs in parentheses; no v1.2 change needed):

- **§3.7–3.8 Frost notes** + three-state status + FOR CLARIFICATION tile (FR-11).
  One note per request, keyed to the MC number; never written to the intake sheet.
  One deviation: the API paths shown in §3.8 will differ — all routes live under the
  project scope for access control. Behaviour is as specced.
- **§6.2 Daily plotting** on Deadlines, including largest-remainder day capacity and
  holiday handling (FR-12).
- **§5.4 Row weight** `1 + (tasks ÷ deliverables)`, board total 478 (BR-6c). Feeds
  footers, over-capacity tint and the over-capacity conflict. It deliberately does
  **not** change Suggest plan's placement arithmetic, which is the validated
  prototype logic and stays byte-faithful.

## 3. One question

§5.4 and §6.1 disagree on the count basis for Deadlines. §5.4's formula gives a
single-deliverable card with 3 work cards a weight of **4** (itself + 3 tasks);
§6.1's example says it "counts **3**" in its sketch week. Which is intended?

**Until answered we use the §5.4 weight (4) everywhere**, so one unit means one
thing across Sprint Schedules and Deadlines. If §6.1's 3 is deliberate (work cards
only, deliverable excluded), say so and we'll split the basis.

## 4. Missing companion

§(intro) references a companion `AGENTS.md` (traps and boundaries). We have not
received it. If it exists, please send it; if it's a placeholder, drop the reference
in v1.2.
