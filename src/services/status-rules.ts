/**
 * BR-10 status classification (T031): Trello list names are free text,
 * classified Pending / Ongoing / Done by keyword rules. Defaults ported
 * VERBATIM from the validated prototype (bundle `ka`). Rules are
 * per-project configurable (FR-1.5) by passing overrides; OD-5 (`Client
 * Approval` ongoing vs done) is open — today it falls through to "ongoing",
 * matching the prototype.
 */

export type ListStatus = 'pending' | 'ongoing' | 'done';

export interface StatusRules {
  done: RegExp;
  pending: RegExp;
}

/** Source: bundle `ka` — verbatim regexes. */
export const DEFAULT_RULES: StatusRules = {
  done: /\b(done|approved|complete|completed|delivered|closed|shipped)\b/,
  pending: /\b(backlog|pending|queued|not started|on hold|paused|blocked|waiting|hold)\b/,
};

export function classifyList(listName: string | null | undefined, rules: StatusRules = DEFAULT_RULES): ListStatus {
  const t = (listName || '').toLowerCase();
  if (rules.done.test(t)) return 'done';
  if (rules.pending.test(t)) return 'pending';
  return 'ongoing';
}
