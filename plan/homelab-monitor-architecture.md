# Home Lab Monitor — Detailed Architecture Plan

## Overview

A distributed monitoring system for 4 home servers. Three servers run lightweight agents that expose resource metrics over HTTP on the internal LAN. The monitor host acts as the central monitor server, polling all agents, persisting history, and serving a real-time dashboard UI accessible via Tailscale.

---

## System Topology

```
Home LAN (192.168.1.x)
│
├── server-a   192.168.1.10:3005  → Agent (Docker only)
├── server-b       192.168.1.11:3005  → Agent (Docker only)
├── server-c             192.168.1.12:3005  → Agent (Docker + PM2)
│
└── monitor host        192.168.1.x:8080   → Central Dashboard (UI)
                     [Tailscale]        → Remote access from anywhere
```

All agent-to-central communication is LAN-only. The dashboard port 8080 is accessible on LAN directly, and remotely through Tailscale. No public internet exposure.

---

## Component Breakdown

### 1. Agent (runs on server-a, server-b, server-c)

**Purpose:** Collect and expose server metrics on demand via a single HTTP endpoint.

**Technology:** Node.js HTTP server

**Endpoint:** `GET /metrics` — returns a full snapshot of the server's current state

**Data sources per capability:**

| Capability     | Data Source                            | Notes                                   |
| -------------- | -------------------------------------- | --------------------------------------- |
| OS metrics     | Node `os` module + `systeminformation` | CPU%, RAM, disk, network I/O, uptime    |
| Docker metrics | Docker socket `/var/run/docker.sock`   | Container list, per-container CPU/RAM   |
| PM2 metrics    | PM2 programmatic API (IPC)             | Process list, status, restarts, CPU/RAM |

**Capability flags (env vars):**

| Server         | `ENABLE_DOCKER` | `ENABLE_PM2` |
| -------------- | --------------- | ------------ |
| server-a | true            | false        |
| server-b     | true            | false        |
| server-c           | true            | true         |

**Response schema (all agents, same shape):**

```
{
  meta: {
    hostname,        // machine hostname
    serverId,        // friendly name from config
    version,         // agent version
    timestamp        // ISO timestamp of snapshot
  },
  os: {
    cpuPercent,      // overall CPU usage %
    loadAvg,         // [1m, 5m, 15m]
    memory: { total, used, free, usedPercent },
    uptime,          // seconds
    disks: [{ mount, total, used, usedPercent }],
    network: [{ iface, rxBytes, txBytes }]
  },
  docker: {          // null if ENABLE_DOCKER=false
    containers: [{
      id, name, image,
      status,        // running | exited | paused
      cpuPercent,
      memory: { used, limit }
    }]
  },
  pm2: {             // null if ENABLE_PM2=false
    processes: [{
      name, status,  // online | stopped | errored
      pid,
      cpuPercent,
      memoryMb,
      uptime,        // seconds
      restartCount
    }]
  }
}
```

**Auth:** Every request must include an `Authorization: Bearer <API_KEY>` header. Each agent has its own key defined in its environment config.

**CPU % sampling strategy:**

CPU metrics from `/proc` and the Docker API are cumulative counters, not percentages. The agent runs a **background sampler every 5 seconds**, independent of incoming HTTP requests. Each tick reads the current counters, computes the delta against the previous tick, and stores the resulting `cpuPercent` in memory. `/metrics` returns the latest computed value with no blocking work.

- Cold start: for the first ~5s after agent boot (before two samples exist), `cpuPercent` is `null`. The dashboard renders `null` as `—`.
- Same strategy applies to per-container Docker CPU%.
- The 5s background interval is shorter than the 10s central poll interval, so each poll receives a fresh value.

**Binding:**

The agent always listens on port `3005` (3001 is already in use by an existing Node service on server-c). Binding host depends on deployment mode:

- **Docker with `network_mode: host`** (server-a, server-b): bind to the host's LAN IP via `BIND_HOST` so the agent is never accessible outside the home network.
- **PM2 directly** (server-c): same — bind to the LAN IP via `BIND_HOST`.

