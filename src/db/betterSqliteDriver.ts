import Database from 'better-sqlite3';

import type { DbDriver, SqlParams, SqlValue } from './driver';

/** Node/test-only. Never imported from App.tsx or index.ts, so Metro never bundles it. */
export function openBetterSqliteDriver(filename = ':memory:'): Promise<DbDriver> {
  const db = new Database(filename);

  const driver: DbDriver = {
    exec(sql: string): Promise<void> {
      db.exec(sql);
      return Promise.resolve();
    },

    run(sql: string, params: SqlParams = []) {
      const result = db.prepare<SqlValue[]>(sql).run(...params);
      return Promise.resolve({
        changes: result.changes,
        // `lastInsertRowid` is `number | bigint`; the interface promises a number.
        lastInsertRowId: Number(result.lastInsertRowid),
      });
    },

    query<T>(sql: string, params: SqlParams = []): Promise<T[]> {
      return Promise.resolve(db.prepare<SqlValue[], T>(sql).all(...params));
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

    close(): Promise<void> {
      db.close();
      return Promise.resolve();
    },
  };

  return Promise.resolve(driver);
}
