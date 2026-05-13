import "server-only";
import { z } from "zod";

const ServerEnvSchema = z.object({
  DB_PATH: z.string().min(1).default("/data/sir.db"),
  VERIFY_BASE_URL: z.string().url(),
  MAX_WALLETS_PER_USER: z.coerce.number().int().positive().default(5),
  RPC_URL_ETH: z.string().url(),
  RPC_URL_HYPER: z.string().url(),
  RPC_URL_MEGA: z.string().url(),
  SIR_PROXY_ETH: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  SIR_PROXY_HYPER: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  SIR_PROXY_MEGA: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`verify-web env invalid: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

export function siweDomain(): string {
  const url = new URL(serverEnv().VERIFY_BASE_URL);
  return url.host;
}
