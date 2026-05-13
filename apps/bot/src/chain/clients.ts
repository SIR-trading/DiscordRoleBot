import { createPublicClient, http, type PublicClient } from "viem";
import { CHAIN_REGISTRY, type ChainKey } from "@sir/shared";
import type { Config } from "../config.js";

export type ChainClient = {
  readonly key: ChainKey;
  readonly id: number;
  readonly displayName: string;
  readonly client: PublicClient;
  readonly sirProxy: `0x${string}`;
  /** Multicall3 address if available (canonical or probed). null = use fallback path. */
  multicall3: `0x${string}` | null;
};

export function createChainClients(config: Config): Record<ChainKey, ChainClient> {
  const make = (key: ChainKey, rpcUrl: string, sirProxy: `0x${string}`): ChainClient => {
    const meta = CHAIN_REGISTRY[key];
    const client = createPublicClient({
      transport: http(rpcUrl, { batch: true, retryCount: 2, timeout: 15_000 }),
    }) as PublicClient;
    return {
      key,
      id: meta.id,
      displayName: meta.displayName,
      client,
      sirProxy,
      multicall3: meta.multicall3,
    };
  };

  return {
    eth: make("eth", config.chains.eth.rpcUrl, config.chains.eth.sirProxy),
    hyper: make("hyper", config.chains.hyper.rpcUrl, config.chains.hyper.sirProxy),
    mega: make("mega", config.chains.mega.rpcUrl, config.chains.mega.sirProxy),
  };
}
