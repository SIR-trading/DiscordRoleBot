import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { WalletsRepo } from "../../db/repo/wallets.js";
import type { SlashCommand } from "./types.js";

export const walletsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("wallets")
    .setDescription("Show the wallets you've linked (only visible to you)")
    .setDMPermission(false),
  async execute(interaction, ctx) {
    const discordId = interaction.user.id;
    const wallets = new WalletsRepo(ctx.db);
    const linked = wallets.listForUser(discordId);
    if (linked.length === 0) {
      await interaction.reply({
        content: "You have no linked wallets. Run `/verify` first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const lines = linked.map((w, i) => {
      const verifiedAt = new Date(w.verified_at * 1000).toISOString().slice(0, 10);
      return `${i + 1}. \`${w.wallet_address}\` — linked ${verifiedAt}`;
    });
    await interaction.reply({
      content: `**Your linked wallets (${linked.length}/${ctx.config.maxWalletsPerUser})**\n${lines.join("\n")}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
