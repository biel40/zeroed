import type { SqlDatabase } from './SqlDatabase';

export interface LoginTokenRecord {
  readonly tokenHash: string;
  readonly email: string;
  readonly requesterHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface RecentAttempts {
  readonly byEmail: number;
  readonly byRequester: number;
}

export interface GrantRecord {
  readonly productId: string;
  readonly source: 'beta' | 'purchase' | 'manual';
}

export interface SessionRecord {
  readonly userId: string;
  readonly email: string;
  readonly expiresAt: number;
}

export interface UserCredentials {
  readonly userId: string;
  readonly passwordHash: string | null;
}

/** Login links are kept past expiry for this long so rate limits still count them; password failures as long. */
const RATE_LIMIT_RETENTION_MS = 60 * 60 * 1000;

/** Every SQL query of the account API. Callers pass hashes, never raw tokens. */
export class AccountStore {
  public constructor(private readonly database: SqlDatabase) {}

  public async countLoginRequestsSince(email: string, requesterHash: string, since: number): Promise<RecentAttempts> {
    const row = await this.database.prepare(`
      SELECT COALESCE(SUM(email = ?1), 0) AS byEmail, COALESCE(SUM(requester_hash = ?2), 0) AS byRequester
      FROM login_tokens WHERE created_at >= ?3 AND (email = ?1 OR requester_hash = ?2)
    `).bind(email, requesterHash, since).first<RecentAttempts>();
    return { byEmail: row?.byEmail ?? 0, byRequester: row?.byRequester ?? 0 };
  }

  public async saveLoginToken(token: LoginTokenRecord): Promise<void> {
    await this.database.prepare(`
      INSERT INTO login_tokens (token_hash, email, requester_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)
    `).bind(token.tokenHash, token.email, token.requesterHash, token.createdAt, token.expiresAt).run();
  }

  /** Marks an unused, unexpired link as used and returns its address; null when it cannot be used. */
  public async consumeLoginToken(tokenHash: string, now: number): Promise<string | null> {
    const row = await this.database.prepare(`
      UPDATE login_tokens SET used_at = ?2
      WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2
      RETURNING email
    `).bind(tokenHash, now).first<{ email: string }>();
    return row?.email ?? null;
  }

  /** Returns the account for the address, creating it with `newId` on first sign-in. */
  public async upsertUser(email: string, newId: string, now: number): Promise<string> {
    const row = await this.database.prepare(`
      INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)
      ON CONFLICT (email) DO UPDATE SET email = excluded.email
      RETURNING id
    `).bind(newId, email, now).first<{ id: string }>();
    if (!row) throw new Error('User upsert returned no row');
    return row.id;
  }

  /** The account and its password hash, which is null until one is set; null when the address has no account. */
  public async findCredentials(email: string): Promise<UserCredentials | null> {
    return this.database.prepare('SELECT id AS userId, password_hash AS passwordHash FROM users WHERE email = ?')
      .bind(email).first<UserCredentials>();
  }

  /** Sets the first password of an account; false when one was set meanwhile. */
  public async claimPassword(userId: string, passwordHash: string): Promise<boolean> {
    const result = await this.database.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash IS NULL')
      .bind(passwordHash, userId).run();
    return result.meta.changes > 0;
  }

  /** The next password used with this address becomes its password again. */
  public async clearPassword(userId: string): Promise<void> {
    await this.database.prepare('UPDATE users SET password_hash = NULL WHERE id = ?').bind(userId).run();
  }

  public async countPasswordFailuresSince(email: string, requesterHash: string, since: number): Promise<RecentAttempts> {
    const row = await this.database.prepare(`
      SELECT COALESCE(SUM(email = ?1), 0) AS byEmail, COALESCE(SUM(requester_hash = ?2), 0) AS byRequester
      FROM password_failures WHERE created_at >= ?3 AND (email = ?1 OR requester_hash = ?2)
    `).bind(email, requesterHash, since).first<RecentAttempts>();
    return { byEmail: row?.byEmail ?? 0, byRequester: row?.byRequester ?? 0 };
  }

  public async recordPasswordFailure(email: string, requesterHash: string, now: number): Promise<void> {
    await this.database.prepare('INSERT INTO password_failures (email, requester_hash, created_at) VALUES (?, ?, ?)')
      .bind(email, requesterHash, now).run();
  }

  public async createSession(tokenHash: string, userId: string, now: number, expiresAt: number): Promise<void> {
    await this.database.prepare(`
      INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)
    `).bind(tokenHash, userId, now, expiresAt).run();
  }

  public async findSession(tokenHash: string, now: number): Promise<SessionRecord | null> {
    return this.database.prepare(`
      SELECT s.user_id AS userId, u.email AS email, s.expires_at AS expiresAt
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).bind(tokenHash, now).first<SessionRecord>();
  }

  public async extendSession(tokenHash: string, expiresAt: number): Promise<void> {
    await this.database.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(expiresAt, tokenHash).run();
  }

  public async deleteSession(tokenHash: string): Promise<void> {
    await this.database.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }

  /** The account's active grants; `productId` may be '*'. */
  public async listActiveGrants(userId: string): Promise<GrantRecord[]> {
    const { results } = await this.database.prepare(`
      SELECT product_id AS productId, source FROM grants WHERE user_id = ? AND revoked_at IS NULL
    `).bind(userId).all<GrantRecord>();
    return results;
  }

  public async purgeExpired(now: number): Promise<void> {
    await this.database.batch([
      this.database.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(now - RATE_LIMIT_RETENTION_MS),
      this.database.prepare('DELETE FROM password_failures WHERE created_at < ?').bind(now - RATE_LIMIT_RETENTION_MS),
      this.database.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    ]);
  }
}
