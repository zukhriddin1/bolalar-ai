import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { MIGRATIONS } from "./schema.js";

export type Db = Database.Database;

/**
 * Opens the database and brings it up to the latest schema version.
 *
 * Migrations are plain SQL keyed by version and applied inside a transaction,
 * with `PRAGMA user_version` as the bookkeeping. That is enough for a project
 * this size and avoids pulling in a migration framework.
 */
export function openDatabase(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;

  for (const [index, sql] of MIGRATIONS.entries()) {
    const version = index + 1;
    if (version <= current) continue;

    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  }
}
