import type Database from "better-sqlite3";

export type LinkResult =
  | { ok: true }
  | { ok: false; reason: "nonce_invalid" | "wallet_taken" | "wallet_limit" };

/**
 * Atomic: consume the nonce, upsert the user, insert the wallet, set pending_refresh.
 * If any step fails, the whole transaction rolls back — including the nonce consume,
 * which means an erroring user can retry within the TTL window without burning their nonce.
 *
 * `walletAddress` is stored lower-cased.
 */
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
    // 1. Validate nonce belongs to this discord ID (defense in depth — caller should already check).
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

    // 2. Wallet limit check.
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

    // 3. Consume nonce atomically.
    const consume = db
      .prepare(
        `UPDATE verification_nonces SET consumed_at = unixepoch()
          WHERE nonce = ? AND consumed_at IS NULL AND expires_at > unixepoch()`,
      )
      .run(args.nonce);
    if (consume.changes !== 1) {
      return { ok: false, reason: "nonce_invalid" };
    }

    // 4. Upsert user (do NOT touch columns owned by the worker).
    db.prepare(
      `INSERT INTO users (discord_id, linked_at) VALUES (?, unixepoch())
       ON CONFLICT(discord_id) DO NOTHING`,
    ).run(args.discordId);

    // 5. Insert wallet — PK collision means someone else owns it.
    try {
      db.prepare(
        `INSERT INTO wallets (wallet_address, discord_id, verified_at)
         VALUES (LOWER(?), ?, unixepoch())`,
      ).run(args.walletAddress, args.discordId);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        return { ok: false, reason: "wallet_taken" };
      }
      throw err;
    }

    // 6. Flag for refresh.
    db.prepare(`UPDATE users SET pending_refresh = 1 WHERE discord_id = ?`).run(args.discordId);

    return { ok: true };
  });

  return txn.immediate();
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === "SQLITE_CONSTRAINT_PRIMARYKEY" || code === "SQLITE_CONSTRAINT_UNIQUE";
}