---

### 2. Central Server (runs on monitor host)

Three logical services, all running in a single Node.js process managed by PM2.

#### 2a. Server Registry

A static config file `servers.yaml` defining the known agents:

```
servers:
  - id: "server-a"
    displayName: "Server A"
    url: "http://192.168.1.10:3005"
    apiKey: "<secret>"

  - id: "server-b"
    displayName: "Server B"
    url: "http://192.168.1.11:3005"
    apiKey: "<secret>"

  - id: "server-c"
    displayName: "Server C"
    url: "http://192.168.1.12:3005"
    apiKey: "<secret>"
```

Adding a new server = adding one entry here. No code changes needed.

**Secret handling:** `servers.yaml` is `.gitignore`d. A `servers.example.yaml` with placeholder keys is committed to document the shape. Same pattern for `alerts.yaml` (see Alerting).

#### 2b. Poller Service

Runs on a configurable interval (default: 10 seconds).

**Poll cycle:**

1. Fetch `/metrics` from all agents **in parallel** (Promise.all with per-agent timeout of 5s)
2. On success: update in-memory state + write snapshot to SQLite
3. On failure: increment failure counter for that server, keep last known data, mark as degraded
4. After 3 consecutive failures: mark server as `offline`
5. After a successful poll following offline: mark as `recovered`, reset counter

**State model per server:**

```
{
  status: "online" | "degraded" | "offline",
  lastSeen: timestamp,
  consecutiveFailures: number,
  latestSnapshot: <metrics payload>,
}
```

#### 2c. History Store (SQLite)

Stores metric snapshots for trend charts and sparklines.

**Driver:** `better-sqlite3` (synchronous, fast, well-suited to this low-throughput workload — no callback overhead).

**Pragmas (set on connection open):**

```
PRAGMA journal_mode = WAL;       -- concurrent reads while writing, durable
PRAGMA synchronous = NORMAL;     -- safe with WAL, faster than FULL
PRAGMA temp_store = MEMORY;
PRAGMA foreign_keys = ON;
```

**Schema:**

```
snapshots table:
  id           INTEGER PRIMARY KEY
  server_id    TEXT NOT NULL
  timestamp    INTEGER NOT NULL    -- unix ms
  cpu_percent  REAL
  mem_percent  REAL
  disk_percent REAL                -- primary disk
  raw_json     TEXT                -- full snapshot for detailed queries

INDEX idx_snapshots_server_ts ON snapshots(server_id, timestamp DESC);
```

The composite index serves the sparkline query (`WHERE server_id = ? AND timestamp >= ? ORDER BY timestamp DESC`) directly.

**Prepared statements:** insert and cleanup are prepared once at startup and reused.

**Retention policy:** Keep last 24 hours of data. A cleanup job runs hourly and deletes rows older than 24h. At 3 servers × 6 polls/min × 24h ≈ 26k rows steady-state, the DB stays well under a few MB.

**Future work (not v1):** Downsampling (e.g., 10s for last 1h, 1min for last 24h, 10min for last 7d) if the retention window is extended.

#### 2d. WebSocket / SSE Server

- Browser connects to `ws://192.168.1.x:8080/ws` (or SSE endpoint)
- Every time the poller completes a full cycle, the server **pushes the full current state** to all connected clients
- No browser-side polling — the push interval matches the poll interval (~10s)
- Also exposes a REST endpoint `GET /api/history/:serverId` returning the last 30 minutes of snapshots for sparkline rendering on initial page load

---

### 3. Dashboard UI (served from monitor host)

A single-page web app served as static files from the central server.

#### UI Features

