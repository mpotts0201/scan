import Database from 'better-sqlite3';

import type { DbDriver, SqlParams, SqlValue } from './driver';

/** Node/test-only. Never imported from App.tsx or index.ts, so Metro never bundles it. */
export async function openBetterSqliteDriver(filename = ':memory:'): Promise<DbDriver> {
  const db = new Database(filename);

  // Every method is `async` even though better-sqlite3 is synchronous: that is
  // what turns its synchronous throws into rejections, as DbDriver promises.
  const driver: DbDriver = {
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },

    async run(sql: string, params: SqlParams = []) {
      const result = db.prepare<SqlValue[]>(sql).run(...params);
      return {
        changes: result.changes,
        // `lastInsertRowid` is `number | bigint`; the interface promises a number.
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },

    async query<T>(sql: string, params: SqlParams = []): Promise<T[]> {
      return db.prepare<SqlValue[], T>(sql).all(...params);
    },

    // See expoDriver.ts: explicit statements, not `db.transaction()`, which
    // throws "Transaction function cannot return a promise" on an async fn.
    async transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T> {
      db.exec('BEGIN');
      try {
        const result = await work(driver);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // A failed ROLLBACK must not mask the error that caused it.
        }
        throw error;
      }
    },

    async close(): Promise<void> {
      db.close();
    },
  };

  return driver;
}
