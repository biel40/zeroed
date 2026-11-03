import { normalizeEmail } from './email';

/**
 * SQL that gives every closed-beta tester an account and an all-premium grant.
 * Safe to apply repeatedly; throws on any address `normalizeEmail` rejects,
 * which also keeps quotes out of the generated SQL.
 */
export function buildBetaSeedSql(rawEmails: readonly string[], now: number): string {
  const emails = new Set<string>();
  for (const raw of rawEmails) {
    const email = normalizeEmail(raw);
    if (!email) throw new Error(`Invalid beta tester email: ${JSON.stringify(raw)}`);
    emails.add(email);
  }

  return [...emails].map((email) => [
    `INSERT OR IGNORE INTO users (id, email, created_at) VALUES (lower(hex(randomblob(16))), '${email}', ${now});`,
    `INSERT OR IGNORE INTO grants (user_id, product_id, source, created_at) SELECT id, '*', 'beta', ${now} FROM users WHERE email = '${email}';`,
  ].join('\n')).join('\n');
}
