import type Database from "better-sqlite3";

export type WalletRow = {
  wallet_address: string;
  discord_id: string;
  verified_at: number;
  label: string | null;
};

export class WalletsRepo {
  constructor(private readonly db: Database.Database) {}

  /** Inserts a new wallet; throws (SQLITE_CONSTRAINT) if wallet is already linked to anyone. */
  insert(args: { walletAddress: string; discordId: string; label?: string | null }): void {
    this.db
      .prepare(
        `INSERT INTO wallets (wallet_address, discord_id, verified_at, label)
         VALUES (LOWER(?), ?, unixepoch(), ?)`,
      )
      .run(args.walletAddress, args.discordId, args.label ?? null);
  }

  listForUser(discordId: string): WalletRow[] {
    return this.db
      .prepare(`SELECT * FROM wallets WHERE discord_id = ? ORDER BY verified_at ASC`)
      .all(discordId) as WalletRow[];
  }

  countForUser(discordId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM wallets WHERE discord_id = ?`)
      .get(discordId) as { n: number };
    return row.n;
  }

  listAll(): WalletRow[] {
    return this.db.prepare(`SELECT * FROM wallets`).all() as WalletRow[];
  }

  getByAddress(walletAddress: string): WalletRow | undefined {
    return this.db
      .prepare(`SELECT * FROM wallets WHERE wallet_address = LOWER(?)`)
      .get(walletAddress) as WalletRow | undefined;
  }

  deleteByAddress(args: { walletAddress: string; discordId: string }): boolean {
    const info = this.db
      .prepare(`DELETE FROM wallets WHERE wallet_address = LOWER(?) AND discord_id = ?`)
      .run(args.walletAddress, args.discordId);
    return info.changes > 0;
  }

  deleteAllForUser(discordId: string): number {
    const info = this.db.prepare(`DELETE FROM wallets WHERE discord_id = ?`).run(discordId);
    return info.changes;
  }
}
