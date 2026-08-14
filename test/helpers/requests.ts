/**
 * Shared shape + calls for `/api/projects/:id/requests`. Three suites read
 * that payload (frost notes, resolved deadlines, intake sync) and each used to
 * re-declare the row and counts types by hand — so the owl #13–#15 status
 * rename had to be chased through three private copies. The payload is
 * declared once here; a rename breaks in one place.
 */

import type { Types } from 'mongoose';
import type { TestAgent } from './fixtures.ts';

export interface RequestNote {
  remark: string | null;
  clarify: boolean;
  clarify_reason: string | null;
}

export interface RequestRow {
  mc_number: string;
  sheet_row: number;
  name: string;
  status: string;
  deadline: string | null;
  deadline_source: string | null;
  year: number | null;
  month: string | null;
  note: RequestNote | null;
}

/** Cross-cutting (owl #14): requests = inPipeline + toFile; forClarification ⊂ toFile. */
export interface RequestCounts {
  requests: number;
  inPipeline: number;
  toFile: number;
  forClarification: number;
}

export interface RequestsBody {
  requests: RequestRow[];
  counts: RequestCounts;
  sync: { lastAttemptAt: string | null; lastAttemptOk: boolean | null; lastSuccessAt: string | null; error: string | null };
}

export async function getRequests(agent: TestAgent, projectId: Types.ObjectId, query = ''): Promise<RequestsBody> {
  const res = await agent.get(`/api/projects/${projectId}/requests${query}`).expect(200);
  return res.body as RequestsBody;
}

export const rowsOf = async (agent: TestAgent, projectId: Types.ObjectId, query = ''): Promise<RequestRow[]> =>
  (await getRequests(agent, projectId, query)).requests;

export const byMc = (rows: RequestRow[], mc: string) => rows.find((r) => r.mc_number === mc)!;

export const mcsOf = (rows: RequestRow[]) => rows.map((r) => r.mc_number);

/** The note write (FR-11). Returns the supertest Test so callers own `.expect()`. */
export const putNote = (
  agent: TestAgent,
  projectId: Types.ObjectId,
  mc: string,
  body: Record<string, unknown>,
) => agent.put(`/api/projects/${projectId}/requests/${mc}/note`).send(body);
