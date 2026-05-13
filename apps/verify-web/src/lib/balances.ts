import "server-only";
import { createPublicClient, http, getAddress } from "viem";
import { CHAIN_KEYS, CHAIN_REGISTRY, SIR_PROXY_ABI, type ChainKey } from "@sir/shared";
import { serverEnv, type ServerEnv } from "./env";

export type ChainBalance = {
  readonly chain: ChainKey;
  readonly displayName: string;
  readonly tokenSymbol: string;
  readonly balance: string | null;
};

export type BalancesPayload = {
  readonly perChain: readonly ChainBalance[];
  readonly total: string | null;
};

type StringEnvKey = {
  [K in keyof ServerEnv]: ServerEnv[K] extends string ? K : never;
}[keyof ServerEnv];

const BALANCE_ENV_KEYS = {
  eth: { rpcUrl: "RPC_URL_ETH", sirProxy: "SIR_PROXY_ETH" },
  hyper: { rpcUrl: "RPC_URL_HYPER", sirProxy: "SIR_PROXY_HYPER" },
  mega: { rpcUrl: "RPC_URL_MEGA", sirProxy: "SIR_PROXY_MEGA" },
} satisfies Record<ChainKey, { rpcUrl: StringEnvKey; sirProxy: StringEnvKey }>;

export async function readBalancesForAddress(
  rawAddress: string,
): Promise<BalancesPayload> {
  const address = getAddress(rawAddress);
  const env = serverEnv();

  const results = await Promise.all(
    CHAIN_KEYS.map(async (key) => {
      const keys = BALANCE_ENV_KEYS[key];
      const rpcUrl = env[keys.rpcUrl];
      const sirProxy = env[keys.sirProxy] as `0x${string}`;
      const client = createPublicClient({
        transport: http(rpcUrl, { retryCount: 1, timeout: 10_000 }),
      });
      try {
        const raw = (await client.readContract({
          address: sirProxy,
          abi: SIR_PROXY_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
        return { key, balance: raw, ok: true as const };
      } catch {
        return { key, balance: 0n, ok: false as const };
      }
    }),
  );

  let total = 0n;
  let allOk = true;
  const perChain = results.map((r): ChainBalance => {
    const cfg = CHAIN_REGISTRY[r.key];
    if (!r.ok) allOk = false;
    if (r.ok) total += r.balance;
    return {
      chain: r.key,
      displayName: cfg.displayName,
      tokenSymbol: cfg.tokenSymbol,
      balance: r.ok ? r.balance.toString() : null,
    };
  });

  return { perChain, total: allOk ? total.toString() : null };
}
