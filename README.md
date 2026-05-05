# Home Lab Monitor

Distributed monitoring for a small fleet of home servers. Lightweight agents on each box expose metrics over HTTP; a central monitor polls them, persists 24h of history in SQLite, and serves a real-time dashboard accessible via Tailscale.

See [`plan/homelab-monitor-architecture.md`](./plan/homelab-monitor-architecture.md) for system design and [`plan/engineering.md`](./plan/engineering.md) for the tech stack and conventions.

## Workspaces

```
packages/
├── shared/    # Zod schemas + shared types (built first)
├── agent/     # runs on each monitored host
├── monitor/   # runs on the central host
└── ui/        # React dashboard (built into the monitor image)
```

## Local development

Prerequisites: Node 24 (`.nvmrc`), pnpm 9+.

```bash
pnpm install
cp servers.example.yaml servers.yaml   # add a localhost agent entry
pnpm --filter @homelab/shared build    # one-time; or run dev in T0 below
```

Three terminals from the repo root:

```bash
# T0  keep shared rebuilding on edit
pnpm --filter @homelab/shared dev

# T1  agent (binds to localhost, includes Docker if you have it)
SERVER_ID=localdev API_KEY=$(openssl rand -hex 24) BIND_HOST=127.0.0.1 \
  ENABLE_DOCKER=true pnpm --filter @homelab/agent dev

# T2  monitor + UI dev server (api on :8080, vite on :5173)
pnpm --filter @homelab/monitor dev
pnpm --filter @homelab/ui dev
```

Open `http://127.0.0.1:5173`.

## Deployment

Strategy: every host clones the repo, runs `docker compose up -d --build` locally. Updates are `git pull` then rebuild.

### On each agent host (server-a, server-b, server-c, …)

```bash
git clone https://github.com/<you>/home-server-beacon.git ~/homelab
cd ~/homelab/packages/agent
cp docker-compose.example.yml docker-compose.yml
# edit docker-compose.yml — set SERVER_ID, API_KEY, BIND_HOST
docker compose up -d --build
```

The `--build` flag builds the agent image from local source on first run. Subsequent runs reuse the cached image until source changes.

### On the central monitor host

```bash
git clone https://github.com/<you>/home-server-beacon.git ~/homelab
cd ~/homelab
cp servers.example.yaml servers.yaml          # add real agents (must match SERVER_ID + API_KEY)
cp alerts.example.yaml alerts.yaml            # optional — skip to disable email alerts

cd packages/monitor
cp docker-compose.example.yml docker-compose.yml
docker compose up -d --build
```

Dashboard now serves at `http://<this-host>:8080` on the LAN and over Tailscale.

### Helper scripts

For more than one or two hosts, two scripts under `scripts/` automate the SSH-and-shell-around step.

```bash
# Bootstrap a brand-new agent host (auto-detects LAN IP, generates API key)
scripts/deploy-agent.sh user@10.0.0.39 server-a "Server A"
# → prints the snippet to paste into the monitor's servers.yaml

# Refresh an already-deployed host after a `git push`
scripts/update-host.sh user@10.0.0.39 agent
scripts/update-host.sh user@<monitor-host> monitor
```

The host's user must have passwordless `sudo`-free Docker access (member of the `docker` group). Both scripts use only `git`, `ssh`, `docker compose`, and one `openssl rand` call locally — no extra dependencies.

### Updating after a `git push` (without the script)

```bash
cd ~/homelab && git pull
# on each host that needs the change:
cd packages/{agent,monitor} && docker compose up -d --build
```

### Notes

- **Build time on a low-power SBC** (Radxa, Raspberry Pi 4) is 5–10 minutes for the first build because pnpm pulls all deps. Subsequent rebuilds reuse Docker layer cache and finish in ~30s if only source changed.
- **`servers.yaml` and `alerts.yaml` are gitignored** — each host writes its own. The monitor host needs `servers.yaml`; agent hosts don't need either.
- **API key** must match exactly between the agent's env (`API_KEY`) and the monitor's `servers.yaml` entry. Generate with `openssl rand -hex 24`.
- **Tailscale**: install on the monitor host (and on any client device you want to view the dashboard from). The monitor binds `0.0.0.0`, so the `tailscale0` interface picks it up automatically.

## Useful commands

```bash
pnpm build       # build all packages
pnpm typecheck   # tsc --noEmit across workspaces
pnpm lint        # biome check
pnpm format      # biome format --write
```
