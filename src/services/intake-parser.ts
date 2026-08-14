/**
 * Intake sheet parser (T035) — the three gotchas that each cost an afternoon
 * (Implementation Plan §5.2):
 *   1. pad ragged rows BEFORE positional parsing
 *   2. serial dates convert from the 1899-12-30 epoch
 *   3. two columns named `Type` — disambiguated by position (LAST = asset
 *      type, per AGENTS.md §5: col B is the card type, col L the asset type)
 *
 * Row classification (FR-3.4, FR-3.5):
 *   - blank id+name                  → skipped silently
 *   - MC present, no content fields  → RESERVED (pre-allocated), counted
 *   - content but required missing   → REJECTED with row + reason
 *   - duplicate MC number            → REJECTED (first occurrence wins;
 *     intake_requests is keyed (project, mc_number))
 *   - otherwise                      → OK, mirrored
 */

export interface ParsedRequest {
  mc_number: string;
  sheet_row: number;
  name: string;
  requestor: string;
  asset_type: string;
  use_case: string;
  brief: string;
  deadline: string | null; // YYYY-MM-DD
  year: number | null; // optional timing columns — absent on older tabs
  month: string | null; // raw sheet name, e.g. 'January'
  in_frost_prod: boolean | null;
}

export interface ParsedReject {
  sheet_row: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  ok: ParsedRequest[];
  rejects: ParsedReject[];
  reserved: number;
  skipped: number;
}

const norm = (s: string) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

const HEADER_ALIASES: Record<string, string> = {
  'mc #': 'mc',
  'id no.': 'mc',
  id: 'mc',
  deliverable: 'name',
  'deliverable name': 'name',
  requestor: 'requestor',
  'primary requestor': 'requestor',
  'use case': 'use_case',
  brief: 'brief',
  description: 'brief',
  deadline: 'deadline',
  year: 'year',
  month: 'month',
  'in frost prod': 'in_frost_prod',
  'in frost prod?': 'in_frost_prod',
};

/** Gotcha 1: every row padded to header width before positional access. */
export function padRagged(rows: string[][], width: number): string[][] {
  return rows.map((r) => (r.length >= width ? r : [...r, ...Array(width - r.length).fill('')]));
}

/** Gotcha 2: Google/Excel serial date — days since 1899-12-30 (UTC math, date-only out). */
export function serialToDate(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.round(serial) * 864e5);
  return d.toISOString().slice(0, 10);
}

export function parseDeadline(cell: string): string | null {
  const s = String(cell || '').trim();
  if (!s) return null;
  if (/^\d{4,6}$/.test(s)) return serialToDate(Number(s)); // serial
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); // ISO
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // M/D/YYYY
  if (us) return `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
  return null;
}

/** Sheets hands numbers back as floats — `2026.0` is the same year as `2026`. */
export function parseYear(cell: string): number | null {
  const n = parseFloat(String(cell || '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

interface HeaderMap {
  mc?: number;
  name?: number;
  requestor?: number;
  asset_type?: number;
  use_case?: number;
  brief?: number;
  deadline?: number;
  year?: number;
  month?: number;
  in_frost_prod?: number;
}

/**
 * Gotcha 3: two `Type` columns, disambiguated by position — per AGENTS.md §5
 * (product, 2026-08-12): col B is the CARD type, col L is the ASSET type.
 * The LAST `Type` occurrence is therefore the asset type. (Corrects the
 * phase-5 first-wins guess — the plan never said which; live sheet still
 * deferred, so nothing real depended on it.)
 */
export function mapHeader(header: string[]): HeaderMap {
  const map: HeaderMap = {};
  header.forEach((cell, i) => {
    const n = norm(cell);
    if (n === 'type') {
      map.asset_type = i; // last wins
      return;
    }
    const field = HEADER_ALIASES[n];
    if (field && map[field as keyof HeaderMap] === undefined) {
      map[field as keyof HeaderMap] = i as never;
    }
  });
  return map;
}

const MC_RE = /MC[-\s]?(\d+)/i;

export function parseIntake(allRows: string[][]): ParseResult {
  if (allRows.length === 0) return { ok: [], rejects: [], reserved: 0, skipped: 0 };
  const width = Math.max(...allRows.map((r) => r.length));
  const rows = padRagged(allRows, width);
  const map = mapHeader(rows[0]!);

  const result: ParseResult = { ok: [], rejects: [], reserved: 0, skipped: 0 };
  const seenMc = new Set<string>();

  rows.slice(1).forEach((row, i) => {
    const sheetRow = i + 2; // 1-based + header
    const get = (f: keyof HeaderMap) => (map[f] === undefined ? '' : String(row[map[f]!] ?? '').trim());

    const rawMc = get('mc');
    const name = get('name');
    if (!rawMc && !name) {
      result.skipped++;
      return;
    }

    const mcMatch = MC_RE.exec(rawMc);
    const contentFields = [name, get('requestor'), get('brief'), get('use_case'), get('deadline')];
    if (mcMatch && contentFields.every((v) => !v)) {
      result.reserved++; // pre-allocated MC row — skipped silently, counted (FR-3.4)
      return;
    }
    const missing: string[] = [];
    if (!mcMatch) missing.push('MC number');
    if (!name) missing.push('Deliverable Name');
    if (!get('requestor')) missing.push('Primary Requestor');
    if (!get('brief')) missing.push('Brief');
    if (missing.length > 0) {
      result.rejects.push({
        sheet_row: sheetRow,
        raw: name || rawMc || '(empty)',
        reason: `missing ${missing.join(', ')}`,
      });
      return;
    }

    const mc = `MC-${mcMatch![1]}`;
    if (seenMc.has(mc)) {
      result.rejects.push({ sheet_row: sheetRow, raw: name, reason: `duplicate ${mc}` });
      return;
    }
    seenMc.add(mc);

    const prod = norm(get('in_frost_prod'));
    result.ok.push({
      mc_number: mc,
      sheet_row: sheetRow,
      name,
      requestor: get('requestor'),
      asset_type: get('asset_type'),
      use_case: get('use_case'),
      brief: get('brief'),
      deadline: parseDeadline(get('deadline')),
      // optional: a tab without these columns parses exactly as before
      year: parseYear(get('year')),
      month: get('month') || null,
      in_frost_prod: prod ? ['yes', 'true', '1'].includes(prod) : null,
    });
  });

  return result;
}

/** Minimal CSV parser (quoted fields, escaped quotes) for the local fixture path. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}
