import { NextResponse } from "next/server";
import { z } from "zod";
import { SiweMessage } from "siwe";
import { db } from "@/lib/db";
import { serverEnv, siweDomain } from "@/lib/env";
import { linkWallet, lookupNonce } from "@/lib/linking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  message: z.string().min(1),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  nonce: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  let parsed: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    const result = BodySchema.safeParse(json);
    if (!result.success) {
      console.error("verify:invalid_body", result.error.flatten());
      return NextResponse.json(
        { error: "Couldn't process that request. Please try again." },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch (err) {
    console.error("verify:invalid_json", err);
    return NextResponse.json(
      { error: "Couldn't process that request. Please try again." },
      { status: 400 },
    );
  }

  // 1. Look up nonce → discord ID. Must be unconsumed and unexpired.
  const lookup = lookupNonce(db(), parsed.nonce);
  if (!lookup) {
    return NextResponse.json(
      {
        error:
          "This link has expired or already been used. Open Discord and run /verify again.",
      },
      { status: 410 },
    );
  }

  // 2. Parse + validate SIWE message fields (domain, nonce, expiration, statement).
  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(parsed.message);
  } catch (err) {
    console.error("verify:siwe_parse_failed", err);
    return NextResponse.json(
      {
        error:
          "Signature verification failed. Please run /verify again to get a fresh link.",
      },
      { status: 400 },
    );
  }
  if (siwe.domain !== siweDomain()) {
    console.error("verify:domain_mismatch", {
      expected: siweDomain(),
      got: siwe.domain,
    });
    return NextResponse.json(
      {
        error:
          "Signature verification failed. Please run /verify again to get a fresh link.",
      },
      { status: 400 },
    );
  }
  if (siwe.nonce !== parsed.nonce) {
    console.error("verify:nonce_mismatch", {
      expected: parsed.nonce,
      got: siwe.nonce,
    });
    return NextResponse.json(
      {
        error:
          "Signature verification failed. Please run /verify again to get a fresh link.",
      },
      { status: 400 },
    );
  }

  // 3. Cryptographic verification — viem-backed SIWE verify covers signature
  //    AND re-checks domain/nonce/time. This is the key step the plan called
  //    out: we use the SIWE verifier, not a bare verifyMessage.
  try {
    const result = await siwe.verify({
      signature: parsed.signature,
      domain: siweDomain(),
      nonce: parsed.nonce,
      time: new Date().toISOString(),
    });
    if (!result.success) {
      console.error("verify:siwe_verify_unsuccessful", result);
      return NextResponse.json(
        {
          error:
            "Signature didn't verify. Try signing again, or run /verify in Discord for a fresh link.",
        },
        { status: 401 },
      );
    }
  } catch (err) {
    console.error("verify:siwe_verify_threw", err);
    return NextResponse.json(
      {
        error:
          "Signature didn't verify. Try signing again, or run /verify in Discord for a fresh link.",
      },
      { status: 401 },
    );
  }

  // 4. Atomic link: consume nonce + upsert user + insert wallet + flag refresh.
  const linkResult = linkWallet(db(), {
    nonce: parsed.nonce,
    discordId: lookup.discordId,
    walletAddress: siwe.address,
    maxWalletsPerUser: serverEnv().MAX_WALLETS_PER_USER,
  });

  if (!linkResult.ok) {
    const messages: Record<typeof linkResult.reason, { msg: string; status: number }> = {
      nonce_invalid: { msg: "Verification link expired or already used.", status: 410 },
      wallet_taken: {
        msg: "This wallet is already linked to another Discord account. Contact an admin if this is a mistake.",
        status: 409,
      },
      wallet_limit: {
        msg: "You've reached the maximum number of linked wallets.",
        status: 409,
      },
    };
    const { msg, status } = messages[linkResult.reason];
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}
