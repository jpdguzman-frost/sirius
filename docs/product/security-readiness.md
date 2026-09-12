> **Assembly note (2026-09-11).** Assembled verbatim from owl messages miles→jp #112–#113 (Set 5/5), stripping owl headers and part-banner text only. **No gaps or overlaps found** — part 2 opens exactly at §3 Control checklist as promised by part 1. The cross-document wrap-up that followed §8 in #113 ("All five documents are now with you," the corrections tally, and the open-items lists for JP and for Miles) was excluded as message meta-commentary spanning all five documents, not content of this document specifically; it is preserved in full in the owl file 2026-09-11-miles-113.md and summarized in the digest.

---

# Pilot Security Readiness — Design Support Platform v1
### What must be true before Frost runs this on live client data

> **ADOPTED 2026-09-12 (JP)** as the held copy. New to `docs/product/` — no prior
> version was tracked here.
>
> **§6's gate is the live one.** Two items that used to block the pilot are struck as
> v2-only (a signed data processing agreement; a Mynt vendor risk assessment) and are
> replaced by a single v1 item: confirm the existing Mynt agreement covers Frost
> operating an internal system holding request content. **That confirmation is JP's,
> and it is not a build task.**
>
> **§4's write-scope test now covers all four enumerated writes** plus the refusal
> case — a business unit with no matching board label is refused and no label is
> created. That case is already proven in `test/classification-write.test.ts`
> (unmatched, ambiguous and blank tags), though the W4 write itself stays inert until
> its surface and actor are ruled.

**Scope:** v1 is Frost-internal. No GCash user logs in, Frost owns the Trello
workspace and the intake sheet, and there is no vendor onboarding. §2 sets out
what that means; §3 onward are the controls, which stand on their own merits.

⚠️ **That earlier scope line was wrong and is removed.** It described Release 1 as *"client access: GCash requestors file requests through the platform, see their own status, and receive notifications"* — the v1.0 framing. **v1 is Frost-internal: no GCash user logs in, no GCash account exists.** §2 sets this out properly, and it exists because this exact error was made once already. Client access, notifications and in-platform filing arrive at v2 and v3.

**Not legal advice.** The regulatory sections point at obligations you will need Frost's and Mynt's counsel to confirm. Everything else is engineering and process.

---

## 1. Start here: what you are actually protecting

Most security checklists assume the crown jewels are personal data. Here they are not. The names and emails in this system are ordinary business contact details. **The sensitive asset is the content of the requests.**

Look at what your own sample data contains: *Investor Relations — Declaration*, *Investment Case*, *Corporate Governance*, references to the IPO page and the Mynt corporate website. Those are pre-announcement materials for a listing. Elsewhere in the pipeline sit unreleased features, campaign timings, and product names that have not been announced.

That reframes the risk:

| If this leaked | Consequence |
|---|---|
| A requestor's name and email | Minor privacy incident |
| A design brief for an unannounced GLoan feature | Competitive harm; possible regulatory disclosure question |
| **Figma files or briefs for pre-IPO investor materials** | **Potentially market-sensitive. A securities matter, not just a privacy one** |
| The whole request pipeline | A roadmap of everything GCash plans to ship, with dates |

The single most damaging realistic breach is not a database dump. It is **one client seeing another business unit's unreleased roadmap**, or an ex-employee retaining access after leaving. Design your controls for that, and the rest follows.

**Practical consequence for the pilot:** ask Frost's PM and the GCash sponsor to agree, in writing, whether pre-IPO or investor-relations requests are **excluded from the pilot entirely**. Piloting with the least sensitive request categories is the cheapest risk reduction available, and it costs nothing technically.

---

## 2. What actually applies to v1

An earlier draft of this document analysed Sirius as a system a client would use.
That is not what v1 is, and the framing has been corrected.

### 2.1 What Sirius is, in scope terms

- **Frost-internal.** No GCash person logs in. No GCash account exists.
- **Frost owns the Trello workspace**, so the four writes touch Frost's own system.
- **Frost owns the intake sheet.** GCash requestors fill it in; the file is Frost's.
- **Not a system GCash procures, connects to or is offered.**

So there is **no vendor onboarding, no security questionnaire and no new
contractual instrument** for v1. Frost is already an assessed supplier to Mynt
under the existing design engagement; Sirius is a tool used inside that
engagement, not a new relationship.

### 2.2 Data Privacy Act of 2012 — thin, but not zero

Sirius holds **no GCash customer data**. What it holds is deliverable names,
briefs, dates, Trello activity, and the names and work emails of Frost staff.

- **Frost staff data** — Frost is the controller. Ordinary employment-data
  handling; nothing specific to this platform.
- **GCash requestor names** appear as first names and handles on request rows.
  Minimal, business-contact data, already shared under the engagement.
