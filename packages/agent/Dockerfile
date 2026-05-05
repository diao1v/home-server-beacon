# syntax=docker/dockerfile:1.7
# Build from the repo root:
#   docker build -f packages/agent/Dockerfile -t homelab-agent:latest .

# ---- builder ----
FROM node:24-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.11.1 --activate

# Cache layer: install only changes when a package.json or the lockfile does
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent/package.json ./packages/agent/

# Install all deps (devDeps included — tsc needs them to build)
RUN pnpm install --frozen-lockfile

# Build (shared first because agent imports its compiled output)
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/agent ./packages/agent
RUN pnpm --filter @homelab/shared build && \
    pnpm --filter @homelab/agent build

# Prune to prod deps only — removes typescript, tsx, etc. from node_modules
RUN pnpm install --frozen-lockfile --prod

# ---- runtime ----
FROM node:24-slim AS runtime
WORKDIR /app/packages/agent

# Copy the entire pruned workspace. pnpm's symlink layout is preserved so
# `import '@hono/node-server'` resolves correctly to the hoisted store.
COPY --from=builder /app /app

ENV NODE_ENV=production
EXPOSE 3005

CMD ["node", "dist/index.js"]