- **Server cards:** One card per server showing OS-level metrics as progress bars
- **Status indicator:** Colored dot — green (online), amber (degraded/slow), red (offline)
- **Sparklines:** Small trend charts for CPU and RAM over last 30 minutes
- **Expandable sections:** Docker container list and PM2 process list, collapsed by default
- **Color thresholds:** Green < 60%, Amber 60–85%, Red > 85% for all resource bars
- **Offline state:** Grey card with "Last seen X minutes ago" — never blank or broken
- **Auto-refresh:** UI updates automatically via WebSocket push, no manual refresh needed
- **"Last updated" indicator:** Shows time since last successful poll cycle

#### No Login Required

The dashboard is on a Tailscale-only port — network access is the auth layer. No username/password UI needed.

---

### 4. Alerting (Mailgun)

A small alerting module on the central server, driven off poller state transitions.

**v1 triggers (only these):**

- Server transitions to `offline` (3 consecutive poll failures).
- Server transitions back to `online` after being `offline` (`recovered`).

**Behaviour:**

- **Cooldown:** suppress repeat alerts for the same `(serverId, condition)` for 30 minutes. State is held in memory (acceptable; a restart simply re-arms alerts).
- **Delivery:** Mailgun HTTP API, single recipient configured in `alerts.yaml`.
- **Fail-soft:** if the Mailgun call fails, log the error and continue. Alerting must never crash the poller.
- **Email content:** subject `[homelab] <serverId> is offline` (or `recovered`), body with timestamp, last-seen time, and last known metrics snapshot.

**Config — `alerts.yaml`** (gitignored, with `alerts.example.yaml` committed):

```
mailgun:
  apiKey: "<secret>"
  domain: "mg.example.com"
  from: "homelab-monitor@mg.example.com"
to: "you@example.com"
enabled: true
cooldownMinutes: 30
```

**v2 (documented, not built):**

- Threshold alerts (e.g., CPU > 90% sustained for 5 min, disk > 90%, memory > 90%).
- PM2 process `errored` or repeated restart alerts.
- Daily digest email summarising uptime/peak usage.

---

## Deployment Plan

### Agent Deployment

#### server-a & server-b

Run the agent as an additional Docker container alongside existing containers.

We use `network_mode: host` and `pid: host` so the container observes the host's real network interfaces, process table, and uptime — the same pattern used by `node_exporter` and similar host-metrics containers. No port mapping is needed; the agent listens directly on the host's LAN IP at `:3005`.

Add to existing `docker-compose.yml`:

```
agent:
  image: homelab-agent:latest
  network_mode: host
  pid: host
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - /:/rootfs:ro
    - /proc:/host/proc:ro
    - /sys:/host/sys:ro
  environment:
    - ENABLE_DOCKER=true
    - ENABLE_PM2=false
    - SERVER_ID=server-a     # or server-b
    - API_KEY=<secret>
    - BIND_HOST=192.168.1.10           # LAN IP of this host
    - PORT=3005
  restart: unless-stopped
```

#### server-c

Run agent directly with PM2 (not in Docker) so it can connect to the local PM2 daemon via IPC.

PM2 ecosystem config entry:

```
{
  name: "homelab-agent",
  script: "agent/src/index.js",
  env: {
    ENABLE_DOCKER: "true",
    ENABLE_PM2: "true",
    SERVER_ID: "server-c",
    API_KEY: "<secret>",
    BIND_HOST: "192.168.1.12",
    PORT: "3005"
  }
}
```

#### monitor host

Run the central server with PM2:

```
{
  name: "homelab-monitor",
  script: "monitor/src/index.ts",
  env: {
    PORT: "8080",
    BIND_HOST: "0.0.0.0",
    POLL_INTERVAL_MS: "10000",
    HISTORY_RETENTION_HOURS: "24"
  }
}
```

Bind to `0.0.0.0` so it's accessible both on LAN and via Tailscale interface.

---

## Repository Structure

One monorepo, two packages:

