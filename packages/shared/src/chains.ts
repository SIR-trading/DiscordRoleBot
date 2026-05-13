import type { ChainKey } from "./types.js";

export const CANONICAL_MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/** SIR / HyperSIR / MegaSIR all use 12 decimals (NOT the ERC-20 default of 18). */
export const SIR_DECIMALS = 12 as const;

export type ChainConfig = {
  readonly key: ChainKey;
  readonly id: number;
  readonly displayName: string;
  readonly tokenSymbol: string;
  /**
   * Multicall3 address if known to be canonical at deploy time. `null` means
   * the bot must probe at startup before deciding to batch via multicall3.
   */
  readonly multicall3: `0x${string}` | null;
  readonly envKeys: {
    readonly rpcUrl: string;
    readonly sirProxy: string;
  };
};

export const CHAIN_REGISTRY: Readonly<Record<ChainKey, ChainConfig>> = {
  eth: {
    key: "eth",
    id: 1,
    displayName: "Ethereum",
    tokenSymbol: "SIR",
    multicall3: CANONICAL_MULTICALL3,
    envKeys: { rpcUrl: "RPC_URL_ETH", sirProxy: "SIR_PROXY_ETH" },
  },
  hyper: {
    key: "hyper",
    id: 999,
    displayName: "HyperEVM",
    tokenSymbol: "HyperSIR",
    multicall3: null,
    envKeys: { rpcUrl: "RPC_URL_HYPER", sirProxy: "SIR_PROXY_HYPER" },
  },
  mega: {
    key: "mega",
    id: 4326,
    displayName: "MegaETH",
    tokenSymbol: "MegaSIR",
    multicall3: CANONICAL_MULTICALL3,
    envKeys: { rpcUrl: "RPC_URL_MEGA", sirProxy: "SIR_PROXY_MEGA" },
  },
} as const;

export const CHAIN_KEYS: readonly ChainKey[] = ["eth", "hyper", "mega"];

export function chainById(id: number): ChainConfig | undefined {
  for (const key of CHAIN_KEYS) {
    const c = CHAIN_REGISTRY[key];
    if (c.id === id) return c;
  }
  return undefined;
}
