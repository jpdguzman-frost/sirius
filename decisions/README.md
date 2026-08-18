# decisions/ — architectural decision records

One settled decision per file, `NNNN-short-name.md`, 20–40 lines: Title ·
Status (accepted / proposed / superseded-by-NNNN) · Context (2–3 sentences) ·
Decision · Consequences · Alternatives rejected and why. Accepted records are
never edited — a change is a NEW numbered record marked as superseding the
old. Unclear rationale ships as `Status: proposed` with open questions for JP.

Hierarchy: the constitution (root `CLAUDE.md`) is the LAW text; a record here
is the rationale layer beneath it and cites the constitution version or
ruling it feeds. Area rulebooks hold operational rules; records here hold the
architectural WHY. Format and caps guarded by
`test/context-architecture.test.ts`.

_Populated in restructure stage 4b (`docs/history/context-restructure.md`)._

_last-verified: 2026-08-18_

## Index

| # | Title | Status | Date |
|---|---|---|---|
| 0001 | Identity is (project_id, trello_card_id); mc_number is not unique | accepted | 2026-08-03 |
| 0002 | No task→deliverable edge; work cards attach to the MC group | accepted | 2026-08-03 |
| 0003 | The empirical model is the only forecast users see | accepted | 2026-08-03 |
| 0004 | The model refresh is a release gate, not a feature | accepted | 2026-08-03 |
| 0005 | Auth is four server-side checks, re-run on every route | accepted | 2026-08-03 |
| 0006 | Sprints are editable data, not a cadence | accepted | 2026-08-03 |
| 0007 | Seed from fixtures, never from a production dump | accepted | 2026-08-03 |
| 0008 | Non-prod points at a TEST board mirroring production structure | accepted | 2026-08-03 |
| 0009 | Stack aligned to ARES; Implementation Plan §2–§3 superseded | accepted | 2026-08-03 |
| 0010 | Trello data comes through the ARES read API (OD-1) | accepted | 2026-08-03 |
| 0011 | Host beside ARES: same droplet pattern, own `sirius` database (OD-8) | accepted | 2026-08-03 |
| 0012 | lib/ ported from the compiled bundle; golden tests are the proof | accepted | 2026-08-03 |
| 0013 | Writes to source systems live in an enumerated registry | accepted | 2026-08-04 |
| 0014 | Every Trello write is optimistic with rollback; Trello stays truth | accepted | 2026-08-04 |
| 0015 | Realtime via ARES push webhooks; the poll survives as fallback | accepted | 2026-08-04 |
| 0016 | rt-837 capacity pinned at 120 as a calibration reference | accepted | 2026-08-12 |
| 0017 | The ARES working-day calendar is canonical; week keys = local Monday | accepted | 2026-08-15 |
| 0018 | The rt-837 capacity pin is enforced by a structural lock (Option B) | accepted | 2026-08-17 |
| 0019 | Conflict-acknowledgement keys include the capacity slice | accepted | 2026-08-17 |
| 0020 | Pins freeze the row completely (Option B) | accepted | 2026-08-17 |
| 0021 | The layered context architecture (entry / state / task set / archive) | accepted | 2026-08-18 |
| 0022 | Maps decomposed per area; the Layer-0 skim stays fixed-size | accepted | 2026-08-18 |
| 0023 | docs/ reorganized into role folders; old paths redirect from here | accepted | 2026-08-18 |
| 0024 | STATE.md rotates per section, not per file; two archives added | accepted | 2026-08-18 |
