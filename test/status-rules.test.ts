/**
 * T031 — BR-10 status classification; defaults verbatim from the prototype.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error verbatim minified extract, untyped by design
import * as O from './golden/original.mjs';
import { classifyList } from '../src/services/status-rules.ts';

const LISTS = [
  'Production Backlog',
  'Working on Ops Work',
  'Ops Work Complete',
  'Sent for Client Review',
  'Done',
  'Approved by client',
  'On Hold — clarification',
  'Waiting for assets',
  'Design',
  'Delivered!',
  'Client Approval', // OD-5: open — falls through to ongoing, as the prototype does
  '',
];

describe('BR-10 classification', () => {
  it('matches the prototype default regexes on every list name (golden parity)', () => {
    for (const l of LISTS) {
      expect(classifyList(l), l).toBe(O.ka(l));
    }
  });

  it('accepts per-project rule overrides (FR-1.5 path)', () => {
    expect(classifyList('Client Approval', { done: /client approval/, pending: /$^/ })).toBe('done');
  });
});
