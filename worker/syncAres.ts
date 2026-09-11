/**
 * syncAres (T029, T032) — reads Trello data from the ARES API (never Trello
 * directly, FR-8.1), maps per taxonomy, upserts scoped to the project.
 * Idempotent: re-running against unchanged data changes nothing; movements
 * dedupe on a synthesized source_event_id (the API exposes no event id).
 * Every run writes a sync_runs document, success or failure; a failure
 * leaves last good data untouched (FR-8.5, AC-19).
 */

import { Types } from 'mongoose';
import { AresClient, type AresBoardLane, type AresMovement } from '../src/services/ares.ts';
import { assignDisplayIds, mapTrello, type MappedDeliverable, type MappedWorkCard } from '../src/services/mapper.ts';
import { classifyList, isKnownList, normalizeListName } from '../src/services/status-rules.ts';
import { CardEvent, Deliverable, Project, SyncRun, WorkCard } from '../src/models/index.ts';
import type { Env } from '../src/config/env.ts';
import { assertNotProductionBoards } from '../src/services/guard.ts';

/** The excluded lane that is still a backlog: a move into it starts nothing. */
const OPS_BACKLOG = normalizeListName('Operations Backlog');

export interface SyncStats {
  cards: number;
  deliverables: number;
  workCards: number;
  unlinked: number;
  events: number;
  eventsInserted: number;
  workSpans: number;
  deactivated: number;
  /**
   * Cards whose registry reconcile was SKIPPED because ARES sent no usable
   * fetch instant (see `fetchedAtOf`). Expected to be 0 forever. A non-zero
   * count means `lastPolledAt` has gone missing from the ARES payload and
   * urgency, due dates and difficulty have quietly stopped reconciling — the
   * skip is deliberate and safe, but silence about it would not be.
   */
  unstamped: number;
  /**
   * Every DISTINCT list name this run saw that the §7a enumeration does not
   * recognise — sorted, deduplicated, verbatim as ARES spelled it. §7a's
   * safety net, in one line: "an unmapped lane must be SURFACED, never guessed
   * at." `classifyList` still answers `ongoing` for these so the app renders,
   * but that answer is a fallback and this is the record that it was used.
   *
   * ARES-sourced names ONLY — the card's current list and both ends of every
   * movement. Nothing Sirius stores itself lands here, so a non-empty array is
   * always a question for the board, never for our own data.
   *
   * Expected to be small and stable. Known today on the production board and
   * left unknown deliberately: `For Archive`, `For Client Approval`,
   * `Hard Deadline: Monday Mar. 23`, `NOTE`, `On Hold: Ryse, NBG` — none is a
   * workflow state and §7a settles none of them. A SIXTH name appearing is the
   * signal this array exists for.
   */
  unmappedLists: string[];
  /**
   * The same question asked of the BOARD'S OWN LANE TABLE rather than of the
   * cards — every distinct lane name ARES reports for this board that the §7a
   * enumeration does not recognise, sorted, deduplicated, verbatim (block 8
   * item 11; the promise owls #11/#13 exchanged).
   *
   * **This is not a duplicate of `unmappedLists`, and the difference is the
   * whole point.** `unmappedLists` can only see a name once a CARD sits in it —
   * by which time the app has already classified that card `ongoing` as a
   * fallback and shown somebody a state nobody ruled. The lane table is
   * Apollo's id-keyed record of every lane on the board, cards or none, so an
   * unruled lane surfaces BEFORE the first card lands in it. A lane with no
   * cards appears here and nowhere else; a busy unruled lane appears in both,
   * which is not a bug — the two arrays answer two different questions.
   *
   * Names only. Apollo's table is keyed by Trello list id and also carries
   * type/group/isStart/isDone — a SECOND taxonomy, deliberately not consumed
   * here: §7a's name table stays the only source of STATE (status-rules.ts).
   */
  unknownLanes: string[];
  /**
   * When ARES last synced the lane table of each board this run read, by board
   * id — its own `syncedAt`, passed through untouched. `null` means the check
   * did not run against a live table: ARES has never synced that board's lanes
   * (the endpoint's documented "never synced", which is NOT "no lanes"), or the
   * read failed, or it 404'd. So an EMPTY `unknownLanes` beside a `null` here
   * is "we did not look", never "every lane is ruled" — the two must be read
   * together, which is why the instant is recorded rather than assumed.
   */
  lanesSyncedAt: Record<string, string | null>;
  /**
   * How many lanes the table actually held, by board id — `null` when there
   * was no table to count (read failed, threw, or 404'd).
   *
   * The third value the pair above cannot express (review A4-F6, 2026-09-10).
   * `unknownLanes: []` beside a stamped `lanesSyncedAt` reads as "we looked at
   * every lane and each one is ruled" — but an EMPTY table with a perfectly
   * good `syncedAt` produces the identical row, and it means the opposite:
   * nothing was checked. `0` here separates them, and the day 86 lanes become
   * 3 the count is the only thing that says so.
   */
  lanesSeen: Record<string, number | null>;
  capacity: Record<string, number | null> | null;
}

