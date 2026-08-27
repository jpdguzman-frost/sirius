/**
 * Mongoose models — the 15 collections translated 1:1 from Implementation
 * Plan §1.3 (see specs/001-sirius-v1/data-model.md; the SQL appendix there is
 * the content authority these schemas are audited against), plus push_events
 * (contracts/ares-push.md, added 2026-08-04).
 *
 * Rules that shape everything:
 *  - Every collection carries project_id; audit_log/sync_runs allow null per
 *    the source schema (invariant 1).
 *  - mc_number is NOT unique — identity is (project_id, trello_card_id);
 *    MC-825 carries 99 deliverables (invariant 3).
 *  - Work cards attach to the MC group, never to one deliverable (invariant 4).
 *  - Date-ONLY fields are 'YYYY-MM-DD' strings (Asia/Manila calendar days);
 *    timestamps are Date (UTC). Workday math lives in lib/calendar.ts only
 *    (invariant 11).
 *  - Indexes are declared here; migrations create them (scripts/migrate/).
 */

import mongoose, { Schema } from 'mongoose';

const { ObjectId, Mixed } = Schema.Types;

/** Date-only value: an Asia/Manila calendar day, never a UTC instant. */
const DATE_ONLY = {
  type: String,
  validate: {
    // null is a legal "no date" (sync $sets null explicitly; mongoose runs
    // custom validators on null, unlike undefined)
    validator: (v: string | null) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    message: 'date-only fields are YYYY-MM-DD strings (Manila calendar days)',
  },
};

const projectRef = { type: ObjectId, ref: 'Project', required: true };

// ============ projects ============

const projectSchema = new Schema(
  {
    code: { type: String, required: true }, // 'rt-837', mirrors ARES
    name: { type: String, required: true },
    client: String,
    status: { type: String, required: true, default: 'ongoing' },

    // sources
    trello_board_id: { type: String, required: true },
    trello_label: String, // 5 of 26 boards serve several projects; null = whole board
    intake_sheet_id: String,
    intake_sheet_gid: String,
    intake_sheet_tab: String,

    // G7 observation mode (2026-08-12): a project onboarded read-only refuses
    // the write registry (W1/W2) until JP flips it — absent/true = writes on
    writes_enabled: { type: Boolean, default: true },

    // Capacity lock (owl #23, JP-endorsed 2026-08-17): a locked project refuses
    // PATCH /capacity with 403 CAPACITY_LOCKED. Admin-only toggle; absent/false
    // = unlocked, so every pre-flag project keeps its slider. NOTE the polarity
    // is the mirror of writes_enabled above: the truth test is `=== true`
    // (locked), never `!== false`.
    capacity_locked: { type: Boolean, default: false },

    // planning settings — cards/week, seeded from ARES referenceWeeks (BR-6a)
    weekly_capacity: { type: Number, required: true },
    ref_week_least: Number,
    ref_week_typical: Number,
    ref_week_most: Number,
    effective_weekly_rate: Number,
    model_window_months: { type: Number, required: true, default: 12 },

    created_at: { type: Date, default: Date.now },
  },
  { collection: 'projects' },
);
projectSchema.index({ code: 1 }, { unique: true });

// ============ sprints ============

const sprintSchema = new Schema(
  {
    project_id: projectRef,
    name: { type: String, required: true },
    starts_on: { ...DATE_ONLY, required: true },
    ends_on: { ...DATE_ONLY, required: true },
    position: { type: Number, required: true },
  },
  { collection: 'sprints' },
);
sprintSchema.pre('validate', function () {
  if (this.starts_on && this.ends_on && this.ends_on < this.starts_on) {
    throw new Error('sprint ends_on must be >= starts_on');
  }
});
sprintSchema.index({ project_id: 1, starts_on: 1 });
sprintSchema.index({ project_id: 1, position: 1 }, { unique: true });

// ============ people ============

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: String,
    active: { type: Boolean, required: true, default: true },
    // FR-10: admins manage the allow-list from the Admin tab. Promote/demote
    // is CLI-only (scripts/allowlist.ts ADMIN=1) — the panel manages members.
    is_admin: { type: Boolean, required: true, default: false },
    last_login_at: Date,
  },
  { collection: 'users' },
);
userSchema.index({ email: 1 }, { unique: true });

