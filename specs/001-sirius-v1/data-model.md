# Data Model — Sirius v1 (Phase 1)

The schema below is **reproduced byte-for-byte from `docs/Sirius__Implementation_Plan.md` §1.3**. It is the schema — not a starting point. The Prisma schema (`prisma/schema.prisma`) must express exactly this; migrations are version-controlled from the first line and no DDL is ever applied by hand against production (§1.5).

Two rules shape everything (§1.2): **every table carries `project_id`** (multi-project from the first migration), and **ownership is explicit in the schema** — Trello-owned, sheet-owned, and Sirius-owned columns are grouped and commented so the write path can refuse anything it doesn't own. The one exception — urgency — is called out inline.

## Schema (Implementation Plan §1.3, verbatim)

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

## Schema decisions worth defending in review (§1.4, verbatim)

**`mc_number` is not a key.** Verified on the live board: 15 MC numbers carry more than one `Main Card`, and MC-825 carries 99. Identity is `(project_id, trello_card_id)`; `display_id` is what humans read.

**Work cards attach to the MC, not to a deliverable.** Only 1 of 27 task titles matched a deliverable title, so there is no dependable parent edge. Modelling one would silently mis-assign work.

**Acknowledgements are keyed on the situation, not the rule.** `conflict_key` is `week | rule | sorted card:phase
pairs`. Adding, removing or replotting a card produces a different key and the conflict resurfaces. Storing an
acknowledgement against the rule alone would let a warning be switched off permanently by accident.

**`card_events` is not optional.** Cycle time is measured in fractional days from Trello activity. Storing only two dates gives a coarser dataset than your history and the two stop being comparable — which would break the model refresh that fixes the forecast.

## Entity → spec traceability

| Table / view | Spec entity | Key requirements |
|---|---|---|
| `projects` | Project | FR-1.1–1.5, BR-6a (capacity fields) |
| `sprints` | Sprint | FR-5.14–5.15, BR-5 |
| `users`, `user_projects` | Allow-list + membership | FR-2.4–2.5, AC-2, AC-3 |
| `deliverables`, `deliverables_v` | Deliverable | FR-4.x, BR-9 (deadline precedence in the view), invariant 3 |
| `work_cards` | Work card | FR-4.2, invariant 4 (attach to MC group) |
| `intake_requests`, `intake_rejects` | Intake request | FR-3.x, FR-8.4, AC-6, AC-9 |
| `card_events` | Card event | FR-4.5, BR-2 (model raw material; idempotent on `source_event_id`) |
| `model_samples`, `model_grid`, `throughput_grid` | Model grids | FR-7.3, FR-7.6, FR-7.7, BR-2/BR-4 |
| `conflict_acknowledgements` | Conflict acknowledgement | FR-6.7–6.8, BR-9a, invariant 13 |
| `audit_log` | Audit log entry | FR-2.6, NFR-7, invariant 10 |
| `sync_runs` | Sync run | FR-8.5–8.6, invariant 8 |
