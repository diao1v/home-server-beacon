# syntax=docker/dockerfile:1.7
# Build from the repo root:
#   docker build -f packages/monitor/Dockerfile -t homelab-monitor:latest .

# ---- builder ----
FROM node:24-slim AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.11.1 --activate

# better-sqlite3 ships prebuilds for linux-x64 and linux-arm64 with Node 24's ABI,
# so a clean install should work without compilation. If you need to compile from
# source for a less-common arch, uncomment the build-tools install below.
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     python3 make g++ && rm -rf /var/lib/apt/lists/*

# Workspace + manifests first for cache-friendly install.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/monitor/package.json ./packages/monitor/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile \
    --filter '@homelab/shared' \
    --filter '@homelab/monitor' \
    --filter '@homelab/ui'

# Sources
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/monitor ./packages/monitor
COPY packages/ui ./packages/ui

# Build order: shared → monitor (server) and ui (static bundle) in parallel.
RUN pnpm --filter @homelab/shared build && \
    pnpm --filter @homelab/monitor build && \
    pnpm --filter @homelab/ui build

# Self-contained deployment dir for the monitor.
RUN pnpm --filter @homelab/monitor deploy --prod /deploy

# ---- runtime ----
FROM node:24-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# Monitor runtime + node_modules.
COPY --from=builder /deploy ./
# UI static bundle — served by the monitor as the dashboard.
COPY --from=builder /repo/packages/ui/dist ./ui/dist

ENV NODE_ENV=production
ENV UI_DIST_PATH=./ui/dist
ENV DB_PATH=/data/monitor.sqlite
ENV SERVERS_CONFIG=/etc/homelab/servers.yaml
ENV ALERTS_CONFIG=/etc/homelab/alerts.yaml

EXPOSE 8080
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
