import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlDatabase, SqlRunResult, SqlStatement, SqlValue } from '../../cloudflare/api/src/SqlDatabase';

const MIGRATIONS = ['0001_accounts.sql'];

/** An in-memory SQLite database behind the D1 subset the account API uses, with every migration applied. */
export function createMigratedDatabase(): SqliteDatabase {
  const database = new SqliteDatabase();
  for (const migration of MIGRATIONS) {
    database.exec(readFileSync(new URL(`../../cloudflare/api/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  return database;
}

export class SqliteDatabase implements SqlDatabase {
  private readonly database = new DatabaseSync(':memory:');

  public prepare(sql: string): SqlStatement {
    return new SqliteStatement(this.database, sql, []);
  }

  public async batch(statements: SqlStatement[]): Promise<SqlRunResult[]> {
    this.database.exec('BEGIN');
    try {
      const results: SqlRunResult[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public exec(sql: string): void {
    this.database.exec(sql);
  }
}

class SqliteStatement implements SqlStatement {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: readonly SqlValue[],
  ) {}

  public bind(...values: SqlValue[]): SqlStatement {
    return new SqliteStatement(this.database, this.sql, values);
  }

  public async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.sql).get(...this.parameters()) as T | undefined) ?? null;
  }

  public async all<T>(): Promise<{ results: T[] }> {
    return { results: this.database.prepare(this.sql).all(...this.parameters()) as T[] };
  }

  public async run(): Promise<SqlRunResult> {
    const result = this.database.prepare(this.sql).run(...this.parameters());
    return { meta: { changes: Number(result.changes) } };
  }

  private parameters(): SQLInputValue[] {
    return this.values as SQLInputValue[];
  }
}
