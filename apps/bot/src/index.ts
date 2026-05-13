import { Events } from "discord.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { openDb, migrate } from "./db/index.js";
import { createChainClients } from "./chain/clients.js";
import { probeMulticall3 } from "./chain/multicall.js";
import { createDiscordClient } from "./discord/client.js";
import { registerCommands, wireInteractionHandler } from "./discord/commandRegistrar.js";
import { startScheduler } from "./worker/scheduler.js";
import { refreshUser, PartialRpcError } from "./worker/refreshUser.js";
import { UsersRepo } from "./db/repo/users.js";
import type { CommandContext } from "./discord/commands/types.js";

async function main(): Promise<void> {
  const config = loadConfig();
  logger.level = config.logLevel;
  logger.info(
    {
      tiers: config.tiers.length,
      maxWallets: config.maxWalletsPerUser,
      refreshCron: config.refreshCron,
    },
    "config loaded",
  );

  const db = openDb(config.dbPath);
  migrate(db);
  logger.info({ dbPath: config.dbPath }, "db ready");

  const chains = createChainClients(config);
  await probeMulticall3(chains);

  const client = createDiscordClient();
  const users = new UsersRepo(db);

  const ctx: CommandContext = {
    client,
    db,
    config,
    chains,
    refreshUser: async (discordId) => {
      try {
        await refreshUser(ctx, discordId);
      } catch (err) {
        if (err instanceof PartialRpcError) {
          // Re-flag for the next pending poller cycle and rethrow for /refresh feedback.
          users.setPendingRefresh(discordId);
        }
        throw err;
      }
    },
  };

  // Re-apply tier when a linked user rejoins the guild.
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== config.discord.guildId) return;
    const u = users.getById(member.id);
    if (!u) return;
    users.setPendingRefresh(member.id);
    logger.info({ discordId: member.id }, "linked user rejoined — flagged for refresh");
  });

  wireInteractionHandler(client, ctx);

  client.once(Events.ClientReady, async (c) => {
    logger.info({ user: c.user.tag, id: c.user.id }, "discord client ready");
    try {
      await registerCommands({
        token: config.discord.token,
        clientId: config.discord.clientId,
        guildId: config.discord.guildId,
      });
    } catch (err) {
      logger.error({ err: (err as Error).message }, "command registration failed");
    }
    startScheduler(ctx);
  });

  await client.login(config.discord.token);
}

main().catch((err) => {
  logger.fatal({ err: (err as Error).message, stack: (err as Error).stack }, "fatal");
  process.exit(1);
});

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    logger.info({ sig }, "shutting down");
    process.exit(0);
  });
}
