import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { formatUnits } from "viem";
import { CHAIN_REGISTRY, SIR_DECIMALS, computeTier, type ChainKey } from "@sir/shared";
import { WalletsRepo } from "../../db/repo/wallets.js";
import { readBalancesForUser } from "../../chain/balances.js";
import type { SlashCommand } from "./types.js";

export const balanceCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Show your current holdings and tier (only visible to you)")
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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const addresses = linked.map((w) => w.wallet_address as `0x${string}`);
    const { total, perChain, allOk } = await readBalancesForUser(ctx.chains, addresses);
    const tier = computeTier(total, ctx.config.tiers);

    const embed = new EmbedBuilder()
      .setTitle("Your SIR holdings")
      .setDescription(
        allOk
          ? null
          : "⚠️ One or more RPCs failed — totals below may be incomplete.",
      )
      .addFields(
        (Object.keys(ctx.chains) as ChainKey[]).map((key) => ({
          name: `${CHAIN_REGISTRY[key].displayName} (${CHAIN_REGISTRY[key].tokenSymbol})`,
          value: `${formatSir(perChain[key])} ${CHAIN_REGISTRY[key].tokenSymbol}`,
          inline: true,
        })),
      )
      .addFields([
        { name: "Total", value: `**${formatSir(total)} SIR**`, inline: false },
        { name: "Tier", value: tier ? `**${tier.name}**` : "_below Gentleman_", inline: false },
        {
          name: "Wallets",
          value: linked.map((w) => `\`${w.wallet_address}\``).join("\n"),
        },
      ]);

    await interaction.editReply({ embeds: [embed] });
  },
};

function formatSir(wei: bigint): string {
  // 4 decimal places, comma-separated thousands.
  const n = Number(formatUnits(wei, SIR_DECIMALS));
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
