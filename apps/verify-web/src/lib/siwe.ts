import { SiweMessage } from "siwe";

const STATEMENT =
  "Sign in to link this wallet to your SIR Trading Discord account. No transaction will be sent.";

export function buildSiweMessage(args: {
  domain: string;
  address: `0x${string}`;
  uri: string;
  nonce: string;
  issuedAt?: string;
  expirationTime?: string;
}): SiweMessage {
  return new SiweMessage({
    domain: args.domain,
    address: args.address,
    statement: STATEMENT,
    uri: args.uri,
    version: "1",
    chainId: 1,
    nonce: args.nonce,
    issuedAt: args.issuedAt ?? new Date().toISOString(),
    ...(args.expirationTime ? { expirationTime: args.expirationTime } : {}),
  });
}
