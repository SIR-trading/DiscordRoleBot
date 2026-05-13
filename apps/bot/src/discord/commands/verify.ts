import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { NoncesRepo } from "../../db/repo/nonces.js";
import { VerifyAttemptsRepo } from "../../db/repo/verifyAttempts.js";
import { WalletsRepo } from "../../db/repo/wallets.js";
import { logger } from "../../logger.js";
import type { SlashCommand } from "./types.js";

export const verifyCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link a wallet to start earning SIR nobility roles")
    .setDMPermission(false),
  async execute(interaction, ctx) {
    const discordId = interaction.user.id;

    const attempts = new VerifyAttemptsRepo(ctx.db);
    const wallets = new WalletsRepo(ctx.db);
    const nonces = new NoncesRepo(ctx.db);

    const count = attempts.countLastHour(discordId);
    if (count >= ctx.config.verifyAttemptsPerHour) {
      await interaction.reply({
        content: `You've used ${count} of ${ctx.config.verifyAttemptsPerHour} verify attempts this hour. Please try again later.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const linked = wallets.countForUser(discordId);
    if (linked >= ctx.config.maxWalletsPerUser) {
      await interaction.reply({
        content: `You've reached the limit of ${ctx.config.maxWalletsPerUser} linked wallets. Use \`/unlink\` to free up a slot.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    attempts.record(discordId);
    const { nonce } = nonces.issue({
      discordId,
      ttlSeconds: ctx.config.nonceTtlSeconds,
    });
    const url = `${ctx.config.verifyBaseUrl}/verify/${nonce}`;

    try {
      const dm = await interaction.user.createDM();
      await dm.send(
        `**Link your wallet to SIR Trading**\n\n` +
          `Click the link below within ${Math.round(
            ctx.config.nonceTtlSeconds / 60,
          )} minutes. You'll be asked to connect your wallet and sign a one-time message — no transaction, no gas.\n\n` +
          url,
      );
      await interaction.reply({
        content: "Check your DMs for a one-time verification link.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      logger.warn({ discordId, err: (err as Error).message }, "DM failed, falling back to ephemeral");
      await interaction.reply({
        content:
          "I couldn't DM you (your DMs may be closed). Here's your one-time link — it expires shortly:\n\n" +
          url,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
