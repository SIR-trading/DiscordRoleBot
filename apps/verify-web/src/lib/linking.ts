import type Database from "better-sqlite3";

/**
 * Mirror of `apps/bot/src/db/linking.ts`. Both processes share the same
 * SQLite file and schema, so this function is intentionally duplicated to
 * keep verify-web independent of the bot package.
 */

export type LinkResult =
  | { ok: true }
  | { ok: false; reason: "nonce_invalid" | "wallet_taken" | "wallet_limit" };

export function linkWallet(
  db: Database.Database,
  args: {
    nonce: string;
    discordId: string;
    walletAddress: string;
    maxWalletsPerUser: number;
  },
): LinkResult {
  const txn = db.transaction((): LinkResult => {
    const nonceRow = db
      .prepare(
        `SELECT discord_id FROM verification_nonces
          WHERE nonce = ?
            AND consumed_at IS NULL
            AND expires_at > unixepoch()`,
      )
      .get(args.nonce) as { discord_id: string } | undefined;
    if (!nonceRow || nonceRow.discord_id !== args.discordId) {
      return { ok: false, reason: "nonce_invalid" };
    }

    const userExists = db
      .prepare(`SELECT 1 FROM users WHERE discord_id = ?`)
      .get(args.discordId);
    if (userExists) {
      const { n } = db
        .prepare(`SELECT COUNT(*) AS n FROM wallets WHERE discord_id = ?`)
        .get(args.discordId) as { n: number };
      if (n >= args.maxWalletsPerUser) {
        return { ok: false, reason: "wallet_limit" };
      }
    }

    const consume = db
      .prepare(
        `UPDATE verification_nonces SET consumed_at = unixepoch()
          WHERE nonce = ? AND consumed_at IS NULL AND expires_at > unixepoch()`,
      )
      .run(args.nonce);
    if (consume.changes !== 1) {
      return { ok: false, reason: "nonce_invalid" };
    }

    db.prepare(
      `INSERT INTO users (discord_id, linked_at) VALUES (?, unixepoch())
       ON CONFLICT(discord_id) DO NOTHING`,
    ).run(args.discordId);

    try {
      db.prepare(
        `INSERT INTO wallets (wallet_address, discord_id, verified_at)
         VALUES (LOWER(?), ?, unixepoch())`,
      ).run(args.walletAddress, args.discordId);
    } catch (err: unknown) {
      const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : "";
      if (code === "SQLITE_CONSTRAINT_PRIMARYKEY" || code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { ok: false, reason: "wallet_taken" };
      }
      throw err;
    }

    db.prepare(`UPDATE users SET pending_refresh = 1 WHERE discord_id = ?`).run(args.discordId);

    return { ok: true };
  });

  return txn.immediate();
}

export function lookupNonce(
  db: Database.Database,
  nonce: string,
): { discordId: string; expiresAt: number } | null {
  const row = db
    .prepare(
      `SELECT discord_id, expires_at FROM verification_nonces
        WHERE nonce = ?
          AND consumed_at IS NULL
          AND expires_at > unixepoch()`,
    )
    .get(nonce) as { discord_id: string; expires_at: number } | undefined;
  if (!row) return null;
  return { discordId: row.discord_id, expiresAt: row.expires_at };
}