```
homelab-monitor/
│
├── agent/                  ← deployed to server-a, server-b, server-c
│   ├── src/
│   │   ├── index.ts        ← HTTP server entry point
│   │   ├── collectors/
│   │   │   ├── os.ts       ← systeminformation wrapper
│   │   │   ├── docker.ts   ← Docker socket client
│   │   │   └── pm2.ts      ← PM2 API client
│   │   └── schema.ts       ← response shape builder
│   ├── Dockerfile
│   └── package.json
│
├── monitor/                ← deployed to monitor host
│   ├── src/
│   │   ├── index.ts        ← entry point
│   │   ├── poller.ts       ← poll loop
│   │   ├── store.ts        ← SQLite wrapper
│   │   ├── websocket.ts    ← push server
│   │   └── api.ts          ← REST history endpoints
│   ├── ui/                 ← static dashboard files
│   │   ├── index.html
│   │   ├── app.ts
│   │   └── style.css
│   └── package.json
│
├── servers.yaml            ← server registry config (gitignored)
├── servers.example.yaml    ← committed template
├── alerts.yaml             ← Mailgun config (gitignored)
├── alerts.example.yaml     ← committed template
└── README.md
```

---

## Phased Build Plan

The agent is built generic from day one — all three collectors (OS, Docker, PM2) ship in Phase 1 behind capability flags, so a single codebase deploys cleanly to every host.

### Phase 1 — Full Agent (all collectors, all hosts)

- Build OS collector (CPU, RAM, disk, network, uptime) via `systeminformation`
- Build Docker collector via Docker socket (container list, per-container CPU/RAM)
- Build PM2 collector via PM2 programmatic API
- Wire capability flags `ENABLE_DOCKER` / `ENABLE_PM2` so absent collectors return `null`
- Implement background CPU sampler (5s interval, cached delta)
- Build `/metrics` endpoint with API key auth
- Package as Docker image (for n1-*) and PM2 ecosystem entry (for server-c)
- Deploy to all three hosts and verify each response shape

### Phase 2 — Central Poller + Store

- Build poller with parallel fetch and per-agent 5s timeout
- Build in-memory state model with `online` / `degraded` / `offline` transitions
- Build SQLite store with `better-sqlite3`, WAL pragmas, composite index, prepared statements
- Hourly retention cleanup job

### Phase 3 — Dashboard UI

- Static server card layout with status dot, resource bars, color thresholds
- WebSocket push for live updates; REST `/api/history/:serverId` for initial sparkline load
- Sparklines for CPU and RAM (last 30 minutes)
- Expandable Docker container list and PM2 process list
- Offline / "last seen X minutes ago" rendering; null-safe for cold-start `cpuPercent`

### Phase 4 — Alerting

- Mailgun client wrapper (fail-soft)
- Subscribe to poller state transitions (`offline`, `recovered`)
- Cooldown table (in-memory) keyed by `(serverId, condition)`
- `alerts.yaml` config loader with `alerts.example.yaml` committed

### Phase 5 — Polish

- Test remote access via Tailscale end-to-end
- Tune poll interval and retention window in real conditions
- Error-state UX pass (degraded vs offline visuals, last-seen freshness)
- Document runbook (restarting agent, rotating API keys, adding a new server)

---

## Key Design Decisions Summary

| Decision            | Choice                             | Reason                                                       |
| ------------------- | ---------------------------------- | ------------------------------------------------------------ |
| Agent communication | Pull (central polls agents)        | Central server owns the cadence; simpler to reason about     |
| Transport           | HTTP/REST (agent) + WebSocket (UI) | REST for reliability; WS for live UI updates                 |
| Network             | LAN IPs for agent polling          | Fast, no Tailscale overhead for internal traffic             |
| Remote UI access    | Tailscale only                     | No public exposure; network = auth layer                     |
| History storage     | SQLite on 4C+                      | Zero-config, low resource, sufficient for 24h rolling window |
| Agent config        | Environment variables              | One codebase, different behaviour per server                 |
| Agent on server-c       | PM2-managed (not Docker)           | Needs IPC access to PM2 daemon                               |
| Agent on N1s        | Docker container                   | Consistent with existing setup on those boxes                |
