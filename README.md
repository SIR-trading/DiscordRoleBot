# SIR Trading — Discord Role Bot

Discord bot that assigns nobility tier roles (Gentleman → Sovereign) based on a user's combined SIR / HyperSIR / MegaSIR holdings across Ethereum, HyperEVM, and MegaETH.

## How it works

1. User runs `/verify` in Discord.
2. Bot replies with a one-time link `https://verify.sir.trading/verify/<nonce>` (ephemeral — only the user sees it).
3. User connects their wallet on the verify page and signs a SIWE message — no transaction, no gas.
4. Backend verifies the signature, atomically links wallet → Discord ID.
5. Bot reads `SirProxy.balanceOf(wallet)` on all three chains, sums the result, and assigns the matching tier role.
6. A background worker repeats the read every 6 hours and updates roles as holdings change.

## Stack

- TypeScript, Node 20+, pnpm workspaces
- `apps/bot` — `discord.js` v14 + `viem` v2 + `better-sqlite3` + `node-cron`
- `apps/verify-web` — Next.js 15 (App Router) + `wagmi` + RainbowKit + `siwe`
- `packages/shared` — chain registry, tier helpers, SirProxy ABI
- Docker Compose + Caddy (auto-TLS) on a single Hetzner box

## Prerequisites

- A Discord application with bot token (https://discord.com/developers/applications)
- Alchemy API key(s) with access to Ethereum mainnet, HyperEVM, and MegaETH
- The three deployed `SirProxy` addresses (Ethereum / HyperEVM / MegaETH)
- A domain pointed at the Hetzner box for the verify page (e.g. `verify.sir.trading`)

## Local development

```bash
pnpm install
cp .env.example .env       # fill in real values
# in two terminals:
pnpm dev:bot               # apps/bot — discord.js client + worker
pnpm dev:web               # apps/verify-web — Next.js on :3000
```

For local testing point `VERIFY_BASE_URL=http://localhost:3000` and set up a private test Discord guild. SIR is mainnet-only so you'll be testing against real balances — use small amounts.

> **Windows note**: `pnpm --filter @sir/verify-web build` (production standalone build) fails on Windows due to pnpm symlinks + Next.js standalone output requiring admin/Developer Mode. Local dev (`next dev`) works fine. The Linux Docker build (`docker compose build`) handles this correctly. Use WSL or Docker if you need a local production build.

## Discord setup (operator checklist)

1. **Create the Discord application**: https://discord.com/developers/applications → New Application. On the **Bot** tab, reveal the token (this is `DISCORD_TOKEN`). **Enable the Server Members Intent** (Privileged). Presence/Message Content are NOT needed.

2. **Generate the invite URL**: OAuth2 → URL Generator → scopes `bot` + `applications.commands`; permission: **Manage Roles** only. Use the generated URL to invite the bot to the guild.

3. **Create the 12 tier roles** in the SIR Discord (lowest → highest):
   - Gentleman · Squire · Knight · Baronet · Baron · Viscount · Earl · Marquess · Duke · Archduke · Grand Duke · Sovereign
   - Plus an optional `SIR Admin` role.

4. **Hierarchy** (critical): drag the bot's auto-created role **above all 12 tier roles** in the guild's Role list. Without this, role assignment fails with HTTP 50013 (Missing Permissions). Re-check after any future role reorg.

5. **Copy IDs**: enable Discord Developer Mode → right-click each role → Copy ID. Put the 12 IDs into `TIER_ROLE_IDS` in `.env` lowest → highest, matching the order of `TIER_NAMES` and `TIER_THRESHOLDS_WEI`. Also copy `GUILD_ID`, `DISCORD_CLIENT_ID`, and `ADMIN_ROLE_ID`.

## Configuration

All config goes through `.env`. Tier configuration uses **three paired arrays**:

```
TIER_NAMES=Gentleman,Squire,Knight,Baronet,Baron,Viscount,Earl,Marquess,Duke,Archduke,Grand Duke,Sovereign
TIER_ROLE_IDS=<id1>,<id2>,...,<id12>
TIER_THRESHOLDS_WEI=100000000000000000000000,250000000000000000000000,...,500000000000000000000000000
```

- All three arrays must have the same length, in the same order, lowest → highest.
- Thresholds are in SIR's native base units. **SIR / HyperSIR / MegaSIR use 12 decimals** (not the ERC-20 default of 18) — each value is `<SIR amount> * 10^12`. Gentleman = 100k SIR = `100000000000000000` (17 zeros after the 1). Sovereign = 500M SIR = `500000000000000000000` (20 zeros after the 5).
- `config.ts` validates this at boot: identical length, strictly ascending thresholds, Discord snowflake-shaped role IDs, unique names. The bot refuses to start otherwise.

See `.env.example` for the full list.

## Deployment (Hetzner)

```bash
# On the Hetzner box, as root or a deploy user:
git clone <this repo> /opt/sir
cd /opt/sir
cp .env.example .env
# Edit .env with real values

docker compose up -d --build
docker compose logs -f bot          # tail bot logs
docker compose logs -f verify-web   # tail web logs
```

DNS: A record `verify.sir.trading` → Hetzner IP. Caddy provisions a Let's Encrypt cert automatically on first request.

**Backups**: install `infra/backup.sh` as a host cron (NOT inside a container) for consistent SQLite snapshots:

```bash
sudo cp infra/backup.sh /opt/sir/infra/backup.sh
sudo chmod +x /opt/sir/infra/backup.sh
sudo crontab -e
# add:  30 3 * * * /opt/sir/infra/backup.sh
```

Combined with a weekly Hetzner snapshot, this is plenty for this data volume.

## Slash commands

| Command | What it does |
|---|---|
| `/verify` | Issues a one-time SIWE link as an ephemeral channel reply. Rate-limited to 3/hour. |
| `/refresh` | Re-reads your balances now and updates your role. 60s/user cooldown. |
| `/unlink [wallet]` | Unlink a single wallet, or all of them. Roles are removed within the same tick. |
| `/balance` | Ephemeral breakdown of your per-chain balance + total + current tier. |
| `/wallets` | Ephemeral list of your linked wallets. |
| `/sir-admin recheck-all` | Trigger an off-cycle refresh for everyone. |
| `/sir-admin stats` | Verified users, wallets, last refresh time, per-tier counts. |
| `/sir-admin force-unlink @user` | Sybil/abuse response. |

## Security notes

- **SIWE**: verified via the `siwe` package's `SiweMessage.verify` — checks signature AND domain/nonce/expiration. We never fall back to bare `verifyMessage`.
- **Nonces**: 32 random bytes, single-use, 10-minute TTL. Consume happens atomically with the wallet insert in one transaction.
- **One wallet ↔ one Discord**: enforced by SQLite `PRIMARY KEY` on `wallets.wallet_address`.
- **Rate limits**: `/verify` 3/hour, `/refresh` 60s/user.
- **EOA-only for v1**: smart-contract wallets (Safe, Argent, etc.) are not supported by the current signature path. Document this in the verify page UI if needed.

## Operational notes

- **Partial-cycle policy**: if ANY chain RPC fails during a 6h cycle, the bot persists whatever balance reads succeeded but applies NO role changes that cycle. Failed reads could move any user across any threshold; we'd rather be stale than flap.
- **HyperEVM caveats**: Read only at `latest` block tag — historical block reads and `safe`/`finalized` tags are not reliable on HyperEVM's default RPC.
- **Discord role hierarchy**: any time you reorganize roles, re-check that the bot's role is still above all 12 tier roles.

## Architecture plan

See `C:\Users\nilga\.claude\plans\i-want-to-implement-twinkling-meadow.md` for the full design doc, including security review notes from Codex.
