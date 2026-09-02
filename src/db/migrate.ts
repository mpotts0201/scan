import type { DbDriver } from './driver';
import { MIGRATIONS } from './migrations';

export interface Migration {
  /** Positive integer, unique across MIGRATIONS. Defines apply order. */
  readonly version: number;
  /** Human label recorded in the migrations table, e.g. '001_initial_schema'. */
  readonly name: string;
  /** Executed in array order inside one transaction, each via driver.exec. */
  readonly statements: readonly string[];
}

/** DDL for the bookkeeping table; created (IF NOT EXISTS) before anything is read. */
export const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  applied_at INTEGER NOT NULL
);`;

/**
 * Applies every migration whose version is not yet recorded, ascending.
 * Idempotent: a second call with the same list applies nothing.
 * Resolves to the versions applied by *this* call, ascending (empty if none).
 */
export async function migrate(
  db: DbDriver,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<readonly number[]> {
  await db.exec(MIGRATIONS_TABLE_DDL);

  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const known = new Set<number>();
  for (const migration of ordered) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(
        `invalid migration version: ${migration.version} (${migration.name}) must be a positive integer`,
      );
    }
    if (known.has(migration.version)) {
      throw new Error(`duplicate migration version: ${migration.version} (${migration.name})`);
    }
    known.add(migration.version);
  }

  const rows = await db.query<{ version: number }>('SELECT version FROM migrations');
  const applied = new Set(rows.map((row) => row.version));
  const highestApplied = Math.max(0, ...applied);
  const highestKnown = Math.max(0, ...known);
  if (highestApplied > highestKnown) {
    // A database written by a newer build has structure this code does not know
    // about; continuing would silently write wrong data. Fail loudly instead.
    throw new Error(
      `database schema is newer than this build: applied version ${highestApplied} exceeds known version ${highestKnown}`,
    );
  }

  const appliedNow: number[] = [];
  for (const migration of ordered) {
    if (applied.has(migration.version)) continue;
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) {
        await tx.exec(statement);
      }
      await tx.run('INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        Date.now(),
      ]);
    });
    appliedNow.push(migration.version);
  }

  return appliedNow;
}
