import type Database from "better-sqlite3";

export type BalanceCacheRow = {
  wallet_address: string;
  chain_id: number;
  balance_wei: string;
  fetched_at: number;
};

export class BalanceCacheRepo {
  constructor(private readonly db: Database.Database) {}

  upsert(args: { walletAddress: string; chainId: number; balanceWei: bigint }): void {
    this.db
      .prepare(
        `INSERT INTO balance_cache (wallet_address, chain_id, balance_wei, fetched_at)
         VALUES (LOWER(?), ?, ?, unixepoch())
         ON CONFLICT(wallet_address, chain_id) DO UPDATE SET
           balance_wei = excluded.balance_wei,
           fetched_at  = excluded.fetched_at`,
      )
      .run(args.walletAddress, args.chainId, args.balanceWei.toString());
  }

  upsertMany(rows: { walletAddress: string; chainId: number; balanceWei: bigint }[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO balance_cache (wallet_address, chain_id, balance_wei, fetched_at)
       VALUES (LOWER(?), ?, ?, unixepoch())
       ON CONFLICT(wallet_address, chain_id) DO UPDATE SET
         balance_wei = excluded.balance_wei,
         fetched_at  = excluded.fetched_at`,
    );
    const tx = this.db.transaction((batch: typeof rows) => {
      for (const r of batch) stmt.run(r.walletAddress, r.chainId, r.balanceWei.toString());
    });
    tx(rows);
  }

  getForWallet(walletAddress: string): BalanceCacheRow[] {
    return this.db
      .prepare(`SELECT * FROM balance_cache WHERE wallet_address = LOWER(?)`)
      .all(walletAddress) as BalanceCacheRow[];
  }

  getForUser(discordId: string): BalanceCacheRow[] {
    return this.db
      .prepare(
        `SELECT bc.* FROM balance_cache bc
            JOIN wallets w ON w.wallet_address = bc.wallet_address
           WHERE w.discord_id = ?`,
      )
      .all(discordId) as BalanceCacheRow[];
  }
}
