import type { Tier } from "./types.js";

/**
 * Parse the three paired env arrays (TIER_NAMES, TIER_ROLE_IDS,
 * TIER_THRESHOLDS_WEI) into a validated, sorted-ascending Tier[] table.
 *
 * Throws if:
 *   - the three arrays don't have the same length
 *   - any threshold isn't a positive bigint
 *   - thresholds aren't strictly ascending in input order
 *   - any role ID isn't a Discord snowflake (17-20 numeric chars)
 *   - any name is empty or duplicated
 */
export function parseTiers(
  rawNames: string,
  rawRoleIds: string,
  rawThresholds: string,
): Tier[] {
  const names = splitCsv(rawNames);
  const roleIds = splitCsv(rawRoleIds);
  const thresholds = splitCsv(rawThresholds);

  if (names.length === 0) {
    throw new Error("TIER_NAMES must contain at least one tier");
  }
  if (names.length !== roleIds.length || names.length !== thresholds.length) {
    throw new Error(
      `Tier arrays must have identical length: TIER_NAMES=${names.length}, ` +
        `TIER_ROLE_IDS=${roleIds.length}, TIER_THRESHOLDS_WEI=${thresholds.length}`,
    );
  }

  const seenNames = new Set<string>();
  const tiers: Tier[] = [];
  let prev = -1n;

  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    const roleId = roleIds[i]!;
    const thresholdStr = thresholds[i]!;

    if (name.length === 0) throw new Error(`TIER_NAMES[${i}] is empty`);
    if (seenNames.has(name)) throw new Error(`Duplicate tier name: "${name}"`);
    seenNames.add(name);

    if (!isSnowflake(roleId)) {
      throw new Error(
        `TIER_ROLE_IDS[${i}] ("${roleId}") for tier "${name}" is not a valid Discord snowflake`,
      );
    }

    let threshold: bigint;
    try {
      threshold = BigInt(thresholdStr);
    } catch {
      throw new Error(
        `TIER_THRESHOLDS_WEI[${i}] ("${thresholdStr}") for tier "${name}" is not a valid integer`,
      );
    }
    if (threshold <= 0n) {
      throw new Error(`Threshold for tier "${name}" must be positive, got ${threshold}`);
    }
    if (threshold <= prev) {
      throw new Error(
        `Thresholds must be strictly ascending. Tier "${name}" threshold ${threshold} ` +
          `is not greater than previous ${prev}`,
      );
    }
    prev = threshold;

    tiers.push({ name, roleId, thresholdWei: threshold });
  }

  return tiers;
}

/** Returns the highest tier whose threshold ≤ totalWei, or null if below all. */
export function computeTier(totalWei: bigint, tiers: readonly Tier[]): Tier | null {
  let match: Tier | null = null;
  for (const tier of tiers) {
    if (totalWei >= tier.thresholdWei) match = tier;
    else break;
  }
  return match;
}

export function allTierRoleIds(tiers: readonly Tier[]): string[] {
  return tiers.map((t) => t.roleId);
}

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}
