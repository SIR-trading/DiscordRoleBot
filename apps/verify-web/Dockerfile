FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/verify-web/package.json ./apps/verify-web/
RUN pnpm install --frozen-lockfile=false

COPY packages/shared ./packages/shared
COPY apps/verify-web ./apps/verify-web
RUN pnpm --filter @sir/verify-web build

FROM node:20-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Next.js standalone output bundles everything needed.
COPY --from=builder /repo/apps/verify-web/.next/standalone ./
COPY --from=builder /repo/apps/verify-web/.next/static ./apps/verify-web/.next/static
COPY --from=builder /repo/apps/verify-web/public ./apps/verify-web/public

RUN addgroup -S sirweb && adduser -S sirweb -G sirweb
USER sirweb

EXPOSE 3000
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","apps/verify-web/server.js"]
