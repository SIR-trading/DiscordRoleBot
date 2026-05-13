import type Database from "better-sqlite3";

export class VerifyAttemptsRepo {
  constructor(private readonly db: Database.Database) {}

  record(discordId: string): void {
    this.db
      .prepare(`INSERT INTO verify_attempts (discord_id, attempted_at) VALUES (?, unixepoch())`)
      .run(discordId);
  }

  countLastHour(discordId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM verify_attempts
          WHERE discord_id = ? AND attempted_at > unixepoch() - 3600`,
      )
      .get(discordId) as { n: number };
    return row.n;
  }

  purgeOld(): number {
    const info = this.db
      .prepare(`DELETE FROM verify_attempts WHERE attempted_at < unixepoch() - 86400`)
      .run();
    return info.changes;
  }
}
