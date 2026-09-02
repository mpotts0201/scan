/** Values SQLite can bind. Blobs are deliberately out of scope for schema v1. */
export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface RunResult {
  /** Rows inserted/updated/deleted by the statement. */
  readonly changes: number;
  /** better-sqlite3's `lastInsertRowid` is normalised to this spelling. */
  readonly lastInsertRowId: number;
}

export interface DbDriver {
  /** Parameterless; may contain several statements. For DDL and BEGIN/COMMIT. */
  exec(sql: string): Promise<void>;
  /** One parameterised statement that returns no rows. */
  run(sql: string, params?: SqlParams): Promise<RunResult>;
  /** One parameterised statement that returns rows, as plain column-keyed objects. */
  query<T>(sql: string, params?: SqlParams): Promise<T[]>;
  /**
   * Runs `work` between BEGIN and COMMIT; any throw rolls back and re-throws.
   * `tx` is the same connection as the receiver, passed for readability only —
   * transactions do not nest, and calling `transaction` on `tx` will throw
   * from SQLite ("cannot start a transaction within a transaction").
   */
  transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
