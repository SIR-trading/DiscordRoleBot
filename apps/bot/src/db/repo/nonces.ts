import type Database from "better-sqlite3";
import { randomBytes } from "node:crypto";

export type NonceRow = {
  nonce: string;
  discord_id: string;
  issued_at: number;
  expires_at: number;
  consumed_at: number | null;
};

export class NoncesRepo {
  constructor(private readonly db: Database.Database) {}

  issue(args: { discordId: string; ttlSeconds: number }): { nonce: string; expiresAt: number } {
    const nonce = randomBytes(32).toString("hex");
    const row = this.db
      .prepare(
        `INSERT INTO verification_nonces (nonce, discord_id, issued_at, expires_at)
         VALUES (?, ?, unixepoch(), unixepoch() + ?)
         RETURNING expires_at`,
      )
      .get(nonce, args.discordId, args.ttlSeconds) as { expires_at: number };
    return { nonce, expiresAt: row.expires_at };
  }

  /**
   * Returns the row only if the nonce is unused, unexpired, and belongs to the
   * given discord ID. Does NOT consume — separate atomic step is required at
   * link time.
   */
  lookupForVerification(nonce: string): NonceRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM verification_nonces
          WHERE nonce = ?
            AND consumed_at IS NULL
            AND expires_at > unixepoch()`,
      )
      .get(nonce) as NonceRow | undefined;
  }

  /** Atomic single-use consume. Returns true iff this call won the race. */
  consume(nonce: string): boolean {
    const info = this.db
      .prepare(
        `UPDATE verification_nonces
            SET consumed_at = unixepoch()
          WHERE nonce = ?
            AND consumed_at IS NULL
            AND expires_at > unixepoch()`,
      )
      .run(nonce);
    return info.changes > 0;
  }

  /** Best-effort cleanup of fully-expired nonces. */
  purgeExpired(): number {
    const info = this.db
      .prepare(`DELETE FROM verification_nonces WHERE expires_at < unixepoch() - 86400`)
      .run();
    return info.changes;
  }
}
