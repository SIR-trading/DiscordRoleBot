import { REST, Routes, type ChatInputCommandInteraction, type Client } from "discord.js";
import { logger } from "../logger.js";
import type { CommandContext, SlashCommand } from "./commands/types.js";
import { verifyCommand } from "./commands/verify.js";
import { refreshCommand } from "./commands/refresh.js";
import { unlinkCommand } from "./commands/unlink.js";
import { balanceCommand } from "./commands/balance.js";
import { walletsCommand } from "./commands/wallets.js";
import { adminCommand } from "./commands/admin.js";

export const ALL_COMMANDS: readonly SlashCommand[] = [
  verifyCommand,
  refreshCommand,
  unlinkCommand,
  balanceCommand,
  walletsCommand,
  adminCommand,
];

const commandMap = new Map(ALL_COMMANDS.map((c) => [c.data.name, c]));

export async function registerCommands(args: {
  token: string;
  clientId: string;
  guildId: string;
}): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(args.token);
  const body = ALL_COMMANDS.map((c) => c.data.toJSON());
  await rest.put(Routes.applicationGuildCommands(args.clientId, args.guildId), { body });
  logger.info({ count: body.length, guildId: args.guildId }, "registered guild slash commands");
}

export function wireInteractionHandler(client: Client, ctx: CommandContext): void {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = commandMap.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction as ChatInputCommandInteraction, ctx);
    } catch (err) {
      logger.error(
        { command: interaction.commandName, err: (err as Error).message, stack: (err as Error).stack },
        "command handler threw",
      );
      const errMsg = "Something went wrong. Please try again, and let an admin know if it persists.";
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errMsg);
        } else {
          await interaction.reply({ content: errMsg, flags: 64 /* Ephemeral */ });
        }
      } catch {
        /* swallow */
      }
    }
  });
}
