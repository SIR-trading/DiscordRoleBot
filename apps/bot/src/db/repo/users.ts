import type Database from "better-sqlite3";

export type UserRow = {
  discord_id: string;
  linked_at: number;
  last_tier: string | null;
  last_total_wei: string;
  last_refreshed: number | null;
  pending_refresh: number;
};

export class UsersRepo {
  constructor(private readonly db: Database.Database) {}

  upsertOnLink(discordId: string): void {
    this.db
      .prepare(
        `INSERT INTO users (discord_id, linked_at) VALUES (?, unixepoch())
         ON CONFLICT(discord_id) DO NOTHING`,
      )
      .run(discordId);
  }

  setPendingRefresh(discordId: string): void {
    this.db.prepare(`UPDATE users SET pending_refresh = 1 WHERE discord_id = ?`).run(discordId);
  }

  /** Atomic claim-and-clear; returns the discord IDs whose pending flag we cleared. */
  claimPendingRefreshes(limit = 100): string[] {
    const rows = this.db
      .prepare(
        `UPDATE users SET pending_refresh = 0
         WHERE discord_id IN (
           SELECT discord_id FROM users WHERE pending_refresh = 1 LIMIT ?
         )
         RETURNING discord_id`,
      )
      .all(limit) as { discord_id: string }[];
    return rows.map((r) => r.discord_id);
  }

  markRefreshed(args: { discordId: string; tierName: string | null; totalWei: bigint }): void {
    this.db
      .prepare(
        `UPDATE users
            SET last_tier = ?,
                last_total_wei = ?,
                last_refreshed = unixepoch()
          WHERE discord_id = ?`,
      )
      .run(args.tierName, args.totalWei.toString(), args.discordId);
  }

  getById(discordId: string): UserRow | undefined {
    return this.db.prepare(`SELECT * FROM users WHERE discord_id = ?`).get(discordId) as UserRow | undefined;
  }

  listAll(): UserRow[] {
    return this.db.prepare(`SELECT * FROM users`).all() as UserRow[];
  }

  delete(discordId: string): void {
    this.db.prepare(`DELETE FROM users WHERE discord_id = ?`).run(discordId);
  }
}
