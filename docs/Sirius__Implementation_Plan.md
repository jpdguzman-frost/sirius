# Frost: Sirius — Engineering Implementation

**Supersedes** `frost-sirius-build-plan.md`, which predates the ARES findings, multi-project scope, the empirical model and the urgency write path.

Current as of 3 August 2026, aligned to BRD v2.2.

Companion to BRD v2.0 (*what*) and the roadmap (*when*). This is *how*.

---

## 1. Database

### 1.1 Postgres, managed

The data is relational: projects own cards, cards own work cards, work cards accumulate events, forecasts join a model table, everything is queried by date range and filtered by project. A document store would mean hand-rolling joins you get free here, and percentile recalculation is SQL's home ground.

**Cloud SQL for Postgres** if you host on Google, which §3 recommends. Never on the same instance as the app.

### 1.2 Two rules that shape everything

**Every table carries `project_id`.** Sirius is multi-project from day one. Retrofitting tenancy is the same class of change as retrofitting authentication — possible, reliably painful. Put it in the first migration.

**Ownership is explicit in the schema.** Some columns come from Trello, some from the intake sheet, some from Sirius itself. Group and comment them so the write path can refuse anything it doesn't own. The one exception — urgency — is called out below.

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
-- Length varies; a deliverable belongs to whichever sprint contains its
-- slotted week. Overlaps are rejected; gaps are legal and surfaced.
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
  difficulty        text check (difficulty in ('Easy','Medium','Hard')),
  lane              text,                        -- design | ops | assets
  blocker           text,                        -- from 🛑 labels
  figma_url         text,
  labels            text[] not null default '{}',
  trello_due        date,
  trello_synced_at  timestamptz not null default now(),

  -- ---- the one field Sirius writes back (see §5.3) ----
  urgency           text not null default 'Non-Urgent',

  -- ---- from the intake sheet, joined on mc_number ----
  sheet_deadline    date,
  use_case          text,
  brief             text,
  requestor         text,

  -- ---- owned by Sirius ----
  slotted_week      date,                        -- Monday; null = unscheduled
  pinned            boolean not null default false,
  confidence        text not null default '0.7',
  sla_sketch        numeric,
  sla_render        numeric,
  status_note       text,

  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (project_id, trello_card_id)
);

create index on deliverables (project_id, slotted_week);
create index on deliverables (project_id, mc_number);
create index on deliverables (project_id, active);

-- effective deadline: Trello wins where set, else the sheet
create view deliverables_v as
  select *, coalesce(trello_due, sheet_deadline) as deadline,
         case when trello_due is not null then 'trello'
              when sheet_deadline is not null then 'sheet' end as deadline_source
  from deliverables;

create table work_cards (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id),
  mc_number        text not null,          -- tasks attach to the MC group,
                                           -- not to one deliverable (§1.4)
  trello_card_id   text not null,
  trello_url       text,
  name             text not null,
  task_prefix      text,                   -- 'Render Asset', 'Icon Clean Up'
  difficulty       text,
  current_list     text,
  stage            text,
  figma_url        text,
  work_started_at  timestamptz,
  work_done_at     timestamptz,
  active           boolean not null default true,
  unique (project_id, trello_card_id)
);
create index on work_cards (project_id, mc_number);

-- ============ intake ============

