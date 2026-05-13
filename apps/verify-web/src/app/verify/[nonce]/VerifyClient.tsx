"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import {
  BaseError as ViemBaseError,
  UserRejectedRequestError,
  formatUnits,
} from "viem";
import { SIR_DECIMALS } from "@sir/shared";
import type { BalancesPayload } from "@/lib/balances";

type Status =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "submitting" }
  | { kind: "success"; address: `0x${string}` }
  | { kind: "error"; message: string };

type BalanceState =
  | { kind: "loading" }
  | { kind: "ready"; payload: BalancesPayload }
  | { kind: "error" };

const STATEMENT =
  "Sign in to link this wallet to your SIR Trading Discord account. No transaction will be sent.";

const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function formatBalance(raw: string | null): string {
  if (raw === null) return "—";
  return numberFmt.format(Number(formatUnits(BigInt(raw), SIR_DECIMALS)));
}

type Classified =
  | { kind: "canceled" }
  | { kind: "friendly"; message: string }
  | { kind: "generic" };

const CHAIN_MISMATCH_MSG =
  "Please switch your wallet to Ethereum mainnet and try again.";
const DISCONNECTED_MSG = "Wallet disconnected. Reconnect and try again.";

function classifyClientError(err: unknown): Classified {
  if (err instanceof ViemBaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) {
      return { kind: "canceled" };
    }
    const named = err.walk((e) => {
      const n = (e as { name?: string }).name;
      return n === "ConnectorChainMismatchError" || n === "ConnectorNotConnectedError";
    }) as { name?: string } | null;
    if (named?.name === "ConnectorChainMismatchError")
      return { kind: "friendly", message: CHAIN_MISMATCH_MSG };
    if (named?.name === "ConnectorNotConnectedError")
      return { kind: "friendly", message: DISCONNECTED_MSG };
  }

  const name = (err as { name?: string } | null)?.name;
  if (name === "ConnectorChainMismatchError")
    return { kind: "friendly", message: CHAIN_MISMATCH_MSG };
  if (name === "ConnectorNotConnectedError")
    return { kind: "friendly", message: DISCONNECTED_MSG };

  const code = (err as { code?: number } | null)?.code;
  if (code === 4001 || code === 5000) return { kind: "canceled" };

  return { kind: "generic" };
}

export default function VerifyClient({ nonce }: { nonce: string }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [balanceState, setBalanceState] = useState<BalanceState | null>(null);

  useEffect(() => {
    if (status.kind !== "success") return;
    const signedAddress = status.address;
    let cancelled = false;
    setBalanceState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/balance?address=${signedAddress}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as BalancesPayload;
        if (!cancelled) setBalanceState({ kind: "ready", payload });
      } catch {
        if (!cancelled) setBalanceState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function onSign(): Promise<void> {
    if (!address) return;
    setStatus({ kind: "signing" });

    try {
      const domain = window.location.host;
      const uri = window.location.origin + window.location.pathname;
      const issuedAt = new Date().toISOString();

      const message = new SiweMessage({
        domain,
        address,
        statement: STATEMENT,
        uri,
        version: "1",
        chainId: 1,
        nonce,
        issuedAt,
      });
      const preparedMessage = message.prepareMessage();

      const signature = await signMessageAsync({ message: preparedMessage });

      setStatus({ kind: "submitting" });
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: preparedMessage, signature, nonce }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({
          kind: "error",
          message: body.error ?? "Verification failed. Please try again.",
        });
        return;
      }
      setStatus({ kind: "success", address });
    } catch (err) {
      const classified = classifyClientError(err);
      if (classified.kind === "canceled") {
        setStatus({ kind: "idle" });
        return;
      }
      const message =
        classified.kind === "friendly"
          ? classified.message
          : "Something went wrong. Please try again.";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div className="actions">
      <ConnectButton showBalance={false} chainStatus="none" />
      {isConnected && status.kind !== "success" && (
        <button
          className="primary"
          onClick={() => {
            void onSign();
          }}
          disabled={status.kind === "signing" || status.kind === "submitting"}
        >
          {status.kind === "signing"
            ? "Waiting for signature…"
            : status.kind === "submitting"
              ? "Verifying…"
              : "Sign to link"}
        </button>
      )}
      {status.kind === "success" && (
        <>
          <p className="success">✓ Wallet linked.</p>
          {balanceState?.kind === "loading" && (
            <p className="muted">Reading balances…</p>
          )}
          {balanceState?.kind === "ready" && (
            <BalancesView payload={balanceState.payload} />
          )}
          {balanceState?.kind === "error" && (
            <p className="muted">
              Couldn&apos;t read balances. Your Discord role will still update
              from the bot&apos;s full sweep.
            </p>
          )}
          <p className="muted">
            If you have other wallets linked, run <code>/balance</code> in
            Discord to see your full cross-wallet total. Your Discord role
            updates within a minute.
          </p>
        </>
      )}
      {status.kind === "error" && <p className="error">{status.message}</p>}
    </div>
  );
}

function BalancesView({ payload }: { payload: BalancesPayload }) {
  return (
    <>
      <p>This wallet&apos;s SIR holdings:</p>
      <dl className="balances">
        {payload.perChain.map((row) => (
          <div key={row.chain} className="balances-row">
            <dt>
              {row.displayName} ({row.tokenSymbol})
            </dt>
            <dd>{formatBalance(row.balance)}</dd>
          </div>
        ))}
        <div className="balances-row balances-total">
          <dt>Total for this wallet</dt>
          <dd>{formatBalance(payload.total)} SIR</dd>
        </div>
      </dl>
      {payload.total === null && (
        <p className="muted">
          Couldn&apos;t read all chains — your Discord role will still update
          from the bot&apos;s full sweep.
        </p>
      )}
    </>
  );
}
