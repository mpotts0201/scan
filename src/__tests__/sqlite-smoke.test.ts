// Smoke test only: proves the better-sqlite3 native addon loads and executes
// SQL under the jest-expo runner, ahead of issue #2 depending on it for real
// data-layer tests. Not a schema, not a migration — see plan §5.
import Database from 'better-sqlite3';

describe('better-sqlite3 in the jest-expo test environment', () => {
  let db: Database.Database;

  afterAll(() => {
    db.close();
  });

  it('opens an in-memory database and round-trips a row', () => {
    db = new Database(':memory:');

    db.exec('CREATE TABLE greeting (id INTEGER PRIMARY KEY, message TEXT NOT NULL)');
    db.prepare('INSERT INTO greeting (id, message) VALUES (?, ?)').run(1, 'hello from better-sqlite3');

    const row = db.prepare('SELECT message FROM greeting WHERE id = ?').get(1) as
      | { message: string }
      | undefined;

    expect(row?.message).toBe('hello from better-sqlite3');
  });
});
