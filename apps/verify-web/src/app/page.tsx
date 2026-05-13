export default function Home() {
  return (
    <main>
      <div className="card">
        <h1>SIR Trading — Wallet Verification</h1>
        <p>
          To link a wallet, run <code>/verify</code> (or click the{" "}
          <strong>Verify Wallet</strong> button) in the SIR Trading Discord. The bot
          will reply with a one-time link only you can see.
        </p>
        <p className="muted">
          This page does nothing on its own. The one-time link includes a nonce that lets
          us match your signature to your Discord account.
        </p>
      </div>
    </main>
  );
}