const userProjectSchema = new Schema(
  {
    user_id: { type: ObjectId, ref: 'User', required: true },
    project_id: projectRef,
  },
  { collection: 'user_projects' },
);
userProjectSchema.index({ user_id: 1, project_id: 1 }, { unique: true });

// ============ deliverables ============

const deliverableSchema = new Schema(
  {
    project_id: projectRef,

    mc_number: String, // NOT unique: MC-825 has 99
    display_id: { type: String, required: true }, // 'MC-655.3'

    // ---- owned by Trello ----
    trello_card_id: { type: String, required: true },
    trello_url: String,
    name: { type: String, required: true },
    current_list: String,
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'] },
    lane: String, // design | ops | assets
    blocker: String, // from 🛑 labels
    figma_url: String,
    labels: { type: [String], required: true, default: [] },
    trello_due: DATE_ONLY,
    trello_due_at: Date, // raw due instant from ARES — preserves time-of-day on W2 writes
    trello_synced_at: { type: Date, required: true, default: Date.now },
    /* When the CARD was created in Trello — the pipeline's natural order
       ("order of filing", owl #62). NOT `created_at` below: that is when the
       Sirius row was created, which on the real board stamps 289 of the rows
       with the single day the board was onboarded and would make the default
       order a meaningless tie. ARES carries this on every card. Absent until
       a card has been re-read after migration 008, and an absent value sorts
       LAST like every other empty (owl #62). */
    trello_created_at: Date,

    // Derived from THIS card's movements (worker/syncAres.deriveWorkSpans),
    // never the MC group's — the row's Started/Done columns (2026-08-13 spec).
    work_started_at: Date,
    work_done_at: Date,

    // ---- written back by Sirius (write registry W1), reconciled from the
    // ---- Urgent label on every sync (FR-9.5) — Trello is the truth
    urgency: { type: String, required: true, default: 'Non-Urgent' },

    // The instant Sirius last wrote ANY registry-owned field on this card
    // (urgency, due, difficulty). The reconcile compares it against the
    // instant its ARES read was ISSUED and declines to overwrite those three
    // fields with a payload that predates the write — otherwise a read taken
    // mid-write reverts the user's change (product owl #50, 2026-08-18).
    // Absent = Sirius has never written this card, which reconciles normally.
    registry_written_at: Date,

    // ---- from the intake sheet, joined on mc_number ----
    sheet_deadline: DATE_ONLY,
    use_case: String,
    brief: String,
    requestor: String,
    asset_type: String, // FR-4.1 "type" — joined 2026-08-12 (phase 13)

    // ---- owned by Sirius ----
    slotted_week: DATE_ONLY, // Monday; null = unscheduled
    pinned: { type: Boolean, required: true, default: false },
    confidence: { type: String, required: true, default: '0.7' },
    sla_sketch: Number,
    sla_render: Number,
    status_note: String,

    active: { type: Boolean, required: true, default: true },
    created_at: { type: Date, required: true, default: Date.now },
    updated_at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'deliverables' },
);
deliverableSchema.pre('save', function () {
  if (!this.isNew) this.updated_at = new Date();
});
deliverableSchema.index({ project_id: 1, trello_card_id: 1 }, { unique: true });
deliverableSchema.index({ project_id: 1, slotted_week: 1 });
deliverableSchema.index({ project_id: 1, mc_number: 1 });
deliverableSchema.index({ project_id: 1, active: 1 });
/* The Pipeline's default order, by the card's own filing date. Declared HERE
   and not only in migration 008: every other index in this codebase is on the
   schema and applied through `Model.syncIndexes()`, which DROPS anything it
   does not find here — so an index created only by a raw `createIndex` would
   be silently removed by the next migration that follows the pattern. The name
   matches 008's so syncIndexes adopts the existing one rather than rebuilding
   it. */
deliverableSchema.index({ project_id: 1, trello_created_at: -1 }, { name: 'project_filed_desc' });

// ============ work cards ============

