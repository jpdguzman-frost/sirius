/**
 * T071 — NFR-11 log hygiene, enforced statically: no logging statement in
 * runtime code may reference brief text or credential values. Crude by
 * design — it fails loudly on the obvious mistake before review has to
 * catch it. The staging audit repeats this against real log output.
 */

import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';

const FORBIDDEN = [
  'brief', 'description', 'ARES_API_KEY', 'TRELLO_TOKEN', 'TRELLO_WRITE_TOKEN',
  'SESSION_SECRET', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_SHEETS_CREDENTIALS',
];

describe('NFR-11 — no brief text, no credentials in logs', () => {
  it('no console/log call in runtime code references a forbidden field', () => {
    const out = execSync(
      `grep -rnE "console\\.(log|warn|error|info)" src worker lib server.js --include="*.ts" --include="*.js" || true`,
      { encoding: 'utf8' },
    );
    const offenders = out
      .split('\n')
      .filter(Boolean)
      .filter((line) => FORBIDDEN.some((f) => line.includes(f)));
    expect(offenders, `logging statements referencing brief/credentials:\n${offenders.join('\n')}`).toHaveLength(0);
  });

  it('no runtime code interpolates a credential env var into a thrown message', () => {
    const out = execSync(
      `grep -rnE "throw new Error\\(.*(TOKEN|SECRET|API_KEY)" src worker lib --include="*.ts" || true`,
      { encoding: 'utf8' },
    );
    // naming a variable is fine; interpolating its VALUE is not
    const offenders = out.split('\n').filter(Boolean).filter((l) => l.includes('${') && /TOKEN|SECRET|API_KEY/.test(l.split('${')[1] ?? ''));
    expect(offenders).toHaveLength(0);
  });
});