/**
 * Collects the distinct unrecognised names of one sync run — list names off the
 * cards and movements, lane names off the board's lane table, each into its own
 * collector. Empty and absent names are not collected: "the card is in no list"
 * is a different fact from "the card is in a list we cannot classify", and
 * mixing them would put a meaningless `''` in front of product every run.
 */
function collectUnmapped(): { see: (name: string | null | undefined) => void; names: () => string[] } {
  const seen = new Set<string>();
  return {
    see: (name) => {
      if (typeof name !== 'string' || name.trim() === '') return;
      if (!isKnownList(name)) seen.add(name);
    },
    names: () => [...seen].sort(),
  };
}

/**
 * The board's lane table, or `null` — the lane reconcile check NEVER fails a
 * sync (block 8 item 11). One extra ARES call per PROJECT per run (see the
 * call site: boards shared by several projects are read once per project, not
 * once per board), no retry of our own: `AresClient.get` already honours one
 * 429 `retryAfter`, and the pacing of the paged reads around it is unchanged.
 *
 * The check is a REPORT about the board, while the sync is the app's whole
 * dataset; letting a report take the dataset down would be a plainly bad
 * trade. A throw is caught as well as the contract's `null` because "never
 * throws" is a promise made by another module: if it is ever broken, this must
 * degrade to "we did not look", not to a whole project skipping its sync for
 * the day.
 *
 * ⚠️ **It does not warn — the CALLER does** (review A4-F1, 2026-09-10). The
 * contract answers `null` for 404, 500, network and Zod drift alike and throws
 * for none of them, so a warn that lived only in this `catch` covered the one
 * path the contract forbids and stayed silent on every path it actually
 * produces. The reason travels back as `error` so the one warn can name it
 * when there is one; both shapes of failure reach the same line.
 */
type LaneRead = { table: { lanes: AresBoardLane[]; syncedAt: string | null } | null; error: string | null };

async function readBoardLanes(client: AresClient, boardId: string): Promise<LaneRead> {
  try {
    return { table: await client.boardLanes(boardId), error: null };
  } catch (err) {
    return { table: null, error: (err as Error).message };
  }
}

export function makeClient(env: Env): AresClient {
  if (!env.ARES_URL || !env.ARES_API_KEY) throw new Error('[syncAres] ARES_URL and ARES_API_KEY are required');
  return new AresClient({ baseUrl: env.ARES_URL, apiKey: env.ARES_API_KEY });
}

const sourceEventId = (m: AresMovement) =>
  `${m.cardId}|${m.fromList ?? ''}|${m.toList ?? ''}|${m.detectedAt}`;

/**
 * A due instant from the wire, or null — NEVER an Invalid Date (review pass
 * 2026-08-18): `new Date(garbage)` yields Invalid Date, Mongoose's cast
 * throws at updateOne, and one malformed ARES string then aborts the whole
 * project's sequential sync loop every tick until the source changes. A
 * malformed instant degrades to "no due", which the next good read heals.
 * The date-only twin is guarded at the source (mapper's dateOnly).
 */
function dueInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The stale-reconcile guard (product owl #50, 2026-08-18; **clock corrected
 * 2026-08-25**). Reconciliation is read-then-write, so there is a window in
 * which the ARES payload in hand predates a registry write that has since
 * landed. Overwriting inside that window silently reverts the value the user
 * just set and watched stick — the ONE failure in this area that shows a
 * wrong value rather than merely looking untidy.
 *
 * ⚠️ **The window is NOT the moment we issued the request, and using that was
 * a real defect.** ARES never reads Trello at request time: `getCard()` is a
 * `findOne` against its own materialised store, filled by a 15-minute poll
 * and by a webhook that re-fetches a changed card within seconds. So a
 * payload can predate our write however recently we asked for it. Compared
 * against issue-time the guard passed exactly when it should have stopped:
 *
 *     ARES fetches card at 10:00 · user edits at 10:05 · reconcile at 10:06
 *     10:05 < 10:06 → guard passes → the 10:00 payload reverts the edit.
 *
 * It compares against `trello_polled_at` — ARES's own `lastPolledAt`, the
 * instant IT fetched the card from Trello. Both of ARES's writers stamp it
 * through one shared `buildCardDoc`, so it follows whichever path last
 * fetched and stays correct under either cadence, or any future one. That is
 * the point: a measured fetch time needs no assumption about how often ARES
 * runs, and the 15-minute figure is never load-bearing.
 *
 * The guard is a FILTER, not an expression: a registry-owned field is written
 * only when Sirius's own last write is no newer than that fetch. Time-bounded
 * by construction, no expiry — the next FETCH after the write is
 * authoritative again, so invariant 8 keeps its promise: a manual change made
 * in Trello still surfaces, at most one reconcile later.
 *
 * Absent `registry_written_at` (every card Sirius has never written, i.e.
 * nearly all of them) passes, so no backfill and no migration are needed —
 * the field's absence already means "never written by us".
 *
 * Deliberately NOT an aggregation-pipeline update, which would fold both
 * writes into one op: in pipeline form every `$set` value is an EXPRESSION,
 * so a Trello card named `$name` would resolve to a field path instead of
 * storing its own title. Two plain updates cost one extra round trip per card
 * and cannot be read wrong.
 */
function staleGuard(fetchedAt: Date | null) {
  // ⚠️ NO FETCH INSTANT NARROWS THE GUARD, IT DOES NOT DISABLE THE WRITE.
  // An early return here was wrong (review, 2026-08-25): on a card Sirius has
  // NEVER written there is provably nothing to protect, and skipping meant a
  // brand-new Urgent card was created with the schema's Non-Urgent default and
  // no deadline — manufacturing the exact "a value the user did not choose"
  // failure this guard exists to prevent. The never-written branch below was
  // always the answer for those cards; unknown freshness must not make it
  // unreachable.
  const neverWritten = { registry_written_at: { $exists: false } };
  if (!fetchedAt) return neverWritten;
  // STRICTLY older, so a same-millisecond tie counts as stale and the write is
  // left alone. The two mistakes are not equally bad: skipping a good reconcile
  // costs one cycle of staleness and heals itself, while applying a stale one
  // shows the user a value they did not choose.
  return { $or: [neverWritten, { registry_written_at: { $lt: fetchedAt } }] };
}

/**
 * The registry-owned fields of one mapped card — W1 urgency, W2 due, W3
 * difficulty — as the `$set` the stale-guarded write applies. ONE definition
 * for both card kinds (simplification pass 2026-09-05): the two upserts had
 * byte-identical objects, and the set a stale payload can revert is a property
 * of the registry, not of the collection it lands in. A registry entry gained
 * or dropped here reaches both kinds at once, which is what the write
 * registry's card-kind scope notes already say (contracts/trello-write.md).
 */
function registryFields(card: {
  difficulty?: string;
  trello_due: string | null;
  trello_due_at: string | null;
  urgent: boolean;
}) {
  return {
    difficulty: card.difficulty ?? null,
    trello_due: card.trello_due,
    trello_due_at: dueInstant(card.trello_due_at),
    urgency: card.urgent ? 'Urgent' : 'Non-Urgent',
  };
}

