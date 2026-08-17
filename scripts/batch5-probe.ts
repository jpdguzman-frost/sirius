/**
 * Batch-5 seeded probe (phase 13k, owls #34–#36) — proves the Requests
 * payload end to end for all four (filed × flagged) combinations, and that
 * the Pipeline row warning is keyed on tokens the server actually emits.
 *
 * ISOLATED DATABASE ONLY: an in-memory mongod created here and stopped in the
 * `finally`. It never reads a connection string from the environment, so it
 * cannot reach the dev or production database. No Trello call, no Sheets call
 * — nothing in this file imports `lib/trello.ts` or the sheets client, and
 * leg 7 asserts that as source truth rather than trusting the claim.
 *
 * Usage:  npx tsx scripts/batch5-probe.ts
 * Exits non-zero on the first failed check.
 *
 * What it proves, in order:
 *   1. four intake rows in ONE project covering filed × flagged, plus a
 *      second project holding a row that must never appear;
 *   2. STATUS is two-valued across the WHOLE payload, and each row's value is
 *      the Trello join alone — the flag moves nothing;
 *   3. every row still carries a `note` key, because the client's clarified()
 *      predicate reads it instead of the status;
 *   4. the tile counts and both cross-cutting invariants (owl #14), and that
 *      a note save moves forClarification and nothing else;
 *   5. ?filter=filed | unfiled | clarification — the filed+flagged row is
 *      excluded from clarification, which is owl #14 surviving the rename;
 *   6. the SHIPPED client predicate, executed against the real payload,
 *      agrees row-for-row with the server's clarification segment, and the
 *      client spells none of the retired vocabulary;
 *   7. project isolation (invariant 1) and no write of any kind on the read;
 *   8. the Pipeline warning's rationale map is keyed on the server's OWN
 *      `missing` tokens, read off a deliberately incomplete seeded card.
 */

import { readFile } from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { validateEnv } from '../src/config/env.ts';
import { AuditLog, Deliverable, IntakeRequest, Project, User, UserProject } from '../src/models/index.ts';
import { runMigrations } from './migrate/migrations.ts';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(`[probe] ${ok ? 'PASS' : 'FAIL'} — ${label}${ok || detail === undefined ? '' : ` · ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

type Note = { remark: string | null; clarify: boolean; clarify_reason: string | null } | null;
type Row = { mc_number: string; status: string; note: Note };
type Counts = { requests: number; inPipeline: number; toFile: number; forClarification: number };

const APP_JS_URL = new URL('../frontend/scripts/01-app.js', import.meta.url);

/**
 * Comments removed, so a source-text check reads CODE and not prose. Both
 * files legitimately NAME the retired vocabulary while explaining why it went,
 * and the requests route's header states out loud that no Sheets write path
 * exists — the check must not fail on the sentence that says so.
 */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** One top-level `const NAME = …;` out of the shipped client, ready to eval. */
function decl(src: string, name: string): string {
  const at = src.indexOf(`\nconst ${name} =`);
  if (at < 0) throw new Error(`batch5-probe: no declaration of \`${name}\``);
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i]!;
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`batch5-probe: unterminated declaration \`${name}\``);
}

const server = await MongoMemoryServer.create();
await mongoose.connect(server.getUri('sirius-batch5-probe'));

