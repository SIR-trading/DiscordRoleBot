import { z } from "zod";
import { parseTiers, type Tier } from "@sir/shared";

const SnowflakeSchema = z.string().regex(/^\d{17,20}$/, "must be a Discord snowflake (17-20 digits)");
const UrlSchema = z.string().url();
const HexAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x-prefixed 40-char hex address");

const RawEnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: SnowflakeSchema,
  GUILD_ID: SnowflakeSchema,
  ADMIN_ROLE_ID: SnowflakeSchema,

  TIER_NAMES: z.string().min(1),
  TIER_ROLE_IDS: z.string().min(1),
  TIER_THRESHOLDS_WEI: z.string().min(1),

  RPC_URL_ETH: UrlSchema,
  RPC_URL_HYPER: UrlSchema,
  RPC_URL_MEGA: UrlSchema,
  SIR_PROXY_ETH: HexAddressSchema,
  SIR_PROXY_HYPER: HexAddressSchema,
  SIR_PROXY_MEGA: HexAddressSchema,

  VERIFY_BASE_URL: UrlSchema,

  DB_PATH: z.string().min(1).default("/data/sir.db"),
  LOG_LEVEL: z.string().default("info"),
  MAX_WALLETS_PER_USER: z.coerce.number().int().positive().default(5),
  VERIFY_ATTEMPTS_PER_HOUR: z.coerce.number().int().positive().default(3),
  NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  REFRESH_CRON: z.string().default("0 */6 * * *"),
  MULTICALL_CHUNK_SIZE: z.coerce.number().int().positive().default(50),
});

export type Config = {
  readonly discord: {
    readonly token: string;
    readonly clientId: string;
    readonly guildId: string;
    readonly adminRoleId: string;
  };
  readonly tiers: readonly Tier[];
  readonly chains: {
    readonly eth: { readonly rpcUrl: string; readonly sirProxy: `0x${string}` };
    readonly hyper: { readonly rpcUrl: string; readonly sirProxy: `0x${string}` };
    readonly mega: { readonly rpcUrl: string; readonly sirProxy: `0x${string}` };
  };
  readonly verifyBaseUrl: string;
  readonly dbPath: string;
  readonly logLevel: string;
  readonly maxWalletsPerUser: number;
  readonly verifyAttemptsPerHour: number;
  readonly nonceTtlSeconds: number;
  readonly refreshCron: string;
  readonly multicallChunkSize: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = RawEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const e = parsed.data;

  const tiers = parseTiers(e.TIER_NAMES, e.TIER_ROLE_IDS, e.TIER_THRESHOLDS_WEI);

  return {
    discord: {
      token: e.DISCORD_TOKEN,
      clientId: e.DISCORD_CLIENT_ID,
      guildId: e.GUILD_ID,
      adminRoleId: e.ADMIN_ROLE_ID,
    },
    tiers,
    chains: {
      eth: { rpcUrl: e.RPC_URL_ETH, sirProxy: e.SIR_PROXY_ETH as `0x${string}` },
      hyper: { rpcUrl: e.RPC_URL_HYPER, sirProxy: e.SIR_PROXY_HYPER as `0x${string}` },
      mega: { rpcUrl: e.RPC_URL_MEGA, sirProxy: e.SIR_PROXY_MEGA as `0x${string}` },
    },
    verifyBaseUrl: e.VERIFY_BASE_URL.replace(/\/$/, ""),
    dbPath: e.DB_PATH,
    logLevel: e.LOG_LEVEL,
    maxWalletsPerUser: e.MAX_WALLETS_PER_USER,
    verifyAttemptsPerHour: e.VERIFY_ATTEMPTS_PER_HOUR,
    nonceTtlSeconds: e.NONCE_TTL_SECONDS,
    refreshCron: e.REFRESH_CRON,
    multicallChunkSize: e.MULTICALL_CHUNK_SIZE,
  };
}
