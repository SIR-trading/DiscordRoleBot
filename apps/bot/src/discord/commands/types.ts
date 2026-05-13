import type {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type Database from "better-sqlite3";
import type { Config } from "../../config.js";
import type { ChainClient } from "../../chain/clients.js";
import type { ChainKey } from "@sir/shared";

export type CommandContext = {
  readonly client: Client;
  readonly db: Database.Database;
  readonly config: Config;
  readonly chains: Record<ChainKey, ChainClient>;
  readonly refreshUser: (discordId: string) => Promise<void>;
};

export type SlashCommand = {
  readonly data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void>;
};
