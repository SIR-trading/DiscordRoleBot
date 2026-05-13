import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { WalletsRepo } from "../../db/repo/wallets.js";
import { UsersRepo } from "../../db/repo/users.js";
import { stripAllTierRoles } from "../roleSync.js";
import type { SlashCommand } from "./types.js";

export const unlinkCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Remove a linked wallet (or all of them)")
    .addStringOption((opt) =>
      opt
        .setName("wallet")
        .setDescription("Specific wallet address to unlink (leave blank to unlink all)")
        .setRequired(false),
    )
    .setDMPermission(false),
  async execute(interaction, ctx) {
    const discordId = interaction.user.id;
    const wallets = new WalletsRepo(ctx.db);
    const users = new UsersRepo(ctx.db);
    const target = interaction.options.getString("wallet");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (target) {
      const ok = wallets.deleteByAddress({ walletAddress: target, discordId });
      if (!ok) {
        await interaction.editReply(
          `No wallet matching \`${target}\` was linked to your account.`,
        );
        return;
      }
      // If that was their last wallet, strip roles.
      if (wallets.countForUser(discordId) === 0) {
        await stripAllTierRoles({
          client: ctx.client,
          guildId: ctx.config.discord.guildId,
          discordId,
          tiers: ctx.config.tiers,
        });
        users.markRefreshed({ discordId, tierName: null, totalWei: 0n });
      } else {
        // Still has wallets — trigger a refresh to recompute total.
        await ctx.refreshUser(discordId);
      }
      await interaction.editReply(`Unlinked \`${target}\`.`);
      return;
    }

    const deleted = wallets.deleteAllForUser(discordId);
    if (deleted === 0) {
      await interaction.editReply("You had no linked wallets.");
      return;
    }
    await stripAllTierRoles({
      client: ctx.client,
      guildId: ctx.config.discord.guildId,
      discordId,
      tiers: ctx.config.tiers,
    });
    users.markRefreshed({ discordId, tierName: null, totalWei: 0n });
    await interaction.editReply(`Unlinked ${deleted} wallet${deleted === 1 ? "" : "s"} and removed your tier role.`);
  },
};
