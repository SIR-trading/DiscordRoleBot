export default function Home() {
  return (
    <main>
      <div className="card">
        <h1>SIR Trading — Wallet Verification</h1>
        <p>
          To link a wallet, run <code>/verify</code> in the SIR Trading Discord. The bot
          will DM you a one-time link.
        </p>
        <p className="muted">
          This page does nothing on its own. The one-time link includes a nonce that lets
          us match your signature to your Discord account.
        </p>
      </div>
    </main>
  );
}
