FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/bot/package.json ./apps/bot/
RUN pnpm install --frozen-lockfile=false

COPY packages/shared ./packages/shared
COPY apps/bot ./apps/bot
RUN pnpm --filter @sir/bot build

# Prune to production deps for the runtime stage
RUN pnpm --filter @sir/bot deploy --legacy --prod /out/bot

FROM node:20-alpine AS runtime
RUN apk add --no-cache tini sqlite
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /out/bot/node_modules ./node_modules
COPY --from=builder /out/bot/package.json ./package.json
COPY --from=builder /repo/apps/bot/dist ./dist
COPY --from=builder /repo/apps/bot/src/db/migrations ./dist/db/migrations

# Non-root
RUN addgroup -S sirbot && adduser -S sirbot -G sirbot
USER sirbot

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","dist/index.js"]
