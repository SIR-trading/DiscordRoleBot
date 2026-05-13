import { db } from "@/lib/db";
import { lookupNonce } from "@/lib/linking";
import VerifyClient from "./VerifyClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ nonce: string }>;
};

export default async function VerifyPage({ params }: Props) {
  const { nonce } = await params;
  const lookup = lookupNonce(db(), nonce);

  if (!lookup) {
    return (
      <main>
        <div className="card">
          <h1>Link expired or already used</h1>
          <p>
            This verification link is no longer valid. Open Discord and run{" "}
            <code>/verify</code> again to get a fresh one.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h1>Link your wallet</h1>
        <p>
          Connect your wallet and sign a one-time message. <strong>No transaction will be
          sent and no gas will be spent.</strong>
        </p>
        <p className="muted">
          Expires <span suppressHydrationWarning>{new Date(lookup.expiresAt * 1000).toLocaleTimeString()}</span>.
          One wallet per Discord account; one Discord account per wallet.
        </p>
        <VerifyClient nonce={nonce} />
      </div>
    </main>
  );
}
