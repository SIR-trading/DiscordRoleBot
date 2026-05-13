import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

const MIGRATIONS = [
  { version: 1, file: "001_init.sql" },
] as const;

export type Db = ReturnType<typeof openDb>;

export function openDb(path: string): Database.Database {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });

  const db = new Database(path);

  // Apply on every connection — these are connection-scoped pragmas.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const appliedRows = db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[];
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const { version, file } of MIGRATIONS) {
    if (applied.has(version)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    logger.info({ version, file }, "applying migration");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, unixepoch())").run(version);
    });
    tx();
  }
}