/**
 * The fetch instant for one mapped card, or `null` when ARES did not send one.
 *
 * **`null` means SKIP the registry reconcile, never "fall back to a clock".**
 * Falling back to `new Date()` is precisely the bug `staleGuard` documents,
 * reinstated silently — and a fallback is exactly what a future edit would
 * reach for, so the absence is expressed as a value the caller must handle
 * rather than as a default it can ignore. The asymmetry the guard already runs
 * on decides it: a skipped reconcile costs one cycle and heals, an applied
 * stale one shows a value nobody chose.
 *
 * The parse itself is `dueInstant`'s, deliberately — one definition of
 * "unparseable ISO" per module. Its comment carries why an Invalid Date must
 * never reach Mongoose, and that reasoning applies here identically: this
 * value goes straight into a `$lt`.
 *
 * ARES's own 2026-08-02 audit records `lastPolledAt` as "written in three
 * places and read by none", so a cleanup could remove it. That is why
 * `scripts/ares-probe.mjs` asserts the field on live cards from BOTH endpoints
 * Sirius reads: drift fails the build rather than quietly stopping every
 * reconcile in the app.
 */
function fetchedAtOf(card: { trello_polled_at: string | null }): Date | null {
  return dueInstant(card.trello_polled_at);
}
/**
 * Ownership-safe deliverable upsert — Trello-owned fields only; Sirius-owned
 * planning fields are NEVER touched by sync (§1.2 ownership). Urgency, the due
 * pair and difficulty reconcile FROM Trello via ARES (FR-9.5): a manual change
 * made in Trello surfaces here, and the echo of Sirius's own write is a
 * same-value no-op. Shared by the full board sync and the push drain.
 *
 * ⚠️ **This takes NO clock from its caller, deliberately.** It used to take
 * `readAt`, documented as "required, never defaulted: a caller that passed
 * `new Date()` would disable the guard silently, which is the exact bug it
 * exists to prevent" — and both callers passed exactly that, because a read
 * instant was the only clock they had. The warning was right and did not
 * help. The fetch instant now comes off the payload this function is already
 * given, so there is no argument left to get wrong: the class is gone, not
 * the instance. *
 * @returns whether ARES sent a fetch instant. `false` means the guard ran
 * NARROWED to never-written cards, so every card Sirius has touched kept its
 * registry values rather than reconciling — see `staleGuard`.
 * Reported rather than re-derived by the caller: if the skip ever gains a
 * second reason, a caller predicting it would under-count while this stays
 * correct. **Both callers must consume it** (`syncProject` counts it into
 * `SyncStats.unstamped`, `reconcileCard` into the push drain's outcomes) —
 * a dropped `false` is the silence the counter exists to prevent, and
 * `test/reconcile.test.ts` asserts both call sites read it.
 */
export async function upsertDeliverable(
  projectId: Types.ObjectId,
  d: MappedDeliverable,
  displayId: string | undefined,
): Promise<boolean> {
  const key = { project_id: projectId, trello_card_id: d.trello_card_id };
  await Deliverable.updateOne(
    key,
    {
      $set: {
        name: d.name,
        mc_number: d.mc_number,
        display_id: displayId,
        current_list: d.current_list,
        lane: d.lane,
        blocker: d.blocker ?? null,
        figma_url: d.figma_url ?? null,
        labels: d.labels,
        trello_url: d.trello_url ?? null,
        active: d.active,
        trello_synced_at: new Date(),
        /* owl #62 — the card's own creation instant. Trello-owned but NOT a
           registry field, so it rides the unconditional write rather than the
           stale-guarded one below: a card's creation time cannot change, so
           there is no write of ours for a stale read to revert. Spread
           conditionally — a payload that omits it must not null out a value we
           already hold. */
        ...(d.trello_created_at ? { trello_created_at: new Date(d.trello_created_at) } : {}),
        updated_at: new Date(),
      },
      $setOnInsert: { project_id: projectId, created_at: new Date() },
    },
    { upsert: true },
  );
  // W1 urgency, W2 due, W3 difficulty — the whole write registry, and so the
  // whole set a stale payload can revert. No upsert: the write above made the
  // document exist.
  //
  // No fetch instant narrows the guard to never-written cards (see there); it
  // does not skip the write. The absence is still REPORTED, because unknown
  // freshness means every card Sirius has touched stops reconciling.
  const fetchedAt = fetchedAtOf(d);
  await Deliverable.updateOne(
    { ...key, ...staleGuard(fetchedAt) },
    { $set: registryFields(d) },
  );
  return fetchedAt !== null;
}