const workCardSchema = new Schema(
  {
    project_id: projectRef,
    mc_number: { type: String, required: true }, // tasks attach to the MC group (invariant 4)
    trello_card_id: { type: String, required: true },
    trello_url: String,
    name: { type: String, required: true },
    task_prefix: String, // 'Render Asset', 'Icon Clean Up'
    difficulty: String,
    current_list: String,
    stage: String,
    figma_url: String,
    // W2 on task cards (JP 2026-08-18, contracts/trello-write.md §W2 scope
    // clarification): the same field pair as the deliverable, down to the
    // DATE_ONLY recipe — the task half must reject the malformed date the
    // deliverable half would.
    trello_due: DATE_ONLY,
    trello_due_at: Date,
    // the same stale-reconcile guard as the deliverable — a task card's due is
    // registry-owned too, so the same read-mid-write revert applies to it
    registry_written_at: Date,
    work_started_at: Date,
    work_done_at: Date,
    active: { type: Boolean, required: true, default: true },
  },
  { collection: 'work_cards' },
);
workCardSchema.index({ project_id: 1, trello_card_id: 1 }, { unique: true });
workCardSchema.index({ project_id: 1, mc_number: 1 });

// ============ intake ============

const intakeRequestSchema = new Schema(
  {
    project_id: projectRef,
    mc_number: { type: String, required: true },
    sheet_row: { type: Number, required: true },
    name: { type: String, required: true },
    requestor: String,
    asset_type: String,
    use_case: String,
    year: Number, // optional sheet timing columns — absent on older tabs
    month: String, // raw sheet name, e.g. 'January'
    brief: String,
    deadline: DATE_ONLY,
    in_frost_prod: Boolean,
    first_seen_at: { type: Date, required: true, default: Date.now },
    last_seen_at: { type: Date, required: true, default: Date.now },
    active: { type: Boolean, required: true, default: true },
  },
  { collection: 'intake_requests' },
);
intakeRequestSchema.index({ project_id: 1, mc_number: 1 }, { unique: true });

const intakeRejectSchema = new Schema(
  {
    project_id: projectRef,
    sheet_row: { type: Number, required: true },
    raw: String,
    reason: String,
    seen_at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'intake_rejects' },
);
intakeRejectSchema.index({ project_id: 1, sheet_row: 1 }, { unique: true });

// ============ the model ============

const cardEventSchema = new Schema(
  {
    project_id: projectRef,
    trello_card_id: { type: String, required: true },
    source_event_id: { type: String, required: true }, // idempotency key
    from_list: String,
    to_list: String,
    occurred_at: { type: Date, required: true },
  },
  { collection: 'card_events' },
);
cardEventSchema.index({ source_event_id: 1 }, { unique: true });
cardEventSchema.index({ project_id: 1, trello_card_id: 1, occurred_at: 1 });

const modelSampleSchema = new Schema(
  {
    project_id: projectRef,
    trello_card_id: String,
    difficulty: { type: String, required: true },
    lane: { type: String, required: true },
    metric: { type: String, required: true }, // design | review
    days: { type: Number, required: true },
    completed_at: { type: Date, required: true },
  },
  { collection: 'model_samples' },
);
modelSampleSchema.index({ project_id: 1, difficulty: 1, lane: 1, metric: 1, completed_at: 1 });

const modelGridSchema = new Schema(
  {
    project_id: projectRef,
    difficulty: { type: String, required: true },
    lane: { type: String, required: true },
    metric: { type: String, required: true },
    confidence: { type: String, required: true }, // Average | 0.7 | 0.85 | 0.95
    value: { type: Number, required: true },
    sample_n: { type: Number, required: true },
    computed_at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'model_grid' },
);
modelGridSchema.index(
  { project_id: 1, difficulty: 1, lane: 1, metric: 1, confidence: 1 },
  { unique: true },
);

const throughputGridSchema = new Schema(
  {
    project_id: projectRef,
    difficulty: { type: String, required: true },
    p25: Number,
    p50: Number,
    p70: Number,
    computed_at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'throughput_grid' },
);
throughputGridSchema.index({ project_id: 1, difficulty: 1 }, { unique: true });

// ============ conflict acknowledgements ============
// Keyed on the situation: week | rule | capacity | sorted card:phase pairs
// (invariant 13 v4.3.0). The key is composed in ONE place — src/services/
// conflicts.ts — and is opaque everywhere else: a superseded ack simply stops
// matching and its row stays put (a non-match is not a state change).

