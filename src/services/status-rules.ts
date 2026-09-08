/**
 * BR-10 list → state classification (T031), rebuilt 2026-09-08 on build-spec
 * v1.3 §7a and owl miles→jp #82. The keyword classifier it replaces is GONE:
 * measured against the real board it got 9 of 20 wrong — `Ops Work Complete`
 * counted as finished project work, `Passed QA` counted as nothing — and
 * §7a's own audit keywords are recorded there as a cross-check that "holds by
 * coincidence, not by structure". `DEFAULT_RULES`, `StatusRules` and the
 * per-project `rules` parameter (FR-1.5's override path, never used by any
 * runtime caller) went with it.
 *
 * FOUR OUTCOMES. Pending · Ongoing · Done are states a card is IN. `excluded`
 * is a visibility filter, not a state: ops work and the three lanes with no
 * equivalent status are not Sirius's to track, and they carry perfectly good
 * states — `Operations Backlog` IS Pending, `Ops Work Complete` IS Done — so
 * state cannot exclude them. IDENTITY does. That is why `Production Backlog`,
 * which sits inside the OPS group, is in scope as Pending and a blanket
 * `group === 'OPS'` rule would be wrong.
 *
 * RESOLUTION ORDER, all after normalisation:
 *   1. exact match in LIST_STATES
 *   2. `➜ Ready for …`            → ongoing   (#82 §3: Ready-for does not split)
 *   3. `➜ Family: <review stage>` → ongoing   (the process families)
 *   4. `Backlog…`                 → pending   (#82 §3: Pending is Backlog and nothing else)
 *   5. anything else              → ongoing, and UNKNOWN
 *
 * DONE AND EXCLUDED COME ONLY FROM THE TABLE. No rule may produce either —
 * both are claims about a card being finished or out of scope, and a pattern
 * that guessed one would silently retire live work. The one trap §7a keeps is
 * exactly this: `Passed QA` and `➜ Development: Pushed to Production` are Done
 * and look like nothing, `➜ Development: Released` is Done while
 * `➜ Development: Ready for Release` is Ongoing. Only an enumeration gets that
 * right.
 *
 * AN UNMAPPED LANE IS SURFACED, NEVER GUESSED (§7a, said twice). `classifyList`
 * still answers `ongoing` so the app has something to render, but `isKnownList`
 * says false and `worker/syncAres.ts` collects the distinct rejects into
 * `sync_runs.stats.unmappedLists` and warns once per run.
 *
 * WHERE THE NAMES COME FROM. Names §7a spells out literally, plus every list
 * name ARES actually holds for the production and test boards whose state §7a
 * settles — JP ruled ARES the source of truth for spelling, so those are
 * verbatim, typos included (`➜ Rough Animation: Sent For Client Approval`
 * carries a capital F on the board; normalisation is case-insensitive, so the
 * lower-case spelling resolves to the same row). Five names ARES holds are
 * deliberately absent — `For Archive`, `For Client Approval`, `Hard Deadline:
 * Monday Mar. 23`, `NOTE`, `On Hold: Ryse, NBG` — none is a workflow state and
 * §7a settles none of them; they stay UNKNOWN on purpose and are reported to
 * product through `unmappedLists`.
 *
 * NOT `Lane`. That word is taken: `lib/model.ts`'s `Lane` is the
 * design/ops/assets cycle-time bucket, an unrelated concept that shares one
 * English word with product's "lane" (a Trello list). This module says list.
 */

/** The four outcomes. `excluded` is a visibility filter, not a state. */
export type ListStatus = 'pending' | 'ongoing' | 'done' | 'excluded';

export interface ListStateRow {
  /** The list name VERBATIM as ARES / the sheet spells it. */
  name: string;
  /** §7a's grouping — audit and reporting only; nothing branches on it. */
  group: string;
  state: ListStatus;
}

/**
 * Normalised form for every comparison: `➜` (U+279C) and ASCII `->` are one
 * glyph, internal whitespace collapses, ends trim, case folds.
 *
 * The arrow rule is not cosmetic. §7a: every process list uses `➜` except
 * `-> Render: Sent for Client Approval`, which uses `->`. Miles is fixing that
 * at source; the same typo can recur on any board, and a list that silently
 * fails to resolve is worse than one that is obviously wrong.
 */