/**
 * Ownership-safe work-card upsert — shared by full sync and the push drain.
 * The same two-write shape as the deliverable's: Trello-owned display fields
 * unconditionally, then the registry-owned trio under the stale guard.
 */
export async function upsertWorkCard(
  projectId: Types.ObjectId,
  w: MappedWorkCard,
): Promise<boolean> {
  const key = { project_id: projectId, trello_card_id: w.trello_card_id };
  await WorkCard.updateOne(
    key,
    {
      $set: {
        name: w.name,
        mc_number: w.mc_number,
        task_prefix: w.task_prefix ?? null,
        current_list: w.current_list,
        figma_url: w.figma_url ?? null,
        trello_url: w.trello_url ?? null,
        labels: w.labels, // T179: Trello-owned, not a write-registry target — no stale guard
        active: w.active,
      },
      $setOnInsert: { project_id: projectId },
    },
    { upsert: true },
  );
  // The whole write registry on a task card — W1 urgency and W3 difficulty
  // since owl #78 (2026-09-05), W2 due since 2026-08-18 — and so the whole
  // set a stale payload can revert. Trello-owned, so a manual change in
  // Trello — and every Sirius write's echo — reconciles here (invariant 8),
  // under the same stale guard as the deliverable's (owl #50). Difficulty
  // moved INTO the guarded write with #78: until then it rode the
  // unconditional write above on the reasoning that W3 wrote deliverables
  // only, so nothing here could be reverting a Sirius write. Now it can.
  const fetchedAt = fetchedAtOf(w);
  await WorkCard.updateOne(
    { ...key, ...staleGuard(fetchedAt) },
    { $set: registryFields(w) },
  );
  return fetchedAt !== null;
}

/**
 * Append movements to card_events, idempotent on the synthesized
 * source_event_id (the API exposes no event id) — duplicate keys ARE the
 * dedupe mechanism, not a failure, so the full board sync and the push drain
 * can both insert the same movement. Returns how many rows were new.
 */
export async function insertCardEvents(projectId: Types.ObjectId, movements: AresMovement[]): Promise<number> {
  if (movements.length === 0) return 0;
  try {
    const res = await CardEvent.insertMany(
      movements.map((m) => ({
        project_id: projectId,
        trello_card_id: m.cardId,
        source_event_id: sourceEventId(m),
        from_list: m.fromList,
        to_list: m.toList,
        occurred_at: new Date(m.detectedAt),
      })),
      { ordered: false },
    );
    return res.length;
  } catch (err) {
    const e = err as {
      code?: number;
      writeErrors?: Array<{ code?: number; err?: { code?: number } }>;
      result?: { insertedCount?: number };
      insertedDocs?: unknown[];
    };
    const codes = (e.writeErrors ?? []).map((w) => w.code ?? w.err?.code);
    const allDup = codes.length > 0 ? codes.every((c) => c === 11000) : e.code === 11000;
    if (!allDup) throw err;
    return e.insertedDocs?.length ?? e.result?.insertedCount ?? 0;
  }
}

const SPAN_FIELDS = 'trello_card_id current_list work_started_at work_done_at';

interface SpanCard {
  trello_card_id: string;
  current_list?: string | null;
  work_started_at?: Date | null;
  work_done_at?: Date | null;
}

interface SpanEvent {
  trello_card_id: string;
  to_list?: string | null;
  occurred_at: Date;
}

interface Span {
  started: Date | null;
  done: Date | null;
}

interface PendingSpan extends Span {
  trello_card_id: string;
}

/** Cards whose stored span differs from the derived one — the only writes. */
function pendingSpans(cards: SpanCard[], byCard: Map<string, Span>): PendingSpan[] {
  const out: PendingSpan[] = [];
  for (const c of cards) {
    const s = byCard.get(c.trello_card_id) ?? { started: null, done: null };
    // done is HELD only while the card sits in a done list today — an excluded
    // lane is not one, so a card parked in `Ops Work Complete` reports no DONE
    // date however its history reads (review ruling 2026-09-08)
    const done = classifyList(c.current_list ?? '') === 'done' ? s.done : null;
    if (
      (c.work_started_at?.getTime() ?? null) === (s.started?.getTime() ?? null) &&
      (c.work_done_at?.getTime() ?? null) === (done?.getTime() ?? null)
    ) {
      continue;
    }
    out.push({ trello_card_id: c.trello_card_id, started: s.started, done });
  }
  return out;
}

