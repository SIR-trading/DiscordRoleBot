import cron from "node-cron";
import { logger } from "../logger.js";
import { UsersRepo } from "../db/repo/users.js";
import { NoncesRepo } from "../db/repo/nonces.js";
import { VerifyAttemptsRepo } from "../db/repo/verifyAttempts.js";
import { refreshAll } from "./refreshAll.js";
import { refreshUser, PartialRpcError } from "./refreshUser.js";
import type { CommandContext } from "../discord/commands/types.js";

const PENDING_POLL_MS = 30_000;

export function startScheduler(ctx: CommandContext): { stop: () => void } {
  const users = new UsersRepo(ctx.db);
  const nonces = new NoncesRepo(ctx.db);
  const attempts = new VerifyAttemptsRepo(ctx.db);

  // Full cycle on the configured cron, with up to 60s jitter.
  const cronTask = cron.schedule(ctx.config.refreshCron, () => {
    const jitter = Math.floor(Math.random() * 60_000);
    setTimeout(() => {
      refreshAll(ctx).catch((err) =>
        logger.error({ err: (err as Error).message, stack: (err as Error).stack }, "refreshAll threw"),
      );
    }, jitter);
  });

  // Pending refresh poller — picks up flags set by the verify-web flow.
  const pendingInterval = setInterval(async () => {
    let claimed: string[] = [];
    try {
      claimed = users.claimPendingRefreshes();
    } catch (err) {
      logger.error({ err: (err as Error).message }, "pending poll: claim failed");
      return;
    }
    for (const id of claimed) {
      try {
        await refreshUser(ctx, id);
      } catch (err) {
        if (err instanceof PartialRpcError) {
          // Re-flag so we try again next tick.
          users.setPendingRefresh(id);
          logger.warn({ discordId: id }, "pending refresh deferred — RPC partial failure");
        } else {
          logger.error(
            { discordId: id, err: (err as Error).message },
            "pending refresh threw",
          );
        }
      }
    }
  }, PENDING_POLL_MS);

  // Daily cleanup of expired nonces and old verify attempts.
  const cleanupTask = cron.schedule("0 4 * * *", () => {
    const purgedNonces = nonces.purgeExpired();
    const purgedAttempts = attempts.purgeOld();
    if (purgedNonces || purgedAttempts) {
      logger.info({ purgedNonces, purgedAttempts }, "daily cleanup");
    }
  });

  // Run a refresh shortly after boot so newly-deployed bots catch up.
  setTimeout(() => {
    refreshAll(ctx).catch((err) =>
      logger.error({ err: (err as Error).message }, "boot refreshAll threw"),
    );
  }, 5_000);

  logger.info({ cron: ctx.config.refreshCron }, "scheduler started");

  return {
    stop: () => {
      cronTask.stop();
      cleanupTask.stop();
      clearInterval(pendingInterval);
    },
  };
}
