import { computeTier } from "@sir/shared";
import { logger } from "../logger.js";
import { UsersRepo } from "../db/repo/users.js";
import { WalletsRepo } from "../db/repo/wallets.js";
import { readBalancesForUser } from "../chain/balances.js";
import { applyTier, stripAllTierRoles } from "../discord/roleSync.js";
import type { CommandContext } from "../discord/commands/types.js";

export class PartialRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartialRpcError";
  }
}

/**
 * Single-user refresh. Used by `/refresh`, `/unlink` follow-ups, and the
 * pending_refresh poller. Strict: any RPC failure for this user's wallets
 * → throws PartialRpcError and DOES NOT touch roles.
 *
 * Per-wallet cache rows are populated by the full 6h cycle (`refreshAll`),
 * not by this focused call.
 */
export async function refreshUser(ctx: CommandContext, discordId: string): Promise<void> {
  const wallets = new WalletsRepo(ctx.db);
  const users = new UsersRepo(ctx.db);

  const linked = wallets.listForUser(discordId);

  if (linked.length === 0) {
    await stripAllTierRoles({
      client: ctx.client,
      guildId: ctx.config.discord.guildId,
      discordId,
      tiers: ctx.config.tiers,
    });
    users.markRefreshed({ discordId, tierName: null, totalWei: 0n });
    return;
  }

  const addresses = linked.map((w) => w.wallet_address as `0x${string}`);
  const { total, allOk } = await readBalancesForUser(ctx.chains, addresses);

  if (!allOk) {
    throw new PartialRpcError("at least one RPC call failed");
  }

  const tier = computeTier(total, ctx.config.tiers);
  const result = await applyTier({
    client: ctx.client,
    guildId: ctx.config.discord.guildId,
    discordId,
    targetTier: tier,
    tiers: ctx.config.tiers,
  });
  users.markRefreshed({ discordId, tierName: tier?.name ?? null, totalWei: total });

  logger.info(
    {
      discordId,
      walletCount: addresses.length,
      tier: tier?.name ?? null,
      applied: result.applied,
      skipped: result.skipped,
    },
    "user refreshed",
  );
}