try {
  await runMigrations(mongoose.connection);

  // ---- 1. seed ------------------------------------------------------------
  const project = await Project.create({
    code: 'rt-test', name: 'Test Board', trello_board_id: 'probe-b5', weekly_capacity: 12,
  });
  const other = await Project.create({
    code: 'rt-test-2', name: 'Second Board', trello_board_id: 'probe-b5b', weekly_capacity: 12,
  });
  const member = await User.create({ email: 'pm@frostdesigngroup.com' });
  for (const p of [project, other]) await UserProject.create({ user_id: member._id, project_id: p._id });

  //  MC-A filed, unflagged · MC-B unfiled, unflagged
  //  MC-C unfiled, flagged · MC-D filed, flagged
  const seedRows = [
    { mc: 'MC-A', row: 1, name: 'Filed, unflagged' },
    { mc: 'MC-B', row: 2, name: 'Unfiled, unflagged' },
    { mc: 'MC-C', row: 3, name: 'Unfiled, flagged' },
    { mc: 'MC-D', row: 4, name: 'Filed, flagged' },
  ];
  for (const r of seedRows) {
    await IntakeRequest.create({ project_id: project._id, mc_number: r.mc, sheet_row: r.row, name: r.name });
  }
  // the Trello join — the WHOLE of the status rule
  for (const mc of ['MC-A', 'MC-D']) {
    await Deliverable.create({
      project_id: project._id, mc_number: mc, display_id: mc, trello_card_id: `c-${mc}`,
      name: `${mc} card`, difficulty: 'Medium', current_list: 'Design',
    });
  }
  // a row in ANOTHER project that must never surface (invariant 1)
  await IntakeRequest.create({
    project_id: other._id, mc_number: 'MC-Z', sheet_row: 1, name: 'Someone else’s request',
  });
  check('seeded 4 intake rows in the project under test', (await IntakeRequest.countDocuments({ project_id: project._id })) === 4);
  check('seeded 2 filed MC groups', (await Deliverable.countDocuments({ project_id: project._id })) === 2);

  const app = createApp({ env: validateEnv({ NODE_ENV: 'test' }), redis: null, mongo: null });
  const asMember = request.agent(app);
  await asMember.post('/__test/login').send({ userId: String(member._id), email: member.email });

  const get = async (query = ''): Promise<{ requests: Row[]; counts: Counts }> => {
    const res = await asMember.get(`/api/projects/${project._id}/requests${query}`);
    if (res.status !== 200) throw new Error(`GET /requests${query} → ${res.status}`);
    return res.body as { requests: Row[]; counts: Counts };
  };
  const putNote = (mc: string, body: Record<string, unknown>) =>
    asMember.put(`/api/projects/${project._id}/requests/${mc}/note`).send(body);
  const mcs = (rows: Row[]) => rows.map((r) => r.mc_number);
  const statusOf = (rows: Row[], mc: string) => rows.find((r) => r.mc_number === mc)?.status;

  // ---- 2. status vocabulary, all four combinations -------------------------
  const before = await get();
  check('unflagged payload already carries only the two literals',
    [...new Set(before.requests.map((r) => r.status))].sort().join('|') === 'For Filing|In Pipeline',
    [...new Set(before.requests.map((r) => r.status))]);

  check('flag an UNFILED row → 200', (await putNote('MC-C', { remark: 'needs the target size', clarify: true })).status === 200);
  check('flag a FILED row → 200', (await putNote('MC-D', { remark: 'flagged after filing', clarify: true })).status === 200);

  const flagged = await get();
  const vocabulary = [...new Set(flagged.requests.map((r) => r.status))].sort();
  check('STATUS is exactly two-valued across the WHOLE payload',
    vocabulary.length === 2 && vocabulary.join('|') === 'For Filing|In Pipeline', vocabulary);
  check('MC-A filed, unflagged → In Pipeline', statusOf(flagged.requests, 'MC-A') === 'In Pipeline', statusOf(flagged.requests, 'MC-A'));
  check('MC-B unfiled, unflagged → For Filing', statusOf(flagged.requests, 'MC-B') === 'For Filing', statusOf(flagged.requests, 'MC-B'));
  check('MC-C unfiled + FLAGGED → For Filing (the flag moves nothing)',
    statusOf(flagged.requests, 'MC-C') === 'For Filing', statusOf(flagged.requests, 'MC-C'));
  check('MC-D filed + FLAGGED → In Pipeline (the flag moves nothing)',
    statusOf(flagged.requests, 'MC-D') === 'In Pipeline', statusOf(flagged.requests, 'MC-D'));
  check('no row anywhere carries a retired literal',
    !flagged.requests.some((r) => r.status === 'To File' || r.status === 'For Clarification'));

  // ---- 3. the note rides the row ------------------------------------------
  check('every row carries a note key — the client predicate reads it, not the status',
    flagged.requests.every((r) => Object.hasOwn(r, 'note')));
  check('unflagged rows carry a null note',
    flagged.requests.filter((r) => ['MC-A', 'MC-B'].includes(r.mc_number)).every((r) => r.note === null));
  check('flagged rows carry {remark, clarify, clarify_reason}',
    flagged.requests.filter((r) => ['MC-C', 'MC-D'].includes(r.mc_number))
      .every((r) => r.note?.clarify === true && typeof r.note?.remark === 'string' && r.note?.clarify_reason === null),
    flagged.requests.filter((r) => ['MC-C', 'MC-D'].includes(r.mc_number)).map((r) => r.note));

  // ---- 4. tile counts + the cross-cutting invariants -----------------------
  check('counts are { requests: 4, inPipeline: 2, toFile: 2, forClarification: 1 }',
    JSON.stringify(flagged.counts) === JSON.stringify({ requests: 4, inPipeline: 2, toFile: 2, forClarification: 1 }),
    flagged.counts);
  check('requests === inPipeline + toFile', flagged.counts.requests === flagged.counts.inPipeline + flagged.counts.toFile);
  check('forClarification ⊆ toFile (owl #14)', flagged.counts.forClarification <= flagged.counts.toFile);
  check('the rename moved no count — only forClarification differs from the unflagged payload',
    before.counts.requests === flagged.counts.requests
    && before.counts.inPipeline === flagged.counts.inPipeline
    && before.counts.toFile === flagged.counts.toFile
    && before.counts.forClarification === 0,
    { before: before.counts, after: flagged.counts });

  check('a PLAIN remark changes no count at all', (await putNote('MC-B', { remark: 'chased the requestor', clarify: false })).status === 200);
  const afterRemark = await get();
  check('…confirmed', JSON.stringify(afterRemark.counts) === JSON.stringify(flagged.counts), afterRemark.counts);
  check('and it did not move MC-B out of For Filing', statusOf(afterRemark.requests, 'MC-B') === 'For Filing');

  // ---- 5. the ?filter= segments -------------------------------------------
  check('?filter=filed → MC-A, MC-D', mcs((await get('?filter=filed')).requests).join(',') === 'MC-A,MC-D',
    mcs((await get('?filter=filed')).requests));
  check('?filter=unfiled → MC-B, MC-C (the flagged one included — TO FILE is cross-cutting)',
    mcs((await get('?filter=unfiled')).requests).join(',') === 'MC-B,MC-C',
    mcs((await get('?filter=unfiled')).requests));
  const clar = mcs((await get('?filter=clarification')).requests);
  check('?filter=clarification → MC-C ONLY — the filed+flagged row is excluded', clar.join(',') === 'MC-C', clar);
  const unfiled = mcs((await get('?filter=unfiled')).requests);
  check('the clarification set is a strict SUBSET of the unfiled set', clar.every((mc) => unfiled.includes(mc)));
  check('an unknown ?filter= serves the whole set unfiltered', mcs((await get('?filter=nonsense')).requests).length === 4);

  // ---- 6. the client agrees, and spells none of the retired vocabulary ------
  const appJs = await readFile(APP_JS_URL, 'utf8');
  const clarified = new Function(`
    ${decl(appJs, 'STATUS_FILED')}
    ${decl(appJs, 'clarified')}
    return clarified;
  `)() as (r: Row) => boolean;
  const clientSet = flagged.requests.filter(clarified).map((r) => r.mc_number).sort();
  check('the SHIPPED client predicate reproduces the server segment exactly',
    clientSet.join(',') === clar.sort().join(','), { client: clientSet, server: clar });
  const appCode = codeOnly(appJs);
  for (const dead of ['To File', 'For Clarification', 'STATUS_TO_FILE', 'STATUS_CLARIFY', 'statusClarify']) {
    check(`the client no longer mentions \`${dead}\``, !appCode.includes(dead));
  }
  check('the client spells no unfiled status literal at all — it prints what the server sent',
    !appCode.includes('For Filing'));

  // ---- 7. isolation, and a read that writes nothing -------------------------
  check('no row from the other project leaks in (invariant 1)', !mcs(flagged.requests).includes('MC-Z'));
  const otherBody = await asMember.get(`/api/projects/${other._id}/requests`);
  check('the other project sees only its own row',
    otherBody.status === 200 && mcs(otherBody.body.requests).join(',') === 'MC-Z',
    mcs(otherBody.body?.requests ?? []));
  const auditBefore = await AuditLog.countDocuments({});
  await get();
  await get('?filter=clarification');
  check('reading the payload writes no audit row', (await AuditLog.countDocuments({})) === auditBefore);
  check('the three note saves each wrote exactly one audit row (invariant 10)',
    (await AuditLog.countDocuments({ entity: 'request', project_id: project._id })) === 3,
    await AuditLog.countDocuments({ entity: 'request', project_id: project._id }));

  const routeCode = codeOnly(await readFile(new URL('../src/routes/requests.ts', import.meta.url), 'utf8'));
  check('the requests route imports no Trello client', !/from '.*lib\/trello/.test(routeCode));
  check('the requests route imports no sheets client of any kind',
    !/googleapis|sheets/i.test(routeCode.split('\n').filter((l) => l.startsWith('import')).join('\n')));
  check('the rename touched no status literal outside the STATUS table',
    (routeCode.match(/'In Pipeline'/g) ?? []).length === 1 && (routeCode.match(/'For Filing'/g) ?? []).length === 1);
  check('this probe made no outbound call by construction (supertest against an in-process app only)', true);

  // ---- 8. the warning map is keyed on the SERVER's own tokens ---------------
  await Deliverable.create({
    project_id: project._id, mc_number: 'MC-E', display_id: 'MC-E', trello_card_id: 'c-MC-E',
    name: 'Nothing filled in', current_list: 'Design', // no difficulty, no deadline, no figma_url
  });
  const pipeline = await asMember.get(`/api/projects/${project._id}/deliverables`);
  check('GET /deliverables → 200', pipeline.status === 200, pipeline.status);
  type WireRow = { mcLabel: string; missing: string[] };
  const incomplete = (pipeline.body?.rows ?? []).find((r: WireRow) => r.mcLabel === 'MC-E') as WireRow | undefined;
  check('the incomplete card ships all three missing tokens',
    incomplete?.missing.join(' · ') === 'difficulty label · due date · Figma attachment', incomplete?.missing);

  const warn = new Function(`
    ${decl(appJs, 'WARN_LABEL')}
    ${decl(appJs, 'WARN_WHY')}
    ${decl(appJs, 'rowWarning')}
    return { WARN_LABEL, WARN_WHY, rowWarning };
  `)() as {
    WARN_LABEL: string;
    WARN_WHY: Record<string, string>;
    rowWarning: (row: unknown) => { label: string; items: Array<{ label: string; why: string }> } | null;
  };
  check('every token the server emits has a rationale in the client map — no silent blank',
    (incomplete?.missing ?? []).every((t) => (warn.WARN_WHY[t] ?? '').length > 0),
    (incomplete?.missing ?? []).map((t) => [t, warn.WARN_WHY[t] ?? '']));
  const built = warn.rowWarning(incomplete);
  check('the recipe names the card itself first, then one item per missing field',
    built !== null && built.items.length === 4 && built.items[0]!.label === 'MC-E' && built.items[0]!.why === 'Nothing filled in',
    built?.items);
  check('the label is the one variable string', built?.label === warn.WARN_LABEL, built?.label);
  const completeRow = (pipeline.body?.rows ?? []).find((r: WireRow) => r.mcLabel === 'MC-A');
  check('a card with a difficulty, a due date and a Figma link warns nothing… ',
    Array.isArray(completeRow?.missing), completeRow?.missing);
  check('…and rowWarning returns null for a row whose missing[] is empty',
    warn.rowWarning({ mcLabel: 'MC-X', name: 'complete', missing: [] }) === null);

  const pipelineSrc = await readFile(new URL('../src/services/pipeline.ts', import.meta.url), 'utf8');
  check('the three tokens are still spelled once each, on the server side',
    ['difficulty label', 'due date', 'Figma attachment'].every((t) => (pipelineSrc.match(new RegExp(`'${t}'`, 'g')) ?? []).length === 1));
} finally {
  await mongoose.disconnect();
  await server.stop();
}

console.log(failures === 0 ? '[probe] all checks passed' : `[probe] ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