/** Structural, because Model<TWorkCard> | Model<TDeliverable> is not callable. */
interface SpanWriter {
  bulkWrite(ops: object[]): PromiseLike<unknown>;
}

/** One round trip per collection — the full sync has up to ~5,000 pending. */
async function writeSpans(model: SpanWriter, projectId: Types.ObjectId, pending: PendingSpan[]): Promise<number> {
  if (pending.length === 0) return 0;
  await model.bulkWrite(
    pending.map((c) => ({
      updateOne: {
        filter: { project_id: projectId, trello_card_id: c.trello_card_id },
        update: { $set: { work_started_at: c.started, work_done_at: c.done } },
      },
    })),
  );
  return pending.length;
}

/**
 * Derive work_started_at / work_done_at for deliverable AND work cards, each
 * from its OWN movements — a row's Started/Done is that card's span, never
 * its MC group's (JP 2026-08-12, extended per the 2026-08-13 spec).
 * Started = the card's FIRST move into any lane that is not a Backlog one —
 * ongoing, done or excluded alike, because an ops or discarded lane is still
 * somebody having picked the card up (review ruling 2026-09-08); done = the
 * LATEST move into a done list, kept only while the card currently sits in a
 * done list (moving it back out, or into an excluded lane, clears it).
 * Idempotent: same-value spans write nothing. Shared by the full board sync
 * and the push drain.
 */
export async function deriveWorkSpans(projectId: Types.ObjectId, cardIds?: string[]): Promise<number> {
  const filter: Record<string, unknown> = { project_id: projectId, active: true };
  if (cardIds) filter.trello_card_id = { $in: cardIds };
  const workCards = await WorkCard.find(filter).select(SPAN_FIELDS).lean<SpanCard[]>();
  const mainCards = await Deliverable.find(filter).select(SPAN_FIELDS).lean<SpanCard[]>();
  if (workCards.length === 0 && mainCards.length === 0) return 0;

  const events = await CardEvent.find({
    project_id: projectId,
    trello_card_id: { $in: [...workCards, ...mainCards].map((c) => c.trello_card_id) },
  })
    .select('trello_card_id to_list occurred_at')
    .lean<SpanEvent[]>();

  const byCard = new Map<string, Span>();
  for (const e of events) {
    if (!e.to_list) continue; // a list-less movement is not a move INTO any list
    const cls = classifyList(e.to_list);
    // a move into ANY non-pending lane starts work: an ops or discarded lane is
    // still somebody picking the card up, so it anchors STARTED like an ongoing
    // one. Only a Backlog lane is "not started yet" — including `Operations
    // Backlog`, the one excluded lane that is a backlog by name (§7a excludes
    // it by identity, not because work has begun). Excluded never anchors
    // DONE — that stays the `done` branch below. (Review ruling 2026-09-08;
    // before it, an excluded move was dropped and a card whose history passed
    // through an ops lane lost its true, earlier start.)
    if (cls === 'pending' || normalizeListName(e.to_list) === OPS_BACKLOG) continue;
    const s = byCard.get(e.trello_card_id) ?? { started: null, done: null };
    if (!s.started || e.occurred_at < s.started) s.started = e.occurred_at;
    if (cls === 'done' && (!s.done || e.occurred_at > s.done)) s.done = e.occurred_at;
    byCard.set(e.trello_card_id, s);
  }

  return (
    (await writeSpans(WorkCard, projectId, pendingSpans(workCards, byCard))) +
    (await writeSpans(Deliverable, projectId, pendingSpans(mainCards, byCard)))
  );
}