export function normalizeListName(name: string | null | undefined): string {
  return String(name ?? '')
    .replace(/➜/g, '->')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export const LIST_STATES: ReadonlyArray<ListStateRow> = [

  /* EXCLUDED (§7a, named identities — no rule may produce this state) — 8 */
  // OPS
  { name: 'Operations Backlog',                           group: 'OPS',                  state: 'excluded' },
  { name: 'Working on Ops Work',                          group: 'OPS',                  state: 'excluded' },
  { name: 'Ready for Ops Review',                         group: 'OPS',                  state: 'excluded' },
  { name: 'Reviewing Ops Work',                           group: 'OPS',                  state: 'excluded' },
  { name: 'Ops Work Complete',                            group: 'OPS',                  state: 'excluded' },
  // No equivalent status
  { name: '➜ Process Lane',                               group: 'No equivalent status', state: 'excluded' },
  { name: 'Discarded Work',                               group: 'No equivalent status', state: 'excluded' },
  { name: 'Unused Work',                                  group: 'No equivalent status', state: 'excluded' },

  /* PENDING — named by §7a — 15 */
  // Backlog
  { name: 'Production Backlog',                           group: 'Backlog',              state: 'pending' },
  { name: 'Content Backlog',                              group: 'Backlog',              state: 'pending' },
  { name: 'Design Backlog',                               group: 'Backlog',              state: 'pending' },
  { name: 'Development Backlog',                          group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Process Lane',                        group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Screens',                             group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Components',                          group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Normalization',                       group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Assets',                              group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Sketch Revisions',                    group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Render Revisions',                    group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: UI Revisions',                        group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Icons',                               group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Motion',                              group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Bugs and Fixes',                      group: 'Backlog',              state: 'pending' },

  /* PENDING — on the production board, settled by the Backlog rule — 5 */
  // Backlog
  { name: 'Backlog: Export',                              group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: For Cascade',                         group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: For Pushback',                        group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Migration',                           group: 'Backlog',              state: 'pending' },
  { name: 'Backlog: Pending Art Direction',               group: 'Backlog',              state: 'pending' },

  /* DONE (§7a — no rule may produce this state) — 14 */
  // Work
  { name: 'Content Complete',                             group: 'Work',                 state: 'done' },
  { name: 'Design Complete',                              group: 'Work',                 state: 'done' },
  { name: 'Passed QA',                                    group: 'Work',                 state: 'done' },
  { name: 'Development Complete',                         group: 'Work',                 state: 'done' },
  // Process
  { name: '➜ Content: Done',                              group: 'Process',              state: 'done' },
  { name: '➜ Screen: Done',                               group: 'Process',              state: 'done' },
  { name: '➜ Component: Done',                            group: 'Process',              state: 'done' },
  { name: '➜ Render: Done',                               group: 'Process',              state: 'done' },
  { name: '➜ Final Animation: Done',                      group: 'Process',              state: 'done' },
  { name: '➜ UAT: Done',                                  group: 'Process',              state: 'done' },
  { name: '➜ Development: Pushed to Production',          group: 'Process',              state: 'done' },
  { name: '➜ Development: Completed',                     group: 'Process',              state: 'done' },
  { name: '➜ Development: Released',                      group: 'Process',              state: 'done' },
  { name: '➜ Development: Done',                          group: 'Process',              state: 'done' },

  /* ONGOING — named by §7a — 65 */
  // Work · Content
  { name: 'Ready for Content',                            group: 'Work · Content',       state: 'ongoing' },
  { name: 'Working on Content',                           group: 'Work · Content',       state: 'ongoing' },
  { name: 'Ready for Content Peer Review',                group: 'Work · Content',       state: 'ongoing' },
  { name: 'Working on Content Peer Review',               group: 'Work · Content',       state: 'ongoing' },
  { name: 'Ready for Content Review',                     group: 'Work · Content',       state: 'ongoing' },
  { name: 'Working on Content Review',                    group: 'Work · Content',       state: 'ongoing' },
  { name: 'Ready for Content Refinement',                 group: 'Work · Content',       state: 'ongoing' },
  { name: 'Working on Content Refinement',                group: 'Work · Content',       state: 'ongoing' },
  { name: 'Ready for Content Checks',                     group: 'Work · Content',       state: 'ongoing' },
  { name: 'Working on Content Checks',                    group: 'Work · Content',       state: 'ongoing' },
  // Work · Design
  { name: 'Ready for Design',                             group: 'Work · Design',        state: 'ongoing' },
  { name: 'Working on Design',                            group: 'Work · Design',        state: 'ongoing' },
  { name: 'Ready for Peer Review',                        group: 'Work · Design',        state: 'ongoing' },
  { name: 'Working on Peer Review',                       group: 'Work · Design',        state: 'ongoing' },
  { name: 'Ready for Design Review',                      group: 'Work · Design',        state: 'ongoing' },
  { name: 'Working on Design Review',                     group: 'Work · Design',        state: 'ongoing' },
  // Work · Dev
  { name: 'Ready for Development',                        group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Working on Development',                       group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Ready for Dev Peer Review',                    group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Working on Dev Peer Review',                   group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Ready for Code Review',                        group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Working on Code Review',                       group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Ready for Design and Content QA',              group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Working on Design and Content QA',             group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Working on Bugs and Fixes',                    group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Ready for QA Validation',                      group: 'Work · Dev',           state: 'ongoing' },
  { name: 'Validating Bugs and Fixes',                    group: 'Work · Dev',           state: 'ongoing' },
  // Process · Content
  { name: '➜ Ready for Content',                          group: 'Process · Content',    state: 'ongoing' },
  { name: '➜ Content: Writing Content',                   group: 'Process · Content',    state: 'ongoing' },
  { name: 'Ready for Client Review',                      group: 'Process · Content',    state: 'ongoing' },
  { name: 'Sent for Client Review',                       group: 'Process · Content',    state: 'ongoing' },
  { name: 'With Revision',                                group: 'Process · Content',    state: 'ongoing' },
  { name: 'Working on Revision',                          group: 'Process · Content',    state: 'ongoing' },
  { name: 'Ready for Client Approval',                    group: 'Process · Content',    state: 'ongoing' },
  { name: 'Sent for Client Approval',                     group: 'Process · Content',    state: 'ongoing' },
  // Process · Screens
  { name: '➜ Ready for Screen Design',                    group: 'Process · Screens',    state: 'ongoing' },
  { name: '➜ Ready for Componentization',                 group: 'Process · Screens',    state: 'ongoing' },
  // Process · Assets
  { name: '➜ Ready for Sketch',                           group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Ready for Render',                           group: 'Process · Assets',     state: 'ongoing' },
  // Process · Dev
  { name: '➜ Ready for Development',                      group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ Development: Working on it',                 group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ Ready for DQA',                              group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ DQA: Working on it',                         group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ Ready for CQA',                              group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ CQA: Working on it',                         group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ Ready for Integration',                      group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ Sent for Integration',                       group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ Integration: Ongoing',                       group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ Development: Ready for UAT',                 group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ Development: Sent for UAT',                  group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ UAT: Ongoing',                               group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ UAT: With Issues',                           group: 'Process · Dev',        state: 'ongoing' },
  { name: '➜ Development: Ready for Release',             group: 'Process · Dev',        state: 'ongoing' },
  // JFC
  { name: '➜ Content: Ready for CRM',                     group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Content: Sent for CRM',                      group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Content: Ready for Brand',                   group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Content: Sent for Brand',                    group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Screen: Ready for CRM',                      group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Screen: Sent for CRM',                       group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Screen: Ready for Brand',                    group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Screen: Sent for Brand',                     group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Sketch: Ready for CRM',                      group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Sketch: Sent for CRM',                       group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Sketch: Ready for Brand',                    group: 'JFC',                  state: 'ongoing' },
  { name: '➜ Sketch: Sent for Brand',                     group: 'JFC',                  state: 'ongoing' },

  /* ONGOING — on the production board, settled by the Ready-for / family-stage rules — 40 */
  // Process · Motion
  { name: '➜ Final Animation: Ready for Client Approval', group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Final Animation: Ready for Client Review',   group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Final Animation: Sent for Client Approval',  group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Final Animation: Sent for Client Review',    group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Final Animation: With Revision',             group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Final Animation: Working on it',             group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Final Animation: Working on Revision',       group: 'Process · Motion',     state: 'ongoing' },
  // Process · Generation
  { name: '➜ Generation: Working on it',                  group: 'Process · Generation', state: 'ongoing' },
  // Process · Motion
  { name: '➜ Ready for Final Animation',                  group: 'Process · Motion',     state: 'ongoing' },
  // Process · Generation
  { name: '➜ Ready for Generation',                       group: 'Process · Generation', state: 'ongoing' },
  // Process · Refinement
  { name: '➜ Ready for Refinement',                       group: 'Process · Refinement', state: 'ongoing' },
  { name: '➜ Refinement: Working on it',                  group: 'Process · Refinement', state: 'ongoing' },
  // Process · Assets
  { name: '➜ Render: Ready for Client Approval',          group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Render: Ready for Client Review',            group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Render: Sent for Client Approval',           group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Render: Sent for Client Review',             group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Render: With Revision',                      group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Render: Working on it',                      group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Render: Working on Revision',                group: 'Process · Assets',     state: 'ongoing' },
  // Process · Motion
  { name: '➜ Rough Animation: Ready for Client Approval', group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Rough Animation: Ready for Client Review',   group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Rough Animation: Sent For Client Approval',  group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Rough Animation: Sent For Client Review',    group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Rough Animation: With Revision',             group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Rough Animation: Working on it',             group: 'Process · Motion',     state: 'ongoing' },
  { name: '➜ Rough Animation: Working on Revision',       group: 'Process · Motion',     state: 'ongoing' },
  // Process · Screens
  { name: '➜ Screen: Ready for Client Approval',          group: 'Process · Screens',    state: 'ongoing' },
  { name: '➜ Screen: Ready for Client Review',            group: 'Process · Screens',    state: 'ongoing' },
  { name: '➜ Screen: Sent for Client Approval',           group: 'Process · Screens',    state: 'ongoing' },
  { name: '➜ Screen: Sent for Client Review',             group: 'Process · Screens',    state: 'ongoing' },
  { name: '➜ Screen: With Revision',                      group: 'Process · Screens',    state: 'ongoing' },
  { name: '➜ Screen: Working on it',                      group: 'Process · Screens',    state: 'ongoing' },
  { name: '➜ Screen: Working on Revision',                group: 'Process · Screens',    state: 'ongoing' },
  // Process · Assets
  { name: '➜ Sketch: Ready for Client Approval',          group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Sketch: Ready for Client Review',            group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Sketch: Sent for Client Approval',           group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Sketch: Sent for Client Review',             group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Sketch: With Revision',                      group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Sketch: Working on it',                      group: 'Process · Assets',     state: 'ongoing' },
  { name: '➜ Sketch: Working on Revision',                group: 'Process · Assets',     state: 'ongoing' },
];

const BY_NAME: ReadonlyMap<string, ListStatus> = new Map(
  LIST_STATES.map((r) => [normalizeListName(r.name), r.state] as const),
);

/**
 * Rule 2 — `➜ Ready for X` is ALWAYS Ongoing (#82 §3, which dissolved the
 * older reading that had `Ready for Content` / `Ready for Design` /
 * `Ready for Development` as Pending). Anchored on the arrow on purpose:
 * `Ready for Ops Review` carries no arrow, is EXCLUDED, and must not be swept
 * up by a looser rule — the table would answer first anyway, but a rule that
 * only works because something else runs before it is a trap for the next
 * editor.
 */
const READY_FOR_RE = /^->\s*ready for\b/;

/**
 * Rule 3 — a process family at one of its eight review/approval stages. The
 * family word is deliberately UNCONSTRAINED (`[^:]+`): §7a enumerates Screen,
 * Component, Sketch, Render, Rough Animation and Final Animation, and the
 * board also runs `➜ Generation:` and `➜ Refinement:` — 398 cards across an
 * entire family the spec never mentions. Pinning the family list would have
 * left those unknown for no gain: the STAGE is what says the card is in
 * flight, whichever family is running it.
 *
 * The stage list is closed, and anchored `$`. `➜ Screen: Done` is Done and
 * `➜ Development: Released` is Done — both are in the table, and neither
 * suffix appears here, so this rule cannot reach them even if the table were
 * edited out from under it.
 */
const FAMILY_STAGE_RE =
  /^->\s*[^:]+:\s*(working on it|ready for client review|sent for client review|with revision|working on revision|ready for client approval|sent for client approval)$/;

/**
 * Rule 4 — Pending is the Backlog lists and nothing else (#82 §3). Anchored at
 * the start: `Operations Backlog` ENDS with the word and is excluded by
 * identity, so a `\bbacklog\b` test anywhere in the string — which is what the
 * retired keyword classifier did — is exactly the bug this replaces.
 */
const BACKLOG_RE = /^backlog\b/;

/** The rule tier of the resolution order. `null` = no rule claims this name. */
function ruleState(key: string): ListStatus | null {
  if (READY_FOR_RE.test(key)) return 'ongoing';
  if (FAMILY_STAGE_RE.test(key)) return 'ongoing';
  if (BACKLOG_RE.test(key)) return 'pending';
  return null;
}

/**
 * BR-10: the list a card sits in → its state. An unrecognised name answers
 * `ongoing` — the app must render something, and a card on a board IS in
 * flight until something says otherwise — but see `isKnownList`: that answer
 * is a fallback, not a classification, and the sync reports it.
 */
export function classifyList(listName: string | null | undefined): ListStatus {
  const key = normalizeListName(listName);
  return BY_NAME.get(key) ?? ruleState(key) ?? 'ongoing';
}

/**
 * Did anything actually recognise this name? False for the `ongoing` fallback
 * above, and false for an absent or empty list. §7a's safety net: an unmapped
 * lane must be SURFACED, never guessed at.
 */
export function isKnownList(listName: string | null | undefined): boolean {
  const key = normalizeListName(listName);
  return BY_NAME.has(key) || ruleState(key) !== null;
}