create table intake_requests (
  project_id  uuid not null references projects(id),
  mc_number   text not null,
  sheet_row   int not null,
  name        text not null,
  requestor   text,
  asset_type  text,
  use_case    text,
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

create table model_samples (
  id           bigserial primary key,
  project_id   uuid not null references projects(id),
  trello_card_id text,
  difficulty   text not null,
  lane         text not null,
  metric       text not null,             -- design | review
  days         numeric not null,
  completed_at timestamptz not null
);
create index on model_samples (project_id, difficulty, lane, metric, completed_at);

create table model_grid (
  project_id  uuid not null references projects(id),
  difficulty  text not null,
  lane        text not null,
  metric      text not null,
  confidence  text not null,              -- Average | 0.7 | 0.85 | 0.95
  value       numeric not null,
  sample_n    int not null,
  computed_at timestamptz not null default now(),
  primary key (project_id, difficulty, lane, metric, confidence)
);

create table throughput_grid (
  project_id  uuid not null references projects(id),
  difficulty  text not null,
  p25 int, p50 int, p70 int,
  computed_at timestamptz not null default now(),
  primary key (project_id, difficulty)
);

-- Conflicts can be acknowledged rather than resolved. The key includes the
-- cards involved, so an acknowledgement lapses when the situation changes.
create table conflict_acknowledgements (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  conflict_key  text not null,          -- week|rule|card:phase|card:phase…
  acknowledged_by citext not null,
  reason        text,
  at            timestamptz not null default now(),
  unique (project_id, conflict_key)
);

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

### 1.4 Three schema decisions worth defending in review

**`mc_number` is not a key.** Verified on the live board: 15 MC numbers carry more than one `Main Card`, and MC-825 carries 99. Identity is `(project_id, trello_card_id)`; `display_id` is what humans read.

**Work cards attach to the MC, not to a deliverable.** Only 1 of 27 task titles matched a deliverable title, so there is no dependable parent edge. Modelling one would silently mis-assign work.

**Acknowledgements are keyed on the situation, not the rule.** `conflict_key` is `week | rule | sorted card:phase
pairs`. Adding, removing or replotting a card produces a different key and the conflict resurfaces. Storing an
acknowledgement against the rule alone would let a warning be switched off permanently by accident.

**`card_events` is not optional.** Cycle time is measured in fractional days from Trello activity. Storing only two dates gives a coarser dataset than your history and the two stop being comparable — which would break the model refresh that fixes the forecast.

### 1.5 Migrations

Version-controlled from the first line. Prisma or Drizzle; both generate migrations from a schema file. No DDL applied by hand against production, ever.

---

## 2. Application stack

### 2.1 Node — yes, and TypeScript

**The reason is specific, not fashion.** The forecast engine is already JavaScript and already validated against the workbook and against ARES movement data across several rounds of correction. `forecast()`, `forecastSmart()`, `workday()`, `toFriday()`, `weekLoad()` and `suggestPlan()` are pure functions with no React dependency — they move to `lib/` unchanged and keep behaviour you have already checked. A port to Python or Go re-opens exactly the date-arithmetic risk you have paid to close.

**TypeScript, not plain JS.** `deadline` being sometimes-a-string-sometimes-null has already caused bugs in the prototype, twice. Types pay for themselves here in weeks.

If your team is genuinely stronger in Python, the honest path is FastAPI plus a golden-file suite: run both implementations over 500 real cards and assert identical dates. About a week, and it settles the argument properly. Do not port casually.

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
│   │   ├── requests/  pipeline/  schedules/  deadlines/  forecast/
│   └── api/
│       ├── requests/             # intake read
│       ├── deliverables/         # pipeline read
│       ├── schedule/             # slot, pin, bulk replot
│       ├── urgency/              # THE write path (§5.3)
│       └── sync/                 # worker-triggered, OIDC-protected
├── lib/
│   ├── forecast.ts               # empirical model (the live one)
│   ├── forecast.legacy.ts        # ported workbook formula — tests only, not exported to UI
│   ├── model.ts                  # grid lookup + refresh
│   ├── planner.ts                # suggestPlan, weekLoad, WEIGHTS, HARD_MIX
│   ├── calendar.ts               # workday, toFriday, holidays, Manila tz
│   ├── trello.ts                 # mapping + the single write
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

**Cloud Run + Cloud SQL**, assuming Frost owns the system (BRD OD-8).

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

Staging must point at a **duplicate Trello board**. The urgency write path is real: a staging test against the live board would relabel real cards.

### 3.4 Config

```
DATABASE_URL=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_HD=frostdesigngroup.com

ARES_DATABASE_URL=            # or ARES_API_URL + token, per OD-1
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

**OD-1 is the open question and gates this phase.** Three viable answers, in order of preference:

1. **Read-only Postgres role on ARES's database** — cheapest, no new surface, but couples the two schemas.
2. **A small read API on ARES** — cleaner boundary, needs ARES-side work.
3. **Scheduled replication into Sirius tables** — most isolated, most moving parts.

Whichever it is, Sirius needs: cards (id, name, list, labels, due, attachments), lists, and card movements. Filter by `trello_board_id` **and** `trello_label` where the project sets one.

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

### 5.3 Trello — the one write

Urgency is the only thing Sirius writes anywhere. It adds or removes a single label named `Urgent` on a single card; absence means non-urgent.

```ts
export async function setUrgency(cardId: string, boardId: string, urgent: boolean) {
  const labelId = await ensureUrgentLabel(boardId);
  return urgent
    ? trello.post(`/cards/${cardId}/idLabels`, { value: labelId })
    : trello.delete(`/cards/${cardId}/idLabels/${labelId}`);
}
```

**This changes the security posture and must be recorded, not slipped in.**

- The token needs write scope, which Trello does not scope per-board. Use a **dedicated integration account** that is a member of the Design Support boards only — never a personal admin token. A leaked token then exposes those boards, not everything that person can see.
- Write is optimistic in the UI and **rolls back on failure**, so Sirius never displays a state Trello does not hold.
- Every call writes an `audit_log` row and a `sync_runs` row.
- BRD §9 currently says write is impossible by permission. That is no longer true. Amend it before the vendor assessment rather than after.

### 5.3a Capacity, from ARES

Capacity is not computed by Sirius. ARES already publishes it per project at
`steering.deliveryForecast.referenceWeeks` — least productive, typical and most productive week by card count — plus
`effectiveWeeklyRate` and 30 weeks of `weeklyPairs`. The sync copies those into `projects` on each run so a PM's manual
override is visible against a current baseline rather than a stale one.

Note the caveat: reference weeks count all cards on the board, including work cards and ops cards. Sirius plans
deliverables, so the true deliverable-level typical is lower. Revise `weekly_capacity` once ARES can report
deliverable-only completions.

### 5.4 Model refresh

Nightly, per project, over `model_window_months`:

1. Read movements from `card_events`
2. Derive design time (working-lane dwell) and review time (dwell in *Sent for Client Review*)
3. Compute percentiles by `difficulty × lane × metric`
4. Compute throughput percentiles per difficulty
5. Write `model_grid` and `throughput_grid`, and record the delta from the previous run

Step 5's delta matters: a grid that shifts sharply overnight means the input changed, and someone should look.

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

Matches the roadmap's phases:

| Order | Work | Why this order |
|---|---|---|
| 1 | Schema + migrations | `project_id` everywhere from the start |
| 2 | Auth + audit log | Before any write path exists |
| 3 | Port `lib/` + golden tests | The tested part, moved intact |
| 4 | ARES read + mapping | Blocked on OD-1 |
| 5 | Intake sync | Independent of 4 |
| 6 | Model refresh + validation | **Gate: dates the PM recognises** |
| 7 | UI, five tabs | Cheapest — the prototype resolved the design |
| 8 | Urgency write | Last; the only write, needs its own review and a dedicated token |
| 8a | Conflict acknowledgements | Small, but must reach the audit log |
| 9 | Security testing, pilot | |

Item 6 is a gate, not a task. Building UI on an uncalibrated model produces a board where everything reads late, and that costs you the team's trust once.

---

## 9. Estimates

| Item | Days |
|---|---|
| Schema, migrations, seed | 3 |
| Auth, allow-list, audit | 4 |
| Port lib + golden tests | 4 |
| ARES integration + mapping | 6 |
| Intake sync | 4 |
| Model refresh + validation | 4 |
| UI — five tabs | 12 |
| Urgency write + rollback + audit | 2 |
| Conflict acknowledgements | 1 |
| Infra, IaC, pipeline | 4 |
| Security testing + remediation | 5 |
| Migration + pilot support | 8 |
| **Total** | **~57 days ≈ 11–12 weeks** |

One full-stack developer, excluding the two weeks of Phase 0 decisions and calibration. Two developers compress the middle to about nine weeks; the gates do not parallelise.
