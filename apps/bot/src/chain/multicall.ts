import { CANONICAL_MULTICALL3 } from "@sir/shared";
import { logger } from "../logger.js";
import type { ChainClient } from "./clients.js";

const MULTICALL3_GET_BLOCK_TS_ABI = [
  {
    type: "function",
    name: "getCurrentBlockTimestamp",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Probe each chain at startup. If a chain has multicall3=null, try the canonical
 * address; if the call succeeds, lock it in. Otherwise leave it null so the
 * balance reader falls back to direct readContract.
 *
 * Mutates the provided clients in-place.
 */
export async function probeMulticall3(
  chains: Record<string, ChainClient>,
): Promise<void> {
  const tasks = Object.values(chains).map(async (chain) => {
    if (chain.multicall3 !== null) {
      logger.info(
        { chain: chain.key, chainId: chain.id, multicall3: chain.multicall3 },
        "multicall3 preconfigured",
      );
      return;
    }
    try {
      await chain.client.readContract({
        address: CANONICAL_MULTICALL3,
        abi: MULTICALL3_GET_BLOCK_TS_ABI,
        functionName: "getCurrentBlockTimestamp",
      });
      chain.multicall3 = CANONICAL_MULTICALL3;
      logger.info(
        { chain: chain.key, chainId: chain.id, multicall3: CANONICAL_MULTICALL3 },
        "multicall3 probe succeeded — using canonical address",
      );
    } catch (err) {
      logger.warn(
        { chain: chain.key, chainId: chain.id, err: (err as Error).message },
        "multicall3 probe failed — will use parallel readContract fallback",
      );
    }
  });
  await Promise.all(tasks);
}
