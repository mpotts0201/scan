import { openDatabaseAsync, type SQLiteOpenOptions } from 'expo-sqlite';

import type { DbDriver, SqlParams } from './driver';

/** Opens the app-side driver. `expo-sqlite` is async all the way down. */
export async function openExpoDriver(
  databaseName: string,
  options?: SQLiteOpenOptions,
): Promise<DbDriver> {
  const db = await openDatabaseAsync(databaseName, options);

  const driver: DbDriver = {
    async exec(sql: string): Promise<void> {
      await db.execAsync(sql);
    },

    async run(sql: string, params: SqlParams = []) {
      const result = await db.runAsync(sql, [...params]);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },

    async query<T>(sql: string, params: SqlParams = []): Promise<T[]> {
      return db.getAllAsync<T>(sql, [...params]);
    },

    // Explicit BEGIN/COMMIT/ROLLBACK rather than `withTransactionAsync` so that
    // both drivers have identical semantics: better-sqlite3's transaction helper
    // rejects async functions, so it cannot back this interface (DECISIONS.md).
    async transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T> {
      await db.execAsync('BEGIN');
      try {
        const result = await work(driver);
        await db.execAsync('COMMIT');
        return result;
      } catch (error) {
        try {
          await db.execAsync('ROLLBACK');
        } catch {
          // A failed ROLLBACK must not mask the error that caused it.
        }
        throw error;
      }
    },

    async close(): Promise<void> {
      await db.closeAsync();
    },
  };

  return driver;
}