const conflictAckSchema = new Schema(
  {
    project_id: projectRef,
    conflict_key: { type: String, required: true },
    acknowledged_by: { type: String, required: true, lowercase: true, trim: true },
    reason: String,
    at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'conflict_acknowledgements' },
);
conflictAckSchema.index({ project_id: 1, conflict_key: 1 }, { unique: true });

// ============ audit ============
// Append-only: the audit writer service (src/services/audit) exposes insert
// only; no update/delete code path exists anywhere (invariant 10).

const auditLogSchema = new Schema(
  {
    project_id: { type: ObjectId, ref: 'Project' }, // nullable per source schema
    actor: { type: String, lowercase: true, trim: true },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entity_id: String,
    before: Mixed,
    after: Mixed,
    at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'audit_log' },
);
auditLogSchema.index({ project_id: 1, entity: 1, entity_id: 1, at: -1 });

// ============ push events ============
// ARES push notifications (contracts/ares-push.md): the receiver persists and
// answers 202; the WORKER drains — sync never runs inside a request. Events
// are triggers, not truth: the drain re-reads the card from the ARES read API.

const pushEventSchema = new Schema(
  {
    project_id: projectRef,
    event_id: { type: String, required: true }, // ARES ULID — idempotency key
    type: { type: String, required: true }, // card.changed | card.created | board.resync
    board_id: { type: String, required: true },
    card_id: String, // absent on board.resync
    occurred_at: { type: Date, required: true },
    received_at: { type: Date, required: true, default: Date.now },
    status: { type: String, required: true, default: 'pending' }, // pending | done | failed
    error: String,
  },
  { collection: 'push_events' },
);
pushEventSchema.index({ event_id: 1 }, { unique: true });
pushEventSchema.index({ project_id: 1, status: 1, received_at: 1 });
pushEventSchema.index({ received_at: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // TTL 7d

// ============ frost notes (FR-11, added 2026-08-12) ============
// One Sirius-owned annotation per intake request, keyed (project_id,
// mc_number) — a multi-deliverable MC carries ONE note. Never written to the
// intake sheet (FR-11.2): no Sheets write path exists anywhere (invariant 2).

const frostNoteSchema = new Schema(
  {
    project_id: projectRef,
    mc_number: { type: String, required: true },
    remark: String,
    clarify: { type: Boolean, required: true, default: false },
    clarify_reason: String,
    updated_by: { type: String, required: true, lowercase: true, trim: true },
    updated_at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'frost_notes' },
);
frostNoteSchema.index({ project_id: 1, mc_number: 1 }, { unique: true });

// ============ milestone day plan (FR-12, added 2026-08-12) ============
// A Mon–Fri day choice for one deliverable phase. `week` records the Monday
// the placement was made for: day placement never changes the week (FR-12.3),
// and when the milestone's computed week no longer matches, the placement has
// lapsed and reads as absent — follow the forecast (FR-12.6).

const milestoneDayPlanSchema = new Schema(
  {
    project_id: projectRef,
    trello_card_id: { type: String, required: true },
    phase: { type: String, required: true, enum: ['sketch', 'render'] },
    day: { ...DATE_ONLY, required: true },
    week: { ...DATE_ONLY, required: true },
    set_by: { type: String, required: true, lowercase: true, trim: true },
    set_at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'milestone_day_plan' },
);
milestoneDayPlanSchema.index({ project_id: 1, trello_card_id: 1, phase: 1 }, { unique: true });

/**
 * SPRINT ITEMS — the scheduled row. The unit is the WORK CARD (owl #72; BRD
 * v2.7 BR-1a), not the deliverable.
 *
 * A Sirius-owned planning decision, so it lives in its own collection rather
 * than as fields on `work_cards`, exactly as `milestone_day_plan` does. Three
 * reasons, all from #72:
 *
 *  1. **Nothing is auto-populated.** A row exists only because the PM added
 *     it. A field on the synced mirror would have to encode "not scheduled"
 *     as an absence, and every sync would have to be careful not to clobber
 *     it. A row that only exists when someone made it cannot be clobbered.
 *  2. **A row STAYS once the card completes.** It is the record of what was
 *     planned. Tying it to a mirror that follows Trello's own lifecycle would
 *     eventually lose it.
 *  3. It is a planning decision, which is the only thing Sirius owns.
 *
 * `starts_on` is OPTIONAL and that is the design, not laxity: adding a card to
 * a sprint list and plotting its bar are two separate acts (#72 §6, #74 §1).
 * Added-but-not-plotted is a real, visible state — the row shows in Sprint
 * Schedules with no bar and the violet + waiting, and it is ABSENT from
 * Deadlines until plotted.
 *
 * One row per card: `(project_id, trello_card_id)` is unique. #72's "one row =
 * one task card = one bar" is the rule, and identity is the pair (invariant 3).
 */
const sprintItemSchema = new Schema(
  {
    project_id: projectRef,
    /* Which sprint's LIST the row appears under. Set by the insertion point —
       the + belongs to a specific sprint, so the row lands in that one and
       never in a default (#72 §4). Independent of `starts_on`: the list says
       where the row is read, the date says where the bar is drawn. */
    sprint_id: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    /* The MC group the card carries. Denormalised from the work card so the
       list can group without a second read; work cards attach to the MC group
       and never to one deliverable (invariant 4). */
    mc_number: { type: String, required: true },
    /* The WORK CARD's Trello id — the unit. Not a deliverable id. */
    trello_card_id: { type: String, required: true },
    /* The PM's click: the bar's left edge, and the only date they set. The
       finish is computed (#72 §6) — a duration would need a drag, and the bar
       and the FORECASTED column must never be able to disagree. Absent until
       the row is plotted. */
    starts_on: DATE_ONLY,
    /* Order within the sprint's list. */
    position: { type: Number, required: true, default: 0 },
    added_by: { type: String, required: true, lowercase: true, trim: true },
    added_at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'sprint_items' },
);
sprintItemSchema.index({ project_id: 1, trello_card_id: 1 }, { unique: true });
sprintItemSchema.index({ project_id: 1, sprint_id: 1, position: 1 });
/* The load reads a whole project's rows in `position` order. Without this the
   compound index above cannot serve it — `position` is not a usable prefix
   when only `project_id` is bound — so Mongo does a blocking in-memory sort.
   Harmless at PM-authored row counts; it is here so it stays harmless. */
sprintItemSchema.index({ project_id: 1, position: 1 });

const syncRunSchema = new Schema(
  {
    project_id: { type: ObjectId, ref: 'Project' }, // nullable per source schema
    source: { type: String, required: true }, // ares | sheet | trello_write
    ok: { type: Boolean, required: true },
    stats: Mixed,
    error: String,
    at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'sync_runs' },
);
syncRunSchema.index({ project_id: 1, at: -1 });

// ============ exports ============

export const Project = mongoose.model('Project', projectSchema);
export const Sprint = mongoose.model('Sprint', sprintSchema);
export const User = mongoose.model('User', userSchema);
export const UserProject = mongoose.model('UserProject', userProjectSchema);
export const Deliverable = mongoose.model('Deliverable', deliverableSchema);
export const WorkCard = mongoose.model('WorkCard', workCardSchema);
export const IntakeRequest = mongoose.model('IntakeRequest', intakeRequestSchema);
export const IntakeReject = mongoose.model('IntakeReject', intakeRejectSchema);
export const CardEvent = mongoose.model('CardEvent', cardEventSchema);
export const ModelSample = mongoose.model('ModelSample', modelSampleSchema);
export const ModelGrid = mongoose.model('ModelGrid', modelGridSchema);
export const ThroughputGrid = mongoose.model('ThroughputGrid', throughputGridSchema);
export const ConflictAcknowledgement = mongoose.model('ConflictAcknowledgement', conflictAckSchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export const SyncRun = mongoose.model('SyncRun', syncRunSchema);
export const PushEvent = mongoose.model('PushEvent', pushEventSchema);
export const FrostNote = mongoose.model('FrostNote', frostNoteSchema);
export const MilestoneDayPlan = mongoose.model('MilestoneDayPlan', milestoneDayPlanSchema);
export const SprintItem = mongoose.model('SprintItem', sprintItemSchema);

export const ALL_MODELS = [
  Project,
  Sprint,
  User,
  UserProject,
  Deliverable,
  WorkCard,
  IntakeRequest,
  IntakeReject,
  CardEvent,
  ModelSample,
  ModelGrid,
  ThroughputGrid,
  ConflictAcknowledgement,
  AuditLog,
  SyncRun,
  PushEvent,
  FrostNote,
  MilestoneDayPlan,
  SprintItem,
];
