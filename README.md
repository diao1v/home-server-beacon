# Home Lab Monitor

Distributed monitoring for 4 home servers. Lightweight agents on three boxes expose metrics over HTTP; a central server on the monitor host polls them, persists history in SQLite, and serves a real-time dashboard accessible via Tailscale.

See [`plan/homelab-monitor-architecture.md`](./plan/homelab-monitor-architecture.md) for the system design and [`plan/engineering.md`](./plan/engineering.md) for the tech stack and conventions.

## Workspaces

```
packages/
├── shared/    # Zod schemas + shared types (built first)
├── agent/     # runs on server-a, server-b, server-c
└── monitor/   # runs on monitor host
```

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 9+

## Setup

```bash
pnpm install
cp servers.example.yaml servers.yaml   # fill in API keys
cp alerts.example.yaml alerts.yaml     # fill in Mailgun keys
pnpm --filter @homelab/shared build    # shared must be built before dev
```

## Develop

```bash
# In one terminal: keep shared rebuilding
pnpm --filter @homelab/shared dev

# In another: run the agent (or monitor)
pnpm --filter @homelab/agent dev
pnpm --filter @homelab/monitor dev
```

## Build

```bash
pnpm build       # builds all packages in dependency order
pnpm typecheck   # tsc --noEmit across workspaces
pnpm lint        # biome check
pnpm format      # biome format --write
```
