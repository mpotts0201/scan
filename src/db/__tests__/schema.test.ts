import { openBetterSqliteDriver } from '../betterSqliteDriver';
import type { DbDriver } from '../driver';
import { migrate } from '../migrate';

interface ProductRow {
  barcode: string;
  off_json: string;
  fetched_at: number;
}
interface ScanRow {
  id: number;
  barcode: string;
  scanned_at: number;
}
interface SqliteMasterRow {
  name: string;
}

let db: DbDriver;
beforeEach(async () => {
  db = await openBetterSqliteDriver();
  await migrate(db);
});
afterEach(async () => {
  await db.close();
});

describe('products table', () => {
  it('round-trips barcode, off_json and fetched_at as a number', async () => {
    const fetchedAt = 1_700_000_000_000;
    const result = await db.run(
      'INSERT INTO products (barcode, off_json, fetched_at) VALUES (?, ?, ?)',
      ['0123456789012', '{"product_name":"Test"}', fetchedAt],
    );
    expect(result.changes).toBe(1);
    const rows = await db.query<ProductRow>('SELECT * FROM products WHERE barcode = ?', [
      '0123456789012',
    ]);
    expect(rows).toEqual([
      { barcode: '0123456789012', off_json: '{"product_name":"Test"}', fetched_at: fetchedAt },
    ]);
    expect(typeof rows[0].fetched_at).toBe('number');
  });

  it('rejects inserting a duplicate barcode', async () => {
    await db.run('INSERT INTO products (barcode, off_json, fetched_at) VALUES (?, ?, ?)', [
      '111',
      '{}',
      1,
    ]);
    // Wrapped in an async closure (matching real call sites, which always
    // `await` a driver call from inside an async function): the interface
    // is `Promise<RunResult>`, and awaiting is what turns a synchronous
    // throw into a rejection.
    await expect(
      (async () =>
        db.run('INSERT INTO products (barcode, off_json, fetched_at) VALUES (?, ?, ?)', [
          '111',
          '{}',
          2,
        ]))(),
    ).rejects.toThrow();
  });
});

describe('scans table', () => {
  it('round-trips two scans and orders newest-first by scanned_at', async () => {
    const first = await db.run('INSERT INTO scans (barcode, scanned_at) VALUES (?, ?)', [
      '111',
      1000,
    ]);
    const second = await db.run('INSERT INTO scans (barcode, scanned_at) VALUES (?, ?)', [
      '222',
      2000,
    ]);
    expect(second.lastInsertRowId).toBeGreaterThan(first.lastInsertRowId);
    const rows = await db.query<ScanRow>('SELECT * FROM scans ORDER BY scanned_at DESC');
    expect(rows.map((r) => r.barcode)).toEqual(['222', '111']);
  });

  it('inserts a scan for a barcode absent from products', async () => {
    const result = await db.run('INSERT INTO scans (barcode, scanned_at) VALUES (?, ?)', [
      'not-in-products',
      1000,
    ]);
    expect(result.changes).toBe(1);
  });
});

it('idx_scans_scanned_at exists after migration', async () => {
  expect(
    await db.query<SqliteMasterRow>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_scans_scanned_at'",
    ),
  ).toHaveLength(1);
});

describe('DbDriver.transaction()', () => {
  it('commits writes and returns the work value on success', async () => {
    const value = await db.transaction(async (tx) => {
      await tx.run('INSERT INTO products (barcode, off_json, fetched_at) VALUES (?, ?, ?)', [
        'tx-ok',
        '{}',
        1,
      ]);
      return 'done';
    });
    expect(value).toBe('done');
    expect(
      await db.query<ProductRow>('SELECT * FROM products WHERE barcode = ?', ['tx-ok']),
    ).toHaveLength(1);
  });

  it('rolls back all writes and rejects with the original error when work throws', async () => {
    const failure = new Error('boom');
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO products (barcode, off_json, fetched_at) VALUES (?, ?, ?)', [
          'tx-fail',
          '{}',
          1,
        ]);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(
      await db.query<ProductRow>('SELECT * FROM products WHERE barcode = ?', ['tx-fail']),
    ).toHaveLength(0);
  });
});
