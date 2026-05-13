"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import type { Config } from "wagmi";
import { mainnet } from "wagmi/chains";

// RainbowKit requires a non-empty projectId at config time. Other wallets
// (MetaMask, injected, Coinbase, Rainbow) still work without a real one —
// only WalletConnect's QR scan flow needs a real project ID from
// https://cloud.walletconnect.com. We fall back to a placeholder so the
// build succeeds; if you want WalletConnect support, set
// NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in the environment.
const projectId =
  process.env["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"] ||
  "00000000000000000000000000000000";

// Route mainnet RPC calls (ENS lookups, etc.) through our own proxy so the
// browser never hits a public RPC directly — viem's default mainnet RPCs
// (e.g. eth.merkle.io) block cross-origin requests from custom domains.
export const wagmiConfig: Config = getDefaultConfig({
  appName: "SIR Trading — Wallet Verification",
  projectId,
  chains: [mainnet],
  transports: {
    [mainnet.id]: http("/api/rpc/eth"),
  },
  ssr: true,
});
