import PQueue from "p-queue";

/**
 * Soft global throttle for role-update API calls. discord.js handles bucketed
 * 429s; this queue exists to be polite during mass cycles. Tuned conservatively
 * below the per-guild role-update bucket (5 ops / 10s).
 */
export const roleOpQueue: PQueue = new PQueue({
  concurrency: 1,
  intervalCap: 4,
  interval: 10_000,
});

export function enqueueRoleOp<T>(op: () => Promise<T>): Promise<T> {
  return roleOpQueue.add(op, { throwOnTimeout: true }) as Promise<T>;
}
