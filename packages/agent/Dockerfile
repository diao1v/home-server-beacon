# syntax=docker/dockerfile:1.7
# Build from the repo root:
#   docker build -f packages/agent/Dockerfile -t homelab-agent:latest .
#
# The build context is the repo root because we need pnpm-workspace.yaml and
# the shared package.

# ---- builder ----
FROM node:24-slim AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.11.1 --activate

# Copy workspace + relevant package manifests first so deps install is cached
# until any package.json changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent/package.json ./packages/agent/

RUN pnpm install --frozen-lockfile --filter '@homelab/shared' --filter '@homelab/agent'

# Sources
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/agent ./packages/agent

# Build (shared first because agent imports its compiled output)
RUN pnpm --filter @homelab/shared build && \
    pnpm --filter @homelab/agent build

# Materialize a self-contained dir with only prod deps (workspace deps included).
RUN pnpm --filter @homelab/agent deploy --prod /deploy

# ---- runtime ----
FROM node:24-slim AS runtime
WORKDIR /app

# Tini handles SIGTERM properly so SIGINT/SIGTERM reach our shutdown handlers.
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /deploy ./

ENV NODE_ENV=production

EXPOSE 3005

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
