import type { DbDriver } from './driver';
import { openExpoDriver } from './expoDriver';
import { migrate } from './migrate';

export const DATABASE_NAME = 'scan.db';

let initPromise: Promise<DbDriver> | null = null;

/**
 * Opens the app database via expo-sqlite and applies pending migrations.
 * Memoised: repeated calls resolve to the same driver and migrate once —
 * two concurrent migrate() runs on one connection would both try to insert
 * the same version. A rejected init is not cached, so a later call can retry.
 */
export function initDatabase(): Promise<DbDriver> {
  if (initPromise === null) {
    initPromise = (async (): Promise<DbDriver> => {
      const db = await openExpoDriver(DATABASE_NAME);
      try {
        await migrate(db);
      } catch (error) {
        try {
          // Close the connection this failed attempt opened, so a retry after a
          // rejected init does not leak one per call.
          await db.close();
        } catch {
          // A failed close() must not mask the migration error.
        }
        throw error;
      }
      return db;
    })().catch((error: unknown) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

export type { DbDriver, RunResult, SqlParams, SqlValue } from './driver';
