import type { Client, Guild, GuildMember } from "discord.js";
import { allTierRoleIds, type Tier } from "@sir/shared";
import { logger } from "../logger.js";
import { enqueueRoleOp } from "./rateLimiter.js";

export type ApplyResult = {
  readonly discordId: string;
  readonly applied: boolean;
  readonly priorTierName: string | null;
  readonly newTierName: string | null;
  readonly skipped?: "not_in_guild" | "no_change" | "missing_permission" | "error";
  readonly errorMessage?: string;
};

/**
 * Re-fetch the member from the API (force: true) so we don't act on stale
 * cache. Then surgically remove any tier roles the user has except the target,
 * and add the target if missing. At most two API calls per user.
 *
 * Never uses `roles.set([...])` — that would silently clobber any roles added
 * by other bots/admins between our cache snapshot and the apply.
 */
export async function applyTier(args: {
  client: Client;
  guildId: string;
  discordId: string;
  targetTier: Tier | null;
  tiers: readonly Tier[];
}): Promise<ApplyResult> {
  const guild = await args.client.guilds.fetch(args.guildId);
  let member: GuildMember;
  try {
    member = await guild.members.fetch({ user: args.discordId, force: true });
  } catch (err) {
    return {
      discordId: args.discordId,
      applied: false,
      priorTierName: null,
      newTierName: args.targetTier?.name ?? null,
      skipped: "not_in_guild",
      errorMessage: (err as Error).message,
    };
  }

  return applyTierToMember({ ...args, guild, member });
}

export async function applyTierToMember(args: {
  guild: Guild;
  member: GuildMember;
  discordId: string;
  targetTier: Tier | null;
  tiers: readonly Tier[];
}): Promise<ApplyResult> {
  const targetId = args.targetTier?.roleId ?? null;
  const allTierIds = allTierRoleIds(args.tiers);

  const currentTierRoles = allTierIds.filter((id) => args.member.roles.cache.has(id));
  const priorTierName =
    args.tiers.find((t) => currentTierRoles.includes(t.roleId))?.name ?? null;

  const toRemove = currentTierRoles.filter((id) => id !== targetId);
  const needsAdd = targetId !== null && !args.member.roles.cache.has(targetId);

  if (toRemove.length === 0 && !needsAdd) {
    return {
      discordId: args.discordId,
      applied: false,
      priorTierName,
      newTierName: args.targetTier?.name ?? null,
      skipped: "no_change",
    };
  }

  try {
    if (toRemove.length > 0) {
      await enqueueRoleOp(() => args.member.roles.remove(toRemove, "SIR tier sync (remove stale)"));
    }
    if (needsAdd) {
      await enqueueRoleOp(() => args.member.roles.add(targetId!, "SIR tier sync (add target)"));
    }
    return {
      discordId: args.discordId,
      applied: true,
      priorTierName,
      newTierName: args.targetTier?.name ?? null,
    };
  } catch (err) {
    const message = (err as Error).message;
    const isPerm = message.includes("Missing Permissions") || message.includes("50013");
    logger.error(
      { discordId: args.discordId, err: message },
      isPerm
        ? "role apply failed — bot's role likely below tier roles in hierarchy"
        : "role apply failed",
    );
    return {
      discordId: args.discordId,
      applied: false,
      priorTierName,
      newTierName: args.targetTier?.name ?? null,
      skipped: isPerm ? "missing_permission" : "error",
      errorMessage: message,
    };
  }
}

/** Synchronously remove all tier roles from a member (used by /unlink). */
export async function stripAllTierRoles(args: {
  client: Client;
  guildId: string;
  discordId: string;
  tiers: readonly Tier[];
}): Promise<void> {
  const guild = await args.client.guilds.fetch(args.guildId);
  let member: GuildMember;
  try {
    member = await guild.members.fetch({ user: args.discordId, force: true });
  } catch {
    return; // not in guild — nothing to strip
  }
  const tierIds = allTierRoleIds(args.tiers).filter((id) => member.roles.cache.has(id));
  if (tierIds.length === 0) return;
  await enqueueRoleOp(() => member.roles.remove(tierIds, "SIR unlink — clear tier roles"));
}
