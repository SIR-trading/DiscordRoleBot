import Database from "better-sqlite3";
import { serverEnv } from "./env";

let cached: Database.Database | null = null;

/**
 * Server-only. Shares the same SQLite file as the bot via the docker volume.
 * Re-uses one connection per process to avoid hammering the filesystem.
 */
export function db(): Database.Database {
  if (cached) return cached;
  const conn = new Database(serverEnv().DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.pragma("synchronous = NORMAL");
  conn.pragma("foreign_keys = ON");
  conn.pragma("busy_timeout = 5000");
  cached = conn;
  return cached;
}
