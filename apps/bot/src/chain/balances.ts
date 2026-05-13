import pLimit from "p-limit";
import { SIR_PROXY_ABI, type ChainKey } from "@sir/shared";
import { logger } from "../logger.js";
import type { ChainClient } from "./clients.js";

export type ChainReadResult = {
  /** chain → wallet (lower-cased) → balance. Missing entries = read failed. */
  readonly balances: Map<`0x${string}`, bigint>;
  /** True iff at least one read for this chain failed. */
  readonly hadFailures: boolean;
};

export type AllChainsReadResult = Record<ChainKey, ChainReadResult>;

/**
 * Read `balanceOf` for every wallet on every chain.
 *
 * Strategy per chain:
 *   - If multicall3 is available: viem's `multicall` (which uses multicall3
 *     under the hood) with `allowFailure: true` and `batchSize` byte-cap large
 *     enough to fit `chunkSize` calls. On HARD failure (entire RPC errors),
 *     bisect once before declaring the chain failed.
 *   - Otherwise: parallel `readContract` gated by p-limit(8).
 *
 * Returns per-wallet balance maps + a `hadFailures` flag per chain.
 */
export async function readAllBalances(
  chains: Record<ChainKey, ChainClient>,
  wallets: readonly `0x${string}`[],
  chunkSize: number,
): Promise<AllChainsReadResult> {
  const entries = await Promise.all(
    (Object.values(chains) as ChainClient[]).map(async (chain) => {
      const result = await readBalancesForChain(chain, wallets, chunkSize);
      return [chain.key, result] as const;
    }),
  );
  return Object.fromEntries(entries) as AllChainsReadResult;
}

async function readBalancesForChain(
  chain: ChainClient,
  wallets: readonly `0x${string}`[],
  chunkSize: number,
): Promise<ChainReadResult> {
  if (wallets.length === 0) {
    return { balances: new Map(), hadFailures: false };
  }

  if (chain.multicall3) {
    return readViaMulticall(chain, wallets, chunkSize);
  }
  return readViaFallback(chain, wallets);
}

async function readViaMulticall(
  chain: ChainClient,
  wallets: readonly `0x${string}`[],
  chunkSize: number,
): Promise<ChainReadResult> {
  const balances = new Map<`0x${string}`, bigint>();
  let hadFailures = false;

  for (let i = 0; i < wallets.length; i += chunkSize) {
    const chunk = wallets.slice(i, i + chunkSize);
    const ok = await tryMulticallChunk(chain, chunk, balances);
    if (!ok) {
      // Bisect once before giving up on this chunk
      const mid = Math.floor(chunk.length / 2);
      if (mid > 0) {
        const a = await tryMulticallChunk(chain, chunk.slice(0, mid), balances);
        const b = await tryMulticallChunk(chain, chunk.slice(mid), balances);
        if (!a || !b) hadFailures = true;
      } else {
        hadFailures = true;
      }
    }
  }

  return { balances, hadFailures };
}

async function tryMulticallChunk(
  chain: ChainClient,
  wallets: readonly `0x${string}`[],
  outBalances: Map<`0x${string}`, bigint>,
): Promise<boolean> {
  try {
    const contracts = wallets.map((w) => ({
      address: chain.sirProxy,
      abi: SIR_PROXY_ABI,
      functionName: "balanceOf" as const,
      args: [w] as const,
    }));
    const results = await chain.client.multicall({
      contracts,
      multicallAddress: chain.multicall3 ?? undefined,
      allowFailure: true,
    });
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const w = wallets[i]!;
      if (r.status === "success") {
        outBalances.set(w.toLowerCase() as `0x${string}`, r.result as bigint);
      } else {
        logger.warn(
          { chain: chain.key, wallet: w, err: String(r.error) },
          "balanceOf read failed inside multicall",
        );
      }
    }
    return true;
  } catch (err) {
    logger.warn(
      { chain: chain.key, chunkSize: wallets.length, err: (err as Error).message },
      "multicall chunk threw — will bisect",
    );
    return false;
  }
}

async function readViaFallback(
  chain: ChainClient,
  wallets: readonly `0x${string}`[],
): Promise<ChainReadResult> {
  const balances = new Map<`0x${string}`, bigint>();
  let hadFailures = false;
  const limit = pLimit(8);

  await Promise.all(
    wallets.map((w) =>
      limit(async () => {
        try {
          const result = (await chain.client.readContract({
            address: chain.sirProxy,
            abi: SIR_PROXY_ABI,
            functionName: "balanceOf",
            args: [w],
          })) as bigint;
          balances.set(w.toLowerCase() as `0x${string}`, result);
        } catch (err) {
          hadFailures = true;
          logger.warn(
            { chain: chain.key, wallet: w, err: (err as Error).message },
            "balanceOf fallback read failed",
          );
        }
      }),
    ),
  );

  return { balances, hadFailures };
}

/** Read balances for a single user's wallets across all chains. */
export async function readBalancesForUser(
  chains: Record<ChainKey, ChainClient>,
  wallets: readonly `0x${string}`[],
): Promise<{ total: bigint; perChain: Record<ChainKey, bigint>; allOk: boolean }> {
  const result = await readAllBalances(chains, wallets, wallets.length || 1);

  let total = 0n;
  let allOk = true;
  const perChain = {} as Record<ChainKey, bigint>;

  for (const key of Object.keys(chains) as ChainKey[]) {
    const r = result[key];
    if (r.hadFailures) allOk = false;
    let sum = 0n;
    for (const w of wallets) {
      const v = r.balances.get(w.toLowerCase() as `0x${string}`);
      if (v === undefined) {
        allOk = false;
      } else {
        sum += v;
      }
    }
    perChain[key] = sum;
    total += sum;
  }

  return { total, perChain, allOk };
}
