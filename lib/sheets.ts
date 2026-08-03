/**
 * lib/sheets.ts (T036) — service-account read of the intake sheet.
 * Scope: spreadsheets.readonly; sheet sharing stays Restricted with the
 * service account a named Viewer (FR-8.2, FR-8.3). The credential comes
 * from server-side env ONLY (invariant 15) — never a file in the repo,
 * never the client. Local dev reads the CSV fixture instead (quickstart).
 */

import { JWT } from 'google-auth-library';

export interface SheetSource {
  /** Returns the raw grid for a tab, header row included. */
  readTab(sheetId: string, tab: string): Promise<string[][]>;
}

export class GoogleSheetSource implements SheetSource {
  private jwt: JWT;

  constructor(credentialsJson: string) {
    const creds = JSON.parse(credentialsJson) as { client_email: string; private_key: string };
    this.jwt = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }

  async readTab(sheetId: string, tab: string): Promise<string[][]> {
    const token = await this.jwt.getAccessToken();
    const range = encodeURIComponent(tab);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
      { headers: { Authorization: `Bearer ${token.token}` } },
    );
    if (!res.ok) {
      // 403 here is AC-7's un-share scenario: fail cleanly, keep last good data
      throw new Error(`sheets read failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { values?: unknown[][] };
    return (body.values ?? []).map((r) => r.map((c) => String(c ?? '')));
  }
}

export function makeSheetSource(credentialsJson: string | undefined): SheetSource {
  if (!credentialsJson) throw new Error('[sheets] GOOGLE_SHEETS_CREDENTIALS is required for live sheet reads');
  return new GoogleSheetSource(credentialsJson);
}
