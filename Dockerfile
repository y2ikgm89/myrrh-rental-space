# syntax=docker.io/docker/dockerfile:1

FROM oven/bun:1.3.9-alpine AS base
WORKDIR /app

# --- Stage 1: Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json bun.lock ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile && \
    bunx --bun prisma generate --schema=./prisma/schema.prisma

# --- Stage 2: Build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/shared/generated ./src/shared/generated
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    SKIP_ENV_VALIDATION=true \
    STANDALONE=true

# NEXT_PUBLIC_* はビルド時にクライアント JS へインライン化される
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID

RUN bun run validate && bun run build

# --- Stage 3: Runner ---
FROM base AS runner

RUN apk add --no-cache libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 8080
CMD ["bun", "server.js"]
