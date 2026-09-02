# Plan — Issue #2: SQLite foundation (driver interface, schema v1, migrations)

Status: proposed · Author: architect · Branch: `feat/2-sqlite-foundation` · Depends on #1 (merged PR #8), #9 (merged PR #10)

## 1. Goal

Give every later data issue a tested foundation: one thin async database interface, two
implementations of it (`expo-sqlite` in the app, `better-sqlite3` in Node tests), a migration runner
that applies pending migrations in version order on app start and is a no-op on re-run, and
migration 001 creating `products` (a cache of raw OFF responses keyed by barcode, carrying
`fetched_at` so #4 can implement a TTL) and `scans` (barcode + timestamp history). Nothing fetches,
nothing renders a list, nothing parses OFF JSON. After this PR the data layer is exercisable
headlessly against real SQLite, which is the whole point.

**No `package.json` change is needed or permitted.** `expo-sqlite@~16.0.10` (dependency) and
`better-sqlite3@^13.0.3` + `@types/better-sqlite3@^9.6.0` (devDependencies) are already installed.
If an agent believes a dependency is missing, stop and report — do not install.

Assumptions: the app opens exactly one database, named `scan.db`; timestamps are produced by
`Date.now()` only; `tsconfig.json` has no `include`, so everything under `src/` is typechecked
(this is what makes the better-sqlite3 driver's types load-bearing); jest-expo's preset mocks the
`ExpoSQLite` native module with argument-less stubs (verified in
`jest-expo/src/preset/moduleMocks/expoModules.js`), so `openDatabaseAsync` cannot do real work in
Node and the expo driver is **not** unit-testable — see §7.

## 2. Lane assignment (read this first)

| Path | Owner | Rationale |
|---|---|---|
| `src/db/driver.ts` | lead-programmer | App interface + shared types. |
| `src/db/expoDriver.ts` | lead-programmer | `expo-sqlite` implementation. |
| `src/db/betterSqliteDriver.ts` | **lead-programmer** | See ruling below. |
| `src/db/migrate.ts` | lead-programmer | Migration types + runner. |
| `src/db/migrations/001_initial_schema.ts` | lead-programmer | DDL for schema v1. |
| `src/db/migrations/index.ts` | lead-programmer | The ordered `MIGRATIONS` array. |
| `src/db/index.ts` | lead-programmer | `initDatabase()` — open + migrate. |
| `App.tsx` | lead-programmer | Minimal init call (§6). |
| `src/db/__tests__/**` | test-programmer | All tests. |
| `src/__tests__/sqlite-smoke.test.ts` | test-programmer | **Delete** (§7). |
| `DECISIONS.md`, `docs/plans/2-sqlite-foundation.md` | architect | §8 and this file. |

**Ruling — the better-sqlite3 driver is app code, written by lead-programmer under `src/db/`.**
It is an implementation of an interface lead-programmer owns; the two drivers must agree on details
that are contract, not test scaffolding (notably: better-sqlite3 returns `lastInsertRowid` while
expo-sqlite returns `lastInsertRowId`, and one of them has to normalise). Putting it in the test
lane means every future interface change forces test-programmer to edit contract code, which is the
exact lane crossing the rules forbid, and it would let the app's contract drift from the thing tests
verify. The Expo Go constraint still holds mechanically: nothing reachable from `index.ts` /
`App.tsx` imports it, so Metro never bundles it — `export:check` is the proof (§6, item 5), the same
argument plan #1 §4.4 made for `better-sqlite3` living in the repo at all.

## 3. Module map

| File | Action | Responsibility |
|---|---|---|
| `src/db/driver.ts` | create | `DbDriver` interface, `SqlValue`, `SqlParams`, `RunResult`. No runtime imports. |
| `src/db/expoDriver.ts` | create | `openExpoDriver()` — wraps `SQLiteDatabase` from `expo-sqlite`. |
| `src/db/betterSqliteDriver.ts` | create | `openBetterSqliteDriver()` — wraps `better-sqlite3`, sync calls returned as Promises. |
| `src/db/migrate.ts` | create | `Migration` type and `migrate()` — bookkeeping table, ordering, idempotency. |
| `src/db/migrations/001_initial_schema.ts` | create | `products`, `scans`, and the scans index (§5). |
| `src/db/migrations/index.ts` | create | `MIGRATIONS` — the ordered list; the only place a new migration is registered. |
| `src/db/index.ts` | create | `DATABASE_NAME`, `initDatabase()` — open expo-sqlite and run pending migrations, memoised. |
| `App.tsx` | change | Call `initDatabase()` on mount; render its failure instead of swallowing it (§6). |
| `src/db/__tests__/migrate.test.ts` | create | Runner properties (§7). |
| `src/db/__tests__/schema.test.ts` | create | Round-trips against schema v1 (§7). |
| `src/__tests__/sqlite-smoke.test.ts` | delete | Superseded (§7). |

Deliberately **not** created: repositories/DAOs, a `Product` type, a query builder, a React context
or provider, connection pooling, a seed/reset helper, `PRAGMA foreign_keys`, WAL tuning. #4 and #7
add what they need on top of this.

## 4. Public interface

This is the contract. Signatures are exact; bodies are lead-programmer's.

### 4.1 `src/db/driver.ts`

```ts
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
```

`exec` and `run` are separate on purpose: both SQLite bindings accept multiple statements only
without parameters (`execAsync` / `db.exec`) and parameters only one statement at a time
(`runAsync` / `prepare().run()`). Collapsing them would force either string interpolation into SQL
or single-statement migrations.

### 4.2 `src/db/expoDriver.ts`

```ts
import type { SQLiteOpenOptions } from 'expo-sqlite';

export function openExpoDriver(
  databaseName: string,
  options?: SQLiteOpenOptions,
): Promise<DbDriver>;
```

Maps to verified `expo-sqlite@16.0.10` API: `openDatabaseAsync`, `execAsync(source)`,
`runAsync(source, params)` → `{ changes, lastInsertRowId }`, `getAllAsync<T>(source, params)`,
`withTransactionAsync(task: () => Promise<void>)`, `closeAsync()`. Because `withTransactionAsync`'s
task must resolve to `void`, the driver captures `work`'s result in a closure variable and returns
it after the transaction resolves. Use `withTransactionAsync`, **not**
`withExclusiveTransactionAsync` — the latter opens a second connection and throws on web.

### 4.3 `src/db/betterSqliteDriver.ts`

```ts
/** Node/test-only. Never imported from App.tsx or index.ts. */
export function openBetterSqliteDriver(filename?: string): Promise<DbDriver>;
```

`filename` defaults to `':memory:'`. Sync calls are wrapped in already-resolved Promises; no fake
async, no worker threads.

**Ruling — transactions use `exec('BEGIN' | 'COMMIT' | 'ROLLBACK')`, not `db.transaction(fn)`.**
Verified: better-sqlite3 13.0.3 throws `Transaction function cannot return a promise` when handed an
async function, so its helper cannot honour an async-shaped interface at all. Explicit
BEGIN/COMMIT/ROLLBACK in `try/catch` is exactly what `expo-sqlite`'s `withTransactionAsync` does
internally (`SQLiteDatabase.js`), so the two drivers get the same semantics rather than
merely-similar ones. Cost given up: better-sqlite3's automatic savepoint nesting — we do not support
nested transactions in either driver, and say so in §4.1.

### 4.4 `src/db/migrate.ts`

```ts
export interface Migration {
  /** Positive integer, unique across MIGRATIONS. Defines apply order. */
  readonly version: number;
  /** Human label recorded in the migrations table, e.g. '001_initial_schema'. */
  readonly name: string;
  /** Executed in array order inside one transaction, each via driver.exec. */
  readonly statements: readonly string[];
}

/** DDL for the bookkeeping table; created (IF NOT EXISTS) before anything is read. */
export const MIGRATIONS_TABLE_DDL: string;

/**
 * Applies every migration whose version is not yet recorded, ascending.
 * Idempotent: a second call with the same list applies nothing.
 * Resolves to the versions applied by *this* call, ascending (empty if none).
 */
export function migrate(
  db: DbDriver,
  migrations?: readonly Migration[],
): Promise<readonly number[]>;
```

`migrations` defaults to `MIGRATIONS`; tests pass synthetic lists to exercise ordering and rollback
without inventing fake schema changes in the real list.

Runner behaviour, in order — this is the testable contract:

1. `exec(MIGRATIONS_TABLE_DDL)` (uses `IF NOT EXISTS`).
2. Sort a **copy** of `migrations` ascending by `version`; input order is irrelevant.
3. Throw `Error` starting `duplicate migration version` if two entries share a version, or
   `invalid migration version` if any version is not a positive integer.
4. Read applied versions. If the highest applied version exceeds the highest known version, throw an
   `Error` starting `database schema is newer than this build`. Rationale: on Expo Go the same
   on-device database is reached by different JS bundles; a database written by a newer build has
   columns and constraints this code does not know about, and continuing would write wrong data
   silently. Failing loudly at start is recoverable (reinstall/clear data); silent corruption is not.
5. For each pending migration ascending, inside **one `transaction` per migration**: `exec` each
   statement in order, then `run` the `INSERT INTO migrations`. SQLite DDL is transactional, so a
   statement that throws leaves that migration fully un-applied and unrecorded, and the error
   propagates (later migrations are not attempted).
6. Resolve to the applied versions.

### 4.5 `src/db/index.ts`

```ts
export const DATABASE_NAME = 'scan.db';

/**
 * Opens the app database via expo-sqlite and applies pending migrations.
 * Memoised: repeated calls resolve to the same driver and migrate once.
 * A rejected init is not cached, so a later call can retry.
 */
export function initDatabase(): Promise<DbDriver>;

export type { DbDriver, RunResult, SqlParams, SqlValue } from './driver';
```

Memoisation is not an optimisation: two concurrent `migrate()` runs on one connection can both see
zero applied rows and both try to insert version 1, which fails on the primary key. Fast Refresh and
double-mounted effects make that reachable.

## 5. Data model

Schema v1. **Timestamps are integer Unix epoch milliseconds, UTC** — `Date.now()` verbatim, no
parsing on either side, exact integer comparison for the TTL #4 will add
(`fetched_at < Date.now() - TTL_MS`), and the same ordering as INTEGER for `ORDER BY`. ISO-8601 TEXT
sorts correctly too but costs a parse on every read and invites a timezone question that has no good
answer on-device.

### 5.1 Bookkeeping table (created by the runner, not by a migration)

```sql
CREATE TABLE IF NOT EXISTS migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  applied_at INTEGER NOT NULL
);
```

It cannot be migration 001: the runner must read it to decide whether 001 has run. `IF NOT EXISTS`
is what makes step 1 of §4.4 idempotent. Chosen over `PRAGMA user_version` because a pragma is one
integer with no name, no `applied_at`, and no per-migration row — and the acceptance criteria ask
for an ordered migrations *table*.

### 5.2 Migration 001 — `001_initial_schema`

```sql
CREATE TABLE products (
  barcode    TEXT    PRIMARY KEY NOT NULL,
  off_json   TEXT    NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE scans (
  id         INTEGER PRIMARY KEY,
  barcode    TEXT    NOT NULL,
  scanned_at INTEGER NOT NULL
);

CREATE INDEX idx_scans_scanned_at ON scans (scanned_at DESC);
```

- **`off_json` stores the raw OFF response as TEXT**, unparsed. #4 owns the OFF client and the
  `Product` type; caching the raw payload means a parser change is a code change, not a migration,
  and re-parsing never needs a refetch. SQLite's JSON functions work on TEXT, so nothing is lost.
- **`NOT NULL` on a TEXT PRIMARY KEY is not redundant.** Verified: SQLite accepts `NULL` into a
  non-INTEGER PRIMARY KEY column (long-standing documented behaviour). Without it, a bug could
  insert a NULL-barcode cache row.
- **`id INTEGER PRIMARY KEY`, no `AUTOINCREMENT`.** It is a rowid alias, which is the SQLite idiom;
  `AUTOINCREMENT` only guarantees never-reused ids at the cost of a `sqlite_sequence` table, and
  history is ordered by `scanned_at`, not by `id`.
- **No foreign key from `scans.barcode` to `products.barcode`.** Scanning a barcode OFF has never
  heard of must still be recorded — that is the data that tells us what is missing. An FK would
  either reject the insert or force a placeholder `products` row, which would corrupt what a
  `products` row means (*we have an OFF payload, fetched at `fetched_at`*). It would also be
  decorative: SQLite does not enforce foreign keys unless `PRAGMA foreign_keys = ON`, which this PR
  does not set.
- **The index is the one line here not literally demanded by the acceptance criteria.** History is
  read `ORDER BY scanned_at DESC`; adding it later costs a migration, and it is three words.

**Explicitly absent, by design:** allergen, label, trace, category, ingredient, brand and
product-name columns; any negative-cache / not-found marker; any "declared absent vs declared
present vs no data" encoding. Those are #4 (parsing, TTL, negative caching) and #7 (alternatives and
matching), and each is an additive `ALTER TABLE ADD COLUMN` or a new table in migration 002+, which
is what the runner exists for. Do not add them here "while we're in the file". The project's
explicit-unknowns rule is not violated by their absence — schema v1 stores the raw payload, in which
"absent" and "not stated" are still distinguishable.

**Migration note:** no existing database anywhere, so there is no upgrade path to write. Version 1
is the first row `migrations` will ever hold.

## 6. Done means

1. `migrate()` on a fresh `:memory:` database creates `migrations`, `products`, `scans` and
   `idx_scans_scanned_at`, and resolves to `[1]`.
2. Calling `migrate()` a second time on the same database resolves to `[]`, leaves exactly one row
   in `migrations` (version 1), and changes no other table.
3. A row inserted into `products` and into `scans` through `DbDriver.run` reads back through
   `DbDriver.query` with identical values, including a numeric `fetched_at` / `scanned_at` that is
   still a `number` after the round trip.
4. A migration whose statements throw partway leaves the database with that migration neither
   applied nor recorded, and `migrate()` rejects.
5. `npm run typecheck`, `npx jest` and `npm run export:check` all exit 0; the exported web bundle
   contains no reference to `better-sqlite3` (`grep -ri better-sqlite3 dist/` finds nothing).
6. Launching in Expo Go runs migrations once at start and reaches the normal screen; a forced
   failure shows the error on screen rather than a blank one.
7. `git diff main...HEAD --stat` touches only §3's files. `package.json`, `package-lock.json`,
   `tsconfig.json`, `app.json`, `index.ts`, `jest.config.js` and `.github/workflows/ci.yml` are
   unchanged.

**App.tsx does change, minimally — ruling.** "Applies pending migrations on app start" is an
acceptance criterion, and with no caller it is unverifiable on device; a foundation nobody has ever
run is not a foundation. The whole change is: a `useEffect(() => { ... }, [])` calling
`initDatabase()`, a `useState` holding an error message, and rendering that message in the existing
`<Text>` when set. No spinner, no gate on rendering children, no context, no provider, no new
component file, no new dependency — roughly 12 lines. #3 will replace this scaffold screen anyway;
the point is that the wiring exists and can be seen to work. Errors must be surfaced, not
`.catch(() => {})` — an unhandled/swallowed rejection here is an auditor finding.

## 7. Test surface

All tests use `openBetterSqliteDriver(':memory:')` and close the driver in `afterEach`. Two files
under `src/db/__tests__/`, written against §4 only — no reaching into driver internals, no asserting
on SQL strings.

`migrate.test.ts` — `migrate()` with synthetic `Migration[]` plus the real `MIGRATIONS`:

| Property | Why it matters |
|---|---|
| Fresh run applies all pending, ascending, and returns their versions | The core behaviour. |
| Second run returns `[]`; `migrations` holds exactly one row per migration | Idempotency (acceptance criterion), and the one bug that would corrupt a user's database. |
| An unsorted input list is applied in version order | Registration order in `MIGRATIONS/index.ts` must not be load-bearing. |
| Adding a later migration to an already-migrated database applies only the new one | This is how every future issue will land its schema change. |
| A migration whose statements throw: rejects, records nothing, applies nothing, and does not attempt later versions | Transaction rollback — cheap here and expensive to discover later. |
| Duplicate/invalid versions, and an applied version higher than any known one, reject with the §4.4 messages | Assert on the documented message prefix, not the exact string. |

`schema.test.ts` — schema v1 after `migrate(db)`:

| Property | Why it matters |
|---|---|
| `products` round-trip: insert `(barcode, off_json, fetched_at)`, read back, JSON string byte-identical, `fetched_at` still a number | Acceptance criterion; also proves TEXT-as-payload survives. |
| Second insert of the same barcode rejects | The primary key is the cache key #4 depends on. |
| `scans` round-trip, and a scan of a barcode absent from `products` inserts fine | The explicit no-FK decision (§5.2) is a behaviour, so it gets a test. |
| Two scans get distinct ids and read back newest-first by `scanned_at` | The history access path. |
| `transaction()` rolls back a mid-way failure and commits on success | Interface contract, used by the runner. |

Inserts and reads go through the driver with raw SQL. **Do not** write repository/DAO helpers to
make these read nicely — that is #4's design decision, not a test convenience.

**Not tested: `openExpoDriver`.** jest-expo's preset replaces the `ExpoSQLite` native module with
argument-less stubs, so `openDatabaseAsync` in Node yields an object that cannot execute SQL; any
test of it would assert on the mock. Its guarantees here are `npm run typecheck` (it must satisfy
`DbDriver` structurally), `npm run export:check` (it must bundle), and item 6 of §6 (a human runs it
in Expo Go once). Do not add a hand-written `expo-sqlite` mock to manufacture coverage — that is the
"mocks would test the mocks" failure the dual-driver decision exists to avoid.

**Delete `src/__tests__/sqlite-smoke.test.ts`.** Plan #1 §7 sanctioned this once a real driver test
covered the same path, and both files above load the better-sqlite3 addon under the jest-expo runner
and round-trip a row. Keeping it means a placeholder that can never fail alone stays in the suite
and reads like coverage. `src/__tests__/render-smoke.test.tsx` stays — nothing here replaces it.

## 8. DECISIONS.md

The existing entry *"2026-09-02 — Dual SQLite drivers: expo-sqlite in app, better-sqlite3 in tests"*
already records the pattern and says "implemented in issue #2" — **do not duplicate it.** It is
amended in place, dated 2026-09-02 (issue #2), to record the three tradeoffs this plan actually
makes, none of which the original entry decided: the interface is async-only (§4.1), the
better-sqlite3 driver lives in `src/db/` under lead-programmer's lane (§2), and its transactions use
explicit BEGIN/COMMIT/ROLLBACK because `db.transaction()` rejects async functions (§4.3). Those are
the things a future agent would otherwise re-litigate or quietly "fix". No second entry: migration
versioning (integer, table, one transaction each) is a conventional choice with no interesting
alternative given, and lives here in §4.4/§5.1.

## 9. Out of scope

- OFF fetching, the OFF client, `Product` parsing, TTL policy, negative caching (#4).
- Alternatives / matching / ranking schema and any allergen or label columns (#7).
- Any screen, list, navigation or context beyond the ~12 lines of `App.tsx` in §6.
- Repositories, DAOs, query builders, an ORM, schema-generated types.
- `PRAGMA foreign_keys`, WAL/journal tuning, `expo-sqlite`'s `useSQLiteContext` / `SQLiteProvider`
  hooks, database backup/export, encryption, blob (`Uint8Array`) binding.
- Any `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js` or CI change.
- Migration *down*/rollback support. Nothing needs it, SQLite makes it expensive, and it invites
  writing untested inverse DDL.

## 10. Open questions

1. **The reviewable diff will land near or over the 400-line ceiling.** Honest estimate: ~240 lines
   of app code + ~14 in `App.tsx` + ~140 of tests − 27 deleted, before this plan doc. That is inside
   the limit only if `docs/plans/` is excluded from the count the way plan #1 §6 excluded it. If the
   human wants it counted, the clean split is two PRs — (a) `driver.ts` + both drivers + their
   transaction/round-trip tests, (b) migration runner + 001 + `App.tsx` wiring — at the cost of
   shipping a driver with no schema. I recommend one PR and flagging the size in the PR body; the
   two halves are hard to review separately.
2. **Is throwing on a newer-than-known schema the right app-start behaviour?** §4.4 step 4 means a
   user who installs an older build over a newer one gets an error screen with no in-app recovery. A
   product answer might instead be "wipe and rebuild the cache", which is safe for `products` but
   loses `scans` history. I chose the loud failure because it is a developer-only scenario today.
3. **Should `initDatabase()` be memoised, or should ownership move to a React context now?** §4.5
   uses a module-level promise, which is the smallest thing that prevents a double-migration race
   but is also module state that tests cannot reset. #3/#5 may want a provider; I deliberately did
   not build one.
4. **`scans` has no per-scan uniqueness or debounce.** A camera that fires the same barcode ten
   times a second writes ten rows. Whether dedupe belongs in the schema (a unique constraint), the
   scanner (#3), or the history query is a product decision, and I have assumed it is not this PR's.