export async function syncProject(
  client: AresClient,
  project: InstanceType<typeof Project> extends never ? never : { _id: Types.ObjectId; code: string; trello_board_id: string; trello_label?: string | null },
  { movementsFrom }: { movementsFrom?: string } = {},
): Promise<SyncStats> {
  const projectId = project._id;

  // No read instant is stamped here any more (2026-08-25). This loop used to
  // take one clock before the board read and apply it to every card in it —
  // "the widest stale window in the app", as the comment said. Each card now
  // carries the instant ARES fetched THAT card, so the window is per-card and
  // the widest-window problem does not exist to be reasoned about.
  const cards = await client.boardCards(project.trello_board_id);
  const unmapped = collectUnmapped();
  for (const c of cards) unmapped.see(c.currentList);

  /* The lane reconcile check (item 11) — the board's own lane table, read once
     per PROJECT per run, right after its cards. Independent of the cards on
     purpose: a lane nobody has used yet is exactly the one worth naming.

     Once per project, NOT once per board (review A4-F4, 2026-09-10): five of
     the twenty-six projects share a board with another project through
     `trello_label`, and each of them reads that board's table on its own tick
     and records its own copy of the answer. Deliberately not memoised — the
     per-project row is what makes the record answer "was this project's board
     checked this run", and one extra read of a small table per shared board is
     a cheaper thing to own than a cache whose lifetime is a tick. */
  const laneRead = await readBoardLanes(client, project.trello_board_id);
  const laneTable = laneRead.table;
  /* ONE line per run when there was no table to check, at warn (review A4-F1).
     Every failure the contract actually produces — 404, 500, network, Zod
     drift — arrives here as a plain `null`, so without this line the whole
     check could stop working and the only trace would be a `null` in a Mixed
     field that no route and no screen reads. The `unstamped` counter in this
     same file set the precedent: a silent skip is not acceptable, even a safe
     one. */
  if (!laneTable) {
    console.warn(
      `[syncAres] ${project.code}: could not read the lane table for board ${project.trello_board_id} — ` +
        `no lane check this run${laneRead.error ? ` (${laneRead.error})` : ''}. ` +
        'The card-level list check is unaffected.',
    );
  }
  const lanes = collectUnmapped();
  for (const lane of laneTable?.lanes ?? []) lanes.see(lane.name);
  // `null` table and a table ARES has never synced both record `null`: neither
  // is evidence about the board's lanes, and the array beside it is empty in
  // both cases (see `SyncStats.lanesSyncedAt`).
  const lanesSyncedAt: Record<string, string | null> = {
    [project.trello_board_id]: laneTable ? laneTable.syncedAt : null,
  };
  // …and how many lanes that table held, which is the only thing that tells an
  // empty `unknownLanes` apart from an empty TABLE (see `SyncStats.lanesSeen`).
  const lanesSeen: Record<string, number | null> = {
    [project.trello_board_id]: laneTable ? laneTable.lanes.length : null,
  };
  const mapped = mapTrello(cards, project.trello_label ?? null);

  // Stable display ids: existing assignments never reshuffle (invariant 3).
  const existing = await Deliverable.find({ project_id: projectId }).select('trello_card_id display_id');
  const displayIds = assignDisplayIds(
    new Map(existing.map((d) => [d.trello_card_id, d.display_id])),
    mapped.deliverables,
  );

  // Counted, not just skipped: a payload with no fetch instant stops urgency,
  // due dates and difficulty reconciling, and that must never be silent.
  let unstamped = 0;

  const seenDeliverables = new Set<string>();
  for (const d of mapped.deliverables) {
    seenDeliverables.add(d.trello_card_id);
    const reconciled = await upsertDeliverable(projectId, d, displayIds.get(d.trello_card_id));
    if (!reconciled) unstamped++;
  }

  const seenWork = new Set<string>();
  for (const w of mapped.workCards) {
    seenWork.add(w.trello_card_id);
    const reconciled = await upsertWorkCard(projectId, w);
    if (!reconciled) unstamped++;
  }

  if (unstamped > 0) {
    console.warn(
      `[syncAres] ${unstamped}/${mapped.deliverables.length + mapped.workCards.length} cards carried no ARES fetch instant — ` +
        'registry fields did NOT reconcile for them. Check that ARES still sends `lastPolledAt` (contracts/ares-read.md §Freshness).',
    );
  }

  // Cards gone from the board: inactive, never deleted (mirror of FR-8.4).
  const deactivated = await Deliverable.updateMany(
    { project_id: projectId, active: true, trello_card_id: { $nin: [...seenDeliverables] } },
    { $set: { active: false, updated_at: new Date() } },
  );
  await WorkCard.updateMany(
    { project_id: projectId, active: true, trello_card_id: { $nin: [...seenWork] } },
    { $set: { active: false } },
  );

  // Movements → card_events, idempotent on the synthesized key (T032).
  const movements = await client.boardMovements(project.trello_board_id, movementsFrom);
  for (const m of movements) {
    unmapped.see(m.fromList);
    unmapped.see(m.toList);
  }
  const inserted = await insertCardEvents(projectId, movements);

  // Started/Done spans from the freshly appended movements.
  const workSpans = await deriveWorkSpans(projectId);

  // Capacity from ARES steering, behind the adapter (BR-6a, T030).
  const capacity = await client.referenceWeeks(project.code.replace(/^rt-/, ''));
  if (capacity.typical != null || capacity.effectiveWeeklyRate != null) {
    await Project.updateOne(
      { _id: projectId },
      {
        $set: {
          ref_week_least: capacity.least,
          ref_week_typical: capacity.typical,
          ref_week_most: capacity.most,
          effective_weekly_rate: capacity.effectiveWeeklyRate,
        },
      },
    );
  }

  /* ONE line per run, at warn: this is a question for product about the board,
     not an error in the sync, and a per-name log would drown the run. The array
     on the sync_runs row is the durable record — no new collection, no UI. */
  const unmappedLists = unmapped.names();
  if (unmappedLists.length > 0) {
    console.warn(
      `[syncAres] ${project.code}: ${unmappedLists.length} list name(s) the §7a enumeration does not recognise — ` +
        `classified \`ongoing\` as a fallback, not a classification: ${unmappedLists.join(' · ')}`,
    );
  }

  /* The lane check's own ONE line per run, deliberately worded apart from the
     list line above: these names come from the board's lane table, so most of
     them have no card in them yet and nothing has been misclassified — the
     point is that nothing has been misclassified YET. */
  const unknownLanes = lanes.names();
  if (unknownLanes.length > 0) {
    console.warn(
      `[syncAres] ${project.code}: ${unknownLanes.length} lane name(s) on the board that the §7a enumeration ` +
        `does not recognise — surfaced before a card sits in one: ${unknownLanes.join(' · ')}`,
    );
  }

  return {
    cards: cards.length,
    deliverables: mapped.deliverables.length,
    workCards: mapped.workCards.length,
    unlinked: mapped.unlinked.length,
    events: movements.length,
    eventsInserted: inserted,
    workSpans,
    deactivated: deactivated.modifiedCount,
    unstamped,
    unmappedLists,
    unknownLanes,
    lanesSyncedAt,
    lanesSeen,
    capacity: capacity.typical != null ? (capacity as unknown as Record<string, number | null>) : null,
  };
}

