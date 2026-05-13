import { computeTier, type ChainKey } from "@sir/shared";
import { logger } from "../logger.js";
import { UsersRepo } from "../db/repo/users.js";
import { WalletsRepo } from "../db/repo/wallets.js";
import { BalanceCacheRepo } from "../db/repo/balanceCache.js";
import { readAllBalances } from "../chain/balances.js";
import { applyTier } from "../discord/roleSync.js";
import type { CommandContext } from "../discord/commands/types.js";

/**
 * Full 6h cycle.
 *
 * Partial-cycle policy (locked in by plan): if ANY chain-wide fetch fails
 * (i.e. `hadFailures` is true for any chain), persist successful balance rows
 * but apply NO role changes this cycle. The failed chain could have moved any
 * user across any threshold; we can't safely reason about who's affected.
 */
export async function refreshAll(ctx: CommandContext): Promise<void> {
  const t0 = Date.now();
  const wallets = new WalletsRepo(ctx.db);
  const users = new UsersRepo(ctx.db);
  const cache = new BalanceCacheRepo(ctx.db);

  const allWallets = wallets.listAll();
  if (allWallets.length === 0) {
    logger.info("cycle: no linked wallets — nothing to do");
    return;
  }
  const addresses = allWallets.map((w) => w.wallet_address as `0x${string}`);

  const chainResults = await readAllBalances(ctx.chains, addresses, ctx.config.multicallChunkSize);

  // Persist whatever succeeded.
  const cacheRows: { walletAddress: string; chainId: number; balanceWei: bigint }[] = [];
  for (const chainKey of Object.keys(ctx.chains) as ChainKey[]) {
    const chainId = ctx.chains[chainKey].id;
    const r = chainResults[chainKey];
    for (const [addr, bal] of r.balances) {
      cacheRows.push({ walletAddress: addr, chainId, balanceWei: bal });
    }
  }
  if (cacheRows.length > 0) cache.upsertMany(cacheRows);

  // Apply the partial-cycle policy.
  const anyFailed = (Object.keys(chainResults) as ChainKey[]).some(
    (k) => chainResults[k].hadFailures,
  );
  if (anyFailed) {
    const failed = (Object.keys(chainResults) as ChainKey[]).filter(
      (k) => chainResults[k].hadFailures,
    );
    logger.warn(
      { failed, durationMs: Date.now() - t0 },
      "cycle: partial RPC failure — skipping all role changes this cycle (balance_cache rows still persisted)",
    );
    return;
  }

  // Sum per user and apply role diffs.
  const walletsByUser = new Map<string, `0x${string}`[]>();
  for (const w of allWallets) {
    const arr = walletsByUser.get(w.discord_id) ?? [];
    arr.push(w.wallet_address as `0x${string}`);
    walletsByUser.set(w.discord_id, arr);
  }

  let applied = 0;
  let noChange = 0;
  let errors = 0;

  for (const [discordId, userWallets] of walletsByUser) {
    let total = 0n;
    for (const chainKey of Object.keys(ctx.chains) as ChainKey[]) {
      const r = chainResults[chainKey];
      for (const w of userWallets) {
        const v = r.balances.get(w.toLowerCase() as `0x${string}`);
        if (v !== undefined) total += v;
      }
    }
    const tier = computeTier(total, ctx.config.tiers);

    const u = users.getById(discordId);
    const prior = u?.last_tier ?? null;
    const desired = tier?.name ?? null;
    if (prior === desired) {
      // Still record the snapshot — last_total_wei moves even when the tier doesn't.
      users.markRefreshed({ discordId, tierName: desired, totalWei: total });
      noChange++;
      continue;
    }

    const result = await applyTier({
      client: ctx.client,
      guildId: ctx.config.discord.guildId,
      discordId,
      targetTier: tier,
      tiers: ctx.config.tiers,
    });
    if (result.applied) applied++;
    else if (result.skipped === "no_change") noChange++;
    else errors++;

    users.markRefreshed({ discordId, tierName: desired, totalWei: total });
  }

  logger.info(
    {
      durationMs: Date.now() - t0,
      users: walletsByUser.size,
      wallets: allWallets.length,
      applied,
      noChange,
      errors,
    },
    "cycle complete",
  );
}
