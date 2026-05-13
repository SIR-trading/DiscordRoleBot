export type ChainKey = "eth" | "hyper" | "mega";

export type Tier = {
  readonly name: string;
  readonly roleId: string;
  readonly thresholdWei: bigint;
};

export type BalanceSnapshot = {
  readonly walletAddress: `0x${string}`;
  readonly chainId: number;
  readonly balanceWei: bigint;
  readonly fetchedAt: number;
};

export type UserRecord = {
  readonly discordId: string;
  readonly linkedAt: number;
  readonly lastTier: string | null;
  readonly lastTotalWei: bigint;
  readonly lastRefreshed: number | null;
  readonly pendingRefresh: boolean;
};

export type WalletRecord = {
  readonly walletAddress: `0x${string}`;
  readonly discordId: string;
  readonly verifiedAt: number;
  readonly label: string | null;
};