/**
 * Sync every active project; one sync_runs document per project per run.
 * `policy` (FR-9.6, worker/drainPush.ts) may skip a project this tick —
 * while ARES push is healthy the full sync relaxes to an hourly reconcile.
 * `clientOverride` (X10, 2026-09-11) lets a test drive this exact persistence
 * path with a stub client; the worker never passes it, so `makeClient(env)`
 * stays the one real source.
 */
export async function runAresSync(
  env: Env,
  policy?: (projectId: Types.ObjectId) => Promise<boolean>,
  clientOverride?: AresClient,
): Promise<void> {
  const client = clientOverride ?? makeClient(env);
  const projects = await Project.find({ status: 'ongoing' });
  assertNotProductionBoards(env, projects.map((p) => p.trello_board_id)); // invariant 17

  for (const project of projects) {
    if (policy && !(await policy(project._id))) continue;
    try {
      const stats = await syncProject(client, project, { movementsFrom: await lastGoodRun(project._id) });
      await SyncRun.create({ project_id: project._id, source: 'ares', ok: true, stats });
    } catch (err) {
      // last good data stays visible; the failure is recorded and surfaced (AC-19)
      await SyncRun.create({
        project_id: project._id,
        source: 'ares',
        ok: false,
        error: (err as Error).message,
      });
    }
  }
}

async function lastGoodRun(projectId: Types.ObjectId): Promise<string | undefined> {
  const last = await SyncRun.findOne({ project_id: projectId, source: 'ares', ok: true }).sort({ at: -1 });
  if (!last) return undefined;
  // overlap one hour to be safe; dedup makes the overlap free
  return new Date(last.at.getTime() - 60 * 60 * 1000).toISOString();
}
