import {
  ActionRowBuilder,
  ButtonBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { UsersRepo } from "../../db/repo/users.js";
import { WalletsRepo } from "../../db/repo/wallets.js";
import { stripAllTierRoles } from "../roleSync.js";
import type { SlashCommand } from "./types.js";
import { verifyButton } from "./verify.js";

export const adminCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("sir-admin")
    .setDescription("Admin commands for SIR role management")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sc) =>
      sc.setName("recheck-all").setDescription("Trigger an off-cycle refresh for all linked users"),
    )
    .addSubcommand((sc) =>
      sc.setName("stats").setDescription("Show verified user count and last refresh time"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("force-unlink")
        .setDescription("Forcibly unlink a user (admin only)")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The Discord user to unlink").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("post-verify-button")
        .setDescription("Post a Verify Wallet button into this channel"),
    ),
  async execute(interaction, ctx) {
    if (!hasAdmin(interaction, ctx.config.discord.adminRoleId)) {
      await interaction.reply({
        content: "This command is admin-only.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const users = new UsersRepo(ctx.db);
    const wallets = new WalletsRepo(ctx.db);

    if (sub === "stats") {
      const all = users.listAll();
      const totalWallets = wallets.listAll().length;
      const lastRefresh = all
        .map((u) => u.last_refreshed ?? 0)
        .reduce((a, b) => Math.max(a, b), 0);
      const tierCounts = new Map<string, number>();
      for (const u of all) {
        if (u.last_tier) tierCounts.set(u.last_tier, (tierCounts.get(u.last_tier) ?? 0) + 1);
      }
      const tierLines = ctx.config.tiers
        .slice()
        .reverse()
        .map((t) => `  ${t.name}: ${tierCounts.get(t.name) ?? 0}`)
        .join("\n");
      const lastStr = lastRefresh
        ? `<t:${lastRefresh}:R>`
        : "_never_";
      await interaction.reply({
        content:
          `**SIR Role Bot Stats**\n` +
          `Linked users: ${all.length}\n` +
          `Linked wallets: ${totalWallets}\n` +
          `Last refresh: ${lastStr}\n\n` +
          `**Tier counts** (highest first):\n${tierLines}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "recheck-all") {
      await interaction.reply({
        content: "Marked all linked users for refresh. Worker will pick them up shortly.",
        flags: MessageFlags.Ephemeral,
      });
      ctx.db.prepare(`UPDATE users SET pending_refresh = 1`).run();
      return;
    }

    if (sub === "post-verify-button") {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased() || !("send" in channel)) {
        await interaction.reply({
          content: "I can't post a message in this channel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);
      await channel.send({
        content:
          "**Link your wallet to claim your SIR nobility tier**\n\n" +
          "Click below to start verification. You'll get a private one-time link — no gas, no transaction, just a signature.",
        components: [row],
      });
      await interaction.reply({
        content: "Posted.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "force-unlink") {
      const targetUser = interaction.options.getUser("user", true);
      const discordId = targetUser.id;
      const deleted = wallets.deleteAllForUser(discordId);
      await stripAllTierRoles({
        client: ctx.client,
        guildId: ctx.config.discord.guildId,
        discordId,
        tiers: ctx.config.tiers,
      });
      users.delete(discordId);
      await interaction.reply({
        content: `Force-unlinked <@${discordId}> (${deleted} wallet${deleted === 1 ? "" : "s"}).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  },
};

function hasAdmin(
  interaction: Parameters<SlashCommand["execute"]>[0],
  adminRoleId: string,
): boolean {
  const member = interaction.member;
  if (!member) return false;
  // Either a manage-guild perm OR our explicit admin role
  const roles = member.roles;
  if (Array.isArray(roles)) return roles.includes(adminRoleId);
  return roles.cache.has(adminRoleId) || member.permissions.toString().includes(String(PermissionFlagsBits.ManageGuild));
}
