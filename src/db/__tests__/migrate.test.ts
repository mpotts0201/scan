import { openBetterSqliteDriver } from '../betterSqliteDriver';
import type { DbDriver } from '../driver';
import { migrate, type Migration } from '../migrate';
import { migration001 } from '../migrations/001_initial_schema';
import { MIGRATIONS } from '../migrations';

interface MigrationsRow {
  version: number;
  name: string;
  applied_at: number;
}
interface SqliteMasterRow {
  name: string;
}

let db: DbDriver;
beforeEach(async () => {
  db = await openBetterSqliteDriver();
});
afterEach(async () => {
  await db.close();
});

it('MIGRATIONS exports exactly one migration: version 1, 001_initial_schema', () => {
  expect(MIGRATIONS).toHaveLength(1);
  expect(MIGRATIONS[0].version).toBe(1);
  expect(MIGRATIONS[0].name).toBe('001_initial_schema');
});

describe('migrate()', () => {
  it('applies migration 001 on a fresh database and returns [1]', async () => {
    expect(await migrate(db)).toEqual([1]);
    const rows = await db.query<MigrationsRow>('SELECT * FROM migrations');
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(1);
    expect(rows[0].name).toBe('001_initial_schema');
    expect(typeof rows[0].applied_at).toBe('number');
  });

  it('is idempotent: a second run returns [] and leaves state unchanged', async () => {
    await migrate(db);
    expect(await migrate(db)).toEqual([]);
    expect(await db.query<MigrationsRow>('SELECT * FROM migrations')).toHaveLength(1);
    const tables = await db.query<SqliteMasterRow>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(['products', 'scans']));
  });

  it('applies out-of-order input ascending by version', async () => {
    const migrations: Migration[] = [
      { version: 3, name: 'third', statements: ['CREATE TABLE t3 (id INTEGER)'] },
      { version: 1, name: 'first', statements: ['CREATE TABLE t1 (id INTEGER)'] },
      { version: 2, name: 'second', statements: ['CREATE TABLE t2 (id INTEGER)'] },
    ];
    expect(await migrate(db, migrations)).toEqual([1, 2, 3]);
  });

  it('applies only a new pending migration when the database is already at version 1', async () => {
    await migrate(db, [migration001]);
    const migration002: Migration = {
      version: 2,
      name: '002_test_extra',
      statements: ['CREATE TABLE extra (id INTEGER)'],
    };
    expect(await migrate(db, [migration001, migration002])).toEqual([2]);
  });

  it('rejects on a duplicate migration version', async () => {
    const migrations: Migration[] = [
      { version: 1, name: 'a', statements: ['CREATE TABLE a (id INTEGER)'] },
      { version: 1, name: 'b', statements: ['CREATE TABLE b (id INTEGER)'] },
    ];
    await expect(migrate(db, migrations)).rejects.toThrow(/duplicate migration version/);
  });

  it('rejects on a non-positive or non-integer version', async () => {
    await expect(
      migrate(db, [{ version: 0, name: 'zero', statements: ['CREATE TABLE z (id INTEGER)'] }]),
    ).rejects.toThrow(/invalid migration version/);
    await expect(
      migrate(db, [{ version: 1.5, name: 'half', statements: ['CREATE TABLE h (id INTEGER)'] }]),
    ).rejects.toThrow(/invalid migration version/);
  });

  it('rejects when the database schema is newer than the known migrations', async () => {
    const migration002: Migration = {
      version: 2,
      name: '002_test_extra',
      statements: ['CREATE TABLE extra (id INTEGER)'],
    };
    await migrate(db, [migration001, migration002]);
    await expect(migrate(db, [migration001])).rejects.toThrow(
      /database schema is newer than this build/,
    );
  });

  it('rolls back a failing migration entirely: nothing applied, nothing recorded', async () => {
    const badMigration: Migration = {
      version: 1,
      name: 'bad',
      statements: ['CREATE TABLE good_table (id INTEGER)', 'NOT VALID SQL'],
    };
    await expect(migrate(db, [badMigration])).rejects.toThrow();
    expect(await db.query<MigrationsRow>('SELECT * FROM migrations')).toHaveLength(0);
    expect(
      await db.query<SqliteMasterRow>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'good_table'",
      ),
    ).toHaveLength(0);
  });
});
