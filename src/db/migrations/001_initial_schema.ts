import type { Migration } from '../migrate';

/** Schema v1: the OFF response cache and the scan history. Timestamps are epoch ms. */
export const migration001: Migration = {
  version: 1,
  name: '001_initial_schema',
  statements: [
    `CREATE TABLE products (
      barcode    TEXT    PRIMARY KEY NOT NULL,
      off_json   TEXT    NOT NULL,
      fetched_at INTEGER NOT NULL
    );`,
    `CREATE TABLE scans (
      id         INTEGER PRIMARY KEY,
      barcode    TEXT    NOT NULL,
      scanned_at INTEGER NOT NULL
    );`,
    `CREATE INDEX idx_scans_scanned_at ON scans (scanned_at DESC);`,
  ],
};
