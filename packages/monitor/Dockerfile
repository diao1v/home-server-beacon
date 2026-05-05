# syntax=docker/dockerfile:1.7
# Build from the repo root:
#   docker build -f packages/monitor/Dockerfile -t homelab-monitor:latest .

# ---- builder ----
FROM node:24-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.11.1 --activate

# Manifest layer
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/monitor/package.json ./packages/monitor/
COPY packages/ui/package.json ./packages/ui/

# better-sqlite3 doesn't ship a Node 24 ARM64 prebuild yet, so node-gyp compiles
# from source on first install. Needs python3 + a C++ toolchain.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pnpm install --frozen-lockfile

# Build server + UI bundle
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/monitor ./packages/monitor
COPY packages/ui ./packages/ui
RUN pnpm --filter @homelab/shared build && \
    pnpm --filter @homelab/monitor build && \
    pnpm --filter @homelab/ui build

# Prune to prod deps only
RUN pnpm install --frozen-lockfile --prod

# ---- runtime ----
FROM node:24-slim AS runtime
WORKDIR /app/packages/monitor

COPY --from=builder /app /app

ENV NODE_ENV=production
ENV UI_DIST_PATH=/app/packages/ui/dist
ENV DB_PATH=/data/monitor.sqlite
ENV SERVERS_CONFIG=/etc/homelab/servers.yaml
ENV ALERTS_CONFIG=/etc/homelab/alerts.yaml

EXPOSE 8080
VOLUME ["/data"]

CMD ["node", "dist/index.js"]