- **A separate DPA for Sirius is not required.** If the existing engagement
  already covers how Frost handles GCash material, Sirius sits inside it.

**Confirm rather than assume:** whoever holds the Mynt agreement should check
it covers Frost operating an internal system that stores request content. That
is a five-minute read of a contract you already have, not a new negotiation.

### 2.3 BSP Circular 1137 — not applicable to v1

Circular 1137 governs **outsourcing arrangements** — a BSFI handing a function
to a third party. Sirius is not that. It is a project-management tool used by a
supplier to organise work it was already contracted to do.

Mynt's existing assessment of Frost as a supplier stands. Nothing about Sirius
changes the arrangement being assessed.

### 2.4 What genuinely survives, regardless of who logs in

**Confidentiality.** The platform holds unreleased client roadmap — deliverable
names, dates, Figma links, briefs. This is the crown jewel, and the obligation
is contractual, already in place, and not conditional on anyone logging in. The
controls in §3 exist to honour that, not to satisfy a regulator.

**Pre-IPO material.** If Investor Relations screens or other pre-IPO material
enter the platform, insider-trading and disclosure controls apply and this stops
being an IT conversation. Access control does not address it — the question is
who at Frost can see it and whether that is documented. Raise it with Mynt's
legal contact before such requests enter the platform, and consider excluding the
category from the pilot.

**Offboarding.** Staff leaving Frost must lose access immediately. Google
Workspace deactivation handles it, provided access is never granted outside SSO.

### 2.5 When this changes — v2

The moment a GCash person can log in, everything above flips:

| | v1 | v2 |
|---|---|---|
| Vendor security questionnaire | Not applicable | **Expect one** |
| Data Processing Agreement | Covered by the engagement | **A new instrument, likely required** |
| BSP 1137 materiality | Not applicable | **Mynt decides, not Frost** |
| Cross-tenant authorisation | No external users | **The primary risk — manual IDOR testing** |
| Breach notification clock | Frost-internal incident | **72 hours to the NPC; contract to 24 hours to Mynt** |

Start the DPA and the assessment when **v2 is committed**, not when it is
code-complete. Both routinely take longer than the build.

---
## 3. Control checklist

*(§3.1–§3.9 as previously held, with these changes:)*

**§3.3 — File upload and attachments.** ⚠️ **No client uploads anything in v1** — there is no client login and no upload surface. These controls apply from **v2**, and are kept here so they are not rediscovered late. *(Sheet-pasted images cannot be read at all; clients are asked for links instead.)*

**§3.4 D4** — *(v2 — Chat notifications are deferred.)*
**§3.4 D5** — *(Export is deferred to a reporting release.)* CSV exports guard against formula injection (`=`, `+`, `-`, `@`) — **and this matters most for the monthly COCA report**, the first export planned.

**§3.5 E4 — Trello token needs write scope.** Sirius makes exactly four writes, all to Trello: the `Urgent` card label, the card due date, card difficulty by swapping the `Difficulty: …` label, and classification tagging — **business unit only** — which assigns and unassigns labels from a named set that already exists on the board. **Sirius never creates a classification label**, so the applicable set is bounded by the board rather than by user input; a tag with no matching label is refused and surfaced. Nothing else is written anywhere, and a fifth would require an amendment to this document.

**§3.5 E7** — Every Trello write, **any of the four**, recorded in the audit log with actor, field and time; a failed write rolls the local state back so Sirius never displays a state Trello does not hold. ⚠️ **Business-unit tagging may fire on ingestion rather than from a click**, making it the first write with no human actor; its audit row records `system` deliberately. **Rollover is the second.**

---

## 4. Testing before the pilot

| Test | Who | Blocking? |
|---|---|---|
| Authorization matrix — every role against every endpoint | Engineering | **Yes** |
| Manual IDOR attempt: client fetches another unit's request by ID | Engineering | **Yes** |
| Upload tests: SVG with script, mislabelled executable, oversized file | Engineering | **Yes** |
| Trello write: confirm the token cannot reach boards outside Design Support | Engineering | **Yes** |
| Trello write: confirm **no field beyond the four enumerated writes** can be written — the `Urgent` label, the due date, the `Difficulty: …` label, and a business-unit label **drawn from the board's existing set** | Engineering | **Yes** |
| Trello write: confirm **W4 refuses a tag with no matching board label** and creates nothing | Engineering | **Yes** |
| Dependency scan clean of criticals | CI | **Yes** |
| Backup restore rehearsal | Engineering | **Yes** |
| Offboarding test: disable a Workspace account, confirm access dies | Engineering | **Yes** |
| Third-party penetration test | External | Likely required by Mynt — confirm early |
| Load test at realistic volume | Engineering | No |

