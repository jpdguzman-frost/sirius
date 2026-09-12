> **Assembly note (2026-09-11).** Assembled verbatim from owl messages miles→jp #109–#111 (Set 4/5), stripping owl headers and part-banner text only. **No gaps or overlaps found** — part 2 opens exactly at the SQL block promised by part 1 ("rest of §1.3 — intake, frost notes, the model tables, audit — plus §1.4 and §2"), and part 3 opens at §2.2 as promised by part 2. The trailing owl commentary ("End of engineering doc," forward reference to set 5/5) was stripped from the end of part 3 as message meta-text, not document content.

---

# Frost: Sirius — Engineering Implementation

> **ADOPTED 2026-09-12 (JP) as the held copy — the *how*.** Replaces the 2026-08-18
> copy, archived beside it as `implementation-plan-2026-08-18.md`. That copy's
> supersession banner is carried forward here because it still applies, and one point
> of it applies harder than before:
>
> ⚠️ **§1 specifies Postgres. Sirius runs MongoDB.** The stack was ruled by JP
> 2026-08-03 (the ARES stack: Node/Express 5, MongoDB via Mongoose, Redis, Ractive,
> no bundler) and that ruling is in the constitution's Stack section, which wins here.
> Read §1's tables as the **data model** — which fields exist, which unit owns them,
> what is keyed on what — never as DDL to apply. The two SQL defects product flagged
> in their own sweep (an index on a column removed from `deliverables`; a nullable
> column inside `model_grid`'s primary key) cannot bite for the same reason.
>
> Also still superseded: **repository layout** by `specs/001-sirius-v1/plan.md` ·
> **§5.1's OD-1 gate**, resolved 2026-08-03 (the ARES read API, `/api/v1/trello/*`) ·
> **deployment**, which follows the ARES pattern per `docs/operations/deploy.md`.
> Schema changes are applied by version-controlled migration scripts only.

**Supersedes** `frost-sirius-build-plan.md`, which predates the ARES findings, multi-project scope, the empirical model and the write paths.

⚠️ **Swept 2026-09-10, aligned to BRD v3.0.** The body had drifted badly: the schema still modelled the **deliverable** as the scheduled unit, `conflict_acknowledgements` was still defined, the model tables were keyed on **lane** rather than work type, and §5.1 still called OD-1 an open question. All corrected below, with the reason recorded at each point.

Companion to **BRD v3.0** (*what*), the **build spec v1.4** (*which screen, which pixel*) and the roadmap (*when*). This is *how*.

---

## 1. Database

### 1.1 Postgres, managed

The data is relational: projects own cards, cards own work cards, work cards accumulate events, forecasts join a model table, everything is queried by date range and filtered by project. A document store would mean hand-rolling joins you get free here, and percentile recalculation is SQL's home ground.

**Cloud SQL for Postgres** if you host on Google, which §3 recommends. Never on the same instance as the app.

### 1.2 Two rules that shape everything

**Every table carries `project_id`.** Sirius is multi-project from day one. Retrofitting tenancy is the same class of change as retrofitting authentication — possible, reliably painful. Put it in the first migration.

**Ownership is explicit in the schema.** Some columns come from Trello, some from the intake sheet, some from Sirius itself. Group and comment them so the write path can refuse anything it doesn't own. ⚠️ **The exceptions are the four enumerated writes** — urgency, due date, difficulty and business-unit tagging — all on the **work card**, all called out below.

### 1.3 Schema

```sql
create extension if not exists "pgcrypto";
create extension if not exists citext;

-- ============ projects ============

create table projects (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,        -- 'rt-837', mirrors ARES
  name              text not null,
  client            text,
  status            text not null default 'ongoing',

  -- sources
  trello_board_id   text not null,
  trello_label      text,                        -- 5 of 26 boards serve several
                                                 -- projects; null = whole board
  intake_sheet_id   text,
  intake_sheet_gid  text,
  intake_sheet_tab  text,

  -- planning settings
  -- Cards per week. Seeded from ARES steering.deliveryForecast.referenceWeeks;
  -- the typical week is the default, least/most bound the control.
  weekly_capacity   int not null,
  ref_week_least    int,
  ref_week_typical  int,
  ref_week_most     int,
  effective_weekly_rate numeric,
  model_window_months int not null default 12,

  created_at        timestamptz not null default now()
);

-- Sprints are an editable list per project, not derived from a cadence.
-- Length varies; a WORK CARD -- not a deliverable -- belongs to whichever sprint
-- contains its slotted week. Overlaps are rejected; gaps are legal and surfaced.
-- Membership is STORED on work_cards, not derived: rollover moves cards across
-- sprint boundaries and membership must follow the card.
-- Re-dating a sprint displaces cards to 'Outside any sprint' KEEPING THEIR DAY;
-- it must never unslot or destroy a schedule. Deletion may, behind a
-- confirmation naming the count.
create table sprints (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  starts_on   date not null,
  ends_on     date not null,
  position    int  not null,
  check (ends_on >= starts_on)
);
create index on sprints (project_id, starts_on);
create unique index on sprints (project_id, position);

-- ============ people ============

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  name          text,
  active        boolean not null default true,
  last_login_at timestamptz
);
-- Domain (`hd` claim) is checked at the session layer; this table is the
-- allow-list on top of it. Both are required.

create table user_projects (
  user_id    uuid references users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  primary key (user_id, project_id)
);

-- ============ deliverables ============

create table deliverables (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id),

  mc_number         text,                        -- NOT unique: MC-825 has 99
  display_id        text not null,               -- 'MC-655.3'

  -- ---- owned by Trello ----
  trello_card_id    text not null,
  trello_url        text,
  name              text not null,
  current_list      text,
  -- difficulty and lane are MIRRORS on this table, like urgency below.
  -- Difficulty is a work-card property; lane is used for STATE, never for
  -- duration -- the forecast axis is work_type (BR-4).
  difficulty        text check (difficulty in ('Easy','Medium','Hard')),
  lane              text,                        -- design | ops | assets
  blocker           text,                        -- from 🛑 labels
  figma_url         text,
  labels            text[] not null default '{}',
  trello_due        date,
  trello_synced_at  timestamptz not null default now(),

  -- ⚠️ MIRRORED FROM TRELLO BUT NEVER USED OR DISPLAYED.
  -- Urgency, difficulty and deadline are properties of the WORK CARD.
  -- A main card draws an em-dash in all three. Do not forecast from these,
  -- do not filter on them, do not write to them. See §5.3.
  urgency           text,                        -- read-only mirror; UI shows —

  -- ---- from the intake sheet, joined on mc_number ----
  sheet_deadline    date,
  unit              text,                        -- was use_case; source column
                                                 -- is the sheet's Business Unit
  brief             text,
  requestor         text,

  -- ---- owned by Sirius ----
  status_note       text,

  -- ⚠️ REMOVED: slotted_week, pinned, confidence, sla_sketch, sla_render.
  -- Scheduling moved to the work card (see work_cards below). sla_* went with
  -- review time (BR-1b). `pinned` protected rows from the withdrawn suggester
  -- and now protects against nothing — FR-5.9 is still awaiting a decision.

  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (project_id, trello_card_id)
);

-- (no slotted_week index -- that column moved to work_cards)
create index on deliverables (project_id, mc_number);
create index on deliverables (project_id, active);

-- effective deadline: Trello wins where set, else the sheet
create view deliverables_v as
  select *, coalesce(trello_due, sheet_deadline) as deadline,
         case when trello_due is not null then 'trello'
              when sheet_deadline is not null then 'sheet' end as deadline_source
  from deliverables;

-- ⚠️ THE WORK CARD IS THE SCHEDULED UNIT. Everything the platform plans,
-- forecasts, urges and dates lives here, not on the deliverable. Sketch and
-- render are separate rows.
create table work_cards (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id),
  mc_number        text not null,          -- work cards attach to the MC group,
                                           -- not to one deliverable (§1.4)
  trello_card_id   text not null,
  trello_url       text,
  name             text not null,
  task_prefix      text,                   -- 'Render Asset', 'Icon Clean Up'

  -- ---- owned by Trello, written by Sirius (W1/W2/W3/W4) ----
  difficulty       text,                   -- from the `Difficulty: …` label
  work_type        text,                   -- from a `Category: Specific` label.
                                           -- THE forecast axis alongside
                                           -- difficulty — NOT the lane. BR-4
  urgency          text,                   -- presence of the `Urgent` label;
                                           -- absence means non-urgent
  trello_due       date,                   -- the deadline, set on THIS card
  unit_label       text,                   -- W4; assigned from an existing
                                           -- board label, never created
  current_list     text,
  stage            text,
  figma_url        text,
  work_started_at  timestamptz,
  work_done_at     timestamptz,

  -- ---- owned by Sirius: the plan ----
  sprint_id        uuid references sprints(id),
                                           -- STORED, not derived: rollover
                                           -- moves cards across sprints and
                                           -- membership must follow the card
  slotted_week     date,                   -- Monday. The PM's grain
  start_day        date,                   -- the design lead's grain. Defaults
                                           -- to the week's first working day;
                                           -- must stay inside slotted_week
  confidence       text not null default '0.7',   -- per-row percentile
  status_note      text,

  active           boolean not null default true,
  unique (project_id, trello_card_id),
  check (start_day is null or slotted_week is null
         or (start_day >= slotted_week and start_day < slotted_week + 7))
);
create index on work_cards (project_id, mc_number);
create index on work_cards (project_id, slotted_week);
create index on work_cards (project_id, start_day);

-- ⚠️ COLUMN NAMES ABOVE ARE THE REQUIREMENT, NOT THE IMPLEMENTATION.
-- This tab was built before the doc caught up, so Engineering's live schema is
-- authoritative on naming. What is NOT negotiable is that every one of these
-- facts hangs off the work card: urgency, difficulty, work type, deadline,
-- unit label, sprint, week, start day and confidence.
```

⚠️ **That `check` constraint is the design lead's week bound, expressed in the
schema.** The UI hides invalid days and the API refuses them, but a constraint is
the only place the rule cannot be bypassed. Worth having all three.

---
```sql
-- ============ intake ============

create table intake_requests (
  project_id  uuid not null references projects(id),
  mc_number   text not null,
  sheet_row   int not null,
  name        text not null,
  requestor   text,
  asset_type  text,
  unit        text,                       -- was use_case; parsed from the
                                          -- sheet's `Business Unit` column
  brief       text,
  deadline    date,
  in_frost_prod boolean,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  active      boolean not null default true,
  primary key (project_id, mc_number)
);

create table intake_rejects (
  project_id uuid not null references projects(id),
  sheet_row  int not null,
  raw        text,
  reason     text,
  seen_at    timestamptz not null default now(),
  primary key (project_id, sheet_row)
);

-- Frost's own annotations on an intake row. Never written to the sheet.
create table frost_notes (
  project_id  uuid not null references projects(id) on delete cascade,
  mc_number   text not null,
  clarify     boolean not null default false,
  reason      text,
  remark      text,
  updated_by  citext not null,
  updated_at  timestamptz not null default now(),
  primary key (project_id, mc_number)
);

-- ============ the model ============

create table card_events (
  id             bigserial primary key,
  project_id     uuid not null references projects(id),
  trello_card_id text not null,
  source_event_id text not null,          -- idempotency key
  from_list      text,
  to_list        text,
  occurred_at    timestamptz not null,
  unique (source_event_id)
);
create index on card_events (project_id, trello_card_id, occurred_at);

-- ⚠️ KEYED ON WORK TYPE, NOT LANE. Corrected 2026-09-09 after a 17,986-card
-- audit: the lane says where a card sat, a label says what the work was.
-- `metric` is gone — review time is retired (BR-1b), so design time is the
-- only thing measured.
create table model_samples (
  id           bigserial primary key,
  project_id   uuid not null references projects(id),
  trello_card_id text,
  difficulty   text not null,
  work_type    text not null,             -- 'Design: Screen Cascade' etc.
  days         numeric not null,
  completed_at timestamptz not null,
  -- ⚠️ Samples under 15 MINUTES are DISCARDED, not clamped. 26.3% of finished
  -- work cards measured under an hour — cards dragged working→done in one
  -- gesture. Contaminated cells keep climbing as the floor rises and never
  -- settle, so the floor is a judgement the data cannot make for itself.
  trusted      boolean not null default true
);
create index on model_samples (project_id, difficulty, work_type, completed_at);

create table model_grid (
  project_id  uuid references projects(id),  -- NULL = the firm-wide standard
  difficulty  text not null,
  work_type   text not null,
  confidence  text not null,              -- Average | 0.7 | 0.85 | 0.95
  value       numeric not null,
  sample_n    int not null,
  -- ⚠️ A borrowed value is NOT a measurement. Every Content and Motion cell
  -- currently borrows. Keep the distinction visible or someone quotes a
  -- placeholder to a client.
  borrowed_from text,
  computed_at timestamptz not null default now()
);
-- ⚠️ NOT a primary key: project_id is nullable (NULL = the firm-wide standard)
-- and Postgres will not accept a NULL inside a PK. Postgres 16 gives us the
-- right tool:
create unique index on model_grid (project_id, difficulty, work_type, confidence)
  nulls not distinct;
-- 134 cells exist firm-wide. A PROJECT layer overrides a cell only where that
-- project clears two weeks of its own data; everything thinner keeps the firm
-- figure.

create table throughput_grid (
  project_id  uuid not null references projects(id),
  difficulty  text not null,
  p25 int, p50 int, p70 int,
  computed_at timestamptz not null default now(),
  primary key (project_id, difficulty)
);

-- ⚠️ `conflict_acknowledgements` IS DELETED, not parked. Ruled 2026-09-07.
-- Conflicts were withdrawn entirely and replaced by a count, and a count never
-- needs dismissing. Rows were archived by migration rather than dropped; the
-- four routes are gone. DO NOT REINTRODUCE THIS TABLE.

-- ⚠️ `milestone_day_plan` IS REPLACED by work_cards.start_day.
-- It was keyed on "MC-805:Sketch" — a deliverable plus a phase — which is the
-- retired unit. The day now belongs to a work card, is set by the design lead
-- in Deadlines alone, and is bounded by the card's assigned week. A null day
-- means "the week's first working day", NOT "follow the forecast": a computed
-- finish is not something the lead chooses.

-- ============ audit ============

create table audit_log (
  id         bigserial primary key,
  project_id uuid references projects(id),
  actor      citext,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index on audit_log (project_id, entity, entity_id, at desc);

create table sync_runs (
  id          bigserial primary key,
  project_id  uuid references projects(id),
  source      text not null,              -- ares | sheet | trello_write
  ok          boolean not null,
  stats       jsonb,
  error       text,
  at          timestamptz not null default now()
);
```

⚠️ **`audit_log.actor` must accept `system`.** Rollover moves cards, and business-unit
tagging may fire on ingestion — **the first two writes with no human behind them.**
Every other row has a person.

### 1.4 Four schema decisions worth defending in review

**`mc_number` is not a key.** Verified on the live board: 15 MC numbers carry more than one `Main Card`, and MC-825 carries 99. Identity is `(project_id, trello_card_id)`; `display_id` is what humans read.

**Work cards attach to the MC, not to a deliverable.** Only 1 of 27 task titles matched a deliverable title, so there is no dependable parent edge. Modelling one would silently mis-assign work.

**The work card is the scheduled unit, and the schema has to say so.** ⚠️ This section previously defended
acknowledgement keying — a dead decision, the table having been deleted. What replaces it is the more consequential
one: **urgency, difficulty, work type, deadline, sprint, week, start day and confidence all hang off `work_cards`,
never off `deliverables`.** A request can carry an urgent screen and non-urgent assets, so one value on the parent
cannot be true. Modelling any of them on the deliverable reintroduces the unit the rework removed.

**`card_events` is not optional.** Cycle time is measured in fractional days from Trello activity. Storing only two dates gives a coarser dataset than your history and the two stop being comparable — which would break the model refresh that fixes the forecast.

### 1.5 Migrations

Version-controlled from the first line. Prisma or Drizzle; both generate migrations from a schema file. No DDL applied by hand against production, ever.

---

## 2. Application stack

### 2.1 Node — yes, and TypeScript

**The reason is specific, not fashion.** The forecast engine is already JavaScript and already validated against the workbook and against ARES movement data across several rounds of correction. `forecast()`, `workday()`, `weekLoad()` and `cardWeight()` are pure functions with no React dependency — they move to `lib/` unchanged and keep behaviour you have already checked. ⚠️ **`toFriday()` is retired** (it implemented the withdrawn Friday render rule, BR-1a) and **`suggestPlan()` is dormant** — port it, do not wire it. A port to Python or Go re-opens exactly the date-arithmetic risk you have paid to close.

**TypeScript, not plain JS.** `deadline` being sometimes-a-string-sometimes-null has already caused bugs in the prototype, twice. Types pay for themselves here in weeks.

If your team is genuinely stronger in Python, the honest path is FastAPI plus a golden-file suite: run both implementations over 500 real cards and assert identical dates. About a week, and it settles the argument properly. Do not port casually.

---
### 2.2 Shape

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js, App Router** | Prototype components port over; API routes host the sync endpoints; SSR keeps a 5,000-card pipeline fast |
| Language | TypeScript, `strict` | |
| ORM | Prisma or Drizzle | Typed queries, versioned migrations |
| Auth | Auth.js (NextAuth), Google provider | You add the `hd` verification and allow-list lookup |
| Jobs | Separate worker service | Sync must never run inside a request |
| Validation | Zod at every API boundary | Never trust a body |
| Tests | Vitest | Forecast tests are the highest-value ones you will write |

### 2.3 Repository

```
sirius/
├── app/
│   ├── (app)/                    # authenticated shell
│   │   ├── requests/  pipeline/  schedules/  deadlines/
│   │   └── admin/                # user access, admins only (5th tab)
│   └── api/
│       ├── requests/             # intake read
│       ├── deliverables/         # pipeline read
│       ├── schedule/             # slot to a WEEK, pin
│       │                         # (bulk replot went with conflicts)
│       ├── day-plan/             # the design lead's day, Deadlines only
│       ├── writes/               # all four write paths (§5.3)
│       │                         # urgency · due date · difficulty · unit tag
│       └── sync/                 # worker-triggered, OIDC-protected
├── lib/
│   ├── forecast.ts               # empirical model (the live one)
│   ├── forecast.legacy.ts        # ported workbook formula — tests only, not exported to UI
│   ├── model.ts                  # grid lookup + refresh
│   ├── planner.ts                # weekLoad, cardWeight, WEIGHTS, HARD_MIX
│   │                             # + suggestPlan — DORMANT, not wired to UI
│   ├── calendar.ts               # workday, holidays, Manila tz
│   │                             # (toFriday RETIRED — BR-1a)
│   ├── trello.ts                 # mapping + the four writes
│   └── sheets.ts                 # service-account read
├── worker/
│   ├── syncAres.ts  syncIntake.ts  refreshModel.ts
├── prisma/schema.prisma
└── scripts/migrate-open-cards.ts
```

Lift `lib/forecast.ts`, `lib/planner.ts` and `lib/calendar.ts` verbatim from `frost-sirius-v1.jsx`. They are the tested part.

### 2.4 What not to do

Don't split into a static SPA plus a separate API domain. It adds CORS, token handling in the browser, and a second deployment for no benefit at this size. One Next.js app, server-rendered, session in an httpOnly cookie.

---

## 3. Infrastructure

### 3.1 Where

**Cloud Run + Cloud SQL**. Frost owns the system, the Trello workspace and the intake sheet; OD-8 is only about which environment it runs in.

The deciding factor is credentials. An attached service account means the Sheets reader needs **no key file at all** — nothing to commit, forward, or find in a backup. That is the single biggest practical security win available, and it only exists on Google infrastructure.

Vercel + Neon is faster to stand up but puts client roadmap data with a third party, which may not survive a vendor review at v2. If GCash ends up owning the system, their platform and their release process apply instead.

### 3.2 Topology

```
Cloud Run: sirius-web        Next.js, min instances 1, public, SSO-gated
Cloud Run: sirius-worker     sync + scheduled jobs, no public ingress
Cloud SQL: Postgres 16       private IP, automated backups, PITR
Secret Manager               Trello write token, session secret, DB password
Cloud Scheduler              ares 15min · intake 15min · model nightly · health daily
Cloud Logging                with an exclusion filter dropping brief text
Artifact Registry            container images
```

Two service accounts, deliberately separate:

| Identity | Scope | Used by |
|---|---|---|
| `sirius-sheets-reader` | `spreadsheets.readonly`, Viewer on each intake sheet | worker |
| `sirius-scheduler` | invoke the worker only | Cloud Scheduler |

The Trello **write** token is a third credential and does not belong to either — see §5.3.

### 3.3 Environments

| Env | Data | Trello | Sheets |
|---|---|---|---|
| local | seed | duplicate board | CSV fixture |
| staging | prod copy | **duplicate board** | copy of the sheet |
| production | live | live | live |

Staging must point at a **duplicate Trello board**. **All four write paths are real**: a staging test against the live board would relabel and re-date real cards. *(Per-project observation mode is the second line of defence, not the first.)*

### 3.4 Config

```
DATABASE_URL=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_HD=frostdesigngroup.com

ARES_API_URL=                 # OD-1 resolved 2026-08-03: ARES pushes on change
ARES_WEBHOOK_SECRET=          # ~37s end to end, 15-min poll as fallback
TRELLO_API_KEY=
TRELLO_WRITE_TOKEN=           # dedicated integration account, §5.3
INTAKE_SHEET_IDS=             # per project, from the projects table
APP_BASE_URL=
```

Sheets needs no credential variable — Application Default Credentials resolve the attached identity.

---

## 4. Authentication

```ts
// auth.ts
callbacks: {
  async signIn({ profile }) {
    if (!profile?.email_verified) return false;
    if (profile.hd !== process.env.ALLOWED_HD) return false;
    if (profile.email?.split("@")[1] !== process.env.ALLOWED_HD) return false;
    const u = await db.user.findUnique({ where: { email: profile.email } });
    return !!u?.active;
  },
}
```

Four checks, all server-side: verified email, `hd` claim, matching email domain, and an active allow-list row. The prototype's browser check is a UX affordance, not this.

Every API route re-checks the session and the caller's project membership. Hiding a tab is not access control.

---

## 5. Integrations

### 5.1 ARES — the Trello read

✅ **OD-1 was RESOLVED on 2026-08-03** — this section previously presented three undecided options and said the phase was gated on it. ARES pushes on every Trello change, measured at **37 seconds end to end**, with a 15-minute poll as automatic fallback if push goes quiet.

⚠️ **Sirius depends on ARES's `lastPolledAt`** for its reconcile guard. ARES's own 2026-08-02 survey still lists that field as *"written in three places and read by none"* — it is not. If it is removed, Sirius stops reconciling **silently**.

**Two endpoints shipped 2026-09-09** and remove work Sirius was about to do itself:

- `GET /api/v1/trello/boards/:boardId/lanes` — every list on a board including empty ones, each carrying its type and group, **keyed by list ID so a rename does not break the mapping.** This replaces any locally maintained lane table.
- `?include=segments` on the cycle-time route — each done card's full list timeline, so a card that loops through review reports both working stretches instead of losing the first.

Sirius needs: cards (id, name, list, labels, due, attachments), lists, and card movements. Filter by `trello_board_id` **and** `trello_label` where the project sets one.

```ts
// worker/syncAres.ts — shape, not final
const cards = await ares.cards({ boardId: p.trello_board_id });
const scoped = p.trello_label
  ? cards.filter(c => c.labels.some(l => l.name === p.trello_label))
  : cards;
const { deliverables, workCards, unlinked } = mapTrello(scoped, lists);
```

### 5.2 Intake sheet — the read

Per `sirius-live-sheet-runbook.md`. Three gotchas that will each cost an afternoon: pad ragged rows before positional parsing, convert serial dates from the 1899-12-30 epoch, and disambiguate the two columns named `Type` by position.

### 5.3 Trello — the four writes

Sirius makes exactly four writes, all to Trello. Everything else is read-only.

**1 — Urgency label**

```ts
export async function setUrgency(cardId: string, boardId: string, urgent: boolean) {
  const labelId = await ensureUrgentLabel(boardId);
  return urgent
    ? trello.post(`/cards/${cardId}/idLabels`, { value: labelId })
    : trello.delete(`/cards/${cardId}/idLabels/${labelId}`);
}
```

Absence of the label means non-urgent, so there is no second state to keep in sync.
⚠️ **No `Non-Urgent` label is ever created.** Miles asked; the answer is no. Two
labels would produce four conditions including a contradictory "both", and turn a
one-call write into a two-call transaction.

**2 — Card due date**

```ts
export async function setDue(cardId: string, iso: string | null) {
  // 17:00 Manila by default; preserve an existing time of day if there is one.
  return trello.put(`/cards/${cardId}`, { due: iso });
}
```

⚠️ **Called from SPRINT SCHEDULES, on a work card** — this line used to say
Pipeline, which is now read-only plain text for the deadline (build spec §4.2).
There is **no Sirius-local override layer** — precedence is Trello → sheet by
construction, so a date changed by a designer in Trello flows back on the next push
without a reconciliation rule.

**3 — Card difficulty**

```ts
export async function setDifficulty(cardId: string, boardId: string, level: Difficulty) {
  const next = await ensureDifficultyLabel(boardId, level);
  // Add first, then remove the stale one — the card is never left without a
  // difficulty. If the removal fails, roll back by removing the label just added.
  await trello.post(`/cards/${cardId}/idLabels`, { value: next });
  return removeStaleDifficultyLabels(cardId, next);
}
```

Difficulty lives as a `Difficulty: …` label, so the write is a swap rather than
a field set. Add-first is deliberate: the worst case leaves a visible double
label that the next ARES read reconciles, rather than a card silently stranded
with no difficulty and therefore unforecastable.

**4 — Classification tagging (W4)**

Authorised by BRD v2.9. **Business unit only**, written as a label. Pillar and use case are out of scope for v1.

```ts
export async function setClassification(cardId: string, boardId: string, tag: string) {
  // LOOK UP ONLY. There is deliberately no ensureClassificationLabel().
  const labelId = await findBoardLabel(boardId, tag);
  if (!labelId) throw new UnknownClassificationLabel(boardId, tag);
  return trello.post(`/cards/${cardId}/idLabels`, { value: labelId });
}
```

⚠️ **The absence of an `ensure*` helper is the control, not an omission.** W4
assigns labels that already exist and **never creates one.** A tag with no
matching board label **throws and is surfaced** — it is a board-configuration
problem with a person to fix it, not a gap for the product to close.

Creating one silently would put the taxonomy's authorship inside a tool nobody
audits, and **duplicate labels on the board are precisely the failure that moved
tagging off the ARES Pipeline Viewer** in the first place.

⚠️ **Scope of the never-creates rule — do not overstate it.** W1 and W3 call
`ensureUrgentLabel` and `ensureDifficultyLabel`, which are create-if-absent by
name. Those are bounded: **two label families the registry itself enumerates**
(`Urgent`, `Difficulty: …`). The correct statement is therefore *Sirius creates
only the labels the registry names, and never a classification label* — **not**
*Sirius never creates a label*, which the code would contradict. Anyone writing
the security narrative should use the former.

**My #94 question stands: do those two helpers actually create when absent?** If
they only look up, the stronger product-wide claim is true and I will restore it
everywhere.

**All four must observe the same rules, and they are recorded, not assumed:**

- The token needs write scope. Trello cannot scope a token per board, so use a
  **dedicated integration account** holding membership of the Design Support
  boards only — never a personal admin token. A leak then exposes those boards
  rather than everything that person can see.
- Optimistic in the UI, **rolled back on failure**. Sirius never displays a state
  Trello does not hold.
- Every write of any of the four produces an `audit_log` row with actor, field
  and time, and each is no-op guarded — an edit that changes nothing writes
  nothing and records nothing.
- Writes are gated **per project**: a project in observation mode refuses all
  writes server-side, and the corresponding controls render read-only.
- **A fifth write requires an amendment to the BRD and the security readiness
  doc, not a code change.** The enumerated-write posture is quoted in both, and
  in the vendor assessment.

### 5.3a Capacity, from ARES

Capacity is not computed by Sirius. ARES already publishes it per project at
`steering.deliveryForecast.referenceWeeks` — least productive, typical and most productive week by card count — plus
`effectiveWeeklyRate` and 30 weeks of `weeklyPairs`. The sync copies those into `projects` on each run so a PM's manual
override is visible against a current baseline rather than a stale one.

Note the caveat: reference weeks count all cards on the board, including ops cards. ⚠️ **Sirius plans work cards, not deliverables**, so the unit is far closer than when this caveat was written — but ops cards are excluded from Sirius's own counts by identity, so the two still differ.

⚠️ **Both the capacity figure and the hard-mix ceiling (8.3% / 12.9%) predate the work-card rework.** If their denominator was deliverables and is now work-card rows, the thresholds do not mean what they meant — and both drive tinting the PM plans against. **Confirm before pilot.**

### 5.3b Day plan API

⚠️ **Rewritten 2026-09-10.** The previous version keyed on `"MC-805:Sketch"` — a deliverable plus
a phase, which is the retired unit — and exposed the day wherever it was called.

Two endpoints, both project-scoped and session-authenticated:

```
GET  /api/day-plan?project=:id   -> { plan: { "<work_card_id>": "2026-08-06", … } }
PUT  /api/day-plan               <- { project, workCardId, day }
```

⚠️ **This is the DESIGN LEAD'S endpoint and the only way a day is ever set.** Sprint Schedules
places at week grain and renders the day read-only; no PM-facing route may write it.

**The server must refuse a day that is not all four of these** — the UI hides them, but the rule
lives here:

```
inside the card's assigned week   ·  inside the sprint's dates
no later than the card's deadline ·  a working day (ARES calendar)
```

Refuse with the condition that failed, in its own words. A `null` day resets to the week's first
working day — **not** to the forecast finish.

The client writes optimistically and rolls back on failure, so no user ever sees a placement the
server does not hold. Each write produces an `audit_log` row — who moved what, and when.

**Rollover is the one exception to all of the above**, because it is a system action rather than a
gesture: it moves a card forward a working day, crosses week and sprint boundaries, and carries
sprint membership with it. Its actor is `system`.

*Day capacity — the week's capacity across non-holiday days by largest remainder — is recorded but
has no surface, the day planner it served having been retired. Whether it survives is open.*

### 5.3c Frost notes API

```
GET  /api/frost-notes?project=:id  -> { notes: { "MC-805": { clarify, reason, remark } } }
PUT  /api/frost-notes              <- { project, mc, note }
```

Same optimistic-with-rollback pattern as the day plan. These are Frost-internal
and must never reach the intake sheet — the read-only Sheets scope enforces it.

### 5.4 Model refresh

Nightly, per project, over `model_window_months`:

1. Read movements from `card_events` — ⚠️ **request the FULL history explicitly.** Trello defaults
   to the **50 most recent** list moves and says nothing. Cards that churn most are the slow ones,
   so this silently recorded **the slowest work as fast**. Also record whether the response came
   back exactly full, so a truncated history is visible rather than silent.
2. Derive **design time only** (working-lane dwell). ⚠️ Review time is retired — do not derive it.
3. **Discard samples under 15 minutes**, do not clamp them.
4. Compute percentiles by `difficulty × work_type` — ⚠️ **not by lane, and there is no `metric`
   axis any more.**
5. Compute the **project layer**: the same key plus the project, overriding the firm-wide cell
   **only** where that project clears two weeks of its own data.
6. **Borrow for untrusted cells** — from the same work type at a difficulty that passed, then from
   clean cells in the same category, then from all clean work at that difficulty. Record what was
   borrowed from; a borrowed figure is not a measurement.
7. Write `model_grid` and `throughput_grid`, and record the delta from the previous run.

Step 7's delta matters: a grid that shifts sharply overnight means the input changed, and someone should look.

**Two checks that the method works, worth re-running after any change:** 13 categories had a median
under an hour and none should · **45 of 48 work types run Easy < Medium < Hard**, even though
nothing enforces it. The Easy : Medium : Hard ratio holds at roughly **1 : 1.6 : 2.5** whatever
sample floor is chosen.

---

## 6. Deployment pipeline

```
push to main
  → typecheck · lint · vitest · dependency audit
  → build container
  → migrate staging · deploy staging · smoke test
  → manual approval
  → migrate production · deploy production
```

Nothing reaches production without its migration having run against staging first. The smoke test should include the authorization matrix — a non-Frost session hitting each endpoint and getting 403.

---

## 7. Local development

```bash
git clone … && cd sirius && npm install
docker compose up -d postgres          # local db
cp .env.example .env.local             # fill in
npx prisma migrate dev
npm run seed                           # fixture cards + a CSV intake fixture
npm run dev
```

Seed from fixtures, never from a production dump. Real briefs on a developer laptop is exactly how roadmap data escapes.

---

## 8. Sequence

| Order | Work | Why this order |
|---|---|---|
| 1 | Schema + migrations | `project_id` everywhere from the start |
| 2 | Auth + audit log | Before any write path exists |
| 3 | Port `lib/` + golden tests | The tested part, moved intact |
| 4 | ARES read + mapping | ~~Blocked on OD-1~~ — **resolved 2026-08-03** |
| 5 | Intake sync | Independent of 4 |
| 6 | Model refresh + validation | **Gate: dates the PM recognises** |
| 7 | UI, four tabs | Cheapest — the prototype resolved the design |
| 8 | Trello writes: **urgency label · card due date · difficulty label · unit tag** | Last; the complete set of four, each needing its own review, all on one dedicated token |
| ~~8a~~ | ~~Conflict acknowledgements~~ | **WITHDRAWN.** Conflicts were removed and the table deleted 2026-09-07 |
| 9 | Security testing, pilot | |

Item 6 is a gate, not a task. Building UI on an uncalibrated model produces a board where everything reads late, and that costs you the team's trust once.

---

## 9. Estimates

⚠️ **Historical.** All seven build steps are complete and live; this table is kept for the record
and for sizing comparable work, not as a plan. Two line items below no longer exist.

| Item | Days |
|---|---|
| Schema, migrations, seed | 3 |
| Auth, allow-list, audit | 4 |
| Port lib + golden tests | 4 |
| ARES integration + mapping | 6 |
| Intake sync | 4 |
| Model refresh + validation | 4 |
| UI — four tabs | 10 |
| Writes (×4) + rollback + audit | 2 |
| ~~Conflict acknowledgements~~ | ~~1~~ · **withdrawn** |
| Day plan storage + API | 1 |
| Infra, IaC, pipeline | 4 |
| Security testing + remediation | 5 |
| Migration + pilot support | 8 |
| **Total** | **~58 days ≈ 12 weeks** |

One full-stack developer, excluding the two weeks of Phase 0 decisions and calibration. Two developers compress the middle to about nine weeks; the gates do not parallelise.

---
