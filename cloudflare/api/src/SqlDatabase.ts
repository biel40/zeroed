/**
 * The subset of Cloudflare D1 the account API uses. A D1 binding satisfies it
 * as is; tests back it with an in-memory SQLite database.
 */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  readonly meta: { readonly changes: number };
}

export interface SqlStatement {
  bind(...values: SqlValue[]): SqlStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<SqlRunResult>;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  /** Runs the statements in one transaction. */
  batch(statements: SqlStatement[]): Promise<unknown[]>;
}
