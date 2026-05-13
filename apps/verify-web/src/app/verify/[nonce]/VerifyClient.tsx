"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";

type Status =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const STATEMENT =
  "Sign in to link this wallet to your SIR Trading Discord account. No transaction will be sent.";

export default function VerifyClient({ nonce }: { nonce: string }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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
          message: body.error ?? `Verification failed (HTTP ${res.status}).`,
        });
        return;
      }
      setStatus({ kind: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error.";
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
        <p className="success">
          ✓ Wallet linked. You can close this page — your Discord role will update
          within a minute.
        </p>
      )}
      {status.kind === "error" && <p className="error">{status.message}</p>}
    </div>
  );
}