The penetration test is the long pole. If Mynt requires one — and for a financial institution's vendor handling roadmap data, assume they do — book it now. Remediation time after the report is typically two to four weeks.

---

## 5. Shrinking the pilot's blast radius

The cheapest security control is having less to lose. For the pilot specifically:

1. **Exclude sensitive categories.** No pre-IPO, investor relations, or unannounced-launch requests. Agree the exclusion list in writing.
2. **Small, named group.** Five to ten requestors from one or two business units. An allow-list, not a domain-wide rollout.
3. **Keep the sheet as the system of record.** During pilot the platform is additive. If it must be switched off, nothing is lost.
4. **No bulk export.** *(v1 has no client and no export at all — it is deferred to a reporting release. Kept for when both exist.)* Frost can export; clients cannot. Removes the easiest exfiltration path.
5. **Attachments as links only, at first.** If clients link to Figma and Drive rather than uploading files, the entire upload attack surface in §3.3 disappears from the pilot. Add uploads in release 2 once the controls are proven.
6. **Notifications to a shared space, not DMs.** *(v2 — Chat notifications are deferred.)* Fewer moving parts; and the space membership is itself an access control you can audit.
7. **Time-box it.** Six to eight weeks, with a defined review before widening.

Recommendation 5 is worth serious consideration. It removes an entire control family from the pilot's critical path at almost no cost to usefulness, since your current workflow already runs on Figma links.

---

## 6. Go / no-go gate

Do not open the pilot until every one of these is true.

- [x] ~~Data Processing Agreement signed~~ — ⚠️ **NOT REQUIRED FOR v1.** §2.2: no GCash personal data, and Sirius sits inside the existing engagement. **This gate blocked go-live on paperwork v1 does not need.** It becomes real at v2 — start it when v2 is committed.
- [ ] Named privacy contact and incident response owner at Frost
- [x] ~~Mynt vendor risk assessment complete, or explicitly waived~~ — ⚠️ **NOT APPLICABLE TO v1.** §2.1: no vendor onboarding, because no GCash user logs in and Frost owns both sources. Also v2.
- [ ] **Confirm the Mynt agreement covers Frost operating an internal system holding request content** — §2.2. A five-minute read of a contract Frost already has. *This is the v1 substitute for the two items above, and it is the one that actually applies.*
- [ ] Authorization enforced server-side and verified by manual testing
- [ ] IDOR test passed — no cross-unit access possible
- [ ] SSO with MFA, allow-listed users, automatic offboarding verified
- [ ] All secrets in a secrets manager; no credentials in the client bundle
- [ ] Sheet read via service account; sheet sharing unchanged from Restricted
- [ ] Audit logging live and verified
- [ ] Backup taken and restore tested
- [ ] Dependency scan clean of criticals
- [ ] Penetration test complete and criticals remediated, if required
- [ ] Incident response plan documented and walked through once
- [ ] Pilot scope agreed in writing, including excluded request categories
- [ ] Rollback plan confirmed — the sheet still works

---

## 7. Things that will be tempting and are not acceptable

| Temptation | Why not |
|---|---|
| "Ship the pilot without auth, it's only ten people" | An unauthenticated URL is a public URL. Assume it will be shared |
| "Hide the tab; that's enough" | The API still serves the data. This is the most likely breach in this app |
| "Make the sheet public just for testing" | A public Sheets URL cannot be un-shared from anyone who already fetched it |
| "Use the PM's personal Trello token" | Exposes everything that account can see, and breaks when they leave |
| "Copy production data to staging for realistic testing" | Roadmap data on a lower-controlled environment |
| "We'll add the audit log later" | You cannot reconstruct who did what retroactively. It has to exist from day one |
| "Skip the DPA, it's a small pilot" | True for v1 — no GCash personal data, covered by the existing engagement. Becomes real at v2, and the obligation does not scale with pilot size |
| **"Create the business-unit label if it's missing"** | **That single line converts an enumerated write into an open one and is the whole reason W4 was grantable. A missing label is a person's job, not the product's** |

---

## 8. Recommended sequence

| Week | Focus |
|---|---|
| 0 | Agree pilot scope and exclusions. Start Mynt's vendor assessment. Begin the DPA |
| 1–2 | Build authentication, authorization, audit logging **first** — retrofitting these is how gaps appear |
| 3–4 | Application features against the secured foundation |
| 5 | Integrations with proper credential handling |
| 6 | Internal security testing; book the penetration test |
| 7–8 | Remediation; go/no-go review |
| 9 | Pilot opens to the named group |
| 9–16 | Pilot runs; weekly access review; incident drill |
| 17 | Review and decision on widening |

Build the security foundation before the features. It is not slower overall, and it is the only order that produces a system you can honestly present to a bank's risk team.

