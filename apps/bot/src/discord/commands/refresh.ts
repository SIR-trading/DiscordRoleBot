import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { WalletsRepo } from "../../db/repo/wallets.js";
import type { SlashCommand } from "./types.js";

const cooldown = new Map<string, number>();
const COOLDOWN_MS = 60_000;

export const refreshCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Re-read your balances now and update your role")
    .setDMPermission(false),
  async execute(interaction, ctx) {
    const discordId = interaction.user.id;
    const now = Date.now();
    const last = cooldown.get(discordId) ?? 0;
    if (now - last < COOLDOWN_MS) {
      const seconds = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      await interaction.reply({
        content: `Slow down — try again in ${seconds}s.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    cooldown.set(discordId, now);

    const wallets = new WalletsRepo(ctx.db);
    if (wallets.countForUser(discordId) === 0) {
      await interaction.reply({
        content: "You have no linked wallets. Run `/verify` first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await ctx.refreshUser(discordId);
      await interaction.editReply("Refreshed. Your role has been updated to match your current holdings.");
    } catch (err) {
      await interaction.editReply(
        `Refresh failed: ${(err as Error).message}. This usually means an RPC was temporarily unavailable — try again in a minute.`,
      );
    }
  },
};
